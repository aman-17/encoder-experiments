import { CHART_TYPES } from "./chartlib.mjs";

// Domain registry. Each domain knows how to prompt Gemini for a credible
// single-page document containing one or more tables. Domains are modelled on
// the real documents in tables_extended / tableZoo (10-K/10-Q financials,
// insurance rate filings, mortgage rate sheets, transit timetables, etc.).

// Shared rules appended to every domain prompt so the JSON stays renderable and
// the ground truth stays exact.
const COMMON_RULES = [
    "Output strictly matches the provided JSON schema.",
    "Cell text must be the EXACT string that should appear in the rendered document, including currency symbols, thousands separators, %, units, and parentheses for negatives. Do not add explanations inside cells.",
    "Numbers must be plausible and internally consistent (totals roughly add up, sequences trend believably).",
    "Use real-sounding but fictional names for companies, people, places, products. Do not use real trademarks.",
    "Some cells may be empty strings where a real document would leave a blank.",
    "HIERARCHY: for tables with nested line items (financial statements, balance sheets, budgets, account or category breakdowns), you MAY indent sub-rows by starting their FIRST-column text with leading spaces — 2 spaces per nesting level (e.g. a parent 'Current Assets' row, then '  Cash' and '  Investments' beneath it). Use real spaces, only in the first column, and only where a real document nests line items.",
    "Every body row must have exactly as many cells as there are headers (no ragged rows).",
    "If columnGroups is used, the sum of their spans must equal the number of headers; otherwise return an empty columnGroups array. Same rule for superGroups (a higher tier over the columnGroups).",
    "Keep headers short. Keep within the requested number of columns and rows.",
    `CHART: if a single chart would naturally illustrate THIS page's data, set chartType to the ONE most appropriate type from: ${CHART_TYPES.join(", ")} (e.g. trends->line/area, composition->pie/donut/stackedBar, comparison->bar/groupedBar, correlation->scatter, KPI->gauge, a bridge->waterfall, a stage drop-off->funnel). Otherwise set chartType to "" (empty).`,
    "INLINE MARKUP: actively use these inline tags inside cell text AND paragraphs, the way a real richly-formatted document does — not just sparingly. <strong> for key terms, defined terms on first use, figures/totals, names, and Total rows; <em> for notes, emphasis, publication/case/ship names, foreign phrases, and 'continued'; <u> occasionally for a key reference or defined term; <s> for STRIKETHROUGH but RARELY — AT MOST one or two per document, and ONLY on a value being corrected (old number struck right before the new one, e.g. <s>$120.00</s> $98.00) or a single void/superseded line. NEVER strike a product name, category, label, or an ordinary cell, and never strike many cells in one table; <sup> for footnote markers (Revenue<sup>1</sup>), exponents (km<sup>2</sup>), ordinals (1<sup>st</sup>); <sub> for chemical formulas (CO<sub>2</sub>); <br/> for a hard line break inside a cell. Aim for several bold/italic/underline spans per page where natural, plus the occasional strikethrough. LINKS: include occasional <a href=\"https://...\">link text</a> or <a href=\"mailto:...\">email</a> where a real document links — e.g. a source URL, a reference, a contact email, a 'see Appendix' cross-reference, a website in a footer or contact block. Use only http(s):// or mailto: hrefs. Do NOT use any other HTML tags or markdown.",
].join("\n");

function structHint({ cols, rows, wantTitle, wantGroups }) {
    const lines = [
        `Target shape: about ${cols} columns and ${rows} body rows.`,
        wantTitle
            ? "Include a single spanning title row for the table (set table.title to a short heading that spans all columns)."
            : "Leave table.title as an empty string.",
        wantGroups
            ? "Include a second-level grouped header: populate columnGroups so related columns sit under a shared label (spans summing to the column count)."
            : "Leave columnGroups as an empty array.",
    ];
    return lines.join("\n");
}

