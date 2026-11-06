// WebGLEngine/ui/upscalerSwitch.mjs -- ONE upscaler switch for every render page.
//
// Keith: "Are the rendering pages able to switch fsr modes from settings/console command/on page button such as Settings and pop-up
// visual choices. So if the menu is portable so all the render pages share that switch method was universal. Some modes would show as
// unavailable per page mode. Pages that need localhost for webgpu would also show a switch to localhost link."
//
// Before this file each render page chose its upscaler its own way (fsr-three.html a <select>, denoise.html a ?ut= flag, path-tracer.html
// three separate views, fsr.html and anime4k.html every mode side by side) and nothing was shared. Here:
//   - UPSCALER_MODES is the one list of modes, each with what it needs (WebGPU, a history, a GPU class);
//   - a page DECLARES the modes it implements and what choosing one does (`onChange`); the switch does the rest;
//   - availability() says, for every mode, whether it can run on THIS page in THIS browser and if not why -- "not on this page",
//     "needs WebGPU" (with the localhost link ui/webgpuProbe.mjs already builds when the page is on a LAN address), "off on this GPU class";
//   - the choice is reachable four ways, all one state: the on-page button and its pop-up, ?upscaler=<id>, the console
//     (swek.upscaler.set("fsr2"), .get(), .list()), and the Settings Hub's "Upscaler default" (ui/settingsHub.js), which every page starts from;
//   - it persists per page (swek.upscaler.page.<page>) over the global default (swek.upscaler.default).
// Gated by ui/upscalerSwitch-selfcheck.mjs. The logic is pure (resolveMode, availability); mountUpscalerSwitch is the DOM over it.
"use strict";
import { describeWebGPU } from "./webgpuProbe.mjs";

/** Every upscaler mode a render page in this tree can offer, in the order the pop-up lists them. `needs`: "webgpu", "history" (a temporal mode: the page must keep frames), "gpuClass" (render/learnedUpscaleTemporalGPU.mjs's UTH_BY_ADAPTER says where). */
export const UPSCALER_MODES = Object.freeze([
    Object.freeze({ id: "native", label: "Native resolution", needs: Object.freeze([]), desc: "No upscaling: rendered at display size." }),
    Object.freeze({ id: "bilinear", label: "Bilinear stretch", needs: Object.freeze([]), desc: "The baseline every upscaler is graded against." }),
    Object.freeze({ id: "fsr1", label: "FSR1 (EASU + RCAS)", needs: Object.freeze([]), desc: "Spatial: edge-adaptive upscale, then sharpening." }),
    Object.freeze({ id: "fsr2", label: "FSR2 (temporal)", needs: Object.freeze(["history"]), desc: "Jitter, reprojection, clipping, accumulation." }),
    Object.freeze({ id: "fsr3", label: "FSR3 frame generation", needs: Object.freeze(["history"]), desc: "A generated frame between two real ones." }),
    Object.freeze({ id: "anime4k", label: "Anime4K", needs: Object.freeze([]), desc: "Bilinear 2x, then a deblur." }),
    Object.freeze({ id: "learned", label: "Learned upscaler U", needs: Object.freeze([]), desc: "Round 65's network on one frame." }),
    Object.freeze({ id: "chain", label: "Denoiser chain", needs: Object.freeze(["history"]), desc: "Half-size trace, denoiser, EASU and the history (Bt)." }),
    Object.freeze({ id: "uth", label: "Learned temporal U_TH", needs: Object.freeze(["history", "webgpu", "gpuClass"]), desc: "Round 72's network on Bt's history: 5.4 % below Bt." }),
]);
export const MODE_IDS = Object.freeze(UPSCALER_MODES.map((m) => m.id));
const MODE = Object.fromEntries(UPSCALER_MODES.map((m) => [m.id, m]));

export const STORE_DEFAULT = "swek.upscaler.default";
export const storePage = (page) => `swek.upscaler.page.${page}`;

/**
 * Whether `id` can run on this page in this browser. `pageModes` is the page's own { id: { needs?, why? } } (needs replaces the mode's own,
 * for a page that runs a mode differently); `env` is { gpu (navigator.gpu present), secure, location, gpuClassOk }. Returns
 * { ok, reason, kind: "page" | "webgpu" | "gpuClass" | null, localUrl? } -- a webgpu refusal on a LAN address carries the localhost link.
 */
