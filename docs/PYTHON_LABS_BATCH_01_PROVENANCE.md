# Python Labs Batch 01 Provenance

This document records the review notes for the first original Python practice
batch added to The Data Foundry.

## Scope

- Batch size: 25 original Python labs.
- Difficulty mix: 8 beginner, 10 intermediate, 7 advanced.
- Frontend metadata file: `frontend/data/python-original-labs.generated.ts`.
- Server-side validation file: `backend/app/services/python_lab_specs.py`.
- Server-side runner: `backend/app/services/python_validation_service.py`.

## Originality Statement

The labs were independently written for The Data Foundry's data-engineering
practice environment. Public repositories were used only to understand common
Python learning categories, algorithm patterns, and interview difficulty bands.

No third-party problem statements, titles, examples, hidden tests, solution
code, editorials, or LeetCode identifiers were copied into this repository.

## Sources Used For Concept Research

See `docs/PYTHON_LABS_RESEARCH_INVENTORY.md` for the source inventory,
license signals, and rejected/copy-protection notes.

## Launch Batch

| # | Slug | Difficulty | Category |
| --- | --- | --- | --- |
| 1 | `python-foundry-01-normalize-payment-statuses` | Beginner | Data Cleaning |
| 2 | `python-foundry-02-extract-failed-job-ids` | Beginner | Log Parsing |
| 3 | `python-foundry-03-deduplicate-event-ids` | Beginner | Idempotency |
| 4 | `python-foundry-04-find-missing-required-fields` | Beginner | Data Quality |
| 5 | `python-foundry-05-summarize-inventory-by-sku` | Beginner | Aggregation |
| 6 | `python-foundry-06-parse-partition-dates` | Beginner | Partitioning |
| 7 | `python-foundry-07-mask-customer-emails` | Beginner | Privacy |
| 8 | `python-foundry-08-calculate-success-rate` | Beginner | Metrics |
| 9 | `python-foundry-09-latest-customer-updates` | Intermediate | Incremental Processing |
| 10 | `python-foundry-10-reconcile-snapshot-keys` | Intermediate | Reconciliation |
| 11 | `python-foundry-11-sessionize-clickstream-events` | Intermediate | Clickstream |
| 12 | `python-foundry-12-detect-delayed-jobs` | Intermediate | SLA Monitoring |
| 13 | `python-foundry-13-build-retry-summary` | Intermediate | Reliability |
| 14 | `python-foundry-14-aggregate-daily-net-revenue` | Intermediate | Finance Metrics |
| 15 | `python-foundry-15-find-missing-partitions` | Intermediate | Partition Auditing |
| 16 | `python-foundry-16-normalize-schema-drift-records` | Intermediate | Schema Drift |
| 17 | `python-foundry-17-build-compaction-plan` | Intermediate | Lakehouse Operations |
| 18 | `python-foundry-18-top-customers-with-ties` | Intermediate | Ranking |
| 19 | `python-foundry-19-apply-cdc-events` | Advanced | CDC |
| 20 | `python-foundry-20-build-dependency-run-order` | Advanced | DAG Dependencies |
| 21 | `python-foundry-21-rolling-error-rate` | Advanced | Monitoring |
| 22 | `python-foundry-22-deduplicate-exactly-once-events` | Advanced | Streaming Idempotency |
| 23 | `python-foundry-23-prepare-scd2-changes` | Advanced | Data Modeling |
| 24 | `python-foundry-24-detect-metric-drift` | Advanced | Observability |
| 25 | `python-foundry-25-allocate-backfill-windows` | Advanced | Backfills |

## Security And Packaging Review

- Learner-facing metadata includes the prompt, examples, starter code, hints,
  and common mistakes.
- Reference solutions are intentionally stored in the backend, not in the
  frontend content bundle.
- Hidden tests are intentionally stored in the backend, not in the frontend
  content bundle.
- Validation requires an authenticated user and runs submissions in a short
  lived subprocess with timeout and basic static guardrails.

## Manual Review Notes

- This is a rule-based code runner, not a full sandbox. It is suitable for
  controlled beta practice problems, but a stronger container-isolated runner is
  recommended before accepting arbitrary long-running user Python at scale.
- The first batch focuses on pure Python data-engineering utilities. It does
  not execute Pandas, PySpark, network calls, filesystem calls, or package
  installs.
