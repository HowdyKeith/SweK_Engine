// WebGLEngine/tools/ship/takeEvadeTurn.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is brain/SUB_EVADE_WIP.md, the gate tools/ship/takeEvadeTurn-selfcheck.mjs)
//   node tools/ship/takeEvadeTurn.mjs smoke                 the 25 arms on geometries 1 to 4; never recorded, free to read: the command runs
//   node tools/ship/takeEvadeTurn.mjs dev  [--write]        the DEV read on geometries 98001 to 98024; --write records brain/subEvadeDev.json once; DEV decides whether HELD is spent (rule R0)
//   node tools/ship/takeEvadeTurn.mjs held --write          the HELD read on geometries 99001 to 99024, flown ONCE: refuses without a recorded DEV that replicates, refuses without --write, refuses if brain/subEvadeHeld.json exists
// THE QUESTION (brain/SUB_EVADE_WIP.md): is the evade response (evadeSpeed, evadeTime, evadeTurn; then the turn alone) what makes the five named finders beat generation 0 -- SUFFICIENT (put on generation 0 it finds) and NECESSARY (taken off the finder it stops finding)?
// 25 ARMS, each flown against generation 0 (G, the search-ping champion) from both seats by subTournament.matchup, every side a tactician and the PD autopilot: for each finder f, U (f unmodified), GT (G with f's evade triple), LT (f with G's evade triple), GN (G with f's evadeTurn), LN (f with G's evadeTurn).
// An arm FINDS at an edge of at least 0.5 with z of at least 2 (Part B's bar; takeSubLeague.mjs `finds`). R0..R4 and the readings are rulesOf; nothing is searched or tuned: every number in every arm is a number already in a file.
"use strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as T from "../../brain/subTournament.mjs";
import * as TA from "../../brain/subTactics.mjs";
import { loadRuns, finds, median, signed, FIND_EDGE, FIND_Z } from "./takeSubLeague.mjs";

const ENG = fileURLToPath(new URL("../../", import.meta.url));
export const DEV_FILE = "brain/subEvadeDev.json", HELD_FILE = "brain/subEvadeHeld.json";
export const SETS = Object.freeze({ smoke: Object.freeze({ first: 1, count: 4 }), dev: Object.freeze({ first: 98001, count: 24 }), held: Object.freeze({ first: 99001, count: 24 }) });
export const FINDERS = Object.freeze(["league7001", "league7100", "league7103", "exploit7200", "exploit7204"]);
export const TRIPLE = Object.freeze(["evadeSpeed", "evadeTime", "evadeTurn"]), TURN = Object.freeze(["evadeTurn"]);
export const KINDS = Object.freeze(["U", "GT", "LT", "GN", "LN"]);
export const MIN_REPLICATE = 4;

const f3 = (v) => signed(v, 3);
const meanOf = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);

/** `base` with the numbers `keys` taken from `donor`. */
export const graft = (base, donor, keys) => { const o = { ...base }; for (const k of keys) o[k] = donor[k]; return o; };

/** The 25 arms from G (a theta) and the finders ([{ id, final }]): { id: "KIND:finder", kind, finder, theta }, five a finder in the order of KINDS. */
export function armsOf(G, finders) {
    const arms = [];
    for (const f of finders) {
        const make = (kind, theta) => arms.push({ id: `${kind}:${f.id}`, kind, finder: f.id, theta });
        make("U", { ...f.final }); make("GT", graft(G, f.final, TRIPLE)); make("LT", graft(f.final, G, TRIPLE)); make("GN", graft(G, f.final, TURN)); make("LN", graft(f.final, G, TURN));
    }
    return arms;
}

/** The mean of (score of X minus score of Y) over the fights X flew from `seat` ("A" or "B"). */
export const seatEdge = (fights, seat) => meanOf(fights.filter((f) => f.seat === seat).map((f) => f.sx - f.sy));

