// WebGLEngine/tools/ship/takeEvadeOpponent.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is brain/SUB_EVADE_OPPONENT_WIP.md, the gate tools/ship/takeEvadeOpponent-selfcheck.mjs)
//   node tools/ship/takeEvadeOpponent.mjs smoke                 the matchups on geometries 1 to 4; never recorded, free to read: the command runs
//   node tools/ship/takeEvadeOpponent.mjs dev  [--write]        the DEV read on geometries 104001 to 104024; --write records brain/subEvadeOpponentDev.json once; DEV decides whether HELD is spent (rule R0)
//   node tools/ship/takeEvadeOpponent.mjs held --write          the HELD read on geometries 105001 to 105024, flown ONCE: refuses without a recorded DEV that replicates, refuses without --write, refuses if brain/subEvadeOpponentHeld.json exists
// THE QUESTION (brain/SUB_EVADE_OPPONENT_WIP.md): is the evade doctrine's edge about generation 0 (G), or does it beat other tacticians as well; is it the evade numbers (the grafts) that do it against them; and what happens when the doctrine meets itself?
// The sides: G; for each of the five named finders U (the finder), GT (G with the finder's evade triple) and GN (G with its evadeTurn); the opponents hand (THETA_DEFAULT), champ (brain/subTacticsThetaWip.json) and league7000 (its final generation), all the PD autopilot, no weights.
// 70 MATCHUPS: the five U against G (R0), the 15 arms against the 3 opponents (45), G against each opponent (3, the baseline), the ten pairs of U finders against each other (the mirror), and the checks' own: G against a copy (1), each U against a copy (5), one mirror pair flown both ways (1).
// An arm BEATS an opponent at an edge of at least 0.5 with z of at least 2 and ADDS over G at a paired mean of at least 0.5 with z of at least 2 (its per-geometry edge over the opponent less G's). The labels, R0, M1 and M2 are rulesOf.
"use strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as T from "../../brain/subTournament.mjs";
import * as TA from "../../brain/subTactics.mjs";
import { loadRuns, decided, median, signed, FIND_EDGE, FIND_Z } from "./takeSubLeague.mjs";
import { rowOf, labelOf, armsOf as turnArmsOf, FINDERS, MIN_REPLICATE } from "./takeEvadeTurn.mjs";

const ENG = fileURLToPath(new URL("../../", import.meta.url));
export const DEV_FILE = "brain/subEvadeOpponentDev.json", HELD_FILE = "brain/subEvadeOpponentHeld.json", THETA_FILE = "brain/subTacticsThetaWip.json";
export const SETS = Object.freeze({ smoke: Object.freeze({ first: 1, count: 4 }), dev: Object.freeze({ first: 104001, count: 24 }), held: Object.freeze({ first: 105001, count: 24 }) });
export const OPPONENTS = Object.freeze(["hand", "champ", "league7000"]), KINDS = Object.freeze(["U", "GT", "GN"]), ODD = "league7103", STRONG = Object.freeze(FINDERS.filter((f) => f !== ODD));
export const ADD_EDGE = FIND_EDGE, ADD_Z = FIND_Z;

const f3 = (v) => signed(v, 3);

/** The three opponents' sides from the loaded runs and the tuned-theta file's parsed JSON: { hand, champ, league7000 } each { id, theta } (clampTheta'd), or null when the file has no theta. */
export function opponentsOf(runs, thetaFile) {
    if (!thetaFile || !thetaFile.theta) return null;
    return { hand: { id: "hand", theta: TA.clampTheta(TA.THETA_DEFAULT) }, champ: { id: "champ", theta: TA.clampTheta(thetaFile.theta) }, league7000: { id: "league7000", theta: { ...runs.find((r) => r.id === "league7000").final } } };
}

/** The 15 arms (U, GT, GN for each finder) from G and the finders: the evade-turn command's own arms of those three kinds, in the order U, GT, GN a finder. */
export function armsOf(G, finders) {
    return turnArmsOf(G, finders).filter((a) => KINDS.includes(a.kind));
}

