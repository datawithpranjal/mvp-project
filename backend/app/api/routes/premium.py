import secrets
import time
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.routes.auth import auth_error_response, bearer_token
from app.core.config import get_settings
from app.services.auth_service import AuthService, AuthServiceError
from app.services.coupon_service import (
    CouponConfigurationError,
    CouponService,
    CouponValidationError,
)
from app.services.premium_access_service import PremiumAccessService, PremiumAccessServiceError
from app.services.razorpay_service import (
    RazorpayAuthError,
    RazorpayConfigurationError,
    RazorpayService,
    RazorpayServiceError,
    RazorpayValidationError,
)

router = APIRouter(tags=["premium"])
auth_service = AuthService()
premium_access_service = PremiumAccessService()
coupon_service = CouponService()
razorpay_service = RazorpayService()
settings = get_settings()


class PremiumManualUnlockRequest(BaseModel):
    plan_label: str = Field(min_length=1, max_length=120)
    billing_interval: str = Field(pattern="^(monthly|yearly)$")
    amount_inr: int = Field(ge=0, le=100000)
    payment_reference: str = Field(min_length=1, max_length=160)
    coupon_code: str | None = Field(default=None, max_length=64)


class CouponValidationRequest(BaseModel):
    billing_interval: str = Field(pattern="^(monthly|yearly)$")
    coupon_code: str = Field(min_length=3, max_length=64)


class AdminPremiumGrantRequest(PremiumManualUnlockRequest):
    email: str = Field(min_length=3, max_length=254)


class RazorpayCreateOrderRequest(BaseModel):
    amount: int | None = Field(default=None, ge=100, le=10_000_000)
    currency: str = Field(default="INR", min_length=3, max_length=3)
    receipt: str | None = Field(default=None, max_length=40)
    billing_interval: str | None = Field(default=None, pattern="^(monthly|yearly)$")
    coupon_code: str | None = Field(default=None, max_length=64)


class RazorpayVerifyPaymentRequest(BaseModel):
    razorpay_payment_id: str | None = Field(default=None, max_length=120)
    razorpay_order_id: str | None = Field(default=None, max_length=120)
    razorpay_signature: str | None = Field(default=None, max_length=256)
    billing_interval: str | None = Field(default=None, pattern="^(monthly|yearly)$")
    amount_inr: int | None = Field(default=None, ge=0, le=100000)
    coupon_code: str | None = Field(default=None, max_length=64)


def _isoformat(value: object) -> str:
    if hasattr(value, "isoformat"):
        return str(value.isoformat())
    return str(value)


def _premium_grant_payload(record: dict[str, object]) -> dict[str, object]:
    return {
        "plan_label": record["plan_label"],
        "billing_interval": record["billing_interval"],
        "amount_inr": record["amount_inr"],
        "payment_reference": record["payment_reference"],
        "granted_at": _isoformat(record["granted_at"]),
        "expires_at": _isoformat(record["expires_at"]),
    }


@router.get("/api/v1/premium/status")
@router.get("/v1/premium/status")
def get_premium_status(
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, object]:
    try:
        profile = auth_service.get_profile(bearer_token(authorization))
        active_grant = premium_access_service.get_access(profile.email)
        if not active_grant:
            return {
                "unlocked_premium": False,
                "email": profile.email,
            }
        return {
            "unlocked_premium": True,
            "email": profile.email,
            **_premium_grant_payload(active_grant),
        }
    except AuthServiceError as exc:
        raise auth_error_response(exc) from exc
    except PremiumAccessServiceError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Premium access is temporarily unavailable. {exc}",
        ) from exc


@router.post("/api/v1/premium/coupons/validate")
@router.post("/v1/premium/coupons/validate")
def validate_premium_coupon(
    payload: CouponValidationRequest,
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, object]:
    try:
        auth_service.get_profile(bearer_token(authorization))
        return coupon_service.quote(
            payload.billing_interval,
            payload.coupon_code,
        ).as_dict()
    except AuthServiceError as exc:
        raise auth_error_response(exc) from exc
    except CouponValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except CouponConfigurationError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Coupon validation is temporarily unavailable. {exc}",
        ) from exc


