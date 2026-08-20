// WebGLEngine/tools/ship/areaHygiene.mjs -- v3582
// ---------------------------------------------------------------------------------------------------------------
// *** "soft body" AND "soft bodies" WERE THE SAME AREA UNDER TWO SPELLINGS, AND NOTHING NOTICED FOR 104
// INSTRUMENTS. ***
//
// xpbd-compliance sat alone under "soft body" while plastic, physics-lab and sph-hydrostatic sat under "soft
// bodies" -- and compliance-selfcheck.mjs lives in physics/xpbd/, THE SAME DIRECTORY AS TWO OF THE THREE. A
// LABEL THAT READS AS A CATEGORY AND PARTITIONS BY TYPO, which is the same shape as the 22 duplicate basenames
// in knowledge-index: a key that looks like an identity and is actually a spelling.
//
// *** THE POINT OF THIS FILE IS THAT FIXING THE ENTRY IS NOT FIXING THE DEFECT. *** Renaming one string takes a
// second; the reason it survived is that NOTHING CHECKS AREA LABELS AT ALL, so the next plural, the next
// hyphen, the next capital letter walks straight back in. This session has now twice patched an instance and
// then had to come back for the class -- the swk_contacts self-count, and the name-versus-call grep. Third time,
// the class first.
//
// ================================================================================================================
// AND THE SECOND FINDING IS ONE THIS CANNOT FIX, WHICH IS STATED RATHER THAN FORCED
// ================================================================================================================
//
// `method` held 26 instruments -- more than any label can mean -- and it was a genuine mixed bag. FOUR OF THEM
// WERE ABOUT THE SHIP EVENT RATHER THAN ABOUT A METHOD OF MEASUREMENT: ship-ritual ("the steps of a ship, their
// order"), launch-index ("every launchable thing in the engine"), population-census ("a record taken at ship
// time"), delivered-assets ("whether every asset resolves on disk IN THE SHIPPED TREE"). Those moved to `ship`.
//
// *** THE OTHER 22 DID NOT, AND THE REASON IS THAT THERE IS NO STRUCTURAL DISCRIMINATOR. *** The obvious one --
// where the module lives -- does not work: tools/ship holds gate-selection and coverage-triage, which are about
// HOW TO CHOOSE WHAT TO MEASURE and are method by any reading; tools/roundhouse holds hmc-kernel and
// ising-kernel, which are GPU kernels graded against CPU. Splitting the rest means reading what each instrument
// claims and naming subjects, and v3576 already reached that conclusion about the page panels for the same
// reason: NAMING A SUBJECT IS KEITH'S CALL, NOT A CLASSIFIER'S. So the size is REPORTED with the largest areas
// named, and not forced.
//
// A cap is deliberately NOT enforced. Keith's fifteen is a rule about PAGE PANELS -- a drawer on a screen that
// stops being scannable -- and an AREA is an index label with no such constraint. Borrowing the number would be
// applying a limit to a thing it was never measured against, which is precisely the drift gateBudget was written
// about at v3212.
"use strict";
import { pathToFileURL } from "node:url";
import { INSTRUMENTS } from "../../physics/instruments.mjs";

/**
 * The key two labels collide on. Lowercase, singularise each word, drop everything that is not a letter -- so
 * "Soft Bodies", "soft-body" and "softbody" all land together.
 *
 * *** IT TOOK THREE VERSIONS TO CATCH ITS OWN MOTIVATING PAIR, AND THE SECOND ONE SHIPPED WITH A HEADER SAYING
 * IT WAS FIXED. *** v1 stripped a trailing "s" from the whole joined string: "softbodies" -> "softbodie" against
 * "softbody". v2 stripped per word before joining and I wrote that this "is what makes them meet" -- IT DOES
 * NOT: "bodies" loses its s to give "bodie", and "body" was never plural. THE ENGLISH PLURAL OF A WORD ENDING
 * IN y IS ies, WHICH NO AMOUNT OF TRAILING-s REMOVAL WILL UNDO. Only v3 handles it, and only because the pair
 * was driven rather than reasoned about -- the third time this session that a claim in a header outran the code
 * beneath it.
 *
 * DELIBERATELY AGGRESSIVE: a false pair costs one read, a missed pair costs a partition nobody sees.
 */
export function areaKey(label) {
    const singular = (w) => {
        if (w.length > 3 && w.endsWith("ies")) return w.slice(0, -3) + "y";   // bodies -> body
        if (w.length > 3 && w.endsWith("ses")) return w.slice(0, -2);         // lenses -> lense
        if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
        return w;
    };
    return String(label).toLowerCase().trim()
        .replace(/[^a-z]+/g, " ")
        .split(" ").filter(Boolean)
        .map(singular)
        .join("");
}

