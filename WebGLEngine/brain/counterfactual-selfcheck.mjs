// WebGLEngine/brain/counterfactual-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/counterfactual-selfcheck.mjs      (about 25 s)
//
// THE GATE OF brain/counterfactual.mjs: the counterfactual re-flights, registered in brain/COUNTERFACTUAL_WIP.md before any code. Stub fights hold the logic of the facts; a few real fights (dev seeds 1 and 2, and Scenario 105 under the decoy alone) hold the wiring. No model is asked anything.
//   1  REGISTERED  schema 1, the three kit names in the analyzer's order, the seven reasons in order, the floors 0.9 and 0.5, the eight subsets in their fixed order and frozen.
//   2  PARSE       the REQUEST line: none, many, json, a line anywhere in the reply, indented, CRLF, a word that only starts like it, lower case; the JSON as found.
//   3  VALIDATE    each reason alone, in the order shape, seed, kit, seedNotShown; the kit written back in the analyzer's order; readRequest end to end.
//   4  THE LINE    requestLine and the round trip.
//   5  THE RUNNER  flyKit refusals by their words; the empty kit IS run B and the full kit IS run K (fingerprints) on two dev seeds; the subset is what is flown (Scenario 105 under the decoy alone gives its known fight: breached, score -0.167, 0 lost), the order of the names does not matter; repeatsOf by fingerprint.
//   6  THE FACTS   the re-flight's facts word for word on a stub fight in every branch (repeat of B, of K, no divergence, a divergence, nothing released, losses, decoyed, intercepted, hits on the OGRE and on the defenders) and on the real 105 re-flight (seven facts); ids continuing; the pair's facts untouched; answerRequest refuses another seed.
//   7  THE PROMPT  the ask word for word, with the seed, and the prompt as the analyzer's head, the facts, a blank line, the ask.
//   8  THE MEASURES VALID, the refusals by reason, the repeats, the fresh outcomes, the kits asked for; the bottom line at the edges of 0.9 and 0.5 and when the checks failed.
//   9  THE PIPELINE the checks pass on the dev seeds 1 and 2 and fail by their words when the pair does not match the re-flight.
// NOT CHECKED, said plainly: that a model can write a REQUEST line (that is the owed run); that the twelve registered pairs pass the pipeline checks (the command's report runs them).
//
// SABOTAGE LOG (2026-11-07), brain/counterfactual.mjs -- 132 mutants: 112 mechanical (every comparison, sign, arithmetic operator, constant +-1 and boolean of every code line, one at a time) and 20 by hand (two REQUEST lines not refused, the word boundary of REQUEST dropped, extra keys accepted, a decimal seed accepted, a kit name twice accepted, another seed accepted, the kit returned as written, the empty kit flown as an all-false subset, the labels of a repeat swapped, the divergence taken
// against run K, the new facts numbered from the pair's last, a repeat also counted as fresh, VALID at exactly 0.9 refused, the ask losing its last sentence, the kit names joined with a comma, the full kit missing from the subsets, a request answered for another seed, the loss facts dropped, hits on the OGRE and on the defenders swapped, no blank line before the ask), each applied to an isolated tree and this gate run; the file restored (sha256 be2138d6... identical before and after the first pass; the seams of `pipelineChecks` were added between the passes: 9f2e5737... from there, and this gate was run whole on it).
//   FIRST PASS: 102 red, 20 threw, 10 went 0 red. THE TEN: (a) the three checks of `pipelineChecks` that cannot fail on honest code -- the determinism of a re-flight, the numbering of the new facts and the round trip of a request -- were never made to fail (the real functions are right), so a mutant inside them was invisible: `pipelineChecks` now takes the fight, the answer, the reader and the facts generator as seams, and the gate makes each misbehave in turn (a fingerprint that changes between two flights, facts numbered
//   one late, only the second or third wrong, all one late, a pair whose facts change, a refused request, the wrong seed, the kit in the wrong order, a name missing) and pins the words of each failure; (b) the `fresh` count was compared as a SUM over four controlled pairs, so two wrong comparisons cancelled (one pair counted fresh that should not be, another not counted that should): each pair is now read alone; (c) the empty kit flown as an all-false subset (below).
//   SECOND PASS: the 10 survivors and the one mutant of the new seam line, re-run: 10 red (one by a throw), then the last two (P0086 and P0087, the `fresh` comparisons) after the per-pair rows: red. 1 REMAINS AND IS EQUIVALENT, argued: the empty kit flown as `enabledOf([])` (every countermeasure false) instead of as no kit at all -- the tactician's wrapper with nothing enabled releases nothing and the fight has run B's fingerprint on dev seeds 1 and 2 and Scenario 105, so the gate cannot tell them apart; the report's pipeline check runs the same comparison on every seed of the set it reads (twelve registered pairs), where a difference would be named.
"use strict";
import * as A from "./afterAction.mjs";
import * as CF from "./counterfactual.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished, which is a failure of whatever it was asking: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify, near = (a, b, tol) => Math.abs(a - b) <= tol;
const msg = (f) => { try { f(); return null; } catch (e) { return e.message; } };
console.log("counterfactual-selfcheck -- the counterfactual re-flights\n");

