// WebGLEngine/tools/ship/takeTankDropout.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is tools/ship/takeTankDropout-selfcheck.mjs)
//
// THE COMPASS DROPOUT IN THE TANK, FLOWN OVER THE MEMORY ARMS AND READ AS PAIRED DIFFERENCES: the PD autopilot, the dead-reckoning navigator (the tank's own `navigator` event), the cheapest memory (brain/pilotLeakyHeading.mjs: one leaky unit, and its no-memory lesion, gain 0) and any of the
// plain-net champions of rung 4b (render/subAquariumPlainNet.mjs, brain/rig-results/plainNetStudy.jsonl). It is the loop of `dropoutTask` in brain/switchboard.mjs (branch claude/wizardly-einstein-wr30pd, f4b55956: a fresh one-sub tank per id, the arm's register hook, sync, setEvent, 160 s, the settled
// dark heading error to the wandering target) COPIED and not imported (the board is not in this tree), so that the arms of this branch can be read before the board is merged and the numbers in brain/BACKLOG_PICKUPS_2026-11-05.md can be reproduced.
//   node tools/ship/takeTankDropout.mjs [--ids 12] [--from 1] [--seconds 160] [--plain P/B/mn:3,E/E/mn:0]      (--plain none for no plain net; default P/B/mn:3; --from is the first id: the tank ids are sb-<from> .. sb-<from + ids - 1>, and a round that means to keep its ids unread flies others)
// THE READING is the board's, turned for an error that is lower-is-better: arm minus control over the same ids, "BEATS its control" iff the mean difference is negative and more than 2 se below zero, "IS BELOW" iff positive and more than 2 se above, else "TIES" ("the plain net does as well" is the line the board exists to be able to say).
// Exit 0 printed; 1 a usage error; 2 a file or a champion that is not there. Pure but for the flights and the one file it reads. No clock, no random.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as A from "../../render/subAquariumSim.mjs";
import * as L from "../../brain/pilotLeakyHeading.mjs";
import * as PNK from "../../render/subAquariumPlainNet.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const STUDY_FILE = "brain/rig-results/plainNetStudy.jsonl";
export const DEFAULTS = Object.freeze({ ids: 12, from: 1, seconds: 160, plain: Object.freeze(["P/B/mn:3"]) });
export const TICK = 1 / 30, SETTLE = 12, SE_FACTOR = 2;
const TWO_PI = 2 * Math.PI;
const wrap = (a) => { let x = a % TWO_PI; if (x > Math.PI) x -= TWO_PI; if (x <= -Math.PI) x += TWO_PI; return x; };
const meanOf = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const seOf = (a) => { if (a.length < 2) return 0; const m = meanOf(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length - 1) / a.length); };

