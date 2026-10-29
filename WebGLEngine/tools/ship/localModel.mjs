// WebGLEngine/tools/ship/localModel.mjs -- UNNUMBERED (the version is chosen at ship time) (the library; the command is tools/ship/localModelCmd.mjs; the gate is tools/ship/localModel-selfcheck.mjs)
//
// A LOCAL MODEL FOR THE LIVE ADVISOR PRACTICE RUN (Keith, 2026-10-29: "have code to auto install ollama or a different model choice ... do an inventory in the tree for available models and if a new model being advertised might be a good fit").
// tools/ship/advisorLive.mjs takes `--cmd "<command>"`: the prompt goes in on stdin, the reply is stdout. `ollama run <model>` is such a command, so a model on this machine needs no key. This file is the part that gets one there:
//   THE INVENTORY   MODELS below: the candidates this tree has looked at, each with an APPROXIMATE size, written from memory on the date in INVENTORY_AS_OF and NOT measured here -- `ollama show <tag>` and `ollama list` say the real numbers.
//   THE CHOICE      pickModel(): the largest candidate whose size (times a margin) fits the video memory, else the memory, else the smallest -- a plain rule, printed with its reason.
//   THE PLAN        installPlan(): the steps from "nothing" to "the model answers" for this operating system, as argument lists (no shell). Nothing runs unless the command is given --yes; a step with no safe argument form (the Linux install
//                   script is a downloaded script piped to a shell) is PRINTED for the person to run and never run here.
//   THE NEW ONES    newCandidates(): names on the model library page this inventory does not know. Reported, never added: a model not measured on this task is not a recommendation.
// What this does NOT do: judge a model's advice (that is the practice run and, later, the registered audit), pick a model for its quality (the rule is size and a JSON-habit note, and says so), or run any model. Nothing here is on a graded path.
"use strict";
import os from "node:os";
import { spawnSync } from "node:child_process";
import * as X from "../../brain/advisorTranscript.mjs";

export const INVENTORY_AS_OF = "2026-10-29";
export const LIBRARY_URL = "https://ollama.com/library";
/** diskGb is the approximate download of the default 4-bit build, from memory; params is billions. `json` is how readily the family returns a bare JSON object (the advisor's reply format) -- a note from general experience, not a measurement. */
export const MODELS = Object.freeze([
    { tag: "llama3.2:3b", family: "llama3.2", params: 3, diskGb: 2.0, json: "fair", note: "smallest that is likely to follow the reply format at all" },
    { tag: "qwen2.5:3b", family: "qwen2.5", params: 3, diskGb: 1.9, json: "good", note: "small; the qwen2.5 family is usually steady about JSON" },
    { tag: "phi3:mini", family: "phi3", params: 3.8, diskGb: 2.2, json: "fair", note: "small, short context" },
    { tag: "mistral:7b", family: "mistral", params: 7, diskGb: 4.1, json: "fair", note: "older; tends to add prose around the JSON" },
    { tag: "qwen2.5:7b", family: "qwen2.5", params: 7, diskGb: 4.7, json: "good", note: "a common first choice on an 8 GB card" },
    { tag: "llama3.1:8b", family: "llama3.1", params: 8, diskGb: 4.9, json: "good", note: "a second opinion at the same size" },
    { tag: "gemma2:9b", family: "gemma2", params: 9, diskGb: 5.4, json: "fair", note: "needs about 6 GB free on the card" },
    { tag: "qwen2.5:14b", family: "qwen2.5", params: 14, diskGb: 9.0, json: "good", note: "does not fit an 8 GB card; runs split to the CPU, slowly" },
]);
export const CPU_CAP_GB = 5;   // without a GPU a bigger download is only slower: ~180 calls must finish in minutes, not hours
export const MARGIN = 1.3;   // the model must fit with 30% room for the context and the runtime

/** What this machine has: the memory in GB, the best GPU's memory in GB (0 when none is found), the platform. `spawn` and `os` are seams. */
export function probeSystem({ spawn = spawnSync, osMod = os } = {}) {
    let vram = 0, gpu = null;
    try {
        const r = spawn("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"], { encoding: "utf8", timeout: 8000, shell: false });
        if (r && r.status === 0) for (const line of String(r.stdout || "").split("\n")) { const m = /^(.*),\s*(\d+)\s*$/.exec(line.trim()); if (m && Number(m[2]) / 1024 > vram) { vram = Number(m[2]) / 1024; gpu = m[1].trim(); } }
    } catch { /* no nvidia-smi: no NVIDIA GPU is reported, which is not the same as no GPU */ }
    return { ramGb: Math.round(osMod.totalmem() / 2 ** 30 * 10) / 10, vramGb: Math.round(vram * 10) / 10, gpu, platform: osMod.platform() };
}

