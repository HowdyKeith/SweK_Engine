// WebGLEngine/brain/tacticsRoster-selfcheck.mjs -- v4839 (beside brain/tacticsRoster.mjs, ui/tacticsPanel.mjs and the "Load Tactics" panel on flight-gpu.html and es-box3d.html)
//
// Run: node brain/tacticsRoster-selfcheck.mjs
//
// GRADES the tactics roster: for side A and side B of the Endless-Sky fight, which eight-number weight vector picks targets and decides when to break off -- a named preset, the one the GPU Brain
// serves, or one imported from a file -- then Start Fight. (NOT the connectome network the dogfight and space-battle pilots run on; the module's header says so and section 2 holds that the
// page's own text says so too.)
//
// Section 1, THE PRESETS: eight, each a finite vector inside the ranges the learner holds, built fresh on every call (a caller cannot mutate the shared one), hand/brawler/sharp/scatter equal to
// ev/tools/es-arena.mjs's own PRESETS (so the arena that measures them and the page that offers them cannot drift), and focus and threat move only target-selection weights (each the extreme of the eight on its own number) while stubborn and skittish move only the three flee numbers.
// Section 2, THE DEFAULT IS THE OLD PAGE: "default for this side" resolves to exactly the two constants the pages carried before there was a panel -- A scatter, B the hand weights.
// Section 3, EVERY CHOICE: each id resolves to a full vector, an id nothing holds falls back by name and says so, served and imported are not offered unless held and refuse by name when they are
// garbage, saved specs are sanitised, an import is held to its ranges with every correction named, unknown keys are named and dropped (a `__proto__` key pollutes nothing), nothing usable is refused.
// Section 4, THE CHOICE REACHES THE FIGHT: real battles on the arena's headless substrate with the RESOLVED weights -- the default lineup is the arena's scatter-against-hand to the bit, a stubborn
// side beats a skittish one and the sides swapped swap the result (so each side's weights reach that side's ships), and the same lineup twice is the same fight.
// Section 5, THE PAGES: es-box3d.html and flight-gpu.html each in their own browser -- the button and two selects are there, the default lineup is scatter against hand, a choice made in a select is
// PENDING until Start Fight commits it (the sim keeps the old weights until then), the sim of each page reads the committed weights per side (a probe vector that makes a side flee proves A's
// weights reach A's ships and B's reach B's), Start Fight clears the tally and rebuilds the battle, a real skittish side flees when hurt, an import is offered / refused / held to its ranges, the choices
// survive a reload, the GPU Brain's served policy is offered only when the bridge returns trained weights.
//
// WHAT THE ARENA SAYS ABOUT THE PRESETS (measured at v4839 with this module, ev/tools/es-arena.mjs, six ships a side, 200 battles with each preset on each side, the box3d fallback substrate,
// 60 s cap; share = the row's wins plus half its draws over 400 fights; mirror matches split 88-94 to 108-88 of 200, so there is no side bias worth a correction):
//                scatter   hand brawler  sharp  focus threat stubbo skitti  | mean
//     scatter        --    59%    59%    67%    67%    67%    51%    77%  |  64%
//     stubborn      49%    62%    56%    63%    70%    67%     --    75%  |  63%
//     brawler       41%    51%     --    58%    58%    60%    44%    70%  |  55%
//     hand          41%     --    49%    57%    60%    55%    38%    64%  |  52%
//     sharp         33%    43%    42%     --    51%    50%    37%    56%  |  45%
//     threat        33%    45%    41%    50%    49%     --    34%    61%  |  45%
//     focus         33%    40%    42%    49%     --    51%    30%    52%  |  43%
//     skittish      23%    36%    30%    44%    48%    39%    25%     --  |  35%
// *** THE PAGES HAVE ALWAYS RUN THE STRONGEST PRESET AGAINST A WEAKER ONE: side A is scatter (nearest target, no priorities), the best of the eight here, and side B is the hand weights, which it beats
// 59% of the time over both sides. Nobody had measured it; the tally on the page was scoring a fight that was not even. The panel lets either side be anything, and the rows below hold the three
// directions that are wide enough to survive a retune of the sim (scatter over hand, stubborn over skittish, and a skittish side being the weakest of the field) rather than the whole table. ***
// Also measured: breaking off does not pay in this sim -- never retreating is joint-best and retreating early is worst by a wide margin -- because a fled-from ship is not repaired and the chaser keeps
// the shots. That is a fact about the sim's lack of a refuge, not about tactics in general.
//
// SABOTAGE LOG -- v4839, twenty, each applied to the file named, the gate run, the file restored (cmp-identical). Reds are rows (`grep -c '^  FAIL'`).
//   A  tacticsRoster.mjs: the default sides swapped (A hand, B scatter)                      10 red (the default-is-the-old-page rows, the by-name fallbacks that fall back to the default, the default-lineup fight)
//   B  tacticsRoster.mjs: an unavailable choice substituted in silence                       3 red (the by-name fallback rows)
//   C  tacticsRoster.mjs: stubborn still flees (fleeHealth 0.3)                              4 red (the preset-axis row, the crippled-ship row, the stubborn-over-skittish fights)
//   D  tacticsRoster.mjs: an import is not held to its ranges                                7 red (the range row and the pages' import rows)
//   E  tacticsRoster.mjs: unknown keys copied through                                        3 red (the unknown-key row, the __proto__ row, the served-sanitised row)
//   F  tacticsRoster.mjs: 'served' always offered                                            4 red (the choices rows, the page's nine-choice rows)
//   G  tacticsRoster.mjs: presets shared between callers (cached, not rebuilt)               7 red (the fresh-copy row and every row that mutates a vector it was handed)
//   H  tacticsRoster.mjs: an imported vector used as it arrived, not sanitised               *** FIRST TRY WENT 0 RED: every vector the gate imported was already valid, so skipping the sanitiser changed nothing it could see. Added the row that
//      imports a wClose of 9 with six keys missing (it must fly as 4, the six filled from the hand weights, the note prefixed 'imported:') and one for 'served' *** -> 1 red
//   I  tacticsRoster.mjs: brawler drifts from the arena (wClose 1.6)                         1 red (the equals-the-arena's-PRESETS row)
//   J  tacticsPanel.mjs: weights(team) returns the PENDING lineup, not the committed one      2 red (the pending-until-Start-Fight rows, both pages)
//   K  tacticsPanel.mjs: side B flies side A's weights                                       3 red (the probe rows and the real-skittish row)
//   L  tacticsPanel.mjs: 'served' offered when the bridge returns weights:null               *** 0 RED, AND IT WAS AN EQUIVALENT MUTANT: the sanitiser refuses null on its own, so the extra guard changed nothing. Replaced by the sabotage that matters --
//      the served vector used WITHOUT the sanitiser -- *** -> 1 red (the garbage-vector served row)
//   M  tacticsPanel.mjs: the import is not persisted                                         2 red (the reload rows, both pages)
//   N  tacticsPanel.mjs: Default tactics does nothing                                        2 red
//   O  tacticsPanel.mjs: Start Fight does not commit                                         7 red
//   P  tacticsPanel.mjs: a non-JSON import refused in silence                                2 red
//   Q  es-box3d.html: side B flies side A's weights                                          4 red
//   R  es-box3d.html: Start Fight keeps the tally                                            2 red
//   S  flight-gpu.html: Start Fight does not rebuild the battle                              *** FIRST TRY WENT 0 RED: the row looked at a fleet at full health, and between the last battle and the click nothing had hurt anyone, so an old battle passed for a
//      fresh one. The page now steps three seconds first and the row demands the battle clock back at 0 and a NEW fleet *** -> 1 red
//   T  flight-gpu.html: side A flies side B's weights                                        3 red
//   U  tacticsPanel.mjs: the import key renamed (swek.tacticsRoster.imp)                     2 red (the stored-under-the-named-keys row, both pages)
//   V  tacticsRoster.mjs: TEAMS not frozen                                                   1 red (the TEAMS/AUTO/autoChoice row)
//      U-V were added at the end: definitionGates-selfcheck counted TEAMS, AUTO, autoChoice, STORE_KEY and IMPORT_KEY among the exports no gate named; the gate now asserts each.
// FOUND BY THE GATE, NOT BY A SABOTAGE: flight-gpu.html cannot be driven by waiting. Its software WebGPU device is lost a few seconds after boot in this harness ("GPU device lost: A valid external
// Instance reference no longer exists") and the page does what it was built to -- redirects to the 2D page after 4 s -- so a row that waited for a real fight on it read another page. Both pages now expose a
// synchronous step(n) the gate uses as its clock, and the gate has a row that the page stayed on itself.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as R from "./tacticsRoster.mjs";
import { STORE_KEY, IMPORT_KEY } from "../ui/tacticsPanel.mjs";   // importing it in node touches no DOM: the DOM is only touched by mountTacticsPanel()
import { DEFAULT_W, applyBrainWeights, decide } from "../ev/esTactics.js";
import { PRESETS as ARENA, runBattle, runSeries } from "../ev/tools/es-arena.mjs";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = (x) => JSON.stringify(x);
const strip = (w) => Object.fromEntries(R.KEYS.map((k) => [k, w[k]]));
const read = (f) => fs.readFileSync(path.join(ENG, f), "utf8");

