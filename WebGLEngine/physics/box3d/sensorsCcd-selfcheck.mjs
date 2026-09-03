// WebGLEngine/physics/box3d/sensorsCcd-selfcheck.mjs -- v4395
//
// *** #150's LAST TWO NAMES. v4385 shipped joint motors and limits and left sensors/triggers and CCD; this is
//     those, BUILT AND RUN NATIVELY, and the round found a third thing nobody was looking for. ***
//
// Everything below is measured by compiling a probe against the real library. Nothing here is a fixture: the
// sensor is a sensor, the wall is a wall, and the numbers are what box3d does.
//
// ---- THE THING NOBODY WENT LOOKING FOR --------------------------------------------------------------------
//
// A tunnelling sweep read the SAME final position for 640 m/s and for 1280 m/s, to the last decimal. No physics
// does that. It is b3WorldDef.maximumLinearSpeed, and the vendored headers declare the field and both accessors
// and state the DEFAULT nowhere, because it is assigned in box3d's own .c which is not vendored here. Measured
// through the getter: 400 m/s exactly. swk_body_set_velocity takes any speed and reads back unchanged until the
// world steps, at which point anything above 400 is 400.
//
// *** AND IT IS ALREADY IN THE ARTIFACT THAT SHIPS. *** This is not a consequence of anything this round added
// -- it is box3d's own default and always was. physics/esBox3d.js:50 clamps a ship to its hull's `speed` and
// hands that straight to box3d; ev/tools/es-arena.mjs's Fighter has speed 430. Section 4 drives the SHIPPED
// wasm, not the native build, and watches 430 come back as 400. The engine's own clamp has been quietly
// overridden by a library clamp it did not know existed.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SENSOR_STRIDE, readEvents, MAX_LINEAR_SPEED_DEFAULT, effectiveSpeed, speedIsHonoured,
         ccdStops, CCD_TABLE, CCD_TABLE_SPEED, CCD_HOLE, ruleDisagreements, travelPerStep, tunnellingSpeed,
         ALIASING_SCAN, hasInversion, ADDED_AT_V4395 } from "./sensorTrigger.mjs";
import { PENDING_REBUILD, initNode, mod } from "./box3dNode.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);

// =============================================================================================================
console.log("1. THE MANIFEST, AND WHY THESE FOURTEEN NAMES ARE PENDING RATHER THAN MISSING");
{
    ok("every name this round added to the shim is on PENDING_REBUILD, from one list rather than typed twice",
       ADDED_AT_V4395.every((n) => PENDING_REBUILD.includes(n)),
       `${ADDED_AT_V4395.length} names, sourced from sensorTrigger.ADDED_AT_V4395`);
    const shim = fs.readFileSync(path.join(ENG, "physics/box3d/box3d_shim.c"), "utf8");
    const undefined_ = ADDED_AT_V4395.filter((n) => !new RegExp("\\b" + n + "\\s*\\(", "m").test(shim));
    ok("...and every one of them is actually DEFINED in box3d_shim.c, not just listed",
       undefined_.length === 0, undefined_.length ? "missing: " + undefined_.join(", ") : "all fourteen defined");
    report("Pending, not missing: build-box3d-native.sh needs only cc and cmake, so the physics below is real. " +
           "Packaging into vendor/box3d/box3d.wasm needs emsdk, which this sandbox has not got, so the browser " +
           "path degrades on has() until somebody runs build-box3d-wasm.sh. Fourth round with the same split.");
}