/** The per-geometry edge of a matchup's fights: for each geometry the mean of the two seats' score differences. */
export const perGeometry = (fights) => { const out = []; for (let i = 0; i + 1 < fights.length; i += 2) out.push(((fights[i].sx - fights[i].sy) + (fights[i + 1].sx - fights[i + 1].sy)) / 2); return out; };

/** The paired difference of two per-geometry vectors: { mean, se, z, adds } (adds iff mean >= ADD_EDGE and z >= ADD_Z). */
export function pairedStats(a, b) {
    const d = a.map((v, i) => v - b[i]), n = d.length, mean = d.reduce((s, v) => s + v, 0) / n, sd = n > 1 ? Math.sqrt(d.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)) : 0, se = sd / Math.sqrt(n);
    const z = se > 0 ? mean / se : (mean > 0 ? Infinity : mean < 0 ? -Infinity : 0);
    return { mean, se, z, adds: mean >= ADD_EDGE && z >= ADD_Z };
}

/** Flies everything on a set ("smoke", "dev" or "held"): rows (the five U against G with kind "UvG", G against each opponent kind "G", the arms against each opponent, the ten mirror pairs kind "mirror") and what the checks need: `identity` (G against a copy), `selfs` (each U against a copy) and `flip` (one mirror pair flown both ways). */
export function fly(arms, G, opponents, finders, setName, opts = {}) {
    const geos = T.geometries(SETS[setName].count, SETS[setName].first), side = (id, theta) => T.makeSide(id, { theta }), g = side("G", G);
    const run = (x, y) => T.matchup(x, y, geos, opts), rows = [], U = (f) => arms.find((a) => a.id === `U:${f}`);
    for (const f of FINDERS) rows.push({ ...rowOf({ id: `U:${f}@G`, kind: "UvG", finder: f }, run(side(`U:${f}`, U(f).theta), g), geos), opponent: "G" });
    const base = {};
    for (const o of OPPONENTS) { const m = run(g, side(o, opponents[o].theta)); base[o] = perGeometry(m.fights); rows.push({ ...rowOf({ id: `G@${o}`, kind: "G", finder: "G" }, m, geos), opponent: o }); }
    for (const k of KINDS) for (const o of OPPONENTS) for (const f of FINDERS) {
        const a = arms.find((x) => x.id === `${k}:${f}`), m = run(side(a.id, a.theta), side(o, opponents[o].theta));
        rows.push({ ...rowOf({ id: `${k}:${f}@${o}`, kind: k, finder: f }, m, geos), opponent: o, add: pairedStats(perGeometry(m.fights), base[o]) });
    }
    for (let i = 0; i < FINDERS.length; i++) for (let j = i + 1; j < FINDERS.length; j++) rows.push({ ...rowOf({ id: `M:${FINDERS[i]}|${FINDERS[j]}`, kind: "mirror", finder: FINDERS[i] }, run(side(`U:${FINDERS[i]}`, U(FINDERS[i]).theta), side(`U:${FINDERS[j]}`, U(FINDERS[j]).theta)), geos), opponent: FINDERS[j] });
    const selfs = {}; for (const f of FINDERS) selfs[f] = run(side(`U:${f}`, U(f).theta), side(`U:${f}:copy`, U(f).theta)).summary.edge;
    const a0 = FINDERS[0], b0 = FINDERS[1];
    return { rows, identity: { edge: run(g, side("G:copy", G)).summary.edge }, selfs, flip: { forward: rows.find((r) => r.id === `M:${a0}|${b0}`).edge, reverse: run(side(`U:${b0}`, U(b0).theta), side(`U:${a0}`, U(a0).theta)).summary.edge } };
}