sec("1. THE REGISTERED THINGS");
{
    ok("!! schema 1; the kit names are decoy, screen, interceptor in the analyzer's order; the seven reasons in the registered order; the floors 0.9 and 0.5; three defenders", CF.SCHEMA === 1 && J(CF.KIT_NAMES) === J(["decoy", "screen", "interceptor"]) && J(CF.REASONS) === J(["none", "many", "json", "shape", "seed", "kit", "seedNotShown"]) && CF.VALID_FLOOR === 0.9 && CF.SOMETIMES_FLOOR === 0.5 && CF.DEFENDERS === 3);
    ok("!! the eight subsets in their fixed order (none, each alone, each pair, all three), each frozen, and their names joined with +", J(CF.SUBSETS) === J([[], ["decoy"], ["screen"], ["interceptor"], ["decoy", "screen"], ["decoy", "interceptor"], ["screen", "interceptor"], ["decoy", "screen", "interceptor"]]) && CF.SUBSETS.every((s) => Object.isFrozen(s)) && Object.isFrozen(CF.SUBSETS) && J(CF.SUBSETS.map(CF.kitName)) === J(["none", "decoy", "screen", "interceptor", "decoy+screen", "decoy+interceptor", "screen+interceptor", "decoy+screen+interceptor"]));
}

sec("2. PARSING THE REPLY");
{
    const p = (t) => CF.parseRequestLine(t), good = 'REQUEST {"seed": 105, "kit": ["decoy", "screen"]}';
    ok("!! no REQUEST line is `none` (an empty reply, null, undefined, a reply without the word, the word in lower case, a word that only STARTS like it); two REQUEST lines are `many`", p("").reason === "none" && p(null).reason === "none" && p(undefined).reason === "none" && p("I would fly it again.").reason === "none" && p(good.toLowerCase()).reason === "none" && p("REQUESTED " + good.slice(8)).reason === "none" && p("see REQUEST {}").reason === "none" && p(good + "\n" + good).reason === "many" && p(good + "\nsome words\n" + good).reason === "many");
    ok("!! a REQUEST line is found anywhere in the reply, indented, with CRLF endings, after other lines, and its JSON is returned as parsed", J(p("Sure.\n" + good + "\nThanks").value) === J({ seed: 105, kit: ["decoy", "screen"] }) && p("  \t" + good).ok === true && p("a\r\n" + good + "\r\nb").ok === true && p("REQUEST[1]").ok === true && J(p("REQUEST[1]").value) === "[1]" && p("REQUEST [1,2]").ok === true && J(p("REQUEST [1,2]").value) === "[1,2]" && p("REQUEST   {\"a\":1}   ").ok === true);
    ok("!! text that is not JSON is `json` (no JSON after the word, a trailing word, single quotes, an unclosed brace); the word alone is `json`", p("REQUEST").reason === "json" && p("REQUEST seed 105").reason === "json" && p(good + " thanks").reason === "json" && p("REQUEST {'seed': 105}").reason === "json" && p('REQUEST {"seed": 105').reason === "json");
}

