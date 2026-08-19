// WebGLEngine/physics/consistencyFleet.mjs — v3285
// ---------------------------------------------------------------------------------------------------------------
// THE CONSISTENCY BOARD, SPREAD ACROSS THE FLEET — a peer runs ONE ROUTE, submits the number, and the hub
// assembles pairs from whatever has come in. The board's expensive pairs stop being a thing one machine grinds
// through serially, and a route can be measured on hardware that never runs the other route at all.
//
// *** THE MISTAKE THIS FILE EXISTS TO REFUSE. *** The moment the board goes fleet-wide, the tempting move is to
// run THE SAME ROUTE on two machines, watch the numbers agree, and record a pair. They will agree -- the code is
// deterministic and seeded, so they had better -- and the agreement means NOTHING about the physics. That is ONE
// MECHANISM RUN TWICE: a reproducibility check, which the zero-tolerance kernels already do far better, wearing
// the costume of a consistency pair. A board that accepted it would start certifying agreements that carry no
// information, which is worse than having no board, because it looks like evidence.
//
// So the admission rule is enforced in code, not prose: TWO ROUTES WITH THE SAME `mechanism` ID CANNOT FORM A
// PAIR, no matter how many different machines they ran on. Different hosts are recorded as a BONUS dimension of
// independence -- a genuine pair measured on two toolchains is stronger than the same pair on one -- but hosts
// are never a substitute for mechanism.
//
// AND THE HUB RE-GRADES. A submitted report carries a MEASUREMENT and never a verdict; the hub recomputes the
// agreement itself. This is the rule the phone already lives under, the rule the boot sidecar enforces on
// producers, and the rule the proposer registry enforces on proposers. A peer that could submit {agree:true}
// would be grading the fleet's physics from the least supervised process in it.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { pairIsingTc, pairTrapDeltaF, pairLbmViscosity, pairDiffusion } from "./consistency.mjs";

export const SCHEMA_VERSION = 1;
const VERDICT_KEYS = ["agree", "pass", "ok", "verdict", "consistent", "valid", "result", "status"];

/**
 * The routes a peer can be asked to run. Each is ONE SIDE of a pair: that is the point -- a machine that runs
 * only `fisher-amplitude-ratio` still contributes, and never has to run the other side.
 *
 * `pair` groups them; `mechanism` is what the independence rule reads; `side` is only a label for reporting.
 */
export const ROUTES = {
    "ising-tc/binder": { pair: "Ising T_c", side: "a", mechanism: "binder-cumulant", tol: 0.09,
        run: (o = {}) => pairIsingTc({ fast: true, ...o }).a.value },
    "ising-tc/fisher": { pair: "Ising T_c", side: "b", mechanism: "fisher-amplitude-ratio", tol: 0.09,
        run: (o = {}) => pairIsingTc({ fast: true, ...o }).b.value },
    "trap-df/jarzynski": { pair: "trap dF", side: "a", mechanism: "jarzynski-forward-average", tol: 0.08,
        run: (o = {}) => pairTrapDeltaF({ fast: true, ...o }).a.value },
    "trap-df/crooks": { pair: "trap dF", side: "b", mechanism: "crooks-log-ratio", tol: 0.08,
        run: (o = {}) => pairTrapDeltaF({ fast: true, ...o }).b.value },
    "lbm-nu/configured": { pair: "LBM viscosity", side: "a", mechanism: "lbm-configured-tau", tol: null,
        run: (o = {}) => pairLbmViscosity({ fast: true, ...o }).a.value },
    "lbm-nu/shear-decay": { pair: "LBM viscosity", side: "b", mechanism: "lbm-shear-decay", tol: null,
        run: (o = {}) => pairLbmViscosity({ fast: true, ...o }).b.value },
    "diffusion/einstein": { pair: "LJ self-diffusion D", side: "a", mechanism: "einstein-msd", tol: 0.085,
        run: (o = {}) => pairDiffusion({ fast: true, ...o }).a.value },
    "diffusion/green-kubo": { pair: "LJ self-diffusion D", side: "b", mechanism: "green-kubo-vacf", tol: 0.085,
        run: (o = {}) => pairDiffusion({ fast: true, ...o }).b.value },
};

/**
 * Run one route and package it. A REPORT CARRIES A MEASUREMENT AND NEVER A VERDICT -- verdict-shaped keys are
 * refused at build time, the same way the boot sidecar refuses them, so a helpful peer cannot decide the physics.
 */
export function runRoute(routeId, { host = "unknown", opts = {}, extra = {} } = {}) {
    const r = ROUTES[routeId];
    if (!r) throw new Error("unknown route: " + routeId);
    const bad = Object.keys(extra).filter((k) => VERDICT_KEYS.includes(k.toLowerCase()));
    if (bad.length) throw new Error("a route report carries a measurement, never a verdict -- refused keys: " + bad.join(", "));
    const t0 = Date.now();
    const value = r.run(opts);
    return { kind: "swek-consistency-route", schemaVersion: SCHEMA_VERSION, routeId,
             pair: r.pair, side: r.side, mechanism: r.mechanism, value,
             host, at: new Date().toISOString(), ms: Date.now() - t0, ...extra };
}

