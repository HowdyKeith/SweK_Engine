// WebGLEngine/tools/ship/transitionSpec-selfcheck.mjs -- v4204
//
// GATES render/transitionSpec.mjs, render/transitionModel.mjs, render/transitionPass.js and the tree's own
// shaders/transitions/*.glsl -- the GL Transition spec v1, taken as a CONTRACT rather than as 100 shaders.
//
// *** THE SPEC STATES A LAW THAT NOTHING ENFORCES, AND SECTION 3 IS THE WHOLE ROUND. *** "When progress is
// 0.0, exclusively the from texture must be rendered. When progress is 1.0, exclusively the to texture."
// A GLSL compiler cannot check that; a text scanner cannot check that; it is a property of the FUNCTION.
// So the transitions exist twice -- GLSL in shaders/transitions/ and JS in render/transitionModel.mjs, the
// crtModel/crtPass discipline of v4119 -- and the law is evaluated over a grid at four aspect ratios.
//
// IT CAUGHT MY OWN SHADER ON THE FIRST RUN. swekWipe returned all `to` at progress 0 and all `from` at
// progress 1 -- an error of 1.0, the maximum possible, at every ratio -- because its smoothstep edges were
// ordered the wrong way round. swekIris, written minutes earlier, uses the correct reversed form. Two
// shaders, one mistake, and only a measurement told them apart.
//
// *** AND SECTION 2 IS THE VALIDATOR GRADED AGAINST REALITY RATHER THAN AGAINST MY IDEA OF IT. *** The
// validator was run over all 100 published transitions (fetched to a scratch directory, none vendored) and
// three of the four "violations" it reported were bugs in the validator, one of which rejected a transition
// written by the spec's own author. Those three are reproduced here from HAND-WRITTEN files with the same
// shape -- not the corpus files, which are not in this tree and are not going to be.
//
// Run: node tools/ship/transitionSpec-selfcheck.mjs

import { PROVIDED, PARAM_TYPES, UNDEFAULTABLE, ENTRY_POINT, LIMITS, stripComments, parseMetadata,
         parseParams, parseTransition, hasEntryPoint, validateTransition, assemble,
         evaluateEndpoints } from "../../render/transitionSpec.mjs";
import { MODELS, crossfade, wipe, iris, smoothstep } from "../../render/transitionModel.mjs";
import { defaultValue } from "../../render/transitionPass.js";
import { codeOnly, noComments, prose } from "./sourceScan.mjs";
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const note = (m) => console.log("  ....  " + m);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");
const TDIR = path.join(ENG, "shaders", "transitions");
const shipped = fs.readdirSync(TDIR).filter((f) => f.endsWith(".glsl")).sort();

// 1) *** THE TREE'S OWN TRANSITIONS CONFORM, AND THE TWO IMPLEMENTATIONS ARE THE SAME SET. ***
{
    ok(shipped.length >= 3, `${shipped.length} transitions shipped: ${shipped.join(", ")}`);
    for (const f of shipped) {
        const src = fs.readFileSync(path.join(TDIR, f), "utf8");
        const t = parseTransition(src);
        ok(t.problems.length === 0, `${f} conforms${t.problems.length ? ": " + t.problems.join("; ") : ""}`);
        ok(t.meta.author && t.meta.license, `${f} declares an author (${t.meta.author}) and a licence (${t.meta.license})`);
        ok(t.meta.name === path.basename(f, ".glsl"), `${f}: its Name header matches its filename`);
        // Every parameter must be usable by the pass, or the default is decoration.
        for (const p of t.params) {
            if (UNDEFAULTABLE.includes(p.type)) continue;
            ok(defaultValue(p) !== null, `${f}: ${p.type} ${p.name} default ${JSON.stringify(p.default)} parses to ${JSON.stringify(defaultValue(p))}`);
        }
    }
    // *** THE GLSL AND THE JS MUST BE THE SAME LIST, OR ONE SIDE SILENTLY STOPS BEING CHECKED. *** A shader
    // with no model is a shader whose endpoint law nobody evaluates -- which is exactly how swekWipe's bug
    // would have shipped.
    const glslNames = shipped.map((f) => path.basename(f, ".glsl")).sort();
    const modelNames = Object.keys(MODELS).sort();
    ok(JSON.stringify(glslNames) === JSON.stringify(modelNames),
        `every shipped .glsl has a CPU model and vice versa: [${glslNames}] vs [${modelNames}]`);
}

