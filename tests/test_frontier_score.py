"""Unit tests for the Exp-3 frontier scorer (frontier_score.py).

Fixture corpus: 3 synthetic docs (one table-family, one text-family, one
charts-family) in the real pilot_1k layout. Contracts under test:
  - gold-vs-gold scores 1.0 per family (charts rule recall included),
  - garbage predictions score ~0,
  - the table path is TEDS-parity with the vendored pb_table implementation,
  - scoring is deterministic (byte-identical scores.jsonl across runs).
"""

import json
from pathlib import Path

import pytest

from encoder_experiments.frontier_score import (
    _pb_table,
    chart_rule_recall,
    convert_pipe_tables,
    edit_similarity,
    normalize_text,
    score_pred_dir,
    teds_content_score,
    write_runs_table,
)

GOLD_TABLE = (
    "<table>\n"
    "  <tr><th>Metric</th><th>Q1</th><th>Q2</th></tr>\n"
    "  <tr><td>Revenue</td><td>450.2</td><td>410.5</td></tr>\n"
    "  <tr><td>Costs</td><td>(45.0)</td><td>(48.0)</td></tr>\n"
    "</table>"
)

GOLD_TEXT = (
    "# Report\n\n"
    "The **quarterly** figures rose by *12%* according to <u>the audit</u>.\n\n"
    "Second paragraph with   spacing   quirks."
)

CHART_RULES = [
    {"type": "chart_data_point", "labels": ["North"], "value": "93", "normalize_numbers": True},
    {"type": "chart_data_point", "labels": ["South"], "value": "1,250", "normalize_numbers": True},
    {"type": "chart_data_point", "labels": ["West"], "value": "$41.5", "normalize_numbers": True},
]

GOLD_CHART_MD = (
    "### Regional sales (histogram)\n\n"
    "| Category | Value |\n| --- | --- |\n"
    "| North | 93 |\n| South | 1250 |\n| West | 41.5 |\n"
)

PIPE_TABLE_PRED = (
    "Intro line.\n\n"
    "| Metric | Q1 | Q2 |\n"
    "| --- | --- | --- |\n"
    "| Revenue | 450.2 | 410.5 |\n"
    "| Costs | (45.0) | (48.0) |\n\n"
    "Outro line."
)

GARBAGE = "zzzz qqqq 000000 nothing to see here"


@pytest.fixture()
def corpus(tmp_path: Path):
    """pilot_1k-shaped corpus: docs/<gen>/<id>.test.json (+ .gold.md for charts)
    and images.jsonl at the dataset root."""
    root = tmp_path / "pilot"
    rows = []

    def add(gen, doc_id, test_json, gold_md=None):
        d = root / "docs" / gen
        d.mkdir(parents=True, exist_ok=True)
        (d / f"{doc_id}.test.json").write_text(json.dumps(test_json, ensure_ascii=False))
        if gold_md is not None:
            (d / f"{doc_id}.gold.md").write_text(gold_md)
        rows.append({"image_id": f"{gen}__{doc_id}", "doc_id": doc_id, "generator": gen})

    add("tables", "t0001", {"expected_markdown": GOLD_TABLE})
    add("text", "x0001", {"expected_markdown": GOLD_TEXT})
    add("charts", "c0001", {"expected_markdown": None, "test_rules": CHART_RULES},
        gold_md=GOLD_CHART_MD)

    with (root / "images.jsonl").open("w") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")
    return root


def _write_preds(pred_dir: Path, mapping: dict[str, str]) -> Path:
    pred_dir.mkdir(parents=True, exist_ok=True)
    for image_id, md in mapping.items():
        (pred_dir / f"{image_id}.md").write_text(md)
    return pred_dir


def _scores_by_family(out_dir: Path) -> dict[str, dict]:
    recs = [json.loads(l) for l in (out_dir / "scores.jsonl").read_text().splitlines()]
    return {r["family"]: r for r in recs}


