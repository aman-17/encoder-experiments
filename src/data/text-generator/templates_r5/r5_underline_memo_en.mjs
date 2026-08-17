// underline_memo_en — dense English contract/policy memo family, underline-heavy.
// DRIFT sibling of a Japanese underline-dense report page: underlined defined terms
// and obligations, occasional bold+underline, boxed clause/notice blocks, captioned
// figure placeholders, dense justified paragraphs. 4 layout modes + continuous jitter.

export function generate(seed) {
  const rng = mulberry32(seed);
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // ---------- discrete layout mode + topic ----------
  const mode = int(0, 3);      // 0 memo+boxed-opening+wide figure | 1 memo+mid notice+2 figures | 2 policy extract+exhibit bullets | 3 contract continuation page
  const topic = int(0, 3);

  // ---------- continuous jitter knobs ----------
  const fontPt = +(8.8 + rng() * 1.8).toFixed(2);
  const fpx = fontPt * 4 / 3;
  const lhf = +(1.27 + rng() * 0.13).toFixed(3);
  const lpx = fpx * lhf;
  const padS = int(54, 74), padT = int(40, 56), padB = 52;
  const PW = 794, PH = 1123;
  const cw = PW - 2 * padS;
  const cpl = Math.floor(cw / (fpx * 0.472));
  const serif = pick(["'Times New Roman', Times, serif", "Georgia, 'Times New Roman', serif"]);
  const uDens = 0.55 + rng() * 0.4;       // underline density knob
  const dbl = 0.12 + rng() * 0.24;        // bold+underline share of emphasized spans
  const indentStyle = rng() < 0.55;       // first-line indent vs paragraph gap
  const paraGapPx = indentStyle ? 0 : int(4, 7);
  const headMT = int(8, 14), headMB = int(3, 7);
  const secStyleNum = rng() < 0.7;        // "1. Heading" vs "Section 1 — Heading"

  // ---------- fictional vocab ----------
  const COMPANIES = ["Harrowgate Analytics Ltd.", "Veldon Industrial Systems, Inc.", "Cormorant Logistics plc", "Ashfield & Pryce LLP", "Bluecrest Facilities Group", "Tanniker Software Corporation", "Ridgemont Capital Partners LLC", "Oakhurst Manufacturing Co."];
  const NAMES = ["M. Okafor", "J. Whitcombe", "R. Castellanos", "A. Lindqvist", "P. Duval", "H. Nakata", "S. Brennan", "L. Ferreira"];
  const OFFICES = ["the Office of the General Counsel", "the Compliance Office", "the Corporate Secretariat", "the Contracts Office"];
  const OFFICERS = ["the General Counsel", "the Head of Data Protection", "the Chief Procurement Officer", "the Director of Corporate Real Estate"];
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const TOPICS = [
    { P1: "the Supplier", P2: "the Client",
      terms: ["Master Services Agreement", "Statement of Work", "Change Order", "Service Levels", "Acceptance Criteria", "Key Personnel", "Deliverables"],
      aTerms: ["Master Services Agreement", "Statement of Work"], docTerms: ["Statement of Work", "Change Order"],
      defs: [['"Statement of Work"', "the written scope document executed by both parties in respect of each engagement"],
             ['"Change Order"', "a written instrument signed by both parties that varies the scope, price or timetable of a Statement of Work"],
             ['"Key Personnel"', "the named individuals whose continued involvement is a condition of the engagement"]],
      heads: ["Scope of Services", "Change Control Procedure", "Service Levels and Credits", "Key Personnel", "Invoicing and Payment", "Term and Termination", "Liability and Indemnities", "Subcontracting"],
      obls: ["submit the required certifications", "deliver an updated compliance statement", "provide reasonable evidence of insurance", "notify the designated contract manager in writing", "propose suitably qualified replacement personnel"],
      activity: ["authorising overtime against a fixed-fee Statement of Work", "engaging any subcontractor", "accepting a Deliverable that has not passed the Acceptance Criteria"],
      records: "invoices, timesheets and expense claims", incident: "reportable Service Level failure",
      figs: ["Change Order approval workflow (schematic)", "Escalation path for Service Level failures", "Governance structure for supplier engagements"],
      re: ["Compliance with the Amended Master Services Agreement", "Revised Change Control and Service Credit Procedure", "Supplier Performance Obligations — Reminder"],
      toL: ["All Contract Managers", "Members of the Vendor Governance Committee", "All Engagement Leads"],
      policy: "Supplier Management Policy", agreement: "Master Services Agreement" },
    { P1: "the Receiving Party", P2: "the Disclosing Party",
      terms: ["Confidential Information", "Personal Data", "Data Processing Addendum", "Security Incident", "Subprocessor", "Retention Schedule", "Permitted Purpose"],
      aTerms: ["Data Processing Addendum"], docTerms: ["Data Processing Addendum", "non-disclosure undertaking"],
      defs: [['"Confidential Information"', "any information disclosed by one party to the other that is marked, or ought reasonably to be understood, as confidential"],
             ['"Security Incident"', "any actual or reasonably suspected unauthorised access to, or loss of, Personal Data"],
             ['"Permitted Purpose"', "the evaluation and performance of the services described in the underlying agreement"]],
      heads: ["Handling of Confidential Information", "Permitted Disclosures", "Security Measures", "Incident Notification", "Retention and Return", "Subprocessors", "Training and Awareness", "Audit Rights"],
      obls: ["return or destroy all copies on request", "complete the annual awareness training", "encrypt removable media without exception", "restrict access on a need-to-know basis", "log all disclosures to external counsel"],
      activity: ["engaging any new Subprocessor", "transferring Personal Data outside the approved jurisdictions", "granting portal access to external counsel"],
      records: "processing activities and disclosures", incident: "Security Incident",
      figs: ["Escalation path for Security Incidents (overview)", "Data flows covered by the Addendum (simplified)", "Approval chain for new Subprocessors"],
      re: ["Handling of Confidential Information and Personal Data", "Revised Incident Notification Procedure", "Confidentiality Obligations — Annual Reminder"],
      toL: ["All Staff", "All Data Owners and System Administrators", "Members of the Information Governance Group"],
      policy: "Information Handling Policy", agreement: "Confidentiality and Data Processing Addendum" },
    { P1: "the requesting department", P2: "the Procurement Office",
      terms: ["Approved Vendor List", "Purchase Order", "Competitive Bid Threshold", "Sole-Source Justification", "Framework Agreement", "Delegated Authority", "Conflict of Interest Disclosure"],
      aTerms: ["Procurement Policy", "Framework Agreement"], docTerms: ["Purchase Order", "Sole-Source Justification", "Framework Agreement"],
      defs: [['"Competitive Bid Threshold"', "the value above which at least three written quotations must be obtained"],
             ['"Sole-Source Justification"', "a documented explanation, approved in advance, for dispensing with competitive quotations"],
             ['"Approved Vendor List"', "the register of vendors that have completed onboarding and due diligence"]],
      heads: ["Sourcing Thresholds", "Vendor Onboarding", "Purchase Orders", "Sole-Source Purchases", "Contract Lodgement", "Conflicts of Interest", "Delegated Authority", "Records and Audit"],
      obls: ["obtain three written quotations", "complete the vendor onboarding checklist", "raise a Purchase Order before work commences", "file a Conflict of Interest Disclosure", "route the request through the sourcing portal"],
      activity: ["issuing a Purchase Order to a vendor not on the Approved Vendor List", "splitting a requirement to avoid the Competitive Bid Threshold", "extending a Framework Agreement beyond its initial term"],
      records: "bid evaluations and award decisions", incident: "suspected conflict of interest",
      figs: ["Sourcing decision tree by spend value", "Vendor onboarding sequence (summary)", "Delegated authority matrix (extract)"],
      re: ["Revisions to the Procurement Policy", "Purchase Order Discipline and Contract Lodgement", "Competitive Bidding Requirements — Clarification"],
      toL: ["All Budget Holders", "All Department Heads", "Authorised Requisitioners"],
      policy: "Procurement Policy", agreement: "Framework Purchase Agreement" },
    { P1: "the Tenant", P2: "the Landlord",
      terms: ["Premises", "Permitted Use", "Operating Expenses", "Base Rent", "Tenant Improvements", "Casualty Event", "Estoppel Certificate"],
      aTerms: ["Lease", "workletter"], docTerms: ["Estoppel Certificate", "notice of alteration"],
      defs: [['"Permitted Use"', "the use of the Premises for general office purposes and ancillary storage"],
             ['"Operating Expenses"', "the costs reasonably incurred in operating, maintaining and insuring the building"],
             ['"Landlord\'s Work"', "the base-building improvements set out in the workletter"]],
      heads: ["The Premises and Permitted Use", "Rent and Operating Expenses", "Repairs and Maintenance", "Alterations", "Insurance and Casualty", "Assignment and Subletting", "Access and Security", "Surrender"],
      obls: ["keep the Premises in good repair", "provide certificates of insurance on renewal", "deliver an Estoppel Certificate", "restore any approved alterations on surrender", "report defects in the common areas promptly"],
      activity: ["altering the layout of the Premises", "assigning or subletting any part of the Premises", "installing signage visible from the exterior"],
      records: "maintenance and inspection activities", incident: "Casualty Event affecting the Premises",
      figs: ["Floor plan of the Premises showing Permitted Use areas", "Casualty restoration timeline (indicative)", "Service yard access arrangements"],
      re: ["Obligations under the Amended Lease", "Alterations and Permitted Use — Revised Guidance", "Operating Expense Reconciliation Procedure"],
      toL: ["Regional Facilities Managers", "All Site Contacts", "Building Occupiers and Team Leads"],
      policy: "Facilities and Premises Policy", agreement: "Lease of Part — Fourth Floor" }];

  const T = TOPICS[topic];
  const co = pick(COMPANIES);
  const office = pick(OFFICES);
  const officer = OFFICERS[topic];
  const docWord = mode === 2 ? "Policy" : mode === 3 ? "Agreement" : "memorandum";
  const cur = pick(["$", "£", "€"]);
  const money = () => cur + pick(["10,000", "25,000", "50,000", "100,000", "250,000"]);
  const usDate = rng() < 0.4;
  const mkDate = () => { const d = int(1, 28), m = pick(MONTHS), y = int(2025, 2027); return usDate ? `${m} ${d}, ${y}` : `${d} ${m} ${y}`; };
  const letter = () => pick(["A", "B", "C", "D", "1", "2", "3"]);
  const term = () => pick(T.terms);
  const aTerm = () => pick(T.aTerms);
  const docTerm = () => pick(T.docTerms);

  // ---------- emphasis segments ----------
  const seg = (t, u = 0, b = 0, i = 0) => ({ t, u, b, i });
  let emBoost = 0;
  const U = (t) => (rng() < Math.min(1, uDens + emBoost)) ? seg(t, 1, rng() < dbl ? 1 : 0) : seg(t);
  const UB = (t) => seg(t, 1, 1);
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const segsHtml = (ss) => ss.map(s => { let h = esc(s.t); if (s.b) h = `<b>${h}</b>`; if (s.i) h = `<i>${h}</i>`; if (s.u) h = `<u>${h}</u>`; return h; }).join("");
  const segsMd = (ss) => ss.map(s => { let m = s.t; if (s.b) m = `**${m}**`; if (s.i) m = `*${m}*`; if (s.u) m = `<u>${m}</u>`; return m; }).join("");
  const chars = (ss) => ss.reduce((n, s) => n + s.t.length, 0);
  const paraCost = (ss) => Math.ceil(chars(ss) / cpl) * lpx + paraGapPx + (indentStyle ? 0 : 0);

  // ---------- sentence factories ----------
  const defsQ = shuffle(T.defs);
  const notwPairs = [["no amendment or waiver shall be effective unless executed in writing", " by an authorised signatory of each party."],
    ["no failure or delay in exercising any right shall operate as a waiver", " of that right or of any other right."],
    ["the obligations in this paragraph survive expiry or termination", " of the engagement for a period of five years."]];
  const breachA = ["failure to comply with this paragraph constitutes a material breach", "late delivery of the certifications described above is a compensable default", "repeated non-compliance will be escalated to the executive sponsor"];
  const breachB = ["suspend performance without liability", "withhold the affected payments", "require remediation at the defaulting party's expense"];
  const units = ["department", "business unit", "budget holder", "engagement lead"];

  const FACT = [
    () => [seg(`Under Section ${int(2, 14)}.${int(1, 9)} of the `), U(aTerm()), seg(`, ${T.P1} shall `), U(pick(T.obls)), seg(` within ${int(5, 30)} days of receipt of a written request from ${T.P2}.`)],
    () => { const d = defsQ.shift(); return [seg(`For the purposes of this ${docWord}, `), UB(d[0]), seg(` means ${d[1]}, as further described in Schedule ${letter()}.`)]; },
    () => [seg(`${cap(T.P1)} acknowledges that `), U(pick(breachA)), seg(`, and that ${T.P2} may `), U(pick(breachB)), seg(` until the deficiency is remedied to its reasonable satisfaction.`)],
    () => { const p = pick(notwPairs); return [seg(`Notwithstanding anything to the contrary herein, `), U(p[0]), seg(p[1])]; },
    () => [seg(`Each ${pick(units)} must `), U(`obtain prior written approval from ${office}`), seg(` before ${pick(T.activity)}, except where the aggregate value does not exceed ${money()} in any calendar year.`)],
    () => [seg(`Any ${docTerm()} received after ${mkDate()} `), U(`will be rejected without further review`), seg(`, and resubmission will require a new ${docTerm()} approved at the appropriate level.`)],
    () => [seg(`The parties agree that `), UB(`time is of the essence`), seg(` in relation to the milestones described in paragraph ${int(2, 9)} above, and that the remedies set out in this ${docWord} are cumulative.`)],
    () => [seg(`${pick(["Questions concerning the interpretation", "Queries about the application", "Requests for clarification"])} of this ${docWord} should be directed to ${office}, which maintains the authoritative version together with a register of approved exceptions.`)],
    () => [seg(`${cap(T.P1)} shall maintain, and shall procure that each of its subcontractors maintains, `), U(`complete and accurate records`), seg(` of all ${T.records} for a period of not less than ${int(3, 7)} years following ${pick(["expiry or termination of the engagement", "the end of the relevant financial year"])}.`)],
    () => [seg(`Where a ${T.incident} occurs, ${T.P1} must notify ${office} `), U(`without undue delay and in any event within ${pick([24, 48, 72])} hours`), seg(`, providing the particulars listed in Annex ${letter()}.`)],
    () => [seg(`A fully executed copy of each ${docTerm()} must be lodged with ${office} within ${int(3, 10)} business days; `), U(`unlodged agreements will not be recognised for payment purposes`), seg(`.`)],
    () => [seg(`This ${docWord} supersedes the guidance issued on ${mkDate()} and `), U(`applies to all engagements entered into on or after ${mkDate()}`), seg(`.`)],
    () => [seg(`${pick(["Departures from", "Deviations from", "Exceptions to"])} the requirements of this section may be approved only by ${officer}, and `), U(`each approval must be recorded in the ${pick(["exceptions register", "register of dispensations"])}`), seg(` within ${int(3, 10)} business days of the decision.`)],
    () => [seg(`Nothing in this ${docWord} `), U(`transfers any intellectual property rights`), seg(`, and all licences granted are limited to the purposes described above.`)]];
  const DEF_IDX = 1;
  let order = shuffle([...FACT.keys()]), oi = 0;
  function nextSentence(boost = 0) {
    for (let k = 0; k < order.length; k++) {
      const idx = order[(oi + k) % order.length];
      if (idx === DEF_IDX && !defsQ.length) continue;
      oi = (oi + k + 1) % order.length;
      emBoost = boost; const s = FACT[idx](); emBoost = 0;
      return s;
    }
  }
  function buildParagraph(maxPx, minS = 2, maxS = 5, boost = 0) {
    let segs = null, count = 0;
    const target = int(minS, maxS);
    while (count < target) {
      const s = nextSentence(boost);
      const trial = segs ? [...segs, seg(" "), ...s] : s;
      if (paraCost(trial) > maxPx) { if (segs) break; return segs; }
      segs = trial; count++;
    }
    return segs;
  }

  // ---------- fixed furniture (generate content first, then budget) ----------
  const blocks = [];   // {h, g}
  const B = (h, g) => blocks.push({ h, g });
  let fixed = 0;

  // classification / running header
  const hasClsf = mode !== 3 && rng() < 0.55;
  const clsfTxt = pick(["PRIVILEGED & CONFIDENTIAL", "CONFIDENTIAL — INTERNAL USE ONLY", "DRAFT — FOR DISCUSSION PURPOSES ONLY"]);
  const rhTxt = `${co} — ${T.agreement} — ${pick(["Execution Version", "Conformed Copy", "Confidential"])}`;
  if (mode === 3) fixed += lpx + 22; else if (hasClsf) fixed += lpx + 8;

  // title & memo header
  const memoTitle = pick(["MEMORANDUM", "INTERNAL MEMORANDUM"]);
  const exTitle = pick([`${co} — ${T.policy} (Extract)`, `Extract from the ${co} ${T.policy}`]);
  const labels = rng() < 0.5 ? ["TO", "FROM", "DATE", "RE"] : ["To", "From", "Date", "Subject"];
  const toTxt = pick(T.toL), fromTxt = `${pick(NAMES)}, ${officer.replace(/^the /, "")}`, dateTxt = mkDate(), reTxt = pick(T.re);
  const reU = rng() < 0.6;
  const subTitle = `Approved by the Board on ${mkDate()}; effective ${mkDate()}`;
  if (mode === 0 || mode === 1) fixed += fpx * 1.5 + 20 + 4 * (lpx * 1.12) + 34;
  if (mode === 2) fixed += fpx * 1.5 + 20 + lpx + 14;

  // notice / note / exhibit boxes (content now, placement later)
  let noticeHead = "", noticeSegs = null, noteSegs = null, bullets = null, exCap = "";
  if (mode === 1) {
    noticeHead = pick(["IMPORTANT NOTICE", "COMPLIANCE ALERT", "ACTION REQUIRED", "NOTICE TO ALL BUDGET HOLDERS"]);
    noticeSegs = buildParagraph(lpx * 6, 2, 3, 0.35);
    fixed += lpx + paraCost(noticeSegs) + 36;
  }
  if (mode === 3) {
    noteSegs = [seg("NOTE:", 0, 1), seg(" "), ...buildParagraph(lpx * 4, 1, 2, 0.3)];
    fixed += paraCost(noteSegs) + 34;
  }
  if (mode === 2) {
    exCap = `Exhibit ${int(2, 9)} — Summary of Key Obligations (Extract)`;
    const BF = [
      () => [U(`No retrospective approvals`), seg(` — requests must be raised before the commitment is made.`)],
      () => [seg(`All ${term()} requests above ${money()} require `), U(`two authorised signatures`), seg(`.`)],
      () => [U(`Verbal instructions are not binding`), seg(` and must be confirmed in writing within ${int(2, 5)} business days.`)],
      () => [seg(`Renewals are `), U(`not automatic`), seg(` and follow the same review as new requests.`)],
      () => [seg(`Exceptions require the prior approval of ${officer} and `), U(`expire after twelve months`), seg(`.`)],
      () => [U(`Registers are audited ${pick(["quarterly", "twice yearly"])}`), seg(`; discrepancies are reported to the Audit Committee.`)]];
    emBoost = 0.3;
    bullets = shuffle(BF).slice(0, int(4, 6)).map(f => f());
    emBoost = 0;
    fixed += lpx + bullets.length * lpx * 1.35 + 34;
  }

  // figures
  const figNo = int(1, 19);
  const capFmt = pick([(n, t) => `Figure ${n} — ${t}`, (n, t) => `Figure ${n}. ${t}`, (n, t) => `Exhibit ${n} — ${t}`]);
  const srcFmt = () => pick([`(Source) ${co} ${pick(["Legal Department", "Corporate Secretariat", "Compliance Office"])}`, `(Prepared by) ${pick(["Corporate Secretariat", "the Contracts Office"])}, ${pick(MONTHS)} ${int(2025, 2027)}`]);
  const figTitles = shuffle(T.figs);
  let figH = mode === 0 ? int(140, 210) : int(120, 165);
  if (mode === 0) fixed += lpx + figH + lpx * 0.9 + 30;
  if (mode === 1) fixed += lpx + figH + lpx * 0.9 + 30;

  // footer
  const pgNo = int(2, 19);
  const footTxt = pick([`- ${pgNo} -`, `Page ${pgNo} of ${pgNo + int(3, 30)}`, `${pick(["POL", "MSA", "LSE", "PRC"])}-${int(2025, 2027)}-${String(int(1, 90)).padStart(3, "0")} · Page ${pgNo}`]);

  // ---------- fill sections ----------
  let remaining = PH - padT - padB - fixed - 8;
  const headsQ = shuffle(T.heads);
  const secBase = mode === 3 ? int(4, 11) : 1;
  const sections = [];
  while (remaining > lpx * 2.8 && headsQ.length) {
    remaining -= lpx * 1.15 + headMT + headMB;
    const paras = [];
    const nP = int(1, 3);
    while (paras.length < nP && remaining > lpx * 2.2) {
      const p = buildParagraph(remaining, 2, 5);
      if (!p) break;
      remaining -= paraCost(p);
      paras.push(p);
    }
    if (!paras.length) break;
    const n = secBase + sections.length;
    const raw = headsQ.shift();
    const head = mode === 3 ? `${n}. ${raw.toUpperCase()}` : secStyleNum ? `${n}. ${raw}` : `Section ${n} — ${raw}`;
    if (mode === 3) paras.forEach((p, i) => p.unshift(seg(`${n}.${i + 1} `)));
    sections.push({ head, paras });
  }
  // absorb leftover vertical slack into the figure placeholder so the page stays full
  if (mode === 0 || mode === 1) {
    const add = Math.min(Math.max(remaining - 4, 0), mode === 0 ? 160 : 120);
    figH += Math.round(add);
  }

  // ---------- emit blocks in reading order ----------
  if (mode === 3) B(`<div class="rh">${esc(rhTxt)}</div>`, rhTxt);
  else if (hasClsf) B(`<div class="clsf">${esc(clsfTxt)}</div>`, clsfTxt);

  if (mode === 0 || mode === 1) {
    B(`<div class="title">${memoTitle}</div>`, `# ${memoTitle}`);
    const tf = [[labels[0], toTxt], [labels[1], fromTxt], [labels[2], dateTxt], [labels[3], reTxt]];
    const tfH = tf.map(([l, v], i) => `<div class="tf"><span class="lbl">${l}:</span> ${(i === 3 && reU) ? `<u>${esc(v)}</u>` : esc(v)}</div>`).join("");
    const tfG = tf.map(([l, v], i) => `**${l}:** ${(i === 3 && reU) ? `<u>${v}</u>` : v}`).join("\n");
    B(tfH + `<div class="rule"></div>`, tfG);
  } else if (mode === 2) {
    B(`<div class="title">${esc(exTitle)}</div>`, `# ${exTitle}`);
    B(`<div class="sub"><i>${esc(subTitle)}</i></div>`, `*${subTitle}*`);
  }

  const paraHtml = (p) => `<p>${segsHtml(p)}</p>`;
  const noticeAfter = Math.min(2, sections.length);   // insert box after this many sections
  sections.forEach((s, si) => {
    B(`<div class="h">${esc(s.head)}</div>`, `## ${s.head}`);
    if (mode === 0 && si === 0) {
      B(`<div class="box">${s.paras.map(paraHtml).join("")}</div>`, s.paras.map(segsMd).join("\n\n"));
    } else {
      s.paras.forEach(p => B(paraHtml(p), segsMd(p)));
    }
    if (mode === 1 && si === noticeAfter - 1) {
      const nh = rng() < 0.5 ? { h: `<u><b>${noticeHead}</b></u>`, g: `<u>**${noticeHead}**</u>` } : { h: `<b>${noticeHead}</b>`, g: `**${noticeHead}**` };
      B(`<div class="box nbx"><div class="nhead">${nh.h}</div><p>${segsHtml(noticeSegs)}</p></div>`,
        `${nh.g}\n\n${segsMd(noticeSegs)}`);
    }
    if (mode === 2 && si === noticeAfter - 1) {
      B(`<div class="cap">${esc(exCap)}</div><div class="box">${bullets.map(b => `<div class="bl">- ${segsHtml(b)}</div>`).join("")}</div>`,
        `${exCap}\n\n${bullets.map(b => `- ${segsMd(b)}`).join("\n")}`);
    }
  });
  if (mode === 3) B(`<div class="box nbx"><p style="text-indent:0">${segsHtml(noteSegs)}</p></div>`, segsMd(noteSegs));

  if (mode === 0) {
    const capTxt = capFmt(figNo, figTitles[0]), srcTxt = srcFmt();
    B(`<div class="cap">${esc(capTxt)}</div><div class="ph" style="height:${figH}px"></div><div class="src">${esc(srcTxt)}</div>`,
      `${capTxt}\n\n${srcTxt}`);
  }
  if (mode === 1) {
    const capA = capFmt(figNo, figTitles[0]), capB2 = capFmt(figNo + 1, figTitles[1]);
    const srcA = srcFmt(), srcB = srcFmt();
    B(`<div class="figrow"><div class="figcol"><div class="cap">${esc(capA)}</div><div class="ph" style="height:${figH}px"></div><div class="src">${esc(srcA)}</div></div>` +
      `<div class="figcol"><div class="cap">${esc(capB2)}</div><div class="ph" style="height:${figH}px"></div><div class="src">${esc(srcB)}</div></div></div>`,
      `${capA}\n\n${capB2}\n\n${srcA}\n\n${srcB}`);
  }
  B(`<div class="foot">${esc(footTxt)}</div>`, footTxt);

  // ---------- html ----------
  const html = `<!-- underline_memo_en seed ${seed} mode ${mode} topic ${topic} -->
<style>
@page{size:A4;margin:0}
*{margin:0;padding:0;box-sizing:border-box}
body{width:${PW}px;height:${PH}px;font-family:${serif};font-size:${fontPt}pt;line-height:${lhf};color:#101010;background:#fff;position:relative}
.pg{padding:${padT}px ${padS}px ${padB}px}
p{text-align:justify;${indentStyle ? "text-indent:1.5em;" : `margin-bottom:${paraGapPx}px;`}}
u{text-underline-offset:2px}
.h{font-weight:bold;font-size:${(1.02 + rng() * 0.06).toFixed(2)}em;margin:${headMT}px 0 ${headMB}px}
.title{text-align:center;font-weight:bold;font-size:1.35em;letter-spacing:${int(1, 3)}px;margin-bottom:${int(8, 14)}px}
.sub{text-align:center;margin-bottom:${int(6, 12)}px}
.tf{margin-bottom:2px}
.lbl{font-weight:bold;display:inline-block;width:${int(58, 76)}px}
.rule{border-bottom:${pick(["1.5px", "2.5px"])} solid #111;margin:${int(6, 10)}px 0 ${int(6, 12)}px}
.box{border:${pick(["1.3px", "2px"])} solid #222;padding:${int(6, 10)}px ${int(8, 12)}px;margin:${int(5, 9)}px 0 ${int(7, 11)}px}
.nbx{${rng() < 0.5 ? "background:#f2f2f2;" : ""}}
.nhead{text-align:center;margin-bottom:3px}
.cap{text-align:center;margin:${int(8, 14)}px 0 ${int(3, 6)}px}
.bl{text-align:justify;padding-left:14px;text-indent:-14px;margin-bottom:2px}
.ph{border:1px solid #9a9a9a;background:repeating-linear-gradient(45deg,#e4e4e4,#e4e4e4 7px,#d9d9d9 7px,#d9d9d9 14px)}
.src{font-size:0.85em;margin-top:3px}
.figrow{display:flex;gap:${int(14, 24)}px}
.figcol{flex:1}
.rh{text-align:center;font-size:0.85em;border-bottom:1px solid #333;padding-bottom:4px;margin-bottom:${int(8, 14)}px}
.clsf{text-align:${pick(["center", "right"])};font-size:0.85em;font-weight:bold;letter-spacing:1px;margin-bottom:6px}
.foot{position:absolute;bottom:${int(18, 30)}px;left:0;right:0;text-align:center;font-size:0.9em}
</style>
<div class="pg">
${blocks.slice(0, -1).map(b => b.h).join("\n")}
</div>
${blocks[blocks.length - 1].h}`;

  const gt = blocks.map(b => b.g).join("\n\n");
  return { html, gt, pageOpts: {} };
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