const DOMAINS = [
    {
        key: "financial_statement",
        weight: 4,
        title: "corporate financial statement",
        instruction:
            "Generate a page from a public company's 10-K/10-Q filing: an income statement, cash-flow statement, or equity rollforward. The first column holds line items (e.g. 'Net revenues', 'Provision for credit losses', 'Total operating expenses'). Money columns are periods (quarters/years). Prefix monetary values with a currency symbol on the first row of a block, use parentheses for negatives and subtotal/Total rows.",
    },
    {
        key: "balance_sheet",
        weight: 3,
        title: "balance sheet",
        instruction:
            "Generate a balance sheet page. First column = line items grouped into Assets / Liabilities / Equity sections (use a spanning section row or bold-ish label rows). Two period columns of dollar amounts with thousands separators.",
    },
    {
        key: "rate_sheet",
        weight: 3,
        title: "mortgage/loan rate sheet",
        instruction:
            "Generate a lender daily rate sheet. First column = a base interest rate descending in 0.125 steps (e.g. 8.000, 7.875, ...). Remaining columns = price/points by lock period (21/30/45/60 Day) as 3-decimal numbers around 100. Include a short product label.",
    },
    {
        key: "insurance_schedule",
        weight: 3,
        title: "insurance rate / premium schedule",
        instruction:
            "Generate an insurance rate filing table (SERFF style). First column = Policy Year or Issue Age in sequence. Remaining columns = premiums for different riders or plans as dollar amounts ($X.XX). Values may step over the years.",
    },
    {
        key: "timetable",
        weight: 2,
        title: "transit timetable",
        instruction:
            "Generate a transit/transport timetable. Use a spanning title row for the route/direction. First column = a trip note or train/service id; remaining columns = stop/station names with HH:MM departure times across the row.",
        forceTitle: true,
    },
    {
        key: "price_list",
        weight: 2,
        title: "product price list / invoice",
        instruction:
            "Generate a product price list or invoice line-item table: columns like Item/SKU, Description, Qty, Unit Price, Amount. Money with currency symbol. Optionally a Total row.",
    },
    {
        key: "statistics",
        weight: 3,
        title: "government/statistical report",
        instruction:
            "Generate a statistical report table (BLS/Census style). First column = categories (industries, age bands, regions). Remaining columns = counts and percentages across years. Mix integers with thousands separators and percentages.",
    },
    {
        key: "comparison",
        weight: 2,
        title: "product/plan comparison",
        instruction:
            "Generate a plan or product comparison table. First column = features/attributes; remaining columns = plans/tiers/products with values, prices, or Yes/No/— entries.",
    },
    {
        key: "roster",
        weight: 2,
        title: "roster / directory",
        instruction:
            "Generate a roster or directory table: columns like Name, Role/Title, Department, Location, Start Date, Status. Plausible fictional people and dates.",
    },
    {
        key: "scientific",
        weight: 1,
        title: "scientific/lab results",
        instruction:
            "Generate a scientific results table: a sample/condition column plus measurement columns with units (mg/L, °C, %, ±). Decimal values with consistent precision.",
    },
    {
        key: "invoice",
        weight: 3,
        title: "commercial invoice",
        instruction:
            "Generate a commercial invoice: a seller and buyer, an invoice number and date, then a line-item table (Description, Qty, Unit Price, Tax %, Amount) and a totals block (Subtotal, Tax, Total Due). Money with the setting's currency symbol; use <strong> on the Total Due.",
    },
    {
        key: "scientific_paper",
        weight: 2,
        title: "academic / scientific paper",
        instruction:
            "Generate one page of an academic paper: a paper title, an Abstract paragraph, then a Results section with a measurement table (mean ± SD, p-values, units using <sup>/<sub> like cm<sup>2</sup>, CO<sub>2</sub>) plus two dense paragraphs containing inline citations like [1], [2]. Reads like a journal article.",
    },
    {
        key: "timesheet",
        weight: 3,
        wide: true,
        title: "employee time-tracking sheet",
        instruction:
            "Generate an employee time-tracking / labor allocation sheet: leading columns for employee name and role or ID, then MANY columns (one per day of a pay period or per week) of hours worked, plus a per-row Total Hours. MANY employee rows. This is a big wide table.",
    },
    {
        key: "earnings_deck",
        weight: 2,
        wide: true,
        title: "earnings presentation slide",
        instruction:
            "Generate ONE slide from a quarterly earnings presentation (landscape slide): a big slide title, 2-3 bold takeaway bullets, and a KPI / financial-highlights table with period columns (e.g. Q1-Q4 or YoY) and metric rows (Revenue, EBITDA, Margin, EPS, FCF). Keep prose minimal — it's a slide.",
    },
    {
        key: "report",
        weight: 3,
        title: "operational / management report",
        instruction:
            "Generate a management or operational report page: a title, a few paragraphs of analysis, and a supporting summary table (metrics by category/period). Reads like an internal business report.",
    },
    {
        key: "financial_notes",
        weight: 2,
        title: "notes to the financial statements",
        instruction:
            "Generate a 'Notes to the Financial Statements' page (e.g. Note 7 — Property, Plant & Equipment, or Note 12 — Borrowings): a numbered note heading, explanatory prose, and a reconciliation table (opening balance, additions, disposals, depreciation, closing balance) in currency, with parentheses for deductions.",
    },
    {
        key: "purchase_order",
        weight: 2,
        title: "purchase order",
        instruction:
            "Generate a purchase order: PO number, vendor and ship-to blocks, order date, and a line-item table (Line, Part No., Description, Qty, Unit, Unit Price, Extended) with a totals block. Money in the setting's currency.",
    },
    {
        key: "bank_statement",
        weight: 3,
        wide: true,
        title: "bank account statement",
        instruction:
            "Generate a bank account statement: account header, statement period, opening/closing balance, and a long transactions table (Date, Description, Reference, Debit, Credit, Balance). Many rows; running balance should trend believably.",
    },
    {
        key: "payslip",
        weight: 2,
        title: "payslip / pay stub",
        instruction:
            "Generate a payslip: employee and employer blocks, pay period, then earnings rows (basic, overtime, allowances) and deductions rows (tax, pension, insurance), with Gross, Total Deductions and Net Pay. Money with the setting's currency.",
    },
    {
        key: "tax_return",
        weight: 2,
        title: "tax return / assessment form",
        instruction:
            "Generate a page of a tax return or assessment: numbered line items (e.g. 'Line 12 — Taxable interest') with box references and amounts, subtotals and a tax-due/refund line. Formal government-form tone.",
    },
    {
        key: "cap_table",
        weight: 2,
        wide: true,
        title: "capitalization table",
        instruction:
            "Generate a startup capitalization table: shareholders/instruments as rows, columns for Shares, Share Class, Investment, Price/Share, Ownership %, Fully-Diluted %. Totals row. Plausible names and round figures.",
    },
    {
        key: "amortization_schedule",
        weight: 2,
        wide: true,
        title: "loan amortization schedule",
        instruction:
            "Generate a loan amortization schedule: one row per payment period (Period, Payment Date, Payment, Principal, Interest, Balance). The balance amortizes to ~0; principal rises and interest falls each period. Many rows.",
    },
    {
        key: "bill_of_materials",
        weight: 2,
        wide: true,
        title: "bill of materials (BOM)",
        instruction:
            "Generate an engineering bill of materials: Item, Part Number, Description, Material, Qty, Unit, Unit Cost, Extended Cost, Supplier. Realistic component descriptions for a product assembly. Many rows; a total cost.",
    },
    {
        key: "inventory_report",
        weight: 2,
        wide: true,
        title: "inventory / stock report",
        instruction:
            "Generate a warehouse inventory report: SKU, Description, Category, Location/Bin, On Hand, Reserved, Available, Reorder Point, Unit Cost, Stock Value. Many rows.",
    },
    {
        key: "shipping_manifest",
        weight: 2,
        wide: true,
        title: "shipping manifest / packing list",
        instruction:
            "Generate a shipping manifest / packing list: shipment header (carrier, tracking, origin/destination), then a table of Package, Contents, Qty, Weight, Dimensions, HS Code, Declared Value.",
    },
    {
        key: "lab_report",
        weight: 2,
        title: "clinical / medical lab report",
        instruction:
            "Generate a clinical laboratory report: patient/specimen header, then a results table (Test, Result, Units, Reference Range, Flag) — e.g. Hemoglobin, WBC, Glucose, Cholesterol — with H/L flags where out of range. Use proper units.",
    },
    {
        key: "nutrition_panel",
        weight: 1,
        title: "nutrition facts / product label",
        instruction:
            "Generate a product nutrition facts panel: serving size header, then nutrient rows (Calories, Total Fat, Saturated Fat, Sodium, Carbohydrate, Sugars, Protein, vitamins) with amounts and % Daily Value. Plus a short ingredients sentence.",
    },
    {
        key: "real_estate_listing",
        weight: 2,
        title: "real-estate listing / property summary",
        instruction:
            "Generate a property listing summary: address and headline, a description paragraph, and a features table (Bedrooms, Bathrooms, Floor Area, Lot Size, Year Built, Price, Council Rates, Parking). Currency per setting.",
    },
    {
        key: "utility_bill",
        weight: 2,
        title: "utility bill",
        instruction:
            "Generate a utility bill (electricity/water/gas): account and service-address header, billing period, a usage/charges table (Description, Usage, Rate, Amount — e.g. supply charge, peak/off-peak kWh, taxes) and an Amount Due with due date.",
    },
    {
        key: "expense_report",
        weight: 2,
        wide: true,
        title: "expense report",
        instruction:
            "Generate an employee expense report: claimant header, then expense lines (Date, Category, Merchant, Description, Amount, Tax, Reimbursable) with a total. Categories like Airfare, Lodging, Meals, Ground Transport.",
    },
    {
        key: "budget",
        weight: 2,
        wide: true,
        title: "departmental budget",
        instruction:
            "Generate a departmental budget vs actual: line items as rows, columns for Budget, Actual, Variance, Variance %, and maybe Prior Year. Section groupings (Personnel, Operations, Capital) with subtotals.",
    },
    {
        key: "sales_report",
        weight: 2,
        wide: true,
        title: "sales report",
        instruction:
            "Generate a sales report by region or product: rows of regions/products, columns for Units, Gross Sales, Discounts, Net Sales, Margin %, YoY % across the period. Totals row.",
    },
    {
        key: "survey_results",
        weight: 2,
        title: "survey / poll results",
        instruction:
            "Generate a survey results page: a short methodology paragraph (sample size, dates), then a results table (Question/Option, Responses, Percentage, and maybe a breakdown column). Percentages per question sum sensibly.",
    },
    {
        key: "standings",
        weight: 2,
        title: "league standings / ranking table",
        instruction:
            "Generate a sports league standings table: Rank, Team/Competitor, Played, Won, Drawn, Lost, For, Against, Goal/Point Difference, Points. Internally consistent (Played = W+D+L). Fictional team names.",
    },
    {
        key: "transcript",
        weight: 2,
        title: "academic transcript / grade report",
        instruction:
            "Generate an academic transcript: student header, then course rows (Course Code, Course Title, Term, Credits, Grade, Grade Points) with a GPA / credits-earned summary. Plausible course titles.",
    },
    {
        key: "menu",
        weight: 1,
        title: "restaurant / cafe menu",
        instruction:
            "Generate a menu: section headings (Starters, Mains, Desserts, Drinks) with item rows (Dish, short description, Price). Prices in the setting's currency. Reads like a real menu.",
    },
    {
        key: "meeting_minutes",
        weight: 2,
        title: "meeting minutes",
        instruction:
            "Generate meeting minutes: meeting header (date, attendees), narrative of discussion points, and an action-items table (Item, Action, Owner, Due Date, Status). Reads like real corporate minutes.",
    },
    {
        key: "risk_register",
        weight: 2,
        wide: true,
        title: "risk register",
        instruction:
            "Generate a project/enterprise risk register: Risk ID, Description, Category, Likelihood, Impact, Risk Score, Owner, Mitigation, Status. Likelihood/Impact as Low/Medium/High or 1-5; score consistent.",
    },
    {
        key: "datasheet",
        weight: 2,
        title: "product specification / datasheet",
        instruction:
            "Generate a product datasheet: product name and intro, then a specifications table (Parameter, Min, Typ, Max, Unit, Conditions) — e.g. for an electronic component or appliance. Technical, with units.",
    },
    {
        key: "portfolio_holdings",
        weight: 2,
        wide: true,
        title: "investment portfolio holdings",
        instruction:
            "Generate an investment portfolio holdings statement: rows of securities, columns for Ticker, Asset Class, Quantity, Price, Market Value, Cost Basis, Unrealized Gain, Weight %. Totals row.",
    },
    {
        key: "depreciation_schedule",
        weight: 2,
        wide: true,
        title: "fixed-asset depreciation schedule",
        instruction:
            "Generate a fixed-asset depreciation schedule: Asset, Acquired Date, Cost, Method, Useful Life, Rate, Accumulated Depreciation, Net Book Value. Many asset rows; a total.",
    },
    {
        key: "census_table",
        weight: 1,
        wide: true,
        title: "census / demographic table",
        instruction:
            "Generate a census or demographic statistics table: rows of regions/age-bands/categories, columns for counts and percentages across two periods, with totals. Government-statistics tone.",
    },
    {
        key: "medical_lab_results",
        weight: 2,
        title: "clinical laboratory results report",
        instruction:
            "Generate a patient clinical laboratory report: a short header (patient/specimen/collected line, no real personal data), then a results table with rows of analytes (e.g. Hemoglobin, WBC, Sodium, Creatinine, TSH, LDL) and columns for Result, Reference Range, Units, and a Flag (H/L/—). Group rows under panel subheaders (Hematology, Chemistry, Lipids). Clinical tone.",
    },
    {
        key: "prescription",
        weight: 2,
        title: "prescription / medication list",
        instruction:
            "Generate a medication list / discharge prescription: rows of drugs with columns for Medication (name + strength), Dose, Route, Frequency, Quantity, Refills. Realistic drug names and sig (e.g. '1 tab PO BID'). Add a prescriber/pharmacy footer line.",
    },
    {
        key: "work_order",
        weight: 2,
        title: "maintenance work order",
        instruction:
            "Generate a maintenance / field-service work order: a header block (WO number, asset, site, priority), then a line-items table of tasks/parts with columns for Description, Part No., Qty, Unit Cost, Labor Hrs, Line Total, and a totals row. Add a sign-off line.",
    },
    {
        key: "gradebook",
        weight: 2,
        wide: true,
        title: "course gradebook",
        instruction:
            "Generate an instructor's gradebook: rows of students (use plausible names, no real people), leading columns for Student and ID, then MANY assessment columns (quizzes, homework, midterm, final) as scores, plus a Weighted Total and Letter Grade. MANY rows.",
    },
    {
        key: "attendance_register",
        weight: 1,
        wide: true,
        title: "attendance register",
        instruction:
            "Generate an attendance register: rows of people, leading Name/ID columns, then one column per day (or session) with P/A/L marks, and summary columns for Present, Absent, Late and Attendance %. MANY day columns.",
    },
    {
        key: "travel_itinerary",
        weight: 2,
        title: "travel itinerary",
        instruction:
            "Generate a multi-leg travel itinerary: rows of segments (flights/trains) with columns for Date, Carrier/Flight, From, To, Depart, Arrive, Seat/Class, Status. Add a booking reference header and a fare/total footer.",
    },
    {
        key: "hotel_folio",
        weight: 2,
        title: "hotel guest folio",
        instruction:
            "Generate a hotel guest folio / invoice: a header (folio no, guest, room, arrival/departure), then a transactions table with columns Date, Description (Room Charge, Tax, F&B, Parking, Minibar), Charges, Credits, Balance — running balance down the page, ending in a Balance Due row.",
    },
    {
        key: "receipt",
        weight: 2,
        title: "retail purchase receipt",
        instruction:
            "Generate a retail store receipt: store header, then an items table with Item, Qty, Unit Price, Amount; then Subtotal, Tax, Total, Tender and Change rows. Include a short barcode-ish reference and a thank-you footer. Compact, narrow.",
    },
    {
        key: "parts_catalog",
        weight: 2,
        title: "parts / components catalog",
        instruction:
            "Generate a page from an industrial parts catalog: rows of components with columns for Part No., Description, Specification, Material, Unit, List Price, Stock. Group rows under category subheaders (e.g. Fasteners, Bearings, Seals). Engineering tone with realistic part numbers.",
    },
    {
        key: "legal_contract",
        weight: 2,
        title: "contract / terms schedule",
        instruction:
            "Generate one page of a commercial contract schedule: numbered clauses or a terms table with columns like Clause, Description, Party Responsible, Effective Date. Include defined terms and section numbering (1.1, 1.2, 2.1). Formal legal register. Some surrounding clause paragraphs.",
    },
    {
        key: "patent",
        weight: 1,
        title: "patent claims / specification",
        instruction:
            "Generate a page of a patent: a title, abstract paragraph, then numbered claims (independent + dependent, 'The apparatus of claim 1, wherein...'), and optionally a small table of reference numerals (Ref / Component). Patent-office register.",
    },
    {
        key: "bibliography",
        weight: 1,
        title: "references / bibliography",
        instruction:
            "Generate a references/bibliography page or a citation table: rows of sources with columns for [#], Authors, Year, Title, Source/Journal, DOI/Pages. Academic citation style, realistic-looking but fictional references.",
    },
    {
        key: "staff_directory",
        weight: 2,
        title: "staff directory",
        instruction:
            "Generate an organizational staff directory: rows of employees (fictional) with columns for Name, Title, Department, Email, Phone, Location. Group rows under department subheaders. Corporate intranet tone.",
    },
    {
        key: "general_ledger",
        weight: 2,
        wide: true,
        title: "general ledger / journal",
        instruction:
            "Generate an accounting general-ledger or journal page: rows of postings with columns for Date, Entry/Ref, Account, Description, Debit, Credit, Balance. Debits and credits in separate columns, a running balance, and a period Totals row where total debits equal total credits.",
    },
    {
        key: "trial_balance",
        weight: 1,
        title: "trial balance",
        instruction:
            "Generate an accounting trial balance: rows of ledger accounts with columns for Account No., Account Name, Debit, Credit. Group under Assets/Liabilities/Equity/Income/Expenses. A Totals row where total debits equal total credits.",
    },
    {
        key: "aging_report",
        weight: 2,
        wide: true,
        title: "accounts receivable aging",
        instruction:
            "Generate an accounts-receivable aging report: rows of customers/invoices with columns for Customer, Invoice, Total, Current, 1-30, 31-60, 61-90, 90+ days, where the bucket columns sum to the total. A Totals row. Finance/collections tone.",
    },
    {
        key: "mortgage_statement",
        weight: 2,
        title: "loan / mortgage statement",
        instruction:
            "Generate a monthly mortgage/loan statement: a header (account, principal balance, rate, due date), then a payment-breakdown table (Principal, Interest, Escrow, Fees) and a recent-activity table with columns Date, Description, Amount, Balance. Consumer-finance tone.",
    },
    {
        key: "production_schedule",
        weight: 1,
        wide: true,
        title: "production schedule",
        instruction:
            "Generate a manufacturing production schedule: rows of work orders/products with columns for Order, Product, Line, Qty, Start, Due, Status, and several weekly/daily output columns. Operations/planning tone.",
    },
    {
        key: "inspection_checklist",
        weight: 2,
        title: "inspection / QA checklist",
        instruction:
            "Generate a quality/safety inspection checklist: rows of check items with columns for Item No., Inspection Point, Acceptance Criteria, Result (Pass/Fail/N/A), Notes. Group under sections. Add inspector/date sign-off. Use a few <strong> Pass/Fail marks.",
    },
    {
        key: "commission_statement",
        weight: 1,
        title: "sales commission statement",
        instruction:
            "Generate a sales commission statement: rows of deals/accounts with columns for Account, Deal Value, Rate %, Commission, Status, Paid Date. Group by rep or period, with subtotals and a total commission row.",
    },
    {
        key: "bill_of_lading",
        weight: 2,
        wide: true,
        title: "bill of lading / freight waybill",
        instruction:
            "Generate a freight bill of lading: a header block (BOL number, carrier, ship-from / ship-to addresses, dates), then a line-items table of shipped goods with columns for Item No., Description, HazMat, Pkg Type, Qty, Weight (kg), Class, Freight Charge, and a totals row (total packages, total weight, total charges). Add carrier/shipper signature lines.",
    },
    {
        key: "report_card",
        weight: 2,
        title: "school report card",
        instruction:
            "Generate a K-12 school report card: a student/term header (name, grade, homeroom, term), then a subjects table with columns for Subject, Teacher, Grade (letter), Mark (%), Effort, Comment, plus a GPA/average row. Group by term or subject area. Add an attendance summary and a teacher remark line.",
    },
    {
        key: "immunization_record",
        weight: 1,
        title: "immunization / vaccination record",
        instruction:
            "Generate a patient immunization record: a short patient header (no real personal data), then a vaccination table with columns for Vaccine, Date Administered, Dose #, Manufacturer, Lot No., Site, Administered By. Group rows under vaccine series (e.g. Childhood, Travel, Annual). Clinical tone.",
    },
    {
        key: "donation_receipt",
        weight: 1,
        title: "charitable donation receipt",
        instruction:
            "Generate a nonprofit charitable donation receipt: a donor/org header (receipt no., tax ID, fiscal year), then a gifts table with columns for Date, Fund/Campaign, Description, Method, Amount, Tax-Deductible, and a total contributions row. Add a tax-acknowledgement statement and an authorized-signature line.",
    },
    {
        key: "benefits_enrollment",
        weight: 1,
        wide: true,
        title: "employee benefits enrollment",
        instruction:
            "Generate an HR benefits enrollment summary: an employee header (name, ID, plan year, effective date), then a benefits table with columns for Plan, Coverage Tier, Provider, Employee Cost, Employer Cost, Total Premium, Status, plus a totals row. Group by category (Medical, Dental, Vision, Retirement, Other). Add an enrollment-confirmation note.",
    },
    {
        key: "packing_slip",
        weight: 2,
        title: "shipment packing slip",
        instruction:
            "Generate a warehouse packing slip: a header (order no., ship-to, carrier, ship date), then a line-items table with columns for Line, SKU, Description, Qty Ordered, Qty Shipped, Qty Backordered, Carton. Group by carton/box. Add a total-units row and a packed-by / checked-by sign-off. No prices (this is a packing slip, not an invoice).",
    },
    {
        key: "course_syllabus",
        weight: 2,
        title: "course syllabus",
        instruction:
            "Generate a university course syllabus: a header (course code, title, term, instructor, credits), a short description, then a weekly schedule table with columns for Week, Date, Topic, Readings, Assignment/Assessment, Weight (%). Add a grading-breakdown mini-summary whose weights sum to 100%.",
    },
    {
        key: "grant_budget",
        weight: 1,
        title: "grant / research budget",
        instruction:
            "Generate a research/nonprofit grant budget: a header (grant title, funder, award period, PI), then a budget table with columns for Category, Line Item, Year 1, Year 2, Total, Notes. Group by category (Personnel, Equipment, Travel, Indirect/Overhead, Other) with subtotals and a grand-total row.",
    },
    {
        key: "customs_declaration",
        weight: 1,
        wide: true,
        title: "customs declaration / commercial invoice",
        instruction:
            "Generate a customs commercial-invoice / declaration: a header (exporter, importer, Incoterms, country of origin/destination), then a goods table with columns for Item, Description, HS Code, Origin, Qty, Unit Value, Total Value, Duty Rate %, and a totals row (total value, total duty). Add declaration/signature lines.",
    },
    {
        key: "safety_data_sheet",
        weight: 1,
        title: "safety data sheet (SDS)",
        instruction:
            "Generate a chemical Safety Data Sheet (SDS) page: product/manufacturer header, then a composition/hazard table with columns for Component, CAS No., Concentration %, Hazard Class, Exposure Limit, plus rows of GHS hazard statements. Use section subheaders (Composition, Hazards, First-Aid, Handling). Technical regulatory tone; fictional substances.",
    },
    {
        key: "event_agenda",
        weight: 1,
        title: "conference / event agenda",
        instruction:
            "Generate a conference or event agenda: a header (event name, date, venue), then a schedule table with columns for Time, Session, Speaker, Room/Track, Duration. Group rows by day or track with section subheaders (Morning, Afternoon, Keynotes). Add a short welcome note and a registration/contact line.",
    },
    {
        key: "maintenance_log",
        weight: 1,
        title: "equipment / fleet maintenance log",
        instruction:
            "Generate an equipment or vehicle maintenance log: an asset header (unit ID, model, serial/VIN), then a service-history table with columns for Date, Odometer/Hours, Service Type, Parts Used, Labor Hrs, Cost, Technician. Group by service category (Routine, Repairs, Inspections) with a total-cost row.",
    },
    {
        key: "comparative_market_analysis",
        weight: 1,
        wide: true,
        title: "real-estate comparative market analysis",
        instruction:
            "Generate a real-estate comparative market analysis (CMA): a subject-property header, then a comparable-properties table with columns for Address, Beds, Baths, Sq Ft, Year, Sale Price, $/Sq Ft, Sold Date, Adjustment. Include the subject row plus 4-8 comps, an average/median row, and an estimated-value note.",
    },
    {
        key: "warranty_card",
        weight: 1,
        title: "product warranty / registration card",
        instruction:
            "Generate a product warranty registration / coverage card: a header (product, model, serial, purchase date), then a coverage table with columns for Component, Coverage Type, Term, Start Date, Expiry, Status. Add warranty terms, a registration confirmation, and a support contact line.",
    },
    {
        key: "rent_roll",
        weight: 1,
        title: "property rent roll",
        instruction:
            "Generate a property management rent roll: a building/portfolio header, then a table with columns for Unit, Tenant, Type (e.g. 1BR/2BR/Retail), Sq Ft, Lease Start, Lease End, Monthly Rent, Deposit, Status (Occupied/Vacant/Notice). Include 10-20 units, a totals row (total rent, occupancy %), and a short note on vacancies or scheduled renewals.",
    },
    {
        key: "quote",
        weight: 1,
        title: "price quotation / RFQ response",
        instruction:
            "Generate a sales quotation (or RFQ response): a seller and a prospective buyer, a quote number, issue date and a 'valid until' date, then a line-item table (Item/SKU, Description, Qty, Unit Price, Discount, Line Total) and a totals block (Subtotal, Discount, Tax, Quoted Total). Add validity terms and a note that it is NOT an invoice. Use the setting's currency.",
    },
    {
        key: "payroll_register",
        weight: 1,
        title: "payroll register (multi-employee)",
        wide: true,
        instruction:
            "Generate a company payroll register for one pay period (MANY employees, one row each): columns for Employee, ID, Dept, Hours, Gross Pay, then several deduction columns (Tax, Social/Pension, Health, Other) and Net Pay. Include 12-25 employees, department subtotals or a grand-total row, and a pay-date/period header. This is a wide numeric register, not a single payslip.",
    },
    {
        key: "calibration_certificate",
        weight: 1,
        title: "instrument calibration certificate",
        instruction:
            "Generate an instrument calibration certificate: a header (instrument, model, serial, calibration date, due date, standard used, ambient conditions), then a measurements table with columns for Parameter / Test Point, Nominal, As-Found, As-Left, Tolerance, Uncertainty, Pass/Fail. Add a conformance statement, technician sign-off, and a traceability note.",
    },
    {
        key: "explanation_of_benefits",
        weight: 1,
        title: "insurance explanation of benefits (EOB)",
        instruction:
            "Generate a health-insurance Explanation of Benefits (EOB) — NOT a bill: a member/claim header (member, claim no., provider, service dates), then a claims table with columns for Service / CPT, Date, Billed Amount, Allowed Amount, Plan Paid, Deductible, Copay/Coinsurance, Patient Responsibility, and reason codes. Include a totals row and a short plain-language summary of what the patient owes.",
    },
];

