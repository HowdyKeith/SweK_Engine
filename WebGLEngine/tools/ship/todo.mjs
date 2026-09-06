// WebGLEngine/tools/ship/todo.mjs -- v3580
// ---------------------------------------------------------------------------------------------------------------
// THE STANDING WORK LIST, AS DATA RATHER THAN AS PROSE IN A CHANGELOG NOBODY GREPS.
//
// v3579's review found nine items. One of them -- the contact closure -- was done at v3580 and IS LEFT HERE WITH
// ITS OUTCOME rather than deleted, because *** THE OUTCOME WAS A REFUTATION AND A DELETED ITEM WOULD LOSE THAT
// THE QUESTION WAS EVER ASKED. *** That is the same rule BLOCKED_ON_REBUILD follows at v3571 and UNPLACED
// follows in pageSections: a register that only holds open work forgets why the closed work closed.
//
// *** EVERY ITEM CARRIES ITS EVIDENCE, AND `evidence` IS A COMMAND SOMEBODY CAN RUN. *** An item asserting "the
// gates are untimed" is an opinion; an item that says which file holds three entries and which tool writes it is
// a fact somebody can check in ten seconds and delete when it stops being true. A TODO whose claims cannot be
// re-derived rots exactly like the derived facts staleness.mjs exists to catch -- and this file is small enough
// that nobody would notice it rotting.
//
// STATUSES: "open" | "done" | "wont" -- and `wont` needs a reason, because an item dropped without one is
// indistinguishable from an item forgotten.
"use strict";
import { pathToFileURL } from "node:url";

