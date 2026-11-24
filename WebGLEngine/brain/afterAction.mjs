// WebGLEngine/brain/afterAction.mjs -- UNNUMBERED (the version is chosen at ship time) (the registration is brain/AFTER_ACTION_WIP.md, written BEFORE this file and before any model was asked anything; the command line is tools/ship/takeAfterAction.mjs; the gate is brain/afterAction-selfcheck.mjs)
//
// THE AFTER-ACTION ANALYZER'S MATERIAL AND CHECKER: a deterministic generator that turns a PAIR of Sea OGRE fights (one scenario flown twice by brain/seaOgre.mjs with three GUNNER_THETA defenders, once without countermeasures and once with all three) into at most 24 numbered FACTS, a frozen PROMPT that asks a language model to narrate what differed, and a deterministic CHECKER that
// grades the narration line by line against the facts it cites. Nothing here asks a model anything and nothing here calls one: the model is asked by tools/ship/takeAfterAction.mjs, once, and its reply is recorded; every later reading REPLAYS the record (the convention of Round 5 of the needs series).
//   THE FACTS   F1, F2, ... one line each: `F3 [K] text`; the tag is B (the run without the kit), K (the run with it) or P (the pair); every tick comes with its seconds (tick / 30, one decimal) so that no arithmetic is asked of the model. In the order they are numbered (and so the order they are kept in if a pair has more than 24, the lowest priority going first):
//     the outcome and score of each run; the defenders lost in each; the first divergence of the two logs (the first event, outside the countermeasure releases, at which they differ); the first release and the totals; every decoyed and every intercepted event (a run's repeats are ONE fact with their count and first tick); every loss; the OGRE's torpedoes fired in each; the hits (on the OGRE and on the defenders) in each.
//   SALIENT (the coverage denominator): the two outcome facts, the two lost facts, the divergence fact, and every decoyed, intercepted and loss fact.
//   THE CHECKER  a line is PARSED iff it begins with `[F<number>(,F<number>)*]` and has text after it; a parsed line is SUPPORTED iff (1) every cited id exists, (2) every number written in its sentence as digits (integers and decimals, signs ignored) appears among the numbers of the cited facts, or is an ordinal of one digit (1st .. 9th), (3) it contains none of the causal words, (4) its run is consistent (a sentence with
//   "without" or "no kit" cites no K-only fact; one with "with the kit" cites no B-only fact). Number WORDS ("two") and polarity beyond (4) are NOT checked: both are limits of the checker, said in the report.
// Pure: no I/O, no clock, no Math.random. The fights are deterministic (a pair can be re-flown at will).
"use strict";
import * as G from "./seaOgre.mjs";
import * as T from "./subTournament.mjs";
import * as C from "./subCountermeasures.mjs";

export const TICKS_PER_SECOND = 30, MAX_FACTS = 24, DEFENDERS = 3;
export const SETS = Object.freeze({ dev: Object.freeze({ first: 1, count: 4 }), registered: Object.freeze({ first: 101, count: 12 }) });
export const KIT_ALL = Object.freeze({ decoy: true, screen: true, interceptor: true });
export const RELEASE_TYPES = Object.freeze(["decoy", "screen", "interceptor"]);
export const CAUSAL_WORDS = Object.freeze(["because", "so", "therefore", "caused", "due", "led", "since"]);
export const DROP_ORDER = Object.freeze(["hit", "fired", "release"]);   // the kinds a pair with more than 24 facts loses first, from the last of the kind backwards; the salient kinds are never dropped before these are gone
export const SALIENT_KINDS = Object.freeze(["outcome", "lost", "divergence", "decoyed", "intercepted", "loss"]);
export const MODEL_PARAMS = Object.freeze({ temperature: 0, max_tokens: 600 });
export const SCHEMA = 1;

// ---- the pair ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The defenders of tools/ship/takeCountermeasures.mjs `sidesOgre`, rebuilt here (that constant is not exported; the gate holds that the two give the same fights). */
export const sidesOgre = (n, enabled) => Array.from({ length: n }, (_, i) => { const sd = T.makeSide("d" + i, { theta: G.GUNNER_THETA }).side(); return enabled ? { ...sd, tactics: C.withCountermeasures(sd.tactics, C.CM.tactician, enabled), cm: C.kitOf(enabled) } : sd; });
/** One scenario flown twice: { seed, base, kit } with the fights' results (events, outcome, score, lost, ogreFired, fingerprint ...). */
export function flyPair(seed, n = DEFENDERS) {
    return { seed, base: G.fight(sidesOgre(n, null), G.scenario(seed, n)), kit: G.fight(sidesOgre(n, KIT_ALL), G.scenario(seed, n)) };
}
export const seedsOf = (set) => { const s = SETS[set]; if (!s) throw new Error(`afterAction.seedsOf: unknown set ${JSON.stringify(set)} (${Object.keys(SETS).join(", ")})`); return Array.from({ length: s.count }, (_, i) => s.first + i); };

