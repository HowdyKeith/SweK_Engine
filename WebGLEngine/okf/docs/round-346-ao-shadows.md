---
type: doc
title: "Round 346 — OVM + Vertex-attribute AO + PCF shadow mapping"
tags: ["swek-engine", "round-doc"]
---

# Round 346 — OVM + Vertex-attribute AO + PCF shadow mapping

Two production lighting techniques layered on the v345 OVM renderer. Both toggle independently in the panel so you can see what each contributes.

## 1. Vertex-attribute Ambient Occlusion

The classic technique from Minecraft and every voxel engine since: precompute occlusion at content-bake time, store it per-vertex, free at render time.

### Encoding

8 cube corners × 4 bits each = 32 bits = exactly one `uint32` per voxel. Each 4-bit slot holds an AO score 0–3, where:
- **3** = fully exposed corner (all neighbors empty)
- **0** = fully occluded (all 3 neighbors filled)

```
bit layout per voxel uint32 (LSB → MSB):
  [ corner0:4 | corner1:4 | corner2:4 | corner3:4 |
    corner4:4 | corner5:4 | corner6:4 | corner7:4 ]

corner index encoding (binary):
  bit 0 = +X(1)/-X(0)
  bit 1 = +Y(1)/-Y(0)
  bit 2 = +Z(1)/-Z(0)
```

### Which neighbors count

For corner sign `(sx, sy, sz)`, the 3 edge-adjacent cells checked are:
```
(sx, sy, 0)   // XY edge
(sx, 0, sz)   // XZ edge
(0, sy, sz)   // YZ edge
```

This is "Minecraft-style" AO — edge neighbors only, not face neighbors. A face-adjacent voxel (e.g., at `(1,0,0)` next to a voxel at the origin) doesn't darken any corner; the shared face is just hidden. Tests verify this: T2 places a neighbor at `(1,1,0)` (edge-adjacent) and observes corner 3 score drops 3 → 2.

### How the shader reads it

The cube is now rendered with **indexed geometry**: 8 unique corner vertices + 36 indices. With `drawElementsInstanced`, `gl_VertexID` returns the **index value** from the index buffer — which for our setup means a number 0-7 identifying the cube corner. The vertex shader does:

```glsl
int corner_idx = gl_VertexID & 7;
uint shifted = i_ao_bitmask >> (uint(corner_idx) * 4u);
float ao_score = float(shifted & 0x3u);     // 0..3
float ao_norm = ao_score / 3.0;              // 0..1
v_ambient_occlusion = 0.25 + ao_norm * 0.75; // [0.25, 1.0]
```

The AO factor is interpolated across the cube's triangles by the rasterizer and applied in the fragment shader as a multiplier on the ambient term and a softer multiplier on the diffuse term.

### Important plumbing detail

The AO buffer is bound with `vertexAttribIPointer` (capital-I), not `vertexAttribPointer`. The capital-I variant tells WebGL **"this is a real integer attribute, don't normalize or float-convert it"** — required for the bitmask to round-trip through the shader as a `uint`.

## 2. PCF Shadow Mapping

Two-pass rendering with a 1024² depth-only framebuffer.

### Pass 1 — shadow depth from light's POV

A second, minimal shader that does the exact same vertex transform as the main pass but writes only `gl_Position` (no fragment outputs). The output goes into a `DEPTH_COMPONENT24` texture attached to a framebuffer. Depth-only FBO setup:

```js
gl.framebufferTexture2D(FRAMEBUFFER, DEPTH_ATTACHMENT, TEXTURE_2D, shadowTex, 0);
gl.drawBuffers([gl.NONE]);   // no color attachment
gl.readBuffer(gl.NONE);
```

The light view-projection matrix is computed per frame: orthographic projection sized to the asset's bounding box, view matrix is a `lookAt(lightPos, bboxCenter, up)` with light positioned 30+ units behind the asset along the `-lightDir` ray.

### Pass 2 — main render samples the shadow map

The main fragment shader's `calculateShadow()` function does 3×3 PCF (Percentage-Closer Filtering):

