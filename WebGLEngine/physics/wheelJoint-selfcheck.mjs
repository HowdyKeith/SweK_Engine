// WebGLEngine/physics/wheelJoint-selfcheck.mjs -- v4398
//
// *** THE CLAIM UNDER TEST IS physics/vehicle.mjs's OWN JUSTIFICATION, AND IT HAS NEVER BEEN CHECKED. ***
//
// v4217 built a raycast vehicle and said in its header that five-body constrained wheels are "WHY TOY CAR
// PHYSICS JITTERS ... at a mass ratio of maybe 50:1". box3d's 36 b3WheelJoint_ functions -- the rejected
// alternative -- had never been called from this tree. tools/ship/vehicle-selfcheck.mjs has 56 checks and every
// one is about the raycast force arithmetic.
//
// The verdict is two-sided and the gate reports both halves, because reporting one would be the same
// overstatement in either direction: THE MECHANISM IS REAL and scales with exactly the two things v4217 named,
// and AT THE RATIO IT NAMES the effect is 4.6 microns on a 0.65 m ride height.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { WHEEL_STATE_STRIDE, WHEEL_STATE_FIELDS, readWheelState, SPRING_CARRIES_ABOVE_HZ, SPRING_VS_STOP,
         springCarries, JITTER, V4217_RATIO, relativeJitter, growsWithRatio, ordersSpanned, verdict,
         ADDED_AT_V4398 } from "./wheelJoint.mjs";
import { KIND, KIND_NAME } from "./box3d/jointDrive.mjs";
import { PENDING_REBUILD } from "./box3d/box3dNode.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);

// =============================================================================================================
console.log("1. THE CLAIM, QUOTED FROM THE FILE THAT MAKES IT, AND THE 36 FUNCTIONS THAT COULD TEST IT");
{
    const veh = fs.readFileSync(path.join(ENG, "physics/vehicle.mjs"), "utf8");
    ok("physics/vehicle.mjs really does justify its design with a jitter claim about constrained wheels",
       /WHY TOY CAR PHYSICS JITTERS/.test(veh) && /mass ratio of maybe 50:1/.test(veh),
       "the header names both the mechanism and the ratio, which is why this gate can use its own numbers");
    ok("...and V4217_RATIO is read from the claim rather than chosen by this round",
       V4217_RATIO === 50 && veh.includes(String(V4217_RATIO) + ":1"), `ratio ${V4217_RATIO}:1`);

    const hdr = fs.readFileSync(path.join(ENG, "vendor/box3d/include/box3d/box3d.h"), "utf8");
    const wheelFns = [...hdr.matchAll(/^B3_API [^;]*b3WheelJoint_([A-Za-z]+)/gm)].map((m) => m[1]);
    ok("box3d exposes the whole wheel constraint and this tree had called none of it",
       wheelFns.length > 30, `${wheelFns.length} b3WheelJoint_ functions in the vendored header`);

    const vehGate = fs.readFileSync(path.join(ENG, "tools/ship/vehicle-selfcheck.mjs"), "utf8");
    ok("*** and the 56-check vehicle gate never mentions jitter, so the justification was unguarded ***",
       !/jitter/i.test(vehGate), "not one occurrence of the word in the gate that grades vehicle.mjs");
    report("So this is not a duplicate of vehicle.mjs. It is the alternative vehicle.mjs REJECTED, and the " +
           "rejection is an argument the tree has been carrying unmeasured since v4217.");
}

