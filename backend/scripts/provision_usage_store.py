"""Operator-only pre-traffic usage provisioning; never imported by app startup."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.usage_store import UsageStore, UsageStoreError


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check-only", action="store_true", help="Read-only schema readiness check.")
    mode.add_argument("--provision", action="store_true", help="Explicitly create a missing usage schema before traffic.")
    args = parser.parse_args(argv)
    try:
        created = UsageStore().provision_postgres(check_only=args.check_only)
    except UsageStoreError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except Exception:
        # Settings/driver failures must not print environment values or credentials.
        print("Usage provisioning could not start; check configuration without logging credentials.", file=sys.stderr)
        return 1
    print("Usage schema created and verified." if created else "Usage schema verified; no DDL applied.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