// ---- the facts --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const secs = (tick) => (tick / TICKS_PER_SECOND).toFixed(1);
const at = (tick) => `tick ${tick} (${secs(tick)} s)`;
/** The numbers written as digits in a text, as numbers (integers and decimals, signs ignored); ordinals of one digit (1st .. 9th) are not numbers, and digits glued to a letter (the F3 of an id) are not numbers either. */
export function numbersIn(text) {
    const out = [], rx = /(?<![A-Za-z0-9])(\d+(?:\.\d+)?)([A-Za-z]*)/g; let m;
    while ((m = rx.exec(String(text))) !== null) { if (/^[1-9]$/.test(m[1]) && /^(st|nd|rd|th)$/i.test(m[2])) continue; out.push(Number(m[1])); }   // an ordinal of one digit is skipped; a unit glued to a number (5s) is not an excuse
    return out;
}
const RUN_NAME = { B: "Without the kit (run B)", K: "With the kit (run K)" };
const fact = (kind, tag, text) => ({ kind, tag, text, salient: SALIENT_KINDS.includes(kind) });
const countOf = (events, type, pred = () => true) => events.filter((e) => e.type === type && pred(e));
const firstTick = (list) => list.reduce((m, e) => Math.min(m, e.tick), Infinity);
const isRelease = (e) => RELEASE_TYPES.includes(e.type);
/** The first tick at which two event lists differ outside the countermeasure releases, with the events there ({ tick, base, kit }), or null. */
export function divergenceOf(baseEvents, kitEvents) {
    const a = baseEvents.filter((e) => !isRelease(e)), b = kitEvents.filter((e) => !isRelease(e)), n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
        if (JSON.stringify(a[i]) === JSON.stringify(b[i])) continue;
        const ticks = [a[i], b[i]].filter(Boolean).map((e) => e.tick);
        return { tick: Math.min(...ticks), base: a[i] || null, kit: b[i] || null };
    }
    return null;
}
const typeOf = (e) => (e ? e.type : "nothing");
/** The facts of a pair in their final order, ids F1 .. Fn assigned: [{ id, kind, tag, text, numbers, salient }]. At most MAX_FACTS: the kinds of DROP_ORDER go first, from the last of the kind backwards; a pair still over the limit loses its LAST salient losses. */
export function factsOf(pair) {
    const runs = [["B", pair.base], ["K", pair.kit]], list = [];
    for (const [tag, r] of runs) list.push(fact("outcome", tag, `${RUN_NAME[tag]}: the fight ended ${r.outcome}, score ${r.score.toFixed(3)}.`));
    for (const [tag, r] of runs) list.push(fact("lost", tag, `${RUN_NAME[tag]}: ${r.lost} defenders were lost.`));
    const d = divergenceOf(pair.base.events, pair.kit.events);
    list.push(fact("divergence", "P", d ? `The two runs first differ at ${at(d.tick)}, in an event that is not a countermeasure release (without the kit: ${typeOf(d.base)}; with the kit: ${typeOf(d.kit)}).` : "The two runs do not differ in any event that is not a countermeasure release."));
    const rel = pair.kit.events.filter(isRelease);
    if (rel.length) { const f = rel[0], c = (t) => rel.filter((e) => e.type === t).length; list.push(fact("release", "K", `${RUN_NAME.K}: the first release was a ${f.type} by boat ${f.boat} at ${at(f.tick)}; in all ${c("decoy")} decoys, ${c("screen")} screens and ${c("interceptor")} interceptors were released.`)); }
    else list.push(fact("release", "K", `${RUN_NAME.K}: nothing was released.`));
    for (const [type, kind, noun] of [["decoyed", "decoyed", "torpedoes were decoyed"], ["intercepted", "intercepted", "torpedoes were intercepted"]]) for (const [tag, r] of runs) { const l = countOf(r.events, type); if (l.length) list.push(fact(kind, tag, `${RUN_NAME[tag]}: ${l.length} ${noun}, the first at ${at(firstTick(l))}.`)); }
    for (const [tag, r] of runs) for (const e of countOf(r.events, "loss")) list.push(fact("loss", tag, `${RUN_NAME[tag]}: boat ${e.boat} was lost at ${at(e.tick)} (${e.why}).`));
    for (const [tag, r] of runs) list.push(fact("fired", tag, `${RUN_NAME[tag]}: the OGRE fired ${r.ogreFired} torpedoes.`));
    for (const [tag, r] of runs) { const onOgre = countOf(r.events, "hit", (e) => e.boat !== 0), onDef = countOf(r.events, "hit", (e) => e.boat === 0); if (onOgre.length) list.push(fact("hit", tag, `${RUN_NAME[tag]}: ${onOgre.length} hits landed on the OGRE, the first at ${at(firstTick(onOgre))}.`)); if (onDef.length) list.push(fact("hit", tag, `${RUN_NAME[tag]}: ${onDef.length} hits landed on the defenders, the first at ${at(firstTick(onDef))}.`)); }
    let kept = list;
    for (const kind of DROP_ORDER) while (kept.length > MAX_FACTS && kept.some((f) => f.kind === kind)) { const i = kept.map((f) => f.kind).lastIndexOf(kind); kept = kept.filter((_, j) => j !== i); }
    while (kept.length > MAX_FACTS) { const i = kept.map((f) => f.kind).lastIndexOf("loss"); kept = kept.filter((_, j) => j !== (i >= 0 ? i : kept.length - 1)); }
    return kept.map((f, i) => ({ id: "F" + (i + 1), ...f, numbers: numbersIn(f.text) }));
}
export const lineOf = (f) => `${f.id} [${f.tag}] ${f.text}`;
export const salientOf = (facts) => facts.filter((f) => f.salient);