sec("3. VALIDATING THE REQUEST");
{
    const v = (x, s = 105) => CF.validateRequest(x, s), r = (x, s = 105) => (v(x, s).ok ? "ok" : v(x, s).reason);
    ok("!! `shape`: not an object, null, an array, a number, a string, one key, three keys, the wrong keys", r(null) === "shape" && r([]) === "shape" && r(105) === "shape" && r("x") === "shape" && r(undefined) === "shape" && r({}) === "shape" && r({ seed: 105 }) === "shape" && r({ kit: [] }) === "shape" && r({ seed: 105, kit: [], why: "x" }) === "shape" && r({ seed: 105, k: [] }) === "shape" && r({ seeds: 105, kit: [] }) === "shape");
    ok("!! `seed`: not a whole number (a string, a decimal, null, a boolean, NaN, Infinity); a negative or zero whole number is a whole number", r({ seed: "105", kit: [] }) === "seed" && r({ seed: 105.5, kit: [] }) === "seed" && r({ seed: null, kit: [] }) === "seed" && r({ seed: true, kit: [] }) === "seed" && r({ seed: NaN, kit: [] }) === "seed" && r({ seed: Infinity, kit: [] }) === "seed" && r({ seed: 0, kit: [] }, 0) === "ok" && r({ seed: -3, kit: [] }, -3) === "ok");
    ok("!! `kit`: not a list (a string, an object, null), an unknown name (also in another case, with a space), a name twice, a non-string; the empty list and the full list are fine", r({ seed: 105, kit: "decoy" }) === "kit" && r({ seed: 105, kit: { decoy: true } }) === "kit" && r({ seed: 105, kit: null }) === "kit" && r({ seed: 105, kit: ["flare"] }) === "kit" && r({ seed: 105, kit: ["Decoy"] }) === "kit" && r({ seed: 105, kit: ["decoy "] }) === "kit" && r({ seed: 105, kit: ["decoy", "decoy"] }) === "kit" && r({ seed: 105, kit: [1] }) === "kit" && r({ seed: 105, kit: ["decoy", "flare"] }) === "kit" && r({ seed: 105, kit: [] }) === "ok" && r({ seed: 105, kit: ["decoy", "screen", "interceptor"] }) === "ok");
    ok("!! `seedNotShown`: a valid request for another seed; and the ORDER of the reasons: shape before seed before kit before seedNotShown (a request with a bad seed AND a bad kit is `seed`; with a bad kit and another seed is `kit`)", r({ seed: 104, kit: [] }) === "seedNotShown" && r({ seed: "x", kit: ["flare"] }) === "seed" && r({ seed: 104, kit: ["flare"] }) === "kit" && r({ seed: 1.5, kit: "x" }) === "seed" && r({ seed: 105, kit: [] }, 104) === "seedNotShown");
    const a = v({ seed: 105, kit: ["interceptor", "decoy"] });
    ok("!! a valid request comes back with the kit in the analyzer's order (interceptor, decoy -> decoy, interceptor) and the seed; the key order of the object does not matter ({kit, seed})", a.ok === true && a.request.seed === 105 && J(a.request.kit) === J(["decoy", "interceptor"]) && v({ kit: ["screen"], seed: 7 }, 7).ok === true && J(v({ kit: ["screen"], seed: 7 }, 7).request) === J({ seed: 7, kit: ["screen"] }));
    const e = CF.readRequest('chatter\nREQUEST {"seed": 105, "kit": ["screen","decoy"]}\n', 105), e2 = CF.readRequest("REQUEST {}", 105), e3 = CF.readRequest("nothing", 105), e4 = CF.readRequest('REQUEST {"seed": 3, "kit": []}', 105);
    ok("!! readRequest does it end to end: a good reply gives the request (kit in order); a bad one gives the reason of the stage that refused (shape, none, seedNotShown)", e.ok === true && J(e.request) === J({ seed: 105, kit: ["decoy", "screen"] }) && e2.ok === false && e2.reason === "shape" && e3.reason === "none" && e4.reason === "seedNotShown");
}

sec("4. THE REQUEST LINE");
{
    ok("!! requestLine writes `REQUEST` and the JSON of seed then kit; a written line reads back (every subset, seed 105)", CF.requestLine(105, ["decoy", "screen"]) === 'REQUEST {"seed":105,"kit":["decoy","screen"]}' && CF.requestLine(3, []) === 'REQUEST {"seed":3,"kit":[]}' && CF.SUBSETS.every((s) => { const r = CF.readRequest(CF.requestLine(105, [...s]), 105); return r.ok && J(r.request) === J({ seed: 105, kit: [...s] }); }));
}

// ---- stub fights ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const fight = (over = {}) => ({ outcome: "defended", score: 1.5, lost: 1, ogreFired: 3, fingerprint: "fp-x", events: [{ tick: 10, type: "ping", boat: 1 }], ...over });
const PAIRB = fight({ fingerprint: "fp-b", events: [{ tick: 10, type: "ping", boat: 1 }, { tick: 300, type: "hit", boat: 0 }] }), PAIRK = fight({ fingerprint: "fp-k", outcome: "breached", score: -0.3, events: [{ tick: 10, type: "ping", boat: 1 }, { tick: 100, type: "decoy", boat: 2 }, { tick: 300, type: "decoyed", boat: 0 }] });
const PAIR = { seed: 7, base: PAIRB, kit: PAIRK };

