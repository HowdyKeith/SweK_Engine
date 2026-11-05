// WebGLEngine/tools/ship/takeTankDropout.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is tools/ship/takeTankDropout-selfcheck.mjs)
//
// THE COMPASS DROPOUT IN THE TANK, FLOWN OVER THE MEMORY ARMS AND READ AS PAIRED DIFFERENCES: the PD autopilot, the dead-reckoning navigator (the tank's own `navigator` event), the cheapest memory (brain/pilotLeakyHeading.mjs: one leaky unit, and its no-memory lesion, gain 0) and any of the
// plain-net champions of rung 4b (render/subAquariumPlainNet.mjs, brain/rig-results/plainNetStudy.jsonl) and, with --fish, the 803-weight fish champion (render/subAquariumFish.mjs, brain/pilotSubWeightsFishWip.json). It is the loop of `dropoutTask` in brain/switchboard.mjs (branch claude/wizardly-einstein-wr30pd, f4b55956: a fresh one-sub tank per id, the arm's register hook, sync, setEvent, 160 s, the settled
// dark heading error to the wandering target) COPIED and not imported (the board is not in this tree), so that the arms of this branch can be read before the board is merged and the numbers in brain/BACKLOG_PICKUPS_2026-11-05.md can be reproduced.
//   node tools/ship/takeTankDropout.mjs [--ids 12] [--from 1] [--seconds 160] [--plain P/B/mn:3,E/E/mn:0] [--cost] [--fish]      (--plain none for no plain net; default P/B/mn:3; --fish adds the fish champion as an arm beside them; --from is the first id: the tank ids are sb-<from> .. sb-<from + ids - 1>, and a round that means to keep its ids unread flies others)
// TWO SCORES. The SETTLED ERROR is the board's (the heading error to the wandering target on the dark ticks at least 12 s after a retarget); it measures how fast a pilot turns onto a target far more than what it knows of its heading: the navigator TIES the autopilot on it (brain/BACKLOG_PICKUPS_2026-11-05.md).
// The DARK COST (--cost) is built to isolate the compass: each arm and id is flown twice, under the event and with no event (the compass always valid), and the cost is the mean over every tick of the FIRST dark window of (the error under the event) minus (the error at the same tick with the compass lit). The two
// flights are the same flight until that window starts, so the difference is what the window does and nothing else. A pilot that does not need the compass has a cost near 0 (the navigator's is 0.0000 to the fourth place); the dropout autopilot's is what the lost heading costs it. It is small beside the error itself
// (the sub is mostly turning onto a target: about 1 rad), so a single cost is noisy and the reading is the paired difference over many ids (the autopilot's is about +0.02 rad: 2 se on 30 ids, 4 on 100).
// THE READING is the board's, turned for an error that is lower-is-better: arm minus control over the same ids, "BEATS its control" iff the mean difference is negative and more than 2 se below zero, "IS BELOW" iff positive and more than 2 se above, else "TIES" ("the plain net does as well" is the line the board exists to be able to say).
// Exit 0 printed; 1 a usage error; 2 a file or a champion that is not there. Pure but for the flights and the files it reads (the plain-net study file; the fish weights file with --fish). No clock, no random.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as A from "../../render/subAquariumSim.mjs";
import * as L from "../../brain/pilotLeakyHeading.mjs";
import * as PNK from "../../render/subAquariumPlainNet.mjs";
import * as FK from "../../render/subAquariumFish.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const STUDY_FILE = "brain/rig-results/plainNetStudy.jsonl", FISH_FILE = "brain/pilotSubWeightsFishWip.json";
export const DEFAULTS = Object.freeze({ ids: 12, from: 1, seconds: 160, plain: Object.freeze(["P/B/mn:3"]), cost: false, fish: false });
export const TICK = 1 / 30, SETTLE = 12, SE_FACTOR = 2;
const TWO_PI = 2 * Math.PI;
const wrap = (a) => { let x = a % TWO_PI; if (x > Math.PI) x -= TWO_PI; if (x <= -Math.PI) x += TWO_PI; return x; };
const meanOf = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const seOf = (a) => { if (a.length < 2) return 0; const m = meanOf(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length - 1) / a.length); };

