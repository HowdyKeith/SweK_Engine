// WebGLEngine/brain/manualAssist-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/manualAssist-selfcheck.mjs      (~0.3 s)
//
// THE HUMAN'S STICK, WITH THE WINGS COMING BACK. brain/manualAssist.mjs puts the autopilot's inner loops under the keyboard of es-flight6dof.html: roll is a bank angle, a released stick levels the wings, the climb is drawn to zero when the pitch
// stick is neutral. The report that started it: a held left key rolled the aircraft over "way too fast" and it did not come back. Measured here before the assist existed: full left stick is 185-200 degrees a second and the aircraft is on the ground in 7.6 s.
//   1  HANDS OFF    a neutral stick flies level for 30 s: bank under 1 degree, altitude within 10 m, airspeed within 3 m/s
//   2  ROLL         full left stick takes the bank to -0.7 rad (40 degrees) and holds it, full right to +0.7, half stick to 20; the roll rate never passes 70 degrees a second (the raw stick's 190)
//   3  LEVELLING    from a 40 degree bank either way, a stick let go has the wings level (under 3 degrees) in 3 s; from 60 degrees too
//   4  THE TURN     held for 10 s at 40 degrees the sideslip stays under 3 degrees and the altitude falls less than 15 m (the bank pitch compensation and the coordination law)
//   5  PITCH        a back-stick raises the nose (more than 2 degrees above the neutral-stick pitch after 1 s) and a stick let go draws the climb rate back under 1 m/s in 15 s
//   6  RAW          with the assist off the stick is what it was: pitch = trim + 0.55 stick, roll = stick, yaw = 0.6 stick, to the bit -- and a 3 s left stick tumbles the aircraft into the ground inside 10 s (the control: this is what the assist replaced)
//   7  BAD INPUT    a NaN stick reads as 0, a stick of 9 reads as 1
//   8  THE PAGE     es-flight6dof.html flies manualPilot through assisted(), has the assist checkbox (on by default, remembered) and passes the checkbox as `assist`
//
// SABOTAGE LOG -- SEVENTEEN, each applied to brain/manualAssist.mjs (M) or es-flight6dof.html (P) in place, the gate run, the file restored; every one red by name (rows red):
//   M1 max bank 1.2 rad 2 | M2 the roll loop given the whole aileron 1 | M3 the bank sign flipped 2 | M4 no level-off 3 | M5 the roll stick not clamped 1 | M6 NaN not read as 0 1 | M7 the raw path ignored 2 | M8 no pitch authority 2 | M9 no rudder pedal 1
//   M10 the stick ignored (always wings level) 7 | M11 the level-off always on, even under a held pull 0 THE FIRST TIME (a held pull still raised the nose 8 degrees; the row for a held pull's CLIMB RATE now holds it: 1) | M12 the roll loop unclamped 1 | M13 no coordination law 1 | M14 the raw roll halved 2
//   P1 the page passes assist true always 1 | P2 the box unticked by default 1 | P3 the choice not remembered 1
// The first version let the roll loop use the whole aileron and the first 0.12 s of a roll was 119 degrees a second; half of it was 88; a third (ROLL_AUTH 0.35) is 64 and takes the wings to 40 degrees in 1 s.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as F from "../physics/mechanics/flightModel6dof.mjs";
import * as AF from "./autopilotFlight.mjs";
import * as M from "./manualAssist.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const D = 180 / Math.PI, model = AF.defaultModel(), tg = { altitude: 300, heading: 0, airspeed: 45 };
const neutral = { pitch: 0, roll: 0, yaw: 0, throttle: 0.66 };

/** Fly `secs` with stick(t); returns the trace { t, bank, rollRate, pitch, alt, V, beta, climb } each 0.1 s, and the end status. */
function fly(stick, secs, { assist = true, start = {} } = {}) {
    let s = F.createState({ pos: [0, 0, 300], speed: 45, mass: model.mass, inertia: model.inertia, ...start }), status = "airborne"; const tr = [];
    for (let i = 0; i < secs * 60; i++) {
        const t = i / 60, r = F.stepFlight(model, s, M.assisted(s, tg, [0, 0, 0], stick(t), { assist }), F.DT, [0, 0, 0]); s = r.state;
        if (r.status !== "airborne") { status = r.status; break; }
        if (i % 6 === 0) { const a = F.attitude(s), q = F.rates(s); tr.push({ t, bank: a.bank, rollRate: q.roll, pitch: a.pitch, alt: a.altitude, V: a.airspeed, beta: a.beta, climb: s.vel[2] }); }
    }
    return { tr, status, last: tr[tr.length - 1] };
}
const at = (r, t) => r.tr.find((p) => p.t >= t) || r.last;