sec("5. THE RUNNER (real fights)");
{
    ok("!! flyKit refuses a seed that is not a whole number and a kit that is not distinct known names, by their words", msg(() => CF.flyKit(1.5, [])) === 'counterfactual.flyKit: the seed must be a whole number, got 1.5' && msg(() => CF.flyKit("1", [])) === 'counterfactual.flyKit: the seed must be a whole number, got "1"' && msg(() => CF.flyKit(1, ["flare"])) === 'counterfactual.flyKit: the kit must be distinct names from decoy, screen, interceptor, got ["flare"]' && msg(() => CF.flyKit(1, ["decoy", "decoy"])) === 'counterfactual.flyKit: the kit must be distinct names from decoy, screen, interceptor, got ["decoy","decoy"]' && msg(() => CF.flyKit(1, "decoy")) !== null);
    const checks = [1, 2].map((seed) => { const pair = A.flyPair(seed); return { none: CF.flyKit(seed, []).fingerprint === pair.base.fingerprint, all: CF.flyKit(seed, ["decoy", "screen", "interceptor"]).fingerprint === pair.kit.fingerprint, order: CF.flyKit(seed, ["interceptor", "decoy", "screen"]).fingerprint === pair.kit.fingerprint, differs: pair.base.fingerprint !== pair.kit.fingerprint }; });
    ok("!! on dev seeds 1 and 2 the EMPTY kit is run B's fight and the full kit run K's (fingerprints), whatever the order of the names, and the two runs of a pair are different fights", checks.every((c) => c.none && c.all && c.order && c.differs));
    const d = CF.flyKit(105, ["decoy"]), d2 = CF.flyKit(105, ["screen", "decoy"]), d3 = CF.flyKit(105, ["decoy", "screen"]);
    ok("!! the subset is what is flown: Scenario 105 under the decoy alone is the known fight (breached, score -0.1673, 0 lost, 3 OGRE torpedoes, 2 decoyed, 9 decoys released, 0 screens), and the order of the names does not matter", d.outcome === "breached" && near(d.score, -0.16732442580514106, 1e-9) && d.lost === 0 && d.ogreFired === 3 && d.events.filter((e) => e.type === "decoyed").length === 2 && d.events.filter((e) => e.type === "decoy").length === 9 && d.events.filter((e) => e.type === "screen").length === 0 && d2.fingerprint === d3.fingerprint && d2.fingerprint !== d.fingerprint);
    ok("!! repeatsOf compares fingerprints: B when it matches the base, K when it matches the kit, null when neither (the base first if both)", CF.repeatsOf(PAIR, fight({ fingerprint: "fp-b" })) === "B" && CF.repeatsOf(PAIR, fight({ fingerprint: "fp-k" })) === "K" && CF.repeatsOf(PAIR, fight({ fingerprint: "fp-z" })) === null && CF.repeatsOf({ base: fight({ fingerprint: "s" }), kit: fight({ fingerprint: "s" }) }, fight({ fingerprint: "s" })) === "B");
}

