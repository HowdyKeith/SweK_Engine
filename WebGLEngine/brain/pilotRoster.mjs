// WebGLEngine/brain/pilotRoster.mjs -- v4829
//
// WHO FLIES EACH SIDE OF A DOGFIGHT, AS DATA: for team A and team B, which pilot -- the scripted AI the demo always flew, or a brain (brain/pilotPolicy.mjs's fly-wired network: seven
// features through the real Giant Fiber Circuit to turn, pitch, thrust and fire) with one of a handful of weight sets -- resolved to a pilot function for every ship on the team.
// es-box3d-fly3d.html's "Load Pilots" panel is this module with two selects around it. Same idea as brain/roster.mjs for the race page, and the same honesty about its limit:
//
// *** A "BRAIN" HERE IS A CHOICE OF WEIGHTS, NOT OF NETWORK. *** Every brain pilot is the SAME network; what differs between "hand", "zero", "noise", "shipped" and "imported" is
// the vector it runs on (hand-set rules written through the net; zeros, which never turn, thrust or fire; the hand rules with noise on every weight; the pilot this demo ships;
// one imported from a file or pulled from a peer). "Scripted" is not a brain at all: it is ev/flightModel3d.js's stepAI3d, and it is on the list because it is what team B has
// always been, so a fight of brain against scripted -- the demo as it was -- is one choice on each side and a fight of brain against brain is two.
//
// Pure: no DOM, no storage, no clock. The page hands it what it holds (ctx) and gets pilot functions back. Noise is drawn from a seeded stream in SHIP order, so the same
// lineup flies the same pilots every battle.
"use strict";

export const TEAMS = Object.freeze(["A", "B"]);
export const AUTO = "auto", SCRIPTED = "scripted";
export const NOISE_05 = 0.05, NOISE_10 = 0.1;
const SEEDS = Object.freeze({ A: 0x5117a, B: 0x5117b });

/** Both sides on "default for this team": the demo as it flew before there was a panel (resolveTeam reproduces it exactly; the gate holds that). */
export const defaultSpecs = () => ({ A: AUTO, B: AUTO });

/** Read specs back from untrusted JSON (storage): anything malformed becomes "auto", an unknown id is kept to be refused by name at resolve. Never throws. */
export function sanitizeSpecs(raw) {
    const out = defaultSpecs();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    for (const t of TEAMS) if (typeof raw[t] === "string" && raw[t].length < 64) out[t] = raw[t];
    return out;
}

/**
 * What can be chosen RIGHT NOW. ctx: { shipped, league, close, imported } -- whether this page holds the shipped default pilot, the league-trained one (v4846), the close-quarters one (v4848) and an imported one. A source that needs something the page
 * does not hold is not offered. "brain" is the Brain panel's own pilot: the imported one, else the shipped default, else the hand weights (what Brain pilot has always flown).
 */
export function choices(ctx) {
    // v4829 -- a page with its own scripted pilot and no Brain panel (es-box3d-6dof.html: the PD autopilot) says so: ctx.scriptedLabel names the scripted choice and ctx.brainPanel === false leaves "brain" out
    const out = [{ id: AUTO, label: "default for this team" }, { id: SCRIPTED, label: ctx.scriptedLabel || "scripted AI (stepAI3d)" }];
    if (ctx.brainPanel !== false) out.push({ id: "brain", label: "the Brain panel's pilot" });
    if (ctx.shipped) out.push({ id: "shipped", label: "shipped pilot brain" });
    if (ctx.league) out.push({ id: "league", label: "league-trained pilot brain" });   // v4846 -- the second generation: the shipped pilot, trained against itself and the PD autopilot (es-box3d-6dof.html)
    if (ctx.close) out.push({ id: "close", label: "close-quarters pilot brain (trained with collisions on)" });   // v4848 -- the shipped pilot trained in standoff AND joust starts, with the page's own ram damage
    if (ctx.imported) out.push({ id: "imported", label: "imported pilot brain" });
    out.push({ id: "hand", label: "hand weights" }, { id: "noise05", label: "hand + noise 0.05 (each ship its own)" }, { id: "noise10", label: "hand + noise 0.1 (each ship its own)" }, { id: "zero", label: "zero (never turns, thrusts or fires)" });
    return out;
}

