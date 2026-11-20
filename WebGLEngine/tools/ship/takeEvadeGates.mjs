// WebGLEngine/tools/ship/takeEvadeGates.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is brain/SUB_EVADE_GATES_WIP.md, the gate tools/ship/takeEvadeGates-selfcheck.mjs)
//   node tools/ship/takeEvadeGates.mjs smoke                 the 66 matchups on geometries 1 to 4; never recorded, free to read: the command runs
//   node tools/ship/takeEvadeGates.mjs dev  [--write]        the DEV read on geometries 126001 to 126048; --write records brain/subEvadeGatesDev.json once; DEV decides whether HELD is spent (rule R0)
//   node tools/ship/takeEvadeGates.mjs held --write          the HELD read on geometries 127001 to 127048, flown ONCE: refuses without a recorded DEV that replicates and lists no failed check, refuses without --write, refuses if brain/subEvadeGatesHeld.json exists
// THE QUESTION (brain/SUB_EVADE_GATES_WIP.md): against an opponent whose evadeSpeed and evadeTurn are varied on a 4 x 4 grid (the rest of it the hunter's own), where does league7100's trackSpeed D (3.15), set on the hunter, change the hunter's result: at the strong corner only, on the strong turn alone, on the strong speed alone, or on either?
// THE MATCHUPS: for each hunter (league7001, exploit7204): OWN (U(h) with trackSpeed D against U(h)) and for each cell (s, u) BASE (U(h) against O(h; s, u)) and SLOW (U(h) with trackSpeed D against O(h; s, u)), O being U(h) with evadeSpeed s and evadeTurn u: 33 a hunter, 66 a set. THE EFFECT is the paired difference by geometry of SLOW over BASE (`effectOf` of tools/ship/takeEvadeAway.mjs).
"use strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as T from "../../brain/subTournament.mjs";
import * as TA from "../../brain/subTactics.mjs";
import { loadRuns, decided, signed, FIND_EDGE, FIND_Z } from "./takeSubLeague.mjs";
import { rowOf } from "./takeEvadeTurn.mjs";
import { vOf, effectOf, boatTheta, dOf, equalPair, DONOR } from "./takeEvadeAway.mjs";

const ENG = fileURLToPath(new URL("../../", import.meta.url));
export const DEV_FILE = "brain/subEvadeGatesDev.json", HELD_FILE = "brain/subEvadeGatesHeld.json";
export const SETS = Object.freeze({ smoke: Object.freeze({ first: 1, count: 4 }), dev: Object.freeze({ first: 126001, count: 48 }), held: Object.freeze({ first: 127001, count: 48 }) });
export const HUNTERS = Object.freeze(["league7001", "exploit7204"]);
export const GRID_S = Object.freeze([2.0, 3.0, 4.0, 4.5]), GRID_U = Object.freeze([0.8, 1.8, 2.4, 2.8]);
export const CELLS = Object.freeze(GRID_S.flatMap((s) => GRID_U.map((u) => Object.freeze({ s, u }))));
export const CORNERS = Object.freeze({ strong: Object.freeze({ s: 4.5, u: 2.8 }), A: Object.freeze({ s: 2.0, u: 2.8 }), B: Object.freeze({ s: 4.5, u: 0.8 }), W: Object.freeze({ s: 2.0, u: 0.8 }) });
export { decided, DONOR };

const f3 = (v) => signed(v, 3), v2 = (v) => v.toFixed(2), cid = (c) => `${v2(c.s)},${v2(c.u)}`;

/** The 66 matchups: { id, kind ("OWN", "BASE" or "SLOW"), hunter, cell ({ s, u } or null for OWN), hi: { id, theta }, lo: { id, theta } }, a hunter at a time in the order of HUNTERS: its OWN, then for each cell of CELLS its BASE and its SLOW; the hunter (or the slowed hunter) is the first side. */
export function matchupsOf(runs, G) {
    const out = [], D = dOf(runs);
    for (const h of HUNTERS) {
        const H = boatTheta(runs, G, h), slow = { ...H, trackSpeed: D };
        out.push({ id: `OWN:${h}`, kind: "OWN", hunter: h, cell: null, hi: { id: `U:${h}@D`, theta: { ...slow } }, lo: { id: `U:${h}`, theta: { ...H } } });
        for (const c of CELLS) {
            const O = { ...H, evadeSpeed: c.s, evadeTurn: c.u };
            out.push({ id: `BASE:${h}@${cid(c)}`, kind: "BASE", hunter: h, cell: { ...c }, hi: { id: `U:${h}`, theta: { ...H } }, lo: { id: `O:${h}@${cid(c)}`, theta: { ...O } } });
            out.push({ id: `SLOW:${h}@${cid(c)}`, kind: "SLOW", hunter: h, cell: { ...c }, hi: { id: `U:${h}@D`, theta: { ...slow } }, lo: { id: `O:${h}@${cid(c)}`, theta: { ...O } } });
        }
    }
    return out;
}

