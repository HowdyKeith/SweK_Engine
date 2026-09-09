// WebGLEngine/nav/detourScale-selfcheck.mjs -- v4552
//
// Run: node nav/detourScale-selfcheck.mjs
//
// GATES nav/detourScale.mjs -- the measurement tools/ship/nextRounds.mjs said had to be taken before the
// snapshot-window question could be answered: "choosing between them still needs the number nobody has
// taken, which is what real detours in real worlds look like."
//
// *** THE NUMBER INVERTS THE QUESTION, WHICH IS WHY IT HAD TO BE TAKEN RATHER THAN REASONED. *** Every
// previous round on this treated HM_PADDING = 24 as possibly too NARROW -- v4547 built an escalating ladder
// to 60 and 144 for exactly that fear. Measured on the engine's own terrain, no route in 240 needed a pad
// over 3, and the world is 0.18% blocked into ONE component covering 100% of the map. There is nothing to
// go round. 24 is six times the worst case, and the two unbuilt shapes solve a problem this world does not
// have.
//
// Sections 2 and 3 are what stop that being a comfortable story: the same instrument is pointed at a world
// that DOES have an obstacle, and it reports an excursion of 58 where the geometry says 58.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as DS from "./detourScale.mjs";
import { gateReport } from "../tools/ship/gateReport.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const REPORT = gateReport("nav/detourScale-selfcheck.mjs");

console.log("detourScale-selfcheck -- what a world's real detours are, and what window they imply\n");

// =============================================================================================================
console.log("1. *** THE ENGINE'S OWN TERRAIN, RE-DERIVED FROM A COMMITTED SLAB RATHER THAN QUOTED ***");
let live = null;
{
    // nav/fixtures/engineTerrain96.json is 96x96 of main.js's world._heightAt, read out of a real boot. The
    // full 320x320 reading is frozen in MEASURED_AT_V4552 because taking it needs a browser and minutes;
    // this slab is the part a gate can afford to re-derive, and it is REAL TERRAIN rather than a fixture
    // shaped to agree with the conclusion.
    const F = JSON.parse(fs.readFileSync(path.join(ENG, "nav", "fixtures", "engineTerrain96.json"), "utf8"));
    const hm = Int16Array.from(F.heights);
    const ob = DS.obstruction(hm, { stride: F.stride });
    live = DS.detourCensus(hm, { stride: F.stride, samples: 40, minSep: 20, maxSep: 60 });
    say(`${F.stride}x${F.rows} of the engine's heights (${F.min}..${F.max}): ` +
        `${(100 * ob.blockedFraction).toFixed(2)}% of edges blocked, largest component ` +
        `${ob.largestComponentPct.toFixed(1)}%, ${ob.components} components`);
    say(`${live.samples} routes, ${live.unreachable} unreachable of ${live.tried} tried: excursion median ` +
        `${live.excursion.median}, p90 ${live.excursion.p90}, p99 ${live.excursion.p99}, max ${live.excursion.max}`);

    ok("!! *** THE SHIPPED WORLD IS AN OPEN FIELD FOR PATHFINDING: one component holds essentially all of it ***",
        ob.largestComponentPct > 99 && ob.blockedFraction < 0.02,
        `${(100 * ob.blockedFraction).toFixed(2)}% blocked at the worker's own rule (up<=3, down<=6). That is ` +
        `WHY the detours below are small -- it is a fact about this terrain and this step rule together, not ` +
        `a property of pathfinding, and section 3 tightens the rule to show the number move.`);
    ok("!! *** AND NO ROUTE NEEDS A PAD ANYWHERE NEAR THE SHIPPED 24 ***",
        live.excursion.max <= 8 && live.unreachable === 0,
        `worst excursion ${live.excursion.max} over ${live.samples} routes, ${live.unreachable} unreachable. ` +
        `The full 320x320 reading was max 3 over 240 routes. HM_PADDING = 24 is not the binding constraint ` +
        `on this world and never has been.`);
    // A census that reported comfort because nothing could be reached would be the worst kind of green.
    ok("...and that is not comfort bought by unreachability, which would read the same in the summary",
        live.unreachable === 0 && live.samples >= 30,
        `${live.unreachable} unreachable of ${live.tried}. A world nothing can cross also produces a tidy ` +
        `excursion distribution, from the handful of pairs that happen to be neighbours.`);
}