// =============================================================================================================
console.log("\n2. SENSORS, RUN NATIVELY: WHAT ONE REPORTS, AND WHAT IT MUST NOT DO");
const nat = path.join(ENG, "vendor/box3d/native");
const lib = path.join(nat, "libbox3d.a"), obj = path.join(nat, "shim.o");
let OUT = null;
{
    if (!fs.existsSync(lib) || !fs.existsSync(obj)) {
        report("SKIPPED -- vendor/box3d/native/{libbox3d.a,shim.o} absent. Build them with " +
               "physics/box3d/build-box3d-native.sh (cc + cmake + network once). Deliberately not committed: " +
               "they are x86_64 Linux binaries and would be wrong everywhere else.");
        report("*** A SKIP, NOT A PASS. What they read when this file was written: a sensor fires begin at " +
               "step 57 and end at step 63, and the falling box ends at y = -70.005989 -- the SAME six " +
               "decimals as with no sensor at all, against 0.399930 for a solid box in the same place. With " +
               "the visitor's sensor events left off: begins 0, ends 0.");
    } else {
        const src = path.join(nat, "sensor_gate.c"), bin = path.join(nat, "sensor_gate");
        fs.writeFileSync(src, `#include <stdio.h>
int  swk_world_create(float,float,float); void swk_world_destroy(void); void swk_world_step(float,int);
int  swk_body_box(int,float,float,float,float,float,float,float);
int  swk_body_sensor(int,float,float,float,float,float,float);
int  swk_body_is_sensor(int); void swk_body_enable_sensor_events(int,int);
int  swk_sensor_begin_count(void); int swk_sensor_end_count(void); int swk_sensor_stride(void);
void swk_sensor_begin(int*); void swk_sensor_end(int*);
void swk_world_enable_continuous(int); int swk_world_continuous_enabled(void);
void swk_body_set_bullet(int,int); int swk_body_is_bullet(int);
void swk_body_set_velocity(int,float,float,float); void swk_transforms(float*); void swk_velocities(float*);
void swk_world_set_max_linear_speed(float); float swk_world_max_linear_speed(void);
static float T[64], V[64];
#define DT (1.0f/60.0f)
static float yOf(int i){ swk_transforms(T); return T[i*7+1]; }
static void fall(const char* tag,int kind,int vis){
  swk_world_create(0.0f,-10.0f,0.0f); int g=-1;
  if(kind==1) g=swk_body_sensor(0, 0,0,0, 2.0f,0.2f,2.0f);
  if(kind==2) g=swk_body_box(0, 0,0,0, 2.0f,0.2f,2.0f, 1000.0f);
  int b=swk_body_box(1, 0,5,0, 0.2f,0.2f,0.2f, 1000.0f);
  if(vis) swk_body_enable_sensor_events(b,1);
  int begins=0,ends=0,ev[64],fs_=-1,fv=-1,bs=-1,es=-1;
  for(int s=0;s<240;s++){ swk_world_step(DT,4);
    int nb=swk_sensor_begin_count(), ne=swk_sensor_end_count();
    if(nb>0&&fs_<0){ swk_sensor_begin(ev); fs_=ev[0]; fv=ev[1]; bs=s; }
    if(ne>0&&es<0) es=s; begins+=nb; ends+=ne; }
  printf("FALL %s %d %d %d %d %d %d %d %d %.6f\\n", tag, kind, vis,
         g>=0?swk_body_is_sensor(g):-1, begins, ends, fs_, fv, bs, yOf(b));
  swk_world_destroy(); }
static int wall(float v,int c,int bl,int dyn){
  swk_world_create(0,0,0); swk_world_enable_continuous(c);
  swk_body_box(dyn?1:0, 0,0,0, 5.0f,0.05f,5.0f, 1000.0f);
  int b=swk_body_box(1, 0,3,0, 0.1f,0.1f,0.1f, 1000.0f);
  if(bl) swk_body_set_bullet(b,1);
  swk_body_set_velocity(b,0,-v,0);
  for(int s=0;s<120;s++) swk_world_step(DT,4);
  int through = yOf(b) < -0.5f; swk_world_destroy(); return through; }
/* A dense SCAN, not a bisection. Two bisections of this same experiment with different upper brackets
   returned 22.58 and 30.08, which cannot both be a threshold -- so there is no threshold to bisect for. */
static void scan(int c){ int n=0, through=0; float lowT=-1, highS=-1;
  for(float v=5; v<=100; v+=1.0f){ n++;
    if(wall(v,c,0,0)){ through++; if(lowT<0) lowT=v; } else highS=v; }
  printf("SCAN %d %d %d %.1f %.1f\\n", c, n, through, lowT, highS); }
int main(void){
  swk_world_create(0,-10,0);
  printf("DEFAULTS %d %d %.4f\\n", swk_world_continuous_enabled(), swk_sensor_stride(), swk_world_max_linear_speed());
  swk_world_destroy();
  fall("none",0,1); fall("sensor",1,1); fall("solid",2,1); fall("blind",1,0);
  for(int d=0;d<2;d++) for(int c=0;c<2;c++) for(int b=0;b<2;b++)
    printf("CCD %d %d %d %d\\n", d, c, b, wall(500,c,b,d) ? 0 : 1);
  scan(0); scan(1);
  printf("HOLE %d %d %d %d\\n", wall(33,1,0,0), wall(34,1,0,0), wall(35,1,0,0), wall(36,1,0,0));
  swk_world_create(0,0,0);
  int b=swk_body_box(1,0,0,0,0.1f,0.1f,0.1f,1000.f);
  swk_body_set_velocity(b,0,-2000,0); swk_world_step(DT,4); swk_velocities(V);
  printf("CAPPED %.4f\\n", V[1]);
  swk_world_set_max_linear_speed(5000.f);
  swk_body_set_velocity(b,0,-2000,0); swk_world_step(DT,4); swk_velocities(V);
  printf("RAISED %.4f %.4f\\n", swk_world_max_linear_speed(), V[1]);
  swk_world_destroy(); return 0; }
`);
        try {
            execFileSync("cc", ["-std=c17", "-O2", "-I", path.join(ENG, "vendor/box3d/include"), src, obj, lib,
                                "-lm", "-lpthread", "-o", bin], { stdio: "pipe" });
            OUT = execFileSync(bin, { encoding: "utf8" });
        } catch (e) { OUT = "BUILD/RUN FAILED: " + String(e.stderr || e.message).slice(0, 300); }

        const fallOf = (tag) => {
            const m = OUT.match(new RegExp("^FALL " + tag + " ([-\\d.]+(?: [-\\d.]+)*)$", "m"));
            if (!m) return null;
            const n = m[1].split(" ").map(Number);
            return { kind: n[0], vis: n[1], isSensor: n[2], begins: n[3], ends: n[4],
                     sensorIdx: n[5], visitorIdx: n[6], beginStep: n[7], y: n[8] };
        };
        const none = fallOf("none"), sensor = fallOf("sensor"), solid = fallOf("solid"), blind = fallOf("blind");
        const defs = (OUT.match(/^DEFAULTS (\d+) (\d+) ([\d.]+)$/m) || []).slice(1).map(Number);

        ok("box3d's continuous switch defaults ON, and the shim's sensor stride matches the module's",
           defs[0] === 1 && defs[1] === SENSOR_STRIDE, `continuous=${defs[0]}, stride=${defs[1]}`);
        ok("a sensor reports one begin and one end as a body passes through it",
           sensor && sensor.isSensor === 1 && sensor.begins === 1 && sensor.ends === 1,
           sensor && `begins ${sensor.begins}, ends ${sensor.ends}, entered at step ${sensor.beginStep}`);
        ok("...and the event names the SENSOR body and the VISITOR body, in that order, by index",
           sensor && sensor.sensorIdx === 0 && sensor.visitorIdx === 1,
           sensor && `first begin event = (${sensor.sensorIdx}, ${sensor.visitorIdx})`);
        ok("*** ...AND IT PUSHES NOTHING: the trajectory is identical to falling through empty space ***",
           sensor && none && sensor.y === none.y,
           sensor && `no sensor: y = ${none.y};  sensor: y = ${sensor.y}  (a SOLID box there: y = ${solid.y})`);
        ok("...and the control is a real control: a solid box in the same place DOES stop the fall",
           solid && solid.y > -1 && solid.begins === 0,
           solid && `solid: y = ${solid.y}, and it reports no sensor events at all`);
        ok("*** THE ONE-CHARACTER WAY TO GET NOTHING: the VISITOR's sensor events are off by default ***",
           blind && blind.isSensor === 1 && blind.begins === 0 && blind.ends === 0,
           blind && `a live sensor, a body passing through it, begins ${blind.begins} ends ${blind.ends}`);
        report("The header says it twice because it catches everybody: enableSensorEvents is false by default " +
               "EVEN FOR SENSORS, and it applies to sensors AND non-sensors. swk_body_sensor turns it on for " +
               "the sensor it creates. The visitor is the caller's job, and a silent sensor is indistinguishable " +
               "from no sensor -- which is why this is a measured row rather than a sentence in a comment.");
    }
}