// ---- the prompt ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const PROMPT_HEAD = "FACTS from two flights of the same Sea OGRE scenario (tags: B = the run without the kit, K = the run with the kit, P = about the pair):";
export const PROMPT_ASK = "Write 4 to 8 lines. Each line begins with the ids it uses in square brackets, for example [F3,F7], then one sentence. Use only numbers that appear in the facts you cite, written as digits. Say which run (with the kit, without) each sentence is about. Do not say why anything happened. Do not use the words because, so, therefore, caused, due, led, since.";
export const promptOf = (facts) => `${PROMPT_HEAD}\n${facts.map(lineOf).join("\n")}\n\n${PROMPT_ASK}`;

// ---- the checker ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const PARSE = /^\s*\[\s*(F\d+(?:\s*,\s*F\d+)*)\s*\]\s*(\S.*?)\s*$/;
/** The lines of a reply: [{ raw, parsed, ids, sentence }]; empty lines are not lines. */
export function parseNarration(reply) {
    return String(reply ?? "").split(/\r?\n/).filter((l) => l.trim() !== "").map((raw) => { const m = PARSE.exec(raw); return m ? { raw, parsed: true, ids: m[1].split(",").map((s) => s.trim()), sentence: m[2] } : { raw, parsed: false, ids: [], sentence: raw.trim() }; });
}
const causalIn = (text) => CAUSAL_WORDS.filter((w) => new RegExp(`\\b${w}\\b`, "i").test(text));
/** One line graded against the facts: { raw, parsed, supported, ids, reasons } with reasons from: noids, id, number, causal, run. */
export function checkLine(line, facts) {
    if (!line.parsed) return { raw: line.raw, parsed: false, supported: false, ids: [], reasons: ["noids"] };
    const byId = new Map(facts.map((f) => [f.id, f])), reasons = [], cited = [];
    for (const id of line.ids) { const f = byId.get(id); if (!f) { if (!reasons.includes("id")) reasons.push("id"); } else cited.push(f); }
    const allowed = cited.flatMap((f) => f.numbers);
    if (numbersIn(line.sentence).some((x) => !allowed.some((y) => Math.abs(x - y) < 1e-9))) reasons.push("number");
    if (causalIn(line.sentence).length) reasons.push("causal");
    const s = line.sentence.toLowerCase();
    if ((/\bwithout\b|\bno kit\b/.test(s) && cited.some((f) => f.tag === "K")) || (/\bwith the kit\b/.test(s) && cited.some((f) => f.tag === "B"))) reasons.push("run");
    return { raw: line.raw, parsed: true, supported: reasons.length === 0, ids: line.ids, reasons };
}
/** A whole narration graded: { lines: [...], parsed, supported, total, words, cited: Set of ids cited by SUPPORTED lines, salient, covered }. */
export function checkNarration(reply, facts) {
    const lines = parseNarration(reply).map((l) => checkLine(l, facts)), parsed = lines.filter((l) => l.parsed).length, supported = lines.filter((l) => l.supported).length;
    const cited = new Set(lines.filter((l) => l.supported).flatMap((l) => l.ids)), sal = salientOf(facts), covered = sal.filter((f) => cited.has(f.id)).length;
    return { lines, parsed, supported, total: lines.length, words: String(reply ?? "").split(/\s+/).filter(Boolean).length, salient: sal.length, covered };
}
/** The template narrator, the checker's positive control: one line per salient fact, citing itself, saying exactly the fact's sentence. */
export const templateNarration = (facts) => salientOf(facts).map((f) => `[${f.id}] ${f.text}`).join("\n");

