// WebGLEngine/brain/counterfactual.mjs -- UNNUMBERED (the version is chosen at ship time) (the registration is brain/COUNTERFACTUAL_WIP.md, written BEFORE this file and before any model was asked a request; the command line is tools/ship/takeCounterfactual.mjs; the gate is brain/counterfactual-selfcheck.mjs)
//
// COUNTERFACTUAL RE-FLIGHTS: a model is shown the facts of a Sea OGRE pair (brain/afterAction.mjs: one scenario flown without the countermeasure kit and with all three) and may ASK for the same scenario to be flown again with a different subset of the kit. The ask is ONE schema-bound line, the engine flies it (a fight is deterministic) and states the result as NEW FACTS; the model's words are never a fact and never a result.
//   THE REQUEST   a line of the reply that reads `REQUEST {"seed": 105, "kit": ["decoy", "screen"]}`: seed a whole number, kit a list of distinct names from decoy, screen, interceptor (empty = no kit), no other key.
//   THE REASONS   a reply is refused by exactly one of: none (no REQUEST line), many (more than one), json (not JSON), shape (not an object with exactly seed and kit), seed (not a whole number), kit (not a list of known, distinct names), seedNotShown (valid, but not the seed of the pair the model was shown: a re-flight of another scenario is not a counterfactual of this fight).
//   THE RUNNER    flyKit flies G.fight(sidesOgre(3, subset), G.scenario(seed, 3)); the EMPTY kit is flown as no kit at all (run B's own defenders) and the full kit as the pair's KIT_ALL, so that they repeat the pair's two runs (fingerprints compared).
//   THE FACTS     the pair's F1 .. Fn are never changed; the re-flight's facts continue the numbering (F(n+1) ...) with the tags C (the re-flight) and P (the re-flight against run B), in the pair's own wording with the kit named: the outcome and score, the defenders lost, the first divergence from run B outside the releases, the first release and the totals, the decoyed and intercepted counts, every loss, the OGRE's torpedoes fired, the hits, and -- when the fingerprint is the same as run B's or run K's -- that it repeats it.
//   THE MEASURES  over the twelve registered pairs: VALID = exactly one REQUEST that parses, validates and names the pair's own seed; floors 0.9 and 0.5; REPORTED, in no verdict: the reasons, the share that repeat a shown run, the share whose outcome is new, the kits asked for.
// Pure: no I/O, no clock, no Math.random. The fights are deterministic.
"use strict";
import * as G from "./seaOgre.mjs";
import * as A from "./afterAction.mjs";

export const SCHEMA = 1, KIT_NAMES = A.RELEASE_TYPES, DEFENDERS = A.DEFENDERS;
export const REASONS = Object.freeze(["none", "many", "json", "shape", "seed", "kit", "seedNotShown"]);
export const VALID_FLOOR = 0.9, SOMETIMES_FLOOR = 0.5;
/** The eight subsets of the kit in a fixed order: none, each alone, each pair, all three. */
export const SUBSETS = Object.freeze([[], ["decoy"], ["screen"], ["interceptor"], ["decoy", "screen"], ["decoy", "interceptor"], ["screen", "interceptor"], ["decoy", "screen", "interceptor"]].map((s) => Object.freeze(s)));
export const kitName = (kit) => (kit.length ? kit.join("+") : "none");

// ---- the request -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const LINE = /^\s*REQUEST\b(.*)$/;
/** The REQUEST line of a reply: { ok: true, value } with the parsed JSON, or { ok: false, reason } with none, many or json. */
export function parseRequestLine(reply) {
    const lines = String(reply ?? "").split(/\r?\n/).map((l) => LINE.exec(l)).filter(Boolean);
    if (lines.length === 0) return { ok: false, reason: "none" };
    if (lines.length > 1) return { ok: false, reason: "many" };
    try { return { ok: true, value: JSON.parse(lines[0][1].trim()) }; } catch (e) { return { ok: false, reason: "json" }; }
}
/** A parsed value checked against the schema and the pair it was asked about: { ok: true, request: { seed, kit } } or { ok: false, reason } with shape, seed, kit or seedNotShown. */
export function validateRequest(value, shownSeed) {
    const keys = value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).sort() : null;
    if (!keys || keys.length !== 2 || keys[0] !== "kit" || keys[1] !== "seed") return { ok: false, reason: "shape" };
    if (!Number.isInteger(value.seed)) return { ok: false, reason: "seed" };
    if (!Array.isArray(value.kit) || value.kit.some((k) => !KIT_NAMES.includes(k)) || new Set(value.kit).size !== value.kit.length) return { ok: false, reason: "kit" };
    if (value.seed !== shownSeed) return { ok: false, reason: "seedNotShown" };
    return { ok: true, request: { seed: value.seed, kit: KIT_NAMES.filter((k) => value.kit.includes(k)) } };
}
/** A reply read: { ok: true, request } (the kit in the order decoy, screen, interceptor) or { ok: false, reason }. */
export function readRequest(reply, shownSeed) {
    const p = parseRequestLine(reply);
    return p.ok ? validateRequest(p.value, shownSeed) : p;
}
/** The line a request is written as (the form the prompt shows). */
export const requestLine = (seed, kit) => `REQUEST ${JSON.stringify({ seed, kit })}`;