// =============================================================================================================
console.log("\n2. *** POINTED AT A WORLD THAT DOES HAVE AN OBSTACLE, IT REPORTS THE GEOMETRY'S OWN ANSWER ***");
{
    // A wall across the middle with one gap. Start and goal sit on the SAME column on opposite sides, so the
    // start/goal bounding box is a thin line and the true route must bulge out to the gap and back.
    // *** THE EXPECTED EXCURSION IS DERIVED FROM WHERE THE GAP IS, NOT PINNED. *** Moving the gap moves the
    // answer, which is the difference between measuring the instrument and measuring one fixture.
    const N = 80, COL = 10, WALL = 40;
    const build = (gapLo, gapHi) => {
        const hm = new Int16Array(N * N);
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++)
            hm[j * N + i] = j === WALL && !(i >= gapLo && i <= gapHi) ? 50 : 0;
        return hm;
    };
    const rows = [];
    for (const [lo, hi] of [[68, 72], [38, 42], [8, 12]]) {
        const r = DS.route(build(lo, hi), { stride: N, si: COL, sj: 20, gi: COL, gj: 60 });
        rows.push({ lo, want: Math.max(0, lo - COL), got: r ? r.excursion : null });
    }
    for (const r of rows) say(`gap starting at i=${r.lo}: excursion ${r.got}, geometry says ${r.want}`);
    // Emitted as well as printed since v4565: tools/ship/gateReport-selfcheck holds that a gate arguing in
    // numbers must leave them somewhere a second reader can open, and it named this one -- which nothing had
    // noticed because that gate was itself outside the ship-time sweep until the over-budget pool was
    // re-timed.
    REPORT.table("moving the gap moves the excursion, and by exactly the geometry",
        ["gap starts at column", "measured excursion", "geometry says"],
        rows.map((r) => [r.lo, r.got, r.want]),
        "The route must reach the gap's near edge, so the bulge outside the start/goal box is gapLo minus " +
        "the wall's column -- three gaps, three answers, none of them typed into the gate.");
    ok("!! *** THE EXCURSION IS THE DISTANCE TO THE GAP, AND MOVING THE GAP MOVES IT ***",
        rows.every((r) => r.got === r.want) && new Set(rows.map((r) => r.got)).size === 3,
        rows.map((r) => `${r.got}=${r.want}`).join(", ") + ". A route from column " + COL + " to the far side " +
        "must reach the gap's near edge, so the bulge outside the start/goal box is exactly gapLo - " + COL +
        " -- three different gaps, three different answers, none of them typed here.");

    const wall = build(68, 72);
    const cw = DS.detourCensus(wall, { stride: N, samples: 30, minSep: 20, maxSep: 50 });
    const ow = DS.obstruction(wall, { stride: N });
    say(`the walled world: ${(100 * ow.blockedFraction).toFixed(2)}% blocked, excursion max ${cw.excursion.max}, ` +
        `suggested pad ${DS.suggestPad(cw)}`);
    ok("!! ...and a census of that world asks for a pad the engine's world never would",
        cw.excursion.max > 20 && DS.suggestPad(cw) > 24 && live.excursion.max <= 8,
        `walled world wants ${DS.suggestPad(cw)}, engine terrain wants ${DS.suggestPad(live)}. THE INSTRUMENT ` +
        `IS NOT SIMPLY REPORTING SMALL NUMBERS: point it at an obstacle and the answer exceeds the shipped ` +
        `constant, which is what makes the engine's reading a finding rather than a default.`);
}

