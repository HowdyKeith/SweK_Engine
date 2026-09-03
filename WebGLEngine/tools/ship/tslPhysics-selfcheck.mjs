#!/usr/bin/env node
// WebGLEngine/tools/ship/tslPhysics-selfcheck.mjs -- v4321
//
// GRADES PHYSICS AS TSL NODES (docs/TSL-ROADMAP.md step 5): swk_lyapunov's exponent and the Heidler current written as
// TSL functions (render/physicsTsl.mjs), graded by the keys their WGSL and GLSL twins are held to -- ln 2 at r = 4 within
// 2e-3, the period-3 window dark; the lightning's peak over i0 an exact 1 at the true eta (1e-4) and 1.0667 at the
// published one (1e-3) -- read off both of three's backends through the TSL render path, and then AGAIN through
// gfx/device.js after render/tslSource.mjs transplants the emitted fragments: generated physics in the device's own
// pipeline, the same keys. Every number is read back from a picture; the shader is never handed the answer.
// v4329 -- AND IT NOW CHECKS THE SPLIT IT WAS PART OF. render/physicsTsl.mjs was named for physics and had grown
// three fleet shells and five looks by v4328; they moved to render/fleetTsl.mjs. Section 1 asks the exact question
// that keeps them apart -- does the physics module contain shader text at all -- because a shell is a vertex stage
// written out in both languages and a look that drifts back would bring one with it.
//
// SABOTAGE P, MEASURED at v4329: a shell put back into render/physicsTsl.mjs (a two-language template on an export
// named ...Shell) -> exit=1, 2 red here BY NAME, and 5 more in tools/ship/backendParity-selfcheck.mjs, whose census
// sees the markers arrive: glslBearing 145 -> 146, wgslBearing 56 -> 57, both 13 -> 14, the directive/framework
// split, and the shader-module list growing to eleven. Seven red for one function in the wrong file.
// v4331 -- AND THE COMPUTE STAGE, WHICH IS THE ONE PLACE THIS TREE'S PAIR CONTRACT DOES NOT APPLY. Every other
// transplant in this arc is held to a WGSL/GLSL pair; WebGL2 has no compute stage, so a compute pass has no pair to
// be held to and gfx/device.js says so by name. What it can still be held to is a hand-written twin and the CPU
// model, and section 4 does both.
//
// *** AND THE CLAIM IS NOT "BIT FOR BIT", BECAUSE THE SUBJECT IS A CHAOTIC MAP. *** Measured, on the same 64-element
// sweep: the generated pass and the hand-written one are bit-identical on every element whose exponent is NEGATIVE
// (22 of 22, at both sample counts), and part on the same five chaotic elements at both counts -- by 2.5e-5 after 12
// iterations and 4.5e-2 after 448. Two modules compiled separately may round a multiply-add differently, and on a
// chaotic orbit that one ulp is the whole difference by the end; the growth rate IS the Lyapunov exponent this pass
// computes. So the gate asserts bits where bits are meaningful, measures the divergence where they are not, and
// claims no bound at all against the CPU's f64 on the chaotic elements -- a tolerance wide enough to cover that
// would assert nothing.
//
// v4336 -- AND A PASS THAT READS ONE (section 5). Every real compute pass in render/gpuDriven.mjs reads buffers as
// well as writing them; until now this transplant had only ever written. The shell is where READ-ONLY is stated,
// because three declares every buffer it touches as read_write whether the graph writes to it or not, and the
// transplant matches a generated buffer to a shell entry BY ROLE -- which one the body assigns to -- rather than by
// the order three emitted them in. Two dispatches on one frame's encoder, the second bound to the first's buffer,
// and the mask it writes is the sign of the sweep's own output on all 64 elements. The keyed part: every element the
// mask calls periodic above r = 3.8 lies inside [1 + sqrt(8), 3.857] -- the period-3 window, whose edge this tree
// owns exactly.
//
// v4337 -- AND AN ATOMIC ONE (section 6). render/gpuDriven.mjs's cull pass counts survivors into an indirect draw's
// instanceCount, which every invocation may increment at once; nothing transplanted here had ever done that. A shell
// entry may now say `atomic: true`, and the pair must agree -- three writes atomicAdd(&buf.value[i], ...) and WGSL
// takes that pointer only into an atomic<T>, so a shell that forgot is refused by name rather than by the compiler.
// The counter is also a WRITTEN buffer that nothing assigns to, so the role detector looks for the atomic call too.
//
// *** AND THE ATOMIC IS MEASURED, NOT ASSUMED. *** The same transplanted module with the atomic taken out by hand --
// a plain read-modify-write on a plain u32 -- compiles, runs, and counts 156 to 171 where the truth is 670: 74% to
// 77% of the increments lost to contention across sixteen workgroups, and a DIFFERENT wrong number every run. The
// atomic version reads 670 exactly, five times. That is why this section runs at 1024 elements and not at 64: at one
// workgroup there is nothing to lose and a plain add would have passed.
//
// *** AND A REGEX INSIDE THIS FILE'S BROWSER SCRIPT LOSES ITS BACKSLASHES TWICE. *** The script is a template
// literal, so /atomicAdd\(/ arrives at RegExp as atomicAdd(s*...) and matches nothing. Two attempts at the
// non-atomic variant replaced NOTHING, leaving an atomicAdd on a plain u32 -- caught only because the device refused
// the module by name. The replacement is done by index and plain string now, with no pattern to escape.
//
// v4338 -- AND WORKGROUP-SHARED MEMORY (section 7). The same count again, reduced the way a real reduction is: each
// lane writes its 1 or 0 into an array the workgroup shares, the group waits at a barrier, and lane 0 contributes ONE
// atomic increment for all 64 -- sixteen atomics for 1024 elements instead of one per positive element. three emits
// BOTH halves, a var<workgroup> declaration above the entry and a workgroupBarrier() in the body, and the declaration
// lives in a "// locals" section this transplant used to drop on the floor. The shell declares the array (name,
// element, length), the transplant renames three's WorkgroupArray_NNN to it, and a mismatch is refused by name.
//
// *** THE BARRIER IS LOAD-BEARING AND THAT IS MEASURED, NOT CITED. *** The same module with workgroupBarrier()
// removed reads 40 against a truth of 670, every run: lane 0 sums the shared array before the other 63 have written
// into it. If that check ever goes GREEN on other hardware it is a finding, not a fix -- WGSL guarantees nothing
// there without the barrier, and the answer is to record where it stopped being observable.
//
// v4339 -- AND AN INDIRECT DISPATCH (section 8), which took a gfx/device.js change first: it has always had
// drawIndexedIndirect, so the GPU could decide how many INSTANCES to draw, and the number of INVOCATIONS was still a
// JavaScript number. pass.dispatchIndirect(pipeline, buffer, byteOffset) reads three u32 -- workgroupsX, Y, Z -- when
// the command runs. Measured: the sweep writes 1024 exponents, the tally counts 670 of them atomically, a one-lane
// sizer divides that by the workgroup size into an indirect buffer, and the mark pass runs 704 invocations (11 x 64)
// without anything coming back to the CPU. Seed the same buffer with 64 or 200 instead and the same encoded command
// runs 64 or 256 invocations. That is every shape render/gpuDriven.mjs's cull pass has.
//
// *** AND THE SHELL OWNS THE DECLARATIONS, WHICH IS WHAT MAKES THE READ-ONLY VIEW POSSIBLE. *** three declares the
// tally as atomic<u32> in the SIZER's module too, because the flag lives on the node rather than on the use. The
// shell declares it a plain read-only u32 there, and the device runs it: one buffer, two views.
//
// v4361 -- AND THE THING ALL EIGHT SECTIONS WERE FOR: THE FLEET'S OWN CULL DECISION, GENERATED (section 9).
// render/gpuDriven.mjs cullLod() is what every draw in the GPU-driven scene passes through -- six frustum-plane
// tests, a distance to the eye, an angular-size metric and a threshold ladder that returns a LOD or -1. It is now a
// TSL graph (physicsTsl makeCullLodTsl), transplanted into a device compute module, and it decides what the SHIPPED
// pass decides for all 768 instances of the probe's own scene: same LOD on every one, and the metric identical to
// the last bit. Not a tolerance -- 0.
//
// AND THE DECISION IS NOT TWO CONSTANTS AGREEING: 216 of the 768 are rejected by the frustum and the survivors land
// 96 / 246 / 210 across the three LODs, so the two passes agree while disagreeing about individual instances 768
// different ways.
//
// *** WHAT IS STILL HAND-WRITTEN, SAID HERE RATHER THAN LEFT TO BE NOTICED. *** The other half of cullLodWgsl is the
// bookkeeping: an atomicAdd into array<Cmd> -- a STRUCT of five fields, one of them atomic -- and three vec4s per
// survivor at a region-major offset. computeShell declares array<T> for a scalar or vector T and has no struct
// element, so that half is not transplantable yet. Two smaller differences, both deliberate and both in the shell:
// the six planes arrive in a storage buffer rather than the `array<vec4<f32>, 6>` field of struct Cull (a fixed-size
// array field is a shell feature this round did not build), and the plane loop sets a flag over all six instead of
// returning on the first rejection. Same verdict; the flag reads as arithmetic, which is what a graph is.
//
// SABOTAGES, MEASURED at v4331:
//   S  three's `enable subgroups;` and its @builtin(subgroup_size) left in the transplant -> exit=1, 6 red: the device
//      refuses the module (12 uncaptured errors) and the storage buffer comes back zero on every element. three's own
//      renderer asks the adapter for that feature; gfx/device.js never did, and nothing but this drop bridges them.
//   T  the storage rename skipped, so the module keeps three's generated NodeBuffer_NNN -> exit=1, 6 red: the CPU line
//      by name, and on the device a buffer nothing is bound to, so every element reads zero.
//   MEASURED at v4336 (a pass that reads one):
//   U  the storage buffers mapped by ORDER instead of by role -> exit=1, 2 red: the mask pass writes into the buffer it was
//      meant to read (6 device errors, a read-only binding assigned to), every element reads periodic, and the period-3
//      claim goes with it. *** THIS SABOTAGE WENT 0 RED ON ITS FIRST RUN AND THAT WAS THE FINDING. *** The shell listed
//      the WRITTEN buffer first, which is the order three happened to emit, so position and role agreed and the check
//      proved nothing. The shell now declares its input first -- the order render/gpuDriven.mjs's own cull pass uses --
//      and the claim beside it says "measured as sabotage U" rather than asserting what a positional mapping would do.
//   V  the second pass reading its OWN buffer instead of the first's (a one-word typo) -> exit=1, 1 red, refused by name
//      before the device sees it: the graph then touches one buffer and the shell names two.
//   MEASURED at v4337 (the atomic):
//   W  the atomic-declaration guard removed from transplantCompute -> exit=1, 1 red: both refusals stop happening, and what
//      would have been caught by name is left for the device's WGSL parser to reject at pipeline creation instead.
//   X  the tally graph built without .toAtomic() and counting with a plain add -> exit=1, 1 red, refused by name before the
//      device sees it ("the shell declares tally atomic and the pass never touches it atomically").
//   MEASURED at v4338 (workgroup-shared memory):
//   Y  the shell's var<workgroup> declaration left out of its prefix -> exit=1, 4 red: the module names an array nothing
//      declares, the device refuses it, the total reads 0, and render/wgslSpec.mjs's scanner finds nothing to read.
//   MEASURED at v4339 (the indirect dispatch):
//   AA dispatchIndirect() dispatching a fixed 1x1x1 instead of reading the buffer -> exit=1, 2 red: 64 invocations where the
//      buffer said 704, and the seeded runs stop moving with it. The two claims that say the BUFFER decides are the two that go.
//   MEASURED at v4361 (the cull decision):
//   AC the plane loop shortened to five planes -> exit=1, 2 red: the module no longer carries the six-plane loop, and the
//      verdicts part on the instances the sixth plane was the one to reject.
//   AD the ladder's comparison inverted (metric > threshold instead of <) -> exit=1, 2 red: 216 of 768 LODs still agree --
//      exactly the culled ones, which never reach the ladder -- and every drawn instance takes the wrong LOD.
//   AND A BUG IN THE GATE ITSELF, FOUND BY ITS OWN FIRST RUN: 552 of 768 agreed and the 216 that did not were exactly the
//      culled ones. frustumPlanes() returns 24 FLOATS, not six vec4 arrays, so `planeF.set(planes[p], p * 4)` filled the
//      plane buffer with nothing. The graph was right; the harness feeding it was wrong, and the shape of the disagreement
//      (only the frustum-dependent verdicts) is what named it.
//   MEASURED at v4364 (the fleets variant, and the frustum in a uniform):
//   AJ the fleet index taken as given instead of clamped to the fleet count -> exit=1, 2 red: the 110 instances asking for
//      fleet 7 against a count of 2 aim at region 21 and up, which is off the end of a six-region buffer, and the device
//      folds those atomicAdds into the last region -- 129 becomes 193 and the total is still 552, so the ONLY thing that
//      says anything went wrong is the comparison with the shipped pass. A clamp is not defensive here; it is the answer.
//   AK the uniform array's element-and-length agreement not checked -> exit=1, 1 red: a shell declaring array<vec4<f32>, 5>
//      for a graph that reads six stops being refused, and what it costs is a uniform buffer read past its own end.
//   AL the uniform array left out of the shell's prefix -> exit=1, 1 red, and gfx/device.js is what says so: "the shader
//      declares no storage or uniform binding named planes". The module names it, nothing declares it, and the refusal
//      arrives by name from the device rather than from a WGSL compiler diagnostic.
//   MEASURED at v4370 (the HMC leapfrog, against a kernel that already ships):
//   AM the gradient DISTRIBUTED in the graph -- i00*qx - i00*mu0 for i00*(qx - mu0) -- which is the same algebra and a
//      different rounding -> exit=1, 2 red, and the SHAPE is the argument for the whole section: 41 of 256 endpoints are
//      still bit-exact, the worst gap is 1.192e-6, and that is 21x INSIDE hmcGpu's own 2.5e-5 floor and 42x inside its
//      tolerance. A tolerance check passes this sabotage. "0" does not, and that is the only reason it is stated as 0.
//   AN the pre-loop gradient dropped, so the first half-kick uses a zero gradient -> exit=1, 2 red: 0 of 256 exact and the
//      worst relative gap 6.998e-1, four orders past the tolerance. The leapfrog's g is carried INTO the loop from before
//      it, which is a fact about the algorithm rather than about the transplant, and the shipped kernel is what says so.
//   AO the read/write-count agreement removed from transplantCompute -> exit=1, 1 red -- and what it costs is visible in
//      the message: an all-read_write shell stops being refused by name and instead throws "Cannot read properties of
//      undefined (reading 'name')" from deeper in the mapping. The guard does not prevent a broken module here; it
//      prevents a broken module being reported as an internal crash.
//   MEASURED at v4363 (the struct element, and the whole pass):
//   AE the struct-layout agreement dropped, so the shell's struct is taken on trust rather than held to the graph's ->
//      exit=1, 1 red: a field renamed in the shell stops being refused, and what it would then cost is not a compile error
//      but the CPU writing one layout while the module reads another, at the same binding, silently.
//   AF the by-name buffer mapping removed, everything back to role and order -> exit=1, 2 red, and the shape is the point:
//      the pass DRAWS NOTHING (0/0/0 against 96/246/210) because the frustum test is reading the per-instance extras
//      buffer. Two array<vec4<f32>> with nothing but position to tell them apart, and three orders them by first use.
//   AH the record offset with its region term dropped ((slot)*3 for (region*cap + slot)*3) -> exit=1, 2 red, and this is
//      the one that separates the two halves of the bookkeeping: the per-region COUNTS stay exactly right (96/246/210,
//      the atomicAdd is untouched) and all 552 records differ, because three regions now write over each other from slot 0.
//   AB the "usage must include indirect" guard removed -> exit=1, 2 red -- BUT IT WENT 0 RED FIRST, the second sabotage in
//      three rounds to prove a check nobody was exercising. The gate only ever passed a correctly-made buffer, so the guard
//      was unreachable; a check that hands it a plain storage buffer was added, and only then did removing it cost anything.
//   Z  the rename of three's WorkgroupArray_NNN skipped -> exit=1, 3 red: the shell declares "lane", the body still names the
//      generated identifier, and the device refuses that too. The generated name binds to nothing, so this one is about the
//      module being readable and stable rather than about it working -- but it does not work either, which settles it.
// v4363 -- AND THE PASS ITSELF, BOOKKEEPING AND ALL (section 10). computeShell gained a STRUCT element: a storage entry
// may give `struct: { name, fields: [{ name, type, atomic }] }`, the shell declares that struct, and the atomic lives on a
// FIELD rather than on the buffer -- which is what array<Cmd> needs and what stood between section 9's decision and the
// whole of render/gpuDriven.mjs cullLodWgsl(). physicsTsl makeCullPassTsl is that pass as nodes: the count guard, the
// day-t clock gate, the frustum, the ladder, an atomicAdd into the region's indirect draw command and three vec4s per
// survivor at a region-major offset. Measured against the SHIPPED text on one scene: the same per-region counts
// (96/246/210 of 768) and every one of the 552 survivor records identical to the float, then again with the clock gate on
// (58/135/122, 237 bodies not yet vendored on day 3). The four non-atomic Cmd fields the CPU seeded come back untouched,
// which is where a wrong struct layout would have shown -- the atomicAdd landing on indexCount instead.
//
// *** AND THE BUFFER MAPPING CHANGED, BECAUSE THIS PASS BROKE THE OLD ONE. *** three declares its storage buffers in the
// order the BODY FIRST USES them, not the order the graph created them: this pass reads extras before planes, so the
// role-and-order mapping v4336 introduced crossed the frustum buffer with the per-instance one -- two array<vec4<f32>>
// with nothing else to tell them apart. A TSL storage node that is .label()ed is emitted under that name, so the graph
// names its buffers and the transplant maps by name, with the roles still checked. Measured, not argued: the same module
// with its labels stripped draws NOTHING -- 0/0/0 against 96/246/210 -- because the frustum test is reading the extras.
// v4364 -- AND THE FLEETS VARIANT, WITH THE FRUSTUM IN A UNIFORM (section 11). cullLodWgsl({ fleets: true }) is the
// configuration the orrery actually runs: a per-instance fleet index in its own array<u32>, clamped to the fleet count
// the uniforms carry, and a region that is fleet * lodCount + lod rather than lod alone. Generated and held to the
// shipped text over two fleets and three LODs: the same instance count in every one of the six regions
// (38/103/81/58/143/129) and all 552 records identical to the float. The 110 instances that ask for fleet 7 against a
// count of 2 land in fleet 1 in both passes -- and THAT is only visible in the records: with the clamp dropped the six
// counts still summed to 552 because the device folded the out-of-range increments into the last region.
//
// AND ONE FINDING FROM THE BUILD, WHICH IS THE SAME LESSON TWICE: the first run agreed on all six per-region COUNTS and
// differed on 330 of 552 RECORDS, because the graph wrote a constant 0 into the record's fleet field where the shipped
// pass writes the clamped fleet. Counts are a weaker claim than records, and this round has now been saved by the
// stronger one twice in a row.
//
// computeShell also gained `uniformArrays`: a uniform whose element is a FIXED-SIZE array, which is the type struct
// Cull gives its six planes and what a storage buffer stood in for. three emits a TSL uniformArray as its own uniform
// BINDING rather than as a member of the scalar struct, so struct Cull is still two bindings here and that is said
// rather than glossed -- but it is the same 40 floats: packCullUniforms lays the planes out first and the four vec4s
// after, so the gate slices ONE packing to drive both passes instead of packing a second copy. The graph is unmoved by
// the change: the two transplants' bodies are the same text, because planes.element(i) is one node either way.
// v4370 -- AND A KERNEL THAT ALREADY SHIPS, HELD TO BIT FOR BIT (section 12). Every transplant before this one was
// graded against a twin written in this tree for the purpose, or against a picture. tools/roundhouse/hmcGpu.mjs's
// WGSL_HMC is neither: it is the batch leapfrog the swek-hmc-bench fleet job runs on real hardware, it predates this
// arc by a thousand versions, and it carries its own CPU mirror at f32 (Math.fround after every op) and the FLOOR that
// mirror measured. physicsTsl makeHmcLeapfrogTsl is that kernel as nodes. Measured on WebGPU: BIT-IDENTICAL to the
// shipped kernel on all 256 endpoint values -- 0, not a tolerance -- and both inside 1.371e-6 of the f32 mirror,
// against a floor of 2.5e-5 earned for real devices.
//
// *** AND THE ROUND'S OWN FIRST CLAIM ABOUT WHAT THAT IS WORTH WAS WRONG, WHICH THE GATE MEASURED RATHER THAN REVIEWED.
// *** physicsTsl's header said writing the kick as 0.5*(eps*g) instead of (0.5*eps)*g would be algebraically identical
// and NOT bit-identical. Run, it is bit-identical on every one of the 256: 0.5 is a power of two, that multiply is
// exact, and re-association across it cannot lose anything. The rule is right and the example was not. So the section
// carries a re-association that IS observable beside it -- the gradient distributed, i00*qx - i00*mu0 for
// i00*(qx - mu0), which moves 215 of 256 endpoints -- and pins BOTH numbers instead of the rule of thumb.
//
// *** THE STRONGER CLAIM IS DOING WORK A TOLERANCE WOULD NOT. *** That distributed rewrite is off by 1.192e-6: 21x
// inside hmcGpu's own floor and 42x inside the tolerance a real device is graded against. Every tolerance in this tree
// would pass it. The bit claim is the only thing here that does not, and the section says so with the number.
//
// NOT CLAIMED: the kernel's full signature. L and n are uniforms in WGSL_HMC and baked constants in the graph, because
// a TSL Loop wants a JavaScript bound -- lyapunovNodes set that precedent at v4321 with samples and warmup. This is
// the kernel's ARITHMETIC at the fixture's own L, with the shipped pass fed the same L through its uniform.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { LN2, PERIOD3, LY_DEFAULTS, truePeak, etaStandard, PARAMS, lyapunovSweepCpu } from "../../render/physicsTsl.mjs";
import { computeShell, transplantCompute } from "../../render/tslSource.mjs";
import { lyapunovComputeWgsl } from "../../render/lyapunovWgsl.mjs";
import { validateWgsl, parseBindings } from "../../render/wgslSpec.mjs";
import { cullLodWgsl } from "../../render/gpuDriven.mjs";
import { WGSL_HMC, HMC_FIXTURE, F32_FLOOR_HMC, HMC_TOL, fixtureInv, makeBatch, leapfrogF32 } from "../roundhouse/hmcGpu.mjs";
import { keyCpu } from "../../render/heidlerWgsl.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const EMITTED = path.join(ENG, "tools/ship/tsl-emitted-physics.json");
const EMITTED_C = path.join(ENG, "tools/ship/tsl-emitted-compute.json");   // v4331 -- the compute pass, for the corpus
const FIXC = JSON.parse(fs.readFileSync(path.join(ENG, "tools/ship/tslCompute-fixture.json"), "utf8")).wgsl;
const throwsWith = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const median = (a) => { const s = Array.from(a).sort((x, y) => x - y); return s[s.length >> 1]; };

