// WebGLEngine/tools/ship/takeEvadePairs.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is brain/SUB_EVADE_PAIRS_WIP.md, the gate tools/ship/takeEvadePairs-selfcheck.mjs)
//   node tools/ship/takeEvadePairs.mjs smoke                 the 7 arms and 24 head-to-head matchups on geometries 1 to 4; never recorded, free to read: the command runs
//   node tools/ship/takeEvadePairs.mjs dev  [--write]        the DEV read on geometries 112001 to 112048; --write records brain/subEvadePairsDev.json once; DEV decides whether HELD is spent (rule R0)
//   node tools/ship/takeEvadePairs.mjs held --write          the HELD read on geometries 113001 to 113048, flown ONCE: refuses without a recorded DEV that replicates and lists no failed check, refuses without --write, refuses if brain/subEvadePairsHeld.json exists
// THE QUESTION, in two parts (brain/SUB_EVADE_PAIRS_WIP.md). A, the PAIRS: grafted onto generation 0 (G), do the five finders' (evadeSpeed, evadeTurn) pairs reproduce the order the finders have against each other? B, the 2 x 2: for league7100 against league7001, is the order carried by the speed (4.5 against 4.317), the turn (2.698 against 2.8), both, or neither?
// THE ARMS: P(f) = G with finder f's speed and turn (5 arms), plus the two 2 x 2 arms that are not P arms (7 against G); the P pairs (the ten pairs of grafts against each other), the U pairs (the ten pairs of finders against each other, the same geometries) and the four 2 x 2 steps: 24 head-to-head matchups. R0 to RB2 and the readings are rulesOf.
"use strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as T from "../../brain/subTournament.mjs";
import * as TA from "../../brain/subTactics.mjs";
import { loadRuns, decided, signed, FIND_EDGE, FIND_Z } from "./takeSubLeague.mjs";
import { graft, rowOf, labelOf, FINDERS } from "./takeEvadeTurn.mjs";
import { armsOf as splitArmsOf } from "./takeEvadeSplit.mjs";
import { stepLabel, MIN_Z, MIN_EDGE } from "./takeEvadeDose.mjs";

const ENG = fileURLToPath(new URL("../../", import.meta.url));
export const DEV_FILE = "brain/subEvadePairsDev.json", HELD_FILE = "brain/subEvadePairsHeld.json";
export const SETS = Object.freeze({ smoke: Object.freeze({ first: 1, count: 4 }), dev: Object.freeze({ first: 112001, count: 48 }), held: Object.freeze({ first: 113001, count: 48 }) });
export const ODD = "league7103", STRONG = Object.freeze(FINDERS.filter((f) => f !== ODD));
export const DUO = Object.freeze({ a: "league7001", b: "league7100" });   // the 2 x 2's donors: a gives (S0, T0), b gives (S1, T1)
export const KEYS = Object.freeze(["evadeSpeed", "evadeTurn"]);
export const ODD_NEEDED = 3;
export { MIN_Z, MIN_EDGE, stepLabel, FINDERS };

const f3 = (v) => signed(v, 3), d2 = (d) => d.toFixed(2);

/** The ten pairs of finders [a, b] in the order of FINDERS (i before j). */
export const pairsOf = () => { const p = []; for (let i = 0; i < FINDERS.length; i++) for (let j = i + 1; j < FINDERS.length; j++) p.push([FINDERS[i], FINDERS[j]]); return p; };

/** The four corners of the 2 x 2 as thetas: G with (speed, turn) of S0 = DUO.a's speed, S1 = DUO.b's, T0 = DUO.a's turn, T1 = DUO.b's. { S0T0, S1T0, S0T1, S1T1, s0, s1, t0, t1 }. */
export function cornersOf(G, finders) {
    const A = finders.find((f) => f.id === DUO.a).final, B = finders.find((f) => f.id === DUO.b).final, s0 = A.evadeSpeed, s1 = B.evadeSpeed, t0 = A.evadeTurn, t1 = B.evadeTurn;
    const at = (s, t) => graft(G, { evadeSpeed: s, evadeTurn: t }, KEYS);
    return { S0T0: at(s0, t0), S1T0: at(s1, t0), S0T1: at(s0, t1), S1T1: at(s1, t1), s0, s1, t0, t1 };
}