// 2) *** THE VALIDATOR, AND THE THREE BUGS THE PUBLISHED CORPUS FOUND IN IT. ***
{
    const good = "// Author: t\n// License: MIT\nvec4 transition(vec2 uv) { return mix(getFromColor(uv), getToColor(uv), progress); }";
    ok(validateTransition(good).length === 0, "a minimal conforming transition has no problems");
    ok(validateTransition("").length === 1 && /empty/.test(validateTransition("")[0]), "an empty source is refused");

    // The rules, each with a shader that breaks exactly one of them.
    const breaks = (src, re) => validateTransition(src).some((p) => re.test(p));
    ok(breaks("vec4 notTransition(vec2 uv) { return getFromColor(uv); }", /no entry point/),
        `a file without "${ENTRY_POINT}" is refused`);
    ok(breaks("vec4 transition(vec2 uv) { return texture2D(uFrom, uv); }", /never declared/),
        "sampling a texture it never declared is refused -- that is how from/to get read behind the host's back");
    ok(breaks("uniform float progress;\nvec4 transition(vec2 uv){ return mix(getFromColor(uv), getToColor(uv), progress); }", /redeclares "progress"/),
        "shadowing a provided uniform is refused -- it compiles fine and then freezes at whatever it defaulted to");
    ok(breaks("vec4 getFromColor(vec2 uv) { return vec4(0.0); }\nvec4 transition(vec2 uv){ return getFromColor(uv); }", /redefines getFromColor/),
        "redefining a provided function is refused");
    ok(breaks("uniform float amount;\nvec4 transition(vec2 uv){ return mix(getFromColor(uv), getToColor(uv), progress*amount); }", /no default/),
        "a parameter with no spec default is refused");
    ok(breaks("uniform mat4 m; // = 1.0\nvec4 transition(vec2 uv){ return mix(getFromColor(uv), getToColor(uv), progress); }", /not a transition parameter type/),
        "a parameter of a type the host cannot supply is refused");
    ok(breaks("vec4 transition(vec2 uv) { return vec4(uv, 0.0, 1.0); }", /neither getFromColor nor getToColor/),
        "a shader reading neither input is refused -- it cannot be a transition between two things");

    // --- BUG 1: the inline block-comment default sits BEFORE the semicolon.
    // The shape burn.glsl has. Hand-written here; the corpus file is not in this tree.
    const inlineDefault = "// Author: t\n// License: MIT\nuniform vec3 tint /* = vec3(0.9, 0.4, 0.2) */;\n" +
                          "vec4 transition(vec2 uv){ return mix(getFromColor(uv), getToColor(uv)*vec4(tint,1.0), progress); }";
    const ps = parseParams(inlineDefault);
    ok(ps.length === 1, `an inline "/* = ... */" default before the semicolon yields ONE parameter, not ${ps.length}`);
    ok(ps[0].name === "tint" && ps[0].type === "vec3" && ps[0].default === "vec3(0.9, 0.4, 0.2)",
        `and it is vec3 tint = ${JSON.stringify(ps[0].default)} -- the commas inside the default are not name separators`);
    ok(validateTransition(inlineDefault).length === 0,
        "so the file conforms; the first version reported three fictional uniforms named after fragments of the default");
    ok(JSON.stringify(defaultValue(ps[0])) === "[0.9,0.4,0.2]", "and the pass can turn that default into a uniform value");

    // --- BUG 2: a transition MAY take its own texture parameter.
    const withSampler = "// Author: t\n// License: MIT\nuniform sampler2D mask;\n" +
                        "vec4 transition(vec2 uv){ return mix(getToColor(uv), getFromColor(uv), step(progress, texture2D(mask, uv).r)); }";
    ok(validateTransition(withSampler).length === 0,
        "a transition taking its OWN sampler2D and reading from/to through the provided functions conforms");
    ok(PARAM_TYPES.includes("sampler2D") && UNDEFAULTABLE.includes("sampler2D"),
        "sampler2D is a parameter type, and is exempt from the default requirement -- no literal names an image");
    note("banning sampler2D outright rejected luma.glsl and displacement.glsl, and luma.glsl is by the spec's own author");

    // --- BUG 3: a user function named `texture` is not a texture fetch.
    const ownTexture = "// Author: t\n// License: MIT\nvec4 texture(vec2 p) { return getFromColor(p) * 0.5; }\n" +
                       "vec4 transition(vec2 uv){ return mix(texture(uv), getToColor(uv), progress); }";
    ok(validateTransition(ownTexture).length === 0,
        "a local helper named texture(vec2) is not a texture fetch -- a fetch takes a SAMPLER as its first argument");
    ok(breaks("uniform sampler2D a; vec4 transition(vec2 uv){ return texture2D(b, uv); }", /samples "b"/),
        "...while sampling an undeclared name is still refused, so the narrowing did not blunt the rule");

    // Comment stripping keeps line numbers, so a future line-numbered report stays honest.
    const withComments = "a\n// gone\nb\n/* also\ngone */\nc";
    ok(stripComments(withComments).split("\n").length === withComments.split("\n").length,
        "stripComments preserves the line count");
    ok(!/gone/.test(stripComments(withComments)), "and removes both comment forms");
    ok(parseMetadata("// Author: Jane Doe\n// License: BSD 2 Clause\n").license === "BSD 2 Clause",
        "metadata is read from the COMMENTS, so a licence declared per-file survives");
    note("in the published corpus 98 files declare MIT, 1 BSD 3 Clause (Hewlett-Packard) and 1 BSD 2 Clause -- " +
         "in a repository whose LICENSE is MIT. The per-file header is the only place that difference is written down.");
}

