from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any, Dict


class StateTokenError(ValueError):
    pass


def _base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _base64url_decode(data: str) -> bytes:
    padding = "=" * ((4 - (len(data) % 4)) % 4)
    return base64.urlsafe_b64decode((data + padding).encode("ascii"))


def sign_state(payload: Dict[str, Any], secret: str) -> str:
    serialized = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    payload_part = _base64url_encode(serialized)
    signature = hmac.new(secret.encode("utf-8"), serialized, hashlib.sha256).digest()
    signature_part = _base64url_encode(signature)
    return f"{payload_part}.{signature_part}"


def verify_state(token: str, secret: str) -> Dict[str, Any]:
    try:
        payload_part, signature_part = token.split(".", 1)
    except ValueError as exc:
        raise StateTokenError("Malformed state token.") from exc

    try:
        payload_bytes = _base64url_decode(payload_part)
        sent_signature = _base64url_decode(signature_part)
    except Exception as exc:
        raise StateTokenError("Invalid state token encoding.") from exc

    expected_signature = hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).digest()
    if not hmac.compare_digest(sent_signature, expected_signature):
        raise StateTokenError("State token signature mismatch.")

    try:
        payload = json.loads(payload_bytes.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise StateTokenError("Invalid state token payload.") from exc

    exp = payload.get("exp")
    if exp is None or not isinstance(exp, int):
        raise StateTokenError("State token is missing expiry.")
    if exp < int(time.time()):
        raise StateTokenError("State token has expired.")

    return payload