/** { ids, from, seconds, plain, cost, fish } from the command line, or { error } naming the fault. */
export function parseArgs(argv) {
    const out = { ids: DEFAULTS.ids, from: DEFAULTS.from, seconds: DEFAULTS.seconds, plain: [...DEFAULTS.plain], cost: DEFAULTS.cost, fish: DEFAULTS.fish }, seen = new Set();
    for (let i = 0; i < argv.length; i += argv[i] === "--cost" || argv[i] === "--fish" ? 1 : 2) {
        const flag = argv[i], v = argv[i + 1];
        if (!["--ids", "--from", "--seconds", "--plain", "--cost", "--fish"].includes(flag)) return { error: `not understood: ${flag}` };
        if (seen.has(flag)) return { error: `${flag} given twice` };
        seen.add(flag);
        if (flag === "--cost") { out.cost = true; continue; }
        if (flag === "--fish") { out.fish = true; continue; }
        if (v === undefined) return { error: `${flag} needs a value` };
        if (flag === "--ids") { const n = Number(v); if (!/^\d+$/.test(v) || n < 2 || n > 200) return { error: `--ids is a whole number from 2 to 200, got ${v}` }; out.ids = n; }
        else if (flag === "--from") { const n = Number(v); if (!/^\d+$/.test(v) || n < 1 || n > 1000000) return { error: `--from is a whole number from 1 to 1000000, got ${v}` }; out.from = n; }
        else if (flag === "--seconds") { const n = Number(v); if (!/^\d+(\.\d+)?$/.test(v) || n < 20 || n > 600) return { error: `--seconds is a number from 20 to 600, got ${v}` }; out.seconds = n; }
        else {
            const list = v === "none" ? [] : v.split(",");
            if (list.some((s) => !s)) return { error: `--plain is a comma-separated list of champion specs (P/B/mn:3), or none, got ${JSON.stringify(v)}` };
            if (new Set(list).size !== list.length) return { error: `--plain names a champion twice` };
            out.plain = list;
        }
    }
    return out;
}

/** The champion records of a plainNetStudy.jsonl text, by spec; a line that is not JSON is an error naming its number. */
export function championsOf(text) {
    const out = new Map();
    text.split("\n").forEach((line, i) => {
        if (!line.trim()) return;
        let r; try { r = JSON.parse(line); } catch { throw new Error(`takeTankDropout: line ${i + 1} of the study file is not JSON`); }
        if (r && r.weights && (r.family === "mn" || r.family === "mg")) out.set(r.spec, r);
    });
    return out;
}

/** The arms, each { arm, event }: the autopilot and the leaky unit and its lesion under the tank's dropout, the navigator (the autopilot under the tank's own navigator event), and one plain net per spec, and the fish champion when `fishFile` (the parsed brain/pilotSubWeightsFishWip.json) is given. Controls are arm ids. An unknown spec throws naming it. */
export function armsFor(records, plain, fishFile = null) {
    const auto = { id: "autopilot", layer: "flying", controls: [], entry: () => ({ pilot: "autopilot", circuit: "gfc", weights: null }) };
    const arms = [
        { arm: auto, event: "dropout" },
        { arm: { ...auto, id: "navigator", controls: ["autopilot"] }, event: "navigator" },
        { arm: L.leakyArm(), event: "dropout" },
        { arm: L.leakyArm({ id: "leaky-unit-off", weights: [L.DEFAULTS.sigma, 0], controls: [] }), event: "dropout" },
    ];
    for (const spec of plain) {
        const r = records.get(spec);
        if (!r) throw new Error(`takeTankDropout: no champion ${JSON.stringify(spec)} in the study file`);
        arms.push({ arm: PNK.plainNetArm({ record: r, controls: ["autopilot", "leaky-unit"] }), event: "dropout" });
    }
    if (fishFile) arms.push({ arm: FK.fishArm({ file: fishFile, controls: ["autopilot", "leaky-unit"] }), event: "dropout" });
    return arms;
}

