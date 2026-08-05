Seeded HTML->PDF document generators (tables + dense text) with exact GT.

Setup: ln -s <llamacloud-bench>/tools/table-generator/node_modules .   (needs puppeteer)
Run:   node render.mjs templates/<fam>.mjs <seed> <outdir>        # 34 table families
       node render.mjs templates_text/<fam>.mjs <seed> <outdir>   # 10 dense-text families
Batch: ./gen500.sh   ./gen500_text.sh
Check: python3 verify500.py   python3 verify_text.py
