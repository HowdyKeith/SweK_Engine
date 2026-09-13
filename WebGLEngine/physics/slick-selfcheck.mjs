// WebGLEngine/physics/slick-selfcheck.mjs -- v4590
//
// Run: node physics/slick-selfcheck.mjs
//
// THE SIBLING GATE OF physics/slick.mjs: the patch (where a drop lands, what it contains, the reload, the cap per car), the wrapped
// surface (oil cuts the grip and the rolling resistance under it and nothing else; fire is hot road), the fire (an automaton per
// lit patch that burns for the source's feed and then out on its own schedule, the burn events for a car standing in it, the cells
// with their palette colours inside the patch), and the lockstep hash. Pure: no box3d, a flat surface and a pose.
//
// SABOTAGE LOG -- v4590 (each against physics/slick.mjs, gate restored after):
//   A. dropSlick lands the patch AHEAD of the car (+ fx * behind)      -> 4 red: both drop rows, containment, newest-wins
//   B. inPatch's frame rotation with the sign flipped                    -> FINDING: 0 red on the containment row (an axis-aligned patch
//      at yaw 0 / pi/2 is symmetric under the flip; only the fire-cells row saw it) -> the oblique-patch row (yaw 0.7) added; now 2 red
//   C. oil leaves the rolling resistance alone                           -> 1 red: the oil multipliers row
//   D. the source row is never extinguished                             -> 3 red: burn length (5000 ticks), burn events, spent removed
//   E. slickHash folds only the patch count                              -> FINDING: 0 red (a drop one tick later already changes the count
//      per tick) -> the same-count row added: lit ten ticks later / dropped a metre over must differ; now 1 red
//   F. the reload refuses the drop AT the reload tick (<=)                -> 2 red: reload row, cap row
//   G. a burning patch keeps the oil grip                                -> 1 red: the hot-road row
//   H. slickHash skips the heat                                          -> FINDING: 0 red (ignitedAt still folded) -> the stepped-flames
//      row added: the same patch with its automaton stepped once more must differ; now 1 red
// The gate's own first run was red on the burn-events row: the fire steps BEFORE the burn check, so the tick that burns it out hands out
// no event (393 events over 394 ticks). The row now counts the ticks still lit after the step, which is what the module's front door counts.
"use strict";
import * as S from "./slick.mjs";
import { flatSurface, foldHash, CAR } from "./raceCar.mjs";
import { PALETTE } from "../render/doomFire.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const poseAt = (x, z, yaw) => ({ pos: [x, 1, z], yaw, quat: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)], vel: [0, 0, 0] });
console.log("slick-selfcheck -- the oil slick and the Doom Fire on it\n");