/** { ids, from, seconds, plain } from the command line, or { error } naming the fault. */
export function parseArgs(argv) {
    const out = { ids: DEFAULTS.ids, from: DEFAULTS.from, seconds: DEFAULTS.seconds, plain: [...DEFAULTS.plain] }, seen = new Set();
    for (let i = 0; i < argv.length; i += 2) {
        const flag = argv[i], v = argv[i + 1];
        if (!["--ids", "--from", "--seconds", "--plain"].includes(flag)) return { error: `not understood: ${flag}` };
        if (seen.has(flag)) return { error: `${flag} given twice` };
        seen.add(flag);
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

/** The arms, each { arm, event }: the autopilot and the leaky unit and its lesion under the tank's dropout, the navigator (the autopilot under the tank's own navigator event), and one plain net per spec. Controls are arm ids. An unknown spec throws naming it. */
export function armsFor(records, plain) {
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
    return arms;
}

/** brain/switchboard.mjs dropoutTask's flight of one id: { err (the mean settled dark heading error, the dark ticks when none is settled), dark (the dark ticks), lost }. */
export function flight(arm, n, event, seconds = DEFAULTS.seconds) {
    const id = "sb-" + n, q = A.createTank();
    if (arm.register) arm.register(q);
    q.sync([{ id, name: "Board " + arm.id, hue: 100, from: "board", local: true, theta: null, ...arm.entry(id) }]);
    q.setEvent(id, event);
    let target = null, age = 0, sum = 0, cnt = 0, sumAll = 0, cntAll = 0, last = null;
    for (let i = 0, m = Math.round(seconds / TICK); i < m; i++) {
        q.step(TICK); const s = q.snapshot()[0]; last = s;
        if (s.target !== target) { target = s.target; age = 0; } else age += TICK;
        const dark = !!(s.compass && s.compass.valid === false), e = Math.abs(wrap(s.target.heading - s.heading));
        if (dark) { sumAll += e; cntAll++; if (age >= SETTLE) { sum += e; cnt++; } }
    }
    const err = cnt ? sum / cnt : cntAll ? sumAll / cntAll : NaN;
    if (!Number.isFinite(err)) throw new Error(`takeTankDropout: arm ${arm.id} id ${id} has no dark ticks`);
    return { err, dark: cntAll, lost: !!last.lost };
}

/** Every arm on the ids from..from+ids-1: { ids, from, seconds, arms: [{ id, controls, errs[], lost }] } in the order of `armList`; `flightFn` is the flight (the gate hands in a fake that loses a sub). */
export function run(armList, ids, seconds, from = 1, flightFn = flight) {
    const arms = armList.map(({ arm, event }) => {
        const fl = Array.from({ length: ids }, (_, i) => flightFn(arm, from + i, event, seconds));
        return { id: arm.id, controls: [...arm.controls], errs: fl.map((f) => f.err), lost: fl.filter((f) => f.lost).length };
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

/** The report of a run as lines. */
export function reportLines(res) {
    const L2 = [`COMPASS DROPOUT IN THE TANK, the board's loop: ids sb-${res.from}..sb-${res.from + res.ids - 1}, ${res.seconds} s, the settled dark heading error to the wandering target in rad (lower is better); the navigator is the tank's own event, every other arm the dropout event`];
    for (const a of res.arms) L2.push(`  ${a.id.padEnd(20)} mean ${meanOf(a.errs).toFixed(4)}  lost ${a.lost}`);
    const by = new Map(res.arms.map((a) => [a.id, a]));
    for (const a of res.arms) for (const c of a.controls) {
        const k = by.get(c);
        if (!k) { L2.push(`${a.id}: its control ${c} was not flown, so no line`); continue; }
        const p = pairedErr(a.errs, k.errs);
        L2.push(`${a.id} ${readingOf(p)} its control ${c} (${sg(p.mean)} rad, se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same})`);
    }
    const lk = by.get("leaky-unit"), nv = by.get("navigator");
    if (lk && nv) { const p = pairedErr(lk.errs, nv.errs); L2.push(`REFERENCE leaky-unit against the navigator: ${readingOf(p)} (${sg(p.mean)} rad, se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same})`); }
    return L2;
}

/** The command: prints the report; 1 for a usage error, 2 for a missing file or champion. `io`: { read, print, err, go } for the gate. */
export function main(argv, io = {}) {
    const read = io.read || ((f) => fs.readFileSync(path.join(ENG, f), "utf8")), print = io.print || ((t) => process.stdout.write(t)), err = io.err || console.error, go = io.go || run;
    const a = parseArgs(argv);
    if (a.error) { err(`usage: node tools/ship/takeTankDropout.mjs [--ids 12] [--from 1] [--seconds 160] [--plain P/B/mn:3,E/E/mn:0|none]   (${a.error})`); return 1; }
    let armList;
    try {
        let text = ""; if (a.plain.length) { try { text = read(STUDY_FILE); } catch { throw new Error(`takeTankDropout: ${STUDY_FILE} is missing`); } }
        armList = armsFor(championsOf(text), a.plain);
    } catch (e) { err(String((e && e.message) || e)); return 2; }
    print(reportLines(go(armList, a.ids, a.seconds, a.from)).join("\n") + "\n");
    return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
