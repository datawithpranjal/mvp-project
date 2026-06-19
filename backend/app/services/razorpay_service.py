from __future__ import annotations

import hashlib
import hmac
import secrets
from typing import Any

import razorpay
from razorpay import errors as razorpay_errors

from app.core.config import get_settings


class RazorpayServiceError(RuntimeError):
    pass


class RazorpayConfigurationError(RazorpayServiceError):
    pass


class RazorpayAuthError(RazorpayServiceError):
    pass


class RazorpayValidationError(ValueError):
    pass


class RazorpayService:
    def __init__(self) -> None:
        settings = get_settings()
        self.key_id = settings.razorpay_key_id or ""
        self.key_secret = settings.razorpay_key_secret or ""

    def create_order(
        self,
        *,
        amount_paise: int,
        currency: str = "INR",
        receipt: str | None = None,
        notes: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        if amount_paise < 100:
            raise RazorpayValidationError("Amount must be at least 100 paise.")
        if len(currency) != 3:
            raise RazorpayValidationError("Currency must use a 3-letter code.")
        if not self.key_id or not self.key_secret:
            raise RazorpayConfigurationError("Razorpay credentials are not configured.")

        try:
            client = razorpay.Client(auth=(self.key_id, self.key_secret))
            return client.order.create(
                {
                    "amount": amount_paise,
                    "currency": currency.upper(),
                    "receipt": receipt,
                    "notes": notes or {},
                }
            )
        except razorpay_errors.BadRequestError as exc:
            if self._looks_like_auth_failure(exc):
                raise RazorpayAuthError("Razorpay authentication failed.") from exc
            raise RazorpayServiceError(f"Razorpay rejected the order request. {exc}") from exc
        except (razorpay_errors.GatewayError, razorpay_errors.ServerError) as exc:
            raise RazorpayServiceError(f"Razorpay order creation failed. {exc}") from exc
        except Exception as exc:
            raise RazorpayServiceError(f"Unable to create Razorpay order. {exc}") from exc

    def fetch_order(self, order_id: str) -> dict[str, Any]:
        if not order_id:
            raise RazorpayValidationError("Razorpay order id is required.")
        if not self.key_id or not self.key_secret:
            raise RazorpayConfigurationError("Razorpay credentials are not configured.")

        try:
            client = razorpay.Client(auth=(self.key_id, self.key_secret))
            return client.order.fetch(order_id)
        except razorpay_errors.BadRequestError as exc:
            if self._looks_like_auth_failure(exc):
                raise RazorpayAuthError("Razorpay authentication failed.") from exc
            raise RazorpayServiceError(f"Unable to fetch Razorpay order. {exc}") from exc
        except (razorpay_errors.GatewayError, razorpay_errors.ServerError) as exc:
            raise RazorpayServiceError(f"Unable to fetch Razorpay order. {exc}") from exc
        except Exception as exc:
            raise RazorpayServiceError(f"Unable to fetch Razorpay order. {exc}") from exc

    def fetch_payment(self, payment_id: str) -> dict[str, Any]:
        if not payment_id:
            raise RazorpayValidationError("Razorpay payment id is required.")
        if not self.key_id or not self.key_secret:
            raise RazorpayConfigurationError("Razorpay credentials are not configured.")

        try:
            client = razorpay.Client(auth=(self.key_id, self.key_secret))
            return client.payment.fetch(payment_id)
        except razorpay_errors.BadRequestError as exc:
            if self._looks_like_auth_failure(exc):
                raise RazorpayAuthError("Razorpay authentication failed.") from exc
            raise RazorpayServiceError(f"Unable to fetch Razorpay payment. {exc}") from exc
        except (razorpay_errors.GatewayError, razorpay_errors.ServerError) as exc:
            raise RazorpayServiceError(f"Unable to fetch Razorpay payment. {exc}") from exc
        except Exception as exc:
            raise RazorpayServiceError(f"Unable to fetch Razorpay payment. {exc}") from exc

    def verify_payment_signature(
        self,
        *,
        order_id: str,
        payment_id: str,
        razorpay_signature: str,
    ) -> bool:
        if not order_id or not payment_id or not razorpay_signature:
            raise RazorpayValidationError("Missing Razorpay payment verification fields.")
        if not self.key_secret:
            raise RazorpayConfigurationError("Razorpay key secret is not configured.")

        message = f"{order_id}|{payment_id}".encode("utf-8")
        generated_signature = hmac.new(
            self.key_secret.encode("utf-8"),
            message,
            hashlib.sha256,
        ).hexdigest()

        return secrets.compare_digest(generated_signature, razorpay_signature)

    @staticmethod
    def _looks_like_auth_failure(exc: Exception) -> bool:
        message = str(exc).lower()
        return any(keyword in message for keyword in ("auth", "unauthorized", "key id", "key_secret"))
