# Scenario Import Guide

Place the PDF at:

```text
docs/120-data-engineering-scenarios.pdf
```

Then run the import script from the project root:

```bash
npx tsx scripts/import-scenarios-from-pdf.ts
```

The script expects `pdf-parse` to be available. If it is not installed yet:

```bash
npm install --save-dev tsx pdf-parse
```

Output:

```text
data/scenarios.generated.json
```

The generated file is intentionally conservative. PDF extraction is messy, so every generated scenario should be reviewed for:

- Correct domain and difficulty
- Correct practice type
- Clean business context
- Realistic broken SQL/PySpark/logs
- Useful hints that do not reveal the answer
- Model solution written in practical interview language
- Free/premium selection

If PDF extraction is poor, use `data/scenarios.manual.template.json` and paste scenarios manually in batches of 10-20. The platform schema is designed so a rough scenario can still be valid while TODO fields are refined later.
