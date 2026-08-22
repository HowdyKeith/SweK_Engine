---
type: doc
title: CSM Shader Integration — round 302 (COMPLETE for voxel terrain)
tags: ["swek-engine", "round-doc"]
---

# CSM Shader Integration — round 302 (COMPLETE for voxel terrain)

Round 301 built the `CascadedShadowPass` module + CPU-side render loop.
Round 302 wired the **voxel** renderer's fragment shader to consume
cascade samplers, with cascade selection by view-space Z and per-cascade
PCF. The shader rewrite that this doc previously described is **done**
for the voxel program.

## Status by renderer

| Renderer | Casts shadows | Receives shadows | CSM | Notes |
|---|---|---|---|---|
| **Voxel terrain** | yes | yes | **3 cascades + 9-tap PCF** | Most visible surface; the upgrade is here |
| EntityMeshRenderer (rigged) | yes | no | n/a | FS doesn't sample shadows at all; entity shadow reception is a separate feature |
| EntityCubeRenderer | yes | no | n/a | Same as above |
| TurretRenderer | yes | no | n/a | Same |

For now, terrain gets sharp near-camera shadows while entities standing
on it still see the same lit-from-above shading. Adding entity shadow
reception (with CSM) would be a separate round.

## Toggle

CSM is **disabled by default** because rendering 3 depth passes is ~3×
the cost of the single shadow pass. Enable from the console:

```js
window.csm._renderOn = true;
```

When off, the voxel FS falls back to the single-cascade path
(`uShadowCascadeCount = 1` → samples `uShadowMap` like before). No
visual change vs round 301 in that state.

## Mechanism in the voxel FS

1. CPU sets `uShadowCascadeCount = N` (3 by default) when CSM is active.
2. FS computes view-space Z: `dot(vWorld - uCamPos, uCamForward)`.
3. Branches to cascade 0/1/2 based on `uSplitDistances.xyz`.
4. Each cascade does its own 9-tap PCF in its own sampler.
5. Bias is scaled per cascade (`1.0 + cIdx * 0.6`) because depth precision
   degrades with distance.

GLSL doesn't allow array-indexing of `sampler2D` arrays with non-constant
indices in WebGL 2, so cascade selection is implemented as an unrolled
`if-else` chain — three separate texture-sampling blocks.

## Texture unit map (with CSM enabled)

| Unit | Bound texture |
|---|---|
| TEXTURE3 | Cascade 0 (also the single-cascade fallback slot) |
| TEXTURE4 | Bloom god-ray output (pre-existing, untouched) |
| TEXTURE6 | Cascade 1 |
| TEXTURE7 | Cascade 2 |

TEXTURE5 is left open; the prior texture-unit conventions in the engine
keep it free.

## Camera-basis math

`main.js` builds the world-space forward / right / up vectors from
`camera.yaw` and `camera.pitch` (engine convention: yaw=0 → look toward
-Z). These feed `csm.buildLightMatrices()` so each cascade's view-frustum
slice is computed from the correct view direction.

```js
const cy = Math.cos(camera.yaw  ?? 0), sy = Math.sin(camera.yaw  ?? 0);
const cp = Math.cos(camera.pitch ?? 0), sp = Math.sin(camera.pitch ?? 0);
const fwd   = { x:  sy * cp, y: sp, z: -cy * cp };
const right = { x:  cy,     y: 0,  z:  sy      };
const up    = { /* right × fwd */ };
```

## What's still deferred

- **Cascade transition smoothing.** Hard snap at split boundaries is
  visible as a fine seam in some lighting. Industry fix is a 5%
  overlap band with smoothstep between adjacent cascades. Cheap to add
  in the FS; deferred until A/B testing shows it's worth the cost.
- **Entity shadow reception.** Rigged + cube + turret renderers don't
  sample shadows. Adding it consistently across all three renderers
  with the same cascade selection helper would unify shadow quality.
- **Cascade resolution tuning.** Currently 1024² per cascade. Far
  cascades could drop to 512² since they cover much larger world area
  per texel anyway. ~25% perf gain if profile shows the depth pass is
  the bottleneck.