export function availability(id, pageModes, env = {}) {
    const m = MODE[id];
    if (!m) return { ok: false, reason: `no upscaler mode "${id}"`, kind: "unknown" };
    const pm = pageModes[id];
    if (!pm) return { ok: false, reason: "not on this page", kind: "page" };
    if (pm.why) return { ok: false, reason: pm.why, kind: "page" };
    const needs = pm.needs || m.needs;
    if (needs.includes("webgpu") && !env.gpu) {
        const p = describeWebGPU({ navigator: { gpu: env.gpu ? {} : undefined }, isSecureContext: env.secure, location: env.location || {} });
        return p.reason === "insecure-origin" ? { ok: false, reason: "needs WebGPU, which this browser only offers on localhost or https -- open this page as localhost", kind: "webgpu", localUrl: p.localUrl }
                                             : { ok: false, reason: "needs WebGPU, which this browser does not offer", kind: "webgpu" };
    }
    if (needs.includes("gpuClass") && env.gpuClassOk === false) return { ok: false, reason: "off on this GPU class (render/learnedUpscaleTemporalGPU.mjs's UTH_BY_ADAPTER)", kind: "gpuClass" };
    return { ok: true, reason: "", kind: null };
}

/**
 * The mode a page starts in: ?upscaler=<id>, else this page's stored choice, else the global default, else the page's own default -- the
 * first of those that is AVAILABLE here. { id, from: "url" | "page" | "default" | "page-default" | "first-available", refused: [...] }.
 */
export function resolveMode(pageModes, { pageDefault, search = "", stored = null, globalDefault = null, env = {} } = {}) {
    const url = new URLSearchParams(search).get("upscaler"), refused = [];
    for (const [id, from] of [[url, "url"], [stored, "page"], [globalDefault, "default"], [pageDefault, "page-default"]]) {
        if (!id) continue;
        const a = availability(id, pageModes, env);
        if (a.ok) return { id, from, refused };
        refused.push({ id, from, reason: a.reason });
    }
    const first = MODE_IDS.find((id) => availability(id, pageModes, env).ok) || null;
    return { id: first, from: "first-available", refused };
}

const safe = (f, d = null) => { try { return f(); } catch { return d; } };

/**
 * The main engine (main.js, index.html) has no upscaler pass: it renders straight to its canvas, whose backing store is the CSS size times the
 * device pixel ratio. So its two modes are a RENDER SCALE on that store -- native at 1, bilinear at 2/3, the browser stretching the canvas to its
 * CSS size with bilinear filtering. Any other mode is not on that page.
 */
export const ENGINE_RENDER_SCALE = Object.freeze({ native: 1, bilinear: 2 / 3 });
export function renderScaleFor(id) { if (!(id in ENGINE_RENDER_SCALE)) throw new Error(`upscalerSwitch: the main engine has no "${id}" mode -- native or bilinear`); return ENGINE_RENDER_SCALE[id]; }

/**
 * Mount the switch on a page: a button (top right, "Upscaler: <label>") whose pop-up lists EVERY mode -- the page's available ones to
 * choose, the rest greyed with the reason and, where it is WebGPU on a LAN address, the localhost link -- and the console API. `modes` is
 * the page's { id: { needs?, why? } }; `onChange(id, { from })` does what choosing a mode means on this page; `env` may be refreshed later
 * (refresh(env), e.g. once the adapter is known). Returns { get, set(id), list(), refresh(env), el }.
 */
