// WebGLEngine/brain/surfacePilot-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/surfacePilot-selfcheck.mjs      (~3 s)
//
// COMING UP, AND STAYING UP. brain/surfacePilot.mjs adds one optional field, `surface: true`, to the target of any submarine pilot. This gate holds:
//
//   1  THE STAGES   dive / rise / afloat on hand-made states, with the 3 m line exact
//   2  UNTOUCHED    with `surface` absent or false the wrapper sends the pilot's four numbers, tick for tick (60 s), on both vessels
//   3  SURFACING    from 3 depths x 2 speeds x 2 headings, on the plain vessel and on the flood vessel (a tank with a pump, a bottle and a drop weight): in 200 s every boat is afloat -- centre 0.564 m down (+-0.1 m),
//                   level, nearly stopped (< 0.5 m/s), never broached, never nearer the surface than 0.2 m -- and the tank is blown (flood vessel)
//   4  THE CONTROL  the autopilot alone, asked for the same 0.564 m at 2 m/s, arrives and holds it under power (still over 1.5 m/s after 150 s): the AFLOAT law is what makes the boat stop and ride on its buoyancy
//   5  DIVING AGAIN the same wrapped boat told to dive (no surface) leaves the surface: 20 m target, within 5 m of it in 150 s, on the plain vessel
//   6  THE FREEBOARD the derived float depth R - 2R(1 - ballastRange) is 0.564 and a boat trimmed neutral hangs at R = 0.6: the blow buys 3.6 cm, said plainly (the tower is what shows)
//   7  THE FRONT DOOR the export list is pinned
//
// SABOTAGE LOG -- THIRTEEN, each applied to brain/surfacePilot.mjs in place, the gate run, the file restored; every one red by name (rows red in brackets):
//   G1 surfaced depth 1.5 m 4 | G2 the afloat line at 6 m 2 | G3 at 1 m 2 | G4 3 m exactly counted afloat 1 | G5 the tank not blown afloat 5 | G6 screw at full afloat 3 | G7 pitch hold zeroed 1 | G8 heading hold zeroed 1
//   G9 `surface` ignored 4 | G10 no rationing 2 (and a crash: the mutant leaves a pilot with no ballast to read) | G11 rationing applied on a vessel with no bottle 1 | G12 the rise flies the target's own depth 5 | G13 a dive flown to the surface depth 3
// G7, G8 and G11 went 0 red the first time: a boat on its buoyancy rights itself and holds its heading on its own drag, so flying it cannot tell a pitch hold from none; the plain vessel surfaces without a bottle's rationing.
// The command rows (the sign of the plane and of the rudder, the ballast of a rise on each vessel) now hold them. The first draft of the rationing row also used a state with no tank (createState makes none until stepSub's first tick) and said the flood vessel was not rationed.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as A from "./autopilotSub.mjs";
import * as F from "./floodTask.mjs";
import * as P from "./surfacePilot.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const plain = S.createSubModel(), flood = F.floodModel(), VESSELS = [["plain", plain], ["flood", flood]];
const at = (model, depth) => S.createState({ depth, speed: 2, model });

console.log("surfacePilot-selfcheck -- coming up, and staying up\n");

console.log("1. THE STAGES");
{
    const s = (d) => at(plain, d);
    ok("no surface asked (absent, false) is a dive, at any depth", P.stage(s(30), { depth: 20 }) === "dive" && P.stage(s(1), { depth: 20, surface: false }) === "dive" && P.stage(s(30), undefined) === "dive");
    ok("!! surface asked: deeper than 3 m is the rise, shallower the afloat, and exactly 3 m is the rise", P.stage(s(30), { surface: true }) === "rise" && P.stage(s(3.01), { surface: true }) === "rise" && P.stage(s(3), { surface: true }) === "rise" && P.stage(s(2.99), { surface: true }) === "afloat");
}

