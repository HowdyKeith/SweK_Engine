// WebGLEngine/tools/ship/bakeShrinkGuard-selfcheck.mjs — v4336
//
// The guard exists because v4335 ran orreryBake.mjs --write in a tree missing the rig-only build artefacts and
// the bake DELETED four entries while reporting "15 bodies" either way. So the checks here are not "does the
// function return a string" -- they are the two halves that decide whether it would have caught that:
//
//   IT FIRES ON A LOSS THAT LOOKS LIKE A BAKE.   The real accident is reproduced from the real shapes.
//   IT DOES NOT FIRE ON AN ORDINARY EDIT.        A guard that cries on every re-bake gets --allow-shrink typed
//                                                by reflex, and then it is not a guard, it is a speed bump.
//
// SABOTAGES DRIVEN AGAINST tools/ship/bakeShrinkGuard.mjs, each restored after:
//   1. compare COUNTS instead of identities   -> RED: a same-size swap loses a name and counts cannot see it
//   2. walk only the top level, not nested    -> RED: the real accident is four nested `path` entries
//   3. tolerate "a few" losses (missing > 5)  -> RED: the real accident dropped exactly four
// Three sabotages, three caught. The first is the one that matters: counting is the check somebody writes when
// they have not asked what the failure actually looked like; the third is the one somebody adds later to stop
// a guard being noisy, and it would have let v4335's four-file loss through untouched.
//
// *** A FOURTH SABOTAGE WENT 0 RED, AND THAT IS RECORDED RATHER THAN QUIETLY DROPPED. *** Replacing
// `if (before == null) return null` with `before = {}` changed nothing: identities({}) is empty, so the general
// path returns null anyway. The line is REDUNDANT with the case below it, not load-bearing -- so the sabotage
// proved my own check was aimed at nothing, not that the guard had a hole. It is kept for what it says rather
// than what it does, and the sabotage was replaced with one that reaches a branch that decides something.
//
// Run: node tools/ship/bakeShrinkGuard-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { identities, shrinkRefusal, guardWrite } from "./bakeShrinkGuard.mjs";

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m + (d ? "   " + d : "")); } };

// 1) THE REAL ACCIDENT, in the real shape. orrery.json is bodies[] each with files[{path}].
{
    const full = { bodies: [{ name: "box3d", files: [{ path: "native/gate_probe" }, { path: "native/gate_probe.c" },
                                                     { path: "native/libbox3d.a" }, { path: "native/shim.o" },
                                                     { path: "src/box3d.c" }] },
                            { name: "three", files: [{ path: "build/three.module.js" }] }] };
    const shrunk = { bodies: [{ name: "box3d", files: [{ path: "src/box3d.c" }] },
                              { name: "three", files: [{ path: "build/three.module.js" }] }] };
    const r = shrinkRefusal(full, shrunk);
    ok(!!r, "*** the v4335 accident is REFUSED: a bake from an incomplete tree drops nested file entries ***");
    ok(r && /native\/gate_probe/.test(r), "...and the refusal NAMES what would be lost, not just how many", r ? r.slice(0, 90) : "");
    ok(r && /4 of 8/.test(r), "...and counts them against what was there", r ? (r.match(/DROP \d+ of \d+/) || [""])[0] : "");
    ok(shrinkRefusal(full, full) === null, "the same bake twice is not a loss");
    ok(shrinkRefusal(shrunk, full) === null, "*** and GROWING is never refused -- this guards loss, not change ***");
}

// 2) THE FALSE-FAULT HALF. An ordinary edit must pass, or the override becomes reflex.
{
    const a = { bodies: [{ name: "box3d", files: [{ path: "src/a.c", bytes: 10 }] }] };
    const bigger = { bodies: [{ name: "box3d", files: [{ path: "src/a.c", bytes: 999999 }] }] };
    const smaller = { bodies: [{ name: "box3d", files: [{ path: "src/a.c", bytes: 1 }] }] };
    ok(shrinkRefusal(a, bigger) === null && shrinkRefusal(a, smaller) === null,
       "*** a file's SIZE changing either way is not a loss -- bytes are reported, never asserted ***");
    const added = { bodies: [{ name: "box3d", files: [{ path: "src/a.c" }, { path: "src/b.c" }] }] };
    ok(shrinkRefusal(a, added) === null, "adding an entry is not a loss");
    // NOT "no baseline is not an empty baseline" -- the sabotage above proved those two are the SAME here,
    // because an empty baseline has no identities to lose either. The claim is only the outcome.
    ok(shrinkRefusal(null, a) === null, "a FIRST write loses nothing, having nothing to lose");
}

