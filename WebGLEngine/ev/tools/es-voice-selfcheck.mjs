// Self-check for ev/esPhrase.js + ev/esVoice.js — Endless Sky's phrase grammar and the two things it
// says to you.
//
//   node ev/tools/es-voice-selfcheck.mjs
//   node ev/tools/es-voice-selfcheck.mjs /path/to/endless-sky/data   (adds a pass over the real galaxy)
//
// `phrase` was the single largest thing the adapter ignored: 867 nodes, 641 names. Three systems are
// built on it -- government hails, a unique captain's own voice, and 218 spaceport news items -- and all
// three were dead. The grammar is small and every rule in it is load-bearing, so each one is pinned:
// weights, `${...}` interpolation, `replace` acting on what was built SO FAR, a phrase name spread
// across several blocks, an empty choice that is deliberate, and a recursive reference that must yield
// "" rather than either a throw or an infinite string.

import { parseES, parseESFiles } from "../esParse.js";
import { buildUniverseFromES } from "../esData.js";
import { buildPhrases, buildSentence, expandPhrase, expandInline, parseInterpolation, pickWeighted, danglingRefs, MAX_DEPTH } from "../esPhrase.js";
import { hailPhraseName, hailFor, newsMatches, newsFor, pickNews } from "../esVoice.js";
import { makeRng } from "../esAuthority.js";
import fs from "fs";
import path from "path";

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n));
const P = (src) => buildPhrases(parseES(src));

// --- 1. the parts ---------------------------------------------------------------------------
{
    ok("plain text is one span", JSON.stringify(parseInterpolation("hello")) === JSON.stringify([{ t: "hello" }]));
    ok("an interpolation splits the text", JSON.stringify(parseInterpolation("a ${x} b")) === JSON.stringify([{ t: "a " }, { p: "x" }, { t: " b" }]));
    ok("...at the head", JSON.stringify(parseInterpolation("${x} b")) === JSON.stringify([{ p: "x" }, { t: " b" }]));
    ok("...at the tail", JSON.stringify(parseInterpolation("a ${x}")) === JSON.stringify([{ t: "a " }, { p: "x" }]));
    ok("...twice", parseInterpolation("${a}${b}").length === 2);
    ok("an empty choice is deliberate, not a bug", JSON.stringify(parseInterpolation("")) === JSON.stringify([{ t: "" }]));
    ok("an unterminated ${ is literal text", parseInterpolation("a ${x")[0].t === "a ${x");

    ok("weights bias the draw", (() => {
        const choices = [{ w: 1, seq: [{ t: "a" }] }, { w: 99, seq: [{ t: "b" }] }];
        let b = 0; const rng = makeRng(3);
        for (let i = 0; i < 1000; i++) if (pickWeighted(choices, rng).seq[0].t === "b") b++;
        return b > 950 && b < 1000;
    })());
    ok("a weight of zero or nonsense floors at 1", (() => {
        const ph = P('phrase "w"\n\tword\n\t\t"a" 0\n\t\t"b" x\n');
        return ph.w[0][0].choices.every((c) => c.w === 1);
    })());
}

// --- 2. the grammar -------------------------------------------------------------------------
{
    const ph = P([
        'phrase "greeting"',
        '\tword', '\t\t"Hello"', '\t\t"Greetings"',
        '\tword', '\t\t", "',
        '\tphrase', '\t\t"who"',
        'phrase "who"', '\tword', '\t\t"pilot"',
        'phrase "interp"', '\tword', '\t\t"a ${who} speaks"',
        'phrase "weighted"', '\tword', '\t\t"rare"', '\t\t"common" 99',
        'phrase "empty"', '\tword', '\t\t""',
    ].join("\n"));

    ok("phrases are named and collected", Object.keys(ph).length === 5);
    ok("parts concatenate in order", ["Hello, pilot", "Greetings, pilot"].includes(expandPhrase("greeting", ph, makeRng(1))));
    ok("a `phrase` part expands another phrase", expandPhrase("greeting", ph, makeRng(2)).endsWith("pilot"));
    ok("`${name}` interpolates inline", expandPhrase("interp", ph, makeRng(1)) === "a pilot speaks");
    ok("a deliberately empty phrase is empty, not missing", expandPhrase("empty", ph, makeRng(1)) === "");
    ok("an undefined name yields '' rather than a throw", expandPhrase("nope", ph, makeRng(1)) === "");
    ok("expansion is deterministic under a seeded rng",
        expandPhrase("greeting", ph, makeRng(7)) === expandPhrase("greeting", ph, makeRng(7)));
    ok("...and not constant", (() => {
        const rng = makeRng(11), seen = new Set();
        for (let i = 0; i < 30; i++) seen.add(expandPhrase("greeting", ph, rng));
        return seen.size > 1;   // one rng, drawn repeatedly -- consecutive SEEDS are near-identical by design
    })());
    ok("danglingRefs finds nothing here", danglingRefs(ph).length === 0);
    ok("...and finds a broken reference when there is one", danglingRefs(P('phrase "a"\n\tphrase\n\t\t"gone"\n')).join() === "gone");
}

