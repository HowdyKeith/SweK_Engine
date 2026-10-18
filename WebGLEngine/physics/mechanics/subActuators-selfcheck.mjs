// WebGLEngine/physics/mechanics/subActuators-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node physics/mechanics/subActuators-selfcheck.mjs      (~1 s)
//
// THE RATE LIMIT HELD TO ITS CLOSED FORM. physics/mechanics/subActuators.mjs is a slew limit between the pilot and the vessel; this gate holds it to the number a pencil gives:
//   1  THE SLEW     from rest a command of 1 on the ballast pump reaches min(1, 0.15 t) after t seconds EXACTLY and arrives at the tick the closed form says; no control ever moves more than rate x dt in a tick; each control
//                   has its OWN rate (planes and rudder 1.0, screw 1.5, pump 0.15); a swing from +1 to -1 takes 2 / rate
//   2  THE INPUT    a command is clamped to [-1, 1] BEFORE the limit (a command of 9 is a command of 1); a NaN, an infinity or a missing field is a command of 0; the command object is not edited
//   3  THE OBJECT   instances are independent; state() is a copy; a bad rate (0, negative, NaN, missing) is refused by name
//   4  IN A DIVE    with INSTANT rates a dive is bit-for-bit the dive with no actuators (same score, same fingerprint); with ACTUATORS a pilot that bangs the tank is slower to sink than one without them, and the
//                   autopilot's score gets worse, not better, on the same dives (the limit takes away; it does not give)
//   5  THE FRONT DOOR the export list is pinned; the report says real numbers
//
// SABOTAGE LOG -- ELEVEN, each applied to physics/mechanics/subActuators.mjs in place, the gate run, the file restored; every one red by name (the number is how many rows went red):
//   C1 no slew limit 7 | C2 pump rate 0.3 5 | C3 command not clamped before the limit 1 | C4 NaN kept 1 | C5 the limit baked at 30 Hz, ignoring dt 1 | C6 state() returns the live object 1
//   C7 the state shared between instances 2 | C8 a bad rate accepted 1 | C9 only the upward slew limited 1 | C10 every control uses the pump's rate 2
// C5 went 0 red the first time: every row stepped at 1/30 s, so a limit baked at 30 Hz was indistinguishable; the dt row (0.1 s and 1/60 s steps) holds it. C7's first run was a ReferenceError (the shared
// object was not defined) that counted as 0 FAIL lines -- a crash is not a catch; it was re-run with the object defined.
"use strict";
import * as Act from "./subActuators.mjs";
import * as T from "../../brain/subTask.mjs";
import * as A from "../../brain/autopilotSub.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const DT = 1 / 30;

console.log("subActuators-selfcheck -- the vessel's muscles have a speed limit\n");

console.log("1. THE SLEW");
{
    const a = Act.createActuators(); let worst = 0, prev = 0, arrived = -1, exact = true;
    for (let i = 1; i <= 260; i++) { const v = a.step({ ballast: 1 }, DT).ballast, expect = Math.min(1, 0.15 * i * DT); if (Math.abs(v - expect) > 1e-12) exact = false; worst = Math.max(worst, v - prev); prev = v; if (arrived < 0 && v >= 1) arrived = i; }
    ok("!! from rest a command of 1 on the ballast pump reaches min(1, 0.15 t) after t seconds EXACTLY, every tick for 260 ticks, and arrives at tick ceil(1 / (0.15 / 30)) = 200", exact && arrived === 200, `arrived at ${arrived}`);
    ok("!! no control ever moves more than rate x dt in a tick (the pump: 0.005 per tick)", worst <= 0.15 * DT + 1e-15, worst.toExponential(3));
    const to = {};
    for (const k of Act.NAMES) { const c = Act.createActuators(); let i = 0; while (c.step({ [k]: 1 }, DT)[k] < 1 && i < 1000) i++; to[k] = (i + 1) * DT; }
    ok("!! each control has its OWN rate: a full 0 -> 1 takes 1.0 s on the planes and the rudder, 0.667 s on the screw, 6.67 s on the pump (to a tick)", Math.abs(to.pitch - 1) < 2 * DT && Math.abs(to.yaw - 1) < 2 * DT && Math.abs(to.thrust - 1 / 1.5) < 2 * DT && Math.abs(to.ballast - 1 / 0.15) < 2 * DT, JSON.stringify(to));
    const d1 = Act.createActuators().step({ ballast: 1, pitch: 1 }, 0.1), d2 = Act.createActuators().step({ ballast: 1, pitch: 1 }, 1 / 60);
    ok("!! the limit scales with the TICK it is given, not with a baked-in 30 Hz: one 0.1 s step moves the pump 0.015 and the planes 0.1; one 1/60 s step moves them 0.0025 and 1/60", Math.abs(d1.ballast - 0.015) < 1e-15 && Math.abs(d1.pitch - 0.1) < 1e-15 && Math.abs(d2.ballast - 0.0025) < 1e-15 && Math.abs(d2.pitch - 1 / 60) < 1e-15, `${d1.ballast} ${d2.ballast}`);
    const c = Act.createActuators(); for (let i = 0; i < 200; i++) c.step({ pitch: 1 }, DT); let swing = 0; while (c.step({ pitch: -1 }, DT).pitch > -1 && swing < 1000) swing++;
    ok("!! a swing from +1 to -1 takes 2 / rate: 2.0 s on the planes (to a tick)", Math.abs((swing + 1) * DT - 2) < 2 * DT, `${((swing + 1) * DT).toFixed(3)} s`);
}