/** One arm's row from its matchup against G: the paired edge, se, z, wins-draws-losses, whether it FINDS, its edge in each seat, how many fights it flew and whether they were the set's geometries (each seed twice, seat A then B). */
export function rowOf(arm, m, geos) {
    const s = m.summary, want = geos.flatMap((g) => [g.seed, g.seed]);
    return { id: arm.id, kind: arm.kind, finder: arm.finder, edge: s.edge, se: s.se, z: s.z, winsX: s.winsX, draws: s.draws, winsY: s.winsY, finds: finds(s), seatA: seatEdge(m.fights, "A"), seatB: seatEdge(m.fights, "B"), flew: m.fights.length, seedsOk: JSON.stringify(m.fights.map((f) => f.seed)) === JSON.stringify(want) };
}

/** Flies the arms against G on a set ("smoke", "dev" or "held"), plus the two things the checks need: G with its own triple against G (`identity`), and each finder flown directly (`direct`). Returns { rows, identity: { edge }, direct: { finder: { edge, winsX, draws, winsY } } }. */
export function fly(arms, G, finders, setName, opts = {}) {
    const geos = T.geometries(SETS[setName].count, SETS[setName].first), g = T.makeSide("G", { theta: G });
    const run = (id, theta) => T.matchup(T.makeSide(id, { theta }), g, geos, opts);
    const rows = arms.map((a) => rowOf(a, run(a.id, a.theta), geos));
    const identity = { edge: run("identity", graft(G, G, TRIPLE)).summary.edge }, direct = {};
    for (const f of finders) { const s = run(`direct:${f.id}`, f.final).summary; direct[f.id] = { edge: s.edge, winsX: s.winsX, draws: s.draws, winsY: s.winsY }; }
    return { rows, identity, direct };
}

/** The checks that VOID the read, by name and not weighed. ctx { rows, arms, identity, direct, G, runs, count }. */
export function checksOf({ rows, arms, identity, direct, G, runs, count }) {
    const c = [];
    if (rows.some((r) => r.flew !== 2 * count || !r.seedsOk)) c.push("an arm did not fly the same geometries");
    if (rows.some((r) => !Number.isFinite(r.edge) || !Number.isFinite(r.z))) c.push("a score is non-finite");
    if (arms.some((a) => TA.THETA_NAMES.some((k) => TA.clampTheta(a.theta)[k] !== a.theta[k]))) c.push("an arm has a theta that clampTheta changes");
    if (runs.some((r) => JSON.stringify(r.gen0) !== JSON.stringify(G))) c.push("a run's generation 0 is not G");
    if (identity.edge !== 0) c.push(`G with its own evade triple has an edge of ${identity.edge} against G, not exactly 0`);
    if (rows.filter((r) => r.kind === "U").some((r) => { const d = direct[r.finder]; return !d || d.edge !== r.edge || d.winsX !== r.winsX || d.draws !== r.draws || d.winsY !== r.winsY; })) c.push("an unmodified arm differs from its finder flown directly");
    return c;
}

/** "most" is at least n - 1 of n, "few" is at most 1; with fewer than 3 finders the two overlap and the label is not defined (Amendment A of the note). */
export const labelOf = (count, n, yes, no) => (n < 3 ? "n/a" : count >= n - 1 ? yes : count <= 1 ? no : "PARTIAL");

/** What a pair of labels (sufficiency, necessity) of one claim means (the four patterns of section 4 of the note), and what a PARTIAL or an n/a is. */
export function readingOf(suff, nec, both, subject) {
    if (suff === "n/a" || nec === "n/a") return "n/a";
    if (suff === "PARTIAL" || nec === "PARTIAL") return "PARTIAL (not one of the four patterns)";
    if (suff === "SUFFICIENT" && nec === "NECESSARY") return both;
    if (suff === "SUFFICIENT") return `enough, but the finders have other routes (${subject} is redundant)`;
    if (nec === "NECESSARY") return `cannot be left out and is not enough alone (an interaction with the other numbers)`;
    return `neither: shared by chance or by a bound, not by cause`;
}