// --- 3. replace acts on what has been built SO FAR --------------------------------------------
// This is the rule that is easy to get wrong: `replace` is a PART, applied in sequence, not a rule for
// the whole phrase. A replace before the text it would change does nothing.
{
    const after = P('phrase "r"\n\tword\n\t\t"aaa"\n\treplace\n\t\t"aa" "b"\n');
    ok("replace rewrites the text before it", expandPhrase("r", after, makeRng(1)) === "ba");
    const before = P('phrase "r"\n\treplace\n\t\t"aa" "b"\n\tword\n\t\t"aaa"\n');
    ok("...and cannot rewrite text that comes after it", expandPhrase("r", before, makeRng(1)) === "aaa");
    const drop = P('phrase "r"\n\tword\n\t\t"a-b"\n\treplace\n\t\t"-" ""\n');
    ok("a replacement to nothing deletes", expandPhrase("r", drop, makeRng(1)) === "ab");
    ok("every occurrence is replaced, not just the first",
        expandPhrase("r", P('phrase "r"\n\tword\n\t\t"xxx"\n\treplace\n\t\t"x" "y"\n'), makeRng(1)) === "yyy");
}

// --- 4. one name, several blocks (the base game spreads them across files) ----------------------
{
    const ph = P('phrase "n"\n\tword\n\t\t"one"\nphrase "n"\n\tword\n\t\t"two"\n');
    ok("repeating a name APPENDS a sentence", ph.n.length === 2);
    const seen = new Set();
    for (let i = 0; i < 40; i++) seen.add(expandPhrase("n", ph, makeRng(i)));
    ok("...and either may be chosen", seen.has("one") && seen.has("two"));
}

// --- 5. recursion yields "", never a throw and never forever -----------------------------------
{
    const self = P('phrase "a"\n\tphrase\n\t\t"a"\n');
    ok("a phrase that names itself yields ''", expandPhrase("a", self, makeRng(1)) === "");
    const cycle = P('phrase "a"\n\tword\n\t\t"A"\n\tphrase\n\t\t"b"\nphrase "b"\n\tphrase\n\t\t"a"\n');
    ok("a two-phrase cycle stops, keeping what it built", expandPhrase("a", cycle, makeRng(1)) === "A");
    ok("...from either end", expandPhrase("b", cycle, makeRng(1)) === "A");
    const interp = P('phrase "a"\n\tword\n\t\t"x${a}"\n');
    ok("a cycle through ${} also stops", expandPhrase("a", interp, makeRng(1)) === "x");
    // a deep but acyclic chain is bounded by MAX_DEPTH rather than the stack
    const deep = [];
    for (let i = 0; i < 40; i++) deep.push(`phrase "p${i}"`, "\tword", `\t\t"."`, "\tphrase", `\t\t"p${i + 1}"`);
    deep.push('phrase "p40"', "\tword", '\t\t"end"');
    const dp = P(deep.join("\n"));
    const out = expandPhrase("p0", dp, makeRng(1));
    ok(`a chain deeper than MAX_DEPTH (${MAX_DEPTH}) is truncated, not a stack overflow`, out.length <= MAX_DEPTH + 4);
    ok("...and a childless part is skipped, as ES skips it", P('phrase "a"\n\tword\n')["a"] === undefined);
}