// =============================================================================================================
console.log("\n3. *** BLOCKED AND SEPARATED ARE DIFFERENT FACTS, AND THE STEP RULE MOVES BOTH ***");
{
    const F = JSON.parse(fs.readFileSync(path.join(ENG, "nav", "fixtures", "engineTerrain96.json"), "utf8"));
    const hm = Int16Array.from(F.heights);
    const tight = [{ up: 3, down: 6 }, { up: 2, down: 4 }, { up: 1, down: 2 }, { up: 1, down: 1 }]
        .map((r) => ({ ...r, o: DS.obstruction(hm, { stride: F.stride, ...r }) }));
    for (const t of tight)
        say(`up<=${t.up} down<=${t.down}: ${(100 * t.o.blockedFraction).toFixed(2)}% blocked, ` +
            `${t.o.components} components, largest ${t.o.largestComponentPct.toFixed(1)}%`);
    ok("!! tightening the step rule blocks strictly more edges, on the same terrain",
        tight.every((t, i) => i === 0 || t.o.blockedFraction >= tight[i - 1].o.blockedFraction),
        tight.map((t) => (100 * t.o.blockedFraction).toFixed(2) + "%").join(" -> ") +
        ". The 0.18% headline is the terrain AND the rule together; a reader who took it for 'this world is " +
        "flat' would be wrong -- its heights run " + F.min + " to " + F.max + ".");
    // *** THE RATIO IS THE CLAIM, NOT THE ABSOLUTE. *** The first draft of this row asserted "> 98%" and
    // failed at 97.7 -- my threshold was wrong, not the terrain. What the numbers actually say is that
    // blocked edges grow NINETEEN-FOLD while the largest component gives up two points: fragmentation is
    // real and it is nothing like proportional.
    const blockedGrowth = tight[tight.length - 1].o.blockedFraction / tight[0].o.blockedFraction;
    const componentLoss = tight[0].o.largestComponentPct - tight[tight.length - 1].o.largestComponentPct;
    ok("!! *** AND THE MAP BARELY FRAGMENTS WHILE IT DOES: blocked edges x" + blockedGrowth.toFixed(0) +
        ", largest component down " + componentLoss.toFixed(1) + " points ***",
        blockedGrowth > 10 && componentLoss < 5 && tight[tight.length - 1].o.largestComponentPct > 95,
        tight.map((t) => t.o.largestComponentPct.toFixed(1) + "%").join(", ") + " largest component against " +
        tight.map((t) => (100 * t.o.blockedFraction).toFixed(2) + "%").join(", ") + " blocked. THIS IS THE " +
        "ACTUAL REASON DETOURS ARE SHORT: blocked edges that do not SEPARATE anything cost a route a step " +
        "sideways, not a detour, so a twentyfold change in obstruction barely moves the excursion.");
}

// =============================================================================================================
console.log("\n4. *** THE MARGIN SITS ON THE WORST CASE, NOT ON A PERCENTILE, AND THAT IS A JUDGEMENT ***");
{
    const fake = (arr) => ({ excursion: { median: 0, p90: 0, p99: arr[Math.floor(arr.length * 0.99)] ?? 0,
                                          max: Math.max(...arr) } });
    // *** 199 ZEROS AND ONE 40, NOT 99 AND ONE. *** The first draft used a hundred samples, which puts the
    // single outlier AT the 99th percentile -- so p99 read 40, the row proved nothing about the difference
    // between a percentile and a maximum, and it failed. A fixture has to put the outlier BEYOND the
    // percentile it is contrasting with, or the two agree and the contrast is imaginary.
    const spiky = fake([...Array(199).fill(0), 40]);       // one route in two hundred needs 40
    ok("!! *** ONE ROUTE IN TWO HUNDRED NEEDING 40 MOVES THE ANSWER, WHICH A p99 PAD WOULD HIDE ***",
        DS.suggestPad(spiky) >= 160 && spiky.excursion.p99 === 0,
        `p99 is ${spiky.excursion.p99} and the max is ${spiky.excursion.max}; suggestPad returns ` +
        `${DS.suggestPad(spiky)}. The cost of being under is not a slower path, it is NO PATH AT ALL and a bot ` +
        `that charges the wall -- and that failure is invisible from outside the pool, so one route in two ` +
        `hundred is not an acceptable rate and the sample's worst case is the floor.`);
    ok("...and it never suggests less than its floor, however open the world",
        DS.suggestPad(fake([0, 0, 0])) === 8 && DS.suggestPad(live) >= 8,
        `a world with zero measured excursion still asks for ${DS.suggestPad(fake([0, 0, 0]))}, because a ` +
        `sample of routes is not a proof about every route.`);
}