/** The checks that VOID the read, by name and not weighed. ctx { rows, arms, opponents, identity, selfs, flip, G, runs, count }. */
export function checksOf({ rows, arms, opponents, identity, selfs, flip, G, runs, count }) {
    const c = [], clamps = (t) => TA.THETA_NAMES.every((k) => TA.clampTheta(t)[k] === t[k]);
    if (rows.some((r) => r.flew !== 2 * count || !r.seedsOk)) c.push("a matchup did not fly the same geometries");
    if (rows.some((r) => !Number.isFinite(r.edge) || !Number.isFinite(r.z) || (r.add && (!Number.isFinite(r.add.mean) || !Number.isFinite(r.add.z))))) c.push("a score is non-finite");
    if (!arms.every((a) => clamps(a.theta)) || !OPPONENTS.every((o) => clamps(opponents[o].theta))) c.push("a side has a theta that clampTheta changes");
    if (runs.some((r) => JSON.stringify(r.gen0) !== JSON.stringify(G))) c.push("a run's generation 0 is not G");
    if (identity.edge !== 0) c.push(`G against a copy of itself has an edge of ${identity.edge}, not exactly 0`);
    if (FINDERS.some((f) => selfs[f] !== 0)) c.push("a finder against a copy of itself has an edge that is not exactly 0");
    if (flip.forward + flip.reverse !== 0) c.push(`a mirror pair flown both ways has edges ${flip.forward} and ${flip.reverse}, not exact opposites`);
    return c;
}

/** The edge and z of finder a over finder b from the mirror rows (flipping the row of the pair flown the other way): { edge, z } or null. */
export function mirrorEdge(rows, a, b) {
    const x = rows.find((r) => r.kind === "mirror" && r.finder === a && r.opponent === b), y = rows.find((r) => r.kind === "mirror" && r.finder === b && r.opponent === a);
    return x ? { edge: x.edge, z: x.z } : y ? { edge: -y.edge, z: -y.z } : null;
}

/** R0, the 18 labels (kind x opponent x BEAT / ADD, each YES / NO / PARTIAL / n/a over F'), the summary a kind, M1, M2 and the forecast quantities from the rows. */
export function rulesOf(rows, finders = FINDERS) {
    const get = (kind, f, o) => rows.find((r) => r.kind === kind && r.finder === f && r.opponent === o), uvg = (f) => rows.find((r) => r.kind === "UvG" && r.finder === f);
    const fprime = finders.filter((f) => !!uvg(f) && uvg(f).finds), n = fprime.length, labels = {}, summary = {};
    for (const k of KINDS) {
        labels[k] = {};
        for (const o of OPPONENTS) { const cb = fprime.filter((f) => get(k, f, o).finds).length, ca = fprime.filter((f) => get(k, f, o).add.adds).length; labels[k][o] = { beat: { count: cb, label: labelOf(cb, n, "YES", "NO") }, add: { count: ca, label: labelOf(ca, n, "YES", "NO") } }; }
        summary[k] = { beats: OPPONENTS.filter((o) => labels[k][o].beat.label === "YES").length, adds: OPPONENTS.filter((o) => labels[k][o].add.label === "YES").length };
    }
    const strongPairs = []; for (let i = 0; i < STRONG.length; i++) for (let j = i + 1; j < STRONG.length; j++) strongPairs.push(mirrorEdge(rows, STRONG[i], STRONG[j]));
    const overOdd = STRONG.map((f) => mirrorEdge(rows, f, ODD)), m1 = strongPairs.every((e) => !!e && !decided(e)), m2 = overOdd.filter((e) => !!e && e.edge >= ADD_EDGE && e.z >= ADD_Z).length >= 3;
    const medU = { G: median(finders.map((f) => uvg(f).edge)) }; for (const o of OPPONENTS) medU[o] = median(finders.map((f) => get("U", f, o).edge));
    const L = (k, o, m) => labels[k][o][m].label === "YES";
    const forecast = { uBeat: OPPONENTS.map((o) => L("U", o, "beat")), uAdd: OPPONENTS.map((o) => L("U", o, "add")), withinHalf: OPPONENTS.every((o) => Math.abs(medU[o] - medU.G) <= 0.5), gtBeatChamp: L("GT", "champ", "beat"), gnBeatChamp: L("GN", "champ", "beat"), gnAddChamp: L("GN", "champ", "add"), m1, m2 };
    return { n, fprime, replicates: n >= MIN_REPLICATE, labels, summary, m1, m2, medU, forecast };
}