// =============================================================================================================
console.log("\n3. CONTINUOUS COLLISION: A RULE, ITS EIGHT ROWS, AND THE THREE THINGS THAT PROVED IT IS NOT A LAW");
{
    if (!OUT || OUT.startsWith("BUILD")) {
        report("SKIPPED with section 2. The table as measured: against a STATIC wall only the world switch " +
               "matters and the bullet flag does nothing; against a DYNAMIC wall nothing stops it unless the " +
               "world switch AND the bullet flag are both on.");
    } else {
        const rows = [...OUT.matchAll(/^CCD (\d) (\d) (\d) (\d)$/gm)].map((m) => ({
            wallDynamic: +m[1], continuous: +m[2], bullet: +m[3], stopped: m[4] === "1" }));
        for (const r of rows) {
            console.log(`        wall=${r.wallDynamic ? "dynamic" : "static "}  continuous=${r.continuous}` +
                        `  bullet=${r.bullet}  ->  ${r.stopped ? "stopped" : "TUNNELLED"}`);
        }
        ok("all eight combinations were run, at 500 m/s against a 0.1 m wall",
           rows.length === 8, `${rows.length} rows`);
        // *** ONE PREDICATE, EIGHT ROWS. *** Asserting the rows one at a time is eight chances to write down
        // what I expected; asserting that a single rule reproduces all eight is one claim that can be wrong.
        const wrong = rows.filter((r) => ccdStops(r) !== r.stopped);
        ok("*** ONE RULE REPRODUCES EVERY ROW: continuous is required, and a DYNAMIC obstacle also needs bullet ***",
           wrong.length === 0,
           wrong.length ? "rule disagrees on " + JSON.stringify(wrong) : "8 of 8, from sensorTrigger.ccdStops()");
        ok("...and the table shipped in sensorTrigger.mjs is the table that was just measured",
           JSON.stringify(rows) === JSON.stringify(CCD_TABLE.map((r) => ({ ...r }))) &&
           ruleDisagreements().length === 0,
           "CCD_TABLE is a record of this run, not a guess kept beside it");
        ok("*** the bullet flag alone does NOTHING -- against either wall, with the world switch off ***",
           rows.filter((r) => !r.continuous && r.bullet).every((r) => !r.stopped),
           "b3Body_SetBullet is a second gate BEHIND b3World_EnableContinuous, not an alternative to it");
        report("That last line is stronger than the vendored header, which describes the bullet flag as " +
               "continuous collision 'against dynamic and kinematic bodies' and says nothing about needing the " +
               "world switch as well. Two rows of this table are the only place that fact is written down.");

        // *** THERE IS NO THRESHOLD, AND THIS ROUND MEASURED ONE TWICE BEFORE NOTICING. ***
        const scans = {};
        for (const m of OUT.matchAll(/^SCAN (\d) (\d+) (\d+) ([\d.]+) ([\d.]+)$/gm)) {
            scans[+m[1]] = { samples: +m[2], tunnelled: +m[3], lowestTunnel: +m[4], highestStop: +m[5] };
        }
        const off = scans[0], on = scans[1];
        ok("a dense SCAN of 5..100 m/s replaces the bisection, because a bisection needs a monotonic predicate",
           off && on && off.samples === ALIASING_SCAN.samples,
           `${off && off.samples} speeds, world switch off: ${off && off.tunnelled} pass through; ` +
           `on: ${on && on.tunnelled}`);
        ok("*** AND THE PREDICATE IS NOT MONOTONIC: a speed passes through BELOW a speed that stops ***",
           off && hasInversion(off),
           off && `${off.lowestTunnel} m/s goes through while ${off.highestStop} m/s is stopped -- pass-through ` +
           `ALTERNATES IN BANDS, which is aliasing and not a threshold`);
        ok("...so the reported quantity is a RATE, and it matches the record shipped in sensorTrigger.mjs",
           off && off.tunnelled === ALIASING_SCAN.withoutContinuous.tunnelled &&
           on && on.tunnelled === ALIASING_SCAN.withContinuous.tunnelled,
           `without continuous ${off && off.tunnelled}/${ALIASING_SCAN.samples}, with it ` +
           `${on && on.tunnelled}/${ALIASING_SCAN.samples}`);
        report("The geometry still explains WHY: at 60 Hz a body travels " +
               travelPerStep(ALIASING_SCAN.withoutContinuous.lowestTunnel).toFixed(4) + " m per step at " +
               ALIASING_SCAN.withoutContinuous.lowestTunnel + " m/s against a 0.30 m combined thickness, so " +
               tunnellingSpeed(0.30).toFixed(0) + " m/s is where travel first exceeds the gap. What it does " +
               "NOT explain is why 90 m/s stops and 13 m/s does not, and that is the whole correction: " +
               "whether the discrete samples land inside the wall is a question of PHASE.");

        // *** AND THE RULE IN SECTION 3 IS NECESSARY, NOT SUFFICIENT. ***
        const hole = (OUT.match(/^HOLE (\d) (\d) (\d) (\d)$/m) || []).slice(1).map(Number);
        ok("*** CONTINUOUS COLLISION HAS A HOLE: one speed in ninety-six goes through with the switch ON ***",
           hole.length === 4 && hole[0] === 0 && hole[1] === 1 && hole[2] === 0 && hole[3] === 0,
           `33 m/s stops, ${CCD_HOLE.speed} m/s PASSES, 35 and 36 stop -- and it is still moving at the far ` +
           `side, final y ${CCD_HOLE.finalY}`);
        ok("...so ccdStops() is a NECESSARY condition and the gate says so with a counterexample, not a caveat",
           ccdStops(CCD_HOLE) === true && hole[1] === 1,
           `the rule says this configuration stops; the world passes the body through. The eight-row table ` +
           `is a slice at ${CCD_TABLE_SPEED} m/s and this is a measured exception to reading it as a law`);
        report("Three corrections in one section, none of them found by reading: the bisection disagreed with " +
               "itself, which said the predicate was not monotonic; the scan said why; and asking whether the " +
               "world switch is a guarantee turned up a speed where it is not. A number that survives being " +
               "measured a second way is worth more than a number measured carefully once.");
    }
}

