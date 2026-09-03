// WebGLEngine/tools/ship/shipyard-selfcheck.mjs
//
// Run: node tools/ship/shipyard-selfcheck.mjs   (~25s -- MEASURED, most of it the live page)
//
// v4388 -- VALKYRIEN SKIES 2's SHIPYARD, MEASURED AGAINST THIS ENGINE RATHER THAN ADMIRED.
//
// Keith raised ValkyrienSkies/Valkyrien-Skies-2. Its central trick is that a moving structure's blocks are not
// stored where the structure appears: they stay axis-aligned on the integer grid in a ChunkClaim millions of
// blocks from spawn, and every interaction is transformed BACK into that space and answered there.
//
// *** THE ROUND SET OUT TO CONFIRM A PRECISION ARGUMENT AND THE MEASUREMENT REFUSED IT. *** The written
// prediction was that transforming the DATA each frame ("bake") would accumulate error until a ray hit the
// wrong voxel, somewhere before ten thousand motions. Section 3 runs exactly that and it does not happen: after
// 10,000 cumulative rigid motions the baked geometry is 1.9e-12 of a voxel away from truth, twelve orders below
// mattering. IN FLOAT64 THE SHIPYARD BUYS NO PRECISION AT ALL, and this file says so as a measured number so
// nobody re-derives the folklore.
//
// *** WHAT IT DOES BUY IS FLOAT32 AT DISTANCE, WHICH IS THIS ENGINE'S SITUATION AND NOT MINECRAFT'S. *** Section
// 4 stores the same body as float32 -- what a vertex buffer holds -- and moves it out along +X. World-baked, the
// worst voxel centre is off by 0.045 of a voxel at ten thousand, 0.28 at a hundred thousand and 2.6 VOXELS at a
// million. Claim-local, it is off by ZERO at every distance, because every integer and half-integer in 0..8192
// is exactly representable in float32 and nothing ever rewrites them. The trick is not about time; IT IS ABOUT
// ADDRESS, and Minecraft's float64 server would never have shown it.
//
// THREE OF THE FOUR WRITTEN PREDICTIONS WERE WRONG AND THE FOURTH WAS RIGHT FOR A WEAKER REASON THAN STATED;
// each is named at the check that refuted it rather than summarised here.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin } from "./webgpuHarness.mjs";
import { noComments } from "./sourceScan.mjs";
import * as SY from "../../voxel/shipyard.mjs";
import { traverseDDA } from "../../voxel/voxelDDA.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

// One body, built once, used by every section: an 8 x 8 x 8 cube of solid voxels in claim-local space.
const N = 8;
const isSolid = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < N && y < N && z < N;
const CENTRES = [];
for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) CENTRES.push([x + 0.5, y + 0.5, z + 0.5]);

let seed = 12345;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const smallQ = () => { const a = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1], m = Math.hypot(...a) || 1, h = 0.003;
    return [a[0] / m * Math.sin(h), a[1] / m * Math.sin(h), a[2] / m * Math.sin(h), Math.cos(h)]; };