const TOTAL_WEIGHT = DOMAINS.reduce((s, d) => s + d.weight, 0);

// ---- Per-document "flavor": era, industry, region, currency, naming style ---
// Injected so Gemini stops defaulting every doc to a 2024/2025 tech company.

const INDUSTRIES = [
    "shipbuilding", "biotechnology", "specialty retail", "copper mining", "regional water utility",
    "commercial airline", "property & casualty insurance", "fixed-line telecom", "agricultural cooperative",
    "hospitality & lodging", "semiconductor foundry", "third-party logistics", "generic pharmaceuticals",
    "public university system", "municipal transit authority", "commercial real estate trust",
    "offshore oil & gas", "automotive components", "apparel & footwear", "packaged foods", "asset management",
    "wind & solar power", "medical devices", "forestry & paper", "aerospace & defense", "consumer electronics",
    "freight rail", "textile mill", "craft brewing", "cloud data centers", "fishing & seafood", "cement & aggregates",
];

const REGIONS = [
    { r: "the United States", cur: "US dollars ($)", suf: ["Inc.", "Corp.", "LLC", "Co."] },
    { r: "the United Kingdom", cur: "pounds sterling (£)", suf: ["PLC", "Ltd."] },
    { r: "Germany", cur: "euros (€)", suf: ["GmbH", "AG"] },
    { r: "Italy", cur: "euros (€)", suf: ["S.p.A.", "S.r.l."] },
    { r: "France", cur: "euros (€)", suf: ["SA", "SAS"] },
    { r: "Japan", cur: "yen (¥)", suf: ["K.K.", "Co., Ltd."] },
    { r: "Canada", cur: "Canadian dollars (C$)", suf: ["Inc.", "Ltd."] },
    { r: "Australia", cur: "Australian dollars (A$)", suf: ["Pty Ltd", "Ltd."] },
    { r: "India", cur: "rupees (₹)", suf: ["Pvt Ltd", "Limited"] },
    { r: "Brazil", cur: "reais (R$)", suf: ["S.A.", "Ltda."] },
    { r: "Switzerland", cur: "Swiss francs (CHF)", suf: ["AG", "SA"] },
    { r: "Sweden", cur: "kronor (kr)", suf: ["AB", "Oyj"] },
    { r: "Mexico", cur: "pesos (MX$)", suf: ["S.A. de C.V."] },
    { r: "South Africa", cur: "rand (R)", suf: ["Ltd.", "(Pty) Ltd"] },
];