// 3) *** THE ENDPOINT LAW. THE REASON THE TRANSITIONS EXIST TWICE. ***
{
    const RATIOS = [1, 16 / 9, 9 / 16, 3, 0.25];
    for (const [name, fn] of Object.entries(MODELS)) {
        for (const ratio of RATIOS) {
            const r = evaluateEndpoints((uv, c) => fn(uv, c), { ratio, grid: 24 });
            ok(r.ok, `${name} at ratio ${ratio.toFixed(3)}: progress 0 is exclusively FROM (${r.atZero.toExponential(1)}) ` +
                     `and progress 1 exclusively TO (${r.atOne.toExponential(1)})`);
        }
    }
    // The wipe holds in every direction, not just the axis-aligned one it was eyeballed in.
    for (const direction of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 0.5], [0.3, -0.9]]) {
        const r = evaluateEndpoints((uv, c) => wipe(uv, c, { direction }), { ratio: 16 / 9, grid: 24 });
        ok(r.ok, `swekWipe direction [${direction}] holds the endpoint law at 16:9`);
    }
    // And the iris from an off-centre origin, where the "furthest corner" term earns its keep.
    for (const centre of [[0.5, 0.5], [0, 0], [1, 1], [0.15, 0.8]]) {
        const r = evaluateEndpoints((uv, c) => iris(uv, c, { centre }), { ratio: 16 / 9, grid: 24 });
        ok(r.ok, `swekIris from [${centre}] holds the endpoint law -- the iris reaches the furthest corner by progress 1`);
    }

    // *** THE BUG THIS HARNESS CAUGHT, REPLAYED. *** Not "a violation would be caught" as an assertion -- the
    // exact wrong line, required to fail, so the check cannot quietly stop covering it.
    const brokenWipe = (uv, ctx, { direction = [1, 0], softness = 0.05 } = {}) => {
        const r = ctx.ratio, p = [(uv[0] - 0.5) * r, uv[1] - 0.5];
        let dx = direction[0] * r + 1e-6, dy = direction[1] + 1e-6;
        const dl = Math.hypot(dx, dy); dx /= dl; dy /= dl;
        const extent = 0.5 * (Math.abs(dx) * r + Math.abs(dy)) * 2;
        const t = (p[0] * dx + p[1] * dy) / Math.max(extent, 1e-6) + 0.5;
        const front = ctx.progress * (1 + 2 * softness) - softness;
        const f = smoothstep(front - softness, front + softness, 1 - t);   // <- the shipped-then-fixed order
        const a = ctx.getFromColor(uv), b = ctx.getToColor(uv);
        return a.map((v, i) => v * (1 - f) + b[i] * f);
    };
    const bad = evaluateEndpoints(brokenWipe, { ratio: 1, grid: 8 });
    ok(!bad.ok, "the smoothstep order swekWipe originally shipped with FAILS the law");
    ok(bad.atZero === 1 && bad.atOne === 1,
        `and it fails by exactly 1.0 at both ends -- the maximum possible: it showed the wrong image entirely, not a soft edge`);
    for (const ratio of [1, 16 / 9, 3]) {
        ok(!evaluateEndpoints(brokenWipe, { ratio, grid: 8 }).ok, `...at ratio ${ratio.toFixed(2)} too -- no aspect ratio hid it`);
    }
    // A crossfade is the control: if IT ever failed, the harness would be the thing that is wrong.
    ok(evaluateEndpoints(crossfade, { ratio: 16 / 9, grid: 24 }).atZero === 0, "the crossfade control is exactly 0 at progress 0");
    // The harness must also catch a subtle failure, not only a total one.
    const slightlyOff = (uv, ctx) => { const a = ctx.getFromColor(uv), b = ctx.getToColor(uv);
        const f = 0.001 + 0.998 * ctx.progress; return a.map((v, i) => v * (1 - f) + b[i] * f); };
    const s = evaluateEndpoints(slightlyOff, { grid: 8 });
    ok(!s.ok && s.atZero > 9e-4 && s.atZero < 1.1e-3,
        `a transition that is 0.1% wrong at the ends is caught too (${s.atZero.toExponential(2)}) -- the law is exact, not approximate`);
}

