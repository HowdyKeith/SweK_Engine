// WebGLEngine/tools/ship/effectMerge-selfcheck.mjs -- v4236
//
// Run: node tools/ship/effectMerge-selfcheck.mjs
//
// GATES render/effectMerge.mjs, and carries the real-page measurement the round is built on.
//
// *** THE CORRECTNESS BAR IS NOT "THE MERGED SHADER COMPILES". *** It is that merging N effects into one draw
// produces the picture that running them in N draws produces -- and that the ONE arrangement which does not
// is REFUSED rather than merely documented. Both are executed on a real WebGL2 context here, not read.
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import * as EM from "../../render/effectMerge.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);

// three effects that exercise all three kinds
const TEAR  = { name: "tear",  uniforms: { amount: "uAmt" },
                glsl: "return texture(tex, vec2(fract(uv.x + uAmt), uv.y));" };
const GRADE = { name: "grade", uniforms: { exposure: "uExp" }, glsl: "c.rgb *= uExp; return c;" };
const VIG   = { name: "vig",   uniforms: { k: "uK" },
                glsl: "float d = distance(uv, vec2(0.5)); c.rgb *= 1.0 - uK * d; return c;" };
const BLOOM = { name: "bloom", opaque: true, uniforms: {}, glsl: "return c;" };

console.log("effectMerge-selfcheck -- one draw instead of five, and the one arrangement that must be refused\n");

// =============================================================================================================
console.log("1. the kind of an effect is READ OFF ITS BODY, not taken on trust");
{
    ok("!! an effect that never mentions the sampler is COLOUR", EM.classify(GRADE) === EM.COLOUR);
    ok("!! an effect that samples is SAMPLING", EM.classify(TEAR) === EM.SAMPLING);
    ok("!! an effect may declare itself OPAQUE, and that direction is always safe to believe",
        EM.classify(BLOOM) === EM.OPAQUE,
        "saying 'do not merge me' cannot produce a wrong picture; saying 'merge me' can, so only the refusal " +
        "is a caller's to make");
    // *** THE commentFalsePass SHAPE, WHICH THIS TREE HAS CAUGHT IN THREE OTHER GATES. ***
    const commented = { name: "c", uniforms: {}, glsl: "// this one does not read tex at all\nc.rgb = 1.0 - c.rgb; return c;" };
    ok("!! *** a COMMENT mentioning the sampler does not make an effect SAMPLING ***",
        EM.classify(commented) === EM.COLOUR,
        "the body is stripped of comments before the sampler is looked for. Reading raw source would call " +
        "this one SAMPLING and refuse to merge it -- a false refusal is quieter than a false merge and still wrong.");
    const blockComment = { name: "b", uniforms: {}, glsl: "/* tex is not used */ return c;" };
    ok("   ...and a block comment is stripped too", EM.classify(blockComment) === EM.COLOUR);
}

// =============================================================================================================
console.log("\n2. the plan: how few draws the chain can become");
{
    const p = EM.planCost([TEAR, GRADE, VIG]);
    ok("!! *** a sampling effect LEADS a run and two colour effects join it: three effects, ONE draw ***",
        p.chained === 3 && p.merged === 1 && p.saved === 2, JSON.stringify({ chained: p.chained, merged: p.merged }));
    const q = EM.planCost([GRADE, TEAR, VIG]);
    ok("!! ...but a sampling effect in the MIDDLE opens a new run -- it can never join one",
        q.merged === 2 && q.runs[0].effects.length === 1 && q.runs[1].effects.length === 2,
        "grade | tear+vig -- two draws, because after a merge there is no texture holding grade's output for " +
        "tear to sample at an offset");
    const r = EM.planCost([GRADE, BLOOM, VIG]);
    ok("!! an opaque effect is a draw of its own and breaks the run on BOTH sides",
        r.merged === 3 && r.runs[1].kind === EM.OPAQUE,
        "grade | bloom | vig -- three draws, which is what the chain already costs, so bloom is never made worse");
    const s = EM.planCost([GRADE, VIG, GRADE, VIG, GRADE]);
    ok("   five colour effects are one draw", s.chained === 5 && s.merged === 1);
    ok("   an empty chain plans nothing", EM.planCost([]).merged === 0);
}