console.log("\n1. THE KEYS, FROM THE MODULES THE GATE TRUSTS: ln 2, the true eta and the published one, the period-3 window");
const k = keyCpu(PARAMS.first);
{
    const src = fs.readFileSync(path.join(ENG, "render/physicsTsl.mjs"), "utf8");
    ok("the Heidler twin says the peak over i0 is 1 at the true eta and 1.0667 at the published eta (the module's finding, not the shader's)", k.atTrueEta === 1 && Math.abs(k.atStandardEta - 1.0667) < 1e-3, `${k.atTrueEta}, ${k.atStandardEta.toFixed(4)}; true eta ${k.trueEta.toFixed(5)}, standard ${k.standard.toFixed(5)}`);
    ok("the TSL modules take their constants from the modules (imported DEFAULTS, PARAMS, LN2), and the Lyapunov log has its 2", /import \{ LN2, DEFAULTS as LY_DEFAULTS, PERIOD3[^}]*\} from "\.\/lyapunovWgsl\.mjs"/.test(src) && /x\.mul\(2\.0\)/.test(src) && /r\.mul\(x\)\.mul\(float\(1\.0\)\.sub\(x\)\)/.test(src) && /t\.div\(t1\)\.mul\(t\.div\(t1\)\)/.test(src) && !/\b3\.4\b|\b0\.05\b|\b485\b/.test(src.replace(/\/\/.*$/gm, "")));   // v4329: the look sections that carried the LOOK's own literals (0.05, 0.9: the seed span) left with them, so the whole file is the window now
    // v4329 -- the LOOKS moved to render/fleetTsl.mjs, so the count that was 12 in one file is 10 here and 8 there.
    // Counted in BOTH rather than dropped to ten: an unlabelled uniform is a transplant that refuses by name, and
    // the looks are exactly where that now bites. Two of the fleet labels are .label(name) -- a texture's binding
    // name passed in -- so the fleet count is of .label( and the key count of .label(" .
    const fleetSrc = fs.readFileSync(path.join(ENG, "render/fleetTsl.mjs"), "utf8");
    // *** v4329 -- THE SPLIT, MADE CHECKABLE RATHER THAN ANNOUNCED. *** This module was named for physics and had
    // grown three fleet SHELLS and five looks; the shells are vertex stages written out in both languages, so the
    // question "is a look back in the physics module" has an exact answer: does this file contain shader text at
    // all. It must not, and fleetTsl.mjs must. The markers are assembled at run time for the reason
    // render/backendParity.mjs's header gives and this session has now relearned twelve times: a file that spells
    // a marker becomes a file the census counts.
    const WGSL_TELL = new RegExp("@" + "vertex"), GLSL_TELL = new RegExp("#" + "version 300 es");
    ok("*** the split holds: the PHYSICS module carries no shader text at all, and the FLEET module carries both languages ***",
        !WGSL_TELL.test(src) && !GLSL_TELL.test(src) && WGSL_TELL.test(fleetSrc) && GLSL_TELL.test(fleetSrc),
        `physics wgsl ${WGSL_TELL.test(src)} glsl ${GLSL_TELL.test(src)}; fleet wgsl ${WGSL_TELL.test(fleetSrc)} glsl ${GLSL_TELL.test(fleetSrc)}`);
    ok("  ...and it exports no shell and no look, which is the same statement said in names", !/export function \w*(Shell|Look\w*Tsl)\b/.test(src) && /export function \w+Shell\b/.test(fleetSrc));
    ok("  the uniforms AND the storage buffers are labelled (render/tslSource.mjs binds by the label): the two keys' ten, the compute sweep's span, the cull decision's two, and the cull PASS's four uniforms and five named buffers, and the HMC leapfrog's two here; the fleet looks' eight in render/fleetTsl.mjs", (src.match(/\.label\("/g) || []).length === 26 && (fleetSrc.match(/\.label\(/g) || []).length === 8, `${(src.match(/\.label\("/g) || []).length} physics (ten keys, the sweep's span, the decision's eye and thresholds, the pass's eye/thresholds/info/clock and inst/extras/cmds/records/fleetOf with planes labelled on BOTH of its two bindings, plus the leapfrog's sinv and mu), ${(fleetSrc.match(/\.label\(/g) || []).length} fleet`);
}

const skip = webgpuSkipReason();
console.log("\n2. THROUGH THREE, ON BOTH BACKENDS: the exponent's key, the window, and the lightning's two peaks, read off pictures");
console.log("\n3. THROUGH gfx/device.js, TRANSPLANTED: the same keys from the fragments three generated");
let R = null;
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N: 128, W: 256, LO: PERIOD3.lo, HI: PERIOD3.hi, rLo: LY_DEFAULTS.rLo, rHi: LY_DEFAULTS.rHi, eStd: etaStandard(PARAMS.first.t1, PARAMS.first.t2), eTrue: truePeak(PARAMS.first.t1, PARAMS.first.t2).peak, first: PARAMS.first }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js"); const P = await import("/render/physicsTsl.mjs"); const S = await import("/render/tslSource.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const out = { three: {}, device: {}, emitted: {} };
        const colMedians = (px, W, H, dec) => { const cols = []; for (let x = 0; x < W; x++) { const c = []; for (let y = 0; y < H; y++) c.push(dec(px, (y * W + x) * 4)); c.sort((p, q) => p - q); cols.push(c[c.length >> 1]); } return cols; };
        const maxOf = (px, n, dec) => { let m = -1; for (let i = 0; i < n; i++) m = Math.max(m, dec(px, i * 4)); return m; };
        const emitted = { lyapunov: {}, heidler: {} };
        for (const mode of ["webgpu", "webgl2"]) {
            const o = {};
            try {
                const canvas = document.createElement("canvas"); canvas.width = a.W; canvas.height = a.N;
                const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
                const errs = []; const gd = renderer.backend.device; if (gd && gd.addEventListener) gd.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
                const rt = new THREE.RenderTarget(a.W, a.N, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
                const draw = async (kit) => { renderer.setRenderTarget(rt); for (let i = 0; i < 2; i++) await renderer.renderAsync(kit.scene, kit.camera); return renderer.readRenderTargetPixelsAsync(rt, 0, 0, a.W, a.N); };
                // lyapunov at r = 4: every pixel the key; then the sweep
                const ly4 = P.makeLyapunovKeyTsl(THREE, T, { rLo: 4, rHi: 4 }); const p4 = await draw(ly4);
                const lams = []; for (let i = 0; i < a.W * a.N; i++) lams.push(P.decodeLyapunov(p4, i * 4)); lams.sort((p, q) => p - q); o.lyMedian = lams[lams.length >> 1];
                const lySweep = P.makeLyapunovKeyTsl(THREE, T, {}); const ps = await draw(lySweep); o.lyCols = colMedians(ps, a.W, a.N, P.decodeLyapunov);
                emitted.lyapunov[mode] = (await S.emitShaders(renderer, { scene: lySweep.scene, camera: lySweep.camera, mesh: lySweep.scene.children[0] })).fragment;
                // heidler at the true eta and the standard one
                const hT = P.makeHeidlerKeyTsl(THREE, T, {}); const pT = await draw(hT); o.heidlerTrue = maxOf(pT, a.W * a.N, P.decodeHeidler);
                const hS = P.makeHeidlerKeyTsl(THREE, T, { eta: a.eStd }); const pS = await draw(hS); o.heidlerStd = maxOf(pS, a.W * a.N, P.decodeHeidler);
                emitted.heidler[mode] = (await S.emitShaders(renderer, { scene: hT.scene, camera: hT.camera, mesh: hT.scene.children[0] })).fragment;
                o.errs = errs; o.backend = renderer.backend.isWebGPUBackend ? "webgpu" : "webgl2";
            } catch (e) { o.error = String(e && e.message || e).slice(0, 300); }
            out.three[mode] = o;
        }
        // the transplant into gfx/device.js
        let descLy, descH; try { descLy = S.devicePipelineFromTsl({ wgsl: emitted.lyapunov.webgpu, glsl: emitted.lyapunov.webgl2 }); descH = S.devicePipelineFromTsl({ wgsl: emitted.heidler.webgpu, glsl: emitted.heidler.webgl2 }); } catch (e) { out.transplantError = String(e && e.message || e).slice(0, 300); return out; }
        out.emitted = { lyapunov: { wgsl: emitted.lyapunov.webgpu, glsl: emitted.lyapunov.webgl2, transplanted: { wgsl: descLy.shaders.wgsl, glsl: descLy.shaders.glsl.fragment } }, heidler: { wgsl: emitted.heidler.webgpu, glsl: emitted.heidler.webgl2, transplanted: { wgsl: descH.shaders.wgsl, glsl: descH.shaders.glsl.fragment } } };
        out.uniforms = { lyapunov: descLy.uniforms.map((u) => u.name), heidler: descH.uniforms.map((u) => u.name) };
        for (const backend of ["webgpu", "webgl2"]) {
            const o = {};
            try {
                const cv = document.createElement("canvas"); cv.width = a.W; cv.height = a.N;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const draw = (pd, bind) => dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); pass.use(dev.pipeline(pd)); bind(pass); pass.draw(3); }, { read: true, depth: false });
                const ly4 = (await draw(descLy, (pass) => { pass.uniform("rLo", 4); pass.uniform("rHi", 4); pass.uniform("seedLo", 0.05); pass.uniform("seedHi", 0.95); })).pixels;
                const lams = []; for (let i = 0; i < a.W * a.N; i++) lams.push(P.decodeLyapunov(ly4, i * 4)); lams.sort((p, q) => p - q); o.lyMedian = lams[lams.length >> 1];
                const sweep = (await draw(descLy, (pass) => { pass.uniform("rLo", a.rLo); pass.uniform("rHi", a.rHi); pass.uniform("seedLo", 0.05); pass.uniform("seedHi", 0.95); })).pixels; o.lyCols = colMedians(sweep, a.W, a.N, P.decodeLyapunov);
                const bindH = (eta) => (pass) => { pass.uniform("i0", a.first.i0); pass.uniform("t1", a.first.t1); pass.uniform("t2", a.first.t2); pass.uniform("eta", eta); pass.uniform("tLo", a.first.t1 / 50); pass.uniform("tHi", a.first.t2 * 8); };
                o.heidlerTrue = maxOf((await draw(descH, bindH(a.eTrue))).pixels, a.W * a.N, P.decodeHeidler); o.heidlerStd = maxOf((await draw(descH, bindH(a.eStd))).pixels, a.W * a.N, P.decodeHeidler); o.backend = dev.backend;
            } catch (e) { o.error = String(e && e.message || e).slice(0, 300); }
            out.device[backend] = o;
        }
        return out;
    }` });
    ok("the harness ran (three on both backends, then the device on both)", r.ok && r.result && r.result.three.webgpu && r.result.three.webgl2 && !r.result.three.webgpu.error && !r.result.three.webgl2.error && !r.result.transplantError, r.ok ? (r.result.transplantError || JSON.stringify([r.result.three.webgpu && r.result.three.webgpu.error, r.result.three.webgl2 && r.result.three.webgl2.error])) : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result.three.webgpu && !r.result.transplantError) {
        R = r.result;
        const grade = (o, via, b) => {
            if (!o || o.error) { ok(`${via} ${b} ran`, false, o && o.error); return; }
            ok(`*** ${via} ${b}: the Lyapunov key at r = 4 decodes to ln 2 over the whole picture, median within 2e-3 ***`, Math.abs(o.lyMedian - LN2) < 2e-3, `median ${o.lyMedian.toFixed(6)}, |err| ${Math.abs(o.lyMedian - LN2).toExponential(2)}`);
            const colR = (x) => LY_DEFAULTS.rLo + (x + 0.5) / o.lyCols.length * (LY_DEFAULTS.rHi - LY_DEFAULTS.rLo);
            const win = o.lyCols.filter((_, x) => colR(x) > PERIOD3.lo + 0.004 && colR(x) < PERIOD3.hi - 0.004), hot = o.lyCols.filter((_, x) => colR(x) > 3.95);
            ok(`  ${via} ${b}: the period-3 window is dark (negative median, most columns) and r near 4 bright`, win.length >= 2 && median(win) < 0 && win.filter((v) => v < 0).length >= win.length * 0.6 && median(hot) > 0.4, `window median ${median(win).toFixed(3)} over ${win.length} columns; near 4 ${median(hot).toFixed(3)}`);
            ok(`*** ${via} ${b}: the lightning's peak over i0 reads 1 at the true eta (1e-4) and 1.0667 at the published one (1e-3) ***`, Math.abs(o.heidlerTrue - 1) < 1e-4 && Math.abs(o.heidlerStd - 1.0667) < 1e-3, `${o.heidlerTrue.toFixed(5)}, ${o.heidlerStd.toFixed(4)}`);
        };
        for (const b of ["webgpu", "webgl2"]) grade(R.three[b], "three's TSL path,", b);
        ok("the emitted fragments transplant (labelled uniforms in three's order: the Lyapunov key's four, the Heidler key's six)", R.uniforms && R.uniforms.lyapunov.slice().sort().join() === "rHi,rLo,seedHi,seedLo" && R.uniforms.heidler.slice().sort().join() === "eta,i0,t1,t2,tHi,tLo", JSON.stringify(R.uniforms));
        for (const b of ["webgpu", "webgl2"]) grade(R.device[b], "the device, transplanted,", b);
        const rec = { at: "v4321", three: "0.178.0", note: "emitted by three's node builders from render/physicsTsl.mjs and transplanted by render/tslSource.mjs; rewritten by tools/ship/tslPhysics-selfcheck.mjs on every run", ...R.emitted };
        fs.writeFileSync(EMITTED, JSON.stringify(rec, null, 1));
        ok("the emitted pairs are written to tools/ship/tsl-emitted-physics.json for the WGSL corpus", fs.existsSync(EMITTED));
        report(`three's TSL path and the transplanted device path agree on ln 2 to ${Math.abs(R.three.webgpu.lyMedian - R.device.webgpu.lyMedian).toExponential(1)} on WebGPU and ${Math.abs(R.three.webgl2.lyMedian - R.device.webgl2.lyMedian).toExponential(1)} on WebGL2`);
    }
}

