// WebGLEngine/tools/ship/postChain-selfcheck.mjs -- v4241, rewritten at v4242
//
// Run: node tools/ship/postChain-selfcheck.mjs
//
// *** v4236 MEASURED THE POST CHAIN AND GOT THREE THINGS WRONG. v4241 FOUND THOSE THREE AND ADDED A FOURTH.
// v4242 IS THE ROUND THAT ASKED THE PAGE INSTEAD OF READING IT. ***
//
// v4236 reported "six fullscreen draws per render cycle, five already using the fullscreen triangle, one
// still a quad", and filed the quad as a post-processing pass to track down. All three parts were wrong,
// because its classifier called any drawArrays of six vertices or fewer "fullscreen-ish" and had no way to
// say WHICH FILE was calling. A program slot cannot be mapped back to a source file -- glCapture interns
// objects, and the byte budget drops long shader sources before a fragment shader could be matched to a
// pass. What CAN name a file is the CALL STACK, so this file wraps drawArrays on the real page and reads it.
//
// *** AND THEN v4241, HOLDING CORRECT PER-LINE ATTRIBUTION, STILL DESCRIBED THE RESULT WRONG. *** It called
// the five bloomPass draws "one pass's downsample and upsample ladder". Read the attributed lines: 719 is
// the brightness extract, 729 the horizontal blur, 736 the vertical blur, 750 is SSAO, 818 the composite.
// There is no ladder. There is a single half-res two-tap blur -- and a draw that is not part of bloom at all.
//
// *** THE FOURTH MISTAKE WAS MANUFACTURED BY THIS FILE'S OWN CHECK, AND IT IS THE ONE WORTH KEEPING. *** The
// old section 1 asked `!!window.ssao.enabled` and asserted the answer was false. window.ssao has never had
// an `enabled` property -- its keys are off, on, setBias, setRadius, setStrength, status. `!!undefined` is
// false, so the assertion passed, and the gate reported "SSAO is disabled at boot". SSAO was running the
// whole time at strength 0.85, and its draw is one of the five v4241 attributed to the imaginary ladder.
//
//     A PROBE FOR A BOOLEAN MUST ESTABLISH THAT THE PROPERTY EXISTS BEFORE READING IT, because
//     `!!obj.missingProp` and `!!obj.falseProp` are the same value and a typo therefore reads as a finding.
//
// *** SO THIS ROUND STOPPED ASSERTING A NUMBER AND STARTED MEASURING CONFIGURATIONS. *** The frame is not
// "six draws". It is six with SSAO on, five with it off, seven with phosphor on, and eight when the sun is
// high enough for god rays -- a draw gated on the TIME OF DAY, which no toggle can force. Both earlier
// rounds reported a property of one configuration as a property of the engine.
//
// *** AND THE ANSWER TO #113 IS NOT THE ONE THE ITEM EXPECTED. *** v4241 closed by saying "a frame with three
// swiftShader effects switched on is exactly the mergeable chain effectMerge was built for", and proposed
// driving the real UI to reach it. That frame cannot exist. swiftShaderPass builds its OWN canvas and its
// OWN GL context (swiftShaderPass.js:914, :917) and never mounts it -- its header says so in as many words,
// "an OFF-SCREEN pass by design, not another link in the phosphor/bloom chain". crtPass and
// cameraEffectsPass are not imported by main.js at all. window.transitions is a factory -- check, describe,
// make -- and nothing mounts what make() returns. Phosphor is the ONE optional pass that adds a draw here.
//
// Which leaves the real reason effectMerge has no caller, one level below where v4241 left it: THERE IS NO
// CHAIN TO MERGE. No list of enabled effects, no chain object, no order. bloom and phosphor are joined by a
// hand-written if/else at main.js:30807-30823. A merger needs a sequence, and the sequence is not data.
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { QUAD_VS, TRI_VS, DECAY_FS } from "../../gpu/VoxelMemoryGPU.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);

console.log("postChain-selfcheck -- what the frame actually draws, attributed to a file and a line\n");

const require_ = createRequire(import.meta.url);
const { chromium, from: pwFrom } = resolvePlaywright(require_);
const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);

