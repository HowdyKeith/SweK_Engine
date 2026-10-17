import path from "node:path";
// WebGLEngine/render/renderNow-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node render/renderNow-selfcheck.mjs
//
// *** KEITH'S RIG PRINTED `THREE.Renderer: "renderAsync()" has been deprecated` ON fsr-three.html. *** three r181 deprecated
// renderer.renderAsync(scene, camera) and logs it ONCE PER LOAD, so a single call left anywhere on a page's path keeps the line
// alive: migrating the page's own thirteen calls would have left it printing from the nine modules under it. render/renderNow.mjs
// is the call without the deprecation -- `await renderer.init()` unless the renderer says it is initialised, then render() --
// and this gate holds the three things that migration rests on:
//   1. THE HELPER DOES WHAT renderAsync DID, in the same order: init finishes before the render starts, the scene and camera
//      arrive as given, a renderer that already says it is initialised is not asked again, an init that fails stops the render,
//      and the return is a promise that rejects (never throws) like the call it replaces;
//   2. THE CLAIM IT COPIES IS STILL TRUE of the vendored renderers: both three.webgpu.js builds in the tree define renderAsync
//      as a warning, `await this.init()` and `this.render(scene, camera)` and nothing else -- a vendor upgrade that makes it do
//      more (a flush, a resize, a pass) fails here instead of drawing a different picture;
//   3. NOTHING ON A PAGE'S PATH CALLS THE DEPRECATED NAME: every non-gate source file in the tree is scanned, and every file that
//      uses the helper imports it from render/renderNow.mjs (an import left out is a ReferenceError at the first frame, which no
//      source scan of the call sites would see).
//
// WHAT IT DOES NOT CHECK, SAID PLAINLY: a real three.js renderer in node (the fx/fsr gates drive every migrated module through
// the real vendored three in a browser and are green with the helper in place, which is what exercises it end to end); and the
// ~110 renderAsync calls inside the *-selfcheck.mjs files, which are left on the old name -- their pages are headless and
// nobody reads their console, and rewriting a gate's own scene calls would be a change to what a gate measures for no reader's
// benefit. The scan excludes exactly those files, by name, so a page or module cannot hide behind the exemption.
//
// SABOTAGE LOG (each mutant applied in place with the original saved beside it, run, restored; a 0-red is a finding):
//   S1  render before init                                      -> 4 red (the order row, the idempotent row, the argument row)
//   S2  init never asked                                        -> 5 red
//   S3  init asked even when the renderer says it is initialised -> 2 red (the 'not asked again' row and the second-call row)
//   S4  init started and not awaited                            -> 5 red (render lands between init> and init<)
//   S5  camera dropped from the render call                     -> 4 red
//   S6  FIRST ATTEMPT WAS A FINDING: `export function` with an await inside is a SyntaxError, so the gate crashed with exit 1 and
//       ZERO FAIL lines -- a mutant that cannot load tests nothing. Replaced by three that do load:
//   S6a fire-and-forget, returns undefined                      -> 7 red (leads with 'it returns a promise')
//   S6b init not awaited, render synchronous                    -> 6 red
//   S6c an initialised renderer's render() throws SYNCHRONOUSLY out of the call, everything else right -> 1 red, by name
//   S7  init error swallowed                                    -> 1 red (the rejection row)
//   S8  renderer.renderAsync( put back in render/opticalFlowTsl.mjs -> 1 red, naming the file
//   S9  import removed from render/translucentLayer.mjs         -> 1 red, naming the file
//   S10 import points at render/renderNowX.mjs in fx/fsr/fsr3Tsl.mjs -> 1 red, naming the file
//   S11 fsr-three.html forgets its import                       -> 1 red, naming the page
//   S12 vendored three-webgpu renderAsync gains `this.flush()`  -> 1 red, naming the build
//   S13 vendored three-webgpu-r185 renderAsync renders before init -> 1 red, naming the build
//   S14 tsl-rig.html stops using the helper                     -> 2 red (the floor, and the named file)
//   Nothing went 0-red apart from S6's crash. Two of the fourteen go red on ONE row each by design (S8-S13): they are census rows.
"use strict";

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderNow } from "./renderNow.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// --- 1. THE HELPER, AGAINST FAKE RENDERERS -------------------------------------------------------------------------
{
    say("1. renderNow AGAINST RENDERERS THAT RECORD WHAT THEY ARE ASKED.");
    const tick = (ms) => new Promise((r) => setTimeout(r, ms));
    // init takes real time, so a helper that does not await it renders first and the event order shows it
    const mk = (extra = {}) => {
        const ev = [];
        const r = {
            ev,
            init: async () => { ev.push("init>"); await tick(8); ev.push("init<"); if (r.becomesInitialised) r.initialized = true; },
            render: (s, c) => { ev.push("render:" + s + "," + c); },
            ...extra,
        };
        return r;
    };
    const a = mk({ initialized: false });
    const pa = renderNow(a, "S", "C");
    ok("it returns a promise, as the call it replaces did", pa && typeof pa.then === "function");
    ok("...and that promise resolves to nothing", (await pa) === undefined);
    ok("!! an uninitialised renderer: init starts, init FINISHES, then the render -- in that order",
        JSON.stringify(a.ev) === JSON.stringify(["init>", "init<", "render:S,C"]), a.ev.join(" "));
    const b = mk({ initialized: true });
    await renderNow(b, "S", "C");
    ok("!! a renderer that says it is initialised is not asked to init again", JSON.stringify(b.ev) === JSON.stringify(["render:S,C"]), b.ev.join(" "));
    const c = mk();
    await renderNow(c, "S", "C");
    ok("a renderer that does not say (the vendored r186 has no public getter) is asked: init() is idempotent",
        JSON.stringify(c.ev) === JSON.stringify(["init>", "init<", "render:S,C"]), c.ev.join(" "));
    const d = mk({ initialized: false, becomesInitialised: true });
    await renderNow(d, "S", "C"); await renderNow(d, "S", "C");
    ok("the second call on a renderer the first one initialised does not init again",
        d.ev.filter((e) => e === "init>").length === 1 && d.ev.filter((e) => e.startsWith("render")).length === 2, d.ev.join(" "));
    const e = mk({ initialized: false });
    await renderNow(e, { scene: 1 }, { camera: 2 });
    ok("the scene and the camera arrive as the same objects, in that order",
        e.ev[2] === "render:[object Object],[object Object]" && (() => {
            let got; const r = mk({ initialized: true, render: (s, cc) => { got = [s, cc]; } });
            const s = {}, cam = {}; renderNow(r, s, cam); return got[0] === s && got[1] === cam;
        })());
    const boom = new Error("init failed");
    const f = mk({ initialized: false, init: async () => { f.ev.push("init>"); throw boom; } });
    let thrown = null; try { await renderNow(f, "S", "C"); } catch (x) { thrown = x; }
    ok("!! an init that fails rejects the call with that error and NEVER renders", thrown === boom && !f.ev.some((x) => x.startsWith("render")), f.ev.join(" "));
    const g = mk({ initialized: true, render: () => { throw new Error("draw failed"); } });
    let sync = false, rejected = null, pg;
    try { pg = renderNow(g, "S", "C"); } catch { sync = true; }
    if (!sync) { try { await pg; } catch (x) { rejected = x; } }
    ok("!! a render that throws REJECTS the promise -- it does not throw out of the call, as renderAsync's would not",
        sync === false && rejected && rejected.message === "draw failed");
}

