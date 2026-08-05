// FAMILY generator — portrait Letter guideline page whose ONLY table is an
// orphaned continuation fragment at the very top: 1-3 borderless 2-cell rows,
// pale blue fill, zero rules. Left cell = short step label (vertically
// centered); right cell = un-bulleted intro line + 3-6 round bullets. Below:
// bold sans "N.x" heading, dense Times body paragraphs (count varies with
// fragment size), a bold sans sub-heading, closing paragraph ending in a
// colon, centered page-number footer. GT = ONE Nx2 table (2N cells, 2 cols,
// 0 merged), no header. Seed-jittered: fragment row count, bullets per row,
// paragraph count, sentence drops, section numbering, title wording, font
// scale (±10%), fill shade, label-column width, page padding, quirk toggles.
// All names/titles/forms are fictional pools; no real-document identifiers.
export function generate(seed) {
  const rng = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

  // ---------- structural knobs ----------
  const nRows = 1 + (seed % 3);                       // 1-3 fragment rows, guaranteed to differ across adjacent seeds
  let fs = 0.92 + rng() * 0.16;                       // ±~10% font scale
  if (nRows === 3) fs = Math.min(fs, 0.98);           // densest fragment keeps the small-print look and fits 1pp
  const pt = (x) => `${Math.round(x * fs * 100) / 100}pt`;
  const fill = pick(["#dbe5f1", "#d9e4f0", "#dde8f2", "#e0e9f4", "#d6e2ef"]);
  const lblW = 26 + Math.floor(rng() * 7);            // 26-32% label column
  const hSp = 2 + rng() * 1.5;                        // border-spacing
  const vSp = nRows > 1 ? 2 + rng() * 1.5 : 0;
  const padT = 22 + rng() * 6, padL = 26 + rng() * 5, padR = 24 + rng() * 6;
  const lh = 1.28 + rng() * 0.1;
  const contNote = rng() < 0.22;                      // stray "(continued)" marker quirk

  // ---------- continuation-fragment content (8 fictional step variants) ----------
  const variants = [
    {
      label: "Verify scope concurrence",
      intro: "Confirm readiness to advance by:",
      bullets: [
        "Review of the approved scope statement and design criteria",
        "Verification of concurrence from district program management",
        "Reconciliation of the current estimate with the programmed amount, including any funding shortfalls",
        "Documentation of deviations from the prior milestone estimate",
        "Transmittal of the estimate package for independent review",
        "Confirmation that risk items identified at the prior milestone remain current",
      ],
    },
    {
      label: "Secure required endorsements",
      intro: "Obtain endorsement of the estimate by:",
      bullets: [
        "Circulation of the estimate summary to functional unit leads",
        "Confirmation that quantities reflect the current design stage",
        "Endorsement of contingency amounts, including any adjustments carried from earlier milestones",
        "Sign-off by the engineer in responsible charge",
        "Recording of all endorsements in the project estimate file",
        "Verification that the endorsement register is complete and current",
      ],
    },
    {
      label: "Finalize estimate documentation",
      intro: "Complete the estimate record by:",
      bullets: [
        "Assembly of quantity takeoffs and unit price support",
        "Notation of assumptions affecting major cost items",
        "Reconciliation of the estimate total with the programming document, including all incidental costs",
        "Filing of the completed checklist with the estimate package",
        "Distribution of the record to the project delivery team",
        "Archival of superseded estimate versions with revision notes",
      ],
    },
    {
      label: "Communicate estimate results",
      intro: "Convey the completed estimate by:",
      bullets: [
        "Preparation of a summary memorandum for management review",
        "Notification of affected functional units and district staff",
        "Explanation of significant changes from the previously reported total, including scope growth",
        "Posting of the current total to the program management system",
        "Confirmation of receipt by the project sponsor",
        "Scheduling of a follow-up review with the estimating unit",
      ],
    },
    {
      label: "Update contingency allowances",
      intro: "Refresh contingency amounts by:",
      bullets: [
        "Review of the risk register against the current design stage",
        "Adjustment of contingency percentages for resolved risk items",
        "Documentation of the basis for each contingency amount retained, including deferred scope items",
        "Comparison of remaining contingency with historical drawdown rates",
        "Recording of the revised amounts in the estimate summary",
        "Notification of the change to program management staff",
      ],
    },
    {
      label: "Reconcile quantity changes",
      intro: "Account for quantity revisions by:",
      bullets: [
        "Comparison of current quantities with the prior milestone takeoff",
        "Identification of design changes driving each significant variance",
        "Annotation of the estimate detail with the reason for each revision, including plan sheet references",
        "Verification that unit prices remain appropriate for revised quantities",
        "Summary of net quantity impacts for the estimate memorandum",
        "Filing of the reconciliation with the estimate package",
      ],
    },
    {
      label: "Screen market conditions",
      intro: "Assess pricing conditions by:",
      bullets: [
        "Review of recent bid results for comparable work items",
        "Comparison of current material price indices with estimate assumptions",
        "Notation of labor availability factors affecting the letting schedule, including seasonal constraints",
        "Adjustment of unit prices where market movement is sustained",
        "Documentation of sources consulted for pricing information",
        "Reporting of significant pricing exposure to the project sponsor",
      ],
    },
    {
      label: "Confirm funding alignment",
      intro: "Verify programmed funding by:",
      bullets: [
        "Comparison of the estimate total with the programmed amount",
        "Identification of shortfalls requiring program action",
        "Coordination with program staff on the timing of funding adjustments, including fiscal year constraints",
        "Documentation of the funding status in the estimate memorandum",
        "Confirmation that authorized phases match the current schedule",
        "Transmittal of the funding summary to district management",
      ],
    },
  ];
  // seed-offset shuffle so adjacent seeds start on different variants, then
  // draw nRows DISTINCT variants with per-row jittered bullet counts
  const order = variants.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const start = (Math.floor(rng() * 8) + seed) % 8;
  const rowsData = [];
  for (let r = 0; r < nRows; r++) {
    const v = variants[order[(start + r) % 8]];
    const maxB = nRows === 3 ? 3 : 4;                 // 3-5 bullets on dense pages, 3-6 otherwise
    const k = 3 + Math.floor(rng() * maxB);
    rowsData.push({ label: v.label, intro: v.intro, bullets: v.bullets.slice(0, k) });
  }

  // ---------- page furniture (fictional pools) ----------
  const fileNoun = pick([
    "project estimate file", "estimate basis file", "project cost file",
    "estimate record file", "cost documentation file", "project estimating file",
  ]);
  const fileTitle = fileNoun.replace(/(^|\s)\w/g, (c) => c.toUpperCase());
  const heading = pick([fileTitle, `${fileTitle} Requirements`, `Maintaining the ${fileTitle}`, `The ${fileTitle}`]);
  const secNum = `${2 + Math.floor(rng() * 3)}.${1 + Math.floor(rng() * 8)}`;
  const subhead = pick([
    "Other Estimate Documentation",
    "Supporting Estimate Records",
    "Additional Milestone Documentation",
    "Related Estimate Records",
    "Estimate File Contents",
    "Supplemental Estimate Records",
  ]);
  const role = pick([
    "Project Manager", "District Estimating Engineer", "Program Development Engineer",
    "Area Cost Engineer", "Project Delivery Engineer", "Regional Estimates Coordinator",
  ]);
  const form = pick([
    "Cost Driver Analysis Form", "Estimate Basis Worksheet", "Major Item Justification Form",
    "Cost Risk Summary Form", "Quantity Assurance Checklist", "Milestone Estimate Record",
    "Parametric Basis Summary",
  ]);
  const unitPool = ["roadway", "structures", "traffic", "drainage", "utilities", "right of way", "environmental"];
  const units = [];
  while (units.length < 3) { const u = pick(unitPool); if (!units.includes(u)) units.push(u); }
  const unitStr = units.join(", ");
  const pageNum = 5 + Math.floor(rng() * 32);

  // ---------- body paragraphs: sentence pools + seeded sentence drops ----------
  const dropP = nRows === 3 ? 1 : 0.25 + rng() * 0.25; // dense fragment → always shed a sentence
  const para = (sentences) => {
    const s = sentences.slice();
    if (s.length > 3 && rng() < dropP) s.splice(1 + Math.floor(rng() * (s.length - 2)), 1);
    return s.join(" ");
  };

  const p1 = para([
    pick([
      `Estimates are developed through the coordinated effort of many functional units (e.g., ${unitStr}).`,
      `Construction cost estimates are assembled from the contributions of several functional units (e.g., ${unitStr}).`,
    ]),
    pick([
      `So that the assumptions behind the construction cost estimate can be traced and the information preserved for future projects, all estimates and their supporting documentation must be retained in the ${fileNoun}.`,
      `To preserve the basis of each construction cost estimate and make the information available to future projects, every estimate and its supporting documentation must be filed in the ${fileNoun}.`,
    ]),
    pick([
      `The ${fileNoun} may be maintained in hard copy or electronically as a folder within the general project file, provided it can be readily accessed by project staff.`,
      `The ${fileNoun} can be kept either in hard copy or electronically within the general project file, so long as it remains easy for project staff to retrieve.`,
    ]),
    pick([
      `The ${role} is responsible for the creation and maintenance of the ${fileNoun}.`,
      `Responsibility for establishing and maintaining the ${fileNoun} rests with the ${role}.`,
    ]),
  ]);

  const p2 = para([
    pick([
      `The ${fileNoun} provides a record that documents the basic reasoning behind the original estimated construction cost, as well as the reasons for subsequent construction cost revisions.`,
      `A complete ${fileNoun} documents why the original construction cost was estimated as it was and why each subsequent revision to that cost was made.`,
    ]),
    pick([
      `At a minimum, the file should contain the ${form} for the appropriate categories of work at each project milestone.`,
      `The file should contain, at a minimum, the ${form} for each category of work at every project milestone.`,
    ]),
    pick([
      `Any assumptions that have been made, the current project scope, and a copy of or reference to the cost data used to develop the estimate should be included for each cost estimate prepared.`,
      `For every estimate prepared, the file should capture the governing assumptions, the current project scope, and a copy of or reference to the cost data relied upon.`,
    ]),
    pick([
      `This information belongs in the file regardless of the project development stage—the record begins with the very first estimate and grows as the project advances.`,
      `The record is kept regardless of development stage; it begins with the very first estimate and is expanded as the project moves toward letting.`,
    ]),
    pick([
      `When items are estimated by percentages or other allowances, as is often done for miscellaneous and utility costs, the percentage used should also be documented in the file.`,
      `Where percentages or allowances are used in place of itemized costs, as is common for miscellaneous and utility work, those percentages must likewise be recorded in the file.`,
    ]),
  ]);

  const p3 = para([
    pick([
      `Depending on the point reached in the project development cycle, the amount and type of documentation contained in the ${fileNoun} will vary.`,
      `The amount and type of documentation contained in the ${fileNoun} will differ with the point the project has reached in the development cycle.`,
    ]),
    pick([
      `Information used to develop the funding estimate, such as cost-per-mile factors or other parametric methods, should be well documented and included in the file.`,
      `Parametric information supporting the funding estimate, including cost-per-mile factors and similar methods, must be documented and placed in the file.`,
    ]),
    pick([
      `Additionally, any line item prices set higher or lower than the bid item history costs must be well documented in the file.`,
      `Line item prices that depart from bid item history costs, whether higher or lower, must also be explained in the file.`,
    ]),
    pick([
      `Supporting information may consist of references to bid tabulation data, unit bid price book data, or some other reputable resources.`,
      `References to bid tabulations, unit bid price books, or other reputable resources may serve as supporting information.`,
    ]),
    pick([
      `The file can also provide other descriptive information, such as trends that affect item costs, costs from similar past projects, and external factors that limit construction operations.`,
      `Other descriptive material—cost trends for individual items, results from comparable past projects, and external factors limiting construction operations—may also be added to the file.`,
    ]),
  ]);

  const p4 = para([
    pick([
      `Good documentation supports the credibility of the cost estimate, aids in the analysis of changes in project cost, and enables reviewers to assess the construction estimate effectively.`,
      `Sound documentation lends credibility to the cost estimate, simplifies the analysis of cost changes, and allows reviewers to evaluate the construction estimate with confidence.`,
    ]),
    pick([
      `It also contributes to the collection of information for estimating the cost of future projects.`,
      `It further builds the body of information available for estimating the cost of future projects.`,
    ]),
    pick([
      `Each project's construction cost estimate will then be a well-documented history of the assumptions, methods, and procedures used to estimate the costs associated with the project's specific scope of work.`,
      `In this way each construction cost estimate becomes a documented history of the assumptions, methods, and procedures behind the costs for the project's specific scope of work.`,
    ]),
  ]);

  const p5 = [
    pick([
      `At each project development milestone, the level of information must be documented regarding how the estimated cost was obtained to allow an independent reviewer to determine whether the estimate is complete, accurate, and realistic.`,
      `At every development milestone, the basis of the estimated cost must be recorded in sufficient detail for an independent reviewer to determine whether the estimate is complete, accurate, and realistic.`,
    ]),
    pick([
      `The following information should be provided at each milestone:`,
      `As a minimum, the following information should be furnished at each milestone:`,
    ]),
  ].join(" ");

  // middle-paragraph count shrinks as the fragment grows (page stays 1pp)
  const middles = [p1, p2, p3, p4];
  let nMid;
  if (nRows === 1) nMid = fs > 1.0 ? 3 : 4;
  else if (nRows === 2) nMid = fs > 1.0 ? 2 : 3;
  else nMid = 2;
  while (middles.length > nMid) middles.splice(1 + Math.floor(rng() * (middles.length - 2)), 1);

  // ---------- html ----------
  const fragRows = rowsData
    .map((r) => {
      const bh = r.bullets
        .map((b) => `<div class="b"><span class="bm">•</span><span>${b}</span></div>`)
        .join("\n      ");
      return `<tr>\n      <td class="lbl">${r.label}</td>\n      <td class="proc"><div>${r.intro}</div>\n      ${bh}</td>\n    </tr>`;
    })
    .join("\n    ");

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: Letter; margin: 0; }
  html, body { margin: 0; padding: 0; }
  body { width: 216mm; height: 278mm; position: relative; color: #000;
         font-family: "Times New Roman", Times, serif; font-size: ${pt(11)}; }
  .page { padding: ${padT.toFixed(1)}mm ${padR.toFixed(1)}mm 0 ${padL.toFixed(1)}mm; }
  .cont { text-align: right; font-style: italic; font-size: ${pt(9)}; margin-bottom: 1.2mm; }
  table.frag { border-collapse: separate; border-spacing: ${hSp.toFixed(1)}px ${vSp.toFixed(1)}px;
               width: calc(100% - 3mm); margin-left: 1.5mm; }
  table.frag td { background: ${fill}; border: none; font-size: ${pt(10.5)};
                  line-height: ${lh.toFixed(2)}; padding: 4pt 7pt; }
  td.lbl { width: ${lblW}%; vertical-align: middle; }
  td.proc { vertical-align: top; }
  .b { display: flex; margin-left: 3pt; }
  .bm { flex: none; width: 13pt; padding-left: 2pt; }
  h2 { font-family: Arial, Helvetica, sans-serif; font-size: ${pt(12.5)};
       font-weight: bold; margin: ${(7 + rng() * 3).toFixed(1)}mm 0 3mm; }
  h3 { font-family: Arial, Helvetica, sans-serif; font-size: ${pt(11)};
       font-weight: bold; margin: 4mm 0 1.8mm; }
  p { margin: 0 0 ${(2.6 + rng() * 0.8).toFixed(1)}mm; line-height: ${(lh + 0.03).toFixed(2)}; text-align: left; }
  .pgno { position: absolute; bottom: 12mm; left: 0; right: 0;
          text-align: center; font-size: ${pt(11)}; }
  </style></head><body>
  <div class="page">
    ${contNote ? `<div class="cont">(continued)</div>\n    ` : ""}<table class="frag">
    ${fragRows}
    </table>
    <h2>${secNum}&nbsp;&nbsp;${heading}</h2>
    ${middles.map((p) => `<p>${p}</p>`).join("\n    ")}
    <h3>${subhead}</h3>
    <p>${p5}</p>
  </div>
  <div class="pgno">${pageNum}</div>
  </body></html>`;

  // ---------- logical GT: one Nx2 table, no header (continuation fragment) ----------
  const gtRows = rowsData
    .map((r) => `  <tr>\n    <td>${r.label}</td>\n    <td>${r.intro} ${r.bullets.map((b) => `• ${b}`).join(" ")}</td>\n  </tr>`)
    .join("\n");
  const gt = `<table>\n${gtRows}\n</table>`;

  return { html, gt, pageOpts: { format: "Letter" } };
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
