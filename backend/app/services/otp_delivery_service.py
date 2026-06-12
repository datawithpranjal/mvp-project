from __future__ import annotations

import html

import httpx

from app.core.config import get_settings


class OtpDeliveryError(RuntimeError):
    pass


class OtpDeliveryService:
    def __init__(self) -> None:
        settings = get_settings()
        self.resend_api_key = settings.resend_api_key
        self.otp_email_from = settings.otp_email_from
        self.allow_demo_otp = (
            settings.auth_allow_demo_otp and settings.environment.lower() != "production"
        )

    def delivery_channel(self) -> str:
        if self.resend_api_key:
            return "email"
        return "demo" if self.allow_demo_otp else "unconfigured"

    def send_otp(self, email: str, otp_code: str, expires_in_minutes: int) -> None:
        if not self.resend_api_key:
            if self.allow_demo_otp:
                return
            raise OtpDeliveryError(
                "Email OTP delivery is not configured. Set RESEND_API_KEY on the backend."
            )

        escaped_code = html.escape(otp_code)
        escaped_email = html.escape(email)
        text = (
            f"Your Data Engineering Scenario Playground OTP is {otp_code}. "
            f"It expires in {expires_in_minutes} minutes."
        )
        html_body = f"""
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
          <h2>Verify your login</h2>
          <p>Use this OTP to continue to Data Engineering Scenario Playground.</p>
          <p style="font-size:28px;font-weight:700;letter-spacing:6px">{escaped_code}</p>
          <p>This code expires in {expires_in_minutes} minutes.</p>
          <p>If you did not request this for {escaped_email}, you can ignore this email.</p>
        </div>
        """

        try:
            response = httpx.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {self.resend_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": self.otp_email_from,
                    "to": [email],
                    "subject": "Your login OTP",
                    "text": text,
                    "html": html_body,
                },
                timeout=10,
            )
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise OtpDeliveryError(
                f"Resend rejected the OTP email with status {exc.response.status_code}: {exc.response.text}"
            ) from exc
        except httpx.HTTPError as exc:
            raise OtpDeliveryError(f"Unable to send OTP email: {exc}") from exc
