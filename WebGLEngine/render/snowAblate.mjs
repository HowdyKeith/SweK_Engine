// WebGLEngine/render/snowAblate.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// THE TERMS OF THE SNOW BEAUTY PASS, EACH ABLE TO BE COMPILED OUT, so the pass's cost can be split by TERM and not only by pass. The rig's per-pass GPU times (2026-10-23) put 85 to 95% of the frame in the beauty fragment pass
// on both GPUs, and a timestamp can only say that, not which part of fsTerrain's per-pixel work it is. Zeroing a uniform does not do it: the shader runs the same code on a zero. So a term is REMOVED FROM THE SOURCE, the
// way a person would comment it out, and the pass is timed again (takeSnowFrameTiming --ablate). Each edit must match the shader EXACTLY ONCE: a shader that has moved on makes the ablation REFUSE, by name, instead of
// timing an unchanged shader and calling the term free. The result of removing a term is a different picture; this is a measuring tool, never a quality setting, and createSnowGpu takes it only as `ablate: [...]`.
"use strict";

const once = (label, find, to) => Object.freeze({ label, find, to });
export const ABLATIONS = Object.freeze({
    shadow:  { why: "the sun shadow: cascade selection, the PCSS blocker search and the filter taps",
               edits: [once("sunShadow call", "shadow = sunShadow(world, geoN, viewDist, noiseRot);", "shadow = 1.0;")] },
    sss:     { why: "the snow subsurface (back-scatter) term",
               edits: [once("snowSubsurface call", /let sss = snowSubsurface\(\s*N, L, V, sunRadiance, thickness,\s*F\.mtl\.y \* \(1\.0 - rockExposed\), F\.mtl\.z\s*\);/, "let sss = vec3f(0.0);")] },
    spec:    { why: "the GGX sun specular lobe",
               edits: [once("specular branch", "    if (NdotL > 0.0) {\n        let H = normalize(V + L);", "    if (false) {\n        let H = normalize(V + L);")] },
    sh:      { why: "the spherical-harmonic ambient irradiance (both evaluations)",
               edits: [once("sky SH irradiance", "var irradiance = shIrradiance(N, F.sh) * F.mtl.w;", "var irradiance = vec3f(0.5) * F.mtl.w;"), once("ground bounce SH", "shIrradiance(vec3f(0.0, 1.0, 0.0), F.sh)", "vec3f(0.5)")] },
    skyrefl: { why: "the sky reflection read from the baked LUT's mip chain",
               edits: [once("skyAtLevel call", "let skyRefl = skyAtLevel(R, mip);", "let skyRefl = vec3f(0.4);")] },
    glints:  { why: "the sparkle glints",
               edits: [once("glint branch", "if (F.wind.w > 0.001 && rockExposed < 0.5) {", "if (false) {")] },
    detail:  { why: "the three detail-normal layers (blended with RNM) of the wind-scoured surface",
               edits: [once("detail branch", "if (F.wind.z > 0.001) {", "if (false) {")] },
    fine:    { why: "the filtered fine relief (sastrugi, ripple, grain) in the fragment's normal",
               edits: [once("fineRelief call", /let fine = fineRelief\(world\.xz, exposure, footprint, input\.fineWl\);/, "let fine = vec3f(0.0);")] },
    deform:  { why: "the footprint deformation read (five taps, only where a footprint is)",
               edits: [once("deform branch", "if (dWeight > 0.001) {", "if (false) {")] },
    aerial:  { why: "the aerial perspective (the haze: near-sky blur and the Mie forward lobe)",
               edits: [once("applyAerial call", /color = applyAerial\(\s*color, F\.camPos\.xyz, world, -V, L,\s*sunRadiance,\s*F\.fog\.x, F\.fog\.y, F\.fog\.z,\s*F\.fog\.w\s*\);/, "")] },
});
/** The names, in the order the pass evaluates them; `all` is every one of them at once, the pass with only albedo, a wrap diffuse and a constant ambient left. */
export const ABLATION_NAMES = Object.freeze(["shadow", "sss", "spec", "sh", "skyrefl", "glints", "detail", "fine", "deform", "aerial"]);

const count = (src, find) => { if (typeof find === "string") { let n = 0, i = -1; while ((i = src.indexOf(find, i + 1)) >= 0) n++; return n; } return (src.match(new RegExp(find.source, "g")) || []).length; };

/** The beauty WGSL with the named terms removed. Unknown names and edits that do not match exactly once are refused. */
export function ablateWgsl(src, names) {
    const list = names.includes("all") ? ABLATION_NAMES : names;
    let out = src;
    for (const n of list) {
        const a = ABLATIONS[n];
        if (!a) throw new Error("snowAblate: no term named " + JSON.stringify(n) + " (have " + ABLATION_NAMES.join(", ") + ", all)");
        for (const e of a.edits) {
            const c = count(out, e.find);
            if (c !== 1) throw new Error("snowAblate: the " + e.label + " for term '" + n + "' matches " + c + " times in the shader, not once -- the shader has moved on and this ablation would measure nothing");
            out = typeof e.find === "string" ? out.replace(e.find, () => e.to) : out.replace(e.find, e.to);
        }
    }
    return out;
}
