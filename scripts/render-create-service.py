#!/usr/bin/env python3
"""Create resume-vault on Render via API. Requires RENDER_API_KEY env var."""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

OWNER_ID = "tea-d960phhkh4rs73aukh70"
REPO = "https://github.com/anthonyrs06/rvagent"


def load_owner_password() -> str:
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    if os.path.isfile(env_path):
        for line in open(env_path):
            if line.startswith("OWNER_PASSWORD="):
                value = line.strip().split("=", 1)[1]
                if value:
                    return value
    value = os.environ.get("OWNER_PASSWORD")
    if not value:
        sys.exit("Set OWNER_PASSWORD in .env or environment")
    return value


def main() -> None:
    api_key = os.environ.get("RENDER_API_KEY")
    if not api_key:
        sys.exit("Set RENDER_API_KEY")

    required = [
        "VITE_PUBLIC_POSTHOG_TOKEN",
        "POSTHOG_TOKEN",
        "POSTHOG_PERSONAL_API_KEY",
        "POSTHOG_PROJECT_ID",
    ]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        sys.exit(f"Missing env: {', '.join(missing)}")

    payload = {
        "type": "web_service",
        "name": "resume-vault",
        "ownerId": OWNER_ID,
        "repo": REPO,
        "branch": "main",
        "autoDeploy": "yes",
        "envVars": [
            {"key": "NODE_ENV", "value": "production"},
            {"key": "HOST", "value": "0.0.0.0"},
            {"key": "DATA_DIR", "value": "/app/data"},
            {"key": "SESSION_SECRET", "generateValue": True},
            {"key": "IP_HASH_SALT", "generateValue": True},
            {"key": "VITE_PUBLIC_POSTHOG_HOST", "value": "https://us.i.posthog.com"},
            {"key": "POSTHOG_HOST", "value": "https://us.i.posthog.com"},
            {"key": "OWNER_PASSWORD", "value": load_owner_password()},
            {"key": "VITE_PUBLIC_POSTHOG_TOKEN", "value": os.environ["VITE_PUBLIC_POSTHOG_TOKEN"]},
            {"key": "POSTHOG_TOKEN", "value": os.environ["POSTHOG_TOKEN"]},
            {"key": "POSTHOG_PERSONAL_API_KEY", "value": os.environ["POSTHOG_PERSONAL_API_KEY"]},
            {"key": "POSTHOG_PROJECT_ID", "value": os.environ["POSTHOG_PROJECT_ID"]},
        ],
        "serviceDetails": {
            "runtime": "docker",
            "plan": "starter",
            "region": "oregon",
            "healthCheckPath": "/health",
            "disk": {
                "name": "resume-vault-data",
                "mountPath": "/app/data",
                "sizeGB": 2,
            },
            "envSpecificDetails": {"dockerfilePath": "./Dockerfile"},
        },
    }

    req = urllib.request.Request(
        "https://api.render.com/v1/services",
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            body = json.load(resp)
    except urllib.error.HTTPError as e:
        print(e.read().decode(), file=sys.stderr)
        sys.exit(e.code)

    svc = body.get("service", body)
    deploy = body.get("deploy", {})
    details = svc.get("serviceDetails", {})
    print(json.dumps({
        "service_id": svc.get("id"),
        "url": details.get("url"),
        "deploy_id": deploy.get("id"),
        "deploy_status": deploy.get("status"),
    }, indent=2))


if __name__ == "__main__":
    main()