// ---- the measures -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const FORMAT_FLOOR = 0.5, SUPPORT_FLOOR = 0.9, NARRATION_FLOOR = 0.75, COVERAGE_FLOOR = 0.8, SHUFFLED_CEILING = 0.5;
/** Pooled over narrations ([{ facts, reply }]): FORMAT, SUPPORT, COVERAGE, the narrations under 0.75, the mean words and lines, and the count of each failing kind of line. */
export function measuresOf(entries) {
    const rs = entries.map((e) => checkNarration(e.reply, e.facts)), sum = (k) => rs.reduce((s, r) => s + r[k], 0), total = sum("total"), kinds = { noids: 0, id: 0, number: 0, causal: 0, run: 0 };
    for (const r of rs) for (const l of r.lines) for (const k of l.reasons) kinds[k]++;
    const under = rs.filter((r) => (r.total ? r.supported / r.total : 0) < NARRATION_FLOOR).length;
    return { narrations: rs.length, lines: total, format: total ? sum("parsed") / total : 0, support: total ? sum("supported") / total : 0, coverage: sum("salient") ? sum("covered") / sum("salient") : 0, under, words: rs.length ? sum("words") / rs.length : 0, linesPer: rs.length ? total / rs.length : 0, kinds, per: rs };
}
/** The shuffled control: each narration graded against the facts of the NEXT pair (the last against the first). Returns the pooled SUPPORT. */
export function shuffledSupport(entries) {
    const shifted = entries.map((e, j) => ({ facts: entries[(j + 1) % entries.length].facts, reply: e.reply }));
    return measuresOf(shifted).support;
}
/** The registered bottom line of one model, the first that applies, given whether the checks held. */
export function readingOf(m, checksHeld = true) {
    if (!checksHeld) return "THE CHECKER IS BROKEN: THE READINGS ARE NOT WEIGHED";
    if (m.format < FORMAT_FLOOR) return "THE MODEL CANNOT FOLLOW THE FORMAT";
    if (m.support < SUPPORT_FLOOR || m.under > 1) return "UNFAITHFUL: THE NARRATION CANNOT BE TRUSTED LINE BY LINE";
    if (m.coverage < COVERAGE_FLOOR) return "FAITHFUL BUT INCOMPLETE";
    return "FAITHFUL AND COMPLETE";
}

// ---- the transcript ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** FNV-1a over a string, eight hex digits. */
export function hashOf(text) { let h = 0x811c9dc5; const s = String(text); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0"); }
/** The key a reply is stored under: a hash of the model id, the parameters and the prompt. */
export const transcriptKey = (model, params, prompt) => hashOf(JSON.stringify([model, params, prompt]));
export const headerOf = (model, params = MODEL_PARAMS) => ({ kind: "afterAction-transcript", schema: SCHEMA, model, params: { ...params } });
export const entryOf = (model, params, seed, prompt, reply) => ({ key: transcriptKey(model, params, prompt), seed, promptHash: hashOf(prompt), reply });
/** The registered transcript checks (section 6, check 4): twelve replies, one model id and one set of parameters throughout, no duplicate pair, every key what its prompt says. Returns the failures. */
export function transcriptChecks(header, entries, expected) {
    const f = [];
    if (!header || header.kind !== "afterAction-transcript" || header.schema !== SCHEMA) f.push("the header is not an afterAction-transcript of schema " + SCHEMA);
    else if (typeof header.model !== "string" || !header.model) f.push("the header names no model id");
    if (entries.length !== expected.length) f.push(`the transcript holds ${entries.length} replies and the set has ${expected.length} pairs`);
    const seeds = entries.map((e) => e.seed);
    if (new Set(seeds).size !== seeds.length) f.push("a pair is in the transcript twice");
    for (const e of expected) if (!seeds.includes(e.seed)) f.push(`the pair ${e.seed} has no reply`);
    for (const e of entries) {
        const want = expected.find((x) => x.seed === e.seed);
        if (want && header && e.key !== transcriptKey(header.model, header.params, want.prompt)) f.push(`the reply of pair ${e.seed} is not stored under the key of this model, these parameters and this prompt`);
        if (typeof e.reply !== "string") f.push(`the reply of pair ${e.seed} is not text`);
    }
    return f;
}
