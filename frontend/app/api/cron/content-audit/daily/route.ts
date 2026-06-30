import { NextResponse } from "next/server";

import { getContentAuditCatalog } from "../../../../../lib/content-audit-catalog";
import type { ContentAuditBulkResponse, ContentAuditItem } from "../../../../../lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const AUDIT_CHUNK_SIZE = 50;

export async function GET(request: Request) {
  const isVercelCron = request.headers.get("x-vercel-cron") === "1";
  const cronSecret = process.env.CONTENT_AUDIT_CRON_SECRET;
  const authHeader = request.headers.get("authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

  if (!isVercelCron && (!cronSecret || bearerToken !== cronSecret)) {
    return NextResponse.json({ detail: "Unauthorized content audit cron request." }, { status: 401 });
  }

  const adminToken = process.env.ADMIN_API_TOKEN;
  const backendBaseUrl = (
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    process.env.NEXT_PUBLIC_BACKEND_URL ??
    "http://localhost:8000"
  ).replace(/\/$/, "");

  if (!adminToken) {
    return NextResponse.json(
      { detail: "ADMIN_API_TOKEN must be configured on the frontend project for daily audits." },
      { status: 503 }
    );
  }

  const catalog = getContentAuditCatalog();
  const errors: string[] = [];
  let audited = 0;
  let failed = 0;

  for (let index = 0; index < catalog.length; index += AUDIT_CHUNK_SIZE) {
    const chunk = catalog.slice(index, index + AUDIT_CHUNK_SIZE);
    try {
      const response = await runBackendAudit(backendBaseUrl, adminToken, chunk);
      audited += response.audited;
      failed += response.failed;
      errors.push(...response.errors);
    } catch (error) {
      failed += chunk.length;
      errors.push(
        `Chunk ${index + 1}-${Math.min(index + chunk.length, catalog.length)} failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  return NextResponse.json({
    audited,
    failed,
    total: catalog.length,
    errors
  });
}

async function runBackendAudit(
  backendBaseUrl: string,
  adminToken: string,
  items: ContentAuditItem[]
): Promise<ContentAuditBulkResponse> {
  const response = await fetch(`${backendBaseUrl}/api/v1/admin/content-audit/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Token": adminToken
    },
    body: JSON.stringify({ items })
  });

  if (!response.ok) {
    let message = `Backend audit failed with status ${response.status}`;
    try {
      const body = await response.json();
      if (typeof body.detail === "string") {
        message = body.detail;
      }
    } catch {
      // Keep the HTTP status message when the backend does not return JSON.
    }
    throw new Error(message);
  }

  return response.json() as Promise<ContentAuditBulkResponse>;
}