/** Fold a submitted route report into fleet state. Pure; the caller persists. */
export function foldRoute(state, report) {
    const out = state && typeof state === "object" ? { ...state } : { kind: "swek-consistency-fleet", routes: {}, rejected: [] };
    out.routes = { ...(out.routes || {}) };
    out.rejected = [...(out.rejected || [])];
    const problems = [];
    if (!report || report.kind !== "swek-consistency-route") problems.push("not a consistency-route report");
    else {
        if (report.schemaVersion !== SCHEMA_VERSION) problems.push("schemaVersion " + report.schemaVersion);
        if (!ROUTES[report.routeId]) problems.push("unknown routeId " + report.routeId);
        if (!Number.isFinite(report.value)) problems.push("value is not a finite number");
        if (!report.host) problems.push("no host -- an anonymous measurement cannot be audited");
        const bad = Object.keys(report).filter((k) => VERDICT_KEYS.includes(k.toLowerCase()));
        if (bad.length) problems.push("report carries a VERDICT (" + bad.join(", ") + ") -- peers measure, the hub grades");
        // the mechanism a peer CLAIMS is not consulted: it is looked up from the routeId locally, so a peer
        // cannot relabel its mechanism to make an inadmissible pair look admissible.
    }
    if (problems.length) { out.rejected.push({ routeId: (report && report.routeId) || "(none)", why: problems.join("; ") }); return out; }
    const r = ROUTES[report.routeId];
    const key = report.routeId + " @ " + report.host;
    out.routes[key] = { routeId: report.routeId, pair: r.pair, side: r.side,
                        mechanism: r.mechanism,     // LOCAL lookup, never the submitted field
                        value: report.value, host: report.host, at: report.at, ms: report.ms };
    return out;
}

/** Is this a legitimate pair? The rule, in code. */
export function admissible(a, b) {
    if (!a || !b) return { ok: false, why: "only one side has reported" };
    if (a.pair !== b.pair) return { ok: false, why: "different constants" };
    if (a.mechanism === b.mechanism)
        return { ok: false, why: "SAME MECHANISM (" + a.mechanism + ") -- this is reproducibility across " +
                 (a.host === b.host ? "one host" : "hosts, which does not make it two mechanisms") +
                 ", not a consistency pair" };
    return { ok: true, why: "two mechanisms" + (a.host !== b.host ? ", and two hosts -- independence in both dimensions" : ", one host") };
}

/**
 * Assemble every pair the fleet can currently support, and say plainly which ones it cannot. THE HUB RECOMPUTES
 * AGREEMENT FROM THE TWO NUMBERS; nothing submitted is taken as a verdict.
 */
export function assemble(state, { tolFor = null } = {}) {
    const rows = Object.values((state && state.routes) || {});
    const byPair = {};
    for (const r of rows) (byPair[r.pair] ||= []).push(r);
    const pairs = [], incomplete = [], reproducibility = [];
    for (const [pair, list] of Object.entries(byPair)) {
        const sides = { a: list.filter((r) => r.side === "a"), b: list.filter((r) => r.side === "b") };
        if (!sides.a.length || !sides.b.length) {
            // SAME-MECHANISM duplicates are surfaced as what they actually are, rather than silently ignored:
            // a machine that ran a route twice did useful work, and calling it nothing would hide that too.
            const dupes = list.filter((r, i) => list.findIndex((x) => x.mechanism === r.mechanism) !== i);
            if (dupes.length) reproducibility.push({ pair, mechanism: dupes[0].mechanism,
                hosts: [...new Set(list.filter((r) => r.mechanism === dupes[0].mechanism).map((r) => r.host))],
                values: list.filter((r) => r.mechanism === dupes[0].mechanism).map((r) => r.value),
                note: "same route on more than one host: a REPRODUCIBILITY result, not a consistency pair" });
            incomplete.push({ pair, have: list.map((r) => r.routeId + "@" + r.host),
                              why: "only side " + (sides.a.length ? "a" : "b") + " has reported -- INCOMPLETE is not AGREE" });
            continue;
        }
        const a = sides.a[0], b = sides.b[0];
        const adm = admissible(a, b);
        if (!adm.ok) { incomplete.push({ pair, why: adm.why }); continue; }
        const tol = tolFor ? tolFor(pair) : (ROUTES[a.routeId].tol != null ? ROUTES[a.routeId].tol : Math.abs(a.value) * 0.05);
        const diff = Math.abs(a.value - b.value);
        pairs.push({ pair, a, b, diff, tol, agree: diff < tol,          // <-- computed HERE, by the hub
                     crossHost: a.host !== b.host, independence: adm.why });
    }
    return { pairs, incomplete, reproducibility, routesHeld: rows.length,
             hosts: [...new Set(rows.map((r) => r.host))] };
}

export function fleetLines(asm) {
    const out = [];
    out.push(`fleet board: ${asm.pairs.length} pair(s) assembled from ${asm.routesHeld} route report(s) across ${asm.hosts.length} host(s)`);
    for (const p of asm.pairs) out.push(`  ${p.agree ? "AGREE" : "DISAGREE"} ${p.pair}: ${p.a.value.toFixed(4)} (${p.a.mechanism}@${p.a.host}) vs ${p.b.value.toFixed(4)} (${p.b.mechanism}@${p.b.host}) | diff ${p.diff.toFixed(4)} tol ${p.tol.toFixed(4)}${p.crossHost ? " | CROSS-HOST" : ""}`);
    for (const i of asm.incomplete) out.push(`  incomplete ${i.pair}: ${i.why}`);
    for (const r of asm.reproducibility) out.push(`  reproducibility ${r.pair}: ${r.mechanism} on ${r.hosts.join(", ")} — NOT a consistency pair`);
    if (!asm.routesHeld) out.push("  (no route reports yet — no pair can be claimed, which is not the same as no disagreement)");
    return out;
}
