// WebGLEngine/tools/ship/scanLimits-selfcheck.mjs -- v4208
//
// GATES the fix for the three shaders v4207's WGSL validator found unrunnable, and brain/transport/scanTwin.mjs.
//
// *** THE FINDING WAS "@workgroup_size(1024) ON A TREE THAT NEVER RAISES ITS LIMITS". *** Four times WebGPU's
// default maxComputeInvocationsPerWorkgroup of 256, across 27 bare requestDevice() calls -- so
// createComputePipeline rejects all three and the shader "compiles" while the error lands elsewhere.
//
// *** AND THE OBVIOUS FIX WOULD HAVE BEEN WORSE THAN THE BUG, WHICH IS WHAT SECTION 2 IS FOR. *** Every one
// of these shaders assumed ONE ELEMENT PER THREAD. Writing 256 in place of 1024 leaves a Blelloch scan whose
// widest tree level needs 512 invocations being run by 256: MEASURED, 507 of 1024 offsets wrong, the first
// at index 512. A pipeline that will not build is visible. A scan that quietly returns wrong offsets is not.
//
// *** THE BOX HAS NO GPU, SO THE ALGORITHM IS VERIFIED IN A TWIN. *** scanTwin.mjs runs the same loops with
// barriers as phase boundaries -- every invocation finishes a phase before any starts the next, which in JS
// is "loop all threads, then move on" -- and is graded against primeTransport.js's serial exclusiveScan().
// That reproduces the read-write hazards a barrier exists to prevent, so a missing one is a wrong answer
// here rather than a vendor-specific glitch later.
//
// Run: node tools/ship/scanLimits-selfcheck.mjs

import { blellochScan, hillisSteeleInclusive, blockBases, fusedCompact, padToPow2, workgroupSizeFor }
    from "../../brain/transport/scanTwin.mjs";
import { exclusiveScan, scatter } from "../../brain/transport/primeTransport.js";
import { validateWgsl, parseEntryPoints, DEFAULT_LIMITS } from "../../render/wgslSpec.mjs";
import { codeOnly, noComments, prose } from "./sourceScan.mjs";
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const note = (m) => console.log("  ....  " + m);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");
const SHADERS = path.join(ENG, "brain", "transport", "shaders");
const FIXED = ["scan.wgsl", "mb-scan-blocks.wgsl", "fused-single-workgroup.wgsl"];
const rand = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);

// 1) *** THE THREE SHADERS NOW FIT A DEFAULT DEVICE, AND SO DOES EVERY OTHER ONE. ***
{
    for (const f of FIXED) {
        const src = fs.readFileSync(path.join(SHADERS, f), "utf8");
        const e = parseEntryPoints(src)[0];
        ok(e && e.workgroupSize[0] === 256, `${f}: @workgroup_size(${e ? e.workgroupSize[0] : "?"})`);
        const total = e.workgroupSize[0] * e.workgroupSize[1] * e.workgroupSize[2];
        ok(total <= DEFAULT_LIMITS.maxComputeInvocationsPerWorkgroup,
            `  ${total} invocations, within the default limit of ${DEFAULT_LIMITS.maxComputeInvocationsPerWorkgroup}`);
        ok(validateWgsl(src).length === 0, `  and it validates clean`);
        // *** THE ELEMENT CAPACITY MUST NOT HAVE SHRUNK. *** That is the whole difference between fixing the
        // shader and quietly scanning a quarter of the data.
        ok(/const N:\s*u32\s*=\s*1024u;/.test(src), `  and still scans N = 1024 elements, not 256`);
        ok(/array<u32,\s*1024>/.test(src), `  with a 1024-element shared array to match`);
        ok(/const WG:\s*u32\s*=\s*256u;/.test(src) , `  and a WG constant that matches its @workgroup_size`);
        // The strided loop is the fix; without it the constants are decoration.
        // *** CHECKING FOR THE ABSENCE OF AN IDIOM MUST READ codeOnly, AND MY FIRST DRAFT DID NOT. *** These
        // files EXPLAIN the fix in their headers, quoting `if (thid < d)` and `@workgroup_size(1024)` as the
        // things that were wrong -- so a scan of raw source finds them in the prose and reports the bug as
        // still present. It is the same rule three earlier rounds were caught ignoring, in its other
        // direction: noComments for anything quoted, codeOnly for code shapes, and an ABSENCE is a shape.
        const body = codeOnly(src);
        ok(/for \(var i = thid; i < \w+; i \+= WG\)/.test(body), `  and every stage strides: for (var i = thid; i < ...; i += WG)`);
        ok(!/if \(thid < d\)/.test(body), `  with no surviving one-element-per-thread guard in the code`);
    }
    // scan.wgsl's header quotes the old idiom while explaining the fix, which is exactly what made the
    // absence check above go red against correct code when it read raw source.
    ok(/if \(thid < d\)/.test(prose(read("brain/transport/shaders/scan.wgsl"))),
        "scan.wgsl's header still quotes `if (thid < d)` as the thing that was wrong -- the record is kept, the code is not");
    const all = fs.readdirSync(SHADERS).filter((f) => f.endsWith(".wgsl"));
    const bad = all.filter((f) => validateWgsl(fs.readFileSync(path.join(SHADERS, f), "utf8")).length);
    ok(bad.length === 0, `all ${all.length} brain/transport shaders conform${bad.length ? ": " + bad.join(", ") : ""}`);
}