console.log("\n4. THE COMPUTE STAGE (v4331): the exponent as a TSL COMPUTE pass, transplanted into a gfx/device.js compute pipeline");
{
    const shell = computeShell({ storage: [{ name: "out", element: "f32" }], uniforms: [{ name: "span", type: "vec4" }] });
    ok("the shell declares the storage buffer the device will bind by name, and the uniform struct after it", /var<storage, read_write> out: outBuf;/.test(shell.prefix) && /var<uniform> u: uStruct;/.test(shell.prefix) && parseBindings(shell.prefix + "\n").length === 2, shell.prefix.replace(/\n/g, " | "));
    const twin = lyapunovComputeWgsl({ prefix: shell.prefix, warmup: LY_DEFAULTS.warmup, samples: LY_DEFAULTS.samples });
    ok("  the hand-written twin is the module's own lyapunov() in that shell, and it validates", validateWgsl(twin).length === 0 && /fn lyapunov\(r: f32/.test(twin), validateWgsl(twin).join("; "));
    // the marker is assembled, for the reason render/backendParity.mjs's header gives and this session has relearned twelve times
    const notCompute = "// Three.js r178 - Node System\n@" + "fragment fn main() -> @location(0) vec4<f32> { return vec4<f32>(0.0); }";
    ok("REFUSED: a fragment handed to the compute transplant, and a graph whose storage count the shell does not name", throwsWith(() => transplantCompute(notCompute, shell), /has no compute entry point/) && throwsWith(() => transplantCompute(FIXC, computeShell({ storage: [], uniforms: [{ name: "span", type: "vec4" }] })), /touches 1 storage buffer\(s\) and the shell "compute" names 0/));
    ok("REFUSED: a uniform the shell's struct lacks, and a workgroup size the shell disagrees with", throwsWith(() => transplantCompute(FIXC, computeShell({ storage: [{ name: "out", element: "f32" }], uniforms: [] })), /is not in the shell "compute"'s struct \(none\)/) && throwsWith(() => transplantCompute(FIXC, computeShell({ storage: [{ name: "out", element: "f32" }], uniforms: [{ name: "span", type: "vec4" }], workgroupSize: 32 })), /@workgroup_size\(64\) and the shell "compute" says 32/));
    const t = transplantCompute(FIXC, shell);
    ok("*** three asks for an extension the device never requested -- `enable subgroups;` and a @builtin(subgroup_size) it does not use -- and the transplant drops both ***", !/enable subgroups/.test(t.wgsl) && !/subgroup_size/.test(t.wgsl) && /enable subgroups/.test(FIXC), "left in, the device refuses the module: measured as sabotage S");
    ok("  and the generated pass is the shell's own buffer and struct, with nothing of three's naming left", /out\.value\[ instanceIndex \]/.test(t.wgsl) && /u\.span\.x/.test(t.wgsl) && !/NodeBuffer_|object\./.test(t.wgsl) && validateWgsl(t.wgsl).length === 0, validateWgsl(t.wgsl).join("; "));
}
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const N = 64;
    const cpu = lyapunovSweepCpu({ count: N, seed: 0.4 });
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const P = await import("/render/physicsTsl.mjs"); const S = await import("/render/tslSource.mjs"); const L = await import("/render/lyapunovWgsl.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const out = {};
        const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
        const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: false, antialias: false }); await renderer.init();
        out.threeBackend = renderer.backend.isWebGPUBackend ? "webgpu" : "webgl2";
        // TWO configurations, and the second is the point: SHORT (the map has not had time to separate) and FULL.
        const mk = async (opts) => { const g = P.makeLyapunovComputeTsl(T, { count: a.N, seed: 0.4, ...opts }); await renderer.computeAsync(g.node);
            return { g, emitted: renderer._nodes.getForCompute(g.node).computeShader, three: [...new Float32Array(await renderer.getArrayBufferAsync(g.buffer.value))] }; };
        const full = await mk({}), short = await mk({ samples: 8, warmup: 4 });
        const g = full.g, emitted = full.emitted;
        out.emitted = emitted; out.threeValues = full.three;
        try {
            const cv = document.createElement("canvas"); cv.width = 32; cv.height = 32; const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
            out.deviceBackend = dev.backend;
            const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
            const shell = S.computeShell({ storage: [{ name: "out", element: "f32" }], uniforms: [{ name: "span", type: "vec4" }] });
            const gen = S.transplantCompute(emitted, shell);
            out.transplanted = gen.wgsl;
            const hand = L.lyapunovComputeWgsl({ prefix: shell.prefix, warmup: g.warmup, samples: g.samples });
            // the uniform struct is a BUFFER the caller fills, the way every compute pass in render/gpuDriven.mjs binds its own
            const ubuf = dev.buffer({ data: Float32Array.from(g.knobs), usage: "uniform" });
            const run = async (wgsl) => {
                const buf = dev.buffer({ usage: ["storage"], size: a.N * 4 });
                const pipe = dev.compute({ wgsl });
                pipe.bind("out", buf).bind("u", ubuf);
                dev.frame(({ pass }) => { pass.dispatch(pipe, Math.ceil(a.N / 64)); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
                const back = new Float32Array(await dev.read(buf)); buf.destroy(); return [...back];
            };
            out.genValues = await run(gen.wgsl);
            out.handValues = await run(hand);
            // the same pair at a sample count too short for the map to separate two roundings
            const genS = S.transplantCompute(short.emitted, shell);
            const handS = L.lyapunovComputeWgsl({ prefix: shell.prefix, warmup: short.g.warmup, samples: short.g.samples });
            out.shortGen = await run(genS.wgsl); out.shortHand = await run(handS);
            out.errs = errs;
        } catch (e) { out.error = String(e && e.message || e).slice(0, 400); }
        return out;
    }` });
    ok("the harness ran three's compute and the device's", r.ok && r.result && !r.result.error && r.result.genValues && r.result.handValues, r.ok ? (r.result && r.result.error) : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result && !r.result.error) {
        const R = r.result;
        const short_it = 4 + 8, full_it = LY_DEFAULTS.warmup + LY_DEFAULTS.samples;
        const partOf = (A, B) => A.map((v, i) => i).filter((i) => A[i] !== B[i]);
        const partedShort = partOf(R.shortGen, R.shortHand), parted = partOf(R.genValues, R.handValues);
        const worstOf = (A, B, idx) => (idx.length ? Math.max(...idx.map((i) => Math.abs(A[i] - B[i]))) : 0);
        const periodic = cpu.map((v, i) => i).filter((i) => cpu[i] <= 0);
        const periodicSame = periodic.filter((i) => R.genValues[i] === R.handValues[i] && R.shortGen[i] === R.shortHand[i]).length;
        ok(`*** on the PERIODIC part of the sweep the generated compute pass and the hand-written one agree BIT FOR BIT, at both sample counts (${periodicSame} of ${periodic.length}) ***`,
            periodicSame === periodic.length && periodic.length > 10 && (R.errs || []).length === 0,
            `${periodicSame}/${periodic.length} elements whose exponent is negative; device errors ${(R.errs || []).length}`);
        // and where they part, they part on the CHAOTIC elements -- the same ones at both counts, by a difference that grows
        const sameSet = partedShort.join() === parted.join();
        const allChaotic = parted.every((i) => cpu[i] > 0) && partedShort.every((i) => cpu[i] > 0);
        ok(`*** and where they part it is the SAME ${parted.length} elements at both counts, every one of them chaotic, by a difference that grows from ${worstOf(R.shortGen, R.shortHand, partedShort).toExponential(1)} at ${short_it} iterations to ${worstOf(R.genValues, R.handValues, parted).toExponential(1)} at ${full_it} ***`,
            sameSet && allChaotic && parted.length > 0 && worstOf(R.genValues, R.handValues, parted) > 100 * worstOf(R.shortGen, R.shortHand, partedShort),
            `parted ${JSON.stringify(parted)}; same set at both counts: ${sameSet}. TWO MODULES COMPILED SEPARATELY MAY ROUND A MULTIPLY-ADD DIFFERENTLY, and on a chaotic orbit one ulp is the whole difference by the end -- which is what physics/chaos/logistic.js measures. This gate does not identify the ulp; it measures the consequence, and it does NOT claim bit equality on a chaotic map`);
        const worstCpu = Math.max(...R.genValues.map((v, i) => Math.abs(v - cpu[i])));
        const worstCpuPeriodic = Math.max(...periodic.map((i) => Math.abs(R.genValues[i] - cpu[i])));
        ok(`  and the generated pass agrees with the CPU's f64 sweep to ${worstCpuPeriodic.toExponential(2)} on the periodic elements`, worstCpuPeriodic < 1e-3,
            `f32 against f64 over ${LY_DEFAULTS.samples} logs of near-zero slopes; the bound is measured, not chosen. NO BOUND IS CLAIMED on the chaotic elements, where the worst is ${worstCpu.toExponential(2)}: a single-precision orbit and a double-precision one separate there for the same reason the two GPU passes do, and a tolerance wide enough to cover it would assert nothing`);
        const atFour = R.genValues[R.genValues.length - 1], cpuFour = cpu[cpu.length - 1];
        ok(`  and r = 4 reads ${atFour.toFixed(6)} against the CPU's ${cpuFour.toFixed(6)} and ln 2 = ${LN2.toFixed(6)}`, Math.abs(atFour - LN2) < 0.05,
            `${LY_DEFAULTS.samples} samples is a FINITE-SAMPLE value and r = 4 is the most chaotic point in the sweep: the CPU itself sits ${Math.abs(cpuFour - LN2).toFixed(6)} from ln 2, and no bit claim is made at this end of it`);
        ok("  three's own renderer read the same buffer back, so the transplant is graded against the graph's own output too", R.threeValues && Math.max(...R.threeValues.map((v, i) => Math.abs(v - R.genValues[i]))) < 1e-6 && R.threeBackend === "webgpu" && R.deviceBackend === "webgpu", `three ${R.threeBackend}, device ${R.deviceBackend}`);
        fs.writeFileSync(EMITTED_C, JSON.stringify({ at: "v4331", three: "0.178.0", note: "the Lyapunov sweep as a TSL compute pass, as three emitted it and as render/tslSource.mjs transplanted it into a gfx/device.js compute pipeline; rewritten by this gate on every run", emitted: R.emitted, transplanted: R.transplanted }, null, 1));
        ok("the emitted and transplanted compute pass is written to tools/ship/tsl-emitted-compute.json for the WGSL corpus", fs.existsSync(EMITTED_C));
    }
}

