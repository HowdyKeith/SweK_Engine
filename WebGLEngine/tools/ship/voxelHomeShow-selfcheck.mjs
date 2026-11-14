// WebGLEngine/tools/ship/voxelHomeShow-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/voxelHomeShow-selfcheck.mjs      (about fifteen seconds; sections 1 to 3 are arithmetic, section 4 opens voxel-home.html in headless Chromium and reads its 2D canvas)
//
// THE GATE OF THE PAGE WHERE A BUILDER PUTS UP A HOUSE (backlog `voxel-home`, V3): brain/voxelHomeShow.mjs and voxel-home.html. What it holds is that THE PAGE PLAYS THE ROUNDS' OWN BUILDERS -- a build
// here, summed over the rounds' 200 audit plans, is the score and the homes in the rounds' committed records, to the bit -- and that the picture is the build's blocks. It trains nothing.
//   1  THE BUILDERS    the kinds; a round's untrained builder is the round's own, weight for weight; a record's weights unpacked without Buffer; what is refused
//   2  THE BUILD       the rounds' numbers again from this file's build(); a build's steps; the one house the fly-wired builder finished
//   3  THE PICTURE     the ground, three faces a block back to front, the step just made marked, a refused pick outlined where it asked; what the page says
//   4  THE PAGE        voxel-home.html in Chromium: the default build, the canvas's colours, other builders and rounds, a results file that does not arrive
// SABOTAGE LOG (2026-11-14) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked), this gate run whole for each; the number is the rows that went red:
//   THE MODULE: H1 a round's plain net has one unit more 1 | H2 weights unpacked big-endian 12 | H3 a trained builder left untrained 12 | H4 any record will do for a trained builder 1
//   H5 the lean leans to the finished columns 1 | H6 every build names its column 10 | H8 no step carries chances 1 | H9 the blocks standing are one step behind 8 | H10 the blocks drawn front to back 2
//   H11 glass drawn solid 1 | H12 the block just placed not marked 2 | H13 a refused pick not drawn 1 | H14 the roof in the wall's colour 1 | H15 the random builder ignores the plan 3
//   H16 the page says it is a fly building a house 1 | H17 the ground has no border 4 | H18 round 3 reads round 2's file 12 | H19 the picture too big for its canvas 3 | H20 the random builder ignores its draw 3
//   H21 the door's tile in the plot's colour 1
//   THE PAGE: G1 opens on plan 700001 5 | G2 does not play by itself 1 | G3 does not look at the answer's status 1 | G4 paints the step before 1 | G5 does not print what it is 1
//   G6 a random builder's draw cannot be chosen 1 | G7 a seek does not pause 1 | G8 always reads round 3 1 | G9 every finished build called a home 1 | G10 only the ground filled in 1
//   G11 the second grid's caption never changes 1 | G12 shows the draw-1 builder whatever is chosen 1
//   ONE WENT 0 RED AND IS EQUIVALENT: H7 (every refusal names the block it asked for) -- a column with nothing left has no next block, so buildEnv's nextOf() answers null for it either way.
//   TWO OF THIS GATE'S OWN ROWS WERE WRONG WHEN WRITTEN, AND ARE CORRECTED: the random builder was first the rounds' generator started afresh for each build, and that builds 0.59 to 0.61 where the
//   rounds' one stream through 200 plans built 0.57 -- so it is mulberry32 seeded by the draw and the plan, and the row holds it to the rounds' mean; and the canvas row asked for pixels in the wall's
//   top colour, which a finished house does not show (the roof covers every wall's top), so it asks for a wall's left face.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as S from "../../brain/voxelHomeShow.mjs";
import * as B from "../../brain/rl/buildEnv.mjs";
import * as V1 from "./voxelHome.mjs";
import * as V2 from "./voxelHomeDrawn.mjs";
import * as V3 from "./voxelHomeLong.mjs";
import * as PF from "./paintingFly.mjs";
import * as C from "../roundhouse/angularImpulseCensus.mjs";
import { shutdownServer } from "./serverShutdown.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
async function section(fn) { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8");
const VS = { 1: V1, 2: V2, 3: V3 }, TEXT = Object.fromEntries([1, 2, 3].map((n) => [n, src(S.ROUNDS[n].file)])), RECS = Object.fromEntries([1, 2, 3].map((n) => [n, S.recordsOf(TEXT[n])]));
const floorsOf = (n) => TEXT[n].split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((r) => r.kind === "floors");
const trained = (n, arm, s) => S.builderOf(arm, { round: n, draw: s, record: RECS[n].get(`${arm} ${s}`) });
const over = (builder, seeds) => { let sum = 0; const homes = []; for (const seed of seeds) { const b = S.build(builder, seed); sum += b.share; if (b.check.home) homes.push(b); } return { score: sum / seeds.length, homes }; };
const HOME_PLAN = 2196692, FLY1 = trained(3, "FLY", 1), HOME = S.build(FLY1, HOME_PLAN);

console.log("voxelHomeShow-selfcheck -- the page where a builder puts up a house: the builders, the build, the picture, the page (nothing is trained here)\n");

console.log("1. THE BUILDERS");
await section(() => {
    ok("the kinds are the rule, the lean, a random builder and the rounds' five arms, each with a label; the three rounds are the rounds' own choice, plain net and results file",
        J(S.KINDS) === J(["rule", "lean", "random", "FLY", "SHUF", "PLAIN", "FISH", "MLP"]) && J(S.ARMS) === J(V3.ARMS) && S.KINDS.every((k) => typeof S.LABELS[k] === "string" && S.LABELS[k].length > 8) && S.DRAWS === V3.SEEDS.length && J(S.MLP_HIDDEN) === J(V3.MLP_HIDDEN) &&
        [1, 2, 3].every((n) => S.ROUNDS[n].file === VS[n].RESULTS && S.ROUNDS[n].plainUnits === VS[n].PLAIN_UNITS && S.ROUNDS[n].iters === VS[n].RECIPE.iters) && S.ROUNDS[1].choice === "named" && S.ROUNDS[2].choice === "drawn" && S.ROUNDS[3].choice === "drawn" && J(V1.ROUND1.choice) === J("named") && V2.ROUND2.choice === "drawn" && V3.ROUND3.choice === "drawn");
    const same = [1, 2, 3].flatMap((n) => S.ARMS.map((a) => [n, a, J(Array.from(S.policyFor(n, a, 2).getParams())) === J(Array.from(VS[n].policyOf(a, 2).getParams())) && S.policyFor(n, a, 2).getParams().length === VS[n].WEIGHTS[a]]));
    ok("!! A ROUND'S UNTRAINED BUILDER HERE IS THE ROUND'S OWN, WEIGHT FOR WEIGHT: draw 2 of every arm of every round, against tools/ship/voxelHome.mjs's policyOf (which a page cannot load), and the weight counts the rounds registered", same.every((x) => x[2]), same.filter((x) => !x[2]).map((x) => x[0] + " " + x[1]).join(", "));
    const r = RECS[3].get("SHUF 5");
    ok("!! A RECORD'S WEIGHTS UNPACK WITHOUT Buffer TO THE SAME NUMBERS, and a file's draws are found by arm and draw (80 a round)", J(Array.from(S.unpackWeights(r.weights))) === J(Array.from(PF.unpackWeights(r.weights))) && PF.hashWeights(S.unpackWeights(r.weights)) === r.weightsHash && [1, 2, 3].every((n) => RECS[n].size === 80) && r.arm === "SHUF" && r.s === 5 && throws(() => S.unpackWeights("AAAAAAA="), /not a whole number of float32s/));
    const act = trained(3, "FISH", 4).act, pol = V3.policyOf("FISH", 4); pol.setParams(PF.unpackWeights(RECS[3].get("FISH 4").weights)); const o = new B.BuildEnv({ choice: "drawn" }).reset(11);
    ok("a trained builder's choice is its round's policy with its record's weights (FISH draw 4 of round 3 on one observation, number for number), and it carries the record's score and homes", J(Array.from(act(o))) === J(Array.from(pol.act(o))) && FLY1.score === RECS[3].get("FLY 1").score && FLY1.homes === 1 && FLY1.choice === "drawn" && trained(1, "FLY", 1).choice === "named");
    ok("!! WHAT IS REFUSED, BY NAME: a builder that is not one; a trained builder with no record, with another arm's, with another draw's; a round 2 record given to round 1 (another weight count); draw 17; round 4; a plan seed of 0; a step past the build's end",
        throws(() => S.builderOf("WORM"), /no builder WORM/) && throws(() => S.builderOf("FLY", { round: 3, draw: 1 }), /FLY draw 1 of round 3 needs its record from brain\/voxelHomeLongRound\.jsonl/) && throws(() => S.builderOf("FLY", { round: 3, draw: 1, record: RECS[3].get("SHUF 1") }), /needs its record/) &&
        throws(() => S.builderOf("FLY", { round: 3, draw: 1, record: RECS[3].get("FLY 2") }), /needs its record/) && throws(() => S.builderOf("FLY", { round: 1, draw: 1, record: RECS[2].get("FLY 1") }), /has 2967 weights, and its builder takes 1777/) && throws(() => S.builderOf("random", { draw: 17 }), /no draw 17/) &&
        throws(() => S.policyFor(4, "FLY", 1), /no round 4/) && throws(() => S.build(S.builderOf("rule"), 0), /plan's seed is a whole number from 1/) && throws(() => S.scene(HOME, HOME.steps.length + 1), /no step 86 of this build/) && throws(() => S.cellsAt(HOME, -1), /no step -1/));
});

console.log("\n2. THE BUILD");
await section(() => {
    const fly = over(FLY1, V3.AUDIT), rec = RECS[3].get("FLY 1");
    ok("!! *** THE PAGE'S BUILD IS THE ROUND'S: round 3's FLY draw 1, built here on the round's 200 audit plans, gives the record's score to the bit and its one home *** -- and that home is plan 2196692, a 4 x 4 house of 50 blocks finished in 85 steps",
        fly.score === rec.score && fly.homes.length === rec.homes && rec.homes === 1 && fly.homes[0].planSeed === HOME_PLAN && fly.homes[0].hash === HOME.hash && HOME.hash === "7e5acf13" && HOME.steps.length === 85 && HOME.blocks === 50 && HOME.plan.w === 4 && HOME.plan.d === 4 && HOME.check.home && HOME.share === 1, `${fly.score} ${fly.homes.length}`);
    const r1 = over(trained(1, "FLY", 3), V1.AUDIT), r2 = over(trained(2, "MLP", 7), V2.AUDIT);
    ok("!! ...and so are the other rounds': round 1's FLY draw 3 (it names a column) and round 2's MLP draw 7, each its record's score to the bit and no home", r1.score === RECS[1].get("FLY 3").score && r1.homes.length === 0 && r2.score === RECS[2].get("MLP 7").score && r2.homes.length === 0);
    const f = floorsOf(3), lean = over(S.builderOf("lean"), V3.AUDIT), rnd1 = over(S.builderOf("random", { draw: 1 }), V3.AUDIT), rnd16 = over(S.builderOf("random", { draw: 16 }), V3.AUDIT);
    ok("!! THE LEAN IS THE ROUNDS' FLOOR, TO THE BIT: built here on the 200 audit plans it gives the file's 0.9226 and its 123 homes", lean.score === f.lean && lean.homes.length === f.leanHomes && f.leanHomes === 123 && Math.abs(f.lean - 0.9226) < 5e-5);
    console.log(`     random builders 1 and 16 here: ${rnd1.score.toFixed(4)}, ${rnd16.score.toFixed(4)}; in the file: ${f.random[0].toFixed(4)}, ${f.random[15].toFixed(4)}`);
    const fm = f.random.reduce((x, y) => x + y, 0) / 16;
    ok("!! A RANDOM BUILDER HERE BUILDS WHAT THE ROUNDS' RANDOM BUILDERS DID, AND IS NOT THEIR STREAM (the rounds ran one stream through all 200 plans; this one is seeded by the draw and the plan): builders 1 and 16 on the 200 audit plans are each within 0.015 of the file's mean of 16 (0.5722), differ from each other, and finish no home",
        Math.abs(rnd1.score - fm) < 0.015 && Math.abs(rnd16.score - fm) < 0.015 && Math.abs(fm - 0.5722) < 5e-5 && rnd1.score !== rnd16.score && rnd1.homes.length + rnd16.homes.length === 0);
    const rule = V3.AUDIT.slice(0, 20).map((seed) => S.build(S.builderOf("rule"), seed));
    ok("!! THE RULE FINISHES EVERY HOUSE IN AS MANY STEPS AS IT HAS BLOCKS, with no pick refused (the first 20 audit plans, 50 to 94 blocks)", rule.every((b) => b.check.home && b.steps.length === b.blocks && b.rejected === 0 && b.share === 1 && b.steps.every((s) => s.placed && s.why === null && s.chances === null)) && new Set(rule.map((b) => b.blocks)).size > 3 && rule.every((b) => b.blocks >= 50 && b.blocks <= 94));
    const b = HOME, plan = B.homePlan(HOME_PLAN), keyOf = (c) => `${c.x},${c.y},${c.z},${c.id}`, want = new Set(plan.cells.map(keyOf)), placed = b.steps.filter((s) => s.placed);
    ok("!! A BUILD'S STEPS ARE THE EPISODE: its plan is buildEnv's for the seed; every block placed is one of the plan's and none twice; the placed and the refused are the steps; a refusal says why, and names the block it asked for only when that block had nothing to hold it",
        b.plan.hash === plan.hash && J(b.plan.cells) === J(plan.cells.map((c) => ({ x: c.x, y: c.y, z: c.z, id: c.id }))) && placed.every((s) => want.has(keyOf(s.placed))) && new Set(placed.map((s) => keyOf(s.placed))).size === placed.length && placed.length === b.placed && b.placed === 50 && b.rejected === 35 && placed.length + b.rejected === b.steps.length &&
        b.steps.every((s, i) => s.t === i && (s.placed ? s.why === null && s.wanted === null : (s.why === "nothing left in that column" && s.wanted === null) || (s.why === "nothing to hold the block up" && want.has(keyOf(s.wanted))))) && b.steps.some((s) => s.why === "nothing left in that column"));
    const random = S.build(S.builderOf("random", { draw: 1 }), HOME_PLAN);
    ok("!! A STEP CARRIES THE BUILDER'S VIEW: what each of the 36 columns still needs before the step (the first step's is the plan's columns over 4 layers) and, for a drawn choice, 36 chances that sum to 1 with the picked column among them; a builder that names a column has no chances",
        b.steps.every((s) => s.need.length === 36 && s.chances.length === 36 && Math.abs(s.chances.reduce((a, v) => a + v, 0) - 1) < 1e-9 && s.chances[s.col] > 0) && J(b.steps[0].need) === J(plan.columns.map((c) => c.length / 4)) && random.steps.every((s) => s.chances === null && s.need.length === 36) && random.choice === "named");
    ok("a build is its builder's and its plan's and nothing else's: the same again, another plan another build, another builder another build; a house not finished says what it lacks", S.build(FLY1, HOME_PLAN).hash === b.hash && J(S.build(FLY1, HOME_PLAN).steps) === J(b.steps) && S.build(FLY1, 700001).hash !== b.hash && random.hash !== b.hash && random.hash === "85815b52" && !random.check.home && !random.check.roofed && random.placed === 25 && random.steps.length === 96);
});

console.log("\n3. THE PICTURE");
await section(() => {
    const b = HOME, s0 = S.scene(b, 0), end = S.scene(b, b.steps.length), all = (sc) => sc.faces.flatMap((f) => f.points);
    ok("before the first step the picture is the ground alone: 64 tiles (the site and a border), the house's 4 x 4 plot in its own colour and the door's tile in the door's", s0.faces.length === 64 && s0.faces.every((f) => f.kind === "ground" && f.face === "top") && s0.faces.filter((f) => f.fill === S.COLOURS.plot).length === 15 && s0.faces.filter((f) => f.fill === S.COLOURS.door).length === 1 && s0.faces.filter((f) => f.fill === S.COLOURS.ground).length === 48 && s0.blocks === 0);
    const counts = [0, 1, 17, 40, 85].map((k) => { const sc = S.scene(b, k), n = S.cellsAt(b, k).length, last = k ? b.steps[k - 1] : null; return sc.faces.length === 64 + 3 * n + (last && !last.placed ? 3 : 0) && sc.blocks === n; });
    ok("!! THE PICTURE IS THE BUILD'S BLOCKS: three faces a block standing after the step (and three outlines for a refused pick), at steps 0, 1, 17, 40 and 85; at the end, 50 blocks", counts.every(Boolean) && end.blocks === 50 && J(S.cellsAt(b, 85)) === J(b.steps.filter((s) => s.placed).map((s) => s.placed)) && S.cellsAt(b, 0).length === 0);
    ok("every point of every face is on the 720 x 560 canvas, at the default size and at half of it", [s0, end, S.scene(b, 40)].every((sc) => all(sc).every(([x, y]) => x >= 0 && x <= 720 && y >= 0 && y <= 560)) && all(S.scene(b, 85, { width: 360, height: 280 })).every(([x, y]) => x >= 0 && x <= 360 && y >= 0 && y <= 280) && end.width === 720 && end.height === 560);
    const A = Math.min(720 / 16.5, 560 / 12.2), blocks = end.faces.filter((f) => f.kind !== "ground"), tops = blocks.filter((f) => f.face === "top"), firstBlock = end.faces.findIndex((f) => f.kind !== "ground");
    const cells = S.cellsAt(b, 85).slice().sort((p, q) => (p.x + p.z) - (q.x + q.z) || p.y - q.y || p.x - q.x), isAt = (t, c) => Math.abs(t.points[0][0] - (360 + (c.x - c.z) * A)) < 1e-6 && Math.abs((t.points[2][1] - t.points[0][1]) - A) < 1e-6;
    const behind = cells.some((ci, i) => cells.some((cj, j) => j > i && cj.x <= ci.x && cj.z <= ci.z && cj.y <= ci.y));
    ok("!! BACK TO FRONT: the ground is drawn first, then the blocks from the far corner to the near one, each as left, right, top -- no block is drawn after one that stands in front of it or on it (no later block is behind-and-below an earlier one, over all 50 x 49 pairs), and each top is where its block is",
        end.faces.slice(0, 64).every((f) => f.kind === "ground") && firstBlock === 64 && !behind && blocks.every((f, i) => f.face === ["left", "right", "top"][i % 3]) && tops.length === 50 && cells.every((c, i) => isAt(tops[i], c)));
    const fills = (sc, id) => sc.faces.filter((f) => f.kind !== "ground" && f.face === "top" && f.fill === S.COLOURS[id]).length, glass = end.faces.filter((f) => f.alpha === 0.55);
    ok("!! A BLOCK IS IN ITS MATERIAL'S COLOUR: at the end 16 roof tops, and the walls' and the windows' tops by the plan's count; glass is drawn part clear and nothing else is; a block's left and right faces are its colour, darker", fills(end, B.BLOCKS.roof) === 16 && fills(end, B.BLOCKS.glass) === b.plan.windows && fills(end, B.BLOCKS.wall) === 50 - 16 - b.plan.windows && b.plan.windows > 0 && glass.length === 3 * b.plan.windows &&
        end.faces.filter((f) => f.kind !== "ground" && f.face === "left").every((f) => f.fill !== S.COLOURS[B.BLOCKS.wall] && /^#[0-9a-f]{6}$/.test(f.fill)) && S.SHADE.top === 1 && S.SHADE.left < 1 && S.SHADE.right < S.SHADE.left);
    const kPlaced = b.steps.findIndex((s) => s.placed) + 1, kHang = b.steps.findIndex((s) => s.wanted && s.wanted.x !== s.wanted.z) + 1, kNone = b.steps.findIndex((s) => !s.placed && !s.wanted) + 1, sp = S.scene(b, kPlaced), sh = S.scene(b, kHang), sn = S.scene(b, kNone);
    const marked = (sc, kind) => sc.faces.filter((f) => f.kind === kind), topOf = (f) => f.points, w = b.steps[kHang - 1].wanted, a = Math.min(720 / 16.5, 560 / 12.2);
    ok("!! THE STEP JUST MADE IS MARKED: a placed block's three faces outlined in the placed colour; a refused pick three outlines with no fill in the refusal's colour -- where the block it asked for would hang, or on top of the column that had nothing left -- and one mark at most",
        kPlaced > 0 && kHang > 0 && kNone > 0 && marked(sp, "placed").length === 3 && marked(sp, "placed").every((f) => f.stroke === S.COLOURS.placed && f.fill) && marked(sp, "refused").length === 0 && marked(sh, "refused").length === 3 && marked(sh, "refused").every((f) => f.fill === null && f.stroke === S.COLOURS.refused) && marked(sh, "placed").length === 0 &&
        marked(sn, "refused").length === 3 && Math.abs(topOf(marked(sh, "refused")[2])[0][0] - (360 + (w.x - w.z) * a)) < 1e-6 && w.x !== w.z && S.scene(b, 0).faces.every((f) => f.kind === "ground"), `steps ${kPlaced}, ${kHang}, ${kNone}`);
    const said = S.saidLines().join(" ");
    ok("!! WHAT THE PICTURE IS AND IS NOT IS SAID WITH IT: the builder never picks the block or its height; a block must be held up; the two grids are the builder's view; the rounds' findings in their own numbers; and 'Not a fly building a house'",
        /never picks the block or its height/.test(said) && /A block must be held up/.test(said) && /the builder's view/.test(said) && /built less than a random one/.test(said) && /0\.69 of a house, a random builder 0\.57/.test(said) && /builds 0\.92 and finishes 123 houses of 200/.test(said) && /one house each in 16,000 builds/.test(said) && /Not a fly building a house/.test(said) && /could not be told apart from a shuffle/.test(said));
});

console.log("\n4. THE PAGE (voxel-home.html in Chromium)");
await section(async () => {
    const { srv, origin } = await C.serveTree(ENG), browser = await C.launchBrowser(); const errors = []; let first = null, start = null, end = null, text = "", endText = "", inkStart = null, inkEnd = null, ran = null, rnd = null, rndState = null, r1 = null, rule = null, lost = null;
    const wait = (p, f, arg) => p.waitForFunction(f, arg, { timeout: 30000 });
    const ink = (p) => p.evaluate((cols) => { const c = document.getElementById("pad"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, rgb = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)), want = Object.entries(cols).map(([n, h]) => [n, rgb(h)]), out = Object.fromEntries(want.map(([n]) => [n, 0])); for (let i = 0; i < d.length; i += 4) for (const [n, v] of want) if (Math.abs(d[i] - v[0]) + Math.abs(d[i + 1] - v[1]) + Math.abs(d[i + 2] - v[2]) < 12) out[n]++; return { ...out, width: c.width, height: c.height }; }, { roof: S.COLOURS[B.BLOCKS.roof], wall: S.scene(HOME, 85).faces.find((f) => f.kind === "block" && f.face === "left" && f.alpha === 1 && f.points[0][1] > 300).fill, ground: S.COLOURS.ground, plot: S.COLOURS.plot, placed: S.COLOURS.placed });
    try {
        const p = await browser.newPage({ viewport: { width: 1220, height: 800 } }); p.on("pageerror", (e) => errors.push(e.message));
        await p.goto(`${origin}/voxel-home.html`, { waitUntil: "load", timeout: 60000 }); await wait(p, () => window.swekHome && window.swekHome.steps);
        first = await p.evaluate(() => window.swekHome); await wait(p, () => window.swekHome.step >= 2); ran = await p.evaluate(() => window.swekHome);
        await p.evaluate(() => window.swekHomeSeek(0)); start = await p.evaluate(() => window.swekHome); inkStart = await ink(p);
        await p.evaluate(() => window.swekHomeSeek(999)); end = await p.evaluate(() => window.swekHome); inkEnd = await ink(p);
        text = await p.evaluate(() => document.querySelector("aside").textContent); endText = await p.evaluate(() => document.getElementById("end").textContent);
        await p.selectOption("#kind", "random"); await wait(p, () => window.swekHome.kind === "random" && window.swekHome.steps); await p.evaluate(() => window.swekHomeSeek(999));
        rnd = await p.evaluate(() => window.swekHome); rndState = await p.evaluate(() => ({ round: document.getElementById("round").disabled, draw: document.getElementById("draw").disabled, end: document.getElementById("end").textContent, cap: document.getElementById("leancap").textContent }));
        await p.selectOption("#kind", "rule"); await wait(p, () => window.swekHome.kind === "rule" && window.swekHome.steps); await p.evaluate(() => window.swekHomeSeek(999));
        rule = await p.evaluate(() => ({ ...window.swekHome, drawOff: document.getElementById("draw").disabled, roundOff: document.getElementById("round").disabled }));
        await p.selectOption("#kind", "FLY"); await p.selectOption("#round", "1"); await p.selectOption("#draw", "3"); await p.fill("#plan", "700001"); await p.dispatchEvent("#plan", "change");
        await wait(p, () => window.swekHome.kind === "FLY" && window.swekHome.round === 1 && window.swekHome.draw === 3 && window.swekHome.plan === 700001 && window.swekHome.steps); r1 = await p.evaluate(() => window.swekHome);
        const q = await browser.newPage(); await q.route("**/voxelHomeLongRound.jsonl", (r) => r.fulfill({ status: 404, body: "gone" }));
        await q.goto(`${origin}/voxel-home.html`, { waitUntil: "load", timeout: 60000 }); await wait(q, () => window.swekHome);
        lost = await q.evaluate(() => ({ h: window.swekHome, text: document.getElementById("stats").textContent }));
    } finally { await browser.close(); await shutdownServer(srv); }
    ok("!! THE PAGE OPENS ON THE ONE HOUSE THE FLY-WIRED BUILDER FINISHED, AND IT IS THIS FILE'S BUILD: round 3's FLY draw 1 on plan 2196692, 85 steps, 50 blocks, the build's hash the one section 2 holds, a home, no error on the page",
        !!first && first.error === null && first.kind === "FLY" && first.round === 3 && first.draw === 1 && first.plan === HOME_PLAN && first.planHash === HOME.plan.hash && first.steps === 85 && first.blocks === 50 && first.hash === HOME.hash && first.home === true && errors.length === 0, first ? `${first.hash} ${errors[0] || ""}` : "no build");
    ok("!! IT PLAYS BY ITSELF, AND STOPS WHERE IT IS TOLD: opened, it is playing and reaches step 2 with no click; sent to step 0 it is paused with no block; sent past the end it is at step 85 of 85 with 50 of 50", !!ran && ran.playing === true && ran.step >= 2 && !!start && start.step === 0 && start.placed === 0 && start.playing === false && start.faces === 64 && !!end && end.step === 85 && end.placed === 50 && end.done === true && end.faces === S.scene(HOME, 85).faces.length);
    ok("!! THE HOUSE IS ON THE CANVAS: at step 0 there is ground and the plot and not one pixel of roof or wall; at the end thousands of pixels in the roof's colour and in the colour of a wall's left face (the walls' tops are under the roof), the plot covered, and the last block's outline in the placed colour",
        !!inkStart && !!inkEnd && inkStart.width === 720 && inkStart.height === 560 && inkStart.roof === 0 && inkStart.wall === 0 && inkStart.ground > 20000 && inkStart.plot > 5000 && inkEnd.roof > 8000 && inkEnd.wall > 3000 && inkEnd.plot < inkStart.plot / 4 && inkEnd.placed > 20 && inkStart.placed === 0, J(inkStart) + " " + J(inkEnd));
    ok("!! WHAT IT IS AND IS NOT IS ON THE PAGE, in the module's own lines, with the count and the verdict of this build: 'A HOME'", S.saidLines().every((l) => text.includes(l)) && /step 85 of 85 · 50 of 50 blocks · 35 picks refused/.test(text) && /^A HOME: every block, roofed, a door, the room closed but for the door \(85 steps\)\.$/.test(endText));
    const mr = S.build(S.builderOf("random", { draw: 1 }), HOME_PLAN), mrule = S.build(S.builderOf("rule"), HOME_PLAN), m1 = S.build(trained(1, "FLY", 3), 700001);
    ok("!! ANOTHER BUILDER IS ANOTHER BUILD, EACH THIS FILE'S: the random builder on the same plan (25 of 50, not a home, and the page says what it lacks); the rule (50 steps, a home); then round 1's FLY draw 3 on plan 700001, read from round 1's own file",
        !!rnd && rnd.hash === mr.hash && rnd.placed === 25 && rnd.home === false && rnd.round === null && /^Not a home: 50% built when the 96 steps ran out, no whole roof, the room open to the outside\.$/.test(rndState.end) && !!rule && rule.hash === mrule.hash && rule.steps === 50 && rule.home === true &&
        !!r1 && r1.error === null && r1.hash === m1.hash && r1.steps === m1.steps.length && r1.planHash === m1.plan.hash && r1.hash !== HOME.hash, rnd && r1 ? `${rnd.hash} ${rule.hash} ${r1.hash}` : "");
    ok("the controls say what applies: a random builder has a draw and no round; the rule has neither; and for a builder that names a column the second grid is captioned so", !!rndState && rndState.round === true && rndState.draw === false && rule.drawOff === true && rule.roundOff === true && /the column the builder named/.test(rndState.cap));
    ok("!! A RESULTS FILE THAT DOES NOT ARRIVE IS SAID, BY NAME, and no build is shown as if it had: the page answers that round 3's file answered 404", !!lost && /brain\/voxelHomeLongRound\.jsonl answered 404/.test(lost.h.error || "") && /could not be made: .*answered 404/.test(lost.text) && lost.h.hash === undefined && lost.h.steps === undefined, lost ? lost.text : "");
});

console.log(`\nvoxelHomeShow-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