// =============================================================================================================
console.log("1. *** THE CENSUS, BY CALL SITE, ACROSS CONFIGURATIONS -- which is what v4241 still did not do ***");
if (skip) {
    report("SKIPPED -- " + skip);
    report("*** A SKIP, NOT A PASS. This whole section is a measurement of the real page; there is nothing " +
           "here that reading the source could substitute for, which is the point v4236 proved the hard way.");
} else {
    const INJECT = '<script>\n' +
        'window.__draws = new Map();\n' +
        '(function(){\n' +
        '  const patch = (proto) => {\n' +
        '    if (!proto || !proto.drawArrays || proto.__patched) return;\n' +
        '    proto.__patched = true;\n' +
        '    const orig = proto.drawArrays;\n' +
        '    proto.drawArrays = function (mode, first, count) {\n' +
        '      try {\n' +
        '        const st = new Error().stack.split("\\n").slice(2, 5)\n' +
        '          .map(s => (s.match(/\\/([A-Za-z0-9_.-]+\\.(?:js|mjs|html)):(\\d+)/) || [])[0] || "")\n' +
        '          .filter(Boolean).join(" <- ");\n' +
        '        const k = count + "|" + st;\n' +
        '        window.__draws.set(k, (window.__draws.get(k) || 0) + 1);\n' +
        '      } catch (e) {}\n' +
        '      return orig.call(this, mode, first, count);\n' +
        '    };\n' +
        '  };\n' +
        '  patch(window.WebGL2RenderingContext && window.WebGL2RenderingContext.prototype);\n' +
        '  patch(window.WebGLRenderingContext && window.WebGLRenderingContext.prototype);\n' +
        '})();\n' +
        'window.__reset = () => window.__draws.clear();\n' +
        'window.__dump = () => [...window.__draws].map(([k, n]) => {\n' +
        '  const i = k.indexOf("|");\n' +
        '  return { count: +k.slice(0, i), site: k.slice(i + 1), calls: n };\n' +
        '}).sort((a, b) => b.calls - a.calls);\n' +
        '</script>';
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
    await new Promise((r) => setTimeout(r, 6000));              // boot and program compilation

    /**
     * One measurement window: apply a configuration, let it settle, then count draws for 4 s.
     *
     * *** THE SETTLE IS NOT POLITENESS. *** Several of these knobs are re-read by the render loop every
     * frame, so a window opened immediately after the toggle would straddle two configurations and average
     * them. Anything measured across a straddle is a blend of two answers and reads as neither.
     */
    // *** AND THE SETUP IS AN EXPRESSION, NOT A FUNCTION LITERAL, WHICH COST THIS ROUND FOUR RED CHECKS. ***
    // page.evaluate(string) EVALUATES the string; a string that reads "() => window.ssao.off()" evaluates to
    // a function object and is never called. Every toggle below silently did nothing, all four comparisons
    // came back "no change", and "no change" is exactly what a real negative result looks like -- so the
    // failure was indistinguishable from a finding until the value was read back.
    const windowOf = async (setup) => {
        await pg.evaluate(setup);
        await new Promise((r) => setTimeout(r, 1200));
        await pg.evaluate(() => window.__reset());
        await new Promise((r) => setTimeout(r, 4000));
        return pg.evaluate(() => window.__dump());
    };
    const NOOP = "void 0";
    const sitesOf = (d) => new Set(d.map((x) => x.site.split(" <- ")[0]));
    const bloomLines = (d) => [...new Set(d.filter((x) => /bloomPass\.js/.test(x.site))
        .map((x) => (x.site.match(/bloomPass\.js:(\d+)/) || [])[1]))].sort((a, b) => a - b);

    // #86 DISCIPLINE: THE SAME CONFIGURATION TWICE, BEFORE ANY DELTA IS READ. Two windows over one unchanged
    // page bound what "no change" looks like here, and every comparison below is read against that bound.
    const readBack = () => pg.evaluate(() => ({ ssao: window.ssao.status().strength,
                                                phos: !!window.phosphor.status().enabled }));
    const baseA = await windowOf(NOOP);
    const baseB = await windowOf(NOOP);
    const offSSAO = await windowOf("window.ssao.off()");     const afterOff = await readBack();
    const onSSAO  = await windowOf("window.ssao.on()");      const afterOn  = await readBack();
    const onPhos  = await windowOf("window.phosphor.set(true)");  const afterPhosOn  = await readBack();
    const offPhos = await windowOf("window.phosphor.set(false)"); const afterPhosOff = await readBack();

    // What the page says about itself, asked WITHOUT the property-existence bug that section 1 shipped last
    // round. `has` records whether the key is present at all; `strength` is the value that actually decides
    // whether the draw happens.
    const probe = await pg.evaluate(() => ({
        ssaoHasEnabled: Object.prototype.hasOwnProperty.call(window.ssao, "enabled"),
        ssaoEnabledRead: !!window.ssao.enabled,
        ssaoStrength: window.ssao.status().strength,
        ssaoKeys: Object.keys(window.ssao).sort(),
        transitionKeys: Object.keys(window.transitions).sort(),
        godrays: window._gfxSettings ? window._gfxSettings.godrays : null,
        phosphorOk: window.phosphor.status().ok,
        canvases: document.querySelectorAll("canvas").length,
    }));
    const swift = await pg.evaluate(() => {
        const before = document.querySelectorAll("canvas").length;
        const src = document.createElement("canvas"); src.width = 32; src.height = 32;
        const c2 = src.getContext("2d"); c2.fillStyle = "#0f0"; c2.fillRect(0, 0, 32, 32);
        const r = window.swiftShader.render("emboss", src);
        // *** THE RETURNED CANVAS IS NOT IN THE DOCUMENT, so counting document canvases was the wrong
        // instrument and read 15 before and 15 after. Detachment is the STRONGER fact: the pass renders into
        // a canvas that was never mounted, which is what "off-screen" means.
        return { ok: !!r.ok, error: r.error || null, before,
                 after: document.querySelectorAll("canvas").length,
                 ownCanvas: !!(r.canvas && r.canvas !== src),
                 detached: !!(r.canvas && !document.contains(r.canvas)),
                 ownContext: !!(r.canvas && r.canvas.getContext("webgl2") !== null) };
    });
    await b.close();

    ok("!! the real index.html booted headless with drawArrays wrapped, and threw nothing",
        errs.length === 0, errs.slice(0, 2).join(" | "));
    for (const d of baseA) report(String(d.calls).padStart(4) + " draws of " + d.count + " verts   " + d.site);

    // ---- the noise floor -------------------------------------------------------------------------------
    const sameSites = [...sitesOf(baseA)].sort().join("|") === [...sitesOf(baseB)].sort().join("|");
    const cyc = (d) => Math.min(...d.filter((x) => /bloomPass\.js/.test(x.site)).map((x) => x.calls));
    ok("!! *** THE NOISE FLOOR: the same configuration twice, before any delta is read ***",
        sameSites,
        "two 4 s windows over one unchanged page produced the SAME " + sitesOf(baseA).size + " call sites. " +
        "Render cycles differed (" + cyc(baseA) + " vs " + cyc(baseB) + "), so COUNTS are noisy here and the " +
        "SITE SET is not -- which is why every comparison below is read on sites, not on totals.");

    // ---- what the five bloom draws actually are --------------------------------------------------------
    // *** v4241 SAID THESE FIVE WERE "ONE PASS'S DOWNSAMPLE AND UPSAMPLE LADDER". THEY ARE NOT. *** Reading
    // render/bloomPass.js at the attributed lines: 719 is the brightness extract, 729 the horizontal blur,
    // 736 the vertical blur, 750 is SSAO, and 818 is the composite. There is no ladder -- one half-res
    // two-tap blur, and a draw that is not part of bloom at all.
    const base5 = bloomLines(baseA), off4 = bloomLines(offSSAO), on5 = bloomLines(onSSAO);
    ok("!! *** THE FIFTH bloomPass DRAW IS SSAO, AND TURNING SSAO OFF REMOVES EXACTLY IT ***",
        afterOff.ssao === 0 && base5.length === 5 && off4.length === 4 && !off4.includes("750") && base5.includes("750"),
        "bloomPass lines " + base5.join(",") + " at boot; " + off4.join(",") + " with window.ssao.off() " +
        "(strength read back as " + afterOff.ssao + ", so the toggle demonstrably took). " +
        "Line 750 and only line 750 disappears. That is the SSAO draw named by the frame rather than by me " +
        "reading the file -- and it is the check that would have caught the mistake below.");
    ok("!! ...and switching it back on restores the same five sites",
        afterOn.ssao > 0 && on5.join(",") === base5.join(","),
        on5.join(",") + " against " + base5.join(",") + ", strength back to " + afterOn.ssao);

    // ---- the false pass this gate shipped last round ---------------------------------------------------
    // *** THE CHECK THAT WAS HERE READ `window.ssao.enabled`, WHICH HAS NEVER EXISTED. *** !!undefined is
    // false, the assertion `ssao === false` therefore PASSED, and the gate reported SSAO disabled at boot.
    // SSAO was running the whole time -- ssaoStrength defaults to 0.85 -- and its draw is one of the five
    // v4241 attributed to bloom's imaginary ladder. A probe for a boolean must establish that the property
    // EXISTS before reading it, because `!!obj.missingProp` and `!!obj.falseProp` are the same value.
    ok("!! *** SSAO IS ON AT BOOT -- v4241 REPORTED IT DISABLED, AND ITS OWN PROBE MANUFACTURED THAT ***",
        probe.ssaoHasEnabled === false && probe.ssaoEnabledRead === false && probe.ssaoStrength > 0,
        "window.ssao has no 'enabled' key (its keys are " + probe.ssaoKeys.join(", ") + "), so the old " +
        "check's !!window.ssao.enabled read " + probe.ssaoEnabledRead + " and passed. The value that decides " +
        "the draw is strength = " + probe.ssaoStrength + ", and the draw at bloomPass.js:750 is in every " +
        "default frame above.");
    ok("!! ...so the frame is 6 draws WITH SSAO and 5 without -- the count was never a constant",
        sitesOf(baseA).size === 6 && sitesOf(offSSAO).size === 5,
        sitesOf(baseA).size + " sites at boot, " + sitesOf(offSSAO).size + " with SSAO off. Both v4236 and " +
        "v4241 reported 'six draws' as a property of the engine; it is a property of one configuration.");

    // ---- phosphor: the only optional pass that is IN the frame -----------------------------------------
    const phosOn = [...sitesOf(onPhos)].some((s) => /phosphorPass\.js/.test(s));
    const phosOff = [...sitesOf(offPhos)].some((s) => /phosphorPass\.js/.test(s));
    ok("!! *** PHOSPHOR IS THE ONLY NAMED OPTIONAL PASS THAT ADDS A DRAW TO THIS FRAME ***",
        probe.phosphorOk && afterPhosOn.phos === true && afterPhosOff.phos === false && phosOn && !phosOff,
        "window.phosphor.set(true) adds a phosphorPass draw site (" + sitesOf(onPhos).size + " sites, from " +
        sitesOf(baseA).size + "); set(false) removes it again (" + sitesOf(offPhos).size + "). It is wired at " +
        "main.js:30820 by pointing bloomPass.outputFBO at phosphorPass.inputFBO -- by hand, in an if/else.");

    // ---- and the other four CANNOT be switched on, for four different reasons --------------------------
    // *** THIS IS THE ANSWER TO #113 AND IT IS NOT THE ONE THE ITEM EXPECTED. *** v4241 closed by saying "a
    // frame with three swiftShader effects switched on is exactly the mergeable chain effectMerge was built
    // for", and proposed driving the real UI to get there. There is no UI to drive: three of the five named
    // passes cannot enter this frame at all, and the reasons are structural rather than a missing toggle.
    ok("!! *** swiftShaderPass CAN NEVER JOIN THIS FRAME: IT BUILDS ITS OWN CANVAS AND ITS OWN GL CONTEXT ***",
        swift.ok && swift.ownCanvas && swift.detached && swift.ownContext,
        "render() returned a canvas that is not in the document at all (document canvas count unchanged at " +
        swift.before + ", because the pass never mounts it). swiftShaderPass.js:914 creates the canvas and " +
        ":917 takes its own webgl2 context on it. " +
        "Its own header says so -- 'an OFF-SCREEN pass by design, not another link in the phosphor/bloom " +
        "chain'. A pass in a different context cannot be merged into this one, so v4241's closing note " +
        "proposed a frame that cannot exist.");
    ok("!! *** transitionPass HAS NO INSTALL PATH -- window.transitions is a FACTORY, not a switch ***",
        probe.transitionKeys.join(",") === "check,describe,make" ,
        "its whole surface is " + probe.transitionKeys.join(", ") + ". make() hands a pass back to the " +
        "caller and nothing in main.js mounts one, so there is no state in which a transition draws here.");
    report("crtPass and cameraEffectsPass are reached only from OTHER pages -- crt from fallout.html, " +
           "pipboy-models.html and the es-*.html pair (through ui/domToTexture.js), cameraEffects only from " +
           "camera-effects.html. Neither is imported by main.js at all, so neither has a boot state to toggle.");

    // ---- the conditional draw nobody can switch: god rays ----------------------------------------------
    // *** THE SIXTH bloomPass DRAW SITE IS AT LINE 771 AND IT IS GATED ON WHERE THE SUN IS. *** godRayStrength
    // is 0.7 by default (graphicsSettings DEFAULTS.godrays is true), so the setting is already on; the draw
    // is suppressed by sunVisibility, which main.js:30186-30207 recomputes from the sun's screen position
    // every frame. So it cannot be forced from outside, and the frame's draw count is a function of the TIME
    // OF DAY. Reported rather than asserted: a check that demanded god rays would be demanding a sunrise.
    ok("!! ...and the setting that would enable god rays is ALREADY on, so the sun is what suppresses them",
        probe.godrays === true && !bloomLines(baseA).includes("771"),
        "_gfxSettings.godrays = " + probe.godrays + " and godRayStrength = 0.7, yet line 771 never draws in " +
        "any window above. main.js recomputes sunVisibility from the sun's screen position every frame, so " +
        "this draw is gated on the time of day and cannot be toggled from a gate. The frame is 4 to 7 draws.");

    // ---- what all of that means for effectMerge --------------------------------------------------------
    // *** effectMerge HAS NO CALLER FOR A DEEPER REASON THAN v4241 FOUND, AND THE MEASUREMENTS ABOVE ARE HOW
    // IT SHOWS. *** v4241 said "nothing mergeable is running". The stronger statement the toggles support is
    // that THERE IS NO CHAIN TO MERGE: no list of enabled effects, no chain object, no order. bloom and
    // phosphor are joined by one hand-written if/else at main.js:30807-30823, and every other effect lives in
    // another context, another page, or a factory with no mount. A merger needs a sequence to merge, and the
    // sequence does not exist as data anywhere in this tree.
    ok("!! *** SO THE FRAME HAS NO CHAIN OBJECT AT ALL -- every draw site is bloom, phosphor or the GPGPU step ***",
        [...sitesOf(onPhos)].every((s) => /bloomPass\.js|phosphorPass\.js|VoxelMemoryGPU\.js/.test(s)),
        "with phosphor on, the fullest frame this page can be driven into is " + sitesOf(onPhos).size +
        " sites and all of them are those three files. effectMerge wants a LIST of effects; what exists is " +
        "two named passes wired by hand and a decay step that was never in the chain.");

    const vm = baseA.filter((d) => /VoxelMemoryGPU\.js/.test(d.site));
    ok("!! *** the GPGPU decay step is still 3 vertices, and no fullscreen quad survives in any window ***",
        vm.length === 1 && [baseA, offSSAO, onPhos].every((w) => w.every((d) => d.count === 3)),
        "every draw site in every configuration measured issues 3 vertices. Before v4241 the decay step " +
        "issued 6; section 2 is the proof that changing it moved no pixel.");
}