console.log("\n5. A COMPUTE PASS THAT READS ONE (v4336): two dispatches in one frame, the second reading what the first wrote");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const N = 64;
    const r2 = await runInEngineOrigin({ engineRoot: ENG, args: { N, P3LO: PERIOD3.lo, P3HI: PERIOD3.hi }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const P = await import("/render/physicsTsl.mjs"); const S = await import("/render/tslSource.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const out = {};
        const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
        const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: false, antialias: false }); await renderer.init();
        const g = P.makeLyapunovComputeTsl(T, { count: a.N, seed: 0.4 });
        await renderer.computeAsync(g.node);
        const m = P.makeChaosMaskTsl(T, { sweep: g.buffer, count: a.N });
        await renderer.computeAsync(m.node);
        const sweepEmitted = renderer._nodes.getForCompute(g.node).computeShader;
        const maskEmitted = renderer._nodes.getForCompute(m.node).computeShader;
        out.bothReadWrite = (maskEmitted.match(/var<storage, read_write>/g) || []).length;   // three declares BOTH as read_write
        try {
            const cv = document.createElement("canvas"); cv.width = 32; cv.height = 32; const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
            const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
            const sweepShell = S.computeShell({ storage: [{ name: "out", element: "f32" }], uniforms: [{ name: "span", type: "vec4" }] });
            // the shell is where read-only is STATED: three emitted both as read_write, and the mask pass only reads the sweep
            // the INPUT is declared first, the way render/gpuDriven.mjs's cull pass declares its reads before its writes --
            // which is the opposite of the order three emitted them in, so the role mapping is load-bearing here
            const maskShell = S.computeShell({ name: "chaos mask", storage: [{ name: "sweep", element: "f32", access: "read" }, { name: "mask", element: "f32" }], uniforms: [] });
            const genSweep = S.transplantCompute(sweepEmitted, sweepShell);
            const genMask = S.transplantCompute(maskEmitted, maskShell);
            out.maskWgsl = genMask.wgsl; out.reads = genMask.reads; out.writes = genMask.writes;
            const sweepBuf = dev.buffer({ usage: ["storage"], size: a.N * 4 });
            const maskBuf = dev.buffer({ usage: ["storage"], size: a.N * 4 });
            const ubuf = dev.buffer({ data: Float32Array.from(g.knobs), usage: "uniform" });
            const pipeA = dev.compute({ wgsl: genSweep.wgsl }); pipeA.bind("out", sweepBuf).bind("u", ubuf);
            const pipeB = dev.compute({ wgsl: genMask.wgsl }); pipeB.bind("mask", maskBuf).bind("sweep", sweepBuf);
            // BOTH DISPATCHES IN ONE FRAME, in order: the device runs compute on the frame's own encoder before the render pass
            dev.frame(({ pass }) => { pass.dispatch(pipeA, 1); pass.dispatch(pipeB, 1); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
            out.sweep = [...new Float32Array(await dev.read(sweepBuf))];
            out.mask = [...new Float32Array(await dev.read(maskBuf))];
            out.errs = errs;
        } catch (e) { out.error = String(e && e.message || e).slice(0, 400); }
        return out;
    }` });
    ok("the harness ran both dispatches", r2.ok && r2.result && !r2.result.error && r2.result.mask, r2.ok ? (r2.result && r2.result.error) : (r2.reason || (r2.pageErrors || []).join("; ")));
    if (r2.ok && r2.result && !r2.result.error) {
        const M = r2.result;
        const agree = M.mask.filter((v, i) => v === (M.sweep[i] > 0 ? 1 : 0)).length;
        ok(`*** the second pass read what the first wrote: its mask is the SIGN of the sweep's own output on every element (${agree} of ${N}) ***`, agree === N && (M.errs || []).length === 0 && M.mask.some((v) => v === 1) && M.mask.some((v) => v === 0),
            `${agree}/${N}, ${M.mask.filter((v) => v === 1).length} chaotic; device errors ${(M.errs || []).length}. Two dispatches on ONE frame's encoder, the second bound to the first's buffer`);
        ok("*** and the shell is where read-only is stated: three declared BOTH buffers read_write, and the transplant matched them BY ROLE -- mask written, sweep read ***",
            M.bothReadWrite === 2 && M.writes.join() === "mask" && M.reads.join() === "sweep" && /var<storage, read> sweep:/.test(M.maskWgsl) && /var<storage, read_write> mask:/.test(M.maskWgsl),
            `three: ${M.bothReadWrite} read_write; transplanted writes ${M.writes.join()}, reads ${M.reads.join()}. three gave binding 0 to the buffer it WRITES and this shell declares the one it READS first, so a positional mapping binds them backwards -- measured as sabotage U, not assumed`);
        // the keyed claim: the periodic elements above 3.8 are the period-3 window, and the tree owns its edge exactly
        const rOf = (i) => LY_DEFAULTS.rLo + (LY_DEFAULTS.rHi - LY_DEFAULTS.rLo) * (i / (N - 1));
        const highPeriodic = M.mask.map((v, i) => i).filter((i) => M.mask[i] === 0 && rOf(i) > 3.8);
        const inWindow = highPeriodic.filter((i) => rOf(i) >= PERIOD3.lo && rOf(i) <= PERIOD3.hi);
        ok(`*** and the mask finds the PERIOD-3 WINDOW: every periodic element above r = 3.8 lies inside [1 + sqrt(8), 3.857] -- ${highPeriodic.length} of them, at r = ${highPeriodic.map((i) => rOf(i).toFixed(4)).join(", ")} ***`,
            highPeriodic.length > 0 && inWindow.length === highPeriodic.length,
            `1 + sqrt(8) = ${PERIOD3.lo.toFixed(6)}, the window's own edge from render/lyapunovWgsl.mjs. A sign test on a buffer another pass wrote, landing on a constant this tree owns exactly`);
    }
}

console.log("\n6. AN ATOMIC PASS (v4337): sixteen workgroups counting into one number, which is the cull pass's own shape");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const NBIG = 1024;
    const r3 = await runInEngineOrigin({ engineRoot: ENG, args: { N: NBIG }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const P = await import("/render/physicsTsl.mjs"); const S = await import("/render/tslSource.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const out = {};
        const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
        const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: false, antialias: false }); await renderer.init();
        const g = P.makeLyapunovComputeTsl(T, { count: a.N, seed: 0.4 });
        await renderer.computeAsync(g.node);
        const t = P.makeChaosTallyTsl(T, { sweep: g.buffer, count: a.N });
        await renderer.computeAsync(t.node);
        const sweepEmitted = renderer._nodes.getForCompute(g.node).computeShader;
        const tallyEmitted = renderer._nodes.getForCompute(t.node).computeShader;
        out.threeDeclaresAtomic = /array< atomic<u32> >/.test(tallyEmitted);
        try {
            const cv = document.createElement("canvas"); cv.width = 32; cv.height = 32; const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
            const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
            const sweepShell = S.computeShell({ storage: [{ name: "out", element: "f32" }], uniforms: [{ name: "span", type: "vec4" }] });
            const tallyShell = S.computeShell({ name: "chaos tally", storage: [{ name: "sweep", element: "f32", access: "read" }, { name: "tally", element: "u32", atomic: true }], uniforms: [] });
            const genSweep = S.transplantCompute(sweepEmitted, sweepShell);
            const genTally = S.transplantCompute(tallyEmitted, tallyShell);
            out.tallyWgsl = genTally.wgsl; out.reads = genTally.reads; out.writes = genTally.writes;
            // REFUSED: the same pass into a shell that forgot the atomic, and an atomic shell for a pass that has none
            out.refusedNoAtomic = (() => { try { S.transplantCompute(tallyEmitted, S.computeShell({ name: "chaos tally", storage: [{ name: "sweep", element: "f32", access: "read" }, { name: "tally", element: "u32" }], uniforms: [] })); return null; } catch (e) { return e.message; } })();
            out.refusedSpurious = (() => { try { S.transplantCompute(sweepEmitted, S.computeShell({ storage: [{ name: "out", element: "f32", atomic: true }], uniforms: [{ name: "span", type: "vec4" }] })); return null; } catch (e) { return e.message; } })();
            const sweepBuf = dev.buffer({ usage: ["storage"], size: a.N * 4 });
            const ubuf = dev.buffer({ data: Float32Array.from(g.knobs), usage: "uniform" });
            const groups = Math.ceil(a.N / 64);
            const runTally = async (wgsl) => { const tb = dev.buffer({ data: new Uint32Array([0]), usage: ["storage"] });
                const pA = dev.compute({ wgsl: genSweep.wgsl }); pA.bind("out", sweepBuf).bind("u", ubuf);
                const pB = dev.compute({ wgsl }); pB.bind("sweep", sweepBuf).bind("tally", tb);
                dev.frame(({ pass }) => { pass.dispatch(pA, groups); pass.dispatch(pB, groups); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
                const v = new Uint32Array(await dev.read(tb))[0]; tb.destroy(); return v; };
            out.groups = groups;
            out.tally = await runTally(genTally.wgsl);
            // THE SAME MODULE WITH THE ATOMIC TAKEN OUT BY HAND: a plain read-modify-write on a plain u32. It compiles, it
            // runs, and it is wrong -- which is the only reason the atomic declaration is worth a refusal of its own.
            // NO REGEX HERE, AND THAT IS THE POINT. This whole script is a template literal, so a pattern written as
            // /atomicAdd\\(/ loses its backslashes twice on the way to RegExp and matches nothing; two attempts replaced
            // nothing at all and left an atomicAdd on a plain u32, which the device refused by name ("no matching call to
            // atomicAdd(ptr<storage, u32, read_write>, u32)"). The call is found by index and replaced as a plain string.
            const callAt = genTally.wgsl.indexOf("atomicAdd(");
            const call = genTally.wgsl.slice(callAt, genTally.wgsl.indexOf(")", callAt) + 1);
            const naive = genTally.wgsl.replace("array<atomic<u32>>", "array<u32>").replace(call, "tally.value[ 0u ] = tally.value[ 0u ] + 1u");
            out.naiveIsPlain = naive.includes("tally.value[ 0u ] = tally.value[ 0u ] + 1u") && !/atomic/.test(naive);
            out.naiveRuns = []; for (let i = 0; i < 5; i++) out.naiveRuns.push(await runTally(naive));
            out.sweep = [...new Float32Array(await dev.read(sweepBuf))];
            out.errs = errs;
        } catch (e) { out.error = String(e && e.message || e).slice(0, 400); }
        return out;
    }` });
    ok("the harness ran the sweep and the tally", r3.ok && r3.result && !r3.result.error && r3.result.tally != null, r3.ok ? (r3.result && r3.result.error) : (r3.reason || (r3.pageErrors || []).join("; ")));
    if (r3.ok && r3.result && !r3.result.error) {
        const A = r3.result;
        const truth = A.sweep.filter((v) => v > 0).length;
        ok(`*** ${A.groups} workgroups counted into ONE number and none of them lost an increment: the tally is ${A.tally}, and ${truth} of ${NBIG} elements of the sweep it read are positive ***`,
            A.tally === truth && truth > 100 && A.groups > 1 && (A.errs || []).length === 0,
            `tally ${A.tally}, truth ${truth}, ${A.groups} workgroups; device errors ${(A.errs || []).length}. At one workgroup there is no contention to lose, which is why this runs at ${NBIG}`);
        ok("*** the atomic is declared on BOTH sides: three emitted array<atomic<u32>> and the shell says atomic, and the transplant refuses either without the other ***",
            A.threeDeclaresAtomic && /array<atomic<u32>>/.test(A.tallyWgsl) && /does not declare it atomic/.test(A.refusedNoAtomic || "") && /never touches it atomically/.test(A.refusedSpurious || ""),
            `refusals: ${(A.refusedNoAtomic || "none").slice(0, 60)} | ${(A.refusedSpurious || "none").slice(0, 60)}`);
        ok(`*** and the atomic is what buys it: the SAME module with the atomic taken out counts ${A.naiveRuns.join(", ")} instead of ${truth}, a different wrong number every run ***`,
            A.naiveIsPlain && A.naiveRuns.every((v) => v < truth) && new Set(A.naiveRuns).size > 1,
            `atomic ${A.tally} exactly, five times; plain read-modify-write ${A.naiveRuns.join(", ")} -- ${Math.round(100 * (1 - Math.max(...A.naiveRuns) / truth))}% to ${Math.round(100 * (1 - Math.min(...A.naiveRuns) / truth))}% of the increments lost to contention. It compiles and runs, which is why the shell declares the atomic and the transplant refuses a mismatch`);
        ok("  and the roles still hold with an atomic in the shell: the counter is a WRITTEN buffer even though nothing assigns to it", A.writes.join() === "tally" && A.reads.join() === "sweep",
            `writes ${A.writes.join()}, reads ${A.reads.join()} -- the write is inside atomicAdd(&tally.value[0], 1u), which no assignment scan would see`);
    }
}

console.log("\n7. WORKGROUP-SHARED MEMORY (v4338): the same count reduced in a shared array behind a barrier, sixteen atomics instead of 670");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const NBIG = 1024;
    const r4 = await runInEngineOrigin({ engineRoot: ENG, args: { N: NBIG }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const P = await import("/render/physicsTsl.mjs"); const S = await import("/render/tslSource.mjs"); const W = await import("/render/wgslSpec.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const out = {};
        const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
        const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: false, antialias: false }); await renderer.init();
        const g = P.makeLyapunovComputeTsl(T, { count: a.N, seed: 0.4 }); await renderer.computeAsync(g.node);
        const red = P.makeChaosReduceTsl(T, { sweep: g.buffer, count: a.N }); await renderer.computeAsync(red.node);
        const sweepEmitted = renderer._nodes.getForCompute(g.node).computeShader;
        const redEmitted = renderer._nodes.getForCompute(red.node).computeShader;
        out.threeShared = (redEmitted.match(/var<workgroup>/g) || []).length;
        out.threeBarrier = /workgroupBarrier\\(\\)/.test(redEmitted);
        try {
            const cv = document.createElement("canvas"); cv.width = 32; cv.height = 32; const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
            const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
            const sweepShell = S.computeShell({ storage: [{ name: "out", element: "f32" }], uniforms: [{ name: "span", type: "vec4" }] });
            const redShell = S.computeShell({ name: "chaos reduce", shared: [{ name: "lane", element: "u32", length: 64 }],
                                              storage: [{ name: "sweep", element: "f32", access: "read" }, { name: "total", element: "u32", atomic: true }], uniforms: [] });
            const genSweep = S.transplantCompute(sweepEmitted, sweepShell);
            const genRed = S.transplantCompute(redEmitted, redShell);
            out.redWgsl = genRed.wgsl; out.sharedNames = genRed.shared;
            out.scanned = W.parseWorkgroupVars(genRed.wgsl);   // the tree's own scanner, reading a shader nobody wrote
            out.refusedNoShared = (() => { try { S.transplantCompute(redEmitted, S.computeShell({ name: "chaos reduce", storage: [{ name: "sweep", element: "f32", access: "read" }, { name: "total", element: "u32", atomic: true }], uniforms: [] })); return null; } catch (e) { return e.message; } })();
            out.refusedWrongSize = (() => { try { S.transplantCompute(redEmitted, S.computeShell({ name: "chaos reduce", shared: [{ name: "lane", element: "u32", length: 32 }], storage: [{ name: "sweep", element: "f32", access: "read" }, { name: "total", element: "u32", atomic: true }], uniforms: [] })); return null; } catch (e) { return e.message; } })();
            const sweepBuf = dev.buffer({ usage: ["storage"], size: a.N * 4 });
            const ubuf = dev.buffer({ data: Float32Array.from(g.knobs), usage: "uniform" });
            const groups = Math.ceil(a.N / 64);
            const runTotal = async (wgsl) => { const tb = dev.buffer({ data: new Uint32Array([0]), usage: ["storage"] });
                const pA = dev.compute({ wgsl: genSweep.wgsl }); pA.bind("out", sweepBuf).bind("u", ubuf);
                const pB = dev.compute({ wgsl }); pB.bind("sweep", sweepBuf).bind("total", tb);
                dev.frame(({ pass }) => { pass.dispatch(pA, groups); pass.dispatch(pB, groups); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
                const v = new Uint32Array(await dev.read(tb))[0]; tb.destroy(); return v; };
            out.groups = groups;
            out.total = await runTotal(genRed.wgsl);
            // the SAME module with the barrier taken out -- by index and plain string, never a regex (v4337's lesson)
            const barAt = genRed.wgsl.indexOf("workgroupBarrier()");
            const noBar = genRed.wgsl.slice(0, barAt) + "/* barrier removed */" + genRed.wgsl.slice(barAt + "workgroupBarrier()".length);
            out.noBarIsPlain = !/workgroupBarrier\\(\\)/.test(noBar);
            out.noBarRuns = []; for (let i = 0; i < 5; i++) out.noBarRuns.push(await runTotal(noBar));
            out.sweep = [...new Float32Array(await dev.read(sweepBuf))];
            out.errs = errs;
        } catch (e) { out.error = String(e && e.message || e).slice(0, 400); }
        return out;
    }` });
    ok("the harness ran the sweep and the reduction", r4.ok && r4.result && !r4.result.error && r4.result.total != null, r4.ok ? (r4.result && r4.result.error) : (r4.reason || (r4.pageErrors || []).join("; ")));
    if (r4.ok && r4.result && !r4.result.error) {
        const D = r4.result;
        const truth = D.sweep.filter((v) => v > 0).length;
        ok(`*** the reduction gets the same answer with ${D.groups} atomic increments instead of ${truth}: total ${D.total}, and ${truth} of ${NBIG} elements are positive ***`,
            D.total === truth && D.groups > 1 && (D.errs || []).length === 0,
            `total ${D.total}, truth ${truth}; one atomic per workgroup, ${D.groups} of them, against one per positive element in section 6`);
        ok("*** three emitted BOTH halves and the transplant carried both: a var<workgroup> array above the entry and a workgroupBarrier() in the body, under the SHELL's name ***",
            D.threeShared === 1 && D.threeBarrier && D.sharedNames.join() === "lane" && /var<workgroup> lane: array<u32, 64>;/.test(D.redWgsl) && !/WorkgroupArray_/.test(D.redWgsl) && /workgroupBarrier\(\)/.test(D.redWgsl),
            `three declared ${D.threeShared} workgroup array(s) as WorkgroupArray_NNN; the module ships it as "${D.sharedNames.join()}"`);
        ok("  and render/wgslSpec.mjs's own scanner reads it out of the generated module at the right size", D.scanned.length === 1 && D.scanned[0].name === "lane" && D.scanned[0].bytes === 256,
            `parseWorkgroupVars: ${JSON.stringify(D.scanned)} -- 64 u32 is 256 bytes, and this is the first generated shader that scanner has ever had to read`);
        ok("REFUSED: a shell with no workgroup array for a pass that declares one, and one that declares it the wrong size",
            /declares 1 workgroup array\(s\) and the shell "chaos reduce" declares 0/.test(D.refusedNoShared || "") && /array<u32, 64> and the shell "chaos reduce" says array<u32, 32>/.test(D.refusedWrongSize || ""),
            `${(D.refusedNoShared || "none").slice(0, 70)} | ${(D.refusedWrongSize || "none").slice(0, 70)}`);
        ok(`*** and the BARRIER is load-bearing, measured rather than cited: the same module with workgroupBarrier() removed reads ${D.noBarRuns.join(", ")} against ${truth} ***`,
            D.noBarIsPlain && D.noBarRuns.every((v) => v !== truth),
            `lane 0 sums the shared array before the other 63 lanes have written into it. If this ever goes GREEN on other hardware -- a device whose lanes happen to finish in order -- that is a FINDING and not a fix: WGSL guarantees nothing here without the barrier, and the right response is to record where it stopped being observable, not to drop the check`);
    }
}