/** The report of a read, one string a line. */
export function reportLines(rows, rules, name, finders = FINDERS) {
    const S = SETS[name], L = [], get = (kind, f, o) => rows.find((r) => r.kind === kind && r.finder === f && r.opponent === o), yn = (b) => (b ? "yes" : "no");
    L.push(`[takeEvadeOpponent] ${name} read: geometries ${S.first} to ${S.first + S.count - 1}, both seats (${2 * S.count} duels a matchup); the finders and the grafts against ${OPPONENTS.join(", ")} (the PD autopilot, no weights); BEATS at edge >= ${FIND_EDGE} and z >= ${FIND_Z}; ADDS over G at a paired mean >= ${ADD_EDGE} and z >= ${ADD_Z} (the arm's per-geometry edge over the opponent less G's)`);
    const line = (a) => `    ${a.id.padEnd(30)} edge ${f3(a.edge)} +- ${a.se.toFixed(3)} (z ${a.z.toFixed(1)}), ${a.winsX}-${a.draws}-${a.winsY}  ${a.finds ? "BEATS" : "does not"}${a.add ? `   ${a.add.adds ? "ADDS" : "no add"} ${f3(a.add.mean)} (z ${a.add.z.toFixed(1)})` : ""}   seat A ${f3(a.seatA)}, seat B ${f3(a.seatB)}`;
    L.push("  G, the baseline, against each opponent");
    for (const o of OPPONENTS) { const r = rows.find((x) => x.kind === "G" && x.opponent === o); if (r) L.push(line(r)); }
    L.push("  U against G (R0)");
    for (const f of finders) { const r = rows.find((x) => x.kind === "UvG" && x.finder === f); if (r) L.push(line(r)); }
    for (const k of KINDS) for (const o of OPPONENTS) { L.push(`  ${k} against ${o}`); for (const f of finders) { const r = get(k, f, o); if (r) L.push(line(r)); } }
    const lb = rules.labels, n = rules.n;
    L.push(`  R0 REPLICATES: ${n} of ${finders.length} unmodified finders find against G (at least ${MIN_REPLICATE} needed): ${rules.replicates ? "yes" : "NO"}`);
    for (const k of KINDS) for (const o of OPPONENTS) L.push(`  ${k} BEATS ${o}: ${lb[k][o].beat.count} of ${n}  ->  ${lb[k][o].beat.label};  ADDS over G: ${lb[k][o].add.count} of ${n}  ->  ${lb[k][o].add.label}`);
    for (const k of KINDS) L.push(`  ${k}: beats ${rules.summary[k].beats} of ${OPPONENTS.length} opponents, adds over G against ${rules.summary[k].adds} of ${OPPONENTS.length}`);
    L.push("  MIRROR, the finders against each other (the first side's edge)");
    for (const r of rows.filter((x) => x.kind === "mirror")) L.push(`    ${r.id.padEnd(38)} edge ${f3(r.edge)} +- ${r.se.toFixed(3)} (z ${r.z.toFixed(1)}), ${r.winsX}-${r.draws}-${r.winsY}  ${decided(r) ? "decided" : "not decided"}   seat A ${f3(r.seatA)}, seat B ${f3(r.seatB)}`);
    L.push(`  M1 THE STRONG FOUR ARE ALIKE: ${yn(rules.m1)}`);
    L.push(`  M2 ${ODD} LOSES TO THE STRONG FOUR: ${yn(rules.m2)}`);
    const q = rules.forecast;
    L.push(`  MEDIAN U EDGE over G ${f3(rules.medU.G)}, ${OPPONENTS.map((o) => `over ${o} ${f3(rules.medU[o])}`).join(", ")}`);
    L.push(`  FORECAST QUANTITIES: U BEATS ${OPPONENTS.map((o, i) => `${o} ${yn(q.uBeat[i])}`).join(", ")}; U ADDS ${OPPONENTS.map((o, i) => `${o} ${yn(q.uAdd[i])}`).join(", ")}; U edges within 0.5 of the edge over G ${yn(q.withinHalf)}; GT BEATS champ ${yn(q.gtBeatChamp)}; GN BEATS champ ${yn(q.gnBeatChamp)}; GN ADDS champ ${yn(q.gnAddChamp)}; M1 ${yn(q.m1)}; M2 ${yn(q.m2)}`);
    return L;
}

