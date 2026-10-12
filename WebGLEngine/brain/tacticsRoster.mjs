// WebGLEngine/brain/tacticsRoster.mjs -- v4839
//
// WHO PICKS EACH SIDE'S TARGETS IN THE ENDLESS-SKY FIGHT, AS DATA: for side A and side B, which tactics weight vector (ev/esTactics.js's eight numbers) -- one of a handful of named presets, the
// one the GPU Brain serves (GET /ai/brain/tactics, only once it has learned enough to be trusted), or one imported from a file -- resolved to the weights the fight hands to decide().
// flight-gpu.html's and es-box3d.html's "Load Tactics" panel is this module with two selects around it. Same idea as brain/pilotRoster.mjs for the dogfight and brain/roster.mjs for the race.
//
// *** THIS IS NOT THE CONNECTOME NETWORK, AND THE PAGE SAYS SO. *** The 6DOF and dogfight pilots are one fly-wired network (34 neurons, 313 synapses) run on different weights. The tactics policy
// is a different, much smaller thing: five target-selection weights (closeness, weakness, threat, player bias, stickiness) and three flee thresholds, scored by a dot product in ev/esTactics.js
// -- "the brain's value is the policy, not the pathfinding" (that file's header). What a side CHOOSES here is a choice of those eight numbers; every ship is flown by the same stepAI. So a
// preset below is a way of picking targets, not a pilot, and "scatter against hand" (what the page has always run) is one pair of choices out of the sixty-four the panel now offers.
//
// WHAT THE PRESETS ARE, AND ARE NOT: hand, brawler, sharp and scatter are ev/tools/es-arena.mjs's own PRESETS (the arena that measures them; the gate holds the numbers equal so they cannot
// drift). focus, threat, stubborn and skittish are the other four axes of the vector, each pushed hard in one direction -- named for what the number does, not for how well it does it. The
// arena's win rates are in the gate's header, not in a label: a label that says "best" is a claim the next change to the sim can falsify, and the matrix there shows the ordering is not what the
// names suggest ("sharp", which chases the weakest and the most dangerous wherever they are, takes 33% of the battles against the plain "scatter" it was meant to improve on).
//
// Pure: no DOM, no storage, no clock, no random. The page hands it what it holds (ctx: { served, imported }) and gets weights back.
"use strict";
import { DEFAULT_W, applyBrainWeights } from "../ev/esTactics.js";

export const TEAMS = Object.freeze(["A", "B"]);
export const AUTO = "auto";

/** Keys of the vector, target-selection first, flee thresholds last (the order the panel prints them in). */
export const KEYS = Object.freeze(Object.keys(DEFAULT_W));
/** The range an imported or served number is held to: the learner's own bounds for the target weights (brain/tacticsPolicy.js W_MIN/W_MAX), 0..1 for the flee fractions. */
export const RANGES = Object.freeze({ wClose: [-2, 4], wWeak: [-2, 4], wThreat: [-2, 4], wPlayer: [-2, 4], wFocus: [-2, 4], fleeHealth: [0, 1], fleeOdds: [0, 1], fleeHyst: [0, 1] });

const make = (over) => applyBrainWeights(over, DEFAULT_W);

/** The named presets, in the order the panel lists them. `weights` is built fresh by presetWeights(): a caller can never mutate the shared vector. */
export const PRESETS = Object.freeze([
    { id: "scatter", label: "scatter -- nearest target only", build: () => make({ wWeak: 0, wFocus: 0, wThreat: 0, wPlayer: 0, wClose: 1 }) },
    { id: "hand", label: "hand weights -- the opening book", build: () => ({ ...DEFAULT_W }) },
    { id: "brawler", label: "brawler -- stay on the nearest, finish the wounded", build: () => make({ wClose: 1.5, wWeak: 0.55, wThreat: 0.15, wPlayer: 0.0, wFocus: 0.45 }) },
    { id: "sharp", label: "sharp -- weakest and most dangerous, wherever they are", build: () => make({ wWeak: 1.5, wFocus: 0.70, wThreat: 0.70, wPlayer: 0.0, wClose: 1.0 }) },
    { id: "focus", label: "focus fire -- keep shooting the last target", build: () => make({ wClose: 0.6, wWeak: 0.8, wThreat: 0.3, wPlayer: 0, wFocus: 1.2 }) },
    { id: "threat", label: "threat first -- shoot whoever can hurt most", build: () => make({ wClose: 0.6, wWeak: 0.2, wThreat: 1.6, wPlayer: 0, wFocus: 0.25 }) },
    { id: "stubborn", label: "stubborn -- never breaks off", build: () => make({ fleeHealth: 0, fleeOdds: 0, fleeHyst: 0 }) },
    { id: "skittish", label: "skittish -- runs early and runs far", build: () => make({ fleeHealth: 0.7, fleeOdds: 0.9, fleeHyst: 0.2 }) },
]);
export const PRESET_IDS = Object.freeze(PRESETS.map((p) => p.id));

/** A fresh weight vector for a preset id, or null for an id that is not one. */
export function presetWeights(id) { const p = PRESETS.find((q) => q.id === id); return p ? p.build() : null; }

/** What "default for this side" meant before the panel: side A flew scatter and side B the hand weights (flight-gpu.html's W_A and W_B). */
export const autoChoice = (team) => (team === "A" ? "scatter" : "hand");

/** Both sides on "default for this side": the page as it ran before there was a panel (resolveTeam reproduces it exactly; the gate holds that). */
export const defaultSpecs = () => ({ A: AUTO, B: AUTO });

