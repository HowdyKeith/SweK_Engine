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
        /const sxCur = objects \? frame \* SLAB_DX : 0/.test(src)
        && /const sxPrev = objects \? Math\.max\(0, frame - 1\) \* SLAB_DX : 0/.test(src),
        "zero on every other camera, so a default that was quietly dropped would still be a no-op there");
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
    ok("  ...and it defaults to ON, so the page shows the wired path unless somebody asks otherwise",
        /<option value="on">shading mask: ON<\/option>\s*<option value="off"/.test(raw),
        "the first option is the selected one, and a control arm that ran by default would make every other " +
        "number on this page the control's");
    ok("  ...and the ring is torn down on reset, so it cannot be read at a stride it was not built for",
        /lgpu\.destroyRing\(lockRing\)/.test(src) && /lockRing = null/.test(src),
        "a ring carried across a resolution or camera change would be read with the wrong stride and would " +
        "look like content rather than like a mistake");
}

console.log(fails ? `\nfsrPage-selfcheck: ${fails} FAILED` : "\nfsrPage-selfcheck: all checks pass");
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
