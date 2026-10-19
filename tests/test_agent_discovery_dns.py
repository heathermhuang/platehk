import copy
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlsplit

spec = importlib.util.spec_from_file_location("agent_dns", Path(__file__).resolve().parents[1] / "scripts/configure_agent_discovery_dns.py")
dns = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dns)


class FakeCloudflare:
    def __init__(self):
        self.records = {}
        self.writes = []
        self.zones = [{"id": "abc123", "name": "plate.hk", "status": "active"}]

    def __call__(self, method, path, body=None):
        parsed = urlsplit(path)
        if parsed.path == "/zones":
            assert parse_qs(parsed.query)["name"] == ["plate.hk"]
            return self.zones
        assert parsed.path == "/zones/abc123/dns_records"
        if method == "GET":
            name = parse_qs(parsed.query)["name"][0]
            assert name in {record["name"] for record in dns.RECORDS}
            return copy.deepcopy(self.records.get(name, []))
        assert method == "POST"
        self.writes.append(copy.deepcopy(body))
        self.records[body["name"]] = [copy.deepcopy(body)]
        return copy.deepcopy(body)


class AgentDnsTests(unittest.TestCase):
    def test_api_errors_do_not_expose_credentials_or_response_bodies(self):
        class Rejected:
            def open(self, request, timeout):
                self.request = request
                raise HTTPError(request.full_url, 403, "private provider detail", {}, None)
        provider = Rejected()
        with patch.object(dns.urllib.request, "build_opener", return_value=provider):
            with self.assertRaises(dns.DnsSetupError) as caught:
                dns.api_client("test-only-token")("GET", "/zones?name=plate.hk")
        self.assertIn("HTTP 403", str(caught.exception))
        self.assertNotIn("test-only-token", str(caught.exception))
        self.assertNotIn("private provider detail", str(caught.exception))
        self.assertEqual(provider.request.full_url, "https://api.cloudflare.com/client/v4/zones?name=plate.hk")

    def test_plan_is_read_only_and_apply_is_idempotent(self):
        api = FakeCloudflare()
        plan = dns.configure(api)
        self.assertEqual([row["action"] for row in plan["records"]], ["create", "create"])
        self.assertEqual(api.writes, [])
        dns.configure(api, apply=True)
        self.assertEqual(len(api.writes), 2)
        result = dns.configure(api, apply=True)
        self.assertEqual(len(api.writes), 2)
        self.assertEqual([row["action"] for row in result["records"]], ["unchanged", "unchanged"])

    def test_conflict_is_found_before_any_write(self):
        api = FakeCloudflare()
        conflicting = copy.deepcopy(dns.RECORDS[1])
        conflicting["content"] = "url=https://other.example/catalog"
        api.records[conflicting["name"]] = [conflicting]
        with self.assertRaisesRegex(dns.DnsSetupError, "Conflicting record"):
            dns.configure(api, apply=True)
        self.assertEqual(api.writes, [])

    def test_unexpected_zone_and_records_are_rejected(self):
        api = FakeCloudflare()
        api.zones[0]["name"] = "other.example"
        with self.assertRaises(dns.DnsSetupError):
            dns.configure(api, apply=True)
        self.assertEqual(api.writes, [])
        api = FakeCloudflare()
        api.records[dns.RECORDS[0]["name"]] = [{**dns.RECORDS[0], "name": "other.plate.hk"}]
        with self.assertRaises(dns.DnsSetupError):
            dns.configure(api, apply=True)
        self.assertEqual(api.writes, [])

    def test_cloudflare_formatting_does_not_cause_duplicate_creation(self):
        api = FakeCloudflare()
        svcb, txt = copy.deepcopy(dns.RECORDS)
        svcb["data"]["target"] += "."
        svcb["data"]["value"] = 'port="443" key65400="https://plate.hk/.well-known/mcp/server-card.json" alpn="mcp,h2"'
        txt["content"] = '"' + txt["content"] + '"'
        api.records = {svcb["name"]: [svcb], txt["name"]: [txt]}
        dns.configure(api, apply=True)
        self.assertEqual(api.writes, [])

    def test_uncertain_creation_is_not_reported_as_success(self):
        api = FakeCloudflare()
        def incorrect_response(method, path, body=None):
            result = api(method, path, body)
            if method == "POST":
                result["name"] = "wrong.plate.hk"
            return result
        with self.assertRaisesRegex(dns.DnsSetupError, "not confirmed"):
            dns.configure(incorrect_response, apply=True)
        dns.configure(api, apply=True)
        self.assertEqual(len(api.writes), 2)


if __name__ == "__main__":
    unittest.main()