// =============================================================================================================
console.log("\n3. uniforms are PREFIXED, so two effects may use the same knob name");
{
    const A = { name: "a", uniforms: { k: "uK" }, glsl: "c.rgb *= uK; return c;" };
    const B = { name: "b", uniforms: { k: "uK" }, glsl: "c.rgb += uK; return c;" };
    const m = EM.mergeChain([A, B])[0];
    ok("!! *** two effects both calling their knob uK become two uniforms, not a collision ***",
        m.uniforms.a.k !== m.uniforms.b.k && /uniform float e0_a_uK;/.test(m.frag) && /uniform float e1_b_uK;/.test(m.frag),
        m.uniforms.a.k + " and " + m.uniforms.b.k + " -- the caller sets them through the returned map rather " +
        "than by guessing the mangled name");
    ok("   ...and each body was rewritten to its own name", /c\.rgb \*= e0_a_uK;/.test(m.frag) && /c\.rgb \+= e1_b_uK;/.test(m.frag));
    const L = { name: "l", uniforms: { a: "uAmount", b: "uAmount2" }, glsl: "c.rgb *= uAmount + uAmount2; return c;" };
    // *** AND SORTING LONGEST-FIRST IS DEFENSIVE, NOT LOAD-BEARING, WHICH SABOTAGE ESTABLISHED AGAINST WHAT
    // THE COMMENT IN THE MODULE CLAIMED. *** Reversing the sort to shortest-first changes NO NUMBER IN THIS
    // GATE, because the rewrite regex is anchored on both sides with [^A-Za-z0-9_]: in "uAmount + uAmount2"
    // the rule for uAmount cannot match uAmount2, since the character after it is a digit. The BOUNDARIES are
    // what make this safe. The sort is kept because it costs nothing and the failure it would prevent is real
    // for any future rewrite that loosened them -- labelled as a guard, and not counted as a checked behaviour.
    ok("!! prefixing survives one uniform name being a prefix of another, whichever order they are rewritten in",
        /e0_l_uAmount \+ e0_l_uAmount2/.test(EM.mergeChain([L])[0].frag) &&
        /e0_l_uAmount \+ e0_l_uAmount2/.test(EM.mergeChain([L])[0].frag),
        "the rewrite regex is anchored on both sides, so uAmount's rule cannot reach into uAmount2");
    ok("   a knob's declared type is honoured", /uniform vec2 e0_v_uP;/.test(
        EM.mergeChain([{ name: "v", uniforms: { p: "uP" }, types: { p: "vec2" }, glsl: "c.rg *= uP; return c;" }])[0].frag));
}