const MONTHS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const LANGUAGE_MIXES = {
    english: [["English", 1]],
    diverse: [
        ["English", 30],
        ["French", 10],
        ["Spanish", 10],
        ["German", 8],
        ["Italian", 7],
        ["Portuguese", 7],
        ["Dutch", 5],
        ["Swedish", 5],
        ["Polish", 4],
        ["Turkish", 4],
        ["Indonesian", 4],
        ["Hindi", 3],
        ["Japanese", 2],
        ["Korean", 1],
    ],
};

export function pickFlavor(rng, languageMix = "english") {
    const bucket = rng.weighted([[[1994, 2003], 2], [[2004, 2011], 3], [[2012, 2019], 4], [[2020, 2025], 4]]);
    const year = rng.int(bucket[0], bucket[1]);
    const reg = rng.pick(REGIONS);
    const industry = rng.pick(INDUSTRIES);
    const suffix = rng.pick(reg.suf);
    const language = rng.weighted(LANGUAGE_MIXES[languageMix] || LANGUAGE_MIXES.english);
    const mon = rng.pick(MONTHS_FULL);
    const day = rng.int(1, 28);
    const q = rng.int(1, 4);
    const period = rng.pick([
        `fiscal year ${year}`,
        `the fiscal year ended ${mon} ${day}, ${year}`,
        `Q${q} ${year}`,
        `the three months ended ${mon} ${day}, ${year}`,
        `as of ${mon} ${day}, ${year}`,
        `the half-year ended ${mon} 30, ${year}`,
        `calendar year ${year}`,
        `FY${String(year).slice(2)}/${String(year + 1).slice(2)}`,
    ]);
    return { year, region: reg.r, currency: reg.cur, industry, suffix, period, language };
}

