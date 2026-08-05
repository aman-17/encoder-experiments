// Table Annotator frontend. Vanilla JS, no build step.

const state = {
    manifest: null,
    docsById: new Map(),
    selectedId: null,
    selectedModels: ["claude-fable-5", "gemini-3.1-pro", "gpt-5.6-sol"],
    tables: [], // per-table HTML strings for the current doc
    dirty: false,
};

const TABLE_RE = /<table[\s\S]*?<\/table>/gi;

const $ = (sel) => document.querySelector(sel);

function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    for (const c of [].concat(children)) {
        if (c != null) {
            node.append(c.nodeType ? c : document.createTextNode(c));
        }
    }
    return node;
}

async function api(path, opts) {
    const res = await fetch(path, opts);
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `${res.status} ${res.statusText}`);
    }
    return res.json();
}

// Split a blob of HTML into individual <table> blocks. Non-table prose is
// dropped (the benchmark target is the tables only).
function splitTables(html) {
    if (!html) {
        return [];
    }
    const matches = html.match(TABLE_RE);
    if (matches && matches.length) {
        return matches.map((t) => t.trim());
    }
    return html.trim() ? [html.trim()] : [];
}

function combinedHtml() {
    return state.tables.map((t) => t.trim()).filter(Boolean).join("\n");
}

// ---- doc list -------------------------------------------------------------

function renderDocList() {
    const filter = $("#filter").value.trim().toLowerCase();
    const list = $("#doc-list");
    list.innerHTML = "";
    let annotated = 0;
    for (const doc of state.manifest.docs) {
        if (doc.isAnnotated) {
            annotated += 1;
        }
        if (filter && !doc.id.toLowerCase().includes(filter)) {
            continue;
        }
        const dot = el("span", { className: "dot" });
        if (doc.isAnnotated) {
            dot.classList.add("annotated");
        } else if (doc.tableCount === 0) {
            dot.classList.add("no-table");
        }
        const classes = ["doc-row"];
        if (doc.id === state.selectedId) {
            classes.push("active");
        }
        if (doc.isAnnotated) {
            classes.push("annotated");
        }
        const right = doc.isAnnotated
            ? el("span", { className: "badge", title: "Manually annotated (.test.json saved)" }, "✓ saved")
            : el("span", { className: "count", title: "tables detected" }, `${doc.tableCount}`);
        const li = el("li", { className: classes.join(" ") }, [
            dot,
            el("span", { className: "name", title: doc.id }, doc.id),
            right,
        ]);
        li.addEventListener("click", () => selectDoc(doc.id));
        list.append(li);
    }
    $("#progress").textContent = `${annotated}/${state.manifest.docs.length} annotated`;
}

// ---- per-table editor -----------------------------------------------------

function markDirty(dirty) {
    state.dirty = dirty;
    // Save is allowed whenever a doc is selected — including accepting the seed
    // transcription unchanged ("validate as-is"). `dirty` only drives the
    // discard-changes prompt on navigation.
    $("#save").disabled = !state.selectedId;
}

function renderTablesEditor() {
    const wrap = $("#tables-editor");
    wrap.innerHTML = "";
    if (!state.tables.length) {
        wrap.append(el("div", { className: "muted" }, "No tables. Use “+ Add table” or ask a model to transcribe from the screenshot."));
    }
    state.tables.forEach((html, i) => {
        const preview = el("div", { className: "preview" });
        preview.innerHTML = html;
        const textarea = el("textarea", { className: "table-html", spellcheck: false, value: html });
        textarea.addEventListener("input", () => {
            state.tables[i] = textarea.value;
            preview.innerHTML = textarea.value;
            markDirty(true);
        });
        const del = el("button", { className: "ghost small", title: "Remove this table" }, "Delete");
        del.addEventListener("click", () => {
            state.tables.splice(i, 1);
            renderTablesEditor();
            refreshChatTarget();
            markDirty(true);
        });
        const card = el("div", { className: "table-card" }, [
            el("div", { className: "table-card-head" }, [el("span", {}, `Table ${i + 1} / ${state.tables.length}`), del]),
            el("div", { className: "block-label" }, "preview"),
            preview,
            el("div", { className: "block-label" }, "HTML"),
            textarea,
        ]);
        wrap.append(card);
    });
}

function setTables(html) {
    state.tables = splitTables(html);
    renderTablesEditor();
    refreshChatTarget();
}

// ---- chat target selector -------------------------------------------------

function refreshChatTarget() {
    const sel = $("#chat-target");
    const prev = sel.value;
    sel.innerHTML = "";
    sel.append(el("option", { value: "all" }, state.tables.length > 1 ? "All tables" : "Table (whole doc)"));
    state.tables.forEach((_, i) => {
        sel.append(el("option", { value: String(i) }, `Table ${i + 1}`));
    });
    // Preserve selection if still valid.
    if ([...sel.options].some((o) => o.value === prev)) {
        sel.value = prev;
    }
}

