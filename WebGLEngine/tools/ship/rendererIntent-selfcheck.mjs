// WebGLEngine/tools/ship/rendererIntent-selfcheck.mjs -- v3059
//
// Run: node tools/ship/rendererIntent-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// EVERY RENDERER, CONSTRUCTED AGAINST A CONTEXT THAT ANSWERS, WITH NO GPU.
//
// v2777 found P3dRenderer calling createProgram on a null gl and throwing out of main.js's init. v2778 found
// OvmRenderer doing the same thing one line later, audited "~15 renderers built off the shared context, most
// calling createProgram in their constructor", and concluded that guarding each one was whack-a-mole. The fix
// then was makeStubGL -- a context that never returns null, so every renderer constructs and no-ops.
//
// That fixed the crash and left the question open: WHICH renderers actually survive a context that is merely
// unhelpful? Nobody could answer, because answering needed a GPU. v3058's recording context removes that
// excuse. This walks render/ , constructs everything it can, and reports what happens.
//
// WHAT IS ASSERTED VS WHAT IS REPORTED, kept apart on purpose:
//   ASSERTED -- no renderer throws an error that BLAMES THE CONTEXT (a gl method missing, a null extension
//               dereferenced, a gl object used as a function). That is the v2777/v2778 class, and it is the only
//               class this harness can judge fairly.
//   REPORTED -- everything else. A renderer that needs a scene, a mesh or an asset to construct is NOT broken;
//               it is just not constructible from a context alone. Failing it would train people to add fake
//               arguments until the gate went quiet, which is worse than not checking.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { makeRecordingGL } from "../../render/glBootstrap.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const say = (m) => console.log("  ----  " + m);

