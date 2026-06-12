import os
from pathlib import Path
import sys

os.environ["ENVIRONMENT"] = "test"
os.environ["AUTH_ALLOW_DEMO_OTP"] = "true"
os.environ["AUTH_SHOW_DEBUG_OTP"] = "true"
os.environ["POSTGRES_URL"] = (
    "postgresql://postgres:postgres@postgres:5432/scenario_playground"
)

BACKEND_ROOT = Path(__file__).resolve().parents[2]

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))