/** The choice and its reason. Among the models that fit the video memory with the margin: those noted json "good" first, then the larger. Failing that, the same among those that fit the memory AND are at most CPU_CAP_GB (slow, said so); failing that the smallest (said so). Models already installed are not preferred. */
export function pickModel(sys, models = MODELS) {
    const rank = (a, b) => (b.json === "good") - (a.json === "good") || b.diskGb - a.diskGb;
    const fits = (gb, cap = Infinity) => models.filter((m) => m.diskGb * MARGIN <= gb && m.diskGb <= cap).sort(rank);
    const gpu = fits(sys.vramGb), ram = fits(sys.ramGb, CPU_CAP_GB);
    if (gpu.length) return { model: gpu[0], where: "gpu", why: `best candidate that fits ${sys.vramGb} GB of video memory with ${Math.round((MARGIN - 1) * 100)}% room` };
    if (ram.length) return { model: ram[0], where: "cpu", why: `${sys.vramGb > 0 ? "nothing fits the " + sys.vramGb + " GB card; " : "no NVIDIA GPU found; "}best that fits ${sys.ramGb} GB of memory and ${CPU_CAP_GB} GB of download -- it will be SLOW` };
    const small = [...models].sort((a, b) => a.diskGb - b.diskGb)[0];
    return { model: small, where: "cpu", why: `nothing fits ${sys.ramGb} GB with room; the smallest candidate, and it may not run well` };
}

/** `ollama list` text -> the tags installed (the first column of each row after the header). */
export function parseOllamaList(text) {
    return String(text || "").split("\n").slice(1).map((l) => l.trim().split(/\s+/)[0]).filter((t) => t && /^[A-Za-z0-9._\/-]+(:[A-Za-z0-9._-]+)?$/.test(t));
}

/** The installed tags that are in the inventory, and those that are not (a model of yours the rule does not know -- usable, just unlisted). */
export function installedSplit(installed, models = MODELS) {
    const known = new Set(models.map((m) => m.tag));
    return { known: installed.filter((t) => known.has(t)), other: installed.filter((t) => !known.has(t)) };
}

/** The model-library page -> the model names it links (/library/<name>), unique, in page order. */
export function parseLibraryNames(html) {
    const seen = new Set(), out = [];
    for (const m of String(html || "").matchAll(/href="\/library\/([A-Za-z0-9._-]+)"/g)) if (!seen.has(m[1])) { seen.add(m[1]); out.push(m[1]); }
    return out;
}

/** Library names whose family is not in the inventory: what the page advertises that this tree has not looked at. */
export function newCandidates(names, models = MODELS) {
    const fam = new Set(models.map((m) => m.family.toLowerCase()));
    return names.filter((n) => !fam.has(n.toLowerCase()));
}

/** The steps from this state to a model that answers. A step is { what, argv } to run, or { what, manual } to print. Pure; `installed` is the tags already pulled, `haveOllama` whether the command exists. */
export function installPlan({ platform, haveOllama, installed = [], tag }) {
    const steps = [];
    if (!haveOllama) {
        if (platform === "win32") steps.push({ what: "install Ollama (Windows package manager)", argv: ["winget", "install", "--id", "Ollama.Ollama", "-e", "--accept-package-agreements", "--accept-source-agreements"] });
        else if (platform === "darwin") steps.push({ what: "install Ollama (Homebrew)", argv: ["brew", "install", "ollama"] });
        else steps.push({ what: "install Ollama: run this yourself (it downloads a script and runs it in a shell, which this tool never does)", manual: "curl -fsSL https://ollama.com/install.sh | sh" });
    }
    if (!installed.includes(tag)) steps.push({ what: `download ${tag}`, argv: ["ollama", "pull", tag] });
    return steps;
}

/** Run a plan. Without `yes` it runs nothing and says so. Stops at the first failing step; a manual step stops the run (the rest depends on it). `spawn` is a seam. */
export function runPlan(steps, { yes = false, spawn = spawnSync, log = () => {} } = {}) {
    if (!steps.length) return { ran: 0, ok: true, stoppedAt: null };
    if (!yes) { for (const s of steps) log(`  would: ${s.what}${s.argv ? "  [" + s.argv.join(" ") + "]" : "  [" + s.manual + "]"}`); log("  nothing was run (add --yes to run the steps above)"); return { ran: 0, ok: true, stoppedAt: null, dry: true }; }
    let ran = 0;
    for (const s of steps) {
        if (!s.argv) { log(`  YOU RUN THIS, then run the command again: ${s.manual}`); return { ran, ok: false, stoppedAt: s.what, manual: true }; }
        log(`  running: ${s.argv.join(" ")}`);
        const r = spawn(s.argv[0], s.argv.slice(1), { stdio: "inherit", shell: false });
        ran++;
        if (r.error || r.status !== 0) return { ran, ok: false, stoppedAt: s.what, why: r.error ? String(r.error.code || r.error.message) : `exit ${r.status}` };
    }
    return { ran, ok: true, stoppedAt: null };
}