// --- 6. hails --------------------------------------------------------------------------------
{
    const uni = buildUniverseFromES(parseES([
        'phrase "fnavy"', '\tword', '\t\t"Well met."',
        'phrase "hnavy"', '\tword', '\t\t"Halt!"',
        'phrase "fdis"', '\tword', '\t\t"Need help?"',
        'government "Navy"',
        '\t"friendly hail" "fnavy"', '\t"hostile hail" "hnavy"', '\t"friendly disabled hail" "fdis"',
        'government "Mute"',
        'ship "Sparrow"', '\tattributes', '\t\t"hull" 100', '\t\t"mass" 40', '\t\t"drag" 1',
        'person "Loud"', '\tgovernment "Navy"', '\tfrequency 100',
        '\tphrase', '\t\tword', '\t\t\t"It is I."',
        '\tship "Sparrow" "Ship"',
        'person "Quiet"', '\tgovernment "Navy"', '\tfrequency 100',
        '\tship "Sparrow" "Ship"',
    ].join("\n")));
    const navy = Object.values(uni.govts).find((g) => g.name === "Navy");
    const mute = Object.values(uni.govts).find((g) => g.name === "Mute");
    const rng = makeRng(1);

    ok("a government's hail names are loaded", navy.hails.friendly === "fnavy" && navy.hails.hostile === "hnavy");
    ok("friendly and hostile are different hails", hailPhraseName(navy, {}) === "fnavy" && hailPhraseName(navy, { hostile: true }) === "hnavy");
    ok("a disabled ship has its own hail", hailPhraseName(navy, { disabled: true }) === "fdis");
    ok("...falling back when that government has none", hailPhraseName(navy, { disabled: true, hostile: true }) === "hnavy");
    ok("a government with nothing to say says nothing", hailPhraseName(mute, {}) === null && hailFor(uni, { govt: mute.id }, { rng }) === "");

    ok("a ship speaks for its government", hailFor(uni, { govt: navy.id }, { rng }) === "Well met.");
    ok("...and differently when it hates you", hailFor(uni, { govt: navy.id }, { rng, hostile: true }) === "Halt!");
    ok("a unique captain speaks for herself", hailFor(uni, { govt: navy.id, _person: "Loud" }, { rng }) === "It is I.");
    ok("...and one with no voice falls back to her government",
        hailFor(uni, { govt: navy.id, _person: "Quiet" }, { rng }) === "Well met.");
    ok("an unknown person does not throw", hailFor(uni, { govt: navy.id, _person: "Nobody" }, { rng }) === "Well met.");
    ok("no ship, no words", hailFor(uni, null, { rng }) === "");
    ok("15 of the base game's 16 persons carry a hail; ours does too", uni.persons.find((p) => p.name === "Loud").hail.length === 1);
}

// --- 7. news --------------------------------------------------------------------------------
{
    const uni = buildUniverseFromES(parseES([
        'government "Rep"',
        'government "Pir"',
        'planet "Earth"', '\tgovernment "Rep"', '\tattributes "urban"', '\tdescription "home"',
        'planet "Hole"', '\tgovernment "Pir"', '\tdescription "dive"',
        'system "Sol"', '\tpos 0 0', '\tgovernment "Rep"', '\tobject "Earth"', '\t\tdistance 100',
        'system "Far"', '\tpos 9 0', '\tgovernment "Pir"', '\tobject "Hole"', '\t\tdistance 100',
        'news "rep only"',
        '\tlocation', '\t\tgovernment "Rep"',
        '\tname', '\t\tword', '\t\t\t"Clerk"',
        '\tmessage', '\t\tword', '\t\t\t"All is well."',
        'news "not pirates"',
        '\tlocation', '\t\tnot', '\t\t\tgovernment "Pir"',
        '\tname', '\t\tword', '\t\t\t"Local"',
        '\tmessage', '\t\tword', '\t\t\t"Quiet week."',
        'news "gated"',
        '\tlocation', '\t\tgovernment "Rep"',
        '\tto show', '\t\thas "war"',
        '\tname', '\t\tword', '\t\t\t"Anchor"',
        '\tmessage', '\t\tword', '\t\t\t"War!"',
        'news "urban"',
        '\tlocation', '\t\tattributes "urban"',
        '\tname', '\t\tword', '\t\t\t"Commuter"',
        '\tmessage', '\t\tword', '\t\t\t"Traffic."',
        'news "cannot evaluate"',
        '\tlocation', '\t\tneighbor', '\t\t\tgovernment "Pir"',
        '\tname', '\t\tword', '\t\t\t"X"',
        '\tmessage', '\t\tword', '\t\t\t"Y"',
    ].join("\n")));
    uni.systemById = {}; for (const s of uni.systems) uni.systemById[s.id] = s;
    const sol = uni.systems.find((s) => s.name === "Sol"), far = uni.systems.find((s) => s.name === "Far");
    const earth = uni.spobs[sol.spobs[0].id], hole = uni.spobs[far.spobs[0].id];

    // v2179 -- the `neighbor`-filtered item used to be DROPPED, because the news parser understood only a
    // subset of the LocationFilter grammar. It now runs through the real one, and nothing is thrown away.
    ok("news items load, none dropped", uni.counts.news === 5 && uni.counts.newsDropped === 0);
    ok("...including one whose filter the old parser could not evaluate", uni.news.some((n) => n.id === "cannot evaluate"));
    ok("...and a `neighbor` filter is honoured, not ignored",
        !newsMatches(uni.news.find((n) => n.id === "cannot evaluate").filter, earth, sol, uni));

    const rep = uni.news.find((n) => n.id === "rep only");
    ok("a government filter matches", newsMatches(rep.filter, earth, sol, uni));
    ok("...and excludes", !newsMatches(rep.filter, hole, far, uni));
    const notPir = uni.news.find((n) => n.id === "not pirates");
    ok("a `not` block inverts", newsMatches(notPir.filter, earth, sol, uni) && !newsMatches(notPir.filter, hole, far, uni));
    const urban = uni.news.find((n) => n.id === "urban");
    ok("an attributes filter matches", newsMatches(urban.filter, earth, sol, uni) && !newsMatches(urban.filter, hole, far, uni));

    ok("ungated news shows", newsFor(uni, earth, sol, () => false).length === 3);   // rep only + not pirates + urban
    ok("`to show` keeps a story out until its condition holds", !newsFor(uni, earth, sol, () => false).some((n) => n.id === "gated"));
    ok("...and lets it in when it does", newsFor(uni, earth, sol, () => true).some((n) => n.id === "gated"));
    ok("no gate at all means no gated news, rather than all of it", newsFor(uni, earth, sol, null).length === 3);

    const n = pickNews(uni, earth, sol, { rng: makeRng(1), gate: () => true });
    ok("a story has a name and a message", !!n.name && !!n.message);
    ok("...expanded through the grammar", ["Clerk", "Local", "Anchor", "Commuter"].includes(n.name));
    // A pirate dive matches nothing: not Republic, not non-pirate, not urban. That is the honest way to
    // ask this -- a planet with no government at all would still satisfy `not { government "Pir" }`.
    ok("a planet nobody writes about says nothing", pickNews(uni, hole, far, { rng: makeRng(1), gate: () => true }) === null);
    ok("picking is deterministic under a seeded rng",
        pickNews(uni, earth, sol, { rng: makeRng(5), gate: () => true }).id === pickNews(uni, earth, sol, { rng: makeRng(5), gate: () => true }).id);
}