// =============================================================================================================
console.log("\n4. *** THE SPEED CAP NOBODY WENT LOOKING FOR -- AND IT IS IN THE ARTIFACT THAT SHIPS ***");
{
    if (OUT && !OUT.startsWith("BUILD")) {
        const defs = (OUT.match(/^DEFAULTS (\d+) (\d+) ([\d.]+)$/m) || []).slice(1).map(Number);
        const capped = Number((OUT.match(/^CAPPED ([-\d.]+)$/m) || [])[1]);
        const raised = (OUT.match(/^RAISED ([\d.]+) ([-\d.]+)$/m) || []).slice(1).map(Number);
        ok("the default maximum linear speed reads " + MAX_LINEAR_SPEED_DEFAULT + " m/s through the getter",
           defs[2] === MAX_LINEAR_SPEED_DEFAULT,
           `b3World_GetMaximumLinearSpeed = ${defs[2]}; the vendored headers state this default NOWHERE`);
        ok("...and a body asked for 2000 m/s is moving at the cap after one step",
           Math.abs(Math.abs(capped) - MAX_LINEAR_SPEED_DEFAULT) < 1,
           `asked 2000, after one step ${capped}`);
        ok("...and raising the cap lets the same request through, so it is the cap and not a solver artefact",
           raised[0] === 5000 && Math.abs(raised[1]) > 1900,
           `cap raised to ${raised[0]}, the same 2000 m/s request now reads ${raised[1]}`);
    }

    // The half that needs no rebuild: the SHIPPED wasm already enforces this, because it is box3d's default.
    let wasm = null;
    try {
        await initNode();
        const m = mod();
        m._swk_world_create(0, 0, 0);
        const b = m._swk_body_box(1, 0, 0, 0, 0.1, 0.1, 0.1, 1000);
        const p = m._malloc(12);
        wasm = {};
        for (const v of [390, 430, 2000]) {
            m._swk_body_set_velocity(b, 0, -v, 0);
            m._swk_world_step(1 / 60, 4);
            m._swk_velocities(p);
            wasm[v] = m.HEAPF32[(p >> 2) + 1];
        }
        m._free(p);
    } catch (e) { report("shipped-wasm probe unavailable: " + e.message); }

    if (wasm) {
        ok("*** THE SHIPPED WASM ENFORCES IT TOO -- this is not something this round introduced ***",
           Math.abs(wasm[390]) > 380 && Math.abs(wasm[2000]) < 401,
           `vendor/box3d/box3d.wasm: 390 -> ${wasm[390].toFixed(4)},  2000 -> ${wasm[2000].toFixed(4)}`);
        // *** THE FIRST DRAFT OF THIS CHECK REQUIRED THE DEFECT TO EXIST, AND A SABOTAGE CAUGHT IT. ***
        // It asserted "one hull asks for more than the cap", which goes RED the day somebody brings that hull
        // under 400 -- a gate that fails when the thing it reports gets fixed. The invariant is that the
        // PREDICTOR matches the world for whatever the hulls say; the over-cap count is a census beside it,
        // and zero is a fine answer.
        const arena = fs.readFileSync(path.join(ENG, "ev/tools/es-arena.mjs"), "utf8");
        const hulls = [...arena.matchAll(/name:\s*"([A-Za-z ]+)"[^}]*?speed:\s*(\d+)/g)]
            .map((m) => ({ name: m[1], speed: Number(m[2]) }));
        const over = hulls.filter((h) => !speedIsHonoured(h.speed));
        ok("effectiveSpeed() predicts what the shipped wasm does, for every hull in the arena",
           hulls.length > 0 && hulls.every((h) => {
               const asked = h.speed;
               return Math.abs(effectiveSpeed(asked) - Math.min(asked, MAX_LINEAR_SPEED_DEFAULT)) < 1e-9;
           }) && Math.abs(Math.abs(wasm[430] ?? wasm[2000]) - effectiveSpeed(430)) < 1,
           `${hulls.length} hulls read from ev/tools/es-arena.mjs; the predictor is checked against the wasm ` +
           `at 430 -> ${effectiveSpeed(430)} predicted, ${(wasm[430] ?? 0).toFixed(4)} measured`);
        ok("...and the over-cap census is DERIVED from those hulls, so zero of them is a passing answer",
           over.length === hulls.filter((h) => h.speed > MAX_LINEAR_SPEED_DEFAULT).length,
           over.length
               ? `${over.length} hull(s) ask for more than box3d will give: ` +
                 over.map((h) => `${h.name} ${h.speed} -> ${effectiveSpeed(h.speed)}`).join("; ")
               : "no hull currently exceeds the cap");
        if (over.length) {
            report("*** SO THIS IS LIVE, TODAY, IN THE BROWSER: " + over.map((h) => h.name).join(", ") +
                   " asks for a speed box3d silently refuses. ***");
        }
        report("physics/esBox3d.js:50 clamps a ship to its hull's `speed` and hands that to box3d. For this " +
               "hull the engine's own clamp is overridden by a library clamp it did not know existed, and " +
               "nothing anywhere said so. It was found by asking why two tunnelling runs at different speeds " +
               "landed on the same six decimals -- which is to say, not by looking for it.");
    }
}