def test_gold_vs_gold_scores_one(corpus, tmp_path):
    preds = _write_preds(tmp_path / "preds", {
        "tables__t0001": GOLD_TABLE,
        "text__x0001": GOLD_TEXT,
        "charts__c0001": GOLD_CHART_MD,
    })
    out = tmp_path / "out"
    summary = score_pred_dir(preds, corpus / "images.jsonl", out)
    by_fam = _scores_by_family(out)

    assert by_fam["tables"]["metric"] == "teds_content"
    assert by_fam["tables"]["score"] == 1.0
    assert by_fam["text"]["metric"] == "edit_sim"
    assert by_fam["text"]["score"] == 1.0
    assert by_fam["charts"]["metric"] == "chart_rule_recall"
    assert by_fam["charts"]["score"] == 1.0
    assert by_fam["charts"]["rules_passed"] == by_fam["charts"]["rules_total"] == 3
    assert summary["overall"]["mean"] == 1.0
    assert summary["n_missing_pred"] == 0


def test_garbage_scores_near_zero(corpus, tmp_path):
    preds = _write_preds(tmp_path / "preds", {
        "tables__t0001": GARBAGE,  # no <table> -> edit-sim fallback
        "text__x0001": GARBAGE,
        "charts__c0001": GARBAGE,
    })
    out = tmp_path / "out"
    score_pred_dir(preds, corpus / "images.jsonl", out)
    by_fam = _scores_by_family(out)

    assert by_fam["tables"]["metric"] == "edit_sim_fallback"
    assert by_fam["tables"]["score"] < 0.2
    assert by_fam["text"]["score"] < 0.2
    assert by_fam["charts"]["score"] == 0.0

    # Garbage *with* a table goes down the TEDS path and still scores low.
    preds2 = _write_preds(tmp_path / "preds2", {
        "tables__t0001": "<table><tr><td>zzz</td></tr></table>",
        "text__x0001": GOLD_TEXT,
        "charts__c0001": GOLD_CHART_MD,
    })
    out2 = tmp_path / "out2"
    score_pred_dir(preds2, corpus / "images.jsonl", out2)
    rec = _scores_by_family(out2)["tables"]
    assert rec["metric"] == "teds_content"
    assert rec["score"] < 0.3


def test_missing_pred_scores_zero(corpus, tmp_path):
    preds = _write_preds(tmp_path / "preds", {"text__x0001": GOLD_TEXT})
    out = tmp_path / "out"
    summary = score_pred_dir(preds, corpus / "images.jsonl", out)
    by_fam = _scores_by_family(out)
    assert by_fam["tables"]["metric"] == "missing_pred"
    assert by_fam["tables"]["score"] == 0.0
    assert summary["n_missing_pred"] == 2

    # --only-preds restricts scoring to existing prediction files.
    summary2 = score_pred_dir(preds, corpus / "images.jsonl", tmp_path / "out2",
                              only_preds=True)
    assert summary2["n_docs"] == 1 and summary2["n_missing_pred"] == 0


def test_teds_parity_with_vendored_pb_table():
    """The scorer's table metric must equal the vendored implementation exactly
    on a known non-trivial pair."""
    pred = (
        "<table><tr><th>Metric</th><th>Q1</th></tr>"
        "<tr><td>Revenue</td><td>450.2</td></tr></table>"
    )
    ours = teds_content_score(pred, GOLD_TABLE)
    import contextlib, io
    with contextlib.redirect_stdout(io.StringIO()):
        vendored = _pb_table().teds_score(pred, GOLD_TABLE)
    assert ours == vendored
    assert 0.0 < ours < 1.0  # non-trivial pair, non-degenerate value


def test_normalization_semantics():
    # emphasis + whitespace are stripped from both sides
    assert normalize_text("**bold** and *ital*  <u>u</u>\n\nx") == "bold and ital u x"
    # single underscores (math subscripts) survive
    assert "x_1" in normalize_text("$x_1$")
    assert edit_similarity("The  quarterly figures", "The **quarterly** figures") == 1.0
    assert edit_similarity("", "") == 1.0
    assert edit_similarity("abc", "") == 0.0


