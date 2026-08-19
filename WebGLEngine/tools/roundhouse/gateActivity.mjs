// WebGLEngine/tools/roundhouse/gateActivity.mjs -- v3444
//
// LAYER 2 OF THE LAB GALAXY: WHAT THE GATE RUNNER KNOWS ABOUT EACH DEVICE, AND HOW OLD THAT IS.
//
// Layer 1 (labGalaxy.mjs) is STATIC -- no clock, travels in the zip, says how well a device is interrogated and
// how many numbers its baseline row carries. This layer is the OTHER meaning of "activity" and it must never be
// merged into the first: *** A STAR BRIGHT BECAUSE ITS GATE RAN AND A STAR BRIGHT BECAUSE ITS VALUE DRIFTED ARE
// OPPOSITE NEWS. *** It gets its own channel, its own vocabulary and its own staleness.
//
// ================================================================================================
// FINDING 1: THE TIMINGS FILE HAS NO CLOCK IN IT AT ALL.
// ================================================================================================
//
// I expected a timestamp and there is none. tools/ship/gate-timings.json is { note, captured, timings } where
// `captured` is a SENTENCE naming a run ("v3211 full-suite run (556 gates) ... plus 13 gates added in the v3285
// session") and `timings` maps a gate path to OBSERVED MILLISECONDS. So this layer cannot say WHEN anything ran.
//
// *** THAT TURNS OUT TO BE BETTER THAN A CLOCK, AND IT IS WHY THIS LAYER STILL TRAVELS IN THE ZIP. *** The age
// is a VERSION DISTANCE -- captured at v3211 against a tree at v3444 is 233 versions -- which is exact, has no
// timezone, is identical on every machine, and does not silently become "3 seconds ago" the moment somebody
// re-saves the file. A wall clock would have made this layer a fact about the reader's machine.
//
// ================================================================================================
// FINDING 2: "WHICH GATE EXERCISES THIS DEVICE" HAS THREE ROUTES, AND THE OBVIOUS ONE READS A SUBSET.
// ================================================================================================
//
//   route  import   a gate IMPORTS the device's bind module           37 of 67 devices
//   route  name     a gate names it in getDevice("x") as a LITERAL    56 of 67 devices
//   route  sweep    a gate walks DEVICE_NAMES and covers every device 29 gates do this
//
// 29 devices are reached BOTH ways, 8 by import only, and TWENTY-SEVEN BY NAME ONLY. *** SO THE IMPORT WALK
// ALONE -- which is the instrument this tree reaches for, and the one deviceInstrumentMap uses -- WOULD HAVE
// DECLARED THIRTY DEVICES UNGATED WHEN THEY ARE NOT. A SUBSET THAT LOOKS LIKE A CORPUS, and v3418 already made
// this exact mistake once with pagesImportingPhysics resolving one hop. ***
//
// AND MY FIRST PASS AT ROUTE 1 WAS A SUBSTRING MATCH ON THE BIND'S FILENAME, WHICH READ 46. Resolving the import
// specifiers properly reads 37 -- the substring OVER-matched by nine. v3330's standing warning is about the
// opposite direction (`lbm-fluid` missing the device `lbm`) and the lesson is the same one: a name is not a
// location. Route 2 is therefore matched as a QUOTED LITERAL inside a getDevice call, never as a bare substring.
//
// THE SWEEP ROUTE IS COUNTED APART AND NEVER ADDED IN, because a gate that walks every device is not the same
// claim as a gate written for one. Three devices -- acoustics, seismic, nuclear -- are named by NEITHER of the
// first two routes, and that is REPORTED rather than failed: a sweep does reach them, and whether a device
// deserves a gate of its own is a judgement and it is Keith's.
//
// ================================================================================================
// THREE TIMING STATES, NEVER TWO.
// ================================================================================================
//
//   timed        every gate reaching this device has an observed runtime
//   partly       some do and some do not -- a state that a two-way flag would round to one side or the other
//   never-timed  none of them has ever been in a measured suite run
//
// 19 / 19 / 26 across the 64 devices any route reaches. *** NEVER RUN IS DISTINCT FROM PASSED (v3048), and here
// NEVER TIMED IS DISTINCT FROM FAST: a gate with no entry is not a quick gate, it is an unmeasured one, and a
// layer that drew it as a small dot would be claiming a measurement nobody made. ***
//
// AND A RUNTIME IS NOT A VERDICT. This file reports how long a check took and whether anybody has ever timed it.
// It says NOTHING about whether the check passed -- that lives in the runner's own report, a timeout is not a
// failure (v3076), and conflating the two is how a slow gate starts reading as a broken one.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");