export function mountUpscalerSwitch({ page, modes, onChange, pageDefault = null, env = null, search = null, corner = "top-right", doc = globalThis.document, win = globalThis.window }) {
    if (!page || !modes || typeof onChange !== "function") throw new Error("upscalerSwitch: a page name, its modes and an onChange");
    const bad = Object.keys(modes).filter((id) => !MODE[id]);
    if (bad.length) throw new Error(`upscalerSwitch: ${page} declares modes that are not upscaler modes: ${bad.join(", ")}`);
    let E = env || { gpu: !!(win && win.navigator && win.navigator.gpu), secure: win ? win.isSecureContext : true, location: win ? win.location : {}, gpuClassOk: null };
    const store = win && win.localStorage;
    const r = resolveMode(modes, { pageDefault, search: search !== null ? search : win && win.location ? win.location.search : "", stored: safe(() => store.getItem(storePage(page))), globalDefault: safe(() => store.getItem(STORE_DEFAULT)), env: E });
    let cur = r.id;
    const btn = doc.createElement("button"), pop = doc.createElement("div");
    btn.id = "swek-upscaler-button"; btn.type = "button";
    // `corner` places the button (and its pop-up beside it), for a page whose own chrome holds the top right
    const [vy, hx] = corner.split("-"), pos = (dv, dh) => `${vy}:${dv}px;${hx}:${dh}px;`;
    if (!["top", "bottom"].includes(vy) || !["left", "right"].includes(hx)) throw new Error(`upscalerSwitch: corner is top|bottom-left|right -- got ${corner}`);
    btn.style.cssText = "position:fixed;" + pos(8, 8) + "z-index:9999;font:12px system-ui,sans-serif;padding:5px 10px;border-radius:6px;border:1px solid #556;background:#1d2230;color:#e6e9f0;cursor:pointer";
    pop.id = "swek-upscaler-popup"; pop.hidden = true;
    pop.style.cssText = "position:fixed;" + pos(38, 8) + "z-index:9999;width:340px;max-height:70vh;overflow:auto;font:12px system-ui,sans-serif;background:#161a24;color:#e6e9f0;border:1px solid #556;border-radius:8px;padding:6px;box-shadow:0 6px 24px rgba(0,0,0,.4)";
    const label = () => { btn.textContent = "Upscaler: " + (cur ? MODE[cur].label : "none available") + " ▾"; };
    const list = () => UPSCALER_MODES.map((m) => ({ id: m.id, label: m.label, current: m.id === cur, ...availability(m.id, modes, E) }));
    const draw = () => {
        pop.textContent = "";
        for (const row of list()) {
            const it = doc.createElement("div"); it.className = "swek-upscaler-mode"; it.dataset.mode = row.id; it.dataset.ok = row.ok ? "1" : "0";
            it.style.cssText = `padding:6px 8px;border-radius:6px;margin:2px 0;${row.ok ? "cursor:pointer" : "opacity:.5"};${row.current ? "background:#2b3550" : ""}`;
            const name = doc.createElement("div"); name.textContent = (row.current ? "● " : "") + row.label; name.style.fontWeight = row.current ? "600" : "400"; it.appendChild(name);
            const sub = doc.createElement("div"); sub.style.cssText = "font-size:11px;color:#9aa3b5"; sub.textContent = row.ok ? MODE[row.id].desc : "Unavailable: " + row.reason; it.appendChild(sub);
            if (!row.ok && row.localUrl) { const a = doc.createElement("a"); a.href = row.localUrl; a.textContent = "Open this page as localhost →"; a.className = "swek-upscaler-localhost";
                a.style.cssText = "display:block;font-size:11px;color:#7fb4ff;margin-top:2px"; it.appendChild(a); }
            if (row.ok) it.onclick = () => { api.set(row.id); pop.hidden = true; };
            pop.appendChild(it);
        }
    };
    const api = {
        get: () => cur,
        list,
        set(id, { from = "set", persist = true } = {}) {
            const a = availability(id, modes, E);
            if (!a.ok) throw new Error(`upscalerSwitch: ${id} is unavailable on ${page} -- ${a.reason}`);
            cur = id; if (persist) safe(() => store.setItem(storePage(page), id)); label(); draw(); onChange(id, { from });
            return id;
        },
        refresh(env2) { E = { ...E, ...env2 }; if (cur && !availability(cur, modes, E).ok) { const n = resolveMode(modes, { pageDefault, env: E }).id; cur = n; if (n) onChange(n, { from: "refresh" }); } label(); draw(); return list(); },
        el: btn,
    };
    btn.onclick = () => { draw(); pop.hidden = !pop.hidden; };
    label(); draw(); doc.body.appendChild(btn); doc.body.appendChild(pop);
    if (win) { win.swek = win.swek || {}; win.swek.upscaler = { get: api.get, set: (id) => api.set(id, { from: "console" }), list: api.list, modes: MODE_IDS }; }
    if (cur) onChange(cur, { from: r.from });
    return api;
}

/** The Settings Hub's control: the default every render page starts from (until a page has its own stored choice). */
export const settingsControl = () => ({ id: "upscalerDefault", label: "Upscaler default (render pages)",
    hint: "The mode every render page starts in. Each page also has its own Upscaler button, ?upscaler=<mode>, and swek.upscaler.set(<mode>) in its console; modes a page cannot run are shown greyed with the reason.",
    type: "select", options: MODE_IDS.slice(),
    get: () => safe(() => globalThis.localStorage.getItem(STORE_DEFAULT)) || "fsr1",
    set: (v) => { if (MODE[v]) safe(() => globalThis.localStorage.setItem(STORE_DEFAULT, v)); } });
