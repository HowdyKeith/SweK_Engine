// WebGLEngine/ui/gpuTaskManClient.mjs -- UNNUMBERED (the version is chosen at ship time)
// ---------------------------------------------------------------------------------------------------------------------------------
// THE PAGE LOGIC OF gputaskman.html, PURE: what the page shows for a status, which installers it offers, the body it sends to start
// a session, the polling of a running session, and the plain-words summary of a finished one. The bridge side is
// ai-bridge/gpuTaskManBridge.js; this file only formats and orders. It touches no DOM and takes `fetch` as a parameter, so
// ui/gpuTaskManClient-selfcheck.mjs runs all of it against a stub bridge.
//
// gputaskman (github.com/shanselman/gputaskman, MIT) is somebody else's early software; nothing of it is in this tree.
// ---------------------------------------------------------------------------------------------------------------------------------
"use strict";

export const REPO = "https://github.com/shanselman/gputaskman";
export const ROUTES = Object.freeze({ status: "/gputaskman/status", install: "/gputaskman/install", snapshot: "/gputaskman/snapshot", session: "/gputaskman/session", job: "/gputaskman/job" });
/** The notes the page links and can show in place (the bridge serves .md as a download, so the page reads the text itself). */
export const NOTES = Object.freeze({ wip: "/brain/GPUTASKMAN_WIP.md", rig: "/brain/RIG_COMMANDS_2026-11-07.md" });
export const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:\/@+-]{0,199}$/;
export const NUM_PREDICT = Object.freeze({ min: 16, max: 1024, def: 200 });
export const POLL = Object.freeze({ intervalMs: 1500, maxPolls: 4000, lostAfter: 3 });

const gbText = (n) => (Number.isFinite(n) ? `${n} GB` : "unknown");
const trim = (s, n) => { s = String(s == null ? "" : s); return s.length > n ? s.slice(0, n - 3) + "..." : s; };

/** The installers the page can offer, from a status: [{ method, label, command, available, why }] plus the one to press first. */
export function installChoices(status) {
    const inst = (status && status.installers) || {};
    const one = (method, label) => {
        const i = inst[method] || {};
        return { method, label, command: i.command || (method === "uv" ? "uv tool install gputaskman" : "pipx install gputaskman"), available: !!i.found, why: i.found ? (i.version ? i.version : "found") : `${method} is not installed on this machine` };
    };
    const choices = [one("uv", "Install with uv"), one("pipx", "Install with pipx")];
    const first = choices.find((c) => c.available);
    const g = (status && status.gputaskman) || {};
    return { choices, recommended: first ? first.method : null, alreadyInstalled: !!g.installed, works: !!g.works, note: g.installed ? (g.works ? "gputaskman is installed and can list the GPUs." : "gputaskman is installed but did not run cleanly" + (g.error ? ": " + trim(g.error, 160) : ".")) : (first ? "" : "Neither uv nor pipx was found: install one first (uv: https://docs.astral.sh/uv/ , pipx: https://pipx.pypa.io/), or use the portable download on the project's page.") };
}

/** The lines the page prints for a status. */
export function statusLines(status) {
    if (!status || status.ok === false) return [`the engine's bridge did not answer${status && status.error ? " (" + trim(status.error, 160) + ")" : ""}: is it running on this machine?`];
    const L = [], inst = status.installers || {}, py = status.python || {}, g = status.gputaskman || {}, o = status.ollama || {};
    L.push(`machine: ${status.platform || "?"}`);
    L.push(`uv: ${inst.uv && inst.uv.found ? (inst.uv.version || "found") : "not found"}   pipx: ${inst.pipx && inst.pipx.found ? (inst.pipx.version || "found") : "not found"}   python: ${py.found ? (py.version || "found") : "not found"}`);
    L.push(g.installed ? `gputaskman: installed${g.works ? "" : " but not working"}${g.gpus ? "\n  " + trim(g.gpus, 400).split(/\r?\n/).join("\n  ") : ""}${g.error ? "\n  " + trim(g.error, 200) : ""}` : "gputaskman: not installed");
    L.push(o.up ? `Ollama: up (${o.version || "?"}), ${(o.models || []).length} model${(o.models || []).length === 1 ? "" : "s"} pulled` : `Ollama: not answering${o.error ? " (" + trim(o.error, 200) + ")" : ""}`);
    return L;
}

/** The model names for the page's list: the pulled models, sorted. */
export function modelOptions(status) {
    const m = status && status.ollama && Array.isArray(status.ollama.models) ? status.ollama.models : [];
    return m.map((x) => x.name).filter((n) => typeof n === "string" && n).sort();
}