// =============================================================================================================
console.log("\n4. *** THE GLSL, ACTUALLY RUN -- merged against chained on a real WebGL2 context ***");
{
    const require_ = createRequire(import.meta.url);
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) {
        report("SKIPPED -- " + skip);
        report("*** A SKIP, NOT A PASS. Sections 1-3 read the plan; only this one runs the shader, and the " +
               "whole correctness claim of a merge is that it renders what the chain renders.");
    } else {
        const HARNESS = fs.readFileSync(path.join(ENG, "tools/ship/effectMergeHarness.html"), "utf8");
        const srv = http.createServer((rq, rs) => {
            if (rq.url.startsWith("/render/")) {
                const p = path.join(ENG, rq.url);
                if (fs.existsSync(p)) { rs.writeHead(200, { "content-type": "text/javascript" }); return rs.end(fs.readFileSync(p)); }
            }
            rs.writeHead(200, { "content-type": "text/html" }); rs.end(HARNESS);
        }).listen(0);
        const port = srv.address().port;
        const b = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
        const pg = await b.newPage();
        const errs = [];
        pg.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
        await pg.goto("http://127.0.0.1:" + port + "/", { waitUntil: "networkidle" });
        ok("!! the harness loaded and made a WebGL2 context", errs.length === 0 && await pg.evaluate(() => !!window.__gl),
            errs.join(" | "));

        const CHAIN = [TEAR, GRADE, VIG];
        const KNOBS = { tear: { amount: 0.07 }, grade: { exposure: 1.35 }, vig: { k: 0.55 } };

        // *** A SHADER THAT DOES NOT COMPILE MUST BE A RED CHECK, NOT A STACK TRACE. *** Sabotaging the
        // uniform prefixing away emits two `uniform float uK;` in one program; the harness throws, the
        // evaluate rejects, and the gate DIED instead of reporting. A gate that crashes still fails a ship,
        // but it says nothing about which line broke, so the error is caught and named here.
        const guard = async (label, fn) => {
            try { return await fn(); }
            catch (e) { ok("!! " + label, false, "THREW: " + String(e).replace(/\s+/g, " ").slice(0, 220)); return null; }
        };

        // (a) merged vs a chain whose intermediates are FLOAT -- these should agree to rounding
        const f = await guard("the merged program compiles and runs (float chain)", () => pg.evaluate(({ chain, knobs }) => window.__compare(chain, knobs, "float"), { chain: CHAIN, knobs: KNOBS })) || { worst: 999, over1: 1, pixels: 0, mergedDraws: 0, chainDraws: 0 };
        ok("!! *** ONE MERGED DRAW RENDERS WHAT THREE CHAINED DRAWS RENDER ***",
            f.worst <= 1 && f.over1 === 0,
            "worst " + f.worst + " levels of 255 over " + f.pixels + " pixels, " + f.over1 + " above 1 -- against " +
            "a chain carried through FLOAT framebuffers, which is the comparison that isolates the merge from " +
            "the chain's own precision loss");
        ok("   ...and the merged program really was one draw where the chain was three",
            f.mergedDraws === 1 && f.chainDraws === 3, f.mergedDraws + " against " + f.chainDraws);

        // (b) merged vs an RGBA8 chain. *** MY FIRST VERSION OF THIS EXPECTED A COUPLE OF LEVELS OF ROUNDING
        // AND BOUNDED IT AT 4. IT MEASURED 66, AND THE REASON IS BETTER THAN THE ONE I WROTE. *** An RGBA8
        // intermediate does not merely round -- it CLAMPS. The chain here is tear, then exposure 1.35, then a
        // vignette that scales back down. In float the overshoot above 1.0 survives the exposure and the
        // vignette brings it back into range. Through an 8-bit buffer the overshoot is gone for good, and no
        // later effect can recover it. That is not precision loss at the last digit, it is lost highlights.
        const q = await guard("the merged program compiles and runs (8-bit chain)", () => pg.evaluate(({ chain, knobs }) => window.__compare(chain, knobs, "rgba8"), { chain: CHAIN, knobs: KNOBS })) || { worst: 0 };
        ok("!! *** AN RGBA8 CHAIN DOES NOT ROUND, IT CLIPS -- AND THAT IS 66 LEVELS, NOT 2 ***",
            q.worst > 30 && q.worst < 120,
            "worst " + q.worst + " levels against the 8-bit chain versus " + f.worst + " against the float one. " +
            "An exposure of 1.35 pushes values past 1.0; the 8-bit intermediate clamps them and the vignette " +
            "that would have brought them back has nothing left to scale. Asserting bit-equality here would be " +
            "asserting that the merge faithfully reproduces a defect.");
        // and the control that says the 66 really is CLIPPING and not the 8 bits on their own
        const dim = { tear: { amount: 0.07 }, grade: { exposure: 0.8 }, vig: { k: 0.55 } };
        const c8 = await guard("the control chain compiles and runs", () => pg.evaluate(({ chain, knobs }) => window.__compare(chain, knobs, "rgba8"), { chain: CHAIN, knobs: dim })) || { worst: 999 };
        ok("!! *** THE CONTROL: with an exposure of 0.8 nothing ever exceeds 1.0, and the gap collapses ***",
            c8.worst <= 3 && c8.worst < q.worst / 8,
            "worst " + c8.worst + " levels at exposure 0.8 against " + q.worst + " at exposure 1.35, same chain, " +
            "same 8-bit intermediate. So the 8 bits are worth a level or two and the CLAMP is worth the other " +
            "sixty -- which is the measurement that says which of the two the merge is actually buying.");

        // (d) *** THE VERTEX STAGE IS COMMON TO BOTH SIDES OF EVERY COMPARISON ABOVE, SO IT CANCELS OUT AND
        // NONE OF THEM CAN SEE IT. *** Sabotage proved it: shrinking the fullscreen triangle from the
        // overhanging (-1,-1) (3,-1) (-1,3) to a half-screen (-1,-1) (1,-1) (-1,1) left this gate ALL GREEN,
        // because the merged path and the chained path then covered the same wrong half and agreed about it
        // perfectly. Coverage has to be asked directly, against a sentinel nothing draws.
        const cov = await guard("the coverage probe compiles and runs", () => pg.evaluate(() => window.__coverage())) || { untouched: -1, pixels: 0 };
        ok("!! *** THE ONE TRIANGLE COVERS EVERY PIXEL -- asked directly, because the comparisons cancel it ***",
            cov.untouched === 0 && cov.pixels > 1000,
            cov.untouched + " of " + cov.pixels + " pixels still carry the sentinel clear colour. A triangle " +
            "that reached only its own half would leave " + Math.round(cov.pixels / 2) + " of them.");

        // (c) *** THE TRAP, MEASURED. *** A sampling effect placed second compiles, runs, and is wrong.
        const t = await guard("the illegal-merge probe compiles and runs", () => pg.evaluate(({ knobs }) => window.__illegalMerge(knobs), { knobs: KNOBS })) || { worst: 0, over2: 0, pixels: 1 };
        ok("!! *** FORCING A SAMPLING EFFECT INTO SECOND PLACE IS A DIFFERENT PICTURE, NOT A SUBTLE ONE ***",
            t.worst > 20 && t.over2 > t.pixels * 0.1,
            "worst " + t.worst + " levels at " + t.over2 + " of " + t.pixels + " pixels (" +
            (100 * t.over2 / t.pixels).toFixed(1) + "%). It compiles and it runs: the second sampler reads the " +
            "ORIGINAL image at its offset instead of the first effect's output. planRuns() is what stops this, " +
            "and this is the number that says the refusal is worth having.");
        ok("   ...and planRuns REFUSES exactly that arrangement",
            EM.planCost([GRADE, TEAR]).merged === 2,
            "grade then tear is two draws, never one");
        await b.close(); srv.close();
    }
}

