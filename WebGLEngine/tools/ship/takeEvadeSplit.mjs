// WebGLEngine/tools/ship/takeEvadeSplit.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is brain/SUB_EVADE_SPLIT_WIP.md, the gate tools/ship/takeEvadeSplit-selfcheck.mjs)
//   node tools/ship/takeEvadeSplit.mjs smoke                 the 40 arms on geometries 1 to 4; never recorded, free to read: the command runs
//   node tools/ship/takeEvadeSplit.mjs dev  [--write]        the DEV read on geometries 100001 to 100024; --write records brain/subEvadeSplitDev.json once; DEV decides whether HELD is spent (rule R0)
//   node tools/ship/takeEvadeSplit.mjs held --write          the HELD read on geometries 101001 to 101024, flown ONCE: refuses without a recorded DEV that replicates, refuses without --write, refuses if brain/subEvadeSplitHeld.json exists
// THE QUESTION (brain/SUB_EVADE_SPLIT_WIP.md): of the three numbers of the evade triple (S evadeSpeed, T evadeTime, N evadeTurn) which are NEEDED (the other two do not carry the finder's edge) and which DISPENSABLE?
// 40 ARMS, each flown against generation 0 (G, the search-ping champion) from both seats by subTournament.matchup, every side a tactician and the PD autopilot: for each of the five named finders, U (the finder) and the seven CELLS of G with some of the finder's numbers: S, T, N, ST, SN, TN, STN.
// A cell FINDS at an edge of at least 0.5 with z of at least 2 (takeSubLeague.mjs `finds`) and CARRIES at an edge of at least CARRY (0.8) of the finder's own unmodified edge. R0 to R5, the needed/dispensable labels and the headline are rulesOf.
"use strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as T from "../../brain/subTournament.mjs";
import { loadRuns, median, signed, FIND_EDGE, FIND_Z } from "./takeSubLeague.mjs";
import { graft, rowOf, labelOf, checksOf as turnChecksOf, armsOf as turnArmsOf, FINDERS, TRIPLE, MIN_REPLICATE } from "./takeEvadeTurn.mjs";

const ENG = fileURLToPath(new URL("../../", import.meta.url));
export const DEV_FILE = "brain/subEvadeSplitDev.json", HELD_FILE = "brain/subEvadeSplitHeld.json";
export const SETS = Object.freeze({ smoke: Object.freeze({ first: 1, count: 4 }), dev: Object.freeze({ first: 100001, count: 24 }), held: Object.freeze({ first: 101001, count: 24 }) });
export const CELL_KEYS = Object.freeze({ S: Object.freeze(["evadeSpeed"]), T: Object.freeze(["evadeTime"]), N: Object.freeze(["evadeTurn"]), ST: Object.freeze(["evadeSpeed", "evadeTime"]), SN: Object.freeze(["evadeSpeed", "evadeTurn"]), TN: Object.freeze(["evadeTime", "evadeTurn"]), STN: TRIPLE });
export const CELLS = Object.freeze(Object.keys(CELL_KEYS)), KINDS = Object.freeze(["U", ...CELLS]);
export const CARRY = 0.8, ODD = "league7103";

const f3 = (v) => signed(v, 3);

/** The 40 arms from G (a theta) and the finders ([{ id, final }]): { id: "KIND:finder", kind, finder, theta }, eight a finder in the order of KINDS (U, then S, T, N, ST, SN, TN, STN). */
export function armsOf(G, finders) {
    const arms = [];
    for (const f of finders) {
        arms.push({ id: `U:${f.id}`, kind: "U", finder: f.id, theta: { ...f.final } });
        for (const c of CELLS) arms.push({ id: `${c}:${f.id}`, kind: c, finder: f.id, theta: graft(G, f.final, CELL_KEYS[c]) });
    }
    return arms;
}

/** Flies the arms against G on a set ("smoke", "dev" or "held"), plus the two things the checks need: G with its own triple against G (`identity`) and each finder flown directly (`direct`). Returns { rows, identity: { edge }, direct: { finder: { edge, winsX, draws, winsY } } }. */
export function fly(arms, G, finders, setName, opts = {}) {
    const geos = T.geometries(SETS[setName].count, SETS[setName].first), g = T.makeSide("G", { theta: G });
    const run = (id, theta) => T.matchup(T.makeSide(id, { theta }), g, geos, opts);
    const rows = arms.map((a) => rowOf(a, run(a.id, a.theta), geos));
    const identity = { edge: run("identity", graft(G, G, TRIPLE)).summary.edge }, direct = {};
    for (const f of finders) { const s = run(`direct:${f.id}`, f.final).summary; direct[f.id] = { edge: s.edge, winsX: s.winsX, draws: s.draws, winsY: s.winsY }; }
    return { rows, identity, direct };
}

/** What the registration adds to the evade-turn command's checks: the STN cell of each finder is that command's GT arm and the N cell its GN arm, the same theta to the number. */
export function cellChecks(arms, G, finders) {
    const turn = turnArmsOf(G, finders), same = (cell, kind) => finders.every((f) => { const a = arms.find((x) => x.id === `${cell}:${f.id}`), b = turn.find((x) => x.id === `${kind}:${f.id}`); return !!a && !!b && JSON.stringify(a.theta) === JSON.stringify(b.theta); });
    return same("STN", "GT") && same("N", "GN") ? [] : ["a cell is not the evade-turn command's arm"];
}

