// WebGLEngine/tools/ship/subReconcileStudy.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is "FOLLOW-UP 13" in brain/SUB_FIELD_NAV_WIP.md, the gate is tools/ship/subReconcileStudy-selfcheck.mjs)
//
// THE STUDY OF THE TWO MISSION SERIES, RECONCILED: PART A flies main's HELD83 missions with series B's flyer and series B's HELD10 missions with main's flyer (the reference arm), PART B flies the
// fresh HELD13 (four chord bins of 30 missions, the reference and the 2.5 m/s arm, series B's flyer), and reads the registered verdict T1 to T3 and E1 to E8 (brain/subReconcileNav.mjs).
//   node tools/ship/subReconcileStudy.mjs --set dev [--seeds N]              DEV: the sanity run (N missions of each part A set, N a bin); not a result
//   node tools/ship/subReconcileStudy.mjs --set held13 [--write]             HELD13 and the two cross-flown sets, READ ONCE; --write puts every flight in brain/subReconcileHeld13.jsonl (and refuses a second write)
// Pure apart from the file --write puts down. No clock, no Math.random.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as R from "../../brain/subReconcileNav.mjs";
import * as MN from "../../brain/navMission.mjs";
import * as SB from "../../brain/subMissionNav.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const OUT = "brain/subReconcileHeld13.jsonl", STORED_MAIN = "brain/navMissionHeld83.jsonl", STORED_B = "brain/subMissionHeld10.jsonl", SETS = Object.freeze(["dev", "held13"]);
export const THRESH = Object.freeze({ t1Lo: 31, t1Hi: 51, t2Max: 6, bin1Max: 3, bin3Min: 15, bin4Min: 24, slack: 2, agree: 0.85, slowMax: 2, drift: 5 });

