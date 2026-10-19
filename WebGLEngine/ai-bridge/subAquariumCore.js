// ai-bridge/subAquariumCore.js -- UNNUMBERED (the version is chosen at ship time)
//
// THE SUB AQUARIUM'S RULES, PURE: what a submarine is on the wire, whether a peer's submarine may be admitted, where it is kept, and what the "FISH BRAIN" and "FLY BRAIN" chips on server.html say.
// The bridge (subAquariumBridge.js) owns the routes and the disk; this file touches neither, so a gate can test every decision without a server.
//
// A SUB ON THE WIRE (a JSON object; nothing in it is ever executed or evaluated -- it is DATA a page flies with code the page already has):
//   name     1..40 characters of letters, digits, space and . _ - ( )   (anything else is dropped; a name is a label, not markup)
//   circuit  "gfc"   the only circuit a sub pilot is wired for: the fruit fly's Giant Fiber Circuit (34 neurons, 313 synapses) -- THE STAND-IN, not a fish
//   weights  null (the PD autopilot flies it) or EXACTLY 963 finite numbers, each |w| <= 1000 (brain/pilotSubPolicy.mjs: 14 x 34 + 34 + 313 + 34 x 4 + 4)
//   theta    null or the twelve tactician numbers by name (brain/subTactics.mjs), each finite and |v| <= 10000; a page clamps them into their real bounds before use
//   hue      0..359 (derived from the name when absent)
// The sender's FROM is never taken from the body: the bridge stamps it from the connection (the address that dialled). A body that claims {local: true} or a from is IGNORED.
//
// WHAT "AVAILABLE" MEANS ON THE CHIPS, said plainly:
//   FLY BRAIN   the circuit file (vendor/male-cns/giant-fiber-circuit.json) AND a trained flight weight file exist -> live; the circuit but no trained weights -> stale (hand weights only); no circuit -> offline.
//   FISH BRAIN  there is NO FISH CIRCUIT in this tree (ZAPBench is activity, not wiring; the larval-zebrafish connectome is not vendored). So the honest ceiling today is "stand-in": a sub pilot trained
//               on the FLY circuit exists and can fly. live is reserved for a vendored fish circuit AND a pilot wired to it; stand-in (amber) = weights exist, circuit is the fly's; offline = no pilot weights at all.
// Pure: no I/O, no clock beyond the `now` handed in, no randomness.
"use strict";

const WEIGHTS = { gfc: 963 };
const THETA_NAMES = ["searchSpeed", "trackSpeed", "evadeSpeed", "fireRange", "aimTol", "pingAfter", "echoWindow", "evadeTime", "evadeTurn", "blindSnr", "pingEvery", "searchPing"];
const MAX_BODY = 64 * 1024, CAP = 24, MAX_W = 1000, MAX_THETA = 10000;
const RE_NAME_BAD = /[^A-Za-z0-9 ._()\-]/g;

const cleanName = (s) => String(s == null ? "" : s).replace(RE_NAME_BAD, "").replace(/\s+/g, " ").trim().slice(0, 40);
const hueOf = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13; return (h >>> 0) % 360; };
const fnv = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, "0"); };

/** Validate and normalise a sub from an untrusted body. Returns { ok: true, sub } or { ok: false, error }. The result has ONLY the known fields. */
function validateSub(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "the sub must be a JSON object" };
    const name = cleanName(body.name);
    if (!name) return { ok: false, error: "name: 1..40 characters of letters, digits, space and . _ - ( )" };
    const circuit = body.circuit === undefined ? "gfc" : body.circuit;
    if (!Object.prototype.hasOwnProperty.call(WEIGHTS, circuit)) return { ok: false, error: `circuit: unknown "${String(circuit).slice(0, 20)}" (known: ${Object.keys(WEIGHTS).join(", ")})` };
    let weights = null;
    if (body.weights != null) {
        if (!Array.isArray(body.weights) || body.weights.length !== WEIGHTS[circuit]) return { ok: false, error: `weights: exactly ${WEIGHTS[circuit]} numbers for circuit ${circuit} (or null for the PD autopilot)` };
        weights = new Array(body.weights.length);
        for (let i = 0; i < body.weights.length; i++) { const v = body.weights[i]; if (typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > MAX_W) return { ok: false, error: `weights[${i}]: a finite number with |w| <= ${MAX_W}` }; weights[i] = v; }
    }
    let theta = null;
    if (body.theta != null) {
        if (typeof body.theta !== "object" || Array.isArray(body.theta)) return { ok: false, error: "theta: an object of the twelve tactician numbers (or null)" };
        theta = {};
        for (const k of THETA_NAMES) { const v = body.theta[k]; if (typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > MAX_THETA) return { ok: false, error: `theta.${k}: a finite number with |v| <= ${MAX_THETA}` }; theta[k] = v; }
    }
    let hue = Number.isFinite(body.hue) ? Math.round(body.hue) : hueOf(name);
    hue = ((hue % 360) + 360) % 360;
    return { ok: true, sub: { name, circuit, weights, theta, hue } };
}