// =============================================================================================================
console.log("\n5. WHAT THIS ROUND'S OWN SWEEP GOT WRONG, KEPT RATHER THAN QUIETLY FIXED");
{
    // The exploratory sweep that found the cap also claimed "no tunnelling up to 4000 m/s" with continuous on.
    // Above 400 the world never sees the number, so every one of those runs was the SAME experiment repeated --
    // and section 3 then found a speed WELL below the cap where continuous collision fails anyway, so the
    // sentence was overstated at both ends at once.
    ok("the cap invalidates the upper end of this round's own tunnelling sweep, and the gate says which end",
       effectiveSpeed(4000) === MAX_LINEAR_SPEED_DEFAULT && effectiveSpeed(320) === 320,
       `a sweep to 4000 m/s tests speeds up to ${MAX_LINEAR_SPEED_DEFAULT} and then repeats itself; only the ` +
       `runs at or below the cap were distinct experiments`);
    report("So the honest claim is 'continuous collision stops the fastest body box3d will let exist', not " +
           "'stops a body at 4000 m/s'. The second is what the sweep printed. A range that runs past a clamp " +
           "is not a range, and the clamp was discovered by the same sweep that overstated it.");
    report("*** AND A SABOTAGE CAUGHT A GATE THAT REQUIRED ITS OWN FINDING TO STAY BROKEN. *** Section 4's " +
           "hull check first read `one hull asks for more than the cap`, which goes RED the day somebody " +
           "brings that hull under 400 -- a check that fails when the defect it reports is fixed. The " +
           "invariant is that effectiveSpeed() matches the world; the over-cap count is a census beside it and " +
           "zero is a passing answer. Sabotage D is now aimed at the predictor, and its control brings the " +
           "Fighter to 390 and confirms the gate stays green.");
    report("Also left standing rather than patched: box3dNode's documentedButMissing still reports " +
           "`swk_joint_` alongside swk_joint_motor_set -- a truncated match that predates this round, which " +
           "the header's claim that motor_set is 'the only name still outstanding' does not mention. Named " +
           "here, not fixed here, because it is not this round's finding to bundle.");
}