/** brain/switchboard.mjs dropoutTask's flight of one id, kept tick by tick: { errs (the heading error to the wandering target at every tick), dark (1 on a dark tick), settled (1 on a dark tick at least SETTLE s after the last retarget), lost }. `event` may be null (the compass always valid). */
export function trace(arm, n, event, seconds = DEFAULTS.seconds) {
    const id = "sb-" + n, q = A.createTank();
    if (arm.register) arm.register(q);
    q.sync([{ id, name: "Board " + arm.id, hue: 100, from: "board", local: true, theta: null, ...arm.entry(id) }]);
    if (event) q.setEvent(id, event);
    const errs = [], dark = [], settled = []; let target = null, age = 0, last = null;
    for (let i = 0, m = Math.round(seconds / TICK); i < m; i++) {
        q.step(TICK); const s = q.snapshot()[0]; last = s;
        if (s.target !== target) { target = s.target; age = 0; } else age += TICK;
        const isDark = !!(s.compass && s.compass.valid === false);
        errs.push(Math.abs(wrap(s.target.heading - s.heading))); dark.push(isDark ? 1 : 0); settled.push(isDark && age >= SETTLE ? 1 : 0);
    }
    return { errs, dark, settled, lost: !!last.lost };
}

/** The board's score of one id: { err (the mean error on the settled dark ticks, on all the dark ticks when none is settled), dark (the dark ticks), lost }. */
export function flight(arm, n, event, seconds = DEFAULTS.seconds) {
    const t = trace(arm, n, event, seconds);
    let sum = 0, cnt = 0, sumAll = 0, cntAll = 0;
    t.errs.forEach((e, i) => { if (t.dark[i]) { sumAll += e; cntAll++; if (t.settled[i]) { sum += e; cnt++; } } });
    const err = cnt ? sum / cnt : cntAll ? sumAll / cntAll : NaN;
    if (!Number.isFinite(err)) throw new Error(`takeTankDropout: arm ${arm.id} id sb-${n} has no dark ticks`);
    return { err, dark: cntAll, lost: t.lost };
}

/** The cost of the first dark window of two traces of one arm and id (under the event, and lit): the mean over every tick of that window of the error under the event minus the error at the same tick lit. Only the FIRST window: the two flights are the same flight until it starts, so the difference is the window's effect and nothing else; and every tick of it, since the settled ticks leave out the turn onto a new target, which is where a stale heading hurts. Refuses traces of different lengths and a trace with no dark tick. */
export function costOf(ev, lit) {
    if (ev.errs.length !== lit.errs.length) throw new Error(`takeTankDropout.costOf: ${ev.errs.length} and ${lit.errs.length} ticks`);
    const first = ev.dark.indexOf(1);
    if (first < 0) throw new Error("takeTankDropout.costOf: the event trace has no dark tick");
    let end = first; while (end < ev.dark.length && ev.dark[end]) end++;
    const d = []; for (let i = first; i < end; i++) d.push(ev.errs[i] - lit.errs[i]);
    return { cost: meanOf(d), dark: d.length };
}
/** The dark cost of one id of an arm: two flights, the event and none. */
export function costFlight(arm, n, event, seconds = DEFAULTS.seconds) {
    return costOf(trace(arm, n, event, seconds), trace(arm, n, null, seconds));
}

/** Every arm on the ids from..from+ids-1: { ids, from, seconds, arms: [{ id, controls, errs[], lost, costs? }] } in the order of `armList`. `opts`: { flightFn (the flight, a fake in the gate), costFn (when given, each arm also gets `costs`: the dark cost of each id) }. */
export function run(armList, ids, seconds, from = 1, opts = {}) {
    const flightFn = opts.flightFn || flight, costFn = opts.costFn || null;
    const arms = armList.map(({ arm, event }) => {
        const fl = Array.from({ length: ids }, (_, i) => flightFn(arm, from + i, event, seconds)), a = { id: arm.id, controls: [...arm.controls], errs: fl.map((f) => f.err), lost: fl.filter((f) => f.lost).length };
        if (costFn) a.costs = Array.from({ length: ids }, (_, i) => costFn(arm, from + i, event, seconds).cost);
        return a;
    });
    return { ids, from, seconds, arms };
}

