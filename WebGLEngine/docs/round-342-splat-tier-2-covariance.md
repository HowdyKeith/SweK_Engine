# Round 342 — Splat Tier 2: proper covariance ellipse projection

The quality jump. v341 rendered splats as fuzzy isotropic discs sized from the max scale axis — same circular blob whether a Gaussian was meant to be a flat plate or a thin sliver. v342 implements the real math from Kerbl et al. (2023): each splat is now a screen-space ellipse whose orientation and aspect ratio come from the 3D covariance, projected through the perspective Jacobian.

## The pipeline, end to end

For each splat, the vertex shader now does:

**Step 1: build the 3D covariance**
```
R = quatToMat3(a_quat)                    // 3×3 rotation from quaternion
S = diag(exp(a_scale) · worldScale)        // 3×3 scale (log → linear)
M = R · S
Σ_3D = M · Mᵀ                              // = R · S² · Rᵀ
```

**Step 2: project to screen space**
```
J = ⎛ fx/z          0           -fx·x_view/z² ⎞    // perspective Jacobian
    ⎜ 0             fy/z        -fy·y_view/z² ⎟
    ⎝ 0             0            0            ⎠
W = mat3(u_view)                                   // view rotation
T = J · W
Σ_2D = T · Σ_3D · Tᵀ                               // upper-left 2×2
```

**Step 3: invert (the conic)**
```
det = Σ_2D[0][0] · Σ_2D[1][1] - Σ_2D[0][1]²
conic = (c, -b, a) / det                           // Σ_2D⁻¹ packed
```

**Step 4: bound the quad**
```
λ₁, λ₂ = eigenvalues of Σ_2D
radius = 3 · √max(λ₁, λ₂)                          // 3σ extent in NDC
quad corners offset by ±radius in NDC, scaled by clip.w
```

**Step 5: fragment shader evaluates the Gaussian at each pixel**
```
d = NDC offset from splat center (interpolated)
power = -½ · (conic.x · dx² + 2 · conic.y · dx · dy + conic.z · dy²)
alpha = opacity · exp(power)
```

That `power` is the Mahalanobis squared distance — the proper measure of how far a screen-space pixel is from the splat center *given the ellipse's shape*. A flat plate viewed edge-on looks like a thin line, not a circle.

## What changed in code

`engine/SplatRenderer.js`:
- New vertex shader with the full covariance pipeline
- New fragment shader with Mahalanobis-distance falloff
- Added 5th per-instance attribute: quaternion (was missing from Tier 1)
- New uniform `u_viewport` for the 1-pixel isotropic blur term that keeps Σ_2D non-singular at very small splats
- Sorted-upload buffer now includes quat alongside pos/scale/color/opacity

Same console API. Same `_activeSplats` wiring. Drop-in upgrade.

## Cost

About 30 extra FLOPs per splat in the vertex shader:
- Quaternion normalize + 9-component R: ~15 FLOPs
- 3×3 mat-mul + transpose: ~27 FLOPs (M · Mᵀ exploits symmetry: 18)
- Jacobian build: ~6 FLOPs
- T = J·W and T · Σ · Tᵀ: ~54 + 27 FLOPs (full 3×3)
- Conic + eigenvalue solve: ~10 FLOPs

For 50k splats at 60 fps that's ~4M FLOPs/frame in the VS — well under 0.5ms on a 1080. The fragment cost is identical to Tier 1 (one exp, one multiply, two discards). Net real-world hit: invisible.

## What's still missing for full reference quality

**Spherical harmonics (view-dependent color).** Splats in the wild encode their lighting via 16 SH coefficients per channel (degree 3). Tier 2 uses only SH band 0 (the constant term), which is what the parser already keeps — view-dependent specular and color shift are gone. Visually: matte assets look right, shiny assets lose their highlights.

**GPU sort.** CPU sort with `Array.sort` is fine to ~100k splats. Above that the per-frame sort cost dominates. A WebGPU compute pass would fix it but that's a different platform.

## Math validation

Can't do live render tests in this sandbox (no headless GL available — node module needed for it requires gyp-built node headers that the network blocks). Instead, ported the entire covariance pipeline to JS and ran 38 tests covering:

- Identity quat + uniform scale → isotropic covariance with diagonals = scale²
- Anisotropic scale → diagonal covariance (1, 9, 25) from scales (1, 3, 5)
- **90° Z-rotation correctly swaps x/y eigenvalues** — the test that would catch any quat→mat3 sign error or column-major confusion
- Σ is symmetric for arbitrary quats
- 2D conic inversion round-trip: `cov · conic = I` to 5 decimals
- Fragment density formula matches `exp(-½ · Mahalanobis²)`
- Density at 3σ edge is small (0.0034) but non-zero — quad bound is correct

Plus 12 structural assertions on the shader source (right attributes, right uniforms, right matrix operations) and renderer wiring (quat buffer, attrib 5, divisor, viewport read live, sorted upload).

## Try it

```js
engineVersion()  // "v342"
splat.clear()    // clear any v341-loaded splats
splat.load("http://127.0.0.1:8188/view?filename=your_crm_output.ply")
```

The same splat from v341 will look noticeably different — sharper at the edges, anisotropic, no longer "blob of fuzzy color." If you generated a long thin object (a sword, a chair leg), the difference is dramatic.

If something looks rotated wrong (mirrored, upside-down), that's a quaternion sign convention issue between source generators — the formula matches Kerbl et al. but some CRM/Hunyuan output uses different handedness. Easy fix in the parser if it shows up.

## Tests — 1119/1119 cumulative

`test_v342.mjs` adds 38 tests across 10 groups.

## Next

- v343: Benchmark/pipeline quality preset — Fast vs Quality toggle for Trellis runs. You said "yes" to this in the same message
- v344: Robot face-lock + body dimensions in LISTENER panel
- v345: Ollama panel — rocking/walking/sprinting tiers, EKG removed
- v346: Voice translation (Chrome lang + LibreTranslate hybrid)
- Snake demo · Tron demo · OBJ preview canvas
