// WebGLEngine/tools/roundhouse/angularImpulseCensus-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/roundhouse/angularImpulseCensus-selfcheck.mjs      (about a minute)
//
// THE GATE OF THE ANGULAR-IMPULSE CENSUS, physics/mechanics/BOX3D_ANGULAR_IMPULSE_CAP_WIP.md. IT NEVER RUNS THE CENSUS: not one gate of
// the corpus under the hook, and not one of the four pages. It holds the registration as data, the table against the tree, the hook's
// parts, the hook itself on scratch scripts and on a page of its own, the four controls the registration fixes (flown), the corpus's rule,
// and the readings and the decision rule on tallies made by hand.
//
//   1  THE REGISTRATION AS DATA      the fourteen sites are the note's table and were calls at its commit; the pass-throughs, the stand-in
//                                    pages, the cap (debrisPhysics.js's own), the limit, the pages' steps and the results path are the note's
//   2  THE TABLE IS THE TREE'S       every call a grep finds is in the table, file by file, and the lines left out are definitions and text
//   3  THE HOOK'S PARTS              a stack line read; a call put to its site through the pass-throughs; the wrapper on a module of the
//                                    gate's own (the call goes through, the body's own spin is read, past is above the cap and not at it);
//                                    tallies merged; the loader hook's stand-in given for box3d.js and nothing else
//   4  THE HOOK IN NODE              scratch scripts under the hook: a process, its child and its worker all watched; a run stopped at its
//                                    limit keeps what it saw and its whole group is stopped; a script that never touches box3d sees nothing
//   5  THE CONTROLS                  C-transparent, C-reads, C-jolt and C-site, flown
//   6  THE CORPUS                    N is the gates that reach a module site's file, this gate left out, and a pass-through's file alone is
//                                    not enough; the corpus runner, on two scratch scripts
//   7  THE PAGES                     the tree served with the stand-in; a page of the gate's own: its call put to its line, a page that never
//                                    starts box3d still run, a step that fails said
//   8  THE READINGS AND THE RULE     readings merged over runs; the decision rule; C-reach and C-complete -- on hand-made tallies
//   9  THE RESULTS FILE              written once; the command prints no reading
//  10  THE RUN, A MINIATURE          run() itself, on two scratch scripts and a page of the gate's own: everything the registration names, in its order
//  11  THE VERDICT                   from the committed results (5a14976d): every reading re-derived from the runs, the decision by the rule (the cap goes in),
//                                    the predictions scored, the six sites not reached and why, and the raw-export calls the table missed
// SABOTAGE LOG -- FIFTY-TWO, 2026-11-04, each applied to the census's library, hook, watcher or command through a byte-safe runner (one at a time, every file restored and its sha256
// checked), the gate run whole; every one red by name, none 0 red (the number is how many rows went red):
//   G1 the past line is the cap without its slack 1 | G2 past is counted above 15 pi, the slack forgotten in the comparison 1 | G3 the wrapper reads body 0's spin, not the given body's 4
//   G4 the wrapper does not return what box3d returned 1 | G5 the wrapper hands box3d a different impulse (z dropped) 7 | G6 the pass-throughs are not skipped 8
//   G7 a pass-through is matched by file alone, any name 2 | G8 the hook's own frames are not skipped 8 | G9 a site keeps its first spin, not its largest 3
//   G10 a merge keeps the first largest spin, not the largest 2 | G11 a merge does not add the calls past the cap 1 | G12 a frame's file is not decoded 1 | G13 a frame's query is kept 1
//   G14 a frame's column is read as its line 9 | G15 the loader stands in for box3d.js only without a query 1 | G16 the tally is written only at exit, not every two seconds 1
//   G17 every thread writes the same tally file 1 | G18 the hook never installs 11 | G19 the page's stand-in records under no name 1 | G20 N keeps this round's own gate 2
//   G21 N counts a pass-through's file as a site's 2 | G22 C-transparent flies both sides unhooked 2 | G23 C-reads divides by the wrong moments 2
//   G24 C-jolt gives Jolt a tenth of the impulse 2 | G25 a run is not put under the hook 5 | G26 a gate that has ended does not have its group stopped 1
//   G27 the corpus runs one at a time 1 | G28 a page is never seen to start box3d 3 | G29 the real box3d.js is served in place of the stand-in 4 | G30 the wasm is served as octet-stream 4
//   G31 a site's readings do not say where its largest spin was seen 2 | G32 the debris' site decides like any other 2 | G33 a gate's own call decides like a site's 2
//   G34 a site found outside the table decides nothing 2 | G35 C-reach does not look at the pages 2 | G36 C-complete counts a red gate as a failure of the census 2
//   G37 an existing results file is overwritten 1 | G38 the command prints the decision 1 | G39 a site's line is off by one in the table 3 | G40 the kaiju's pass-through is dropped 4
//   G41 a site's file is left out of the grep as text 2 | G42 ragdoll.html's Shove comes one second after Drop 1 | G43 the corpus's limit is 900 s 1 | G44 the slack is 1.01 1
//   G45 run() runs no page 1 | G46 run() leaves C-reach out 2 | G47 run() reads the gates alone 1 | G48 run() leaves each run's tally in 1 | G50 a page's clicks are not made 3
//   G53 the grep keeps the gates 1 | G55 C-reads flies the debris with its cap on 2 | G56 the tallies of threads other than the first are not read 1
// G49, G51, G52 and G54 were drafted and dropped before the run, none of them run: G51 duplicated G40; G49 had no line of its own to break; G52 (C-transparent comparing only
// the last step) and G54 (C-reads' own debris test made always true) are equivalent at this level, because the gate's rows compare the whole hash list and repeat the
// debris test themselves -- G55 breaks the debris probe's input instead, and is red.
// THREE GAPS WERE CLOSED BEFORE THE FIRST SABOTAGE RAN, each seen in the gate's first draft rather than found by a sabotage going 0 red: nothing held the run to ending a
// gate that leaves a child holding its output (G26 would have passed), nothing measured that the corpus runs two at a time (G27), and nothing flew run() itself (G45-G48);
// section 4's leftover row, section 6's two-scripts-in-4.5-s row and section 10 were added for them.
// AND FIVE MORE ONCE THE SERVER'S ROUTES MOVED INTO treeHandler(), so that section 7 asks them directly and the gate dials no socket of its own (gateAxioms counts every gate
// that calls fetch, and this one's fetch went only to its own loopback server): G29' the stand-in not served 4 | G30' the wasm served as octet-stream 4 | G57 a page's extra
// path not served 4 | G58 a missing file served as 200 1 | G57' G57 again 5. G57 WAS A FINDING: the never-starts row passed with its page not served at all, because a 404 page
// never starts box3d either; that row now waits for the page's own word that the loader refused it, and G57' is red there too.
// AND FOURTEEN FOR THE VERDICT (section 11, and section 2's table row restated after the run to name the call made since), each applied to the gate's own rows
// through the same runner, every one red by name, none 0 red:
//   V1 the results' hash pinned one digit off 1 | V2 the readings re-derived from the gates alone, the pages left out 3 | V3 the decision said to rest on ragdoll.html alone 1
//   V4 the ragdoll page's spin said to be the lone box's 1 | V5 the debris said to be past the cap 216 times 1 | V6 P3 said to have been tested 1
//   V7 raceCar said not to have been reached 1 | V8 the replay page's bound said to be 3.2 rad/s 1 | V9 box3d-vs-jolt.html said to have started box3d 1
//   V10 C-reach's list said to lack the fluid 1 | V11 the kaiju's gates said to fly Jolt 1 | V12 the found site said to be line 210 1
//   V13 the raw-export grep said not to find rigidKeys.mjs 1 | V14 the calls since the census said to be two 1
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import * as C from "./angularImpulseCensus.mjs";
import * as H from "./angularImpulseHook.mjs";
import * as W from "./angularImpulseWatch.mjs";
import * as D from "../../fx/fracture/debrisPhysics.js";
import { buildGraph } from "../ship/affected.mjs";
import { shutdownServer } from "../ship/serverShutdown.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
async function section(fn) { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const J = JSON.stringify, sorted = (o) => J(Object.entries(o).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
const NOTE = fs.readFileSync(path.join(ENG, C.REGISTRATION), "utf8"), REG_COMMIT = "7d5cd4a5";
const atReg = (f) => execFileSync("git", ["show", `${REG_COMMIT}:./${f}`], { cwd: ENG, encoding: "utf8", maxBuffer: 1 << 26 }).split("\n");
const lineOf = (site) => +site.replace(/^.*:/, "");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "angcensus-gate-"));
const script = (name, text) => { const f = path.join(TMP, name); fs.writeFileSync(f, text); return f; };
const BACKEND = J(path.join(ENG, "physics", "backendNode.mjs")), LOADER = J(path.join(ENG, "physics", "box3d", "box3dLoader.js")), NODEMOD = J(path.join(ENG, "physics", "box3d", "box3dNode.mjs"));
const PELVIS = { half: [0.34, 0.2, 0.2], impulse: [0, 0, 3], spin: 531.6232299804688 };   // a lone box of ragdoll.html's pelvis, as the note measured it

