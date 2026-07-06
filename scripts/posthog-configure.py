#!/usr/bin/env python3
"""Configure PostHog project settings for Resume Vault production."""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

POSTHOG_APP_HOST = "https://us.posthog.com"

DOMAINS = {
    "app_urls": [
        "https://resume-vault-jp6b.onrender.com",
        "https://anthonysadarangani.com",
        "http://localhost:5173",
    ],
    "recording_domains": [
        "resume-vault-jp6b.onrender.com",
        "onrender.com",
        "anthonysadarangani.com",
        "localhost",
    ],
}


def main() -> None:
    api_key = os.environ.get("POSTHOG_PERSONAL_API_KEY")
    project_id = os.environ.get("POSTHOG_PROJECT_ID", "500759")
    if not api_key:
        sys.exit("Set POSTHOG_PERSONAL_API_KEY (phx_ personal API key)")

    payload = {
        "session_recording_opt_in": True,
        "heatmaps_opt_in": True,
        **DOMAINS,
    }

    req = urllib.request.Request(
        f"{POSTHOG_APP_HOST}/api/projects/{project_id}/",
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="PATCH",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            body = json.load(resp)
    except urllib.error.HTTPError as e:
        print(e.read().decode(), file=sys.stderr)
        sys.exit(e.code)

    print("PostHog project configured:")
    print("  session_recording_opt_in:", body.get("session_recording_opt_in"))
    print("  heatmaps_opt_in:", body.get("heatmaps_opt_in"))
    print("  app_urls:", body.get("app_urls"))
    print("  recording_domains:", body.get("recording_domains"))


if __name__ == "__main__":
    main()
