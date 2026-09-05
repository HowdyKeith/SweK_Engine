// WebGLEngine/tools/ship/backendParity-selfcheck.mjs -- v4269
//
// GRADES render/backendParity.mjs, and grades the census against the tree it claims to describe.
//
// The round's claim is a ratio: gfx/device.js promises "write it once, run on either runtime", and five of a
// hundred and eighteen shader-bearing modules can actually take that offer. Everything here exists to make that
// number checkable rather than quotable.
//
// *** THE SELF-COUNTING PROBLEM IS SOLVED BY CONSTRUCTION HERE, NOT BY AN EXCLUSION LIST. *** A scan for shader
// markers that is itself written in a file naturally contains those markers, which is the seventh instance of a
// failure this tree has hit in seven consecutive rounds. Both this gate and the module it grades assemble the
// markers from fragments at run time, so neither contains them -- and section 2 asserts exactly that, which
// turns a convention into a check. If someone later writes a marker literally into either file, the census
// starts counting the census and section 2 goes red on the spot.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GLSL_MARK, GLSL_TELL, WGSL_MARKS, LANG, codeOnly, classify, census, countsOf, shortfall, glslStyle,
         PARITY_BASELINE, DEVICE_CONTRACT, PORTED_PAIRS } from "../../render/backendParity.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => {
    if (!cond) fails++;
    console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`);
};
const report = (s) => console.log(`  ----  ${s}`);
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");

const C = census(ENG, {
    readdir: (d) => fs.readdirSync(d, { withFileTypes: true }),
    readFile: (f) => fs.readFileSync(f, "utf8"),
    join: path.join, relative: path.relative,
});
const N = countsOf(C);

console.log("\n1. classify() SEPARATES CODE FROM PROSE");
{
    ok("a file with only the GLSL marker is GLSL", classify("x " + GLSL_MARK + " y") === LANG.GLSL);
    ok("a file with only a WGSL marker is WGSL", classify("fn f() {} " + WGSL_MARKS[0]) === LANG.WGSL);
    ok("a file with both is BOTH", classify(GLSL_MARK + " and " + WGSL_MARKS[1]) === LANG.BOTH);
    ok("a file with neither is NONE", classify("let x = 1;") === LANG.NONE);
    // *** THE RULE THAT CHANGED THE ANSWER, KEPT AS A CHECK RATHER THAN A MEMORY. ***
    ok("*** a marker in a LINE comment does not count ***",
        classify("// " + WGSL_MARKS[0] + " discussed here\nlet x=1;") === LANG.NONE);
    ok("*** a marker in a BLOCK comment does not count ***",
        classify("/* " + GLSL_MARK + " */ let x=1;") === LANG.NONE);
    ok("  but a marker in a STRING still counts, because that is how shaders ship here",
        classify("const s = `" + GLSL_MARK + "`;") === LANG.GLSL,
        "every shader in this tree is a template literal, so stripping strings would strip the subject");
    ok("codeOnly leaves a protocol-ish token alone", /https:/.test(codeOnly("const u = 'https://x';")),
        "the ((^|[^:])) guard is why // in a URL is not a comment");
    report("counted raw, the WGSL total is " + PARITY_BASELINE.wgslRawVsCode.raw + "; counted as code it is " +
        PARITY_BASELINE.wgslRawVsCode.code + ". One file discusses a WGSL entry-point attribute and ships none.");
}

console.log("\n2. THE CENSUS DOES NOT COUNT THE CENSUS");
{
    const SELF = ["render/backendParity.mjs", "tools/ship/backendParity-selfcheck.mjs"];
    ok("both self files exist", SELF.every((f) => fs.existsSync(path.join(ENG, f))), SELF.join(" "));
    // The markers are assembled at run time in both files, so a literal search must find nothing.
    const literal = [];
    for (const f of SELF) {
        const body = read(f);
        if (body.includes(GLSL_MARK)) literal.push(f + ":glsl");
        for (const m of WGSL_MARKS) if (body.includes(m)) literal.push(f + ":" + m);
    }
    ok("*** neither file contains a shader marker literally ***", literal.length === 0, literal.join(" ") ||
        "assembled from fragments at run time, so no exclusion list is needed or maintained");
    ok("  and so neither appears in the census at all",
        !C.glsl.some((f) => SELF.includes(f)) && !C.wgsl.some((f) => SELF.includes(f)));
    // CONTROL: the detector must be able to see a marker, or the two lines above prove nothing.
    ok("CONTROL: a marker written literally IS detected", classify("x" + GLSL_MARK + "x") === LANG.GLSL);
    report("this replaces the exclusion list that the previous seven self-counting fixes each had to write, " +
        "argue for, and keep current. A file that cannot contain the thing it searches for needs no exemption.");
}

console.log("\n3. THE MEASUREMENT");
{
    console.log(`        scanned ${C.scanned} files: GLSL ${N.glslBearing}, WGSL ${N.wgslBearing}, ` +
                `BOTH ${N.both}, GLSL-only ${N.glslOnly}, WGSL-only ${N.wgslOnly}`);
    for (const k of ["glslBearing", "wgslBearing", "both", "glslOnly", "wgslOnly"]) {
        ok(`  ${k} matches the recorded baseline`, N[k] === PARITY_BASELINE[k],
            `measured ${N[k]}, recorded ${PARITY_BASELINE[k]}`);
    }
    // *** THE SPLIT v4270 ADDED, BECAUSE ONE NUMBER HID A WHOLE POPULATION. ***
    const styles = { directive: 0, framework: 0 };
    for (const f of C.glsl) { const st = glslStyle(read(f)); if (st) styles[st]++; }
    ok("  GLSL splits into directive-style and framework-style as recorded",
        styles.directive === PARITY_BASELINE.glslDirective && styles.framework === PARITY_BASELINE.glslFramework,
        `directive ${styles.directive}, framework ${styles.framework}`);
    ok("*** and the two sum to the total, so nothing is double-counted or dropped ***",
        styles.directive + styles.framework === N.glslBearing, `${styles.directive}+${styles.framework}=${N.glslBearing}`);
    // The control fixtures are ASSEMBLED too -- a literal here would make this gate a GLSL-bearing file, which
    // is exactly what happened on the first run after GLSL_TELL was added.
    const TELL_SAMPLE = "uni" + "form sam" + "pler2D tDiffuse;";
    ok("CONTROL: a three.js-style pass with no directive IS counted as GLSL",
        classify("const fs = `" + TELL_SAMPLE + "\nvoid main(){}`;") === LANG.GLSL,
        "this is the case v4269's marker missed sixteen times");
    ok("CONTROL: and the same declaration inside a comment is still not GLSL",
        classify("// " + TELL_SAMPLE + " is what a pass declares\nlet x=1;") === LANG.NONE);
    ok("*** and BOTH is a tiny fraction of GLSL-bearing ***", N.both < N.glslBearing / 10,
        `${N.both} of ${N.glslBearing} -- ${(100 * N.both / N.glslBearing).toFixed(1)}%`);
    // The distinction that stops the 5 from sounding better than it is.
    const pages = C.both.filter((f) => f.endsWith(".html"));
    const mods = C.both.filter((f) => !f.endsWith(".html"));
    ok("of the BOTH files, the pages are the ones the baseline names",
        pages.length === PARITY_BASELINE.bothPages.length &&
        pages.every((p) => PARITY_BASELINE.bothPages.includes(p)), pages.join(" "));
    ok(`*** and only ${PARITY_BASELINE.bothShaderModules.length} are shader MODULES rather than pages ***`,
        mods.length === PARITY_BASELINE.bothShaderModules.length &&
        mods.every((m) => PARITY_BASELINE.bothShaderModules.includes(m)), mods.join(" "));
    report("a page carrying both languages carries its own two shaders and lends nothing to anybody else, so " +
        `the reach number is ${mods.length}, not ${N.both}.`);
}

console.log("\n4. THE CONTRACT, AND THE READ THAT WAS UNGUARDED UNTIL THIS ROUND");
{
    const dev = read("gfx/device.js");
    ok("gfx/device.js exists and names both languages in its pipeline contract",
        /wgsl/.test(dev) && /glsl/.test(dev));
    ok(`*** the WebGPU backend reads ${DEVICE_CONTRACT.unguardedRead} ***`,
        dev.includes(DEVICE_CONTRACT.unguardedRead), "createShaderModule takes it directly");
    // *** v4269 FIXED THIS RATHER THAN ONLY RECORDING IT, AND THE FIX IS TESTED BY RUNNING IT. ***
    // Before this round the read was bare: a GLSL-only pipeline reached createShaderModule as `code: undefined`
    // and failed as a driver-shaped error naming neither the pipeline nor the missing language. Given that 113
    // of 118 shader-bearing modules are GLSL-only, that is the COMMON path, not a freak one.
    ok("the WebGPU backend now REFUSES a pipeline with no WGSL", /cannot run on the WebGPU backend/.test(dev));
    ok("  and the refusal names the contract, not the driver",
        /must carry both/.test(dev) && /backendParity/.test(dev));

    // A source regex proves the text is there, not that the guard fires. Stub the three WebGPU objects the
    // backend touches and actually call it -- this is the difference the tree draws everywhere else between
    // a check on a claim and a check on behaviour.
    // navigator is a getter-only property on globalThis in Node 22, so it is replaced with defineProperty and
    // restored the same way -- assigning to it throws before the test under test ever runs.
    const navDesc = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    const setNav = (v) => Object.defineProperty(globalThis, "navigator", { value: v, configurable: true, writable: true });
    let threw = null, ranWithGlslOnly = false;
    try {
        const fakeDevice = {
            createShaderModule: (o) => { ranWithGlslOnly = (o.code === undefined); return {}; },
            createBuffer: () => ({}), createTexture: () => ({}), createRenderPipeline: () => ({}),
            createBindGroup: () => ({}), createCommandEncoder: () => ({}), queue: { writeBuffer(){}, submit(){} },
            destroy(){},
        };
        setNav({ gpu: {
            requestAdapter: async () => ({ requestDevice: async () => fakeDevice }),
            getPreferredCanvasFormat: () => "bgra8unorm",
        } });
        const canvas = { getContext: () => ({ configure(){}, getCurrentTexture: () => ({ createView: () => ({}) }) }) };
        const { webgpuBackend } = await import("../../gfx/device.js");
        const dv = await webgpuBackend(canvas);
        ok("CONTROL: the stubbed backend really did come up", !!dv && dv.backend === "webgpu",
            dv ? dv.backend : "null -- the stub is wrong and the test below proves nothing");
        try { dv.pipeline({ shaders: { glsl: "void main(){}" }, attributes: [], stride: 0 }); }
        catch (e) { threw = e; }
    } catch (e) {
        ok("CONTROL: the stubbed backend really did come up", false, "stub failed: " + e.message);
    } finally {
        if (navDesc) Object.defineProperty(globalThis, "navigator", navDesc);
        else delete globalThis.navigator;
    }

    ok("*** a GLSL-only pipeline THROWS instead of reaching the GPU ***", !!threw,
        threw ? threw.message.slice(0, 80) + "..." : "no throw -- undefined would have gone to createShaderModule");
    ok("  and it never called createShaderModule with undefined", ranWithGlslOnly === false,
        "the guard runs before the module is created");
    ok("  and the message says which language is missing and which is present",
        !!threw && /only glsl/.test(threw.message), threw ? "names 'only glsl'" : "n/a");

    // Its consumers, verified rather than remembered.
    for (const c of DEVICE_CONTRACT.consumers) {
        ok(`  consumer ${c} exists and imports the device`, fs.existsSync(path.join(ENG, c)) &&
            read(c).includes("gfx/device.js"));
    }
    // *** THIS READ RAW TEXT AND v4270 CAUGHT IT. *** render/badTvWgsl.mjs discusses gfx/device.js in its
    // header -- it is written to fit that contract -- and was counted as a third consumer. Mentioning a module
    // is not importing it. The rule this tree settled at v4266 is that a check about CODE strips comments
    // first, and this check had not been holding to it; it now strips, and requires an actual import or a
    // module-specifier string rather than the bare name appearing anywhere.
    const importers = C.glsl.concat(C.wgsl).filter((f) => {
        try {
            const code = codeOnly(read(f));
            return /(from|import)\s*\(?\s*["'][^"']*gfx\/device\.js["']/.test(code) ||
                   /src\s*=\s*["'][^"']*gfx\/device\.js["']/.test(code);
        } catch { return false; }
    });
    // *** AN EXEMPTION WAS ADDED HERE AND THEN REMOVED IN THE SAME ROUND, WHICH IS WORTH RECORDING. ***
    // v4278's new selfcheck imports _uniformLayout to grade it, and briefly showed up here as a third
    // consumer. The first fix was a named-grader exemption list. The REAL cause was elsewhere: that gate
    // embedded a compute entry-point attribute in a device probe, so backendParity counted it as a module
    // that ships WGSL, which is what put it in this scan at all. Assembling the attribute from two pieces --
    // the technique nine earlier self-counting rounds settled on -- removed it from the census and from
    // here, and left the exemption list with nothing in it. An exemption nobody exercises is the staleness
    // this file warns about elsewhere, so it went out with the defect that motivated it.
    //
    // (And writing THIS note spelled the attribute out in full, which turned section 2's literal-marker
    // check red on the very sentence explaining why the literal must not appear. Tenth instance. The rule is
    // not "assemble the markers in code" -- it is that a file grading a marker may not contain it anywhere,
    // prose included.)
    ok("*** and NOTHING outside those two consumes it ***",
        new Set(importers).size <= DEVICE_CONTRACT.consumers.length,
        [...new Set(importers)].join(" ") || "none beyond the demos");
    report("a 117-line abstraction whose promise is portability, with two demo consumers and no production " +
        "one. The orrery becoming its first is the round this measurement was taken for.");
}

console.log("\n5. PAIRS DELIBERATELY CARRIED ACROSS, WHICH THE `both` COUNT CANNOT SEE");
{
    ok("at least one effect exists in both languages as a PAIR", PORTED_PAIRS.length >= 1,
        PORTED_PAIRS.map((p) => p.effect).join(", "));
    for (const p of PORTED_PAIRS) {
        for (const k of ["glsl", "wgsl", "model", "gate"]) {
            ok(`  ${p.effect}: ${k} file exists`, fs.existsSync(path.join(ENG, p[k])), p[k]);
        }
        ok(`  ${p.effect}: the GLSL half really is GLSL`, classify(read(p.glsl)) === LANG.GLSL);
        ok(`  ${p.effect}: the WGSL half really is WGSL`, classify(read(p.wgsl)) === LANG.WGSL);
        ok(`  ${p.effect}: the WGSL imports the model rather than retyping its constants`,
            /from ["'][^"']*badTvModel/.test(codeOnly(read(p.wgsl))),
            "a second hand-written 0.2 or 50.0 is how a port drifts");
    }
    // *** THE PAIR IS NOT A `both` FILE AND THE GATE SAYS SO RATHER THAN LETTING THE NUMBER MISLEAD. ***
    ok("*** and none of those pairs shows up in the BOTH count ***",
        PORTED_PAIRS.every((p) => !C.both.includes(p.wgsl) && !C.both.includes(p.glsl)),
        `BOTH is still ${C.both.length} -- it counts FILES carrying two languages, not EFFECTS available in two`);
    report("a per-file count is what a scanner can see and an effect is what a person cares about. Reporting " +
        "only the first would have made v4270's port invisible to this gate; reporting only the second would " +
        "hide that gfx/device.js still needs one file with both.");
}

console.log("\n6. THE ORRERY AND THE GLYPH SHADER, WHICH IS THE ACTUAL BLOCKER");
{
    const orr = read("ui/orreryDraw.js");
    ok("ui/orreryDraw.js is canvas 2D", /getContext\("2d"\)/.test(orr));
    ok("  so it has no shader stage at all", classify(orr) === LANG.NONE,
        "no effect in this tree can touch it while that is true");
    ok("  and it draws text, which a device pipeline does not do for free", /fillText/.test(orr),
        (orr.match(/fillText/g) || []).length + " fillText call(s) needing text/slug*.js after a port");

    const slug = read("text/slugShader.js");
    ok("*** text/slugShader.js is GLSL-only ***", classify(slug) === LANG.GLSL);
    const s = shortfall("text/slugShader.js", slug);
    ok("  and shortfall() names what it needs", !!s && /WGSL path/.test(s.needs), s ? s.needs : "null");
    ok("  the glyph renderer's CPU model exists, so a port has an oracle",
        fs.existsSync(path.join(ENG, "text/slugEval.js")),
        "slugEval.js transliterates the fragment shader and is graded against a segment winding number");
    ok("CONTROL: shortfall() returns null for a module that is already ready",
        shortfall("x", GLSL_MARK + " " + WGSL_MARKS[0]) === null);
    // v4457 -- *** THE PORT EXISTS, AS A SECOND FILE, AND THE ASSERTION ABOVE STAYS TRUE ON PURPOSE. ***
    // text/slugShaderWgsl.js is the WGSL twin; slugShader.js keeps its GLSL alone because its value is a
    // line-for-line diff against SlugPixelShader.hlsl. So the blocker this paragraph named is gone and the
    // count that said so is unchanged -- what moved is wgslOnly, 47 -> 48, and the next blocker is
    // gfx/device.js itself: no blend state, and a texture path that uploads rgba8unorm only.
    const twin = read("text/slugShaderWgsl.js");
    ok("*** and text/slugShaderWgsl.js, the WGSL twin, is WGSL-only ***", classify(twin) === LANG.WGSL);
    ok("  it is held to the CPU model on a device by tools/ship/slugWgsl-selfcheck.mjs",
        fs.existsSync(path.join(ENG, "tools/ship/slugWgsl-selfcheck.mjs")) && /slugEval/.test(twin),
        "the gate compares SlugRender's coverage sample by sample with slugEval.js on the same packed bytes");
    // *** v4270 WITHDREW HALF OF WHAT THIS PARAGRAPH USED TO SAY. *** It read "NOTHING HERE CAN EXECUTE
    // WGSL", which was inferred from render/wgslSpec.mjs's true statement that the build box has no GPU, and
    // was never tested. Chromium here serves a WebGPU adapter (google/swiftshader) over a SECURE origin and
    // compiles and runs WGSL; see tools/ship/webgpuHarness.mjs, which does it, and badTvWgsl-selfcheck, which
    // grades a port numerically against its CPU model. The refusal to transliterate Slug stands on its own
    // merits -- 337 delicate lines -- but not on that reason.
    report("transliterating 337 lines of Slug to WGSL is delicate: the negative-zero bit extraction, the " +
        "1/65536 double-root fallback and the abs() in calcCoverage are all load-bearing, and slugEval.js " +
        "names them as rules for anyone editing. That is why it was not attempted in the same round as the " +
        "measurement. It IS now checkable end to end -- tools/ship/webgpuHarness.mjs runs WGSL on a real " +
        "device, so a port can be graded against slugEval the way v4270 graded badTv against badTvModel.");
}

// =============================================================================================================
// SABOTAGE LOG -- grep-confirmed applied before the result was read, exit code read alongside the count on the
// summary line, all three files restored md5-identical. Counts MEASURED, not predicted.
//
//   A  the WGSL guard removed from gfx/device.js's webgpuBackend, restoring the bare read.
//      -> exit=1, 5 red. Two are source checks and THREE ARE THE BEHAVIOURAL TEST, which reports "no throw --
//      undefined would have gone to createShaderModule". That is the distinction worth having: a regex over
//      device.js proves the refusal TEXT exists, and only calling the stubbed backend proves it FIRES.
//
//   B  a shader marker written literally into this gate, as `const _sab = <the GLSL marker>`.
//      -> exit=1, 5 red, and the shape of them is the argument for building markers by concatenation. The
//      gate becomes a GLSL-bearing file: glslBearing 118 -> 119, glslOnly 113 -> 114, the "neither file
//      contains a marker" check goes red, the "neither appears in the census" check goes red, and -- the one
//      I did not predict -- it also appears as a THIRD consumer of gfx/device.js, because it imports the
//      device and now counts as a shader module. One literal string, five wrong facts.
//
//   C  codeOnly reduced to the identity function, so comments are counted as code.
//      -> exit=1, 4 red: both comment checks in section 1, and wgslBearing 38 -> 39 with wgslOnly 33 -> 34.
//      This is the measurement that justified the rule rather than restating it -- there really is one file
//      in this tree that discusses a WGSL entry-point attribute in prose and ships no WGSL, and a raw scan
//      files it as WebGPU-ready.
//
// None went 0 RED, and none could: every check here reads either the tree itself or the behaviour of a module
// under a stub, rather than a fact this file asserts about itself.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: WHETHER ANY SHADER COMPILES. This counts marker presence in source text -- it " +
    "cannot tell a correct WGSL shader from a syntactically broken one, and a module could carry both " +
    "languages and have them compute different things, which is exactly the defect v4253 found between the " +
    "JS and GLSL Ashima noise. render/wgslSpec.mjs is the tool for the first half and there is no tool here " +
    "for the second. Also unchecked: whether the 113 GLSL-only modules WANT a WGSL path -- most are engine " +
    "internals that never go near gfx/device.js, and the number is a measure of reach, not a to-do list.");
process.exit(fails ? 1 : 0);