```glsl
float calculateShadow(vec4 light_space_pos, vec3 normal) {
    vec3 proj = light_space_pos.xyz / light_space_pos.w;
    proj = proj * 0.5 + 0.5;
    if (proj.z > 1.0 || proj.x < 0.0 || proj.x > 1.0 || ...) return 0.0;
    float bias = max(0.005 * (1.0 - dot(normal, u_light_dir)), 0.0008);
    vec2 texel_size = 1.0 / vec2(textureSize(u_shadow_map, 0));
    float shadow = 0.0;
    for (int x = -1; x <= 1; ++x) {
        for (int y = -1; y <= 1; ++y) {
            float pcf_depth = texture(u_shadow_map, proj.xy + vec2(x, y) * texel_size).r;
            shadow += (current_depth - bias > pcf_depth) ? 1.0 : 0.0;
        }
    }
    return shadow / 9.0;
}
```

3×3 samples → softer edges than hard shadow. Slope-scale bias prevents shadow acne where the surface is parallel to the light.

## Cube became indexed

For v346 the cube goes from 36 standalone verts (flat-shaded faces) to 8 unique corners + 36 indices (smoothed corner normals). Trade-off:
- **Gained**: `gl_VertexID` becomes 0-7, enabling clean AO lookup
- **Lost**: flat face shading — now corners are Gouraud-smoothed
- **Won't notice**: the dual-grid offset already breaks flat shading anyway, so smoothed normals fit better visually

## Tests — 1318/1318 cumulative

`test_v346.mjs` adds 45 tests across 9 groups:

- **T1** Isolated voxel — mask = `0x33333333` (all corners score 3)
- **T2** Edge-adjacent neighbor at (1,1,0) drops corner 3 + corner 7 from 3 to 2; corners on the -X side stay at 3
- **T3** Voxel surrounded by all 26 neighbors → mask = `0x00000000`
- **T4** 4-bit slot layout: corners with 2 occluders score 1, corners with 1 occluder score 2
- **T5** `generateWithAO` wires AO; tested surface vs interior of a sphere — surface avg AO 12.3, interior avg AO 0.0 (interior is enclosed, occluded everywhere)
- **T6** All 4 generators (sphere/torus/roundedBox/terrain) gain AO via `generateWithAO`
- **T7** Shader source has: location-5 uint attribute, capital-I `vertexAttribIPointer`, `gl_VertexID & 7`, PCF function, `textureSize` lookup, 24-bit depth attachment, FBO completeness check, separate shadow program, indexed `drawElementsInstanced`
- **T8** Engine version v346, demo wiring intact
- **T9** Edge cases: empty input → empty output; two adjacent voxels have mirror-symmetric AO patterns (sum of +X corners on voxel 0 = sum of -X corners on voxel 1)

## Try it

```js
engineVersion()      // "v346"
demos.set("ovm")
```

In the panel:
1. **Sphere**, smoothness 0.40 — looks the same as v345 by default
2. **Untick AO** — crevices brighten back up; you can see how much shape definition AO was adding
3. **Re-tick AO**, **untick shadows** — flat lighting, less depth perception
4. **Both on** — full quality
5. Try **roundedBox** — corners get the strongest AO darkening since they have the most neighbors
6. Try **terrain** — bottom valleys go dark; ridges stay bright
7. **Export .ovm** still works; AO is recomputed on import (not baked into the file)

## On the data efficiency

For a 925-voxel sphere:
- `.ovm` binary: 8 + 925 × 22 = **20,358 bytes**
- AO buffer:    925 × 4   = **3,700 bytes**

The AO buffer is ~18% the size of the geometry. For real TRELLIS-2 assets (~32K voxels typical), that's ~700 KB geometry + 128 KB AO. Both fit comfortably in one `gl.bufferData()` per asset. Zero per-frame cost.

## Lineup

| Round | What |
|---|---|
| ✅ v343-v345 | Demo trilogy (NRC / Flow / OVM) |
| ✅ v346 | AO + PCF shadows on OVM (this) |
| v347 | Frustum chunks (16³ AABB tests) + sparse-voxel-octree LoD |
| v348+ | Sister formats — `MOL!` / `MTO!` / `WND!` / `P3D!` |
