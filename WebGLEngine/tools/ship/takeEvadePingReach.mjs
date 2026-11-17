// WebGLEngine/tools/ship/takeEvadePingReach.mjs -- UNNUMBERED (the version is chosen at ship time). THE GENERIC COMMAND of two registered reads: brain/SUB_EVADE_SHORT_WIP.md (takeEvadeShort.mjs: league7100 with pingEvery 4, 6 and 12) and brain/SUB_EVADE_PINGAWAY_WIP.md (takeEvadePingaway.mjs: league7001 and exploit7204 with pingEvery 16 and 30). Each of them is a SPEC (hunters, values, sets, the premise R0, the common values, the forecasts) handed to `build`; this file is not run on its own, and its gate is tools/ship/takeEvadePingReach-selfcheck.mjs (the specs' own constants and forecasts are the wrappers' gates).
// THE MATCHUPS, for each hunter h of the spec: OWN(h, v): h with pingEvery v against h (for each value v); and for each of the fourteen boats o that are not h: BASE(h, o): h against o, and ARM(h, v, o): h with pingEvery v against o, for each v. THE EFFECT of v for h against o is the PAIRED difference by geometry of ARM(h, v, o) over BASE(h, o) (`vOf`, `effectOf`); THE STEP from a value to the next higher is the paired difference of the arm at the higher value over the arm at the lower.
"use strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as T from "../../brain/subTournament.mjs";
import * as TA from "../../brain/subTactics.mjs";
import { loadRuns, decided, signed, FIND_Z } from "./takeSubLeague.mjs";
import { rowOf } from "./takeEvadeTurn.mjs";
import { vOf, effectOf, boatTheta, opponentsOf, BOATS } from "./takeEvadeAway.mjs";

const ENG = fileURLToPath(new URL("../../", import.meta.url));
export const DONOR = "league7100", COMPARATORS = Object.freeze(["league7001", "exploit7204"]);
export const GENERAL_AT = 12, COMMON_AT = 7, BAR_EDGE = 0.25;
export { decided, BOATS };

const f3 = (v) => signed(v, 3), v2 = (v) => v.toFixed(2);
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** The status of an OWN at the smaller bar. */
export const statusAt = (r) => (r.identical ? "IDENTICAL" : r.edge >= BAR_EDGE && r.z >= FIND_Z ? "PAYS" : r.edge <= -BAR_EDGE && r.z <= -FIND_Z ? "COSTS" : "NEUTRAL");
/** An EFFECT (a paired difference of an arm over its base) at the same bar: HELPS, HURTS or NEUTRAL. */
export const effectStatus = (e) => (e.edge >= BAR_EDGE && e.z >= FIND_Z ? "HELPS" : e.edge <= -BAR_EDGE && e.z <= -FIND_Z ? "HURTS" : "NEUTRAL");
/** A STEP (a paired difference of the arm at a higher value over the arm at the next lower) at the same bar: RISES, FALLS or FLAT. */
export const stepStatus = (e) => (e.edge >= BAR_EDGE && e.z >= FIND_Z ? "RISES" : e.edge <= -BAR_EDGE && e.z <= -FIND_Z ? "FALLS" : "FLAT");
export const labelOf = (n) => (n >= GENERAL_AT ? "GENERAL" : n >= COMMON_AT ? "COMMON" : "NARROW");