/** Read specs back from untrusted JSON (storage): anything malformed becomes "auto", an unknown id is kept to be refused by name at resolve. Never throws. */
export function sanitizeSpecs(raw) {
    const out = defaultSpecs();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    for (const t of TEAMS) if (typeof raw[t] === "string" && raw[t].length < 64) out[t] = raw[t];
    return out;
}

/**
 * Make an untrusted object into a weight vector, or say why it cannot be. Accepts the flat vector, or a { weights } wrapper (what GET /ai/brain/tactics and a saved blob carry). Unknown keys are
 * named and dropped, a non-number is named and dropped, an out-of-range number is clamped and named; if NOTHING usable is left it is refused. Never throws.
 * Returns { weights | null, problems[], applied }.
 */
export function sanitizeWeights(raw) {
    const problems = [];
    const src = raw && typeof raw === "object" && !Array.isArray(raw) && raw.weights && typeof raw.weights === "object" ? raw.weights : raw;
    if (!src || typeof src !== "object" || Array.isArray(src)) return { weights: null, problems: ["not a weight vector (expected an object of the eight tactics weights)"], applied: 0 };
    const out = {}, unknown = [];
    for (const k of Object.keys(src)) {
        if (k.startsWith("_")) continue;
        if (!KEYS.includes(k)) { unknown.push(k.slice(0, 24)); continue; }
        const v = src[k];
        if (typeof v !== "number" || !Number.isFinite(v)) { problems.push(`${k} is not a finite number (${JSON.stringify(v)}) and was ignored`); continue; }
        const [lo, hi] = RANGES[k], c = Math.min(hi, Math.max(lo, v));
        if (c !== v) problems.push(`${k} ${v} is outside ${lo}..${hi} and was held to ${c}`);
        out[k] = c;
    }
    if (unknown.length) problems.push(`unknown key${unknown.length > 1 ? "s" : ""} ignored: ${unknown.slice(0, 5).join(", ")}${unknown.length > 5 ? ", ..." : ""}`);
    const applied = Object.keys(out).length;
    if (!applied) return { weights: null, problems: [...problems, "no usable weight in it (none of the eight keys, as numbers)"], applied: 0 };
    if (applied < KEYS.length) problems.push(`only ${applied} of the ${KEYS.length} weights were given; the hand value stands for the other ${KEYS.length - applied}`);
    return { weights: make(out), problems, applied };
}

/** Parse the text of an imported file. Returns what sanitizeWeights does, plus { error } for text that is not JSON. */
export function parseImport(text) {
    let j;
    try { j = JSON.parse(String(text)); } catch (e) { return { weights: null, problems: [], applied: 0, error: "not JSON: " + String(e && e.message || e).slice(0, 80) }; }
    return sanitizeWeights(j);
}

/** What can be chosen RIGHT NOW. ctx: { served, imported } -- whether the page holds a Brain-served vector and an imported one. A source the page does not hold is not offered. */
export function choices(ctx = {}) {
    const out = [{ id: AUTO, label: "default for this side (A scatter, B hand)" }];
    for (const p of PRESETS) out.push({ id: p.id, label: p.label });
    if (ctx.served) out.push({ id: "served", label: "served by the GPU Brain (learned from outcomes)" });
    if (ctx.imported) out.push({ id: "imported", label: "imported weights" });
    return out;
}

/**
 * Resolve one side. ctx: { served, imported }. Returns { team, id, label, weights, problems }. An id nothing holds falls back to the side's DEFAULT AND SAYS SO in `problems`; it never
 * throws and never silently substitutes. A served or imported vector that fails sanitizing falls back the same way.
 */
export function resolveTeam(team, spec, ctx = {}) {
    const problems = [];
    let id = spec == null || spec === AUTO ? autoChoice(team) : spec, label = null, weights = null;
    const preset = PRESETS.find((p) => p.id === id);
    if (preset) { weights = preset.build(); label = preset.id; }
    else if (id === "served" && ctx.served) { const s = sanitizeWeights(ctx.served); if (s.weights) { weights = s.weights; label = "served by the GPU Brain"; } problems.push(...s.problems.map((m) => `served: ${m}`)); }
    else if (id === "imported" && ctx.imported) { const s = sanitizeWeights(ctx.imported); if (s.weights) { weights = s.weights; label = "imported weights"; } problems.push(...s.problems.map((m) => `imported: ${m}`)); }
    if (!weights) {
        const fallback = autoChoice(team);
        problems.push(`team ${team}: the tactics choice "${String(id).slice(0, 24)}" is not available here; ${fallback} flies`);
        id = fallback; weights = presetWeights(fallback); label = fallback;
    }
    return { team, id, label, weights, problems };
}

/** Both sides at once. Returns { A, B, problems }. */
export function resolveRoster(specs, ctx = {}) {
    const s = sanitizeSpecs(specs), A = resolveTeam("A", s.A, ctx), B = resolveTeam("B", s.B, ctx);
    return { A, B, problems: [...A.problems, ...B.problems] };
}

/** One line for the HUD and the gates: "A: scatter  |  B: hand". */
export function describe(resolved) { return TEAMS.map((t) => `${t}: ${resolved[t].label}`).join("  |  "); }

/** The eight numbers of a resolved side as one short line, so the panel can show what a choice IS ("close 1 weak 0 threat 0 player 0 focus 0 | flee <0.3 odds<0.55 hyst 0.12"). */
export function summary(weights) {
    const n = (v) => String(+Number(v).toFixed(2));
    return `close ${n(weights.wClose)} weak ${n(weights.wWeak)} threat ${n(weights.wThreat)} player ${n(weights.wPlayer)} focus ${n(weights.wFocus)} | flee below ${n(weights.fleeHealth)} health, odds under ${n(weights.fleeOdds)}, hysteresis ${n(weights.fleeHyst)}`;
}