/** The body to start a session, or why not: { ok, body } | { ok: false, error }. */
export function sessionBody(f = {}) {
    const model = String(f.model == null ? "" : f.model).trim();
    if (!model) return { ok: false, error: "type the model name exactly as `ollama list` shows it" };
    if (!MODEL_RE.test(model)) return { ok: false, error: "that is not a model name Ollama could have (letters, digits and . _ : / @ + - only, no spaces)" };
    let n = NUM_PREDICT.def;
    if (f.numPredict !== undefined && f.numPredict !== null && String(f.numPredict).trim() !== "") {
        n = Number(f.numPredict);
        if (!Number.isInteger(n) || n < NUM_PREDICT.min || n > NUM_PREDICT.max) return { ok: false, error: `tokens to generate must be a whole number from ${NUM_PREDICT.min} to ${NUM_PREDICT.max}` };
    }
    return { ok: true, body: { model, numPredict: n, unloadWhenDone: !!f.unloadWhenDone } };
}

async function asJson(r) { try { return await r.json(); } catch (e) { return { ok: false, error: "the bridge answered with something that is not JSON" }; } }
export async function getJson(url, fetchImpl) { try { return await asJson(await fetchImpl(url, { method: "GET" })); } catch (e) { return { ok: false, error: String((e && e.message) || e), unreachable: true }; } }
export async function postJson(url, body, fetchImpl) { try { return await asJson(await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body == null ? {} : body) })); } catch (e) { return { ok: false, error: String((e && e.message) || e), unreachable: true }; } }

/** A text file from the engine: { ok, text } or { ok: false, error }. */
export async function getText(url, fetchImpl) {
    try {
        const r = await fetchImpl(url, { method: "GET" });
        if (!r.ok) return { ok: false, error: "HTTP " + r.status };
        return { ok: true, text: String(await r.text()) };
    } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}

/** Poll a session until it is not running. onUpdate(status) is called with each answer. Three answers lost in a row end it as an error. */
export async function pollJob(id, fetchImpl, o = {}) {
    const sleep = o.sleep || ((ms) => new Promise((r) => setTimeout(r, ms))), every = o.intervalMs === undefined ? POLL.intervalMs : o.intervalMs, max = o.maxPolls === undefined ? POLL.maxPolls : o.maxPolls;
    let lost = 0, last = null;
    for (let i = 0; i < max; i++) {
        const s = await getJson(`${ROUTES.job}?id=${encodeURIComponent(id)}`, fetchImpl);
        if (s.ok === false && s.unreachable) { if (++lost >= POLL.lostAfter) return { ok: false, state: "error", error: "lost contact with the engine's bridge while the session was running (it may still be running; its file will appear in brain/rig-results/gpu-snapshots/)", steps: last ? last.steps : [] }; }
        else if (s.ok === false) return { ok: false, state: "error", error: s.error || "the bridge no longer knows this session", steps: last ? last.steps : [] };
        else { lost = 0; last = s; if (typeof o.onUpdate === "function") o.onUpdate(s); if (s.state !== "running") return s; }
        await sleep(every);
    }
    return { ok: false, state: "error", error: "stopped waiting after " + max + " checks; the session may still be running", steps: last ? last.steps : [] };
}

/** One progress line for a step. */
export function stepLine(step) {
    const t = /T(\d\d:\d\d:\d\d)/.exec(String(step && step.at || ""));
    return `${t ? t[1] : "--:--:--"}  ${step && step.ok === false ? "!! " : ""}${step && step.step || "?"}: ${trim(step && step.note, 300)}`;
}

/** A finished session in plain words. */
export function summaryLines(result) {
    if (!result) return ["no result"];
    const L = [], s = result.summary, sn = result.snapshots || {}, label = (k) => (sn[k] ? (sn[k].ok ? "ok" : "no") : "-");
    L.push(result.ok ? "The session ran." : `The session did not complete: ${trim(result.error, 300)}`);
    if (s) {
        L.push(`model: ${result.request && result.request.model}, ${gbText(s.modelSizeGB)} in memory; on the GPU: ${gbText(s.inVramGB)}${s.onGpuPct === null ? "" : " (" + s.onGpuPct + "%)"}`);
        L.push(`speed: ${s.tokensPerSecond === null ? "unknown" : s.tokensPerSecond + " tokens/s"}; loaded in ${s.loadSeconds === null ? "?" : s.loadSeconds + " s"}`);
    }
    L.push(`gputaskman ${s && s.gputaskmanInstalled === false ? "is not installed" : "snapshots"}: baseline ${label("baseline")}, loaded ${label("loaded")}, busy ${label("busy")}`);
    L.push("Read the JSON before you send it: gputaskman lists the programs that are using the GPU.");
    return L;
}

export const jsonText = (obj) => JSON.stringify(obj, null, 2);

/** The name for the downloaded file: the saved file's own name when the bridge gave one, else built from the result. */
export function downloadName(result, savedAs) {
    const fromSaved = typeof savedAs === "string" && savedAs.split("/").pop();
    if (fromSaved && /^[A-Za-z0-9._-]+\.json$/.test(fromSaved)) return fromSaved;
    const st = String(result && result.startedAt || "").replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-") || "now";
    const m = String(result && result.request && result.request.model || "snapshot").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+/, "").slice(0, 60) || "snapshot";
    return `gpusnap-${st}-${m}.json`;
}
