"""SweK Engine -- apple/ml-sharp on a Modal serverless GPU.  v3949

WHY THIS EXISTS
---------------
sharpBridge.js can already run SHARP locally, and locally means a machine with PyTorch installed and a GPU worth
using. That is Galaxina and nothing else in the fleet: the Macs have no CUDA, the Shield and the phones are not
in this conversation at all, and a multi-GB torch install is not something to put on a box to try one feature.

THIS IS THE OTHER HALF OF THE SAME FEATURE, NOT A SECOND ONE. A deployed endpoint here means any box in the
fleet -- or the tunnel -- can turn a photograph into a .ply without owning a GPU, and the engine already knows
what to do with the .ply: engine/splatParser.js reads it and SplatRenderer.js draws it.

The shape is taken from Sharp-ML/SHARP-ML (MIT), which runs this model on Modal with an A10G and caches the
weights in a Volume. What is NOT taken from it is its stack -- Next.js, Prisma, NextAuth, Vercel Blob -- which
solves multi-tenant hosting that this engine is not. Only the deployment recipe travels.

*** THE LICENCE DOES NOT RELAX BECAUSE THE GPU IS RENTED. ***
apple/ml-sharp's LICENSE_MODEL grants the weights "exclusively for Research Purposes" and excludes "commercial
exploitation, product development or use in any commercial product or service". Deploying them to Modal means
Modal's machines download and hold those weights, which is redistribution-adjacent and squarely still research
use. Nothing about renting hardware makes the terms softer, and this file is not a route around them.

*** WHAT HAS NOT BEEN PROVEN: THIS HAS NEVER BEEN DEPLOYED. ***
No Modal account, no GPU and no PyTorch exist on the box this was written on, so this is a recipe checked for
syntax and shape, not an observed run. The first `modal deploy` is what turns it into a fact -- and the parts
most likely to need a nudge are named at the bottom of this docstring rather than left for you to find.

DEPLOY
------
    pip install modal
    modal token new                      # once, links this machine to your Modal account
    modal secret create swek-sharp SHARP_TOKEN=$(python3 -c "import secrets;print(secrets.token_urlsafe(32))")
    modal deploy WebGLEngine/modal/sharp_modal.py

`modal deploy` prints the endpoint URL. Put THAT and the token you just generated into the engine:

    Server console -> GitHub/Tools panel, or:
    curl -X POST http://localhost:8787/sharp/config \\
         -H 'Content-Type: application/json' \\
         -d '{"endpoint":"https://<you>--swek-sharp-predict.modal.run","token":"<the SHARP_TOKEN>"}'

The engine writes those to ~/.voxelbridge/sharp.json (0600) -- OUTSIDE the engine tree, the same rule
githubBridge.js states for its own token: "outside the engine tree, so it never ships in a copy."

IF THE FIRST DEPLOY ARGUES WITH YOU, it will almost certainly be one of these three, and they are the three
places this recipe is guessing rather than knowing:
  1. The decorator names. Modal renamed `@stub.function` -> `@app.function` and `web_endpoint` ->
     `fastapi_endpoint`. This file uses the current spelling and pins modal>=1.0 to say so out loud.
  2. The predictor import path. `from sharp.models import create_predictor, PredictorParams` is what
     Sharp-ML/SHARP-ML uses; if apple moves it, the traceback will name the new one.
  3. The checkpoint URL/name. Left to ml-sharp's own downloader on purpose -- hardcoding a weights URL here
     would be a second declaration of something apple owns, and the kind that rots silently.
"""

import io
import os
import modal

APP_NAME = "swek-sharp"

# The weights are hundreds of MB and re-downloading them on every cold start is the difference between a
# usable button and one nobody presses twice. A Volume persists them between containers.
weights = modal.Volume.from_name("swek-sharp-weights", create_if_missing=True)
WEIGHTS_DIR = "/weights"

