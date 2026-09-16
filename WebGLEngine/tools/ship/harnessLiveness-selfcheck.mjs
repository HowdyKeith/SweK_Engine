/**
 * TWO BACKENDS AGREEING BECAUSE NEITHER OF THEM RAN.
 *
 * v4571 widened wgslCorpus's census and left crossBackend naming thirteen unregistered kernels. Answering
 * them meant running them, and running them found something underneath: *** THE CROSS-BACKEND HARNESS COULD
 * NOT TELL "BOTH BACKENDS AGREED" FROM "NEITHER BACKEND PRODUCED ANYTHING". ***
 *
 * *** AND out-AT-0 / uniform-AT-1 WAS BAKED IN THREE PLACES, NOT TWO. *** Both cross-backend harnesses
 * hard-coded it, and so did render/computeRun.mjs's corpusSpec -- the device path deviceCompute-selfcheck
 * drives. Every corpus entry until now happened to follow the convention, so nothing ever had to declare it,
 * and adding the thirteen turned corpusSpec's at(0) into a demand for a buffer nobody supplies: twelve reds,
 * found by the verify sweep and not by any of the three harnesses. A house style mistaken for a law. Fixing
 * it took the same two options in a third place AND in deviceCompute's packer, which dropped them crossing
 * into the page -- a field that exists is not a field that travels.
 *
 * MEASURED at v4572 on a kernel that must write src + 7 at every lane:
 *
 *   - bind it so the device REJECTS the bind group -> both harnesses returned { ok: true, errors: [] } and a
 *     field of zeros, because createBindGroup hands back an invalid object rather than throwing, the submit
 *     is dropped, and the read-back buffer is still the zeros it was created with.
 *   - bind it VALIDLY but with the read-back buffer where the kernel reads its INPUT -> no error anywhere,
 *     on either side, ever. The device is content, the kernel runs, it writes to a buffer nobody reads.
 *   - either way wgslCorpus.compare scored { n: 8, same: 8, identical: true }.
 *
 * The corpus's headline claim is "no divergence anywhere in the corpus". It was satisfiable by a kernel that
 * never ran on either side, and the whole temporal arc was one option away from that state: its thirteen
 * kernels put dst at bindings 1 to 4 and the uniform last, while both harnesses hard-coded out-at-0 and
 * uniform-at-1. Registering them without this repair would have added thirteen silent passes.
 *
 * *** THREE REPAIRS, AND ONLY ONE OF THEM IS AN ERROR CHECK. *** A validation error scope catches the first
 * case. Nothing catches the second -- no error is raised -- so the read-back is now filled with
 * LIVENESS_SENTINEL and a run that leaves every word of it intact is reported as `wroteNothing`, which
 * compare() refuses. And the browser texture path already HAD a scope whose finding it pushed into a list
 * and returned ok:true beside; gathering evidence and not acting on it is the same fault as never gathering
 * it. All three are measured below, and the existing 70-entry corpus and all 20 harness-calling gates in the
 * tree were swept green with them in place, so none of it is a behaviour change anybody else was relying on.
 */
import { runWgslComputeNative, LIVENESS_SENTINEL, headlessGpuSkipReason } from "./headlessGpu.mjs";
import { runWgslCompute, webgpuSkipReason } from "./webgpuHarness.mjs";
import { compare, corpus, census, EXCLUDED } from "./wgslCorpus.mjs";
import { temporalEntries, bindingsOf, TW, TH } from "./temporalCorpus.mjs";
import { createRequire } from "node:module";

const requireFn = createRequire(import.meta.url);
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

// The kernel every probe below uses: it must write src + 7 at every lane, so "it wrote nothing" and "it
// wrote something wrong" are different readings rather than two shades of zero.
const PLUS7 = `
@group(0) @binding(0) var<storage,read> src : array<f32>;
@group(0) @binding(1) var<storage,read_write> dst : array<f32>;
@compute @workgroup_size(8) fn main(@builtin(global_invocation_id) g : vec3<u32>) {
  dst[g.x] = src[g.x] + 7.0;
}`;
const ONES = () => new Float32Array(8).fill(1);

