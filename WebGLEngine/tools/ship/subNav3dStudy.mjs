// WebGLEngine/tools/ship/subNav3dStudy.mjs -- UNNUMBERED (the library is brain/subNav3d.mjs, the registration brain/NAV_3D_WIP.md, the gate brain/subNav3d-selfcheck.mjs)
//   node tools/ship/subNav3dStudy.mjs [--set dev|held77] [--seeds N] [--write]
// Flies the incumbent (`any`) and the depth schedule (`any+vertical`) over the three kinds of walls (keel-wall, ridge, both) and prints the checks (a failure marks the readings NOT WEIGHED), the table of statuses per kind and arm, the verdict (per kind: the vertical plan HELPS iff it
// reaches at least 80 percent AND the paired gain is at least 5 AND the sign test p <= 0.10; the item is SUPPORTED iff it helps in all three kinds, PARTLY in two, else NOT) and the registered expectations scored. --set dev is seeds 1 to 12 (the code, not a result); --set held77 is
// seeds 9001 to 9040 -- the registered read, flown ONCE; --write (held77 only, whole set) writes every flight to brain/subNav3dHeld77.jsonl. --seeds N takes the first N of the set (with --write it is refused).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as M from "../../brain/subNav3d.mjs";
import * as N from "../../brain/subFieldNav.mjs";
import * as S from "./subNavPlusStudy.mjs";

const ENG = fileURLToPath(new URL("../../", import.meta.url));
export const HELD77_FILE = "brain/subNav3dHeld77.jsonl";   // not named OUT: that spelling declares a front-door artefact (registerResidue), and this file is a registered record
export const BAR = 0.8, GAIN = 5, P_MAX = 0.10, SPACING_MIN = 130;

/** Every scenario of every kind for the seeds, seed-major, and both arms of each: the flights, scenario-major. */
export function runs3d(seeds, o = {}) { return M.evaluate3d(o.pilot || S.pilot, scenariosOf(seeds), o); }
export const scenariosOf = (seeds) => seeds.flatMap((seed) => M.KINDS3D.map((kind) => M.scenario3d(seed, kind)));

/** The registered checks of a list of scenarios and flights: walls inside the region; 130 m between the keel wall and the ridge of BOTH; the windows feasible; every flight's path finite. Returns { ok, failures }. */
export function checksOf(scenarios, flights) {
    const failures = [];
    for (const sc of scenarios) {
        for (const w of sc.walls) {
            if (!(w.x0 > N.REGION.x0 && w.x1 < N.REGION.x1)) failures.push(`${sc.kind} ${sc.seed}: a wall is not inside the region (x ${w.x0.toFixed(0)} to ${w.x1.toFixed(0)})`);
            const win = M.windowOf(w); if (!(win.lo <= win.hi)) failures.push(`${sc.kind} ${sc.seed}: a ${w.type} window is empty (${win.lo.toFixed(1)} to ${win.hi.toFixed(1)} m)`);
        }
        if (sc.kind === "both") { const k = sc.walls.find((w) => w.type === "keel"), r = sc.walls.find((w) => w.type === "ridge"); if (!(r.x0 - k.x1 >= SPACING_MIN)) failures.push(`${sc.kind} ${sc.seed}: ${(r.x0 - k.x1).toFixed(0)} m between the keel wall and the ridge (at least ${SPACING_MIN} are required)`); }
    }
    for (const f of flights) if (!Number.isFinite(f.path)) failures.push(`${f.kind} ${f.seed} ${f.arm}: the path is not finite`);
    return { ok: failures.length === 0, failures };
}

