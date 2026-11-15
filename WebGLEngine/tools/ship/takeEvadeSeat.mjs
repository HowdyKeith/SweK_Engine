// WebGLEngine/tools/ship/takeEvadeSeat.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is brain/SUB_EVADE_SEAT_WIP.md, the gate tools/ship/takeEvadeSeat-selfcheck.mjs)
//   node tools/ship/takeEvadeSeat.mjs smoke                 the 17 sides against themselves on geometries 1 to 4; never recorded, free to read: the command runs
//   node tools/ship/takeEvadeSeat.mjs dev  [--write]        the DEV read on geometries 106001 to 106024; --write records brain/subEvadeSeatDev.json once; DEV decides whether HELD is spent (rule R0)
//   node tools/ship/takeEvadeSeat.mjs held --write          the HELD read on geometries 107001 to 107024, flown ONCE: refuses without a recorded DEV that holds R0, refuses without --write, refuses if brain/subEvadeSeatHeld.json exists
// THE QUESTION (brain/SUB_EVADE_SEAT_WIP.md): does the evade doctrine reverse the seat in a MIRROR (a side flown against ITSELF does better from the seat that starts behind), and which of its numbers do it?
// 17 SIDES, each flown against itself on every geometry (subTournament.seatBias's measure: seat A's score less seat B's, one duel a geometry): G; for league7001 and league7103 the unmodified finder U and the seven cells of G with some of its numbers (S, T, N, ST, SN, TN, STN, as in takeEvadeSplit.mjs).
// A side is SEAT-A at a mean of at least +0.5 with z of at least +2, REVERSED at -0.5 and -2 or less, NEUTRAL otherwise. R0, R1 to R6 and the headline are rulesOf. The sunk boats of each seat are counted from the same duels (`fates`).
"use strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as D from "../../brain/subDuel.mjs";
import * as T from "../../brain/subTournament.mjs";
import * as TA from "../../brain/subTactics.mjs";
import { loadRuns, signed } from "./takeSubLeague.mjs";
import { graft } from "./takeEvadeTurn.mjs";
import { CELL_KEYS, CELLS } from "./takeEvadeSplit.mjs";

const ENG = fileURLToPath(new URL("../../", import.meta.url));
export const DEV_FILE = "brain/subEvadeSeatDev.json", HELD_FILE = "brain/subEvadeSeatHeld.json";
export const SETS = Object.freeze({ smoke: Object.freeze({ first: 1, count: 4 }), dev: Object.freeze({ first: 106001, count: 24 }), held: Object.freeze({ first: 107001, count: 24 }) });
export const FINDERS = Object.freeze(["league7001", "league7103"]), STRONG = "league7001", ODD = "league7103";
export const BIAS = 0.5, MIN_Z = 2, G_BIAS = 3.35, G_TOLERANCE = 2.0;   // 1.0 until Amendment C of the seat note (dated after the DEV read, before any HELD geometry)

const f3 = (v) => signed(v, 3);

/** The 17 sides from G (a theta) and the two finders ([{ id, final }]): { id, kind ("G", "U" or a cell), finder, theta }, G first, then for each finder U and the seven cells in the order of takeEvadeSplit's CELLS. */
export function sidesOf(G, finders) {
    const sides = [{ id: "G", kind: "G", finder: null, theta: { ...G } }];
    for (const id of FINDERS) {
        const f = finders.find((x) => x.id === id);
        sides.push({ id: `U:${id}`, kind: "U", finder: id, theta: { ...f.final } });
        for (const c of CELLS) sides.push({ id: `${c}:${id}`, kind: c, finder: id, theta: graft(G, f.final, CELL_KEYS[c]) });
    }
    return sides;
}

/** A side's label from its mean seat bias and z: SEAT-A at +BIAS and +MIN_Z or more, REVERSED at -BIAS and -MIN_Z or less, NEUTRAL otherwise. */
export const labelOf = (mean, z) => (mean >= BIAS && z >= MIN_Z ? "SEAT-A" : mean <= -BIAS && z <= -MIN_Z ? "REVERSED" : "NEUTRAL");

/** z from a mean and its standard error: the mean over the se; infinite in the direction of the mean when the se is 0, and 0 for a mean of 0. */
export const zOf = (mean, se) => (se > 0 ? mean / se : (mean > 0 ? Infinity : mean < 0 ? -Infinity : 0));
/** From the `fates` of each duel ([seat A's, seat B's]): how many had seat A's boat sunk, seat B's boat sunk, both, and neither. */
export function countSunk(fates) {
    const sa = fates.filter((f) => f[0] === "sunk").length, sb = fates.filter((f) => f[1] === "sunk").length, both = fates.filter((f) => f[0] === "sunk" && f[1] === "sunk").length;
    return { sunkA: sa, sunkB: sb, both, neither: fates.length - (sa + sb - both) };
}
/** Is a mean within `tol` of `ref` (at most)? */
export const withinBias = (mean, ref, tol) => Math.abs(mean - ref) <= tol;

