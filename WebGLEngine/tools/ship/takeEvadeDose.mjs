// WebGLEngine/tools/ship/takeEvadeDose.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is brain/SUB_EVADE_DOSE_WIP.md, the gate tools/ship/takeEvadeDose-selfcheck.mjs)
//   node tools/ship/takeEvadeDose.mjs smoke                 the 20 arms and 17 steps on geometries 1 to 4; never recorded, free to read: the command runs
//   node tools/ship/takeEvadeDose.mjs dev  [--write]        the DEV read on geometries 102001 to 102024; --write records brain/subEvadeDoseDev.json once; DEV decides whether HELD is spent (rule R0)
//   node tools/ship/takeEvadeDose.mjs held --write          the HELD read on geometries 103001 to 103024, flown ONCE: refuses without a recorded DEV that replicates, refuses without --write, refuses if brain/subEvadeDoseHeld.json exists
// THE QUESTION (brain/SUB_EVADE_DOSE_WIP.md): where on the way from generation 0's evade turn (1.71) to the ceiling (2.8) does the turn start to matter, is the curve monotone, where does it stop paying, and does it behave the same with a finder's speed and time on?
// THREE CURVES of arms flown against generation 0 (G): A (G with evadeTurn = the dose), B1 (G with league7001's evadeSpeed and evadeTime and the dose) and B2 (the same with league7103's), doses 1.9, 2.1, 2.3, 2.5, 2.65, 2.8 (B1 and B2 also at G's own turn): 20 arms.
// A STEP is the arm of a dose against the arm of the next dose down on its curve (17 of them): UP at paired z of 2 or more and an edge of 0.05 (T.DECISIVE) or more, DOWN at the mirror image, FLAT otherwise (Amendment A). R0 to R3 and the readings are rulesOf.
"use strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as T from "../../brain/subTournament.mjs";
import * as TA from "../../brain/subTactics.mjs";
import { loadRuns, signed, FIND_EDGE, FIND_Z } from "./takeSubLeague.mjs";
import { graft, rowOf, armsOf as turnArmsOf, TURN } from "./takeEvadeTurn.mjs";

const ENG = fileURLToPath(new URL("../../", import.meta.url));
export const DEV_FILE = "brain/subEvadeDoseDev.json", HELD_FILE = "brain/subEvadeDoseHeld.json";
export const SETS = Object.freeze({ smoke: Object.freeze({ first: 1, count: 4 }), dev: Object.freeze({ first: 102001, count: 24 }), held: Object.freeze({ first: 103001, count: 24 }) });
export const DOSES = Object.freeze([1.9, 2.1, 2.3, 2.5, 2.65, 2.8]), CURVES = Object.freeze(["A", "B1", "B2"]), CEILING = 2.8;
export const DONORS = Object.freeze({ B1: "league7001", B2: "league7103" });
export const MIN_Z = 2, MIN_EDGE = T.DECISIVE;

const f3 = (v) => signed(v, 3), d2 = (d) => d.toFixed(2);

/** The 20 arms from G (a theta) and the finders ([{ id, final }], at least league7001 and league7103): { id: "CURVE@dose", kind: "arm", curve, dose, theta }. Curve A is G with evadeTurn = the dose; B1 and B2 are G with the donor's evadeSpeed and evadeTime and evadeTurn = the dose, and also at G's own turn (the first arm of each). */
export function armsOf(G, finders) {
    const arms = [], make = (curve, dose, theta) => arms.push({ id: `${curve}@${d2(dose)}`, kind: "arm", curve, dose, theta });
    for (const d of DOSES) make("A", d, graft(G, { evadeTurn: d }, TURN));
    for (const curve of ["B1", "B2"]) {
        const donor = finders.find((f) => f.id === DONORS[curve]).final, base = graft(G, donor, ["evadeSpeed", "evadeTime"]);
        for (const d of [G.evadeTurn, ...DOSES]) make(curve, d, graft(base, { evadeTurn: d }, TURN));
    }
    return arms;
}

/** The 17 steps from the arms: for each curve, each arm against the arm of the next dose down (the higher dose is the first side): { id: "CURVE:hi>lo", curve, dose (the higher), lowerDose, hi, lo }. */
export function stepsOf(arms) {
    const steps = [];
    for (const curve of CURVES) {
        const a = arms.filter((x) => x.curve === curve).sort((x, y) => x.dose - y.dose);
        for (let i = 1; i < a.length; i++) steps.push({ id: `${curve}:${d2(a[i].dose)}>${d2(a[i - 1].dose)}`, curve, dose: a[i].dose, lowerDose: a[i - 1].dose, hi: a[i], lo: a[i - 1] });
    }
    return steps;
}

