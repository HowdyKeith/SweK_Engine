// WebGLEngine/tools/ship/flyRamShow-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyRamShow-selfcheck.mjs      (about half a minute; sections 1 to 3 are arithmetic, section 4 opens fly-ram.html in headless Chromium and reads its two 2D canvases)
//
// THE GATE OF THE PAGE WHERE THE COLLISION REFLEX IS WATCHED: brain/flyRamShow.mjs and fly-ram.html. What it holds is that THE PAGE PLAYS THE ROUND'S OWN CRAFT IN THE ROUND'S OWN JOUSTS -- the
// duel watched here is tools/ship/flyRam.mjs's duel to the fingerprint, and a record's craft flown here on the 200 audit jousts gives its record's reward to the bit.
//   1  THE CRAFT       the kinds; an untrained network here is the round's, weight for weight; what is refused
//   2  THE JOUST       watched, it is the round's; the frames are the duel's ticks; the joust the page opens on
//   3  THE PICTURES    the outside view holds both craft and says which is which; the eye's disc is the size the reflex is given
//   4  THE PAGE        fly-ram.html in Chromium: the opening joust, both canvases, the reflex firing, a trained craft from the file, turning, a results file that does not arrive
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as S from "../../brain/flyRamShow.mjs";
import * as E from "../../brain/rl/ramEnv.mjs";
import * as P6 from "../../brain/pilot6dofPolicy.mjs";
import * as V from "./flyRam.mjs";
import * as C from "../roundhouse/angularImpulseCensus.mjs";
import { shutdownServer } from "./serverShutdown.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
async function section(fn) { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), near = (a, b, e = 5e-5) => Math.abs(a - b) < e;
const UNDER = S.underOf(JSON.parse(src(S.UNDER_FILE))), RECS = S.recordsOf(src(S.RESULTS)), trained = (arm, s) => S.flyOf(arm, { draw: s, record: RECS.get(`${arm} ${s}`) });
const FIRST = S.FIRST_JOUST, ALONE = S.episode(UNDER, S.flyOf("never"), FIRST), HAND = S.episode(UNDER, S.flyOf("hand"), FIRST), F3 = S.episode(UNDER, trained("FREE", 3), FIRST);

console.log("flyRamShow-selfcheck -- the page where the collision reflex is watched: the craft, the joust, the pictures, the page (nothing is trained here)\n");