/** The checks that VOID the read, by name and not weighed: the evade-turn command's, then the cells'. ctx { rows, arms, identity, direct, G, runs, count, finders }. */
export const checksOf = (ctx) => [...turnChecksOf(ctx), ...cellChecks(ctx.arms, ctx.G, ctx.finders)];

/** The headline from the three NEEDED / DISPENSABLE labels: the numbers needed, named; null when any label is PARTIAL or n/a. */
export function headlineOf(needed) {
    if ([needed.speed, needed.time, needed.turn].some((x) => x !== "NEEDED" && x !== "DISPENSABLE")) return null;
    const names = [["speed", "THE SPEED"], ["time", "THE TIME"], ["turn", "THE TURN"]].filter(([k]) => needed[k] === "NEEDED").map(([, s]) => s);
    return names.length === 0 ? "ANY TWO OF THE THREE" : names.length === 3 ? "ALL THREE NUMBERS" : names.length === 1 ? `${names[0]} ONLY` : names.join(" AND ");
}

/** R0 to R5, the needed/dispensable labels, the headline, the shares and the medians from the rows. The finders whose unmodified arm finds are F' (n of them); counts and labels are over F'. */
export function rulesOf(rows, finders = FINDERS) {
    const by = (kind, f) => rows.find((r) => r.kind === kind && r.finder === f);
    const fprime = finders.filter((f) => { const u = by("U", f); return !!u && u.finds; }), n = fprime.length;
    const cnt = (kind, pred) => fprime.filter((f) => pred(by(kind, f), by("U", f))).length, finds = (r) => r.finds, carries = (r, u) => r.edge >= CARRY * u.edge;
    const counts = { S: cnt("S", finds), T: cnt("T", finds), SN: cnt("SN", carries), TN: cnt("TN", carries), ST: cnt("ST", carries) };
    const labels = { R1: labelOf(counts.S, n, "YES", "NO"), R2: labelOf(counts.T, n, "YES", "NO"), R3: labelOf(counts.SN, n, "YES", "NO"), R4: labelOf(counts.TN, n, "YES", "NO"), R5: labelOf(counts.ST, n, "YES", "NO") };
    const need = (l) => (l === "YES" ? "DISPENSABLE" : l === "NO" ? "NEEDED" : l), needed = { speed: need(labels.R4), time: need(labels.R3), turn: need(labels.R5) };
    const medianShare = {}, medianEdge = {}, apart = {}, strong = finders.filter((f) => f !== ODD);
    for (const c of CELLS) medianShare[c] = median(fprime.map((f) => by(c, f).edge / by("U", f).edge));
    for (const k of KINDS) { medianEdge[k] = median(finders.map((f) => by(k, f)).filter(Boolean).map((r) => r.edge)); const o = by(k, ODD); apart[k] = { odd: o ? o.edge : NaN, strong: median(strong.map((f) => by(k, f)).filter(Boolean).map((r) => r.edge)) }; }
    return { n, fprime, replicates: n >= MIN_REPLICATE, counts, labels, needed, headline: headlineOf(needed), medianShare, medianEdge, apart };
}

