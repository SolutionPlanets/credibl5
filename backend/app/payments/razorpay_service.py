from __future__ import annotations

import razorpay

from app.core.settings import Settings


class RazorpayService:
    def __init__(self, settings: Settings):
        self.key_id = settings.razorpay_key_id or ""
        self.key_secret = settings.razorpay_key_secret or ""
        self.client = razorpay.Client(auth=(self.key_id, self.key_secret))

    def create_order(
        self,
        amount_in_cents: int,
        currency: str,
        receipt_id: str,
        user_id: str | None = None,
        email: str | None = None,
    ) -> dict:
        """Creates a Razorpay order. Amount in smallest currency unit (cents for USD, paisa for INR)."""
        if not self.key_id or self.key_id == "rzp_test_placeholder":
            raise ValueError("Razorpay API keys are not configured.")

        data = {
            "amount": amount_in_cents,
            "currency": currency,
            "receipt": receipt_id,
            "payment_capture": 1,
        }
        notes = {k: v for k, v in {"user_id": user_id, "email": email}.items() if v}
        if notes:
            data["notes"] = notes
        return self.client.order.create(data=data)

    def verify_payment(self, payment_id: str, order_id: str, signature: str) -> bool:
        """Verifies Razorpay payment signature. Returns True if valid."""
        params = {
            "razorpay_payment_id": payment_id,
            "razorpay_order_id": order_id,
            "razorpay_signature": signature,
        }
        try:
            self.client.utility.verify_payment_signature(params)
            return True
        except Exception:
            return False
