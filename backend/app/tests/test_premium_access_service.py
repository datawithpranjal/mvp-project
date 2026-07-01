from datetime import datetime, timedelta, timezone

from app.services.premium_access_service import PremiumAccessService


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