// 2) *** THE CONTROL: THE ORIGINAL FORM IS WRONG AT 256, SO THE RESTRUCTURE WAS NECESSARY. ***
{
    // The shipped-then-replaced body, replayed exactly: `if (thid < d)` with no stride.
    const originalBlelloch = (data, wg) => {
        const n = data.length; let offset = 1;
        for (let d = n >> 1; d > 0; d >>= 1) {
            for (let thid = 0; thid < wg; thid++) if (thid < d) {
                const ai = offset * (2 * thid + 1) - 1, bi = offset * (2 * thid + 2) - 1; data[bi] += data[ai]; }
            offset *= 2; }
        data[n - 1] = 0;
        for (let d = 1; d < n; d *= 2) { offset >>= 1;
            for (let thid = 0; thid < wg; thid++) if (thid < d) {
                const ai = offset * (2 * thid + 1) - 1, bi = offset * (2 * thid + 2) - 1;
                const t = data[ai]; data[ai] = data[bi]; data[bi] += t; } }
        return data; };
    const r = rand(42);
    const flags = new Uint32Array(1024);
    for (let i = 0; i < 1024; i++) flags[i] = r() < 0.5 ? 1 : 0;
    const ref = exclusiveScan(flags).offsets;
    const at1024 = originalBlelloch(Uint32Array.from(flags), 1024);
    ok(at1024.every((v, i) => v === ref[i]), "the ORIGINAL body is correct at 1024 invocations -- it was right code for a workgroup it could not have");
    const at256 = originalBlelloch(Uint32Array.from(flags), 256);
    let wrong = 0, firstAt = -1;
    for (let i = 0; i < 1024; i++) if (at256[i] !== ref[i]) { wrong++; if (firstAt < 0) firstAt = i; }
    ok(wrong > 400, `and WRONG at 256: ${wrong} of 1024 offsets, the first at index ${firstAt}`);
    ok(firstAt === 512, `the first error is at index 512 -- exactly where a tree level needing 512 threads ran out of them`);
    const fixed256 = blellochScan(Uint32Array.from(flags), 256);
    ok(fixed256.every((v, i) => v === ref[i]), "while the strided body is correct at 256, which is the point of the change");
}

// 3) *** THE TWIN AGREES WITH THE SERIAL REFERENCE AT EVERY WORKGROUP SIZE. ***
{
    const SIZES = [1, 2, 4, 16, 64, 128, 256, 512, 1024];
    for (const wg of SIZES) {
        let bad = 0;
        for (let trial = 0; trial < 25; trial++) {
            const r = rand(trial * 7919 + 1);
            const flags = new Uint32Array(1024);
            for (let i = 0; i < 1024; i++) flags[i] = r() < 0.5 ? 1 : 0;
            const ref = exclusiveScan(flags).offsets;
            const got = blellochScan(Uint32Array.from(flags), wg);
            if (!got.every((v, i) => v === ref[i])) bad++;
        }
        ok(bad === 0, `Blelloch at wg=${wg}: 25/25 random flag arrays match the serial exclusive scan`);
    }
    for (const wg of [1, 4, 64, 256, 1024]) {
        let bad = 0;
        for (let trial = 0; trial < 25; trial++) {
            const r = rand(trial * 104729 + 3);
            const counts = new Uint32Array(1024);
            for (let i = 0; i < 1024; i++) counts[i] = Math.floor(r() * 40);
            const ref = exclusiveScan(counts).offsets;
            const got = blockBases(counts, wg);
            if (!got.every((v, i) => v === ref[i])) bad++;
        }
        ok(bad === 0, `Hillis-Steele block bases at wg=${wg}: 25/25 match`);
    }
    // The fused pass must reproduce the serial compaction BYTE for byte, survivors and all.
    for (const wg of [1, 4, 64, 256, 1024]) {
        let bad = 0;
        for (let trial = 0; trial < 25; trial++) {
            const r = rand(trial * 31337 + 11), n = 1000, maxS = 600;
            const flags = new Uint32Array(n), states = new Uint32Array(n);
            for (let i = 0; i < n; i++) { flags[i] = r() < 0.4 ? 1 : 0; states[i] = Math.floor(r() * 1e6); }
            const ref = scatter([...states].map((sid) => ({ stateId: sid })), flags, exclusiveScan(flags).offsets, maxS);
            const got = fusedCompact(flags, states, wg, maxS);
            if (!got.every((v, i) => v === ref[i])) bad++;
        }
        ok(bad === 0, `fused compaction at wg=${wg}: 25/25 byte-identical to exclusiveScan + scatter`);
    }
    // An exclusive scan is a pure function of its input, so a non-power-of-two padded up must agree too.
    const odd = Uint32Array.from([1, 0, 1, 1, 0, 1, 1]);
    const padded = blellochScan(padToPow2(odd), 4);
    const refOdd = exclusiveScan(odd).offsets;
    ok(refOdd.every((v, i) => padded[i] === v), "padding a 7-element array to 8 with zeros leaves the first 7 offsets unchanged");
    ok(workgroupSizeFor(1024) === 256 && workgroupSizeFor(64) === 64 && workgroupSizeFor(1, 256) === 1,
        "workgroupSizeFor caps at the limit and never asks for more invocations than there are elements");
    // A hazard the barrier prevents: collapsing the per-thread reads to one scalar must break it.
    const brokenHillis = (data, wg) => {
        const n = data.length;
        for (let off = 1; off < n; off <<= 1) {
            for (let thid = 0; thid < wg; thid++) {          // no read/write split: one fused phase
                for (let i = thid; i < n; i += wg) if (i >= off) data[i] += data[i - off];
            }
        }
        return data; };
    const c = new Uint32Array(64).fill(1);
    const refC = exclusiveScan(c).offsets;
    const brokeC = brokenHillis(Uint32Array.from(c), 8);
    ok(!brokeC.every((v, i) => v - c[i] === refC[i]),
        "fusing Hillis-Steele's read and write into one phase gives a DIFFERENT answer -- which is what the barrier and the per-thread array are for");
}