const count = (rs, s) => rs.filter((r) => r.status === s).length;
/** The judgement of a list of flights: per kind { n, any, vertical (each the cell and its grounded count), pr (paired: vertical against any), helps }, and the item's verdict. */
export function judge(flights) {
    const per = {};
    for (const kind of M.KINDS3D) {
        const a = flights.filter((r) => r.kind === kind && r.arm === "any"), v = flights.filter((r) => r.kind === kind && r.arm === "any+vertical"), pr = S.paired(v, a), n = v.length;
        per[kind] = { n, any: { ...S.cell(a), grounded: count(a, "grounded"), noRoute: a.filter((r) => r.noRoute).length }, vertical: { ...S.cell(v), grounded: count(v, "grounded") }, pr, helps: n > 0 && v.filter((r) => r.reached).length / n >= BAR && pr.gain >= GAIN && pr.p <= P_MAX };
    }
    const helped = M.KINDS3D.filter((k) => per[k].helps).length;
    return { per, helped, verdict: helped === 3 ? "SUPPORTED" : helped === 2 ? "PARTLY SUPPORTED" : "NOT SUPPORTED" };
}
const rate = (c) => (Number.isFinite(c.rate) ? (100 * c.rate).toFixed(0) + "%" : "n/a");
export function tableLines(flights, title) {
    const j = judge(flights), L = [`${title}: any against any+vertical, per kind (reached / collided / grounded / left / timeout of n)`];
    for (const kind of M.KINDS3D) { const p = j.per[kind], f = (c) => `${c.reached} / ${c.collided} / ${c.grounded} / ${c.left} / ${c.timeout} of ${c.n} (${rate(c)})`; L.push(`  ${kind.padEnd(10)} any ${f(p.any)}${p.any.noRoute ? `, the field had no route in ${p.any.noRoute}` : ""}`, `  ${"".padEnd(10)} any+vertical ${f(p.vertical)}; paired: both ${p.pr.both}, vertical only ${p.pr.aOnly}, any only ${p.pr.bOnly}, neither ${p.pr.neither}; gain ${p.pr.gain}, p ${p.pr.p.toFixed(4)}`); }
    return L;
}
export function verdictLines(j) {
    const L = M.KINDS3D.map((k) => `  ${k}: the vertical plan ${j.per[k].helps ? "HELPS" : "DOES NOT HELP"} (reached ${(100 * j.per[k].vertical.rate).toFixed(0)}% against the bar of ${100 * BAR}%, gain ${j.per[k].pr.gain} against ${GAIN}, p ${j.per[k].pr.p.toFixed(4)} against ${P_MAX})`);
    L.push(`VERDICT: ${j.verdict} (the vertical plan helps in ${j.helped} of 3 kinds)`); return L;
}
/** The registered expectations scored (brain/NAV_3D_WIP.md section 3): [[label, forecast percent, result boolean]]. */
export function expectations(flights, j = judge(flights)) {
    const k = j.per["keel-wall"], r = j.per.ridge, b = j.per.both, islandHit = flights.some((f) => f.arm === "any+vertical" && f.status === "collided");
    return [["keel wall: any reaches at most 5 of 40", 85, k.any.reached <= 5], ["keel wall: any+vertical reaches at least 32 of 40", 70, k.vertical.reached >= 32], ["keel wall: the vertical plan HELPS", 70, k.helps],
        ["ridge: any is grounded in at least 10 of 40", 70, r.any.grounded >= 10], ["ridge: any+vertical is grounded in none", 80, r.vertical.grounded === 0], ["ridge: any+vertical reaches at least 32 of 40", 70, r.vertical.reached >= 32], ["ridge: the vertical plan HELPS", 65, r.helps],
        ["both: any+vertical reaches at least 32 of 40", 55, b.vertical.reached >= 32], ["both: the vertical plan HELPS", 60, b.helps], ["THE ITEM SUPPORTED", 45, j.verdict === "SUPPORTED"], ["any+vertical collides in at least one scenario", 50, islandHit]];
}
export const expectationLines = (flights, j) => expectations(flights, j).map(([l, p, ok]) => `  expectation (about ${p} percent): ${l}: ${ok ? "YES" : "NO"}`);

export function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync, sets = io.sets || M.SETS3D;
    const o = { set: "dev", seeds: null, write: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--write") o.write = true;
        else if (a === "--set") { o.set = argv[++i]; if (!sets[o.set]) { err(`subNav3dStudy: --set needs one of ${Object.keys(sets).join(", ")}`); return 2; } }
        else if (a === "--seeds") { const v = Number(argv[++i]); if (!Number.isInteger(v) || v <= 0) { err("subNav3dStudy: --seeds needs a positive whole number"); return 2; } o.seeds = v; }
        else { err(`subNav3dStudy: unknown argument ${JSON.stringify(a)}`); return 2; }
    }
    if (o.write && o.set !== "held77") { err("subNav3dStudy: --write goes with --set held77 only"); return 2; }
    if (o.write && o.seeds !== null) { err("subNav3dStudy: --write needs the whole set (no --seeds)"); return 2; }
    const seeds = o.seeds ? sets[o.set].slice(0, o.seeds) : sets[o.set], scs = scenariosOf(seeds), flights = (io.flights || runs3d)(seeds), ck = checksOf(scs, flights), real = o.set !== "dev";
    out(`${o.set.toUpperCase()}: ${seeds.length} seeds of each of ${M.KINDS3D.length} kinds, ${M.ARMS3D.join(" and ")} (${real ? "the registered read" : "a sanity run of the code, not a result"})`);
    if (!ck.ok) for (const f of ck.failures) out(`CHECK FAILED -- the readings below are NOT WEIGHED: ${f}`); else out("checks: every wall is inside the region, the keel wall and the ridge of `both` are at least 130 m apart, every window is feasible, every path is finite");
    const j = judge(flights); for (const l of tableLines(flights, o.set.toUpperCase())) out(l);
    for (const l of verdictLines(j)) out(l); if (real) for (const l of expectationLines(flights, j)) out(l);
    if (o.write) { writeFile(path.join(ENG, HELD77_FILE), flights.map((r) => JSON.stringify({ set: o.set, ...r })).join("\n") + "\n"); out(`wrote ${flights.length} flights to ${HELD77_FILE}`); }
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = command(process.argv.slice(2));
