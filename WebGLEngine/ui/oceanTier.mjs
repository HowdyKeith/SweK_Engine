// WebGLEngine/ui/oceanTier.mjs -- v4889
//
// *** THE TIER SWITCH: WHICH WATER A GPU GETS, DECIDED BY WHAT WAS MEASURED AND NEVER BY WHAT WAS HOPED. ***
//
// KEITH'S DECISION (2026-10-20), after the level-1 spike's first rig reading: the vendored sea (noniv/web-ocean,
// six FFT cascades at 256 squared) read 228-260 ms of GPU time on an Intel UHD 620 and held a 100 ms frame cap.
// It cannot be the default surface and it can be an option for GPUs that afford it. The default (slice 2) is
// world/oceanWater.mjs, drawn from slice 1's waves; this file decides when the player is offered the other one.
//
//   preference   off   -- always the default water. Nothing below can turn the sea on.
//                auto  -- the sea ONLY when WebGPU is real, the adapter is not a software fallback, AND a frame-time
//                         probe of the sea itself came in under BUDGET_MS. No probe, no sea: "auto" never claims
//                         an affordability nobody measured.
//                on    -- the sea whenever WebGPU is real and the adapter is not a software fallback, however slow.
//                         The reason line SAYS it is slow when a probe says so; the player asked.
//
// WHAT AN ADAPTER'S NAME IS WORTH. classifyAdapter() sorts the strings a browser reports (vendor, architecture,
// device, description) into discrete / integrated / fallback / unknown. It is a HINT for the reason line and for
// the 'on' guard against software rendering -- it never turns the sea on by itself. A discrete name with no probe
// is still the default water, with needsProbe = true: the 1080 Ti and the UHD 620 are both "WebGPU" to a page.
//
// WHAT THIS FILE DOES NOT DO: load the sea (slice 4) or supply the probe's workload (only the sea can say what the
// sea costs). measureFrames() is the harness the probe runs through, with the clock and the frame injected, so a
// gate can drive every branch without a GPU. The choice is remembered under STORAGE_KEY; every storage access is
// wrapped, because private windows and blocked site data throw.

export const TIERS = Object.freeze(["off", "auto", "on"]);
export const STORAGE_KEY = "swek.ocean.tier";
/** 30 frames per second, with the sea alone. Measured, not chosen: 100 ms and 228 ms are the readings it must beat. */
export const BUDGET_MS = 1000 / 30;
export const PROBE_FRAMES = 12;
export const PROBE_WARMUP = 3;
/** A probe that has not finished by here is a probe that failed: the sea cannot be affordable if one frame costs this. */
export const PROBE_CAP_MS = 2000;

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|microsoft basic render|warp\b|lavapipe/i;
const DISCRETE = /\b(geforce|rtx|gtx|quadro|titan|radeon\s*(rx|pro|vii|r9|hd)|rx\s?\d{3,4}|arc\W*(?:tm\W*)?a\d{3}|nvidia|ampere|turing|pascal|ada|blackwell|rdna|gcn)\b/i;
const INTEGRATED = /\b(intel|uhd|iris|hd graphics|gen-?\d|apple|m[1-9]\b|adreno|mali|powervr|vega\s*\d+\s*graphics|radeon\s*graphics)\b/i;

/**
 * Sort an adapter's reported strings. `info` is GPUAdapterInfo-shaped ({ vendor, architecture, device, description,
 * isFallbackAdapter }) and may be partial or absent.
 * @returns {{ kind: "fallback"|"discrete"|"integrated"|"unknown", label: string }}
 */
export function classifyAdapter(info) {
    const i = info || {};
    const text = [i.vendor, i.architecture, i.device, i.description].filter(Boolean).join(" ");
    const label = text.trim() || "unnamed adapter";
    if (i.isFallbackAdapter === true || i.isFallback === true || SOFTWARE.test(text)) return { kind: "fallback", label };
    // Integrated is tested BEFORE discrete: "Intel Arc A380" is discrete, but "Intel UHD 620" must not match a
    // loose discrete word, and the discrete pattern above is made of whole tokens for that reason. Arc is named first.
    if (/\barc\W*(?:tm\W*)?a\d{3}\b/i.test(text)) return { kind: "discrete", label };
    if (INTEGRATED.test(text) && !/nvidia|geforce|rtx|gtx|radeon\s*(rx|pro)/i.test(text)) return { kind: "integrated", label };
    if (DISCRETE.test(text)) return { kind: "discrete", label };
    return { kind: "unknown", label };
}

