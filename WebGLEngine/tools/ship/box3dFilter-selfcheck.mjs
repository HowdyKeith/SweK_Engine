#!/usr/bin/env node
// WebGLEngine/tools/ship/box3dFilter-selfcheck.mjs -- v4256
//
// Run: node tools/ship/box3dFilter-selfcheck.mjs
//
// *** v4249 SAID THE FIX COULD NOT BE REQUESTED THROUGH THE SHIM. IT WAS ALREADY THE DEFAULT. ***
//
// v4249 measured a derived ragdoll self-colliding at 148x its neighbours' impulse, concluded that the correct
// repair was "disabling collision between jointed neighbours", and recorded that box3d_shim.c had no way to
// ask for it. Backlog #125 filed the follow-up as RIG WORK, on the assumption that touching the shim needed a
// toolchain this sandbox lacks.
//
// BOTH ASSUMPTIONS WERE WRONG, and the second one is why the first survived four rounds.
//
//   1. box3d is C17 with no dependency beyond libm and the shim is ordinary C. `cc` and `cmake` are present.
//      The physics can be built and RUN and MEASURED here; only the WASM packaging needs emsdk. The work was
//      never rig work -- it was work nobody had tried.
//
//   2. Once it is run, the header answers the question outright: b3JointDef.collideConnected is a bool on the
//      shared base def, and b3DefaultJointDef() is `{ 0 }` and never sets it. Jointed neighbours have NEVER
//      collided in box3d. Measured natively: two overlapping dynamic boxes report 8 contacts, and 0 once a
//      spherical joint is added.
//
// So the defect moves rather than vanishing: what v4249 saw was NON-adjacent self-collision -- a limb folded
// back onto a part it is not jointed to. box3d's own header names that exact case and prescribes the fix, a
// unique negative groupIndex per ragdoll, and that IS missing from the shim. This round adds it.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
const ENG = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const read = (p) => fs.readFileSync(path.join(ENG, p), "utf8");
const SHIM = read("physics/box3d/box3d_shim.c");

console.log("box3dFilter-selfcheck -- the fix v4249 said could not be asked for, and could\n");

// =============================================================================================================
console.log("1. *** THE HEADER IS VENDORED, SO THE SHIM'S API CAN BE CHECKED WITHOUT A NETWORK ***");
{
    const dir = "vendor/box3d/include/box3d";
    const have = fs.existsSync(path.join(ENG, dir)) ? fs.readdirSync(path.join(ENG, dir)).sort() : [];
    ok("!! the whole public include closure is present, not just the two obvious headers",
        have.includes("box3d.h") && have.includes("types.h") && have.includes("base.h") && have.length >= 8,
        have.join(", ") + ". *** TWO HEADERS IS NOT THE CLOSURE: *** box3d.h includes base.h, and vendoring " +
        "only box3d.h and types.h left the shim uncompilable -- caught by compiling, not by reading.");
    const prov = read("vendor/box3d/PROVENANCE.md");
    ok("!! ...and it carries its grant and its commit, which is half of backlog #61",
        fs.existsSync(path.join(ENG, "vendor/box3d/LICENSE")) &&
        /8441b4a06d6d09dcfb0b0f704df4d847d1437b92/.test(prov) && /v0\.1\.0/.test(prov) && /MIT/.test(prov),
        "before this round vendor/box3d/ held box3d.js and box3d.wasm and NOTHING saying where they came " +
        "from. A vendored header without a recorded origin is worse than none: it looks authoritative.");

    // *** THE FACT THE WHOLE ROUND TURNS ON, READ FROM THE VENDORED HEADER RATHER THAN REMEMBERED. ***
    const types = read("vendor/box3d/include/box3d/types.h");
    const jointDef = types.slice(types.indexOf("typedef struct b3JointDef"), types.indexOf("} b3JointDef;"));
    ok("!! *** collideConnected IS ON THE SHARED b3JointDef BASE, so it applies to every joint type ***",
        /bool collideConnected;/.test(jointDef) && (types.match(/collideConnected/g) || []).length === 1,
        "declared exactly once in the whole header, on the base struct that b3SphericalJointDef, " +
        "b3RevoluteJointDef and b3WeldJointDef all embed as `base`");
    ok("!! *** AND b3Filter's groupIndex IS THE DOCUMENTED RAGDOLL FIX -- upstream says so in as many words ***",
        /unique negative group index/.test(types) && /ragdoll self-collision/.test(types),
        "box3d's own comment: \"you may want ragdolls to collide with other ragdolls but you don't want " +
        "ragdoll self-collision. In this case you would give each ragdoll a unique negative group index and " +
        "apply that group index to all shapes on the ragdoll.\" v4249 reached for the joint flag; the library " +
        "had already written down that the filter is the answer.");
}

