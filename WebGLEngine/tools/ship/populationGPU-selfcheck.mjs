// tools/ship/populationGPU-selfcheck.mjs
//
// Run: node tools/ship/populationGPU-selfcheck.mjs   (instant)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v3119 -- THE GPU HALF, AND THE FORMAT THAT WOULD HAVE KILLED EVERY AGENT.
//
// v3118 planned the population field and did not build it. This builds it under v3116's discipline: the parts
// that cannot run here are thin and decide nothing, and everything that decides anything is pure or borrowed
// from something already tested.
//
// *** THE FINDING. *** The alpha channel packs kind*2+alive, so LIVENESS IS THE LOW BIT of an integer held in a
// float. RGBA32F holds it exactly. RGBA16F DOES NOT -- half-float is exact on integers only to 2048, so kind
// 1024 packs to 2049, rounds to 2048, and reads DEAD. MEASURED by rounding through IEEE half: kind 1023 -> 2047
// survives; 1024 -> 2049 becomes 2048; 1500 -> 3001 becomes 3000; 4000 -> 8001 becomes 8000. ABOVE 1023 EVERY
// LIVE AGENT SILENTLY VANISHES, the symptom is a shrinking population rather than an error, and RGBA16F is
// exactly what somebody reaches for to halve the bandwidth. The module refuses the format by name.
//
// AND THE REDUCTION IS WRITTEN TWICE ON PURPOSE. The shader cannot be executed here, so a shader alone would be
// a claim with no evidence. sim/populationReduce.js carries a JS reference of the same arithmetic; the gate
// checks the reference against a planted field and checks the shader against the properties that make it the
// same operation. WHAT REMAINS UNVERIFIED IS WHETHER WebGL RUNS IT, NOT WHETHER IT IS RIGHT.
//
// The cost accepted: two implementations of one rule can drift. That is what the one-owner law exists to avoid,
// and it is paid deliberately -- shipping only the shader pays it too AND gives up the ability to notice.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { codeOnly } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const R = await import(pathToFileURL(path.join(ENG, "sim", "populationReduce.js")).href);
const G = await import(pathToFileURL(path.join(ENG, "sim", "populationGPU.js")).href);
const P = await import(pathToFileURL(path.join(ENG, "sim", "populationField.js")).href);
const gpuRaw = fs.readFileSync(path.join(ENG, "sim", "populationGPU.js"), "utf8");
const gpu = codeOnly(gpuRaw);

// ---- 1. THE FORMAT THAT WOULD HAVE KILLED EVERY AGENT ---------------------------------------------------------------
const toHalf = (v) => {
    const f = new Float32Array([v]), i = new Uint32Array(f.buffer)[0];
    const s = (i >> 16) & 0x8000; const e = ((i >> 23) & 0xff) - 112, m = i & 0x7fffff;
    if (e <= 0) return 0; if (e >= 31) return Infinity;
    let h = s | (e << 10) | (m >> 13);
    if ((m & 0x1000) && ((m & 0x2fff) || (h & 1))) h++;
    return (h & 0x8000 ? -1 : 1) * Math.pow(2, ((h >> 10) & 0x1f) - 15) * (1 + (h & 0x3ff) / 1024);
};
{
    const live = (kind) => Math.round(toHalf(P.packSlot(kind, true))) % 2 === 1;
    ok("!! in HALF-FLOAT the packing survives to kind 1023 and dies at 1024",
        live(1023) === true && live(1024) === false && live(1500) === false && live(4000) === false,
        "2047 survives; 2049 rounds to 2048, 3001 to 3000, 8001 to 8000. Liveness is the LOW BIT, and half-float " +
        "stops representing odd integers above 2048 -- so EVERY AGENT ABOVE KIND 1023 READS DEAD, silently");

    ok("...and kinds stay live in RGBA32F, which is why the module demands it",
        [7, 1024, 4000, 30000].every((k) => Math.round(Math.fround(P.packSlot(k, true))) % 2 === 1),
        "float32 is exact on integers to 2^24, so the trick is sound there and only there");

    let refused = false, why = "";
    try { G.createPopulationGPU({ createTransformFeedback() {} }, { format: "RGBA16F" }); }
    catch (e) { refused = true; why = e.message; }
    ok("!! the module REFUSES RGBA16F by name, before any of it runs",
        refused && /reads DEAD/.test(why) && /2048/.test(why),
        "a comment would have been read by whoever wrote it and nobody else. RGBA16F is exactly what somebody " +
        "reaches for to halve the bandwidth: \"" + why.slice(0, 90) + "...\"");

    ok("...and a WebGL1 context is refused by name too",
        (() => { try { G.createPopulationGPU({}, {}); return false; } catch (e) { return /needs WebGL2/.test(e.message); } })(),
        "no float render targets, no texelFetch, no PBOs. Failing later would look like a driver problem");
}