console.log("\n8. AN INDIRECT DISPATCH (v4339): the number of invocations decided by a buffer another pass wrote, never by JavaScript");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const NBIG = 1024;
    const r5 = await runInEngineOrigin({ engineRoot: ENG, args: { N: NBIG }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const P = await import("/render/physicsTsl.mjs"); const S = await import("/render/tslSource.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const out = {};
        const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
        const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: false, antialias: false }); await renderer.init();
        const g = P.makeLyapunovComputeTsl(T, { count: a.N, seed: 0.4 }); await renderer.computeAsync(g.node);
        const t = P.makeChaosTallyTsl(T, { sweep: g.buffer, count: a.N }); await renderer.computeAsync(t.node);
        const sz = P.makeDispatchSizerTsl(T, { tally: t.tally }); await renderer.computeAsync(sz.node);
        const mk = P.makeMarkTsl(T, { count: a.N }); await renderer.computeAsync(mk.node);
        const em = { sweep: renderer._nodes.getForCompute(g.node).computeShader, tally: renderer._nodes.getForCompute(t.node).computeShader,
                     sizer: renderer._nodes.getForCompute(sz.node).computeShader, mark: renderer._nodes.getForCompute(mk.node).computeShader };
        // the SAME buffer is atomic<u32> where the tally increments it and a plain u32 where the sizer reads it
        // three declares the tally atomic in BOTH modules -- the flag lives on the node, not on the use -- so the sizer,
        // which only reads it, gets an atomic declaration it never needed. The SHELL is what fixes that.
        out.tallyAtomicThere = /array< atomic<u32> >/.test(em.tally);
        out.tallyAtomicInSizerToo = /array< atomic<u32> >/.test(em.sizer);
        try {
            const cv = document.createElement("canvas"); cv.width = 32; cv.height = 32; const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
            const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
            const shells = {
                sweep: S.computeShell({ storage: [{ name: "out", element: "f32" }], uniforms: [{ name: "span", type: "vec4" }] }),
                tally: S.computeShell({ name: "tally", storage: [{ name: "sweep", element: "f32", access: "read" }, { name: "tally", element: "u32", atomic: true }], uniforms: [] }),
                sizer: S.computeShell({ name: "sizer", storage: [{ name: "tally", element: "u32", access: "read" }, { name: "dims", element: "u32" }], uniforms: [] }),
                mark: S.computeShell({ name: "mark", storage: [{ name: "marks", element: "u32" }], uniforms: [] }),
            };
            const gen = { sweep: S.transplantCompute(em.sweep, shells.sweep), tally: S.transplantCompute(em.tally, shells.tally),
                          sizer: S.transplantCompute(em.sizer, shells.sizer), mark: S.transplantCompute(em.mark, shells.mark) };
            out.sizerWgsl = gen.sizer.wgsl;
            const sweepBuf = dev.buffer({ usage: ["storage"], size: a.N * 4 });
            const ubuf = dev.buffer({ data: Float32Array.from(g.knobs), usage: "uniform" });
            const groups = Math.ceil(a.N / 64);
            const pSweep = dev.compute({ wgsl: gen.sweep.wgsl }); pSweep.bind("out", sweepBuf).bind("u", ubuf);
            // one run: sweep -> tally -> sizer -> the mark pass dispatched INDIRECTLY from what the sizer wrote
            const run = async (seedTally) => {
                const tallyBuf = dev.buffer({ data: new Uint32Array([seedTally == null ? 0 : seedTally]), usage: ["storage"] });
                const dimsBuf = dev.buffer({ data: new Uint32Array([0, 0, 0]), usage: ["indirect"] });
                const marksBuf = dev.buffer({ data: new Uint32Array(a.N), usage: ["storage"] });
                const pTally = dev.compute({ wgsl: gen.tally.wgsl }); pTally.bind("sweep", sweepBuf).bind("tally", tallyBuf);
                const pSizer = dev.compute({ wgsl: gen.sizer.wgsl }); pSizer.bind("tally", tallyBuf).bind("dims", dimsBuf);
                const pMark = dev.compute({ wgsl: gen.mark.wgsl }); pMark.bind("marks", marksBuf);
                dev.frame(({ pass }) => {
                    pass.dispatch(pSweep, groups);
                    if (seedTally == null) pass.dispatch(pTally, groups);   // let the GPU count; otherwise the count is seeded
                    pass.dispatch(pSizer, 1);
                    pass.dispatchIndirect(pMark, dimsBuf);
                    pass.clear([0, 0, 0, 1]);
                }, { offscreen: true });
                const dims = [...new Uint32Array(await dev.read(dimsBuf))];
                const marks = new Uint32Array(await dev.read(marksBuf));
                const tally = new Uint32Array(await dev.read(tallyBuf))[0];
                tallyBuf.destroy(); dimsBuf.destroy(); marksBuf.destroy();
                let ran = 0, past = 0; for (let i = 0; i < a.N; i++) { if (marks[i]) { ran++; if (i >= dims[0] * 64) past++; } }
                return { dims, tally, ran, past };
            };
            // a buffer without "indirect" usage cannot hold a dispatch size, and saying so here is cheaper than a driver error
            out.plainRefusal = (() => { const plain = dev.buffer({ data: new Uint32Array([1, 1, 1]), usage: ["storage"] });
                const p = dev.compute({ wgsl: gen.mark.wgsl }); p.bind("marks", dev.buffer({ usage: ["storage"], size: a.N * 4 }));
                try { dev.frame(({ pass }) => { pass.dispatchIndirect(p, plain); pass.clear([0, 0, 0, 1]); }, { offscreen: true }); return null; }
                catch (e) { return String(e.message).slice(0, 200); } })();
            out.counted = await run(null);        // the GPU counts, sizes and dispatches, with nothing read back between
            out.seeded64 = await run(64);         // and a different number in the same buffer moves the dispatch
            out.seeded200 = await run(200);
            out.sweep = [...new Float32Array(await dev.read(sweepBuf))];
            out.errs = errs;
        } catch (e) { out.error = String(e && e.message || e).slice(0, 400); }
        // and the other backend says so by name rather than doing nothing
        try { const cv2 = document.createElement("canvas"); cv2.width = 8; cv2.height = 8; const gl = await requestDevice(cv2, { backend: "webgl2" });
              gl.frame(({ pass }) => { try { pass.dispatchIndirect(null, null); } catch (e) { out.webgl2Refusal = String(e.message).slice(0, 160); } pass.clear([0,0,0,1]); }, {});
        } catch (e) { out.webgl2Refusal = out.webgl2Refusal || ("outer: " + String(e && e.message || e)).slice(0, 160); }
        return out;
    }` });
    ok("the harness ran the chain", r5.ok && r5.result && !r5.result.error && r5.result.counted, r5.ok ? (r5.result && r5.result.error) : (r5.reason || (r5.pageErrors || []).join("; ")));
    if (r5.ok && r5.result && !r5.result.error) {
        const E = r5.result, C = E.counted;
        const truth = E.sweep.filter((v) => v > 0).length, want = Math.ceil(truth / 64);
        ok(`*** the GPU counted ${C.tally}, sized its own next dispatch to ${C.dims.join("x")} workgroups, and ran ${C.ran} invocations -- nothing came back to the CPU in between ***`,
            C.tally === truth && C.dims[0] === want && C.dims[1] === 1 && C.dims[2] === 1 && C.ran === want * 64 && C.past === 0 && (E.errs || []).length === 0,
            `tally ${C.tally} (truth ${truth}), dims ${C.dims.join(",")} (ceil(${truth}/64) = ${want}), ${C.ran} invocations = ${want} x 64, none past the edge; device errors ${(E.errs || []).length}`);
        ok(`*** and it is the BUFFER that decides: seed the same buffer with 64 and 200 instead and the dispatch becomes ${E.seeded64.dims[0]} and ${E.seeded200.dims[0]} workgroups (${E.seeded64.ran} and ${E.seeded200.ran} invocations), with no JavaScript number changed ***`,
            E.seeded64.dims[0] === 1 && E.seeded64.ran === 64 && E.seeded200.dims[0] === 4 && E.seeded200.ran === 256,
            `64 -> ${E.seeded64.dims[0]} group, ${E.seeded64.ran} invocations; 200 -> ${E.seeded200.dims[0]} groups, ${E.seeded200.ran}. The same encoded command, three different amounts of work`);
        ok("*** and the SHELL owns the declaration, not three: three declares the tally atomic<u32> in both modules because the flag is on the node, and the transplanted sizer -- which only reads it -- ships it as a plain read-only u32 ***",
            E.tallyAtomicThere && E.tallyAtomicInSizerToo && /var<storage, read> tally: tallyBuf;/.test(E.sizerWgsl) && /struct tallyBuf \{ value: array<u32> \};/.test(E.sizerWgsl),
            "one buffer, two views: atomic where it is incremented, plain and read-only where it is read. A binding is memory; the atomic is how a shader touches it, and the shell is where that is said");
        ok('REFUSED: a dispatch size in a buffer that was not created with usage "indirect"', /usage "indirect"/.test(E.plainRefusal || ""), (E.plainRefusal || "NOT REFUSED -- a plain storage buffer was accepted as a dispatch size").slice(0, 150));
        ok("  and WebGL2 refuses an indirect dispatch BY NAME rather than doing nothing", /webgl2/.test(E.webgl2Refusal || "") && /compute/.test(E.webgl2Refusal || ""), (E.webgl2Refusal || "no refusal seen").slice(0, 120));
    }
}

console.log("\n9. THE FLEET'S OWN CULL DECISION, GENERATED (v4352): every draw in the GPU-driven scene passes through this");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const N = 768, LODS = 3;
    const r6 = await runInEngineOrigin({ engineRoot: ENG, args: { N, LODS }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const P = await import("/render/physicsTsl.mjs"); const S = await import("/render/tslSource.mjs"); const G = await import("/render/gpuDriven.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const out = {};
        const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
        const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: false, antialias: false }); await renderer.init();
        const g = P.makeCullLodTsl(T, { count: a.N, lodCount: a.LODS });
        await renderer.computeAsync(g.node);
        const emitted = renderer._nodes.getForCompute(g.node).computeShader;
        out.emitted = emitted;
        try {
            const cv = document.createElement("canvas"); cv.width = 32; cv.height = 32; const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
            const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
            const shell = S.computeShell({ name: "cull decision", workgroupSize: G.CULL_WORKGROUP,
                storage: [{ name: "inst", element: "vec4<f32>", access: "read" }, { name: "planes", element: "vec4<f32>", access: "read" }, { name: "outv", element: "f32" }],
                uniforms: [{ name: "eye", type: "vec4" }, { name: "thresholds", type: "vec4" }] });
            const gen = S.transplantCompute(emitted, shell);
            out.genWgsl = gen.wgsl; out.reads = gen.reads; out.writes = gen.writes;
            // THE SAME SCENE BOTH PASSES SEE: the probe's own procedural instances, from its exported CPU twin
            const viewProj = G.multiply(G.perspective(Math.PI / 3, 1, 0.1, 100), G.lookAt([0, 0, 6], [0, 0, 0]));
            const planes = G.frustumPlanes(viewProj), eye = [0, 0, 6], thresholds = [0.04, 0.025];
            const insts = new Float32Array(a.N * 4);
            for (let i = 0; i < a.N; i++) { const c = G.probeInstance(i); insts.set(c, i * 4); }
            const planeF = Float32Array.from(planes);   // frustumPlanes returns 24 FLOATS, plane-major -- six vec4 rows, which is what array<vec4<f32>> wants
            const instBuf = dev.buffer({ data: insts, usage: ["storage"] });
            const planeBuf = dev.buffer({ data: planeF, usage: ["storage"] });
            const genOut = dev.buffer({ usage: ["storage"], size: a.N * 2 * 4 });
            const ubuf = dev.buffer({ data: Float32Array.from([...eye, 0, ...thresholds, 0, 0].slice(0, 8)), usage: "uniform" });
            const pGen = dev.compute({ wgsl: gen.wgsl }); pGen.bind("inst", instBuf).bind("planes", planeBuf).bind("outv", genOut).bind("u", ubuf);
            // and the SHIPPED pass, as render/gpuDriven.mjs writes it, on the same scene through its own uniform packing
            const handOut = dev.buffer({ usage: ["storage"], size: a.N * 2 * 4 });
            const cullU = dev.buffer({ data: G.packCullUniforms({ planes, eye, thresholds, count: a.N, lodCount: a.LODS, cap: a.N }), usage: "uniform" });
            const pHand = dev.compute({ wgsl: G.cullProbeWgsl(), entryPoint: "probe" }); pHand.bind("outv", handOut).bind("cull", cullU);
            const groups = Math.ceil(a.N / G.CULL_WORKGROUP);
            dev.frame(({ pass }) => { pass.dispatch(pGen, groups); pass.dispatch(pHand, groups); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
            out.gen = [...new Float32Array(await dev.read(genOut))];
            out.hand = [...new Float32Array(await dev.read(handOut))];
            out.errs = errs; out.groups = groups;
        } catch (e) { out.error = String(e && e.message || e).slice(0, 400); }
        return out;
    }` });
    ok("the harness ran the generated cull and the shipped one", r6.ok && r6.result && !r6.result.error && r6.result.gen, r6.ok ? (r6.result && r6.result.error) : (r6.reason || (r6.pageErrors || []).join("; ")));
    if (r6.ok && r6.result && !r6.result.error) {
        const F = r6.result;
        const lodGen = F.gen.filter((_, i) => i % 2 === 0), lodHand = F.hand.filter((_, i) => i % 2 === 0);
        const metGen = F.gen.filter((_, i) => i % 2 === 1), metHand = F.hand.filter((_, i) => i % 2 === 1);
        const sameLod = lodGen.filter((v, i) => v === lodHand[i]).length;
        const worstMetric = Math.max(...metGen.map((v, i) => Math.abs(v - metHand[i])));
        const culled = lodHand.filter((v) => v < 0).length, drawn = lodHand.length - culled;
        const spread = [0, 1, 2].map((l) => lodHand.filter((v) => v === l).length);
        ok(`*** the GENERATED cull decides what the SHIPPED cull decides, for every one of ${N} instances: same LOD on ${sameLod}, and the metric agrees to ${worstMetric.toExponential(1)} ***`,
            sameLod === N && worstMetric === 0 && (F.errs || []).length === 0,
            `${sameLod}/${N} LODs identical, worst metric difference ${worstMetric}; ${culled} culled, ${drawn} drawn, LOD spread ${spread.join("/")}; device errors ${(F.errs || []).length}`);
        ok("  and the decision is not trivial: instances are rejected by the frustum AND spread across every LOD, so agreement is not two constants matching",
            culled > 50 && spread.every((n) => n > 20), `culled ${culled}, LOD 0/1/2 = ${spread.join("/")} of ${N}`);
        ok("*** the generated module is the shell's own: three's buffers renamed to inst, planes and outv, the plane loop and the ladder intact, and it validates ***",
            F.reads.join() === "inst,planes" && F.writes.join() === "outv" && /var<storage, read> inst:/.test(F.genWgsl) && /var<storage, read> planes:/.test(F.genWgsl) &&
            /for \( var i : i32 = 0; i < 6; i \+\+ \)/.test(F.genWgsl) && !/NodeBuffer_|object\./.test(F.genWgsl) && validateWgsl(F.genWgsl).length === 0,
            `reads ${F.reads.join()}, writes ${F.writes.join()}; ${validateWgsl(F.genWgsl).join("; ") || "validates"}`);
        report("THE OTHER HALF OF cullLodWgsl -- the atomicAdd into array<Cmd> and the region-major record writes -- was unbuildable when " +
            "this section shipped, because computeShell had no struct element. It has one at v4363 and SECTION 10 is the whole pass. This " +
            "section stays as it is: it holds the DECISION alone against the probe's own shader, which is a narrower claim than section 10's " +
            "and fails for different reasons, and a claim that still passes on its own terms is not made redundant by a wider one.");
    }
}

