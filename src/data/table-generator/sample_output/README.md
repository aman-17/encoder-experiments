# table-generator sample output

Six example pages showing the new Canonical17 components, generated with:

```bash
python acroform_seed.py --acroforms <acroforms-dir> --count 6 --seed 21 --out form_specs.json
./tablegen --no-llm --from-acroforms form_specs.json --count 6 --seed 21 --tests layout --out out
```

Each page carries the full component set: **Key-Value Region, Form (fillable
fields), Checkbox-Selected/Unselected, Document Index** + the usual
Title / Text / Table / Section / List.

**Committed here:** `sample_<n>.layout.test.json` — the layout ground truth
(per-element `canonical_class` + normalized bbox) for each page.

**Not committed** (the repo `.gitignore`s `*.pdf` / `*.png`): the rendered
`sample_<n>.pdf` and `sample_<n>.png` previews. Re-generate them with the two
commands above, or see the seed mapping below.

| sample | seeded from acroform |
|---|---|
| sample_1 | Form 007 Semi-Annual Collection Report Form (BLANK) |
| sample_2 | (acroform seed) |
| sample_3 | dl-31 |
| sample_4 | (acroform seed) |
| sample_5 | (acroform seed) |
| sample_6 | record-of-inspection-roi-of-high-risk-prescribed-electrical-work |
