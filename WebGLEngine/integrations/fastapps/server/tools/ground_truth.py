"""SweK 4D ground-truth generator as a ChatGPT App widget.

Asks a SweK server to emit an exact 4D ground-truth benchmark (moving points with
known 3D tracks, projected to 2D observations) and score a naive estimator against
it, so ChatGPT can show what a 4D-estimation method would be graded against.
"""
from typing import Any, Dict

from fastapps import BaseWidget, ConfigDict, Field
from pydantic import BaseModel


class GroundTruthInput(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    base_url: str = Field(default="http://localhost:8787", description="Base URL of a SweK server")
    seed: int = Field(default=12, ge=1, le=9999, description="Scene seed")


class GroundTruthWidget(BaseWidget):
    identifier = "swek-ground-truth"
    title = "SweK 4D Ground Truth"
    input_schema = GroundTruthInput
    invoking = "Generating the exact 4D ground truth..."
    invoked = "Ground truth ready"
    widget_csp = {"connect_domains": [], "resource_domains": []}

    async def execute(self, input_data: GroundTruthInput) -> Dict[str, Any]:
        import httpx

        base = input_data.base_url.rstrip("/")
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(base + "/groundtruth/summary", params={"seed": input_data.seed})
            data = resp.json()
        return {
            "seed": input_data.seed,
            "nPoints": data.get("nPoints", 0),
            "nFrames": data.get("nFrames", 0),
            "visibleFrac": data.get("visibleFrac", 0),
            "cheatEpe": data.get("cheatEpe", 0),
            "midEpe": data.get("midEpe", 0),
            "nearEpe": data.get("nearEpe", 0),
        }