export const ROUTES = ["import", "name", "sweep"];
export const TIMING_STATES = ["timed", "partly", "never-timed", "no-gate"];
export const OUT = "gate-activity.json";

const rel = (p) => path.relative(ENG, p).split(path.sep).join("/");

/** The engine's own version marker, read rather than passed, so the age cannot be stated by a caller. */
export function engineVersion(src = null) {
    const s = src != null ? src : fs.readFileSync(path.join(ENG, "main.js"), "utf8");
    const m = /const ENGINE_VERSION = "(v\d+)"/.exec(s);
    return m ? m[1] : null;
}

/**
 * How stale the timings are, AS A VERSION DISTANCE.
 *
 * `captured` is prose and may name several versions ("the v3211 run plus 13 gates added in the v3285 session").
 * THE OLDEST ONE IS THE HONEST ANSWER: the file is only as fresh as its stalest row, and taking the newest would
 * flatter it by the width of whatever was topped up last. Returns null rather than 0 when nothing can be parsed,
 * because UNKNOWN IS NOT ZERO (v2951) and an unparseable provenance must not read as "captured today".
 */
export function ageInVersions(captured, now) {
    const vs = String(captured || "").match(/v(\d+)/g);
    if (!vs || !now) return { capturedAt: null, now, versions: null };
    const oldest = Math.min(...vs.map((v) => +v.slice(1)));
    const cur = +now.slice(1);
    return { capturedAt: "v" + oldest, alsoNamed: vs.filter((v) => +v.slice(1) !== oldest), now, versions: cur - oldest };
}

/** Every gate file's source, read once. */
function gateSources(gateFiles) {
    const out = new Map();
    for (const g of gateFiles) { try { out.set(rel(g), fs.readFileSync(g, "utf8")); } catch { /* unreadable is not a gate */ } }
    return out;
}

/**
 * device -> the gates that reach it, BY ROUTE.
 *
 * Route 1 resolves IMPORT SPECIFIERS (never a filename substring). Route 2 matches the device name as a QUOTED
 * LITERAL inside getDevice(...) / DEVICES[...] -- so `lbm` can never be satisfied by a file that only mentions
 * `lbm-fluid`, which is v3330's exact defect running the other way. Route 3 is a gate that walks DEVICE_NAMES,
 * and is kept in its own bucket rather than folded in.
 */