// 3) THE OTHER BAKE'S SHAPE, unlearned. orrery-fleet.json is bodies{name: [{path}]}, and the walk was never
//    taught either shape -- that is what makes it serve a third baker without an edit.
{
    const fleet = { bodies: { box3d: [{ path: "sim/a.js" }, { path: "sim/b.js" }], three: [{ path: "ui/c.js" }] } };
    const lost = { bodies: { box3d: [{ path: "sim/a.js" }], three: [{ path: "ui/c.js" }] } };
    ok(identities(fleet).size === 3, "the walk finds nested paths under an OBJECT of arrays too", `${identities(fleet).size} identities`);
    ok(!!shrinkRefusal(fleet, lost), "and a loss in that shape is refused as well");
}

// 4) A SAME-SIZE SWAP. The check a count-based guard cannot make: one entry leaves, another arrives, the
//    totals match, and something is still gone. This is why identities are compared and not lengths.
{
    const a = { bodies: [{ name: "one", files: [{ path: "keep.c" }, { path: "gone.c" }] }] };
    const b = { bodies: [{ name: "one", files: [{ path: "keep.c" }, { path: "new.c" }] }] };
    ok(identities(a).size === identities(b).size, "the two bakes carry the SAME NUMBER of identities", "3 and 3");
    const r = shrinkRefusal(a, b);
    ok(!!r && /gone\.c/.test(r), "*** and the swap is still refused, by name -- a count would have passed it ***", r ? r.slice(0, 70) : "");
}

// 5) THE WRITE PATH: refuse by default, allow with the flag, and SAY SO either way.
{
    const before = JSON.stringify({ bodies: [{ name: "x", files: [{ path: "a" }, { path: "b" }] }] });
    const after = { bodies: [{ name: "x", files: [{ path: "a" }] }] };
    let said = [];
    const g1 = guardWrite(before, after, [], (s) => said.push(s));
    ok(g1.ok === false, "*** guardWrite REFUSES by default, so a write path has to opt into losing data ***");
    ok(said.some((s) => /REFUSED/.test(s)), "and it says so on the way out");
    said = [];
    const g2 = guardWrite(before, after, ["--allow-shrink"], (s) => said.push(s));
    ok(g2.ok === true && g2.refusal, "--allow-shrink permits the write and still reports what was lost");
    ok(said.some((s) => /OVERRIDDEN/.test(s) && /would DROP/.test(s)),
       "*** the override PRINTS the refusal it overrode -- a deliberate loss appears in the run, not only in a diff ***");
    said = [];
    ok(guardWrite(before, JSON.parse(before), [], (s) => said.push(s)).ok === true && said.length === 0,
       "an unchanged bake passes silently");
    ok(guardWrite("{ not json", after, [], () => {}).ok === true,
       "an unreadable baseline is not treated as an empty one -- it cannot be compared, so it does not refuse");
}

// 6) IT IS WIRED INTO BOTH BAKERS, checked as a call rather than as a mention: the v3940 lesson that a comment
//    naming a route is not a caller of it.
{
    const fs = await import("node:fs"), path = await import("node:path");
    const url = await import("node:url");
    const HERE = path.dirname(url.fileURLToPath(import.meta.url));
    for (const f of ["orreryBake.mjs", "orreryFleetScan.mjs"]) {
        const src = fs.readFileSync(path.join(HERE, f), "utf8");
        ok(/guardWrite\s*\(/.test(src) && /from "\.\/bakeShrinkGuard\.mjs"/.test(src),
           `${f} CALLS the guard (import plus a call form, not a comment naming it)`);
        ok(/if \(!g\.ok\)/.test(src) && /process\.exit\(1\)/.test(src),
           `...and acts on the refusal by exiting non-zero, so a script notices`);
    }
}

if (fail) { console.error(`\nbakeShrinkGuard-selfcheck: ${pass} pass, ${fail} FAIL`); process.exit(1); }
console.log(`bakeShrinkGuard-selfcheck: all ${pass} pass`);
