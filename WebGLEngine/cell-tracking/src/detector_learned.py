"""
detector_learned.py -- SCAFFOLD for a learned 3D cell detector (audit item 5).

This is deliberately a scaffold, not a trained model. It exists so that the
moment real royerlab competition data + labels are available, training and
inference drop straight into the existing pipeline with no plumbing work --
and until then it HONESTLY refuses to pretend, falling back to the classical
detector so the pipeline always produces a real result.

CONTRACT (identical to detector.detect_blobs_volume):
    detect_blobs_volume_learned(volume, **kw) -> dict[t] -> (N,3) (z,y,x) coords

DESIGN CHOICE -- why a U-Net-style foreground/centroid head, not blob detection:
    The classical detector's ceiling is per-frame intensity thresholding: a
    cell faint in one frame but bright in its neighbors is missed. A learned
    3D (or 3D+time) model predicts a per-voxel "is this a cell center"
    heatmap from context, recovering those. StarDist3D / a 3D U-Net are the
    standard choices. We keep the OUTPUT contract as centroids so the tracker
    downstream never changes -- the model is a swap-in for the detector only.

STATUS: no weights ship here (none could be trained without real data). If a
weights file is present at models/detector3d.pt AND torch is importable, this
runs the learned path; otherwise it falls back to the classical detector and
says so. Training entry point (train_from_geff) is stubbed with the exact
steps and shapes, ready to fill in against the real dataset.
"""
import os
import numpy as np


MODEL_PATH = os.environ.get(
    "SWEK_CELL_MODEL",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "detector3d.pt"),
)


def _torch():
    try:
        import torch  # noqa
        return torch
    except Exception:
        return None


def available():
    """True only if a trained model AND its runtime are actually present. We do
    NOT claim availability just because the code exists -- an untrained learned
    detector is worse than the honest classical one."""
    return _torch() is not None and os.path.exists(MODEL_PATH)


# ------------------------------------------------------------------ inference
def detect_blobs_volume_learned(volume, sigma=1.5, min_distance=4,
                                absolute_threshold=None, progress=False,
                                workers=1, use_gpu=False, adaptive=False,
                                subvoxel=False, **_ignored):
    """Drop-in for detect_blobs_volume. Uses the learned model when available;
    otherwise transparently falls back to the classical detector so the
    pipeline always runs. Extra kwargs are accepted and ignored for signature
    compatibility with the classical detector."""
    if not available():
        # HONEST fallback -- no trained model here.
        from detector import detect_blobs_volume
        if progress:
            print("[detector_learned] no trained model at %s -- using classical detector"
                  % MODEL_PATH)
        return detect_blobs_volume(
            volume, sigma=sigma, min_distance=min_distance,
            absolute_threshold=absolute_threshold, progress=progress,
            workers=workers, use_gpu=use_gpu, adaptive=adaptive, subvoxel=subvoxel,
        )

    torch = _torch()
    model = _load_model(torch)
    T = volume.shape[0]
    detections = {}
    for t in range(T):
        heat = _infer_frame(torch, model, volume[t], use_gpu=use_gpu)
        # peak-pick the predicted centroid heatmap with the SAME peak_local_max
        # + optional sub-voxel refinement as the classical path, so the tracker
        # sees identical-shaped output regardless of detector.
        from skimage.feature import peak_local_max
        coords = peak_local_max(heat, min_distance=min_distance,
                                threshold_abs=0.5, exclude_border=False)
        if subvoxel and len(coords):
            from detector import _refine_subvoxel
            coords = _refine_subvoxel(heat, coords, 0.5)
        detections[t] = coords
        if progress:
            print(f"  [learned] t={t}: {len(coords)} detections")
    return detections


_MODEL_CACHE = [None]


def _load_model(torch):
    if _MODEL_CACHE[0] is not None:
        return _MODEL_CACHE[0]
    model = _build_unet3d(torch)
    state = torch.load(MODEL_PATH, map_location="cpu")
    model.load_state_dict(state)
    model.eval()
    if torch.cuda.is_available():
        model = model.cuda()
    _MODEL_CACHE[0] = model
    return model


def _infer_frame(torch, model, frame, use_gpu=False):
    """Run the model on one (Z,Y,X) frame -> (Z,Y,X) centroid heatmap in [0,1].
    Normalizes input the same way training will (per-frame z-score), tiles if
    the volume is large, and returns a float32 heatmap."""
    x = frame.astype(np.float32)
    mu, sd = float(x.mean()), float(x.std() or 1.0)
    x = (x - mu) / sd
    with torch.no_grad():
        tens = torch.from_numpy(x)[None, None]  # (1,1,Z,Y,X)
        if torch.cuda.is_available():
            tens = tens.cuda()
        # NOTE: for large volumes, tile with overlap here. Left simple until we
        # know the real frame sizes from the competition data.
        logits = model(tens)
        heat = torch.sigmoid(logits)[0, 0].cpu().numpy()
    return heat