// 4) *** RATIO CORRECTION: THE HALF A SQUARE PREVIEW HIDES. ***
{
    const W = 1920, H = 1080;
    const probe = (ctx, axis) => { let lo = 0, hi = 0.5;
        for (let k = 0; k < 50; k++) { const mid = (lo + hi) / 2;
            const uv = axis === "x" ? [0.5 + mid, 0.5] : [0.5, 0.5 + mid];
            if (iris(uv, ctx)[2] > 0.5) lo = mid; else hi = mid; }
        return (lo + hi) / 2; };
    const ctx = (ratio, progress) => ({ progress, ratio, getFromColor: () => [1, 0, 0, 1], getToColor: () => [0, 0, 1, 1] });
    for (const pr of [0.2, 0.3, 0.4]) {
        // *** PROBED WHERE THE IRIS FITS INSIDE THE FRAME, WHICH MY FIRST MEASUREMENT DID NOT. *** At
        // progress 0.5 the iris radius already exceeds half the frame height, so the vertical probe returns
        // the FRAME EDGE and the ratio reads 1.0199 -- a number that looks like a small error in the shader
        // and is entirely an artefact of the measurement. Below 0.45 the boundary is real on both axes.
        const good = ctx(W / H, pr), naive = ctx(1, pr);
        const rx = probe(good, "x") * W, ry = probe(good, "y") * H;
        const sx = probe(naive, "x") * W, sy = probe(naive, "y") * H;
        ok(ry < H * 0.49 && sy < H * 0.49, `at progress ${pr} the iris boundary is inside the frame on both axes -- the probe measures the shader`);
        ok(Math.abs(rx / ry - 1) < 1e-6, `ratio-corrected iris is a CIRCLE on 1920x1080: ${rx.toFixed(1)} x ${ry.toFixed(1)} px, ratio ${(rx / ry).toFixed(6)}`);
        ok(Math.abs(sx / sy - W / H) < 1e-6,
            `the same shader told ratio=1 is an ELLIPSE stretched by exactly 16/9: ${sx.toFixed(1)} x ${sy.toFixed(1)} px, ratio ${(sx / sy).toFixed(4)}`);
    }
    note("that is a 77.8% horizontal stretch -- invisible on the square preview a transition is usually authored against");
}