console.log("angularImpulseCensus-selfcheck -- who spins a body past Jolt's cap on box3d: the census's parts, never its run\n");

console.log("1. THE REGISTRATION AS DATA");
await section(() => {
    const noteSites = [...NOTE.matchAll(/^\| `([^`]+:\d+)`/gm)].map((m) => m[1]);
    ok("!! the census's fourteen sites are the note's table in its order: ten in modules and four in pages", J(noteSites) === J(C.SITES.map((s) => s.site)) &&
        C.SITES.filter((s) => s.kind === "module").length === 10 && J(C.PAGE_SITES) === J(["ragdoll.html:283", "flesh.html:305", "box3d-replay.html:162", "box3d-vs-jolt.html:49"]), `${noteSites.length} in the note`);
    ok("...and at the note's commit each site's line is a call of angularImpulse()", C.SITES.every((s) => /angularImpulse\s*\(/.test(atReg(s.file)[lineOf(s.site) - 1] || "")));
    const passLines = ["physics/box3d/box3dLoader.js:51", "render/slugTicker.mjs:101", "physics/kaijuBox3d.js:76"];
    ok("!! the three pass-throughs are the note's -- the facade, the slug ticker's raw world, the kaiju's angularImpulse(rec, v) -- matched by file and name, and at the note's commit each line the note gives defines angularImpulse()",
        J(W.PASS_THROUGHS.map((p) => p.file)) === J(passLines.map((s) => s.replace(/:\d+$/, ""))) && W.PASS_THROUGHS.every((p) => p.fn === "angularImpulse") &&
        passLines.every((s) => NOTE.includes("`" + s + "`") && /angularImpulse\((idx|i|rec), v\) \{/.test(atReg(s.replace(/:\d+$/, ""))[lineOf(s) - 1] || "")));
    ok("the three pages with a stand-in world are the note's, and at its commit each line defines angularImpulse() on that world", J(C.NOT_BOX3D) === J(["box3d-demo.html:45", "es-hull-combat.html:44", "fluid-box3d.html:49"]) &&
        C.NOT_BOX3D.every((s) => NOTE.includes("`" + s + "`") && /angularImpulse\((i), (v|imp)\) \{/.test(atReg(s.replace(/:\d+$/, ""))[lineOf(s) - 1] || "")));
    ok("!! the cap is debrisPhysics.js's own: 15 pi and its slack of 1.001, so a call is past it above 47.1710 rad/s", C.MAX_SPIN === D.MAX_SPIN && C.SPIN_SLACK === D.SPIN_SLACK && C.MAX_SPIN === 15 * Math.PI && C.PAST === 15 * Math.PI * 1.001 &&
        /exceeds 15 pi x 1\.001 rad\/s/.test(NOTE), `PAST ${C.PAST.toFixed(4)}`);
    ok("the corpus runs two at a time with an 1,800 s limit, as the note says", C.PARALLEL === 2 && C.LIMIT_MS === 1800e3 && /two at a time, with an 1,800 s limit/.test(NOTE));
    const steps = Object.fromEntries(C.PAGES.map((p) => [p.page, J(p.steps)]));
    const html = (f) => fs.readFileSync(path.join(ENG, f), "utf8");
    ok("!! the pages are pressed as the note says: Drop, Shove two seconds later and five seconds more; Record a scenario here; nothing on box3d-vs-jolt.html for five seconds",
        J(C.PAGES.map((p) => p.page)) === J(["ragdoll.html", "flesh.html", "box3d-replay.html", "box3d-vs-jolt.html"]) && C.PAGES.every((p) => p.site.startsWith(p.page + ":")) &&
        steps["ragdoll.html"] === J([["click", "#go"], ["wait", 2000], ["click", "#shove"], ["wait", 5000]]) && steps["flesh.html"] === steps["ragdoll.html"] &&
        JSON.parse(steps["box3d-replay.html"])[0][1] === "#rec" && steps["box3d-vs-jolt.html"] === J([["wait", 5000]]) &&
        ["ragdoll.html", "flesh.html"].every((f) => /id="go"[^>]*>Drop</.test(html(f)) && /id="shove"[^>]*>Shove</.test(html(f))) && /id="rec">Record a scenario here</.test(html("box3d-replay.html")) && /id="recState"/.test(html("box3d-replay.html")) &&
        /Drop, then Shove about two seconds later, then five seconds more/.test(NOTE) && /Record a scenario here/.test(NOTE));
    ok("the results go where the note says, and the debris' site is the one that decides nothing", C.DEFAULT_RESULTS === path.join(ENG, "physics", "mechanics", "box3dAngularImpulseCapResults.json") &&
        NOTE.includes("physics/mechanics/box3dAngularImpulseCapResults.json") && C.DEBRIS_SITE === "fx/fracture/debrisPhysics.js:52" && /other than `debrisPhysics\.js:52`/.test(NOTE));
});

console.log("\n2. THE TABLE IS THE TREE'S");
await section(() => {
    // 2026-11-04, after the run: calls of angularImpulse() made since the census's commit (e1a56d0d), each named with its reason. The census
    // measured none of them; a new one anywhere else still turns the row red.
    //   physics/mechanics/shipContactBox3d.mjs -- the hybrid round's contact tick (e30f8c21) gives the tick's torque as an angular impulse,
    //   as rigidBody6dofBox3d.mjs:59 does (40 rad/s at most in the census); it goes through the facade, so the cap reaches it.
    const SINCE = Object.freeze({ "physics/mechanics/shipContactBox3d.mjs": 1 });
    const calls = C.grepCalls(), tree = C.treeCounts(calls), table = { ...C.tableCounts() };
    for (const [f, n] of Object.entries(SINCE)) table[f] = (table[f] || 0) + n;
    ok("!! every call of angularImpulse() in the tree -- gates, vendored code and notes left out -- is in the census's table, or named as made since it: the same files, the same number in each", sorted(tree) === sorted(table), `${Object.keys(tree).length} files, ${calls.length} lines found`);
    const left = calls.filter(([f]) => C.NOT_CALLS.includes(f));
    const isDef = ([, , t]) => /angularImpulse\((idx|i), v\) \{/.test(t), isText = ([, , t]) => /(\/\/|\/\*|\*|["'`]).*angularImpulse\s*\(/.test(t);
    const own = (f) => /^tools\/roundhouse\/angularImpulse/.test(f);
    ok("...and the lines it leaves out are the pass-throughs' and Jolt's definitions, text that names the function, and the census's own files",
        left.filter(([f]) => ["physics/box3d/box3dLoader.js", "render/slugTicker.mjs", "physics/jolt/joltLoader.js"].includes(f)).every(isDef) &&
        left.filter(([f]) => ["main.js", "physics/mechanics/freeRotation.mjs", "tools/ship/nextRounds.mjs"].includes(f)).every(isText) && left.every(([f]) => C.NOT_CALLS.includes(f) && (!own(f) || C.NOT_CALLS.includes(f))),
        `${left.length} lines left out`);
    const planted = C.treeCounts([...calls, ["physics/raceCar.mjs", 999, "world.angularImpulse(b, w);"], ["render/newThing.mjs", 3, "w.angularImpulse(0, [1, 0, 0]);"]]);
    ok("...shown failing: a second call in a site's file and a call in a new file each make the tree disagree with the table", sorted(planted) !== sorted(table) && planted["physics/raceCar.mjs"] === 2 && planted["render/newThing.mjs"] === 1);
});