/** R0 to R4, the readings and the shares from the rows. The finders whose unmodified arm finds are F' (n of them); counts and labels are over F'. */
export function rulesOf(rows, finders = FINDERS) {
    const by = (kind, f) => rows.find((r) => r.kind === kind && r.finder === f);
    const fprime = finders.filter((f) => { const u = by("U", f); return !!u && u.finds; }), n = fprime.length, cnt = (kind, pred) => fprime.filter((f) => pred(by(kind, f))).length;
    const counts = { GT: cnt("GT", (r) => r.finds), LT: cnt("LT", (r) => !r.finds), GN: cnt("GN", (r) => r.finds), LN: cnt("LN", (r) => !r.finds) };
    const labels = { R1: labelOf(counts.GT, n, "SUFFICIENT", "INSUFFICIENT"), R2: labelOf(counts.LT, n, "NECESSARY", "UNNECESSARY"), R3: labelOf(counts.GN, n, "SUFFICIENT", "INSUFFICIENT"), R4: labelOf(counts.LN, n, "NECESSARY", "UNNECESSARY") };
    const readings = { triple: readingOf(labels.R1, labels.R2, "the evade response is where the doctrine lives", "the evade triple"), turn: readingOf(labels.R3, labels.R4, "it is the turn", "the turn") };
    const tripleBoth = labels.R1 === "SUFFICIENT" && labels.R2 === "NECESSARY", turnBoth = labels.R3 === "SUFFICIENT" && labels.R4 === "NECESSARY";
    const headline = turnBoth ? "IT IS THE TURN" : tripleBoth ? "THE TRIPLE, NOT THE TURN ALONE" : null;
    const shares = {}, medianShare = {}, medianEdge = {};
    for (const k of ["GT", "LT", "GN", "LN"]) { shares[k] = fprime.map((f) => by(k, f).edge / by("U", f).edge); medianShare[k] = median(shares[k]); }
    for (const k of KINDS) medianEdge[k] = median(finders.map((f) => by(k, f)).filter(Boolean).map((r) => r.edge));
    return { n, fprime, replicates: n >= MIN_REPLICATE, counts, labels, readings, headline, shares, medianShare, medianEdge };
}

/** The report of a read, one string a line. */
export function reportLines(rows, rules, name, finders = FINDERS) {
    const S = SETS[name], L = [], by = (kind, f) => rows.find((r) => r.kind === kind && r.finder === f);
    L.push(`[takeEvadeTurn] ${name} read: geometries ${S.first} to ${S.first + S.count - 1}, both seats (${2 * S.count} duels an arm); every arm against G, generation 0 (the search-ping champion); an arm FINDS at edge >= ${FIND_EDGE} and z >= ${FIND_Z}`);
    const what = { U: "the finder unmodified", GT: "the finder's evade triple (evadeSpeed, evadeTime, evadeTurn) put on G", LT: "G's evade triple put on the finder", GN: "the finder's evadeTurn put on G", LN: "G's evadeTurn put on the finder" };
    for (const k of KINDS) {
        L.push(`  ${k.padEnd(2)} ${what[k]}`);
        for (const f of finders) { const a = by(k, f); if (a) L.push(`    ${a.id.padEnd(14)} edge ${f3(a.edge)} +- ${a.se.toFixed(3)} (z ${a.z.toFixed(1)}), ${a.winsX}-${a.draws}-${a.winsY}  ${a.finds ? "FINDS" : "does not"}   seat A ${f3(a.seatA)}, seat B ${f3(a.seatB)}`); }
    }
    const n = rules.n, c = rules.counts, lb = rules.labels;
    L.push(`  R0 REPLICATES: ${n} of ${finders.length} unmodified finders find (at least ${MIN_REPLICATE} needed): ${rules.replicates ? "yes" : "NO"}`);
    L.push(`  R1 triple grafted onto G: ${c.GT} of ${n} find  ->  ${lb.R1}`);
    L.push(`  R2 triple lesioned from the finder: ${c.LT} of ${n} stop finding  ->  ${lb.R2}`);
    L.push(`  R3 turn grafted onto G: ${c.GN} of ${n} find  ->  ${lb.R3}`);
    L.push(`  R4 turn lesioned from the finder: ${c.LN} of ${n} stop finding  ->  ${lb.R4}`);
    L.push(`  READING: triple: ${rules.readings.triple}; turn: ${rules.readings.turn}${rules.headline ? `  ==>  ${rules.headline}` : ""}`);
    L.push(`  EDGE SHARES of the finder's own edge (median over the ${n}): GT ${rules.medianShare.GT.toFixed(2)}, LT ${rules.medianShare.LT.toFixed(2)}, GN ${rules.medianShare.GN.toFixed(2)}, LN ${rules.medianShare.LN.toFixed(2)}`);
    L.push(`  MEDIAN EDGE over the five: U ${f3(rules.medianEdge.U)}, GT ${f3(rules.medianEdge.GT)}, LT ${f3(rules.medianEdge.LT)}, GN ${f3(rules.medianEdge.GN)}, LN ${f3(rules.medianEdge.LN)}`);
    return L;
}