// ---- doc selection --------------------------------------------------------

async function selectDoc(id) {
    if (state.dirty && !confirm("Discard unsaved changes to the current document?")) {
        return;
    }
    state.selectedId = id;
    const doc = state.docsById.get(id);
    renderDocList();

    $("#doc-title").textContent = id;

    const shots = $("#screenshots");
    shots.innerHTML = "";
    for (const page of doc.pages) {
        if (page.hasScreenshot) {
            shots.append(el("img", { src: `/api/screenshot?doc=${encodeURIComponent(id)}&page=${page.pageNum}&t=${Date.now()}` }));
        }
    }
    if (!shots.children.length) {
        shots.append(el("div", { className: "muted" }, "No screenshot available for this document."));
    }

    setTables(doc.savedExpectedMarkdown || doc.seedExpectedMarkdown || "");

    const f = doc.existingFlags || {};
    $("#flag-difficulty").value = f.table_difficulty || "";
    $("#flag-titlerows").value = f.max_top_title_rows != null ? f.max_top_title_rows : "";
    $("#flag-trm").checked = Boolean(f.trm_unsupported);
    $("#flag-split").checked = Boolean(f.allow_splitting_ambiguous_merged_tables);

    $("#chat-log").innerHTML = "";
    $("#chat-send").disabled = false;
    markDirty(false);
}

function collectFlags() {
    const flags = {};
    const diff = $("#flag-difficulty").value;
    if (diff) {
        flags.table_difficulty = diff;
    }
    const rows = $("#flag-titlerows").value;
    if (rows !== "") {
        flags.max_top_title_rows = parseInt(rows, 10);
    }
    if ($("#flag-trm").checked) {
        flags.trm_unsupported = true;
    }
    if ($("#flag-split").checked) {
        flags.allow_splitting_ambiguous_merged_tables = true;
    }
    return flags;
}

function firstScreenshotPage(doc) {
    const p = doc.pages.find((pg) => pg.hasScreenshot);
    return p ? p.pageNum : null;
}

// ---- save -----------------------------------------------------------------

async function save() {
    if (!state.selectedId) {
        return;
    }
    const doc = state.docsById.get(state.selectedId);
    $("#save").disabled = true;
    $("#save").textContent = "Saving…";
    try {
        const expectedMarkdown = combinedHtml();
        const flags = collectFlags();
        const result = await api("/api/save", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ docId: state.selectedId, expectedMarkdown, flags }),
        });
        doc.isAnnotated = true;
        doc.savedExpectedMarkdown = result.savedExpectedMarkdown;
        doc.existingFlags = flags;
        markDirty(false);
        renderDocList();
    } catch (e) {
        alert(`Save failed: ${e.message}`);
    } finally {
        $("#save").textContent = "Save .test.json";
        $("#save").disabled = !state.selectedId;
    }
}

// ---- model picker ---------------------------------------------------------

function renderModelPicker() {
    const picker = $("#model-picker");
    picker.innerHTML = "";
    const families = new Map();
    for (const m of state.manifest.models) {
        if (!families.has(m.family)) {
            families.set(m.family, []);
        }
        families.get(m.family).push(m);
    }
    for (const [fam, models] of families) {
        const famDiv = el("div", { className: "model-family" }, [el("div", { className: "fam-name" }, fam)]);
        for (const m of models) {
            const available = state.manifest.providers[m.provider];
            const cb = el("input", { type: "checkbox", value: m.id, checked: state.selectedModels.includes(m.id), disabled: !available });
            cb.addEventListener("change", () => {
                if (cb.checked) {
                    if (!state.selectedModels.includes(m.id)) {
                        state.selectedModels.push(m.id);
                    }
                } else {
                    state.selectedModels = state.selectedModels.filter((x) => x !== m.id);
                }
                updateModelToggleLabel();
            });
            const label = el("label", { className: available ? "" : "disabled", title: available ? "" : `No API key for ${m.provider}` }, [
                cb,
                available ? m.label : `${m.label} (no key)`,
            ]);
            famDiv.append(label);
        }
        picker.append(famDiv);
    }
}

function updateModelToggleLabel() {
    $("#model-toggle").textContent = `Models: ${state.selectedModels.length} selected ▾`;
}

// ---- chat -----------------------------------------------------------------