console.log("\n3. THE HOOK'S PARTS");
await section(async () => {
    const F = W.parseFrame;
    const a = F("    at Box3DWorldHandle.angularImpulse (file:///x/WebGLEngine/physics/box3d/box3dLoader.js:51:48)"), b = F("    at file:///x/a.mjs:7:3"), c = F("    at async run (http://127.0.0.1:5555/ragdoll.html:283:11)");
    ok("a stack line is read: a named frame, an anonymous one and an async one in a page; text that is not a frame is not", a && a.fn === "Box3DWorldHandle.angularImpulse" && a.line === 51 && a.col === 48 && /box3dLoader\.js$/.test(a.url) &&
        b && b.fn === "" && b.line === 7 && b.url === "file:///x/a.mjs" && c && c.fn === "run" && c.line === 283 && c.url === "http://127.0.0.1:5555/ragdoll.html" && F("Error") === null && F("    at async Promise.all (index 0)") === null);
    const R = ["file:///x/WebGLEngine/", "http://127.0.0.1:5555/"];
    ok("a frame's file is put relative to the tree, a page's to its origin, and a query is dropped; any other is left as it is", W.relOf("file:///x/WebGLEngine/render/a%20b.mjs?v=2", R) === "render/a b.mjs" && W.relOf("http://127.0.0.1:5555/flesh.html", R) === "flesh.html" && W.relOf("file:///y/z.mjs", R) === "file:///y/z.mjs");
    const st = (...fr) => ["Error", ...fr.map(([fn, f, l]) => `    at ${fn ? fn + " (" : ""}${R[0]}${f}:${l}:1${fn ? ")" : ""}`)].join("\n");
    const s1 = W.siteOf(st(["m._swk_body_ang_impulse", "tools/roundhouse/angularImpulseWatch.mjs", 77], ["Box3DWorldHandle.angularImpulse", "physics/box3d/box3dLoader.js", 51], ["Object.angularImpulse", "physics/kaijuBox3d.js", 76], ["Object.throwObject", "physics/kaijuBox3d.js", 84], ["run", "world/x.mjs", 9]), R);
    ok("!! a call is put to the first frame outside the hook and the pass-throughs, the pass-throughs it went through kept in order: through the facade and the kaiju's, the kaiju's throwObject is the site",
        s1.site === "physics/kaijuBox3d.js:84" && J(s1.via) === J(["physics/box3d/box3dLoader.js:51", "physics/kaijuBox3d.js:76"]) && J(s1.above) === J(["world/x.mjs:9"]), J(s1));
    const s2 = W.siteOf(st(["m._swk_body_ang_impulse", "tools/roundhouse/angularImpulseWatch.mjs", 77], ["Object.angularImpulse", "render/slugTicker.mjs", 101], ["shatter", "render/slugShatter.mjs", 103]), R);
    const s3 = W.siteOf(st(["m._swk_body_ang_impulse", "tools/roundhouse/angularImpulseWatch.mjs", 77], ["Box3DWorldHandle.selfTest", "physics/box3d/box3dLoader.js", 380]), R);
    const s4 = W.siteOf(st(["m._swk_body_ang_impulse", "tools/roundhouse/angularImpulseWatch.mjs", 77], ["Box3DWorldHandle.angularImpulse", "physics/box3d/box3dLoader.js", 51]), R);
    ok("...through the ticker's raw world the shatter is the site; a frame in a pass-through's file under ANOTHER name is a site; a stack of nothing else has none",
        s2.site === "render/slugShatter.mjs:103" && J(s2.via) === J(["render/slugTicker.mjs:101"]) && s3.site === "physics/box3d/box3dLoader.js:380" && s4.site === "(no frame)" && J(s4.via) === J(["physics/box3d/box3dLoader.js:51"]));
    // a module of the gate's own, shaped as box3d's: two bodies, an impulse divides by a moment of 0.01
    const own = (I = 0.01, read = true) => {
        const heap = new Float32Array(256), w = [[0, 0, 0], [0, 0, 0]], args = [];
        const m = { HEAPF32: heap, _malloc: () => 64, _free: () => {}, _swk_body_count: () => 2,
            _swk_body_ang_impulse: (i, x, y, z) => { args.push([i, x, y, z]); w[i] = [w[i][0] + x / I, w[i][1] + y / I, w[i][2] + z / I]; return 7; } };
        if (read) m._swk_ang_velocities = (p) => { heap.set([...w[0], ...w[1]], p / 4); };
        return { m, args, w };
    };
    const T = W.newTally("own"), o = own(), mod = W.watchModule(o.m, T, R);
    const ret = mod._swk_body_ang_impulse(1, 0.3, 0.4, 0);   // body 1 at 50 rad/s: past the cap
    mod._swk_body_ang_impulse(0, 0, 0, 1e-4);                // body 0 at 0.01 rad/s
    const e = Object.values(T.sites);
    ok("!! the wrapper hands the call to box3d unchanged and returns what box3d returned; it reads the spin of the body that was given the impulse, not another's",
        ret === 7 && J(o.args) === J([[1, 0.3, 0.4, 0], [0, 0, 0, 1e-4]]) && T.calls === 2 && e.length === 1 && Math.abs(e[0].max - 50) < 1e-4 && e[0].maxAt.idx === 1 && J(e[0].maxAt.impulse) === J([0.3, 0.4, 0]) && e[0].maxAt.bodies === 2 && e[0].maxAt.run === "own", `max ${e[0] && e[0].max}`);
    const T2 = W.newTally("cap"), o2 = own(1);
    W.watchModule(o2.m, T2, R);
    const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer); f32[0] = C.PAST; if (f32[0] > C.PAST) u32[0] -= 1;   // the float32 at the line, or the next one under it
    o2.m._swk_body_ang_impulse(0, f32[0], 0, 0);          // at the line: not past
    o2.m._swk_body_ang_impulse(1, C.PAST * 1.0001, 0, 0);  // above it: past
    const e2 = Object.values(T2.sites)[0];
    ok("!! a call is past the cap ABOVE 15 pi x 1.001 and not at it", e2.calls === 2 && e2.past === 1 && Math.abs(e2.max - C.PAST * 1.0001) < 1e-3, `past ${e2.past} of ${e2.calls}`);
    const T3 = W.newTally("nan"), o3 = own(0);
    W.watchModule(o3.m, T3, R); o3.m._swk_body_ang_impulse(0, 0, 0, 0);
    const T4 = W.newTally("unread"), o4 = own(0.01, false);
    W.watchModule(o4.m, T4, R); o4.m._swk_body_ang_impulse(0, 1, 0, 0);
    ok("a spin that is not a number is counted as such and is never the largest; a module that cannot read spins counts the call as unread", Object.values(T3.sites)[0].nan === 1 && Object.values(T3.sites)[0].max === -1 &&
        T4.calls === 1 && T4.unread === 1 && Object.values(T4.sites)[0].calls === 1 && Object.values(T4.sites)[0].maxAt === null);
    const T5 = W.newTally("twice"), o5 = own(); W.watchModule(o5.m, T5, R); W.watchModule(o5.m, T5, R); o5.m._swk_body_ang_impulse(0, 1e-3, 0, 0);
    const bare = { _swk_world_step() {} };
    ok("a module is watched once however often it is handed over, and one without box3d's export is handed back untouched", T5.instances === 1 && T5.calls === 1 && W.watchModule(bare, T5, R) === bare && Object.keys(bare).length === 1);
    const t1 = { run: "a", instances: 1, calls: 3, unread: 0, sites: { "x.mjs:1": { calls: 2, past: 1, nan: 0, max: 60, maxAt: { spin: 60, run: "a" } }, "y.mjs:2": { calls: 1, past: 0, nan: 0, max: 5, maxAt: { spin: 5, run: "a" } } } };
    const t2 = { run: "b", instances: 2, calls: 2, unread: 1, sites: { "x.mjs:1": { calls: 2, past: 2, nan: 1, max: 90, maxAt: { spin: 90, run: "b" } } } };
    const mg = W.mergeTallies([t1, null, t2]);
    ok("tallies merge site by site: calls, past and the rest add, and the largest spin is kept with the run that saw it", mg.calls === 5 && mg.instances === 3 && mg.unread === 1 && mg.sites["x.mjs:1"].calls === 4 && mg.sites["x.mjs:1"].past === 3 &&
        mg.sites["x.mjs:1"].nan === 1 && mg.sites["x.mjs:1"].max === 90 && mg.sites["x.mjs:1"].maxAt.run === "b" && mg.sites["y.mjs:2"].maxAt.run === "a");
    const L = await import("data:text/javascript," + encodeURIComponent(H.hooksSource("file:///h/hook.mjs")));
    const nexted = [], next = (u) => { nexted.push(u); return { source: "next" }; };
    const give = async (u) => (await L.load(u, {}, next)).source;
    const sa = await give("file:///x/vendor/box3d/box3d.js"), sb = await give("file:///x/vendor/box3d/box3d.js?fresh=1");
    await give("file:///x/vendor/box3d/box3d.js?census-real"); await give("file:///x/vendor/box3d/box3d.js?fresh=1&census-real"); await give("file:///x/vendor/box3d/box3d.jsx"); await give("file:///x/vendor/box3d/other.js");
    ok("!! node's loader hook stands in for vendor/box3d/box3d.js, with or without a query, and hands everything else on -- the real file it imports among them",
        /import real from "file:\/\/\/x\/vendor\/box3d\/box3d\.js\?census-real"/.test(sa) && /import \{ watch \} from "file:\/\/\/h\/hook\.mjs"/.test(sa) && /return watch\(await real\(opts\)\)/.test(sa) &&
        /box3d\.js\?fresh=1&census-real"/.test(sb) && J(nexted) === J(["file:///x/vendor/box3d/box3d.js?census-real", "file:///x/vendor/box3d/box3d.js?fresh=1&census-real", "file:///x/vendor/box3d/box3d.jsx", "file:///x/vendor/box3d/other.js"]));
    const ps = H.pageStandIn();
    ok("...and a page's stand-in imports the real file and the shared watcher, and records into window.__swkAngCensus by the page's own name", /import real from "\/vendor\/box3d\/box3d\.js\?census-real"/.test(ps) && /from "\/tools\/roundhouse\/angularImpulseWatch\.mjs"/.test(ps) &&
        /globalThis\.__swkAngCensus/.test(ps) && /location\.origin \+ "\/"/.test(ps) && /location\.pathname\.replace/.test(ps));
});

