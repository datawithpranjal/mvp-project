# Scenario Import Guide

Place the PDF at:

```text
docs/120-data-engineering-scenarios.pdf
```

Then run the import script from the project root:

```bash
./frontend/node_modules/.bin/tsx scripts/import-scenarios-from-pdf.ts
```

You can also pass a PDF path directly:

```bash
./frontend/node_modules/.bin/tsx scripts/import-scenarios-from-pdf.ts "/Users/pranjalpatidar/Desktop/TopMate Files/Final_Advanced/Scenario-Based Data Engineering Interview Handbook - 120 Questions - Data with Pranjal.pdf"
```

The script expects `pdf-parse` to be available from the frontend tooling. If it is not installed yet:

```bash
cd frontend
npm install --save-dev tsx pdf-parse
```

Output:

```text
data/scenarios.generated.json
frontend/data/scenarios.generated.json
```

The frontend copy is automatically loaded by `frontend/lib/scenarios.ts`, so generated scenarios appear in the Broken Pipeline Lab after rebuild/deploy.

The generated file is intentionally conservative. PDF extraction is messy, so every generated scenario should be reviewed for:

- Correct domain and difficulty
- Correct practice type
- Clean business context
- Realistic broken SQL/PySpark/logs
- Useful hints that do not reveal the answer
- Model solution written in practical interview language
- Free/premium selection

For PySpark/Spark scenarios, the importer generates a broken code sample so learners can practice fixing Spark code instead of only reading an explanation.

If PDF extraction is poor, use `data/scenarios.manual.template.json` and paste scenarios manually in batches of 10-20. The platform schema is designed so a rough scenario can still be valid while TODO fields are refined later.