/** Flies the arms against G and the steps against each other on a set ("smoke", "dev" or "held"), plus what the checks need: G with its own evadeTurn against G (`identity`) and the ceiling arm of curve A against a copy of itself (`equal`). Returns { rows, steps, identity: { edge }, equal: { edge } }. */
export function fly(arms, steps, G, setName, opts = {}) {
    const geos = T.geometries(SETS[setName].count, SETS[setName].first), side = (id, theta) => T.makeSide(id, { theta }), g = side("G", G);
    const rows = arms.map((a) => ({ ...rowOf({ id: a.id, kind: "arm", finder: a.curve }, T.matchup(side(a.id, a.theta), g, geos, opts), geos), curve: a.curve, dose: a.dose }));
    const stepRows = steps.map((s) => ({ ...rowOf({ id: s.id, kind: "step", finder: s.curve }, T.matchup(side(s.hi.id, s.hi.theta), side(s.lo.id, s.lo.theta), geos, opts), geos), curve: s.curve, dose: s.dose, lowerDose: s.lowerDose }));
    const ceil = arms.find((a) => a.id === `A@${d2(CEILING)}`).theta;
    return { rows, steps: stepRows, identity: { edge: T.matchup(side("identity", graft(G, G, TURN)), g, geos, opts).summary.edge }, equal: { edge: T.matchup(side("equal1", ceil), side("equal2", ceil), geos, opts).summary.edge } };
}

/** The checks that VOID the read, by name and not weighed. ctx { rows, steps, arms, identity, equal, G, runs, count, finders }. */
export function checksOf({ rows, steps, arms, identity, equal, G, runs, count, finders }) {
    const c = [], all = [...rows, ...steps], turn = turnArmsOf(G, finders);
    if (all.some((r) => r.flew !== 2 * count || !r.seedsOk)) c.push("an arm or a step did not fly the same geometries");
    if (all.some((r) => !Number.isFinite(r.edge) || !Number.isFinite(r.z))) c.push("a score is non-finite");
    if (arms.some((a) => TA.THETA_NAMES.some((k) => TA.clampTheta(a.theta)[k] !== a.theta[k]))) c.push("an arm has a theta that clampTheta changes");
    if (runs.some((r) => JSON.stringify(r.gen0) !== JSON.stringify(G))) c.push("a run's generation 0 is not G");
    if (identity.edge !== 0) c.push(`G with its own evadeTurn has an edge of ${identity.edge} against G, not exactly 0`);
    if (equal.edge !== 0) c.push(`two equal thetas have an edge of ${equal.edge} against each other, not exactly 0`);
    const same = (id, tid) => { const a = arms.find((x) => x.id === id), b = turn.find((x) => x.id === tid); return !!a && !!b && JSON.stringify(a.theta) === JSON.stringify(b.theta); };
    if (!(same(`A@${d2(CEILING)}`, "GN:league7001") && same(`B1@${d2(CEILING)}`, "GT:league7001") && same(`B2@${d2(CEILING)}`, "GT:league7103"))) c.push("a ceiling arm is not the evade-turn command's arm");
    return c;
}

/** A step's label from its paired z and its edge: UP at a z of MIN_Z or more AND an edge of MIN_EDGE (the tournament's DECISIVE, 0.05) or more, DOWN at the mirror image, FLAT otherwise (Amendment A: a z of 12 on an edge of 0.007 is a difference too small to be a step). */
export const stepLabel = (z, edge) => (z >= MIN_Z && edge >= MIN_EDGE ? "UP" : z <= -MIN_Z && edge <= -MIN_EDGE ? "DOWN" : "FLAT");
/** The name of a threshold dose: LOW (2.1 or less), MID (2.5 or less), HIGH above that. */
export const thresholdName = (d) => (d <= 2.1 ? "LOW" : d <= 2.5 ? "MID" : "HIGH");
/** The least-squares slope of y on x. */
export const slopeOf = (xs, ys) => { const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n; let num = 0, den = 0; for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; } return num / den; };

