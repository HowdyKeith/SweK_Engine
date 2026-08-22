#!/usr/bin/env python3
"""Turn a SweK ground-truth export into a Trace-Anything-style output.pt.

SweK's trace-truth page (and exportTraceAnything in tools/groundtruth/traceField.js)
emits the exact 4D ground truth as JSON: a trajectory field of 3D control points over
time, a per-point-per-frame confidence that is the TRUE visibility (1 seen, 0 occluded),
the 2D observations an estimator consumes, and the camera. This script loads that JSON
and torch.save's it in the shape a method like Trace Anything speaks -- 3D control points
plus confidence maps -- so SweK's truth can be opened in their viewer or laid against
their model's own output.pt and scored.

    python to_output_pt.py swek-truth-seed12.json output.pt

Then, in their tooling:  python scripts/view.py --output output.pt

Requires: torch.
"""
import json
import sys


def convert(in_json, out_pt):
    import torch  # imported here so --help works without torch installed
    with open(in_json) as fh:
        ex = json.load(fh)
    cp = torch.tensor(ex["control_points"], dtype=torch.float64)      # [nPoints, nFrames, 3]
    conf = torch.tensor(ex["confidence"], dtype=torch.float64)        # [nPoints, nFrames]
    obs = torch.tensor(ex["observations_2d"], dtype=torch.float64)    # [nPoints, nFrames, 2]
    out = {
        "control_points": cp,     # 3D control points -- Trace Anything's trajectory field
        "confidence": conf,       # confidence maps -- here EXACT visibility, not an estimate
        "observations_2d": obs,   # the 2D input an estimator is given
        "camera": ex["camera"],   # intrinsics + extrinsics, so the viewer can place the camera
        "meta": {"nPoints": ex["nPoints"], "nFrames": ex["nFrames"], "source": ex.get("format", "swek")},
    }
    torch.save(out, out_pt)
    print("wrote %s: control_points %s, confidence %s" % (out_pt, tuple(cp.shape), tuple(conf.shape)))


# The keys this converter reads from the SweK export -- checked by the gate against a real export.
REQUIRED_KEYS = ["control_points", "confidence", "observations_2d", "camera", "nPoints", "nFrames"]


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: python to_output_pt.py <swek-export.json> <output.pt>")
    convert(sys.argv[1], sys.argv[2])
