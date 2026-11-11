# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
from datetime import datetime
import hashlib
import json

ARCHIVE_BASE = (
    "https://raw.githubusercontent.com/amzar1st/"
    "RouteProof-Transit-accessibility-notice-reconciler/"
    "e0463e3469f16cc8b1ea13879faaf2149aa7d813/public/evidence/"
)
DEMO = ("central-junction.json", "167d64d0391c77fa8dbfd28959e46cfcbf0298916e4289a96b3c8c6d4af22fc7", "synthetic_demo", "2026-11-10")
JAMAICA = ("jamaica-179.json", "a7dc89814b86c5272fe3de911ba7e8ff4d95320e09597dcc17adb0e4ac4f2c48", "mta_planned_snapshot", "2026-11-21")
ARCHIVES = {"platform-transfer": DEMO, "east-entrance": DEMO, "jamaica-f": JAMAICA}
SOURCE_PRIORITY = {"station_bulletin": 1, "equipment_feed": 2}


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def digest(data):
    return hashlib.sha256(data).hexdigest()


def validate_query(route, at):
    if route not in ARCHIVES:
        raise ValueError("Unknown route")
    if len(at) != 17:
        raise ValueError("Use YYYY-MM-DDTHH:MMZ")
    parsed = datetime.strptime(at, "%Y-%m-%dT%H:%MZ")
    if parsed.strftime("%Y-%m-%dT%H:%MZ") != at:
        raise ValueError("Use YYYY-MM-DDTHH:MMZ")

    if at[:10] != ARCHIVES[route][3]:
        raise ValueError("Select a time on the route archive date")


def decide(archive, route, at):
    filename, archive_hash, scope, _ = ARCHIVES[route]
    covered = archive["validFrom"] <= at < archive["validUntil"]
    paths = []
    for path in archive["routes"][route]:
        equipment = []
        for elevator in path["elevators"]:
            candidates = [
                n for n in archive["notices"]
                if covered and archive["aliases"].get(n["equipment"]) == elevator
                and n["from"] <= at < n["until"] and n["issued"] <= at
            ]
            top = max(
                ((SOURCE_PRIORITY[n["source"]], n["issued"]) for n in candidates),
                default=None,
            )
            selected = [
                n for n in candidates if (SOURCE_PRIORITY[n["source"]], n["issued"]) == top
            ]
            states = {n["state"] for n in selected}
            equipment.append({
                "id": elevator,
                "state": next(iter(states)) if len(states) == 1 else "unknown",
                "selected": sorted(n["id"] for n in selected),
                "considered": sorted(n["id"] for n in candidates),
            })
        states = {e["state"] for e in equipment}
        status = "blocked" if "outage" in states else ("open" if states == {"open"} else "unknown")
        paths.append({"id": path["id"], "status": status, "equipment": equipment})
    statuses = {path["status"] for path in paths}
    outcome = (
        "ROUTE_AVAILABLE" if "open" in statuses else
        "ROUTE_BLOCKED" if statuses == {"blocked"} else "UNCERTAIN"
    )
    result = {
        "version": 1, "scope": scope, "archiveSha256": archive_hash,
        "archiveUrl": ARCHIVE_BASE + filename, "route": route, "at": at, "covered": covered,
        "outcome": outcome, "paths": paths,
    }
    result["decisionSha256"] = digest(canonical(result).encode())
    return canonical(result)


def review(route, at):
    filename, archive_hash, _, _ = ARCHIVES[route]
    response = gl.nondet.web.get(ARCHIVE_BASE + filename)
    if not response.body or len(response.body) > 16384:
        raise ValueError("Archive unavailable")
    if digest(response.body) != archive_hash:
        raise ValueError("Archive digest mismatch")
    return decide(json.loads(response.body), route, at)


class RouteProof(gl.Contract):
    decisions: TreeMap[str, str]

    def __init__(self):
        pass

    @gl.public.view
    def get_decision(self, route: str, at: str) -> str:
        validate_query(route, at)
        return self.decisions.get(route + "|" + at, "")

    @gl.public.write
    def resolve(self, route: str, at: str) -> None:
        validate_query(route, at)
        key = route + "|" + at
        if self.decisions.get(key, ""):
            return
        self.decisions[key] = gl.eq_principle.strict_eq(lambda: review(route, at))
