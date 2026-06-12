from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any


PLAN_CATALOG = {
    "monthly": {
        "plan_label": "Premium Monthly",
        "amount_inr": 219,
    },
    "yearly": {
        "plan_label": "Premium Annual",
        "amount_inr": 500,
    },
}

COUPON_CODE_PATTERN = re.compile(r"^[A-Z0-9_-]{3,64}$")


class CouponValidationError(ValueError):
    pass


class CouponConfigurationError(RuntimeError):
    pass


@dataclass(frozen=True)
class CouponQuote:
    plan_label: str
    billing_interval: str
    original_amount_inr: int
    discount_amount_inr: int
    final_amount_inr: int
    coupon_code: str | None
    coupon_description: str | None
    discount_label: str | None

    def as_dict(self) -> dict[str, object]:
        return asdict(self)


class CouponService:
    def __init__(self, catalog_path: Path | None = None) -> None:
        self.catalog_path = catalog_path or (
            Path(__file__).resolve().parents[1] / "data" / "premium_coupons.json"
        )

    def quote(self, billing_interval: str, coupon_code: str | None = None) -> CouponQuote:
        plan = PLAN_CATALOG.get(billing_interval)
        if not plan:
            raise CouponValidationError("Choose a valid premium plan.")

        original_amount = int(plan["amount_inr"])
        normalized_code = self.normalize_code(coupon_code)
        if not normalized_code:
            return CouponQuote(
                plan_label=str(plan["plan_label"]),
                billing_interval=billing_interval,
                original_amount_inr=original_amount,
                discount_amount_inr=0,
                final_amount_inr=original_amount,
                coupon_code=None,
                coupon_description=None,
                discount_label=None,
            )

        coupon = self._find_coupon(normalized_code)
        self._validate_coupon(coupon, billing_interval)
        final_amount = self._calculate_final_amount(original_amount, coupon)
        discount_amount = original_amount - final_amount

        discount_type = coupon["discount_type"]
        discount_value = int(coupon["discount_value"])
        discount_label = (
            f"{discount_value}% off"
            if discount_type == "percent"
            else f"Rs {discount_value} off"
        )

        return CouponQuote(
            plan_label=str(plan["plan_label"]),
            billing_interval=billing_interval,
            original_amount_inr=original_amount,
            discount_amount_inr=discount_amount,
            final_amount_inr=final_amount,
            coupon_code=normalized_code,
            coupon_description=str(coupon.get("description") or "Coupon applied"),
            discount_label=discount_label,
        )

    @staticmethod
    def normalize_code(coupon_code: str | None) -> str:
        if not coupon_code:
            return ""
        normalized = coupon_code.strip().upper()
        if normalized and not COUPON_CODE_PATTERN.fullmatch(normalized):
            raise CouponValidationError("Enter a valid coupon code.")
        return normalized

    def _find_coupon(self, normalized_code: str) -> dict[str, Any]:
        for coupon in self._load_catalog():
            if self.normalize_code(str(coupon.get("code", ""))) == normalized_code:
                return coupon
        raise CouponValidationError("This coupon code is invalid.")

    def _load_catalog(self) -> list[dict[str, Any]]:
        try:
            payload = json.loads(self.catalog_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise CouponConfigurationError("Coupon catalog could not be loaded.") from exc

        if not isinstance(payload, list):
            raise CouponConfigurationError("Coupon catalog must contain a JSON array.")
        return [coupon for coupon in payload if isinstance(coupon, dict)]

    def _validate_coupon(
        self,
        coupon: dict[str, Any],
        billing_interval: str,
    ) -> None:
        if coupon.get("active") is not True:
            raise CouponValidationError("This coupon is no longer active.")

        applies_to = coupon.get("applies_to")
        if not isinstance(applies_to, list) or billing_interval not in applies_to:
            raise CouponValidationError("This coupon does not apply to the selected plan.")

        now = datetime.now(timezone.utc)
        starts_at = self._parse_optional_datetime(coupon.get("starts_at"))
        expires_at = self._parse_optional_datetime(coupon.get("expires_at"))
        if starts_at and now < starts_at:
            raise CouponValidationError("This coupon is not active yet.")
        if expires_at and now > expires_at:
            raise CouponValidationError("This coupon has expired.")

        discount_type = coupon.get("discount_type")
        discount_value = coupon.get("discount_value")
        if discount_type not in {"percent", "fixed"} or not isinstance(discount_value, int):
            raise CouponConfigurationError("Coupon discount configuration is invalid.")
        if discount_type == "percent" and not 1 <= discount_value <= 100:
            raise CouponConfigurationError("Coupon percentage must be between 1 and 100.")
        if discount_type == "fixed" and discount_value < 1:
            raise CouponConfigurationError("Fixed coupon discount must be positive.")

    @staticmethod
    def _parse_optional_datetime(value: object) -> datetime | None:
        if not value:
            return None
        if not isinstance(value, str):
            raise CouponConfigurationError("Coupon dates must use ISO-8601 strings.")
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise CouponConfigurationError("Coupon date configuration is invalid.") from exc
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)

    @staticmethod
    def _calculate_final_amount(
        original_amount: int,
        coupon: dict[str, Any],
    ) -> int:
        discount_value = Decimal(int(coupon["discount_value"]))
        original = Decimal(original_amount)
        if coupon["discount_type"] == "percent":
            final = original * (Decimal(100) - discount_value) / Decimal(100)
        else:
            final = original - discount_value
        return max(0, int(final.quantize(Decimal("1"), rounding=ROUND_HALF_UP)))