// =============================================================================================================
console.log("\n2. *** THE ONE REAL FULLSCREEN QUAD, CONVERTED -- AND PROVEN BYTE-IDENTICAL ***");
if (skip) { report("SKIPPED -- " + skip); }
else {
    // The claim is not "a triangle is faster". It is that the triangle renders EXACTLY what the quad rendered,
    // so the change costs nothing to verify and nothing to trust. Both vertex stages are compiled here against
    // the module's own fragment shader and run over the same input.
    const HARNESS = fs.readFileSync(path.join(ENG, "tools/ship/postChainHarness.html"), "utf8");
    const srv = http.createServer((rq, rs) => {
        if (rq.url.startsWith("/gpu/") || rq.url.startsWith("/render/")) {
            const p = path.join(ENG, rq.url);
            if (fs.existsSync(p)) { rs.writeHead(200, { "content-type": "text/javascript" }); return rs.end(fs.readFileSync(p)); }
        }
        rs.writeHead(200, { "content-type": "text/html" }); rs.end(HARNESS);
    }).listen(0);
    const port = srv.address().port;
    const b = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
    const pg = await b.newPage();
    const errs = [];
    pg.on("pageerror", (e) => errs.push(String(e).slice(0, 250)));
    await pg.goto("http://127.0.0.1:" + port + "/", { waitUntil: "networkidle" });
    ok("!! the harness compiled both vertex stages against the module's own fragment shader",
        errs.length === 0 && (await pg.evaluate(() => !!window.__ready)), errs.join(" | "));

    const r = await pg.evaluate(() => window.__compare());
    ok("!! *** THE TRIANGLE RENDERS THE QUAD'S PIXELS EXACTLY -- 0 of " + (r.pixels || 0) + " differ ***",
        r.diff === 0,
        "byte-identical over " + r.pixels + " pixels. The vUV expression is the same and the interpolated " +
        "coordinate at every covered pixel is the same, so this is an equality and not a tolerance.");
    ok("!! ...and it covers every pixel: nothing is left holding the sentinel",
        r.untouchedTri === 0 && r.untouchedQuad === 0,
        "triangle " + r.untouchedTri + ", quad " + r.untouchedQuad + " of " + r.pixels +
        " still magenta. A triangle that had been shrunk to the viewport instead of overhanging it would " +
        "leave half the frame here, which is the sabotage v4236 needed a check added for.");
    ok("!! *** and it is ONE primitive where the quad was two, so the shared diagonal is not rasterised twice ***",
        r.triVerts === 3 && r.quadVerts === 6,
        "3 vertices against 6. On a 128x128 decay target that diagonal is 128 fragments of duplicated work " +
        "every pass; the saving is small and it is also free, which is the whole reason to take it.");
    ok("   neither result contains a NaN or an out-of-range byte", r.finite);
    // the decay itself: not this gate's subject, but the comparison above CANNOT see it, so it is asked here
    ok("!! *** and the decay actually decays -- which the comparison above is structurally blind to ***",
        (r.probe || []).length === 3 && r.probe.every((p2) =>
            p2.before === 0 ? p2.after === 0 : Math.abs(p2.after - Math.round(p2.before * r.decay)) <= 1),
        (r.probe || []).map((p2) => p2.before + " -> " + p2.after).join(", ") + " at a decay of " + r.decay +
        ". Sabotaging `c.r *= uDecay` to `c.r *= 1.0` left the quad-versus-triangle comparison GREEN, because " +
        "the fragment shader is common to both sides and a change to it cancels -- the same shape the " +
        "fullscreen-triangle sabotage exposed in v4236, in a different file.");
    await b.close(); srv.close();
}