console.log("\n2. UNTOUCHED");
for (const [name, model] of VESSELS) {
    const base = A.pilot({ model }), w = P.wrap(base, { model }), tg = { depth: 22, heading: 0.5, speed: 2 };
    let a = at(model, 30), b = a, same = true;
    for (let i = 0; i < 1800; i++) { const c1 = base(a, tg, [0, 0, 0]), c2 = w(b, tg, [0, 0, 0]); if (JSON.stringify(c1) !== JSON.stringify(c2)) same = false; a = S.stepSub(model, a, c1).state; b = S.stepSub(model, b, c2).state; }
    ok(`!! ${name}: 60 s with no surface asked, the wrapper sends exactly what the pilot sends and the two boats are in the same place`, same && a.pos.every((v, i) => v === b.pos[i]));
}

console.log("\n3. SURFACING");
const finals = [];
for (const [name, model] of VESSELS) {
    const worst = { depthErr: 0, speed: 0, pitch: 0, minD: 99, ended: 0, n: 0, level: -9, levelMax: -9, airMin: 9 };
    for (const d of [15, 25, 38]) for (const v of [1.5, 2.5]) for (const h of [0, 2]) {
        const w = P.wrap(A.pilot({ model }), { model });
        let s = S.createState({ depth: d, speed: v, heading: h, model }), minD = 99, ended = false;
        for (let i = 0; i < 6000; i++) { const r = S.stepSub(model, s, w(s, { depth: 20, heading: 0, speed: 2, surface: true }, [0, 0, 0])); s = r.state; if (r.status !== "submerged") { ended = true; break; } minD = Math.min(minD, S.attitude(s).depth); }
        const a = S.attitude(s);
        worst.n++; if (ended) worst.ended++;
        worst.depthErr = Math.max(worst.depthErr, Math.abs(a.depth - P.SURFACED_DEPTH)); worst.speed = Math.max(worst.speed, a.speed); worst.pitch = Math.max(worst.pitch, Math.abs(a.pitch)); worst.minD = Math.min(worst.minD, minD);
        if (s.tank) { worst.level = Math.max(worst.level, s.tank.level); worst.airMin = Math.min(worst.airMin, s.tank.air); }
    }
    finals.push(worst);
    ok(`!! ${name}: all ${worst.n} flights end afloat -- none ended, centre within 0.1 m of 0.564, level (< 0.01 rad), nearly stopped (< 0.5 m/s)`, worst.ended === 0 && worst.depthErr < 0.1 && worst.pitch < 0.01 && worst.speed < 0.5, `worst depth error ${worst.depthErr.toFixed(3)} m, speed ${worst.speed.toFixed(2)} m/s, pitch ${worst.pitch.toFixed(4)} rad`);
    ok(`${name}: never nearer the surface than 0.2 m (no broaching on the way up)`, worst.minD > 0.2, `nearest ${worst.minD.toFixed(3)} m`);
}
ok("!! the flood vessel's tank is blown to the stop in every flight (level under -0.99) and AIR IS LEFT (the rise rations the bottle: at least 0.3 of the 1.5 in every flight)", finals[1].level < -0.99 && finals[1].airMin >= 0.3, `highest level ${finals[1].level.toFixed(3)}, least air ${finals[1].airMin.toFixed(2)}`);

{
    const w = P.wrap(A.pilot({ model: plain }), { model: plain }), sf = { surface: true, heading: 0, depth: 20, speed: 2 };
    const afloat = (o) => ({ ...S.createState({ depth: 0.564, speed: 0.3, model: plain, ...o }) });
    const up = w(afloat({ pitch: 0.2 }), sf, [0, 0, 0]), dn = w(afloat({ pitch: -0.2 }), sf, [0, 0, 0]);
    ok("!! afloat, the planes hold the hull LEVEL: a nose-up boat is given nose-down plane, a nose-down boat nose-up", up.pitch < -0.01 && dn.pitch > 0.01 && up.thrust === 0 && up.ballast === -1, `pitch +0.2 rad -> ${up.pitch.toFixed(3)}, -0.2 -> ${dn.pitch.toFixed(3)}`);
    const right = w(afloat({ heading: -0.8 }), sf, [0, 0, 0]), left = w(afloat({ heading: 0.8 }), sf, [0, 0, 0]);
    ok("!! afloat, the rudder holds the HEADING asked: a boat to the left of it is given right rudder, a boat to the right left rudder", right.yaw > 0.01 && left.yaw < -0.01, `heading -0.8 -> yaw ${right.yaw.toFixed(3)}, +0.8 -> ${left.yaw.toFixed(3)}`);
    const deep = S.createState({ depth: 20, speed: 2, model: plain }), deepF = { ...S.createState({ depth: 20, speed: 2, model: flood }), tank: S.initialTank(flood) };
    const pb = A.pilot({ model: plain })(deep, { depth: P.SURFACED_DEPTH, heading: 0, speed: 2 }, [0, 0, 0]), pw = w(deep, sf, [0, 0, 0]), fw = P.wrap(A.pilot({ model: flood }), { model: flood })(deepF, sf, [0, 0, 0]);
    ok("!! the bottle is rationed on a vessel that HAS one and only there: the rise sends the pilot's own ballast on the plain vessel (a blow), no blow on the flood vessel", pb.ballast < 0 && pw.ballast === pb.ballast && fw.ballast === 0, `plain ${pw.ballast.toFixed(3)} (pilot ${pb.ballast.toFixed(3)}), flood ${fw.ballast}`);
}