sec("1. THE PRESETS");
{
    ok("there are eight, in the order the panel lists them: scatter, hand, brawler, sharp, focus, threat, stubborn, skittish", J(R.PRESET_IDS) === J(["scatter", "hand", "brawler", "sharp", "focus", "threat", "stubborn", "skittish"]), R.PRESET_IDS.join(","));
    ok("every preset is a full vector: all eight keys, finite numbers, inside the range the learner holds (brain/tacticsPolicy.js W_MIN/W_MAX for the targets, 0..1 for the flee fractions)",
        R.PRESET_IDS.every((id) => { const w = R.presetWeights(id); return R.KEYS.every((k) => Number.isFinite(w[k]) && w[k] >= R.RANGES[k][0] && w[k] <= R.RANGES[k][1]); }) && J(R.KEYS) === J(Object.keys(DEFAULT_W)));
    const a = R.presetWeights("hand"); a.wClose = 99; a.fleeHealth = 99;
    ok("a preset is built fresh each call: changing one caller's vector changes nobody else's, nor the engine's DEFAULT_W", R.presetWeights("hand").wClose === 1 && DEFAULT_W.wClose === 1 && R.presetWeights("hand") !== R.presetWeights("hand"));
    ok("an id that is not a preset has no weights (null, not the hand weights)", R.presetWeights("nope") === null && R.presetWeights(undefined) === null && R.presetWeights("served") === null);
    ok("!! hand, brawler, sharp and scatter equal ev/tools/es-arena.mjs's PRESETS key for key (the arena that measures them and the panel that offers them cannot drift apart)", ["hand", "brawler", "sharp", "scatter"].every((id) => J(strip(R.presetWeights(id))) === J(strip(ARENA[id]))),
        ["hand", "brawler", "sharp", "scatter"].map((id) => id + (J(strip(R.presetWeights(id))) === J(strip(ARENA[id])) ? "=" : "!=")).join(" "));
    const hand = strip(R.presetWeights("hand")), diff = (id) => R.KEYS.filter((k) => R.presetWeights(id)[k] !== hand[k]);
    ok("!! hand IS esTactics' DEFAULT_W, to the key", J(hand) === J(strip(DEFAULT_W)));
    ok("stubborn moves only the three flee numbers, all to zero (it never breaks off); skittish moves only those three, all up (it breaks off early, at long odds, and stays away)",
        J(diff("stubborn")) === J(["fleeHealth", "fleeOdds", "fleeHyst"]) && R.presetWeights("stubborn").fleeHealth === 0 && R.presetWeights("stubborn").fleeOdds === 0 && R.presetWeights("stubborn").fleeHyst === 0 &&
        J(diff("skittish")) === J(["fleeHealth", "fleeOdds", "fleeHyst"]) && R.KEYS.slice(5).every((k) => R.presetWeights("skittish")[k] > hand[k]), `stubborn moves ${diff("stubborn")}, skittish moves ${diff("skittish")}`);
    const col = (k) => R.PRESET_IDS.map((id) => [id, R.presetWeights(id)[k]]).sort((x, y) => y[1] - x[1]);
    ok("!! each of the other axes is pushed hard ONE way and is the extreme of the eight on its own number: focus has the largest wFocus, threat the largest wThreat, and neither moves a flee number",
        col("wFocus")[0][0] === "focus" && col("wThreat")[0][0] === "threat" && diff("focus").every((k) => k.startsWith("w")) && diff("threat").every((k) => k.startsWith("w")), `wFocus top ${col("wFocus")[0]}, wThreat top ${col("wThreat")[0]}`);
    ok("scatter prefers the nearest and nothing else: every target-selection weight but wClose is 0, and it picks the nearest of two ships one of which is nearly dead and far (the hand weights pick the other)", (() => {
        const self = { id: "s", x: 0, y: 0, team: "A", shield: 100, armor: 100, maxShield: 100, maxArmor: 100, dps: 10 };
        const near = { id: "n", x: 300, y: 0, team: "B", shield: 100, armor: 100, maxShield: 100, maxArmor: 100, dps: 10 };
        const farHurt = { id: "f", x: 900, y: 0, team: "B", shield: 0, armor: 10, maxShield: 100, maxArmor: 100, dps: 30 };
        const w = R.presetWeights("scatter");
        return ["wWeak", "wThreat", "wPlayer", "wFocus"].every((k) => w[k] === 0) && w.wClose === 1 && decide(self, [near, farHurt], w).target.id === "n" && decide(self, [near, farHurt], R.presetWeights("hand")).target.id === "f" && decide(self, [near, farHurt], { ...DEFAULT_W, wWeak: 5 }).target.id === "f";
    })());
    ok("a stubborn side does not break off where the hand weights do: a crippled ship against a crowd flees on the hand weights and keeps fighting on stubborn", (() => {
        const hurt = { id: "s", x: 0, y: 0, team: "A", shield: 0, armor: 10, maxShield: 100, maxArmor: 100, dps: 10 };
        const foes = [1, 2, 3].map((i) => ({ id: "f" + i, x: 300 * i, y: 0, team: "B", shield: 100, armor: 100, maxShield: 100, maxArmor: 100, dps: 15 }));
        return decide(hurt, foes, R.presetWeights("hand")).fleeing === true && decide(hurt, foes, R.presetWeights("stubborn")).fleeing === false && decide(hurt, foes, R.presetWeights("skittish")).fleeing === true;
    })());
}