/** R0 to R3 per curve, B minus A, the slope and the forecast quantities, from the arm rows and the step rows. */
export function rulesOf(rows, steps) {
    const arm = (curve) => rows.filter((r) => r.curve === curve).sort((x, y) => x.dose - y.dose), stp = (curve) => steps.filter((r) => r.curve === curve).sort((x, y) => x.dose - y.dose);
    const out = { curves: {} };
    for (const curve of CURVES) {
        const a = arm(curve), s = stp(curve), first = a.find((r) => r.finds), down = s.find((r) => stepLabel(r.z, r.edge) === "DOWN"), upIdx = s.map((r, i) => (stepLabel(r.z, r.edge) === "UP" ? i : -1)).filter((i) => i >= 0), lastUp = upIdx.length ? upIdx[upIdx.length - 1] : -1;
        out.curves[curve] = {
            threshold: first ? { dose: first.dose, name: thresholdName(first.dose) } : { dose: null, name: "NONE" },
            monotone: !down, reversal: down ? down.dose : null,
            saturation: lastUp === s.length - 1 ? null : lastUp < 0 ? a[0].dose : s[lastUp].dose,
            steps: s.map((r) => stepLabel(r.z, r.edge)),
        };
    }
    const ceilA = rows.find((r) => r.curve === "A" && r.dose === CEILING), ceilB1 = rows.find((r) => r.curve === "B1" && r.dose === CEILING);
    out.replicates = !!ceilA && !!ceilB1 && ceilA.finds && ceilB1.finds;
    const at = (curve, d) => rows.find((r) => r.curve === curve && r.dose === d);
    out.diff = { B1: DOSES.map((d) => at("B1", d).edge - at("A", d).edge), B2: DOSES.map((d) => at("B2", d).edge - at("A", d).edge) };
    const top = [2.5, 2.65, 2.8];
    out.slopeTop = slopeOf(top, top.map((d) => at("A", d).edge));
    const thr = (c) => (out.curves[c].threshold.dose === null ? Infinity : out.curves[c].threshold.dose);
    out.forecast = {
        aThresholdAtMost25: thr("A") <= 2.5, aThresholdLow: thr("A") <= 2.1, aMonotone: out.curves.A.monotone, allMonotone: CURVES.every((c) => out.curves[c].monotone),
        b1ThresholdLowerThanA: thr("B1") < thr("A"), b1AboveAFrom21: DOSES.filter((d) => d >= 2.1).every((d) => at("B1", d).edge > at("A", d).edge),
        b2WithinHalfOfA: DOSES.every((d) => Math.abs(at("B2", d).edge - at("A", d).edge) <= 0.5), aSaturatesBelowCeiling: out.curves.A.saturation !== null && out.curves.A.saturation < CEILING,
    };
    return out;
}

/** The report of a read, one string a line. */
export function reportLines(rows, steps, rules, name) {
    const S = SETS[name], L = [], what = { A: "G with evadeTurn = the dose", B1: `G with ${DONORS.B1}'s evadeSpeed and evadeTime and evadeTurn = the dose`, B2: `G with ${DONORS.B2}'s evadeSpeed and evadeTime and evadeTurn = the dose` };
    L.push(`[takeEvadeDose] ${name} read: geometries ${S.first} to ${S.first + S.count - 1}, both seats (${2 * S.count} duels an arm); ${rows.length} arms against G, generation 0 (the search-ping champion), ${steps.length} steps (a dose against the next dose down); an arm FINDS at edge >= ${FIND_EDGE} and z >= ${FIND_Z}, a step is UP at z >= ${MIN_Z} and edge >= ${MIN_EDGE}, DOWN at z <= -${MIN_Z} and edge <= -${MIN_EDGE}`);
    for (const curve of CURVES) {
        L.push(`  ${curve.padEnd(2)} ${what[curve]}`);
        for (const a of rows.filter((r) => r.curve === curve).sort((x, y) => x.dose - y.dose)) L.push(`    ${a.id.padEnd(9)} edge ${f3(a.edge)} +- ${a.se.toFixed(3)} (z ${a.z.toFixed(1)}), ${a.winsX}-${a.draws}-${a.winsY}  ${a.finds ? "FINDS" : "does not"}   seat A ${f3(a.seatA)}, seat B ${f3(a.seatB)}`);
        for (const s of steps.filter((r) => r.curve === curve).sort((x, y) => x.dose - y.dose)) L.push(`    step ${d2(s.dose)} over ${d2(s.lowerDose)}   edge ${f3(s.edge)} +- ${s.se.toFixed(3)} (z ${s.z.toFixed(1)})  ${stepLabel(s.z, s.edge)}`);
    }
    const c = rules.curves, nm = (x) => (x === null ? "none" : d2(x));
    L.push(`  R0 REPLICATES: the ceiling arms of A and B1 find: ${rules.replicates ? "yes" : "NO"}`);
    L.push(`  R1 THRESHOLD: ${CURVES.map((k) => `${k} ${c[k].threshold.dose === null ? "NONE" : `${c[k].threshold.name} (${d2(c[k].threshold.dose)})`}`).join(", ")}`);
    L.push(`  R2 MONOTONE: ${CURVES.map((k) => `${k} ${c[k].monotone ? "yes" : `no (reversal at ${d2(c[k].reversal)})`}`).join(", ")}`);
    L.push(`  R3 SATURATION: ${CURVES.map((k) => `${k} ${nm(c[k].saturation)}`).join(", ")}`);
    L.push(`  B MINUS A at each dose (${DOSES.map(d2).join(", ")}): B1 ${rules.diff.B1.map(f3).join(" ")}; B2 ${rules.diff.B2.map(f3).join(" ")}`);
    L.push(`  A SLOPE over the top three doses (2.50, 2.65, 2.80): ${signed(rules.slopeTop, 2)} edge points a radian`);
    const q = rules.forecast, yn = (b) => (b ? "yes" : "no");
    L.push(`  FORECAST QUANTITIES: A threshold at most 2.5 ${yn(q.aThresholdAtMost25)}, A threshold LOW ${yn(q.aThresholdLow)}, A monotone ${yn(q.aMonotone)}, all monotone ${yn(q.allMonotone)}, B1 threshold below A's ${yn(q.b1ThresholdLowerThanA)}, B1 above A from 2.1 ${yn(q.b1AboveAFrom21)}, B2 within 0.5 of A ${yn(q.b2WithinHalfOfA)}, A saturates below the ceiling ${yn(q.aSaturatesBelowCeiling)}`);
    return L;
}