/** The 7 arms against G: P(f) for each finder (`P:f`, the finder's speed and turn on G) then the two 2 x 2 arms that are not P arms (`F:s1/t0`, `F:s0/t1`, the speeds and turns to two decimals). */
export function armsOf(G, finders) {
    const arms = FINDERS.map((f) => ({ id: `P:${f}`, kind: "arm", finder: f, theta: graft(G, finders.find((x) => x.id === f).final, KEYS) })), c = cornersOf(G, finders);
    arms.push({ id: `F:${d2(c.s1)}/${d2(c.t0)}`, kind: "arm", finder: "F", theta: c.S1T0 }, { id: `F:${d2(c.s0)}/${d2(c.t1)}`, kind: "arm", finder: "F", theta: c.S0T1 });
    return arms;
}

/** The ten finders as sides: { id: "U:f", finder: f, theta } (the final generation's theta of the file, unmodified). */
export const uSidesOf = (finders) => FINDERS.map((f) => ({ id: `U:${f}`, finder: f, theta: { ...finders.find((x) => x.id === f).final } }));

/** The ten P pairs and the ten U pairs: { id: "PP:a|b" or "UU:a|b", a, b, hi, lo } with the first finder's side first. */
export const ppsOf = (arms) => pairsOf().map(([a, b]) => ({ id: `PP:${a}|${b}`, a, b, hi: arms.find((x) => x.id === `P:${a}`), lo: arms.find((x) => x.id === `P:${b}`) }));
export const uusOf = (uSides) => pairsOf().map(([a, b]) => ({ id: `UU:${a}|${b}`, a, b, hi: uSides.find((x) => x.id === `U:${a}`), lo: uSides.find((x) => x.id === `U:${b}`) }));

/** The four 2 x 2 steps, the higher speed or the lower turn first: the speed step at T0 and at T1 (S1 over S0), the turn step at S0 and at S1 (T1 over T0): { id: "S@t" or "N@s", hi, lo }. */
export function stepsOf(arms, G, finders) {
    const c = cornersOf(G, finders), side = (theta, id) => ({ id, theta }), p = (f) => arms.find((x) => x.id === `P:${f}`);
    const s1t0 = arms.find((x) => x.id === `F:${d2(c.s1)}/${d2(c.t0)}`), s0t1 = arms.find((x) => x.id === `F:${d2(c.s0)}/${d2(c.t1)}`);
    return [
        { id: `S@${d2(c.t0)}`, hi: s1t0, lo: p(DUO.a) }, { id: `S@${d2(c.t1)}`, hi: p(DUO.b), lo: s0t1 },
        { id: `N@${d2(c.s0)}`, hi: s0t1, lo: p(DUO.a) }, { id: `N@${d2(c.s1)}`, hi: p(DUO.b), lo: s1t0 },
    ].map((x) => ({ ...x, hi: side(x.hi.theta, x.hi.id), lo: side(x.lo.theta, x.lo.id) }));
}

/** Flies the arms against G and the pairs and steps against each other on a set ("smoke", "dev" or "held"), plus what the checks need: G with its own speed and turn against G (`identity`) and P(league7001) against a copy of itself (`equal`). Returns { rows, pps, uus, steps, identity: { edge }, equal: { edge } }. */
export function fly(arms, pps, uus, steps, G, setName, opts = {}) {
    const geos = T.geometries(SETS[setName].count, SETS[setName].first), side = (id, theta) => T.makeSide(id, { theta }), g = side("G", G);
    const rows = arms.map((a) => rowOf({ id: a.id, kind: "arm", finder: a.finder }, T.matchup(side(a.id, a.theta), g, geos, opts), geos));
    const head = (kind, h) => ({ ...rowOf({ id: h.id, kind, finder: h.a || "S" }, T.matchup(side(h.hi.id, h.hi.theta), side(h.lo.id, h.lo.theta), geos, opts), geos), ...(h.a ? { a: h.a, b: h.b } : {}) });
    const copy = arms.find((a) => a.id === `P:${DUO.a}`).theta;
    return { rows, pps: pps.map((h) => head("pp", h)), uus: uus.map((h) => head("uu", h)), steps: steps.map((h) => head("step", h)), identity: { edge: T.matchup(side("identity", graft(G, G, KEYS)), g, geos, opts).summary.edge }, equal: { edge: T.matchup(side("equal1", copy), side("equal2", copy), geos, opts).summary.edge } };
}