// 4) *** THE WGSL AND THE TWIN ARE THE SAME ALGORITHM. ***
{
    const scan = read("brain/transport/shaders/scan.wgsl");
    ok(/shared_data\[bi\] \+= shared_data\[ai\];/.test(scan), "scan.wgsl up-sweep matches the twin's reduce step");
    ok(/shared_data\[N - 1u\] = 0u;/.test(scan), "and clears the root at N-1, which is what makes it exclusive");
    ok(/let t = shared_data\[ai\];[\s\S]{0,120}shared_data\[bi\] \+= t;/.test(scan), "and its down-sweep swaps then adds, as the twin does");
    for (const f of ["mb-scan-blocks.wgsl", "fused-single-workgroup.wgsl"]) {
        const src = fs.readFileSync(path.join(SHADERS, f), "utf8");
        ok(/var mine: array<u32, 4>;/.test(src), `${f}: carries its reads across the barrier in a per-thread array`);
        ok(/workgroupBarrier\(\);[\s\S]{0,400}workgroupBarrier\(\);/.test(src), `  with the read and write phases separated by barriers`);
    }
    const fused = fs.readFileSync(path.join(SHADERS, "fused-single-workgroup.wgsl"), "utf8");
    ok(/var passed:\s*array<u32, 4>;/.test(fused) && /var myState:\s*array<u32, 4>;/.test(fused),
        "the fused shader carries its filter verdict PER ELEMENT from filter to scatter");
    ok(/if \(passed\[k\] == 1u\)/.test(fused),
        "and scatters on that stored verdict, not on a second evaluation of the predicate the scan already counted");
    const threeBodies = FIXED.map((f) => codeOnly(fs.readFileSync(path.join(SHADERS, f), "utf8"))).join("\n");
    ok(!/@workgroup_size\(1024\)/.test(threeBodies), "and no @workgroup_size(1024) survives in the code of any of the three");
    ok(FIXED.every((f) => /1024/.test(prose(fs.readFileSync(path.join(SHADERS, f), "utf8")))),
        "while all three headers still record what the size used to be -- the record is not being tidied away");
    // The CPU twin the shaders are graded against is untouched -- otherwise this proves nothing.
    ok(/for \(let i = 0; i < n; i\+\+\) \{ offsets\[i\] = sum; sum \+= flags\[i\]; \}/.test(codeOnly(read("brain/transport/primeTransport.js"))),
        "primeTransport.js's serial exclusiveScan is unchanged -- the reference did not move to meet the shaders");
}

// 5) *** PURITY, AND THE HONESTY THE MISSING GPU FORCES. ***
{
    const twin = codeOnly(read("brain/transport/scanTwin.mjs"));
    ok(!/\bdocument\b|\bwindow\b|navigator\.|readFileSync|fetch\(/.test(twin), "scanTwin.mjs is arithmetic: no DOM, no GPU, no disk");
    ok(!/Math\.random|Date\.now/.test(twin), "and no clock or randomness -- the same input gives the same answer");
    const pr = prose(read("brain/transport/scanTwin.mjs"));
    ok(/no GPU|barriers as phase boundaries|phase boundaries/i.test(pr),
        "and it says plainly that it is a simulation standing in for a device this box does not have");
    ok(/507 of 1024/.test(pr) || /507/.test(pr), "recording the measured cost of the naive fix rather than asserting it");
    for (const f of FIXED) {
        const p = prose(fs.readFileSync(path.join(SHADERS, f), "utf8"));
        ok(/v4208/.test(p), `${f} records when and why its workgroup size changed`);
    }
    note(`brain/transport shaders: ${fs.readdirSync(SHADERS).filter((f) => f.endsWith(".wgsl")).length}, all within the default limits`);
}

console.log(`scanLimits-selfcheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