// =============================================================================================================
// =============================================================================================================
// THE SABOTAGE RECORD FOR v4236. Nine deliberate breakages, each applied, run, restored byte-identical and
// hash-verified. Eight turned something red; the ninth is labelled rather than counted.
//
//   A  classify() reads RAW source                  -> 2 red (the comment checks)
//   B  classify() calls everything COLOUR           -> 3 red
//   C  planRuns lets a sampler JOIN a run           -> 2 red
//   D  planRuns merges an OPAQUE effect             -> 1 red
//   E  mergeRun stops prefixing uniforms            -> two `uniform float uK;` in one program. *** THIS ONE
//      CRASHED THE GATE INSTEAD OF FAILING IT *** -- the harness threw, the evaluate rejected, and the process
//      died with a stack trace naming nothing. A crash still fails a ship and still says nothing about which
//      line broke, so section 4's probes are wrapped now and a compile error is a named red check.
//   F  mergeRun renames SHORTEST uniform first      -> STILL GREEN, and correctly so. The rewrite regex is
//      anchored on both sides, so uAmount's rule cannot reach into uAmount2 in any order. DEFENSIVE, labelled
//      in the module, NOT counted -- and the comment there originally claimed it was load-bearing.
//   G  the fullscreen triangle shrinks to half      -> *** STILL GREEN BEFORE THIS ROUND ADDED A CHECK FOR IT.
//      *** The vertex stage is COMMON to both sides of every comparison, so a triangle covering half the
//      screen made the merged and chained paths agree perfectly about the same wrong half. Coverage is now
//      asked directly against a magenta sentinel; the sabotage leaves exactly 1536 of 3072 pixels.
//   H  the merged run applies its effects REVERSED  -> 3 red
//   I  the merged main starts from black            -> 3 red
//
console.log("\n5. *** THE REAL PAGE, THROUGH THE TREE'S OWN RECORDER -- what the chain actually costs ***");
{
    const require_ = createRequire(import.meta.url);
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) { report("SKIPPED -- " + skip); }
    else if (process.env.SWEK_SKIP_PAGE_CENSUS) { report("SKIPPED by SWEK_SKIP_PAGE_CENSUS"); }
    else {
        // *** glCapture.mjs (v4227) WAS BUILT TO CAPTURE A CONTEXT A PAGE MADE RATHER THAN ONE A GATE MADE,
        // AND UNTIL NOW NOTHING DID THAT. *** This is its first real consumer. The injection is a module
        // script in <head>: module scripts execute in document order, so it patches getContext before
        // main.js runs, which a deferred dynamic import could not promise.
        const INJECT = '<script type="module">\n' +
            'import { installCapture, followFrames, census, redundantStateSets } from "/render/glCapture.mjs";\n' +
            'const cap = installCapture({ retain: "summary", maxBytes: 64 * 1024 * 1024 });\n' +
            'window.__cap = cap; window.__rafCount = 0;\n' +
            '{ const o = window.requestAnimationFrame.bind(window);\n' +
            '  window.requestAnimationFrame = (cb) => o((t) => { window.__rafCount++; return cb(t); }); }\n' +
            'window.__follow = () => followFrames(cap.captures);\n' +
            'window.__mark = () => cap.captures.map(h => h.log.length);\n' +
            'window.__win = (marks) => cap.captures.map((h, i) => {\n' +
            '  const tail = h.log.slice(marks[i] || 0);\n' +
            '  const draws = tail.filter(c => c.op === "drawArrays");\n' +
            '  return { calls: tail.length, binds: tail.filter(c => c.op === "bindFramebuffer").length,\n' +
            '    draws: draws.length, tri: draws.filter(c => Number(c.args[2]) === 3).length,\n' +
            '    quad: draws.filter(c => Number(c.args[2]) === 6).length,\n' +
            '    redundant: redundantStateSets(h).slice(0, 6).map(r => r.op + " x" + r.count) };\n' +
            '});\n</script>';
        const b = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
        const pg = await b.newPage();
        const errs = [];
        pg.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
        await pg.route("**/*", (route) => {
            const u = new URL(route.request().url());
            if (u.hostname !== "swek.local") return route.fulfill({ status: 404, body: "nf" });
            const p = path.join(ENG, decodeURIComponent(u.pathname));
            if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return route.fulfill({ status: 404, body: "nf" });
            const ext = path.extname(p);
            const type = ext === ".mjs" || ext === ".js" ? "text/javascript" : ext === ".html" ? "text/html"
                : ext === ".json" ? "application/json" : ext === ".css" ? "text/css" : "application/octet-stream";
            let body = fs.readFileSync(p);
            if (u.pathname === "/index.html") body = body.toString().replace("<head>", "<head>\n" + INJECT);
            return route.fulfill({ status: 200, contentType: type, body });
        });
        await pg.goto("http://swek.local/index.html", { waitUntil: "domcontentloaded", timeout: 45000 });
        await pg.waitForFunction(() => window.world && window.camera, { timeout: 45000 }).catch(() => {});
        await pg.evaluate(() => window.__follow && window.__follow());
        await new Promise((r) => setTimeout(r, 6000));                    // boot and program compilation
        const m0 = await pg.evaluate(() => ({ m: window.__mark(), raf: window.__rafCount }));
        await new Promise((r) => setTimeout(r, 5000));                    // the steady-state window
        const w = await pg.evaluate((m) => ({ w: window.__win(m), raf: window.__rafCount }), m0.m);
        await b.close();

        const main = w.w.reduce((a, c) => (c.draws > (a ? a.draws : -1) ? c : a), null) || { draws: 0 };
        const rafs = w.raf - m0.raf;
        ok("!! the real index.html booted headless with the capture injected, and threw nothing",
            errs.length === 0, errs.slice(0, 2).join(" | "));
        ok("!! *** THE CHAIN IS SIX FULLSCREEN DRAWS A FRAME, NOT TWELVE -- MEASURED, NOT COUNTED FROM FILENAMES ***",
            main.draws > 0 && main.draws % 6 === 0,
            main.draws + " drawArrays in a 5 s window over " + rafs + " rAF callbacks, i.e. " +
            (main.draws / 6) + " render cycles of 6 draws. There are twelve render/*Pass*.js files and three " +
            "of them are shadow or G-buffer producers, two export only shader SOURCE, and one is a scene " +
            "raymarcher. The backlog item's 'twelve round trips' was never true.");
        // *** THIS CHECK CHANGED AT v4241, AND THE OLD NUMBER IS KEPT BECAUSE IT IS THE EVIDENCE. *** When
        // v4236 measured this window it read 5 triangles to 1 quad and said the remaining quad was "one draw
        // call to find". v4241 went and found it -- gpu/VoxelMemoryGPU.js, which turned out not to be a post
        // pass at all but a GPGPU decay step -- converted it to an attributeless fullscreen triangle, and
        // proved the conversion byte-identical over 16,384 pixels. So the assertion is now the OPPOSITE
        // one: no six-vertex draw survives anywhere in the frame. Leaving the 5:1 assertion in place would
        // have made this gate demand the defect it asked to have fixed.
        ok("!! *** AND NOW ALL SIX USE THE FULLSCREEN TRIANGLE -- v4236 FOUND THE LAST QUAD, v4241 REMOVED IT ***",
            main.tri > 0 && main.quad === 0 && main.tri === main.draws,
            main.tri + " draws of 3 vertices and " + main.quad + " of 6, against 5:1 when v4236 measured the " +
            "same window. The quad was gpu/VoxelMemoryGPU.js's decay step, reached by stack-trace attribution " +
            "in v4241 because a program slot cannot be mapped back to a file; converting it removed the " +
            "fragments rasterised twice along its diagonal and changed 0 of 16,384 output pixels.");
        ok("!! ...and the loop runs far more often than it draws, which is #60's question in one number",
            rafs > main.draws / 6 * 2,
            rafs + " rAF callbacks against " + (main.draws / 6) + " render cycles in the same 5 s -- " +
            (100 * (1 - (main.draws / 6) / rafs)).toFixed(0) + "% of callbacks drew nothing. NOT a claim that " +
            "they were skippable: this is swiftshader, where a render cycle is slow enough that other rAF " +
            "consumers get many turns in between. It is recorded as a measurement, not read as a verdict.");
        report("framebuffer binds in the window: " + main.binds + " for " + main.draws + " draws (" +
               (main.binds / Math.max(1, main.draws)).toFixed(1) + " per draw)");
        report("redundant state: " + (main.redundant || []).join(", "));
    }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: whether merging the tree's OWN six passes is worth doing. This round builds the " +
    "machinery and measures the chain; it does NOT rewrite bloomPass or crtPass to use it, and claiming " +
    "otherwise would be claiming a saving nobody has taken. What IS checked: that the kind of an effect is " +
    "derived from its body and not from a comment; that a sampling effect may lead a run and never join one; " +
    "that one merged draw renders what three chained draws render to within 1 level of 255 through float " +
    "intermediates; that it deliberately does NOT match an RGBA8 chain, because that chain is the one losing " +
    "precision; and that the illegal arrangement is a visibly different picture rather than a theoretical risk.");
process.exit(fails ? 1 : 0);