// 5) *** ASSEMBLY: THE HOST SUPPLIES ALL FOUR NAMES, IN ONE PLACE. ***
{
    const src = read("shaders/transitions/swekCrossfade.glsl");
    const asm = assemble(src);
    for (const u of PROVIDED.uniforms) ok(new RegExp(`uniform float ${u};`).test(asm), `assemble() declares ${u}`);
    for (const f of PROVIDED.functions) ok(new RegExp(`vec4 ${f}\\(vec2 uv\\)`).test(asm), `assemble() defines ${f}()`);
    ok(/uniform sampler2D uFrom;[\s\S]*uniform sampler2D uTo;/.test(asm), "and binds the two textures itself, which is why the transition never does");
    ok(asm.includes(src), "the author's source is included verbatim -- assemble wraps, it does not rewrite");
    ok(/gl_FragColor = transition\(vUv\);/.test(asm), "and calls transition() once per fragment");
    // The out-of-bounds policy is the host's, and both choices are real.
    ok(/return vec4\(0\.0\)/.test(assemble(src)), "default out-of-bounds is transparent black -- a visible answer");
    ok(/clamp\(uv, 0\.0, 1\.0\)/.test(assemble(src, { outOfBounds: "clamp" })), "and clamp is available, which smears the edge texel instead");
    ok(!/clamp\(uv/.test(assemble(src)), "the two policies do not both appear -- assemble picks one");
    ok(assemble(src, { precision: "mediump" }).startsWith("precision mediump float;"), "precision is the caller's choice");
}

// 6) *** THE LIMITS ARE STATED, AND THEY ARE TRUE. ***
//    A module claiming a limitation it does not have is as misleading as one hiding a limitation it does.
{
    ok(LIMITS.length === 3, `${LIMITS.length} limits are written down`);
    const preproc = "// Author: t\n// License: MIT\n#if 0\nuniform float ghost;\n#endif\n" +
                    "vec4 transition(vec2 uv){ return mix(getFromColor(uv), getToColor(uv), progress); }";
    ok(parseParams(preproc).length === 1, "LIMIT 1 is real: a uniform inside #if 0 is still read as declared");
    ok(hasEntryPoint("vec4 transition(\n  vec2 uv\n) { return getFromColor(uv); }"),
        "a signature split across lines IS found -- the limit I originally wrote down here claimed otherwise and was false");
    ok(!hasEntryPoint("vec4 transition(vec2 uv);"),
        "a PROTOTYPE is not an entry point -- it satisfies every word of the signature and has nothing to run");
    ok(validateTransition("// Author: t\n// License: MIT\nvec4 transition(vec2 uv);\nvec4 h(vec2 p){ return getFromColor(p); }").some((x) => /no entry point/.test(x)),
        "...and a prototype-only file is refused, where the first version returned zero problems on it");
    ok(hasEntryPoint("vec4 transition(vec2 uv) { }"),
        "LIMIT 2 is real: an EMPTY body still counts as an implementation -- the brace is all this can check");
    ok(validateTransition("// Author: t\n// License: MIT\nvec4 transition(vec2 uv){ return getFromColor(uv) + notAThing; }").length === 0,
        "LIMIT 3 is real: an undefined identifier conforms here and fails at glCompileShader");
    ok(LIMITS.every((l) => typeof l === "string" && l.length > 20), "each limit is a sentence, not a keyword");
}

// 7) *** PURITY, WIRING, AND NOTHING VENDORED. ***
{
    const spec = codeOnly(read("render/transitionSpec.mjs"));
    ok(!/\bdocument\b|\bwindow\b|WebGLRenderingContext|createShader/.test(spec),
        "transitionSpec.mjs has no GL and no DOM -- the contract is checkable with no context");
    ok(!/readFileSync|fetch\(/.test(spec), "and reads no files and no network: it is handed a string");
    const model = codeOnly(read("render/transitionModel.mjs"));
    ok(!/Math\.random|Date\.now|performance\./.test(model), "the CPU models have no clock and no randomness -- the same input gives the same answer");

    // *** NOTHING FROM THE CORPUS IS IN THE TREE. *** The round's whole claim is that the spec was taken and
    // the shaders were not. A grep for their distinctive names is what makes that checkable rather than said.
    const CORPUS = ["InvertedPageCurl", "StereoViewer", "cannabisleaf", "ButterflyWaveScrawler",
                    "DoomScreenTransition", "powerKaleido", "luminance_melt", "crosshatch"];
    const tree = fs.readdirSync(TDIR);
    for (const name of CORPUS) ok(!tree.some((f) => f.includes(name)), `no shaders/transitions/${name}* -- the corpus was read, not taken`);
    ok(shipped.every((f) => f.startsWith("swek")), `all ${shipped.length} shipped transitions are this tree's own: ${shipped.join(", ")}`);

    const mainQ = noComments(read("main.js"));
    const mainC = codeOnly(read("main.js"));
    ok(/import\s*\{[^}]*makeTransitionPass[^}]*\}\s*from\s*["']\.\/render\/transitionPass\.js["']/.test(mainQ),
        "main.js imports makeTransitionPass from render/transitionPass.js");
    ok(/window\.transitions\s*=/.test(mainC), "and exposes window.transitions");
    ok(/validateTransition/.test(mainC), "including the validator, so a shader can be checked before it is run");

    const passSrc = codeOnly(read("render/transitionPass.js"));
    ok(/validateTransition\(source\)/.test(passSrc) && /if \(problems\.length && !opts\.force\)/.test(passSrc),
        "the pass validates BEFORE compiling -- a conforming-looking shader that samples its own texture compiles fine and renders wrong");
    ok(/getShaderInfoLog/.test(passSrc), "and returns the driver's compile log rather than swallowing it behind 'invalid transition'");
    ok(/deleteProgram/.test(passSrc) && /deleteBuffer/.test(passSrc), "dispose() releases the program and the buffer");
    for (const f of shipped) note(`${f}: ${parseTransition(fs.readFileSync(path.join(TDIR, f), "utf8")).params.length} parameter(s)`);
}

console.log(`transitionSpec-selfcheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
