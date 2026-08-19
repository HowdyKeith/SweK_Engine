// engine/reproParams.js — v1986
// Deterministic reproduction from the URL. Three params, all optional:
//   ?seed=N            set the world seed BEFORE generation (worldSeed.js) so terrain/caves/decor are identical
//   ?cam=x,y,z,yaw,pitch   place the camera exactly (otherwise spawn is Math.random) so the VIEW is identical
//   ?preset=name       apply a named bundle (seed + cam + a note) from the small PRESETS table below
//
// Why: a specific world+view can be reproduced from a link — for sharing a spot, filing a "looks wrong here"
// report, and (the reason this exists now) giving the render-QA harness STABLE baseline shots instead of a
// random spawn every run. Pairs with tools/render-qa: point the manifest at /index.html?preset=qa1 and the
// baseline is reproducible.
//
// It also exposes window.repro.link() → the URL that reproduces the CURRENT world+camera, and a console line,
// so you can capture a spot you're looking at.

const PRESETS = {
    // A fixed, reproducible QA viewpoint: known seed + a framed camera. Tune the numbers once on the rig.
    qa1: { seed: 4242, cam: [0, 46, 0, 0, -0.32], note: "render-QA baseline view" },
};

function _num(v, def) { const n = parseFloat(v); return Number.isFinite(n) ? n : def; }

// Parse the URL params into a normalized { seed, cam:[x,y,z,yaw,pitch], preset, source } (or nulls).
export function parseReproParams(search) {
    let out = { seed: null, cam: null, preset: null };
    let q; try { q = new URLSearchParams(search != null ? search : (typeof location !== "undefined" ? location.search : "")); } catch { return out; }
    const preset = q.get("preset");
    if (preset && PRESETS[preset]) { out.preset = preset; out.seed = PRESETS[preset].seed ?? null; out.cam = PRESETS[preset].cam ? PRESETS[preset].cam.slice() : null; }
    const seedRaw = q.get("seed");
    if (seedRaw != null && seedRaw !== "") { const s = parseInt(seedRaw, 10); if (Number.isFinite(s)) out.seed = s; }   // explicit ?seed overrides preset
    const camRaw = q.get("cam");
    if (camRaw) {
        const p = camRaw.split(",").map(s => s.trim());
        if (p.length >= 3) out.cam = [_num(p[0], 0), _num(p[1], 40), _num(p[2], 0), _num(p[3], 0), _num(p[4], -0.32)];   // yaw/pitch optional
    }
    return out;
}

// Apply the SEED early — before the generators read worldSeed. Best-effort: sets localStorage directly (the
// same key worldSeed.js persists to) so it's in place even before that module loads, then also calls the API.
export async function applySeedEarly(params) {
    if (params.seed == null) return false;
    try { if (typeof localStorage !== "undefined") localStorage.setItem("voxelengine.worldSeed_v1", String(params.seed | 0)); } catch {}
    try { const mod = await import("./worldSeed.js"); if (mod && mod.setWorldSeed) mod.setWorldSeed(params.seed | 0); } catch {}
    try { console.log("[repro] seed = " + (params.seed | 0) + (params.preset ? (" (preset " + params.preset + ")") : "")); } catch {}
    return true;
}

// Apply the CAMERA once the camera object exists (call after window.camera is set + spawn logic ran).
export function applyCamera(camera, params) {
    if (!camera || !params.cam) return false;
    const [x, y, z, yaw, pitch] = params.cam;
    try {
        if (camera.position) { camera.position.x = x; camera.position.y = y; camera.position.z = z; }
        if (Number.isFinite(yaw)) camera.yaw = yaw;
        if (Number.isFinite(pitch)) camera.pitch = pitch;
        console.log("[repro] camera pinned to (" + x + ", " + y + ", " + z + ") yaw " + yaw + " pitch " + pitch);
    } catch (e) { console.warn("[repro] applyCamera failed:", e && e.message); return false; }
    return true;
}

// Build a URL that reproduces the CURRENT world seed + camera. Rounds camera to keep the link short.
export function buildReproLink(camera, opts = {}) {
    const base = (typeof location !== "undefined") ? (location.origin + location.pathname) : "";
    const parts = [];
    try {
        let seed = null;
        try { seed = (typeof localStorage !== "undefined") ? parseInt(localStorage.getItem("voxelengine.worldSeed_v1") || "", 10) : null; } catch {}
        if (opts.seed != null) seed = opts.seed;
        if (Number.isFinite(seed)) parts.push("seed=" + (seed | 0));
    } catch {}
    if (camera && camera.position) {
        const r = (n) => Math.round(n * 100) / 100;
        const cam = [r(camera.position.x), r(camera.position.y), r(camera.position.z), r(camera.yaw || 0), r(camera.pitch || 0)];
        parts.push("cam=" + cam.join(","));
    }
    return base + (parts.length ? ("?" + parts.join("&")) : "");
}

export function listPresets() { return Object.keys(PRESETS).map(k => ({ name: k, ...PRESETS[k] })); }
