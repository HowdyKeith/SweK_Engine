// WebGLEngine/tools/ship/takeSeekerEccm.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is brain/SUB_ECCM_WIP.md, the gate brain/subEccm-selfcheck.mjs)
//   node tools/ship/takeSeekerEccm.mjs dev  [--set smoke|dev] [--write]      the calibration: the six rungs of the ladder, each flown on the DEV geometries (91001 to 91024; `smoke` is geometries 1 to 4), and the rule's choice
//   node tools/ship/takeSeekerEccm.mjs held --rung N [--write]                 the read, flown ONCE for rung N on the HELD geometries (93001 to 93024; Amendment A); --write writes brain/subEccmHeld.json and a second run refuses
// THE QUESTION (brain/SUB_ECCM_WIP.md): with the seeker's two options (lock memory, a decoy classifier that is right with a given chance) is a kit on both boats still a fight, and is a kit on one boat still worth carrying?
// An ARM is a matchup of the default tactician with the countermeasure wrapper (X) against the same (Y), each geometry flown from both seats: `none` (no kit), `both` (the decoy kit on both), `one` (the decoy kit on X only), `all3` (all three on both).
// A rung is PLAYABLE iff with the decoy on both boats a boat is sunk in at least RULE.bothSunk of the duels AND with the decoy on one boat the other is sunk in at least RULE.oneAdvantage of the duels more than the carrier; the task is the first playable rung.
"use strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as D from "../../brain/subDuel.mjs";
import * as T from "../../brain/subTournament.mjs";
import { sideOf, KITS } from "./takeCountermeasures.mjs";

const ENG = fileURLToPath(new URL("../../", import.meta.url));
export const HELD_FILE = "brain/subEccmHeld.json", DEV_FILE = "brain/subEccmDev.json";
export const SETS = Object.freeze({ smoke: Object.freeze({ first: 1, count: 4 }), dev: Object.freeze({ first: 91001, count: 24 }), held: Object.freeze({ first: 93001, count: 24 }) });   // 92001 to 92024 were SPENT by a mistake (brain/SUB_ECCM_WIP.md, Amendment A) and are never read again
export const LADDER = Object.freeze([
    Object.freeze({ rung: 0, lockMemory: false, classifyReject: 0 }), Object.freeze({ rung: 1, lockMemory: true, classifyReject: 0 }), Object.freeze({ rung: 2, lockMemory: false, classifyReject: 0.25 }),
    Object.freeze({ rung: 3, lockMemory: false, classifyReject: 0.5 }), Object.freeze({ rung: 4, lockMemory: false, classifyReject: 0.75 }), Object.freeze({ rung: 5, lockMemory: true, classifyReject: 0.5 }),
]);
export const RULE = Object.freeze({ bothSunk: 0.30, oneAdvantage: 0.25 });
export const ARMS = Object.freeze({ none: Object.freeze({ x: null, y: null }), both: Object.freeze({ x: KITS.decoy, y: KITS.decoy }), one: Object.freeze({ x: KITS.decoy, y: null }), all3: Object.freeze({ x: KITS.all, y: KITS.all }) });

/** The seeker option object of a rung: null for rung 0 (the old seeker, so its flights are the unchanged code's), else a FRESH { lockMemory, classifyReject, stats } (the stats are summed over every duel flown with it). */
export function seekerOf(rung) {
    const L = LADDER[rung]; if (!L) throw new Error(`takeSeekerEccm.seekerOf: no rung ${rung} (0 to ${LADDER.length - 1})`);
    return rung === 0 ? null : { lockMemory: L.lockMemory, classifyReject: L.classifyReject, stats: { rejected: 0, held: 0 } };
}

/** Geometries `first` to `first + count - 1` of the tournament's own kind. */
export const geometriesOf = (set) => T.geometries(SETS[set].count, SETS[set].first);

