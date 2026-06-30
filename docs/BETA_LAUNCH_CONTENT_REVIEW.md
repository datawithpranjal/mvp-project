# Beta Launch Content Review

This review creates a launch-safe subset for the public beta without adding new content.

## Launch-Ready Counts

The production UI now shows launch-ready content by default.

| Section | Launch-ready count |
| --- | ---: |
| SQL labs | 40 |
| Python labs | 50 |
| PySpark labs | 10 |
| Airflow labs | 10 |
| AWS labs | 10 |
| Broken Pipeline scenarios | 10 |
| System Design cases | 3 |
| Total | 133 |

## Validation Result

Latest command run:

```bash
npm run validate:content:quality
```

Current launch gate result:

- Launch-ready records: 133
- Launch-ready BLOCKER findings: 0
- Hidden BLOCKER findings: 0

All blocker-level findings are resolved. Hidden content still stays out of production navigation until it receives manual editorial review.

## What Was Fixed

- Added a launch-ready manifest in `frontend/lib/launch-ready-content.ts`.
- Marked launch-ready items at runtime with `launchReady: true`.
- Filtered public getters so production navigation only shows launch-ready content by default.
- Preserved full content exports for QA/import/admin review workflows.
- Fixed generated SQL starter code so SQL labs inspect the actual visible sample table instead of defaulting to `employees`.
- Updated the content validator to distinguish launch-ready blockers from hidden blockers.
- Updated the content validator so PySpark imports like `from pyspark.sql` are not treated as SQL table references.
- Added concrete expected outcomes, explanations, and common mistakes for all 50 Python labs.
- Promoted all 50 Python labs after the content validator confirmed zero blocker findings.

## Remaining Hidden Blockers

No hidden blocker findings remain.

## Manual Review Still Needed

The validator intentionally does not auto-fix semantic/title/content mismatches. These should be reviewed manually before adding more content to the launch-ready set.

Launch-ready items flagged for manual review by the current QA heuristics include:

- `sql-coding-14-intersection-of-active-users-across-two-months`
- `sql-coding-16-compare-two-tables-and-find-added-rows`
- `sql-coding-19-find-duplicate-business-keys`
- `sql-coding-23-sessionization-with-a-30-minute-gap`
- `sql-coding-26-repeat-purchase-within-7-days`
- `sql-coding-27-consecutive-login-streaks`
- `sql-coding-31-deduplicate-and-keep-the-latest-record-per-business-key`
- `sql-coding-34-incremental-load-using-watermark`
- `sql-coding-35-merge-staging-into-target-by-business-key`
- `sql-coding-37-late-arriving-facts-that-missed-the-correct-date-partition`
- `sql-coding-38-find-changed-rows-between-two-snapshots-by-key`

Other manual-review categories:

- Duplicate `expectedSql` or `solutionCode` across different SQL titles.
- Hint contradiction warnings where phrasing like "do not flag" or "no active" may be valid but needs human review.
- Low-overlap hint warnings where hints may be generic.

## Internal Review Override

To temporarily expose hidden content in an internal build, set:

```bash
NEXT_PUBLIC_SHOW_HIDDEN_CONTENT=true
```

Do not enable this for public production until hidden content has been manually reviewed.