console.log("1. THE PATCH: BEHIND THE CAR, ALONG ITS YAW, ON A RELOAD, CAPPED PER CAR");
{
    const st = S.createSlicks(), p0 = S.dropSlick(st, poseAt(0, 0, 0), 0, 0);
    ok("!! a car facing +z drops its patch SLICK.behind metres behind it, aligned with the car", near(p0.x, 0) && near(p0.z, -S.SLICK.behind) && near(p0.yaw, 0) && p0.owner === 0 && p0.born === 0 && p0.fire === null, `at ${p0.x.toFixed(2)}, ${p0.z.toFixed(2)}`);
    const s1 = S.createSlicks(), p1 = S.dropSlick(s1, poseAt(5, 5, Math.PI / 2), 1, 10);
    ok("...and a car facing +x (yaw pi/2) drops it behind along -x", near(p1.x, 5 - S.SLICK.behind) && near(p1.z, 5) && near(Math.abs(p1.yaw), Math.PI / 2, 1e-12));
    const hw = S.SLICK.width / 2, hl = S.SLICK.length / 2;
    ok("!! containment is the patch's own frame: inside up to half its length along the car and half its width across, not a step past", S.inPatch(p1, p1.x + hl - 0.01, p1.z) && !S.inPatch(p1, p1.x + hl + 0.01, p1.z) && S.inPatch(p1, p1.x, p1.z + hw - 0.01) && !S.inPatch(p1, p1.x, p1.z + hw + 0.01) && S.inPatch(p0, 0.5, -S.SLICK.behind - 1.5) && !S.inPatch(p0, 1.0, -S.SLICK.behind));
    // an axis-aligned patch cannot tell the frame's handedness (sabotage B went 0 red on yaw 0 and pi/2): an oblique one can
    const yo = 0.7, po = S.dropSlick(S.createSlicks(), poseAt(2, -3, yo), 0, 0), fwd = [Math.sin(yo), Math.cos(yo)], right = [Math.cos(yo), -Math.sin(yo)], d = hl - 0.05;
    ok("!! ...and an oblique patch (yaw 0.7) holds a point along the car's forward at nearly half its length and refuses the same distance across it", S.inPatch(po, po.x + fwd[0] * d, po.z + fwd[1] * d) && S.inPatch(po, po.x - fwd[0] * d, po.z - fwd[1] * d) && !S.inPatch(po, po.x + right[0] * d, po.z + right[1] * d) && S.inPatch(po, po.x + right[0] * (hw - 0.05), po.z + right[1] * (hw - 0.05)));
    ok("a second drop inside the reload is refused (null); after it, allowed", S.dropSlick(st, poseAt(0, 0, 0), 0, S.SLICK.dropReloadTicks - 1) === null && S.dropSlick(st, poseAt(3, 0, 0), 0, S.SLICK.dropReloadTicks) !== null && st.patches.length === 2);
    const s2 = S.createSlicks(); for (let k = 0; k <= S.SLICK.maxPerCar; k++) S.dropSlick(s2, poseAt(k * 10, 0, 0), 0, k * S.SLICK.dropReloadTicks);
    S.stepSlicks(s2, [], (S.SLICK.maxPerCar + 1) * S.SLICK.dropReloadTicks);
    ok("the fifth unlit drop of one car spends its oldest: maxPerCar patches remain, the first gone", s2.patches.length === S.SLICK.maxPerCar && !s2.patches.some((p) => p.x === 0));
    const s3 = S.createSlicks(), a = S.dropSlick(s3, poseAt(0, 0, 0), 0, 0), b = S.dropSlick(s3, poseAt(0.4, 0, 0), 1, 0);
    ok("the newest patch wins where two overlap", S.patchAt(s3, 0.2, -S.SLICK.behind) === b && a !== b);
}
console.log("\n2. THE SURFACE IS WRAPPED, NOT REWRITTEN");
{
    const st = S.createSlicks(), base = flatSurface(), surf = S.slickSurface(base, st), p = S.dropSlick(st, poseAt(0, 0, 0), 0, 0);
    const g = surf.at(p.x, p.z), g0 = surf.at(40, 40), gb = base.at(p.x, p.z);
    ok("!! under oil the kind is 'oil' and the grip and the rolling resistance are the road's times SLICK.grip / rolling; the height is untouched", g.kind === S.KIND_OIL && near(g.grip, gb.grip * S.SLICK.grip) && near(g.rolling, gb.rolling * S.SLICK.rolling) && g.y === gb.y, `grip ${g.grip.toFixed(3)} of ${gb.grip}`);
    ok("...and off the patch the base surface answers unchanged", g0.kind === "asphalt" && g0.grip === CAR.grip.asphalt && surf.along(1, 2).s === base.along(1, 2).s);
    S.igniteSlick(st, 0, 0); const gf = surf.at(p.x, p.z);
    ok("!! a burning patch is hot road: kind 'fire' with the road's own grip back", gf.kind === S.KIND_FIRE && gf.grip === gb.grip && gf.rolling === gb.rolling);
}
console.log("\n3. THE FIRE: AN AUTOMATON PER LIT PATCH, FED FOR SLICK.fire.burn SECONDS, THEN OUT ON ITS OWN SCHEDULE");
{
    const st = S.createSlicks(), pose = poseAt(0, 0, 0), p = S.dropSlick(st, pose, 0, 0);
    ok("ignite with no patch of one's own is null; the owner's newest unlit patch is what lights", S.igniteSlick(st, 1, 0) === null && S.igniteSlick(st, 0, 0) === p && p.fire && p.ignitedAt === 0 && S.isBurning(p));
    ok("...and it cannot be lit twice: the next ignite finds no unlit patch", S.igniteSlick(st, 0, 1) === null);
    const inside = [{ index: 1, pose: poseAt(p.x, p.z, 0) }], outside = [{ index: 2, pose: poseAt(p.x + 5, p.z, 0) }];
    let ticks = 0, lit = 0, burnIn = 0, burnOut = 0, feed = Math.round(S.SLICK.fire.burn / CAR.dt);
    // the fire steps BEFORE the burn check each tick, so the tick that burns it out hands out no event: events = ticks still lit after the step
    for (let t = 0; t < 5000 && S.isBurning(p); t++) { const r = S.stepSlicks(st, [...inside, ...outside], t); burnIn += r.events.filter((e) => e.car === 1).length; burnOut += r.events.filter((e) => e.car === 2).length; ticks++; if (S.isBurning(p)) lit++; }
    report(`burned ${ticks} ticks (${(ticks / 60).toFixed(2)} s) against a feed of ${feed}; lit after the step on ${lit}; burn events: inside ${burnIn}, outside ${burnOut}`);
    ok("!! the patch burns for the feed and then some (the flames climb off the grid), between the feed and the feed plus rows x stepEvery x 3", ticks > feed && ticks < feed + S.SLICK.fire.rows * S.SLICK.fire.stepEvery * 3, `${ticks} ticks`);
    ok("!! a car standing in the burning patch takes a burn event on every tick the patch is still lit after the step (one fewer than the ticks: the last step burns it out); one 5 m away takes none", burnIn === lit && lit === ticks - 1 && burnIn > feed && burnOut === 0, `${burnIn} of ${ticks}`);
    ok("...and the spent patch is removed", st.patches.length === 0);
    const s2 = S.createSlicks(), q = S.dropSlick(s2, poseAt(3, 4, 0.7), 0, 0); S.igniteSlick(s2, 0, 0); for (let t = 0; t < 15; t++) S.stepSlicks(s2, [], t);
    const cells = S.fireCells(q), colours = new Set(PALETTE.map((c) => c.join()));
    ok("!! the burning cells sit inside the patch, carry palette colours, and there are several after a few steps", cells.length > 5 && cells.every((c) => S.inPatch(q, c.x, c.z) && c.intensity > 0 && colours.has(c.colour.map((v) => Math.round(v * 255)).join())), `${cells.length} cells`);
    ok("an unlit patch has no cells", S.fireCells(S.dropSlick(S.createSlicks(), poseAt(0, 0, 0), 0, 0)).length === 0);
    const s4 = S.createSlicks(); S.dropSlick(s4, poseAt(0, 0, 0), 0, 0); for (let t = 0; t < S.SLICK.life * 60 + 1; t++) S.stepSlicks(s4, [], t);
    ok("an unlit patch expires after SLICK.life seconds", s4.patches.length === 0);
}
console.log("\n4. THE LOCKSTEP HASH");
{
    const run = (dropAt, igniteAt = dropAt, x = 0) => { const st = S.createSlicks(); let h = 0x811c9dc5; for (let t = 0; t < 400; t++) { if (t === dropAt) S.dropSlick(st, poseAt(x, 0, 0), 0, t); if (t === igniteAt) S.igniteSlick(st, 0, t); S.stepSlicks(st, [], t); h = S.slickHash(h, st, foldHash); } return (h >>> 0).toString(16); };
    ok("!! the same drops give the same hash; a drop one tick later is a different fingerprint", run(10) === run(10) && run(10) !== run(11), `${run(10)} vs ${run(11)}`);
    // the same patch count every tick, differing only in the flames or the pose (sabotage E folded only the count and went 0 red on the row above)
    ok("!! ...and so is the same drop lit ten ticks later, or dropped one metre over: the fold reaches the fire and the pose, not just the count", run(10, 10) !== run(10, 20) && run(10, 10, 0) !== run(10, 10, 1), `${run(10, 20)} / ${run(10, 10, 1)}`);
    // two peers with the same ignition tick and a different automaton state (sabotage H dropped the heat fold and went 0 red above)
    const twin = () => { const st = S.createSlicks(); const p = S.dropSlick(st, poseAt(0, 0, 0), 0, 0); S.igniteSlick(st, 0, 0); for (let t = 0; t < 30; t++) S.stepSlicks(st, [], t); return { st, p }; };
    const t1 = twin(), t2 = twin(); t2.p.fire.step();
    ok("!! ...and the flames themselves: the same patch with its automaton stepped once more is a different fingerprint", S.slickHash(0x811c9dc5, t1.st, foldHash) !== S.slickHash(0x811c9dc5, t2.st, foldHash) && t1.p.fire.heat() !== t2.p.fire.heat());
}
console.log("\n5. THE FRONT DOOR");
{
    const L = S.reportLines();
    ok("reportLines names the patch, the multipliers, the automaton and the measured burn", L.length === 4 && /grip x 0.3/.test(L[1]) && /burns for \d+ ticks/.test(L[2]));
}
console.log(fails ? `\nslick-selfcheck: ${fails} FAILED` : "\nslick-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