// ---- v4395 SABOTAGES, grep-CONFIRMED APPLIED BEFORE READING, RESTORED md5-IDENTICAL -------------------------
//
// The SUBJECT files, before and after all five -- md5-identical:
//    physics/box3d/box3d_shim.c     fa3dae9446a04b2141d2e2414a387236
//    physics/box3d/sensorTrigger.mjs 0df825cb06fa3785f3843380301b5145
//    ev/tools/es-arena.mjs           6dcc0370f63d342a1cabfd0da87e8c21
//
//   A  swk_body_sensor stops enabling sensor events on the sensor it creates -- one word, `true` to `false`,
//      and the sensor becomes a hole in the world that reports nothing. -> 2 RED. This is the trap the vendored
//      header warns about twice, applied to the sensor end rather than the visitor end.
//
//   B  the sensor is created SOLID (isSensor false). -> 4 RED, and the one to read is the trajectory check:
//      "sensor: y = 0.39993" against "no sensor: y = -70.005989". A sensor that pushes is not a sensor, and the
//      number that says so is the same number the solid control reports.
//
//   C  swk_world_enable_continuous ignores its argument and always enables. -> 4 RED, three of them naming the
//      exact table rows that moved, plus the scan rate going from 64/96 to 1/96. The rule check prints the
//      disagreeing rows as JSON, which is what makes this readable rather than just failed.
//
//   D  effectiveSpeed() stops clamping -- the PREDICTOR, not the defect. -> 2 RED, the first reading
//      "430 predicted, -399.7501 measured". Its control is the opposite edit: bringing the Fighter hull to 390
//      leaves the gate ALL GREEN with the census reporting zero, which is what a gate should do when the thing
//      it reports gets fixed. The first draft of that check failed the control, and rewriting it is section 5.
//
//   E  MAX_LINEAR_SPEED_DEFAULT is wrong by ten in the module. -> 2 RED. A constant this round MEASURED rather
//      than quoted needs a check that goes red when somebody edits it away from the measurement.
//
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: TRIGGER SEMANTICS ABOVE THE EVENT. box3d reports begin and end overlaps and this " +
    "reads them; what nothing here provides is the layer a game wants -- a trigger that fires once, an " +
    "occupancy set, an ordering when two sensors overlap the same body in one step. Also unchecked: sensor " +
    "events under the LOCKSTEP path, where two peers must agree on the event ORDER as well as the set, and " +
    "b3World_GetSensorEvents's ordering across peers is not something this file establishes. And CCD is " +
    "measured against a BOX; box3d's continuous sweep is shape-dependent and a thin plate or a hull with a " +
    "long axis is not covered by any row above.");
process.exit(fails ? 1 : 0);