// =============================================================================================================
console.log("\n2. the shim, and the export path a new function can silently fall out of");
{
    const NEW = ["swk_body_set_filter", "swk_body_get_filter",
                 "swk_joint_set_collide_connected", "swk_joint_get_collide_connected"];
    ok("!! the four filtering functions exist in box3d_shim.c",
        NEW.every((n) => new RegExp("^(int|void) " + n + "\\(", "m").test(SHIM)), NEW.join(", "));

    // *** THE ASYMMETRY THAT WOULD HAVE SWALLOWED THEM. ***
    const emcc = read("physics/box3d/build-box3d-wasm.sh");
    const clang = read("physics/box3d/build-box3d-wasm-clang.sh");
    const declared = [...SHIM.matchAll(/^(?:int|void|float|double) (swk_[a-z0-9_]+)\(/gm)].map((m) => m[1]);
    const missingFromEmcc = declared.filter((n) => !emcc.includes("_" + n));
    ok("!! *** EVERY swk_* IN THE SHIM IS IN build-box3d-wasm.sh's HARDCODED EXPORT LIST ***",
        missingFromEmcc.length === 0,
        declared.length + " declared, " + (missingFromEmcc.length || "none") + " missing. *** THE TWO BUILD " +
        "SCRIPTS DISAGREE ABOUT HOW EXPORTS ARE CHOSEN: *** the clang one SCANS the compiled module for " +
        "/^swk_/ and needs no edit ever, while the emcc one -- which is the default -- lists them by hand. So " +
        "a function added to the shim ships from one script and silently not from the other, and the failure " +
        "is a missing runtime symbol far from its cause. This check is the seam.");
    ok("   the clang script needs no such list, because it discovers them",
        /WebAssembly\.Module\.exports/.test(clang) && /\/\^swk_\//.test(clang),
        "recorded so the asymmetry is a known design difference rather than a suspected oversight");

    const node = read("physics/box3d/box3dNode.mjs");
    ok("!! the four are on PENDING_REBUILD, because the vendored artifact predates them",
        NEW.every((n) => node.includes('"' + n + '"')),
        "this sandbox has no emcc, so box3d.wasm cannot be rebuilt here. exportReport()'s `unexplained` stays " +
        "empty because the gap is WRITTEN DOWN; a caller gets false from has() and must degrade.");
}

// =============================================================================================================
console.log("\n3. *** IT COMPILES AGAINST THE VENDORED HEADER, WHICH IS WHAT MAKES ANY OF THE ABOVE REAL ***");
{
    let cc = null;
    try { cc = execFileSync("sh", ["-c", "command -v cc"], { encoding: "utf8" }).trim(); } catch { /* none */ }
    if (!cc) {
        report("SKIPPED -- no C compiler on PATH. Sections 1-2 read source; only a compile proves the shim " +
               "and the header agree.");
    } else {
        let err = "";
        try {
            execFileSync(cc, ["-fsyntax-only", "-I", path.join(ENG, "vendor/box3d/include"),
                              path.join(ENG, "physics/box3d/box3d_shim.c")], { encoding: "utf8", stdio: "pipe" });
        } catch (e) { err = String(e.stderr || e.message).slice(0, 300); }
        ok("!! *** box3d_shim.c COMPILES CLEAN AGAINST THE VENDORED HEADER, OFFLINE ***",
            err === "", err || "no network, no clone, no emsdk -- a struct field renamed upstream is now a " +
            "gate failure here instead of a build failure on whichever machine next runs the wasm script");
    }
}

// =============================================================================================================
console.log("\n4. *** THE PHYSICS, RUN NATIVELY -- the measurement #125 was filed as unable to make ***");
{
    const nat = path.join(ENG, "vendor/box3d/native");
    const lib = path.join(nat, "libbox3d.a"), obj = path.join(nat, "shim.o");
    if (!fs.existsSync(lib) || !fs.existsSync(obj)) {
        report("SKIPPED -- vendor/box3d/native/{libbox3d.a,shim.o} absent. Build them with " +
               "physics/box3d/build-box3d-native.sh (needs cc + cmake + network once). They are " +
               "deliberately NOT committed: they are x86_64 Linux binaries and would be wrong everywhere else.");
        report("*** A SKIP, NOT A PASS. The numbers below are the ones this round exists for, and the header " +
               "of this file records what they were when it was written: 8 contacts unjointed and 0 jointed; " +
               "a folded chain at 8 contacts / 0.0442 peak impulse; group -1 taking it to 0 / 0.0000; and the " +
               "control, group +1, leaving it UNCHANGED at 8 / 0.0442.");
    } else {
        const src = path.join(nat, "gate_probe.c"), bin = path.join(nat, "gate_probe");
        fs.writeFileSync(src, `#include <stdio.h>
int swk_world_create(float,float,float); void swk_world_step(float,int); void swk_world_destroy(void);
int swk_body_box(int,float,float,float,float,float,float,float);
int swk_joint_spherical(int,int,float,float,float,float,float,float,float,float);
int swk_contact_count(void); void swk_contacts(float*);
void swk_body_set_filter(int,double,double,int); int swk_joint_get_collide_connected(int);
#define S 10
static float buf[4096*S];
static void build(int g,int joined){ swk_world_create(0,0,0);
  int a=swk_body_box(1,0.0f,5.0f,0.0f,0.4f,0.15f,0.15f,1000.0f);
  int b=swk_body_box(1,0.8f,5.0f,0.0f,0.4f,0.15f,0.15f,1000.0f);
  int c=swk_body_box(1,0.2f,5.0f,0.0f,0.4f,0.15f,0.15f,1000.0f);
  if(joined){ swk_joint_spherical(a,b,0.4f,5.0f,0.0f,0,0,0,0,0); swk_joint_spherical(b,c,1.2f,5.0f,0.0f,0,0,0,0,0); }
  if(g){ swk_body_set_filter(a,-1,-1,g); swk_body_set_filter(b,-1,-1,g); swk_body_set_filter(c,-1,-1,g); } }
static void run(int g,int joined,int*mc,double*pk){ build(g,joined); *mc=0; *pk=0;
  for(int s=0;s<120;s++){ swk_world_step(1.0f/60.0f,4); int n=swk_contact_count(); if(n>*mc)*mc=n;
    if(n>0&&n<4096){ swk_contacts(buf); for(int i=0;i<n;i++){ double im=buf[i*S+8]; if(im>*pk)*pk=im; } } }
  swk_world_destroy(); }
/* Apply the filter only AFTER contacts already exist -- the realistic case, and the one that needs
   b3Shape_SetFilter's invokeContacts flag to re-evaluate pairs the broadphase has already paired. */
static void runLate(int g,int*mc,double*pk,int*before){ build(0,1); *mc=0; *pk=0;
  for(int s=0;s<20;s++) swk_world_step(1.0f/60.0f,4);
  *before = swk_contact_count();   /* the precondition: there must BE contacts to filter away */
  swk_body_set_filter(0,-1,-1,g); swk_body_set_filter(1,-1,-1,g); swk_body_set_filter(2,-1,-1,g);
  for(int s=0;s<120;s++){ swk_world_step(1.0f/60.0f,4); int n=swk_contact_count(); if(n>*mc)*mc=n;
    if(n>0&&n<4096){ swk_contacts(buf); for(int i=0;i<n;i++){ double im=buf[i*S+8]; if(im>*pk)*pk=im; } } }
  swk_world_destroy(); }
int main(void){ int mc; double pk;
  build(0,1); printf("collideConnected %d\\n", swk_joint_get_collide_connected(0)); swk_world_destroy();
  run(0,0,&mc,&pk); printf("unjointed %d %.4f\\n",mc,pk);
  run(0,1,&mc,&pk); printf("folded %d %.4f\\n",mc,pk);
  run(-1,1,&mc,&pk); printf("neg %d %.4f\\n",mc,pk);
  run(1,1,&mc,&pk); printf("pos %d %.4f\\n",mc,pk);
  int bf; runLate(-1,&mc,&pk,&bf); printf("late %d %.4f\\n",mc,pk); printf("before %d 0\\n",bf);
  return 0; }
`);
        let out = "";
        try {
            execFileSync("cc", ["-O2", "-I", path.join(ENG, "vendor/box3d/include"), src, obj, lib,
                                "-lm", "-lpthread", "-o", bin], { stdio: "pipe" });
            out = execFileSync(bin, { encoding: "utf8" });
        } catch (e) { out = "BUILD/RUN FAILED: " + String(e.stderr || e.message).slice(0, 200); }
        const num = (k, i) => { const m = out.match(new RegExp("^" + k + " ([-\\d.]+) ?([-\\d.]*)$", "m")); return m ? [Number(m[1]), Number(m[2])] : [NaN, NaN]; };
        const cc0 = (out.match(/^collideConnected (\d+)$/m) || [])[1];
        const [uj] = num("unjointed"), [fo, fp] = num("folded"), [ng, np] = num("neg"), [ps, pp] = num("pos");
        const [la, lp] = num("late"); const [bf] = num("before");

        ok("!! *** collideConnected READS 0 AT RUNTIME: box3d HAS NEVER COLLIDED JOINTED NEIGHBOURS ***",
            cc0 === "0", "which is what v4249 asked for and believed it could not have");
        // *** THE DECOMPOSITION IS EXACT, AND IT IS BETTER EVIDENCE THAN EITHER NUMBER ALONE. ***
        // Three mutually overlapping boxes are three PAIRS, and every pair reports 8 contact points, so the
        // unjointed world reads 24. Jointing (a,b) and (b,c) removes exactly those two pairs and leaves 8 --
        // which IS the non-adjacent pair (a,c), the only one no joint connects. 24 = 3 x 8, 8 = 1 x 8, and
        // the difference is 2 x 8: the arithmetic names which contacts the joints took away.
        ok("!! *** THE CONTROL: three overlapping boxes give " + uj + " contacts = 3 pairs x 8 ***",
            uj === 24, "without this the zero further down is an instrument reading zero rather than a " +
            "physics result. *** MY FIRST PROBE MADE BOTH BODIES KINEMATIC by passing type 2, got 0 and 0, " +
            "and proved nothing -- type 1 is dynamic. My second asserted 8 here, copied from a TWO-body " +
            "fixture, and this three-body one correctly reads 24.");
        ok("!! *** ...AND JOINTING TWO OF THE THREE PAIRS LEAVES EXACTLY ONE PAIR'S WORTH: " + fo + " = " +
           uj + " - 2x8 ***",
            fo === 8 && uj - fo === 16 && fp > 0,
            fo + " contacts, peak impulse " + fp.toFixed(4) + ". The 16 that vanished are the two JOINTED " +
            "pairs, which is collideConnected=false doing its work; the 8 that remain are the pair nothing " +
            "joints. THIS is what v4249 measured, and the arithmetic shows it cannot have been the jointed " +
            "neighbours because those contribute exactly zero.");
        ok("!! *** groupIndex = -1 REMOVES IT ENTIRELY: " + ng + " contacts, " + np.toFixed(4) + " impulse ***",
            ng === 0 && np === 0, "one call per body, exactly as box3d's header prescribes");
        ok("!! *** AND THE CONTROL THAT SAYS IT IS THE SIGN AND NOT MERELY SETTING A FILTER: group +1 " +
           "leaves it UNCHANGED at " + ps + " / " + pp.toFixed(4) + " ***",
            ps === fo && Math.abs(pp - fp) < 1e-6,
            "a positive group index means ALWAYS collide, so the filter was set and did nothing. Without " +
            "this row, 'we set a filter and the self-collision stopped' would not distinguish the mechanism " +
            "from any other perturbation of the shape's definition.");
        // *** ADDED BECAUSE A SABOTAGE SURVIVED. *** Setting invokeContacts=false in b3Shape_SetFilter left
        // the gate ALL GREEN, because every check above applied the filter at t=0, before any pair existed.
        // A ragdoll is filtered when it is ALREADY tangled, so the flag that re-evaluates existing pairs is
        // exactly the one that matters, and nothing was testing it.
        // *** AND THIS CHECK ASSERTS ITS OWN PRECONDITION, BECAUSE THE FIRST VERSION DID NOT AND WAS
        // *** VACUOUS. It waited 60 frames before filtering -- by which time the boxes have pushed apart and
        // the contact count is ALREADY 0, so "0 after filtering" was true no matter what the filter did.
        // Measured: contacts hold at 8 through step 25 and are gone by 60. Filtering now happens at step 20,
        // and `before` is asserted non-zero so the check cannot pass by having nothing to do.
        ok("!! *** FILTERING A CHAIN THAT IS ALREADY IN CONTACT: " + bf + " contacts before, " + la + " after ***",
            bf > 0 && la === 0 && lp === 0,
            "20 frames of self-collision (" + bf + " contacts standing), THEN group -1, then 120 more: " +
            la + " contacts, " + lp.toFixed(4) + " impulse. This is the case a caller actually has -- a " +
            "ragdoll is filtered when it is already tangled, not before it exists.");
    }
}

// =============================================================================================================
// ---- v4256 SABOTAGES, grep-CONFIRMED APPLIED, THE SHIM REBUILT EACH TIME, RESTORED md5-IDENTICAL ----------
//
// (physics/box3d/box3d_shim.c md5 edea6fe180c2f9d7e65ce0eaf408cd3e before and after all three.)
//
//   A  the groupIndex assignment is commented out, so the filter is written without the field that does the
//      work. -> 1 RED, the self-collision back at 8 contacts / 0.0442.
//
//   B  the filter is applied to only the FIRST shape of a body. -> *** ALL GREEN, AND IT STAYS THAT WAY. ***
//      Every body in this gate owns exactly one shape, because swk_body_box creates one hull, so the loop
//      the sabotage breaks never runs twice. That branch is UNTESTED and no fixture here can test it without
//      a shim function to add a second shape to a body, which this round did not write. Recorded as a known
//      hole rather than papered over: a body with two shapes filtered differently is half-solid, and nothing
//      would currently notice.
//
//   C  invokeContacts is set false in b3Shape_SetFilter. -> *** ALL GREEN AT FIRST, AND THAT WAS MY CHECK
//      *** BEING VACUOUS RATHER THAN THE FLAG BEING INERT. The late-filter check waited 60 frames before
//      filtering, and the boxes have pushed apart by then -- contacts hold at 8 through step 25 and read 0
//      by 60 -- so it was filtering a world with nothing to filter and "0 after" was free. Moved to step 20
//      and made to ASSERT its precondition (8 contacts standing before the filter goes on), the sabotage now
//      goes 1 RED with 8 before and 8 AFTER: the flag really does decide whether shapes the broadphase has
//      already paired get re-evaluated. A check that cannot fail proves nothing, and a sabotage surviving is
//      the cheapest way to find one.
//
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the RAGDOLL. Section 4 folds a three-link chain by hand because it is the " +
    "smallest thing with the right shape; it is not physics/ragdollFromSkeleton.mjs's output, and nothing " +
    "yet calls swk_body_set_filter for a derived ragdoll -- so v4249's 148x is not RE-measured and not " +
    "fixed in the engine, only made fixable. That needs the WASM rebuild this sandbox cannot do, and the " +
    "PENDING_REBUILD manifest is where it is waiting. Also unchecked: whether a negative group is the RIGHT " +
    "policy. It kills ALL self-collision within a ragdoll, so a hand can pass through its own thigh; " +
    "collideConnected-per-joint would be narrower and box3d already defaults it the way we want. Which is " +
    "correct depends on whether limbs should stop each other, and this round does not decide it.");
process.exit(fails ? 1 : 0);
