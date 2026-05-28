from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path

from app.core.config import get_settings
from app.schemas.email_capture import EmailCaptureRequest, EmailCaptureResponse


class EmailCaptureStore:
    def __init__(self, storage_path: Path | None = None) -> None:
        settings = get_settings()
        self.storage_path = storage_path or Path(settings.email_capture_store_path)

    def capture(self, payload: EmailCaptureRequest) -> EmailCaptureResponse:
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        record = {
            "email": payload.email,
            "source": payload.source,
            "scenario_slug": payload.scenario_slug,
            "captured_at": datetime.now(timezone.utc).isoformat(),
        }
        with self.storage_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record) + "\n")

        return EmailCaptureResponse(
            captured=True,
            email=payload.email,
            unlocked_premium=True,
        )