console.log("\n2. THE INPUT");
{
    const a = Act.createActuators({ pitch: 100, yaw: 100, thrust: 100, ballast: 100 });   // fast enough that one tick reaches the command
    const hi = a.step({ pitch: 9, yaw: -9, thrust: 5, ballast: 2 }, 1);
    ok("!! a command is clamped to [-1, 1] BEFORE the limit: 9, -9, 5 and 2 become 1, -1, 1, 1", hi.pitch === 1 && hi.yaw === -1 && hi.thrust === 1 && hi.ballast === 1, JSON.stringify(hi));
    const bad = a.step({ pitch: NaN, yaw: Infinity, thrust: undefined, ballast: "x" }, 1), none = Act.createActuators(Act.INSTANT).step({}, 1);
    ok("!! a NaN, an infinity, a string or a missing field is a command of 0 (the control is driven to 0, not left alone), and an empty command is all zeros", bad.pitch === 0 && bad.yaw === 0 && bad.thrust === 0 && bad.ballast === 0 && Object.values(none).every((v) => v === 0));
    const cmd = Object.freeze({ pitch: 0.5, yaw: 0.5, thrust: 0.5, ballast: 0.5 }); let threw = false; try { Act.createActuators().step(cmd, DT); } catch { threw = true; }
    ok("the command object is not edited (a frozen one is accepted)", !threw && cmd.pitch === 0.5);
}

console.log("\n3. THE OBJECT");
{
    const a = Act.createActuators(), b = Act.createActuators(); a.step({ ballast: 1 }, 1);
    const s = a.state(); s.ballast = 99;
    ok("!! instances are independent (stepping one does not move the other), and state() is a COPY (editing it does not edit the actuator)", b.state().ballast === 0 && a.state().ballast > 0 && a.state().ballast < 1);
    const err = (r) => { try { Act.createActuators(r); return null; } catch (e) { return e.message; } };
    ok("!! a rate that is zero, negative, NaN or missing is refused, by name of the control", /ballast/.test(err({ ...Act.ACTUATORS, ballast: 0 }) || "") && /pitch/.test(err({ ...Act.ACTUATORS, pitch: -1 }) || "") && /yaw/.test(err({ ...Act.ACTUATORS, yaw: NaN }) || "") && /thrust/.test(err({ pitch: 1, yaw: 1, ballast: 1 }) || ""));
    ok("ACTUATORS and INSTANT are frozen, and the pump is the slow one (a full tank swing 13.3 s)", Object.isFrozen(Act.ACTUATORS) && Object.isFrozen(Act.INSTANT) && Act.ACTUATORS.ballast < Act.ACTUATORS.pitch && Math.abs(2 / Act.ACTUATORS.ballast - 13.33) < 0.01);
}

console.log("\n4. IN A DIVE");
{
    const sc = T.scenario(9, "current"), pil = A.pilot(), plain = T.fly(pil, sc), inst = T.fly(pil, sc, { actuators: Act.INSTANT });
    ok("!! with INSTANT rates a dive is BIT-FOR-BIT the dive with no actuators: the same score and the same fingerprint", plain.score === inst.score && plain.fingerprint === inst.fingerprint, plain.fingerprint);
    const flood = () => ({ ballast: 1, thrust: 0 }), fast = T.fly(flood, T.scenario(3, "nominal")), slow = T.fly(flood, T.scenario(3, "nominal"), { actuators: Act.ACTUATORS });
    ok("!! a pilot that floods the tank at once sinks more slowly through a pump that takes 6.7 s to fill: it grounds LATER (more ticks flown) with the actuators than without", fast.status !== "submerged" && slow.ticks > fast.ticks, `${fast.ticks} vs ${slow.ticks} ticks`);
    const a = T.evaluate(pil, T.HELD_OUT_SET), b = T.evaluate(pil, T.HELD_OUT_SET, { actuators: Act.ACTUATORS });
    ok("!! the limit takes away, it does not give: the autopilot scores worse on HELD_OUT_SET with the actuators, and still finishes every dive", b.score < a.score && b.crashed === 0, `${a.score.toFixed(4)} -> ${b.score.toFixed(4)}`);
}

console.log("\n5. THE FRONT DOOR");
{
    ok("!! the export list is pinned: ACTUATORS, INSTANT, NAMES, createActuators, reportLines", Object.keys(Act).sort().join(",") === "ACTUATORS,INSTANT,NAMES,createActuators,reportLines", Object.keys(Act).sort().join(","));
    const l = Act.reportLines();
    ok("the report says real numbers and the pump's full swing", l.length === 1 && !/NaN|undefined/.test(l[0]) && /13\.3 s/.test(l[0]));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