/** The report of a read, one string a line. */
export function reportLines(rows, rules, name, finders = FINDERS) {
    const S = SETS[name], L = [], by = (kind, f) => rows.find((r) => r.kind === kind && r.finder === f);
    L.push(`[takeEvadeSplit] ${name} read: geometries ${S.first} to ${S.first + S.count - 1}, both seats (${2 * S.count} duels an arm); every arm against G, generation 0 (the search-ping champion); an arm FINDS at edge >= ${FIND_EDGE} and z >= ${FIND_Z}, CARRIES at ${CARRY} of the finder's own edge`);
    const what = { U: "the finder unmodified", S: "the finder's evadeSpeed put on G", T: "the finder's evadeTime put on G", N: "the finder's evadeTurn put on G", ST: "the finder's evadeSpeed and evadeTime put on G", SN: "the finder's evadeSpeed and evadeTurn put on G", TN: "the finder's evadeTime and evadeTurn put on G", STN: "the finder's evade triple (evadeSpeed, evadeTime, evadeTurn) put on G" };
    for (const k of KINDS) {
        L.push(`  ${k.padEnd(3)} ${what[k]}`);
        for (const f of finders) { const a = by(k, f); if (a) L.push(`    ${a.id.padEnd(15)} edge ${f3(a.edge)} +- ${a.se.toFixed(3)} (z ${a.z.toFixed(1)}), ${a.winsX}-${a.draws}-${a.winsY}  ${a.finds ? "FINDS" : "does not"}   seat A ${f3(a.seatA)}, seat B ${f3(a.seatB)}`); }
    }
    const n = rules.n, c = rules.counts, lb = rules.labels, nd = rules.needed;
    L.push(`  R0 REPLICATES: ${n} of ${finders.length} unmodified finders find (at least ${MIN_REPLICATE} needed): ${rules.replicates ? "yes" : "NO"}`);
    L.push(`  R1 speed alone finds: ${c.S} of ${n}  ->  ${lb.R1}`);
    L.push(`  R2 time alone finds: ${c.T} of ${n}  ->  ${lb.R2}`);
    L.push(`  R3 speed and turn carry: ${c.SN} of ${n}  ->  ${lb.R3}`);
    L.push(`  R4 time and turn carry: ${c.TN} of ${n}  ->  ${lb.R4}`);
    L.push(`  R5 speed and time carry: ${c.ST} of ${n}  ->  ${lb.R5}`);
    L.push(`  NEEDED OR DISPENSABLE: the speed ${nd.speed} (R4), the time ${nd.time} (R3), the turn ${nd.turn} (R5)`);
    L.push(`  HEADLINE: ${rules.headline === null ? "none (a label is PARTIAL or n/a)" : rules.headline}`);
    L.push(`  EDGE SHARES of the finder's own edge (median over the ${n}): ${CELLS.map((k) => `${k} ${rules.medianShare[k].toFixed(2)}`).join(", ")}`);
    L.push(`  MEDIAN EDGE over the five (the 2 x 2 x 2 at G): G ${f3(0)}, ${CELLS.map((k) => `${k} ${f3(rules.medianEdge[k])}`).join(", ")}, U ${f3(rules.medianEdge.U)}`);
    L.push(`  APART, ${ODD}'s edge (the median of the other four's in brackets): ${KINDS.map((k) => `${k} ${f3(rules.apart[k].odd)} (${f3(rules.apart[k].strong)})`).join(", ")}`);
    return L;
}

const readJson = (f) => (fs.existsSync(ENG + f) ? JSON.parse(fs.readFileSync(ENG + f, "utf8")) : null);

/** The command: argv (after the program), io { log, exists, write, read, fly, devSet, heldSet } (defaults: the console and the file system; `read(path)` gives parsed JSON or null; `fly` replaces the flying and `devSet` / `heldSet` name a smaller set to fly in the DEV / HELD mode, all for the gate, which never flies 100001 to 101024). Returns the exit code. */
export function command(argv, io = {}) {
    const log = io.log || ((s) => console.log(s)), exists = io.exists || ((f) => fs.existsSync(ENG + f)), write = io.write || ((f, s) => fs.writeFileSync(ENG + f, s)), read = io.read || readJson, flyIt = io.fly || fly;
    const mode = argv[0];
    if (mode !== "smoke" && mode !== "dev" && mode !== "held") { log("usage: takeEvadeSplit.mjs smoke | dev [--write] | held --write"); return 2; }
    for (const a of argv.slice(1)) if (a !== "--write") { log(`takeEvadeSplit: unknown argument ${a}`); return 2; }
    const wr = argv.includes("--write");
    if (mode === "smoke" && wr) { log("takeEvadeSplit: smoke is never recorded"); return 2; }
    if (mode === "dev" && wr && exists(DEV_FILE)) { log(`takeEvadeSplit: ${DEV_FILE} exists; DEV is recorded once and a second record is refused`); return 2; }
    if (mode === "held" && !wr && !io.heldSet) { log("takeEvadeSplit: the HELD set is read once and the read is recorded; run held with --write"); return 2; }
    if (mode === "held" && wr && exists(HELD_FILE)) { log(`takeEvadeSplit: ${HELD_FILE} exists; the HELD set is read once and a second read is refused`); return 2; }
    if (mode === "held") {
        const dev = read(DEV_FILE);
        if (!dev) { log(`takeEvadeSplit: ${DEV_FILE} is missing; HELD is flown only after DEV is recorded`); return 2; }
        if (dev.set !== "dev" || !dev.rules || dev.rules.replicates !== true) { log("takeEvadeSplit: DEV did not replicate (R0) or is not a DEV record; HELD is not flown by this registration"); return 2; }
    }
    const L = loadRuns(io.read); if (L.error) { log("takeEvadeSplit: " + L.error); return 2; }
    const finders = FINDERS.map((id) => L.runs.find((r) => r.id === id));   // loadRuns refuses unless every one of the twelve runs (and so all five finders) exists
    const G = L.runs[0].gen0, name = mode === "smoke" ? "smoke" : mode === "dev" ? (io.devSet || "dev") : (io.heldSet || "held"), arms = armsOf(G, finders);
    const { rows, identity, direct } = flyIt(arms, G, finders, name), rules = rulesOf(rows), checks = checksOf({ rows, arms, identity, direct, G, runs: L.runs, count: SETS[name].count, finders });
    for (const l of reportLines(rows, rules, name)) log(l);
    if (checks.length) log("  CHECKS FAILED, NOT WEIGHED: " + checks.join("; "));
    if (mode === "dev") log(rules.replicates ? "  DEV: R0 holds; HELD may be flown (node tools/ship/takeEvadeSplit.mjs held --write)" : "  DEV: R0 FAILS; HELD is NOT flown by this registration");
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
