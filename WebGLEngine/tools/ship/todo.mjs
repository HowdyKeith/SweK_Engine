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