/** The command of a spec: { tool, devFile, heldFile, sets: { dev, held } (each { first, count }), hunters, values (increasing), r0: { kind: "lead" } or { kind: "own", value }, common (values whose joint HELPS give a hunter's common opponents), across (a value, or null: the opponents helped at it by every hunter that meets them), head, prefix, forecast (out => object of booleans), forecastLine ((q, v2) => text) }. Returns { SETS, DEV_FILE, HELD_FILE, HUNTERS, VALUES, matchupsOf, equalPair, fly, checksOf, rulesOf, reportLines, command }. */
export function build(spec) {
    const SETS = Object.freeze({ smoke: Object.freeze({ first: 1, count: 4 }), dev: Object.freeze({ ...spec.sets.dev }), held: Object.freeze({ ...spec.sets.held }) });
    const HUNTERS = Object.freeze([...spec.hunters]), VALUES = Object.freeze([...spec.values]), DEV_FILE = spec.devFile, HELD_FILE = spec.heldFile, P = spec.prefix, tool = spec.tool;
    const tag = (h, v) => (HUNTERS.length > 1 ? `${h} ${v2(v)}` : v2(v)), ownId = (h, v) => `OWN:${h}@${v2(v)}`, baseId = (h, o) => `BASE:${h}>${o}`, armId = (h, v, o) => `ARM:${h}@${v2(v)}>${o}`;

    /** The matchups: { id, kind ("OWN", "BASE" or "ARM"), hunter, opponent (null for OWN), value (null for BASE), hi: { id, theta }, lo: { id, theta } }, a hunter at a time in the order of the spec: its OWN for each value, then for each opponent in the order of BOATS its BASE and its ARM for each value; the arm (or the hunter) is the first side. */
    function matchupsOf(runs, G) {
        const out = [];
        for (const h of HUNTERS) {
            const H = boatTheta(runs, G, h), arm = (v) => ({ id: `U:${h}@${v2(v)}`, theta: { ...H, pingEvery: v } });
            for (const v of VALUES) out.push({ id: ownId(h, v), kind: "OWN", hunter: h, opponent: null, value: v, hi: arm(v), lo: { id: `U:${h}`, theta: { ...H } } });
            for (const o of opponentsOf(h)) {
                out.push({ id: baseId(h, o), kind: "BASE", hunter: h, opponent: o, value: null, hi: { id: `U:${h}`, theta: { ...H } }, lo: { id: `O:${o}`, theta: boatTheta(runs, G, o) } });
                for (const v of VALUES) out.push({ id: armId(h, v, o), kind: "ARM", hunter: h, opponent: o, value: v, hi: arm(v), lo: { id: `O:${o}`, theta: boatTheta(runs, G, o) } });
            }
        }
        return out;
    }

    /** The two sides of the equal-thetas flight: U(league7100) and a copy of it (their edge against each other is exactly 0). */
    const equalPair = (runs) => { const D = { ...runs.find((r) => r.id === DONOR).final }; return [D, { ...D }]; };

    /** Flies the matchups on a set ("smoke", "dev" or "held"), plus U(league7100) against a copy of itself (`equal`). Returns { rows, equal: { edge, thetas } }. A row carries `v` (the per-geometry values), `identical`, and the lower side's evadeSpeed and evadeTurn. */
    function fly(matchups, runs, setName, opts = {}) {
        const geos = T.geometries(SETS[setName].count, SETS[setName].first), side = (id, theta) => T.makeSide(id, { theta }), [e1, e2] = equalPair(runs), eq = [side("equal1", e1), side("equal2", e2)];
        const rows = matchups.map((m) => { const mt = T.matchup(side(m.hi.id, m.hi.theta), side(m.lo.id, m.lo.theta), geos, opts); return { ...rowOf({ id: m.id, kind: m.kind, finder: m.hunter }, mt, geos), hunter: m.hunter, opponent: m.opponent, value: m.value, v: vOf(mt.fights), loSpeed: m.lo.theta.evadeSpeed, loTurn: m.lo.theta.evadeTurn, identical: JSON.stringify(m.hi.theta) === JSON.stringify(m.lo.theta) }; });
        return { rows, equal: { edge: T.matchup(eq[0], eq[1], geos, opts).summary.edge, thetas: [eq[0].theta, eq[1].theta] } };
    }

    /** The checks that VOID the read, by name and not weighed; every one is an identity or a file's own number. ctx { rows, matchups, equal, G, runs, count }. */
    function checksOf({ rows, matchups, equal, G, runs, count }) {
        const c = [];
        if (rows.some((r) => r.flew !== 2 * count || !r.seedsOk)) c.push("a matchup did not fly the same geometries");
        if (rows.some((r) => !Number.isFinite(r.edge) || !Number.isFinite(r.z))) c.push("a score is non-finite");
        if (matchups.some((m) => [m.hi, m.lo].some((s) => TA.THETA_NAMES.some((k) => TA.clampTheta(s.theta)[k] !== s.theta[k])))) c.push("a side has a theta that clampTheta changes");
        if (runs.some((r) => JSON.stringify(r.gen0) !== JSON.stringify(G))) c.push("a run's generation 0 is not G");
        if (equal.edge !== 0) c.push(`two equal thetas have an edge of ${equal.edge} against each other, not exactly 0`);
        const same = (a, b) => JSON.stringify(a) === JSON.stringify(b), fin = (id) => boatTheta(runs, G, id);
        if (!matchups.every((m) => same(m.lo.theta, m.kind === "OWN" ? fin(m.hunter) : fin(m.opponent)) && (m.kind !== "BASE" || same(m.hi.theta, fin(m.hunter))))) c.push("a side is not the boat's final theta of the files (the hunter's for an OWN, the opponent's for a BASE or an ARM), or a BASE's first side is not the hunter's final");
        if (!matchups.every((m) => m.kind === "BASE" || same(m.hi.theta, { ...fin(m.hunter), pingEvery: m.value }))) c.push("an arm is not its hunter's final with its pingEvery set to its value and nothing else moved");
        if (!HUNTERS.every((h) => same(matchups.filter((m) => m.kind === "OWN" && m.hunter === h).map((m) => m.value), VALUES) && opponentsOf(h).every((o) => same(matchups.filter((m) => m.kind === "ARM" && m.hunter === h && m.opponent === o).map((m) => m.value), VALUES)))) c.push("the values are not the registered values on every OWN and every opponent");
        if (rows.some((r) => !Array.isArray(r.v) || r.v.length !== count || r.v.some((x) => !Number.isFinite(x)) || Math.abs(mean(r.v) - r.edge) > 1e-9)) c.push("a row's per-geometry values are not as many as the set's geometries or do not average to its edge");
        if (!same(matchups.map((m) => m.id), HUNTERS.flatMap((h) => [...VALUES.map((v) => ownId(h, v)), ...opponentsOf(h).flatMap((o) => [baseId(h, o), ...VALUES.map((v) => armId(h, v, o))])]))) c.push("the matchups are not each hunter's OWN and then each opponent's BASE and its ARMs, in order");
        if (rows.some((r) => r.identical && r.edge !== 0)) c.push("an identical arm has an edge other than exactly 0");
        return c;
    }

    /** R0, the reach, the cost, the common opponents, the headline, the cells and the forecast quantities from the rows. */
    function rulesOf(rows) {
        const row = (id) => rows.find((r) => r.id === id), out = { hunters: {}, cells: [] }, pack = (e, st) => ({ edge: e.edge, se: e.se, z: e.z, status: st(e) });
        for (const h of HUNTERS) {
            const own = {}, opps = opponentsOf(h);
            for (const v of VALUES) { const r = row(ownId(h, v)); own[v] = { edge: r.edge, se: r.se, z: r.z, status: statusAt(r) }; }
            const opponents = opps.map((o) => {
                const b = row(baseId(h, o)), arms = VALUES.map((v) => row(armId(h, v, o)));
                return { opponent: o, speed: b.loSpeed, turn: b.loTurn, baseEdge: b.edge, effects: arms.map((a) => pack(effectOf(a.v, b.v), effectStatus)), steps: VALUES.slice(1).map((v, i) => ({ from: VALUES[i], to: v, ...pack(effectOf(arms[i + 1].v, arms[i].v), stepStatus) })) };
            });
            const reach = VALUES.map((v, i) => { const helps = opponents.filter((e) => e.effects[i].status === "HELPS").map((e) => e.opponent), hurts = opponents.filter((e) => e.effects[i].status === "HURTS").map((e) => e.opponent); return { value: v, helps, hurts, n: helps.length, label: labelOf(helps.length) }; });
            const common = opps.filter((o) => spec.common.every((v) => reach[VALUES.indexOf(v)].helps.includes(o)));
            const rises = VALUES.slice(1).map((v, i) => opponents.filter((e) => e.steps[i].status === "RISES").map((e) => e.opponent)), falls = VALUES.slice(1).map((v, i) => opponents.filter((e) => e.steps[i].status === "FALLS").map((e) => e.opponent));
            out.hunters[h] = { own, opponents, reach, common, rises, falls };
            for (const e of opponents) VALUES.forEach((v, i) => out.cells.push({ hunter: h, value: v, opponent: e.opponent, baseEdge: e.baseEdge, edge: e.effects[i].edge, se: e.effects[i].se, z: e.effects[i].z, status: e.effects[i].status }));
        }
        out.r0 = spec.r0.kind === "lead"
            ? { kind: "lead", items: COMPARATORS.map((c) => { const r = row(baseId(DONOR, c)); return { name: c, edge: r.edge, z: r.z, ok: decided(r) && r.edge > 0 }; }) }
            : { kind: "own", items: HUNTERS.map((h) => ({ name: h, edge: out.hunters[h].own[spec.r0.value].edge, z: out.hunters[h].own[spec.r0.value].z, ok: out.hunters[h].own[spec.r0.value].status === "PAYS" })) };
        out.replicates = out.r0.items.every((x) => x.ok);
        out.hurtsSomewhere = HUNTERS.some((h) => out.hunters[h].reach.some((r) => r.hurts.length > 0));
        out.across = spec.across === null ? null : BOATS.filter((o) => { const met = HUNTERS.filter((h) => h !== o); return met.length > 0 && met.every((h) => out.hunters[h].reach[VALUES.indexOf(spec.across)].helps.includes(o)); });
        out.headline = `${spec.head}: ${HUNTERS.map((h) => `${HUNTERS.length > 1 ? h + " " : ""}${out.hunters[h].reach.map((r) => `${v2(r.value)} ${r.label}`).join(", ")}`).join("; ")}${out.hurtsSomewhere ? ", HURTS SOMEWHERE" : ""}`;
        out.forecast = spec.forecast(out);
        return out;
    }

    /** The report of a read, one string a line. */
    function reportLines(rows, rules, name) {
        const S = SETS[name], L = [], nm = (a) => (a.length ? a.join(", ") : "none"), zf = (z) => (Number.isFinite(z) ? z.toFixed(1) : String(z)), eff = (e) => `${f3(e.edge)} +- ${e.se.toFixed(3)} (z ${zf(e.z)}) ${e.status}`, row = (id) => rows.find((r) => r.id === id);
        L.push(`[${tool}] ${name} read: geometries ${S.first} to ${S.first + S.count - 1}, both seats (${2 * S.count} duels a matchup); ${rows.length} matchups; ${HUNTERS.length > 1 ? "the hunters" : "the hunter"} ${HUNTERS.join(" and ")} with pingEvery ${VALUES.map(v2).join(", ")}, against the fourteen of the fifteen boats that are not itself; BASE is the hunter, an ARM the hunter with that pingEvery; the EFFECT is the paired difference by geometry of the ARM over the BASE and HELPS at an edge of ${BAR_EDGE} and a z of ${FIND_Z} in favour, HURTS at the same bar against; a STEP is the arm at a value over the arm at the next lower (RISES, FALLS, FLAT); an OWN PAYS or COSTS at the same bar`);
        for (const h of HUNTERS) {
            L.push(`  HUNTER ${h}`);
            for (const v of VALUES) { const r = row(ownId(h, v)); L.push(`    ${r.id.padEnd(34)} edge ${f3(r.edge)} +- ${r.se.toFixed(3)} (z ${r.z.toFixed(1)}), ${r.winsX}-${r.draws}-${r.winsY}  seat A ${f3(r.seatA)}, seat B ${f3(r.seatB)}  ${statusAt(r)}`); }
            for (const e of rules.hunters[h].opponents) L.push(`    against ${e.opponent.padEnd(11)} (evade ${v2(e.speed)}, ${v2(e.turn)})  BASE ${f3(e.baseEdge)}${VALUES.map((v, i) => `  EFFECT ${v2(v)} ${eff(e.effects[i])}`).join("")}${e.steps.map((s) => `  STEP ${v2(s.from)}>${v2(s.to)} ${eff(s)}`).join("")}`);
        }
        L.push(`  R0 REPLICATES: ${rules.r0.kind === "lead" ? `${DONOR} beats ${rules.r0.items.map((x) => `${x.name} (${f3(x.edge)}, z ${x.z.toFixed(1)})`).join(" and ")}, decided` : `OWN(${v2(spec.r0.value)}) PAYS for ${rules.r0.items.map((x) => `${x.name} (${f3(x.edge)}, z ${x.z.toFixed(1)})`).join(" and ")}`}: ${rules.replicates ? "yes" : "NO"}`);
        for (const h of HUNTERS) for (const r of rules.hunters[h].reach) L.push(`  ${P}1 THE REACH OF ${tag(h, r.value)}: HELPS against ${r.n} of ${rules.hunters[h].opponents.length} opponents  ->  ${r.label}  (HELPS: ${nm(r.helps)}; HURTS: ${nm(r.hurts)})`);
        L.push(`  ${P}2 THE COST: ${rules.hurtsSomewhere ? "HURTS SOMEWHERE" : "none"}`);
        for (const h of HUNTERS) L.push(`  ${P}3 THE COMMON OPPONENTS${HUNTERS.length > 1 ? ` OF ${h}` : ""} (HELPED at ${spec.common.map(v2).join(" and ")}): ${nm(rules.hunters[h].common)}`);
        if (rules.across !== null) L.push(`  ${P}3 THE COMMON OPPONENTS ACROSS THE HUNTERS (HELPED at ${v2(spec.across)} by every hunter that meets them): ${nm(rules.across)}`);
        L.push(`  ${P}4 THE HEADLINE: ${rules.headline}`);
        for (const h of HUNTERS) VALUES.slice(1).forEach((v, i) => L.push(`  THE STEP${HUNTERS.length > 1 ? ` OF ${h}` : ""} ${v2(VALUES[i])}>${v2(v)} (reported): RISES against ${nm(rules.hunters[h].rises[i])}; FALLS against ${nm(rules.hunters[h].falls[i])}`));
        L.push(`  FORECAST QUANTITIES: ${spec.forecastLine(rules.forecast, v2)}`);
        return L;
    }

    const readJson = (f) => (fs.existsSync(ENG + f) ? JSON.parse(fs.readFileSync(ENG + f, "utf8")) : null);

    /** The command: argv (after the program), io { log, exists, write, read, fly, devSet, heldSet } (defaults: the console and the file system; `read(path)` gives parsed JSON or null; `fly` replaces the flying and `devSet` / `heldSet` name a smaller set to fly in the DEV / HELD mode, all for the gate, which never flies the registered sets). Returns the exit code. */
    function command(argv, io = {}) {
        const log = io.log || ((s) => console.log(s)), exists = io.exists || ((f) => fs.existsSync(ENG + f)), write = io.write || ((f, s) => fs.writeFileSync(ENG + f, s)), read = io.read || readJson, flyIt = io.fly || fly;
        const mode = argv[0];
        if (mode !== "smoke" && mode !== "dev" && mode !== "held") { log(`usage: ${tool}.mjs smoke | dev [--write] | held --write`); return 2; }
        for (const a of argv.slice(1)) if (a !== "--write") { log(`${tool}: unknown argument ${a}`); return 2; }
        const wr = argv.includes("--write");
        if (mode === "smoke" && wr) { log(`${tool}: smoke is never recorded`); return 2; }
        if (mode === "dev" && wr && exists(DEV_FILE)) { log(`${tool}: ${DEV_FILE} exists; DEV is recorded once and a second record is refused`); return 2; }
        if (mode === "held" && !wr && !io.heldSet) { log(`${tool}: the HELD set is read once and the read is recorded; run held with --write`); return 2; }
        if (mode === "held" && wr && exists(HELD_FILE)) { log(`${tool}: ${HELD_FILE} exists; the HELD set is read once and a second read is refused`); return 2; }
        if (mode === "held") {
            const dev = read(DEV_FILE);
            if (!dev) { log(`${tool}: ${DEV_FILE} is missing; HELD is flown only after DEV is recorded`); return 2; }
            if (dev.set !== "dev" || !dev.rules || dev.rules.replicates !== true) { log(`${tool}: DEV did not replicate (R0) or is not a DEV record; HELD is not flown by this registration`); return 2; }
            if (!Array.isArray(dev.checks) || dev.checks.length) { log(`${tool}: DEV has a failed check (or records none), so its read is void; HELD is not flown by this registration`); return 2; }
        }
        const L = loadRuns(io.read); if (L.error) { log(`${tool}: ` + L.error); return 2; }
        const G = L.runs[0].gen0, name = mode === "smoke" ? "smoke" : mode === "dev" ? (io.devSet || "dev") : (io.heldSet || "held"), matchups = matchupsOf(L.runs, G);   // loadRuns refuses unless every one of the fourteen runs exists
        const flown = flyIt(matchups, L.runs, name), rules = rulesOf(flown.rows), checks = checksOf({ rows: flown.rows, matchups, equal: flown.equal, G, runs: L.runs, count: SETS[name].count });
        for (const l of reportLines(flown.rows, rules, name)) log(l);
        if (checks.length) log("  CHECKS FAILED, NOT WEIGHED: " + checks.join("; "));
        if (mode === "dev") log(checks.length ? "  DEV: a check FAILED, the read is void; HELD is NOT flown by this registration" : rules.replicates ? `  DEV: R0 holds; HELD may be flown (node tools/ship/${tool}.mjs held --write)` : "  DEV: R0 FAILS; HELD is NOT flown by this registration");
        if (wr) {
            const file = mode === "dev" ? DEV_FILE : HELD_FILE;
            write(file, JSON.stringify({ mode, set: name, first: SETS[name].first, count: SETS[name].count, rules, rows: flown.rows, checks }, null, 1) + "\n"); log(`  written ${file}`);
        }
        return checks.length ? 1 : 0;
    }

    return { SETS, DEV_FILE, HELD_FILE, HUNTERS, VALUES, matchupsOf, equalPair, fly, checksOf, rulesOf, reportLines, command };
}

/** Runs a spec's command when its file is the program (the wrappers call this; importing a wrapper runs nothing). */
export async function runIfMain(importMetaUrl, command) {
    if (typeof process !== "undefined" && Array.isArray(process.argv)) {
        const { pathToFileURL } = await import("node:url");
        if (importMetaUrl === pathToFileURL(process.argv[1] || "").href) process.exit(command(process.argv.slice(2)));
    }
}
