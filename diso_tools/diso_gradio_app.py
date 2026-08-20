# diso_gradio_app.py — a REAL, working Gradio playground for the diso package
# you compiled (SarahWeiii/diso). Drop this in C:\diso_manual and launch it with
# your embedded python:
#
#   set "PythonEmbed=C:\VoxelBAK\ComfyUI_windows_portable\python_embeded"
#   "%PythonEmbed%\python.exe" -m pip install gradio
#   "%PythonEmbed%\python.exe" diso_gradio_app.py
#
# Then open http://127.0.0.1:7860 in Chrome.
#
# ── HONEST SCOPE ────────────────────────────────────────────────────────────
# This is NOT Sparc3D image->3D. Sparc3D needs its own trained model (image
# encoder -> latent -> dense SDF/occupancy volume) plus spconv, which don't fit
# the portable embedded python. What this DOES do is exercise your freshly
# compiled diso._C end to end: it builds an analytic SDF grid for a chosen
# primitive, runs the REAL diso Differentiable Dual Marching Cubes extractor,
# and shows the resulting watertight mesh in the browser. If this renders a
# clean sphere/torus/gyroid, your diso build is wired correctly and any higher
# pipeline that feeds diso a dense SDF volume (Sparc3D's "Sparcubes" stage,
# Trellis remesh, your own occupancy net) will work too.
#
# The diso API used here is the documented one:
#   from diso import DiffDMC
#   diffdmc = DiffDMC(dtype=torch.float32).cuda()
#   verts, faces = diffdmc(sdf, deform=None, normalize=True)
#   # sdf: (N, N, N) tensor; diso convention is INNER = NEGATIVE
#   # verts: (V, 3) float in [0, 1];  faces: (F, 3) int
# ────────────────────────────────────────────────────────────────────────────

import os
import sys
import time
import math

import torch
import numpy as np
import gradio as gr

# Make the portable site-packages explicit so the local torch + diso are found
# even if the cwd is odd. (Harmless if already importable.)
_PORTABLE = r"C:\VoxelBAK\ComfyUI_windows_portable\python_embeded\Lib\site-packages"
if os.path.isdir(_PORTABLE) and _PORTABLE not in sys.path:
    sys.path.insert(0, _PORTABLE)

from diso import DiffDMC   # the real extractor

# ── device + extractor (build ONCE, reuse — per the diso docs) ──────────────
_HAS_CUDA = torch.cuda.is_available()
_DEVICE = torch.device("cuda" if _HAS_CUDA else "cpu")
print(f"[diso-app] torch {torch.__version__}  CUDA available: {_HAS_CUDA}  device: {_DEVICE}")

# DiffDMC(...).cuda() is the documented path. On a CUDA box (your GTX 10xx) this
# is the fast path. If CUDA is somehow unavailable we keep it on CPU (diso has a
# CPU/MPS fallback in recent versions); it'll be slower but still runs.
_extractor = DiffDMC(dtype=torch.float32)
if _HAS_CUDA:
    _extractor = _extractor.cuda()


# ── analytic SDF builders (INNER NEGATIVE, the diso convention) ─────────────
# Grid spans [-1, 1] on each axis at resolution N -> sdf shape (N, N, N).
def _coords(n):
    lin = torch.linspace(-1.0, 1.0, n, device=_DEVICE)
    gx, gy, gz = torch.meshgrid(lin, lin, lin, indexing="ij")
    return gx, gy, gz


def sdf_sphere(n, radius=0.75):
    gx, gy, gz = _coords(n)
    return torch.sqrt(gx * gx + gy * gy + gz * gz) - radius          # inside < 0


def sdf_torus(n, R=0.55, r=0.22):
    gx, gy, gz = _coords(n)
    q = torch.sqrt(gx * gx + gy * gy) - R
    return torch.sqrt(q * q + gz * gz) - r                           # inside < 0


def sdf_box(n, half=0.6, round_r=0.08):
    gx, gy, gz = _coords(n)
    dx = gx.abs() - half
    dy = gy.abs() - half
    dz = gz.abs() - half
    outside = torch.sqrt(torch.clamp(dx, min=0) ** 2 +
                         torch.clamp(dy, min=0) ** 2 +
                         torch.clamp(dz, min=0) ** 2)
    inside = torch.clamp(torch.maximum(torch.maximum(dx, dy), dz), max=0)
    return outside + inside - round_r                                # inside < 0