/** The --cmd text for advisorLiveCmd.mjs. The tag is checked first: it ends up in a command line. */
export function advisorCmd(tag) {
    if (!/^[A-Za-z0-9._\/-]+(:[A-Za-z0-9._-]+)?$/.test(tag)) throw new Error(`localModel.advisorCmd: "${tag}" is not a model tag`);
    return `ollama run ${tag}`;
}

/** Is the ollama command on this machine, and which tags has it pulled? `spawn` is a seam. */
export function probeOllama({ spawn = spawnSync } = {}) {
    const r = spawn("ollama", ["list"], { encoding: "utf8", timeout: 15000, shell: false });
    if (r.error || r.status !== 0) return { haveOllama: !r.error, running: false, installed: [], why: r.error ? String(r.error.code || r.error.message) : `ollama list exited ${r.status}: ${String(r.stderr || "").slice(0, 200)}` };
    return { haveOllama: true, running: true, installed: parseOllamaList(r.stdout), why: null };
}

/** The lines of `status`. Pure over what was probed. */
export function statusLines({ sys, pick, ollama, split, plan }) {
    const L = [];
    L.push(`machine: ${sys.platform}, ${sys.ramGb} GB memory, ${sys.vramGb > 0 ? sys.gpu + ", " + sys.vramGb + " GB video memory" : "no NVIDIA GPU found"}`);
    L.push(`ollama: ${!ollama.haveOllama ? "NOT installed" : ollama.running ? "installed and answering" : "installed but not answering (" + ollama.why + ")"}; pulled: ${ollama.installed.length ? ollama.installed.join(", ") : "none"}${split.other.length ? "  (not in the inventory: " + split.other.join(", ") + ")" : ""}`);
    L.push(`choice: ${pick.model.tag} (~${pick.model.diskGb} GB, ${pick.where}) -- ${pick.why}. The rule knows size and a JSON-habit note only: it does not know which model advises best (the smoke test and the practice run say). Inventory sizes are approximate, from ${INVENTORY_AS_OF}.`);
    L.push(plan.length ? `to get there: ${plan.map((s) => s.what).join("; then ")}` : "nothing to install: the model is already pulled");
    L.push(`then:   node tools/ship/advisorLiveCmd.mjs record --model-id ${pick.model.tag} --cmd "${advisorCmd(pick.model.tag)}" --seeds 501-503 --kinds far,both --every 600 --max-calls 200 --out brain/livePractice1.jsonl --dry-run`);
    return L;
}

// ---- the command ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const SMOKE_ST = { pos: [10, 20, -12], vel: [2, 0, 0], q: [1, 0, 0, 0], w: [0, 0, 0] };
const SMOKE_OBS = { t: 41.7, r: { depth: 12, frac: 0.4321, strain: 0.2, damage: 0.05, flood: 0.0123, collapseDepth: 60 }, stations: [{ x: 110, y: 20, depth: 20, visited: false }, { x: 10, y: 120, depth: 35, visited: true }, { x: -90, y: 20, depth: 8, visited: false }] };
export const SMOKE_PROMPT = () => X.renderPrompt(SMOKE_ST, SMOKE_OBS);

export function parseArgs(argv) {
    const [verb, ...rest] = argv, given = { verb, model: null, yes: false, checkNew: false, tries: 3 };
    if (!["status", "setup", "inventory", "smoke"].includes(verb)) throw new Error("localModel: the first word must be status, setup, inventory or smoke");
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i];
        if (a === "--yes") given.yes = true;
        else if (a === "--check-new") given.checkNew = true;
        else if (a === "--model") { given.model = rest[++i]; if (!given.model) throw new Error("localModel: --model needs a tag"); }
        else if (a === "--tries") { given.tries = Number(rest[++i]); if (!Number.isInteger(given.tries) || given.tries < 1 || given.tries > 10) throw new Error("localModel: --tries is a whole number from 1 to 10"); }
        else throw new Error(`localModel: unknown argument ${a}`);
    }
    if (given.model) advisorCmd(given.model);
    if (given.verb !== "setup" && given.yes) throw new Error("localModel: --yes belongs to setup");
    if (given.verb !== "inventory" && given.checkNew) throw new Error("localModel: --check-new belongs to inventory");
    return given;
}