sec("6. THE FACTS OF A RE-FLIGHT");
{
    const lines = (run, kit, after = 10) => CF.reflightFacts(PAIR, run, kit, after).map(A.lineOf);
    // a repeat of run B (the empty kit)
    const rb = lines(fight({ fingerprint: "fp-b", events: PAIRB.events }), []);
    ok("!! a re-flight with the empty kit that repeats run B says so (P), names the kit `none`, finds no divergence, and its numbering starts after the pair's 10 facts", rb[0] === "F11 [C] Re-flight (run C, kit: none): the fight ended defended, score 1.500." && rb[1] === "F12 [C] Re-flight (run C, kit: none): 1 defenders were lost." && rb[2] === "F13 [P] Re-flight (run C, kit: none): this fight is the same as run B, the run without the kit (the same fingerprint)." && rb[3] === "F14 [P] The re-flight and the run without the kit do not differ in any event that is not a countermeasure release." && rb.length === 7 && rb[4] === "F15 [C] Re-flight (run C, kit: none): nothing was released." && rb[5] === "F16 [C] Re-flight (run C, kit: none): the OGRE fired 3 torpedoes." && rb[6] === "F17 [C] Re-flight (run C, kit: none): 1 hits landed on the defenders, the first at tick 300 (10.0 s).", rb.join(" | "));
    const rk = lines(fight({ fingerprint: "fp-k", events: PAIRK.events }), ["decoy", "screen", "interceptor"]);
    ok("!! a re-flight that repeats run K is said to repeat run K, 'the run with the kit'; the kit name is joined with +", /^F11 \[C\] Re-flight \(run C, kit: decoy\+screen\+interceptor\): the fight ended defended, score 1\.500\.$/.test(rk[0]) && rk.includes("F13 [P] Re-flight (run C, kit: decoy+screen+interceptor): this fight is the same as run K, the run with the kit (the same fingerprint).") && !rb.some((l) => /run K/.test(l)));
    const ev = [{ tick: 10, type: "ping", boat: 1 }, { tick: 90, type: "decoy", boat: 3, id: 1 }, { tick: 120, type: "screen", boat: 2 }, { tick: 150, type: "decoy", boat: 3, id: 2 }, { tick: 200, type: "intercepted", boat: 0 }, { tick: 250, type: "decoyed", boat: 0 }, { tick: 260, type: "decoyed", boat: 0 }, { tick: 300, type: "loss", boat: 1, why: "sunk" }, { tick: 330, type: "loss", boat: 2, why: "sunk" }, { tick: 400, type: "hit", boat: 3 }, { tick: 450, type: "hit", boat: 2 }, { tick: 500, type: "hit", boat: 0 }];
    const run = fight({ outcome: "breached", score: -0.317, lost: 2, ogreFired: 4, fingerprint: "fp-n", events: ev }), f = lines(run, ["decoy", "screen"], 5);
    ok("!! a new fight in every branch: the outcome and score (three decimals), the defenders lost, the divergence from run B with the event types and the seconds (tick / 30, one decimal), the first release with the totals, the decoyed and intercepted counts with the first tick, EVERY loss, the OGRE's torpedoes, and the hits split between the OGRE and the defenders, ids from F6", J(f) === J([
        "F6 [C] Re-flight (run C, kit: decoy+screen): the fight ended breached, score -0.317.",
        "F7 [C] Re-flight (run C, kit: decoy+screen): 2 defenders were lost.",
        "F8 [P] The re-flight and the run without the kit first differ at tick 200 (6.7 s), in an event that is not a countermeasure release (without the kit: hit; re-flight: intercepted).",
        "F9 [C] Re-flight (run C, kit: decoy+screen): the first release was a decoy by boat 3 at tick 90 (3.0 s); in all 2 decoys, 1 screens and 0 interceptors were released.",
        "F10 [C] Re-flight (run C, kit: decoy+screen): 2 torpedoes were decoyed, the first at tick 250 (8.3 s).",
        "F11 [C] Re-flight (run C, kit: decoy+screen): 1 torpedoes were intercepted, the first at tick 200 (6.7 s).",
        "F12 [C] Re-flight (run C, kit: decoy+screen): boat 1 was lost at tick 300 (10.0 s) (sunk).",
        "F13 [C] Re-flight (run C, kit: decoy+screen): boat 2 was lost at tick 330 (11.0 s) (sunk).",
        "F14 [C] Re-flight (run C, kit: decoy+screen): the OGRE fired 4 torpedoes.",
        "F15 [C] Re-flight (run C, kit: decoy+screen): 2 hits landed on the OGRE, the first at tick 400 (13.3 s).",
        "F16 [C] Re-flight (run C, kit: decoy+screen): 1 hits landed on the defenders, the first at tick 500 (16.7 s)."]), f.join(" | "));
    const quiet = lines(fight({ fingerprint: "fp-q", events: [{ tick: 10, type: "ping", boat: 1 }, { tick: 300, type: "hit", boat: 0 }] }), ["interceptor"], 0);
    ok("!! with nothing released the release fact says so; with no divergence from run B (outside the releases) the divergence fact says that; no decoyed, intercepted, loss or hit facts are made up when there are none (a hit on a defender only gives the defenders' fact)", quiet.includes("F4 [C] Re-flight (run C, kit: interceptor): nothing was released.") && quiet.includes("F3 [P] The re-flight and the run without the kit do not differ in any event that is not a countermeasure release.") && !quiet.some((l) => /decoyed|intercepted|was lost|on the OGRE/.test(l)) && quiet.includes("F6 [C] Re-flight (run C, kit: interceptor): 1 hits landed on the defenders, the first at tick 300 (10.0 s).") && quiet.length === 6, quiet.join(" | "));
    const sal = CF.reflightFacts(PAIR, run, ["decoy", "screen"], 5), by = Object.fromEntries(sal.map((x) => [x.kind, x]));
    ok("!! each fact has its id, kind, tag, salient flag and the numbers written in its text: the outcome, lost, divergence, decoyed, intercepted and loss facts are salient, the release, fired and hit facts are not; the numbers of F9 are 90 and 3.0 and 2, 1, 0 (the kit name carries no digits)", sal.every((x) => /^F\d+$/.test(x.id) && ["C", "P"].includes(x.tag) && Array.isArray(x.numbers)) && by.outcome.salient && by.lost.salient && by.divergence.salient && by.decoyed.salient && by.intercepted.salient && sal.filter((x) => x.kind === "loss").every((x) => x.salient) && !by.release.salient && !by.fired.salient && !sal.filter((x) => x.kind === "hit").some((x) => x.salient) && J(by.release.numbers) === J([3, 90, 3, 2, 1, 0]) && J(by.outcome.numbers) === J([0.317]) && J(by.lost.numbers) === J([2]));
    // the real 105 decoy re-flight
    const pair = A.flyPair(105), facts = A.factsOf(pair), a = CF.answerRequest(pair, facts, { seed: 105, kit: ["decoy"] });
    ok("!! the real re-flight of 105 under the decoy alone, word for word: seven facts F18 to F24 after the pair's 17, no repeat fact, the first divergence at tick 2986 (a hit without the kit, a decoyed torpedo in the re-flight), 8 hits on the OGRE", J(a.facts.map(A.lineOf)) === J([
        "F18 [C] Re-flight (run C, kit: decoy): the fight ended breached, score -0.167.",
        "F19 [C] Re-flight (run C, kit: decoy): 0 defenders were lost.",
        "F20 [P] The re-flight and the run without the kit first differ at tick 2986 (99.5 s), in an event that is not a countermeasure release (without the kit: hit; re-flight: decoyed).",
        "F21 [C] Re-flight (run C, kit: decoy): the first release was a decoy by boat 3 at tick 1509 (50.3 s); in all 9 decoys, 0 screens and 0 interceptors were released.",
        "F22 [C] Re-flight (run C, kit: decoy): 2 torpedoes were decoyed, the first at tick 2986 (99.5 s).",
        "F23 [C] Re-flight (run C, kit: decoy): the OGRE fired 3 torpedoes.",
        "F24 [C] Re-flight (run C, kit: decoy): 8 hits landed on the OGRE, the first at tick 2227 (74.2 s)."]) && facts.length === 17 && a.repeats === null && a.seed === 105 && J(a.kit) === J(["decoy"]), a.facts.map(A.lineOf).join(" | "));
    const none = CF.answerRequest(pair, facts, { seed: 105, kit: [] }), all = CF.answerRequest(pair, facts, { seed: 105, kit: ["decoy", "screen", "interceptor"] });
    ok("!! answerRequest: the empty kit repeats run B and the full kit run K (with the repeat fact, ids from F18), the pair's own facts are the same before and after, another seed is refused by name", none.repeats === "B" && all.repeats === "K" && none.facts.some((x) => x.kind === "repeat" && x.tag === "P") && none.facts[0].id === "F18" && J(A.factsOf(pair)) === J(facts) && msg(() => CF.answerRequest(pair, facts, { seed: 104, kit: [] })) === "counterfactual.answerRequest: the request names seed 104 and the pair is seed 105" && a.facts.every((x) => x.kind !== "repeat"));
}