// ---- the runner --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const enabledOf = (kit) => ({ decoy: kit.includes("decoy"), screen: kit.includes("screen"), interceptor: kit.includes("interceptor") });
/** The scenario of `seed` flown with the named subset of the kit (the empty kit with none: run B's own defenders). */
export function flyKit(seed, kit, n = DEFENDERS) {
    if (!Number.isInteger(seed)) throw new Error(`counterfactual.flyKit: the seed must be a whole number, got ${JSON.stringify(seed)}`);
    if (!Array.isArray(kit) || kit.some((k) => !KIT_NAMES.includes(k)) || new Set(kit).size !== kit.length) throw new Error(`counterfactual.flyKit: the kit must be distinct names from ${KIT_NAMES.join(", ")}, got ${JSON.stringify(kit)}`);
    return G.fight(A.sidesOgre(n, kit.length ? enabledOf(kit) : null), G.scenario(seed, n));
}
/** Which of the pair's two runs a re-flight repeats ("B", "K") or null: by fingerprint. */
export const repeatsOf = (pair, run) => (run.fingerprint === pair.base.fingerprint ? "B" : run.fingerprint === pair.kit.fingerprint ? "K" : null);

// ---- the facts ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const secs = (tick) => (tick / A.TICKS_PER_SECOND).toFixed(1), at = (tick) => `tick ${tick} (${secs(tick)} s)`;
const isRelease = (e) => A.RELEASE_TYPES.includes(e.type);
const countOf = (events, type, pred = () => true) => events.filter((e) => e.type === type && pred(e));
const firstTick = (list) => list.reduce((m, e) => Math.min(m, e.tick), Infinity);
const typeOf = (e) => (e ? e.type : "nothing");
/** The facts of a re-flight, ids continuing from `after` (the number of facts the pair has): [{ id, kind, tag, text, numbers, salient }]. `pair` is { base, kit } (fights), `run` the re-flight's fight, `kit` its subset. */
export function reflightFacts(pair, run, kit, after) {
    const name = `Re-flight (run C, kit: ${kitName(kit)})`, list = [], put = (kind, tag, text) => list.push({ kind, tag, text, salient: A.SALIENT_KINDS.includes(kind) });
    put("outcome", "C", `${name}: the fight ended ${run.outcome}, score ${run.score.toFixed(3)}.`);
    put("lost", "C", `${name}: ${run.lost} defenders were lost.`);
    const rep = repeatsOf(pair, run);
    if (rep) put("repeat", "P", `${name}: this fight is the same as run ${rep}, the ${rep === "B" ? "run without the kit" : "run with the kit"} (the same fingerprint).`);
    const d = A.divergenceOf(pair.base.events, run.events);
    put("divergence", "P", d ? `The re-flight and the run without the kit first differ at ${at(d.tick)}, in an event that is not a countermeasure release (without the kit: ${typeOf(d.base)}; re-flight: ${typeOf(d.kit)}).` : "The re-flight and the run without the kit do not differ in any event that is not a countermeasure release.");
    const rel = run.events.filter(isRelease);
    if (rel.length) { const f = rel[0], c = (t) => rel.filter((e) => e.type === t).length; put("release", "C", `${name}: the first release was a ${f.type} by boat ${f.boat} at ${at(f.tick)}; in all ${c("decoy")} decoys, ${c("screen")} screens and ${c("interceptor")} interceptors were released.`); }
    else put("release", "C", `${name}: nothing was released.`);
    for (const [type, noun] of [["decoyed", "torpedoes were decoyed"], ["intercepted", "torpedoes were intercepted"]]) { const l = countOf(run.events, type); if (l.length) put(type, "C", `${name}: ${l.length} ${noun}, the first at ${at(firstTick(l))}.`); }
    for (const e of countOf(run.events, "loss")) put("loss", "C", `${name}: boat ${e.boat} was lost at ${at(e.tick)} (${e.why}).`);
    put("fired", "C", `${name}: the OGRE fired ${run.ogreFired} torpedoes.`);
    const onOgre = countOf(run.events, "hit", (e) => e.boat !== 0), onDef = countOf(run.events, "hit", (e) => e.boat === 0);
    if (onOgre.length) put("hit", "C", `${name}: ${onOgre.length} hits landed on the OGRE, the first at ${at(firstTick(onOgre))}.`);
    if (onDef.length) put("hit", "C", `${name}: ${onDef.length} hits landed on the defenders, the first at ${at(firstTick(onDef))}.`);
    return list.map((f, i) => ({ id: "F" + (after + i + 1), ...f, numbers: A.numbersIn(f.text) }));
}
/** A request answered: { seed, kit, run, repeats, facts } with the new facts numbered after the pair's `facts`. `pair` is A.flyPair(seed) (or any { seed, base, kit }). */
export function answerRequest(pair, facts, request) {
    if (request.seed !== pair.seed) throw new Error(`counterfactual.answerRequest: the request names seed ${request.seed} and the pair is seed ${pair.seed}`);
    const run = flyKit(request.seed, request.kit);
    return { seed: request.seed, kit: [...request.kit], run, repeats: repeatsOf(pair, run), facts: reflightFacts(pair, run, request.kit, facts.length) };
}