console.log("\n10. THE CULL PASS ITSELF, BOOKKEEPING AND ALL (v4363): the STRUCT element, and the whole of cullLodWgsl generated");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const N = 768, LODS = 3, CAP = 768;
    const r7 = await runInEngineOrigin({ engineRoot: ENG, args: { N, LODS, CAP }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const P = await import("/render/physicsTsl.mjs"); const S = await import("/render/tslSource.mjs"); const G = await import("/render/gpuDriven.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const out = {};
        const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
        const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: false, antialias: false }); await renderer.init();
        const g = P.makeCullPassTsl(T, { count: a.N, lodCount: a.LODS, regions: a.LODS, cap: a.CAP });
        await renderer.computeAsync(g.node);
        const emitted = renderer._nodes.getForCompute(g.node).computeShader;
        // NO REGEX HERE: this script is a template literal, so a backslash in it is eaten twice. Plain splits, as v4337 learned.
        out.emittedOrder = emitted.split("var<storage,").slice(1).map((t) => t.split(">")[1].split(":")[0].trim());
        const mkShell = (over) => S.computeShell(Object.assign({ name: "cull pass", workgroupSize: G.CULL_WORKGROUP,
            storage: [{ name: "inst", element: "vec4<f32>", access: "read" }, { name: "planes", element: "vec4<f32>", access: "read" },
                      { name: "extras", element: "vec4<f32>", access: "read" }, { name: "cmds", struct: P.CMD_STRUCT }, { name: "records", element: "vec4<f32>" }],
            uniforms: [{ name: "eye", type: "vec4" }, { name: "thresholds", type: "vec4" }, { name: "info", type: "vec4" }, { name: "clock", type: "vec4" }] }, over || {}));
        const refuse = (fn) => { try { fn(); return null; } catch (e) { return String(e.message).slice(0, 600); } };
        const field = (n, over) => P.CMD_STRUCT.fields.map((f) => f.name === n ? Object.assign({}, f, over) : f);
        try {
            const shell = mkShell();
            out.shellStruct = shell.structs[0];
            const gen = S.transplantCompute(emitted, shell);
            out.gen = gen.wgsl; out.reads = gen.reads; out.writes = gen.writes;
            // REFUSALS, all of them by name and before any device sees the module
            out.refusals = {
                plainField: refuse(() => S.transplantCompute(emitted, mkShell({ storage: [{ name: "inst", element: "vec4<f32>", access: "read" }, { name: "planes", element: "vec4<f32>", access: "read" }, { name: "extras", element: "vec4<f32>", access: "read" }, { name: "cmds", struct: { name: "Cmd", fields: field("instanceCount", { atomic: false }) } }, { name: "records", element: "vec4<f32>" }] }))),
                wrongName: refuse(() => S.transplantCompute(emitted, mkShell({ storage: [{ name: "inst", element: "vec4<f32>", access: "read" }, { name: "planes", element: "vec4<f32>", access: "read" }, { name: "extras", element: "vec4<f32>", access: "read" }, { name: "cmds", struct: { name: "Cmd", fields: P.CMD_STRUCT.fields.map((f) => f.name === "firstIndex" ? { name: "firstIndexX", type: "u32" } : f) } }, { name: "records", element: "vec4<f32>" }] }))),
                bufferAtomic: refuse(() => mkShell({ storage: [{ name: "cmds", struct: P.CMD_STRUCT, atomic: true }] })),
                halfNamed: refuse(() => S.transplantCompute(emitted.split("planes").join("NodeBuffer_901"), mkShell())),
            };
            // and the SAME graph with its labels stripped, which is what a graph that names nothing emits. "inst" is a
            // substring of instanceIndex and instanceCount, so it goes by its declaration and its reads rather than whole.
            const unlabelled = emitted.split("planes").join("NodeBuffer_901").split("extras").join("NodeBuffer_902")
                .split("cmds").join("NodeBuffer_904").split("records").join("NodeBuffer_905")
                .split("struct instStruct").join("struct NodeBuffer_903Struct")
                .split("inst : instStruct").join("NodeBuffer_903 : NodeBuffer_903Struct")
                .split("inst.value[").join("NodeBuffer_903.value[");
            out.stripped = unlabelled.split("var<storage,").slice(1).map((t) => t.split(">")[1].split(":")[0].trim());
            const byOrder = S.transplantCompute(unlabelled, mkShell());
            out.byOrderCrossed = byOrder.wgsl.includes("planes.value[ instanceIndex ]");   // the per-instance read landing on the frustum buffer
            out.genNotCrossed = !gen.wgsl.includes("planes.value[ instanceIndex ]");

            const cv = document.createElement("canvas"); cv.width = 32; cv.height = 32;
            const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
            const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
            const viewProj = G.multiply(G.perspective(Math.PI / 3, 1, 0.1, 100), G.lookAt([0, 0, 6], [0, 0, 0]));
            const planes = G.frustumPlanes(viewProj), eye = [0, 0, 6], thresholds = [0.04, 0.025];
            const insts = new Float32Array(a.N * 4), extras = new Float32Array(a.N * 4);
            for (let i = 0; i < a.N; i++) { insts.set(G.probeInstance(i), i * 4); extras.set([0.5, 0.25, i % 7, 0.125], i * 4); }
            const planeF = Float32Array.from(planes);
            const cmdSeed = new Uint32Array(a.LODS * 5); for (let q = 0; q < a.LODS; q++) cmdSeed.set([36 + q, 0, 7 * q, 11 * q, 0], q * 5);
            const groups = Math.ceil(a.N / G.CULL_WORKGROUP);
            const run = async (clock, wgsl) => {
                const instBuf = dev.buffer({ data: insts, usage: ["storage"] }), exBuf = dev.buffer({ data: extras, usage: ["storage"] });
                const planeBuf = dev.buffer({ data: planeF, usage: ["storage"] });
                const gCmds = dev.buffer({ data: cmdSeed.slice(), usage: ["storage"] }), hCmds = dev.buffer({ data: cmdSeed.slice(), usage: ["storage"] });
                const gRec = dev.buffer({ usage: ["storage"], size: a.LODS * a.CAP * 3 * 16 }), hRec = dev.buffer({ usage: ["storage"], size: a.LODS * a.CAP * 3 * 16 });
                const gU = dev.buffer({ data: Float32Array.from([eye[0], eye[1], eye[2], 1, thresholds[0], thresholds[1], 0, 0, a.N, a.LODS, a.CAP, 0, clock == null ? 0 : clock, clock == null ? 0 : 1, 0, 0]), usage: "uniform" });
                const hU = dev.buffer({ data: G.packCullUniforms({ planes, eye, thresholds, count: a.N, lodCount: a.LODS, cap: a.CAP, clock }), usage: "uniform" });
                const pG = dev.compute({ wgsl }); pG.bind("inst", instBuf).bind("planes", planeBuf).bind("extras", exBuf).bind("cmds", gCmds).bind("records", gRec).bind("u", gU);
                const pH = dev.compute({ wgsl: G.cullLodWgsl({}) }); pH.bind("inst", instBuf).bind("extras", exBuf).bind("cmds", hCmds).bind("records", hRec).bind("cull", hU);
                dev.frame(({ pass }) => { pass.dispatch(pG, groups); pass.dispatch(pH, groups); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
                const o = { gCmds: [...new Uint32Array(await dev.read(gCmds))], hCmds: [...new Uint32Array(await dev.read(hCmds))],
                            gRec: [...new Float32Array(await dev.read(gRec))], hRec: [...new Float32Array(await dev.read(hRec))] };
                for (const b of [instBuf, exBuf, planeBuf, gCmds, hCmds, gRec, hRec, gU, hU]) b.destroy && b.destroy();
                return o;
            };
            out.open = await run(null, gen.wgsl);            // the whole scene
            out.clocked = await run(3, gen.wgsl);            // and the day-t gate on, which only extras can answer
            out.errs = errs.slice();                         // snapshot BEFORE the crossed run, whose out-of-range reads are its own business
            out.crossed = await run(null, byOrder.wgsl);     // the same graph mapped by role and order instead of by name
        } catch (e) { out.error = String(e && e.message || e).slice(0, 400); }
        return out;
    }` });
    ok("the harness ran the generated cull pass and the shipped one", r7.ok && r7.result && !r7.result.error && r7.result.open, r7.ok ? (r7.result && r7.result.error) : (r7.reason || (r7.pageErrors || []).join("; ")));
    if (r7.ok && r7.result && !r7.result.error) {
        const F = r7.result;
        const counts = (c) => [0, 1, 2].map((q) => c[q * 5 + 1]);
        const rows = (rec, c) => { const out = [];
            for (let q = 0; q < LODS; q++) for (let sl = 0; sl < c[q]; sl++) { const b = ((q * CAP) + sl) * 12; out.push(rec.slice(b, b + 12)); }
            return out.sort((x, y) => x[4] - y[4]); };
        const cmp = (E) => { const g = rows(E.gRec, counts(E.gCmds)), h = rows(E.hRec, counts(E.hCmds));
            let bad = 0; for (let i = 0; i < Math.max(g.length, h.length); i++) { const a2 = g[i] || [], b2 = h[i] || [];
                if (a2.length !== b2.length || a2.some((v, j) => v !== b2[j])) bad++; }
            return { gen: counts(E.gCmds), hand: counts(E.hCmds), rowsG: g.length, rowsH: h.length, bad }; };
        const O = cmp(F.open), C = cmp(F.clocked);
        ok(`*** the GENERATED cull pass does the SHIPPED pass's BOOKKEEPING, not just its decision: the same instance count in every region (${O.gen.join("/")}), and all ${O.rowsG} survivor records identical to the float ***`,
            O.gen.join() === O.hand.join() && O.bad === 0 && O.rowsG === O.rowsH && O.rowsG > 0 && (F.errs || []).length === 0,
            `counts gen ${O.gen.join("/")} vs hand ${O.hand.join("/")}, ${O.rowsG} records each, ${O.bad} differing; device errors ${(F.errs || []).length}`);
        ok(`  and again with the day-t clock gate on, which only the extras buffer can answer: ${C.gen.reduce((a2, b2) => a2 + b2, 0)} survivors instead of ${O.gen.reduce((a2, b2) => a2 + b2, 0)}, the same ones, the same records`,
            C.gen.join() === C.hand.join() && C.bad === 0 && C.rowsG === C.rowsH && C.gen.reduce((a2, b2) => a2 + b2, 0) < O.gen.reduce((a2, b2) => a2 + b2, 0),
            `counts gen ${C.gen.join("/")} vs hand ${C.hand.join("/")}, ${C.rowsG} records each, ${C.bad} differing -- ${O.rowsG - C.rowsG} bodies not yet vendored on day 3`);
        const seeded = (c) => [0, 1, 2].map((q) => [c[q * 5], c[q * 5 + 2], c[q * 5 + 3]].join(",")).join(" ");
        ok("*** the STRUCT is the shipped one, field for field: the shell declares the same struct Cmd render/gpuDriven.mjs does, and the four fields the CPU seeded come back untouched -- which is where a wrong layout would have shown, the atomic landing on indexCount instead ***",
            F.shellStruct === "struct Cmd { indexCount: u32, instanceCount: atomic<u32>, firstIndex: u32, baseVertex: u32, firstInstance: u32 };" &&
            cullLodWgsl({}).includes(F.shellStruct) && seeded(F.open.gCmds) === seeded(F.open.hCmds) && seeded(F.open.gCmds) === "36,0,0 37,7,11 38,14,22",
            `shell: ${F.shellStruct}; seeded fields back as ${seeded(F.open.gCmds)} (hand ${seeded(F.open.hCmds)})`);
        ok("*** and the graph NAMES its buffers, so the transplant maps by name rather than by role and order -- which is load-bearing, not tidiness: three declares its buffers in the order the BODY FIRST USES them ***",
            F.emittedOrder.join() === "inst,extras,planes,cmds,records" && F.reads.join() === "inst,planes,extras" && F.writes.join() === "cmds,records" && F.genNotCrossed === true,
            `three emitted them ${F.emittedOrder.join(", ")} -- extras before planes, because the body reads extras first, while the shell declares planes first`);
        const X = cmp(F.crossed);
        ok("  MEASURED: strip the labels and the same graph maps by role and order, which crosses the frustum buffer with the per-instance one -- two array<vec4<f32>> nothing else tells apart -- and the pass draws a different scene",
            F.byOrderCrossed === true && X.gen.join() !== X.hand.join() && (F.stripped || []).join() === "NodeBuffer_903,NodeBuffer_902,NodeBuffer_901,NodeBuffer_904,NodeBuffer_905",
            `crossed mapping: counts ${X.gen.join("/")} against the shipped ${X.hand.join("/")}. Same module text, same scene, one mapping rule apart`);
        const R7 = F.refusals || {};
        ok("REFUSED by name, before any device sees the module: a struct whose atomic field is declared plain, and a field the graph does not have",
            /declares that field u32 rather than atomic<u32>/.test(R7.plainField || "") && /(has no such field|one name, two layouts)/.test(R7.wrongName || ""),
            `${(R7.plainField || "NOT REFUSED").slice(0, 90)} | ${(R7.wrongName || "NOT REFUSED").slice(0, 90)}`);
        ok("REFUSED: the atomic put on the BUFFER of a struct element rather than on a field, and a graph that names only some of its buffers",
            /atomic belongs to a FIELD/.test(R7.bufferAtomic || "") && /label them all or none/.test(R7.halfNamed || ""),
            `${(R7.bufferAtomic || "NOT REFUSED").slice(0, 90)} | ${(R7.halfNamed || "NOT REFUSED").slice(0, 90)}`);
        ok("the generated module is the shell's own and validates: struct Cmd declared once, the atomicAdd on its member, nothing of three's names left",
            /atomicAdd\(\s*&cmds\.value\[[^\]]*\]\.instanceCount/.test(F.gen) && (F.gen.match(/struct Cmd \{/g) || []).length === 1 &&
            !/NodeBuffer_|object\./.test(F.gen) && validateWgsl(F.gen).length === 0,
            `${validateWgsl(F.gen).join("; ") || "validates"}`);
        report("THIS SECTION KEEPS THE FRUSTUM IN A STORAGE BUFFER ON PURPOSE, and v4364 did not change it: the crossing measured just " +
            "above is only visible in a shell whose declaration order differs from three's emission order, and moving the planes into a " +
            "uniform (section 11, where struct Cull's own `array<vec4<f32>, 6>` type is used) makes the two orders agree and the hazard " +
            "invisible. A configuration that still demonstrates a live failure mode is worth keeping beside the tidier one. The fleets " +
            "variant and the uniform frustum are section 11; { occlusion: true } is the one variant left.");
    }
}

