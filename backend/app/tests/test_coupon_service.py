import json
from pathlib import Path

import pytest

from app.services.coupon_service import CouponService, CouponValidationError


def write_catalog(tmp_path: Path, coupons: list[dict[str, object]]) -> Path:
    catalog_path = tmp_path / "coupons.json"
    catalog_path.write_text(json.dumps(coupons), encoding="utf-8")
    return catalog_path


def test_percentage_coupon_calculates_annual_and_monthly_prices(tmp_path: Path) -> None:
    service = CouponService(
        write_catalog(
            tmp_path,
            [
                {
                    "code": "SAVE50",
                    "description": "Half price",
                    "discount_type": "percent",
                    "discount_value": 50,
                    "active": True,
                    "applies_to": ["monthly", "yearly"],
                }
            ],
        )
    )

    annual = service.quote("yearly", "save50")
    monthly = service.quote("monthly", "SAVE50")

    assert annual.original_amount_inr == 999
    assert annual.discount_amount_inr == 499
    assert annual.final_amount_inr == 500
    assert annual.coupon_code == "SAVE50"
    assert monthly.original_amount_inr == 199
    assert monthly.discount_amount_inr == 99
    assert monthly.final_amount_inr == 100


def test_coupon_can_be_limited_to_one_plan(tmp_path: Path) -> None:
    service = CouponService(
        write_catalog(
            tmp_path,
            [
                {
                    "code": "YEARONLY",
                    "discount_type": "fixed",
                    "discount_value": 100,
                    "active": True,
                    "applies_to": ["yearly"],
                }
            ],
        )
    )

    assert service.quote("yearly", "YEARONLY").final_amount_inr == 899
    with pytest.raises(CouponValidationError, match="selected plan"):
        service.quote("monthly", "YEARONLY")


def test_invalid_coupon_is_rejected(tmp_path: Path) -> None:
    service = CouponService(write_catalog(tmp_path, []))

    with pytest.raises(CouponValidationError, match="invalid"):
        service.quote("yearly", "NOTREAL")