export function areaCounts(list = INSTRUMENTS) {
    const c = new Map();
    for (const i of list) c.set(i.area, (c.get(i.area) || 0) + 1);
    return c;
}

/** Labels that collide once normalised. Empty is the only acceptable answer. */
export function collisions(list = INSTRUMENTS) {
    const byKey = new Map();
    for (const a of areaCounts(list).keys()) {
        const k = areaKey(a);
        if (!byKey.has(k)) byKey.set(k, []);
        byKey.get(k).push(a);
    }
    const counts = areaCounts(list);
    return [...byKey.entries()].filter(([, v]) => v.length > 1)
        .map(([k, v]) => ({ key: k, labels: v.map((l) => ({ label: l, count: counts.get(l) })) }));
}

/**
 * An area whose instruments' gates live in unrelated trees. NOT a defect on its own -- sph-hydrostatic sits in
 * tools/roundhouse and belongs with the xpbd bodies -- but a strong hint that the label is carrying more than
 * one subject, which is how `method` got to 26.
 */
export function spread(list = INSTRUMENTS) {
    const m = new Map();
    for (const i of list) {
        if (!i.gate) continue;
        const root = i.gate.split("/")[0];
        if (!m.has(i.area)) m.set(i.area, new Map());
        const r = m.get(i.area);
        r.set(root, (r.get(root) || 0) + 1);
    }
    return [...m.entries()].map(([area, roots]) => ({
        area, roots: [...roots.entries()].sort((a, b) => b[1] - a[1]),
        rootCount: roots.size, total: [...roots.values()].reduce((a, b) => a + b, 0),
    })).sort((a, b) => b.rootCount - a.rootCount);
}

export function largest(list = INSTRUMENTS, n = 5) {
    return [...areaCounts(list).entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

export const MEASURED_V3582 = {
    theInstanceWasNotTheDefect:
        "*** RENAMING ONE STRING TAKES A SECOND; THE REASON IT SURVIVED 104 INSTRUMENTS IS THAT NOTHING CHECKS " +
        "AREA LABELS AT ALL. *** The next plural, the next hyphen, the next capital walks straight back in. This " +
        "session has twice patched an instance and come back for the class -- the swk_contacts self-count and " +
        "the name-versus-call grep. Third time, the class first.",
    theNormaliserMissedItsOwnCase:
        "*** areaKey TOOK THREE VERSIONS TO CATCH ITS OWN MOTIVATING PAIR, AND THE SECOND SHIPPED WITH A HEADER " +
        "SAYING IT WAS FIXED. *** v1 stripped the trailing s from the whole joined string; v2 stripped it per " +
        "word and I wrote that this 'is what makes them meet' -- it does not, because THE ENGLISH PLURAL OF A " +
        "WORD ENDING IN y IS ies AND NO AMOUNT OF TRAILING-s REMOVAL WILL UNDO IT. It passed every other pair " +
        "while failing the one it existed for, and only driving it found that. A checker that fails on its " +
        "motivating example is worse than none.",
    theRestIsNotMine:
        "`method` went 26 -> 22 by moving the four instruments about THE SHIP EVENT rather than about a method " +
        "of measurement. The other 22 stay because THERE IS NO STRUCTURAL DISCRIMINATOR: tools/ship holds " +
        "gate-selection and coverage-triage, which are method by any reading, and tools/roundhouse holds GPU " +
        "kernels. Splitting further means naming subjects, and v3576 reached the same conclusion about the page " +
        "panels for the same reason. *** THE SIZE IS REPORTED, NOT FORCED. ***",
    noCapIsBorrowed:
        "Keith's fifteen is a rule about PAGE PANELS -- a drawer on a screen that stops being scannable -- and " +
        "an AREA is an index label with no such constraint. Borrowing the number would apply a limit to a thing " +
        "it was never measured against, which is the drift gateBudget was written about at v3212.",
};

export function reportLines() {
    const L = [];
    const counts = areaCounts();
    const col = collisions();
    L.push("[areaHygiene] instrument area labels: do any two mean the same thing");
    L.push("");
    L.push("  instruments " + INSTRUMENTS.length + " across " + counts.size + " areas");
    L.push(col.length
        ? "  *** COLLIDING LABELS: " + col.map((c) => c.labels.map((l) => l.label + "(" + l.count + ")").join(" vs ")).join("; ") + " ***"
        : "  no two labels collide once normalised");
    L.push("");
    L.push("  largest areas:");
    for (const [a, n] of largest()) L.push("    " + String(n).padStart(3) + "  " + a);
    L.push("");
    L.push("  areas whose gates span the most trees (a hint, not a defect):");
    for (const s of spread().slice(0, 4))
        L.push("    " + s.area.padEnd(22) + s.rootCount + " trees: " +
               s.roots.map(([r, n]) => r + "/" + n).join(", "));
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}
