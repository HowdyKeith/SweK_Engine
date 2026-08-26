// ui/localModelRun.js -- THE DOWNLOAD AND THE RUN, GATED ON THE PROBE THAT ALREADY ANSWERS "SHOULD YOU".
//
// v4032 -- Keith: "i do not see a option to download/install." He was right, and it was not a missing button:
// webgpu-llm.html was BUILT to fetch nothing ("This page fetches no model weights -- not one byte") because
// v4007's whole point was answering the question BEFORE the gigabyte. That page is the pre-flight. This file
// is the flight, and it refuses to take off when the pre-flight says no.
//
// *** THE GATE CALLS verdictFor(). IT DOES NOT REIMPLEMENT IT. *** A second copy of "can this box run it"
// would drift from the first, and the copy that drifts is never the one being read (v3527). downloadGate()
// below is a thin decision ON TOP of the probe's own verdict, so a blocker added to localModelProbe.js closes
// this door on the same day without anyone remembering to.
//
// *** WHAT "MAYBE" MEANS HERE, AND WHY IT IS ALLOWED TO PROCEED. *** The probe reports three states and never
// "yes", because VRAM is not readable and it will not guess. On Keith's box both Gemma builds read MAYBE:
// nothing MEASURED rules them out, and the one number that would decide it cannot be read. v3103's rule is
// "unknown is not yes" -- and the mirror of it is that UNKNOWN IS NOT NO EITHER. A gate that refused on
// unknowns would refuse forever on every box, since the VRAM unknown is unconditional. So blockers stop the
// download and unknowns are SHOWN AND PASSED THROUGH: the reader decides, with the proxy gap in front of them.
//
// *** THE MODEL REPO IS SUPPLIED BY THE READER AND IS NOT SHIPPED AS A CONSTANT, AND THAT IS A REFUSAL RATHER
// THAN AN OMISSION. *** MODELS in localModelProbe.js carries gemma-gem's README sizes under ids "E2B"/"E4B" --
// which are NOT HuggingFace repo ids, and nothing in this tree has ever named one. This round could not reach
// huggingface.co to check whether any candidate exists (the container's proxy answers 403 for it), so shipping
// a plausible-looking `onnx-community/...` string would be A GUESS THAT 404s ON SOMEBODY ELSE'S MACHINE AND
// READS AS A BUG IN THIS CODE. Naming the absence and taking the id as input is the honest shape -- the same
// call localModelProbe.js makes about VRAM one level up.
//
// So preflightRepo() exists: it resolves the repo's config.json BEFORE a single weight byte is requested, and
// turns a mistyped or non-existent id into an immediate, named error instead of a confusing failure partway
// through a gigabyte.
//
// *** WHAT THIS FILE'S GATE COULD NOT DRIVE, SAID HERE RATHER THAN DISCOVERED LATER. *** No network reaches
// huggingface.co or jsdelivr from the container this was written in, so THE REAL IMPORT AND THE REAL DOWNLOAD
// ARE UNEXERCISED HERE. Everything else is driven: the gate, the repo parsing, the preflight, the whole state
// machine and every failure branch, all through injected `importer` and `fetchImpl`. The seam is deliberate --
// a runner that could only be tested by downloading 1.5 GB would never be tested.
"use strict";
import { verdictFor } from "./localModelProbe.js";

/** The states a run passes through. Ordered, and a runner never skips backwards except to "idle" on reset. */
export const RUN_STATES = ["idle", "preflight", "loading", "ready", "generating", "failed"];

/** jsdelivr, matching the CDN this tree already uses in battleship3d/terminal/pipboy-models/view. PINNED
 *  because an unpinned "latest" silently changes what runs on a box that was working yesterday. NOT verified
 *  reachable from the container this was written in -- see the header. */
export const TRANSFORMERS_CDN = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1";
export const HF_BASE = "https://huggingface.co";

/**
 * *** THE GATE. *** Decides whether a download may be offered at all, from the probe's OWN verdict.
 *
 * Returns { allowed, blockers, unknowns, why }. `blockers` stop it; `unknowns` never do, and are handed back
 * so the caller can show them beside the button rather than hiding them behind it.
 */
