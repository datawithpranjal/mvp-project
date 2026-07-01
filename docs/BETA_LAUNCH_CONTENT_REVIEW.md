# Beta Launch Content Review

This review documents the current public content gate for The Data Foundry.

## Launch-Ready Counts

The production UI now shows the full blocker-clean content library by default.

| Section | Launch-ready count |
| --- | ---: |
| SQL labs | 50 |
| SQL coverage labs | 244 |
| Python labs | 50 |
| PySpark labs | 20 |
| Airflow labs | 10 |
| AWS labs | 17 |
| Broken Pipeline scenarios | 240 |
| System Design cases | 10 |
| **Total** | **641** |

## Validation Result

Latest command run:

```bash
npm run validate:content:quality
```

Current launch gate result:

- Launch-ready records: 641
- Launch-ready BLOCKER findings: 0
- Hidden BLOCKER findings: 0

## What Was Fixed

- Added a launch-ready manifest and launch filtering in `frontend/lib/launch-ready-content.ts`.
- Extended the content validator to include the imported public SQL coverage pack.
- Preserved the original curated subset as an emergency rollback mode through `NEXT_PUBLIC_LIMIT_TO_CURATED_CONTENT=true`.
- Fixed generated SQL starter-code/table-reference issues.
- Added missing Python expected outcomes, explanations, and common mistakes.
- Repaired previously hidden SQL labs with aligned sample data, starter code, expected SQL, edge-case tests, hints, and explanations.
- Cleaned concrete hint contradiction warnings.
- Promoted all blocker-free content to production visibility by default.

## Remaining Blockers

No blocker-level findings remain.

## Manual Review Backlog

The validator still reports non-blocking warnings and suggestions:

- Duplicate SQL solution-pattern warnings across generated coverage drills.
- Semantic-title-match warnings where generated or metaphor-style titles have low token overlap.
- Hint-alignment suggestions where hints are valid but generic.

These should be handled as ongoing content polish, not launch blockers.

## Internal Review Controls

Expose only the original curated subset:

```bash
NEXT_PUBLIC_LIMIT_TO_CURATED_CONTENT=true
```

Expose all hidden/internal content for review:

```bash
NEXT_PUBLIC_SHOW_HIDDEN_CONTENT=true
```