const readJson = (f) => (fs.existsSync(ENG + f) ? JSON.parse(fs.readFileSync(ENG + f, "utf8")) : null);

/** The command: argv (after the program), io { log, exists, write, read, fly, devSet, heldSet } (defaults: the console and the file system; `read(path)` gives parsed JSON or null; `fly` replaces the flying and `devSet` / `heldSet` name a smaller set to fly in the DEV / HELD mode, all for the gate, which never flies 102001 to 103024). Returns the exit code. */
export function command(argv, io = {}) {
    const log = io.log || ((s) => console.log(s)), exists = io.exists || ((f) => fs.existsSync(ENG + f)), write = io.write || ((f, s) => fs.writeFileSync(ENG + f, s)), read = io.read || readJson, flyIt = io.fly || fly;
    const mode = argv[0];
    if (mode !== "smoke" && mode !== "dev" && mode !== "held") { log("usage: takeEvadeDose.mjs smoke | dev [--write] | held --write"); return 2; }
    for (const a of argv.slice(1)) if (a !== "--write") { log(`takeEvadeDose: unknown argument ${a}`); return 2; }
    const wr = argv.includes("--write");
    if (mode === "smoke" && wr) { log("takeEvadeDose: smoke is never recorded"); return 2; }
    if (mode === "dev" && wr && exists(DEV_FILE)) { log(`takeEvadeDose: ${DEV_FILE} exists; DEV is recorded once and a second record is refused`); return 2; }
    if (mode === "held" && !wr && !io.heldSet) { log("takeEvadeDose: the HELD set is read once and the read is recorded; run held with --write"); return 2; }
    if (mode === "held" && wr && exists(HELD_FILE)) { log(`takeEvadeDose: ${HELD_FILE} exists; the HELD set is read once and a second read is refused`); return 2; }
    if (mode === "held") {
        const dev = read(DEV_FILE);
        if (!dev) { log(`takeEvadeDose: ${DEV_FILE} is missing; HELD is flown only after DEV is recorded`); return 2; }
        if (dev.set !== "dev" || !dev.rules || dev.rules.replicates !== true) { log("takeEvadeDose: DEV did not replicate (R0) or is not a DEV record; HELD is not flown by this registration"); return 2; }
    }
    const L = loadRuns(io.read); if (L.error) { log("takeEvadeDose: " + L.error); return 2; }
    const finders = [DONORS.B1, DONORS.B2].map((id) => L.runs.find((r) => r.id === id));   // loadRuns refuses unless every one of the twelve runs exists
    const G = L.runs[0].gen0, name = mode === "smoke" ? "smoke" : mode === "dev" ? (io.devSet || "dev") : (io.heldSet || "held"), arms = armsOf(G, finders), steps = stepsOf(arms);
    const flown = flyIt(arms, steps, G, name), rules = rulesOf(flown.rows, flown.steps), checks = checksOf({ rows: flown.rows, steps: flown.steps, arms, identity: flown.identity, equal: flown.equal, G, runs: L.runs, count: SETS[name].count, finders });
    for (const l of reportLines(flown.rows, flown.steps, rules, name)) log(l);
    if (checks.length) log("  CHECKS FAILED, NOT WEIGHED: " + checks.join("; "));
    if (mode === "dev") log(rules.replicates ? "  DEV: R0 holds; HELD may be flown (node tools/ship/takeEvadeDose.mjs held --write)" : "  DEV: R0 FAILS; HELD is NOT flown by this registration");
    if (wr) {
        const file = mode === "dev" ? DEV_FILE : HELD_FILE;
        write(file, JSON.stringify({ mode, set: name, first: SETS[name].first, count: SETS[name].count, rules, rows: flown.rows, steps: flown.steps, checks }, null, 1) + "\n"); log(`  written ${file}`);
    }
    return checks.length ? 1 : 0;
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) process.exit(command(process.argv.slice(2)));
}