@router.post("/api/create-order")
@router.post("/api/v1/premium/razorpay/create-order")
@router.post("/v1/premium/razorpay/create-order")
def create_razorpay_order(
    payload: RazorpayCreateOrderRequest,
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, object]:
    try:
        profile = auth_service.get_profile(bearer_token(authorization))
        quote = None
        amount_paise = payload.amount
        receipt = payload.receipt
        notes = {
            "customer_email": profile.email,
            "source": "the-data-foundry-premium",
        }

        if payload.billing_interval:
            quote = coupon_service.quote(
                payload.billing_interval,
                payload.coupon_code,
            )
            amount_paise = quote.final_amount_inr * 100
            receipt = receipt or f"tdf-{payload.billing_interval}-{int(time.time())}"
            notes.update(
                {
                    "plan": quote.plan_label,
                    "billing_interval": quote.billing_interval,
                    "coupon_code": quote.coupon_code or "",
                }
            )

        if amount_paise is None:
            raise RazorpayValidationError("Amount is required to create a Razorpay order.")

        order = razorpay_service.create_order(
            amount_paise=amount_paise,
            currency=payload.currency,
            receipt=receipt,
            notes=notes,
        )
        if not order.get("id"):
            raise RazorpayServiceError("Razorpay did not return an order id.")
        response: dict[str, object] = {
            "key_id": razorpay_service.key_id,
            "order_id": str(order.get("id")),
            "amount": int(order.get("amount", amount_paise)),
            "currency": str(order.get("currency", payload.currency)).upper(),
            "receipt": str(order.get("receipt") or receipt or ""),
        }
        if quote:
            response.update(quote.as_dict())
        return response
    except AuthServiceError as exc:
        raise auth_error_response(exc) from exc
    except CouponValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except CouponConfigurationError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Coupon validation is temporarily unavailable. {exc}",
        ) from exc
    except RazorpayValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RazorpayAuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except RazorpayConfigurationError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Razorpay checkout is not configured. {exc}",
        ) from exc
    except RazorpayServiceError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unable to create Razorpay order. {exc}",
        ) from exc


@router.post("/api/verify-payment")
@router.post("/api/v1/premium/razorpay/verify-payment")
@router.post("/v1/premium/razorpay/verify-payment")
def verify_razorpay_payment(
    payload: RazorpayVerifyPaymentRequest,
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, object]:
    missing_fields = [
        field_name
        for field_name, value in {
            "razorpay_payment_id": payload.razorpay_payment_id,
            "razorpay_order_id": payload.razorpay_order_id,
            "razorpay_signature": payload.razorpay_signature,
        }.items()
        if not value
    ]
    if missing_fields:
        raise HTTPException(
            status_code=400,
            detail=f"Missing payment field(s): {', '.join(missing_fields)}.",
        )

    try:
        profile = auth_service.get_profile(bearer_token(authorization))
        is_valid_signature = razorpay_service.verify_payment_signature(
            order_id=payload.razorpay_order_id or "",
            payment_id=payload.razorpay_payment_id or "",
            razorpay_signature=payload.razorpay_signature or "",
        )
        if not is_valid_signature:
            raise HTTPException(status_code=400, detail="Payment signature verification failed.")

        if not payload.billing_interval:
            return {
                "verified": True,
                "unlocked_premium": False,
                "message": "Payment signature verified.",
            }

        quote = coupon_service.quote(
            payload.billing_interval,
            payload.coupon_code,
        )
        if payload.amount_inr is not None and payload.amount_inr != quote.final_amount_inr:
            raise HTTPException(
                status_code=400,
                detail="The verified payment amount does not match the selected premium plan.",
            )

        expected_amount_paise = quote.final_amount_inr * 100
        razorpay_order = razorpay_service.fetch_order(payload.razorpay_order_id or "")
        razorpay_payment = razorpay_service.fetch_payment(payload.razorpay_payment_id or "")
        order_amount = int(razorpay_order.get("amount", 0))
        payment_amount = int(razorpay_payment.get("amount", 0))
        order_currency = str(razorpay_order.get("currency", "")).upper()
        payment_order_id = str(razorpay_payment.get("order_id", ""))
        payment_status = str(razorpay_payment.get("status", "")).lower()

        if order_amount != expected_amount_paise or payment_amount != expected_amount_paise:
            raise HTTPException(
                status_code=400,
                detail="The Razorpay payment amount does not match the selected premium plan.",
            )
        if order_currency != "INR":
            raise HTTPException(status_code=400, detail="Unsupported Razorpay payment currency.")
        if payment_order_id != payload.razorpay_order_id:
            raise HTTPException(
                status_code=400,
                detail="Razorpay payment does not belong to the verified order.",
            )
        if payment_status not in {"authorized", "captured"}:
            raise HTTPException(
                status_code=400,
                detail="Razorpay payment is not authorized or captured yet.",
            )

        premium_grant = premium_access_service.grant_manual_access(
            email=profile.email,
            plan_label=quote.plan_label,
            billing_interval=quote.billing_interval,
            amount_inr=quote.final_amount_inr,
            payment_reference=payload.razorpay_payment_id or "",
            original_amount_inr=quote.original_amount_inr,
            discount_amount_inr=quote.discount_amount_inr,
            coupon_code=quote.coupon_code,
            payment_provider="razorpay",
            provider_order_id=payload.razorpay_order_id,
            provider_payment_id=payload.razorpay_payment_id,
            currency=order_currency,
        )
        return {
            "verified": True,
            "unlocked_premium": True,
            "email": profile.email,
            **quote.as_dict(),
            "granted_at": _isoformat(premium_grant["granted_at"]),
            "expires_at": _isoformat(premium_grant["expires_at"]),
        }
    except HTTPException:
        raise
    except AuthServiceError as exc:
        raise auth_error_response(exc) from exc
    except CouponValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except CouponConfigurationError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Coupon validation is temporarily unavailable. {exc}",
        ) from exc
    except RazorpayValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RazorpayAuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except RazorpayConfigurationError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Razorpay checkout is not configured. {exc}",
        ) from exc
    except RazorpayServiceError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unable to verify Razorpay payment. {exc}",
        ) from exc
    except PremiumAccessServiceError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Premium access is temporarily unavailable. {exc}",
        ) from exc