const readJson = (f) => (fs.existsSync(ENG + f) ? JSON.parse(fs.readFileSync(ENG + f, "utf8")) : null);

/** The command: argv (after the program), io { log, exists, write, read, fly, devSet, heldSet } (defaults: the console and the file system; `read(path)` gives parsed JSON or null; `fly` replaces the flying and `devSet` / `heldSet` name a smaller set to fly in the DEV / HELD mode, all for the gate, which never flies 104001 to 105024). Returns the exit code. */
export function command(argv, io = {}) {
    const log = io.log || ((s) => console.log(s)), exists = io.exists || ((f) => fs.existsSync(ENG + f)), write = io.write || ((f, s) => fs.writeFileSync(ENG + f, s)), read = io.read || readJson, flyIt = io.fly || fly;
    const mode = argv[0];
    if (mode !== "smoke" && mode !== "dev" && mode !== "held") { log("usage: takeEvadeOpponent.mjs smoke | dev [--write] | held --write"); return 2; }
    for (const a of argv.slice(1)) if (a !== "--write") { log(`takeEvadeOpponent: unknown argument ${a}`); return 2; }
    const wr = argv.includes("--write");
    if (mode === "smoke" && wr) { log("takeEvadeOpponent: smoke is never recorded"); return 2; }
    if (mode === "dev" && wr && exists(DEV_FILE)) { log(`takeEvadeOpponent: ${DEV_FILE} exists; DEV is recorded once and a second record is refused`); return 2; }
    if (mode === "held" && !wr && !io.heldSet) { log("takeEvadeOpponent: the HELD set is read once and the read is recorded; run held with --write"); return 2; }
    if (mode === "held" && wr && exists(HELD_FILE)) { log(`takeEvadeOpponent: ${HELD_FILE} exists; the HELD set is read once and a second read is refused`); return 2; }
    if (mode === "held") {
        const dev = read(DEV_FILE);
        if (!dev) { log(`takeEvadeOpponent: ${DEV_FILE} is missing; HELD is flown only after DEV is recorded`); return 2; }
        if (dev.set !== "dev" || !dev.rules || dev.rules.replicates !== true) { log("takeEvadeOpponent: DEV did not replicate (R0) or is not a DEV record; HELD is not flown by this registration"); return 2; }
    }
    const L = loadRuns(io.read); if (L.error) { log("takeEvadeOpponent: " + L.error); return 2; }
    const opponents = opponentsOf(L.runs, read(THETA_FILE)); if (!opponents) { log(`takeEvadeOpponent: ${THETA_FILE} is missing or has no theta`); return 2; }
    const finders = FINDERS.map((id) => L.runs.find((r) => r.id === id));   // loadRuns refuses unless every one of the twelve runs (and so all five finders) exists
    const G = L.runs[0].gen0, name = mode === "smoke" ? "smoke" : mode === "dev" ? (io.devSet || "dev") : (io.heldSet || "held"), arms = armsOf(G, finders);
    const flown = flyIt(arms, G, opponents, finders, name), rules = rulesOf(flown.rows), checks = checksOf({ rows: flown.rows, arms, opponents, identity: flown.identity, selfs: flown.selfs, flip: flown.flip, G, runs: L.runs, count: SETS[name].count });
    for (const l of reportLines(flown.rows, rules, name)) log(l);
    if (checks.length) log("  CHECKS FAILED, NOT WEIGHED: " + checks.join("; "));
    if (mode === "dev") log(rules.replicates ? "  DEV: R0 holds; HELD may be flown (node tools/ship/takeEvadeOpponent.mjs held --write)" : "  DEV: R0 FAILS; HELD is NOT flown by this registration");
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