/** One side against itself on a set of geometries: { mean, se, n, z, sunkA, sunkB, neither, both } (the mean of seat A's score less seat B's, as subTournament.seatBias; z is `zOf`; the sunk counts are `countSunk` of the duels' fates). */
export function mirror(side, geos, opts = {}) {
    const seconds = opts.seconds || D.SECONDS, v = [], fates = [];
    for (const sc of geos) { const r = D.duel(side.side(), sc, { ...opts, opponent: side.side() }); v.push(r.score - D.scoreFor(r, "B", seconds)); fates.push(r.fates); }
    const n = v.length, mean = v.reduce((a, b) => a + b, 0) / n, sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0, se = sd / Math.sqrt(n), c = countSunk(fates);
    return { mean, se, n, z: zOf(mean, se), sunkA: c.sunkA, sunkB: c.sunkB, both: c.both, neither: c.neither };
}

/** Flies the 17 sides against themselves on a set ("smoke", "dev" or "held"), plus what the checks need: G flown a second time (`again`) and subTournament.seatBias's own figure for G (`reference`). Returns { rows, again: { mean }, reference: { mean } }. */
export function fly(sides, setName, opts = {}) {
    const geos = T.geometries(SETS[setName].count, SETS[setName].first), make = (s) => T.makeSide(s.id, { theta: s.theta });
    const rows = sides.map((s) => { const m = mirror(make(s), geos, opts); return { id: s.id, kind: s.kind, finder: s.finder, ...m, label: labelOf(m.mean, m.z) }; });
    const g = sides.find((s) => s.id === "G");
    return { rows, again: { mean: mirror(make(g), geos, opts).mean }, reference: { mean: T.seatBias(make(g), geos, opts).mean } };
}

/** The checks that VOID the read, by name and not weighed. ctx { rows, sides, again, reference, G, runs }. */
export function checksOf({ rows, sides, again, reference, G, runs }) {
    const c = [], g = rows.find((r) => r.id === "G");
    if (!g || again.mean !== g.mean) c.push("a second flight of G is not the same to the last digit");
    if (!g || reference.mean !== g.mean) c.push("the command's seat bias for G is not subTournament.seatBias's");
    if (rows.some((r) => !Number.isFinite(r.mean) || !Number.isFinite(r.se))) c.push("a mean seat bias is non-finite");
    if (!sides.every((s) => TA.THETA_NAMES.every((k) => TA.clampTheta(s.theta)[k] === s.theta[k]))) c.push("a side has a theta that clampTheta changes");
    if (runs.some((r) => JSON.stringify(r.gen0) !== JSON.stringify(G))) c.push("a run's generation 0 is not G");
    if (g && !withinBias(g.mean, G_BIAS, G_TOLERANCE)) c.push(`G's mirror bias ${g.mean} is not within ${G_TOLERANCE} of +${G_BIAS}`);
    return c;
}

/** R0 to R6, the headline and the forecast quantities from the rows. */
export function rulesOf(rows) {
    const by = (id) => rows.find((r) => r.id === id), lab = (id) => (by(id) ? by(id).label : null), rev = (id) => lab(id) === "REVERSED";
    const r1 = rev(`U:${STRONG}`), r2 = rev(`STN:${STRONG}`), r3 = rev(`N:${STRONG}`), r4 = rev(`SN:${STRONG}`), r5 = rev(`S:${STRONG}`), r6 = !rev(`U:${ODD}`) && !rev(`STN:${ODD}`);
    const headline = r4 && !r3 && r6 ? "THE SPEED IS WHAT REVERSES IT" : r3 ? "THE TURN ALONE REVERSES IT" : r2 && !r3 && !r4 && !r5 ? "THE TRIPLE, AND NO PART OF IT ALONE" : !r2 ? "NOTHING OF THE TRIPLE REVERSES IT" : null;
    const reversed = rows.filter((r) => r.label === "REVERSED"), g = by("G");
    return { replicates: lab("G") === "SEAT-A" && r1, R1: r1, R2: r2, R3: r3, R4: r4, R5: r5, R6: r6, headline, forecast: { reversedSunkMore: reversed.length > 0 && reversed.every((r) => r.sunkA > r.sunkB), gWithinHalf: !!g && withinBias(g.mean, G_BIAS, 0.5) } };
}

