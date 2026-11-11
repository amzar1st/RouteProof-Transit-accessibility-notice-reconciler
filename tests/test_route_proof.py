import copy
import importlib.util
import json
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import Mock

root = Path(__file__).resolve().parents[1]
sdk = ModuleType("genlayer")
web_get = Mock()
strict_eq = Mock(side_effect=lambda operation: operation())
sdk.gl = SimpleNamespace(
    Contract=object, public=SimpleNamespace(view=lambda fn: fn, write=lambda fn: fn),
    eq_principle=SimpleNamespace(strict_eq=strict_eq),
    nondet=SimpleNamespace(web=SimpleNamespace(get=web_get)),
)
sdk.TreeMap = dict
sys.modules["genlayer"] = sdk
spec = importlib.util.spec_from_file_location("route_proof", root / "contracts/route_proof.py")
contract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(contract)


def evidence(name):
    return (root / "public/evidence" / name).read_bytes()


class RouteProofTests(unittest.TestCase):
    def setUp(self):
        strict_eq.reset_mock()
        web_get.reset_mock()
        self.archive = json.loads(evidence("central-junction.json"))
        self.at = "2026-11-10T14:20Z"

    def resolve(self, route="platform-transfer", at=None):
        return json.loads(contract.decide(self.archive, route, at or self.at))

    def test_alternate_and_notice_reconciliation(self):
        record = self.resolve()
        self.assertEqual(record["outcome"], "ROUTE_AVAILABLE")
        self.assertEqual([p["status"] for p in record["paths"]], ["blocked", "open"])
        east_lift = record["paths"][0]["equipment"][0]
        self.assertEqual(east_lift["selected"], ["E01"])
        self.assertEqual(east_lift["considered"], ["B01", "E01"])

    def test_all_mapped_paths_blocked(self):
        self.assertEqual(self.resolve("east-entrance")["outcome"], "ROUTE_BLOCKED")

    def test_missing_and_expired_are_unknown(self):
        for at in ("2026-11-10T14:10Z", "2026-11-10T15:00Z"):
            with self.subTest(at=at):
                self.assertEqual(self.resolve(at=at)["outcome"], "UNCERTAIN")

    def test_late_issued_notice_cannot_rewrite_earlier_minute(self):
        record = self.resolve(at="2026-11-10T14:07Z")
        lift = record["paths"][0]["equipment"][0]
        self.assertEqual(lift["selected"], ["B01"])

    def test_equal_priority_and_issued_conflict(self):
        conflict = copy.deepcopy(self.archive["notices"][-1])
        conflict.update(id="E05", state="outage")
        self.archive["notices"].append(conflict)
        record = self.resolve()
        self.assertEqual(record["outcome"], "UNCERTAIN")
        self.assertEqual(record["paths"][1]["equipment"][-1]["selected"], ["E04", "E05"])

    def test_order_independent_notices_and_decision_commitment(self):
        first = self.resolve()
        self.archive["notices"].reverse()
        self.assertEqual(first, self.resolve())
        commitment = first.pop("decisionSha256")
        self.assertEqual(commitment, contract.digest(contract.canonical(first).encode()))

    def test_reject_invalid_queries(self):
        for route, at in [
            ("bad", self.at), ("east-entrance", "2026-11-10T24:00Z"),
            ("east-entrance", "2026-11-11T14:20Z"), ("east-entrance", "2026-11-10T14:2Z"),
        ]:
            with self.subTest(route=route, at=at), self.assertRaises(ValueError):
                contract.validate_query(route, at)

    def test_archive_hashes_and_planned_mta_outage(self):
        for filename, sha, _, _ in contract.ARCHIVES.values():
            self.assertEqual(contract.digest(evidence(filename)), sha)
        archive = json.loads(evidence("jamaica-179.json"))
        def outcome(at):
            return json.loads(contract.decide(archive, "jamaica-f", at))["outcome"]
        self.assertEqual(outcome("2026-11-21T03:00Z"), "ROUTE_BLOCKED")
        self.assertEqual(outcome("2026-11-21T11:00Z"), "UNCERTAIN")

    def test_consensus_write_and_idempotent_replay(self):
        instance = contract.RouteProof()
        instance.decisions = {}
        self.assertEqual(instance.get_decision("platform-transfer", self.at), "")
        web_get.return_value = SimpleNamespace(status_code=200, body=evidence("central-junction.json"))
        instance.resolve("platform-transfer", self.at)
        instance.resolve("platform-transfer", self.at)
        self.assertEqual(json.loads(instance.get_decision("platform-transfer", self.at)), self.resolve())
        strict_eq.assert_called_once()
        web_get.assert_called_once_with(contract.ARCHIVE_BASE + "central-junction.json")

    def test_reject_corrupt_and_unavailable_archives_without_storing(self):
        for code, body in [(404, b"not found"), (200, b""), (200, b"{}"), (200, b"x" * 16385)]:
            with self.subTest(code=code, size=len(body)):
                instance = contract.RouteProof()
                instance.decisions = {}
                web_get.return_value = SimpleNamespace(status_code=code, body=body)
                with self.assertRaises(ValueError):
                    instance.resolve("platform-transfer", self.at)
                self.assertEqual(instance.decisions, {})


if __name__ == "__main__":
    unittest.main()
