from __future__ import annotations

import logging
import razorpay

from app.core.settings import Settings

logger = logging.getLogger(__name__)


class RazorpayService:
    def __init__(self, settings: Settings):
        self.key_id = settings.razorpay_key_id or ""
        self.key_secret = settings.razorpay_key_secret or ""
        try:
            self.client = razorpay.Client(auth=(self.key_id, self.key_secret))
        except Exception as e:
            logger.error(f"Failed to initialize Razorpay client: {e}")
            self.client = None

    def create_order(
        self,
        amount_in_cents: int,
        currency: str,
        receipt_id: str,
        user_id: str | None = None,
        email: str | None = None,
    ) -> dict:
        """Creates a Razorpay order. Amount in smallest currency unit (cents for USD, paise for INR)."""
        if not self.key_id or self.key_id == "rzp_test_placeholder":
            logger.error("Razorpay API keys are not configured.")
            raise ValueError("Razorpay API keys are not configured.")

        if self.client is None:
            logger.error("Razorpay client is not initialized.")
            raise ValueError("Razorpay client is not initialized.")

        data = {
            "amount": amount_in_cents,
            "currency": currency,
            "receipt": receipt_id,
            "payment_capture": 1,
        }
        notes = {k: v for k, v in {"user_id": user_id, "email": email}.items() if v}
        if notes:
            data["notes"] = notes

        logger.info(f"Creating Razorpay order for {user_id}: {data}")
        try:
            order = self.client.order.create(data=data)
            logger.info(f"Successfully created order: {order.get('id')}")
            return order
        except Exception as e:
            logger.error(f"Razorpay order creation failed: {e}")
            raise

    def verify_payment(self, payment_id: str, order_id: str, signature: str) -> bool:
        """Verifies Razorpay payment signature. Returns True if valid."""
        params = {
            "razorpay_payment_id": payment_id,
            "razorpay_order_id": order_id,
            "razorpay_signature": signature,
        }
        logger.info(f"Verifying Razorpay signature for order: {order_id}, payment: {payment_id}")
        try:
            if self.client is None:
                logger.error("Razorpay client is not initialized during verification.")
                return False
            self.client.utility.verify_payment_signature(params)
            logger.info(f"Successfully verified signature for payment: {payment_id}")
            return True
        except Exception as e:
            logger.warning(f"Razorpay signature verification failed for order {order_id}: {e}")
            return False