// =============================================================================================================
console.log("\n2. THE MANIFEST AND THE WIRE FORMAT");
{
    ok("every name this round added to the shim is on PENDING_REBUILD, from one list not typed twice",
       ADDED_AT_V4398.every((n) => PENDING_REBUILD.includes(n)), `${ADDED_AT_V4398.length} names`);
    const shim = fs.readFileSync(path.join(ENG, "physics/box3d/box3d_shim.c"), "utf8");
    const undef = ADDED_AT_V4398.filter((n) => !new RegExp("\\b" + n + "\\s*\\(", "m").test(shim));
    ok("...and every one is DEFINED in box3d_shim.c, not just listed",
       undef.length === 0, undef.length ? "missing: " + undef.join(", ") : "all defined");
    // A kind constant is a wire format. It must be APPENDED, and the two sides must agree.
    const defines = Object.fromEntries([...shim.matchAll(/#define SWK_JOINT_([A-Z]+)\s+(\d+)/g)]
        .map((m) => [m[1], Number(m[2])]));
    ok("*** the shim's joint-kind numbers and jointDrive's KIND agree, WHEEL appended at 4 ***",
       defines.WHEEL === KIND.WHEEL && defines.WELD === KIND.WELD && defines.REVOLUTE === KIND.REVOLUTE &&
       KIND.WHEEL === 4 && KIND_NAME[4] === "wheel",
       `shim WHEEL=${defines.WHEEL}, jointDrive KIND.WHEEL=${KIND.WHEEL}, and 1..3 unmoved`);
    ok("the wheel state stride and its field names are the same length, so a reader cannot run off the row",
       WHEEL_STATE_STRIDE === WHEEL_STATE_FIELDS.length,
       `${WHEEL_STATE_STRIDE}: ` + WHEEL_STATE_FIELDS.join(", "));
    const row = readWheelState([1, 2, 3, 4, 5]);
    ok("...and readWheelState maps the packed row onto those names in order",
       row.spinSpeed === 1 && row.linearSeparation === 5, JSON.stringify(row));
}

// =============================================================================================================
console.log("\n3. THE RIG HAD TO BE FIXED TWICE, AND BOTH FAILURES READ AS PHYSICS RESULTS");
{
    // (1) The suspension was resting on its travel limit, which is the EASIEST case a solver can have.
    const below = SPRING_VS_STOP.filter((r) => r.hertz < SPRING_CARRIES_ABOVE_HZ);
    const above = SPRING_VS_STOP.filter((r) => r.hertz >= SPRING_CARRIES_ABOVE_HZ);
    ok("*** below 10 Hz the spring CANNOT hold 1200 kg and the strut sits on its stop ***",
       below.length > 0 && below.every((r) => !springCarries(r)),
       below.map((r) => `${r.hertz} Hz: limit-on ${r.withLimit} vs limit-off ${r.noLimit}`).join("; "));
    ok("...and at and above 10 Hz the two ride heights agree, so the SPRING is carrying the load",
       above.length > 0 && above.every((r) => springCarries(r)),
       above.map((r) => `${r.hertz} Hz: ${r.withLimit} vs ${r.noLimit}`).join("; "));
    report("The first jitter numbers of this round were taken at 5 Hz and read zero -- because a body resting " +
           "on a rigid limit stop has nothing to reconcile. The tell was that the rigid-strut row and the " +
           "spring row agreed to three decimals. The regime was FOUND by disabling the limit and comparing, " +
           "not assumed from the frequency.");

    // (2) The car travelled exactly 0.00 m, twice, for two different reasons.
    const shim = fs.readFileSync(path.join(ENG, "physics/box3d/box3d_shim.c"), "utf8");
    ok("*** the shim could only make BOXES, so the rig's wheels were cubes and a cube does not roll ***",
       /swk_body_sphere/.test(shim) && ADDED_AT_V4398.includes("swk_body_sphere"),
       "every body constructor called b3MakeBoxHull; b3CreateSphereShape had been there all along");
    ok("*** and swk_wheel_spin WAKES the bodies, because a settled vehicle is ASLEEP and ignores its motors ***",
       /b3Joint_WakeBodies\(g_joints\[idx\]\)/.test(shim) &&
       /spinTorque saturated at the full 300 N-m while spinSpeed sat at exactly 0\.0000/.test(shim),
       "the readback reported full torque and zero speed, which reads like a physics result");
    report("Neither failure threw. A cube on a strut and a sleeping car both report plausible numbers -- full " +
           "motor torque, no motion, no error -- and the only tell was the travelled distance being EXACTLY " +
           "0.00 rather than small. A rig that cannot move is not a measurement of a claim about movement.");
}

// =============================================================================================================
console.log("\n4. *** AT REST: NO JITTER, AT ANY MASS RATIO, IDENTICAL TO A BOX WITH NO JOINTS ***");
{
    ok("the chassis is dead still at every ratio from 1:1 to 500:1",
       JITTER.atRest.every((r) => r.sd === 0),
       JITTER.atRest.map((r) => `${r.ratio}:1 sd ${r.sd}`).join("; "));
    ok("...and that is the same as the control, a plain chassis box with no wheels and no joints",
       JITTER.plainBoxControl === 0,
       "so at rest the wheel joints add nothing measurable -- which is the EASY case, not the claim's case");
    report("A settled strut has nothing to reconcile. Testing only at rest would have refuted the claim on a " +
           "case the claim is not about, and the control is what makes that visible rather than convenient.");
}

// =============================================================================================================
console.log("\n5. *** DRIVING: THE MECHANISM IS REAL AND SCALES WITH BOTH THINGS v4217 NAMED ***");
{
    for (const r of JITTER.driving) {
        console.log(`        ratio ${String(r.ratio).padStart(4)}:1   jitter sd ${r.sd.toExponential(3)}` +
                    `   ${(relativeJitter(r.sd) * 1e6).toFixed(1)} parts per million of the ride height`);
    }
    ok("*** jitter grows monotonically with mass ratio, DERIVED from the rows rather than asserted ***",
       growsWithRatio(),
       `${ordersSpanned().toFixed(2)} orders of magnitude from ${JITTER.driving[0].ratio}:1 to ` +
       `${JITTER.driving[JITTER.driving.length - 1].ratio}:1`);
    const [one, four] = [JITTER.substeps.find((s) => s.substeps === 1), JITTER.substeps.find((s) => s.substeps === 4)];
    ok("*** and it grows when the SOLVER BUDGET shrinks, which is the other half of the mechanism ***",
       one.sd > four.sd * 100,
       `at ${V4217_RATIO}:1, four substeps ${four.sd.toExponential(3)} -> one substep ${one.sd.toExponential(3)}`);
    report("Mass ratio and solver budget. That is v4217's mechanism stated exactly -- 'small errors in each " +
           "feed the other' -- and it is not a coincidence that those are the two knobs the effect responds " +
           "to. The claim identified something real about constraint solvers.");
}

// =============================================================================================================
console.log("\n6. *** AND THE DEGREE, WHICH IS WHERE THE CLAIM STOPS BEING A REASON ***");
{
    const v = verdict();
    ok("at the 50:1 v4217 names, with box3d's four substeps, the effect is microns",
       v.atClaimedRatio < 1e-5,
       `${v.atClaimedRatio.toExponential(3)} m on a ${JITTER.rideHeightAt50} m ride height = ` +
       `${(v.relative * 1e6).toFixed(1)} parts per million`);
    ok("...so the verdict carries BOTH halves and neither is reported alone",
       v.mechanismConfirmed === true && v.visibleAtClaimedRatio === false,
       "mechanism confirmed, magnitude below the threshold this file states out loud (1e-4 of ride height)");
    report("v4217 identified a real coupling and was right about what drives it. The conclusion drawn from it " +
           "-- that constrained wheels are unusable, so rays are the answer -- does not follow from the SIZE " +
           "of the effect in this engine at this substep count. box3d's soft-constraint solver with " +
           "substepping is specifically good at the thing the claim is about. Neither file is wrong; the " +
           "ARGUMENT was never checked, and now it has a number.");
    report("*** WHAT THIS DOES NOT SAY: that vehicle.mjs should be replaced. *** A raycast vehicle is chosen " +
           "for controllability and cheapness as much as for stability, and this round measured ONE of those " +
           "three. It also does not test the constrained model on rough ground at speed, which is where the " +
           "coupling has the most to feed on and where 200:1 and 1000:1 stop being hypothetical.");
}

// =============================================================================================================
console.log("\n7. THE RECORD RE-MEASURED, NATIVELY, IN THIS RUN");
{
    const nat = path.join(ENG, "vendor/box3d/native");
    const lib = path.join(nat, "libbox3d.a"), obj = path.join(nat, "shim.o");
    if (!fs.existsSync(lib) || !fs.existsSync(obj)) {
        report("SKIPPED -- vendor/box3d/native/{libbox3d.a,shim.o} absent. Build them with " +
               "physics/box3d/build-box3d-native.sh (cc + cmake + network once). Deliberately not committed: " +
               "x86_64 Linux binaries would be wrong everywhere else.");
        report("*** A SKIP, NOT A PASS. Sections 4 to 6 grade the RECORD and its derivations; this section is " +
               "the only one that grades the physics, and without the artifacts the numbers above are a " +
               "receipt rather than a measurement.");
    } else {
        const src = path.join(nat, "wheel_gate.c"), bin = path.join(nat, "wheel_gate");
        fs.writeFileSync(src, `#include <stdio.h>
#include <math.h>
int  swk_world_create(float,float,float); void swk_world_destroy(void); void swk_world_step(float,int);
int  swk_body_box(int,float,float,float,float,float,float,float);
int  swk_body_sphere(int,float,float,float,float,float);
int  swk_joint_wheel(int,int,float,float,float,float,float,float,float,float,float,float,float,float,float);
int  swk_wheel_spin(int,int,float,float); int swk_joint_kind(int); int swk_wheel_state(int,float*);
void swk_transforms(float*);
static float T[256];
#define DT (1.0f/60.0f)
static float yOf(int i){ swk_transforms(T); return T[i*7+1]; }
static void run(int wheels,float ratio,float spin,int substeps,double* y,double* sd,double* travel,int* kind){
  swk_world_create(0.0f,-9.81f,0.0f);
  swk_body_box(0, 0,-0.5f,0, 500.0f,0.5f,60.0f, 1000.0f);
  float ch = 1200.0f/(8*1.2f*0.3f*0.6f);
  int c = swk_body_box(1, 0,0.7f,0, 1.2f,0.3f,0.6f, ch);
  int j[4]; float wd = ch/ratio;
  const float ax[4]={0.9f,0.9f,-0.9f,-0.9f}, az[4]={0.7f,-0.7f,0.7f,-0.7f};
  for(int i=0;i<wheels;i++){
    int w = swk_body_sphere(1, ax[i],0.35f,az[i], 0.35f, wd*1.9098593f);
    j[i] = swk_joint_wheel(c,w, ax[i],0.35f,az[i], 0,1,0, 0,0,1, 20.0f,0.7f, -0.25f,0.25f);
  }
  if (kind) *kind = wheels ? swk_joint_kind(j[0]) : -1;
  for(int s=0;s<600;s++) swk_world_step(DT,substeps);
  if (spin>0) for(int i=0;i<wheels;i++) swk_wheel_spin(j[i],1,spin,300.0f);
  for(int s=0;s<300;s++) swk_world_step(DT,substeps);
  double x0 = T[c*7+0]; swk_transforms(T); x0 = T[c*7+0];
  double s1=0,s2=0; int n=0;
  for(int s=0;s<600;s++){ swk_world_step(DT,substeps); double v=yOf(c); s1+=v;s2+=v*v;n++; }
  *y = s1/n; double var = s2/n - (*y)*(*y); *sd = var>0?sqrt(var):0.0;
  swk_transforms(T); *travel = T[c*7+0]-x0;
  swk_world_destroy();
}
int main(void){
  double y,sd,tr; int k;
  run(0, 50, 0, 4, &y,&sd,&tr,&k);   printf("CONTROL %.6f %.6e %.2f\\n", y, sd, tr);
  run(4, 50, 0, 4, &y,&sd,&tr,&k);   printf("REST %.6f %.6e %.2f %d\\n", y, sd, tr, k);
  run(4, 50, 10.0f, 4, &y,&sd,&tr,&k); printf("DRIVE50 %.6f %.6e %.2f\\n", y, sd, tr);
  run(4, 1000, 10.0f, 4, &y,&sd,&tr,&k); printf("DRIVE1000 %.6f %.6e %.2f\\n", y, sd, tr);
  run(4, 50, 40.0f, 1, &y,&sd,&tr,&k); printf("SUB1 %.6f %.6e %.2f\\n", y, sd, tr);
  run(4, 50, 40.0f, 4, &y,&sd,&tr,&k); printf("SUB4 %.6f %.6e %.2f\\n", y, sd, tr);
  return 0; }
`);
        let out = "";
        try {
            execFileSync("cc", ["-std=c17", "-O2", "-I", path.join(ENG, "vendor/box3d/include"), src, obj, lib,
                                "-lm", "-lpthread", "-o", bin], { stdio: "pipe" });
            out = execFileSync(bin, { encoding: "utf8" });
        } catch (e) { out = "BUILD/RUN FAILED: " + String(e.stderr || e.message).slice(0, 300); }
        const row = (k, n) => {
            const m = out.match(new RegExp("^" + k + " ([-\\d.e+]+) ([-\\d.e+]+) ([-\\d.e+]+)(?: (\\d+))?$", "m"));
            return m ? { y: +m[1], sd: +m[2], travel: +m[3], kind: m[4] != null ? +m[4] : null } : null;
        };
        const ctl = row("CONTROL"), rest = row("REST"), d50 = row("DRIVE50"), d1000 = row("DRIVE1000");
        const s1 = row("SUB1"), s4 = row("SUB4");
        ok("the joint really is a wheel joint at runtime, not just at compile time",
           rest && rest.kind === KIND.WHEEL, rest && `swk_joint_kind = ${rest.kind} (${KIND_NAME[rest.kind]})`);
        ok("*** the car MOVES, which is the precondition every earlier version of this rig failed ***",
           d50 && Math.abs(d50.travel) > 10, d50 && `travelled ${d50.travel.toFixed(2)} m under a spin motor`);
        ok("at rest, four constrained wheels jitter no more than a plain box with no joints",
           ctl && rest && rest.sd <= Math.max(ctl.sd, 1e-7),
           ctl && rest && `control sd ${ctl.sd.toExponential(3)}, wheels sd ${rest.sd.toExponential(3)}`);
        ok("*** driving, jitter at 1000:1 is orders above 50:1 -- the mass-ratio mechanism, re-measured ***",
           d50 && d1000 && d1000.sd > d50.sd * 100,
           d50 && d1000 && `50:1 ${d50.sd.toExponential(3)} -> 1000:1 ${d1000.sd.toExponential(3)}`);
        ok("*** and one substep is orders above four -- the solver-budget mechanism, re-measured ***",
           s1 && s4 && s1.sd > s4.sd * 100,
           s1 && s4 && `4 substeps ${s4.sd.toExponential(3)} -> 1 substep ${s1.sd.toExponential(3)}`);
        ok("...and the re-measured 50:1 figure is the order of magnitude the record carries",
           d50 && Math.abs(Math.log10(d50.sd / JITTER.driving.find((r) => r.ratio === 50).sd)) < 1,
           d50 && `recorded ${JITTER.driving.find((r) => r.ratio === 50).sd.toExponential(3)}, ` +
           `re-measured ${d50.sd.toExponential(3)}`);
        report("The record is checked to an ORDER OF MAGNITUDE and not to the digit, on purpose. These are " +
               "float32 trajectories over 1500 steps and the last figures move with anything -- pinning them " +
               "exactly would make this gate a tripwire for the compiler rather than a check on the physics.");
    }
}

// ---- v4398 SABOTAGES, grep-CONFIRMED APPLIED BEFORE READING, RESTORED md5-IDENTICAL -------------------------
//
// The SUBJECT files, before and after all five -- md5-identical:
//    physics/wheelJoint.mjs          d82cfc3aff1e9b51864a8c48fa0cfa61
//    physics/box3d/box3d_shim.c      a911d30a6112f2f5665a2628f7126db5
//    physics/box3d/jointDrive.mjs    3e3d43bb14d0d06f59413f1067030756
//    physics/wheelJoint-selfcheck.mjs was d179e10ea644b1e9488b7d0918a76361 while the five ran; this paragraph changed it.
//
//   A  swk_wheel_spin stops waking the bodies -- the sleeping-car bug, restored. -> 4 RED, and the first is
//      "travelled 0.00 m under a spin motor". That check exists BECAUSE this failure happened twice for two
//      different reasons and neither threw; a rig that cannot move is not a measurement of movement.
//
//   B  the rig's wheels go back to being 0.35-CUBES. -> 3 RED, the same 0.00 m by a different road. Two
//      unrelated defects, one symptom, and one precondition check catching both.
//
//   C  the KIND wire format is RENUMBERED (WHEEL 3, WELD 4) instead of appended. -> 2 RED: the two sides
//      disagree, and the runtime kind check fails too. A joint index a caller already holds would silently
//      change meaning, which is why the shim's comment says APPEND and the gate compares both sides.
//
//   D  the record claims jitter is FLAT across mass ratio (1000:1 set to the 50:1 figure). -> 2 RED, and the
//      derived span drops from 3.79 orders to 1.97. The mechanism half of the verdict is what moves, which is
//      correct: flat jitter would mean v4217 named the wrong driver.
//
//   E  SPRING_CARRIES_ABOVE_HZ is lowered to 2, declaring the bottomed-out regime fine. -> 2 RED. This is the
//      round's own first mistake made permanent: measure jitter with the strut on its limit stop and you
//      measure the stop.
//
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: THE TWO VEHICLES HEAD TO HEAD. vehicle.mjs " +
    "produces FORCES and owns no body, so putting it on a box3d chassis through swk_world_cast_ray is a real " +
    "integration and a round of its own -- and until that exists, 'which model jitters less' has one side " +
    "measured. And steering: swk_wheel_steer is bound and exercised by nothing above, because a steering " +
    "claim needs a path to follow and there is no track in this tree.");
process.exit(fails ? 1 : 0);
