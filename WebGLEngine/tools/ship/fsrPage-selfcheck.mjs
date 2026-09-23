// WebGLEngine/tools/ship/fsrPage-selfcheck.mjs -- v4638
//
// Run: node tools/ship/fsrPage-selfcheck.mjs
//
// *** fsr.html HAD NO GATE AT ALL, AND IT IS THE ONLY CALLER THE TEMPORAL ARC HAS. ***
//
// Sixteen rounds built the temporal chain -- jitter, resolve, accumulate, motion vectors, disocclusion,
// rectify -- and every one of them is gated against a fixture. fsr.html is the one place any of it runs for a
// reader, and nothing graded the page: not that it imports the chain, not that the chain fires, not that its
// counters mean what the note beside them says. tools/ship/kernelReach.mjs counted the cost of that from the
// other side, as kernels with no caller.
//
// This drives the page's OWN script under a DOM stub rather than re-deriving anything, so what is measured is
// the page and not a copy of it. Three claims, and the middle one is the round:
//
//   1. the page imports the reject chain and owns none of it
//   2. THE CHAIN FIRES: the dolly camera reports genuine disocclusions, and the two cameras that came before
//      it report exactly zero -- the control that says the number is about parallax and not about the wiring
//   3. the jitter sign, measured as a RECONSTRUCTION, which render/jitter-selfcheck.mjs's own closing note
//      says it cannot check: "the jitter's effect on a RENDERED frame, since every row here projects points
//      rather than rasterising"
//
// SABOTAGES: see the log at the foot of this file.
//
// *** v4655 -- SECTION 6 EXISTS BECAUSE THE DEVICE GATE STRUCTURALLY CANNOT REACH IT. *** The shading mask
// is exactly zero until its ring fills at frame 64, and fsrPageObjects-selfcheck runs six, so the wired and
// unwired pages are byte-identical there. Three sabotages proved it: `shading: null`, a constant ring
// period, and a faked quantile array all scored ZERO against the device rows. They are held on the SOURCE
// here and labelled as declaration checks, which this tree rates below behavioural ones -- runnerReach's
// header records six sabotages walking past exactly that shape -- so each row asserts the VALUE rather than
// the word: `shading: null` fails, and reinstating the count-above-zero fails.
"use strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { noComments } from "./sourceScan.mjs";
import { viewProj } from "../../render/rasterProbe.js";
import { jitterProjection } from "../../render/jitter.mjs";
import { resolveJitterAwareCPU } from "../../render/temporalResolve.mjs";
import { mat4Invert, transform4 } from "../../render/motionVectors.mjs";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);

const PAGE = path.join(ENG, "fsr.html");
const raw = fs.readFileSync(PAGE, "utf8");
const src = noComments(raw);

console.log("fsrPage-selfcheck -- the temporal arc's only caller, and whether the chain actually fires\n");

// -----------------------------------------------------------------------------------------------------------
console.log("1. *** THE PAGE IMPORTS THE CHAIN AND OWNS NONE OF IT ***");
{
    ok("it is a module script and the tags balance",
        /<script type="module">/.test(src) &&
        (src.match(/<script/g) || []).length === (src.match(/<\/script>/g) || []).length);
    const wants = [
        ["render/temporalReject.mjs", ["disocclusionCPU", "historyFactorCPU", "rectifiedAccumulateCPU"]],
        ["render/motionVectors.mjs", ["motionVectorsCPU", "mat4Invert", "transform4"]],
        ["render/rasterProbe.js", ["viewProj"]],
        ["render/jitter.mjs", ["jitterProjection"]],
    ];
    for (const [mod, syms] of wants) {
        // ALL the import lines for that module, not the first: the page imports from render/jitter.mjs twice,
        // and a `find` read only the earlier line and called jitterProjection missing. Found by this gate's
        // own first run, which is the cheapest place to find it.
        const lines = src.split("\n").filter((l) => l.includes(`from "./${mod}"`));
        const missing = syms.filter((sym) => !lines.some((l) => l.includes(sym)));
        ok(`imports ${syms.join(", ")} from ${mod}`, lines.length > 0 && missing.length === 0,
            lines.length ? (missing.length ? "missing: " + missing.join(", ") : `${lines.length} import line(s)`)
                         : `no import line for ${mod}`);
    }
    // A front door that re-derives the thing it is a door to is the failure lensingPage-selfcheck.mjs names.
    // The disocclusion test is one subtraction; a page that wrote it inline would look identical on screen.
    ok("*** and it does NOT re-derive the disocclusion test inline -- no `expect - was`, no threshold comparison of its own ***",
        !/nearerIsLess\s*\?/.test(src) && !/prevDepth\s*\[[^\]]*\]\s*[<>]/.test(src),
        "the page passes prevDepth and a threshold in and reads a mask out");
    ok("  ...and it does not hand-write the motion field, which is what it used to do",
        !/motion\[\s*i\s*\*\s*4\s*\]\s*=/.test(src),
        "v4592 replaced a written constant with motionVectorsCPU; the fourth channel is the whole reject test");
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n2. *** THE CHAIN FIRES, AND THE TWO OLDER CAMERAS ARE THE CONTROL THAT SAYS WHY ***");

/** Drive the page's own script under a DOM stub. Returns the strings it wrote to its own status line. */
async function drivePage({ scene = "zone", camera = "dolly", ratio = "2", frames = 2 } = {}) {
    let s = raw.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
    s = s.replace(/from "\.\//g, `from "${ENG}/`).replace(/from "\/ui\//g, `from "${ENG}/ui/`);
    const CTL = { scene, camera, ratio, alpha: "0.1", sharp: "1" };
    const texts = {}, cache = {};
    const el = (id) => ({
        get value() { return CTL[id]; },
        set textContent(v) { texts[id] = v; }, get textContent() { return texts[id] || ""; },
        set onchange(_) {}, set onclick(_) {}, set oninput(_) {}, width: 0, height: 0,
        getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
                             putImageData: () => {}, clearRect: () => {} }),
    });
    globalThis.document = { getElementById: (id) => (cache[id] ||= el(id)), createElement: () => el("canvas") };
    // No adapter on purpose: the CPU reference is the path a gate can hold to a number on any box.
    Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
    globalThis.window = { isSecureContext: true, location: { protocol: "https:", hostname: "localhost" } };
    let pending = null;
    globalThis.requestAnimationFrame = (fn) => { pending = fn; };
    s += "\nglobalThis.__tick = tick; globalThis.__run = (v) => { running = v; };";
    // *** v4639 -- THE SCRATCH GOES OUTSIDE THE TREE. *** This wrote `.fsrpage-XXXX/page.mjs` INSIDE the engine
    // root, cleaned up in a finally -- which covers a throw and not a SIGKILL, and quickSweep SIGKILLs a gate at
    // a 20 s cap (quickSweep.mjs:345, on a detached group). Nothing runs after SIGKILL, so whatever is live at
    // that instant stays.
    //
    // *** AND THE FIRST VERSION OF THIS NOTE CARRIED A MEASUREMENT THAT WAS AN ARTEFACT OF A CACHE. *** It said
    // "every tree walk in this repo skips dot-directories, so a stray one moves NO census -- enumerateGates
    // 1737 -> 1737 and recordDrift's sources() 4261 -> 4261". The gate half is true. The sources() half is
    // FALSE, and it read as true because the probe called sources() TWICE IN ONE PROCESS: treeRead.mjs's
    // treeFiles() memoises on `root` (treeRead.mjs:155-163, `_cache.get(root)`), so the second call never
    // walked anything and returned the first call's array. Re-measured one walk per process:
    //
    //     recordDrift's sources()   4261 -> 4263   COUNTS both strays -- SKIP is /node_modules|vendor|dist/
    //                                              (treeRead.mjs:61) and has no dot-directory clause at all
    //     enumerateGates            1737 -> 1737   immune, it carries `e.name.startsWith(".")` (gateSweep.mjs)
    //
    // So the two walker families disagree about dot-directories, and a SIGKILLed gate leaving one .mjs behind
    // DOES move vba/runtimeGap.mjs's twelve-row census -- which is the record this round had to re-take by
    // hand anyway, and would have re-taken against a phantom. The wrong reading is kept here rather than
    // deleted, with how it was taken, because a probe that measures its own cache is the reusable lesson.
    //
    // os.tmpdir() ends it at this site: the page source has already had its relative imports rewritten to
    // absolute paths, so the file does not need to live beside the tree to resolve them.
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fsrpage-")), "page.mjs");
    fs.writeFileSync(tmp, s);
    try {
        await import(tmp + "?" + Math.random());
        globalThis.__run(true);
        for (let i = 0; i < frames; i++) { pending = null; await globalThis.__tick(); if (!pending) break; }
    } finally { fs.rmSync(path.dirname(tmp), { recursive: true, force: true }); }
    const num = (re, t) => { const m = (t || "").match(re); return m ? Number(m[1]) : null; };
    return {
        genuine: num(/disocclusion: (\d+) genuine/, texts.disstat),
        noHistory: num(/(\d+) with no history/, texts.disstat),
        discarded: num(/history discarded (\d+)/, texts.accstat),
        offscreen: num(/rejected offscreen (\d+)/, texts.accstat),
        disstat: texts.disstat || "", accstat: texts.accstat || "",
    };
}