/** The checks that VOID the read, by name and not weighed; every one is an identity or a file's own number. ctx { rows, pps, uus, steps, arms, uSides, identity, equal, G, runs, count, finders }. */
export function checksOf({ rows, pps, uus, steps, arms, uSides, identity, equal, G, runs, count, finders }) {
    const c = [], all = [...rows, ...pps, ...uus, ...steps], A = finders.find((f) => f.id === DUO.a).final, B = finders.find((f) => f.id === DUO.b).final;
    if (all.some((r) => r.flew !== 2 * count || !r.seedsOk)) c.push("an arm, a pair or a step did not fly the same geometries");
    if (all.some((r) => !Number.isFinite(r.edge) || !Number.isFinite(r.z))) c.push("a score is non-finite");
    if ([...arms, ...uSides].some((a) => TA.THETA_NAMES.some((k) => TA.clampTheta(a.theta)[k] !== a.theta[k]))) c.push("a side has a theta that clampTheta changes");
    if (runs.some((r) => JSON.stringify(r.gen0) !== JSON.stringify(G))) c.push("a run's generation 0 is not G");
    if (identity.edge !== 0) c.push(`G with its own speed and turn has an edge of ${identity.edge} against G, not exactly 0`);
    if (equal.edge !== 0) c.push(`two equal thetas have an edge of ${equal.edge} against each other, not exactly 0`);
    const sn = splitArmsOf(G, finders);
    if (!FINDERS.every((f) => { const a = arms.find((x) => x.id === `P:${f}`), b = sn.find((x) => x.id === `SN:${f}`); return !!a && !!b && JSON.stringify(a.theta) === JSON.stringify(b.theta); })) c.push("a P arm is not the split command's SN arm of its finder");
    const pair = (id, s, t) => { const a = arms.find((x) => x.id === id); return !!a && a.theta.evadeSpeed === s && a.theta.evadeTurn === t; };
    if (!(pair(`P:${DUO.a}`, A.evadeSpeed, A.evadeTurn) && pair(`P:${DUO.b}`, B.evadeSpeed, B.evadeTurn) && pair(`F:${d2(B.evadeSpeed)}/${d2(A.evadeTurn)}`, B.evadeSpeed, A.evadeTurn) && pair(`F:${d2(A.evadeSpeed)}/${d2(B.evadeTurn)}`, A.evadeSpeed, B.evadeTurn))) c.push("a 2 x 2 arm is not the pair of the files");
    if (!FINDERS.every((f) => { const u = uSides.find((x) => x.id === `U:${f}`); return !!u && JSON.stringify(u.theta) === JSON.stringify(finders.find((x) => x.id === f).final); })) c.push("a U side is not the finder's final theta of the files");
    if (arms.some((a) => TA.THETA_NAMES.some((k) => k !== "evadeSpeed" && k !== "evadeTurn" && a.theta[k] !== G[k]))) c.push("an arm has a number besides the speed and the turn that is not G's");
    return c;
}

/** The category of a pair from its U row and P row: CARRIED (U decided, P decided the same way), CONTRADICTED (both decided, opposite ways), LOST (U decided, P not), SPURIOUS (P decided, U not), BOTH UNDECIDED. */
export const categoryOf = (u, p) => (decided(u) ? (decided(p) ? (Math.sign(u.edge) === Math.sign(p.edge) ? "CARRIED" : "CONTRADICTED") : "LOST") : decided(p) ? "SPURIOUS" : "BOTH UNDECIDED");