def test_chart_recall_semantics():
    # $/%/comma-normalized value match with rel tolerance
    recall, passed, total = chart_rule_recall(
        "North 93% ... South $1,250.0000001 ... West 41.5", CHART_RULES)
    assert (passed, total) == (3, 3) and recall == 1.0
    # right numbers, missing label -> rule fails
    recall, passed, _ = chart_rule_recall("North 93 South 1250 East 41.5", CHART_RULES)
    assert passed == 2
    # value absent -> rule fails even when label present
    recall, passed, _ = chart_rule_recall("North South West 12", CHART_RULES)
    assert passed == 0
    # no rules -> 0.0
    assert chart_rule_recall("anything", []) == (0.0, 0, 0)


def test_convert_pipe_tables():
    converted, n = convert_pipe_tables(PIPE_TABLE_PRED)
    assert n == 1
    assert converted == (
        "Intro line.\n\n"
        "<table>"
        "<tr><th>Metric</th><th>Q1</th><th>Q2</th></tr>"
        "<tr><td>Revenue</td><td>450.2</td><td>410.5</td></tr>"
        "<tr><td>Costs</td><td>(45.0)</td><td>(48.0)</td></tr>"
        "</table>\n\n"
        "Outro line."
    )

    # No alignment row -> no header inference, every row is <td>.
    converted, n = convert_pipe_tables("| a | b |\n| c | d |")
    assert n == 1
    assert converted == (
        "<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>"
    )

    # Ragged rows keep their own cell count (no colspan inference, no error).
    converted, n = convert_pipe_tables("| a | b | c |\n| --- | --- | --- |\n| x |\n| y | z |")
    assert n == 1
    assert "<tr><td>x</td></tr>" in converted
    assert "<tr><td>y</td><td>z</td></tr>" in converted

    # A lone pipe line is not a table; pipe-free text is untouched.
    assert convert_pipe_tables("| solitary |") == ("| solitary |", 0)
    assert convert_pipe_tables("plain text\nno pipes") == ("plain text\nno pipes", 0)
    assert convert_pipe_tables("") == ("", 0)


def test_pipe_table_pred_goes_down_teds_path(corpus, tmp_path):
    """A pipe-table prediction is TEDS-scored against the gold HTML and beats
    the edit-sim fallback it previously fell into."""
    preds = _write_preds(tmp_path / "preds", {
        "tables__t0001": PIPE_TABLE_PRED,
        "text__x0001": GOLD_TEXT,
        "charts__c0001": GOLD_CHART_MD,
    })
    out = tmp_path / "out"
    score_pred_dir(preds, corpus / "images.jsonl", out)
    rec = _scores_by_family(out)["tables"]
    assert rec["metric"] == "teds_content"
    assert rec["pipe_tables_converted"] == 1
    fallback = edit_similarity(PIPE_TABLE_PRED, GOLD_TABLE)
    assert rec["score"] > fallback
    assert rec["score"] > 0.9  # same cell content as gold

    # Genuinely tableless output still takes the fallback.
    preds2 = _write_preds(tmp_path / "preds2", {"tables__t0001": GARBAGE})
    out2 = tmp_path / "out2"
    score_pred_dir(preds2, corpus / "images.jsonl", out2, only_preds=True)
    assert _scores_by_family(out2)["tables"]["metric"] == "edit_sim_fallback"