sec("2. THE DEFAULT IS THE OLD PAGE");
{
    const oldA = applyBrainWeights({ wWeak: 0, wFocus: 0, wThreat: 0, wPlayer: 0, wClose: 1 }, DEFAULT_W), oldB = { ...DEFAULT_W };   // the two constants flight-gpu.html and es-box3d.html carried (kept here as the oracle)
    const r = R.resolveRoster(R.defaultSpecs(), {});
    ok("!! 'default for this side' on A is exactly the old W_A (scatter) and on B exactly the old W_B (the hand weights), key for key, and says nothing was wrong", J(r.A.weights) === J(oldA) && J(r.B.weights) === J(oldB) && r.A.id === "scatter" && r.B.id === "hand" && r.problems.length === 0, `${r.A.id} / ${r.B.id}`);
    ok("the two sides and the word for 'default' are what the panel and the saved specs speak: TEAMS is [A, B] and frozen, AUTO is 'auto', and autoChoice() is scatter for A and the hand weights for B -- the same two constants the pages carried", Object.isFrozen(R.TEAMS) && J(R.TEAMS) === '["A","B"]' && R.AUTO === "auto" && R.autoChoice("A") === "scatter" && R.autoChoice("B") === "hand" && R.defaultSpecs().A === R.AUTO && R.defaultSpecs().B === R.AUTO);
    ok("auto resolves the same whether spelt 'auto', undefined or null, and a missing spec object is the default lineup", J(R.resolveTeam("A", undefined, {}).weights) === J(oldA) && J(R.resolveTeam("B", null, {}).weights) === J(oldB) && J(R.resolveRoster(undefined, {}).A.weights) === J(oldA));
    ok("the panel's first choice says what the default is (A scatter, B hand)", /A scatter, B hand/.test(R.choices({})[0].label) && R.choices({})[0].id === "auto");
    for (const f of ["flight-gpu.html", "es-box3d.html"]) {
        const src = read(f);
        ok(`!! ${f} no longer carries its own W_A / W_B constants: the sim reads the roster's committed weights, per side`, !/const W_[AB] =/.test(src) && /roster\.weights\("A"\)/.test(src) && /roster\.weights\("B"\)/.test(src) && /mountTacticsPanel\(/.test(src) && /from "\/ui\/tacticsPanel\.mjs"/.test(src));
    }
    const panelSrc = read("ui/tacticsPanel.mjs");
    ok("!! the panel says what a tactics choice IS and IS NOT: eight numbers, not the fly-wired network, the same stepAI flies every ship, takes effect at Start Fight, 'served' only when the GPU Brain has learned enough",
        /NOT the fly-wired network/.test(panelSrc) && /same stepAI/.test(panelSrc) && /takes effect at Start Fight/.test(panelSrc) && /only when the GPU Brain has learned enough/.test(panelSrc));
}

sec("3. EVERY CHOICE");
{
    const held = { served: { wClose: 0.5, wWeak: 0.5, wThreat: 0.5, wPlayer: 0.5, wFocus: 0.5, fleeHealth: 0.2, fleeOdds: 0.4, fleeHyst: 0.1 }, imported: { wClose: 2, wWeak: 0, wThreat: 1, wPlayer: 0, wFocus: 0, fleeHealth: 0.1, fleeOdds: 0.3, fleeHyst: 0.05 } };
    const ids = (ctx) => R.choices(ctx).map((c) => c.id);
    ok("a bare page offers 'auto' and the eight presets, nine in all; served and imported are offered only when held", J(ids({})) === J(["auto", ...R.PRESET_IDS]) && J(ids({ served: held.served })) === J(["auto", ...R.PRESET_IDS, "served"]) && J(ids(held)) === J(["auto", ...R.PRESET_IDS, "served", "imported"]) && J(ids({ imported: held.imported })).endsWith('"imported"]'));
    ok("every id offered resolves to a full vector of eight finite numbers, with no problem, under the label it was offered by", R.choices(held).every((c) => { const r = R.resolveTeam("A", c.id, held); return r.problems.length === 0 && R.KEYS.every((k) => Number.isFinite(r.weights[k])) && r.weights !== null; }));
    ok("served and imported resolve to the vectors held (not a preset's)", J(strip(R.resolveTeam("A", "served", held).weights)) === J(held.served) && J(strip(R.resolveTeam("B", "imported", held).weights)) === J(held.imported));
    const raw = { imported: { wClose: 9, wWeak: 0 }, served: { wClose: -9, wFocus: 0.5, bogus: 1 } };
    const ri = R.resolveTeam("A", "imported", raw), rs = R.resolveTeam("B", "served", raw);
    ok("!! an imported or served vector reaches the fight SANITISED, not as it arrived: a wClose of 9 flies as 4 with every key it did not give filled from the hand weights (and carries the sanitiser's note, prefixed by where it came from); a served wClose of -9 flies as -2 and an unknown key is not in the vector",
        ri.id === "imported" && ri.weights.wClose === 4 && ri.weights.wWeak === 0 && ri.weights.fleeHealth === DEFAULT_W.fleeHealth && ri.weights.wThreat === DEFAULT_W.wThreat && ri.problems.some((p) => /^imported: wClose 9 is outside/.test(p)) &&
        rs.id === "served" && rs.weights.wClose === -2 && rs.weights.wFocus === 0.5 && !("bogus" in rs.weights) && rs.problems.some((p) => /^served: wClose -9 is outside/.test(p)), J(strip(ri.weights)));
    const un = R.resolveTeam("B", "no-such-choice", {});
    ok("!! an id nothing holds falls back to the side's default BY NAME and says so, never silently and never throwing", un.id === "hand" && J(strip(un.weights)) === J(strip(R.presetWeights("hand"))) && un.problems.length === 1 && /no-such-choice/.test(un.problems[0]) && /hand flies/.test(un.problems[0]), un.problems.join(" | "));
    const sv = R.resolveTeam("A", "served", {}), im = R.resolveTeam("A", "imported", {});
    ok("'served' and 'imported' chosen when nothing is held fall back by name too (a saved choice outliving the data it named)", sv.id === "scatter" && /not available/.test(sv.problems[0]) && im.id === "scatter" && /not available/.test(im.problems[0]));
    const bad = R.resolveTeam("A", "served", { served: { nonsense: 1 } });
    ok("a served vector that is garbage falls back by name, with the reason from the sanitiser", bad.id === "scatter" && bad.problems.some((p) => /^served:/.test(p)) && bad.problems.some((p) => /not available/.test(p)), bad.problems.join(" | "));
    const sp = R.sanitizeSpecs({ A: "x".repeat(200), B: 42 }), sp2 = R.sanitizeSpecs("junk"), sp3 = R.sanitizeSpecs([1, 2]);
    ok("saved specs are sanitised: a 200-character id, a number, a string and an array all become 'auto'", sp.A === "auto" && sp.B === "auto" && J(sp2) === J(R.defaultSpecs()) && J(sp3) === J(R.defaultSpecs()) && R.sanitizeSpecs({ A: "stubborn", B: "skittish" }).A === "stubborn");

    const s1 = R.sanitizeWeights({ wClose: 9, wWeak: -9, wThreat: 1, wPlayer: 0, wFocus: 0, fleeHealth: 3, fleeOdds: -1, fleeHyst: 0.5, junk: 1 });
    ok("!! an import out of range is HELD to its range and each correction is named (wClose 9 -> 4, wWeak -9 -> -2, fleeHealth 3 -> 1, fleeOdds -1 -> 0), an unknown key is named and dropped",
        s1.weights && s1.weights.wClose === 4 && s1.weights.wWeak === -2 && s1.weights.fleeHealth === 1 && s1.weights.fleeOdds === 0 && s1.problems.filter((p) => /held to/.test(p)).length === 4 && s1.problems.some((p) => /unknown key.*junk/.test(p)), s1.problems.join(" | "));
    const s2 = R.sanitizeWeights({ wClose: "2", wWeak: NaN, wThreat: Infinity, wPlayer: null, wFocus: 0.5 });
    ok("a non-number, NaN, Infinity or null is named and ignored (the hand value stands), and the count of weights actually given is said", s2.weights && s2.weights.wClose === 1 && s2.weights.wWeak === DEFAULT_W.wWeak && s2.weights.wFocus === 0.5 && s2.applied === 1 && s2.problems.filter((p) => /not a finite number/.test(p)).length === 4 && s2.problems.some((p) => /only 1 of the 8/.test(p)), s2.problems.join(" | "));
    ok("the { weights: {...} } wrapper (what GET /ai/brain/tactics and the bridge's saved policy carry) is read like the flat vector", J(strip(R.sanitizeWeights({ ok: true, weights: held.served, samples: 50 }).weights)) === J(held.served));
    ok("!! nothing usable is REFUSED, not turned into the hand weights: an empty object, an array, a number, null, a vector of only unknown keys", [{}, [], 7, null, undefined, "x", { a: 1 }, { weights: {} }].every((x) => R.sanitizeWeights(x).weights === null && R.sanitizeWeights(x).problems.length >= 1));
    const polluted = R.parseImport('{"__proto__": {"wClose": 9, "polluted": true}, "wClose": 1, "constructor": {"prototype": {"polluted": true}}}');
    ok("!! a __proto__ / constructor key in an import pollutes nothing: the keys are named unknown and dropped, Object.prototype is untouched, the weights are the clean ones", polluted.weights && polluted.weights.wClose === 1 && ({}).polluted === undefined && Object.prototype.polluted === undefined && polluted.problems.some((p) => /unknown key/.test(p)) && !("polluted" in polluted.weights), polluted.problems.join(" | "));
    ok("an underscore key (the _brainWeights count a served vector carries) is skipped without a complaint", R.sanitizeWeights({ ...held.served, _brainWeights: 8 }).problems.length === 0);
    ok("text that is not JSON is an error with a reason, never a throw; JSON that is not a vector is a refusal", R.parseImport("{nope").error && /not JSON/.test(R.parseImport("{nope").error) && R.parseImport("[]").weights === null && R.parseImport("").error && R.parseImport(J(held.imported)).weights.wClose === 2);
    ok("the one-line summary names all eight numbers and says what the flee three mean", (() => { const s = R.summary(R.presetWeights("hand")); return /close 1 weak 0.8 threat 0.55 player 0.35 focus 0.25/.test(s) && /flee below 0.3 health, odds under 0.55, hysteresis 0.12/.test(s); })());
    ok("describe() names both sides' choices", R.describe(R.resolveRoster({ A: "stubborn", B: "skittish" }, {})) === "A: stubborn  |  B: skittish");
}

sec("4. THE CHOICE REACHES THE FIGHT: real battles on the arena's headless substrate, the resolved weights on both sides");
{
    const fight = (a, b, n = 100, ctx = {}) => { const r = R.resolveRoster({ A: a, B: b }, ctx); return runSeries({ weightsA: r.A.weights, weightsB: r.B.weights, n, seed: 1, count: 6, maxSeconds: 60, physics: "box3d" }); };
    const same = [1, 2, 3, 4, 5].every((s) => { const r = R.resolveRoster(R.defaultSpecs(), {}); return J(runBattle({ weightsA: r.A.weights, weightsB: r.B.weights, seed: s, physics: "box3d" })) === J(runBattle({ weightsA: ARENA.scatter, weightsB: ARENA.hand, seed: s, physics: "box3d" })); });
    ok("!! the DEFAULT lineup fights exactly the arena's scatter-against-hand, battle for battle (five seeds, the whole result to the bit)", same);
    const sk = fight("skittish", "stubborn"), ks = fight("stubborn", "skittish");
    ok("!! a STUBBORN side beats a SKITTISH one and the sides swapped swap the result, so each side's weights reach that side's ships: skittish(A) vs stubborn(B) is won by B, stubborn(A) vs skittish(B) by A, by a wide margin both ways",
        sk.bWins - sk.aWins >= 30 && ks.aWins - ks.bWins >= 30, `skittish A ${sk.aWins} - stubborn B ${sk.bWins} (draws ${sk.draws}); stubborn A ${ks.aWins} - skittish B ${ks.bWins} (draws ${ks.draws})`);
    const sh = fight("scatter", "hand", 200), hs = fight("hand", "scatter", 200), share = (sh.aWins + hs.bWins + (sh.draws + hs.draws) / 2) / 400;
    ok("!! the page's default pairing is NOT an even fight: scatter takes more than half of the 400 battles against the hand weights with both sides played (59% measured)", share > 0.54, `scatter ${(share * 100).toFixed(1)}% (as A ${sh.aWins}-${sh.bWins}, as B ${hs.bWins}-${hs.aWins})`);
    const pooled = (id) => { let w = 0, n = 0; for (const other of R.PRESET_IDS.filter((x) => x !== id)) { const x = fight(id, other, 40), y = fight(other, id, 40); w += x.aWins + y.bWins + (x.draws + y.draws) / 2; n += 80; } return w / n; };
    const sk35 = pooled("skittish"), allShares = R.PRESET_IDS.map((id) => [id, id === "skittish" ? sk35 : pooled(id)]);
    ok("!! a SKITTISH side is the weakest of the eight when played against the whole field on both sides (35% measured): breaking off early does not pay in this sim", allShares.every(([id, s]) => id === "skittish" || s > sk35 + 0.05), allShares.map(([id, s]) => `${id} ${(s * 100).toFixed(0)}%`).join("  "));
    const f1 = fight("brawler", "sharp", 20), f2 = fight("brawler", "sharp", 20);
    ok("the same lineup twice is the same series to the bit (the fight is seeded)", J(f1) === J(f2));
    const imp = R.resolveRoster({ A: "imported", B: "hand" }, { imported: { wClose: 1, wWeak: 0, wThreat: 0, wPlayer: 0, wFocus: 0, fleeHealth: 0, fleeOdds: 0, fleeHyst: 0 } });
    ok("an imported vector flies: scatter-with-no-flee imported on A fights stubborn-scatter the way the same eight numbers typed as presets would (the same series, key for key)",
        J(runSeries({ weightsA: imp.A.weights, weightsB: imp.B.weights, n: 20, seed: 3, count: 6, maxSeconds: 60, physics: "box3d" })) === J(runSeries({ weightsA: applyBrainWeights({ wWeak: 0, wFocus: 0, wThreat: 0, wPlayer: 0, wClose: 1, fleeHealth: 0, fleeOdds: 0, fleeHyst: 0 }, DEFAULT_W), weightsB: ARENA.hand, n: 20, seed: 3, count: 6, maxSeconds: 60, physics: "box3d" })));
}

sec("5. THE PAGES: es-box3d.html and flight-gpu.html, each in its own browser");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); console.log("  *** NOT A PASS. ***"); fails++; }
    else {
        const oldA = applyBrainWeights({ wWeak: 0, wFocus: 0, wThreat: 0, wPlayer: 0, wClose: 1 }, DEFAULT_W), oldB = { ...DEFAULT_W };
        const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 400000, args: { oldA: strip(oldA), oldB: strip(oldB), storeKey: STORE_KEY, importKey: IMPORT_KEY, pages: ["/es-box3d.html", "/flight-gpu.html"] }, script: `async (args) => {
            const waitFor = async (fn, ms) => { const t = performance.now(); while (performance.now() - t < ms) { try { if (fn()) return true; } catch (e) {} await new Promise((r) => setTimeout(r, 100)); } return false; };
            const boot = async (page) => {
                const f = document.createElement("iframe"); f.style.cssText = "width:900px;height:600px;border:0"; f.src = page; document.body.appendChild(f);
                await waitFor(() => { const w = f.contentWindow; return w && w.__tacticsFight && w.__tacticsFight.ready; }, 90000);
                return { f, w: f.contentWindow, d: f.contentDocument };
            };
            const strip = (w) => Object.fromEntries(["wClose","wWeak","wThreat","wPlayer","wFocus","fleeHealth","fleeOdds","fleeHyst"].map((k) => [k, w[k]]));
            const all = {};
            try { localStorage.clear(); } catch (e) {}
            for (const page of args.pages) {
                const out = { booted: false }; all[page] = out;
                let P = await boot(page); const T = P.w.__tacticsFight; if (!T || !T.ready) { out.error = "did not boot: " + (T ? "no battle" : "no hook"); continue; }
                out.booted = true; const d = P.d, byId = (id) => d.getElementById(id), choose = (id, v) => { const s = byId(id); s.value = v; s.dispatchEvent(new P.w.Event("change", { bubbles: true })); };
                const R_ = T.roster;
                out.btn = !!byId("tacticsBtn") && !!byId("tacticsStart") && !!byId("tacticsA") && !!byId("tacticsB");
                out.opts = Array.from(byId("tacticsA").options).map((o) => o.value); out.defaults = [byId("tacticsA").value, byId("tacticsB").value];
                out.def = { ids: [R_.committed.A.id, R_.committed.B.id], wA: JSON.stringify(strip(R_.weights("A"))) === JSON.stringify(args.oldA), wB: JSON.stringify(strip(R_.weights("B"))) === JSON.stringify(args.oldB), ships: [T.A.length, T.B.length] };
                // 1. a choice is PENDING until Start Fight: the sim keeps reading the committed weights
                let calls = []; const orig = R_.weights.bind(R_); R_.weights = (t) => { calls.push(t); return orig(t); };
                choose("tacticsA", "stubborn"); choose("tacticsB", "skittish");
                out.pending = { committedA: R_.committed.A.id, committedB: R_.committed.B.id, pendingA: R_.pending.A.id, pendingB: R_.pending.B.id, note: byId("tacticsNote").textContent, simWeightA: JSON.stringify(strip(R_.weights("A"))) === JSON.stringify(args.oldA) };
                T.step(2); out.simReads = { A: calls.includes("A"), B: calls.includes("B") };
                // 2. Start Fight commits, clears the tally, rebuilds the battle
                T.step(90); const t0 = T.t, oldA = T.A, hurtBefore = T.A.concat(T.B).some((e) => e.shield < e.maxShield || e.armor < e.maxArmor || e.dead);   // three seconds in, so a battle that is NOT rebuilt cannot pass for a fresh one
                T.wins.A = 3; T.wins.B = 2; byId("tacticsStart").click();
                out.started = { A: R_.committed.A.id, B: R_.committed.B.id, tally: T.wins.A + T.wins.B, ships: [T.A.length, T.B.length], fresh: T.A.concat(T.B).every((e) => e.shield === e.maxShield && e.armor === e.maxArmor && !e.dead), clockBefore: t0, clockAfter: T.t, newFleet: T.A !== oldA, hurtBefore, battleNo: R_.battleNo, wA: JSON.stringify(strip(R_.weights("A"))) === JSON.stringify(strip(R_.committed.A.weights)), noPending: !/pending/.test(byId("tacticsNote").textContent) };
                // 3. the weights reach THEIR OWN side's ships: a probe vector that makes every ship flee on one side only
                const probe = { ...strip(R_.committed.A.weights), fleeHealth: 2, fleeOdds: 2, fleeHyst: 0 };
                R_.weights = (t) => t === "A" ? probe : orig(t);
                byId("tacticsStart").click(); R_.weights = (t) => t === "A" ? probe : orig(t);
                T.step(3);
                out.probeA = { aFlee: T.A.filter((e) => e._fleeing).length, bFlee: T.B.filter((e) => e._fleeing).length };
                R_.weights = (t) => t === "B" ? probe : orig(t); byId("tacticsStart").click(); R_.weights = (t) => t === "B" ? probe : orig(t);
                T.step(3);
                out.probeB = { aFlee: T.A.filter((e) => e._fleeing).length, bFlee: T.B.filter((e) => e._fleeing).length };
                R_.weights = orig;
                // 4. a real skittish side breaks off when hurt, a stubborn one never does
                choose("tacticsA", "skittish"); choose("tacticsB", "stubborn"); byId("tacticsStart").click();
                for (let i = 0; i < 300 && !T.A.some((e) => e._fleeing) && T.wins.A + T.wins.B === 0; i++) T.step(10);   // up to 100 s of sim, no waiting on frames (the WebGPU view can lose its device here)
                out.real = { aFlee: T.A.some((e) => e._fleeing), bFlee: T.B.some((e) => e._fleeing), tally: T.wins.A + T.wins.B, hurtA: T.A.some((e) => e.shield + e.armor < e.maxShield + e.maxArmor) };
                // 5. import: refused / accepted / held to range / offered
                const bad = R_.importText("{nope"); out.refused = { note: byId("tacticsNote").textContent, offered: Array.from(byId("tacticsA").options).map((o) => o.value).includes("imported") };
                const good = R_.importText(JSON.stringify({ wClose: 7, wWeak: 0, wThreat: 0, wPlayer: 0, wFocus: 0, fleeHealth: 0, fleeOdds: 0, fleeHyst: 0 }));
                out.imported = { offered: Array.from(byId("tacticsA").options).map((o) => o.value).includes("imported"), clamped: R_.imported && R_.imported.wClose, note: byId("tacticsNote").textContent, clearShown: byId("tacticsImportClear").style.display !== "none" };
                choose("tacticsA", "imported"); choose("tacticsB", "brawler"); byId("tacticsStart").click();
                out.impFight = { A: R_.committed.A.id, wClose: R_.weights("A").wClose, B: R_.committed.B.id };
                out.stayed = P.f.contentWindow.location.pathname === page;   // flight-gpu.html redirects to the 2D page if the WebGPU device is lost; a redirect mid-test would make every row above a row about another page
                // 6. the choices (and the import) survive a reload
                out.saved = JSON.stringify(R_.specs); out.stored = { specs: localStorage.getItem(args.storeKey), imp: localStorage.getItem(args.importKey) };
                P.f.remove(); const Q = await boot(page); const U = Q.w.__tacticsFight, qd = Q.d;
                out.reload = { A: qd.getElementById("tacticsA").value, B: qd.getElementById("tacticsB").value, committed: [U.roster.committed.A.id, U.roster.committed.B.id], imported: U.roster.imported && U.roster.imported.wClose };
                qd.getElementById("tacticsReset").click(); out.afterReset = [qd.getElementById("tacticsA").value, qd.getElementById("tacticsB").value];
                qd.getElementById("tacticsImportClear").click(); out.afterClear = { imported: U.roster.imported, offered: Array.from(qd.getElementById("tacticsA").options).map((o) => o.value).includes("imported") };
                Q.f.remove(); try { localStorage.clear(); } catch (e) {}
            }
            // 7. the GPU Brain's served policy is offered only when the bridge returns trained weights
            const M = await import("/ui/tacticsPanel.mjs"); const sv = {};
            const mk = async (fetchImpl) => { const hud = document.createElement("div"); document.body.appendChild(hud); const api = M.mountTacticsPanel({ hud, fetchImpl, storage: { getItem: () => null, setItem() {}, removeItem() {} } }); await api.ready; return api; };
            const trained = await mk(async () => ({ ok: true, json: async () => ({ ok: true, trained: true, source: "learned", samples: 120, weights: { wClose: 1.2, wWeak: 0.6, wThreat: 0.4, wPlayer: 0.1, wFocus: 0.3, fleeHealth: 0.3, fleeOdds: 0.55, fleeHyst: 0.12 } }) }));
            const untrained = await mk(async () => ({ ok: true, json: async () => ({ ok: true, trained: false, source: "hand", samples: 3, weights: null }) }));
            const missing = await mk(async () => ({ ok: false, status: 404, json: async () => ({}) }));
            const broken = await mk(async () => { throw new Error("offline"); });
            const garbage = await mk(async () => ({ ok: true, json: async () => ({ ok: true, weights: { hello: 1 } }) }));
            sv.trained = trained.choices().map((c) => c.id).includes("served"); sv.untrained = untrained.choices().map((c) => c.id).includes("served"); sv.missing = missing.choices().map((c) => c.id).includes("served"); sv.broken = broken.choices().map((c) => c.id).includes("served"); sv.garbage = garbage.choices().map((c) => c.id).includes("served");
            trained.setSpecs({ A: "served", B: "hand" }); trained.start(); sv.servedFlies = { id: trained.committed.A.id, wClose: trained.weights("A").wClose, note: trained.note.textContent };
            all.served = sv;
            return all;
        }` });
        ok("the harness booted the pages and drove the panel", r.ok && r.result, r.ok ? "" : String(r.reason || r.error || (r.pageErrors || []).join(" | ")).slice(0, 300));
        const errs = ((r && r.pageErrors) || []).filter((e) => !/Failed to load resource: the server responded with a status of 404/.test(e));
        ok("no page error beyond the one expected 404 (GET /ai/brain/tactics on a static server: no bridge, so no served policy)", errs.length === 0, errs.join(" | ").slice(0, 300));
        if (r.ok && r.result) for (const page of ["/es-box3d.html", "/flight-gpu.html"]) {
            const p = r.result[page]; if (!p) { ok(`${page}: no result`, false); continue; }
            ok(`${page}: booted (a battle is built), and the page stayed on itself for the whole run (no GPU-device-lost redirect)`, p.booted && !p.error && p.stayed !== false, p.error || (p.stayed === false ? "the page navigated away mid-run -- the rows below are NOT about this page" : ""));
            if (!p.booted) continue;
            ok(`!! ${page}: the panel is there -- a Tactics button, a select for each side and Start Fight; both sides are on 'default', the nine choices a bare page holds are offered (no served, no imported)`, p.btn && J(p.defaults) === '["auto","auto"]' && J(p.opts) === J(["auto", ...R.PRESET_IDS]), p.opts.join());
            ok(`!! ${page}: the default lineup is the OLD page -- A scatter, B the hand weights, key for key -- with six ships a side`, J(p.def.ids) === '["scatter","hand"]' && p.def.wA && p.def.wB && J(p.def.ships) === "[6,6]", J(p.def));
            ok(`!! ${page}: a choice made in a select is PENDING until Start Fight: the committed lineup and the weights the sim reads are still scatter/hand, the pending one is stubborn/skittish and the note says so`, p.pending.committedA === "scatter" && p.pending.committedB === "hand" && p.pending.pendingA === "stubborn" && p.pending.pendingB === "skittish" && p.pending.simWeightA && /pending/.test(p.pending.note), J(p.pending).slice(0, 200));
            ok(`${page}: the sim asks the roster for BOTH sides' weights as it runs`, p.simReads.A && p.simReads.B);
            ok(`!! ${page}: Start Fight commits the choice (stubborn/skittish), clears the tally (5 -> 0), rebuilds the battle (twelve fresh ships) and the note no longer says pending`, p.started.A === "stubborn" && p.started.B === "skittish" && p.started.tally === 0 && J(p.started.ships) === "[6,6]" && p.started.fresh && p.started.clockBefore > 0 && p.started.clockAfter === 0 && p.started.newFleet && p.started.wA && p.started.noPending, J(p.started));
            ok(`!! ${page}: A's weights reach A's ships and B's reach B's: a probe vector that makes every ship flee, given to A only, has A's ships fleeing and none of B's; given to B only, the reverse`, p.probeA.aFlee > 0 && p.probeA.bFlee === 0 && p.probeB.bFlee > 0 && p.probeB.aFlee === 0, `A-probe ${J(p.probeA)}  B-probe ${J(p.probeB)}`);
            ok(`!! ${page}: a real SKITTISH side breaks off once it is hurt, and a STUBBORN side facing it does not (the real preset vectors, through the page's own sim)`, p.real.aFlee && !p.real.bFlee, J(p.real));
            ok(`!! ${page}: an import that is not JSON is refused by name and not offered; a good one is offered, a wClose of 7 is held to 4 and the correction is said, and Clear import appears`, /import refused: not JSON/.test(p.refused.note) && !p.refused.offered && p.imported.offered && p.imported.clamped === 4 && /held to 4/.test(p.imported.note) && p.imported.clearShown, `${p.refused.note.split("\n").pop().slice(0, 80)} | ${p.imported.note.split("\n").pop().slice(0, 100)}`);
            ok(`${page}: an imported vector flies the side it is given to (A imported, B brawler after Start Fight)`, p.impFight.A === "imported" && p.impFight.wClose === 4 && p.impFight.B === "brawler", J(p.impFight));
            ok(`!! ${page}: the choices and the import are kept in this browser under the panel's two named keys (${STORE_KEY} holds the specs, ${IMPORT_KEY} the eight numbers of the import, held to range)`, STORE_KEY === "swek.tacticsRoster.v1" && IMPORT_KEY === "swek.tacticsRoster.imported.v1" && p.stored && J(JSON.parse(p.stored.specs)) === '{"A":"imported","B":"brawler"}' && p.stored.imp && (() => { const w = JSON.parse(p.stored.imp); return J(Object.keys(w)) === J(R.KEYS) && w.wClose === 4; })(), p.stored ? p.stored.specs : "nothing stored");
            ok(`!! ${page}: the choices and the import survive a reload (imported on A, brawler on B are what a fresh page shows AND fights), Default tactics puts both selects back on 'default', and Clear import removes the vector and the choice offering it`, p.reload.A === "imported" && p.reload.B === "brawler" && J(p.reload.committed) === '["imported","brawler"]' && p.reload.imported === 4 && J(p.afterReset) === '["auto","auto"]' && p.afterClear.imported === null && !p.afterClear.offered, J({ reload: p.reload, afterReset: p.afterReset, afterClear: p.afterClear }));
        }
        if (r.ok && r.result && r.result.served) {
            const s = r.result.served;
            ok("!! the GPU Brain's SERVED policy is offered only when the bridge returns trained weights: offered for a trained answer; not for untrained (weights:null), a 404, a network error or a garbage vector", s.trained === true && s.untrained === false && s.missing === false && s.broken === false && s.garbage === false, J(s));
            ok("...and a served side flies the served vector, with the sample count it was learned from in the note", s.servedFlies.id === "served" && s.servedFlies.wClose === 1.2 && /120 recorded outcomes/.test(s.servedFlies.note), J(s.servedFlies).slice(0, 200));
        }
    }
}

console.log(fails ? `\ntacticsRoster-selfcheck: ${fails} FAILED` : "\ntacticsRoster-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
