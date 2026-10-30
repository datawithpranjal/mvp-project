import os
import subprocess

import httpx
import pytest
from fastapi.testclient import TestClient

from app.services.pyspark_validation_service import PysparkValidationConfigurationError, PysparkValidationService

SLUG = 'yesterdays-sales-missing-late-source-arrival'
REFERENCE = '''from pyspark.sql import functions as F
daily_sales = (raw_sales.withColumn("business_date", F.to_date("sale_ts_utc"))
    .filter((F.col("business_date") == F.lit(run_date)) & (F.col("status") == "PAID"))
    .dropDuplicates(["order_id"]).groupBy("business_date")
    .agg(F.count("order_id").alias("order_count"), F.sum("amount").alias("gross_sales")))
'''


def local_service():
    service = PysparkValidationService()
    service.settings = service.settings.model_copy(update={
        'pyspark_runner_url': None, 'pyspark_execution_enabled': True,
        'pyspark_timeout_seconds': 25.0,
    })
    return service


def timeout(*args, **kwargs):
    assert kwargs['timeout'] == 25.0
    raise subprocess.TimeoutExpired(cmd=['private-worker-path'], timeout=25, stderr='private worker detail')


def test_worker_timeout_has_no_correctness_result(monkeypatch):
    monkeypatch.setattr(PysparkValidationService, '_run_worker', timeout)
    with pytest.raises(PysparkValidationConfigurationError, match='timed out') as error:
        local_service().validate(SLUG, REFERENCE, 'sample')
    assert 'private' not in str(error.value)


def test_timeout_returns_service_unavailable_not_http_500(monkeypatch):
    from app.api.routes import pyspark_validation as route
    from app.main import app
    monkeypatch.setattr(route, 'service', local_service())
    monkeypatch.setattr(PysparkValidationService, '_run_worker', timeout)
    response = TestClient(app).post(f'/api/v1/pyspark/validate/{SLUG}', json={'code': REFERENCE, 'mode':'sample'})
    assert response.status_code == 503
    assert 'No correctness result' in response.json()['detail']
    assert 'private' not in response.text


def test_worker_startup_failure_is_not_wrong_answer(monkeypatch):
    monkeypatch.setattr(PysparkValidationService, '_run_worker', lambda *a, **k: subprocess.CompletedProcess(a, 1, '', 'private traceback'))
    with pytest.raises(PysparkValidationConfigurationError, match='worker could not finish') as error:
        local_service().validate(SLUG, REFERENCE, 'sample')
    assert 'private' not in str(error.value)


@pytest.mark.parametrize('code', ['import os\nresult_df=raw_sales', 'result_df=spark.read.parquet("x")', 'raw_sales.write.save("x")', 'exec("pass")'])
def test_safety_rules_still_reject_before_execution(monkeypatch, code):
    def no_execution(*a, **k):
        pytest.fail('Unsafe code reached worker')
    monkeypatch.setattr(PysparkValidationService, '_run_worker', no_execution)
    result=local_service().validate(SLUG,code,'sample')
    assert not result.passed
    assert result.tests[0].name == 'static safety check'


@pytest.mark.parametrize('payload', [
    'not json', '{}', '{"passed":true}', '[]',
    '{"mode":"sample","passed":true,"message":"pass","tests":[]}',
    '{"mode":"hidden","passed":true,"message":"pass","tests":[{"name":"sample","passed":true,"message":"pass"}]}',
    '{"mode":"sample","passed":true,"message":"pass","tests":[{"name":"sample","passed":false,"message":"fail"}]}',
])
def test_invalid_remote_response_is_unavailable(monkeypatch, payload):
    class Client:
        def __init__(self, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self,*a): pass
        def post(self,*a,**k): return httpx.Response(200, text=payload)
    monkeypatch.setattr(httpx,'Client',Client)
    service=local_service()
    service.settings=service.settings.model_copy(update={'pyspark_runner_url':'https://runner.example'})
    with pytest.raises(PysparkValidationConfigurationError, match='invalid response'):
        service.validate(SLUG,REFERENCE,'sample')


def test_remote_timeout_is_classified(monkeypatch):
    class Client:
        def __init__(self, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self,*a): pass
        def post(self,*a,**k): raise httpx.ReadTimeout('private URL')
    monkeypatch.setattr(httpx,'Client',Client)
    service=local_service()
    service.settings=service.settings.model_copy(update={'pyspark_runner_url':'https://runner.example'})
    with pytest.raises(PysparkValidationConfigurationError, match='timed out'):
        service.validate(SLUG,REFERENCE,'sample')


@pytest.mark.skipif(os.environ.get('RUN_SPARK_TESTS') != '1', reason='requires Java and optional Spark dependencies')
@pytest.mark.parametrize('label,code,mode,passed', [
    ('reference sample',REFERENCE,'sample',True),
    ('reference hidden duplicates and dates',REFERENCE,'hidden',True),
    ('starter','daily_sales=raw_sales','sample',False),
    ('ingestion date',REFERENCE.replace('F.to_date("sale_ts_utc")','F.to_date("ingested_at")'),'sample',False),
    ('cancelled rows',REFERENCE.replace(' & (F.col("status") == "PAID")',''),'sample',False),
    ('duplicate rows',REFERENCE.replace('.dropDuplicates(["order_id"])',''),'hidden',False),
])
def test_sales_real_spark(label,code,mode,passed):
    result=local_service().validate(SLUG,code,mode)
    assert result.passed is passed, (label,result.model_dump())
    if passed and mode=='sample':
        assert result.tests[0].actual_output.rows == [['2026-05-07',2,420.0]]


@pytest.mark.parametrize("payload", ["not json", "{}", '{"tests":[]}', '{"tests":[{}]}'])
def test_invalid_local_result_cannot_pass(monkeypatch, payload):
    monkeypatch.setattr(PysparkValidationService, '_run_worker', lambda *a, **k: subprocess.CompletedProcess(a, 0, payload, ''))
    with pytest.raises(PysparkValidationConfigurationError, match='invalid result'):
        local_service().validate(SLUG, REFERENCE, 'sample')


@pytest.mark.skipif(os.name != 'posix', reason='POSIX worker process-group contract')
def test_timeout_stops_worker_descendants(tmp_path):
    import sys
    import time
    sentinel = tmp_path / 'orphan-ran'
    child = f"import time; from pathlib import Path; time.sleep(0.8); Path({str(sentinel)!r}).write_text('orphan')"
    parent = f"import subprocess,sys,time; subprocess.Popen([sys.executable,'-c',{child!r}]); time.sleep(10)"
    with pytest.raises(subprocess.TimeoutExpired):
        PysparkValidationService._run_worker([sys.executable, '-c', parent], cwd=str(tmp_path), env=os.environ.copy(), timeout=0.3)
    time.sleep(1)
    assert not sentinel.exists(), 'Timed-out worker left a child executing'
