from fastapi.testclient import TestClient

from app.api.routes import content_audit as content_audit_route
from app.core.config import DEFAULT_POSTGRES_URL
from app.main import app
from app.services.content_audit_service import ContentAuditService

client = TestClient(app)


def test_content_audit_admin_flow(monkeypatch, tmp_path) -> None:
    store = ContentAuditService(
        storage_path=tmp_path / "content-audits.json",
        postgres_url=DEFAULT_POSTGRES_URL,
    )
    monkeypatch.setattr(content_audit_route, "content_audit_service", store)
    monkeypatch.setattr(content_audit_route.settings, "admin_api_token", "test-admin-token")

    unauthorized = client.get("/api/v1/admin/content-audit")
    assert unauthorized.status_code == 401

    payload = {
        "content_id": "coding--sql--missing-fields",
        "content_type": "sql_coding_lab",
        "title": "SQL problem",
        "slug": "missing-fields",
        "topic": "SQL",
        "difficulty": "beginner",
        "tags": ["SQL"],
        "problem_statement": "Find customers with no orders from the seeded tables.",
        "expected_output": "",
        "solution": "",
        "explanation": "",
        "body": "Short body",
        "internal_links": [],
        "prerequisites": [],
        "estimated_minutes": None,
        "metadata": {"source": "test"},
    }

    audit_response = client.post(
        "/api/v1/admin/content-audit/coding--sql--missing-fields",
        json=payload,
        headers={"X-Admin-Token": "test-admin-token"},
    )
    assert audit_response.status_code == 200
    detail = audit_response.json()
    assert detail["run"]["audit_score"] < 100
    assert any(issue["severity"] == "critical" for issue in detail["issues"])

    summary_response = client.get(
        "/api/v1/admin/content-audit",
        headers={"X-Admin-Token": "test-admin-token"},
    )
    assert summary_response.status_code == 200
    summary = summary_response.json()
    assert summary["total_audited_content"] == 1
    assert summary["critical_issues"] >= 1

    issue_id = detail["issues"][0]["id"]
    update_response = client.patch(
        f"/api/v1/admin/content-audit/coding--sql--missing-fields/issues/{issue_id}",
        json={"status": "ignored"},
        headers={"X-Admin-Token": "test-admin-token"},
    )
    assert update_response.status_code == 200
    updated_issue = next(
        issue for issue in update_response.json()["issues"] if issue["id"] == issue_id
    )
    assert updated_issue["status"] == "ignored"


def test_content_audit_bulk_run(monkeypatch, tmp_path) -> None:
    store = ContentAuditService(
        storage_path=tmp_path / "content-audits.json",
        postgres_url=DEFAULT_POSTGRES_URL,
    )
    monkeypatch.setattr(content_audit_route, "content_audit_service", store)
    monkeypatch.setattr(content_audit_route.settings, "admin_api_token", "test-admin-token")

    response = client.post(
        "/api/v1/admin/content-audit/run",
        json={
            "items": [
                {
                    "content_id": "scenario--healthy",
                    "content_type": "scenario",
                    "title": "Late Arriving Fact Partition Fix",
                    "slug": "late-arriving-fact-partition-fix",
                    "topic": "Data Quality",
                    "difficulty": "intermediate",
                    "tags": ["Watermark", "Partitions", "Reconciliation"],
                    "problem_statement": "A revenue dashboard misses late arriving orders.",
                    "expected_output": "Correct partition repair strategy.",
                    "solution": "Reprocess affected partitions and add reconciliation checks.",
                    "explanation": "The fix handles late events safely and prevents silent drift.",
                    "body": "A detailed practical scenario with logs, symptoms, expected behavior, trade-offs, and monitoring.",
                    "internal_links": ["/roadmap"],
                    "prerequisites": ["Incremental loading"],
                    "estimated_minutes": 20,
                    "metadata": {"source": "test"},
                }
            ]
        },
        headers={"X-Admin-Token": "test-admin-token"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["audited"] == 1
    assert payload["failed"] == 0