/** What "default for this team" meant before the panel: team A flew the Brain panel's pilot when Brain pilot was on and the scripted AI otherwise; team B was always scripted. */
export const autoChoice = (team, ctx) => (team === "A" && ctx.brainPilotOn ? "brain" : SCRIPTED);

/** The weights the Brain panel's pilot flies: imported, else the shipped default, else the hand weights. */
function brainWeights(ctx) { return ctx.imported || ctx.shipped || ctx.PP.handWeights(); }

/**
 * Resolve one team. ctx: { PP, shipped, league, close, imported, brainPilotOn }; n = ships on the team. Returns { team, id, label, scripted, weights (one vector per ship, or null when scripted), problems }.
 * An id nothing holds falls back to the hand weights AND SAYS SO in `problems`; it never throws and never silently substitutes.
 */
export function resolveTeam(team, spec, ctx, n) {
    const { PP } = ctx, problems = [], ships = Math.max(1, n | 0);
    let id = spec == null || spec === AUTO ? autoChoice(team, ctx) : spec;
    const same = (w, label) => ({ id, label, scripted: false, weights: Array.from({ length: ships }, () => w) });
    let r;
    if (id === SCRIPTED) r = { id, label: ctx.scriptedName || "scripted AI", scripted: true, weights: null };
    else if (id === "brain") r = same(brainWeights(ctx), ctx.imported ? "imported pilot brain" : ctx.shipped ? "shipped pilot brain" : "hand weights");
    else if (id === "shipped" && ctx.shipped) r = same(ctx.shipped, "shipped pilot brain");
    else if (id === "league" && ctx.league) r = same(ctx.league, "league-trained pilot brain");
    else if (id === "close" && ctx.close) r = same(ctx.close, "close-quarters pilot brain");
    else if (id === "imported" && ctx.imported) r = same(ctx.imported, "imported pilot brain");
    else if (id === "hand") r = same(PP.handWeights(), "hand weights");
    else if (id === "zero") r = same(PP.zeroWeights(), "zero pilot");
    else if (id === "noise05" || id === "noise10") {
        const sigma = id === "noise05" ? NOISE_05 : NOISE_10;
        // a seeded stream per team, consumed in SHIP order: the same lineup flies the same pilots, and ship 3 is ship 3 whatever the fleet size
        let a = SEEDS[team] >>> 0; const rng = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
        r = { id, label: `hand + noise ${sigma}`, scripted: false, weights: Array.from({ length: ships }, () => PP.perturb(PP.handWeights(), sigma, rng)) };
    } else {
        problems.push(`team ${team}: the pilot choice "${id}" is not available here; the hand pilot flies`);
        id = "hand"; r = same(PP.handWeights(), "hand weights");
    }
    return { team, ...r, problems };
}

/**
 * The pilot function a side hands to sideDriveShots: (ship, target, opts) -> { turn, pitch, thrust, firing }, or null for the scripted AI (the caller then uses stepAI3d). A ship
 * flies the weights of ITS place on the team: ids are "A#0", "A#1", ...; one with no number flies the first.
 */
export function teamPilot(resolved, PP) {
    if (resolved.scripted) return null;
    const fns = new Map(), fnFor = (w) => { let f = fns.get(w); if (!f) fns.set(w, f = PP.pilotFor(w)); return f; };
    return (ship, target, opts) => {
        const m = /#(\d+)$/.exec(String(ship && ship.id)), i = m ? Math.min(+m[1], resolved.weights.length - 1) : 0;
        return fnFor(resolved.weights[i])(ship, target, opts);
    };
}

/** One line for the HUD and the gates: "A: hand + noise 0.05 (6 ships)  |  B: scripted AI". */
export function describe(resolved, n) { return TEAMS.map((t) => `${t}: ${resolved[t].label}` + (resolved[t].scripted ? "" : ` (${Math.max(1, n | 0)} ships)`)).join("  |  "); }

/** Both teams at once. Returns { A, B, problems }. */
export function resolveRoster(specs, ctx, n) {
    const s = sanitizeSpecs(specs), A = resolveTeam("A", s.A, ctx, n), B = resolveTeam("B", s.B, ctx, n);
    return { A, B, problems: [...A.problems, ...B.problems] };
}
