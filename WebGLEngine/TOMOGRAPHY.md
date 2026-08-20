# Tomography — a verification pass, not a plan

Web-verified 2026-07-15. Nothing below is baked into the engine. Nothing has been ported.
The standing rule is verify-before-bake, and the FluidX3D round is why: a library can be excellent
and still be unusable for the thing Keith actually wants out of this project.

## What was actually checked, and how

The GitHub API was the obvious route and it was closed: HTTP 403, `x-ratelimit-remaining: 0` — the
sandbox's shared IP had exhausted the unauthenticated quota. A first pass reported all sixteen repos
as "0 stars, no license, never pushed", which was not sixteen dead projects, it was one broken
script. That is recorded because a uniform result across sixteen independent things is never data.

Verified via search instead:

| project | license | state | what it is |
|---|---|---|---|
| **astra-toolbox/astra-toolbox** | **GPL-3.0** | 595 stars, pushed Apr 2026 | GPU primitives for 2D/3D tomography (FBP, SIRT, SART, CGLS), CUDA, Python/MATLAB. The serious one. |
| **tomopy/tomopy** | **BSD-3** | active, Argonne | Reconstruction + ring removal + phase retrieval. Integrates ASTRA and UFO as optional backends. |
| **github.com/tomography** (org) | mixed, BSD-3 where stated | `tomocupy` pushed Mar 2026 | Argonne's org: tomocupy (GPU recon), holotomocupy, tomopy-cli, xlearn, XRFtomo, **tomobank** — a public tomography DATA bank. |

Not yet verified, and therefore not characterised here: LLNL/LEAP, TomographicImaging/CIL, algotom,
CERN/TIGRE, villekf/OMEGA, diamondlightsource/Savu, nDTomo, QURIT/PyTomography, CT-CLIP, muograph,
SPACEtomo, TomograPy, HelTomo, tomopedia, tomoatt, slicer.org, openneuro, opentopography.

## The license split is the whole decision

**ASTRA is GPLv3.** That is the FluidX3D situation again, precisely. GPL is not a bad licence — it is
a *choice about the whole project*. Link ASTRA into SweK and SweK becomes GPLv3: every line of the
engine, the ES port, the brain, all of it. For a portfolio built to be shown to employers and owned
outright, that is not a detail to discover later.

**TomoPy is BSD-3.** Usable. So is tomobank's data.

## What this lands in — the unverified read, now with a reason

Reconstruction is: *projections in, volume out*. A stack of 2D X-ray images at known angles becomes a
3D scalar field. That output is **exactly** what this engine already eats:

- `simulation/MarchingCubes.js` — `marchScalarField(field, nx, ny, nz, iso)`, which already turns a 3D
  scalar field into an isosurface, headless, and is doing it right now for the D3Q19 wake and the
  convection plumes.
- the voxel machinery, and `celltrack.html`'s existing "volume → structures" pipeline.

So Keith's hope was right: it lands in machinery that already exists. **Reconstruction is not a
rendering problem for this engine — it is a scalar-field problem, and the scalar-field half is built.**

## The recommendation, and it is the lattice argument again

Do not port ASTRA. Not because it is bad — because of what happened with the fluids.

The lattice was not ported. It was **owned**, and then made to earn Poiseuille's parabola to 0.07%,
the exact speed of sound, Rayleigh's 1708 twice, and a shock compressing by exactly six. That
verification discipline is the thing that makes this project worth showing to anyone, and it is not
available second-hand: you cannot inherit it by importing a library, and a GPL library would cost the
whole engine's licence for the privilege.

And tomography has an unusually good exact answer waiting. **The Radon transform of an ellipse is
analytic.** The Shepp–Logan phantom is a sum of ellipses — which means its sinogram can be computed
in closed form, with no reconstruction involved at all. So filtered back-projection (which is roughly
100 lines: Ram-Lak filter, backproject, done) can be checked the same way everything else here was:

- build the analytic sinogram of a known phantom — exact, no simulation
- reconstruct it with our own FBP
- measure the error against the phantom we started from, and watch it converge as the angle count rises

That is a fluid-arc-shaped round: own a small thing, verify it against mathematics, mark honestly what
it cannot do. The GPU version would then follow the pattern already established — WGSL with the
constants interpolated from the verified JS, shipped with an adjudicator.

## Where the real data would come from

**tomobank** (BSD-3, Argonne) is a public data bank of real tomographic datasets. That is the same
posture already agreed for TNG/yt: **real data as DATA for a viewer, not a port of someone's pipeline.**

## Status

PARKED until Keith calls it. Nothing baked. Nothing installed. The rig results come first.