/** The edge of finder f over finder g from the pair rows of one kind (the row is a-over-b, so b-over-a is its negative): { edge, z } or null. */
export function overEdge(rows, f, g) {
    const r = rows.find((x) => x.a === f && x.b === g), q = rows.find((x) => x.a === g && x.b === f);
    return r ? { edge: r.edge, z: r.z } : q ? { edge: -q.edge, z: -q.z } : null;
}

/** R0 to RB2, the ten pairs side by side and the forecast quantities, from the arm rows, the P-pair rows, the U-pair rows and the step rows. */
export function rulesOf(rows, pps, uus, steps) {
    const out = {}, row = (id) => rows.find((r) => r.id === id);
    out.replicates = !!row(`P:${DUO.a}`) && !!row(`P:${DUO.b}`) && row(`P:${DUO.a}`).finds && row(`P:${DUO.b}`).finds;
    out.pairs = pps.map((p) => { const u = uus.find((x) => x.a === p.a && x.b === p.b); return { a: p.a, b: p.b, u: { edge: u.edge, z: u.z }, p: { edge: p.edge, z: p.z }, category: categoryOf(u, p) }; });
    const n = (k) => out.pairs.filter((x) => x.category === k).length;
    out.counts = { carried: n("CARRIED"), lost: n("LOST"), contradicted: n("CONTRADICTED"), spurious: n("SPURIOUS") };
    out.d = out.pairs.filter((x) => decided(x.u)).length;
    out.rp1 = labelOf(out.counts.carried, out.d, "YES", "NO");
    out.rp2 = out.counts.contradicted === 0;
    out.oddLoses = STRONG.filter((f) => { const e = overEdge(pps, f, ODD); return !!e && e.edge >= FIND_EDGE && e.z >= FIND_Z; }).length;
    out.rp3 = out.oddLoses >= ODD_NEEDED;
    out.rp4 = pps.filter((p) => STRONG.includes(p.a) && STRONG.includes(p.b)).every((p) => !decided(p));
    out.steps = Object.fromEntries(steps.map((s) => [s.id, stepLabel(s.z, s.edge)]));
    const sp = steps[1], tn = steps[3];   // the speed step at the turn T1 (2.698) and the turn step at the speed S1 (4.5), the order of stepsOf
    const speedUp = stepLabel(sp.z, sp.edge) === "UP", turnUp = stepLabel(tn.z, tn.edge) === "UP";
    out.headline = speedUp && !turnUp ? "THE SPEED" : turnUp && !speedUp ? "THE TURN" : speedUp && turnUp ? "BOTH" : "NEITHER";
    const duo = pps.find((p) => p.a === DUO.a && p.b === DUO.b);
    out.rb2 = decided(duo) ? (duo.edge < 0 ? `${DUO.b} decided` : `${DUO.a} decided`) : "undecided";
    out.forecast = { rp1Yes: out.rp1 === "YES", rp1Partial: out.rp1 === "PARTIAL", rp1No: out.rp1 === "NO", noContradiction: out.rp2, oddExplained: out.rp3, strongAlike: out.rp4, duoDecidedFor7100: decided(duo) && duo.edge < 0, neither: out.headline === "NEITHER", speed: out.headline === "THE SPEED", turn: out.headline === "THE TURN" };
    return out;
}