// ---- the prompt --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const PROPOSE_ASK = (seed) => `Propose ONE more flight of this same scenario (seed ${seed}) with a different set of countermeasures, to help see what the kit changed. Answer with exactly one line in this format and nothing else: ${requestLine(seed, ["decoy", "screen"])}. The kit is any of ${KIT_NAMES.join(", ")}, each at most once; an empty list means no kit. Do not explain.`;
/** The prompt of a pair: the facts as the analyzer prints them, then the ask for ONE re-flight. */
export const proposalPromptOf = (facts, seed) => `${A.PROMPT_HEAD}\n${facts.map(A.lineOf).join("\n")}\n\n${PROPOSE_ASK(seed)}`;

// ---- the measures ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** Over entries [{ seed, pair, facts, reply }]: { n, valid, share, reasons (count of each), repeats (valid requests that repeat a shown run), fresh (valid requests whose outcome is neither shown run's), kits (the kit name asked for, counted) }. */
export function measuresOf(entries) {
    const reasons = Object.fromEntries(REASONS.map((r) => [r, 0])), kits = {}; let valid = 0, repeats = 0, fresh = 0;
    for (const e of entries) {
        const r = readRequest(e.reply, e.seed);
        if (!r.ok) { reasons[r.reason]++; continue; }
        valid++; kits[kitName(r.request.kit)] = (kits[kitName(r.request.kit)] || 0) + 1;
        const a = answerRequest(e.pair, e.facts, r.request);
        if (a.repeats) repeats++; else if (a.run.outcome !== e.pair.base.outcome && a.run.outcome !== e.pair.kit.outcome) fresh++;
    }
    return { n: entries.length, valid, share: entries.length ? valid / entries.length : 0, reasons, repeats, fresh, kits };
}
/** The registered bottom line of one model's proposals, given whether the pipeline checks held. */
export function readingOf(m, checksHeld = true) {
    if (!checksHeld) return "THE PIPELINE IS BROKEN: THE PROPOSALS ARE NOT WEIGHED";
    if (m.share >= VALID_FLOOR) return "THE MODEL CAN ASK FOR A RE-FLIGHT";
    if (m.share >= SOMETIMES_FLOOR) return "THE MODEL SOMETIMES ASKS FOR A VALID RE-FLIGHT";
    return "THE MODEL CANNOT ASK FOR A RE-FLIGHT IN THE FORMAT";
}

// ---- the pipeline checks (Q1): a CHECK of the engine, not a finding -------------------------------------------------------------------------------------------------------------------------------------
/** The failures of the pipeline on `seeds` (the last argument is a seam for the gate: the fight, the answer, the reader and the facts generator): the empty kit must repeat run B and the full kit run K, a re-flight must be deterministic, the new facts must continue the numbering without changing the pair's, and a request must round-trip through its line. */
export function pipelineChecks(seeds, fly = A.flyPair, { fly1 = flyKit, answer = answerRequest, read = readRequest, factsOf = A.factsOf } = {}) {
    const f = [];
    for (const seed of seeds) {
        const pair = fly(seed), facts = factsOf(pair), none = fly1(seed, []), all = fly1(seed, [...KIT_NAMES]), again = fly1(seed, ["decoy", "screen"]), twice = fly1(seed, ["decoy", "screen"]);
        if (none.fingerprint !== pair.base.fingerprint) f.push(`seed ${seed}: the empty kit does not repeat run B (fingerprints ${none.fingerprint} and ${pair.base.fingerprint})`);
        if (all.fingerprint !== pair.kit.fingerprint) f.push(`seed ${seed}: the full kit does not repeat run K (fingerprints ${all.fingerprint} and ${pair.kit.fingerprint})`);
        if (again.fingerprint !== twice.fingerprint) f.push(`seed ${seed}: a re-flight flown twice gives two fights (fingerprints ${again.fingerprint} and ${twice.fingerprint})`);
        const a = answer(pair, facts, { seed, kit: ["decoy", "screen"] }), ids = a.facts.map((x) => x.id);
        if (ids.some((id, i) => id !== "F" + (facts.length + i + 1))) f.push(`seed ${seed}: the re-flight's facts are not numbered on from F${facts.length + 1}`);
        if (JSON.stringify(factsOf(pair)) !== JSON.stringify(facts)) f.push(`seed ${seed}: the pair's facts changed`);
        const back = read(requestLine(seed, ["screen", "decoy"]), seed);
        if (!back.ok || back.request.seed !== seed || back.request.kit.join() !== "decoy,screen") f.push(`seed ${seed}: a request does not round-trip through its line`);
    }
    return f;
}