export function gatesByDevice(deviceModules, gateFiles) {
    const src = gateSources(gateFiles);
    const devs = Object.keys(deviceModules).sort();
    const bindAbs = new Map(devs.map((d) => [path.resolve(ENG, deviceModules[d].bind), d]));
    const out = {};
    for (const d of devs) out[d] = { import: new Set(), name: new Set(), sweep: new Set() };
    const sweeps = new Set();

    for (const [g, s] of src) {
        const abs = path.resolve(ENG, g);
        for (const m of s.matchAll(/from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']/g)) {
            const spec = m[1] || m[2];
            if (!spec || !/^[./]/.test(spec)) continue;
            const target = path.resolve(path.dirname(abs), spec);
            for (const cand of [target, target + ".mjs", target + ".js"]) if (bindAbs.has(cand)) out[bindAbs.get(cand)].import.add(g);
        }
        for (const d of devs) {
            const esc = d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            if (new RegExp('(?:getDevice|DEVICES)\\s*[([]\\s*["\']' + esc + '["\']\\s*[)\\]]').test(s)) out[d].name.add(g);
        }
        if (/DEVICE_NAMES/.test(s)) sweeps.add(g);
    }
    for (const d of devs) for (const g of sweeps) out[d].sweep.add(g);
    return { byDevice: out, sweeps: [...sweeps].sort() };
}

/** The timing state for one device's own gates. SWEEPS ARE EXCLUDED: a sweep times the sweep, not the device. */
export function timingState(gates, timed) {
    const own = [...new Set([...gates.import, ...gates.name])].sort();
    if (own.length === 0) return { state: "no-gate", own, timedCount: 0, ms: null };
    const hit = own.filter((g) => timed.has(g));
    const ms = hit.length ? hit.reduce((a, g) => a + timed.get(g), 0) : null;
    return { state: hit.length === own.length ? "timed" : hit.length ? "partly" : "never-timed", own, timedCount: hit.length, ms };
}

export function buildGateActivity({ deviceModules, gateFiles, timings, captured, version }) {
    const timed = new Map(Object.entries(timings || {}));
    const { byDevice, sweeps } = gatesByDevice(deviceModules, gateFiles);
    const devs = Object.keys(deviceModules).sort();
    const nodes = devs.map((d) => {
        const t = timingState(byDevice[d], timed);
        return {
            id: d,
            state: t.state,
            gates: t.own,
            timedGates: t.timedCount,
            ms: t.ms,
            routes: ROUTES.filter((r) => byDevice[d][r].size > 0),
        };
    });
    const counts = {};
    for (const s of TIMING_STATES) counts[s] = nodes.filter((n) => n.state === s).length;
    const gateRel = gateFiles.map(rel);
    return {
        note: "LAYER 2: what the gate RUNNER knows. A RUNTIME IS NOT A VERDICT, and NEVER TIMED IS NOT FAST.",
        age: ageInVersions(captured, version),
        nodes,
        counts,
        byRoute: { import: devs.filter((d) => byDevice[d].import.size).length, name: devs.filter((d) => byDevice[d].name.size).length, sweep: sweeps.length },
        namedByNeither: devs.filter((d) => !byDevice[d].import.size && !byDevice[d].name.size),
        gates: { total: gateRel.length, timed: gateRel.filter((g) => timed.has(g)).length, neverTimed: gateRel.filter((g) => !timed.has(g)).length,
                 orphanTimings: [...timed.keys()].filter((k) => !gateRel.includes(k)) },
    };
}

export async function gather() {
    const dim = await import("../ship/deviceInstrumentMap.mjs");
    const st = await import("../ship/staleness.mjs");
    const t = JSON.parse(fs.readFileSync(path.join(ENG, "tools", "ship", "gate-timings.json"), "utf8"));
    return { deviceModules: dim.deviceModules(), gateFiles: st.gateFiles(), timings: t.timings, captured: t.captured, version: engineVersion() };
}

/* ---------------------------------------------------------------------------------------------------------- */
const isMain = (() => { try { return path.resolve(process.argv[1] || "") === path.resolve(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isMain) {
    const write = process.argv.slice(2).includes("--write");
    const a = buildGateActivity(await gather());
    console.log("LAYER 2 -- WHAT THE GATE RUNNER KNOWS. A runtime is not a verdict.\n");
    console.log(`  timings captured at ${a.age.capturedAt}${a.age.alsoNamed.length ? " (also names " + a.age.alsoNamed.join(", ") + ")" : ""}, tree is ${a.age.now}`);
    console.log(`  *** ${a.age.versions} VERSIONS STALE, and that age is a VERSION DISTANCE rather than a clock -- there is no timestamp in gate-timings.json at all. ***\n`);
    console.log(`  gates ${a.gates.total}: ${a.gates.timed} timed, ${a.gates.neverTimed} NEVER TIMED, ${a.gates.orphanTimings.length} timing rows for gates no longer in the tree`);
    console.log(`  device -> gate routes: import ${a.byRoute.import}, name ${a.byRoute.name}, sweep ${a.byRoute.sweep} gates`);
    console.log(`  *** THE IMPORT WALK ALONE READS ${a.byRoute.import} OF ${a.nodes.length} -- A SUBSET THAT LOOKS LIKE A CORPUS. ***\n`);
    for (const s of TIMING_STATES) console.log(`     ${s.padEnd(12)} ${a.counts[s]}`);
    console.log(`\n  named by NEITHER import nor getDevice (a sweep still reaches them): ${a.namedByNeither.join(", ") || "(none)"}`);
    if (write) { fs.writeFileSync(path.join(ENG, OUT), JSON.stringify(a, null, 1)); console.log(`\n  WROTE ${OUT}`); }
    else console.log(`\n  DRY RUN -- pass --write to emit ${OUT}.`);
}