export const TODO = [
    {
        id: "contact-closure",
        status: "done", version: "v3580",
        title: "Drive the contact list that v3569 built and nothing consumed",
        why: "swk_contacts landed in the shim at v3037 and in the ARTIFACT at v3569, and had ZERO consumers " +
             "across the whole tree. The block calls itself 'round 1 of 3 (exports -> gate -> overlay)'.",
        outcome:
            "*** THE CLOSURE THE SHIM'S HEADER PROMISED DOES NOT EXIST. *** reported/needed is 1.742 at the " +
            "impact step, 14 to 30 while settling, and exactly 2 only at rest, because box3d runs a SOLVE and a " +
            "RELAX pass per substep and both accumulate totalNormalImpulse -- they agree only when the state is " +
            "not changing. WHAT SURVIVES: the static closure sum/2 = m g dt to four digits across dt 1/60-1/240 " +
            "and substeps 1-16, and normalImpulse/totalNormalImpulse = 1/(2*substeps) exactly, which is the " +
            "pre-v3569 bug's magnitude measured. Shim header corrected in place.",
        evidence: "node physics/mechanics/contactImpulse-selfcheck.mjs",
    },
    {
        id: "contacts-overlay",
        status: "done", version: "v3586",
        title: "Round 3 of the contacts block: the visual overlay",
        why: "The shim declared three rounds at v3037 -- exports, gate, overlay -- and the third was unbuilt for " +
             "549 versions. Nothing could DRAW a contact because the browser loader had no accessor at all.",
        outcome:
            "box3d-contacts.html, plus readContacts()/supportsContacts() on the loader. *** IT DRAWS WHAT v3580 " +
            "ESTABLISHED IS SOUND AND LABELS WHAT IS NOT: *** arrows are normalised WITHIN THE FRAME, because " +
            "an absolute scale would show a quantity whose meaning changes with the regime, and the panel shows " +
            "the static closure live, labelled meaningless while the stack moves. THE FIRST DRAFT INVENTED THE " +
            "API and would have rendered a blank canvas that reads as a physics bug. In the render-QA manifest, " +
            "since this gate cannot screenshot.",
        evidence: "node tools/ship/contactOverlay-selfcheck.mjs",
    },
    {
        id: "pageless-remainder",
        status: "done", version: "v3586",
        title: "The pageless remainder was three jobs wearing one number",
        why: "The item said 27 instruments need the v3327 split applied.",
        outcome:
            "*** IT WAS THREE DIFFERENT JOBS. *** 21 have NO MODULE AT ALL -- a standalone gate the bench can " +
            "NEVER serve however much work is done -- 9 have a module and no split (the real mechanical job, a " +
            "fifth the size the number suggested), and SIX ALREADY QUALIFIED AND WERE STILL PAGELESS. Those six " +
            "were all registered BY ME with page: null in the same round as the check meant to cover this " +
            "ground: v3585 asked 'is there an ENTRY for this gate' and never asked 'does this entry QUALIFY and " +
            "lack a page'. Registered-and-pageless is a different question from unregistered, and ANSWERING ONE " +
            "FELT LIKE ANSWERING BOTH. Both directions are in registryOrphans now, plus the reverse -- a bench " +
            "page whose module cannot report -- WHICH CAUGHT ME AGAIN ten minutes later when I pointed the new " +
            "overlay instrument at the bench.",
        evidence: "node tools/ship/registryOrphans.mjs",
    },
    {
        id: "gate-timings-rest",
        status: "open", size: "small",
        title: "331 gates still have no timing",
        why: "The record covers 580 of 911. The runner will now fill the rest incrementally, so this closes by " +
             "RUNNING rather than by building anything -- and a run that dies partway through no longer wastes " +
             "the gates it did measure.",
        note: "gateBudget reasons about the general population, so the untimed third is a gap in evidence " +
              "rather than a wrong budget. tools/ship/timingCoverage-selfcheck.mjs reports the fraction.",
        evidence: "node tools/ship/timingCoverage-selfcheck.mjs",
    },
    {
        id: "instrument-pages",
        status: "done", version: "v3581",
        title: "The instruments added this session had no page",
        why: "Six new instruments carried page: null, including two ENTIRE NEW AREAS (control, crystal) with " +
             "no visual surface at all -- the debt policyMass sat in until v3030.",
        outcome:
            "*** THE GATES CANNOT MOVE TO THE BROWSER -- they import box3d through node -- BUT v3327 ALREADY " +
            "SPLIT EVERY ONE INTO A REPORTING TOOL AND A GATE, AND THE REPORTING HALF IS WHAT A PAGE WANTS. *** " +
            "So instrument-bench.html is generic rather than six pages: /instruments/report runs reportLines() " +
            "in node and the page renders the module's own lines VERBATIM. Seven instruments gained a door " +
            "without one being written for them, and any future module following the split gets one free. IT " +
            "SHOWS A REPORT, NOT A VERDICT -- printing PASS while running only the reporting half would assert " +
            "something it never checked. 34 pageless became 27.",
        evidence: "node -e 'import(\"./physics/instruments.mjs\").then(m=>console.log(m.INSTRUMENTS.filter(i=>i.page===\"instrument-bench.html\").length))'",
    },
    {
        id: "instrument-pages-rest",
        status: "done", version: "v3585",
        title: "Instruments with no page, and gates with no instrument",
        why: "27 instruments were pageless and the bench could only serve modules exposing reportLines(). The " +
             "assumption was that 26 of them PREDATE the v3327 split and would each need the split applied.",
        outcome:
            "*** THE ASSUMPTION WAS BACKWARDS FOR 22 OF THEM: THEY HAD ALREADY FOLLOWED THE SPLIT AND WERE " +
            "GETTING NOTHING, BECAUSE THE BENCH SERVES THE REGISTRY AND THEY WERE NOT IN IT. *** The real " +
            "defect was the registry's one-directional check -- an entry pointing at a missing gate was caught, " +
            "a gate that should have an entry was not. 22 registered from their own headers (LIFTED, not " +
            "authored, and the gate asserts each key is a prefix of its module's opening). Bench 7 -> 30, " +
            "instruments 113 -> 136.",
        evidence: "node tools/ship/registryOrphans-selfcheck.mjs",
    },
    {
        id: "instrument-pages-remainder",
        status: "open", size: "small",
        title: "The instruments that still have no page do not follow the v3327 split",
        why: "What is left is the ACTUAL version of the old item: modules with a gate and no reportLines(), so " +
             "the bench has nothing to render for them. Applying the split is a small mechanical job per module " +
             "and gives each a door for free.",
        evidence: "node tools/ship/registryOrphans.mjs   # narrow count returns to nonzero as modules gain the split",
    },
    {
        id: "unsorted-drawer-layout",
        status: "open", size: "small",
        title: "Are 21 nested <details> navigable on the rig?",
        why: "*** SPLIT OUT OF placement-editor-browser RATHER THAN CLOSED WITH IT. *** jsdom has no layout and " +
             "no paint, so a green headless run says the drawer BUILDS, not that it is usable. Marking the " +
             "parent done and letting this ride along would be the headless test quietly answering a question " +
             "it never asked.",
        note: "Specifically: whether the buckets want a filter box, and whether A-Z is findable at that depth.",
        evidence: "open server.html on the rig and expand SweK Engine Unsorted:",
    },
    {
        id: "soft-body-label",
        status: "done", version: "v3582",
        title: "'soft body' and 'soft bodies' were the same area under two spellings",
        why: "xpbd-compliance sat alone under one while plastic, physics-lab and sph-hydrostatic sat under the " +
             "other -- and compliance-selfcheck.mjs lives in physics/xpbd/, THE SAME DIRECTORY AS TWO OF THE " +
             "THREE. A label that reads as a category and PARTITIONS BY TYPO.",
        outcome:
            "Renamed, and *** THE RENAME WAS NOT THE FIX. *** It took a second; the reason it survived 104 " +
            "instruments is that NOTHING CHECKED AREA LABELS AT ALL. tools/ship/areaHygiene.mjs normalises " +
            "labels and fails on any collision. AND THE NORMALISER TOOK THREE VERSIONS TO CATCH ITS OWN " +
            "MOTIVATING PAIR, the second shipping with a header saying it was fixed: the English plural of a " +
            "word ending in y is ies, and no trailing-s removal undoes it. It passed every OTHER pair while " +
            "failing the one it existed for.",
        evidence: "node tools/ship/areaHygiene-selfcheck.mjs",
    },
    {
        id: "method-area",
        status: "done", version: "v3582",
        title: "The `method` area held 26 instruments and was a mixed bag",
        why: "ship-ritual, launch-index and population-census are ship tooling rather than physics method and " +
             "sat beside hmc-kernel and ising-kernel.",
        outcome:
            "26 -> 22. The FOUR instruments about THE SHIP EVENT rather than about a method of measurement " +
            "moved to a new `ship` area -- ship-ritual measures 'the steps of a ship, their order'; " +
            "delivered-assets measures whether assets resolve 'IN THE SHIPPED TREE'. A RELEASE CHECKLIST IS NOT " +
            "A METHOD OF MEASUREMENT, which is a category error rather than a crowding problem. *** THE OTHER " +
            "22 STAYED, BECAUSE THERE IS NO STRUCTURAL DISCRIMINATOR: *** the obvious rule -- where the module " +
            "lives -- fails, since tools/ship holds gate-selection and coverage-triage (method by any reading) " +
            "and tools/roundhouse holds GPU kernels. Splitting further means naming subjects, which v3576 " +
            "already concluded is Keith's call. AND NO CAP IS BORROWED: fifteen is a rule about a drawer on a " +
            "screen, not an index label. The size is REPORTED, not enforced.",
        evidence: "node tools/ship/areaHygiene.mjs",
    },
    {
        id: "method-area-rest",
        status: "open", size: "medium",
        title: "22 instruments still share the `method` label",
        why: "Whether that is one subject or four is a reading of what each instrument CLAIMS, not something " +
             "the file layout can answer -- areaHygiene reports `method` spanning five trees (physics, tools, " +
             "ui, render, ai-bridge) as a HINT rather than a defect.",
        note: "Deliberately left as naming work. v3576 reached the same conclusion about the page panels and " +
              "for the same reason: a tool that auto-assigned would be a second registry disagreeing with the " +
              "first.",
        evidence: "node tools/ship/areaHygiene.mjs   # largest areas + spread",
    },
    {
        id: "crystal-expansion",
        status: "done", version: "v3583",
        title: "Crystallography is one instrument, and the 1D limit is its only cross-check",
        why: "The absences are exact and the optics key is strong, but the area has a single entry.",
        note: "Two candidates with the same exact-zero character. A POWDER PATTERN: ring positions come from " +
              "|G| exactly and the MULTIPLICITY of each hkl family is an INTEGER. And FRIEDEL'S LAW: " +
              "|F(hkl)| = |F(-h-k-l)| exactly and for free -- *** AND IT BREAKS UNDER ANOMALOUS SCATTERING, " +
              "which is a rare case where turning a key OFF is itself the physics. ***",
        outcome:
            "*** r3(7) = 0 IS A SECOND KIND OF EXACT ZERO -- ARITHMETIC RATHER THAN INTERFERENCE. *** " +
            "Multiplicity by two routes that share nothing (a lattice triple-loop against theta3(q)^3), 121 " +
            "integers, zero mismatches. Friedel exactly 0.000e+0 across 2916 pairs. AND THE OBVIOUS BREAK DOES " +
            "NOT WORK: anomalous scattering alone leaves the law intact because FCC is centrosymmetric -- it " +
            "takes BOTH conditions, a 2x2 with three exact zeros in it.",
        evidence: "node physics/crystal/structureFactor.mjs",
    },
    {
        id: "lockstep-bridge",
        status: "done", version: "v3583",
        title: "Point v3573's discretisation bridge at box3dLockstep",
        why: "v3573 proved exp(A*dt) preserves the unstable-mode count at every dt, on 1000 of 1000 systems. " +
             "*** box3dLockstep DEPENDS ON THAT CLAIM WITHOUT STATING IT: a fixed-dt stepper IS a " +
             "discretisation, and 'the physics is the same at every dt' is exactly the statement that this map " +
             "preserves stability. *** Nothing connects the two files.",
        note: "It would also give the weld-joint result and the linearPolicy result a shared key instead of two " +
              "separate ones.",
        outcome:
            "*** THE BRIDGE IS A DISAMBIGUATION, NOT A CONNECTION, AND THE REVIEW'S SECOND HALF WAS WRONG. *** " +
            "Lockstep does NOT depend on v3573's claim: that theorem is about STABILITY at every dt, lockstep " +
            "needs BIT-IDENTICAL trajectories, and two peers at 1/30 and 1/60 are both running stable physics " +
            "while diverging ON TICK 1. Writing the shared key would have asserted the theorem protects the " +
            "session -- the most dangerous kind of wrong, because IT WOULD HAVE PASSED. Shipped instead: the " +
            "guard that was actually missing, since tryStep's dt was a DEFAULT PARAMETER and nothing checked it.",
        evidence: "node physics/control/controlStateSpace-selfcheck.mjs   # section 4",
    },
    {
        id: "erosion-device-port",
        status: "wont",
        title: "Erosion on the device: world/erosion.js's hydraulic and thermal passes as a render/stepLoop.mjs kernel",
        why: "docs/TSL-ROADMAP.md step 10 item 4 (task 41): two heightfields ping-ponged N steps, one readback, held " +
             "to the CPU erosion per texel at a stated tolerance -- or a written won't-do with the measurement beside it.",
        reason: "MEASURED at v4482 and not worth porting yet: a 160x160 tile costs 1.9 / 3.0 / 2.4 ms (fill / hydraulic / " +
                "thermal) on the synthetic base, 12.3 ms on the engine's generator in JavaScript and 8.3 ms in the WASM crate, " +
                "once per 128 voxels of travel and already sliced under a 3 ms prewarm budget, so there is no hitch to remove; " +
                "the passes are SEQUENTIAL, so no kernel can be held to them -- the thermal pass is Gauss-Seidel and a Jacobi " +
                "dispatch differs on 2,678 cells, the 1,500 droplets write 6,485 cells two or more times and reversed they move " +
                "12,393 cells by up to 2.4 voxels -- and a twin off by voxels is a third generator under the one-generator-per-" +
                "tile rule; and nothing on the device consumes an eroded field (chunk fill is CPU), so a pass would be a compute " +
                "plus a readback. RE-OPEN when a device consumer exists (the orrery landing's terrain), as a Jacobi pass gated " +
                "to itself in f32 under the kernel contract, not as a twin of erosion.js.",
        evidence: "node tools/ship/erosionMeasure-selfcheck.mjs",
    },
    {
        id: "slug-node-material",
        status: "wont",
        title: "A TSL Slug material (SlugNodeMaterial) for the three pages that carry three 0.178",
        why: "docs/TSL-ROADMAP.md step 7 item 4 (task 4): the v4457 review said the only place a TSL Slug material pays is a " +
             "three-0.178 WebGPURenderer page, and that the device shell was not its route because the transplant refused more " +
             "than one varying. Measure first: write the fragment as nodes, emit it, count what three emits.",
        reason: "MEASURED at v4484. render/slugTsl.mjs is the fragment as nodes and render/tslSource.mjs carries it into the SHIPPED " +
                "pipeline's shell: on WebGPU and on WebGL2 the generated fragment draws 'Sphinx 42% AV' at 28 px on 23,040 of 23,040 " +
                "pixels identical to the shipped Slug pipeline (worst 0), so the route sentence is withdrawn. No material, because: " +
                "three 0.178 uploads an RGIntegerFormat texture only as RG32Sint/RG32Uint (the rg16uint band atlas would be repacked " +
                "at twice the bytes) and on this box a data-bearing float or uint DataTexture upload takes the page down, so a " +
                "NodeMaterial on three's renderer could not even be measured here; of the three pages only orrery-gpu.html draws " +
                "text and it does so through render/slugDevice.mjs on the device already; and three's emitted core is 1.7x the " +
                "hand-written one in lines with no float-to-uint bitcast (the root code gathers sign bits by comparison, -0.0 " +
                "read as positive). Re-open only if a three-rendered page needs text three itself must draw.",
        evidence: "node tools/ship/slugTsl-selfcheck.mjs",
    },
    {
        id: "slug-atlas-worker",
        status: "wont",
        title: "A Web Worker parsing and packing the label font at page load",
        why: "docs/TSL-ROADMAP.md step 7 item 7 (task 7): the reviewed plan ran opentype.js in a worker on every page load. " +
             "Measure parseFont + packAtlas for the Plex label subset in the browser first; if it is under a frame the worker " +
             "is not worth its message-passing code and the ticket is the build step alone.",
        reason: "MEASURED at v4487 in the harness's headless Chromium, the 67-glyph label alphabet, cold / warm: Plex 29 / 20 ms " +
                "(parse 6, outline 3, pack 20), Cinzel 16 / 11, JetBrains Mono 8 / 8, Source Sans 3 10 / 13 -- about one frame, once, " +
                "per family. A worker would spend more lines on messages than the work it hid, and the build step removes the work " +
                "instead: tools/ship/packFonts.mjs bakes each family's alphabet into a .slug.bin the runtime decodes and uploads " +
                "(fromPack on both font classes), held stale-or-current byte for byte and pixel-identical to the parse path on both backends.",
        evidence: "node tools/ship/fontPacks-selfcheck.mjs",
    },
    {
        id: "slug-bidi-shaping",
        status: "wont",
        title: "Bidi and Arabic shaping for Slug text (the reviewed plan's two-letter presentation-form table and whole-string reverse)",
        why: "docs/TSL-ROADMAP.md step 7 item 11 (task 11): the plan proposed 'bidi shaping' for the Slug text path.",
        reason: "COUNTED at v4492 across every vendored face (Plex, Source Sans 3, Cinzel, JetBrains Mono, Sawarabi Gothic): 0 Hebrew, " +
                "0 Arabic and 0 Devanagari codepoints in any cmap, so a Hebrew string on Plex lays out as .notdef three times over -- there " +
                "is no glyph for shaping to shape and no presentation form to select. And the plan's mechanism is not the algorithm: a " +
                "whole-string reverse of 'abc <hebrew> 123' yields '321 <hebrew> cba', while UAX #9 keeps the Latin and the digits in place " +
                "and reverses the Hebrew run alone; a two-letter joining table is not Arabic shaping (four forms per letter, ligatures, marks). " +
                "Doing this properly is a font with the script, a GSUB reader for its joining features and a UAX #9 run resolver -- a round " +
                "of its own, started when somebody has a right-to-left label to draw, not before.",
        evidence: "node tools/ship/slugShaping-selfcheck.mjs",
    },
    {
        id: "slug-cjk-msdf-fallback",
        status: "wont",
        title: "An MSDF fallback for CJK drawn by canvas fillText, for glyphs 'too dense for Slug'",
        why: "docs/TSL-ROADMAP.md step 7 item 11 (task 11): the plan proposed drawing CJK through a canvas fillText fallback instead of Slug.",
        reason: "MEASURED at v4490 and v4492: Sawarabi Gothic (vendored, 6,945 glyphs, static glyf) maps every codepoint of the rig's kanji " +
                "and kana text to a real glyph, every one packs into the same atlas Slug draws from, and slug-rig.html's dense wall walks 1.22x " +
                "Plex's curves per band (8.00 against 6.55; 19 at most against 17) -- a dense face, not one Slug cannot draw. Canvas fillText " +
                "is not an MSDF either: it rasterises at one size and blurs when scaled, which is the problem Slug exists to remove. If a " +
                "rig ever measures the CJK wall past the plan's 1.5 ms the answer is the band count, which the rig page reports beside " +
                "every timing, not a second renderer.",
        evidence: "node tools/ship/slugShaping-selfcheck.mjs",
    },
    {
        id: "slug-ring-buffer",
        status: "wont",
        title: "A ring buffer for Slug label vertices (the reviewed plan's per-frame allocator, resetting to 0 on overflow)",
        why: "docs/TSL-ROADMAP.md step 7 item 12 (task 12): measure the per-frame reupload before building the plan's ring, whose reset carries no fence.",
        reason: "MEASURED at v4493 (tools/ship/slugReupload-selfcheck.mjs, 24 labels x 40 frames, SwiftShader, CPU-timed with the queue drained): " +
                "the old path destroyed and created 1,920 buffers over 40 frames for 115 KiB of vertices a frame; the batches now write into " +
                "the buffers they have when the stream fits (queue.writeBuffer / bufferSubData, ordered behind the frame already submitted -- the " +
                "fence the ring lacked, for free), reallocate on growth, and skip the index write because the index stream is structural. " +
                "Reuse allocates nothing once warm: recreate 9.6 / 0.9 ms a frame, reuse 8.7 / 0.6, draw-only 8.4 / 0.2 (WebGPU / WebGL2). " +
                "What a ring would add is one allocation instead of 48 per frame -- already zero -- and a reset that overwrites text the " +
                "previous frame is still drawing. If a rig measures the reuse write itself past a frame at hundreds of labels, the answer " +
                "is one shared vertex buffer with a per-frame region and a fence, built then, against that number.",
        evidence: "node tools/ship/slugReupload-selfcheck.mjs",
    },
    {
        id: "ktx2-basis",
        status: "wont",
        title: "KTX2 / Basis Universal compressed textures (a transcoder, a build step, a loader) for the engine's textures",
        why: "Sidebar task 18: measure the texture bytes before deciding on a compressed-texture pipeline.",
        reason: "MEASURED at v4495 by tools/ship/textureBytes.mjs on the tree: 16 raster files, 378 KiB on disk, 18.05 MiB on the GPU as " +
                "RGBA8 with mips -- 13.8 MiB of it one 313 KB JPEG in demos/resume_fx, the rest tree and torch sprites under 3 KB each. " +
                "68 source files make textures procedurally (DataTexture, CanvasTexture, device.texture, texImage2D) against 15 that load " +
                "an image, so the population a transcoder would serve is the smaller one, and a transcoder of a few hundred KB would be the " +
                "largest texture-shaped fetch in the build. Verdict derived, not typed: not-yet, under a 64 MiB GPU floor. The rig's " +
                "EXTERNAL asset library (user-accumulated, outside the tree) is the population that could change this: run " +
                "`node tools/ship/textureBytes.mjs <external>/asset_library --write tools/ship/texture-bytes.json` there and the gate grades it.",
        evidence: "node tools/ship/textureBytes-selfcheck.mjs",
    },
];

export const byStatus = (s) => TODO.filter((t) => t.status === s);

export function reportLines() {
    const L = [];
    const open = byStatus("open"), done = byStatus("done"), wont = byStatus("wont");
    L.push("[todo] the standing work list, with evidence you can run");
    L.push("");
    L.push("  " + open.length + " open, " + done.length + " done, " + wont.length + " won't");
    L.push("");
    for (const t of open)
        L.push("  OPEN  " + (t.size || "?").padEnd(8) + t.id.padEnd(26) + t.title);
    for (const t of done)
        L.push("  DONE  " + (t.version || "").padEnd(8) + t.id.padEnd(26) + t.title);
    for (const t of wont)
        L.push("  WONT  " + "".padEnd(8) + t.id.padEnd(26) + t.title + "   (" + t.reason + ")");
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}