/** A stable id for a sub: the name plus a checksum of its numbers, so sending the same sub again REPLACES it rather than duplicating. */
function subId(sub) { return fnv(sub.name + "|" + sub.circuit + "|" + (sub.weights ? sub.weights.map((v) => v.toFixed(6)).join(",") : "pd") + "|" + (sub.theta ? THETA_NAMES.map((k) => sub.theta[k].toFixed(4)).join(",") : "default")); }

/** The aquarium's tank of subs: capped, replace-by-id, evicts the oldest REMOTE sub first. `now` is a clock function. */
function createRegistry({ cap = CAP, now = () => Date.now() } = {}) {
    const map = new Map();
    const evict = () => {
        while (map.size > cap) {
            let victim = null;
            for (const e of map.values()) if (!e.local && (!victim || e.arrivedAt < victim.arrivedAt)) victim = e;
            if (!victim) for (const e of map.values()) if (!victim || e.arrivedAt < victim.arrivedAt) victim = e;
            map.delete(victim.id);
        }
    };
    return {
        /** Admit a validated sub. `from` and `local` come from the CONNECTION, never the body. Returns { id, replaced }. */
        add(sub, { from = "", local = false } = {}) {
            const id = subId(sub), replaced = map.has(id);
            map.set(id, { id, name: sub.name, circuit: sub.circuit, weights: sub.weights, theta: sub.theta, hue: sub.hue, pilot: sub.weights ? "network" : "autopilot", from: String(from).replace(/[^\w.:\-\[\]]/g, "").slice(0, 60), local: !!local, arrivedAt: now() });
            evict();
            return { id, replaced };
        },
        get: (id) => map.get(id) || null,
        remove: (id) => map.delete(id),
        clear: () => map.clear(),
        /** Every sub, newest first. */
        list: () => [...map.values()].sort((a, b) => b.arrivedAt - a.arrivedAt || (a.id < b.id ? -1 : 1)),
        counts() { let local = 0; for (const e of map.values()) if (e.local) local++; return { total: map.size, local, remote: map.size - local }; },
    };
}