console.log("\n4. THE HOOK IN NODE");
await section(async () => {
    const child = script("child.mjs", `import { initNode, mod } from ${NODEMOD};\nawait initNode(); const m = mod();\nm._swk_world_create(0, 0, 0); const b = m._swk_body_box(1, 0, 0, 0, 0.03, 0.09, 0.06, 1);\nm._swk_body_ang_impulse(b, 0, 0, 1e-4);\n`);
    const main = script("main.mjs", `import { execFileSync } from "node:child_process";\nimport { Worker } from "node:worker_threads";\nimport { adoptBox3dInNode } from ${BACKEND};\nimport { box3d } from ${LOADER};\nawait adoptBox3dInNode();\n` +
        `const w = box3d.createWorld({ gravity: [0, 0, 0] }), b = w.addBox({ type: "dynamic", pos: [0, 0, 0], half: ${J(PELVIS.half)}, density: 1 });\nw.angularImpulse(b, ${J(PELVIS.impulse)});\n` +
        `execFileSync(process.execPath, [${J(child)}], { stdio: "inherit" });\nawait new Promise((res, rej) => { const k = new Worker(${J(child)}); k.on("exit", res); k.on("error", rej); });\n`);
    const r = await C.runHooked(main, { run: "gate-main", limitMs: 60000 });
    const sites = r.tally.sites, mainSite = Object.keys(sites).find((s) => s.endsWith("main.mjs:7")), childSite = Object.keys(sites).find((s) => s.endsWith("child.mjs:4"));
    ok("!! a script under the hook is watched, and so are the process it starts and the worker it starts: three tallies, every call put to its own line", r.code === 0 && !r.timedOut && r.processes === 3 && r.tally.instances === 3 && r.tally.calls === 3 &&
        !!mainSite && sites[mainSite].calls === 1 && sites[mainSite].max === PELVIS.spin && J(sites[mainSite].maxAt.via) === J(["physics/box3d/box3dLoader.js:51"]) && sites[mainSite].maxAt.run === "gate-main" && !!childSite && sites[childSite].calls === 2 && J(sites[childSite].maxAt.via) === J([]),
        `processes ${r.processes}, calls ${r.tally.calls}, ${(r.ms / 1000).toFixed(1)} s`);
    const pidFile = path.join(TMP, "grandchild.pid");
    const stuck = script("stuck.mjs", `import { spawn } from "node:child_process";\nimport fs from "node:fs";\nimport { adoptBox3dInNode } from ${BACKEND};\nimport { box3d } from ${LOADER};\nawait adoptBox3dInNode();\n` +
        `const g = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" }); fs.writeFileSync(${J(pidFile)}, String(g.pid));\n` +
        `const w = box3d.createWorld({ gravity: [0, 0, 0] }), b = w.addBox({ type: "dynamic", pos: [0, 0, 0], half: [0.5, 0.5, 0.5], density: 1 });\nw.angularImpulse(b, [0, 0, 0.1]);\nsetInterval(() => {}, 1000);\n`);
    const s = await C.runHooked(stuck, { run: "gate-stuck", limitMs: 7000 });
    const gpid = +fs.readFileSync(pidFile, "utf8");
    // stopped means gone, or a zombie nobody has reaped yet (a container's first process need not reap): /proc says which
    const running = (pid) => { try { return !/^\d+ \(.*\) Z/.test(fs.readFileSync(`/proc/${pid}/stat`, "utf8")); } catch { return false; } };
    let alive = true; for (let k = 0; k < 50 && alive; k++) { alive = running(gpid); if (alive) await new Promise((res) => setTimeout(res, 100)); }
    ok("!! a run stopped at its limit is said to have timed out, keeps the calls it made (its tally is written every two seconds), and its whole process group is stopped with it",
        s.timedOut && s.tally.calls === 1 && Object.values(s.tally.sites)[0].calls === 1 && !alive, `timed out ${s.timedOut}, calls ${s.tally.calls}, grandchild ${alive ? "STILL RUNNING" : "stopped"}`);
    const pid2 = path.join(TMP, "leftover.pid");
    const leftover = script("leftover.mjs", `import { spawn } from "node:child_process";\nimport fs from "node:fs";\nconst g = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "inherit" });\nfs.writeFileSync(${J(pid2)}, String(g.pid));\nprocess.exit(0);\n`);
    const lo = await C.runHooked(leftover, { run: "gate-leftover", limitMs: 20000 });
    let left = true; for (let k = 0; k < 50 && left; k++) { left = running(+fs.readFileSync(pid2, "utf8")); if (left) await new Promise((res) => setTimeout(res, 100)); }
    ok("!! a gate that ends leaving a child of its own running -- one that holds its output open -- is ended with it at once, not at the limit", !lo.timedOut && lo.code === 0 && lo.ms < 10000 && !left, `${(lo.ms / 1000).toFixed(1)} s, the child ${left ? "STILL RUNNING" : "stopped"}`);
    const none = script("none.mjs", `console.log("no box3d here");\n`), three = script("three.mjs", `process.exit(3);\n`);
    const n = await C.runHooked(none, { run: "gate-none", limitMs: 30000 }), t = await C.runHooked(three, { run: "gate-three", limitMs: 30000 });
    ok("a script that never touches box3d sees nothing and ends as it ends; an exit code is kept", n.code === 0 && n.tally.calls === 0 && n.tally.instances === 0 && n.processes === 1 && t.code === 3 && t.tally.calls === 0 && /no box3d here/.test(n.tail));
});