console.log("\n11. THE FLEETS VARIANT, AND THE FRUSTUM IN A UNIFORM (v4364): the configuration the orrery actually runs");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const N = 768, LODS = 3, FLEETS = 2, CAP = 512, REG = LODS * FLEETS;
    const r8 = await runInEngineOrigin({ engineRoot: ENG, args: { N, LODS, FLEETS, CAP, REG }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const P = await import("/render/physicsTsl.mjs"); const S = await import("/render/tslSource.mjs"); const G = await import("/render/gpuDriven.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const out = {};
        const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
        const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: false, antialias: false }); await renderer.init();
        const opts = { count: a.N, lodCount: a.LODS, regions: a.REG, cap: a.CAP, fleets: true };
        const gU = P.makeCullPassTsl(T, Object.assign({ planesUniform: true }, opts));
        const gS = P.makeCullPassTsl(T, Object.assign({ planesUniform: false }, opts));
        await renderer.computeAsync(gU.node); await renderer.computeAsync(gS.node);
        const emitted = renderer._nodes.getForCompute(gU.node).computeShader;
        const emittedS = renderer._nodes.getForCompute(gS.node).computeShader;
        const CMDS = { name: "cmds", struct: P.CMD_STRUCT }, RECS = { name: "records", element: "vec4<f32>" };
        const RD = (n) => ({ name: n, element: "vec4<f32>", access: "read" });
        const UNI = [{ name: "eye", type: "vec4" }, { name: "thresholds", type: "vec4" }, { name: "info", type: "vec4" }, { name: "clock", type: "vec4" }];
        const mkShell = (over) => S.computeShell(Object.assign({ name: "cull pass (fleets)", workgroupSize: G.CULL_WORKGROUP,
            storage: [RD("inst"), RD("extras"), { name: "fleetOf", element: "u32", access: "read" }, CMDS, RECS],
            uniforms: UNI, uniformArrays: [{ name: "planes", element: "vec4<f32>", length: 6 }] }, over || {}));
        const refuse = (fn) => { try { fn(); return null; } catch (e) { return String(e.message).slice(0, 400); } };
        try {
            const shell = mkShell();
            const gen = S.transplantCompute(emitted, shell);
            out.gen = gen.wgsl; out.reads = gen.reads; out.writes = gen.writes; out.ua = gen.uniformArrays;
            out.uaDecl = (gen.wgsl.split("struct planesBuf {")[1] || "").split("}")[0].trim();
            // the SAME graph with the frustum in a storage buffer instead, to see whether the body moved
            const shellS = S.computeShell({ name: "cull pass (fleets, storage planes)", workgroupSize: G.CULL_WORKGROUP,
                storage: [RD("inst"), RD("planes"), RD("extras"), { name: "fleetOf", element: "u32", access: "read" }, CMDS, RECS], uniforms: UNI });
            const genS = S.transplantCompute(emittedS, shellS);
            const body = (w) => w.slice(w.indexOf("fn main("));
            out.sameBody = body(gen.wgsl) === body(genS.wgsl);
            out.refusals = {
                noArray: refuse(() => S.transplantCompute(emitted, S.computeShell({ name: "cull pass (fleets)", workgroupSize: G.CULL_WORKGROUP,
                    storage: [RD("inst"), RD("extras"), { name: "fleetOf", element: "u32", access: "read" }, CMDS, RECS], uniforms: UNI }))),
                wrongLength: refuse(() => S.transplantCompute(emitted, mkShell({ uniformArrays: [{ name: "planes", element: "vec4<f32>", length: 5 }] }))),
                unlabelled: refuse(() => S.transplantCompute(emitted.split("planes").join("NodeBuffer_907"), mkShell())),
            };
            const cv = document.createElement("canvas"); cv.width = 32; cv.height = 32;
            const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
            const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
            const viewProj = G.multiply(G.perspective(Math.PI / 3, 1, 0.1, 100), G.lookAt([0, 0, 6], [0, 0, 0]));
            const planes = G.frustumPlanes(viewProj), eye = [0, 0, 6], thresholds = [0.04, 0.025];
            const insts = new Float32Array(a.N * 4), extras = new Float32Array(a.N * 4), fleetOf = new Uint32Array(a.N);
            // every fifth instance asks for fleet 7 against a fleet count of 2, which the pass must CLAMP rather than trust
            for (let i = 0; i < a.N; i++) { insts.set(G.probeInstance(i), i * 4); extras.set([0.5, 0.25, i % 7, 0.125], i * 4); fleetOf[i] = (i % 5 === 0) ? 7 : (i % a.FLEETS); }
            // ONE packing, the SHIPPED one: floats 0..24 are struct Cull's planes and 24..40 its four vec4s, so the
            // generated pass is driven by the same bytes the shipped pass reads rather than by a second copy of them.
            const packed = G.packCullUniforms({ planes, eye, thresholds, count: a.N, lodCount: a.LODS, cap: a.CAP, fleetCount: a.FLEETS });
            out.packedLen = packed.length;
            const instBuf = dev.buffer({ data: insts, usage: ["storage"] }), exBuf = dev.buffer({ data: extras, usage: ["storage"] });
            const fBuf = dev.buffer({ data: fleetOf, usage: ["storage"] });
            const gCmds = dev.buffer({ data: new Uint32Array(a.REG * 5), usage: ["storage"] }), hCmds = dev.buffer({ data: new Uint32Array(a.REG * 5), usage: ["storage"] });
            const gRec = dev.buffer({ usage: ["storage"], size: a.REG * a.CAP * 3 * 16 }), hRec = dev.buffer({ usage: ["storage"], size: a.REG * a.CAP * 3 * 16 });
            const gPl = dev.buffer({ data: packed.slice(0, 24), usage: "uniform" }), gUni = dev.buffer({ data: packed.slice(24, 40), usage: "uniform" });
            const hU = dev.buffer({ data: packed, usage: "uniform" });
            const pG = dev.compute({ wgsl: gen.wgsl }); pG.bind("inst", instBuf).bind("extras", exBuf).bind("fleetOf", fBuf).bind("cmds", gCmds).bind("records", gRec).bind("u", gUni).bind("planes", gPl);
            const pH = dev.compute({ wgsl: G.cullLodWgsl({ fleets: true }) }); pH.bind("inst", instBuf).bind("extras", exBuf).bind("fleetOf", fBuf).bind("cmds", hCmds).bind("records", hRec).bind("cull", hU);
            const groups = Math.ceil(a.N / G.CULL_WORKGROUP);
            dev.frame(({ pass }) => { pass.dispatch(pG, groups); pass.dispatch(pH, groups); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
            out.gCmds = [...new Uint32Array(await dev.read(gCmds))]; out.hCmds = [...new Uint32Array(await dev.read(hCmds))];
            out.gRec = [...new Float32Array(await dev.read(gRec))]; out.hRec = [...new Float32Array(await dev.read(hRec))];
            out.errs = errs;
        } catch (e) { out.error = String(e && e.message || e).slice(0, 400); }
        return out;
    }` });
    ok("the harness ran the fleets configuration on both passes", r8.ok && r8.result && !r8.result.error && r8.result.gCmds, r8.ok ? (r8.result && r8.result.error) : (r8.reason || (r8.pageErrors || []).join("; ")));
    if (r8.ok && r8.result && !r8.result.error) {
        const F = r8.result;
        const counts = (c) => [...Array(REG)].map((_, i) => c[i * 5 + 1]);
        const rows = (rec, c) => { const out = [];
            for (let q = 0; q < REG; q++) for (let sl = 0; sl < c[q]; sl++) { const b = ((q * CAP) + sl) * 12; out.push(rec.slice(b, b + 12)); }
            return out.sort((x, y) => x[4] - y[4]); };
        const g = counts(F.gCmds), h = counts(F.hCmds), G2 = rows(F.gRec, g), H2 = rows(F.hRec, h);
        let bad = 0; for (let i = 0; i < Math.max(G2.length, H2.length); i++) { const a2 = G2[i] || [], b2 = H2[i] || [];
            if (a2.length !== b2.length || a2.some((v, j) => v !== b2[j])) bad++; }
        ok(`*** the FLEETS configuration -- the one the orrery runs -- generated: the same instance count in every one of the ${REG} regions (${g.join("/")}), all ${G2.length} records identical to the float, and BOTH passes driven by ONE packCullUniforms output ***`,
            g.join() === h.join() && bad === 0 && G2.length === H2.length && G2.length > 0 && F.packedLen === 40 && (F.errs || []).length === 0,
            `counts gen ${g.join("/")} vs hand ${h.join("/")}, ${G2.length} records each, ${bad} differing; the shipped packer's 40 floats sliced 0..24 to the planes uniform and 24..40 to the scalar struct; device errors ${(F.errs || []).length}`);
        const odd = G2.filter((r2) => r2[4] % 5 === 0), even = G2.filter((r2) => r2[4] % 5 !== 0);
        ok(`  and the fleet index is CLAMPED rather than trusted: ${odd.length} records asked for fleet 7 against a fleet count of ${FLEETS} and all of them landed in fleet ${FLEETS - 1}, in both passes`,
            odd.length > 0 && odd.every((r2) => r2[7] === FLEETS - 1) && even.every((r2) => r2[7] === r2[4] % FLEETS) && G2.every((r2, i) => r2[7] === H2[i][7]),
            `${odd.length} clamped, ${even.length} taken as given; the record's own fleet field, which is where a wrong one shows -- the six per-region COUNTS agree either way`);
        ok(`*** the frustum moved out of a storage buffer and into a UNIFORM whose element is array<vec4<f32>, 6> -- the type struct Cull gives it -- and the GRAPH did not change: the two transplants' bodies are the same text ***`,
            F.sameBody === true && F.ua && F.ua.join() === "planes" && /value:\s*array<vec4<f32>,\s*6>/.test(F.uaDecl || "") && F.reads.join() === "inst,extras,fleetOf",
            `shell declares ${F.uaDecl}; bodies identical ${F.sameBody}. Where the frustum lives is the SHELL's business -- planes.element(i) is one node either way`);
        const R8 = F.refusals || {};
        ok("REFUSED by name: a uniform array the shell does not declare, one whose length disagrees, and one the graph left unlabelled",
            /declares 1 uniform array\(s\).*and the shell .* declares 0/.test(R8.noArray || "") && /array<vec4<f32>, 6> and the shell .* says array<vec4<f32>, 5>/.test(R8.wrongLength || "") && /UNLABELLED uniform array/.test(R8.unlabelled || ""),
            `${(R8.noArray || "NOT REFUSED").slice(0, 80)} | ${(R8.wrongLength || "NOT REFUSED").slice(0, 80)} | ${(R8.unlabelled || "NOT REFUSED").slice(0, 80)}`);
        ok("the generated module validates and carries none of three's names",
            !/NodeBuffer_|object\./.test(F.gen) && validateWgsl(F.gen).length === 0 && /var<uniform> planes: planesBuf;/.test(F.gen),
            `${validateWgsl(F.gen).join("; ") || "validates"}`);
        report("WHAT IS LEFT OF cullLodWgsl IS ONE VARIANT: { occlusion: true }. It is NOT blocked by the pointer argument this file " +
            "and the roadmap have both called a blocker -- hizOccluded takes ptr<storage, array<f32>, read> because the HAND-WRITTEN " +
            "side factored the test into a function, and a graph inlines it and reads the buffer directly. What it does need is a mat4x4 " +
            "uniform (the view and projection separately), two while-loops whose bounds are computed, and a nested tile loop -- none of " +
            "which any graph here has emitted. Saying it is a pointer problem was wrong, and it is corrected here rather than repeated.");
    }
}