console.log("harnessLiveness-selfcheck -- the corpus could not tell agreement from silence\n");

const nativeSkip = headlessGpuSkipReason(requireFn), browserSkip = webgpuSkipReason(requireFn);

// -----------------------------------------------------------------------------------------------------------
console.log("1. *** A REJECTED BIND GROUP IS A REFUSAL NOW, NOT A FIELD OF ZEROS ***");
if (nativeSkip) { report(`native harness unavailable: ${nativeSkip}`); }
else {
    // binding 1 declared read_write and left unbound: the device rejects the bind group outright.
    const r = await runWgslComputeNative({ code: PLUS7, outCount: 8, workgroups: 1 });
    ok("*** the native harness REFUSES a run the device rejected, instead of returning ok:true beside a read-back nobody wrote ***",
        r.ok === false && (r.errors || []).length > 0,
        r.ok === false ? `reason: ${String(r.reason).slice(0, 70)}...` : `ok:${r.ok} values:${JSON.stringify((r.values || []).slice(0, 3))}`);
    ok("  and the refusal carries the device's own message rather than a verdict this gate invented",
        r.ok === false && /entries|binding|layout|expected/i.test(String((r.errors || [])[0] || "")),
        `"${String((r.errors || [])[0] || "").slice(0, 80)}"`);
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n2. *** AND THE CASE NO ERROR SCOPE CAN SEE: A VALID BIND GROUP POINTING AT THE WRONG BUFFER ***");
if (nativeSkip) { report(`native harness unavailable: ${nativeSkip}`); }
else {
    // The harness's out buffer goes to binding 0, which PLUS7 declares read-only; the supplied input goes to
    // binding 1, which it declares read_write. Both usages are satisfiable, so the bind group is VALID, the
    // kernel runs, and it writes over the input. The read-back is a buffer the kernel never names.
    const r = await runWgslComputeNative({ code: PLUS7, outCount: 8, workgroups: 1, inputs: [{ binding: 1, data: ONES() }] });
    ok("the device raises NOTHING here -- this is a legal program, which is why an error scope alone was not the repair",
        r.ok === true && (r.errors || []).length === 0, `ok:${r.ok}, errors:${(r.errors || []).length}`);
    ok("*** and the liveness fill catches it: every word of the read-back is still the sentinel, so the harness reports the run wrote nothing ***",
        r.wroteNothing === true && (r.values || []).every((v) => v === LIVENESS_SENTINEL),
        `wroteNothing:${r.wroteNothing}, ${(r.values || []).filter((v) => v === LIVENESS_SENTINEL).length}/8 untouched`);
    ok("  and the same run bound CORRECTLY writes src + 7, so the sentinel is reporting the binding and not refusing every run alike",
        await (async () => { const g = await runWgslComputeNative({ code: PLUS7, outCount: 8, workgroups: 1,
                                 outBinding: 1, uniformBinding: 2, inputs: [{ binding: 0, data: ONES() }] });
                             return g.ok && !g.wroteNothing && g.values.every((v) => v === 8); })(),
        "outBinding 1, src at 0 -> eight 8s");
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n3. *** WHAT compare() DID WITH THAT, WHICH IS THE REASON ANY OF IT MATTERS ***");
if (nativeSkip || browserSkip) { report(`needs both backends: ${nativeSkip || ""} ${browserSkip || ""}`.trim()); }
else {
    const bad = { id: "probe.MIS-BOUND", from: "tools/ship/harnessLiveness-selfcheck.mjs", why: "a probe",
                  opts: { code: PLUS7, outCount: 8, workgroups: 1, inputs: [{ binding: 1, data: ONES() }] } };
    const r = await compare(bad, runWgslCompute, runWgslComputeNative);
    report("before this round the same entry scored { ok: true, n: 8, same: 8, identical: true }");
    ok("*** compare() now REFUSES an entry whose read-back is untouched, rather than scoring two silences as agreement ***",
        r.ok === false && r.wroteNothing === true, `reason: ${String(r.reason).slice(0, 100)}`);
    ok("  and it names WHICH side was silent, because a liveness failure on one backend is not a divergence between two",
        typeof r.reason === "string" && /BOTH backends|the browser|the native/.test(r.reason),
        String(r.reason || "").slice(0, 60) + "...");
    const good = { id: "probe.CORRECTLY-BOUND", from: "tools/ship/harnessLiveness-selfcheck.mjs", why: "a probe",
                   opts: { code: PLUS7, outCount: 8, workgroups: 1, outBinding: 1, uniformBinding: 2,
                           inputs: [{ binding: 0, data: ONES() }] } };
    const g = await compare(good, runWgslCompute, runWgslComputeNative);
    ok("  and the correctly bound twin still compares clean on both backends, so section 3 is a distinction and not a blanket refusal",
        g.ok === true && g.identical === true && g.n === 8, `same ${g.same}/${g.n}`);
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n4. THE SENTINEL IS ONE NUMBER, AND BOTH HARNESSES MUST FILL WITH IT");
{
    // If the two sides filled with different sentinels, a run that wrote nothing would read as a DIVERGENCE
    // -- a red for the wrong reason, which is worse than the silence it replaces because it sends the next
    // round looking at the kernel.
    ok("the sentinel is exported from ONE module and the browser harness imports it rather than restating it",
        typeof LIVENESS_SENTINEL === "number" && Number.isFinite(LIVENESS_SENTINEL),
        `LIVENESS_SENTINEL = ${LIVENESS_SENTINEL}`);
    ok("  and it survives the f32 round trip exactly, so the equality test that detects it is not a tolerance",
        new Float32Array([LIVENESS_SENTINEL])[0] === LIVENESS_SENTINEL, "exactly representable in f32");
    ok("  and it is outside anything this corpus computes, so a kernel cannot produce it by accident",
        Math.abs(LIVENESS_SENTINEL) > 1e5, `|${LIVENESS_SENTINEL}| > 1e5`);
}
// *** THE THREE ROWS ABOVE WERE A 0-RED AND THIS IS THE REPAIR. *** Giving the browser harness a DIFFERENT
// sentinel from the native one changed nothing in them, because all three read the constant in THIS process
// and none of them watched either harness use it -- a claim about a label rather than about behaviour, which
// is the same fault v4571's window-form control made one round earlier. A fully dead run still agrees under
// mismatched sentinels (each side detects its own), so the case that separates them is a PARTIALLY written
// read-back: the gap carries the fill, and two different fills read as a DIVERGENCE -- a red pointing at the
// kernel for a defect in the harness, which is worse than the silence this round set out to remove.
if (nativeSkip || browserSkip) { report(`the shared-fill row needs both backends: ${nativeSkip || ""} ${browserSkip || ""}`.trim()); }
else {
    const HALF = `
@group(0) @binding(0) var<storage,read_write> dst : array<f32>;
@compute @workgroup_size(8) fn main(@builtin(global_invocation_id) g : vec3<u32>) {
  if (g.x < 4u) { dst[g.x] = f32(g.x) + 1.0; }
}`;
    const half = { id: "probe.HALF-WRITTEN", from: "tools/ship/harnessLiveness-selfcheck.mjs", why: "a probe",
                   opts: { code: HALF, outCount: 8, workgroups: 1 } };
    const r = await compare(half, runWgslCompute, runWgslComputeNative);
    const n = await runWgslComputeNative(half.opts);
    report(`a kernel that writes only the first half: native read-back ${JSON.stringify((n.values || []).map((v) => v === LIVENESS_SENTINEL ? "FILL" : v))}`);
    ok("*** the two harnesses fill the UNWRITTEN half with the same number, measured by comparing a half-written read-back across both -- the row the mismatch sabotage needed and the three above could not be ***",
        r.ok === true && r.identical === true && r.n === 8,
        r.ok ? `same ${r.same}/${r.n}` : `refused: ${String(r.reason).slice(0, 70)}`);
    ok("  and the run is NOT reported as silent, because half of it is real -- so the liveness test is about an untouched buffer and not about a partly used one",
        n.ok === true && n.wroteNothing === false &&
        (n.values || []).filter((v) => v === LIVENESS_SENTINEL).length === 4,
        `wroteNothing:${n.wroteNothing}, ${(n.values || []).filter((v) => v === LIVENESS_SENTINEL).length}/8 still the fill`);
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n5. *** THE THIRTEEN v4571 NAMED, AND THE BINDINGS READ OUT OF THE KERNELS RATHER THAN RESTATED ***");
{
    const un = census().filter((c) => c.where === null);
    ok(`*** every WGSL producer the census can see is now in the corpus or excluded with a reason -- ${corpus().length} in corpus, ${EXCLUDED.length} excluded, ${un.length} unaccounted ***`,
        un.length === 0, un.length ? un.map((u) => u.symbol).join(", ") : `was 13 unaccounted at v4571`);
    const te = temporalEntries();
    ok(`  and the arc contributes ${te.length} of them -- ${te.filter((e) => !e.compileOnly).length} dispatched and ${te.filter((e) => e.compileOnly).length} function fragments compiled inside a shell that CALLS them`,
        te.length === 13 && te.filter((e) => e.compileOnly).length === 2, `${te.length} entries`);
    // The claim that makes this safe to extend: no entry restates a binding number.
    const derived = te.filter((e) => !e.compileOnly).every((e) => {
        const bs = bindingsOf(e.opts.code);
        const outOk = bs.some((b) => b.binding === e.opts.outBinding && b.kind.includes("read_write"));
        const uniOk = bs.some((b) => b.binding === e.opts.uniformBinding && b.kind.includes("uniform"));
        const inOk = (e.opts.inputs || []).every((i) => bs.some((b) => b.binding === i.binding));
        return outOk && uniOk && inOk && bs.length === (e.opts.inputs || []).length + 2;
    });
    ok("*** every dispatched entry's out, uniform and input bindings come from the KERNEL'S OWN SOURCE and account for all of its bindings -- a renumbered shader moves the entry with it ***",
        derived, `${te.filter((e) => !e.compileOnly).length} kernels re-parsed`);
    ok("  and a kernel whose buffer was RENAMED fails at construction rather than running against a fixture of zeros",
        (() => { try { bindingsOf("@group(0) @binding(0) var<storage,read_write> notDst:array<f32>;"); } catch { return false; }
                 const bs = bindingsOf("@group(0) @binding(0) var<storage,read_write> notDst:array<f32>;");
                 return bs.length === 1 && bs[0].name === "notDst" && bs[0].kind === "storage,read_write"; })(),
        "bindingsOf reads name and access kind, which is what the construction check tests against");
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n6. AND LIVENESS IS NOT EXERCISE: EVERY DISPATCHED ENTRY MUST WRITE MORE THAN ONE NUMBER");
if (nativeSkip) { report(`native harness unavailable: ${nativeSkip}`); }
else {
    // *** THE FIRST VERSION OF DISOCCLUSION'S FIXTURE PASSED EVERY CHECK ABOVE AND WAS STILL WORTHLESS. ***
    // It ran, it wrote all 256 words, and it wrote 0.0 in every one of them, because the shared motion
    // field's expected-depth channel sat 0.08 below the threshold at every pixel. Two backends agreeing on
    // one constant is not evidence about a branch. A dedicated fixture straddles it now, and this row is why.
    const rows = [];
    for (const e of temporalEntries()) {
        if (e.compileOnly) continue;
        const r = await runWgslComputeNative(e.opts);
        const v = r.values || [];
        rows.push({ id: e.id, n: v.length, untouched: v.filter((x) => x === LIVENESS_SENTINEL).length,
                    distinct: new Set(v.map((x) => x.toFixed(6))).size });
    }
    for (const r of rows) report(`${r.id.padEnd(38)} n=${String(r.n).padStart(4)}  untouched=${String(r.untouched).padStart(3)}  distinct=${String(r.distinct).padStart(4)}`);
    ok(`*** all ${rows.length} dispatched entries write every word of their read-back -- ${rows.reduce((a, r) => a + r.n, 0)} floats, ${rows.reduce((a, r) => a + r.untouched, 0)} untouched ***`,
        rows.length === 11 && rows.every((r) => r.untouched === 0), `${rows.filter((r) => r.untouched > 0).map((r) => r.id).join(", ") || "none untouched"}`);
    ok("*** and none of them writes a CONSTANT, which liveness alone would have let through and did: the disocclusion fixture wrote 256 identical zeros until its own motion field was built to straddle the threshold ***",
        rows.every((r) => r.distinct >= 2), rows.filter((r) => r.distinct < 2).map((r) => r.id).join(", ") || `fewest distinct: ${Math.min(...rows.map((r) => r.distinct))}`);
    ok("  and the three ridge kernels write a MASK, so two distinct values is the whole range there and both branches are reached",
        rows.filter((r) => /RIDGE/.test(r.id)).every((r) => r.distinct === 2),
        `${rows.filter((r) => /RIDGE/.test(r.id)).length} mask kernels at exactly 2`);
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n7. CONTROLS");
{
    ok("the fixture is not flat -- a flat frame would make half these kernels write a constant, which section 6 exists to refuse",
        (() => { const e = temporalEntries().find((x) => x.id.includes("RING_FLOOR"));
                 const luma = (e.opts.inputs || []).map((i) => i.data).find((d) => d && d.length === TW * TH);
                 return luma && new Set(Array.from(luma)).size > 100; })(),
        `${TW}x${TH}, over 100 distinct luma values`);
    ok("  and the motion fixture sits at an eighth and three-eighths of a texel, off the half-texel fixed point v4571 measured every arc expression to coincide at",
        (() => { const e = temporalEntries().find((x) => x.id.includes("RING_FLOOR"));
                 const m = (e.opts.inputs || []).map((i) => i.data).find((d) => d && d.length === TW * TH * 4);
                 return m && Math.abs(m[0] * TW - 0.125) < 1e-6 && Math.abs(m[1] * TH - 0.375) < 1e-6; })(),
        "0.125 on x, 0.375 on y");
    ok("every temporal entry carries a `why` that says what it exercises, the same bar EXCLUDED entries are held to",
        temporalEntries().every((e) => typeof e.why === "string" && e.why.length > 60),
        `shortest ${Math.min(...temporalEntries().map((e) => e.why.length))} chars`);
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("ALSO: the thirteen now run on THREE paths, not two -- the two cross-backend harnesses above and " +
    "gfx/device.js through render/computeRun.mjs, which tools/ship/deviceCompute-selfcheck.mjs drives at " +
    "86,541 floats across 32 kernels. That gate is where the third hard-coded binding convention surfaced, " +
    "and it is NOT re-driven here: this gate holds the harness contract, that one holds the device path.\n");
console.log("unchecked here: the TEXTURE path's liveness -- section 1's scope now refuses a rejected texture " +
    "run on both harnesses, but a texture written to the wrong attachment has no sentinel equivalent and " +
    "nothing here probes it; whether any of the OTHER 70 corpus entries was silently in the state this round " +
    "found, which the sweep answers only in aggregate (they pass, so none is fully untouched) and not per " +
    "entry against the constant-output bar section 6 applies to the thirteen; and the seven tree-wide census " +
    "gates v4571 found red at HEAD, of which this round answered one -- crossBackend -- and left " +
    "frameDirtyCensus, gateSelection, referenceKind, definitionGates, staleness, statedRuntime and " +
    "recordReach exactly where they were.");
process.exit(fails ? 1 : 0);