// ---- 2. THE REDUCTION, AGAINST A PLANTED FIELD ------------------------------------------------------------------------
{
    const side = 64, tile = 16, tps = side / tile;
    const rgba = new Float32Array(side * side * 4);
    const put = (x, y, alive) => { rgba[(y * side + x) * 4 + 3] = P.packSlot(7, alive); };
    for (let i = 0; i < 5; i++) put(i, 0, true);
    for (let i = 0; i < 3; i++) put(32 + i, 16, true);
    for (let i = 0; i < 40; i++) put(i, 40, false);
    // v3123 -- reduceReference now returns { counts, free }: the same pass that counts also reports a FREE
    // SLOT per tile, which is what made the spawn side possible. This gate was written against the bare array
    // and correctly went red when the shape changed -- a caller breaking on a return-type change is the gate
    // doing its job, not a pin.
    const { counts: ref, free } = R.reduceReference(rgba, side, tile);

    ok("!! the reference counts the planted population exactly",
        ref[0] === 5 && ref[1 * tps + 2] === 3 && ref.reduce((a, b) => a + b, 0) === 8,
        "five live in tile (0,0), three in tile (2,1), forty DEAD slots contributing nothing. If dead slots " +
        "counted, the field would report a population that never changes");

    ok("!! and the same pass reports a FREE SLOT per tile",
        free.length === ref.length && free[0] >= 0 && Number.isFinite(free[0]),
        "tile 0's first dead slot is " + free[0] + ". FIRST dead wins so the answer does not depend on " +
        "fragment ordering, and it costs nothing because every texel was already being read");

    ok("...and its output order is the one spawnIntents decodes",
        (() => {
            const t = P.tilePlan(P.fieldPlan({ side }), { tile });
            const ints = P.spawnIntents(ref, t, { target: 5 });
            const first = ints.find((i) => i.tx === 2 && i.ty === 1);
            return ints.length > 0 && first && first.spawn === 2;
        })(),
        "tile-row-major both ends. A transposed reduction would spawn in the mirror image of the crowded " +
        "places and look plausible while being exactly wrong");
}