console.log("\n4. THE CONTROL");
{
    const base = A.pilot({ model: plain });
    let s = at(plain, 25), maxPitch = 0, last = 0;
    for (let i = 0; i < 4500; i++) { const r = S.stepSub(plain, s, base(s, { depth: P.SURFACED_DEPTH, heading: 0, speed: 2 }, [0, 0, 0])); s = r.state; if (r.status !== "submerged") break; if (i > 3600) maxPitch = Math.max(maxPitch, Math.abs(S.attitude(s).pitch)); last = i; }
    const a = S.attitude(s);
    ok("!! the autopilot alone, asked for 0.564 m at 2 m/s, gets there and HOLDS it under power: still at 2 m/s after 150 s with the planes working (the afloat law is what brings the screw to idle and the boat to rest)", last === 4499 && Math.abs(a.depth - 0.564) < 0.2 && a.speed > 1.5, `depth ${a.depth.toFixed(3)} m, speed ${a.speed.toFixed(2)} m/s, pitch swing ${maxPitch.toFixed(3)} rad`);
}

console.log("\n5. DIVING AGAIN");
{
    const w = P.wrap(A.pilot({ model: plain }), { model: plain });
    let s = at(plain, 25);
    for (let i = 0; i < 4500; i++) s = S.stepSub(plain, s, w(s, { depth: 20, heading: 0, speed: 2, surface: true }, [0, 0, 0])).state;
    const up = S.attitude(s).depth;
    for (let i = 0; i < 4500; i++) s = S.stepSub(plain, s, w(s, { depth: 20, heading: 0, speed: 2 }, [0, 0, 0])).state;
    const down = S.attitude(s).depth;
    ok("!! surfaced, then told to dive (the surface flag off): 150 s later the boat is within 5 m of 20 m", up < 1 && Math.abs(down - 20) < 5, `${up.toFixed(2)} m afloat, ${down.toFixed(2)} m after`);
}

console.log("\n6. THE FREEBOARD");
{
    const R = plain.spec.radius, float = R - 2 * R * (1 - plain.spec.ballastRange);
    ok("!! the derived float depth is SURFACED_DEPTH, and neutral hangs at R: the blow buys 3.6 cm", Math.abs(-float - P.SURFACED_DEPTH) < 1e-3 && Math.abs(R - P.SURFACED_DEPTH - 0.036) < 1e-3, `${(-float).toFixed(4)} m against ${P.SURFACED_DEPTH}`);
    ok("and the model agrees: held at the surface at ballast -1 the weight and the buoyancy balance at that depth", (() => {
        let s = at(plain, 0.564); s = { ...s, vel: [0, 0, 0] };
        const f = S.forcesAndMoments(plain, { ...s, vel: [0, 0, 0] }, { pitch: 0, yaw: 0, thrust: 0, ballast: -1 });
        return Math.abs(f.acc.force[2]) < 0.5 * plain.weight * 0.03;   // within half of the tank's whole range of balanced
    })());
}

console.log("\n7. THE FRONT DOOR");
ok("surfacePilot's exports are pinned and SURFACE is frozen at 3 m", Object.keys(P).sort().join(",") === "SURFACE,SURFACED_DEPTH,stage,wrap" && Object.isFrozen(P.SURFACE) && P.SURFACE.nearDepth === 3, Object.keys(P).sort().join(","));

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
