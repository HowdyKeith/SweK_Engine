#!/usr/bin/env node
// tools/ship/glCapture-selfcheck.mjs -- v4227
//
// Run: node tools/ship/glCapture-selfcheck.mjs      (pure checks always; the live browser section skips loudly)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES render/glCapture.mjs -- from evanw/webgl-recorder (CC0, granted in that repo's README; there is no
// LICENSE file, which is worth stating precisely because #61 and #100 are open on repos with NO grant at all.
// A licence in a README is thin paperwork; a licence nowhere is a different thing, and conflating them would
// let a real problem hide behind a small one.)
//
// *** THE BACKLOG ITEM'S PREMISE WAS WRONG AND THIS GATE SAYS SO FIRST. *** It was filed as "the tree can draw
// a frame but cannot REPLAY one". The tree has had render/glBootstrap.js makeRecordingGL and
// render/frameTrace.js since v3058-v3060 and they are good. Section 1 measures what they actually are, and the
// two real gaps are what the module addresses.
import {
    RETAIN, DEFAULT_MAX_BYTES, captureContext, installCapture, followFrames,
    compileTrace, replayTrace, census, redundantStateSets, toRecordingLog, STATE_OPS,
} from "../../render/glCapture.mjs";
import { makeRecordingGL } from "../../render/glBootstrap.js";
import { normalize, fingerprint, diffTraces, describeDiff } from "../../render/frameTrace.js";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { codeOnly } from "./sourceScan.mjs";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("glCapture-selfcheck -- recording a context the PAGE made, and compiling it back into code\n");

// A frame written the way a page writes one, so every section drives the same work.
function pageFrame(gl) {
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, "void main(){}");
    gl.compileShader(vs);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.linkProgram(prog);
    gl.useProgram(prog);
    gl.useProgram(prog);                                       // a redundant set, on purpose
    gl.uniform1f(gl.getUniformLocation(prog, "uTime"), 0.5);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1]), gl.STATIC_DRAW);
    gl.viewport(0, 0, 64, 64);
    gl.viewport(0, 0, 64, 64);                                 // and another
    gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// ---- 1. WHAT THE TREE ALREADY HAD, MEASURED BEFORE CLAIMING A GAP ------------------------------------------
console.log("1. *** THE ITEM SAID 'CANNOT REPLAY A FRAME'. HALF OF THAT WAS WRONG, AND HERE IS THE HALF. ***");
{
    ok("!! makeRecordingGL and frameTrace ALREADY EXIST -- this round does not pretend otherwise",
        typeof makeRecordingGL === "function" && typeof normalize === "function" && typeof diffTraces === "function",
        "v3058-v3060: record, normalise, fingerprint, diff -- all present and all used");

    // GAP ONE, counted rather than asserted: every gate that records builds its own context.
    // *** EXCLUDING ITSELF, AND THAT IS THE THIRD TIME THIS SESSION A GATE COUNTED ITS OWN FILE. *** v4225's
    // meshLine count and v4224's basis owner were the first two. A census that includes the censor reports a
    // number that changes because the census exists, which is not a measurement of anything.
    const SELF = path.basename(fileURLToPath(import.meta.url));
    const gates = fs.readdirSync(path.join(ROOT, "tools", "ship")).filter((f) => f.endsWith(".mjs") && f !== SELF);
    const recorders = [], selfBuilt = [];
    for (const g of gates) {
        const src = fs.readFileSync(path.join(ROOT, "tools", "ship", g), "utf8");
        if (!/makeRecordingGL|traceFrame/.test(src)) continue;
        recorders.push(g);
        // "self-built" = the gate itself constructs the context, rather than observing one a page made
        if (/makeRecordingGL\s*\(|traceFrame\s*\(/.test(codeOnly(src))) selfBuilt.push(g);
    }
    ok("!! *** EVERY GATE THAT RECORDS BUILDS ITS OWN CONTEXT -- NOT ONE OBSERVES A PAGE ***",
        recorders.length > 0 && selfBuilt.length === recorders.length,
        `${selfBuilt.length} of ${recorders.length}: ${recorders.join(", ")}`);

    // GAP TWO: the existing log physically cannot be replayed, and that is a design choice, not an oversight.
    const rec = makeRecordingGL({ width: 8, height: 8 });
    rec.gl.bufferData(1, new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]), 2);
    const arg = rec.log[0].args[1];
    ok("!! ...and makeRecordingGL's log keeps a CHECKSUM, not the bytes -- so it cannot be replayed at all",
        !!arg && arg.typed === "Float32Array" && arg.length === 8 && typeof arg.checksum === "number" && arg.head.length === 4,
        `{typed:${arg.typed}, length:${arg.length}, head:[${arg.head}], checksum:${arg.checksum}} -- deliberate, and right for an assertion`);
    ok("...and frameTrace has no compile-to-runnable, because comparison was the job",
        !/export function (compile|replay)/.test(fs.readFileSync(path.join(ROOT, "render", "frameTrace.js"), "utf8")),
        "normalize, traceFrame, fingerprint, diffTraces, describeDiff -- and nothing that runs");
}