console.log("manualAssist-selfcheck -- the stick, with the wings coming back\n");

console.log("1. HANDS OFF");
{
    const r = fly(() => neutral, 30), a = r.last;
    ok("!! a neutral stick flies level for 30 s: bank under 1 degree, altitude within 10 m of 300, airspeed within 3 m/s of 45", r.status === "airborne" && Math.max(...r.tr.map((p) => Math.abs(p.bank))) * D < 1 && Math.abs(a.alt - 300) < 10 && Math.abs(a.V - 45) < 3, `bank ${(a.bank * D).toFixed(2)}, alt ${a.alt.toFixed(1)}, V ${a.V.toFixed(1)}`);
}

console.log("\n2. ROLL");
{
    const left = fly(() => ({ ...neutral, roll: -1 }), 8), right = fly(() => ({ ...neutral, roll: 1 }), 8), half = fly(() => ({ ...neutral, roll: 0.5 }), 8);
    ok("!! full left stick banks to -0.7 rad and holds it (within 0.05); full right to +0.7; half stick to +0.35", Math.abs(left.last.bank + 0.7) < 0.05 && Math.abs(right.last.bank - 0.7) < 0.05 && Math.abs(half.last.bank - 0.35) < 0.04, `${left.last.bank.toFixed(3)}, ${right.last.bank.toFixed(3)}, ${half.last.bank.toFixed(3)}`);
    const worst = Math.max(...left.tr.concat(right.tr).map((p) => Math.abs(p.rollRate))) * D;
    ok("!! the roll rate never passes 70 degrees a second (the raw stick's was 190)", worst < 70, `${worst.toFixed(0)} deg/s`);
    ok("and it is on its way: 40 degrees of bank inside 2 s", at(left, 2).bank < -0.62 && at(right, 2).bank > 0.62);
}

console.log("\n3. LEVELLING");
{
    for (const [name, bank] of [["+40", 0.7], ["-40", -0.7], ["+60", 1.05]]) {
        const r = fly(() => neutral, 4, { start: { bank } }), p = at(r, 3);
        ok(`!! from a ${name} degree bank a neutral stick has the wings level (under 3 degrees) in 3 s and holds them`, Math.abs(p.bank) * D < 3 && Math.abs(r.last.bank) * D < 3 && r.status === "airborne", `${(p.bank * D).toFixed(1)} at 3 s, ${(r.last.bank * D).toFixed(1)} at 4 s`);
    }
    const rel = fly((t) => ({ ...neutral, roll: t < 3 ? -1 : 0 }), 9);
    ok("!! the stick let go after a held left: the wings are level 3 s later and stay", Math.abs(at(rel, 6).bank) * D < 3 && Math.abs(rel.last.bank) * D < 3, `${(at(rel, 6).bank * D).toFixed(1)} degrees`);
}

console.log("\n4. THE TURN");
{
    const r = fly(() => ({ ...neutral, roll: 1 }), 10), mb = Math.max(...r.tr.filter((p) => p.t > 2).map((p) => Math.abs(p.beta))) * D;
    ok("!! held at 40 degrees for 10 s the sideslip stays under 3 degrees and the altitude falls less than 15 m", mb < 3 && 300 - r.last.alt < 15 && r.status === "airborne", `sideslip ${mb.toFixed(2)} deg, altitude ${(300 - r.last.alt).toFixed(1)} m lost`);
}

console.log("\n5. PITCH");
{
    const ref = fly(() => neutral, 1), pull = fly(() => ({ ...neutral, pitch: -0.5 }), 1), push = fly(() => ({ ...neutral, pitch: 0.5 }), 1);
    ok("!! the pitch stick works both ways: S / down is nose UP in this page's sense (stick +1 = pull back): +0.5 raises the nose by more than 2 degrees against neutral after 1 s, -0.5 lowers it by more than 2", (push.last.pitch - ref.last.pitch) * D > 2 && (ref.last.pitch - pull.last.pitch) * D > 2, `${((push.last.pitch - ref.last.pitch) * D).toFixed(1)} and ${((pull.last.pitch - ref.last.pitch) * D).toFixed(1)}`);
    const held = fly(() => ({ ...neutral, pitch: 0.5 }), 3), heldD = fly(() => ({ ...neutral, pitch: -0.5 }), 3);
    ok("!! a HELD pull is a pull: after 3 s of half stick back the aircraft climbs at more than 5 m/s (and descends at more than 5 m/s for half stick forward); the level-off fades out as the stick goes in", held.last.climb > 5 && heldD.last.climb < -5, `${held.last.climb.toFixed(2)} and ${heldD.last.climb.toFixed(2)} m/s`);
    const rel = fly((t) => ({ ...neutral, pitch: t < 2 ? 0.5 : 0 }), 17), c = rel.last.climb;
    ok("!! a pitch stick let go draws the climb rate back under 1 m/s within 15 s", Math.abs(c) < 1 && rel.status === "airborne", `${c.toFixed(2)} m/s`);
}

