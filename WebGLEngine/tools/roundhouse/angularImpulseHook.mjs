// WebGLEngine/tools/roundhouse/angularImpulseHook.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE ANGULAR-IMPULSE CENSUS'S HOOK, as physics/mechanics/BOX3D_ANGULAR_IMPULSE_CAP_WIP.md registers it: node's half, and the source a
// page is served in place of /vendor/box3d/box3d.js. The watching itself is angularImpulseWatch.mjs, shared by both halves.
//
// NODE: run a script as
//     SWK_ANG_CENSUS_DIR=<dir> SWK_ANG_CENSUS_RUN=<name> NODE_OPTIONS="--import <this file>" node <script>
// With SWK_ANG_CENSUS_DIR set, this file registers a loader hook that stands in for vendor/box3d/box3d.js: the stand-in imports the
// real file and hands every box3d instance its factory makes to watchModule(). Every route to box3d in node goes through that file
// (box3dNode.mjs, the facade, and the modules that make an instance of their own), so every instance is watched. Each process -- each
// thread -- writes its tally to <dir>/<pid>-<thread>.json when it exits, and every two seconds while it runs, so a process killed at a
// limit still leaves what it saw. NODE_OPTIONS reaches the script's own child processes, which are watched the same way.
//
// Without SWK_ANG_CENSUS_DIR, importing this file does nothing but define its exports.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { threadId } from "node:worker_threads";
import * as W from "./angularImpulseWatch.mjs";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const ENV_DIR = "SWK_ANG_CENSUS_DIR", ENV_RUN = "SWK_ANG_CENSUS_RUN";
export const HOOK_PATH = fileURLToPath(import.meta.url);
const ROOTS = [pathToFileURL(ENG).href + "/"];

const T = globalThis.__swkAngCensus || (globalThis.__swkAngCensus = W.newTally(process.env[ENV_RUN] || null));
/** This process's (this thread's) tally. */
export const tally = () => T;
/** Watch one box3d module instance, recording into this process's tally. The stand-in for box3d.js calls this on every instance. */
export const watch = (m) => W.watchModule(m, T, ROOTS);

/** The loader hook's own source: it runs on node's hooks thread, so it is self-contained. */
export function hooksSource(hookUrl = import.meta.url) {
    return [
        `const HOOK = ${JSON.stringify(hookUrl)};`,
        `export async function load(url, context, next) {`,
        `    if (/\\/vendor\\/box3d\\/box3d\\.js(?:[?#]|$)/.test(url) && !/[?&]census-real(?:[&#]|$)/.test(url)) {`,
        `        const real = url + (url.includes("?") ? "&" : "?") + "census-real";`,
        `        const source = "import real from " + JSON.stringify(real) + ";\\nimport { watch } from " + JSON.stringify(HOOK) + ";\\n" +`,
        `            "export default async function factory(opts) { return watch(await real(opts)); }\\n";`,
        `        return { format: "module", shortCircuit: true, source };`,
        `    }`,
        `    return next(url, context);`,
        `}`,
    ].join("\n");
}

/** What this process writes: its tally, with who it was. */
export function snapshot() { return { pid: process.pid, thread: threadId, argv: process.argv.slice(1).map((a) => path.isAbsolute(a) ? path.relative(ENG, a) : a), ...T }; }

let installed = false, written = -1;
/** Register the stand-in and start writing this process's tally to `dir`. Idempotent. */
export function install(dir = process.env[ENV_DIR]) {
    if (installed || !dir) return installed;
    installed = true;
    register("data:text/javascript," + encodeURIComponent(hooksSource()), import.meta.url);
    const file = path.join(dir, `${process.pid}-${threadId}.json`);
    const write = () => { if (written === T.calls && fs.existsSync(file)) return; try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(snapshot())); written = T.calls; } catch { /* a full disk must not change the gate */ } };
    write();
    setInterval(write, 2000).unref();
    process.on("exit", write);
    return true;
}

/** Every tally a run left in `dir`, read back. */
export function readTallies(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((f) => /^\d+-\d+\.json$/.test(f)).sort().map((f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch (e) { return { broken: f, error: String(e.message) }; } });
}

/** The module a page is served in place of /vendor/box3d/box3d.js: the real file under the hook, recording into window.__swkAngCensus. */
export function pageStandIn() {
    return [
        `import real from "/vendor/box3d/box3d.js?census-real";`,
        `import { watchModule, newTally } from "/tools/roundhouse/angularImpulseWatch.mjs";`,
        `const T = globalThis.__swkAngCensus || (globalThis.__swkAngCensus = newTally(location.pathname.replace(/^\\//, "")));`,
        `export default async function factory(opts) { return watchModule(await real(opts), T, [location.origin + "/"]); }`,
        ``,
    ].join("\n");
}

if (process.env[ENV_DIR]) install();