// --- 2. THE CLAIM IT COPIES -----------------------------------------------------------------------------------------
{
    say("2. WHAT renderAsync IS, IN EVERY VENDORED three.webgpu.js.");
    const builds = ["vendor/three-webgpu/three.webgpu.js", "vendor/three-webgpu-r185/three.webgpu.js"];
    for (const rel of builds) {
        const file = path.join(ENG, rel);
        if (!existsSync(file)) { ok(rel + " exists", false); continue; }
        const src = readFileSync(file, "utf8");
        const start = src.indexOf("async renderAsync( scene, camera ) {");
        const end = start < 0 ? -1 : src.indexOf("\n\t}\n", start);
        const body = start < 0 ? "" : src.slice(start + "async renderAsync( scene, camera ) {".length, end)
            .replace(/\/\/[^\n]*/g, (m) => (/^\/\/ @deprecated/.test(m) ? "" : m))
            .replace(/warnOnce\(\s*(['"`])(?:(?!\1)[\s\S])*\1\s*\);/g, "")   // the message holds a ';', so match the quoted string
            .replace(/\/\/[^\n]*/g, "")
            .replace(/\s+/g, " ").trim();
        ok("!! " + rel + ": renderAsync is the warning, `await this.init()` and `this.render( scene, camera )` and nothing else",
            body === "await this.init(); this.render( scene, camera );", JSON.stringify(body));
        ok(rel + ": it is marked @deprecated there (the reason this helper exists)",
            start >= 0 && /@deprecated/.test(src.slice(Math.max(0, start - 400), start)));
    }
}

// --- 3. THE CENSUS --------------------------------------------------------------------------------------------------
{
    say("3. NO NON-GATE SOURCE CALLS THE DEPRECATED NAME, AND EVERY USER OF THE HELPER IMPORTS IT.");
    const SKIP = new Set(["node_modules", ".git", "vendor", "rt", "__pycache__"]);
    const files = [];
    (function walk(dir) {
        for (const name of readdirSync(dir)) {
            if (SKIP.has(name)) continue;
            const q = path.join(dir, name);
            if (statSync(q).isDirectory()) { walk(q); continue; }
            if (/\.(html|mjs|js)$/.test(name)) files.push(q);
        }
    })(ENG);
    const rel = (f) => path.relative(ENG, f).split(path.sep).join("/");
    const isGate = (f) => /-selfcheck\.mjs$/.test(f);
    const code = (f) => readFileSync(f, "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    const callers = files.filter((f) => !isGate(f) && /\.renderAsync\s*\(/.test(code(f))).map(rel);
    ok("!! no page or module outside the gates calls renderer.renderAsync(", callers.length === 0, callers.length ? callers.join(", ") : "none of " + files.filter((f) => !isGate(f)).length + " files");

    const users = files.filter((f) => /\brenderNow\s*\(/.test(code(f)) && rel(f) !== "render/renderNow.mjs" && !isGate(f));
    const unimported = [];
    for (const f of users) {
        const src = code(f);
        const m = [...src.matchAll(/import\s*\{[^}]*\brenderNow\b[^}]*\}\s*from\s*["']([^"']+)["']/g)];
        const target = m.map((x) => x[1]).map((spec) => (spec.startsWith("/") ? path.join(ENG, spec) : path.resolve(path.dirname(f), spec)));
        const want = path.join(ENG, "render", "renderNow.mjs");
        if (!target.some((t) => path.resolve(t) === want)) unimported.push(rel(f));
    }
    ok("!! every file that calls renderNow imports it from render/renderNow.mjs (a missing import is a ReferenceError on the first frame)",
        unimported.length === 0, unimported.length ? unimported.join(", ") : users.length + " files");
    ok("the migration reached the files it should (a floor, so an emptied scan cannot pass): at least 15 users", users.length >= 15, users.length + " users");
    for (const must of ["fsr-three.html", "tsl-rig.html", "three-probe.html", "fx/fsr/fsrTsl.mjs", "fx/fsr/fsr3Tsl.mjs", "render/translucentLayer.mjs", "render/threeWorkarounds.mjs"]) {
        ok("  " + must + " uses the helper", users.map(rel).includes(must));
    }
}

console.log(fails ? `\nrenderNow-selfcheck: ${fails} FAILED` : "\nrenderNow-selfcheck: ALL GREEN");
if (!fails) console.log("unchecked here: a real three.js renderer driven in node; the renderAsync calls inside the *-selfcheck.mjs files, left on the old name on purpose; and any page that reaches the deprecated name through a CDN three rather than the vendored builds.");
process.exit(fails ? 1 : 0);
