// WebGLEngine/tools/roundhouse/ollamaReadiness.mjs -- v3017
//
// "IS OLLAMA RUNNING?" IS THREE QUESTIONS, AND THE THIRD IS THE ONE THAT BITES.
//
// Keith asked whether the roundhouse's local model should be up right now, since Ollama is on the auto-install
// list. TWO CORRECTIONS FELL OUT OF CHECKING.
//
// FIRST: OLLAMA IS NOT ON THE AUTO-INSTALL LIST. autoInstall.js drives winget package ids and mentions Ollama
// nowhere. Nothing in this tree installs it and nothing spawns `ollama serve` -- doctorBridge probes 11434 and
// prints a HINT telling you to start it yourself. So the roundhouse does not bring Ollama online; it assumes it.
//
// SECOND, AND WORSE: listLocalModels() returns [] for UNREACHABLE, for a non-ok response, and for GENUINELY NO
// MODELS. Its comment says "state, not an error: the chain simply has no local tier", which is exactly right
// FOR THE CHAIN -- an absent local tier is a legitimate configuration. But it means the readiness question
// cannot be answered at all, because the three states that matter are collapsed into one empty array.
//
// AND THE THIRD STATE IS THE EXPENSIVE ONE. Ollama running with the WRONG models pulled looks identical to
// Ollama running correctly, right up until the first call -- WHICH HAPPENS MID-RUN, after the roundhouse has
// already started and a device has already been built. A pull is gigabytes. Finding out then is the worst
// possible moment, and it is the moment the current code chooses.
"use strict";
import { DEFAULT_OLLAMA, listLocalModels } from "./ollamaCaller.mjs";

export const READY = {
    OK: "ready",
    NOT_RUNNING: "not-running",
    NO_MODELS: "running-no-models",
    MODEL_MISSING: "pinned-model-missing",
};

/** Is anything answering on the Ollama port? Distinct from "does it have models". */
export async function isUp(base = DEFAULT_OLLAMA, opts = {}) {
    const fetchImpl = opts.fetchImpl || (typeof fetch === "function" ? fetch : null);
    if (!fetchImpl) return { up: false, why: "no fetch implementation available in this runtime" };
    const ac = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ac ? setTimeout(() => ac.abort(), opts.timeoutMs || 3000) : null;
    try {
        const r = await fetchImpl(base.replace(/\/$/, "") + "/api/version", ac ? { signal: ac.signal } : {});
        if (!r.ok) return { up: false, why: "port answered with HTTP " + r.status + " -- something is listening but it is not Ollama's API" };
        let v = null;
        try { v = (await r.json()).version || null; } catch {}
        return { up: true, version: v };
    } catch (e) {
        return { up: false, why: "nothing answered on " + base + ": " + ((e && (e.name === "AbortError" ? "timed out" : e.message)) || "unreachable") };
    } finally { if (timer) clearTimeout(timer); }
}

/**
 * The whole question, answered in one verdict with the three failures kept apart.
 * @param {string|null} pinned  the model the roundhouse is configured to use, if any
 */
export async function readiness({ base = DEFAULT_OLLAMA, pinned = null, ...opts } = {}) {
    const up = await isUp(base, opts);
    if (!up.up) {
        return { verdict: READY.NOT_RUNNING, base, up: false, why: up.why,
                 fix: "start it: `ollama serve` (or launch the tray app). NOTHING IN THIS TREE STARTS IT FOR YOU -- Ollama is not on the auto-install list, and doctorBridge only probes the port." };
    }
    const models = await listLocalModels(base, opts);
    if (!models.length) {
        return { verdict: READY.NO_MODELS, base, up: true, version: up.version, models: [],
                 why: "Ollama is running and has NO models pulled. The old check could not tell this from 'not running' -- both returned an empty list.",
                 fix: "pull one: `ollama pull <model>`" };
    }
    if (pinned && !models.some((m) => m.name === pinned || m.name.split(":")[0] === String(pinned).split(":")[0])) {
        return { verdict: READY.MODEL_MISSING, base, up: true, version: up.version, pinned,
                 models: models.map((m) => m.name),
                 why: "Ollama is running with " + models.length + " model(s), but the pinned model '" + pinned +
                      "' is NOT among them. THIS FAILS AT THE FIRST CALL, MID-RUN -- after a device has already been built.",
                 fix: "`ollama pull " + pinned + "` (gigabytes; do it before the run, not during)" };
    }
    return { verdict: READY.OK, base, up: true, version: up.version, pinned,
             models: models.map((m) => m.name),
             why: pinned ? "running, and the pinned model is present" : "running with " + models.length + " model(s); no model is pinned, so any could be chosen" };
}
