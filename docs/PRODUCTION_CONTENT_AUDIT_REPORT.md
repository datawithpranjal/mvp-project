# Production Content Audit Report

Date: 2026-06-30

## Summary

The production-visible content library has been tightened after the internal content QA pass.

- Launch-ready blockers: 0
- Hidden blockers: 0
- Launch-ready records: 126
- SQL launch-ready records: 33
- Python launch-ready records: 50
- PySpark launch-ready records: 10
- Airflow launch-ready records: 10
- AWS launch-ready records: 10
- Broken Pipeline scenario launch-ready records: 10
- System Design launch-ready records: 3

## What Was Fixed

- Repaired supported SQL labs where the title, expected outcome, hints, solution SQL, and SQL test cases were misaligned.
- Updated SQL labs that were using repeated generic revenue queries under different titles.
- Rewrote contradiction-prone hints that used wording such as "do not", "no", or "avoid" where the validator could reasonably flag ambiguity.
- Cleaned PySpark and Airflow hint wording so production-visible hints read as positive guidance.

## Hidden From Production

The following SQL labs were removed from the launch-ready list because their current sample tables do not honestly support the title or expected validation logic:

- `sql-coding-14-intersection-of-active-users-across-two-months`
- `sql-coding-15-customers-who-bought-every-product-in-a-category`
- `sql-coding-16-compare-two-tables-and-find-added-rows`
- `sql-coding-24-rolling-7-day-active-users`
- `sql-coding-36-snapshot-table-latest-balance-per-account`
- `sql-coding-37-late-arriving-facts-that-missed-the-correct-date-partition`
- `sql-coding-39-fact-table-missing-dimension-keys-by-load-date`

These items are preserved in the source content for future rewrite, but they are not shown in the production lab library.

## Remaining Internal Warnings

The validator still reports warnings and suggestions for hidden/manual-review content. These are intentionally not exposed by default in production.

Remaining warning categories:

- Semantic title match warnings on hidden generated scenarios.
- Duplicate solution warnings where hidden draft SQL labs still share old placeholder SQL with launch-ready or hidden labs.
- Hint-alignment suggestions, mostly from generated Python hints that are safe but mechanically low-overlap with the problem statement.

## Next Content Work

Before promoting more hidden content, each candidate should get:

- A matching sample table/data model.
- A unique expected output.
- At least one edge-case test.
- Hints written for the specific scenario.
- A production-style explanation, not a generic solution note.

Run this before any content promotion:

```bash
cd frontend
npm run validate:content:quality
```
