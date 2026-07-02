from datetime import datetime, timedelta, timezone

import pytest

from app.services.premium_access_service import PremiumAccessService, PremiumAccessServiceError


def test_yearly_premium_grant_expires_after_one_year() -> None:
    service = PremiumAccessService(postgres_url="")
    email = "yearly.student@example.com"

    grant = service.grant_manual_access(
        email=email,
        plan_label="Premium Annual",
        billing_interval="yearly",
        amount_inr=999,
        payment_reference="pay_test_yearly",
    )

    assert service.has_access(email) is True
    assert grant["expires_at"] - grant["granted_at"] == timedelta(days=365)


def test_monthly_premium_grant_expires_after_thirty_days() -> None:
    service = PremiumAccessService(postgres_url="")
    email = "monthly.student@example.com"

    grant = service.grant_manual_access(
        email=email,
        plan_label="Premium Monthly",
        billing_interval="monthly",
        amount_inr=199,
        payment_reference="pay_test_monthly",
    )

    assert service.has_access(email) is True
    assert grant["expires_at"] - grant["granted_at"] == timedelta(days=30)


def test_expired_premium_grant_is_not_accepted() -> None:
    service = PremiumAccessService(postgres_url="")
    email = "expired.student@example.com"
    service.grant_manual_access(
        email=email,
        plan_label="Premium Monthly",
        billing_interval="monthly",
        amount_inr=199,
        payment_reference="pay_test_expired",
    )
    service._memory_grants[email]["expires_at"] = datetime.now(timezone.utc) - timedelta(
        minutes=1
    )

    assert service.has_access(email) is False
    assert service.get_access(email) is None


def test_successful_grant_records_purchase_details() -> None:
    service = PremiumAccessService(postgres_url="")
    email = "buyer.student@example.com"

    service.grant_manual_access(
        email=email,
        plan_label="Premium Annual",
        billing_interval="yearly",
        amount_inr=500,
        payment_reference="pay_purchase_record",
        original_amount_inr=999,
        discount_amount_inr=499,
        coupon_code="first50",
        payment_provider="razorpay",
        provider_order_id="order_purchase_record",
        provider_payment_id="pay_purchase_record",
    )

    purchases = service.list_purchase_records(email)

    assert len(purchases) == 1
    purchase = purchases[0]
    assert purchase["email"] == email
    assert purchase["plan_label"] == "Premium Annual"
    assert purchase["amount_inr"] == 500
    assert purchase["original_amount_inr"] == 999
    assert purchase["discount_amount_inr"] == 499
    assert purchase["coupon_code"] == "FIRST50"
    assert purchase["payment_provider"] == "razorpay"
    assert purchase["provider_order_id"] == "order_purchase_record"
    assert purchase["provider_payment_id"] == "pay_purchase_record"
    assert purchase["access_expires_at"] - purchase["purchased_at"] == timedelta(days=365)


def test_duplicate_payment_reference_does_not_overwrite_purchase_record() -> None:
    service = PremiumAccessService(postgres_url="")
    email = "duplicate.student@example.com"

    first_grant = service.grant_manual_access(
        email=email,
        plan_label="Premium Annual",
        billing_interval="yearly",
        amount_inr=999,
        payment_reference="pay_duplicate_replay",
        payment_provider="razorpay",
        provider_order_id="order_original",
        provider_payment_id="pay_duplicate_replay",
    )
    replayed_grant = service.grant_manual_access(
        email=email,
        plan_label="Premium Monthly",
        billing_interval="monthly",
        amount_inr=199,
        payment_reference="pay_duplicate_replay",
        payment_provider="razorpay",
        provider_order_id="order_replayed",
        provider_payment_id="pay_duplicate_replay",
    )

    purchases = service.list_purchase_records(email)

    assert len(purchases) == 1
    assert replayed_grant["expires_at"] == first_grant["expires_at"]
    assert purchases[0]["plan_label"] == "Premium Annual"
    assert purchases[0]["billing_interval"] == "yearly"
    assert purchases[0]["amount_inr"] == 999
    assert purchases[0]["provider_order_id"] == "order_original"


def test_duplicate_payment_reference_cannot_be_reassigned_to_another_email() -> None:
    service = PremiumAccessService(postgres_url="")

    service.grant_manual_access(
        email="first.owner@example.com",
        plan_label="Premium Annual",
        billing_interval="yearly",
        amount_inr=999,
        payment_reference="pay_reassignment_blocked",
        payment_provider="razorpay",
    )

    with pytest.raises(PremiumAccessServiceError):
        service.grant_manual_access(
            email="second.owner@example.com",
            plan_label="Premium Annual",
            billing_interval="yearly",
            amount_inr=999,
            payment_reference="pay_reassignment_blocked",
            payment_provider="razorpay",
        )