{
    const dolly = await drivePage({ camera: "dolly", frames: 2 });
    report(`dolly   ${dolly.disstat}`);
    report(`dolly   ${dolly.accstat}`);
    ok("*** the dolly camera reports GENUINE disocclusions -- the reject chain has a caller and the caller makes it fire ***",
        dolly.genuine > 0,
        `${dolly.genuine} genuine, ${dolly.noHistory} with no history. Zero here would mean the page wires the ` +
        "chain correctly and measures nothing, which is what an orthographic camera does.");
    ok("  ...and the accumulate DISCARDS that history rather than merely counting it",
        dolly.discarded === dolly.genuine,
        `history discarded ${dolly.discarded} against ${dolly.genuine} genuine. The mask is 1 = history WRONG and ` +
        "the rectify reads 1 = history TRUSTED; historyFactorCPU is the inversion, and skipping it discards every pixel.");
    // *** THE OTHER HALF OF SECTION 5's ATTRIBUTION ROW. *** navigator.gpu is absent here, so this IS the CPU
    // branch, and it has to say so. Section 5 runs the same page on an adapter and requires "the device" from
    // the same two readouts: one label, two engines, and each side is driven rather than assumed. A page that
    // printed "the device" unconditionally would pass section 5 and fail here.
    ok("  ...and with no navigator.gpu the SAME two readouts say the counters came from the CPU",
        /counted on the CPU/.test(dolly.disstat) && /counted on the CPU/.test(dolly.accstat) &&
        !/counted on the device/.test(dolly.disstat + dolly.accstat),
        "both readouts name their engine, because both engines produce the same integers -- the counts alone " +
        "cannot say which one ran, which is exactly what a silent fallback would hide.");

    // *** THE CONTROL. *** Without it the row above says only that some number is positive.
    const pan = await drivePage({ camera: "pan", frames: 2 });
    const stat = await drivePage({ camera: "static", frames: 2 });
    report(`pan     ${pan.accstat}`);
    ok("*** and the two older cameras report NO disocclusion at all, which is what says the number is about parallax ***",
        pan.genuine === null && stat.genuine === null,
        "an orthographic camera translating parallel to the image plane cannot reveal one however much depth the " +
        "scene has: the image and the depth field translate together, so the surface found at the reprojected " +
        "position is the same surface. Measured all four cells at v4638 -- ortho/flat 0, ortho/two-planes 0, " +
        "perspective/one-plane 0, perspective/two-planes non-zero.");
    ok("  ...and the panning camera's offscreen column is still exactly one, so this round moved nothing it did not mean to",
        pan.offscreen === 192 && stat.offscreen === 0,
        `pan ${pan.offscreen}, static ${stat.offscreen}. 192 is one column of a 192-tall display; it is the ` +
        "reading that proved the motion-vector sign at v4586 and it is untouched by the dolly.");
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n3. *** THE JITTER SIGN, MEASURED AS A RECONSTRUCTION -- THE ROW jitter-selfcheck SAYS IT CANNOT DO ***");
{
    // render/jitter.mjs's CONVENTION block fixes the units and the axes and not the SENSE: whether a positive
    // jx moves the SAMPLE right or the IMAGE right. jitterProjection says the image; resolveJitterAwareCPU's
    // `sx = u*rw - 0.5 - jx` says the sample. Both are self-consistent and both gates pass. fsr.html's dolly is
    // the first caller of BOTH, and a caller that does not negate one is shifted by two offsets instead of none.
    const R = 64, W = 128;
    const vp = viewProj([0, -8, 0], [0, 1, 0], [1, 0, 0], [0, 0, 1], Math.tan(0.5), 1, 0.1, 100);
    const pat = (u, v) => 0.5 + 0.3 * Math.sin(6 * u) * Math.cos(5 * v);
    const renderAt = (m, w) => {
        const inv = mat4Invert(m), out = new Float32Array(w * w * 4);
        for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
            const nx = 2 * ((x + 0.5) / w) - 1, ny = 1 - 2 * ((y + 0.5) / w);
            const a = transform4(inv, nx, ny, -1, 1), b = transform4(inv, nx, ny, 1, 1);
            const ax = a[0] / a[3], ay = a[1] / a[3], az = a[2] / a[3];
            const bx = b[0] / b[3], by = b[1] / b[3], bz = b[2] / b[3];
            const t = (0 - ay) / (by - ay);
            const s = pat((ax + t * (bx - ax) + 6) / 12, (az + t * (bz - az) + 6) / 12);
            for (let c = 0; c < 4; c++) out[(y * w + x) * 4 + c] = c === 3 ? 1 : s;
        }
        return out;
    };
    const rms = (a, b) => { let s = 0, n = 0; for (let i = 0; i < a.length; i += 4) for (let c = 0; c < 3; c++) { const d = a[i + c] - b[i + c]; s += d * d; n++; } return Math.sqrt(s / n); };
    const REF = renderAt(vp, W);
    const [jx, jy] = [0.37, -0.29];
    const res = (frame) => resolveJitterAwareCPU({ src: frame, rw: R, rh: R, dw: W, dh: W, jitter: [jx, jy] }).data;
    const floor = rms(resolveJitterAwareCPU({ src: renderAt(vp, R), rw: R, rh: R, dw: W, dh: W, jitter: [0, 0] }).data, REF);
    const same = rms(res(renderAt(jitterProjection(vp, jx, jy, R, R), R)), REF);
    const negd = rms(res(renderAt(jitterProjection(vp, -jx, -jy, R, R), R)), REF);
    report(`rms against the unjittered truth: resolve's own floor ${floor.toExponential(4)}, same sign ${same.toExponential(4)}, negated ${negd.toExponential(4)}`);
    ok("*** the NEGATED pairing reconstructs and the same-sign pairing does not -- the two modules read one number in opposite senses ***",
        negd < floor * 2 && same > floor * 5,
        `negated is ${(negd / floor).toFixed(2)}x the floor, same-sign is ${(same / floor).toFixed(1)}x. Neither ` +
        "module is wrong; the sentence they share does not say which way the offset points.");
    ok("  and fsr.html's dolly negates, so the page is on the reconstructing side",
        /jitterProjection\(vpCur,\s*-jx,\s*-jy,\s*R,\s*R\)/.test(src),
        "a page that passed +jx would score about 4.7 dB lower and clamp its whole frame; the CLAMP COUNTER is " +
        "what said so, which is the second time a counter on this page has caught a sign before the picture did.");
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n4. CONTROLS");
{
    ok("the page is read from disk, not restated here", raw.length > 5000 && fs.existsSync(PAGE),
        `${raw.length} bytes`);
    ok("the dolly's threshold is DERIVED from the camera rather than written down",
        /0\.25\s*\*\s*gap/.test(src) && /gap > 1e-4/.test(src),
        "a quarter of the near/far clip-z gap, guarded against a zero gap -- disocclusionCPU throws on a " +
        "non-positive threshold, so an undersized scene would take the page down instead of reporting nothing");
    ok("  and the page keeps a previous DEPTH buffer, which is the state the chain needs and the easiest to forget",
        /let prevDepth = null/.test(src) && /prevDepth = depth/.test(src),
        "disocclusionCPU compares the depth a surface WOULD have had against the depth RECORDED then");
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n5. *** THE OBJECT-MOTION CAMERA (v4649): THE FIRST TIME THIS PAGE'S MOTION IS NOT PURELY THE CAMERA'S ***");
{
    // Every number this page has printed came from a scene where only the camera moved -- and on such a scene
    // render/objectMotion.mjs is EXACTLY render/motionVectors.mjs, because every model matrix is the identity.
    // v4646 measured the gap on a synthetic fixture and v4648 on a rasterised one; neither was a frame.
    ok("the page offers a camera whose OBJECT moves, and imports the arc's object-motion pair for it",
        /value="objects"/.test(src) && /objectMotionGPU\.mjs/.test(src) && /objectMotion\.mjs/.test(src)
        && /ObjectMotionGPU/.test(src) && /buildObjectMatrices/.test(src),
        "a fourth camera rather than a change to the dolly, so the dolly's own numbers cannot move");
    ok("!! *** the id buffer is DERIVED FROM hit(), not rasterised and not declared ***",
        /function renderIds\(/.test(src) && /function renderIds\([\s\S]{0,500}hit\(inv[\s\S]{0,80}\)\[1\] === Y_NEAR/.test(src),
        "v4648 built a compute rasteriser because nothing in the tree produced an id buffer. This page needs " +
        "none: hit() returns where the ray met the scene and its y says which surface that was -- the same " +
        "comparison patternUV has made on every dolly frame since that camera existed. The identity was " +
        "computed and discarded on the next line. The producer here is a `return`, and a row that let this " +
        "become a second traversal of the scene would be letting the page recompute what it already knew.");
    ok("!! ...and the SLAB'S PATTERN travels with the slab, so a moving surface is not sliding under a fixed texture",
        /patternUV = \(p, sx = 0\)/.test(src) && /p\[0\] - sx - SLAB_X\[0\]/.test(src),
        "a slab that moved in the depth and id buffers and stood still in the picture is a scene no motion " +
        "vector can be right about, and every row below would be measuring that instead of the reprojection");
    // *** THE ADDITIVITY IS A SOURCE CLAIM BECAUSE IT HAS TO SURVIVE WITHOUT THE BASELINE FILE. ***
    // It was VERIFIED numerically when the change was made -- the pre-change page was served alongside the
    // new one and all three older cameras produced identical dTmp, dFsr, disocclusion and accumulate lines
    // over five frames -- but that control needed a copy of the old page on disk and cannot ship. What can
    // ship is the reason it held: every sampler takes the slab offset with a default of 0, and the three
    // older cameras pass none.
    const samplers = ["function hit\\(inv, u, v, sx = 0\\)", "function renderPersp\\(R, vp, kind, sx = 0\\)",
                      "function renderDepth\\(vp, sx = 0\\)", "function truthPersp\\(vp, kind, sx = 0\\)",
                      "function renderIds\\(vp, sx = 0\\)"];
    const missing = samplers.filter((r) => !new RegExp(r).test(src));
    ok("!! ...and EVERY sampler defaults its slab offset to zero, which is what keeps the three older cameras untouched",
        missing.length === 0,
        `${samplers.length} samplers, ${missing.length} without a zero default${missing.length ? ": " + missing.join(", ") : ""}. ` +
        "Verified numerically when the change was made, by serving the pre-change page beside it: static, pan " +
        "and dolly produced IDENTICAL stat lines over five frames. That control needed the old page on disk " +
        "and cannot ship; this is the property that made it true.");
    ok("  ...and the slab offset reaches the samplers ONLY on the objects camera",
        /const sxCur = objects \? sceneT\(\) \* SLAB_DX : 0/.test(src)
        && /const sxPrev = objects \? sceneTPrev\(\) \* SLAB_DX : 0/.test(src),
        "zero on every other camera, so a default that was quietly dropped would still be a no-op there. " +
        "The clock these read is v4661's sceneT(), not `frame`; at startFrame = 0 the two are the same " +
        "expression, which is what keeps every figure above meaning what it meant.");
    ok("!! ...and the page reports the gap WITH ITS CONTROL -- the background, whose model matrix is the identity",
        /objGap[\s\S]{0,900}ids\[i\] === 1[\s\S]{0,200}offSlab/.test(src) && /on the background/.test(src),
        "the background number is the control: object-aware and camera-only are the same computation where " +
        "the model matrix is the identity, so a field that moved BOTH would be a mislabelled id buffer " +
        "rather than working object matrices. A single number could not tell those apart.");
    // DERIVED, not quoted: the gap the page prints must be the slab's own screen motion, because camera-only
    // predicts zero object motion and so its error IS the object's screen displacement.
    const TANFOV = Math.tan(0.5), DIST = 4, D = 192;
    const m = /const SLAB_DX = ([\d.]+);/.exec(src);
    const dx = m ? Number(m[1]) : NaN;
    const predicted = dx / (2 * DIST * TANFOV) * D;
    report(`SLAB_DX ${dx} world units/frame -> ${predicted.toFixed(3)} display px/frame at the slab plane`);
    ok("!! ...and that predicted motion is the 2.42 px the page prints, which is what makes the number a DERIVATION",
        Math.abs(predicted - 2.42) < 0.01,
        `${predicted.toFixed(3)} px from the geometry against 2.42 px measured on a device. Camera-only ` +
        "predicts ZERO object motion, so its error is exactly the object's screen displacement -- the page's " +
        "headline number is forced by the scene's dimensions and is not free to be anything else.");
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n6. *** THE SHADING MASK REACHES THE CHAIN (v4655), AND THIS IS A DECLARATION CHECK ON PURPOSE ***");
{
    // *** A SABOTAGE SETTING `shading: null` SCORED ZERO AGAINST THE DEVICE GATE AND THIS IS WHY. ***
    // SHADING_SHIFT writes 0 at every pixel until the ring fills, and the ring is 2 x jitterPhaseCount --
    // SIXTY-FOUR frames at ratio 2. tools/ship/fsrPageObjects-selfcheck.mjs runs six, so passing the mask and
    // passing null produce byte-identical frames there and no behavioural row can tell them apart. Driving 65
    // frames costs about 25 seconds, which is eight times that gate's whole budget.
    //
    // So the wiring is held HERE, on the source, and labelled as what it is. This tree's own rule is that a
    // declaration check is weaker than a behavioural one -- runnerReach-selfcheck's header records SIX
    // sabotages walking past rows that tested for a declaration while the behaviour changed. The mitigation
    // is that the row asserts the ARGUMENT IS THE COMPUTED MASK rather than merely that the word appears:
    // `shading: null` and a missing line both fail it.
    // v4656 -- the argument became conditional when the control arm landed, so this row follows it there
    // rather than being relaxed: `shading: null` outright still fails, and so does a switch that never
    // reaches the mask.
    ok("!! the reject chain is handed the computed shading mask, not null and not nothing",
        /shading:\s*shadingOn \? shadingMask : null/.test(src)
        && /shadingMask = \(await lgpu\.shadingShift\(/.test(src),
        "a device row cannot see this: the mask is exactly zero for 64 frames, so at the six that gate runs " +
        "the wired and unwired pages are byte-identical. Stated as a declaration check rather than dressed " +
        "up as a behavioural one.");
    ok("  ...and the ring's period is the JITTER's phase count, which is the mechanism and not a tuning knob",
        /jitterPhaseCount\(parseFloat\(\$\("ratio"\)\.value\)\)/.test(src),
        "both halves of the ring must span the same jitter phases or the difference carries a residue of the " +
        "sampling and reports it as shading; a shorter ring would fill sooner and measure the wrong thing");
    // *** AND THE MASK IS SUMMARISED AS A DISTRIBUTION, WHICH IS THE ROUND'S WHOLE SUBJECT. *** v4654
    // reported a count of pixels above ZERO and concluded the opposite of what its own number measured. The
    // device gate cannot hold this either -- the quantile branch only runs once the ring fills at frame 64 --
    // so it is held here, and the row names the wrong statistic explicitly so that reinstating it fails.
    ok("!! the page summarises the mask by QUANTILES, and not by a count above zero",
        /p50: q\(0\.50\)/.test(src) && /p90: q\(0\.90\)/.test(src) && /p99: q\(0\.99\)/.test(src)
        && /Float32Array\.from\(shadingMask\)\.sort\(\)/.test(src)
        && !/shadingMask\[i\] > 0\b/.test(src),
        "SHADING_SHIFT is continuous, so on real content almost every pixel differs from its history by " +
        "something and a count above zero counts the arithmetic. MEASURED at v4655: median 0.0009, p90 " +
        "0.0844, p99 0.1739 -- about 16% of the frame reaches 0.05, so the mask is SELECTIVE, which is the " +
        "opposite of what v4654 concluded from the same field.");
    // *** v4656 -- THE MASK HAS A SWITCH, AND THAT IS WHAT TURNED v4655's OPEN QUESTION INTO A NUMBER. ***
    //
    // v4655 said whether the mask HELPS was not established. It was right to: the effect is +0.117 dB and
    // the frame-to-frame spread is 2.12 dB, so UNPAIRED it is eighteen times smaller than the noise it sits
    // in, and no number of samples taken one way makes it visible. PAIRED it is unambiguous -- twenty-one
    // frames past the ring's fill point, same content, same camera, mask attached and detached:
    //
    //     mean difference  +0.1171 dB      sd of the difference  0.0534
    //     positive frames  21 of 21        sign-test p = 4.8e-7        t = 10.05
    //
    // Every frame improves, the smallest by 0.02 dB and the largest by 0.22. The switch is what made that
    // measurable and what makes it RE-measurable on a rig, which is the difference between a finding and a
    // sentence in a comment. Verified through the switch itself afterwards: eleven frames, eleven positive,
    // values identical to the manual pass.
    ok("!! the shading mask has a CONTROL ARM, so the +0.117 dB is re-measurable rather than asserted",
        /<select id="shading">/.test(raw) && /shading:\s*shadingOn \? shadingMask : null/.test(src)
        && /const shadingOn = \$\("shading"\)\.value !== "off"/.test(src),
        "an A/B on a page nobody can flip is a claim about a build that no longer exists; this one is a " +
        "select, and the readout names which arm is running so a screenshot cannot be mistaken for the other");
    // *** v4658 -- THE REACTIVE MASK HAS AN ARM TOO, AND ITS RESULT IS THE OPPOSITE SHAPE. *** Measured
    // over fifty-one paired frames: mean +0.400 dB, sd 0.656, 37 frames up and 14 DOWN, t = 4.36, sign-test
    // p = 1.8e-3. It helps more on average than the shading mask and far less reliably -- that one is
    // +0.117 dB and never once loses. Both switches exist so both numbers are re-measurable.
    // *** AND THE MASK MUST BE COMPUTED, NOT ONLY SWITCHED. *** A sabotage leaving `reactiveMask` null
    // while the switch and the argument both stayed scored ZERO: at the frames any gate runs, a null mask
    // and a computed-but-ignored one produce identical frames, so only the assignment itself can be held.
    ok("!! the reactive mask has a control arm as well, and it is the one whose result NEEDED it",
        /<select id="reactive">/.test(raw) && /reactive:\s*reactiveOn \? reactiveMask : null/.test(src)
        && /const reactiveOn = \$\("reactive"\)\.value !== "off"/.test(src)
        && /const rx = await xgpu\.reactive\(\{/.test(src) && /reactiveMask = rx\.data/.test(src),
        "at TWENTY-ONE frames this mask's t-test cleared 0.05 and its sign test did not -- two tests, two " +
        "verdicts, and a round could have quoted whichever it preferred. Fifty-one settled it. A switch is " +
        "what makes taking more samples possible at all.");
    // *** v4659 -- AND THE PAGE MUST SAY WHAT THE MASK DID, NOT ONLY WHAT IT MOVED. *** For two rounds this
    // page computed the reactive mask, switched it, reported the PSNR it shifted, and printed NOTHING about
    // the mask's own behaviour -- while the shading mask beside it got quantiles at v4655 for exactly that
    // reason. Nothing is recoverable after the fact: every pixel the mask DECLINED writes the same 0.0 that
    // a pixel it examined and found in perfect agreement writes, so the counts exist only at the moment the
    // branch is taken. Hence counted: true, which is the half of this row a reader would otherwise drop.
    ok("!! the reactive mask's own behaviour is COUNTED and printed, not just its effect on the PSNR",
        // *** ANCHORED TO THE reactive() CALL, because /counted: true/ ALONE MATCHED THE WRONG ONE. *** The
        // first draft of this row tested that substring against the whole page; the sabotage that sets the
        // reactive call to counted: false scored ZERO against it, because rejectAndAccumulate's own
        // `counted: true` two dozen lines below satisfied it. A row that passes on a page where the thing it
        // names is switched off is decoration, and only the mutation found it.
        /xgpu\.reactive\(\{[\s\S]{0,500}?counted: true/.test(src) && /reactStat = \{ \.\.\.rx\.stats/.test(src)
        && /id="reactstat"/.test(raw) && /\$\("reactstat"\)\.textContent/.test(src)
        && /declinedInvalid/.test(src) && /declinedOffscreen/.test(src) && /declinedDepth/.test(src),
        "counted: true dispatches REACTIVE_WGSL/mainCounted, whose atomics are the only place the three " +
        "declines exist -- a pass over the finished mask cannot recover one of them, or even how many pixels " +
        "were looked at. Without it reactStat would be a spread of undefined and the readout would print it.");
    // BOTH selects, because the first version of this row named only the shading one and a sabotage
    // reordering the REACTIVE options scored zero against it. A control arm running by default would make
    // every other number on this page the control's, and that is true of whichever arm it is.
    ok("  ...and BOTH masks default to ON, so the page shows the wired path unless somebody asks otherwise",
        /<option value="on">shading mask: ON<\/option>\s*<option value="off"/.test(raw)
        && /<option value="on">reactive mask: ON<\/option>\s*<option value="off"/.test(raw),
        "the first option is the selected one, and a control arm that ran by default would make every other " +
        "number on this page the control's");
    ok("  ...and the ring is torn down on reset, so it cannot be read at a stride it was not built for",
        /lgpu\.destroyRing\(lockRing\)/.test(src) && /lockRing = null/.test(src),
        "a ring carried across a resolution or camera change would be read with the wrong stride and would " +
        "look like content rather than like a mistake");
}

console.log(fails ? `\nfsrPage-selfcheck: ${fails} FAILED` : "\nfsrPage-selfcheck: all checks pass");
console.log("\n12. *** WHICH CONSUMER CARRIED IT (v4666) ***");
{
    const PRE = path.resolve(path.dirname(PAGE), "render", "dilate-preregistration.md");
    const pre = fs.existsSync(PRE) ? fs.readFileSync(PRE, "utf8") : "";
    ok("the scope control exists and the reactive mask's field is switched by it",
       /<select id="dilscope">/.test(raw)
       && /const rxMotion = dilScope === "clip" \? motion : motionUsed;/.test(src),
       "the clip chain keeps the dilated field in both arms; only the mask's input moves, which is what " +
       "makes the two consumers separable at all");
    // *** THE DECOMPOSITION MUST ADD UP, AND THE NUMBERS ARE PARSED, NOT TYPED IN HERE. ***
    const rows = [...pre.matchAll(/([+-]\d+\.\d{4}) dB\s+t = (\d+\.\d+)\s+p = ([\d.e-]+)\s+sign (\d+)\/(\d+)/g)]
        .map((m) => ({ d: Number(m[1]), t: Number(m[2]), up: Number(m[4]), n: Number(m[5]) }));
    ok("!! *** the three arms decompose: clip-only plus the mask's increment IS the total ***",
       rows.length === 3 && Math.abs((rows[0].d + rows[2].d) - rows[1].d) < 5e-4,
       rows.length !== 3 ? `parsed ${rows.length} arms, expected 3`
           : `${rows[0].d} + ${rows[2].d} = ${(rows[0].d + rows[2].d).toFixed(4)} against a total of ` +
             `${rows[1].d}. Three numbers where two would do, and the third is the one a later edit gets ` +
             "wrong. Parsed out of the record rather than written into this gate.");
    ok("!! ...and the record still says the mask's increment clears NEITHER test",
       // \s+ between the words, not a literal space: these records are WRAPPED prose, and a phrase that
       // happens to straddle a line break fails a literal match while the sentence is plainly there. That
       // has now bitten three rows and one sabotage in this session -- including a mutation that silently
       // did nothing and was logged as a no-op at v4665 for exactly this reason.
       /clears \*\*neither\*\* test/i.test(pre) && /close\s+to\s+a\s+coin\s+flip/.test(pre)
       && /clears NEITHER test/.test(raw),
       "+0.076 dB with 29 frames up against 21 down. v4664 routed all three consumers together and for the " +
       "mask that was not justified by measurement; a round reporting only the 96% would leave that " +
       "unsaid.");
    ok("!! ...and it still says this is NOT a case for deleting the reactive mask",
       /not a case for deleting the mask/i.test(pre) && /not a case for deleting it/.test(raw),
       "FSR2 ships it for shader-animated and transparent content this page does not contain and dilation " +
       "cannot help with. A measurement on one scene is not a verdict on a feature.");
    ok("  ...and the lock ring's absence from the switch is stated as a measurement, not left unsaid",
       /shadingShift/.test(pre) && /never fills inside scene 3.53/.test(pre) && /shadingShift/.test(raw),
       "it feeds the shading mask, which is OFF in every arm these figures were taken on and whose ring " +
       "never fills inside this window anyway -- so a third option would be a control that cannot move " +
       "its own number");
    ok("  ...and the decomposition is labelled EXPLORATORY rather than dressed as a second pre-registration",
       /Exploratory, and labelled so/i.test(pre) && /post-hoc/i.test(pre),
       "it decomposes an effect already confirmed under pre-registration; the contrast between the two " +
       "dilated arms did no searching but was not declared in advance either, and says so");
}

console.log("\n11. *** WHAT THE PASS IS WORTH (v4665), AND WHAT IT COSTS THE FEATURE BESIDE IT ***");
{
    const PRE = path.resolve(path.dirname(PAGE), "render", "dilate-preregistration.md");
    const pre = fs.existsSync(PRE) ? fs.readFileSync(PRE, "utf8") : "";
    ok("the dilation pre-registration exists and its OUTCOME is filled in",
       pre.length > 0 && /## OUTCOME/.test(pre) && !/NOT YET COLLECTED/.test(pre),
       PRE.replace(/.*WebGLEngine./, ""));
    // *** THE CONJUNCTION IS THE PART THAT HAD TO BE DECLARED. *** v4658's t-test cleared at 21 frames
    // and its sign test did not, and the round could have quoted whichever it preferred. Requiring BOTH
    // in advance removes that choice before the data exists, and a later edit dropping one would restore it.
    ok("!! *** ...and it still requires BOTH tests to clear, which is what stops a round choosing its verdict ***",
       /BOTH must clear/.test(pre) && /sign test/i.test(pre) && /t-test/i.test(pre),
       "v4658 learned this the hard way: two tests, two verdicts, and nothing in the method said which one " +
       "counted. Declared as a conjunction before the data existed.");
    // the three features' figures, parsed from the record and re-checked against the page's prose
    const FIGS = ["1.7992", "0.117", "0.400", "0.0820"];
    const missPre = FIGS.filter((f) => !pre.includes(f)), missPage = FIGS.filter((f) => !raw.includes(f));
    ok("!! *** the four figures appear in BOTH the record and the page ***",
       missPre.length === 0 && missPage.length === 0,
       `dilation +1.7992 dB against the shading mask's +0.117 and the reactive mask's +0.400, and that ` +
       `mask's +0.0820 once dilation is on. Missing from the record: ${missPre.join(" ") || "none"}; from ` +
       `the page: ${missPage.join(" ") || "none"}.`);
    ok("!! ...and both still say the pass COSTS eight frames, the worst by more than the reactive mask's worst",
       /eight frames are worse/i.test(pre) && /2\.43/.test(pre) && /eight frames are worse/i.test(raw) && /2\.43/.test(raw),
       "a mean of +1.80 dB with a 2.43 dB single-frame loss inside it is not the same claim as +1.80 dB, " +
       "and the larger number is the one a reader remembers");
    ok("!! ...and both still say the reactive mask is NOT therefore pointless",
       /NOT therefore pointless|not say the reactive mask should be removed/i.test(pre)
       && /NOT therefore pointless/.test(raw),
       "its benefit falls from +0.400 to +0.082 on THIS content because dilation rewrites the same one " +
       "percent of the picture first. FSR2 ships it for shader-animated and transparent content this page " +
       "does not have and dilation cannot help with. A null on one scene is not a verdict on a feature.");
    ok("  ...and the record says the default MOVED at v4667, with the figures re-measured rather than swapped",
       // the SECTION and its figures, not the string "v4667": that also appears in the bullet above the
       // section, so deleting the section scored zero until this named what the section has to contain.
       /# v4667 -- ENABLED, AND WHAT MOVED/.test(pre)
       && /106\s+->\s+108/.test(pre) && /404 \(1\.03%\)\s+->\s+363/.test(pre)
       && /<select id="dilate">\s*<option value="on"/.test(raw),
       "v4665 said moving the default was a separate round with its own re-measurement. v4667 is that " +
       "round, and the record says so where it used to say the opposite -- a record that quietly stops " +
       "being true is worse than one that is openly superseded.");
}

console.log("\n10. *** FSR2'S EARLIEST PASS (v4664): DILATED DEPTH AND MOTION ***");
// The pass this tree never had. What matters on the SOURCE is not that it is imported but that the whole
// chain reads the dilated field and that the RECORD moves with it: dilated motion carries the foreground's
// zPrev at every silhouette, so an undilated prevDepth would read a disocclusion at every edge on every
// frame -- the exact artefact the pass removes, reintroduced by wiring half of it.
{
    ok("the page imports the runner and owns none of the pass",
        /import \{ DilateGPU \} from "\.\/render\/dilateGPU\.mjs"/.test(src)
        && !/nearest depth|bestD/.test(src),
        "the neighbourhood search is render/dilate.mjs's; the page passes depth and motion in and reads a " +
        "field out, exactly as it does for the reject chain");
    // EVERY consumer, as a census: a list of three is a list somebody adds a fourth to.
    // *** v4666 WIDENED THIS FROM "motionUsed" TO "a dilation-derived field". *** The reactive mask now
    // reads `rxMotion`, which is motionUsed or the raw field according to the dilscope control -- that IS
    // the v4666 experiment, and a row demanding motionUsed everywhere would have made the experiment
    // impossible to wire rather than catching anything. What still must hold is that NO consumer reads the
    // raw `motion` silently: each reads a named field whose derivation is on the page, and rxMotion's is
    // one line above the call.
    const consumers = [...src.matchAll(/^\s*(?:const dis = disocclusionCPU|lgpu\.pushRing|const rx = await xgpu\.reactive)[\s\S]{0,160}?motion(?::\s*(\w+))?[,\s}]/gm)];
    // NOT named `raw`: that is this file's whole-page source, and a local of the same name inside this
    // block shadowed it -- the two rows below then tested a filtered array for HTML and failed while the
    // page was right. Caught by the gate's own run, which is the cheapest place.
    const DERIVED = new Set(["motionUsed", "rxMotion"]);
    const stillRaw = consumers.filter((m) => !DERIVED.has(m[1]));
    ok("!! *** every chain consumer reads the DILATED field, and not one of them reads the raw one ***",
        consumers.length >= 3 && stillRaw.length === 0,
        `${consumers.length} consumers matched, ${stillRaw.length} reading the raw field directly. The ` +
        "object-gap diagnostic deliberately stays on the raw one -- it measures the object-motion feature " +
        "and would otherwise be measuring this pass instead. rxMotion counts as derived because it IS the " +
        "dilscope control: `dilScope === \"clip\" ? motion : motionUsed`, one line above its call.");
    ok("!! *** ...and the RECORD kept for next frame is the dilated depth, or the clip test disagrees with itself ***",
        /if \(dolly\) prevDepth = depthRecord;/.test(src)
        && /const depthRecord = dilated \? dilated\.depth : depth;/.test(src),
        "motionUsed carries the FOREGROUND's zPrev at every silhouette. Compared against an undilated " +
        "record that reads as a disocclusion at every edge, every frame -- the artefact the pass exists to " +
        "remove, reintroduced by wiring one side of it. Off, depthRecord IS depth.");
    ok("!! ...and the pass now defaults to ON, with the OFF arm kept as the control it was measured against",
        // ANCHORED TO THE FIRST OPTION. The lazy [\s\S]{0,120}? this replaced found the other option too,
        // so reordering them -- which is exactly how a default flips -- scored zero. v4667 DID flip it,
        // and this row flipped with it rather than being deleted: the direction of the default is a claim
        // the page makes, and a row that stops holding it when it changes was only ever holding a habit.
        // *** BOTH OPTIONS CHECKED INSIDE THE dilate SELECT, NOT ANYWHERE ON THE PAGE. *** The first draft
        // tested a bare /<option value="off"/ to hold that the control arm survives, and DELETING THE ARM
        // SCORED ZERO: `value="off"` is also in the shading, reactive and dilscope selects. That is the
        // fourth time this session a bare substring has been satisfied by a different part of the file --
        // after /counted: true/ twice and the wrapped-prose matches. Scope the search, always.
        (() => { const m = /<select id="dilate">([\s\S]*?)<\/select>/.exec(raw); if (!m) return false;
                 const opts = [...m[1].matchAll(/<option value="(\w+)"/g)].map((o) => o[1]);
                 return opts[0] === "on" && opts.includes("off"); })() &&
        /const dilateOn = \$\("dilate"\)\.value === "on"/.test(src),
        "v4664 shipped it OFF so a round adding the feature could not be confused with a round that broke " +
        "the page's figures -- v4649's `sx` discipline. v4665 measured +1.80 dB and v4667 flipped it, " +
        "re-measuring every one of those figures rather than swapping them: 106 genuine became 108, the " +
        "212/106 alternation became 216/108, the mask's 404 fired pixels became 363. The OFF arm remains, " +
        "because the control an effect was measured against is not scaffolding to remove afterwards.");
    ok("  ...and it is counted, because on flat geometry a dilation that did nothing looks identical",
        // *** ANCHORED TO THE dilate() CALL, AND THIS FILE ALREADY LEARNED THIS ONCE. *** v4659 wrote the
        // identical row for the reactive mask, found that a bare /counted: true/ was satisfied by
        // rejectAndAccumulate's own `counted: true` further down the page, and fixed it with a comment
        // saying so. Four rounds later the same row was written the same way for this pass and scored the
        // same zero. A lesson recorded in a file is not a lesson the next row inherits.
        /dgpu\.dilate\(\{[\s\S]{0,240}?counted: true/.test(src)
        && /dilStat = dilated\.stats/.test(src) && /id="dilstat"/.test(raw),
        "a dilation that fired everywhere and one that fired nowhere produce the same depth and motion " +
        "buffers on flat geometry; the choice exists only at the moment it is made");
}

console.log("\n9. *** THE REFUTED HYPOTHESIS (v4662), AND THE CELL THAT DOES NOT EXIST ***");
// v4661's control made one experiment possible and v4662 ran it: the same scene window on an accumulator
// that is EMPTY when it starts. H2 said the harm follows the history's AGE; the youngest history turned out
// to be harmed LEAST, 0 of 45. What a gate holds is not that the run happened -- git log holds the ordering
// -- but that the record still says what it measured, that its arithmetic is its own, and that it still
// says what it could NOT settle. A refutation quietly losing its caveats reads as a result.
{
    const HARM = path.resolve(path.dirname(PAGE), "render", "reactive-harm-preregistration.md");
    const harm = fs.existsSync(HARM) ? fs.readFileSync(HARM, "utf8") : "";
    ok("the harm pre-registration exists and its OUTCOME is filled in",
       harm.length > 0 && /## OUTCOME/.test(harm) && !/NOT YET COLLECTED/.test(harm),
       HARM.replace(/.*WebGLEngine./, ""));
    ok("...and it declares a direction, a statistic and a threshold, as the first one did",
       /\*\*H2:/.test(harm) && /one-sided/i.test(harm) && /Fisher/i.test(harm) && /p < 0\.05/.test(harm),
       "the procedure is the point: a lead found by searching is confirmed by a test that did no searching");
    // *** THE THREE CELLS' COUNTS ARE PARSED AND THEIR PERCENTAGES RE-DIVIDED. *** Three numbers where two
    // would do, and the third is the one a later edit gets wrong -- fsrPage section 7's lesson, and the row
    // there was first written as arithmetic on literals typed into this file, which could not fail.
    const cells = [...harm.matchAll(/\| (\d+) \| \*\*(\d+) \((\d+\.\d+)%\)\*\* \|/g)]
        .map((m) => ({ n: +m[1], harmed: +m[2], pct: +m[3] }));
    ok("!! *** each cell's stated percentage IS its harmed count over its n ***",
       cells.length === 3 && cells.every((c) => Math.abs(100 * c.harmed / c.n - c.pct) < 0.05),
       cells.length !== 3 ? `found ${cells.length} cells, expected 3`
           : cells.map((c) => `${c.harmed}/${c.n} = ${(100 * c.harmed / c.n).toFixed(1)}% vs stated ${c.pct}%`).join("; ") +
             ". Parsed out of the record, not written into this gate.");
    ok("!! ...and the youngest-history cell is the one harmed LEAST, which is the refutation itself",
       cells.length === 3 && cells[2].harmed === 0 && cells[2].harmed < cells[1].harmed && cells[1].harmed < cells[0].harmed,
       cells.length === 3 ? `${cells[0].harmed} / ${cells[1].harmed} / ${cells[2].harmed} harmed across the three cells`
                          : "cells unparsed" ,
       );
    ok("!! ...and both the record and the page still say the harm is UNEXPLAINED, not solved",
       /REFUTED/.test(harm) && /What is left is the scene window itself/.test(harm)
       && /THREE explanations for the harm are now spent/.test(raw),
       "three explanations are spent -- jitter refuted, the wide/narrow split confirmed and beside the " +
       "point, the history's age refuted -- and naming the scene window is an association, not a mechanism. " +
       "A round that printed 'refuted' and moved on would read as having closed the question.");
    // *** SCOPED TO THE OUTCOME SECTION, BECAUSE THE UNSCOPED ROW WAS A 0-RED. *** This caveat is written
    // TWICE on purpose -- declared before the run, restated after it -- and a row testing the whole file
    // passes while either copy survives. Deleting the one that matters, the restatement beside the result,
    // scored ZERO. It is the restatement that a reader of the outcome actually meets.
    // Both copies, not either: git holds the ordering of the declaration, not its later integrity, and
    // deleting the up-front one was a 0-RED too until this said `declared && restated`.
    const cut = harm.indexOf("## OUTCOME");
    const declared = harm.slice(0, cut), outcome = harm.slice(cut);
    const caveat = (t) => /fourth cell/i.test(t) && /no way to age the accumulator without advancing the scene/.test(t);
    ok("!! ...and it still says the fourth cell does not exist, BESIDE THE RESULT and not only before it",
       caveat(declared) && caveat(outcome),
       "scene 3-53 on an OLD history would complete the 2x2 and cannot be built, so the design separates " +
       "the two factors in ONE direction. Saying so is not a hedge, and saying it only in the section " +
       "nobody re-reads is most of the way to not saying it.");
}

console.log("\n8. *** TWO CLOCKS (v4661): THE SCENE'S TIME AND THE HISTORY'S AGE ***");
// *** ONE VARIABLE WAS DOING TWO JOBS AND reset() ZEROED BOTH. *** `frame` counted the accumulations and
// also fixed the scene, so an EMPTY history could only ever be seen at the scene's start, and scene time 54
// could only ever be reached carrying 54 frames of history. v4658's open question is precisely which of the
// two the reactive mask's harm follows -- 14 of 51 frames lost over 3-53, 3 of 45 over 54-98 -- and no
// experiment this page could run would have separated them.
{
    // *** THE CENSUS, not a list: every site that fixes the SCENE must read a clock function, and none may
    // read bare `frame`. A list of three sites is a list somebody adds a fourth to. ***
    const sceneSites = [...src.matchAll(/^\s*const (sxCur|sxPrev|dx|vpCur|vpPrev|tCur) =.*$/gm)].map((m) => m[0]);
    const bareFrame = sceneSites.filter((l) => /\bframe\b/.test(l));
    ok("!! *** every scene site reads the SCENE clock, and not one of them reads `frame` ***",
        sceneSites.length === 6 && bareFrame.length === 0,
        `${sceneSites.length} scene sites found, ${bareFrame.length} still reading \`frame\`` +
        (bareFrame.length ? ": " + bareFrame.map((l) => l.trim().slice(0, 60)).join(" | ") : "") +
        ". `frame` keeps its old meaning -- the history's age -- and nothing that positions the camera, the " +
        "slab or the pan is allowed to ask it.");
    // *** AND THE TWO CLOCKS COINCIDE AT startFrame 0, WHICH IS THE WHOLE REASON THE OLD NUMBERS SURVIVE. ***
    ok("!! ...and at startFrame 0 the two clocks are the SAME expression, so every figure above is untouched",
        /const sceneT = \(\) => frame \+ startFrame;/.test(src)
        && /const sceneTPrev = \(\) => Math\.max\(startFrame, frame \+ startFrame - 1\);/.test(src),
        "frame + 0 is frame, and Math.max(0, frame + 0 - 1) is Math.max(0, frame - 1) -- the two expressions " +
        "these replaced. v4649's `sx` discipline: a round that moved this page's quoted figures while adding " +
        "a control could not be told from a round that broke them.");
    // *** THE CONFOUND THE CONTROL WOULD OTHERWISE HAVE BEEN. ***
    ok("!! ...and the JITTER PHASE is set from the scene clock, or the control measures the phase too",
        /jit\.index = startFrame % jit\.phaseCount/.test(src),
        "the sequence is cyclic with period jitterPhaseCount(ratio) -- 32 at ratio 2 -- so a run starting the " +
        "scene at 54 with a fresh jitter state renders it through phase 0 where the original used 54 % 32 = " +
        "22. A different sub-pixel offset is a different rendered frame, and every comparison between the two " +
        "runs would carry it.");
    ok("  ...and reset()'s own still panes follow the scene clock, so they are not a different scene",
        /const t0 = startFrame/.test(src) && /truthPersp\(dollyVP\(t0\), kind, sx0\)/.test(src)
        && /renderPersp\(R, dollyVP\(t0\), kind, sx0\)/.test(src),
        "reset() draws the reference and the one unjittered frame. Left at dollyVP(0) they would show time " +
        "zero while the temporal pane ran at 54, and dBil/dFsr would be scored against a truth the temporal " +
        "pane never sees.");
    ok("  ...and the control is a SELECT on the page, so the experiment is re-runnable rather than a build that once existed",
        /<input id="startframe" type="number"/.test(raw) && /\["scene", "camera", "ratio", "startframe"\]/.test(src),
        "and it is in the reset list, because a scene clock changed without rebuilding the history is two " +
        "scenes in one accumulator");
}

console.log("\n7. *** THE PRE-REGISTERED TEST (v4660): TWO DOCUMENTS, ONE SET OF NUMBERS ***");
// *** v4659's LEAD WAS THE BEST OF EIGHT PREDICTORS AND WORTH NOTHING ON ITS OWN. *** v4660 fixed the
// hypothesis, its DIRECTION, the statistic, the threshold and the frame range in a file committed BEFORE the
// data existed, then collected it. What a gate can hold is not that the ordering happened -- git log holds
// that -- but that the two places quoting the result still quote the SAME result. fsr.html's prose and the
// pre-registration are written by hand, months apart from each other in edit time, and a figure corrected in
// one and not the other is how a measured claim quietly becomes a remembered one.
{
    const PRE = path.resolve(path.dirname(PAGE), "render", "reactive-preregistration.md");
    const pre = fs.existsSync(PRE) ? fs.readFileSync(PRE, "utf8") : "";
    ok("the pre-registration exists and its OUTCOME is filled in",
       pre.length > 0 && /## OUTCOME/.test(pre) && !/NOT YET COLLECTED/.test(pre),
       PRE.replace(/.*WebGLEngine./, ""));
    // the four things it had to fix in advance for the test to mean anything
    const declared = [["a predicted DIRECTION", /\*\*H:\*\*/], ["one-sided Welch", /one-sided/i],
                      ["a threshold", /p < 0\.05/], ["a frame range", /54 to 98 inclusive/]];
    ok("...and it declares a direction, a statistic, a threshold and a frame range",
       declared.every(([, re]) => re.test(pre)),
       declared.filter(([, re]) => !re.test(pre)).map(([n]) => n).join(", ") || "all four present");
    // *** THE ROW THAT MATTERS: the numbers must agree across the two documents. ***
    const FIGS = ["0.586", "0.235", "0.351", "0.746", "0.403", "0.343"];
    const missingPre = FIGS.filter((f) => !pre.includes(f));
    const missingPage = FIGS.filter((f) => !raw.includes(f));
    ok("!! *** both samples' six figures appear in BOTH the page and the pre-registration ***",
       missingPre.length === 0 && missingPage.length === 0,
       `discovery 0.586/0.235 (diff 0.351), confirming 0.746/0.403 (diff 0.343). ` +
       `Missing from the record: ${missingPre.join(" ") || "none"}; from the page: ${missingPage.join(" ") || "none"}. ` +
       "Two hand-written documents, one measurement: an edit to either that the other does not get is what " +
       "this row exists to catch.");
    // *** PARSED OUT OF THE RECORD, NOT WRITTEN INTO THIS FILE. *** The first draft of this row read
    // `Math.abs((0.586 - 0.235) - 0.351) < 5e-4` -- arithmetic on three literals typed HERE, which cannot
    // fail unless somebody edits this gate, and says nothing whatever about the document it claims to check.
    // It is the same shape as v4650's Math.round row and v4655's regex-on-a-regex: a row that tests the
    // language. The numbers have to come FROM the record for the check to be about the record.
    //
    // (\d+\.\d+) and not [\d.]+ deliberately: a character class containing the dot swallows a sentence's
    // full stop, which is how v4659's `peak` column became a column of NaN.
    const pairs = [...pre.matchAll(/narrow (\d+\.\d+)\s+wide (\d+\.\d+)\s+difference (\d+\.\d+)/g)]
        .map((m) => [Number(m[1]), Number(m[2]), Number(m[3])]);
    ok("!! ...and each difference the record states IS the subtraction of the two means beside it",
       pairs.length === 2 && pairs.every(([n, w, d]) => Math.abs((n - w) - d) < 1e-3),
       pairs.length !== 2 ? `found ${pairs.length} mean/mean/difference lines, expected 2`
           : pairs.map(([n, w, d]) => `${n} - ${w} = ${(n - w).toFixed(3)} vs stated ${d}`).join("; ") +
             ". A pair of group means and their difference are three numbers where two would do, and the " +
             "third is the one a later edit gets wrong.");
    // *** AND THE THING THE CONFIRMATION DID NOT DO, WHICH A READER WILL OTHERWISE ASSUME IT DID. ***
    ok("!! ...and both documents still say the confirmed effect does NOT explain the harm it was found chasing",
       /does not explain|not an explanation/i.test(pre) && /NOT AN EXPLANATION OF THE FOURTEEN HARMED FRAMES/.test(raw),
       "3 of 45 frames are harmed over 54-98 against 14 of 51 over 3-53, while the wide/narrow difference " +
       "holds its size. The split predicts how much the mask HELPS, not whether it HURTS, and v4658's " +
       "defect is open. A round that printed 'confirmed, p = 0.019' and stopped would read as closing it.");
}

console.log("\nunchecked here: the ADAPTER path, which is tools/ship/fsrPageDevice-selfcheck.mjs's -- every row " +
    "above runs with navigator.gpu absent, so this file is the CPU branch and that is deliberate: the two " +
    "gates were one file until the device rows put it at 4,744 ms, over the quick sweep's 3,000 ms " +
    "membership threshold, which would have dropped the page's only gate out of every ship. Split, both " +
    "are under it and both run every ship; the engine-attribution row above is the CPU half of a claim " +
    "whose device half lives there; the " +
    "PICTURE, which is PSNR against a supersampled truth and is in the page's own note rather than frozen here " +
    "because it moves with the content; and whether the dolly's two planes are a REPRESENTATIVE scene, which " +
    "they are not -- they are the smallest thing that has parallax.");
//
// SABOTAGE LOG -- each applied to the live tree, run, and restored.
//   v4667  the dilate default flipped back to OFF                        2 RED here, 1 in fsrPageDevice.
//   v4667  the OFF control arm DELETED from the dilate select             *** 0 RED AT FIRST ***. The row
//          held it with a bare /<option value="off"/, which the shading, reactive and dilscope selects all
//          satisfy. Scoped to the dilate select's own options now, and it checks their ORDER too.
//   v4667  the record's v4667 re-measurement section deleted              *** 0 RED AT FIRST ***. The row
//          tested for the string "v4667", which also appears in the bullet ABOVE that section. It now
//          names the heading and two of the re-measured figures.
//
// *** THOSE TWO ARE THE SAME DEFECT, AND IT IS THIS SESSION'S MOST FREQUENT ONE. *** A bare substring
// satisfied by a different part of the file: /counted: true/ at v4659 and again at v4664, wrapped prose at
// v4663, v4665 and v4666, and both of these. Four rounds of it. The fix is always the same -- scope the
// search to the construct being held -- and writing it down has not once stopped the next row repeating it.
//   v4666  the reactive mask stops being scoped (always dilated)          1 RED.
//   v4666  a clip-only figure edited so the three arms stop adding up      1 RED -- the figures are parsed
//          out of the record and re-added, never typed into this gate.
//   v4666  the record drops "clears neither test"                          1 RED.
//   v4666  the record turns the null into a case for deleting the mask     1 RED.
//   v4666  the lock ring's absence from the switch left unexplained        1 RED.
//   v4666  the decomposition relabelled as a pre-registration              1 RED.
//
// *** AND ONE OF THOSE ROWS WAS RED ON ARRIVAL, FOR THE THIRD TIME THIS SESSION IN THE SAME WAY. *** It
// tested "close to a coin flip" as a literal against a WRAPPED markdown record, where the phrase straddles
// a line break. The same shape cost v4665 a sabotage that silently did nothing (logged there as a no-op
// rather than a 0-RED) and v4663 another. Phrases matched against these records now use \s+ between words.
//   v4665  the dilation record's OUTCOME reverted to uncollected           1 RED.
//   v4665  the BOTH-must-clear conjunction relaxed to either                1 RED -- on the SECOND attempt.
//          The first wrote out the whole sentence, which the record wraps across a line, so the replace
//          never matched: a NO-OP, not a 0-RED, and recorded as one.
//   v4665  the page drops "eight frames are worse"                          1 RED.
//   v4665  the record drops "does not say the reactive mask should be removed"   1 RED.
//   v4665  the dilate default flipped to ON                                 2 RED (this section and v4664's).
//   v4664  one chain consumer left on the raw motion field                1 RED.
//   v4664  dilated motion fed while the undilated depth is still recorded  1 RED -- half the pass wired,
//          which reintroduces a disocclusion at every silhouette on every frame.
//   v4664  the dilate control reordered to default ON                      *** 0 RED AT FIRST ***. The row
//          used a lazy [\s\S]{0,120}? and found `value="off"` in the SECOND option, so a reorder -- which
//          is exactly how a default flips -- satisfied it. Anchored to the first option now.
//   v4664  the dilate call stops counting                                  *** 0 RED AT FIRST ***, AND
//          THIS FILE HAD ALREADY LEARNED IT. v4659 wrote the identical row for the reactive mask, found a
//          bare /counted: true/ satisfied by rejectAndAccumulate's own further down the page, and fixed it
//          with a comment saying so. Four rounds later the same row was written the same way and scored
//          the same zero. A lesson recorded in a file is not a lesson the next row inherits.
//
// And a local named `raw` inside the v4664 block SHADOWED this file's whole-page source of the same name,
// so two rows tested a filtered array for HTML and failed while the page was right.
//   v4662  the harm record's OUTCOME reverted to uncollected                1 RED.
//   v4662  a cell's percentage edited without its count                      1 RED -- the percentages are
//          parsed out of the record and re-divided, never typed into this file.
//   v4662  the record loses the statistic it declared                        1 RED.
//   v4662  the refutation turned into a confirmation (cell C harmed most)    1 RED.
//   v4662  the record drops "what is left is the scene window"               1 RED.
//   v4662  the page drops "three explanations are now spent"                 1 RED.
//   v4662  the fourth-cell caveat deleted                                    *** 0 RED AT FIRST ***. The
//          caveat is written TWICE by design -- declared before the run, restated beside the result -- and
//          the row tested the whole file, so it passed while either copy survived. Deleting the
//          restatement, the copy a reader of the outcome actually meets, scored ZERO. The row now requires
//          BOTH, and each deletion reds it on its own: git holds the ORDERING of a declaration, not its
//          later integrity.
//   v4660  the record's OUTCOME reverted to uncollected                     1 RED.
//   v4660  the record drops its declared frame range                         1 RED.
//   v4660  one confirming mean edited in the record and not the page         2 RED -- which is the whole
//          point of section 7: two hand-written documents, one measurement.
//   v4660  the record restates a difference that is not its means subtracted 2 RED -- AFTER A REPAIR. The
//          first draft of that row read Math.abs((0.586 - 0.235) - 0.351) < 5e-4: arithmetic on three
//          literals typed into THIS file, which cannot fail unless somebody edits this gate and says
//          nothing about the document it claims to check. Same shape as v4650's Math.round row and
//          v4655's regex-on-a-regex. The numbers are now parsed out of the record.
//   v4660  the page drops "this does not explain the harm"                   1 RED.
//   v4660  the record drops its does-not-explain section                     1 RED.
//   v4659  fsr.html: the reactive mask asked for without counted: true        1 RED -- AFTER A REPAIR.
//          The first draft of that row tested /counted: true/ against the whole page and scored ZERO,
//          because rejectAndAccumulate's own `counted: true` two dozen lines below satisfied it. The row
//          named the reactive call and matched a different one. Anchored to xgpu.reactive({...}) it reds.
//   v4659  fsr.html: the readout hard-codes its two zero declines              1 RED (and 0 RED in the LIVE
//          gate, which cannot see it: on that camera the true values ARE zero).
//
// *** THE HEADER HAS SAID "see the log at the foot of this file" SINCE v4638 AND THERE WAS NO LOG. *** A
// pointer to a record that does not exist reads exactly like a record until somebody follows it, which is
// this file's own section 1 complaint about the page turned on the gate. v4638's entries are NOT
// reconstructed here: I did not run them, and writing down sabotages I did not perform to fill in a table
// would be worse than the empty table was. What is below is this round's, and it is what I ran.
//
//   v4641  fsr.html: the CPU branch's disStats labelled `engine: "the device"`, so the page claims a device
//          counted numbers the CPU counted.                            1 RED, the attribution row, by name.
//   v4641  and the DEVICE half of that same claim is sabotaged in tools/ship/fsrPageDevice-selfcheck.mjs --
//          `if (rgpu)` forced false, the silent fallback -- where it goes 2 RED. Neither half is worth
//          anything alone: this file cannot tell a page that always says "CPU" from a correct one, and that
//          file cannot tell a page that always says "device" from a correct one.
//
// process.exit() would truncate everything above through a pipe -- see tools/ship/pipeTruncation-selfcheck.mjs,
// which measured 137 gates losing their tail that way. exitCode lets the buffered writes drain.
process.exitCode = fails ? 1 : 0;
