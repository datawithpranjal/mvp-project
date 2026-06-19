from datetime import datetime, timedelta, timezone

from app.services.premium_access_service import PremiumAccessService


def test_yearly_premium_grant_expires_after_one_year() -> None:
    service = PremiumAccessService(postgres_url="")
    email = "yearly.student@example.com"

    grant = service.grant_manual_access(
        email=email,
        plan_label="Premium Annual",
        billing_interval="yearly",
        amount_inr=500,
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
        amount_inr=219,
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
        amount_inr=219,
        payment_reference="pay_test_expired",
    )
    service._memory_grants[email]["expires_at"] = datetime.now(timezone.utc) - timedelta(
        minutes=1
    )

    assert service.has_access(email) is False
    assert service.get_access(email) is None