/** The pooled paired difference a minus b of two error lists over the same ids: { n, mean, se, better (a lower), worse (a higher), same }. */
export function pairedErr(a, b) {
    if (a.length !== b.length) throw new Error(`takeTankDropout.pairedErr: ${a.length} and ${b.length} ids`);
    const d = a.map((x, i) => x - b[i]);
    return { n: d.length, mean: meanOf(d), se: seOf(d), better: d.filter((x) => x < -1e-9).length, worse: d.filter((x) => x > 1e-9).length, same: d.filter((x) => Math.abs(x) <= 1e-9).length };
}
/** BEATS iff the mean is negative and more than SE_FACTOR se below zero, IS BELOW iff positive and more than that above, else TIES (a mean within 1e-9 of zero is a TIE whatever the se). */
export const readingOf = (p) => (Math.abs(p.mean) <= 1e-9 ? "TIES" : -p.mean > SE_FACTOR * p.se ? "BEATS" : p.mean > SE_FACTOR * p.se ? "IS BELOW" : "TIES");
const sg = (x) => (x >= 0 ? "+" : "") + x.toFixed(4);

/** The lines of one score: the means (`key` is "errs" or "costs"), the readings of each arm against its controls, and the reference line of the leaky unit against the navigator. `tag` is appended to the reading lines ("" or " on the dark cost"). */
function block(res, key, tag) {
    const L2 = [], by = new Map(res.arms.map((a) => [a.id, a]));
    for (const a of res.arms) L2.push(`  ${a.id.padEnd(20)} mean ${meanOf(a[key]).toFixed(4)}${key === "errs" ? `  lost ${a.lost}` : ""}`);
    for (const a of res.arms) for (const c of a.controls) {
        const k = by.get(c);
        if (!k) { L2.push(`${a.id}: its control ${c} was not flown, so no line`); continue; }
        const p = pairedErr(a[key], k[key]);
        L2.push(`${a.id} ${readingOf(p)} its control ${c}${tag} (${sg(p.mean)} rad, se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same})`);
    }
    const lk = by.get("leaky-unit"), nv = by.get("navigator");
    if (lk && nv) { const p = pairedErr(lk[key], nv[key]); L2.push(`REFERENCE leaky-unit against the navigator${tag}: ${readingOf(p)} (${sg(p.mean)} rad, se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same})`); }
    return L2;
}
/** The report of a run as lines: the settled error, and with costs the dark cost after it. */
export function reportLines(res) {
    const out = [`COMPASS DROPOUT IN THE TANK, the board's loop: ids sb-${res.from}..sb-${res.from + res.ids - 1}, ${res.seconds} s, the settled dark heading error to the wandering target in rad (lower is better); the navigator is the tank's own event, every other arm the dropout event`, ...block(res, "errs", "")];
    if (res.arms.every((a) => a.costs)) out.push("", "DARK COST of the first dark window: the error under the event minus the same pilot's error at the same ticks with the compass lit, in rad (lower is better; near 0 is a pilot that does not need the compass)", ...block(res, "costs", " on the dark cost"));
    return out;
}

/** The command: prints the report; 1 for a usage error, 2 for a missing file or champion. `io`: { read, print, err, go } for the gate. */
export function main(argv, io = {}) {
    const read = io.read || ((f) => fs.readFileSync(path.join(ENG, f), "utf8")), print = io.print || ((t) => process.stdout.write(t)), err = io.err || console.error, go = io.go || run;
    const a = parseArgs(argv);
    if (a.error) { err(`usage: node tools/ship/takeTankDropout.mjs [--ids 12] [--from 1] [--seconds 160] [--plain P/B/mn:3,E/E/mn:0|none] [--cost] [--fish]   (${a.error})`); return 1; }
    let armList;
    try {
        let text = ""; if (a.plain.length) { try { text = read(STUDY_FILE); } catch { throw new Error(`takeTankDropout: ${STUDY_FILE} is missing`); } }
        let fish = null; if (a.fish) { try { fish = JSON.parse(read(FISH_FILE)); } catch { throw new Error(`takeTankDropout: ${FISH_FILE} is missing or is not JSON`); } }
        armList = armsFor(championsOf(text), a.plain, fish);
    } catch (e) { err(String((e && e.message) || e)); return 2; }
    print(reportLines(go(armList, a.ids, a.seconds, a.from, a.cost ? { costFn: costFlight } : {})).join("\n") + "\n");
    return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