def _build_unet3d(torch):
    """A compact 3D U-Net (foreground/centroid head). Kept small + dependency-
    light on purpose; the real architecture (depth, channels, StarDist3D vs
    plain U-Net) gets chosen once we can measure against real validation data.
    Anisotropic pooling (stride 1 in z at the first level) respects the 4x
    coarser z axis -- the same physical fact the smoothing fix addressed."""
    nn = torch.nn

    class ConvBlock(nn.Module):
        def __init__(self, ci, co):
            super().__init__()
            self.net = nn.Sequential(
                nn.Conv3d(ci, co, 3, padding=1), nn.BatchNorm3d(co), nn.ReLU(inplace=True),
                nn.Conv3d(co, co, 3, padding=1), nn.BatchNorm3d(co), nn.ReLU(inplace=True),
            )

        def forward(self, x):
            return self.net(x)

    class UNet3D(nn.Module):
        def __init__(self, base=16):
            super().__init__()
            self.e1 = ConvBlock(1, base)
            # anisotropic first pool: keep z, halve y/x (z is ~4x coarser)
            self.p1 = nn.MaxPool3d((1, 2, 2))
            self.e2 = ConvBlock(base, base * 2)
            self.p2 = nn.MaxPool3d(2)
            self.b = ConvBlock(base * 2, base * 4)
            self.u2 = nn.ConvTranspose3d(base * 4, base * 2, 2, stride=2)
            self.d2 = ConvBlock(base * 4, base * 2)
            self.u1 = nn.ConvTranspose3d(base * 2, base, (1, 2, 2), stride=(1, 2, 2))
            self.d1 = ConvBlock(base * 2, base)
            self.head = nn.Conv3d(base, 1, 1)

        def forward(self, x):
            e1 = self.e1(x)
            e2 = self.e2(self.p1(e1))
            b = self.b(self.p2(e2))
            d2 = self.d2(torch.cat([self.u2(b), e2], 1))
            d1 = self.d1(torch.cat([self.u1(d2), e1], 1))
            return self.head(d1)

    return UNet3D()


# ------------------------------------------------------------------ training
def train_from_geff(data_dir, split="train", epochs=50, out=MODEL_PATH,
                    base_channels=16, lr=1e-3, device=None):
    """Train the detector from real volumes + geff ground-truth labels.

    This is the STUB with the exact recipe, ready to run against the real
    dataset. It intentionally raises until real data is present rather than
    training on synthetic blobs (which would just fit the generator).

    Steps (documented so it's a fill-in, not a rewrite):
      1. Load each (T,Z,Y,X) volume via io_utils.load_zarr_volume, and the geff
         ground-truth graph via io_utils.read_geff_nodes -> per-frame centroids.
      2. Build per-frame TARGET heatmaps: a small Gaussian bump (physical sigma,
         anisotropic in z) at each GT centroid -> (Z,Y,X) in [0,1].
      3. Sample fixed-size patches (e.g. 16x128x128) with a foreground bias so
         cells are not swamped by background; per-frame z-score normalize input.
      4. Train UNet3D with a Dice + focal/BCE loss on the heatmap; Adam(lr);
         hold out a few movies for validation.
      5. Validate by running the FULL pipeline (this detector -> tracker) on the
         held-out movies and scoring with metric.py -- optimize the real
         competition score, not just voxel loss.
      6. torch.save(model.state_dict(), out).
    """
    torch = _torch()
    if torch is None:
        raise RuntimeError("torch not installed -- pip install torch to train")
    # refuse to train without real labels present
    try:
        from io_utils import load_zarr_volume  # noqa
    except Exception as e:
        raise RuntimeError("io_utils/zarr not available: " + str(e))
    raise NotImplementedError(
        "train_from_geff is a ready-to-fill scaffold. It needs the real "
        "royerlab volumes + geff labels in '%s/%s'. The step-by-step recipe is "
        "in this function's docstring; wire it up once the data is on the box "
        "(training on synthetic blobs would fit the generator, not real cells)."
        % (data_dir, split)
    )


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="Learned 3D cell detector (scaffold)")
    ap.add_argument("--train", action="store_true", help="train from real geff labels")
    ap.add_argument("--data_dir", default="../test_data")
    ap.add_argument("--split", default="train")
    ap.add_argument("--epochs", type=int, default=50)
    args = ap.parse_args()
    if args.train:
        train_from_geff(args.data_dir, args.split, epochs=args.epochs)
    else:
        print("learned detector status:")
        print("  torch available:", _torch() is not None)
        print("  model present:  ", os.path.exists(MODEL_PATH), "(", MODEL_PATH, ")")
        print("  -> available():", available(), "(False = pipeline uses the classical detector)")
