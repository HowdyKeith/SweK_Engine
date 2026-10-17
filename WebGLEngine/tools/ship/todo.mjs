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

    // ----------------------------------------------------------------------------------------------------------
    // v4870: THE REAL-FLIGHT BACKLOG, IN THE ORDER KEITH ASKED FOR IT TO BE DONE. These were scoped in conversation after v4869/v4870 gave
    // es-flight6dof.html a fruit-fly pilot and a GPU-Brain pilot, in answer to "do we have dogfights... can we pick which brain is in
    // gunner seat... can we swap in actual models/gltf... can the pilots eject if the ship is going to blow up?" -- and then "also, in
    // server.html in the peer list... can we add whether the fly brain is available? then the peers brains would be included in the
    // choose roster selection". Each `evidence` below prints what is TRUE TODAY, so the item goes red the moment it stops being true
    // (todo-selfcheck prints the open list; the order is the `order` field, 1 first).
    // ----------------------------------------------------------------------------------------------------------
    {
        id: "flight-guns-dogfight",
        status: "open", size: "medium", order: 1,
        title: "Guns on the real-flight model, and a dogfight task: two aircraft, a fixed forward gun each, a score for hits landed and hits taken",
        why: "es-flight6dof.html flies one aircraft against a tracking task and nothing shoots. The tree already has the pieces on the ground: " +
             "physics/ballistics.mjs and physics/turret.mjs (shells, an exact aim solution, a reload) and brain/gunnerPolicy.mjs (a gunner for a car). " +
             "The real-flight model has no gun mount, no round count, no hit test against a body that is not a car, and no task that scores a fight " +
             "-- brain/flightTask.mjs scores tracking error only.",
        progress: "BUILT, NOT SHIPPED (the version is chosen at ship time; another chat holds v4871): physics/mechanics/flightGuns.mjs (the gun, exact rounds, a swept hit test, a lead-and-drop aim solution; 26 sabotages) and brain/dogfightTask.mjs " +
                  "(pursuit guidance that hands any heading-altitude-airspeed pilot the opponent's lead point, a break-off, a hand trigger rule, four kinds of fight, the score; 47 sabotages). MEASURED, not hoped: the PD autopilot flying the guidance wins " +
                  "its 24 fights 0.4109, and the fruit fly's and GPU network's HAND weights fly exactly its fights; the two trained pilots differ from it on the duel by less than two standard errors on sixty fresh duels. " +
                  "STILL OPEN HERE: the page that shows a fight (dogfight-page) and a pilot that has LEARNED to fight (dogfight-pilot-training).",
        note: "SCOPE AS BUILT: a forward-fixed gun (boresight 2.9 degrees below the nose, harmonised to trim), 300 m/s relative to the muzzle, 15 a second, 300 rounds, a 4 m hit sphere, 20 hits to kill; a dogfight task in brain/dogfightTask.mjs (its own sets: " +
              "DOGFIGHT_SET 24 and DOGFIGHT_BENCH_SET 120 -- no pilot has TRAINED on a fight yet, so there is no train/held-out/audit split, and the day one trains the discipline of brain/flightTask.mjs applies); the autopilot and the two trained pilots " +
              "as the pilot under test; the opponent always the PD autopilot. THE DESIGN CHOICE THAT SPARED THE NETWORKS: guidance, not new features -- the pilots still take {heading, altitude, airspeed} and the task asks for the lead point -- so no weight " +
              "of any pilot changed. WHAT THAT COSTS: nothing here has discovered a better way to get the nose on a target, and no pilot decides when to shoot (dogfight-pilot-training). NOT IN SCOPE: gunner seats (item 4), ejection (item 6). BUILT, UNSHIPPED (branch claude/sweet-lovelace-8leivh, unnumbered): physics/mechanics/flightGuns.mjs (31 sabotages) and brain/dogfightTask.mjs (47), with fireFrom for turrets; and brain/dogfightArena.mjs, the same fight stepped a tick at a time for any number of craft, held to duel() to the bit (34 sabotages). Mark done at the ship that numbers them.",
        evidence: "node brain/dogfightTask.mjs   # the PD autopilot's fights, from the task as built",
    },
    {
        id: "dogfight-page",
        status: "open", size: "large", order: 1.5,
        title: "A page that shows a fight, with the racing page's stacked per-craft views: click a view to cycle plane view, pilot view, gunner seat, AI thinking",
        why: "brain/dogfightTask.mjs scores fights and nobody can watch one. Keith asked (after b29-bomber) for it to look like race-brain.html: the scene, and on the right side of the screen a vertical stack of one small view per craft, each cycled by a click -- plane view, pilot view, gunner seat, the AI's thinking.",
        note: "BUILT ON render/carViews.mjs's design, which already does this for cars: a window is a small render target the SAME scene is drawn into with that craft's camera (gfx/device.js frame({ target, read }), both backends), read back into a 2D canvas, refreshed every few main frames and labelled with its rate; the thinking view is not a camera but the craft's policies run through the kernel's f32 twin layer by layer (render/brainTsl.mjs mlpLayerCpu, render/carViews.mjs drawBrainPanel) -- features, hidden activations, outputs as bars. NEW HERE: aircraft cameras (a chase/plane view, the pilot's eye, a gunner's sight along the turret), tracers and hit flashes, hit-point bars, a pilot per craft chosen from the roster. The fight must run through brain/dogfightTask.mjs's duel() (stepped a tick at a time -- it runs a whole fight today) so the page and the gate cannot disagree; GPU seats are async (stepFleetGpu) and a software adapter makes the page slower than real time, said on the page. The camera functions are pure and held headless by a gate, as carViews' are. BUILT, UNSHIPPED: dogfight.html -- two craft, a window each down the right that a click switches plane / pilot / gunner (the gun's sight with bore, pipper and lead pip) / brain (the network's bars, live), an overview camera that keeps both in frame, a roster of seven pilots. render/flightViews.mjs (66 sabotages) holds the cameras, the projection, the sight, the bars and the overview; tools/ship/dogfightPage-selfcheck.mjs (31 sabotages, one equivalent mutant said) holds the wiring in a real browser. NOT YET: a human pilot on the page, a falling wreck, wind.",
        evidence: "node -e 'console.log(\"dogfight pages:\", require(\"fs\").readdirSync(\".\").filter((f)=>/dogfight|bomber/i.test(f)&&f.endsWith(\".html\")).length)'   # 0 today",
    },
    {
        id: "dogfight-pilot-training",
        status: "open", size: "large", order: 1.6,
        title: "A pilot that has LEARNED to fight: the trigger as a control, the opponent in its senses, trained on fights by the recipe the flight pilots were",
        why: "Every pilot that flies the dogfight today was trained to hold a heading; the guidance does the fighting and a hand rule pulls the trigger. On sixty fresh duels the PD autopilot (0.041 +- 0.064), the trained fruit fly (0.025 +- 0.056) and the trained GPU " +
             "network (0.206 +- 0.069) are a tie within two standard errors. A pilot that learned the geometry (when to break, when to pull the nose through, when to fire) is the point of a dogfight.",
        note: "SCOPE: a fifth output (fire) and opponent features (bearing, range, closing speed, the lead error) on both networks -- a NEW layout, so new weight files and new hand weights that reproduce the autopilot plus the hand trigger exactly, before any search; " +
              "train/held-out/audit/safety sets for fights in the discipline of brain/flightTask.mjs (an audit read once; spent sets declared), self-play or a league against the autopilot and the shipped pilots; the tails that matter here are collisions and " +
              "ground contacts, which the flight task counted as stalls. Depends on dogfight-page only for being watched, not for training. TRAINED, UNSHIPPED: both brains qualified under rules fixed before their audits were read -- the fruit fly (brain/pilotDogfightWeightsDefault.json: audit 0.784 against the autopilot's 0.515, 93 fights better and 11 worse, 4.94 paired standard errors; the safety audit loses nothing to the ground where the autopilot loses 3) and the GPU Brain (brain/pilotDogfightMlpWeightsDefault.json: audit 0.607 against 0.452, 67 better and 20 worse, 2.9 standard errors). GRADED ONLY AGAINST THE PD AUTOPILOT. tools/ship/trainDogfightPilotShipped-selfcheck.mjs flies the whole grading again from each file and holds its `by` to the character (16 sabotages); the trainer's own gate has 51. Their audit pairs (AUDIT4 and AUDIT2) are now spent: a retrain draws AUDIT5.",
        evidence: "node -e 'import(\"./brain/dogfightTask.mjs\").then(m=>console.log(\"trained-on-fights sets:\", Object.keys(m).filter(k=>/TRAIN|HELD_OUT|AUDIT/.test(k)).length))'   # 0 today",
    },
    {
        id: "b29-bomber",
        status: "open", size: "large", order: 1.7,
        title: "A B-29-class bomber with every gun seat populated by a gunner (ball turrets, dorsal and ventral barbettes, waist, tail), defending itself against the fighters we already built",
        why: "Keith: \"could we populate the seats of a b29 flying superfortress style airplane with ball gunners, against our already built planes?\" It is the first customer of gunner-seats and the reason the dogfight needs more than one gun per side.",
        note: "SLICES, IN ORDER. (1) THE AIRFRAME: flightModel6dof is a 1,000 kg trainer; a B-29-class aircraft is a FROUDE-SCALED COPY of its spec (length x s, area x s^2, mass x s^3, speed x sqrt(s), time x sqrt(s)): at s = 3.5 that is about 43 t, 37 m of span, a 50 m/s stall and 84 m/s cruise. Because the physics are similar, the existing pilots (the autopilot, the fruit fly, the GPU network) fly it UNCHANGED through a wrapper that maps its state into trainer units -- the gate proves it by flying the same flight in both and comparing; this is the cheapest honest bomber and it says so (it is the trainer's shape enlarged, with four engines' worth of thrust, not a B-29's wing). SPEED GAP, FOUND ON PAPER BEFORE ANYTHING IS BUILT: the same similarity that lets the pilots fly it makes it FASTER than the fighters -- at s = 3.5 the bomber stalls at 26.5 x sqrt(3.5) = 49.6 m/s (above the trainer's cruise) and tops out near 97 m/s against the trainer's 52, so a fighter cannot pursue it level. The ways round it, each to be measured and none assumed: (a) the fighters attack from altitude and trade it for speed (a dive of 400 m is +88 m/s) -- but the autopilot's trim table stops at 52 m/s and the guidance asks for at most about 60, so that is an extension of both, pinned; (b) an interceptor class (the same airframe with more engine) that the pilots fly through a longer trim table; (c) a smaller bomber (s = 1.5 stalls at 32 m/s, cruises at 55, and is still too fast to catch level). Choose by flying the fight, at the start of slice 1. (2) THE GUN POSITIONS: a seat model -- body position, arc limits (a ball turret sees the lower hemisphere, a dorsal barbette the upper, the tail a cone), slew rate, twin guns, ammunition -- on physics/mechanics/flightGuns.mjs's round and hit test, with a gunner interface (the aim solution to slew toward, a trigger) so a hand-rule gunner, the fruit fly's and the GPU network's can each sit in any seat (this IS the gunner-seats item). (3) THE FIGHT: N fighters attacking one bomber on a bombing run, scored per side; fighters get a pursuit approach that respects the bomber's fields of fire (the attack geometry is the hard part: rear quarter, high side, head-on). (4) THE PAGE: dogfight-page, with a view per seat. DAMAGE: a hit on a fighter is a hit as today; the bomber has hit points per section if the first version is to be interesting (an engine out slows it) -- a choice to make at slice 3, not assumed here. WHAT WOULD BE DISHONEST: a gunner that aims with the exact solution at zero latency would kill every fighter in its arc, so the hand gunner has a slew rate, a tracking delay and an aim error, said and pinned. BUILT, UNSHIPPED (unnumbered work on branch claude/sweet-lovelace-8leivh; the version is chosen at ship time): ALL FOUR SLICES. (1) froudeScale.mjs + bomber.mjs: the SPEED GAP was resolved by measurement -- the default is scale 2 (21 m span, 8 t, cruise 43.3 m/s), NOT the B-29's own span (scale 4 cruises at 60 m/s and the trainer-class fighters top out at 52.8, so they cannot catch it); an interceptor class with a longer trim table is still a later round. (2) gunSeats.mjs: five seats, a hand gunner with a reaction time, aim error and a sight that sees only positions. (3) bomberFight.mjs + dogfightArena.mjs: N fighters against one bomber, hull of 17 hit spheres, engine out after 8 hits, collisions by the hull, and FRIENDLY FIRE -- the first count of 'fighters shot down' was mostly team-kills (167 friendly hits against none on the bomber in six green stern attacks), so a hit on a team-mate is not credited and a fixed gun holds its fire for a team-mate in its line. FINDINGS, PINNED IN THE GATE: against the PD autopilot's fighters the bomber is lost only to green gunners; the shipped fruit fly and GPU Brain as fighters hit it where the PD never does (334 and 530 hits against 0 in twelve attacks at regular skill). THE GUNNERS' SKILL SETTINGS ARE CHOSEN, NOT MEASURED. (4) bomber.html: a window per craft, the bomber's cycling plane, pilot, five gun seats, brain; 46 page sabotages. NOT BUILT, SAID PLAINLY: a gunner that is a network (the fruit fly or the GPU Brain in a seat -- gunner-seats item 4 stays open for exactly that), a formation of bombers, an escort, fighters that break away, a crew that can be killed, an interlock against shooting the bomber's own tail.",
        evidence: "node -e 'const s=require(\"fs\").readFileSync(\"physics/mechanics/flightModel6dof.mjs\",\"utf8\");console.log(\"flight model knows a bomber spec:\",/bomber|B-29|superfortress/i.test(s))'   # false today",
    },
    {
        id: "yamato-battleship",
        status: "open", size: "large", order: 1.8,
        title: "Space combat on the 6DOF page: a Space Battleship Yamato-class capital ship (Star Blazers' Argo) with every gun seat populated by a gunner, against the fighters we already built",
        why: "Keith, after asking for the B-29: \"for space combat, 6dof, instead of a b29 superfortress, have a space battleship yamamoto from the trailblazers cartoon, populated with gunners.\" (Read as Space Battleship Yamato / Star Blazers -- the names were misremembered in the message; if another ship was meant, the seat model below does not change.) The 6DOF page (es-box3d-6dof.html) has small fighters with fixed forward projectiles (physics/mechanics/rigidBody6dofWeapon.mjs), teams, hit points and the roster of pilots; it has no capital ship and no turret.",
        note: "SHARES SLICES 2-4 WITH b29-bomber (the seat model, the gunners, the fight, the multi-view page) and differs in the hull and the world: NEWTONIAN, so no stall, no drag, no gravity -- a turret's arc and slew rate are its only limits, and the hull's inertia is large, so it turns slowly and its gunners do the work. THE HULL: a rigid body (physics/mechanics/rigidBody6dof.mjs) with a mass and inertia some thousand times a fighter's and force/torque authority scaled to match (a Froude-style scaling does not apply in vacuum; the 6DOF autopilot's contract is thrust and a torque about each axis, so the same pilots can fly it if the authority they are given is scaled, and the gate says what was and was not shown). THE SEATS: a main battery (three triple turrets, two forward and one aft, wide arcs, slow slew, heavy slow shells), secondary and point-defence mounts along the hull (fast slew, small fast rounds) and a forward fixed 'wave-motion' cannon (the whole ship points it; a long charge, one shot, huge damage along a line) -- the invented parts are named as invented. Gunners: a hand-rule gunner first (the aim solution, a slew rate, a tracking delay, an aim error -- pinned), then the fruit fly's and the GPU network's in any seat. OPPONENTS: the page's existing fighters in numbers; scored per side, with hit points per section so that a lost turret is a lost field of fire. WHAT WOULD BE DISHONEST: a gunner with the exact solution and no latency empties the sky of fighters. NOT IN SCOPE: a model of the real ship, an interior, a crew animation. BUILT, UNSHIPPED (unnumbered work on branch claude/sweet-lovelace-8leivh; the version is chosen at ship time): ALL FOUR SLICES, as the bomber's. (1) physics/mechanics/gunSeats.mjs gained `gravity` (0 for vacuum) and `burst` (the trigger held for a second once a target is chosen, so a trigger that flickered with the target leaving the arc no longer wastes the barrel); flightGuns.stepRounds gained `ground: null`, a life for each round and hits that carry the round; physics/mechanics/capitalShip.mjs is the ship -- 48 units, 4,400 kg (the fighters' own density), 1,500 hit points, 22 hit spheres, 13 seats (three triple main turrets, ten point-defence mounts), three engine pods, a FICTIONAL wave-motion cannon, EVERY NUMBER INVENTED and said so -- and its gate found a blind cone over the deck (two dorsal mounts were added) and corrected its own first coverage claim (73%, not 77%). (2) brain/spaceArena.mjs is es-box3d-6dof.html's fight steppable with the ship in it; the fighters' DOCTRINE is a hand rule that measurement made necessary (the page's pilot has no braking, so a fighter that simply pursues the ship rams it): approach a point 60 units to one side, strafe within 220 while closing. (3) brain/battleshipFight.mjs: the scenario (bow, beam, stern, swarm), the four gunner settings (CHOSEN, NOT MEASURED), a pilot per fighter dealt in turn, the tally. FINDINGS, pinned in its gate: PD fighters never beat the ship (perfect gunners clear the sky, 96 of 96 for 108 damage; green gunners cannot, 37 of 96 and every fight runs out the clock); the trained 6DOF pilot is the real threat (14,796 damage over twelve attacks against regular gunners where the PD's put 1,692; eight of them against green gunners destroy the ship in five of twelve; twelve beat regular gunners every time); the close-quarters pilot does the ship NO damage (it was trained at 14-40 units and the doctrine asks it to fire from 220). (4) battleship.html: a window per craft down the right (the ship's goes plane, pilot -- the bridge --, one view per gun seat, brain; a fighter's plane, pilot, gunner, brain; the stack scrolls), the sights drawn for vacuum, the brain windows showing the 6DOF pilot's own network or the PD's commands and the ship's hull and a row per seat, a dot per craft in the big picture, parts shot out drawn dark, the cannon's charge and beam, hit spheres on request, and the controls as the fight that runs -- gated in a real browser (tools/ship/battleshipPage-selfcheck.mjs, 89 sabotages). STILL NOT HERE, SAID PLAINLY: the fruit fly or the GPU network as a gunner (the gunner-seats item), a second ship, a formation, an escort, a crew that can be killed, an interlock against firing into the ship's own hull, a fighter that tumbles when hit, friendly fire in space (rounds are tested per team), and a link to the page from es-box3d-6dof.html (made at ship time; that page is untouched).",
        evidence: "node -e 'const s=require(\"fs\").readFileSync(\"es-box3d-6dof.html\",\"utf8\");console.log(\"6dof page has a capital ship or turrets:\",/battleship|yamato|turret/i.test(s))'   # false today",
    },
    {
        id: "flight-model-picker",
        status: "open", size: "medium", order: 2,
        title: "A model picker on es-flight6dof.html (and es-box3d-6dof.html): swap the default aircraft/ship body for a glTF from the asset library",
        why: "Both pages draw a built-in body. The tree has the glTF path (the asset library, the Khronos samples, the loaders the other pages use) " +
             "but neither 6DOF page offers it, so a flight cannot be watched in anything but the default mesh.",
        note: "SCOPE: a picker listing the asset library's glTFs, the chosen mesh scaled to the flight model's reference length and re-oriented to the " +
              "model's frame (nose +X, up +Z -- most glTFs are +Z-forward/+Y-up, and that conversion is the part that goes wrong), the flight model " +
              "UNCHANGED (a mesh is a skin, not a different aircraft; say so on the page), the default kept as the fallback when a load fails. The " +
              "gate loads a small glTF in the headless browser on both backends and holds the pose to the state to the same tolerance the default body is.",
        evidence: "node -e 'const s=require(\"fs\").readFileSync(\"es-flight6dof.html\",\"utf8\");console.log(\"flight page mentions gltf:\",/gltf/i.test(s))'   # false today",
    },
    {
        id: "peer-fly-brain-badge",
        status: "open", size: "small", order: 3,
        title: "server.html's peer list: show whether a peer has the fruit-fly pilot and the GPU-Brain pilot available, beside the Brain badge it already shows",
        why: "capBadges() in server.html shows a 'Brain live/idle/stale' badge from ai-bridge's /peer/probe (which reads the peer's /ai/brain/health). That is the " +
             "Deno GPU-Brain PROCESS, the field solver -- it says nothing about the real-flight pilots, and nothing about the fruit-fly brain at all. A " +
             "peer cannot be chosen as a pilot's home until the list says what it can run.",
        note: "SCOPE: the peer reports, on /node/caps, which pilot brains it can serve -- `fly` (the fruit-fly circuit is CPU JavaScript: available when the " +
              "peer's tree carries brain/pilotFlightPolicy.mjs and its shipped weights, with the weights hash and engine version so a mismatched peer is " +
              "visible) and `gpu` (available only when the peer can run brain/pilotFlightGpu.mjs on a REAL adapter -- say 'software adapter' when it is " +
              "one, as the flight page does); /peer/probe passes them through as caps.pilotFly / caps.pilotGpu; capBadges() draws them next to the Brain " +
              "badge, struck through when absent (the existing `cap()` helper). The GPU chip in the Peer-activity header stays as it is.",
        evidence: "node -e 'const s=require(\"fs\").readFileSync(\"server.html\",\"utf8\");console.log(\"capBadges draws a pilot-brain badge:\",/pilotFly|pilotGpu/.test(s))'   # false today",
    },
    {
        id: "gunner-seats",
        status: "open", size: "large", order: 4,
        title: "Gunner seats on ships and aircraft: pick the brain (hand rule, fruit fly, GPU Brain) for each gunner the way a pilot's is picked",
        why: "brain/gunnerPolicy.mjs is a gunner for the race car's turret; nothing seats one on a ship or an aircraft, and the roster on the flight page " +
             "picks only a pilot. A seat should be (role, brain) with the role the vehicle's own: pilot, gunner, and later engineer.",
        note: "SCOPE: a seat model (a vehicle declares its seats and what each controls -- a pilot's four controls, a gunner's yaw/pitch/fire), the " +
              "roster choosing a brain per seat, gunner policies for the fruit-fly circuit and the GPU MLP trained by the same recipe and the same " +
              "audit discipline as the pilots (train / held-out / pool / audits read once). Depends on item 1 (there must be a gun and a score to train on). FIRST CUSTOMER: b29-bomber, whose slice 2 is this item's seat model. MODEL BUILT, UNSHIPPED: physics/mechanics/gunSeats.mjs (the seat -- a mount, an arc, a slew rate on each axis, a muzzle that carries w x r -- and a hand gunner with a reaction time, a stale picture carried forward, an aim error and a trigger rule) with a gate of 66 sabotages; the gunner BRAINS (the fruit fly's and the GPU Brain's in a seat) and their training are still to do.",
        evidence: "node -e 'const s=require(\"fs\").readFileSync(\"es-flight6dof.html\",\"utf8\");console.log(\"flight page mentions gunner:\",/gunner/i.test(s))'   # false today",
    },
    {
        id: "peer-brains-in-roster",
        status: "open", size: "medium", order: 5,
        title: "The roster offers peers' brains as seat choices: a fleet node's fruit-fly or GPU-Brain pilot (and gunner) flying a seat on this page",
        why: "Once the peer list says a peer can run a brain (item 3), the roster chooser on es-flight6dof.html should be able to pick it: " +
             "'the fruit fly on <peer>', 'the GPU Brain on <peer>'. Today every pilot is a local object.",
        note: "SCOPE: a remote-decide endpoint on ai-bridge (POST feature rows, receive controls; the fruit fly runs in node, the GPU pilot through " +
              "node-webgpu or the peer's own browser page), relayed through /peer/* the way the VM and docker calls are so the page makes no cross-origin " +
              "call; remote seats are ASYNC like the GPU seats already are (stepFleetGpu/held), with a per-tick deadline and a stated fallback to the local " +
              "hand weights when the peer is slow or gone -- said on the roster note and the pilot line, as the device-loss fallback already is. A round trip " +
              "per tick is milliseconds on a LAN, so the page may run slower than real time with a remote seat; say so. Seats (item 4) come first so one " +
              "chooser serves pilots and gunners.",
        evidence: "node ai-bridge/brainCensus-selfcheck.mjs   # what the census knows today; the roster has no remote choice yet",
    },
    {
        id: "pilot-ejection",
        status: "open", size: "medium", order: 6,
        title: "Ejection: a crew pod leaves the vehicle when the hull is about to fail; pilot state alive / ejected / lost; scoring that counts it",
        why: "A ship that blows up takes its pilot with it, and nothing in the flight or battle pages models the crew separately from the hull.",
        note: "SCOPE: a hull-integrity reading (the crash/damage model the race pages use, extended to a flight body), an ejection rule (hull below a " +
              "threshold, or an unrecoverable state -- deep stall below a floor, or a collision predicted inside N seconds), a pod that inherits the " +
              "vehicle's velocity plus a kick and falls under its own drag, a pilot state recorded per seat, and a score that counts a survived " +
              "ejection as less bad than a lost pilot and more bad than a landing. A TRAINED brain gets the eject switch as a fifth output only if " +
              "the scoring makes it learnable; the first version is a hand rule, and the page says so. Depends on items 1 and 4 (damage to eject from, " +
              "seats to eject).",
        evidence: "node -e 'const s=require(\"fs\").readFileSync(\"es-flight6dof.html\",\"utf8\");console.log(\"flight page mentions eject:\",/eject/i.test(s))'   # false today",
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
