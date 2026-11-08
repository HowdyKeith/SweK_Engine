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
export const ROUTES = Object.freeze({ status: "/gputaskman/status", install: "/gputaskman/install", snapshot: "/gputaskman/snapshot", session: "/gputaskman/session", job: "/gputaskman/job", watch: "/gputaskman/watch" });
export const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:\/@+-]{0,199}$/;
export const NUM_PREDICT = Object.freeze({ min: 16, max: 1024, def: 200 });
export const POLL = Object.freeze({ intervalMs: 1500, maxPolls: 4000, lostAfter: 3 });
/** The limits of a watch: the same numbers the bridge enforces (ai-bridge/gpuTaskManBridge.js WATCH and BRAIN), which refuses anything else. */
export const SAMPLE = Object.freeze({ seconds: Object.freeze({ min: 3, max: 300, def: 20 }), intervalMs: Object.freeze({ min: 500, max: 10000, def: 1000 }) });
export const BRAIN = Object.freeze({ sizeChoices: Object.freeze(["4096,8192", "8192", "1024,4096,8192", "64,256,1024,2048,4096,8192"]), rounds: Object.freeze({ min: 1, max: 5, def: 2 }), seconds: Object.freeze({ min: 1, max: 20, def: 10 }) });

const gbText = (n) => (Number.isFinite(n) ? `${n} GB` : "unknown");
const pctText = (n) => (Number.isFinite(n) ? `${n}%` : "unknown");
const mibText = (n) => (Number.isFinite(n) ? `${n} MiB` : "unknown");
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
    const body = { model, numPredict: n, unloadWhenDone: !!f.unloadWhenDone };
    const secs = f.sampleSeconds === undefined ? 0 : Number(f.sampleSeconds);   // Number("") and Number(null) are 0: a blank field is off
    if (secs !== 0) {
        if (!Number.isInteger(secs) || secs < SAMPLE.seconds.min || secs > SAMPLE.seconds.max) return { ok: false, error: `seconds of sampling must be 0 (off) or a whole number from ${SAMPLE.seconds.min} to ${SAMPLE.seconds.max}` };
        body.sampleSeconds = secs;
    }
    return { ok: true, body };
}

/** A whole number in a range from a form field; the default for a blank one; NaN for anything else. */
function wholeIn(v, r) {
    if (v === undefined || v === null || String(v).trim() === "") return r.def;
    const n = Number(v);
    return Number.isInteger(n) && n >= r.min && n <= r.max ? n : NaN;
}

/** The body to start a watch, or why not: { ok, body } | { ok: false, error }. mode is "sample" (watch for N seconds) or "brain" (run the GPU brain and watch it). */
export function watchBody(f = {}) {
    if (f.mode !== "sample" && f.mode !== "brain") return { ok: false, error: "the watch has no mode" };
    const intervalMs = wholeIn(f.intervalMs, SAMPLE.intervalMs);
    if (Number.isNaN(intervalMs)) return { ok: false, error: `the time between snapshots must be a whole number of milliseconds from ${SAMPLE.intervalMs.min} to ${SAMPLE.intervalMs.max}` };
    if (f.mode === "sample") {
        const seconds = wholeIn(f.seconds, SAMPLE.seconds);
        if (Number.isNaN(seconds)) return { ok: false, error: `seconds must be a whole number from ${SAMPLE.seconds.min} to ${SAMPLE.seconds.max}` };
        return { ok: true, body: { mode: "sample", seconds, intervalMs } };
    }
    const sizeText = String(f.sizes === undefined || f.sizes === null || String(f.sizes).trim() === "" ? BRAIN.sizeChoices[0] : f.sizes).trim();
    if (!BRAIN.sizeChoices.includes(sizeText)) return { ok: false, error: "pick the swarm sizes from the list" };
    const rounds = wholeIn(f.rounds, BRAIN.rounds), swarmSeconds = wholeIn(f.swarmSeconds, BRAIN.seconds);
    if (Number.isNaN(rounds)) return { ok: false, error: `rounds must be a whole number from ${BRAIN.rounds.min} to ${BRAIN.rounds.max}` };
    if (Number.isNaN(swarmSeconds)) return { ok: false, error: `the swarm's seconds must be a whole number from ${BRAIN.seconds.min} to ${BRAIN.seconds.max}` };
    return { ok: true, body: { mode: "brain", intervalMs, sizes: sizeText.split(",").map(Number), rounds, swarmSeconds } };
}

async function asJson(r) { try { return await r.json(); } catch (e) { return { ok: false, error: "the bridge answered with something that is not JSON" }; } }
export async function getJson(url, fetchImpl) { try { return await asJson(await fetchImpl(url, { method: "GET" })); } catch (e) { return { ok: false, error: String((e && e.message) || e), unreachable: true }; } }
export async function postJson(url, body, fetchImpl) { try { return await asJson(await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body == null ? {} : body) })); } catch (e) { return { ok: false, error: String((e && e.message) || e), unreachable: true }; } }

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
    if (s && s.sampled) L.push(`while the answer was generated: ${s.sampled.samples.total} snapshots; GPU utilization median ${pctText(s.sampled.utilizationPct.during)}, peak ${pctText(s.sampled.utilizationPct.duringPeak)} (nvidia-smi); gputaskman's own peak ${pctText(s.sampled.gputaskmanDevice.utilGpuPct.duringPeak)}`);
    L.push("Read the JSON before you send it: gputaskman lists the programs that are using the GPU.");
    return L;
}

