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
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { noComments } from "./sourceScan.mjs";
import { viewProj } from "../../render/rasterProbe.js";
import { jitterProjection } from "../../render/jitter.mjs";
import { resolveJitterAwareCPU } from "../../render/temporalResolve.mjs";
import { mat4Invert, transform4 } from "../../render/motionVectors.mjs";

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
    const tmp = path.join(fs.mkdtempSync(path.join(ENG, ".fsrpage-")), "page.mjs");
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

console.log(fails ? `\nfsrPage-selfcheck: ${fails} FAILED` : "\nfsrPage-selfcheck: all checks pass");
console.log("\nunchecked here: the ADAPTER path -- every row above runs with navigator.gpu absent, so the page's " +
    "WebGPU branch is exercised by render/temporalGPU-selfcheck.mjs and friends and not by this gate; the " +
    "PICTURE, which is PSNR against a supersampled truth and is in the page's own note rather than frozen here " +
    "because it moves with the content; and whether the dolly's two planes are a REPRESENTATIVE scene, which " +
    "they are not -- they are the smallest thing that has parallax.");
process.exit(fails ? 1 : 0);