/** The report of a read, one string a line. */
export function reportLines(rows, pps, uus, steps, rules, name) {
    const S = SETS[name], L = [];
    L.push(`[takeEvadePairs] ${name} read: geometries ${S.first} to ${S.first + S.count - 1}, both seats (${2 * S.count} duels a matchup); ${rows.length} arms against G, generation 0 (the search-ping champion), ${pps.length} P pairs (the finders' speed and turn on G, against each other), ${uus.length} U pairs (the finders against each other), ${steps.length} 2 x 2 steps; an arm FINDS at edge >= ${FIND_EDGE} and z >= ${FIND_Z}, a pair is decided at an edge of ${FIND_EDGE} and a z of ${FIND_Z} in size, a step is UP at z >= ${MIN_Z} and edge >= ${MIN_EDGE}`);
    const line = (a, idw = 30) => `    ${a.id.padEnd(idw)} edge ${f3(a.edge)} +- ${a.se.toFixed(3)} (z ${a.z.toFixed(1)}), ${a.winsX}-${a.draws}-${a.winsY}  seat A ${f3(a.seatA)}, seat B ${f3(a.seatB)}`;
    L.push("  ARMS against G (P(f) is G with finder f's evadeSpeed and evadeTurn; F is a 2 x 2 arm that is not a P arm)");
    for (const a of rows) L.push(`${line(a, 22)}  ${a.finds ? "FINDS" : "does not"}`);
    L.push("  P PAIRS (the grafts against each other, the first finder's side first)");
    for (const p of pps) L.push(`${line(p)}  ${decided(p) ? "decided" : "not decided"}`);
    L.push("  U PAIRS (the finders against each other, the first finder's side first)");
    for (const p of uus) L.push(`${line(p)}  ${decided(p) ? "decided" : "not decided"}`);
    L.push("  2 x 2 STEPS (S: the speed 4.5 over 4.317 at a turn; N: the turn 2.698 over 2.8 at a speed)");
    for (const s of steps) L.push(`${line(s, 8)}  ${stepLabel(s.z, s.edge)}`);
    L.push("  THE TEN PAIRS side by side (U edge, P edge, the category)");
    for (const x of rules.pairs) L.push(`    ${`${x.a}|${x.b}`.padEnd(26)} U ${f3(x.u.edge)} (z ${x.u.z.toFixed(1)})   P ${f3(x.p.edge)} (z ${x.p.z.toFixed(1)})   ${x.category}`);
    const k = rules.counts, q = rules.forecast, yn = (b) => (b ? "yes" : "no");
    L.push(`  R0 REPLICATES: the P arms of ${DUO.a} and ${DUO.b} find against G: ${rules.replicates ? "yes" : "NO"}`);
    L.push(`  RP1 THE PAIRS CARRY THE ORDER: ${rules.rp1} (${k.carried} of ${rules.d} decided U pairs carried)`);
    L.push(`  RP2 NO CONTRADICTION: ${rules.rp2 ? "yes" : "NO"} (${k.contradicted} contradicted)`);
    L.push(`  RP3 THE PAIR EXPLAINS ${ODD}'S LOSSES: ${rules.rp3 ? "yes" : "NO"} (${rules.oddLoses} of ${STRONG.length} strong grafts decided over it)`);
    L.push(`  RP4 THE STRONG FOUR'S GRAFTS ARE ALIKE: ${rules.rp4 ? "yes" : "NO"}`);
    L.push(`  CATEGORIES: ${k.carried} CARRIED, ${k.lost} LOST, ${k.contradicted} CONTRADICTED, ${k.spurious} SPURIOUS`);
    L.push(`  RB1 THE HEADLINE: ${rules.headline}`);
    L.push(`  RB2 ${DUO.b}'S PAIR OVER ${DUO.a}'S: ${rules.rb2}`);
    L.push(`  FORECAST QUANTITIES: RP1 YES ${yn(q.rp1Yes)}, RP1 PARTIAL ${yn(q.rp1Partial)}, RP1 NO ${yn(q.rp1No)}, no contradiction ${yn(q.noContradiction)}, the pair explains ${ODD}'s losses ${yn(q.oddExplained)}, the strong grafts are alike ${yn(q.strongAlike)}, ${DUO.b}'s pair over ${DUO.a}'s is decided ${yn(q.duoDecidedFor7100)}, headline NEITHER ${yn(q.neither)}, headline THE SPEED ${yn(q.speed)}, headline THE TURN ${yn(q.turn)}`);
    return L;
}

const readJson = (f) => (fs.existsSync(ENG + f) ? JSON.parse(fs.readFileSync(ENG + f, "utf8")) : null);

