import secrets
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException
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

router = APIRouter(tags=["premium"])
auth_service = AuthService()
premium_access_service = PremiumAccessService()
coupon_service = CouponService()
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
        premium_access_service.grant_manual_access(
            email=payload.email,
            plan_label=payload.plan_label,
            billing_interval=payload.billing_interval,
            amount_inr=payload.amount_inr,
            payment_reference=payload.payment_reference,
        )
        return {"unlocked_premium": True, "email": payload.email.strip().lower()}
    except PremiumAccessServiceError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Premium access is temporarily unavailable. {exc}",
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