function candidateCard(cand, onUse) {
    const head = el("div", { className: "cand-head" }, [
        el("span", {}, cand.label),
        cand.ok
            ? el("span", { className: "ok" }, cand.ms ? `${(cand.ms / 1000).toFixed(1)}s` : "ok")
            : el("span", { className: "err" }, "error"),
    ]);
    if (!cand.ok) {
        return el("div", { className: "candidate" }, [head, el("div", { className: "cand-error" }, cand.error || "failed")]);
    }
    const preview = el("div", { className: "cand-preview" });
    preview.innerHTML = cand.html;
    const useBtn = el("button", { className: "primary small" }, "Use this");
    useBtn.addEventListener("click", () => onUse(cand.html));
    const viewBtn = el("button", { className: "ghost small" }, "View HTML");
    viewBtn.addEventListener("click", () => {
        const next = preview.nextSibling;
        if (next && next.tagName === "PRE") {
            next.remove();
        } else {
            preview.after(el("pre", { className: "cand-code" }, cand.html));
        }
    });
    return el("div", { className: "candidate" }, [head, preview, el("div", { className: "cand-actions" }, [useBtn, viewBtn])]);
}

async function sendChat() {
    const msg = $("#chat-message").value.trim();
    if (!state.selectedId) {
        return;
    }
    if (!state.selectedModels.length) {
        alert("Select at least one model.");
        return;
    }
    const doc = state.docsById.get(state.selectedId);
    const target = $("#chat-target").value; // "all" or a table index
    const targetIdx = target === "all" ? null : Number(target);
    const currentHtml = targetIdx == null ? combinedHtml() : state.tables[targetIdx] || "";
    const scopeNote =
        targetIdx == null
            ? "all tables"
            : `Table ${targetIdx + 1} only. There may be other tables on the page — transcribe ONLY this one table.`;

    const log = $("#chat-log");
    log.prepend(el("div", { className: "user-msg" }, `▸ [${target === "all" ? "all" : `table ${targetIdx + 1}`}] ${msg || "(transcribe from screenshot)"} — ${state.selectedModels.join(", ")}`));
    const spinner = el("div", { className: "spinner" }, "Querying models…");
    log.prepend(spinner);
    $("#chat-send").disabled = true;
    $("#chat-message").value = "";

    const onUse = (html) => {
        if (targetIdx == null) {
            setTables(html);
        } else {
            const parts = splitTables(html);
            // A single-table edit normally returns one table; if it returns
            // several, splice them all in at that position.
            state.tables.splice(targetIdx, 1, ...(parts.length ? parts : [html]));
            renderTablesEditor();
            refreshChatTarget();
        }
        markDirty(true);
    };

    try {
        const result = await api("/api/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                docId: state.selectedId,
                pageNum: firstScreenshotPage(doc),
                currentHtml,
                message: `${msg ? msg + "\n\n" : ""}Scope: ${scopeNote}`,
                models: state.selectedModels,
            }),
        });
        spinner.remove();
        const wrap = el("div", { className: "candidate-wrap" });
        for (const cand of result.candidates) {
            wrap.append(candidateCard(cand, onUse));
        }
        log.prepend(wrap);
    } catch (e) {
        spinner.textContent = `Error: ${e.message}`;
        spinner.className = "cand-error";
    } finally {
        $("#chat-send").disabled = false;
    }
}

// ---- refresh manifest (pick up newly-parsed docs without losing edits) -----

async function refreshManifest() {
    const fresh = await api("/api/manifest");
    // Preserve any unsaved edits on the currently-selected doc.
    state.manifest = fresh;
    state.docsById = new Map(fresh.docs.map((d) => [d.id, d]));
    $("#meta").textContent = `${fresh.docs.length} docs · tier ${fresh.tier}/${fresh.version}`;
    renderDocList();
}

// ---- init -----------------------------------------------------------------

async function init() {
    await refreshManifest();
    renderModelPicker();
    updateModelToggleLabel();
    refreshChatTarget();

    $("#filter").addEventListener("input", renderDocList);
    $("#add-table").addEventListener("click", () => {
        state.tables.push("");
        renderTablesEditor();
        refreshChatTarget();
        markDirty(true);
    });
    for (const id of ["#flag-difficulty", "#flag-titlerows", "#flag-trm", "#flag-split"]) {
        $(id).addEventListener("change", () => markDirty(true));
    }
    $("#save").addEventListener("click", save);
    $("#reset-seed").addEventListener("click", () => {
        if (!state.selectedId) {
            return;
        }
        setTables(state.docsById.get(state.selectedId).seedExpectedMarkdown || "");
        markDirty(true);
    });
    $("#model-toggle").addEventListener("click", () => $("#model-picker").classList.toggle("hidden"));
    $("#chat-send").addEventListener("click", sendChat);
    $("#chat-message").addEventListener("keydown", (e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            sendChat();
        }
    });

    const firstTodo = state.manifest.docs.find((d) => d.tableCount > 0 && !d.isAnnotated) || state.manifest.docs[0];
    if (firstTodo) {
        selectDoc(firstTodo.id);
    }
}

init().catch((e) => {
    document.body.innerHTML = `<pre style="padding:20px;color:#f87171">Failed to load: ${e.message}</pre>`;
});
