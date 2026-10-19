#!/usr/bin/env python3
"""Plan or add Plate.hk's public discovery DNS, without editing existing records."""
from __future__ import annotations

import argparse
import json
import os
import shlex
import sys
import urllib.error
import urllib.parse
import urllib.request

ZONE = "plate.hk"
RECORDS = (
    {
        "type": "SVCB", "name": "_mcp._agents.plate.hk", "ttl": 300,
        "data": {
            "priority": 1, "target": "plate.hk",
            "value": 'alpn="mcp,h2" port=443 key65400="https://plate.hk/.well-known/mcp/server-card.json"',
        },
    },
    {
        "type": "TXT", "name": "_catalog._agents.plate.hk", "ttl": 300,
        "content": "url=https://plate.hk/.well-known/ard.json",
    },
)


class DnsSetupError(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def api_client(token):
    opener = urllib.request.build_opener(NoRedirect())

    def request(method, path, body=None):
        req = urllib.request.Request(
            "https://api.cloudflare.com/client/v4" + path,
            data=json.dumps(body).encode() if body is not None else None,
            method=method,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
        try:
            with opener.open(req, timeout=30) as response:
                result = json.load(response)
        except urllib.error.HTTPError as error:
            status = error.code
            error.close()
            raise DnsSetupError(f"Cloudflare rejected {method} request (HTTP {status}); check Zone Read and DNS Edit access for plate.hk.") from None
        except (OSError, ValueError):
            raise DnsSetupError("Cloudflare request failed; no credential or response body was logged.") from None
        if not result.get("success"):
            raise DnsSetupError("Cloudflare did not confirm the request.")
        if result.get("result_info", {}).get("total_pages", 1) > 1:
            raise DnsSetupError("Ambiguous paginated DNS response; refusing to change records.")
        return result["result"]

    return request


def canonical(record):
    kind = record.get("type")
    if kind == "TXT":
        return kind, "".join(shlex.split(record.get("content", "")))
    if kind == "SVCB":
        data = record.get("data")
        if not data:
            priority, target, value = record.get("content", "").split(maxsplit=2)
            data = {"priority": int(priority), "target": target, "value": value}
        return kind, int(data["priority"]), data["target"].lower().rstrip("."), tuple(sorted(shlex.split(data["value"])))
    return kind, record.get("content")


def configure(request, *, apply=False):
    zones = request("GET", "/zones?" + urllib.parse.urlencode({"name": ZONE, "per_page": 100}))
    if len(zones) != 1 or zones[0].get("name") != ZONE or zones[0].get("status") != "active":
        raise DnsSetupError("Expected exactly one active plate.hk zone; no records changed.")
    zone_id = zones[0]["id"]
    if not zone_id.isalnum():
        raise DnsSetupError("Invalid zone identifier; no records changed.")
    endpoint = f"/zones/{zone_id}/dns_records"
    plan = []
    # Validate the entire plan before creating anything. Never replace a record.
    for wanted in RECORDS:
        query = urllib.parse.urlencode({"name": wanted["name"], "per_page": 100})
        existing = request("GET", endpoint + "?" + query)
        if any(item.get("name") != wanted["name"] for item in existing):
            raise DnsSetupError("DNS response exceeded the requested discovery name; no records changed.")
        if existing and (len(existing) != 1 or canonical(existing[0]) != canonical(wanted)):
            raise DnsSetupError(f"Conflicting record at {wanted['name']}; manual review required, no records changed.")
        plan.append({"record": wanted, "action": "unchanged" if existing else "create"})
    if apply:
        for item in plan:
            if item["action"] == "create":
                result = request("POST", endpoint, item["record"])
                if result.get("name") != item["record"]["name"] or canonical(result) != canonical(item["record"]):
                    raise DnsSetupError("DNS creation was not confirmed. Recheck existing records before retrying.")
                item["action"] = "created"
    return {"zone": ZONE, "mode": "apply" if apply else "check", "records": plan}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--check", action="store_true", help="Read the existing zone and report the plan")
    modes.add_argument("--apply", action="store_true", help="Create missing records; never modify or delete")
    args = parser.parse_args()
    if not args.check and not args.apply:
        print(json.dumps({"zone": ZONE, "records": RECORDS}, indent=2))
        return 0
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()
    if not token:
        print("CLOUDFLARE_API_TOKEN with plate.hk Zone Read and DNS Edit access is required.", file=sys.stderr)
        return 1
    try:
        print(json.dumps(configure(api_client(token), apply=args.apply), indent=2))
    except (DnsSetupError, ValueError, KeyError) as error:
        print(str(error) if isinstance(error, DnsSetupError) else "Invalid DNS response; inspect existing records before retrying.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