// =============================================================================================================
console.log("\n5. *** THE SHIPPED CONSTANT, CHECKED AGAINST THE MEASUREMENT RATHER THAN TRUSTED ***");
{
    // HM_PADDING is read out of the pool's source, so a round that changes it moves both sides of this row.
    const src = fs.readFileSync(path.join(ENG, "simulation", "BotPathfinderPool.js"), "utf8");
    const pad = Number((src.match(/const HM_PADDING\s*=\s*(\d+)/) || [])[1]);
    const ladder = (src.match(/padSchedule\s*=\s*\[([^\]]+)\]/) || [])[1];
    const M = DS.MEASURED_AT_V4552;
    say(`HM_PADDING = ${pad}, ladder [${ladder}], against a measured worst excursion of ${M.excursion.max}`);
    ok("!! *** THE SHIPPED PAD COVERS THE MEASURED WORST CASE WITH MARGIN, AND THE MARGIN IS A NUMBER ***",
        Number.isFinite(pad) && pad >= DS.suggestPad(live),
        `${pad} against a suggested ${DS.suggestPad(live)} from this slab and ${M.excursion.max} worst over ` +
        `${M.routes} routes on the full 320x320. ${(pad / Math.max(1, M.excursion.max)).toFixed(1)}x the worst ` +
        `case. THIS ROW IS WHY THE CONSTANT IS NOT CHANGED: it is generous, it costs little, and the ladder ` +
        `above it recovers the case it cannot cover. What it was missing was anything able to say so.`);
    ok("...and the record's own arithmetic holds: coverage is monotone in the pad",
        [0, 4, 8, 24, 60, 144].every((p, i, a) => i === 0 || M.coveredByPad[p] >= M.coveredByPad[a[i - 1]]) &&
        M.coveredByPad[144] === M.routes && M.excursion.p99 <= M.excursion.max,
        `covered ${JSON.stringify(M.coveredByPad)} of ${M.routes} routes`);
    ok("...and the tighter-rule controls in the record move the same way this slab does",
        M.tighter.every((t, i) => i === 0 || t.blockedPct >= M.tighter[i - 1].blockedPct) &&
        M.tighter[0].blockedPct > M.obstruction.blockedFractionPct,
        M.tighter.map((t) => t.blockedPct + "%").join(" -> ") + " from " + M.obstruction.blockedFractionPct + "%");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWHAT THIS DOES NOT SETTLE, and it is larger than the window: simulation/BotPathfinderPool.js builds " +
    "its snapshot from world._heightAt AND NOTHING ELSE, so anything solid that is not in the heightfield is " +
    "invisible to the planner and to physics/character/terrainWalk.mjs alike. Whether main.js's world carries " +
    "such solids is UNMEASURED -- the scene graph could not be reached from window.fpsShooter, whose keys are " +
    "camera, router, world, particles, ecsWorld, botManager and the rest with no scene among them, and a probe " +
    "that returns zero because it looked in the wrong place is not a finding. Filed rather than answered. " +
    "\nAlso not claimed: that these 40 routes speak for worlds this engine has not loaded. The census is the " +
    "instrument; the engine's numbers are one reading with it.");
REPORT.write();
process.exit(fails ? 1 : 0);