console.log("\n12. THE HMC LEAPFROG (v4370): a fleet kernel that already ships, generated, and held to it BIT FOR BIT");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const N = 64, { mu, eps, L } = HMC_FIXTURE, inv = fixtureInv();
    const batch = makeBatch(N, 77), qin = [...batch.qin], pin = [...batch.pin];
    // the answer key is hmcGpu's OWN f32 mirror -- Math.fround after every arithmetic op, which is what WGSL f32
    // computes -- and it is written for the shipped kernel, not for this round.
    const cpu = []; for (let i = 0; i < N; i++) cpu.push(...leapfrogF32(qin[2 * i], qin[2 * i + 1], pin[2 * i], pin[2 * i + 1], inv, mu, eps, L));
    const HSHELL = { name: "hmc leapfrog", workgroupSize: 64,
        storage: [{ name: "qin", element: "f32", access: "read" }, { name: "pin", element: "f32", access: "read" },
                  { name: "qout", element: "f32" }, { name: "pout", element: "f32" }],
        uniforms: [{ name: "sinv", type: "vec4" }, { name: "mu", type: "vec4" }] };
    const r9 = await runInEngineOrigin({ engineRoot: ENG, args: { N, inv, mu, eps, L, qin, pin, shipped: WGSL_HMC, shell: computeShell(HSHELL), HSHELL }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const P = await import("/render/physicsTsl.mjs"); const S = await import("/render/tslSource.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const out = {};
        try {
            const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
            const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: false, antialias: false }); await renderer.init();
            const g = P.makeHmcLeapfrogTsl(T, { count: a.N, inv: a.inv, mu: a.mu, eps: a.eps, L: a.L });
            await renderer.computeAsync(g.node);
            const emitted = renderer._nodes.getForCompute(g.node).computeShader;
            const gen = S.transplantCompute(emitted, a.shell);
            out.gen = gen.wgsl; out.reads = gen.reads; out.writes = gen.writes;
            const refuse = (fn) => { try { fn(); return null; } catch (e) { return String(e.message).slice(0, 300); } };
            const over = (o) => S.computeShell(Object.assign({}, a.HSHELL, o));
            out.refusals = {
                allWrite: refuse(() => S.transplantCompute(emitted, over({ storage: a.HSHELL.storage.map((s2) => ({ name: s2.name, element: "f32" })) }))),
                threeBuffers: refuse(() => S.transplantCompute(emitted, over({ storage: a.HSHELL.storage.slice(0, 3) }))),
            };
            // TWO REWRITES OF THE SHIPPED KERNEL, both algebraically identical to it, run beside it to say what
            // "bit for bit" is worth here. The patches are plain string splits -- a regex inside this template
            // literal loses its backslashes, which this file has now paid for four times.
            const halfAssoc = a.shipped.split("0.5 * P.eps * g.x").join("0.5 * (P.eps * g.x)").split("0.5 * P.eps * g.y").join("0.5 * (P.eps * g.y)");
            const distributed = a.shipped.split("return vec2<f32>(P.i00 * dx + P.i01 * dy, P.i01 * dx + P.i11 * dy);")
                .join("return vec2<f32>(P.i00 * qx - P.i00 * P.mu0 + P.i01 * qy - P.i01 * P.mu1, P.i01 * qx - P.i01 * P.mu0 + P.i11 * qy - P.i11 * P.mu1);");
            out.patched = { halfAssoc: halfAssoc !== a.shipped, distributed: distributed !== a.shipped };

            const cv = document.createElement("canvas"); cv.width = 32; cv.height = 32;
            const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
            const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
            const qB = dev.buffer({ data: new Float32Array(a.qin), usage: ["storage"] }), pB = dev.buffer({ data: new Float32Array(a.pin), usage: ["storage"] });
            // the shipped kernel's struct Params: six f32 then TWO u32, so it is packed through one ArrayBuffer.
            const ab = new ArrayBuffer(32), fv = new Float32Array(ab), uv = new Uint32Array(ab);
            fv[0] = a.inv[0]; fv[1] = a.inv[1]; fv[2] = a.inv[2]; fv[3] = a.mu[0]; fv[4] = a.mu[1]; fv[5] = a.eps; uv[6] = a.L; uv[7] = a.N;
            const pU = dev.buffer({ data: new Uint8Array(ab), usage: "uniform" });
            const gU = dev.buffer({ data: new Float32Array([a.inv[0], a.inv[1], a.inv[2], a.eps, a.mu[0], a.mu[1], 0, 0]), usage: "uniform" });
            const mkOut = () => [dev.buffer({ data: new Float32Array(a.N * 2), usage: ["storage"] }), dev.buffer({ data: new Float32Array(a.N * 2), usage: ["storage"] })];
            const [gq, gp] = mkOut(), [hq, hp] = mkOut(), [rq, rp] = mkOut(), [dq, dp] = mkOut();
            const pipe = (wgsl, qo, po, uni, uname) => { const p2 = dev.compute({ wgsl }); p2.bind("qin", qB).bind("pin", pB).bind("qout", qo).bind("pout", po).bind(uname, uni); return p2; };
            const pG = pipe(gen.wgsl, gq, gp, gU, "u"), pH = pipe(a.shipped, hq, hp, pU, "P");
            const pR = pipe(halfAssoc, rq, rp, pU, "P"), pD = pipe(distributed, dq, dp, pU, "P");
            dev.frame(({ pass }) => { pass.dispatch(pG, 1); pass.dispatch(pH, 1); pass.dispatch(pR, 1); pass.dispatch(pD, 1); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
            const rd = async (x) => [...new Float32Array(await dev.read(x))];
            out.gq = await rd(gq); out.gp = await rd(gp); out.hq = await rd(hq); out.hp = await rd(hp);
            out.rq = await rd(rq); out.rp = await rd(rp); out.dq = await rd(dq); out.dp = await rd(dp);
            out.errs = errs;
        } catch (e) { out.error = String(e && e.message || e).slice(0, 500); }
        return out;
    }` });
    ok("the harness ran the generated pass, the shipped kernel and two rewrites of it on one device", r9.ok && r9.result && !r9.result.error && r9.result.gq,
        r9.ok ? (r9.result && r9.result.error) : (r9.reason || (r9.pageErrors || []).join("; ")));
    if (r9.ok && r9.result && !r9.result.error) {
        const F = r9.result, rel = (x, y) => Math.abs(x - y) / Math.max(1, Math.abs(y));
        let gc = 0, hc = 0, gh = 0, exact = 0, total = 0, moved = 0, halfDiff = 0, distDiff = 0, distWorst = 0;
        for (let i = 0; i < N; i++) for (const [k, ci] of [[2 * i, 4 * i], [2 * i + 1, 4 * i + 1]]) {
            for (const [G, H, RR, DD, C, IN] of [[F.gq, F.hq, F.rq, F.dq, cpu[ci], qin[k]], [F.gp, F.hp, F.rp, F.dp, cpu[ci + 2], pin[k]]]) {
                gc = Math.max(gc, rel(G[k], C)); hc = Math.max(hc, rel(H[k], C)); gh = Math.max(gh, rel(G[k], H[k]));
                total++; if (G[k] === H[k]) exact++; if (G[k] !== IN) moved++;
                if (RR[k] !== H[k]) halfDiff++;
                if (DD[k] !== H[k]) { distDiff++; distWorst = Math.max(distWorst, Math.abs(DD[k] - H[k])); }
            }
        }
        ok(`*** the generated pass is BIT-IDENTICAL to the SHIPPED swek-hmc-bench kernel on all ${total} endpoint values -- not a tolerance, 0 ***`,
            exact === total && gh === 0 && total === N * 4 && (F.errs || []).length === 0,
            `${exact}/${total} exact, worst relative ${gh.toExponential(3)}, device errors ${(F.errs || []).length}`);
        ok(`  and BOTH agree with hmcGpu's own f32 mirror to ${gc.toExponential(3)}, inside the floor it measured for real hardware (${F32_FLOOR_HMC})`,
            gc <= F32_FLOOR_HMC && hc <= F32_FLOOR_HMC && Math.abs(gc - hc) < 1e-12,
            `generated ${gc.toExponential(3)}, shipped ${hc.toExponential(3)}, floor ${F32_FLOOR_HMC}, tol ${HMC_TOL}`);
        // AN AGREEMENT BETWEEN TWO PASSES THAT DID NOTHING WOULD ALSO BE PERFECT. So: every value moved off its
        // input, and the 64 chains land in 128 distinct coordinates rather than on one attractor.
        ok(`  and the agreement is not two passes doing nothing: all ${moved} values moved off their inputs and the ${N} chains land in ${new Set(F.gq).size} distinct q coordinates`,
            moved === total && new Set(F.gq).size === N * 2, `${moved}/${total} moved, ${new Set(F.gq).size} distinct of ${N * 2}`);

        // *** WHAT BIT-IDENTICAL IS WORTH, MEASURED IN BOTH DIRECTIONS, BECAUSE THIS ROUND'S FIRST CLAIM ABOUT IT
        // WAS WRONG. *** physicsTsl's header said writing the kick as 0.5*(eps*g) rather than (0.5*eps)*g would be
        // algebraically identical and not bit-identical. Run, it is bit-identical on every value: 0.5 is a power of
        // two, so that multiply is exact and re-association across it loses nothing. The example was wrong; the rule
        // is not, and the DISTRIBUTED gradient is what shows it.
        ok(`*** re-associating across the 0.5 changes NOTHING (${halfDiff}/${total}), because 0.5 is a power of two -- the header's own example was wrong and this is the correction ***`,
            F.patched.halfAssoc === true && halfDiff === 0, `${halfDiff} of ${total} differ`);
        ok(`*** but the gradient DISTRIBUTED -- i00*qx - i00*mu0 for i00*(qx - mu0) -- moves ${distDiff} of ${total} endpoints, so bit-identity is a claim that could have failed ***`,
            F.patched.distributed === true && distDiff > total / 2 && distWorst > 0,
            `${distDiff}/${total} differ, worst ${distWorst.toExponential(3)}`);
        ok(`  AND THE STRONGER CLAIM IS DOING THE WORK: that rewrite is off by ${distWorst.toExponential(3)}, which is ${(F32_FLOOR_HMC / distWorst).toFixed(0)}x INSIDE the ${F32_FLOOR_HMC} floor -- a tolerance would have passed it and "0" does not`,
            distWorst < F32_FLOOR_HMC && distWorst < HMC_TOL,
            `worst ${distWorst.toExponential(3)} against floor ${F32_FLOOR_HMC} and tolerance ${HMC_TOL}`);

        ok("SPECIFIED OPERATIONS ONLY survives the graph: the generated module carries no transcendental, which is what makes an f32 bit claim possible at all",
            !/\b(exp|log|log2|sin|cos|tan|sqrt|pow|inverseSqrt)\s*\(/.test(F.gen) && validateWgsl(F.gen).length === 0 && !/NodeBuffer_|object\./.test(F.gen),
            validateWgsl(F.gen).join("; ") || "validates, and carries none of three's names");
        ok("the shell states READ-ONLY where the shipped kernel does, and the transplant refuses a shell that does not",
            F.reads.join() === "qin,pin" && F.writes.join() === "qout,pout" &&
            /declares 4 read_write and 0 read/.test(F.refusals.allWrite || "") && /touches 4 storage buffer\(s\) and the shell .* names 3/.test(F.refusals.threeBuffers || ""),
            `reads ${F.reads.join()}, writes ${F.writes.join()}; ${(F.refusals.allWrite || "NOT REFUSED").slice(0, 70)}`);
        report("NOT CLAIMED HERE: the kernel's full SIGNATURE. L and n are uniforms in WGSL_HMC and baked constants in the " +
            "graph, because a TSL Loop wants a JavaScript bound -- lyapunovNodes set that precedent with samples and warmup. " +
            "So this is the kernel's ARITHMETIC at the fixture's own L, and the shipped pass was fed the same L through its " +
            "uniform so the two are answering one question. A graph whose step count comes from a buffer is a round of its own.");
    }
}

// SABOTAGE LOG -- applied, gate run, exit code read, restored. MEASURED at v4321.
//   A  the Lyapunov log's 2 dropped (log|r(1 - x)| for log|r(1 - 2x)|) -> exit=1, 9 red: the source line, and on every path and
//      backend the exponent reads 0.000077 for ln 2 and the window and the bright end both read 0 -- the same sabotage
//      lyapunovWgsl's gate logged at v4315, in TSL, caught four ways.
//   B  the Heidler shape with (t/t1) for (t/t1)^2 -> exit=1, 5 red: the source line, and on every path and backend the peak
//      over i0 reads 0.85081 at the true eta and 0.9076 at the published one -- heidlerWgsl's sabotage B, reproduced in TSL.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: cullLodWgsl({ occlusion: true }), the ONE variant left -- and NOT because of the pointer argument this file called a " +
    "blocker for two rounds: hizOccluded takes ptr<storage, array<f32>, read> because the hand-written side factored the test into a function, and a " +
    "graph inlines it and reads the buffer. What it actually needs is a mat4x4 uniform, two while-loops whose bounds are computed, and a nested tile " +
    "loop, none of which any graph here has emitted; whether struct Cull can be ONE binding for the generated pass, which it cannot while three emits a " +
    "uniformArray as its own uniform rather than as a struct member -- the bytes are the same 40 floats, the bindings are two; whether the record SLOTS " +
    "a survivor lands in are the same in both passes, which they are not and cannot be -- an atomicAdd hands them out in whatever order the lanes " +
    "arrive, so the claim is over the sorted set and the per-region counts, and it says so; the Lyapunov Loop's cost through three, timed by nobody; " +
    "and a real GPU's log() and exp() against SwiftShader's; and, for the HMC leapfrog, a graph whose STEP COUNT comes from a uniform rather than from a JavaScript constant -- WGSL_HMC takes L and n as uniforms and a TSL Loop wants a bound, so section 12 is the kernel's arithmetic at one L and says so.");
process.exit(fails ? 1 : 0);