def sdf_two_spheres(n, radius=0.42, sep=0.45):
    gx, gy, gz = _coords(n)
    d1 = torch.sqrt((gx - sep) ** 2 + gy * gy + gz * gz) - radius
    d2 = torch.sqrt((gx + sep) ** 2 + gy * gy + gz * gz) - radius
    return torch.minimum(d1, d2)                                     # union, inside < 0


def sdf_gyroid(n, thickness=0.18, scale=2.6):
    # Not a true distance field, but a valid implicit surface; great stress test
    # for the extractor's handling of a complex genus surface.
    gx, gy, gz = _coords(n)
    sx, sy, sz = gx * math.pi * scale, gy * math.pi * scale, gz * math.pi * scale
    field = (torch.sin(sx) * torch.cos(sy) +
             torch.sin(sy) * torch.cos(sz) +
             torch.sin(sz) * torch.cos(sx))
    # |field| < thickness  ->  the thin gyroid shell; make that region negative
    return field.abs() - thickness


_SHAPES = {
    "sphere": sdf_sphere,
    "torus": sdf_torus,
    "rounded box": sdf_box,
    "two spheres (union)": sdf_two_spheres,
    "gyroid": sdf_gyroid,
}


# ── the pipeline: build SDF -> run REAL diso -> export OBJ ───────────────────
def generate(shape_name, resolution, isovalue):
    resolution = int(resolution)
    t0 = time.time()

    builder = _SHAPES.get(shape_name, sdf_sphere)
    sdf = builder(resolution).contiguous().to(torch.float32)

    # Apply the iso offset by shifting the field (diso extracts the zero level).
    # A positive isovalue grows the solid; negative shrinks it.
    sdf = sdf - float(isovalue)

    # diso: verts in [0,1], faces int. deform=None -> watertight manifold.
    with torch.no_grad():
        verts, faces = _extractor(sdf, deform=None, normalize=True)

    verts_np = verts.detach().cpu().numpy().astype(np.float32)
    faces_np = faces.detach().cpu().numpy().astype(np.int64)

    # Center + scale [0,1] -> [-1,1] so it sits nicely in the viewer.
    verts_np = verts_np * 2.0 - 1.0

    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "diso_output.obj")
    _write_obj(out_path, verts_np, faces_np)

    dt = time.time() - t0
    info = (f"{shape_name} @ {resolution}³  ->  "
            f"{len(verts_np):,} verts / {len(faces_np):,} faces  "
            f"in {dt:.2f}s on {_DEVICE.type}")
    print("[diso-app]", info)
    return out_path, info


def _write_obj(path, verts, faces):
    # trimesh is a diso dependency, so prefer it (handles normals/validation);
    # fall back to a hand-written OBJ if it's missing for any reason.
    try:
        import trimesh
        mesh = trimesh.Trimesh(vertices=verts, faces=faces, process=False)
        mesh.export(path)
        return
    except Exception as e:
        print("[diso-app] trimesh export failed, writing OBJ by hand:", e)
    with open(path, "w") as f:
        for v in verts:
            f.write(f"v {v[0]:.6f} {v[1]:.6f} {v[2]:.6f}\n")
        for tri in faces:
            f.write(f"f {int(tri[0]) + 1} {int(tri[1]) + 1} {int(tri[2]) + 1}\n")


# ── UI ──────────────────────────────────────────────────────────────────────
with gr.Blocks(title="diso playground (real DiffDMC)") as app:
    gr.Markdown("# diso playground — real Differentiable Dual Marching Cubes")
    gr.Markdown(
        "Exercises your compiled **diso._C** end to end: analytic SDF → real "
        "`DiffDMC` extraction → watertight mesh. *Not* Sparc3D image→3D (that "
        "needs the trained model + spconv) — this proves the diso build works so "
        "any pipeline that feeds it a dense SDF volume will too."
    )
    with gr.Row():
        with gr.Column():
            shape = gr.Dropdown(choices=list(_SHAPES.keys()), value="sphere", label="Implicit shape")
            res = gr.Slider(minimum=16, maximum=256, value=96, step=16, label="Grid resolution (N³)")
            iso = gr.Slider(minimum=-0.3, maximum=0.3, value=0.0, step=0.01, label="Iso-surface offset")
            go = gr.Button("Extract mesh with diso", variant="primary")
            status = gr.Textbox(label="result", interactive=False)
        with gr.Column():
            out3d = gr.Model3D(label="diso output mesh")
    go.click(fn=generate, inputs=[shape, res, iso], outputs=[out3d, status])

if __name__ == "__main__":
    app.launch(server_name="127.0.0.1", server_port=7860, share=False)