/** status: report only. setup: the plan, run only with --yes. inventory: the table, and with --check-new the names the library page advertises that the table lacks. smoke: the real advisor prompt through the model, `tries` times, scored by the advisor's own strict reader. Returns the exit code. */
export async function command(argv, io = {}) {
    const log = io.log || console.log, spawn = io.spawn || spawnSync, fetchFn = io.fetch || globalThis.fetch;
    const given = parseArgs(argv), sys = (io.probeSystem || probeSystem)({ spawn }), ollama = (io.probeOllama || probeOllama)({ spawn });
    const pick = given.model ? { model: MODELS.find((m) => m.tag === given.model) || { tag: given.model, diskGb: NaN }, where: "chosen", why: "named with --model (not checked against this machine)" } : pickModel(sys);
    const tag = pick.model.tag, plan = installPlan({ platform: sys.platform, haveOllama: ollama.haveOllama, installed: ollama.installed, tag });
    if (given.verb === "status") { for (const l of statusLines({ sys, pick, ollama, split: installedSplit(ollama.installed), plan })) log(l); return 0; }
    if (given.verb === "setup") {
        log(`setup: ${tag} (${pick.why})`);
        const r = runPlan(plan, { yes: given.yes, spawn, log });
        if (r.ok && given.yes) log(plan.length ? `done: run  node tools/ship/localModelCmd.mjs smoke --model ${tag}  to see whether it answers in the advisor's format` : "nothing to do");
        else if (!r.ok) log(`STOPPED at "${r.stoppedAt}"${r.why ? " (" + r.why + ")" : ""}`);
        return r.ok ? 0 : 1;
    }
    if (given.verb === "inventory") {
        log(`INVENTORY (approximate, from memory, as of ${INVENTORY_AS_OF}; \`ollama show <tag>\` has the real sizes):`);
        for (const m of MODELS) log(`  ${m.tag.padEnd(14)} ~${String(m.diskGb).padEnd(4)} GB  json:${m.json.padEnd(5)} ${ollama.installed.includes(m.tag) ? "[pulled]" : "        "} ${m.note}`);
        if (given.checkNew) {
            if (!fetchFn) { log("--check-new: this node has no fetch"); return 1; }
            let html; try { const r = await fetchFn(LIBRARY_URL, { signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); html = await r.text(); } catch (e) { log(`--check-new: could not read ${LIBRARY_URL} (${e.message}); nothing compared`); return 1; }
            const names = parseLibraryNames(html), fresh = newCandidates(names);
            log(`the library page links ${names.length} models; ${fresh.length} are in no inventory family: ${fresh.length ? fresh.slice(0, 40).join(", ") : "none"}`);
            log("these are REPORTED, not recommended: none has been tried on the advisor prompt. Try one with  setup --model <tag> --yes  then  smoke --model <tag>.");
        }
        return 0;
    }
    // smoke
    if (!ollama.running) { log(`smoke: ollama is not answering (${ollama.why}); run  setup --yes  first`); return 1; }
    if (!ollama.installed.includes(tag)) { log(`smoke: ${tag} is not pulled; run  setup --model ${tag} --yes`); return 1; }
    const prompt = SMOKE_PROMPT(); let good = 0;
    for (let k = 1; k <= given.tries; k++) {
        const t0 = Date.now(), r = spawn("ollama", ["run", tag], { input: prompt, encoding: "utf8", timeout: 180000, shell: false }), sec = ((Date.now() - t0) / 1000).toFixed(1);
        if (r.error || r.status !== 0) { log(`  try ${k}: the model command failed (${r.error ? r.error.code || r.error.message : "exit " + r.status}) after ${sec} s`); continue; }
        const p = X.parseReply(String(r.stdout || ""));
        if (p.ok) good++;
        log(`  try ${k}: ${p.ok ? "PARSES" : "DOES NOT PARSE (" + p.why + ")"} in ${sec} s -- ${String(r.stdout || "").replace(/\s+/g, " ").trim().slice(0, 160)}`);
    }
    log(`smoke: ${good} of ${given.tries} replies parse in the advisor's format. A reply that does not parse is read as no advice, so a model that rarely parses will look like the brain alone. ${good === given.tries ? "Worth a practice run." : "Try another model before spending a practice run."}`);
    return good === given.tries ? 0 : 1;
}