/** The median of a list (the mean of the two middle values when the count is even); NaN for an empty list. */
export function median(xs) {
    if (!xs.length) return NaN;
    const a = xs.slice().sort((p, q) => p - q), m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
/** { n, completed, energyOut, collided, left, timeout, other, medianMJ (energy used, flights that report it), medianChord } for a list of flights in the shared shape (brain/subReconcileNav.mjs). */
export function summarize(rows) {
    const count = (o) => rows.filter((r) => r.outcome === o).length, known = new Set(R.OUTCOMES);
    return { n: rows.length, completed: count("completed"), energyOut: count("energy-out"), collided: count("collided"), left: count("left"), timeout: count("timeout"), other: rows.filter((r) => !known.has(r.outcome)).length,
        medianMJ: median(rows.filter((r) => Number.isFinite(r.energy)).map((r) => r.energy / 1e6)), medianChord: median(rows.map((r) => r.chord)) };
}
/** Whether two flights are the same flight: the same outcome in the shared vocabulary, the same ticks and a path within a millimetre. */
export const sameFlight = (a, b) => !!a && !!b && R.outcomeOf(a.status) === R.outcomeOf(b.status) && a.ticks === b.ticks && Math.abs(a.path - b.path) < 1e-3;
/** Per-mission agreement of two flights lists paired by seed on ONE question: energy-out or not. { n, agree, fraction } over the seeds both have. */
export function agreement(flown, stored) {
    const by = new Map(stored.map((r) => [r.seed, R.outcomeOf(r.status) === "energy-out"]));
    let n = 0, agree = 0;
    for (const f of flown) if (by.has(f.seed)) { n++; if ((f.outcome === "energy-out") === by.get(f.seed)) agree++; }
    return { n, agree, fraction: n ? agree / n : NaN };
}
/**
 * The verdict (brain/SUB_FIELD_NAV_WIP.md, "FOLLOW-UP 13") and E1 to E8. `a1` is series B's flyer on main's missions (summary), `a2` main's flyer on series B's (summary), `bins` four summaries of the
 * REFERENCE by chord bin and `slow` four of the 2.5 m/s arm, `agree` { a1, a2 } fractions, `drift` the drift check (true when both flyers reproduced their stored flights). A missing cell is a miss, never a throw.
 * T1: a1.energyOut in [31, 51]. T2: a2.energyOut at most 6. T3: bin 1 at most 3, bin 3 at least 15, bin 4 at least 24, each bin at least the one before it minus 2.
 * SUPPORTED iff T1, T2 and T3; PARTLY SUPPORTED iff T1 and T2 and not T3, or T3 and exactly one of T1 and T2; NOT SUPPORTED otherwise.
 */
export function judge({ a1, a2, bins, slow, agree, drift }) {
    const T = THRESH, eo = (i) => (bins && bins[i] ? bins[i].energyOut : NaN);
    const t1 = !!a1 && a1.energyOut >= T.t1Lo && a1.energyOut <= T.t1Hi, t2 = !!a2 && a2.energyOut <= T.t2Max;
    const mono = [1, 2, 3].every((i) => eo(i) >= eo(i - 1) - T.slack);
    const t3a = eo(0) <= T.bin1Max, t3b = eo(2) >= T.bin3Min, t3c = eo(3) >= T.bin4Min, t3 = t3a && t3b && t3c && mono;
    const verdict = t1 && t2 && t3 ? "SUPPORTED" : (t1 && t2) || (t3 && (t1 !== t2)) ? "PARTLY SUPPORTED" : "NOT SUPPORTED";
    const slowOk = !!slow && [0, 1, 2].every((i) => slow[i] && slow[i].energyOut <= T.slowMax);
    return { t1, t2, t3, mono, t3a, t3b, t3c, verdict, e1: !!drift, e2: t1, e3: t2, e4: mono, e5: t3b,
        e6: !!agree && agree.a1 >= T.agree && agree.a2 >= T.agree, e7: slowOk, e8: verdict === "SUPPORTED" };
}
const pct = (v) => (Number.isFinite(v) ? (100 * v).toFixed(0) + "%" : "n/a");
const f2s = (v) => (Number.isFinite(v) ? v.toFixed(2) : "n/a");
export function table(a1, a2, bins, slow, title) {
    const head = "cell                                          | n   | completed | energy-out | collided | left | timeout | median MJ | median chord (m)";
    const row = (name, x) => (x ? `${name.padEnd(45)} | ${String(x.n).padStart(3)} | ${String(x.completed).padStart(9)} | ${String(x.energyOut).padStart(10)} | ${String(x.collided).padStart(8)} | ${String(x.left).padStart(4)} | ${String(x.timeout).padStart(7)} | ${f2s(x.medianMJ).padStart(9)} | ${x.medianChord.toFixed(0)}` : `${name.padEnd(45)} | (not flown)`);
    const lines = [title, head, row("A1  series B's flyer on main's HELD83 missions", a1), row("A2  main's flyer on series B's HELD10 missions", a2)];
    bins.forEach((x, i) => lines.push(row(`B${i + 1}  reference, chord [${R.BINS[i][0]}, ${R.BINS[i][1]})`, x)));
    slow.forEach((x, i) => lines.push(row(`B${i + 1}  2.5 m/s arm, chord [${R.BINS[i][0]}, ${R.BINS[i][1]})`, x)));
    return lines.join("\n");
}
export function verdictText(j) {
    const yn = (v) => (v ? "HELD" : "MISSED");
    return [`T1 series B's flyer on main's missions ends energy-out on ${THRESH.t1Lo} to ${THRESH.t1Hi} of 60 ${yn(j.t1)}; T2 main's flyer on series B's missions on at most ${THRESH.t2Max} ${yn(j.t2)}; T3 the curve (bin 1 at most ${THRESH.bin1Max}, bin 3 at least ${THRESH.bin3Min}, bin 4 at least ${THRESH.bin4Min}, monotone within ${THRESH.slack}) ${yn(j.t3)} => ${j.verdict}`,
        `E1 each flyer reproduces its stored reference flights: ${yn(j.e1)}`, `E2 T1: ${yn(j.e2)}`, `E3 T2: ${yn(j.e3)}`, `E4 T3's monotone part: ${yn(j.e4)}`, `E5 bin 3 reaches ${THRESH.bin3Min} of 30: ${yn(j.e5)}`,
        `E6 the flyers agree on energy-out against not on at least ${pct(THRESH.agree)} of each set: ${yn(j.e6)}`, `E7 the 2.5 m/s arm ends energy-out on at most ${THRESH.slowMax} of 30 in bins 1 to 3: ${yn(j.e7)}`, `E8 the verdict is SUPPORTED: ${yn(j.e8)}`].join("\n");
}
const readJsonl = (read, file) => { try { return String(read(path.join(ENG, file))).trim().split("\n").filter(Boolean).map((x) => JSON.parse(x)); } catch { return []; } };
/** The drift check: each flyer re-flies the first THRESH.drift stored reference flights of ITS OWN series and must reproduce them (outcome, ticks, path). { ok, checked, bad: [seeds] } */
export function driftCheck(storedMain, storedB, fly = { main: R.flyMain, b: R.flyB }) {
    const refMain = storedMain.filter((r) => r.arm === R.REFERENCE).slice(0, THRESH.drift), refB = storedB.filter((r) => r.arm === R.REFERENCE).slice(0, THRESH.drift), bad = [];
    for (const r of refMain) { const m = MN.missionOf(r.seed); if (!m || !sameFlight(fly.main(m, R.REFERENCE), r)) bad.push("main " + r.seed); }
    for (const r of refB) { const b = SB.missionFor(r.seed); if (b.dropped || !sameFlight(fly.b(b, R.REFERENCE), r)) bad.push("b " + r.seed); }
    return { ok: bad.length === 0 && refMain.length > 0 && refB.length > 0, checked: refMain.length + refB.length, bad };
}
/** The command as a function: returns the exit code (0 fine, 2 a bad argument). `io` is for the gate: { out, err, writeFile, read, exists, fly }. */
export function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync, read = io.read || ((f) => fs.readFileSync(f, "utf8")), exists = io.exists || ((f) => fs.existsSync(f));
    const o = { set: "dev", seeds: null, write: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--write") o.write = true;
        else if (a === "--set") { o.set = argv[++i]; if (!SETS.includes(o.set)) { err(`subReconcileStudy: --set needs one of ${SETS.join(", ")}`); return 2; } }
        else if (a === "--seeds") { const v = Number(argv[++i]); if (!Number.isInteger(v) || v <= 0) { err("subReconcileStudy: --seeds needs a positive whole number"); return 2; } o.seeds = v; }
        else { err(`subReconcileStudy: unknown argument ${JSON.stringify(a)}`); return 2; }
    }
    if (o.write && o.set !== "held13") { err("subReconcileStudy: --write goes with --set held13 only"); return 2; }
    if (o.write && exists(path.join(ENG, OUT))) { err(`subReconcileStudy: ${OUT} exists: HELD13 is read once and is not flown again`); return 2; }
    const lim = (xs) => (o.seeds ? xs.slice(0, o.seeds) : xs), flyers = io.fly || { main: R.flyMain, b: R.flyB };
    const mainMissions = lim([...MN.HELD83].map((s) => MN.missionOf(s)).filter(Boolean)), bMissions = lim([...SB.HELD10].map((s) => SB.missionFor(s)).filter((m) => !m.dropped));
    out(`${o.set.toUpperCase()}: PART A ${mainMissions.length} of main's missions by series B's flyer and ${bMissions.length} of series B's by main's, the reference arm; PART B ${R.BINS.length} chord bins of ${o.seeds || R.PER_BIN}, the reference and the 2.5 m/s arm`);
    const rowsA1 = mainMissions.map((m) => R.flyBOnMain(m)), rowsA2 = bMissions.map((b) => R.flyMainOnB(b)), rowsB = [], binInfo = [];
    for (let bin = 0; bin < R.BINS.length; bin++) {
        const bm = R.binMissions(bin), placed = o.seeds ? bm.placed.slice(0, o.seeds) : bm.placed;
        binInfo.push({ bin: bin + 1, window: bm.window, placed: placed.length, skipped: bm.skipped.length, short: bm.short });
        for (const b of placed) for (const arm of [R.REFERENCE, R.SLOW]) rowsB.push({ bin: bin + 1, ...flyers.b(b, arm) });
    }
    const A1 = summarize(rowsA1), A2 = summarize(rowsA2), refBins = [1, 2, 3, 4].map((k) => summarize(rowsB.filter((r) => r.bin === k && r.arm === R.REFERENCE))), slowBins = [1, 2, 3, 4].map((k) => summarize(rowsB.filter((r) => r.bin === k && r.arm === R.SLOW)));
    const storedMain = readJsonl(read, STORED_MAIN), storedB = readJsonl(read, STORED_B), drift = driftCheck(storedMain, storedB, flyers);
    const agree = { a1: agreement(rowsA1, storedMain.filter((r) => r.arm === R.REFERENCE)).fraction, a2: agreement(rowsA2, storedB.filter((r) => r.arm === R.REFERENCE)).fraction };
    const j = judge({ a1: A1, a2: A2, bins: refBins, slow: slowBins, agree, drift: drift.ok });
    out(""); out(table(A1, A2, refBins, slowBins, `battery 3.0 MJ; cruise break-even chord ${R.breakEvenChord(SB.joulesPerMetre(3.0), 1.21, 3e6).toFixed(0)} m (J/m ${SB.joulesPerMetre(3.0).toFixed(0)}, path over chord 1.21)`));
    out(""); out(`bins: ${binInfo.map((b) => `${b.bin} [${b.window[0]},${b.window[1]}) placed ${b.placed} skipped ${b.skipped}${b.short ? " SHORT" : ""}`).join("; ")}`);
    out(`drift check: ${drift.ok ? "both flyers reproduce their stored reference flights" : "NOT REPRODUCED " + drift.bad.join(", ")} (${drift.checked} flights)`);
    out(`per-mission agreement on energy-out against not: A1 ${pct(agree.a1)}, A2 ${pct(agree.a2)}`);
    out(""); out(verdictText(j));
    if (o.write) { const rows = [...rowsA1.map((r) => ({ set: o.set, part: "A1", ...r })), ...rowsA2.map((r) => ({ set: o.set, part: "A2", ...r })), ...rowsB.map((r) => ({ set: o.set, part: "B", ...r }))]; writeFile(path.join(ENG, OUT), rows.map((r) => JSON.stringify(r)).join("\n") + "\n"); out(`wrote ${rows.length} flights to ${OUT}`); }
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = command(process.argv.slice(2));