console.log("1. THE CRAFT");
await section(() => {
    ok("the kinds are the three rules written by hand (the pilot alone among them) and the round's three arms, each with a label; the draws are the round's 12; the files are the round's results and the pilot's weights; the page opens on one of the round's audit jousts",
        J(S.KINDS) === J(["never", "hand", "always", "GF", "GSHUF", "FREE"]) && J(S.ARMS) === J(V.ARMS) && J(Object.keys(E.RULES)) === J(S.KINDS.slice(0, 3)) && S.KINDS.every((k) => typeof S.LABELS[k] === "string" && S.LABELS[k].length > 10) && S.DRAWS === V.SEEDS.length && S.RESULTS === V.RESULTS && S.UNDER_FILE === V.UNDER_FILE &&
        RECS.size === 36 && V.AUDIT.includes(S.FIRST_JOUST) && V.AUDIT[5] === S.FIRST_JOUST && J(S.VISION) === J({ freeUnits: 113, shuffleSeed: 7000, gain: 0.01 }));
    const same = S.ARMS.flatMap((a) => [2, 9].map((s) => [a, s, J(Array.from(S.policyFor(a, s).getParams())) === J(Array.from(V.policyOf(a, s).getParams())) && S.policyFor(a, s).getParams().length === V.WEIGHTS[a]]));
    ok("!! AN UNTRAINED NETWORK HERE IS THE ROUND'S OWN, WEIGHT FOR WEIGHT: draws 2 and 9 of every arm, with the output layer at zero, against tools/ship/flyRam.mjs's policyOf (which a page cannot load: it reads files), and the weight counts the round registered", same.every((x) => x[2]), same.filter((x) => !x[2]).map((x) => x[0] + " " + x[1]).join(", "));
    const see = { seconds: 2, closing: 3 }, far = { seconds: 9, closing: -1 };
    ok("the three rules are the environment's own, answer for answer: the pilot alone never fires; the hand rule fires under 3 seconds to contact; `always` fires whenever the gap is closing",
        J(S.flyOf("never").act([1, 0, 0], see)) === J([-1]) && J(S.flyOf("hand").act([1, 0, 0], see)) === J([1]) && J(S.flyOf("hand").act([1, 0, 0], far)) === J([-1]) && J(S.flyOf("always").act([1, 0, 0], see)) === J([1]) && J(S.flyOf("always").act([1, 0, 0], far)) === J([-1]) && S.flyOf("hand").draw === null);
    ok("!! WHAT IS REFUSED, BY NAME: a craft that is not one; a trained craft with no record, with another arm's or another draw's; draw 13; a pilot's file with no weights; a joust with no pilot, no reflex or a seed of 0; a tick past the joust's end; a picture of no pixels",
        throws(() => S.flyOf("WORM"), /no craft WORM/) && throws(() => S.flyOf("GF", { draw: 1 }), /GF draw 1 needs its record from brain\/flyRamRound\.jsonl/) && throws(() => S.flyOf("GF", { draw: 1, record: RECS.get("FREE 1") }), /needs its record/) && throws(() => S.flyOf("GF", { draw: 1, record: RECS.get("GF 2") }), /needs its record/) &&
        throws(() => S.policyFor("GF", 13), /no draw 13 \(the draws are 1 to 12\)/) && throws(() => S.policyFor("GNONE", 1), /no arm GNONE/) && throws(() => S.underOf({ weights: [1, 2] }), /has no 930 weights/) && throws(() => S.underOf(null), /has no 930 weights/) && throws(() => S.episode(null, S.flyOf("never"), 1), /the pilot under the reflex is a function/) &&
        throws(() => S.episode(UNDER, {}, 1), /a craft's reflex has act/) && throws(() => S.episode(UNDER, S.flyOf("never"), 0), /the seed is a whole number from 1/) && throws(() => S.scene(ALONE, ALONE.frames.length), /no tick 178 of this joust \(it has 178\)/) && throws(() => S.eyeOf(ALONE, -1), /no tick -1/) && throws(() => S.scene(ALONE, 0, S.CAM, 0, 10), /a picture is a whole number of pixels/));
});

console.log("\n2. THE JOUST");
await section(() => {
    const flies = [S.flyOf("never"), S.flyOf("hand"), S.flyOf("always"), trained("GF", 1), trained("GSHUF", 9), trained("FREE", 3), trained("FREE", 8)], seeds = V.AUDIT.slice(0, 8), bad = [];
    for (const fly of flies) for (const seed of seeds) { const ep = S.episode(UNDER, fly, seed), r = E.fight(V.under(), fly, seed);
        if (!(ep.fingerprint === r.fingerprint && ep.reward === r.reward && ep.fight === r.fight && ep.ramHp === r.ramHp && ep.rams === r.rams && ep.breaks === r.breaks && ep.win === r.win && ep.loss === r.loss && ep.ticks === r.ticks)) bad.push(`${fly.kind} ${seed}`); }
    ok("!! *** THE JOUST WATCHED HERE IS THE ROUND'S JOUST ***: seven craft (the three rules and four trained ones) on the first eight audit jousts each, flown here with every tick kept and flown by the round's own fight() -- the same fingerprint, reward, fight, ram damage, rams, ticks the reflex fired, winner and length, to the bit. Keeping the ticks changes nothing", bad.length === 0, bad.join(", "));
    const over = (fly) => { let sum = 0, brk = 0, hp = 0; for (const s of V.AUDIT) { const ep = S.episode(UNDER, fly, s); sum += ep.reward; brk += ep.breaks; hp += ep.ramHp; } return { score: sum / V.AUDIT.length, breaks: brk / V.AUDIT.length, ramHp: hp / V.AUDIT.length }; };
    const f3 = over(trained("FREE", 3)), f8 = over(trained("FREE", 8)), g1 = over(trained("GF", 1)), r3 = RECS.get("FREE 3"), r8 = RECS.get("FREE 8"), rg = RECS.get("GF 1");
    ok("!! A RECORD'S CRAFT, PLAYED HERE ON THE 200 AUDIT JOUSTS, GIVES ITS RECORD'S REWARD TO THE BIT: the free net's draw 3 (the round's worst, 15.7365; 13 ticks firing a joust), its draw 8 (the round's best, 16.6984) and the real circuit's draw 1 (16.5092, the pilot alone's number: it never fires)",
        f3.score === r3.score && f3.breaks === r3.breaks && f3.ramHp === r3.ramHp && near(f3.score, 15.7365) && near(f3.breaks, 13.02, 1e-9) && f8.score === r8.score && near(f8.score, 16.6984) && g1.score === rg.score && g1.breaks === 0 && near(g1.score, V.PILOT_FLOOR), `${f3.score.toFixed(4)} ${f8.score.toFixed(4)} ${g1.score.toFixed(4)}`);
    const eps = [ALONE, HAND, F3], sum = (a) => a.reduce((n, v) => n + v, 0), starts = (ep) => ep.frames.filter((f, i) => f.touch && !(i > 0 && ep.frames[i - 1].touch)).length;
    ok("!! THE FRAMES ARE THE DUEL'S TICKS: one a tick, numbered from 0; the ticks drawn as breaking are the ticks the reflex fired; the hull points the touches cost add up to the joust's ram damage, and the touches that begin are its rams; no hull gains a point; and a joust flown twice is the same joust",
        eps.every((ep) => ep.frames.length === ep.ticks && ep.frames.every((f, i) => f.t === i) && ep.frames.filter((f) => f.brk).length === ep.breaks && near(sum(ep.frames.map((f) => f.ram)), ep.ramHp, 1e-9) && starts(ep) === ep.rams && ep.frames.every((f, i) => i === 0 || (f.a.hp <= ep.frames[i - 1].a.hp && f.b.hp <= ep.frames[i - 1].b.hp)) &&
            ep.frames.every((f) => f.a.pos.length === 3 && f.a.q.length === 4 && near(Math.hypot(...f.a.q), 1, 1e-6) && near(Math.hypot(...f.b.q), 1, 1e-6))) && S.episode(UNDER, S.flyOf("hand"), FIRST).hash === HAND.hash && ALONE.hash !== HAND.hash);
    ok("!! *** THE JOUST THE PAGE OPENS ON IS THE ROUND IN ONE FIGHT, AS THE PAGE SAYS ***: the pilot alone touches the autopilot at tick 68, loses 17.7 hull points to that one ram and wins in 178 ticks, reward 16.17 (the fight's 19.12 less the ram); with the hand rule the craft fires on 82 ticks, never touches, and wins in 506 ticks, reward 9.85. The real circuit's draw 1 flies the pilot alone's joust, frame for frame",
        ALONE.ticks === 178 && ALONE.rams === 1 && ALONE.frames.findIndex((f) => f.touch) === 68 && near(ALONE.ramHp, 17.7, 0.05) && ALONE.win === true && near(ALONE.reward, 16.17, 0.005) && near(ALONE.fight, 19.12, 0.005) && ALONE.breaks === 0 && near(ALONE.fight - ALONE.ramHp * E.RAM_PRICE, ALONE.reward, 1e-12) &&
        HAND.ticks === 506 && HAND.rams === 0 && !HAND.frames.some((f) => f.touch) && HAND.breaks === 82 && HAND.win === true && near(HAND.reward, 9.85, 0.005) && S.episode(UNDER, trained("GF", 1), FIRST).hash === ALONE.hash && F3.breaks === 15 && F3.rams === 1,
        `alone ${ALONE.reward.toFixed(2)} in ${ALONE.ticks}; hand ${HAND.reward.toFixed(2)} in ${HAND.ticks}`);
});

console.log("\n3. THE PICTURES");
await section(() => {
    const W = 720, H = 440, at = (ep, k, cam = S.CAM) => S.scene(ep, k, cam, W, H), col = (sc, c) => sc.lines.filter((l) => l[4] === c), inside = (l) => [l[0], l[2]].every((x) => x >= 0 && x <= W) && [l[1], l[3]].every((y) => y >= 0 && y <= H);
    const s0 = at(ALONE, 0), s30 = at(ALONE, 30), s68 = at(ALONE, 68), s100 = at(ALONE, 100), hb = HAND.frames.findIndex((f) => f.brk), hq = HAND.frames.findIndex((f, i) => i > 60 && !f.brk && !f.touch), sb = at(HAND, hb), sq = at(HAND, hq);
    ok("!! THE OUTSIDE VIEW SAYS WHICH CRAFT IS WHICH AND WHAT IT IS DOING: a craft is the 12 edges of its hull's box and a line from its nose, 13 segments; the craft is `craft` while the pilot flies and `breaking` on a tick the reflex fired; the autopilot is `foe`; ON THE TICK THE HULLS TOUCH BOTH ARE `ram`; and every colour named has a colour",
        col(s30, "craft").length === 13 && col(s30, "foe").length === 13 && col(s30, "breaking").length === 0 && col(s30, "ram").length === 0 && col(sb, "breaking").length === 13 && col(sb, "craft").length === 0 && col(sq, "craft").length === 13 && col(s68, "ram").length === 26 && col(s68, "craft").length === 0 && col(s68, "foe").length === 0 &&
        [s0, s30, s68, sb].every((sc) => sc.lines.every((l) => typeof S.COLOURS[l[4]] === "string")) && HAND.frames[hb].brk === true && hb >= 0 && hq > 60);
    ok("!! THE CAMERA HOLDS BOTH CRAFT, NEAR OR FAR: at the start (37 m apart), at the touch and 100 ticks in, every edge of both hulls is inside the picture; it stands further back the further apart they are; a line joins the two; and each craft trails where it has been for at most 45 ticks",
        [s0, s30, s68, s100, sb].every((sc) => sc.lines.filter((l) => ["craft", "foe", "ram", "breaking"].includes(l[4])).every(inside)) && s0.dist > s68.dist && at(HAND, 300).dist > s68.dist && [s0, s30, s100].every((sc) => col(sc, "gap").length === 1) && col(s0, "trail").length === 0 && col(s30, "trail").length === 30 && col(s30, "foeTrail").length === 30 &&
        col(s100, "trail").length === S.TRAIL && col(s100, "foeTrail").length === 45 && S.TRAIL === 45 && s0.lines.length === 27 && s100.lines.length === 117 && near(ALONE.frames[0].range, 36.6, 0.05), `dist ${s0.dist.toFixed(1)} at the start, ${s68.dist.toFixed(1)} at the touch`);
    const turned = at(ALONE, 30, { az: 2.1, el: 0.8, fov: 0.9 });
    ok("the same tick from the same camera is the same picture, to the hash; from another camera it is another; and another tick is another", at(ALONE, 30).hash === s30.hash && turned.hash !== s30.hash && s30.hash !== s68.hash && /^[0-9a-f]{8}$/.test(s30.hash) && turned.lines.length === s30.lines.length);
    const e0 = S.eyeOf(ALONE, 0), e60 = S.eyeOf(ALONE, 60), f60 = ALONE.frames[60], gap = (f) => Math.hypot(f.a.pos[0] - f.b.pos[0], f.a.pos[1] - f.b.pos[1], f.a.pos[2] - f.b.pos[2]);
    ok("!! THE EYE'S DISC IS WHAT THE REFLEX IS GIVEN: at the start the autopilot is nearly dead ahead and small; the disc's radius is the angle the hull's radius covers at the gap in the frame (atan of 1.88 m over it); the two numbers shown are the observation's own (the size is twice that angle, times the environment's gain of 2, as it was when the craft chose); and 60 ticks in it looks bigger than at the start",
        Math.abs(e0.bearing) < 0.2 && Math.abs(e0.elevation) < 0.2 && near(e0.radius, Math.atan(E.HULL_RADIUS / gap(ALONE.frames[0])), 1e-12) && near(e60.radius, Math.atan(E.HULL_RADIUS / gap(f60)), 1e-12) && e60.size === f60.size && e60.loom === f60.loom && Math.abs(f60.size - 2 * e60.radius * E.SIZE_GAIN) / f60.size < 0.1 && e60.radius > e0.radius && e60.size > e0.size &&
        e60.brk === false && S.eyeOf(HAND, hb).brk === true && near(E.HULL_RADIUS, Math.hypot(...P6.HALF), 1e-12), `radius ${e0.radius.toFixed(3)} -> ${e60.radius.toFixed(3)}`);
    const said = S.saidLines().join(" ");
    ok("!! WHAT THE PAGE SAYS IS WHAT THE ROUND FOUND AND WHAT THE OPENING JOUST DOES: all 12 real-circuit craft never fire, 9 of 12 shuffles and 7 of 12 free nets; six of the eight that fire score worse; tick 68, 178 ticks, 506 ticks, 9.85 against 16.17; the shots are not drawn; the manoeuvre was written by hand; not a fly's nervous system",
        /all 12 craft with the real Giant Fiber circuit as their reflex learned never to fire/.test(said) && /9 of the 12 with shuffled wiring and 7 of the 12 free nets/.test(said) && /Of the eight that do fire, six score worse/.test(said) && /at tick 68/.test(said) && /wins in 178 ticks/.test(said) && /506 ticks and scores 9\.85 where the pilot alone scored 16\.17/.test(said) &&
        /the shots are not drawn/.test(said) && /manoeuvre was written by hand/.test(said) && /Not a fly's nervous system/.test(said) && /cuts the ram damage by more than half and loses nearly a fifth/.test(said) && said.includes(String(S.FIRST_JOUST)));
});

console.log("\n4. THE PAGE (fly-ram.html in Chromium)");
await section(async () => {
    const { srv, origin } = await C.serveTree(ENG), browser = await C.launchBrowser(); const errors = []; let first = null, ran = null, t30 = null, t68 = null, px30 = null, px68 = null, text = "", stats68 = "", end = null, endText = "", hand = null, pxb = null, choice = "", tr = null, state = null, turned = null, dragged = null, meters = null, lost = null;
    const wait = (p, f, arg) => p.waitForFunction(f, arg, { timeout: 30000 });
    const count = () => { const tally = (id) => { const c = document.getElementById(id), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let blue = 0, orange = 0, red = 0, white = 0; for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2];
        if (r > 225 && g > 225 && b > 225) white++; else if (b > 200 && g > 160 && r < 190 && r > 90) blue++; else if (r > 200 && g > 130 && g < 215 && b < 120) orange++; else if (r > 200 && g < 140 && b < 140) red++; } return { blue, orange, red, white }; }; return { out: tally("out"), eye: tally("eye") }; };
    try {
        const p = await browser.newPage({ viewport: { width: 1240, height: 900 } }); p.on("pageerror", (e) => errors.push(e.message));
        await p.goto(`${origin}/fly-ram.html`, { waitUntil: "load", timeout: 60000 }); await wait(p, () => window.swekRam && window.swekRam.ticks);
        first = await p.evaluate(() => window.swekRam); await wait(p, () => window.swekRam.t >= 2); ran = await p.evaluate(() => window.swekRam);
        await p.evaluate(() => window.swekRamSeek(30)); t30 = await p.evaluate(() => window.swekRam); px30 = await p.evaluate(count);
        meters = await p.evaluate(() => [1, 2, 3, 4].map((n) => ({ w: document.getElementById("m" + n).style.width, v: document.getElementById("v" + n).textContent })));
        text = await p.evaluate(() => document.querySelector("aside").textContent);
        await p.evaluate(() => window.swekRamSeek(68)); t68 = await p.evaluate(() => window.swekRam); px68 = await p.evaluate(count); stats68 = await p.evaluate(() => document.getElementById("stats").textContent);
        await p.evaluate(() => window.swekRamSeek(30)); await p.evaluate(() => window.swekRamTurn(2.1, 0.8)); turned = await p.evaluate(() => window.swekRam); await p.evaluate(() => window.swekRamTurn(0.6, 0.35));
        const box = await p.locator("#out").boundingBox(); await p.mouse.move(box.x + 200, box.y + 150); await p.mouse.down(); await p.mouse.move(box.x + 300, box.y + 190, { steps: 4 }); await p.mouse.up(); dragged = await p.evaluate(() => window.swekRam);
        await p.evaluate(() => window.swekRamSeek(9999)); end = await p.evaluate(() => window.swekRam); endText = await p.evaluate(() => document.getElementById("end").textContent);
        state = await p.evaluate(() => ({ draw: document.getElementById("draw").disabled, kinds: [...document.getElementById("kind").options].map((o) => o.value), draws: document.getElementById("draw").options.length }));
        await p.selectOption("#kind", "hand"); await wait(p, () => window.swekRam.kind === "hand" && window.swekRam.ticks); await p.evaluate((k) => window.swekRamSeek(k), HAND.frames.findIndex((f) => f.brk)); hand = await p.evaluate(() => window.swekRam); pxb = await p.evaluate(count); choice = await p.evaluate(() => document.getElementById("choice").textContent);
        await p.selectOption("#kind", "FREE"); await p.selectOption("#draw", "3"); await wait(p, () => window.swekRam.kind === "FREE" && window.swekRam.draw === 3 && window.swekRam.ticks); tr = await p.evaluate(() => ({ ...window.swekRam, drawOff: document.getElementById("draw").disabled }));
        const q = await browser.newPage(); await q.route("**/flyRamRound.jsonl", (r) => r.fulfill({ status: 404, body: "gone" }));
        await q.goto(`${origin}/fly-ram.html`, { waitUntil: "load", timeout: 60000 }); await wait(q, () => window.swekRam && window.swekRam.ticks); await q.selectOption("#kind", "GF"); await wait(q, () => window.swekRam.error);
        lost = await q.evaluate(() => ({ h: window.swekRam, text: document.getElementById("stats").textContent }));
    } finally { await browser.close(); await shutdownServer(srv); }
    ok("!! THE PAGE OPENS ON THE PILOT ALONE IN JOUST 939596 AND IT IS THIS FILE'S: 178 ticks, the joust's hash and the duel's fingerprint the ones this file computes, no error on the page -- and it plays by itself (it reaches tick 2 with no click)",
        !!first && first.error === null && first.kind === "never" && first.seed === FIRST && first.ticks === 178 && first.hash === ALONE.hash && first.fingerprint === ALONE.fingerprint && first.reward === ALONE.reward && !!ran && ran.playing === true && ran.t >= 2 && errors.length === 0, first ? `${first.hash} ${errors[0] || ""}` : "no joust");
    const s30 = S.scene(ALONE, 30, S.CAM, 720, 440), s68 = S.scene(ALONE, 68, S.CAM, 720, 440);
    ok("!! THE OUTSIDE VIEW PAINTED IS THE ONE THIS FILE COMPUTES, AND ITS COLOURS ARE ON THE CANVAS: at tick 30 the scene's hash and its count of segments are this file's, and the canvas has the craft's blue and the autopilot's red and no orange or white; the eye's canvas has the autopilot's red disc",
        !!t30 && t30.t === 30 && t30.scene === s30.hash && t30.lines === s30.lines.length && t30.brk === false && t30.touch === false && !!px30 && px30.out.blue > 20 && px30.out.red > 20 && px30.out.orange === 0 && px30.out.white === 0 && px30.eye.red > 10 && px30.eye.white === 0, J(px30));
    ok("!! THE TOUCH IS SHOWN: at tick 68 both hulls are white in the outside view (no blue hull, no red hull), the disc in the eye is white, and the page says THE HULLS TOUCH", !!t68 && t68.touch === true && t68.scene === s68.hash && !!px68 && px68.out.white > 40 && px68.out.blue === 0 && px68.out.red === 0 && px68.eye.white > 10 && px68.eye.red === 0 && /tick 68 of 178 · .* · THE HULLS TOUCH$/.test(stats68), J(px68) + " " + stats68);
    const f30 = ALONE.frames[30];
    ok("!! THE METERS ARE THE REFLEX'S TWO NUMBERS AND THE TWO HULLS AT THAT TICK: how big the autopilot looks and how fast it looms are this file's observation, to three places; the hulls are the frame's (by tick 30 shots have landed: the craft has 94 of 100 and the autopilot 82), each bar that share of its track",
        !!meters && meters[0].v === f30.size.toFixed(3) && meters[1].v === f30.loom.toFixed(3) && Math.abs(parseFloat(meters[1].w) - Math.min(1, Math.abs(f30.loom)) * 50) < 0.01 && meters[2].v === "94" && meters[2].w === "94%" && meters[3].v === "82" && meters[3].w === "82%" && f30.a.hp === 94 && f30.b.hp === 82, J(meters));
    ok("!! THE END IS SAID AS THE ROUND SCORED IT: 'The craft won. Reward 16.17: the fight's 19.12, less 17.7 hull points lost to 1 ram. The reflex fired on 0 of 178 ticks.'; and what the page is and is not is on it, in the module's own lines",
        !!end && end.done === true && end.t === 178 && endText === "The craft won. Reward 16.17: the fight's 19.12, less 17.7 hull points lost to 1 ram. The reflex fired on 0 of 178 ticks." && S.saidLines().every((l) => text.includes(l)), endText);
    ok("!! THE REFLEX FIRING IS SHOWN: with the hand rule chosen, on the first tick it fires the craft's hull is orange in the outside view (and not blue) and the page says the reflex FIRED; this joust is this file's", !!hand && hand.error === null && hand.kind === "hand" && hand.hash === HAND.hash && hand.brk === true && hand.ticks === 506 && !!pxb && pxb.out.orange > 20 && pxb.out.blue === 0 && /^the reflex: FIRED/.test(choice), J(pxb && pxb.out) + " " + choice);
    ok("!! A TRAINED CRAFT IS PLAYED FROM THE ROUND'S OWN FILE: the free net's draw 3 on the same joust is this file's joust (it fires on 15 ticks and rams once); the draw can be chosen for a trained craft and not for a rule written by hand; the craft listed are the module's and the draws 12",
        !!tr && tr.error === null && tr.hash === F3.hash && tr.breaks === 15 && tr.rams === 1 && tr.draw === 3 && tr.drawOff === false && !!state && state.draw === true && J(state.kinds) === J(S.KINDS) && state.draws === 12);
    ok("the outside view can be turned, by the page's own function and by dragging: the picture is another, of the same joust and tick", !!turned && turned.scene !== s30.hash && turned.scene === S.scene(ALONE, 30, { az: 2.1, el: 0.8, fov: 0.9 }, 720, 440).hash && turned.hash === ALONE.hash && !!dragged && dragged.scene !== s30.hash && dragged.az !== 0.6 && dragged.t === 30);
    ok("!! A RESULTS FILE THAT DOES NOT ARRIVE IS SAID, BY NAME, and no joust is shown as if it had: the page answers that the round's file answered 404", !!lost && /brain\/flyRamRound\.jsonl answered 404/.test(lost.h.error || "") && /could not be flown: .*answered 404/.test(lost.text) && lost.h.hash === undefined && lost.h.ticks === undefined, lost ? lost.text : "");
});

console.log(`\nflyRamShow-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