console.log("\n5. THE CONTROLS");
await section(async () => {
    const tr = C.cTransparent();
    ok("!! C-transparent: backendDivergence's scene, 14 boxes for 120 steps, gives the same state hash and the same harness hash at every step, hooked and unhooked, in two processes; the hooked one saw its 14 calls",
        tr.ok && tr.steps === 120 && tr.same && tr.callsSeen === 14, J(tr));
    const rd = C.cReads();
    ok("!! C-reads: a lone light box given a known impulse reads |I^-1 J| from the inertia box3d reports, to float32, and reads what box3d itself reads back", rd.lone.ok && Math.abs(rd.lone.seen - rd.lone.expect) <= 1e-6 * rd.lone.expect, J(rd.lone));
    ok("!! ...and the debris flown on box3d with its cap off reads past the cap, the largest spin the hook saw being the largest box3d holds after the throw", rd.debris.ok && rd.debris.seen > C.PAST && rd.debris.seen === rd.debris.top && rd.debris.past >= 1, J(rd.debris));
    const jo = await C.cJolt();
    ok("!! C-jolt: the same lone box on Jolt reads 15 pi right after the same impulse -- the claim the census rests on", jo.ok && Math.abs(jo.read - 15 * Math.PI) < 1e-5 * 15 * Math.PI && rd.lone.seen > jo.read, `Jolt ${jo.read}, box3d ${rd.lone.seen}`);
    const si = C.cSite();
    ok("!! C-site: calls from known lines are put to them -- through the facade, through the kaiju's angularImpulse(rec, v), through the slug ticker's raw world -- and never to a pass-through", si.ok, J(si.sites));
});

console.log("\n6. THE CORPUS");
await section(async () => {
    const g = buildGraph(), n = C.corpusN(g);
    const by = [...g.deps].filter(([gate, deps]) => gate !== C.OWN_GATE && C.MODULE_FILES.some((f) => deps.has(f))).map(([gate]) => gate).sort();
    ok("!! N is every gate that reaches the file of a module site through the import graph -- the gate's own count of them, the same list", J(n) === J(by) && n.length > 100 && J(C.MODULE_FILES) === J([...new Set(C.SITES.filter((s) => s.kind === "module").map((s) => s.file))]), `${n.length} gates at this tree`);
    ok("...with this gate left out, although it reaches one (it imports debrisPhysics.js)", !n.includes(C.OWN_GATE) && g.deps.has(C.OWN_GATE) && g.deps.get(C.OWN_GATE).has("fx/fracture/debrisPhysics.js"));
    const tick = "tools/ship/slugTicker-selfcheck.mjs";
    ok("...and a gate that reaches a pass-through's file and no site's is not in it", g.deps.has(tick) && g.deps.get(tick).has("render/slugTicker.mjs") && !C.MODULE_FILES.some((f) => g.deps.get(tick).has(f)) && !n.includes(tick));
    const one = script("one.mjs", `import { adoptBox3dInNode } from ${BACKEND};\nimport { box3d } from ${LOADER};\nawait adoptBox3dInNode();\nconst w = box3d.createWorld({ gravity: [0, 0, 0] }), b = w.addBox({ type: "dynamic" });\nw.angularImpulse(b, [0, 0, 0.5]);\n`);
    const two = script("two.mjs", `console.log("two");\n`), heard = [];
    const runs = await C.runCorpusN([one, two, one], { parallel: 2, limitMs: 60000, onDone: (r, i, total) => heard.push([i, total, r.run]) });
    const nap = script("nap.mjs", `setTimeout(() => {}, 2500);\n`), t0 = Date.now(), naps = await C.runCorpusN([nap, nap], { parallel: 2, limitMs: 30000 }), napMs = Date.now() - t0;
    ok("...and it does run them two at a time: two scripts of 2.5 s each end in less than 4.5 s", naps.length === 2 && naps.every((r) => r.code === 0) && napMs < 4500, `${(napMs / 1000).toFixed(1)} s`);
    ok("the corpus runner runs every gate it is given, two at a time, each under the hook, and lists them in the order given", runs.length === 3 && J(runs.map((r) => r.run)) === J([one, two, one]) && runs[0].tally.calls === 1 && runs[1].tally.calls === 0 && runs[2].tally.calls === 1 &&
        heard.length === 3 && heard.every(([, total]) => total === 3) && J(heard.map(([i]) => i).sort()) === J([0, 1, 2]));
});

