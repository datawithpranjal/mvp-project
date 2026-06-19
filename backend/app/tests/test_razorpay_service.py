import hashlib
import hmac

import pytest

from app.core.config import get_settings
from app.services.razorpay_service import RazorpayService, RazorpayValidationError


@pytest.fixture(autouse=True)
def reset_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_verify_payment_signature_accepts_valid_hmac(monkeypatch):
    monkeypatch.setenv("RAZORPAY_KEY_ID", "rzp_test_unit")
    monkeypatch.setenv("RAZORPAY_KEY_SECRET", "unit_secret")
    service = RazorpayService()

    signature = hmac.new(
        b"unit_secret",
        b"order_unit|pay_unit",
        hashlib.sha256,
    ).hexdigest()

    assert service.verify_payment_signature(
        order_id="order_unit",
        payment_id="pay_unit",
        razorpay_signature=signature,
    )


def test_verify_payment_signature_rejects_tampered_signature(monkeypatch):
    monkeypatch.setenv("RAZORPAY_KEY_ID", "rzp_test_unit")
    monkeypatch.setenv("RAZORPAY_KEY_SECRET", "unit_secret")
    service = RazorpayService()

    assert not service.verify_payment_signature(
        order_id="order_unit",
        payment_id="pay_unit",
        razorpay_signature="bad_signature",
    )


def test_verify_payment_signature_requires_all_fields(monkeypatch):
    monkeypatch.setenv("RAZORPAY_KEY_ID", "rzp_test_unit")
    monkeypatch.setenv("RAZORPAY_KEY_SECRET", "unit_secret")
    service = RazorpayService()

    with pytest.raises(RazorpayValidationError):
        service.verify_payment_signature(
            order_id="",
            payment_id="pay_unit",
            razorpay_signature="signature",
        )