@router.post("/api/v1/premium/manual-unlock")
@router.post("/v1/premium/manual-unlock")
def submit_manual_premium_payment_request(
    payload: PremiumManualUnlockRequest,
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, object]:
    try:
        profile = auth_service.get_profile(bearer_token(authorization))
        quote = coupon_service.quote(
            payload.billing_interval,
            payload.coupon_code,
        )
        if payload.plan_label != quote.plan_label:
            raise CouponValidationError("The selected plan details are invalid.")
        if payload.amount_inr != quote.final_amount_inr:
            raise CouponValidationError(
                "The payable amount changed. Apply the coupon again before submitting."
            )
        if quote.final_amount_inr == 0:
            premium_grant = premium_access_service.grant_manual_access(
                email=profile.email,
                plan_label=quote.plan_label,
                billing_interval=payload.billing_interval,
                amount_inr=quote.final_amount_inr,
                payment_reference=payload.payment_reference,
                original_amount_inr=quote.original_amount_inr,
                discount_amount_inr=quote.discount_amount_inr,
                coupon_code=quote.coupon_code,
                payment_provider="coupon",
            )
            return {
                "submitted": True,
                "pending_review": False,
                "unlocked_premium": True,
                "email": profile.email,
                **quote.as_dict(),
                "granted_at": _isoformat(premium_grant["granted_at"]),
                "expires_at": _isoformat(premium_grant["expires_at"]),
            }

        premium_access_service.submit_manual_payment_request(
            email=profile.email,
            plan_label=quote.plan_label,
            billing_interval=payload.billing_interval,
            amount_inr=quote.final_amount_inr,
            payment_reference=payload.payment_reference,
            original_amount_inr=quote.original_amount_inr,
            discount_amount_inr=quote.discount_amount_inr,
            coupon_code=quote.coupon_code,
        )
        return {
            "submitted": True,
            "pending_review": True,
            "unlocked_premium": False,
            "email": profile.email,
            **quote.as_dict(),
        }
    except AuthServiceError as exc:
        raise auth_error_response(exc) from exc
    except CouponValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except CouponConfigurationError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Coupon validation is temporarily unavailable. {exc}",
        ) from exc
    except PremiumAccessServiceError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Premium access is temporarily unavailable. {exc}",
        ) from exc


@router.post("/api/v1/admin/premium/manual-grant")
@router.post("/v1/admin/premium/manual-grant")
def grant_manual_premium_access(
    payload: AdminPremiumGrantRequest,
    x_admin_token: Annotated[str | None, Header()] = None,
) -> dict[str, object]:
    _require_admin_token(x_admin_token)

    try:
        premium_grant = premium_access_service.grant_manual_access(
            email=payload.email,
            plan_label=payload.plan_label,
            billing_interval=payload.billing_interval,
            amount_inr=payload.amount_inr,
            payment_reference=payload.payment_reference,
            coupon_code=payload.coupon_code,
            payment_provider="manual",
        )
        return {
            "unlocked_premium": True,
            "email": payload.email.strip().lower(),
            **_premium_grant_payload(premium_grant),
        }
    except PremiumAccessServiceError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Premium access is temporarily unavailable. {exc}",
        ) from exc


@router.get("/api/v1/admin/premium/purchases")
@router.get("/v1/admin/premium/purchases")
def list_premium_purchase_records(
    x_admin_token: Annotated[str | None, Header()] = None,
    email: Annotated[str | None, Query(max_length=254)] = None,
) -> dict[str, object]:
    _require_admin_token(x_admin_token)

    try:
        records = premium_access_service.list_purchase_records(email)
        return {
            "count": len(records),
            "records": [
                {
                    "email": record["email"],
                    "plan_label": record["plan_label"],
                    "billing_interval": record["billing_interval"],
                    "amount_inr": record["amount_inr"],
                    "original_amount_inr": record["original_amount_inr"],
                    "discount_amount_inr": record["discount_amount_inr"],
                    "coupon_code": record["coupon_code"],
                    "payment_provider": record["payment_provider"],
                    "payment_reference": record["payment_reference"],
                    "provider_order_id": record["provider_order_id"],
                    "provider_payment_id": record["provider_payment_id"],
                    "currency": record["currency"],
                    "purchase_status": record["purchase_status"],
                    "purchased_at": _isoformat(record["purchased_at"]),
                    "access_expires_at": _isoformat(record["access_expires_at"]),
                }
                for record in records
            ],
        }
    except PremiumAccessServiceError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Premium purchase records are temporarily unavailable. {exc}",
        ) from exc


def _require_admin_token(x_admin_token: str | None) -> None:
    if not settings.admin_api_token:
        raise HTTPException(
            status_code=503,
            detail="Admin premium access is not configured.",
        )

    if not x_admin_token or not secrets.compare_digest(
        x_admin_token,
        settings.admin_api_token,
    ):
        raise HTTPException(status_code=401, detail="Invalid admin token.")