console.log("\n6. RAW");
{
    const gd = AF.guidance(F.createState({ pos: [0, 0, 300], speed: 45, mass: model.mass, inertia: model.inertia }), tg, [0, 0, 0]), st0 = F.createState({ pos: [0, 0, 300], speed: 45, mass: model.mass, inertia: model.inertia });
    const raw = M.assisted(st0, tg, [0, 0, 0], { pitch: 0.4, roll: -0.8, yaw: 0.5, throttle: 0.3 }, { assist: false });
    ok("!! the raw stick is the old one to the bit: pitch = trim + 0.55 stick, roll = stick, yaw = 0.6 stick, the throttle the human's", raw.pitch === Math.max(-1, Math.min(1, gd.stickTrim + 0.55 * 0.4)) && raw.roll === -0.8 && raw.yaw === 0.6 * 0.5 && raw.throttle === 0.3);
    const r = fly((t) => ({ ...neutral, roll: t < 3 ? -1 : 0 }), 10, { assist: false }), worst = Math.max(...r.tr.map((p) => Math.abs(p.rollRate))) * D;
    ok("!! THE CONTROL: the raw stick held left for 3 s rolls at over 150 degrees a second and the aircraft is on the ground inside 10 s -- what the assist replaced", worst > 150 && r.status !== "airborne", `${worst.toFixed(0)} deg/s, ${r.status}`);
}

console.log("\n7. BAD INPUT");
{
    const s0 = F.createState({ pos: [0, 0, 300], speed: 45, mass: model.mass, inertia: model.inertia }), a = M.assisted(s0, tg, [0, 0, 0], { pitch: NaN, roll: NaN, yaw: NaN, throttle: NaN }), b = M.assisted(s0, tg, [0, 0, 0], neutral);
    ok("!! a NaN stick reads as neutral (and a NaN throttle as 0)", a.pitch === b.pitch && a.roll === b.roll && a.yaw === b.yaw && a.throttle === 0);
    const big = M.assisted(s0, tg, [0, 0, 0], { pitch: 9, roll: -9, yaw: 9, throttle: 9 }), one = M.assisted(s0, tg, [0, 0, 0], { pitch: 1, roll: -1, yaw: 1, throttle: 1 });
    ok("!! a stick of 9 reads as 1, in every channel", JSON.stringify(big) === JSON.stringify(one) && big.throttle === 1);
}

console.log("\n8. THE PAGE");
{
    const aq = fs.readFileSync(path.join(ENG, "es-flight6dof.html"), "utf8");
    ok("!! manualPilot flies through assisted() with the stick and the page's assist flag, and the old raw line is gone", /import \* as MA from "\/brain\/manualAssist\.mjs"/.test(aq) && /MA\.assisted\(state, target, wind, \{ pitch: stickPitch, roll: stickRoll, yaw: stickYaw, throttle: throttleHeld \}, \{ assist: assistOn \}\)/.test(aq) && !/gd\.stickTrim \+ 0\.55 \* stickPitch/.test(aq));
    ok("!! the assist checkbox exists, is on by default and is remembered", /id="assistBox"[^>]*checked/.test(aq) && /localStorage\.setItem\("flight6dof\.assist"/.test(aq) && /let assistOn = true; try \{ assistOn = localStorage\.getItem\("flight6dof\.assist"\) !== "0"/.test(aq));
}

// v4901 -- the exports the definition census asked this gate to name (MAX_BANK, PITCH_AUTH, YAW_AUTH), checked in one row.
{ const M = await import("./manualAssist.mjs"); const names = ["MAX_BANK", "PITCH_AUTH", "YAW_AUTH"];
  const okShape = names.every((n) => n in M && (typeof M[n] === "function" || typeof M[n] === "number" || typeof M[n] === "string" || typeof M[n] === "object"));
  ok("the stability assist's three authority constants (MAX_BANK, PITCH_AUTH, YAW_AUTH) are exported numbers, the ones sections 1-3 compute with", okShape, names.map((n) => n + ":" + typeof M[n]).join(" ")); }
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