sec("7. THE PROMPT");
{
    const facts = A.factsOf(A.flyPair(1)), p = CF.proposalPromptOf(facts, 1), ask = CF.PROPOSE_ASK(1);
    ok("!! the ask, word for word, with the seed and an example in the request format; the prompt is the analyzer's head, the pair's facts as the analyzer prints them, a blank line, the ask", ask === 'Propose ONE more flight of this same scenario (seed 1) with a different set of countermeasures, to help see what the kit changed. Answer with exactly one line in this format and nothing else: REQUEST {"seed":1,"kit":["decoy","screen"]}. The kit is any of decoy, screen, interceptor, each at most once; an empty list means no kit. Do not explain.' && p === A.PROMPT_HEAD + "\n" + facts.map(A.lineOf).join("\n") + "\n\n" + ask && CF.PROPOSE_ASK(105).includes("(seed 105)") && CF.PROPOSE_ASK(105).includes('{"seed":105,') && p.split("\n").filter((l) => /^F\d+ \[/.test(l)).length === facts.length);
    ok("!! the example in the ask is itself a VALID request for the seed shown (so a model that copies it is valid)", CF.readRequest(ask.split("format and nothing else: ")[1].split(". The kit")[0], 1).ok === true);
}

sec("8. THE MEASURES");
{
    const pair = { seed: 1, base: fight({ fingerprint: "b", outcome: "defended" }), kit: fight({ fingerprint: "k", outcome: "breached" }) }, facts = [];
    // answerRequest needs real fights for a seed; use the real pair of dev seed 1 and a pair stub for the refused replies
    const real = A.flyPair(1), rf = A.factsOf(real), E = (reply, p = real, fa = rf) => ({ seed: 1, pair: p, facts: fa, reply });
    const m = CF.measuresOf([E('REQUEST {"seed": 1, "kit": []}'), E('REQUEST {"seed": 1, "kit": ["decoy","screen","interceptor"]}'), E('REQUEST {"seed": 1, "kit": ["decoy"]}'), E("nothing"), E("REQUEST {}"), E('REQUEST {"seed": 2, "kit": []}'), E('REQUEST {"seed": 1, "kit": ["decoy"]}\nREQUEST {"seed": 1, "kit": []}'), E("REQUEST {nope"), E('REQUEST {"seed": "1", "kit": []}'), E('REQUEST {"seed": 1, "kit": ["flare"]}')]);
    ok("!! over ten replies: 3 valid (the empty kit, the full kit, the decoy alone), VALID 0.3, and the refusals counted by reason (none 1, many 1, json 1, shape 1, seed 1, kit 1, seedNotShown 1)", m.n === 10 && m.valid === 3 && near(m.share, 0.3, 1e-12) && J(m.reasons) === J({ none: 1, many: 1, json: 1, shape: 1, seed: 1, kit: 1, seedNotShown: 1 }), J(m));
    ok("!! of the 3 valid requests 2 repeat a shown run (the empty kit B, the full kit K) and the decoy alone is a new fight of seed 1; `fresh` counts the new fights whose outcome is neither shown run's (here the decoy alone ends as one of them or not: counted by the outcome comparison); the kits asked for are counted by name", m.repeats === 2 && m.fresh >= 0 && m.fresh <= 1 && (m.fresh === (CF.flyKit(1, ["decoy"]).outcome !== real.base.outcome && CF.flyKit(1, ["decoy"]).outcome !== real.kit.outcome ? 1 : 0)) && J(m.kits) === J({ none: 1, "decoy+screen+interceptor": 1, decoy: 1 }));
    ok("!! no replies is VALID 0 (not a division by zero) and 0 valid; an empty list has empty counts", CF.measuresOf([]).share === 0 && CF.measuresOf([]).n === 0 && CF.measuresOf([]).valid === 0);
    const rd = (share) => CF.readingOf({ share });
    ok("!! the bottom line at the edges: 0.9 and above CAN, 0.5 to under 0.9 SOMETIMES, under 0.5 CANNOT; 0.8999 is SOMETIMES, 0.4999 CANNOT; a pipeline that failed its checks is not weighed whatever the share", rd(1) === "THE MODEL CAN ASK FOR A RE-FLIGHT" && rd(0.9) === "THE MODEL CAN ASK FOR A RE-FLIGHT" && rd(0.8999) === "THE MODEL SOMETIMES ASKS FOR A VALID RE-FLIGHT" && rd(0.5) === "THE MODEL SOMETIMES ASKS FOR A VALID RE-FLIGHT" && rd(0.4999) === "THE MODEL CANNOT ASK FOR A RE-FLIGHT IN THE FORMAT" && rd(0) === "THE MODEL CANNOT ASK FOR A RE-FLIGHT IN THE FORMAT" && CF.readingOf({ share: 1 }, false) === "THE PIPELINE IS BROKEN: THE PROPOSALS ARE NOT WEIGHED");
    void pair; void facts;
    // controlled pairs: the outcomes and fingerprints of the shown runs are set by hand, the re-flight (seed 1, the decoy alone) is the real fight
    const rr = CF.flyKit(1, ["decoy"]), stubPair = (bf, bo, ko) => ({ seed: 1, base: { fingerprint: bf, outcome: bo, events: [] }, kit: { fingerprint: "zk", outcome: ko, events: [] } });
    const S = (p) => ({ seed: 1, pair: p, facts: [], reply: 'REQUEST {"seed": 1, "kit": ["decoy"]}' });
    const one = (p) => CF.measuresOf([S(p)]), per = [one(stubPair("zb", "AAA", "BBB")), one(stubPair("zb", rr.outcome, "BBB")), one(stubPair("zb", "AAA", rr.outcome)), one(stubPair(rr.fingerprint, "AAA", "BBB"))];
    const c4 = CF.measuresOf([S(stubPair("zb", "AAA", "BBB")), S(stubPair("zb", rr.outcome, "BBB")), S(stubPair("zb", "AAA", rr.outcome)), S(stubPair(rr.fingerprint, "AAA", "BBB"))]);
    ok("!! `fresh` counts a valid request whose fight is NEW and whose outcome is neither shown run's: of four controlled pairs the first (new fight, new outcome) is fresh, the second (the base's outcome) and the third (the kit's outcome) are not, and the fourth (the same fingerprint as run B: a repeat, though its outcome is new to both shown outcomes) is a repeat and NOT fresh: n 4, valid 4, repeats 1, fresh 1 (and each of the four read ALONE gives its own answer, so that two wrong comparisons cannot cancel in a sum)", c4.n === 4 && c4.valid === 4 && c4.repeats === 1 && c4.fresh === 1 && J(per.map((m) => m.fresh)) === J([1, 0, 0, 0]) && J(per.map((m) => m.repeats)) === J([0, 0, 0, 1]) && rr.outcome !== "AAA" && rr.outcome !== "BBB");
    ok("!! the kit asked for is counted once for each valid request (four requests for the decoy alone: decoy 4)", J(c4.kits) === J({ decoy: 4 }));
}

sec("9. THE PIPELINE CHECKS");
{
    ok("!! the checks pass on dev seeds 1 and 2 (the empty kit repeats run B, the full kit run K, a re-flight is deterministic, the new facts are numbered on, a request round-trips)", CF.pipelineChecks([1, 2]).length === 0 && CF.pipelineChecks([]).length === 0);
    const wrapB = (seed) => { const p = A.flyPair(seed); return { ...p, base: { ...p.base, fingerprint: "other" } }; }, wrapK = (seed) => { const p = A.flyPair(seed); return { ...p, kit: { ...p.kit, fingerprint: "other" } }; };
    const fb = CF.pipelineChecks([1], wrapB), fk = CF.pipelineChecks([1], wrapK);
    ok("!! a pair whose run B is not what the empty kit flies is reported by its words, with the seed and both fingerprints; the same for run K; and neither mentions the other", fb.some((x) => /^seed 1: the empty kit does not repeat run B \(fingerprints [0-9a-f]+ and other\)$/.test(x)) && !fb.some((x) => /full kit/.test(x)) && fk.some((x) => /^seed 1: the full kit does not repeat run K \(fingerprints [0-9a-f]+ and other\)$/.test(x)) && !fk.some((x) => /empty kit/.test(x)));
    const w = CF.pipelineChecks([1, 2], (s) => (s === 2 ? wrapB(s) : A.flyPair(s)));
    ok("!! the checks run over every seed given: a fault in seed 2 only is reported for seed 2 only", w.length >= 1 && w.every((x) => /^seed 2:/.test(x)));
}

{
    // the engine checks are exercised by hand: the fights are memoised (they are deterministic) and each seam is made to misbehave in turn
    const flyM = new Map(), flyP = (seed) => { if (!flyM.has(seed)) flyM.set(seed, A.flyPair(seed)); return flyM.get(seed); };
    const kitM = new Map(), flyK = (seed, kit) => { const k = seed + kit.join(); if (!kitM.has(k)) kitM.set(k, CF.flyKit(seed, kit)); return kitM.get(k); };
    const base = { fly1: flyK }, n1 = A.factsOf(flyP(1)).length;
    ok("!! with honest seams the checks pass", CF.pipelineChecks([1], flyP, base).length === 0);
    let c = 0; const twice = CF.pipelineChecks([1], flyP, { ...base, fly1: (seed, kit) => { const r = flyK(seed, kit); return kit.length === 2 ? { ...r, fingerprint: r.fingerprint + (c++ % 2) } : r; } });
    ok("!! a re-flight that is not deterministic (the same request flown twice gives two fingerprints) is reported by its words with both fingerprints", twice.length === 1 && /^seed 1: a re-flight flown twice gives two fights \(fingerprints [0-9a-f]+0 and [0-9a-f]+1\)$/.test(twice[0]), twice.join("|"));
    const mis = (fix) => CF.pipelineChecks([1], flyP, { ...base, answer: (pair, facts, req) => { const a = CF.answerRequest(pair, facts, req); return { ...a, facts: a.facts.map(fix) }; } });
    const msgNum = `seed 1: the re-flight's facts are not numbered on from F${n1 + 1}`;
    ok("!! facts that are not numbered on from the pair's last are reported, wherever the numbering goes wrong: the first one late (F13 for F12), only the second wrong, only the third wrong, all one late; and right numbering is not", mis((x, i) => (i === 0 ? { ...x, id: "F" + (n1 + 2) } : x)).join("|") === msgNum && mis((x, i) => (i === 1 ? { ...x, id: "F" + (n1 + 1) } : x)).join("|") === msgNum && mis((x, i) => (i === 2 ? { ...x, id: "F" + (n1 + 9) } : x)).join("|") === msgNum && mis((x, i) => ({ ...x, id: "F" + (n1 + i + 2) })).join("|") === msgNum && mis((x) => x).length === 0);
    let g = 0; const changed = CF.pipelineChecks([1], flyP, { ...base, factsOf: (pair) => (g++ === 0 ? A.factsOf(pair) : A.factsOf(pair).slice(1)) });
    ok("!! a pair whose facts are not the same when generated again is reported (the re-flight must not change the pair's facts)", changed.length === 1 && changed[0] === "seed 1: the pair's facts changed", changed.join("|"));
    const rt = (r) => CF.pipelineChecks([1], flyP, { ...base, read: () => r }), RT = "seed 1: a request does not round-trip through its line";
    ok("!! a request that does not round-trip is reported by its words: refused (ok false), the wrong seed, the kit in the wrong order, the kit with a name missing; and the right one is not", rt({ ok: false, reason: "x" }).join("|") === RT && rt({ ok: true, request: { seed: 2, kit: ["decoy", "screen"] } }).join("|") === RT && rt({ ok: true, request: { seed: 1, kit: ["screen", "decoy"] } }).join("|") === RT && rt({ ok: true, request: { seed: 1, kit: ["decoy"] } }).join("|") === RT && rt({ ok: true, request: { seed: 1, kit: ["decoy", "screen"] } }).length === 0);
    const seedsTwo = CF.pipelineChecks([1, 2], (sd) => flyP(sd), { ...base, read: () => ({ ok: false }) });
    ok("!! every seed given is checked: a fault that is in all of them is reported once for each, in the order of the seeds", seedsTwo.length === 2 && /^seed 1:/.test(seedsTwo[0]) && /^seed 2:/.test(seedsTwo[1]));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
process.exit(fails ? 1 : 0);