// An error that names the CONTEXT is the failure this gate owns. An error about a missing scene is not.
const BLAMES_CONTEXT = /gl\.\w+ is not a function|Cannot read propert\w+ of null \(reading '\w+'\)|getExtension\(\.\.\.\) is null|is not a function \(reading 'create/i;
const blamesContext = (msg, log) => {
    if (BLAMES_CONTEXT.test(msg)) return true;
    // ...or it died immediately after touching the context and never got anywhere else
    return /createProgram|createShader|createTexture|getExtension|createBuffer/.test(msg);
};

function classify(err, rec) {
    const msg = String((err && err.message) || err);
    return { msg, context: blamesContext(msg, rec.log), calls: rec.calls() };
}

const files = fs.readdirSync(path.join(ENG, "render")).filter((f) => f.endsWith(".js")).sort();

const results = { constructed: [], needsMore: [], contextBlamers: [], unimportable: [] };

for (const f of files) {
    let mod;
    try { mod = await import(pathToFileURL(path.join(ENG, "render", f)).href); }
    catch (e) { results.unimportable.push({ f, msg: String(e.message).slice(0, 60) }); continue; }

    for (const [name, Cls] of Object.entries(mod)) {
        if (typeof Cls !== "function" || !/^[A-Z]/.test(name)) continue;
        if (!/^class[\s{]/.test(Function.prototype.toString.call(Cls))) continue;   // classes only, not factories
        // TRY EVERY CALLING CONVENTION BEFORE BLAMING ANYONE. The first version of this harness passed the
        // context positionally and reported WaterField as a context failure -- but WaterField's constructor is
        // `constructor(opts = {})`, so it was handed a recorder where it expected options. Blaming a renderer for
        // the harness's own calling convention is precisely the hazard this file warns about two paragraphs up,
        // committed by the file itself on its first run.
        const SHAPES = [
            ["(gl)", (gl) => new Cls(gl)],
            ["(gl, {})", (gl) => new Cls(gl, {})],
            ["({gl})", (gl) => new Cls({ gl })],
            ["({gl, canvas})", (gl) => new Cls({ gl, canvas: { width: 64, height: 64 } })],
        ];
        let built = null, lastErr = null, lastRec = null, shape = "";
        for (const [label, make] of SHAPES) {
            const rec = makeRecordingGL({ width: 64, height: 64 });
            try { built = { inst: make(rec.gl), rec }; shape = label; break; }
            catch (e) { lastErr = e; lastRec = rec; }
        }
        if (built) results.constructed.push({ f, name, shape, calls: built.rec.calls(), dead: built.inst && built.inst.dead === true });
        else {
            const c = classify(lastErr, lastRec);
            (c.context ? results.contextBlamers : results.needsMore).push({ f, name, ...c });
        }
    }
}

// --- 1. THE ASSERTION -------------------------------------------------------------------------------------
{
    say("walked " + files.length + " modules in render/");
    say("constructed from a context alone: " + results.constructed.length +
        "   |   need more than a context: " + results.needsMore.length +
        "   |   unimportable in Node: " + results.unimportable.length);
    ok("!! NO RENDERER FAILS BY BLAMING THE CONTEXT",
        results.contextBlamers.length === 0,
        results.contextBlamers.length
            ? results.contextBlamers.map((r) => r.name + " (" + r.f + "): " + r.msg.slice(0, 70)).join("  |  ")
            : "the v2777/v2778 class -- createProgram on a null gl, a null extension dereferenced -- is now checked for every renderer at once, not one at a time as each one crashes a page");
    ok("the walk is meaningful: it really constructed a substantial number of them",
        results.constructed.length >= 15, results.constructed.length + " constructed");
    const byShape = {};
    for (const r of results.constructed) byShape[r.shape] = (byShape[r.shape] || 0) + 1;
    say("calling conventions found: " + Object.entries(byShape).map(([k, v]) => k + " x" + v).join(", "));
    ok("...and several of them actually issued GL commands, so the context was exercised",
        results.constructed.filter((r) => r.calls > 0).length >= 5,
        results.constructed.filter((r) => r.calls > 0).length + " issued at least one call");
}

// --- 2. WHAT COULD NOT BE JUDGED, said out loud -------------------------------------------------------------
{
    for (const r of results.unimportable) say("NOT IMPORTABLE in Node: " + r.f + " -- " + r.msg);
    for (const r of results.needsMore.slice(0, 8)) say("needs more than a context: " + r.name + " (" + r.f + ") -- " + r.msg.slice(0, 60));
    if (results.needsMore.length > 8) say("...and " + (results.needsMore.length - 8) + " more");
    ok("modules that cannot be imported in Node are REPORTED, not silently skipped",
        results.unimportable.every((r) => typeof r.msg === "string" && r.msg.length > 0),
        "a page-only module is not a failure, but a harness that hid them would overstate its own coverage");
}

// --- 3. THE HARNESS CAN FAIL. Without this, section 1 is a control that cannot fail -------------------------
{
    // (a) the exact v2778 shape: dereferencing an extension the context does not have
    class NullExtRenderer { constructor(gl) { const e = gl.getExtension("EXT_color_buffer_float"); e.something(); } }
    const r1 = makeRecordingGL({ width: 8, height: 8 });
    let caught1 = null;
    try { new NullExtRenderer(r1.gl); } catch (e) { caught1 = classify(e, r1); }
    ok("!! SABOTAGE(null extension dereferenced): caught and BLAMED ON THE CONTEXT",
        caught1 !== null && caught1.context === true, caught1 ? caught1.msg.slice(0, 60) : "did not throw");

    // (b) a renderer that needs a scene must NOT be classified as a context failure
    class NeedsScene { constructor(gl, scene) { this.n = scene.meshes.length; } }
    const r2 = makeRecordingGL({ width: 8, height: 8 });
    let caught2 = null;
    try { new NeedsScene(r2.gl, {}); } catch (e) { caught2 = classify(e, r2); }
    ok("!! ...and a missing SCENE is not mistaken for a broken context",
        caught2 !== null && caught2.context === false, caught2 ? caught2.msg.slice(0, 60) : "did not throw");

    // (c) a healthy renderer constructs and records
    class Healthy { constructor(gl) { this.p = gl.createProgram(); gl.useProgram(this.p); } }
    const r3 = makeRecordingGL({ width: 8, height: 8 });
    new Healthy(r3.gl);
    ok("...and a healthy renderer records its commands", r3.count("createProgram") === 1 && r3.count("useProgram") === 1);
}

console.log("rendererIntent-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
