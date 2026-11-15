// WebGLEngine/render/subAquariumKinds.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is render/subAquariumKinds-selfcheck.mjs; the backlog entry is `fly-kind-peer-registration`, brain/BACKLOG_2026-11-01.md, section B)
//
// A SUB THAT ARRIVES FROM A PEER NAMES A CIRCUIT OTHER THAN "gfc" (the stateful fly "flycx", the zebrafish "fish", "plain14", "leaky"): THE TANK KEEPS ITS WEIGHTS AND FLIES THE PD AUTOPILOT UNTIL THE PAGE HAS REGISTERED THAT CIRCUIT'S KIND. The page used to register one kind (flycx), and only after its compass-dropout view had loaded; every other
// circuit, and flycx while the view loaded, was listed as "PD autopilot" with nothing said. This module does the two things the backlog entry asks for, both pure and testable without a page:
//   ensureKinds(tank, snapshot, state)   registers, for every sub that is WAITING for a kind (snapshot `kindWait === "kind"`: its weights are kept, no kind is registered for its circuit), the kind this repository ships for that circuit
//                                         (LOADERS: fish, fish-control, plain14, leaky, and flycx once the heading-loop circuit is handed in). The kinds are this page's own code (render/*.mjs); NOTHING a peer sends is ever run: a sub is numbers. The tank seats the waiting
//                                         subs when a kind is registered (tank.registerPilotKind). Each circuit is tried once; a circuit with no loader, or whose loader throws, is remembered and reported, not retried every refresh.
//   pilotLabel(sub, state)               what the list says a sub is flown by: the kind's name once seated; "waiting for its kind (circuit)" while one is on its way; "autopilot: no kind for circuit X" / "autopilot: its kind failed to load" / "autopilot: its weights
//                                         do not fit circuit X's kind (kindWait count)" / "autopilot: its kind refused it (reason)" -- never "PD autopilot" for a sub that was sent to fly something else.
// NOT CHECKED, said plainly: that the browser serves every module the loaders import (the page's own import of them is what a page would show: an import that fails is reported as "its kind failed to load"); the page wiring is not exercised by the gate (it is two calls).
// Pure but for the dynamic imports in the loaders: no DOM, no clock, no Math.random, no file.
"use strict";

/** circuit -> async (ctx) => kind. `ctx.flyCircuit` is { neurons, edges, io } (vendor/hemibrain/hemibrain-cx-heading-loop.json), which the page loads for its dropout view. */
export const LOADERS = Object.freeze({
    flycx: async (ctx) => { if (!ctx || !ctx.flyCircuit) return null; const m = await import("./subAquariumFlyCx.mjs"); return m.flyCxKind(ctx.flyCircuit); },
    fish: async () => (await import("./subAquariumFish.mjs")).fishKind(),
    "fish-control": async () => (await import("./subAquariumFish.mjs")).fishKind({ control: true }),
    plain14: async () => (await import("./subAquariumPlain14.mjs")).plain14Kind(),
    leaky: async () => (await import("../brain/pilotLeakyHeading.mjs")).leakyKind(),
});

const NAMES = Object.freeze({ flycx: "stateful fly", fish: "zebrafish-wired", "fish-control": "random circuit (fish size)", plain14: "plain net", leaky: "leaky unit" });

/** A fresh state for ensureKinds: `tried` (circuits registered or given up on), `failed` (circuit -> why), `unknown` (circuits with no loader), `ctx` (what a loader may need). */
export function newKindState(ctx = {}) { return { tried: new Set(), failed: new Map(), unknown: new Set(), ctx }; }

/** The circuits of the snapshot's subs that are waiting for a kind, in first-seen order, once each. */
export function waitingCircuits(snapshot) {
    const out = [];
    for (const s of snapshot || []) if (s && s.kindWait === "kind" && typeof s.circuit === "string" && !out.includes(s.circuit)) out.push(s.circuit);
    return out;
}

/** Register the shipped kind of every circuit that a sub in `snapshot` is waiting for and that has not been tried. Returns { registered: [circuit...], seated: n } (seated: the subs the tank now flies by those kinds). Never throws for a loader or a registration that fails: it is recorded in state.failed. */
export async function ensureKinds(tank, snapshot, state, loaders = LOADERS) {
    const registered = []; let seated = 0;
    for (const circuit of waitingCircuits(snapshot)) {
        if (state.tried.has(circuit)) continue;
        const load = Object.prototype.hasOwnProperty.call(loaders, circuit) ? loaders[circuit] : null;
        if (!load) { state.tried.add(circuit); state.unknown.add(circuit); continue; }
        let kind;
        try { kind = await load(state.ctx); } catch (e) { state.tried.add(circuit); state.failed.set(circuit, String((e && e.message) || e).slice(0, 120)); continue; }
        if (kind === null || kind === undefined) continue;   // not loadable YET (flycx before the heading-loop circuit is in): not tried, so a later refresh tries again
        state.tried.add(circuit);
        try { const r = tank.registerPilotKind(circuit, kind); registered.push(circuit); seated += r && Number.isInteger(r.seated) ? r.seated : 0; } catch (e) { state.failed.set(circuit, String((e && e.message) || e).slice(0, 120)); }
    }
    return { registered, seated };
}

/** What the list says a snapshot entry is flown by. `state` is the ensureKinds state (optional). */
export function pilotLabel(s, state) {
    const circuit = s.circuit === undefined ? "gfc" : s.circuit;
    if (circuit === "gfc") return s.pilot === "network" ? "network" : "PD autopilot";
    if (s.kind) return NAMES[s.kind] || s.kind;
    if (s.kindError) return `autopilot: its kind refused it (${s.kindError})`;
    if (s.kindWait === "count") return `autopilot: its weights do not fit the ${circuit} kind`;
    if (state && state.failed.has(circuit)) return `autopilot: the ${circuit} kind failed to load (${state.failed.get(circuit)})`;
    if (state && state.unknown.has(circuit)) return `autopilot: no kind for circuit ${circuit}`;
    return `waiting for its kind (${circuit})`;
}