// ---- 3. THE SHADER IS THE SAME OPERATION -------------------------------------------------------------------------------
{
    const src = R.reduceShaderSource(32);
    ok("!! the loop bound is a LITERAL, not a uniform",
        /dy < 32/.test(src) && /dx < 32/.test(src) && !/dx < uTile/.test(src),
        "GLSL ES 3.00 will not unroll a loop whose trip count it cannot see, and some drivers refuse to compile " +
        "one at all. The literal is for compilability, not speed");

    ok("!! liveness is read with floor(a + 0.5), never a truncating cast",
        /floor\(a \+ 0\.5\)/.test(src) && !/int\(a\)/.test(src),
        "the packed value arrives as a float; 2469.0 read back as 2468.9999 truncates to EVEN and marks a live " +
        "agent dead. A population that loses agents to rounding looks exactly like emigration");

    ok("...and it uses texelFetch, so no filtering can touch the packed bit",
        /texelFetch/.test(src) && !/texture\(uField/.test(src),
        "a LINEAR sample between two packed integers produces a value that is neither, and its low bit is noise");
}

// ---- 4. THE PLUMBING'S THREE WAYS TO BE QUIETLY WRONG ---------------------------------------------------------------------
{
    ok("!! the readback goes INTO a PIXEL_PACK_BUFFER and is collected behind a fence",
        /PIXEL_PACK_BUFFER/.test(gpu) && /fenceSync/.test(gpu) && /clientWaitSync\(fence, 0, 0\)/.test(gpu),
        "a synchronous readPixels drains the pipeline and stalls main -- the poller lesson a fourth time, and " +
        "the entire reason v3118 measured the reduction. Zero timeout, checked next frame");

    ok("!! the ping-pong actually SWAPS",
        /const t = src; src = dst; dst = t;/.test(gpu),
        "writing into the texture being read is undefined in GL and produces results that look almost right, " +
        "which is the worst kind of wrong");

    ok("!! a failed send clears the in-flight slot",
        /pump\.onSendFailed\(\);/.test(gpu),
        "otherwise the pump waits forever for an answer to a question it never asked -- and the population " +
        "would freeze while health() still said alive");

    ok("!! the lifecycle is BORROWED, not cloned",
        /createPump/.test(gpu) && !/let inFlight/.test(gpu) && !/silentMs/.test(gpu),
        "face/detectPump.js already decides at most one in flight, drop rather than queue, and idle/alive/silent " +
        "apart. A GPU FENCE AND A WORKER REPLY ARE THE SAME PROBLEM WEARING DIFFERENT HARDWARE");

    console.log("  NOTE   NOT VERIFIED AND CANNOT BE HERE: that the shaders compile, that EXT_color_buffer_float");
    console.log("         is present, or that the fence resolves. There is no GL in this sandbox. What IS verified");
    console.log("         is the arithmetic, the format refusal, and every decision the loop makes. FIRST RUN ON");
    console.log("         THE RIG IS THE REAL TEST -- and if the shaders fail to compile, the error names which.");
}

// ---- 5. v3120: THE SHADERS NOW HAVE SOMEWHERE TO BE COMPILED -----------------------------------------------------------
// v3119 shipped real GLSL and the page was a pure planner that never made a GL context. NOTHING IN THE PROJECT
// WOULD EVER HAVE COMPILED THEM -- not here, not on the rig, not in render-qa. "First run on the rig is the real
// test" was true, and nobody had written down which run that would be.
{
    const page = fs.readFileSync(path.join(ENG, "population.html"), "utf8");
    const manifest = JSON.parse(fs.readFileSync(path.join(ENG, "tools", "render-qa", "manifest.json"), "utf8"));

    ok("!! the page actually builds the field on the GPU",
        /getContext\("webgl2"\)/.test(page) && /createPopulationGPU\(gl,/.test(page),
        "a planner that never made a context could describe the design forever without ever discovering the " +
        "shader did not compile");

    ok("!! and it is in the render-qa manifest, so it happens every run",
        manifest.pages.some((p) => p.name === "population" && p.url === "/population.html"),
        manifest.pages.length + " pages. render-qa already captures pageerror, so a compile failure surfaces " +
        "as a QA failure without anyone remembering to look");

    // *** UNSUPPORTED IS NOT BROKEN. *** The two-things-one-label shape, caught in advance for once.
    ok("!! a machine that CANNOT do float targets is reported as UNSUPPORTED, not as a failure",
        /UNSUPPORTED — no WebGL2/.test(page) && /UNSUPPORTED — EXT_color_buffer_float missing/.test(page),
        "the missing capability is NAMED. One word for 'this laptop is limited' and 'this shader is broken' " +
        "would make every machine without float render targets look like a defect, and the rule would be " +
        "switched off within a week");

    ok("...and a genuine compile failure is RETHROWN so QA sees it",
        /setTimeout\(\(\) => \{ throw e; \}, 0\)/.test(page),
        "the page shows the message AND lets it reach pageerror. A page that swallowed the error would pass " +
        "render-qa while being broken -- a green build as a self-report, which is the thing boundaryLint " +
        "exists to name");

    ok("...and a slow fence is not called a failure either",
        /fence not resolved in 30 frames/.test(page),
        "30 frames then a report of the pump's own health. A fence that has not landed yet is UNKNOWN -- the " +
        "same distinction detectPump draws between silent and idle");
}

// ---- v3149: THE LOOP EXISTS AND REFUSES TO GUESS -------------------------------------------------------------------
// Every piece was built and THE SEQUENCE HAD NO CALLER: the reduction lands counts and a free slot,
// spawnIntents turns counts into demand, planSpawns picks slots, writeAgents uploads texels -- and the
// population could be read and could be written and never grew.
{
    const src = fs.readFileSync(path.join(ENG, "sim", "populationGPU.js"), "utf8");
    ok("!! growPopulation() ties the four pieces together",
        /growPopulation\(/.test(src) && /intentsOrUnknown\(/.test(src) && /planSpawns\(/.test(src) && /this\.writeAgents\(/.test(src),
        "reduction -> intents -> slots -> upload. Each half was gated since v3118 and nothing ran them in order");

    ok("!! and it REFUSES on a pump that has not spoken, rather than spawning zero",
        /if \(!decision\.ok\) return \{ ok: false/.test(src),
        "intentsOrUnknown separates IDLE from SILENT. Spawning on either invents population from a pipeline " +
        "that never answered; returning ok:false with the state NAMED is the difference between 'nothing to " +
        "do' and 'we do not know'");

    ok("...and it returns the SHORTFALL, not just what it did",
        /\.\.\.plan/.test(src) && /delivered: 0/.test(src),
        "the caller gets wanted / delivered / unmet / limitedBy. 'delivered 4' must not read as '4 were " +
        "wanted' -- the same law as a stalled readback reporting UNKNOWN rather than zero");
}

console.log();
if (fails) { console.log("populationGPU-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("populationGPU-selfcheck: all checks pass");