# torch's hub cache is pointed INTO the volume, so ml-sharp's own downloader populates it once and finds it
# every time after. Nothing here reimplements that download -- see note 3 in the docstring.
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git")
    .pip_install("torch", "torchvision", "numpy", "pillow", "fastapi[standard]")
    .run_commands(
        "git clone --depth 1 https://github.com/apple/ml-sharp /opt/ml-sharp",
        "cd /opt/ml-sharp && pip install -e . --no-deps",
    )
    .env({"TORCH_HOME": WEIGHTS_DIR, "HF_HOME": WEIGHTS_DIR})
)

app = modal.App(APP_NAME)


@app.cls(
    image=image,
    gpu="A10G",
    volumes={WEIGHTS_DIR: weights},
    secrets=[modal.Secret.from_name("swek-sharp")],
    # Generous, because a COLD start includes the weights download; a warm call is the sub-second the paper
    # advertises. scaledown_window keeps a warm container around so the second photograph is fast.
    timeout=600,
    scaledown_window=300,
)
class Sharp:
    @modal.enter()
    def load(self):
        """Loaded once per container, not once per request -- the whole point of paying for a warm GPU."""
        import torch
        from sharp.models import create_predictor, PredictorParams

        self.torch = torch
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.predictor = create_predictor(PredictorParams()).to(self.device).eval()

    @modal.method()
    def predict_ply(self, image_bytes: bytes) -> bytes:
        """One image in, .ply bytes out. Bytes rather than a path because nothing here has a shared disk with
        the caller -- which is also why the engine writes the file on ITS side, where the packaging rule that
        keeps splats out of a release zip is enforced."""
        from PIL import Image
        import numpy as np

        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        arr = np.asarray(img, dtype="float32") / 255.0
        t = self.torch.from_numpy(arr).permute(2, 0, 1)[None].to(self.device)

        with self.torch.no_grad():
            out = self.predictor(t)

        # ml-sharp owns the .ply encoding; asking it to serialise is what keeps this file from growing a second
        # opinion about a format engine/splatParser.js already parses on the other end.
        for name in ("save_ply_bytes", "fast_save_ply_bytes", "to_ply_bytes"):
            fn = getattr(out, name, None) or globals().get(name)
            if callable(fn):
                return fn() if fn is getattr(out, name, None) else fn(out)
        try:
            from sharp.io import save_ply_bytes  # type: ignore
            return save_ply_bytes(out)
        except Exception as e:
            raise RuntimeError(
                "ml-sharp produced a prediction but this recipe could not find its .ply serialiser. "
                "Sharp-ML/SHARP-ML calls fast_save_ply_bytes(gaussians, f_px, (h, w)); if apple has moved or "
                "renamed it, point this line at the new one rather than hand-rolling a .ply writer here -- "
                "the engine parses the real format and a hand-rolled one is where they would drift. "
                f"(underlying: {e})"
            )


@app.function(image=image, secrets=[modal.Secret.from_name("swek-sharp")], timeout=600)
@modal.fastapi_endpoint(method="POST")
def predict(item: dict):
    """The door. Token-checked, because an open endpoint is somebody else's GPU bill and, given the licence,
    somebody else's research-only weights being served to the public."""
    import base64
    from fastapi import HTTPException

    want = os.environ.get("SHARP_TOKEN", "")
    got = str((item or {}).get("token", ""))
    # Compared with compare_digest so the check does not leak the token's length through timing. Cheap, and the
    # alternative is a secret that a patient stranger can measure.
    import hmac
    if not want or not hmac.compare_digest(want, got):
        raise HTTPException(status_code=401, detail="bad or missing token")

    b64 = str((item or {}).get("image_b64", ""))
    if not b64:
        raise HTTPException(status_code=400, detail="no image_b64")
    try:
        raw = base64.b64decode(b64, validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail="image_b64 is not valid base64")
    if not raw:
        raise HTTPException(status_code=400, detail="image_b64 decoded to nothing")

    ply = Sharp().predict_ply.remote(raw)
    return {
        "ok": True,
        "ply_b64": base64.b64encode(ply).decode("ascii"),
        "bytes": len(ply),
        # Repeated on every reply for the same reason sharpBridge.status() repeats it: the person who needs to
        # see "research only" is whoever is about to use the output, not whoever read a licence file once.
        "licence": "apple/ml-sharp LICENSE_MODEL -- Research Purposes only, not for commercial use",
    }