/**
 * One arm: X against Y on `geos`, both seats each, with `seeker` (null or seekerOf's). Returns { n, sunk (duels in which a boat was sunk), timeouts, xSunk, ySunk, fired, hits, decoysReleased, spentOnDecoys, meanX, seatAWins, stats, fights, fingerprints }.
 */
export function arm(x, y, geos, seeker) {
    const fights = [], fingerprints = [], cm = { decoysReleased: 0, decoyed: 0 }; let fired = 0, hits = 0, seatAWins = 0;
    for (const sc of geos) {
        const a = D.duel(x.side(), sc, { opponent: y.side(), seeker }), b = D.duel(y.side(), sc, { opponent: x.side(), seeker });
        for (const r of [a, b]) { fired += r.fired[0] + r.fired[1]; hits += r.hits[0] + r.hits[1]; if (r.winner === "A") seatAWins++; if (r.cm) { cm.decoysReleased += r.cm.decoysReleased || 0; cm.decoyed += r.cm.decoyed || 0; } fingerprints.push(r.fingerprint); }
        fights.push({ seed: sc.seed, seat: "A", sx: a.score, sy: D.scoreFor(a, "B"), statusX: a.fates[0], statusY: a.fates[1], xKilledY: a.fates[1] === "sunk", yKilledX: a.fates[0] === "sunk", ticks: a.ticks });
        fights.push({ seed: sc.seed, seat: "B", sx: D.scoreFor(b, "B"), sy: b.score, statusX: b.fates[1], statusY: b.fates[0], xKilledY: b.fates[0] === "sunk", yKilledX: b.fates[1] === "sunk", ticks: b.ticks });
    }
    const xSunk = fights.filter((f) => f.yKilledX).length, ySunk = fights.filter((f) => f.xKilledY).length, sunkDuels = fights.filter((f) => f.xKilledY || f.yKilledX).length;
    return { n: fights.length, sunk: sunkDuels, timeouts: fights.length - sunkDuels, xSunk, ySunk, fired, hits, decoysReleased: cm.decoysReleased, spentOnDecoys: cm.decoyed, meanX: fights.reduce((s, f) => s + f.sx, 0) / fights.length, seatAWins, stats: seeker && seeker.stats ? { ...seeker.stats } : null, summary: T.summary(fights), fights, fingerprints };
}

/** The rule: { a, b, ok } for a rung's `both` and `one` arms. */
export function playable(both, one) {
    const a = both.sunk / both.n >= RULE.bothSunk, adv = (one.ySunk - one.xSunk) / one.n, b = adv >= RULE.oneAdvantage;
    return { a, b, ok: a && b, bothShare: both.sunk / both.n, advantage: adv };
}
/** The first playable rung of a list of { rung, play }, or null. */
export const chooseRung = (rows) => { const r = rows.find((x) => x.play.ok); return r ? r.rung : null; };

/** The checks that void a read (a failure and the readings are NOT WEIGHED): [] for none. `arms` is { name: arm result } of one rung; `rung` the rung. */
export function checks(arms, rung) {
    const out = [], L = LADDER[rung];
    for (const [name, a] of Object.entries(arms)) {
        if (![a.meanX, a.fired, a.hits].every(Number.isFinite)) out.push(`the arm ${name} has a non-finite number`);
        if (a.fights.some((f) => !Number.isFinite(f.sx) || !Number.isFinite(f.sy))) out.push(`the arm ${name} has a non-finite score`);
    }
    for (const name of ["none", "both", "all3"]) if (arms[name] && arms[name].summary.edge !== 0) out.push(`the arm ${name} is a side against itself and its edge is ${arms[name].summary.edge}, not exactly 0`);
    const n0 = Object.values(arms)[0].n; if (Object.values(arms).some((a) => a.n !== n0)) out.push("the arms did not fly the same geometries");
    if (arms.both && L.classifyReject > 0 && !(arms.both.stats && arms.both.stats.rejected > 0)) out.push("classifyReject is above 0 and no decoy was recognised in the decoy arm: the mechanism did not fire");
    if (arms.both && L.lockMemory && !(arms.both.stats && arms.both.stats.held > 0)) out.push("lockMemory is on and no look was held in the decoy arm: the mechanism did not fire");
    return out;
}