// --- 8. optional: the real galaxy ---------------------------------------------------------------
const dir = process.argv[2];
if (dir && fs.existsSync(dir)) {
    const gather = (d) => { let o = []; for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith("_")) continue; const p = path.join(d, e.name); if (e.isDirectory()) o = o.concat(gather(p)); else if (e.name.endsWith(".txt")) o.push(p); } return o; };
    const uni = buildUniverseFromES(parseESFiles(gather(dir).map((f) => fs.readFileSync(f, "utf8"))));
    uni.systemById = {}; for (const s of uni.systems) uni.systemById[s.id] = s;
    console.log("");
    console.log(`  (real data: ${uni.counts.phrases} phrases, ${uni.counts.news} news, ${uni.counts.newsDropped} dropped)`);

    ok("real data: no phrase refers to a name that does not exist", danglingRefs(uni.phrases).length === 0);

    let threw = 0, empty = 0;
    for (const name of Object.keys(uni.phrases)) {
        try { if (!expandPhrase(name, uni.phrases, makeRng(11))) empty++; } catch (e) { threw++; }
    }
    ok(`real data: all ${uni.counts.phrases} phrases expand without throwing`, threw === 0);
    ok("real data: almost none expand to nothing (the ones that do are named 'empty')", empty <= 8);

    let hails = 0;
    for (const g of Object.values(uni.govts)) for (const hostile of [false, true]) {
        const t = hailFor(uni, { govt: g.id }, { rng: makeRng(3), hostile });
        if (t) hails++;
    }
    ok(`real data: ${hails} governments have something to say when hailed`, hails > 100);
    ok("real data: every person with a phrase can speak",
        uni.persons.filter((p) => p.hail).every((p) => expandInline(p.hail, uni.phrases, makeRng(2)).length > 0));

    let planets = 0, spoke = 0, err = 0;
    for (const s of uni.systems) for (const sp of s.spobs) {
        if (!sp.landable) continue;
        planets++;
        try { if (pickNews(uni, uni.spobs[sp.id], s, { rng: makeRng(planets), gate: () => true })) spoke++; } catch (e) { err++; }
    }
    ok(`real data: news resolves at every one of ${planets} landable planets, 0 throws`, err === 0);
    ok(`real data: ${spoke} of them have a story`, spoke > planets * 0.5);
}

console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
