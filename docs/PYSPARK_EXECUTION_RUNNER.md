# PySpark Execution Runner

The main website and FastAPI backend can stay on Vercel, but PySpark should run in a separate isolated worker. Vercel serverless is not a good place for Spark because Spark needs Java, local process time, memory, and predictable temporary storage.

## Recommended Production Setup

Use a small container service for PySpark validation:

- Recommended: Google Cloud Run
- Also acceptable: Fly.io or Render web service
- Image: `docker/pyspark-runner.Dockerfile`
- Memory: start with 2 GiB
- CPU: start with 1 vCPU
- Timeout: 25-30 seconds
- Scaling: min instances 0, max instances based on budget

The production flow is:

1. Browser calls the existing FastAPI backend endpoint.
2. Vercel backend proxies the request to the PySpark runner.
3. PySpark runner executes visible sample or hidden tests.
4. Backend returns pass/fail, actual output, expected output, and test messages.

## Environment Variables

Set these on the Vercel backend:

```bash
PYSPARK_RUNNER_URL=https://your-pyspark-runner-url
PYSPARK_RUNNER_TOKEN=<32+ char shared secret>
PYSPARK_EXECUTION_ENABLED=false
PYSPARK_TIMEOUT_SECONDS=25
```

Set these on the PySpark runner service:

```bash
PYSPARK_EXECUTION_ENABLED=true
PYSPARK_RUNNER_TOKEN=<same shared secret>
BACKEND_CORS_ORIGINS=https://datawithpranjal.com,https://www.datawithpranjal.com
```

Do not set `PYSPARK_RUNNER_URL` on the runner itself. That variable is only for the Vercel backend proxy.

## Local Runner

To run Spark locally, install the Spark dependencies into your backend environment:

```bash
cd backend
pip install -r requirements-spark.txt
PYSPARK_EXECUTION_ENABLED=true uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Then run the frontend with:

```bash
cd frontend
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000 npm run dev -- -p 3002
```

## Validation Contract

The first executable PySpark scenario is:

`yesterdays-sales-missing-late-source-arrival`

The learner code must create a Spark DataFrame named `daily_sales` or `fixed_daily_sales` with these columns:

```text
business_date, order_count, gross_sales
```

The runner provides:

```python
raw_sales
run_date
F
spark
```

The runner intentionally blocks external file reads, warehouse writes, subprocess/network access, and dynamic execution. This protects the platform and keeps the practice focused on transformation logic.

## Why This Is Safer

User code execution is risky. Keeping Spark in a separate container allows us to apply stricter resource limits, timeouts, secrets isolation, no database credentials, and optional network egress restrictions.
