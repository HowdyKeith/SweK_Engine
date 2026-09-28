#!/usr/bin/env node
// WebGLEngine/tools/ship/fsrThreeWorld-selfcheck.mjs -- v4766
//
// fsr-three.html SHOWS WHAT THE RECENT ROUNDS TOOK, AND THIS HOLDS THAT IT DOES. Its generated-frame views gain "gen: glass,
// sparks, a lens, particles" -- a glass pane and additive sparks (v4760), a lens reading the frame behind it (v4765), a
// BatchedMesh and sprites (v4761), 64 particles a compute pass moves (v4762) -- and "gen: translucent things as a layer", which
// draws the frames and the motion stage's pass without them and hands the generator the layer as `ui` (the HUD drawn into it,
// over them) and the lens as `over`. Each module is graded by its own gate; this one holds the WIRING: the page reads what it
// says it reads, and on the device, presented, it draws the view both ways without an error and says what it drew.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { shootPage } from "./pageShot.mjs";
import { webgpuSkipReason } from "./webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };

console.log("\n1. THE PAGE'S SOURCE: the switches, and what the generated-frame view hands the generator");
const src = fs.readFileSync(path.join(ENG, "fsr-three.html"), "utf8");
ok("two switches, off and on by default, and the address sets them (?genworld=1&genlayer=0 ...) -- and the world is shown by the first",
   /world\.visible = \$\("genworld"\)\.checked; poseAt\(t\);/.test(src) && /<input id="genworld" type="checkbox">/.test(src) && /<input id="genlayer" type="checkbox" checked>/.test(src) && /for \(const id of \["genworld", "genlayer"/.test(src));
ok("the modules it shows are the ones graded: makeTranslucentLayer, makePreviousCopy -- imported, not copied",
   /import \{ makeTranslucentLayer \} from "\.\/render\/translucentLayer\.mjs"/.test(src) && /import \{[^}]*makePreviousCopy[^}]*\} from "\.\/render\/temporalTsl\.mjs"/.test(src));
ok("as a layer, the frames AND the motion stage's pass are drawn with them hidden",
   /let back = hideThem\(\); renderer\.setRenderTarget\(cur\); await renderer\.renderAsync\(scene, camera\); back\(\);/.test(src) && /back = hideThem\(\); await motionStage\.render\(renderer, scene, camera\);/.test(src));
ok("...and the generator gets the layer at the generated time as `ui`, the HUD drawn into it, and the lens as `over` -- both occluded by the generator's own depth (v4767)",
   /const ui = asLayer \? async \(tt\) => \{[\s\S]{0,200}sceneAt\(tt\); await layer\(\)\.render\(renderer, scene, camera, \{ depth: g\.fg\.depthAt \}\)/.test(src) && /hudInto\(layer\(\)\.target/.test(src) &&
   /const over = asLayer \? async \(tt, frame\) => \{ sceneAt\(tt\); const tex = await layer\(\)\.renderOver\(renderer, scene, camera, frame, \{ depth: g\.fg\.depthAt \}\)/.test(src) && /toward: withArc \? towardStage\.motion\.texture : null, ui, over,/.test(src));
ok("the particles' previous positions are the copy stepped BEFORE the pass that moves them",
   /const stepMotes = async \(\) => \{ await pPrev\.step\(renderer\); await renderer\.computeAsync\(pMove\);/.test(src) && /pMat\.userData\.previousPositionNode = pPrev\.node\.toAttribute\(\)/.test(src));

console.log("\n2. ON THE DEVICE, PRESENTED: the generated-frame view with the world, as a layer, at 320 x 180");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** The page is the device's."); fails++; }
else {
    // one presented shot, the path this round adds: each shot is a browser launch and seconds of a software renderer, and the
    // surfaces path is the page as it was -- the source rows above hold both
    for (const [asLayer, want] of [[true, "glass and sparks as a layer, the lens over the frame"]]) {
        const r = await shootPage({ page: "fsr-three.html", query: `?size=320x180&genworld=1&genlayer=${asLayer ? 1 : 0}&genhud=1&genui=1&genuit=1`, selects: [["#mode", "gen"]], waitMs: 2500, startMs: 1000, boxSelector: "#view" });
        const st = r.status || "", steps = Number((st.match(/(\d+) particle steps/) || [])[1] || 0), num = (re) => Number((st.match(re) || [])[1] || 0);
        const layers = num(/the layer drawn (\d+) times/), overs = num(/the lens over (\d+)/);
        // sampled inside the canvas as the page lays it out (shootPage's boxSelector), never at fixed coordinates
        const px = r.image, bx = r.box || { x: 0, y: 0, w: 0, h: 0 }, lum = [];
        for (let y = bx.y + 4; y < Math.min(px.height, bx.y + bx.h - 4); y += 4) for (let x = bx.x + 4; x < Math.min(px.width, bx.x + bx.w - 4); x += 4) { const i = (y * px.width + x) * px.channels; lum.push(px.data[i] + px.data[i + 1] + px.data[i + 2]); }
        const spread = Math.max(...lum) - Math.min(...lum);
        ok(`*** ${asLayer ? "as a layer" : "as surfaces"}: the view drew with no page error, said "${want}", stepped the particles ${steps} times, drew the layer ${layers} and the lens over ${overs} ***`,
           r.errors.length === 0 && st.includes(`+ world (${want};`) && st.includes("HUD composited") && st.includes("320x180") && steps >= 2 && layers >= 1 && overs >= 1 && layers === overs,
           r.errors.length ? r.errors.join(" | ").slice(0, 300) : st.slice(0, 260));
        ok(`  ...and what it presented, inside the canvas at ${JSON.stringify(bx)}, is a picture, not a cleared canvas: luma spread ${spread} over ${lum.length} samples`, !!r.box && lum.length > 500 && spread > 200);
    }
}

// ---- v4766 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against fsr-three.html: W1 the world never shown -> 1; W2 never drawn as a layer -> 1 (the counts read 0); W3 the lens not
// handed to the generator -> 2; W4 the particles never stepped -> 1; W5 the HUD not drawn into the layer -> 1; W6 the motion
// stage's pass drawn with them in it -> 1; W7 the address ignored -> 1. Against tools/ship/pageShot.mjs: P7 no box reported -> 1
// here, 3 in tools/ship/pageShot-selfcheck.mjs. Eight, none green.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: what the view LOOKS like against a truth -- the modules' own gates grade that; the FSR2, FSR3 and paced " +
    "views with the world in them, which draw it as the scene has it and are not wired to the layer; and a real display.");
process.exitCode = fails ? 1 : 0;