console.log("\n7. THE PAGES");
await section(async () => {
    const probe = `<!doctype html><html><body><button id="go">go</button><span id="st"></span>\n<script type="module">\nimport { box3d } from "./physics/box3d/box3dLoader.js";\nawait box3d.init();\n` +
        `const w = box3d.createWorld({ gravity: [0, 0, 0] }), b = w.addBox({ type: "dynamic", pos: [0, 0, 0], half: ${J(PELVIS.half)}, density: 1 });\n` +
        `document.getElementById("go").onclick = () => {\n  w.angularImpulse(b, ${J(PELVIS.impulse)});\n  document.getElementById("st").innerHTML = "<span class='ok'>done</span>";\n};\n</script></body></html>`;
    const never = `<!doctype html><html><body><span id="st">idle</span>\n<script type="module">\nimport { box3d } from "./physics/box3d/box3dLoader.js";\ntry { box3d.createWorld({ gravity: [0, 0, 0] }); } catch (e) { document.getElementById("st").innerHTML = "<b class='said'>" + e.message + "</b>"; }\n</script></body></html>`;
    const { srv, origin } = await C.serveTree(ENG, { "/__census_probe.html": probe, "/__census_never.html": never });
    try {
        // the routes, asked directly -- no socket: the handler is what the server hands every request
        const route = C.treeHandler(ENG, { "/__census_extra.js": "export const x = 1;" });
        const get = (u) => { const out = { status: 0, type: null, body: Buffer.alloc(0) }; route({ url: u }, { writeHead(st, h) { out.status = st; out.type = h ? h["Content-Type"] : null; }, end(b) { out.body = b == null ? Buffer.alloc(0) : Buffer.from(b); } }); return out; };
        const standIn = get("/vendor/box3d/box3d.js"), real = get("/vendor/box3d/box3d.js?census-real"), wasm = get("/vendor/box3d/box3d.wasm"), missing = get("/no/such/file.js"), extraOne = get("/__census_extra.js");
        ok("!! the tree is served with the stand-in for /vendor/box3d/box3d.js, the real file byte for byte for ?census-real, the wasm as application/wasm, a page's extra path as given, and a missing file as 404",
            standIn.status === 200 && standIn.body.toString() === H.pageStandIn() && real.status === 200 && real.body.equals(fs.readFileSync(path.join(ENG, "vendor", "box3d", "box3d.js"))) &&
            wasm.status === 200 && wasm.type === "application/wasm" && wasm.body.equals(fs.readFileSync(path.join(ENG, "vendor", "box3d", "box3d.wasm"))) && missing.status === 404 && extraOne.body.toString() === "export const x = 1;");
        const browser = await C.launchBrowser();
        try {
            const a = await C.runPage(browser, origin, { page: "__census_probe.html", steps: [["click", "#go"], ["waitFor", "#st .ok", 15000], ["wait", 100]] });
            const site = a.tally.sites["__census_probe.html:7"];
            ok("!! a page of the gate's own, under the hook in Chromium: box3d starts, its button is pressed, and its call is put to the page's own line through the facade, at the spin a lone box of that size reads in node",
                a.box3dStarted && a.completed && !a.error && a.tally.instances === 1 && a.tally.calls === 1 && !!site && site.max === PELVIS.spin && J(site.maxAt.via) === J(["physics/box3d/box3dLoader.js:51"]) && site.maxAt.run === "__census_probe.html",
                J({ started: a.box3dStarted, completed: a.completed, error: a.error, sites: Object.keys(a.tally.sites) }));
            const b = await C.runPage(browser, origin, { page: "__census_never.html", steps: [["waitFor", "#st .said", 15000], ["wait", 300]] }, { readyMs: 2000 });
            ok("...a page that never starts box3d -- it calls createWorld() without init(), and says what the loader told it -- is still run to the end of its steps, and is said not to have started it",
                !b.box3dStarted && b.completed && b.tally.calls === 0 && b.tally.instances === 0, J({ started: b.box3dStarted, completed: b.completed, error: b.error }));
            const c = await C.runPage(browser, origin, { page: "__census_probe.html", steps: [["click", "#no-such-button"]] }, { readyMs: 5000 });
            ok("...and a step that cannot be done is said: the page is not completed and the error is kept", !c.completed && /no-such-button|Timeout/i.test(c.error || "") && c.box3dStarted, c.error && c.error.slice(0, 80));
        } finally { await browser.close(); }
    } finally { await shutdownServer(srv); }
});

console.log("\n8. THE READINGS AND THE RULE");
await section(() => {
    const T = (run, sites) => ({ run, tally: { run, instances: 1, calls: Object.values(sites).reduce((s, e) => s + e.calls, 0), unread: 0, sites: Object.fromEntries(Object.entries(sites).map(([k, e]) => [k, { nan: 0, ...e, maxAt: { spin: e.max, run } }])) } });
    const runs = [T("g/a-selfcheck.mjs", { "physics/raceCar.mjs:243": { calls: 10, past: 0, max: 3 }, "fx/fracture/debrisPhysics.js:52": { calls: 5, past: 2, max: 900 } }),
        T("g/b-selfcheck.mjs", { "physics/raceCar.mjs:243": { calls: 4, past: 0, max: 7 }, "g/b-selfcheck.mjs:12": { calls: 1, past: 1, max: 4000 } })];
    const r = C.readingsOf(runs), car = r.sites.find((s) => s.site === "physics/raceCar.mjs:243"), topple = r.sites.find((s) => s.site === "world/buildingTopple.mjs:305");
    ok("!! a site's readings merge over runs: its calls add, its largest spin is kept with the run that saw it; a site no run reached reads 0 calls and no spin", r.sites.length === 14 && car.calls === 14 && car.max === 7 && car.where === "g/b-selfcheck.mjs" && car.past === 0 &&
        topple.calls === 0 && topple.max === null && topple.where === null && r.calls === 20);
    ok("...and a site outside the table is listed apart, a gate's own call as a gate's", r.others.length === 1 && r.others[0].site === "g/b-selfcheck.mjs:12" && r.others[0].kind === "gate");
    const d1 = C.decide(r);
    ok("!! THE RULE: with only the debris and a gate's own call past the cap, the cap does not go in", !d1.capGoesIn && J(d1.past) === J([]));
    const d2 = C.decide(C.readingsOf([...runs, T("ragdoll.html", { "ragdoll.html:283": { calls: 1, past: 1, max: 531 } })]));
    const d3 = C.decide(C.readingsOf([...runs, T("g/c-selfcheck.mjs", { "render/newThing.mjs:3": { calls: 2, past: 1, max: 60 } })]));
    const d4 = C.decide(C.readingsOf([...runs, T("g/d-selfcheck.mjs", { "physics/raceCar.mjs:243": { calls: 1, past: 0, max: C.PAST } })]));
    ok("!! ...with a site of the table past it, the cap goes in, and so it does for a site found outside the table in a file that is not a gate; it is the calls past the cap that count, not the largest spin (a site at the line with none past puts nothing in)",
        d2.capGoesIn && J(d2.past) === J(["ragdoll.html:283"]) && d3.capGoesIn && J(d3.past) === J(["render/newThing.mjs:3"]) && !d4.capGoesIn);
    const rN = C.readingsOf(runs), rP = C.readingsOf([T("ragdoll.html", { "ragdoll.html:283": { calls: 1, past: 1, max: 531 } })]);
    const reach = C.cReach(rN, rP);
    ok("C-reach names every site no run reached -- module sites by N, page sites by P -- and holds only when there is none", !reach.ok && reach.notReached.includes("world/buildingTopple.mjs:305") && !reach.notReached.includes("physics/raceCar.mjs:243") &&
        reach.notReached.includes("flesh.html:305") && !reach.notReached.includes("ragdoll.html:283") && reach.notReached.length === 8 + 3, `${reach.notReached.length} not reached`);
    const rr = (run, o) => ({ run, code: 0, signal: null, timedOut: false, ms: 10, processes: 1, tally: W.newTally(run), ...o });
    const comp = C.cComplete([rr("a"), rr("b", { timedOut: true, code: null, signal: "SIGKILL" }), rr("c", { code: 1 }), rr("d", { code: null, signal: "SIGSEGV" })], [{ run: "p", completed: false, error: "x", box3dStarted: true, tally: W.newTally("p") }]);
    ok("C-complete lists how every run ended and names the ones that timed out or crashed; a red gate's exit is not a failure of the census", !comp.ok && J(comp.timedOut) === J(["b"]) && J(comp.crashed) === J(["d"]) &&
        comp.n.find((x) => x.run === "c").ended === "exit 1" && C.cComplete([rr("a"), rr("c", { code: 1 })], [{ run: "p", completed: true, tally: W.newTally("p") }]).ok);
});

