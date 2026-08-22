# Mojo sub-voxel experiment

Does Mojo meaningfully beat the current NumPy version of the cell-tracking
sub-voxel centroid loop (`detector._refine_subvoxel`), with identical results?
This experiment answers that with real numbers before any commitment. Nothing
in the engine depends on Mojo.

## Two ways to run it

### A) Google Colab (recommended -- no local install, real NVIDIA GPU)

Upload `mojo_subvoxel_colab.ipynb` to https://colab.research.google.com and run
top to bottom. It installs Mojo, runs the CPU comparison (NumPy vs a Mojo port,
verified identical then timed), and demos a Mojo GPU kernel. For the GPU cell:
Runtime -> Change runtime type -> GPU (T4/L4/A100 all work).

Colab is the clean path because Mojo is Linux/macOS-only (Windows needs WSL2),
and Colab gives real NVIDIA GPUs your fleet can't easily offer Mojo.

Regenerate the notebook after edits: `python3 build_notebook.py`

### B) On a fleet box (via the engine)

Settings -> Auto-Install -> the "mojo (experimental)" row -> Detect / Install /
Run benchmark. Runs `bench.py` locally through the engine bridge. Linux or the
Intel Mac (CPU path); Windows needs WSL2.

## Files
- `mojo_subvoxel_colab.ipynb` -- the Colab notebook (generated).
- `build_notebook.py` -- regenerates the notebook.
- `subvoxel.mojo` -- the Mojo kernel (also embedded in the notebook).
- `bench.py` -- the local harness the engine's "Run benchmark" button calls.

## What to report back
The CPU comparison table (does it say IDENTICAL? what speedups?), the GPU demo
output, and any build errors verbatim -- Mojo is beta, so a moved stdlib symbol
is expected and easy to pin. From those numbers we decide whether Mojo earns a
place in the pipeline.