// ---- 2. THE ROUND TRIP, AGAINST THE TREE'S OWN COMPARATOR --------------------------------------------------
console.log("\n2. *** A CAPTURE COMPILES BACK INTO CODE THAT ISSUES THE SAME CALLS ***");
let capture = null, compiled = "";
{
    const rec1 = makeRecordingGL({ width: 64, height: 64 });
    capture = captureContext(rec1.gl);
    pageFrame(capture.gl);
    ok("a real-shaped frame records through the wrapper", capture.calls() === rec1.log.length && capture.calls() > 10,
        `${capture.calls()} calls, ${capture.bytes} retained bytes`);
    ok("!! the bytes are KEPT, not summarised -- which is the whole difference from makeRecordingGL",
        capture.replayable === true && capture.log.some((c) => c.args.some((a) => a instanceof Float32Array)),
        "retain:full");

    compiled = compileTrace(capture);
    const rec2 = makeRecordingGL({ width: 64, height: 64 });
    replayTrace(compiled, rec2.gl);

    const a = normalize(rec1.log), b = normalize(rec2.log);
    const d = diffTraces(a, b);
    // *** JUDGED BY frameTrace's OWN normalize AND fingerprint, NOT BY A SECOND OPINION INVENTED HERE. ***
    // A private comparator would have been easy to write and impossible to trust: it would agree with whatever
    // the capture happened to produce. #78 is the item about three copies of one idea; this is not a fourth.
    ok("!! *** THE REPLAY'S TRACE IS BYTE-IDENTICAL TO THE ORIGINAL'S, BY frameTrace's OWN FINGERPRINT ***",
        d.same && fingerprint(a) === fingerprint(b),
        `${a.length} commands, fingerprint ${fingerprint(a)}` + (d.same ? "" : "\n        " + describeDiff(d)));
    ok("...and the compiled source is code, not a description",
        /^function\*\(gl\)\{/.test(compiled) && /gl\.drawArrays\(/.test(compiled), `${compiled.length} bytes`);
    ok("!! object handles survive as numbered slots, so a program made in the trace is the one used by it",
        /slot\("Object", 0, gl\.createShader\(/.test(compiled) && /gl\.useProgram\(S\["Object"\]\[1\]\)/.test(compiled),
        "createShader/createProgram results are captured and referred back to");
    ok("a typed array is re-emitted as its own bytes", /new Float32Array\(\[0,0,1,0,0,1\]\)/.test(compiled));
    // *** THIS CHECK WENT RED AND THE MODULE WAS WRONG, NOT THE CHECK. *** toRecordingLog handed normalize a
    // fresh {slot:...} literal per call, and normalize symbolises by object IDENTITY -- so ONE program read
    // as program#1 the first time it was used and program#2 the second, and a diff of two such traces would
    // have been noise in the shape of evidence. One interned object per slot, named by the call that made it.
    ok("!! the capture normalises to makeRecordingGL's OWN trace, identically -- one object per slot",
        fingerprint(normalize(toRecordingLog(capture))) === fingerprint(a),
        `both ${fingerprint(a)}`);
    const twice = normalize(toRecordingLog(capture)).filter((l) => l.startsWith("useProgram"));
    ok("...and the same program used twice is the SAME symbol both times, which is what makes a diff mean anything",
        twice.length === 2 && twice[0] === twice[1], twice.join(" / "));
}

// ---- 3. DEFECT 1: getContext IDENTITY ----------------------------------------------------------------------
console.log("\n3. *** THE ORIGINAL RETURNS A NEW WRAPPER EVERY getContext, AND THE SPEC SAYS IT MUST NOT ***");
{
    class FakeCanvas {
        constructor() { this._c = {}; this.width = 64; this.height = 64; }
        getContext(type) { return this._c[type] || (this._c[type] = { __t: type, clear: () => {}, drawArrays: () => {} }); }
    }
    const original = FakeCanvas.prototype.getContext;
    const inst = installCapture({ target: { HTMLCanvasElement: FakeCanvas } });
    const cv = new FakeCanvas();
    const a = cv.getContext("webgl2"), b = cv.getContext("webgl2");
    ok("!! *** TWO getContext CALLS ON ONE CANVAS RETURN THE SAME OBJECT *** ", a === b,
        "the original builds a fresh wrapper each time, so a helper that re-fetches -- and this tree's acquireGL IS one -- splits its trace in two and fails every gl === this.gl check it makes");
    ok("...and only ONE capture is created for it", inst.captures.length === 1, `${inst.captures.length} capture(s)`);
    new FakeCanvas().getContext("webgl2");
    ok("...while a different canvas gets its own", inst.captures.length === 2);
    ok("a 2d context passes through unwrapped -- this patches WebGL, not canvas", cv.getContext("2d") === cv._c["2d"]);
    a.clear(1); a.drawArrays(1, 0, 3);
    ok("calls made through the patched getContext are recorded", inst.captures[0].calls() === 2);
    inst.uninstall();
    ok("!! uninstall restores the real getContext -- an observer that cannot be removed is a permanent change",
        FakeCanvas.prototype.getContext === original);
}

// ---- 4. DEFECT 2: A null RETURN CRASHES THE ORIGINAL --------------------------------------------------------
console.log("\n4. *** THE ORIGINAL THROWS ON getUniformLocation OF AN UNUSED UNIFORM, WHICH IS AN EVERYDAY CALL ***");
{
    // The original's getVariable, transcribed: `typeof value === 'object'` is TRUE for null, and the next line
    // reads value.constructor.name.
    const getVariable_ORIGINAL = (value, variables) => {
        if (typeof value === "object") {
            const name = value.constructor.name;
            const list = variables[name] || (variables[name] = []);
            let i = list.indexOf(value);
            if (i === -1) { i = list.length; list.push(value); }
            return name + "s[" + i + "]";
        }
        return null;
    };
    let threw = "";
    try { getVariable_ORIGINAL(null, {}); } catch (e) { threw = e.constructor.name; }
    ok("!! the original's own getVariable(null) THROWS -- reproduced here, not asserted from reading",
        threw === "TypeError", threw + ": typeof null === 'object', then .constructor on null");

    const cap = captureContext({ getUniformLocation: () => null, uniform1f: () => {} });
    let mine = "";
    try { cap.gl.uniform1f(cap.gl.getUniformLocation({}, "uUnused"), 1); } catch (e) { mine = e.message; }
    ok("!! ...and this one records the same call without throwing", mine === "" && cap.calls() === 2, mine || "2 calls");
    ok("...with no slot invented for a null return", cap.log[0].ret === undefined);
}

// ---- 5. DEFECT 3: THE BYTE BUDGET, AND REFUSING RATHER THAN DIVERGING --------------------------------------
console.log("\n5. *** A TRACE THAT CANNOT ROUND-TRIP MUST SAY SO, NOT RUN AND QUIETLY DIVERGE ***");
{
    ok("there is a default budget at all", DEFAULT_MAX_BYTES === 8 * 1024 * 1024, `${DEFAULT_MAX_BYTES} bytes`);
    const big = captureContext({ bufferData: () => {} }, { maxBytes: 64 });
    big.gl.bufferData(1, new Float32Array(1000), 2);
    ok("!! past the budget the capture is marked UNREPLAYABLE", big.replayable === false, big.why);
    let e = ""; try { compileTrace(big); } catch (err) { e = err.message; }
    ok("!! ...and compile REFUSES it rather than emitting a shorter trace that runs", /not replayable/.test(e), e);

    const sum = captureContext({ bufferData: () => {} }, { retain: RETAIN.SUMMARY });
    sum.gl.bufferData(1, new Float32Array([1, 2, 3]), 2);
    ok("a summary capture is unreplayable for the same reason and says which", sum.replayable === false && /checksums, not bytes/.test(sum.why), sum.why);
    let e2 = ""; try { compileTrace(sum); } catch (err) { e2 = err.message; }
    ok("...and is refused too", /not replayable/.test(e2));
    ok("!! ...but it still NORMALISES, so a summary capture is a first-class frameTrace input",
        normalize(toRecordingLog(sum)).length === 1 && /Float32Array\[3\]#/.test(normalize(toRecordingLog(sum))[0]),
        normalize(toRecordingLog(sum))[0]);

    // The aliasing trap: one scratch array reused for every upload.
    const scratch = new Float32Array([1, 1, 1]);
    const c = captureContext({ bufferData: () => {} });
    c.gl.bufferData(0, scratch, 0);
    scratch[0] = 99;
    c.gl.bufferData(0, scratch, 0);
    ok("!! a reused scratch array is COPIED per call -- otherwise every upload in the log reads as the last one",
        c.log[0].args[1][0] === 1 && c.log[1].args[1][0] === 99, "[1,1,1] then [99,1,1]");
}

// ---- 6. DEFECT 4: THE OBSERVER MUST NOT DRIVE THE THING IT OBSERVES ----------------------------------------
console.log("\n6. *** THE ORIGINAL STARTS A PERMANENT rAF LOOP TO NUMBER FRAMES. #60 IS ABOUT NOT HAVING ONE. ***");
{
    const src = fs.readFileSync(path.join(ROOT, "render", "glCapture.mjs"), "utf8");
    const code = codeOnly(src);
    ok("!! *** THIS MODULE NEVER CALLS requestAnimationFrame ITSELF *** ",
        !/(^|[^.\w])requestAnimationFrame\s*\(/.test(code.replace(/g\.requestAnimationFrame\s*=/g, "")),
        "an observer that guarantees a frame every 16ms does not measure a dirty-flag system, it replaces it");

    // A stand-in for rAF that actually RUNS its callback -- my first version only counted the request and
    // never invoked it, so it asserted a thing the module does not do and the gate went red on my fake
    // rather than on the code. A frame ends when the callback RUNS, not when it is asked for: a request the
    // page later cancels never draws anything and must not be counted.
    let scheduled = 0, pending = [];
    const g = { requestAnimationFrame: (cb) => { scheduled++; pending.push(cb); return scheduled; } };
    const h = captureContext({ clear: () => {} });
    const f = followFrames(h, { target: g });
    ok("!! installing the frame follower schedules NOTHING", scheduled === 0, `${scheduled} frames scheduled`);
    g.requestAnimationFrame(() => h.gl.clear(1));
    ok("...and asking is not yet drawing -- no frame is counted until the callback runs",
        scheduled === 1 && h.frames === 0, `page asked ${scheduled}, counted ${h.frames}`);
    pending.shift()(0);
    ok("...and the frame ends when the PAGE'S OWN callback has run", h.frames === 1 && scheduled === 1,
        `page asked ${scheduled} (not ${scheduled + 1}), counted ${h.frames}`);
    f.uninstall();
    ok("...and the follower comes back off", g.requestAnimationFrame.toString().indexOf("pending.push") !== -1);

    const c = captureContext({ clear: () => {}, drawArrays: () => {} });
    c.gl.clear(1); c.endFrame(); c.gl.drawArrays(1, 0, 3); c.endFrame(); c.gl.clear(2);
    const s = compileTrace(c);
    ok("frame boundaries become yields, so a caller drives the replay frame by frame",
        (s.match(/yield;/g) || []).length === 2 && replayTrace(s, { clear: () => {}, drawArrays: () => {} }) === 2);
    ok("...and a replay can be stopped after n frames",
        replayTrace(s, { clear: () => {}, drawArrays: () => {} }, { frames: 1 }) === 1);
}

// ---- 7. WHAT THE CAPTURE IS FOR: A CENSUS, AND WORK WITH NO EFFECT -----------------------------------------
console.log("\n7. the two questions a trace can answer that a grep cannot");
{
    const c = census(capture);
    ok("!! which entry points a page ACTUALLY uses, counted", c.length > 8 && c[0].calls === 2,
        c.slice(0, 4).map((x) => x.op + " x" + x.calls).join(", "));
    ok("...sorted by call count, descending", c.every((x, i) => i === 0 || c[i - 1].calls >= x.calls));

    const r = redundantStateSets(capture);
    // *** THE MEASUREMENT #60 KEEPS TRYING TO MAKE BY ARGUMENT. *** Two calls that set the same state to the
    // same value with nothing in between: work a frame did that changed nothing.
    ok("!! *** REDUNDANT STATE, FOUND IN THE TRACE RATHER THAN ARGUED ABOUT ***", r.length === 2,
        r.map((x) => x.op + "(" + x.args + ") x" + x.count).join("; "));
    ok("...and it is the repeat that is counted, not the first setting", r.every((x) => x.count === 1));
    ok("STATE_OPS is a stated list, so what counts as redundant is readable rather than guessed",
        STATE_OPS.includes("useProgram") && STATE_OPS.includes("viewport") && !STATE_OPS.includes("drawArrays"),
        `${STATE_OPS.length} idempotent setters`);
    // NARROW, AND THE NARROWNESS IS REPORTED: A -> B -> A is three real changes and is NOT counted.
    const c2 = captureContext({ useProgram: () => {} });
    const A = {}, B = {};
    c2.gl.useProgram(A); c2.gl.useProgram(B); c2.gl.useProgram(A);
    ok("!! ...and A->B->A is NOT reported, because those are three real changes",
        redundantStateSets(c2).length === 0,
        "a scheduler that sorted by program could have saved one, but costing that needs a model this file has not got");
}

// ---- 8. LIVE: A REAL DRIVER, AND THE PIXELS -----------------------------------------------------------------
console.log("\n8. *** THE ONLY CHECK THAT MATTERS: REPLAY IT INTO A REAL, UNPATCHED CONTEXT ***");
{
    const { chromium, from } = resolvePlaywright(createRequire(import.meta.url));
    const skip = browserSkipReason(chromium, from);
    if (skip) {
        console.log("  skip  the live section: " + skip);
        console.log("        THE ROUND-TRIP IS STILL PROVEN ABOVE against frameTrace's fingerprint. What is skipped");
        console.log("        is the pixel, which needs a driver -- and a fingerprint match is agreement about COMMANDS.");
    } else {
        const b64 = Buffer.from(fs.readFileSync(path.join(ROOT, "render", "glCapture.mjs"), "utf8"), "utf8").toString("base64");
        const browser = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
        let out = null;
        try {
            const page = await browser.newPage();
            await page.setContent("<!doctype html><body><canvas id=a width=64 height=64></canvas><canvas id=b width=64 height=64></canvas></body>");
            out = await page.evaluate(async (b64) => {
                const M = await import("data:text/javascript;base64," + b64);
                const inst = M.installCapture();
                const drawn = [], replayed = [];
                let unusedIsNull = null, identity = null;
                // *** readPixels MUST HAPPEN INSIDE A rAF CALLBACK: without preserveDrawingBuffer the default
                // drawing buffer is cleared after compositing, and the tree has paid for that lesson before.
                await new Promise((res) => requestAnimationFrame(() => {
                    const cv = document.getElementById("a");
                    const gl = cv.getContext("webgl2");
                    identity = (gl === cv.getContext("webgl2"));
                    const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); return sh; };
                    const pr = gl.createProgram();
                    gl.attachShader(pr, mk(gl.VERTEX_SHADER, "#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0.,1.);}"));
                    gl.attachShader(pr, mk(gl.FRAGMENT_SHADER, "#version 300 es\nprecision highp float;uniform vec3 uC;out vec4 o;void main(){o=vec4(uC,1.);}"));
                    gl.linkProgram(pr); gl.useProgram(pr);
                    unusedIsNull = gl.getUniformLocation(pr, "uNeverDeclared") === null;
                    gl.uniform3f(gl.getUniformLocation(pr, "uC"), 0.2, 0.6, 0.9);
                    const buf = gl.createBuffer();
                    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
                    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
                    const l = gl.getAttribLocation(pr, "p");
                    gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
                    gl.viewport(0, 0, 64, 64); gl.viewport(0, 0, 64, 64);
                    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
                    gl.drawArrays(gl.TRIANGLES, 0, 3);
                    const px = new Uint8Array(4); gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
                    drawn.push(...px);
                    res();
                }));
                const h = inst.captures[0];
                const src = M.compileTrace(h);
                inst.uninstall();                       // the second context must be a PLAIN one
                await new Promise((res) => requestAnimationFrame(() => {
                    const gl2 = document.getElementById("b").getContext("webgl2");
                    M.replayTrace(src, gl2);
                    const px = new Uint8Array(4); gl2.readPixels(32, 32, 1, 1, gl2.RGBA, gl2.UNSIGNED_BYTE, px);
                    replayed.push(...px);
                    res();
                }));
                return {
                    calls: h.calls(), bytes: h.bytes, srcBytes: src.length, contexts: inst.captures.length,
                    identity, unusedIsNull, drawn, replayed,
                    census: M.census(h).length, redundant: M.redundantStateSets(h).map((x) => x.op),
                };
            }, b64);
        } finally { await browser.close(); }

        console.log(`  live  ${out.calls} calls captured from a page-built context, ${out.bytes} retained bytes, ${out.srcBytes}-byte replay`);
        ok("!! a context the PAGE made is captured -- the thing makeRecordingGL cannot reach",
            out.contexts === 1 && out.calls > 15, `${out.contexts} context, ${out.calls} calls`);
        ok("!! getContext identity holds in a REAL browser, not only against a fake canvas", out.identity === true);
        ok("!! getUniformLocation of an undeclared uniform really does return null in a real driver",
            out.unusedIsNull === true, "which is the call that crashes the original");
        ok("the original frame drew something", out.drawn.join() !== "0,0,0,0" && out.drawn[3] === 255, `rgba(${out.drawn})`);
        ok("!! *** THE REPLAY, IN A SECOND UNPATCHED CONTEXT, PRODUCES THE IDENTICAL PIXEL ***",
            out.replayed.join() === out.drawn.join(),
            `drawn rgba(${out.drawn}) vs replayed rgba(${out.replayed}) -- a real driver, not a fingerprint`);
        ok("...and the live census and redundancy report agree with the pure sections",
            out.census > 10 && out.redundant.includes("viewport"),
            `${out.census} distinct entry points, redundant: ${out.redundant.join(",") || "none"}`);
    }
}

// ---- 9. WHAT IT IS AND IS NOT -------------------------------------------------------------------------------
console.log("\n9. what it is and is not");
{
    const src = fs.readFileSync(path.join(ROOT, "render", "glCapture.mjs"), "utf8");
    ok("it records WebGL, and does not pretend to reach WebGPU",
        /records WebGL only/.test(src) && !/navigator\.gpu/.test(codeOnly(src)));
    ok("!! it reuses frameTrace rather than growing a second opinion about what a trace is",
        /toRecordingLog/.test(src) && !/export function normalize/.test(src),
        "one comparator in the tree, which is what #78 was about");
    ok("no dependency beyond the platform", !/^import /m.test(src.split("export const RETAIN")[0].replace(/^\/\/.*$/gm, "")));
}

console.log("\n----  WHAT THIS DOES NOT CLAIM");
console.log("      THAT A REPLAY IS ALWAYS FAITHFUL. Section 8 measured one frame end to end and got the same");
console.log("      pixel from a real driver, which is evidence and not a guarantee. A capture started mid-run");
console.log("      replays without the state the app had already set, and a page whose textures came from an");
console.log("      image that finished loading before recording began replays with nothing in them. The trace");
console.log("      reproduces a frame exactly as far back as the recording goes and no further.");
console.log("      AND IT IS BLIND TO WEBGPU, which is where this tree's newest rendering lives.");

console.log("\nglCapture-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
