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
//   6b THE HIGH RIDER (v4901) the same wrapper on a hull with a 25% ballast range floats at the depth derived from ITS model (0.3 m), on the plain vessel and with a tank
//
// HIGH RIDER LOG (v4901, 6b) -- EIGHT more, each in place, restored, red by name (rows red): G14 surfacedDepth a constant 3 | G15 the rise not flown to the model's float depth 0 THE FIRST TIME (the afloat law blows to the stop whatever the target says; the spy row now reads the depth the pilot underneath is asked for: 1)
//   G16 the brake range compare inverted 5 | G17 no brake 3 | G18 brake on every vessel (it spends the EXPLORER's bottle) 3 | G19 brake gain 0.5 3 | G20 the brake keyed to sinking not rising 3 | G21 float depth with the sign of the range wrong 4
// A first draft of the high rider's afloat law blew to -1 at 3 m and BROACHED in 4 of 4 flights (20.8 s in: a boat 25% light, rising at 2.7 m/s, leaves the water); the brake is the fix and the control row proves it matters. A first brake on EVERY vessel pumped the EXPLORER's bottle empty (level -0.746, air 0.00), so it is the big tank's alone.
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

console.log("\n6b. THE HIGH RIDER: a larger ballast range is a different SPEC, not a different pilot");
{
    const H = await import("../physics/mechanics/subHulls.mjs");
    const hr = H.model("highRider"), hrTank = S.createSubModel(Object.freeze({ ...hr.spec, ...F.FLOOD_SPEC, ballastRange: 0.25, name: "high-rider-tank" }));
    ok("!! surfacedDepth is derived from the model: 0.564 m for the EXPLORER (the constant), 0.3 m for a 25% main ballast, and the hull's crown stands 0.3 m out of the water against 4 cm", Math.abs(P.surfacedDepth(plain) - P.SURFACED_DEPTH) < 1e-9 && Math.abs(P.surfacedDepth(hr) - 0.3) < 1e-9 && Math.abs((hr.spec.radius - P.surfacedDepth(hr)) - 0.3) < 1e-9, `${P.surfacedDepth(plain).toFixed(4)} and ${P.surfacedDepth(hr).toFixed(4)} m`);
    for (const [name, model] of [["high rider", hr], ["high rider with a tank", hrTank]]) {
        let worst = { err: 0, speed: 0, ended: 0, n: 0 };
        for (const d of [15, 38]) for (const v of [1.5, 2.5]) {
            const w = P.wrap(A.pilot({ model }), { model });
            let s2 = S.createState({ depth: d, speed: v, model }), ended = false;
            for (let i = 0; i < 9000; i++) { const r = S.stepSub(model, s2, w(s2, { depth: 20, heading: 0, speed: 2, surface: true }, [0, 0, 0])); s2 = r.state; if (r.status !== "submerged") { ended = true; break; } }
            const a = S.attitude(s2); worst.n++; if (ended) worst.ended++; worst.err = Math.max(worst.err, Math.abs(a.depth - P.surfacedDepth(model))); worst.speed = Math.max(worst.speed, a.speed);
        }
        ok(`!! ${name}: all ${worst.n} flights end afloat at ITS float depth (0.3 m, within 0.1 m), nearly stopped, none ended`, worst.ended === 0 && worst.err < 0.1 && worst.speed < 0.5, `worst depth error ${worst.err.toFixed(3)} m, speed ${worst.speed.toFixed(2)} m/s`);
    }
}

{
    const H = await import("../physics/mechanics/subHulls.mjs"), hr = H.model("highRider");
    let ends = 0, n = 0;
    for (const d of [15, 38]) for (const v of [1.5, 2.5]) {
        const w = P.wrap(A.pilot({ model: hr }), { model: hr, brakeRange: 1 });   // the blow brake switched off
        let s2 = S.createState({ depth: d, speed: v, model: hr }); n++;
        for (let i = 0; i < 2400; i++) { const r = S.stepSub(hr, s2, w(s2, { depth: 20, heading: 0, speed: 2, surface: true }, [0, 0, 0])); s2 = r.state; if (r.status !== "submerged") { ends++; break; } }
    }
    ok("!! THE CONTROL: the same high rider with the blow brake off BROACHES (the centre leaves the water: a boat 25% light shoots out of the sea on its own momentum) in " + ends + " of " + n + " flights; the brake (ballast eased off while it is still rising fast) is what keeps it in", ends >= 2);
    const spy = (model) => { let seen = null; P.wrap((st, t) => { seen = t.depth; return { pitch: 0, yaw: 0, thrust: 0, ballast: 0 }; }, { model })(S.createState({ depth: 20, speed: 2, model }), { depth: 20, heading: 0, speed: 2, surface: true }, [0, 0, 0]); return seen; };
    ok("!! the rise is flown to the vessel's OWN float depth: the pilot underneath is asked for 0.564 m on the EXPLORER and 0.3 m on the high rider (and 0.564 with no model named)", Math.abs(spy(plain) - 0.564) < 1e-9 && Math.abs(spy(hr) - 0.3) < 1e-9, `${spy(plain)} and ${spy(hr)}`);
    ok("the brake belongs to the big tank: the EXPLORER's wrapper sends a full blow (-1) on a rising boat just below the surface, the high rider's eases off", (() => { const up = (model) => { const s3 = S.createState({ depth: 2, speed: 2, model }); return P.wrap(A.pilot({ model }), { model })({ ...s3, vel: [s3.vel[0], s3.vel[1], 1.0] }, { depth: 20, heading: 0, speed: 2, surface: true }, [0, 0, 0]).ballast; }; return up(plain) === -1 && up(H.model("highRider")) > -0.5; })());
}

console.log("\n7. THE FRONT DOOR");
ok("surfacePilot's exports are pinned and SURFACE is frozen at 3 m", Object.keys(P).sort().join(",") === "SURFACE,SURFACED_DEPTH,stage,surfacedDepth,wrap" && Object.isFrozen(P.SURFACE) && P.SURFACE.nearDepth === 3, Object.keys(P).sort().join(","));

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