def test_charts_secondary_edit_sim(corpus, tmp_path):
    preds = _write_preds(tmp_path / "preds", {
        "tables__t0001": GOLD_TABLE,
        "text__x0001": GOLD_TEXT,
        "charts__c0001": GOLD_CHART_MD,
    })
    out = tmp_path / "out"
    summary = score_pred_dir(preds, corpus / "images.jsonl", out)
    rec = _scores_by_family(out)["charts"]
    assert rec["metric"] == "chart_rule_recall"
    assert rec["edit_sim"] == 1.0
    assert summary["families"]["charts"]["edit_sim"]["mean"] == 1.0

    preds2 = _write_preds(tmp_path / "preds2", {"charts__c0001": GARBAGE})
    out2 = tmp_path / "out2"
    summary2 = score_pred_dir(preds2, corpus / "images.jsonl", out2, only_preds=True)
    rec2 = _scores_by_family(out2)["charts"]
    assert rec2["score"] == 0.0
    assert 0.0 <= rec2["edit_sim"] < 0.3
    assert summary2["families"]["charts"]["edit_sim"]["mean"] == rec2["edit_sim"]

    table = write_runs_table([("s", "196", summary)], tmp_path / "t.md")
    header, _, row = table.splitlines()[:3]
    assert header.rstrip(" |").endswith("charts_edit_sim")
    assert row.rstrip(" |").endswith("1.0000")


def test_gold_filter_writes_skipped_jsonl(corpus, tmp_path):
    docs = corpus / "docs"
    rows = [json.loads(l) for l in (corpus / "images.jsonl").read_text().splitlines()]

    (docs / "text").mkdir(exist_ok=True)
    (docs / "text" / "x0002.test.json").write_text(json.dumps({"expected_markdown": None}))
    rows.append({"image_id": "text__x0002", "doc_id": "x0002", "generator": "text"})

    (docs / "charts" / "c0002.test.json").write_text(json.dumps({"test_rules": []}))
    rows.append({"image_id": "charts__c0002", "doc_id": "c0002", "generator": "charts"})

    rows.append({"image_id": "tables__t0002", "doc_id": "t0002", "generator": "tables"})

    with (corpus / "images.jsonl").open("w") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")

    preds = _write_preds(tmp_path / "preds", {
        "tables__t0001": GOLD_TABLE,
        "text__x0001": GOLD_TEXT,
        "charts__c0001": GOLD_CHART_MD,
    })
    out = tmp_path / "out"
    summary = score_pred_dir(preds, corpus / "images.jsonl", out)

    skipped = {r["image_id"]: r["reason"]
               for r in map(json.loads, (out / "skipped.jsonl").read_text().splitlines())}
    assert skipped == {
        "tables__t0002": "missing_test_json",
        "text__x0002": "no_gold_markdown",
        "charts__c0002": "no_chart_rules",
    }
    assert summary["n_skipped_no_gold"] == 3
    assert summary["n_docs"] == 3  # skipped docs never reach scores.jsonl
    scored_ids = {json.loads(l)["image_id"]
                  for l in (out / "scores.jsonl").read_text().splitlines()}
    assert scored_ids == {"tables__t0001", "text__x0001", "charts__c0001"}


def test_determinism_and_table_writer(corpus, tmp_path):
    preds = _write_preds(tmp_path / "preds", {
        "tables__t0001": GOLD_TABLE,
        "text__x0001": GARBAGE,
        "charts__c0001": GOLD_CHART_MD,
    })
    out_a, out_b = tmp_path / "a", tmp_path / "b"
    s1 = score_pred_dir(preds, corpus / "images.jsonl", out_a)
    s2 = score_pred_dir(preds, corpus / "images.jsonl", out_b)
    assert (out_a / "scores.jsonl").read_bytes() == (out_b / "scores.jsonl").read_bytes()
    assert s1 == s2

    table = write_runs_table(
        [("stackA", "144", s1), ("stackB", "576", s2)], tmp_path / "runs_table.md")
    lines = [l for l in table.splitlines() if l.startswith("| stack")]
    body = [l for l in table.splitlines()[2:]]
    assert len(body) == 2  # one line per (stack,budget)
    assert body[0].startswith("| stackA | 144 |")
    assert (tmp_path / "runs_table.md").read_text() == table
