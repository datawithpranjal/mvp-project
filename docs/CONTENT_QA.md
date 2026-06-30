# Content Quality Validation

The Data Foundry has a non-mutating content QA script for generated labs, scenario labs, operations labs, and system-design cases.

## Run The Validator

From the frontend folder:

```bash
npm run validate:content:quality
```

This prints a report grouped by:

- `BLOCKER`: content that is likely broken or impossible to validate correctly.
- `WARNING`: content that may be mismatched, duplicated, or risky.
- `SUGGESTION`: content that may still work but should be manually reviewed.

The default run is report-only and does not fail the command. To make blockers fail in CI:

```bash
CONTENT_QA_STRICT=1 npm run validate:content:quality
```

## What It Checks

- Empty or missing focus files.
- Missing required fields such as business context, problem statement, student task, hints, explanation, expected output, or model answer.
- Title/content semantic alignment using lightweight token matching.
- Starter SQL table references against available visible tables.
- `expectedSql` table references against available visible tables.
- Duplicate `expectedSql` or `solutionCode` across different lab titles.
- SQL `expectedSql` execution against visible sample data.
- SQL edge-case `sqlTestCases` execution.
- Hint alignment and possible contradiction patterns.

## Important Notes

This script does not rewrite content. Treat findings as a QA report, then fix content in a separate content cleanup change.

The semantic and hint checks are heuristic. They are designed to catch suspicious content at scale, not replace human review.