/** The command: argv (after the program), io { log, exists, write, read, fly, devSet, heldSet } (defaults: the console and the file system; `read(path)` gives parsed JSON or null; `fly` replaces the flying and `devSet` / `heldSet` name a smaller set to fly in the DEV / HELD mode, all for the gate, which never flies 112001 to 113048). Returns the exit code. */
export function command(argv, io = {}) {
    const log = io.log || ((s) => console.log(s)), exists = io.exists || ((f) => fs.existsSync(ENG + f)), write = io.write || ((f, s) => fs.writeFileSync(ENG + f, s)), read = io.read || readJson, flyIt = io.fly || fly;
    const mode = argv[0];
    if (mode !== "smoke" && mode !== "dev" && mode !== "held") { log("usage: takeEvadePairs.mjs smoke | dev [--write] | held --write"); return 2; }
    for (const a of argv.slice(1)) if (a !== "--write") { log(`takeEvadePairs: unknown argument ${a}`); return 2; }
    const wr = argv.includes("--write");
    if (mode === "smoke" && wr) { log("takeEvadePairs: smoke is never recorded"); return 2; }
    if (mode === "dev" && wr && exists(DEV_FILE)) { log(`takeEvadePairs: ${DEV_FILE} exists; DEV is recorded once and a second record is refused`); return 2; }
    if (mode === "held" && !wr && !io.heldSet) { log("takeEvadePairs: the HELD set is read once and the read is recorded; run held with --write"); return 2; }
    if (mode === "held" && wr && exists(HELD_FILE)) { log(`takeEvadePairs: ${HELD_FILE} exists; the HELD set is read once and a second read is refused`); return 2; }
    if (mode === "held") {
        const dev = read(DEV_FILE);
        if (!dev) { log(`takeEvadePairs: ${DEV_FILE} is missing; HELD is flown only after DEV is recorded`); return 2; }
        if (dev.set !== "dev" || !dev.rules || dev.rules.replicates !== true) { log("takeEvadePairs: DEV did not replicate (R0) or is not a DEV record; HELD is not flown by this registration"); return 2; }
        if (!Array.isArray(dev.checks) || dev.checks.length) { log("takeEvadePairs: DEV has a failed check (or records none), so its read is void; HELD is not flown by this registration"); return 2; }
    }
    const L = loadRuns(io.read); if (L.error) { log("takeEvadePairs: " + L.error); return 2; }
    const finders = FINDERS.map((id) => L.runs.find((r) => r.id === id));   // loadRuns refuses unless every one of the twelve runs exists
    const G = L.runs[0].gen0, name = mode === "smoke" ? "smoke" : mode === "dev" ? (io.devSet || "dev") : (io.heldSet || "held"), arms = armsOf(G, finders), uSides = uSidesOf(finders), pps = ppsOf(arms), uus = uusOf(uSides), steps = stepsOf(arms, G, finders);
    const flown = flyIt(arms, pps, uus, steps, G, name), rules = rulesOf(flown.rows, flown.pps, flown.uus, flown.steps), checks = checksOf({ rows: flown.rows, pps: flown.pps, uus: flown.uus, steps: flown.steps, arms, uSides, identity: flown.identity, equal: flown.equal, G, runs: L.runs, count: SETS[name].count, finders });
    for (const l of reportLines(flown.rows, flown.pps, flown.uus, flown.steps, rules, name)) log(l);
    if (checks.length) log("  CHECKS FAILED, NOT WEIGHED: " + checks.join("; "));
    if (mode === "dev") log(checks.length ? "  DEV: a check FAILED, the read is void; HELD is NOT flown by this registration" : rules.replicates ? "  DEV: R0 holds; HELD may be flown (node tools/ship/takeEvadePairs.mjs held --write)" : "  DEV: R0 FAILS; HELD is NOT flown by this registration");
    if (wr) {
        const file = mode === "dev" ? DEV_FILE : HELD_FILE;
        write(file, JSON.stringify({ mode, set: name, first: SETS[name].first, count: SETS[name].count, rules, rows: flown.rows, pps: flown.pps, uus: flown.uus, steps: flown.steps, checks }, null, 1) + "\n"); log(`  written ${file}`);
    }
    return checks.length ? 1 : 0;
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) process.exit(command(process.argv.slice(2)));
}
