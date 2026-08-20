"""SweK fleet fingerprint check as a ChatGPT App widget.

Asks one SweK box to fan out to the fleet, collect every peer's master hash, and
report which boxes agree on the cross-architecture master and which diverge. This
is the verification spine of the engine, surfaced as something ChatGPT can call.
"""
from typing import Any, Dict

from fastapps import BaseWidget, ConfigDict, Field
from pydantic import BaseModel


class FingerprintCheckInput(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    base_url: str = Field(default="http://localhost:8787", description="Base URL of a SweK server on the LAN")


class FingerprintCheckWidget(BaseWidget):
    identifier = "swek-fingerprint-check"
    title = "SweK Fleet Fingerprint Check"
    input_schema = FingerprintCheckInput
    invoking = "Asking the fleet for its master hash..."
    invoked = "Fleet fingerprint checked"
    widget_csp = {"connect_domains": [], "resource_domains": []}

    async def execute(self, input_data: FingerprintCheckInput) -> Dict[str, Any]:
        import httpx

        base = input_data.base_url.rstrip("/")
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(base + "/fleet/fingerprint-check")
            data = resp.json()
        report = data.get("report", {}) or {}
        peers = report.get("peers", []) or []
        return {
            "master": report.get("localMaster", ""),
            "allMatch": bool(report.get("allMatch", False)),
            "reached": report.get("reached", 0),
            "checked": report.get("checked", 0),
            "divergent": report.get("divergent", []),
            "unreachable": report.get("unreachable", []),
            "peers": [{"id": p.get("id"), "match": bool(p.get("match")), "reachable": bool(p.get("reachable"))} for p in peers],
            "summary": data.get("summary", ""),
        }