/** Flies the matchups on a set ("smoke", "dev" or "held"), plus U(league7100) against a copy of itself (`equal`). Returns { rows, equal: { edge } }. A row carries `v` (the per-geometry values) and `identical`. */
export function fly(matchups, runs, setName, opts = {}) {
    const geos = T.geometries(SETS[setName].count, SETS[setName].first), side = (id, theta) => T.makeSide(id, { theta }), [e1, e2] = equalPair(runs);
    const rows = matchups.map((m) => { const mt = T.matchup(side(m.hi.id, m.hi.theta), side(m.lo.id, m.lo.theta), geos, opts); return { ...rowOf({ id: m.id, kind: m.kind, finder: m.hunter }, mt, geos), hunter: m.hunter, cell: m.cell, v: vOf(mt.fights), identical: JSON.stringify(m.hi.theta) === JSON.stringify(m.lo.theta) }; });
    return { rows, equal: { edge: T.matchup(side("equal1", e1), side("equal2", e2), geos, opts).summary.edge } };
}

/** The checks that VOID the read, by name and not weighed; every one is an identity or a file's own number. ctx { rows, matchups, equal, G, runs, count }. */
export function checksOf({ rows, matchups, equal, G, runs, count }) {
    const c = [];
    if (rows.some((r) => r.flew !== 2 * count || !r.seedsOk || (r.v !== undefined && r.v.length !== count))) c.push("a matchup did not fly the same geometries");
    if (rows.some((r) => !Number.isFinite(r.edge) || !Number.isFinite(r.z) || (r.v || []).some((x) => !Number.isFinite(x)))) c.push("a score is non-finite");
    if (matchups.some((m) => [m.hi, m.lo].some((s) => TA.THETA_NAMES.some((k) => TA.clampTheta(s.theta)[k] !== s.theta[k])))) c.push("a side has a theta that clampTheta changes");
    if (runs.some((r) => JSON.stringify(r.gen0) !== JSON.stringify(G))) c.push("a run's generation 0 is not G");
    if (equal.edge !== 0) c.push(`two equal thetas have an edge of ${equal.edge} against each other, not exactly 0`);
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b), D = dOf(runs), fin = (id) => boatTheta(runs, G, id);
    const want = (m) => (m.kind === "OWN" ? [{ ...fin(m.hunter), trackSpeed: D }, fin(m.hunter)] : [m.kind === "BASE" ? fin(m.hunter) : { ...fin(m.hunter), trackSpeed: D }, { ...fin(m.hunter), evadeSpeed: m.cell.s, evadeTurn: m.cell.u }]);
    if (!matchups.every((m) => { const [h, l] = want(m); return same(m.hi.theta, h) && same(m.lo.theta, l); })) c.push("a side is not the hunter's theta of the files (with trackSpeed D for a slowed one) or the hunter's theta with the cell's evadeSpeed and evadeTurn and nothing else moved");
    const seq = (h) => ["OWN:" + h, ...CELLS.flatMap((x) => [`BASE:${h}@${cid(x)}`, `SLOW:${h}@${cid(x)}`])];
    if (!same(matchups.map((m) => m.id), HUNTERS.flatMap(seq))) c.push("the matchups are not each hunter's OWN and its BASE and SLOW at the sixteen cells, in order");
    if (rows.some((r) => r.identical && r.edge !== 0)) c.push("an identical arm has an edge other than exactly 0");
    return c;
}

const statusOf = (r) => (r.identical ? "IDENTICAL" : decided(r) && r.edge > 0 ? "PAYS" : decided(r) && r.edge < 0 ? "COSTS" : "NEUTRAL");
const effectStatus = (e) => (decided(e) && e.edge > 0 ? "HELPS" : decided(e) && e.edge < 0 ? "HURTS" : "NEUTRAL");