/** The median of the frames after the warmup. Null when there is nothing to take a median of. */
export function probeMedian(samples, warmup = PROBE_WARMUP) {
    const s = (samples || []).slice(warmup).filter((x) => Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
    if (!s.length) return null;
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Run `frame` (an async function that renders ONE frame of the workload and resolves when the GPU is done with it)
 * `frames` times and time each. `now` is injected. Gives up at PROBE_CAP_MS and says so rather than hanging the page.
 * @returns {Promise<{ samples: number[], median: number|null, capped: boolean, error: string }>}
 */
export async function measureFrames(frame, { frames = PROBE_FRAMES, warmup = PROBE_WARMUP, now = () => performance.now(), capMs = PROBE_CAP_MS } = {}) {
    const samples = [];
    const t0 = now();
    try {
        for (let k = 0; k < frames; k++) {
            const a = now();
            await frame(k);
            samples.push(now() - a);
            if (now() - t0 > capMs) return { samples, median: probeMedian(samples, Math.min(warmup, Math.max(0, samples.length - 1))), capped: true, error: "" };
        }
    } catch (e) {
        return { samples, median: null, capped: false, error: String((e && e.message) || e) };
    }
    return { samples, median: probeMedian(samples, warmup), capped: false, error: "" };
}

/**
 * THE DECISION. Pure: everything it needs arrives as an argument.
 * @param {{ preference?: string, webgpu?: boolean, adapter?: object, probeMs?: number|null }} input
 * @returns {{ tier: "default"|"sea", preference: string, adapterKind: string, needsProbe: boolean, reason: string }}
 */
export function chooseTier({ preference = "auto", webgpu = false, adapter = null, probeMs = null } = {}) {
    const pref = TIERS.includes(preference) ? preference : "auto";
    const a = classifyAdapter(adapter);
    const out = (tier, reason, needsProbe = false) => ({ tier, preference: pref, adapterKind: a.kind, needsProbe, reason });
    if (pref === "off") return out("default", "off: the default water, by choice");
    if (!webgpu) return out("default", pref + ": this browser or origin has no usable WebGPU, so the sea cannot run; the default water");
    if (a.kind === "fallback") return out("default", pref + ": the adapter is software rendering (" + a.label + "); the sea would be a slideshow, so the default water");
    const slow = probeMs != null && probeMs > BUDGET_MS;
    if (pref === "on") return out("sea", slow
        ? "on: the sea, as asked -- but measured " + probeMs.toFixed(1) + " ms a frame against a " + BUDGET_MS.toFixed(1) + " ms budget, so expect " + (1000 / probeMs).toFixed(0) + " fps on " + a.label
        : "on: the sea, as asked, on " + a.label);
    // auto
    if (probeMs == null) return out("default", "auto: " + a.label + " (" + a.kind + ") has not been measured with the sea yet; the default water until it is", true);
    if (slow) return out("default", "auto: measured " + probeMs.toFixed(1) + " ms a frame on " + a.label + ", over the " + BUDGET_MS.toFixed(1) + " ms budget; the default water");
    return out("sea", "auto: measured " + probeMs.toFixed(1) + " ms a frame on " + a.label + ", inside the " + BUDGET_MS.toFixed(1) + " ms budget; the sea");
}

/** The remembered preference, or "auto". Never throws. */
export function loadPreference(storage) {
    try {
        const v = storage && storage.getItem(STORAGE_KEY);
        return TIERS.includes(v) ? v : "auto";
    } catch { return "auto"; }
}

/** Remember a preference. Returns whether it stuck; a refused write is not an error, the choice simply is not kept. */
export function savePreference(storage, preference) {
    if (!TIERS.includes(preference)) return false;
    try { storage.setItem(STORAGE_KEY, preference); return true; } catch { return false; }
}

/** What the page prints. */
export function reportLines(decision = chooseTier()) {
    const d = decision || {};
    return [
        "tier: " + (d.tier || "?") + "   preference: " + (d.preference || "?") + "   adapter: " + (d.adapterKind || "?"),
        d.reason || "",
        d.needsProbe ? "the sea has not been timed on this GPU; its probe arrives with the sea itself" : "",
    ].filter(Boolean);
}