const pct = (v) => (100 * v).toFixed(0) + "%";
/** The lines of one arm. */
export function armLine(name, a) {
    return `    ${name.padEnd(5)} ${String(a.sunk).padStart(2)}/${a.n} sunk (${pct(a.sunk / a.n).padStart(4)}), ${String(a.timeouts).padStart(2)} timed out; X sunk ${a.xSunk}, Y sunk ${a.ySunk}; torpedoes ${a.fired} fired, ${a.hits} hit; decoys ${a.decoysReleased} released, ${a.spentOnDecoys} torpedoes spent on one; X mean ${a.meanX.toFixed(3)}; seat A won ${a.seatAWins}${a.stats ? `; recognised ${a.stats.rejected}, held ${a.stats.held}` : ""}`;
}

/** The DEV calibration over `set` ("smoke" or "dev"): every rung, the arms none, both and one; returns { set, rows: [{ rung, arms, play, checks }], chosen }. */
export function calibrate(set = "dev", rungs = LADDER.map((l) => l.rung), onRung = null) {
    const geos = geometriesOf(set), rows = [];
    for (const rung of rungs) {
        const arms = {}; for (const k of ["none", "both", "one"]) arms[k] = arm(sideOf("X", ARMS[k].x), sideOf("Y", ARMS[k].y), geos, seekerOf(rung));
        const row = { rung, arms, play: playable(arms.both, arms.one), checks: checks({ none: arms.none, both: arms.both }, rung) }; rows.push(row); if (onRung) onRung(row);
    }
    return { set, rows, chosen: chooseRung(rows) };
}
/** The HELD read for one rung: the arms none, both, one, all3 at that rung, and `both` at rung 0 (the collapse's reference). */
export function readHeld(rung, set = "held") {
    const geos = geometriesOf(set), arms = {};
    for (const k of ["none", "both", "one", "all3"]) arms[k] = arm(sideOf("X", ARMS[k].x), sideOf("Y", ARMS[k].y), geos, seekerOf(rung));
    arms.bothOld = arm(sideOf("X", ARMS.both.x), sideOf("Y", ARMS.both.y), geos, null);
    return { rung, set: "held", arms, play: playable(arms.both, arms.one), checks: checks({ none: arms.none, both: arms.both, all3: arms.all3 }, rung) };
}