/** R0, RG1 to RG5 and the forecast quantities from the 66 rows. */
export function rulesOf(rows) {
    const row = (id) => rows.find((r) => r.id === id), out = { cells: [], gates: {} };
    out.replicates = HUNTERS.every((h) => { const r = row(`OWN:${h}`); return decided(r) && r.edge > 0; });
    out.own = Object.fromEntries(HUNTERS.map((h) => [h, { edge: row(`OWN:${h}`).edge, z: row(`OWN:${h}`).z }]));
    for (const c of CELLS) {
        const per = HUNTERS.map((h) => { const b = row(`BASE:${h}@${cid(c)}`), s = row(`SLOW:${h}@${cid(c)}`), e = effectOf(s.v, b.v); return { hunter: h, baseEdge: b.edge, slowEdge: s.edge, edge: e.edge, se: e.se, z: e.z, status: effectStatus(e) }; });
        out.cells.push({ s: c.s, u: c.u, per, helps: per.every((p) => p.status === "HELPS"), hurts: per.filter((p) => p.status === "HURTS").map((p) => p.hunter) });
    }
    const cell = (s, u) => out.cells.find((x) => x.s === s && x.u === u);
    out.strong = cell(CORNERS.strong.s, CORNERS.strong.u).helps;
    out.cornerA = cell(CORNERS.A.s, CORNERS.A.u).helps; out.cornerB = cell(CORNERS.B.s, CORNERS.B.u).helps;
    out.headline = !out.strong ? "NOT REPLICATED" : out.cornerA && out.cornerB ? "EITHER" : out.cornerA ? "TURN ALONE" : out.cornerB ? "SPEED ALONE" : "AND";
    const low = (xs) => (xs.length ? Math.min(...xs) : null);
    out.gates.speed = low(GRID_S.filter((s) => cell(s, 2.8).helps)); out.gates.turn = low(GRID_U.filter((u) => cell(4.5, u).helps));
    out.helpCells = out.cells.filter((x) => x.helps).map((x) => ({ s: x.s, u: x.u })); out.n = out.helpCells.length;
    out.costs = Object.fromEntries(HUNTERS.map((h) => [h, out.cells.filter((x) => x.hurts.includes(h)).map((x) => ({ s: x.s, u: x.u }))]));
    out.hurtsSomewhere = HUNTERS.some((h) => out.costs[h].length > 0);
    out.forecast = {
        strong: out.strong, and: out.headline === "AND", turnAlone: out.headline === "TURN ALONE", speedAlone: out.headline === "SPEED ALONE", either: out.headline === "EITHER", notReplicated: out.headline === "NOT REPLICATED",
        turnGateHigh: out.gates.turn === null || out.gates.turn >= 2.4, speedGateHigh: out.gates.speed === null || out.gates.speed >= 4.0, nAtLeast4: out.n >= 4, hurtsSomewhere: out.hurtsSomewhere,
    };
    return out;
}

/** The report of a read, one string a line. */
export function reportLines(rows, rules, name) {
    const S = SETS[name], L = [], yn = (b) => (b ? "yes" : "no"), cl = (a) => (a.length ? a.map((x) => `(${v2(x.s)}, ${v2(x.u)})`).join(" ") : "none");
    L.push(`[takeEvadeGates] ${name} read: geometries ${S.first} to ${S.first + S.count - 1}, both seats (${2 * S.count} duels a matchup); ${rows.length} matchups; the hunters ${HUNTERS.join(" and ")}, each against itself with its evadeSpeed s in ${GRID_S.map(v2).join(", ")} and evadeTurn u in ${GRID_U.map(v2).join(", ")}; BASE is the hunter, SLOW the hunter with trackSpeed D (${DONOR}'s own); the EFFECT is the paired difference by geometry of SLOW over BASE, decided at an edge of ${FIND_EDGE} and a z of ${FIND_Z} in size; a cell HELPS when it is decided positive for both hunters`);
    for (const h of HUNTERS) {
        const own = rows.find((r) => r.id === `OWN:${h}`);
        L.push(`  HUNTER ${h}`);
        L.push(`    ${own.id.padEnd(30)} edge ${f3(own.edge)} +- ${own.se.toFixed(3)} (z ${own.z.toFixed(1)}), ${own.winsX}-${own.draws}-${own.winsY}  seat A ${f3(own.seatA)}, seat B ${f3(own.seatB)}  ${statusOf(own)}`);
        for (const x of rules.cells) { const p = x.per.find((q) => q.hunter === h); L.push(`    cell speed ${v2(x.s)} turn ${v2(x.u)}  BASE ${f3(p.baseEdge)}  SLOW ${f3(p.slowEdge)}  EFFECT ${f3(p.edge)} +- ${p.se.toFixed(3)} (z ${p.z.toFixed(1)})  ${p.status}`); }
    }
    const q = rules.forecast, g = rules.gates, gs = (v) => (v === null ? "none" : v2(v));
    L.push(`  R0 REPLICATES: OWN is decided for ${HUNTERS.map((h) => `${h} (${f3(rules.own[h].edge)}, z ${rules.own[h].z.toFixed(1)})`).join(" and ")}: ${rules.replicates ? "yes" : "NO"}`);
    L.push(`  RG1 THE STRONG CORNER (${v2(CORNERS.strong.s)}, ${v2(CORNERS.strong.u)}) HELPS: ${rules.strong ? "yes" : "NO"}`);
    L.push(`  RG2 THE HEADLINE: ${rules.headline}  (A (${v2(CORNERS.A.s)}, ${v2(CORNERS.A.u)}) helps: ${yn(rules.cornerA)}; B (${v2(CORNERS.B.s)}, ${v2(CORNERS.B.u)}) helps: ${yn(rules.cornerB)})`);
    L.push(`  RG3 THE GATES: the speed gate (at turn ${v2(CORNERS.strong.u)}) is ${gs(g.speed)}; the turn gate (at speed ${v2(CORNERS.strong.s)}) is ${gs(g.turn)}`);
    L.push(`  RG4 THE COUNT: ${rules.n} of ${CELLS.length} cells HELP: ${cl(rules.helpCells)}`);
    L.push(`  RG5 THE COSTS: ${HUNTERS.map((h) => `${h} HURT at ${cl(rules.costs[h])}`).join("; ")}`);
    L.push(`  FORECAST QUANTITIES: strong corner helps ${yn(q.strong)}, AND ${yn(q.and)}, TURN ALONE ${yn(q.turnAlone)}, SPEED ALONE ${yn(q.speedAlone)}, EITHER ${yn(q.either)}, NOT REPLICATED ${yn(q.notReplicated)}, turn gate 2.40 or higher or none ${yn(q.turnGateHigh)}, speed gate 4.00 or higher or none ${yn(q.speedGateHigh)}, four or more cells ${yn(q.nAtLeast4)}, hurts somewhere ${yn(q.hurtsSomewhere)}`);
    return L;
}