/** A finished watch in plain words: what the card did before, during and after, and which programs used it under which runtime. */
export function watchLines(result) {
    if (!result) return ["no result"];
    const brain = result.mode === "brain", L = [], s = result.summary, b = result.brain;
    L.push(result.ok ? (brain ? "The GPU brain ran and was watched." : "The watch ran.") : `The ${brain ? "GPU brain watch" : "watch"} did not complete: ${trim(result.error, 300)}`);
    if (!s) { L.push("There is nothing to summarise: no snapshot was taken."); return L; }
    const n = s.samples;
    L.push(`snapshots: ${n.total}${brain ? ` (${n.before} before, ${n.during} while the swarm ran, ${n.after} after)` : ""}; gputaskman answered ${s.gputaskmanOk}, nvidia-smi ${s.nvidiaSmiOk}; the typical gap between snapshots was ${Number.isFinite(s.intervalMsMedian) ? s.intervalMsMedian + " ms" : "unknown"}${s.omittedSnapshots ? `; ${s.omittedSnapshots} full snapshots were left out of the file to keep it small` : ""}`);
    const u = s.utilizationPct, m = s.memoryUsedMiB, part = (label, v, f) => (v === null || v === undefined ? null : `${label} ${f(v)}`), join = (a) => a.filter(Boolean).join(", ");
    if (s.gpuName || u.duringPeak !== null || m.duringPeak !== null) L.push(`GPU ${s.gpuIndex === null ? "?" : s.gpuIndex}${s.gpuName ? " (" + s.gpuName + ")" : ""}, by nvidia-smi: utilization ${join([part("before", u.before, pctText), part("median while running", u.during, pctText), part("peak", u.duringPeak, pctText), part("after", u.after, pctText)]) || "unknown"}; video memory ${join([part("before", m.before, mibText), part("peak", m.duringPeak, mibText), m.rise === null ? null : `rise ${m.rise} MiB`, part("after", m.after, mibText)]) || "unknown"}`);
    const d = s.gputaskmanDevice, dev = join([part("utilization peak", d.utilGpuPct.duringPeak, pctText), d.smClockMHz.duringPeak === null ? null : `SM clock ${d.smClockMHz.before === null ? "" : d.smClockMHz.before + " to "}${d.smClockMHz.duringPeak} MHz`, d.powerW.duringPeak === null ? null : `power ${d.powerW.before === null ? "" : d.powerW.before + " to "}${d.powerW.duringPeak} W`]);
    if (dev) L.push(`gputaskman's own reading of the card: ${dev}`);
    for (const p of s.programs.slice(0, 5)) L.push(`  ${p.name}: ${p.runtimes.length ? p.runtimes.join(" + ") : "no runtime named"}; GPU ${join([part("peak", p.gpuPctDuringPeak, pctText), part("median", p.gpuPctDuringMedian, pctText)]) || "unknown"}; ${p.vramPeakMiB === null ? "no memory figure" : "memory peak " + p.vramPeakMiB + " MiB"}${p.onlyDuring ? "; seen ONLY while it ran" : ""}`);
    if (!s.programs.length) L.push("  no program was reported as using the card (gputaskman lists none, or it was not installed)");
    for (const r of Object.keys(s.runtimes)) L.push(`under ${r} while it ran: ${s.runtimes[r].join(", ")}`);
    if (b) {
        L.push(`the swarm: ${b.ok ? "finished" : "did not finish"} in ${Number.isFinite(b.durationMs) ? Math.round(b.durationMs / 100) / 10 + " s" : "an unknown time"}; ${b.adapterLine || "it named no adapter"}`);
        if (b.software === true) L.push("THE BROWSER USED A SOFTWARE ADAPTER: the graphics card was not used, so nothing above is the GPU brain's. Check the browser's hardware acceleration, or run `node tools\\ship\\gpuSwarm.mjs --hardware` by hand in a terminal.");
        L.push("The swarm's own timings in the file were taken while it was being watched: they are not a result and were not written to the results file.");
    }
    L.push("The names above come from the fields of gputaskman 0.3.3; if a program you expected is missing, look for it in the JSON.");
    L.push("Read the JSON before you send it: gputaskman lists the programs that are using the GPU.");
    return L;
}

export const jsonText = (obj) => JSON.stringify(obj, null, 2);

/** The name for the downloaded file: the saved file's own name when the bridge gave one, else built from the result. */
export function downloadName(result, savedAs) {
    const fromSaved = typeof savedAs === "string" && savedAs.split("/").pop();
    if (fromSaved && /^[A-Za-z0-9._-]+\.json$/.test(fromSaved)) return fromSaved;
    const st = String(result && result.startedAt || "").replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-") || "now";
    if (result && result.kind === "gputaskman-watch") return `gpuwatch-${st}-${result.mode === "brain" ? "brain" : "sample"}.json`;
    const m = String(result && result.request && result.request.model || "snapshot").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+/, "").slice(0, 60) || "snapshot";
    return `gpusnap-${st}-${m}.json`;
}
