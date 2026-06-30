from typing import Any, Literal

from pydantic import BaseModel, Field

AuditSeverity = Literal["critical", "warning", "suggestion"]
AuditIssueStatus = Literal["open", "fixed", "ignored"]


class ContentAuditItem(BaseModel):
    content_id: str
    content_type: str = "unknown"
    title: str | None = None
    slug: str | None = None
    topic: str | None = None
    difficulty: str | None = None
    tags: list[str] = Field(default_factory=list)
    problem_statement: str | None = None
    expected_output: str | None = None
    solution: str | None = None
    explanation: str | None = None
    body: str | None = None
    internal_links: list[str] = Field(default_factory=list)
    prerequisites: list[str] = Field(default_factory=list)
    estimated_minutes: int | None = None
    updated_at: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ContentAuditIssue(BaseModel):
    id: str
    run_id: str
    content_id: str
    severity: AuditSeverity
    category: str
    issue: str
    suggestion: str
    status: AuditIssueStatus = "open"
    created_at: str
    updated_at: str


class ContentAuditRun(BaseModel):
    id: str
    content_id: str
    content_type: str
    title: str
    slug: str
    topic: str
    difficulty: str
    tags: list[str] = Field(default_factory=list)
    audit_score: int
    issue_counts: dict[str, int]
    content_hash: str
    audited_at: str
    source_updated_at: str | None = None


class ContentAuditDetailResponse(BaseModel):
    storage_backend: Literal["postgres", "file"]
    table_exists: bool
    run: ContentAuditRun | None
    issues: list[ContentAuditIssue] = Field(default_factory=list)


class ContentAuditSummaryResponse(BaseModel):
    storage_backend: Literal["postgres", "file"]
    table_exists: bool
    total_audited_content: int
    average_audit_score: float
    critical_issues: int
    warning_issues: int
    suggestion_issues: int
    items: list[ContentAuditRun] = Field(default_factory=list)


class ContentAuditBulkRequest(BaseModel):
    items: list[ContentAuditItem]


class ContentAuditBulkResponse(BaseModel):
    audited: int
    failed: int
    items: list[ContentAuditRun] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)


class ContentAuditStatusUpdateRequest(BaseModel):
    status: AuditIssueStatus
