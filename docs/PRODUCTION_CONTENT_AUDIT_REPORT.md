# Production Content Audit Report

Date: 2026-07-01

## Summary

The production-visible content library has been expanded from the curated beta subset to the full blocker-clean library.

- Launch-ready blockers: 0
- Hidden blockers: 0
- Launch-ready records: 641
- SQL launch-ready records: 294
- Python launch-ready records: 50
- PySpark launch-ready records: 20
- Airflow launch-ready records: 10
- AWS launch-ready records: 17
- Broken Pipeline scenario launch-ready records: 240
- System Design launch-ready records: 10

## What Was Fixed

- Added the public SQL coverage pack to the QA validator so it is included in blocker checks.
- Verified executable SQL solutions and SQL test cases against visible sample tables.
- Fixed generated SQL starter-code/table-reference issues.
- Completed missing Python expected outcomes, model-answer explanations, and common mistakes.
- Cleaned hint wording that triggered concrete contradiction warnings.
- Promoted all blocker-free content to the default public launch gate.

## Current QA State

Run:

```bash
cd frontend
npm run validate:content:quality
```

Current result:

- `BLOCKER`: 0
- `WARNING`: 48
- `SUGGESTION`: 464

Warnings and suggestions are retained as editorial review backlog. They do not block launch because the content has required fields, executable SQL where applicable, and no blocker-level validation failures.

## Rollback Switch

To temporarily expose only the original curated beta set:

```bash
NEXT_PUBLIC_LIMIT_TO_CURATED_CONTENT=true
```

To show everything in an internal review build regardless of launch flags:

```bash
NEXT_PUBLIC_SHOW_HIDDEN_CONTENT=true
```

## Next Content Work

- Review duplicate SQL solution warnings and decide which are intentional pattern drills versus content that should be rewritten.
- Improve low-overlap hints gradually for a more premium learner experience.
- Add richer interview framing to generated scenario titles that are intentionally metaphorical.