console.log("\n9. THE RESULTS FILE");
await section(() => {
    const f = path.join(TMP, "results.json");
    fs.writeFileSync(f, "{}\n");
    let refused = null; try { C.refuseExisting(f); } catch (e) { refused = e.message; }
    let free = true; try { C.refuseExisting(path.join(TMP, "none.json")); } catch { free = false; }
    const text = C.serialize({ b: 1, a: [1, 2] });
    ok("a results file is written once: one that exists is refused, and the file is JSON ending in a newline", /written once/.test(refused || "") && free && text.endsWith("\n") && J(JSON.parse(text)) === J({ b: 1, a: [1, 2] }));
    const cmd = fs.readFileSync(path.join(HERE, "angularImpulseCensusRun.mjs"), "utf8"), logs = cmd.split("\n").filter((l) => /console\.log/.test(l));
    ok("!! the command prints how each run ended and how long it took, and never a reading: no line it prints names a spin, a site, a reading or the decision",
        logs.length >= 3 && logs.every((l) => !/readings|decision|\.max\b|\.past\b|\.sites\b|maxAt|capGoesIn/.test(l)) && /refuseExisting\(out\)/.test(cmd) && /C\.run\(/.test(cmd), `${logs.length} lines print`);
});

console.log("\n10. THE RUN, A MINIATURE");
await section(async () => {
    // run() on two scratch scripts and a page of the gate's own -- never the registered corpus or the registered pages
    const one = script("m-one.mjs", `import { adoptBox3dInNode } from ${BACKEND};\nimport { box3d } from ${LOADER};\nawait adoptBox3dInNode();\nconst w = box3d.createWorld({ gravity: [0, 0, 0] }), b = w.addBox({ type: "dynamic" });\nw.angularImpulse(b, [0, 0, 0.5]);\n`);
    const two = script("m-two.mjs", `process.exit(2);\n`);
    const page = `<!doctype html><html><body><button id="go">go</button>\n<script type="module">\nimport { box3d } from "./physics/box3d/box3dLoader.js";\nawait box3d.init();\nconst w = box3d.createWorld({ gravity: [0, 0, 0] }), b = w.addBox({ type: "dynamic", half: [0.05, 0.05, 0.05] });\ndocument.getElementById("go").onclick = () => w.angularImpulse(b, [0, 0, 0.01]);\n</script></body></html>`;
    const res = await C.run({ gates: [one, two], pages: [{ page: "__census_mini.html", site: "__census_mini.html:6", steps: [["click", "#go"], ["wait", 300]] }], extra: { "/__census_mini.html": page } });
    const text = C.serialize(res), back = JSON.parse(text);
    ok("!! run() holds everything the registration names, in its order: the registration, the commit, the cap, the corpus, the six controls, every run, the readings and the decision",
        J(Object.keys(back)) === J(["registration", "commit", "cap", "corpus", "controls", "runs", "readings", "decision"]) && back.registration === C.REGISTRATION && /^[0-9a-f]{40}$/.test(back.commit || "") &&
        back.cap.past === C.PAST && J(back.corpus.n) === J([one, two]) && J(back.corpus.p) === J(["__census_mini.html"]) && J(Object.keys(back.controls)) === J(["transparent", "reads", "jolt", "site", "reach", "complete"]) &&
        ["transparent", "reads", "jolt", "site"].every((k) => back.controls[k].ok === true));
    const n0 = back.runs.n[0], n1 = back.runs.n[1], p0 = back.runs.p[0], mini = back.readings.others.find((o) => o.site === "__census_mini.html:6");
    ok("...every run with how it ended and what it saw, its tally flattened into calls and sites; the page's call found outside the table, past the cap, and so the decision says the cap goes in",
        n0.code === 0 && n0.calls === 1 && n0.instances === 1 && !("tally" in n0) && n1.code === 2 && n1.calls === 0 && p0.completed && p0.box3dStarted && p0.calls === 1 &&
        !!mini && mini.kind === "found" && mini.past === 1 && mini.where === "__census_mini.html" && back.decision.capGoesIn && J(back.decision.past) === J(["__census_mini.html:6"]) &&
        back.controls.complete.ok && !back.controls.reach.ok && back.controls.reach.notReached.length === 14, `${text.length} bytes`);
});

console.log("\n11. THE VERDICT, FROM THE COMMITTED RESULTS (5a14976d)");
await section(() => {
    const bytes = fs.readFileSync(C.DEFAULT_RESULTS), sha = createHash("sha256").update(bytes).digest("hex"), R = JSON.parse(bytes.toString("utf8"));
    ok("the results are the registered run's as committed, unread, at 5a14976d: 196,524 bytes, sha256 12d58bbb4f2d3807, run at e1a56d0d over 156 gates and the four pages",
        bytes.length === 196524 && sha.startsWith("12d58bbb4f2d3807") && R.commit === "e1a56d0d620eb6cbfcb4eebf77ae8b2e57e510f0" && R.corpus.n.length === 156 && J(R.corpus.p) === J(C.PAGES.map((x) => x.page)), sha.slice(0, 16));
    // every site's readings re-derived from the 160 runs' own tallies, and the decision from them by the registered rule
    const runs = [...R.runs.n, ...R.runs.p].map((r) => ({ run: r.run, tally: { run: r.run, instances: r.instances, calls: r.calls, unread: 0, sites: r.sites } }));
    const again = C.readingsOf(runs), strip = (x) => ({ sites: x.sites.map(({ maxAt, ...y }) => y), others: x.others.map(({ maxAt, ...y }) => y), calls: x.calls });
    ok("!! every site's readings, re-derived from the 160 runs' own tallies, are the file's: calls, the largest spin, the calls past the cap, where it was seen", J(strip(again)) === J(strip(R.readings)) && again.calls === 1825058, `${again.calls} calls`);
    const d = C.decide(again);
    ok("!! *** THE DECISION RULE, APPLIED: THE CAP GOES IN *** -- two sites besides the debris have calls past 15 pi x 1.001: ragdoll.html:283 and flesh.html:305", d.capGoesIn && J(d.past) === J(["ragdoll.html:283", "flesh.html:305"]) && J(R.decision) === J(d));
    const site = (x) => again.sites.find((y) => y.site === x);
    ok("!! P1 RIGHT: both pages' shove is past the cap -- the pelvis at 538.52 and 531.73 rad/s, one call each, near the lone box's 531.62", site("ragdoll.html:283").past === 1 && site("flesh.html:305").past === 1 &&
        Math.abs(site("ragdoll.html:283").max - 538.52) < 0.01 && Math.abs(site("flesh.html:305").max - 531.73) < 0.01, `${site("ragdoll.html:283").max.toFixed(2)}, ${site("flesh.html:305").max.toFixed(2)}`);
    const deb = site(C.DEBRIS_SITE);
    ok("!! P2 RIGHT: the debris is past it, its readings taken before its own cap acts -- 217 of 4,942 calls, the largest 2,574,172 rad/s (blob-pages-box3d's own number)", deb.calls === 4942 && deb.past === 217 && Math.round(deb.max) === 2574172);
    ok("P3 NOT TESTED: no gate flies joltRagdoll.js's fling on box3d (its gates fly Jolt), which was the prediction's own condition", site("physics/jolt/joltRagdoll.js:73").calls === 0);
    const reachedModules = C.SITES.filter((x) => x.kind === "module" && x.site !== C.DEBRIS_SITE).map((x) => site(x.site)).filter((x) => x.calls > 0);
    ok("!! P4 RIGHT FOR THE MODULE SITES THAT WERE REACHED, AND ONLY THOSE: none of the four is past the cap -- the 6-DOF stepper's largest 40.00, buildingTopple's 36.00, raceCar's 19.04 over 1.74 million calls, slugShatter's 3.57 -- and five module sites were not reached",
        J(reachedModules.map((x) => x.site)) === J(["world/buildingTopple.mjs:305", "physics/raceCar.mjs:243", "render/slugShatter.mjs:103", "physics/mechanics/rigidBody6dofBox3d.mjs:59"]) && reachedModules.every((x) => x.past === 0 && x.max < C.PAST) &&
        site("physics/raceCar.mjs:243").calls === 1739627, reachedModules.map((x) => `${x.site} ${x.max.toFixed(2)}`).join("; "));
    ok("!! P5 RIGHT: box3d-replay.html's recording is under the cap, 3.23 rad/s at most, as its arithmetic says (0.539 / (1/6))", site("box3d-replay.html:162").calls === 10 && site("box3d-replay.html:162").max < 3.24 && site("box3d-replay.html:162").past === 0);
    const vs = R.runs.p.find((x) => x.page === "box3d-vs-jolt.html");
    ok("!! P6 RIGHT: box3d-vs-jolt.html was not reached -- the page ran its five seconds and never started box3d", site("box3d-vs-jolt.html:49").calls === 0 && vs.completed && !vs.box3dStarted && vs.instances === 0);
    ok("!! P7 RIGHT: the cap goes in", d.capGoesIn);
    ok("!! C-transparent, C-reads, C-jolt, C-site and C-complete held: no gate of the 156 timed out or was stopped, and every page completed its steps",
        ["transparent", "reads", "jolt", "site", "complete"].every((k) => R.controls[k].ok) && R.controls.complete.timedOut.length === 0 && R.controls.complete.crashed.length === 0 && R.runs.p.every((x) => x.completed));
    const notReached = ["physics/kaijuBox3d.js:84", "physics/esHullCombat.js:92", "physics/backendDivergence.mjs:24", "physics/fluidBox3d.js:62", "physics/jolt/joltRagdoll.js:73", "box3d-vs-jolt.html:49"];
    const gsrc = (f) => fs.readFileSync(path.join(ENG, f), "utf8");
    ok("!! C-REACH FAILED, AS IT IS MEANT TO WHEN A SITE GOES UNREACHED, and names six; the census says nothing about them. Each one's reason, read from its gates: the kaiju's, the hull combat's and the fluid's gates fly a mock world, backendDivergence's and the fling's fly Jolt, and the page never starts box3d",
        !R.controls.reach.ok && J(R.controls.reach.notReached) === J(notReached) &&
        /mockWorld/.test(gsrc("physics/kaiju-box3d-selfcheck.mjs")) && /mockWorld/.test(gsrc("physics/es-hull-combat-selfcheck.mjs")) && /mockWorld/.test(gsrc("physics/fluidBox3d-selfcheck.mjs")) &&
        /createJoltBackend/.test(gsrc("render/perceptual-selfcheck.mjs")) && /createJoltBackend/.test(gsrc("physics/jolt/jolt-ragdoll-selfcheck.mjs")) && /createWorld\(/.test(gsrc("box3d-vs-jolt.html")) && !/box3d\.init\(\)/.test(gsrc("box3d-vs-jolt.html")));
    const found = again.others.filter((x) => x.kind === "found");
    ok("!! FOUND OUTSIDE THE TABLE: two calls of box3d's raw export in tools/roundhouse/spinningBody.mjs (lines 209 and 212), 2.00 and 4.16 rad/s, under the cap. The table was a grep for the facade's angularImpulse(); a call of _swk_body_ang_impulse is spelled otherwise",
        J(found.map((x) => x.site)) === J(["tools/roundhouse/spinningBody.mjs:209", "tools/roundhouse/spinningBody.mjs:212"]) && found.every((x) => x.past === 0 && x.max < 4.2) && C.decide(again).past.every((x) => !x.startsWith("tools/")));
    const raw = C.grepCalls().length >= 0 && execFileSync("git", ["grep", "-l", "_swk_body_ang_impulse\\s*(", "--", "*.mjs", "*.js", ":!vendor/**", ":!*selfcheck*"], { cwd: ENG, encoding: "utf8" }).split("\n").filter(Boolean).sort();
    ok("...and a grep for the raw export finds two more files whose calls no gate of the corpus made, so they were not measured: physics/mechanics/rigidKeys.mjs and tools/roundhouse/backendRotation.mjs (beside spinningBody.mjs and the two pass-throughs). Each skips the facade, so the cap will not reach them",
        J(raw) === J(["physics/box3d/box3dLoader.js", "physics/mechanics/rigidKeys.mjs", "render/slugTicker.mjs", "tools/roundhouse/backendRotation.mjs", "tools/roundhouse/spinningBody.mjs"]) &&
        !again.others.some((x) => /rigidKeys|backendRotation/.test(x.site)), raw.join(", "));
});

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\nangularImpulseCensus-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