const strip = (a) => { const { fights, fingerprints, summary, ...rest } = a; return { ...rest, edge: summary.edge }; };
/** The command: argv (after the program), io { log, exists, write } (defaults to the console and the file system). Returns the exit code. */
export function command(argv, io = {}) {
    const log = io.log || ((s) => console.log(s)), exists = io.exists || ((f) => fs.existsSync(ENG + f)), write = io.write || ((f, s) => fs.writeFileSync(ENG + f, s));
    const mode = argv[0], flag = (n) => { const i = argv.indexOf(n); return i < 0 ? null : argv[i + 1]; };
    if (mode !== "dev" && mode !== "held") { log("usage: takeSeekerEccm.mjs dev [--set smoke|dev] [--write] | held --rung N [--write]"); return 2; }
    if (mode === "dev") {
        const set = flag("--set") || "dev"; if (set !== "smoke" && set !== "dev") { log(`takeSeekerEccm: --set is smoke or dev, not "${set}" (the HELD set is read by the held command, once)`); return 2; }
        if (argv.includes("--write") && set !== "dev") { log("takeSeekerEccm: --write is for the dev set"); return 2; }
        log(`[takeSeekerEccm] DEV calibration, set ${set} (geometries ${SETS[set].first} to ${SETS[set].first + SETS[set].count - 1}, both seats: ${2 * SETS[set].count} duels an arm); the rule: both-kit sunk >= ${pct(RULE.bothSunk)} and one-kit advantage >= ${pct(RULE.oneAdvantage)}`);
        const res = calibrate(set, undefined, (row) => {
            const L = LADDER[row.rung]; log(`  RUNG ${row.rung}  lockMemory ${L.lockMemory ? "on" : "off"}, classifyReject ${L.classifyReject}`);
            for (const k of ["none", "both", "one"]) log(armLine(k, row.arms[k]));
            log(`    rule: both-kit sunk ${pct(row.play.bothShare)} (${row.play.a ? "ok" : "short"}); one-kit advantage ${pct(row.play.advantage)} (${row.play.b ? "ok" : "short"})  ->  ${row.play.ok ? "PLAYABLE" : "not playable"}${row.checks.length ? "   CHECKS FAILED, NOT WEIGHED: " + row.checks.join("; ") : ""}`);
        });
        log(res.chosen === null ? "  RESULT: no rung of the ladder is playable; the read is not flown and the ladder is not extended in this note" : `  RESULT: the task is rung ${res.chosen} (the first playable one)`);
        if (argv.includes("--write")) { write(DEV_FILE, JSON.stringify({ set, chosen: res.chosen, rule: RULE, rows: res.rows.map((r) => ({ rung: r.rung, play: r.play, checks: r.checks, arms: Object.fromEntries(Object.entries(r.arms).map(([k, a]) => [k, strip(a)])) })) }, null, 1) + "\n"); log(`  written ${DEV_FILE}`); }
        return res.rows.some((r) => r.checks.length) ? 1 : 0;
    }
    const rung = Number(flag("--rung")); if (!Number.isInteger(rung) || rung < 0 || rung >= LADDER.length) { log(`takeSeekerEccm: held needs --rung N, N one of 0 to ${LADDER.length - 1}`); return 2; }
    if (argv.includes("--write") && exists(HELD_FILE)) { log(`takeSeekerEccm: ${HELD_FILE} exists; the HELD set is read once and a second read is refused`); return 2; }
    if (!io.heldSet && !argv.includes("--write")) { log("takeSeekerEccm: the HELD set is read once and the read is recorded; run held with --write (Amendment A: an unrecorded run spent a set once)"); return 2; }
    const hs = io.heldSet || "held", r = readHeld(rung, hs), L = LADDER[rung];   // io.heldSet is for the gate: it flies the smoke geometries, never the HELD set
    log(`[takeSeekerEccm] HELD read, rung ${rung} (lockMemory ${L.lockMemory ? "on" : "off"}, classifyReject ${L.classifyReject}), geometries ${SETS[hs].first} to ${SETS[hs].first + SETS[hs].count - 1}, both seats`);
    for (const k of ["none", "both", "one", "all3", "bothOld"]) log(armLine(k === "bothOld" ? "old" : k, r.arms[k]) + (k === "bothOld" ? "   (rung 0 seeker, the decoy on both: the collapse's reference)" : ""));
    log(`    rule at this rung: both-kit sunk ${pct(r.play.bothShare)}, one-kit advantage ${pct(r.play.advantage)}  ->  ${r.play.ok ? "PLAYABLE" : "not playable"}${r.checks.length ? "\n    CHECKS FAILED, NOT WEIGHED: " + r.checks.join("; ") : ""}`);
    if (argv.includes("--write")) { write(HELD_FILE, JSON.stringify({ rung, set: hs, rule: RULE, play: r.play, checks: r.checks, arms: Object.fromEntries(Object.entries(r.arms).map(([k, a]) => [k, strip(a)])) }, null, 1) + "\n"); log(`  written ${HELD_FILE}`); }
    return r.checks.length ? 1 : 0;
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) process.exit(command(process.argv.slice(2)));
}