const readJson = (f) => (fs.existsSync(ENG + f) ? JSON.parse(fs.readFileSync(ENG + f, "utf8")) : null);

/** The command: argv (after the program), io { log, exists, write, read, fly, devSet, heldSet } (defaults: the console and the file system; `read(path)` gives parsed JSON or null; `fly` replaces the flying and `devSet` / `heldSet` name a smaller set to fly in the DEV / HELD mode, all for the gate, which never flies 98001 to 99024). Returns the exit code. */
export function command(argv, io = {}) {
    const log = io.log || ((s) => console.log(s)), exists = io.exists || ((f) => fs.existsSync(ENG + f)), write = io.write || ((f, s) => fs.writeFileSync(ENG + f, s)), read = io.read || readJson, flyIt = io.fly || fly;
    const mode = argv[0];
    if (mode !== "smoke" && mode !== "dev" && mode !== "held") { log("usage: takeEvadeTurn.mjs smoke | dev [--write] | held --write"); return 2; }
    for (const a of argv.slice(1)) if (a !== "--write") { log(`takeEvadeTurn: unknown argument ${a}`); return 2; }
    const wr = argv.includes("--write");
    if (mode === "smoke" && wr) { log("takeEvadeTurn: smoke is never recorded"); return 2; }
    if (mode === "dev" && wr && exists(DEV_FILE)) { log(`takeEvadeTurn: ${DEV_FILE} exists; DEV is recorded once and a second record is refused`); return 2; }
    if (mode === "held" && !wr && !io.heldSet) { log("takeEvadeTurn: the HELD set is read once and the read is recorded; run held with --write"); return 2; }
    if (mode === "held" && wr && exists(HELD_FILE)) { log(`takeEvadeTurn: ${HELD_FILE} exists; the HELD set is read once and a second read is refused`); return 2; }
    if (mode === "held") {
        const dev = read(DEV_FILE);
        if (!dev) { log(`takeEvadeTurn: ${DEV_FILE} is missing; HELD is flown only after DEV is recorded`); return 2; }
        if (dev.set !== "dev" || !dev.rules || dev.rules.replicates !== true) { log("takeEvadeTurn: DEV did not replicate (R0) or is not a DEV record; HELD is not flown by this registration"); return 2; }
    }
    const L = loadRuns(io.read); if (L.error) { log("takeEvadeTurn: " + L.error); return 2; }
    const finders = FINDERS.map((id) => L.runs.find((r) => r.id === id));   // loadRuns refuses unless every one of the twelve runs (and so all five finders) exists
    const G = L.runs[0].gen0, name = mode === "smoke" ? "smoke" : mode === "dev" ? (io.devSet || "dev") : (io.heldSet || "held"), arms = armsOf(G, finders);
    const { rows, identity, direct } = flyIt(arms, G, finders, name), rules = rulesOf(rows), checks = checksOf({ rows, arms, identity, direct, G, runs: L.runs, count: SETS[name].count });
    for (const l of reportLines(rows, rules, name)) log(l);
    if (checks.length) log("  CHECKS FAILED, NOT WEIGHED: " + checks.join("; "));
    if (mode === "dev") log(rules.replicates ? "  DEV: R0 holds; HELD may be flown (node tools/ship/takeEvadeTurn.mjs held --write)" : "  DEV: R0 FAILS; HELD is NOT flown by this registration");
    if (wr) {
        const file = mode === "dev" ? DEV_FILE : HELD_FILE;
        write(file, JSON.stringify({ mode, set: name, first: SETS[name].first, count: SETS[name].count, finders: FINDERS, rules, rows, checks }, null, 1) + "\n"); log(`  written ${file}`);
    }
    return checks.length ? 1 : 0;
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) process.exit(command(process.argv.slice(2)));
}
