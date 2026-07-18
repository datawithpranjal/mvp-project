# Python Labs Research Inventory

This batch used public repositories and indexes only as concept inspiration. No problem
text, examples, tests, titles, or solution code were copied into The Data Foundry.

## Sources Reviewed

| Source | License signal | What was useful | What was not copied |
| --- | --- | --- | --- |
| https://github.com/TheAlgorithms/Python | GitHub page lists MIT license | Broad algorithm/category inventory: strings, sorting, searching, data structures, scheduling, file utilities | No problem statements, file names, implementation code, examples, or tests |
| https://github.com/devAmoghS/Python-Interview-Problems-for-Practice | Ecosyste.ms index lists MIT | Common interview topic coverage: arrays, dictionaries, strings, recursion, search, frequency counting | No notebook content, question wording, examples, or solutions |
| https://pypi.org/project/python-ds/1.0.0/ | PyPI metadata lists MIT | Data-structure topic framing and common interview-prep scope | No package code or exercise text |
| https://github.com/microsoft/Data-Science-For-Beginners | GitHub page lists MIT | Beginner-friendly learning-path style and Python/data topic range | No lessons, notebooks, examples, or code |
| https://srclog.com/data-engineering-project | Index lists MIT for an end-to-end data engineering project | Production-flavored topic inventory: Kafka, Airflow, Spark, Postgres, Docker | No project code, README text, diagrams, or scenarios |

## Concept Mapping

The final labs intentionally combine general Python competencies with Data Engineering
production tasks:

- Dictionaries and sets -> status normalization, reconciliation, deduplication.
- Lists and sorting -> deterministic output, ranking with ties, compaction plans.
- Regex/string parsing -> logs and partition paths.
- Date/time handling -> SLA checks, sessions, backfill windows.
- Graph-style dependency logic -> DAG run ordering and cycle detection.
- State application -> CDC current-state and exactly-once replay handling.

## Originality Safeguards

- Every title uses The Data Foundry numbering and production context.
- Every problem statement is written around an internal platform/workplace situation.
- Visible and hidden tests use newly created records, dates, IDs, and business names.
- Reference solutions were written for the Data Foundry schema and validation contract.
- Hidden tests and reference solutions live only in the backend service.