// A theta FILE written before the twelfth number existed (brain/subTacticsThetaWip.json has eleven) is read with the missing numbers at their defaults -- today only searchPing, whose default is 0 (never ping blind): the
// tactician's own clampTheta does the same. The WIRE format stays strict: a peer must send all twelve.
const THETA_LEGACY = { searchPing: 0 };
// The subs this box can offer from the files the work left in the tree: [{ name, weights: file|null, theta: file|null }]. A file is read by the bridge; the core only names them.
const SEED_RECIPES = [
    { name: "Explorer PD autopilot", weights: null, theta: null },
    { name: "Explorer depth-hold champion", weights: "brain/pilotSubWeightsWip.json", theta: "brain/subTacticsThetaWip.json" },
    { name: "Explorer actuator champion", weights: "brain/pilotSubWeightsActuatorsWip.json", theta: "brain/subTacticsThetaSearchPingWip.json" },
    { name: "Explorer robust pilot", weights: "brain/pilotSubWeightsRobustWip.json", theta: "brain/subTacticsThetaSearchPingWip.json" },
    { name: "Explorer tail pilot", weights: "brain/pilotSubWeightsRobustTail2Wip.json", theta: "brain/subTacticsThetaSearchPingWip.json" },   // seed 9400: the one that qualifies on the Munk x3 hull too (brain/SUBMARINE_WIP.md)
    { name: "Explorer noisy-senses pilot", weights: "brain/pilotSubWeightsRobustNoisyWip.json", theta: "brain/subTacticsThetaSearchPingWip.json" },   // seed 9602: trained on sensor noise, delay and gusts; qualifies at every disturbance level on five hulls (brain/SUBMARINE_WIP.md)
];
/** Build the offerable subs from a reader: read(relPath) -> parsed JSON or null. A recipe whose file is missing or invalid is skipped, by name, with the reason. */
function seedSubs(read) {
    const subs = [], skipped = [];
    for (const r of SEED_RECIPES) {
        const w = r.weights ? read(r.weights) : null, t = r.theta ? read(r.theta) : null;
        if (r.weights && !(w && Array.isArray(w.weights))) { skipped.push({ name: r.name, why: `${r.weights} missing or has no weights` }); continue; }
        const v = validateSub({ name: r.name, circuit: "gfc", weights: w ? w.weights : null, theta: t && t.theta ? Object.assign({}, THETA_LEGACY, t.theta) : null });
        if (!v.ok) { skipped.push({ name: r.name, why: v.error }); continue; }
        subs.push(v.sub);
    }
    return { subs, skipped };
}

/** The FLY BRAIN chip: { state ("live" | "stale" | "offline"), detail }. `has` = { circuit, weights } booleans. */
function flyBrainHealth(has) {
    if (!has || !has.circuit) return { state: "offline", detail: "fly brain: the Giant Fiber Circuit (vendor/male-cns/giant-fiber-circuit.json) is not in this tree" };
    if (!has.weights) return { state: "stale", detail: "fly brain: the circuit is here (34 neurons, 313 synapses) but no trained flight weights -- the hand weights (the PD autopilot written through the network) only" };
    return { state: "live", detail: "fly brain: the Giant Fiber Circuit (34 neurons, 313 synapses) and trained flight weights are here" };
}
/** The FISH BRAIN chip: { state ("live" | "standin" | "offline"), detail }. `has` = { fishCircuit, flyCircuit, pilots: [file names with weights] }. */
function fishBrainHealth(has, counts = { total: 0, local: 0, remote: 0 }) {
    const pilots = (has && has.pilots) || [], tank = ` Aquarium: ${counts.total} sub${counts.total === 1 ? "" : "s"} (${counts.local} here, ${counts.remote} from peers).`;
    const fishPilots = (has && has.fishPilots) || [];   // pilot weight files that DECLARE they are wired to a fish circuit (circuit: "fish"); a file in vendor/zebrafish does not make a fly-wired pilot a fish
    if (has && has.fishCircuit && fishPilots.length) return { state: "live", detail: `fish brain: a vendored fish circuit and ${fishPilots.length} sub pilot${fishPilots.length === 1 ? "" : "s"} wired to it.` + tank };
    if (has && has.fishCircuit && pilots.length) return { state: "standin", detail: `fish brain: STAND-IN. A fish circuit is vendored, but no pilot is wired to it yet; ${pilots.length} sub pilot${pilots.length === 1 ? " is" : "s are"} still wired to the FLY's Giant Fiber Circuit.` + tank };
    if (pilots.length) return { state: "standin", detail: `fish brain: STAND-IN. No fish circuit is vendored (ZAPBench is activity, not wiring); ${pilots.length} sub pilot${pilots.length === 1 ? " is" : "s are"} trained on the FLY's Giant Fiber Circuit and can fly.` + tank };
    return { state: "offline", detail: "fish brain: no sub pilot weights in this tree (brain/pilotSubWeights*Wip.json)." + tank };
}

module.exports = { WEIGHTS, THETA_NAMES, THETA_LEGACY, MAX_BODY, CAP, SEED_RECIPES, cleanName, hueOf, validateSub, subId, createRegistry, seedSubs, flyBrainHealth, fishBrainHealth };
