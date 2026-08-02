"""Manual SMSPoh connectivity check.

This script never contains credentials and does nothing when imported.
"""

from __future__ import annotations

import base64
import os

import requests


def main() -> int:
    api_key = os.getenv("SMSPOH_API_KEY", "").strip()
    api_secret = os.getenv("SMSPOH_API_SECRET", "").strip()
    recipient = os.getenv("SMSPOH_TEST_RECIPIENT", "").strip()
    if not api_key or not api_secret or not recipient:
        print(
            "Set SMSPOH_API_KEY, SMSPOH_API_SECRET and SMSPOH_TEST_RECIPIENT "
            "before running this manual connectivity check."
        )
        return 2

    encoded_auth = base64.b64encode(f"{api_key}:{api_secret}".encode()).decode()
    response = requests.post(
        "https://v3.smspoh.com/api/rest/send",
        headers={
            "Authorization": f"Bearer {encoded_auth}",
            "Content-Type": "application/json",
        },
        json={
            "from": os.getenv("SMSPOH_SENDER_ID", "SMSPoh Demo"),
            "to": recipient,
            "message": "Myanmar Agriculture Intelligence connectivity test",
        },
        timeout=15,
    )
    print(f"HTTP {response.status_code}: {response.text[:2000]}")
    return 0 if response.ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