// =============================================================================================================
// =============================================================================================================
// THE SABOTAGE RECORD FOR v4241. Five breakages, applied, run, restored byte-identical and hash-verified.
//
//   A  the triangle shrunk to the viewport        -> 2 red, 8256 of 16384 pixels left holding the sentinel
//   B  the triangle's vUV drifts by 0.01          -> 1 red, the byte-equality
//   C  the draw back to six vertices              -> 3 red, and the census reports "at 6 vertices"
//   D  the decay stops decaying (c.r *= 1.0)      -> *** STILL GREEN ON THE FIRST PASS. *** The fragment
//      shader is COMMON to both sides of the comparison, so a change to it cancels and both paths fail
//      identically. That is the same shape the fullscreen-triangle sabotage exposed in v4236 -- anything
//      shared by both halves of a comparison is invisible to it -- arriving a second time in a different
//      file. The decay is now asked about directly.
//   E  QUAD_VS no longer exported                 -> the gate CRASHES on the import rather than failing a
//      named check. A crash still fails a ship and still names nothing useful; left as is here because the
//      import is the gate's own first line and a missing export is not a subtle defect.
//
// ---- v4242 SABOTAGES, ALL RESTORED BYTE-IDENTICAL AND md5-VERIFIED -----------------------------------------
//
//   A  windowOf's setup passed back as a function literal -- "() => window.ssao.off()" -- which is the exact
//      bug this round shipped and then found. page.evaluate(string) EVALUATES the string, so a function
//      literal becomes a function object and is never called. -> 2 checks RED. The toggle silently did
//      nothing and every comparison returned "no change", which is indistinguishable from a real negative.
//
//   B  A, PLUS the strength read-back dropped from the assertion. -> STILL 2 RED. *** SO THE READ-BACK IS
//      DEFENSIVE, NOT LOAD-BEARING, AND IS LABELLED RATHER THAN COUNTED. *** The site comparison catches a
//      dead setter on its own, because sites that should have changed did not. What the read-back adds is
//      not detection but DIAGNOSIS: "the toggle never fired" and "the toggle fired and the draw did not
//      move" are the same red without it, and they need different fixes.
//
//   C  bloomPass's `if (this.ssaoStrength > 0.0)` forced false, so the SSAO draw never issues. -> 2 RED,
//      line 750 absent from the boot census. Note which check did NOT move: "SSAO IS ON AT BOOT" stayed
//      green, correctly -- it is a claim about window.ssao's SHAPE and strength value, not about the frame.
//      The frame checks are what catch C, and keeping the two separate is the point.
//
//   D  window.phosphor.set(on) accepts the call and assigns enabled = false. -> 1 RED. And again note the
//      one that did not move: "THE FRAME HAS NO CHAIN OBJECT" stayed green, because it is a set-MEMBERSHIP
//      check -- it fires when an unexpected draw site APPEARS, and cannot fail when one goes missing. That
//      is the right shape for what it claims and the wrong shape for anything else, so it is not counted as
//      cover for the phosphor result.
//
console.log("\n3. the corrections, written where the wrong numbers were");
{
    const em = fs.readFileSync(path.join(ENG, "render/effectMerge.mjs"), "utf8");
    ok("!! *** effectMerge.mjs's header carries the correction, not just the original measurement ***",
        /v4241/.test(em) && /CORRECTED/.test(em),
        "a header that still said 'six fullscreen draws, one of them a quad to be found' would be a stale " +
        "claim with good manners, which is the thing this tree keeps catching itself doing");
    // *** AND THE v4241 CORRECTION ITSELF NEEDED CORRECTING, WHICH IS THE WHOLE ARGUMENT FOR CHECKING IT. ***
    // Two sentences it introduced were wrong -- the "downsample and upsample ladder" and "SSAO is disabled" --
    // so a check that only asked "does a correction exist" would have passed over both.
    // *** THIS CHECK BANNED THE PHRASE "downsample and upsample ladder" AND THEREFORE BANNED ITS OWN
    // CORRECTION, *** because a header that refutes a sentence has to QUOTE that sentence. Same shape as the
    // v4239 check that banned the word "Cesium" in the paragraph explaining why Cesium was refused. What a
    // correction looks like in text is the refutation being PRESENT, never the mistake being absent.
    ok("!! ...and v4242's correction of THAT correction is in it too: no ladder, and SSAO was never off",
        /v4242/.test(em) && /There is no ladder/.test(em) && /strength 0\.85/.test(em),
        "the header now says what lines 719/729/736/750/818 actually are, and records that 'SSAO is " +
        "disabled' came from a gate reading a property that does not exist");
    ok("!! ...and it names the reason effectMerge has no caller ONE LEVEL DOWN from where v4241 left it",
        /NO CHAIN\s*\n?\/\/\s*TO MERGE|THERE IS NO CHAIN/.test(em),
        "not 'nothing mergeable is running' but 'there is no sequence, as data, anywhere' -- which is a " +
        "statement about the architecture rather than about the default scene");
    const vmSrc = fs.readFileSync(path.join(ENG, "gpu/VoxelMemoryGPU.js"), "utf8");
    ok("!! ...and VoxelMemoryGPU.js says why its own quad became a triangle and who thought it was elsewhere",
        /v4236/.test(vmSrc) && /stack-attributed/i.test(vmSrc));
    ok("   the old quad vertex stage is kept and exported, because the gate's claim needs both to exist",
        /export const QUAD_VS/.test(vmSrc) && /export const TRI_VS/.test(vmSrc),
        "not dead code: section 2 compiles both and compares them");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: the god-ray draw at bloomPass.js:771, which is the one configuration this file " +
    "cannot reach. The SETTING is already on (_gfxSettings.godrays = true, godRayStrength = 0.7); what " +
    "suppresses it is sunVisibility, recomputed from the sun's screen position every frame at " +
    "main.js:30186-30207, so reaching it means moving the sun and not flipping a switch. It is reported as " +
    "a bound -- the frame is 4 to 8 draws -- rather than asserted at a number. Also unchecked: whether the " +
    "fullscreen triangle is measurably FASTER, which nothing here times; and what a REAL chain would cost, " +
    "because building one is a change to main.js and not a measurement of it. What IS checked: that the " +
    "same configuration twice gives the same call sites, before any delta is read; that SSAO is on at boot " +
    "and owns exactly bloomPass.js:750, with the strength read back so a dead setter cannot pose as a " +
    "finding; that phosphor is the only named optional pass that adds a draw; that swiftShader's canvas is " +
    "detached with its own context and therefore unmergeable in principle; that transitions has no mount " +
    "path; and that converting the one real quad to a triangle is byte-identical over every pixel.");
process.exit(fails ? 1 : 0);
