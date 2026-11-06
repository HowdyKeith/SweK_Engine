// WebGLEngine/tools/ship/box3dPages-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/box3dPages-selfcheck.mjs      (about 30 s: three pages in Chromium)
//
// THE THREE box3d PAGES THE ANGULAR-IMPULSE CENSUS FOUND WRONG, FIXED (2026-11-05, Keith: "Let's fix those items you noticed"). The census
// (physics/mechanics/BOX3D_ANGULAR_IMPULSE_CAP_WIP.md) ran the pages in Chromium under a hook on box3d's own angular-impulse export and saw two bugs
// that were not its question:
//   - ragdoll.html and flesh.html shoved bodies 1 and 4 -- the pelvis and the left UPPER arm -- where ragdoll.html's comments name the chest and the
//     left LOWER arm. build() makes the ground first, so each bone's body is one past its place in BONES, and the shove's numbers were typed as if
//     it were not. flesh.html carries ragdoll.html's eleven bones and its shove, number for number.
//   - box3d-vs-jolt.html never called the loader's init(): createWorld() threw "call init() first", the page caught it and said box3d's WASM was
//     not built, while it served the built one.
// Both figure pages now shove by name, through the map build() already fills; the comparison page awaits init() and, if box3d is not ready, says the
// loader's own reason. Every edit is on the line it fixes, so the census's sites (ragdoll.html:283, flesh.html:305, box3d-vs-jolt.html:49) still
// name the pages' angular-impulse calls.
//
//   1  THE PAGES' SOURCE                  the ground built first and the bones in BONES' order; the shove names its two bodies through build()'s own
//                                         map, and no body is shoved by a typed number; the comparison page awaits init() before any world
//   2  THE BUGS, AS THE CENSUS SAW THEM   from its committed results (5a14976d): both pages' shove spun body 1, the pelvis; box3d-vs-jolt.html ran
//                                         its five seconds and never started box3d
//   3  THE PAGES NOW, IN CHROMIUM         the census's page runner with this gate's own steps: each shove spins body 2, the chest, once;
//                                         box3d-vs-jolt.html starts box3d, gives its scene's twelve impulses, and its readout compares the two engines
// SABOTAGE LOG (2026-11-05) -- through the byte-safe runner (one at a time, every file restored and its sha256 checked), the gate run whole; every one red
// by name, none 0 red (the number is how many rows went red):
//   P1 ragdoll.html's angular shove typed as body 1 again 3 | P2 ragdoll.html's linear shove typed as body 4 again 2 | P3 flesh.html's shove typed as bodies 4 and 1 again 3
//   P4 ragdoll.html's bone map never filled by build() 2 | P5 box3d-vs-jolt.html's init() dropped again 3 | P6 box3d-vs-jolt.html makes a world whether or not box3d is ready 1
//   P7 box3d-vs-jolt.html keeps the loader's reason to itself 1 | P8 ragdoll.html's bones built chest first 2 | P9 the gate forgets the ground is body 0 4
//   P4' (P4 again, the rows guarded) ragdoll.html's bone map never filled by build() 2
//   A FINDING ON THE WAY: P4 went red partly by THROWING. With the bone map unfilled the hook saw the call but read no spin, and section 3's row
//   dereferenced the missing reading, so the section threw and its later rows never ran. The rows now answer false on a missing reading; P4' is
//   P4 again, red by name (the source row and the page's own).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as C from "../roundhouse/angularImpulseCensus.mjs";
import { shutdownServer } from "./serverShutdown.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
async function section(fn) { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), lineOf = (f, n) => src(f).split("\n")[n - 1] || "";
const FIGURES = ["ragdoll.html", "flesh.html"], COMPARE = "box3d-vs-jolt.html";
const SITES = { "ragdoll.html": "ragdoll.html:283", "flesh.html": "flesh.html:305", [COMPARE]: "box3d-vs-jolt.html:49" };
// a figure page's bones, in the order build() makes their bodies (each one after the ground, body 0)
const bonesOf = (f) => { const m = /const BONES = \[([\s\S]*?)\n\];/.exec(src(f)); return m ? [...m[1].matchAll(/^\s*\["(\w+)",/gm)].map((x) => x[1]) : []; };
const bodyOf = (f, name) => bonesOf(f).indexOf(name) + 1;

console.log("box3dPages-selfcheck -- the box3d pages the angular-impulse census found wrong: the figures' shove and the comparison page's start\n");

console.log("1. THE PAGES' SOURCE");
await section(() => {
    for (const f of FIGURES) {
        const s = src(f), build = (/function build\(\) \{([\s\S]*?)\n\}/.exec(s) || [])[1] || "";
        const ground = build.indexOf('world.addBox({ type: "static"'), bones = build.indexOf("for (const [name, pos, half] of BONES)");
        ok(`!! ${f}: build() makes the ground first and then one body per bone in BONES' order, so a bone's body is one past its place -- the pelvis 1, the chest 2, the left upper arm 4, the left lower arm 5`,
            ground >= 0 && bones > ground && J(bonesOf(f).slice(0, 5)) === J(["pelvis", "chest", "head", "upperArmL", "lowerArmL"]) && bodyOf(f, "chest") === 2 && bodyOf(f, "lowerArmL") === 5,
            bonesOf(f).slice(0, 5).map((b, k) => `${k + 1} ${b}`).join(", "));
        ok(`!! ${f}: the shove names its bodies through build()'s own map -- the linear impulse to bone.lowerArmL, the angular one to bone.chest -- and the map is the one build() fills`,
            /world\.impulse\(bone\.lowerArmL, \[14, 6, 0\]\)/.test(s) && /world\.angularImpulse\(bone\.chest, \[0, 0, 3\]\)/.test(s) && /const idx = bone = \{\};/.test(build) && /^let [^\n]*\bbone = \{\}/m.test(s));
        ok(`...and ${f} shoves no body by a typed number`, !/world\.(impulse|angularImpulse)\(\d/.test(s));
    }
    const c = src(COMPARE), boot = (/async function init\(\) \{([\s\S]*?)\n\}/.exec(c) || [])[1] || "";
    ok("!! box3d-vs-jolt.html awaits the loader's init() and asks whether it is ready before it makes a world, and says the loader's own reason when it is not",
        /st = await mod\.box3d\.init\(\)/.test(boot) && boot.indexOf("init()") < boot.indexOf("createWorld(") && /if \(st\.ready\)/.test(boot) && /box3dWhy = st\.reason/.test(boot) && /box3dWhy/.test(c.slice(c.indexOf("if (!box3d)"))));
    ok("the census's three sites still name the pages' angular-impulse calls, every edit having been made on the line it fixes",
        Object.entries(SITES).every(([f, site]) => /angularImpulse\(/.test(lineOf(f, +site.split(":")[1]))), Object.values(SITES).join(", "));
});

console.log("\n2. THE BUGS, AS THE CENSUS SAW THEM (its committed results, 5a14976d)");
await section(() => {
    const R = JSON.parse(fs.readFileSync(C.DEFAULT_RESULTS, "utf8")), site = (s) => R.readings.sites.find((x) => x.site === s);
    for (const f of FIGURES) {
        const e = site(SITES[f]);
        ok(`!! ${f}'s shove spun body 1 -- the pelvis, BONES' first, not the chest its comment names -- once, at ${e ? e.max.toFixed(2) : "?"} rad/s`,
            !!e && e.calls === 1 && !!e.maxAt && e.maxAt.idx === 1 && bonesOf(f)[e.maxAt.idx - 1] === "pelvis", e && e.maxAt ? `body ${e.maxAt.idx} of ${e.maxAt.bodies}` : "no reading");
    }
    const vs = R.runs.p.find((x) => x.page === COMPARE), e = site(SITES[COMPARE]);
    ok("!! box3d-vs-jolt.html ran its five seconds and never started box3d: no instance, and its scene's impulses never given", !!vs && vs.completed && !vs.box3dStarted && vs.instances === 0 && !!e && e.calls === 0);
});

console.log("\n3. THE PAGES NOW, IN CHROMIUM (the census's page runner, this gate's own steps)");
await section(async () => {
    const shove = [["click", "#go"], ["wait", 1500], ["click", "#shove"], ["wait", 1500]];
    const { srv, origin } = await C.serveTree(ENG), browser = await C.launchBrowser();
    let runs = [], readout = null;
    try {
        for (const f of FIGURES) runs.push(await C.runPage(browser, origin, { page: f, steps: shove }));
        runs.push(await C.runPage(browser, origin, { page: COMPARE, steps: [["wait", 2000]] }));
        const ctx = await browser.newContext(), p = await ctx.newPage();
        try {
            await p.goto(`${origin}/${COMPARE}`, { waitUntil: "load", timeout: 60000 });
            await p.waitForFunction(() => /pixel diff/.test(document.getElementById("diff").textContent), null, { timeout: 30000 }).catch(() => {});
            readout = await p.evaluate(() => ({ pane: document.getElementById("t1").textContent, diff: document.getElementById("diff").textContent }));
        } finally { await ctx.close(); }
    } finally { await browser.close(); await shutdownServer(srv); }
    for (const [k, f] of FIGURES.entries()) {
        const r = runs[k], e = r.tally.sites[SITES[f]];
        ok(`!! ${f}'s shove now spins body ${bodyOf(f, "chest")}, the chest, once -- the body its comment names`,
            r.box3dStarted && r.completed && r.pageErrors.length === 0 && !!e && e.calls === 1 && !!e.maxAt && e.maxAt.idx === bodyOf(f, "chest"),
            e && e.maxAt ? `body ${e.maxAt.idx} at ${e.max.toFixed(2)} rad/s, ${e.calls} call` : e ? `${e.calls} call(s), no spin read (the body it was given: none a bone names)` : `no call at ${SITES[f]}: ${J(Object.keys(r.tally.sites))} ${r.error || ""}`);
    }
    const v = runs[2], e = v.tally.sites[SITES[COMPARE]];
    ok("!! box3d-vs-jolt.html starts box3d now and gives its scene's twelve impulses", v.box3dStarted && v.completed && v.pageErrors.length === 0 && !!e && e.calls === 12,
        e ? `${e.calls} calls at ${SITES[COMPARE]}` : `box3d started ${v.box3dStarted}, ${v.error || "no call"}`);
    ok("!! ...and its readout compares the two engines -- a pixel diff -- where it said box3d's WASM was absent",
        !!readout && /pixel diff/.test(readout.diff) && !/absent|build its WASM|not loaded/.test(readout.pane + readout.diff), readout ? `"${readout.pane}" / "${readout.diff.slice(0, 80)}"` : "no readout");
});

console.log(`\nbox3dPages-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
// the verdict travels by exitCode, not process.exit(): this gate reaches box3d's wasm in the pages it serves (tools/ship/wasmDoors-selfcheck.mjs)
process.exitCode = fails === 0 ? 0 : 1;