export function downloadGate(facts, model) {
    const v = verdictFor(facts, model);
    return {
        allowed: v.blockers.length === 0,
        blockers: v.blockers.slice(),
        unknowns: v.unknowns.slice(),
        state: v.state,
        why: v.blockers.length
            ? "the probe RULED THIS OUT: " + v.blockers.join("; ")
            : "nothing measured rules this out. The unknowns below are still unknown -- they are not a yes",
    };
}

/**
 * A HuggingFace repo id is `owner/name`. Rejects anything else rather than passing it to a URL builder, where
 * a stray "../" or a full URL would become a request somewhere nobody intended.
 */
export function parseRepoId(raw) {
    const s = String(raw == null ? "" : raw).trim();
    if (!s) return { ok: false, error: "no model id given" };
    if (/^https?:/i.test(s)) return { ok: false, error: "give an id like owner/name, not a full URL" };
    const m = /^([A-Za-z0-9][A-Za-z0-9._-]*)\/([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(s);
    if (!m) return { ok: false, error: "expected owner/name (letters, digits, dot, dash, underscore)" };
    if (s.includes("..")) return { ok: false, error: "'..' is not allowed in a model id" };
    return { ok: true, repo: m[1] + "/" + m[2], owner: m[1], name: m[2] };
}

/**
 * Resolve the repo's config.json BEFORE any weights are requested. A mistyped id costs one small request here
 * instead of failing partway through a multi-gigabyte download, where the error would read as a bug in this
 * page rather than as a typo.
 *
 * fetchImpl is injected so the gate can drive every branch -- 200, 404, network error, non-JSON body -- with
 * no network at all.
 */
export async function preflightRepo(repoRaw, { fetchImpl, base = HF_BASE } = {}) {
    const p = parseRepoId(repoRaw);
    if (!p.ok) return { ok: false, stage: "id", error: p.error };
    const f = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
    if (!f) return { ok: false, stage: "env", error: "no fetch available in this environment" };
    const url = base.replace(/\/+$/, "") + "/" + p.repo + "/resolve/main/config.json";
    let res;
    try { res = await f(url); }
    catch (e) { return { ok: false, stage: "network", error: "could not reach " + base + ": " + String((e && e.message) || e).slice(0, 120) }; }
    if (!res || !res.ok) {
        const code = res ? res.status : 0;
        return {
            ok: false, stage: "repo", status: code,
            // 404 IS THE COMMON ONE AND DESERVES ITS OWN SENTENCE: it means the id resolved to nothing, which is
            // almost always a typo or a repo with no ONNX build -- not a broken page.
            error: code === 404
                ? "no config.json at " + p.repo + " -- check the id, and that the repo has an ONNX/transformers.js build"
                : "the model host answered " + code + " for " + p.repo,
        };
    }
    let cfg = null;
    try { cfg = await res.json(); } catch { /* a repo can exist with a config this cannot parse; not fatal */ }
    return { ok: true, repo: p.repo, url, config: cfg, architecture: (cfg && (cfg.model_type || cfg.architectures?.[0])) || null };
}

/**
 * Format a byte count for a progress line. Returns null for a null input SO THE CALLER CANNOT PRINT "0 B" FOR
 * "not known yet" -- those are different facts and only one of them should look like a number.
 */
export function fmtBytes(n) {
    if (n == null || !Number.isFinite(n)) return null;
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    if (n < 1024 * 1024 * 1024) return (n / 1048576).toFixed(1) + " MB";
    return (n / 1073741824).toFixed(2) + " GB";
}

/**
 * *** PROGRESS WITHOUT INVENTING A PERCENTAGE. *** transformers.js reports {status, file, loaded, total} and
 * `total` IS SOMETIMES ABSENT (a server that sends no Content-Length). The tempting move is to show 0% or to
 * guess from the model's stated size; both are a number the reader will believe. When total is unknown this
 * returns pct: null and a line that says how much has arrived WITHOUT a denominator -- "a progress bar that
 * lies about how far along it is" is the same family as this tree's flag that lies (v2579).
 */
export function progressLine(ev) {
    const e = ev || {};
    const loaded = Number.isFinite(e.loaded) ? e.loaded : null;
    const total = Number.isFinite(e.total) && e.total > 0 ? e.total : null;
    const pct = loaded != null && total != null ? Math.max(0, Math.min(100, (loaded / total) * 100)) : null;
    const file = e.file ? String(e.file) : null;
    const lb = fmtBytes(loaded), tb = fmtBytes(total);
    let text;
    if (pct != null) text = (file ? file + ": " : "") + pct.toFixed(1) + "% (" + lb + " of " + tb + ")";
    else if (lb) text = (file ? file + ": " : "") + lb + " downloaded (total size not reported by the server)";
    else text = (file ? file + ": " : "") + (e.status || "working") + "...";
    return { pct, loaded, total, file, status: e.status || null, text };
}

/**
 * The runner. `importer` returns the transformers.js module -- injected so the gate drives load success and
 * load failure without a CDN, and so a caller that has vendored the library can pass its own.
 */
export function createRunner({ importer, fetchImpl, cdn = TRANSFORMERS_CDN, base = HF_BASE } = {}) {
    let state = "idle", pipe = null, lastError = null, repo = null;
    const listeners = [];
    const emit = (ev) => { for (const fn of listeners) { try { fn(ev); } catch { /* a listener must not break a download */ } } };
    const to = (s, extra = {}) => { state = s; emit({ type: "state", state: s, ...extra }); };

    const load = async (repoRaw, { device = "webgpu", dtype = "q4", onProgress } = {}) => {
        if (state === "loading" || state === "generating") return { ok: false, error: "already busy: " + state };
        lastError = null;
        to("preflight", { repo: repoRaw });
        const pre = await preflightRepo(repoRaw, { fetchImpl, base });
        if (!pre.ok) { lastError = pre.error; to("failed", { error: pre.error, stage: pre.stage }); return { ok: false, ...pre }; }
        repo = pre.repo;
        to("loading", { repo });
        try {
            const mod = await (importer ? importer(cdn) : import(/* @vite-ignore */ cdn));
            if (!mod || typeof mod.pipeline !== "function") throw new Error("the library loaded but exposes no pipeline()");
            pipe = await mod.pipeline("text-generation", repo, {
                device, dtype,
                progress_callback: (ev) => { const p = progressLine(ev); emit({ type: "progress", ...p }); if (onProgress) onProgress(p); },
            });
            to("ready", { repo, device, dtype });
            return { ok: true, repo, device, dtype };
        } catch (e) {
            // A FAILURE IS REPORTED AS A FAILURE. The common one here is an out-of-memory on a box whose
            // maxBufferSize proxy was already smaller than the model's stated VRAM -- which the probe SHOWED as
            // an unknown before the click. Naming that suspicion beside the raw error turns a wall of ONNX text
            // into the sentence the reader needs.
            const raw = String((e && e.message) || e);
            lastError = raw.slice(0, 300);
            const oom = /out of memory|allocation|OOM|failed to allocate|buffer size/i.test(raw);
            to("failed", { error: lastError, likelyOom: oom });
            return { ok: false, error: lastError, likelyOom: oom };
        }
    };

    const generate = async (prompt, { max_new_tokens = 64 } = {}) => {
        if (state !== "ready") return { ok: false, error: "not ready (state: " + state + ")" };
        to("generating");
        try {
            const out = await pipe(String(prompt == null ? "" : prompt), { max_new_tokens });
            to("ready");
            const text = Array.isArray(out) ? (out[0] && (out[0].generated_text ?? out[0].summary_text)) : (out && out.generated_text);
            return { ok: true, text: text == null ? JSON.stringify(out).slice(0, 2000) : String(text) };
        } catch (e) {
            lastError = String((e && e.message) || e).slice(0, 300);
            to("failed", { error: lastError });
            return { ok: false, error: lastError };
        }
    };

    return {
        load, generate,
        on: (fn) => { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; },
        get state() { return state; },
        get repo() { return repo; },
        get lastError() { return lastError; },
        reset: () => { pipe = null; repo = null; lastError = null; to("idle"); },
    };
}