/* ------------------------------------------------------------------------------------------------------------
 * 1. THE ROUND TRIP -- world -> claim-local -> world, at poses a body actually reaches
 * --------------------------------------------------------------------------------------------------------- */
{
    let worst = 0, worstAt = null;
    for (let i = 0; i < 400; i++) {
        const po = SY.pose({ id: i % 64, position: [rnd() * 2e4 - 1e4, rnd() * 500, rnd() * 2e4 - 1e4],
                             quaternion: [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1] });
        const p = [rnd() * SY.CLAIM_SPAN, rnd() * SY.CLAIM_SPAN, rnd() * SY.CLAIM_SPAN];
        const back = SY.worldToLocal(SY.localToWorld(p, po), po);
        for (let c = 0; c < 3; c++) { const e = Math.abs(back[c] - p[c]); if (e > worst) { worst = e; worstAt = po.position[0]; } }
    }
    // PREDICTED "under 1e-9 at a claim origin of a few tens of thousands" AND THAT ONE HELD, with room: the
    // quaternion sandwich is inverted by a conjugate rather than by solving anything, so nothing is lost twice.
    ok("!! *** a world point survives the trip into claim-local space and back ***", worst < 1e-9,
       `worst error ${worst.toExponential(3)} over 400 random poses and points across a full claim span of ` +
       `${SY.CLAIM_SPAN}, at world positions out to 1e4 (worst at x=${worstAt && worstAt.toFixed(0)}). THE INVERSE ` +
       "IS A CONJUGATE, not a solve, so the two directions are the same arithmetic run backwards");
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. THE SOLIDITY FUNCTION NEVER LEARNS THAT THE BODY MOVED -- which is the whole indirection
 * --------------------------------------------------------------------------------------------------------- */
{
    const seen = [];
    const watched = (x, y, z) => { seen.push([x, y, z]); return isSolid(x, y, z); };
    const po = SY.pose({ id: 5, position: [-320.5, 44.25, 900.75], quaternion: [0.3, 0.5, 0.2, 0.8] });
    let wrong = 0, tested = 0;
    for (const [tx, ty, tz] of [[0, 0, 0], [7, 7, 7], [3, 4, 5], [0, 7, 3], [7, 0, 4], [4, 4, 0]]) {
        const target = SY.localToWorld([tx + 0.5, ty + 0.5, tz + 0.5], po);
        const from = SY.localToWorld([tx + 0.5, ty + 0.5, tz + 0.5 - 60], po);
        const hit = SY.raycast(from, [target[0] - from[0], target[1] - from[1], target[2] - from[2]], po, watched, 512, traverseDDA);
        tested++;
        if (!hit.hit || hit.vx !== tx || hit.vy !== ty) wrong++;
    }
    const integral = seen.every((v) => v.every((k) => Number.isInteger(k)));
    ok("!! *** every coordinate the body's storage is asked about is a CLAIM-LOCAL INTEGER ***",
       integral && seen.length > 0,
       `${seen.length} lookups across ${tested} world rays, all integer. A caller's voxel store has no way to ` +
       "learn that its body has a pose at all -- which is why the world's own marcher answers a moving body " +
       "unchanged, and why every system that assumes an axis-aligned grid keeps working");
    ok("...and the world ray finds the voxel the world point belongs to", wrong === 0,
       `${wrong} of ${tested} rays landed on the wrong voxel. The DIRECTION is rotated and never translated, ` +
       "which is the commonest way to write this wrong and reads correct on the page");
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. THE PRECISION ARGUMENT, IN FLOAT64 -- AND IT DOES NOT HOLD. A written prediction, refuted.
 * --------------------------------------------------------------------------------------------------------- */
let f64Drift = 0;
{
    const po0 = SY.pose({ id: 3, position: [120.5, -40.25, 77.75] });
    let po = po0, baked = CENTRES.map((c) => SY.localToWorld(c, po0));
    const frozen = CENTRES.map((c) => [...c]);
    for (let k = 0; k < 10000; k++) {
        const dq = smallQ(), dp = [rnd() * 0.02 - 0.01, rnd() * 0.02 - 0.01, rnd() * 0.02 - 0.01];
        const prev = po.position, step = SY.pose({ id: 3, position: [0, 0, 0], quaternion: dq });
        baked = baked.map((b) => { const r = SY.localToWorld([b[0] - prev[0], b[1] - prev[1], b[2] - prev[2]], step);
                                   return [r[0] + prev[0] + dp[0], r[1] + prev[1] + dp[1], r[2] + prev[2] + dp[2]]; });
        po = SY.advance(po, { deltaQuaternion: dq, deltaPosition: dp });
    }
    for (let i = 0; i < CENTRES.length; i++) { const t = SY.localToWorld(CENTRES[i], po);
        for (let c = 0; c < 3; c++) f64Drift = Math.max(f64Drift, Math.abs(baked[i][c] - t[c])); }
    let gridDrift = 0;
    for (let i = 0; i < frozen.length; i++) for (let c = 0; c < 3; c++) gridDrift = Math.max(gridDrift, Math.abs(frozen[i][c] - CENTRES[i][c]));

    ok("!! *** the shipyard grid is BIT-IDENTICAL after 10,000 motions, because nothing writes to it ***",
       gridDrift === 0, `drift ${gridDrift} -- exactly zero, not small. The pose accumulates the error and is ` +
       "renormalised each step, which is a bounded correction on four numbers; a moved voxel centre has nothing " +
       "to be renormalised back to");
    // *** THE PREDICTION WRITTEN BEFORE THIS RAN: "somewhere before K = 1000 a ray that should hit voxel
    // (x,y,z) hits a neighbour". IT IS NOWHERE NEAR. *** The check is therefore the opposite of the one
    // intended -- it asserts the argument's FAILURE, so that a later round cannot quietly reinstate it.
    ok("!! *** and the BAKE alternative does NOT break in float64 -- the prediction this round wrote down was wrong ***",
       f64Drift < 1e-9,
       `after 10,000 cumulative rigid motions the baked geometry is ${f64Drift.toExponential(3)} of a voxel from ` +
       "truth. TWELVE ORDERS BELOW MATTERING. A round that wanted the shipyard to be a float64 precision win " +
       "would have quoted the drift growing and stopped there; it grows as roughly the square root of the motion " +
       "count from 2.8e-14, and never arrives. THE ARGUMENT FOR THIS DESIGN IS NOT HERE");
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. AND HERE IT IS -- FLOAT32 AT DISTANCE, WHICH IS WHAT A VERTEX BUFFER HOLDS
 * --------------------------------------------------------------------------------------------------------- */
const F32 = [];
{
    const f = Math.fround, f3 = (v) => [f(v[0]), f(v[1]), f(v[2])];
    for (const D of [0, 1e3, 1e4, 1e5, 1e6, 4e6, 8.4e6]) {
        seed = 999;
        let po = SY.pose({ id: 0, position: [D, 0, 0] });
        let baked = CENTRES.map((c) => f3(SY.localToWorld(c, po)));
        for (let k = 0; k < 2000; k++) {
            const dq = smallQ(), dp = [rnd() * 0.02 - 0.01, rnd() * 0.02 - 0.01, rnd() * 0.02 - 0.01];
            const prev = po.position, step = SY.pose({ id: 0, position: [0, 0, 0], quaternion: dq });
            baked = baked.map((b) => { const r = SY.localToWorld([b[0] - prev[0], b[1] - prev[1], b[2] - prev[2]], step);
                                       return f3([r[0] + prev[0] + dp[0], r[1] + prev[1] + dp[1], r[2] + prev[2] + dp[2]]); });
            po = SY.advance(po, { deltaQuaternion: dq, deltaPosition: dp });
        }
        let bake = 0, local = 0;
        for (let i = 0; i < CENTRES.length; i++) { const t = SY.localToWorld(CENTRES[i], po);
            for (let c = 0; c < 3; c++) bake = Math.max(bake, Math.abs(baked[i][c] - t[c])); }
        for (const c of CENTRES) { const q = f3(c); for (let i = 0; i < 3; i++) local = Math.max(local, Math.abs(q[i] - c[i])); }
        F32.push({ D, spacing: SY.f32Spacing(D || 1), bake, local });
    }
    for (const r of F32) say(`world x ${String(r.D).padStart(9)}  f32 spacing ${String(r.spacing).padStart(22)}  ` +
        `world-baked error ${r.bake.toExponential(3)} voxels   claim-local error ${r.local}`);

    ok("!! *** stored world-baked in float32, a body a million voxels out is wrong by WHOLE VOXELS ***",
       F32.find((r) => r.D === 1e6).bake > 1 && F32.find((r) => r.D === 1e4).bake < 0.1,
       `0.045 of a voxel at ten thousand, ${F32.find((r) => r.D === 1e5).bake.toFixed(3)} at a hundred thousand, ` +
       `${F32.find((r) => r.D === 1e6).bake.toFixed(2)} VOXELS at a million -- after the same 2,000 motions that ` +
       "cost float64 nothing. It is not the motions: it is the ADDRESS. The spacing between representable " +
       "float32 values grows with the coordinate, and a stored world position pays it on every voxel");
    ok("!! *** stored claim-local in float32, the same body is EXACT at every distance ***",
       F32.every((r) => r.local === 0),
       "zero at 0, 1e3, 1e4, 1e5, 1e6, 4e6 and 8.4e6. Every integer and half-integer in 0..8192 is exactly " +
       "representable in float32 (spacing there is 2^-10), the coordinates are never rewritten, and THE CLAIM " +
       "ADDRESS IS NEVER A VERTEX -- the mesh goes to the GPU local, with the pose as a uniform. That is the " +
       "whole reason a shipyard can sit millions of blocks out and cost nothing");
}

/* ------------------------------------------------------------------------------------------------------------
 * 5. THE CLAIM ARITHMETIC -- and two more predictions off by exactly one binade
 * --------------------------------------------------------------------------------------------------------- */
{
    // PREDICTED 1024 claims at whole-voxel resolution and 64 at a sixteenth. MEASURED 2047 and 127 -- each one
    // binade out, because "spacing <= 2^-4" needs the exponent <= 19, so x < 2^20 rather than x <= 2^19. AND THE
    // PREDICTION'S WORDING WAS WRONG TOO: it said float32 "cannot represent" a boundary at 2^23. Integers are
    // exact in float32 all the way to 2^24; what dies at 2^23 is every position BETWEEN two boundaries.
    const whole = SY.claimsWithinF32(1), sixteenth = SY.claimsWithinF32(1 / 16);
    ok("!! *** the claim count float32 can address, measured rather than reasoned ***",
       whole === 2047 && sixteenth === 127,
       `${whole} claims at whole-voxel spacing and ${sixteenth} at a sixteenth of a voxel, against 1024 and 64 ` +
       "predicted -- one binade out in both. A boundary at 2^23 is still EXACT (integers survive to 2^24); what " +
       "is lost is everything between two boundaries, which is where a click on a face lands");
    const f = Math.fround;
    let bad = 0;
    for (let v = 0; v <= SY.CLAIM_SPAN; v++) { if (f(v) !== v || f(v + 0.5) !== v + 0.5) bad++; }
    ok("...and every voxel corner and centre inside one claim is exact in float32",
       bad === 0, `${bad} of ${SY.CLAIM_SPAN + 1} coordinates lost. THIS IS THE LOAD-BEARING PROPERTY: it is what ` +
       "makes claim-local storage exactly zero-error above, and it holds for the whole span rather than for the " +
       "small numbers somebody spot-checked");
    ok("...and a claim id must be a non-negative integer, refused rather than rounded",
       (() => { try { SY.claimFor(-1); return false; } catch { } try { SY.claimFor(1.5); return false; } catch { } return true; })(),
       "a fractional claim id would overlap two bodies' storage silently, which is the one failure this " +
       "allocator exists to prevent");
    ok("...and raycast REFUSES to be called without the tree's own marcher",
       (() => { try { SY.raycast([0, 0, 0], [0, 0, 1], SY.pose({}), isSolid, 8, null); return false; } catch { return true; } })(),
       "the module owns no traversal. voxel/voxelDDA.js is the one marcher this tree has and it is passed in, " +
       "so a second copy cannot drift from it -- singleSource's rule applied to a function rather than a list");
}

/* ------------------------------------------------------------------------------------------------------------
 * 6. THE PAGE -- LOADED, NOT SCANNED
 *
 * v4386's finding, applied on arrival: two sabotages of a renderer both cost 0 red against a source scan, so
 * this reads the live DOM. AND THE PAGE IS NOT A HOST FOR THE MODULE -- ray-march-demo.html has cast one ray per
 * pixel through voxelDDA since v2782, and the block that used to float in its world grid IS the ship now.
 * --------------------------------------------------------------------------------------------------------- */
{
    const src = fs.readFileSync(path.join(ENG, "ray-march-demo.html"), "utf8");
    ok("!! *** ray-march-demo.html IMPORTS voxel/shipyard.mjs -- a real consumer, not a mention ***",
       noComments(src).includes("/voxel/shipyard.mjs"),
       "checked against the page's CODE with comments stripped, for the reason v4386 established: the ship " +
       "ritual's own sweep closing names every module a round gates, so a mention is exactly what a new module " +
       "gets for free and must never be accepted as a wire");

    const probe = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 90000, script: `
        async () => {
            const f = document.createElement("iframe");
            f.style.width = "1100px"; f.style.height = "900px";
            f.src = "/ray-march-demo.html";
            document.body.appendChild(f);
            await new Promise((r) => { f.onload = r; setTimeout(r, 20000); });
            await new Promise((r) => setTimeout(r, 2500));
            const d = f.contentDocument;
            const shot = () => {
                const c = d.getElementById("c"), g = c.getContext("2d");
                const px = g.getImageData(0, 0, c.width, c.height).data;
                let purple = 0;
                // The ship's colour is the only one in the palette with blue > red > green; fog pulls the
                // absolute values down, so the test is on the ORDERING and not on a threshold somebody guessed.
                for (let i = 0; i < px.length; i += 4) if (px[i + 2] > px[i] && px[i] > px[i + 1] && px[i + 2] > 60) purple++;
                return purple;
            };
            const on = shot();
            const note = (d.getElementById("ship-note").textContent || "").slice(0, 400);
            const box = d.getElementById("ship");
            box.checked = false; box.onchange();
            await new Promise((r) => setTimeout(r, 800));
            const off = shot();
            const noteOff = (d.getElementById("ship-note").textContent || "").slice(0, 200);
            return { on, off, note, noteOff };
        }` });
    if (probe.skipped) {
        say("the live page read was SKIPPED: " + probe.reason + " -- the five sections above still ran");
    } else {
        const r = probe.result || {};
        ok("!! *** the ship is DRAWN, and it disappears when the shipyard is switched off ***",
           r.on > 200 && r.off === 0,
           `${r.on} ship-coloured pixels with the shipyard on and ${r.off} with it off. The block is not in the ` +
           "world's voxelType() any more -- it lives in a claim -- so switching the indirection off removes it " +
           "from the picture entirely. A SOURCE SCAN WOULD PASS ON A PAGE THAT IMPORTED THE MODULE AND DREW NOTHING. " +
           (probe.pageErrors.length ? "PAGE ERRORS: " + probe.pageErrors.join(" | ") : "no page errors"));
        ok("...and the page reports the claim-local error as zero, from the module rather than from a caption",
           /claim-local/i.test(r.note || "") && /\b0\b/.test(r.note || ""),
           `readout: ${JSON.stringify((r.note || "").slice(0, 220))}`);
    }
}

// SABOTAGE LOG -- applied, gate run, exit code read, restored, md5 checked. MEASURED at v4388.
//   AU the ray DIRECTION passed through worldToLocal instead of being rotated alone, so it picks up the body's
//      translation -> exit=1, 2 red: every one of the six aimed rays lands on the wrong voxel, and the page
//      draws nothing. This is the commonest way to write a transformed raycast wrong and it reads correct.
//   AV worldToLocal rotating by the quaternion instead of its conjugate -> exit=1, 3 red, the round trip off by
//      1.8e+4. The two directions are the same arithmetic run backwards, so inverting the wrong one is silent.
//   AW the ship put BACK into the world's voxelType() as well as living in its claim -> exit=1, 1 red: 794
//      ship-coloured pixels with the shipyard on and 590 with it OFF. The check that the body VANISHES when the
//      indirection is switched off is the only one that can tell a real wire from a page drawing its own copy.
//
// AND THE FIRST RUN OF SECTION 6 FOUND A REAL DEFECT IN THE PAGE, NOT IN THE MODULE: zero ship pixels with
// everything correct. The body sat at y = 30 where the old floating block had been, which is 36 degrees off the
// camera's forward axis against a vertical half-FOV of 30 -- CORRECT AND OFF-SCREEN. Found by rendering the
// frame in node and counting, moved to y = 22, and the live DOM now reports 529 ship pixels, the same number.
// A SOURCE CHECK WOULD HAVE CALLED THE OFF-SCREEN VERSION A WORKING PAGE.
//
console.log();
console.log("  ----  WHAT THIS DOES NOT CLAIM. That the shipyard is worth building into this engine's world: it is");
console.log("  ----  one page and one module, and nothing streams, collides or persists through it. That a body's");
console.log("  ----  PHYSICS is answered here -- box3d is untouched and the pose is handed in, not solved. And");
console.log("  ----  that float64 needs it: section 3 measured that it does not, and says so in a check.");
if (fails) { console.log("shipyard-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("shipyard-selfcheck: all checks pass");