/** The report of a read, one string a line. */
export function reportLines(rows, rules, name) {
    const S = SETS[name], L = [], yn = (b) => (b ? "yes" : "no");
    L.push(`[takeEvadeSeat] ${name} read: geometries ${S.first} to ${S.first + S.count - 1}, ${S.count} mirror duels a side (each side against itself, seat A's score less seat B's); SEAT-A at a mean of +${BIAS} or more with z of +${MIN_Z} or more, REVERSED at -${BIAS} and -${MIN_Z} or less`);
    for (const r of rows) L.push(`  ${r.id.padEnd(15)} seat A is worth ${f3(r.mean)} (se ${r.se.toFixed(3)}, z ${r.z.toFixed(1)})  ${r.label.padEnd(8)}  sunk: seat A ${r.sunkA}, seat B ${r.sunkB}, neither ${r.neither}, both ${r.both}`);
    L.push(`  R0 HOLDS: G is SEAT-A and U:${STRONG} is REVERSED: ${rules.replicates ? "yes" : "NO"}`);
    L.push(`  R1 U:${STRONG} REVERSED ${yn(rules.R1)}; R2 STN:${STRONG} ${yn(rules.R2)}; R3 N:${STRONG} (the turn alone) ${yn(rules.R3)}; R4 SN:${STRONG} (speed with the turn) ${yn(rules.R4)}; R5 S:${STRONG} (the speed alone) ${yn(rules.R5)}; R6 ${ODD}: neither U nor STN reversed ${yn(rules.R6)}`);
    L.push(`  HEADLINE: ${rules.headline === null ? "none" : rules.headline}`);
    L.push("  PART A (8 geometries, 97001 to 97008): league7001 -1.873 (se 0.830), G (the search-ping side) +3.368");
    L.push(`  FORECAST QUANTITIES: in every REVERSED side seat A's boat is sunk more often than seat B's ${yn(rules.forecast.reversedSunkMore)}; G's mirror bias within 0.5 of +${G_BIAS} ${yn(rules.forecast.gWithinHalf)}`);
    return L;
}

const readJson = (f) => (fs.existsSync(ENG + f) ? JSON.parse(fs.readFileSync(ENG + f, "utf8")) : null);

/** The command: argv (after the program), io { log, exists, write, read, fly, devSet, heldSet } (defaults: the console and the file system; `read(path)` gives parsed JSON or null; `fly` replaces the flying and `devSet` / `heldSet` name a smaller set to fly in the DEV / HELD mode, all for the gate, which never flies 106001 to 107024). Returns the exit code. */
export function command(argv, io = {}) {
    const log = io.log || ((s) => console.log(s)), exists = io.exists || ((f) => fs.existsSync(ENG + f)), write = io.write || ((f, s) => fs.writeFileSync(ENG + f, s)), read = io.read || readJson, flyIt = io.fly || fly;
    const mode = argv[0];
    if (mode !== "smoke" && mode !== "dev" && mode !== "held") { log("usage: takeEvadeSeat.mjs smoke | dev [--write] | held --write"); return 2; }
    for (const a of argv.slice(1)) if (a !== "--write") { log(`takeEvadeSeat: unknown argument ${a}`); return 2; }
    const wr = argv.includes("--write");
    if (mode === "smoke" && wr) { log("takeEvadeSeat: smoke is never recorded"); return 2; }
    if (mode === "dev" && wr && exists(DEV_FILE)) { log(`takeEvadeSeat: ${DEV_FILE} exists; DEV is recorded once and a second record is refused`); return 2; }
    if (mode === "held" && !wr && !io.heldSet) { log("takeEvadeSeat: the HELD set is read once and the read is recorded; run held with --write"); return 2; }
    if (mode === "held" && wr && exists(HELD_FILE)) { log(`takeEvadeSeat: ${HELD_FILE} exists; the HELD set is read once and a second read is refused`); return 2; }
    if (mode === "held") {
        const dev = read(DEV_FILE);
        if (!dev) { log(`takeEvadeSeat: ${DEV_FILE} is missing; HELD is flown only after DEV is recorded`); return 2; }
        if (dev.set !== "dev" || !dev.rules || dev.rules.replicates !== true) { log("takeEvadeSeat: DEV did not hold R0 or is not a DEV record; HELD is not flown by this registration"); return 2; }
    }
    const L = loadRuns(io.read); if (L.error) { log("takeEvadeSeat: " + L.error); return 2; }
    const finders = FINDERS.map((id) => L.runs.find((r) => r.id === id));   // loadRuns refuses unless every one of the twelve runs exists
    const G = L.runs[0].gen0, name = mode === "smoke" ? "smoke" : mode === "dev" ? (io.devSet || "dev") : (io.heldSet || "held"), sides = sidesOf(G, finders);
    const flown = flyIt(sides, name), rules = rulesOf(flown.rows), checks = checksOf({ rows: flown.rows, sides, again: flown.again, reference: flown.reference, G, runs: L.runs });
    for (const l of reportLines(flown.rows, rules, name)) log(l);
    if (checks.length) log("  CHECKS FAILED, NOT WEIGHED: " + checks.join("; "));
    if (mode === "dev") log(rules.replicates ? "  DEV: R0 holds; HELD may be flown (node tools/ship/takeEvadeSeat.mjs held --write)" : "  DEV: R0 FAILS; HELD is NOT flown by this registration");
    if (wr) {
        const file = mode === "dev" ? DEV_FILE : HELD_FILE;
        write(file, JSON.stringify({ mode, set: name, first: SETS[name].first, count: SETS[name].count, rules, rows: flown.rows, checks }, null, 1) + "\n"); log(`  written ${file}`);
    }
    return checks.length ? 1 : 0;
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) process.exit(command(process.argv.slice(2)));
}