function flavorBlock(f) {
    if (!f) {
        return "";
    }
    return [
        "SETTING — use these specifics so this document differs from others:",
        `- Time period: ${f.period}. ALL dates in the prose and table must fit this period and nearby years — do NOT default to 2024/2025.`,
        `- Entity: a fictional ${f.industry} organization based in ${f.region}; give it a distinctive, plausible name ending in "${f.suffix}". Avoid generic names like Zenith, Aetheris, Apex, Nebula, Stellar, Dynamics, Quantum, Vertex.`,
        `- Currency: ${f.currency}.`,
        `- Visible document language: ${f.language || "English"}. Write all visible prose, headings, table headers, table cells, bullets, captions, and footnotes in this language. Keep JSON property names unchanged and keep allowed inline HTML tags as tags.`,
        "",
    ].join("\n");
}

export function pickDomain(rng) {
    // TG_DOMAINS=key1,key2,... restricts generation to an allow-list of domains
    // (weighted among them) — used to bias hard-long runs toward insurance/financial.
    const allow = (process.env.TG_DOMAINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (allow.length) {
        const pool = DOMAINS.filter((d) => allow.includes(d.key));
        if (pool.length) {
            const tw = pool.reduce((a, d) => a + d.weight, 0);
            let rr = rng() * tw;
            for (const d of pool) { rr -= d.weight; if (rr <= 0) { return d; } }
            return pool[0];
        }
    }
    let r = rng() * TOTAL_WEIGHT;
    for (const d of DOMAINS) {
        r -= d.weight;
        if (r <= 0) {
            return d;
        }
    }
    return DOMAINS[0];
}

const MATRIX_MARKERS = {
    check: "a check mark ✓ where the relationship holds, and an EMPTY string \"\" otherwise",
    dot: "a bullet ● where the relationship holds, and an EMPTY string \"\" otherwise",
    cross: "an ✗ where applicable (or sometimes ✓ for the opposite), and an EMPTY string \"\" otherwise",
    plusminus: "a \"+\" or \"−\" (occasionally \"o\") to grade each intersection, with some cells EMPTY",
    yesno: "\"Yes\" / \"No\" (or \"N/A\"), with some cells EMPTY",
    value: "a SHORT value (a small number, a percentage, a currency amount, or a 1-2 letter code), with MANY cells EMPTY",
};

function presentationLayoutPrompt(layout) {
    const map = {
        titleSlide: [
            "Layout: TITLE SLIDE / OPENING PAGE.",
            "This can be the first slide of a deck. Use a broad executive headline, a short subtitle, and a compact proof table only if useful.",
            "Bullets should be minimal or empty.",
        ],
        sectionHeader: [
            "Layout: SECTION DIVIDER.",
            "This is an internal divider slide, not a report page. Use a short section title and one sentence previewing what the next section resolves.",
            "The table should be tiny backup or omitted-like in emphasis, but still present for benchmark ground truth.",
        ],
        titleOnly: [
            "Layout: TITLE-ONLY INTERIOR SLIDE.",
            "Use a strong assertion headline and a subtle KPI/table proof point. This is not a cover page.",
            "Bullets should be empty or at most one short takeaway.",
        ],
        blankCanvas: [
            "Layout: BLANK / FREEFORM WORKING SLIDE.",
            "This is an internal workshop or analysis slide with positioned objects. Use terse labels and working-session language.",
            "Bullets should describe decisions or open questions, not narrative prose.",
        ],
        titleContent: [
            "Layout: TITLE AND CONTENT.",
            "Use a headline that states the takeaway, then 3-4 bullets that support it with specific values.",
            "This should feel like a normal middle slide in a business deck.",
        ],
        twoContent: [
            "Layout: TWO CONTENT COLUMNS.",
            "Write content suitable for a left narrative pane and right data pane: key points, tradeoffs, and a compact table.",
            "Bullets should compare causes, risks, or actions.",
        ],
        comparison: [
            "Layout: COMPARISON.",
            "Frame the slide as current vs prior, option A vs option B, plan vs actual, region vs region, or before vs after.",
            "The table should include comparable categories and at least two numeric comparison columns.",
        ],
        contentCaption: [
            "Layout: CONTENT WITH CAPTION.",
            "Write a short caption-style narrative that explains what the main visual/table proves.",
            "Bullets should be interpretive callouts, not a paragraph broken into bullets.",
        ],
        pictureCaption: [
            "Layout: LARGE VISUAL WITH CAPTION.",
            "Treat the chart/table as the main visual and write caption text that draws out the implication.",
            "Keep labels short and presentation-friendly.",
        ],
        tableFocus: [
            "Layout: TABLE-FOCUS / APPENDIX-LIKE SLIDE.",
            "This is an appendix or data-detail slide in a presentation. The table can carry the slide, but the headline must still state why it matters.",
            "Keep rows compact and use slide-friendly headers.",
        ],
        chartFocus: [
            "Layout: CHART-FOCUS SLIDE.",
            "Write the slide around a trend, distribution, mix shift, funnel, or KPI chart. The headline should state the chart insight.",
            "The support table should provide the chart data.",
        ],
        chartTable: [
            "Layout: CHART AND TABLE.",
            "Use the chart for the main message and the table for backup detail. Headline should connect the two.",
            "Bullets should be sparse and data-backed.",
        ],
        dashboard: [
            "Layout: KPI DASHBOARD.",
            "Write like an executive dashboard: short title, status-oriented subtitle, KPI-friendly rows, and terse watchouts.",
            "The table must include clear KPI values and labels.",
        ],
        roadmap: [
            "Layout: ROADMAP / TIMELINE.",
            "Write a forward-looking slide with milestones, owners, timing, risks, or next steps.",
            "The table should include milestone/status/metric/action fields.",
        ],
        quote: [
            "Layout: QUOTE / BIG-NUMBER SLIDE.",
            "Write one sharp bottom-line statement suitable as a large quote or big-number slide.",
            "The table should provide proof points for that bottom line.",
        ],
        bigNumber: [
            "Layout: BIG-NUMBER PROOF SLIDE.",
            "Lead with one dominant metric or exception and explain why that number changes the decision.",
            "The table should provide compact proof points behind the large metric.",
        ],
        threeCards: [
            "Layout: THREE-CARD SUMMARY.",
            "Write three parallel takeaways that could each sit on a separate tile. Keep them balanced and similarly short.",
            "The table should provide backup detail, not become the main story.",
        ],
        agenda: [
            "Layout: AGENDA / DISCUSSION LIST.",
            "Write like a working-session slide: 4-5 discussion points, decision questions, or review topics.",
            "The table should provide a compact reference for the discussion.",
        ],
        process: [
            "Layout: PROCESS / STEP SEQUENCE.",
            "Write a sequence of milestones, actions, or operating steps with clear ownership or timing cues.",
            "The table should include short milestone/status/metric fields.",
        ],
        splitStatement: [
            "Layout: SPLIT STATEMENT WITH EVIDENCE.",
            "Write one bold strategic assertion for the left side and concise proof points for the right side.",
            "The table should support the assertion with a few clear metrics.",
        ],
        visualLeft: [
            "Layout: VISUAL LEFT, NARRATIVE RIGHT.",
            "The chart/table sits on the left and the right side explains the implication in 2-3 concise tiles.",
            "Keep the headline short enough to sit beside a large visual.",
        ],
        visualRight: [
            "Layout: NARRATIVE LEFT, VISUAL RIGHT.",
            "The narrative sits on the left and the chart/table provides evidence on the right.",
            "Use direct decision language and avoid long descriptive prose.",
        ],
    };
    return (map[layout] || map.titleContent).join("\n");
}

export function buildDocPrompt(domain, { sectionsWanted, cols, rows, wantTitle, wantGroups, complex, dense, extreme, huge, panels, textFocus, complexCells, matrix, matrixMarker, spine, form, flavor, presentation, presentationLayout }) {
    const fl = flavorBlock(flavor);
    if (presentation) {
        return [
            `You are generating fictional content for ONE SINGLE BUSINESS PRESENTATION SLIDE about a ${domain.title}.`,
            fl,
            domain.instruction,
            "",
            "This is NOT a report page. It must read like a polished PowerPoint / Google Slides / Keynote slide for an executive meeting.",
            presentationLayoutPrompt(presentationLayout),
            "",
            "Slide copy rules:",
            "- docTitle: write a short action-oriented slide headline, 4-8 words. Examples: 'Revenue Mix Is Shifting Toward Services', 'Renewal Risk Concentrates in Two Regions', 'Q3 Margin Recovery Needs Pricing Discipline'. Do NOT use report labels like 'Preliminary Report', 'Annual Listing', 'Detailed Schedule', 'Consolidated Matrix', or 'Monthly Timetable'.",
            "- subtitle: write a one-sentence takeaway that states the implication of the data, not a document subtitle. Keep it under 120 characters.",
            "- dateline: use a short deck-style label such as 'Board update', 'Q3 review', 'Operating review', 'Pricing committee', or a concise month/quarter.",
            "- intro: empty array or one very short setup sentence only.",
            "- sections: exactly ONE section. heading should be a short placeholder label such as 'Decision context', 'Key takeaways', 'Performance snapshot', 'Risks to monitor', or empty if the slide title already covers it.",
            "- section.lead: empty or one short sentence. No paragraphs.",
            "- section.bullets: 2-4 concise slide bullets, each 7-16 words, each tied to a specific table value, trend, exception, or decision. No prose paragraphs.",
            "- section.trailing: empty array.",
            "- conclusion: empty array.",
            "- footnote: empty or a short source/method note under 12 words.",
            "",
            "Table rules for a slide:",
            `- Create ONE compact support table with about ${Math.min(cols, 6)} columns and ${Math.min(rows, 8)} body rows.`,
            "- The table should support the slide headline, not look like a full report extract.",
            "- Prefer business-slide headers such as Segment, Region, Product, Channel, Owner, Status, Plan, Actual, YoY, Margin, Risk, Next Step.",
            "- Include at least 2 numeric metric columns that can become KPI cards or chart values: currency, integer, or percent.",
            "- Keep cell text short. Avoid long IDs, dense legal labels, footnote clutter, or multi-sentence cells.",
            "- Use a Total / Priority / Watchlist row only if it helps the slide story.",
            "- Leave table.title empty unless a short table caption is genuinely useful.",
            "- Usually leave superGroups and columnGroups empty; only use grouped headers if the table remains easy to read on a slide.",
            "",
            "Content quality rules:",
            "- Write like a strategist preparing a deck, not like an analyst drafting a report.",
            "- Make the headline and bullets interpret the table; do not merely describe it.",
            "- Prefer crisp business language: growth, mix shift, variance, risk, recovery, backlog, conversion, renewal, margin, capacity, delivery, priority, decision.",
            "- No lorem, no filler, no random word salad, no invented opaque codes as key content.",
            "",
            COMMON_RULES,
        ].join("\n");
    }
    if (form) {
        return [
            `You are generating fictional content for ONE page that is an official FORM / regulatory return from a ${domain.title} (e.g. an insurance annual statement, a tax or registration form, an enrollment / claim / application form).`,
            fl,
            domain.instruction,
            "",
            "docTitle: the form's name (e.g. \"Additional Data Statement — Analysis of Operations\"). Keep intro empty or ONE short line.",
            "Produce EXACTLY 2 sections:",
            "- Section 1 = the FIELD BLOCK: heading like \"Filing Information\". Its table headers are EXACTLY [\"Field\", \"Value\"] and it has 4-7 rows, each a labelled form field with its filled-in value (e.g. Company Name / a fictional company, Filing Year / 2024, NAIC Code / 95303, Period Ending / December 31, 2024, Contact / a name). Leave superGroups/columnGroups/generator empty.",
            `- Section 2 = the MAIN GRID: a NUMBERED line-item form table — the first column holds numbered line items (\"1. Net Premium Income\", \"2. Total Revenues\", \"3. ...\"), then about ${cols - 1} value columns. Make some cells intentionally EMPTY ("") and put \"XXX\" in a few cells where a line is not applicable (real forms do this). About ${rows} rows.`,
            wantGroups ? "  In the main grid, add a grouped header (columnGroups, spans summing to the column count) where related value columns sit under a shared label." : "",
            "Every body row must have exactly as many cells as there are headers. Keep prose minimal (a short footnote with a form number/revision is welcome).",
            "",
            COMMON_RULES,
        ].join("\n");
    }
    if (spine) {
        const half = Math.max(1, Math.floor((cols - 1) / 2));
        return [
            `You are generating fictional content for ONE page of a ${domain.title} laid out as a CENTER-LABEL comparison table (the style of a European interim report's key-figures page).`,
            fl,
            domain.instruction,
            "",
            "The row-LABEL column sits in the MIDDLE, with comparative NUMBER columns on BOTH sides of it:",
            `- headers: put the metric/line-item label header in the MIDDLE position (about column ${half + 1} of ${cols}). To its LEFT, ${half} period columns (e.g. "Q2 2024", "Q2 2023", "Δ %"); to its RIGHT, ${cols - half - 1} more period columns (e.g. "H1 2024", "H1 2023", "FY 2023").`,
            "- Each row: the metric NAME goes in that SAME middle cell; every other cell is a number (currency / count / percent), consistent with its column header. Use parentheses for negatives.",
            "- Keep the same column order in EVERY row. Every row must have exactly as many cells as there are headers.",
            "- Leave superGroups, columnGroups and generator EMPTY. Do NOT use section-subheader rows or indentation.",
            wantTitle ? "- Set table.title to a short spanning title." : "- Leave table.title empty.",
            "Add a short doc title and 1 short intro sentence; keep prose minimal.",
            "",
            COMMON_RULES,
        ].join("\n");
    }
    if (matrix) {
        const markRule = MATRIX_MARKERS[matrixMarker] || MATRIX_MARKERS.check;
        return [
            `You are generating fictional content for ONE page containing a CROSS-TABULATION / MATRIX table from a ${domain.title} (e.g. a coverage/membership/skills matrix, a comparison grid, a compliance checklist, or a schedule/timetable).`,
            fl,
            domain.instruction,
            "",
            "A matrix has a ROW axis and a COLUMN axis; each body cell records the value at that row×column intersection. Build it like this:",
            `- headers: the FIRST header is a SHORT label naming the ROW axis (this is the top-left CORNER cell), e.g. "Director", "Skill", "Station", "Requirement", "Product". The remaining ${cols - 1} headers are the COLUMN-axis categories — keep each VERY SHORT (1-3 words) because the columns are narrow.`,
            `- rows: about ${rows} rows. Each row's FIRST cell is a row-axis label; the remaining cells are the intersection marks.`,
            `- Fill the intersection cells with ${markRule}.`,
            "- A real matrix is SPARSE: leave a good share of intersection cells EMPTY (\"\"). Do NOT fill every cell.",
            "- Body cells hold ONLY the mark/short value above — NO sentences, NO long text.",
            "- Every row must have exactly as many cells as there are headers. Leave superGroups, columnGroups and generator EMPTY.",
            wantTitle ? "- Set table.title to a short title spanning the matrix." : "- Leave table.title empty.",
            "Add a short doc title and ONE short intro sentence; keep other prose minimal (a short footnote/legend explaining the marks is welcome).",
            "",
            COMMON_RULES,
        ].join("\n");
    }
    if (complexCells) {
        return [
            `You are generating fictional content for ONE page of a ${domain.title} built around a table whose BODY CELLS are structurally rich (the complexity is INSIDE the data cells, not just the header).`,
            fl,
            domain.instruction,
            "",
            `Add a short title and 1-2 intro sentences, then the table: about ${cols} columns and ${rows} body rows. At least 2-3 columns must hold MULTI-LINE / MULTI-FIELD cells, using <br/> for hard line breaks WITHIN a single cell (each line a distinct field, not wrapped prose). Mix several of these patterns across the table:`,
            "- a multi-line ADDRESS/LOCATION cell: street<br/>city, region<br/>postal code,",
            "- a CONTACT cell: person name<br/>email<br/>phone,",
            "- a VALUE-WITH-NOTE cell: a primary number on line 1, then a smaller qualifier via <em> on line 2 (e.g. 1,240<br/><em>+3.2% YoY</em>, or $4,500.00<br/><em>incl. VAT</em>),",
            "- a DESCRIPTION cell: a bold lead term then detail (<strong>Part A-12</strong><br/>stainless, 12 mm),",
            "- a STATUS/REF cell stacking a code and a state (REF-8842<br/><em>Approved</em>).",
            "Also add MERGED body cells (this is important):",
            "- HORIZONTAL merge (colspan): for 1-2 rows, put the text in the FIRST cell of the span and the literal token << in each cell it should absorb to its right. The row must STILL have exactly as many cells as there are headers. A SUBTOTAL/TOTAL row that merges must KEEP its numeric value columns — only the label spans, e.g. Subtotal | << | << | 12,400 (the 12,400 stays). Merge ALL columns (a full-width band) ONLY for a textual note or 'continued' line written as a short sentence — never for a bare word like 'Subtotal' or 'Total' on its own.",
            "- VERTICAL grouping (rowspan): make the FIRST column a category/group whose value is REPEATED VERBATIM across 2-4 consecutive rows, for two or three groups (e.g. three 'North' rows then two 'South' rows). Identical adjacent first-column values will be merged into one tall cell.",
            "Use <sup> footnote markers on a few cells with a matching footnote, and <strong> on any Total row. Apart from intentional << merge tokens, every body row must have EXACTLY as many cells as there are headers (the <br/> are inside cells, they do not add columns). Keep surrounding prose short.",
            "",
            COMMON_RULES,
        ].join("\n");
    }
    if (textFocus) {
        return [
            "You are generating ONE page of a MOSTLY-TEXT document — a news/feature article, a research or policy report, a memo, a letter, an essay, a regulatory notice, or a manual section.",
            fl,
            `Loosely relate it to a ${domain.title} if natural, but it is primarily PROSE.`,
            "",
            `- docTitle: a headline/title. intro: 2-3 substantial paragraphs.`,
            `- sections: ${sectionsWanted} sections, each with a heading and 2-4 substantial, specific paragraphs (real terminology, names, figures woven into sentences). A section MAY include a short bullet list.`,
            "- These sections are TEXT-ONLY: leave each section's table headers as [] and rows as [] (and superGroups/columnGroups/generator empty). AT MOST ONE section may contain a SMALL table (<=5 columns, <=6 rows) if it genuinely fits; all others have NO table.",
            "- conclusion: 1-2 closing paragraphs. footnote: OPTIONAL small-print — vary it (source, methodology, disclaimer, confidentiality, revision stamp, prepared-by, or empty); don't always lead with 'Source:'.",
            "This is a TEXT-EXTRACTION test, so the words matter: write rich, varied, on-topic prose (no filler, no lorem).",
            "",
            COMMON_RULES,
        ].join("\n");
    }
    if (panels) {
        return [
            `You are generating fictional content for ONE page laid out as ${panels} SEPARATE small panels (an N-up sheet of mini-reports).`,
            fl,
            domain.instruction,
            "",
            `Produce EXACTLY ${panels} sections. Each section is a SELF-CONTAINED mini-report: a short heading, at most ONE short sentence of lead text, and ONE small table (about ${cols} columns and ${rows} rows). Each panel is only HALF the page wide, so keep its table NARROW — ${cols} columns at most (do NOT add extra columns), short headers, short cell values. Keep conclusion/intro empty or very short. The ${panels} tables should cover related-but-distinct facets so the panels read like ${panels} little documents.`,
            "Every body row must have exactly as many cells as there are headers. Leave superGroups/columnGroups/generator empty unless clearly needed.",
            "",
            COMMON_RULES,
        ].join("\n");
    }
    if (huge) {
        return [
            `You are generating fictional content for ONE page that is a HUGE dense data table from a ${domain.title}.`,
            fl,
            domain.instruction,
            "",
            `This table is too large to write every cell, so DESCRIBE how to auto-fill it. Provide a short title and 1 intro sentence, then the table with ${cols} columns and a "generator" object: rowCount (${rows}) and a "columns" array of one SPEC STRING per column (length must equal the number of headers). Leave "rows" as [].`,
            "Column spec formats (pick the right one per column):",
            "  seq:START:STEP:PREFIX    (row number / sequential id, e.g. seq:1:1: or seq:1001:1:INV-)",
            "  int:MIN:MAX              float:MIN:MAX:DECIMALS",
            "  currency:MIN:MAX:DEC:SYM percent:MIN:MAX:DEC",
            "  cat:A|B|C                bool:Yes|No",
            "  id:PREFIX:DIGITS         date:YYYY-MM-DD:STEPDAYS",
            "  time:HH:MM:STEPMIN       (clock time HH:MM 24h; sequence from HH:MM by STEPMIN minutes, or just 'time' for random — use for Departure/Arrival/'... Time' columns, NOT int)",
            "  name  company  city  country  street  product  email  phone  department  text   (realistic values; pick the one matching the column header)",
            "  formula:OP:COL1:COL2:DEC:SYM   (OP=mul|add|sub|div; COL1/COL2 are 0-based indices of EARLIER columns, e.g. Amount = Qty x Unit Price)",
            "  pctof:COL:RATE:DEC:SYM   (RATE% of an EARLIER column — USE THIS for tax/VAT/duty/commission/discount columns, e.g. VAT = 12% of a Unit Price in column 2 = pctof:2:12:2:$. Do NOT spec a tax/VAT column as int:0:0.)",
            "Make headers and specs internally coherent (e.g. a Qty int column, a Unit Price currency column, then an Amount formula:mul of the two).",
            "For DESCRIPTIVE / categorical columns (product, item, category, status, region, segment, department, grade), STRONGLY PREFER cat:A|B|C with 4-10 realistic DOMAIN-APPROPRIATE values you choose (e.g. for a parts ledger: cat:Gearbox|Bearing|Coupling|Seal|Valve), rather than the generic 'product'/'text' generators — random fake product names look unrealistic. Use 'name' only for real person-name columns.",
            wantTitle ? "Include a spanning title row (table.title)." : "",
            wantGroups ? "Optionally add a grouped header (columnGroups)." : "",
            "",
            COMMON_RULES,
        ].join("\n");
    }
    if (extreme) {
        return [
            `You are generating fictional content for ONE page of a ${domain.title} with an EXTREMELY COMPLEX table.`,
            fl,
            domain.instruction,
            "",
            "Add a short title and 1 short intro sentence, then the table. Make the table structurally intricate, like a dense regulatory filing or financial schedule:",
            `- About ${cols} leaf columns and ${rows} body rows.`,
            "- THREE-TIER nested header: populate superGroups (top tier) AND columnGroups (middle tier) AND headers (leaf tier). superGroups spans and columnGroups spans must each sum to the number of leaf columns. e.g. super 'Fiscal 2024' over groups 'Q1'/'Q2' over leaves 'Actual'/'Budget'.",
            "- ROW GROUPS: make the FIRST column a category that REPEATS across several consecutive rows (e.g. region or segment repeated for each sub-line), so consecutive rows share the same first-cell value — they will be visually merged into a rowspan.",
            "- Include SECTION SUBHEADER rows (first cell is a section label, other cells empty) and subtotal/Total rows (use <strong>).",
            "- Use footnote markers via <sup> on a few labels and a matching footnote.",
            wantTitle ? "- Include a spanning title row (table.title)." : "",
            "",
            COMMON_RULES,
        ].join("\n");
    }
    if (dense) {
        return [
            `You are generating fictional content for ONE page that is a DENSE, FULL-PAGE ${domain.title} table.`,
            fl,
            domain.instruction,
            "",
            "This page is dominated by a single LARGE table that fills the whole page (like a rate sheet, filing schedule, or timetable). Provide only a short title and AT MOST one short intro sentence — NO analysis paragraphs, NO bullets, NO conclusion (leave those arrays empty / footnote a short source line).",
            `The table MUST have about ${rows} body rows and ${cols} columns of consistent, realistic data.`,
            wantTitle ? "Include a spanning title row (table.title)." : "Leave table.title empty.",
            wantGroups ? "Include a grouped header (columnGroups, spans summing to the column count)." : "Leave columnGroups empty.",
            "",
            COMMON_RULES,
        ].join("\n");
    }
    const multi = sectionsWanted > 1;
    const introLine = `You are generating fictional content for ONE page of a ${domain.title}.`;
    const complexHint = complex
        ? [
            "",
            "Make the table STRUCTURALLY COMPLEX, like a real financial statement or detailed schedule:",
            "- Use a multi-column grouped header (populate columnGroups, spans summing to the column count).",
            "- Group the body with SECTION SUBHEADER rows: a row whose first cell is a section label (e.g. 'Assets', 'Operating Activities', 'Current Liabilities') and whose OTHER cells are all empty strings. Put the detail line items under each section.",
            "- Include subtotal/Total rows per section.",
        ].join("\n")
        : "";
    return [
        introLine,
        fl,
        domain.instruction,
        "",
        "Write it like a REAL report/document page, not a bare table. The page should read as prose with the table(s) embedded in the middle:",
        "- intro: 1-3 substantial paragraphs of on-topic background/context (3-6 sentences each).",
        multi
            ? `- sections: ${sectionsWanted} sections, each with a heading, 1-2 lead paragraphs introducing the table, the table itself, and 1-2 trailing paragraphs of analysis. Make the tables clearly distinct.`
            : "- sections: ONE section with a heading, 1-2 lead paragraphs introducing the table, the table, and 1-2 trailing paragraphs of analysis/commentary.",
        "- bullets: optionally 0-5 short bullet points of takeaways in a section.",
        "- conclusion: 1-2 closing paragraphs.",
        "- footnote: OPTIONAL small-print line — VARY it across docs and often leave it empty (\"\"). When present pick ONE kind that fits: a source/attribution, a methodology/basis note, a legal disclaimer, a confidentiality notice, a revision/version stamp, a prepared-by/approved-by line, a contact, or a standards/regulatory reference. Do NOT default to starting with 'Source:' and do NOT always pair 'Source:' with 'Disclaimer:'.",
        "Keep the TOTAL prose moderate — it must still fit on a single page alongside the table(s). Prose must be specific and on-domain (real figures, entities, terminology), never filler.",
        complexHint,
        "",
        domain.forceTitle ? structHint({ cols, rows, wantTitle: true, wantGroups }) : structHint({ cols, rows, wantTitle, wantGroups }),
        "",
        COMMON_RULES,
    ].join("\n");
}

// JSON schema for the document Gemini returns.
const PARAS = { type: "array", items: { type: "string" } };

export const DOC_SCHEMA = {
    type: "object",
    properties: {
        docTitle: { type: "string" },
        subtitle: { type: "string" },
        dateline: { type: "string" },
        chartType: { type: "string" },
        intro: PARAS,
        sections: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    heading: { type: "string" },
                    lead: PARAS,
                    trailing: PARAS,
                    bullets: { type: "array", items: { type: "string" } },
                    table: {
                        type: "object",
                        properties: {
                            title: { type: "string" },
                            superGroups: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        label: { type: "string" },
                                        span: { type: "integer" },
                                    },
                                    required: ["label", "span"],
                                },
                            },
                            columnGroups: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        label: { type: "string" },
                                        span: { type: "integer" },
                                    },
                                    required: ["label", "span"],
                                },
                            },
                            headers: { type: "array", items: { type: "string" } },
                            rows: { type: "array", items: { type: "array", items: { type: "string" } } },
                            generator: {
                                type: "object",
                                properties: {
                                    rowCount: { type: "integer" },
                                    columns: { type: "array", items: { type: "string" } },
                                },
                                required: ["rowCount", "columns"],
                            },
                        },
                        required: ["title", "superGroups", "columnGroups", "headers", "rows", "generator"],
                    },
                },
                required: ["heading", "lead", "trailing", "bullets", "table"],
            },
        },
        conclusion: PARAS,
        footnote: { type: "string" },
    },
    required: ["docTitle", "subtitle", "dateline", "chartType", "intro", "sections", "conclusion", "footnote"],
};