const readJson = (f) => (fs.existsSync(ENG + f) ? JSON.parse(fs.readFileSync(ENG + f, "utf8")) : null);

/** The command: argv (after the program), io { log, exists, write, read, fly, devSet, heldSet } (defaults: the console and the file system; `read(path)` gives parsed JSON or null; `fly` replaces the flying and `devSet` / `heldSet` name a smaller set to fly in the DEV / HELD mode, all for the gate, which never flies 126001 to 127048). Returns the exit code. */
export function command(argv, io = {}) {
    const log = io.log || ((s) => console.log(s)), exists = io.exists || ((f) => fs.existsSync(ENG + f)), write = io.write || ((f, s) => fs.writeFileSync(ENG + f, s)), read = io.read || readJson, flyIt = io.fly || fly;
    const mode = argv[0];
    if (mode !== "smoke" && mode !== "dev" && mode !== "held") { log("usage: takeEvadeGates.mjs smoke | dev [--write] | held --write"); return 2; }
    for (const a of argv.slice(1)) if (a !== "--write") { log(`takeEvadeGates: unknown argument ${a}`); return 2; }
    const wr = argv.includes("--write");
    if (mode === "smoke" && wr) { log("takeEvadeGates: smoke is never recorded"); return 2; }
    if (mode === "dev" && wr && exists(DEV_FILE)) { log(`takeEvadeGates: ${DEV_FILE} exists; DEV is recorded once and a second record is refused`); return 2; }
    if (mode === "held" && !wr && !io.heldSet) { log("takeEvadeGates: the HELD set is read once and the read is recorded; run held with --write"); return 2; }
    if (mode === "held" && wr && exists(HELD_FILE)) { log(`takeEvadeGates: ${HELD_FILE} exists; the HELD set is read once and a second read is refused`); return 2; }
    if (mode === "held") {
        const dev = read(DEV_FILE);
        if (!dev) { log(`takeEvadeGates: ${DEV_FILE} is missing; HELD is flown only after DEV is recorded`); return 2; }
        if (dev.set !== "dev" || !dev.rules || dev.rules.replicates !== true) { log("takeEvadeGates: DEV did not replicate (R0) or is not a DEV record; HELD is not flown by this registration"); return 2; }
        if (!Array.isArray(dev.checks) || dev.checks.length) { log("takeEvadeGates: DEV has a failed check (or records none), so its read is void; HELD is not flown by this registration"); return 2; }
    }
    const L = loadRuns(io.read); if (L.error) { log("takeEvadeGates: " + L.error); return 2; }
    const G = L.runs[0].gen0, name = mode === "smoke" ? "smoke" : mode === "dev" ? (io.devSet || "dev") : (io.heldSet || "held"), matchups = matchupsOf(L.runs, G);   // loadRuns refuses unless every one of the fourteen runs exists
    const flown = flyIt(matchups, L.runs, name), rules = rulesOf(flown.rows), checks = checksOf({ rows: flown.rows, matchups, equal: flown.equal, G, runs: L.runs, count: SETS[name].count });
    for (const l of reportLines(flown.rows, rules, name)) log(l);
    if (checks.length) log("  CHECKS FAILED, NOT WEIGHED: " + checks.join("; "));
    if (mode === "dev") log(checks.length ? "  DEV: a check FAILED, the read is void; HELD is NOT flown by this registration" : rules.replicates ? "  DEV: R0 holds; HELD may be flown (node tools/ship/takeEvadeGates.mjs held --write)" : "  DEV: R0 FAILS; HELD is NOT flown by this registration");
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
