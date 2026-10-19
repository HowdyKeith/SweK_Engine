// WebGLEngine/physics/mechanics/subSonar-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node physics/mechanics/subSonar-selfcheck.mjs      (~0.1 s)
//
// THE SONAR BUDGET HELD TO ITS CLOSED FORMS, ITS SIGNS AND ITS TRADE-OFFS. physics/mechanics/subSonar.mjs is decibel arithmetic plus geometry; this gate holds each term to the number a pencil gives:
//   1  THE TERMS     sourceLevel is 100 at <= 0.5 m/s and +6.02 dB per doubling above; selfNoise the same from 50; noiseLevel is the POWER sum (66 and 66 make 69.01); transmissionLoss is 20 log10 r + 0.001 r (r < 1 read as 1);
//                    passiveSNR = SL - TL - NL + DI; activeSNR pays TL twice
//   2  THE RANGES    the detection range is where the SNR meets the 8 dB threshold: passiveRange / activeRange / pingHeardRange satisfy their own equation to 1e-6 dB and are monotone in the right direction
//                    (a louder source is heard further; a FASTER listener hears less -- its own flow noise)
//   3  THE TRADE-OFFS the toy's shape: going fast makes a boat louder AND the listener deafer; a creeping boat is heard from under 100 m but a ping finds it from ~390; a ping is heard from 25 x further than it reaches
//   4  THE GEOMETRY  bearing is RELATIVE to the nose, positive to the RIGHT (a target at world -y with heading 0 is +pi/2), elevation positive up, range 3-D; the baffles are the 60 degrees dead astern
//   5  THE LOOKS     listen() gives a bearing and an elevation and NO RANGE field; null out of range and in the baffles; deterministic; the luck is ~zero mean and 3 dB sd; bearing noise shrinks 20 dB per decade of SNR
//                    (to the floor); ping() gives a range within 1% + 1 m of the truth; pingHeard() gives a bearing to the pinger and no range, from far outside the echo's reach
//   6  THE FRONT DOOR the export list is pinned; the report says real numbers
//
// SABOTAGE LOG -- TWENTY-THREE, each applied to physics/mechanics/subSonar.mjs in place, the gate run, the file restored; every one red by name (the number is how many rows went red):
//   Z1 source level 10 log not 20 log 4 | Z2 the source-level floor 1.0 5 | Z3 own noise ignored 5 | Z4 noise added in dB, not power 4 | Z5 no absorption 3 | Z6 spreading 10 log 9 | Z7 the active loss paid once 3
//   Z8 bearing sign flipped 2 | Z9 elevation sign flipped 1 | Z10 range ignores depth 1 | Z11 baffles 180 degrees wide 1 | Z12 baffles ignored in listen 1 | Z13 listen leaks a range field 1 | Z14 threshold 20 dB 10
//   Z15 no luck 1 | Z16 bearing noise does not shrink with SNR 1 | Z17 ping range noise 10% 1 | Z18 pingHeard leaks a range 1 | Z19 two noise channels collide 1 | Z20 luck ignores the seed 1 | Z21 ping 140 dB 5 | Z22 ambient 60 dB 4
//   Z23 baffles ignored in ping 1
// Z12 was not applied the first time (the pattern had a literal backslash-n from the shell); the editor said so, and it was re-run in Python with a real newline.
"use strict";
import * as K from "./subSonar.mjs";
import * as S from "./subModel6dof.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const P = (x, y, z, heading = 0, speed = 2) => ({ pos: [x, y, z], heading, speed }), DEG = Math.PI / 180;

console.log("subSonar-selfcheck -- what a submarine can hear and see\n");

console.log("1. THE TERMS");
{
    ok("!! sourceLevel is 100 dB at and below 0.5 m/s and +20 log10(v / 0.5) above: 112.04 at 2 m/s, +6.02 dB per doubling, the same going astern (|v|)", K.sourceLevel(0) === 100 && K.sourceLevel(0.5) === 100 && Math.abs(K.sourceLevel(2) - (100 + 20 * Math.log10(4))) < 1e-12 && Math.abs(K.sourceLevel(4) - K.sourceLevel(2) - 6.0206) < 1e-3 && K.sourceLevel(-3) === K.sourceLevel(3), `${K.sourceLevel(2).toFixed(3)}`);
    ok("!! selfNoise is the same law from 50 dB (flow noise), and noiseLevel is the POWER sum with the 66 dB ocean: two equal 66 dB terms make 69.01 dB, a 50 dB own noise adds 0.1 dB to the ocean", K.selfNoise(0.1) === 50 && Math.abs(K.selfNoise(2) - 62.0412) < 1e-3 && Math.abs(K.noiseLevel(0, 66, 66) - (66 + 10 * Math.log10(2))) < 1e-12 && Math.abs(K.noiseLevel(0.1) - 10 * Math.log10(10 ** 6.6 + 10 ** 5)) < 1e-12 && K.noiseLevel(0.1) - 66 < 0.11, `${K.noiseLevel(0.1).toFixed(4)}`);
    ok("!! transmissionLoss is 20 log10 r + 0.001 r EXACTLY (100 m: 40.1; 1 km: 61.0; 10 km: 90.0), and a range under 1 m is read as 1 m (TL(0) = TL(0.2) = 0.001)", Math.abs(K.transmissionLoss(100) - 40.1) < 1e-12 && Math.abs(K.transmissionLoss(1000) - 61) < 1e-12 && Math.abs(K.transmissionLoss(10000) - 90) < 1e-9 && K.transmissionLoss(0) === K.transmissionLoss(0.2) && Math.abs(K.transmissionLoss(0) - 0.001) < 1e-15);
    const snr = K.passiveSNR({ sl: 112, range: 300, speed: 2 }), by = 112 - K.transmissionLoss(300) - K.noiseLevel(2) + 15;
    ok("!! passiveSNR = SL - TL - NL + DI (with the listener's own noise at its speed and the 15 dB array), and activeSNR = 150 + 15 - 2 TL - NL + DI (the loss is paid twice)", Math.abs(snr - by) < 1e-12 && Math.abs(K.activeSNR({ range: 200, speed: 1 }) - (150 + 15 - 2 * K.transmissionLoss(200) - K.noiseLevel(1) + 15)) < 1e-12, `${snr.toFixed(3)}`);
}

console.log("\n2. THE RANGES");
{
    const rp = K.passiveRange(K.sourceLevel(2), 2), ra = K.activeRange(2), rh = K.pingHeardRange(2);
    ok("!! the detection range is where the SNR meets the 8 dB threshold, to 1e-6 dB: passive (2 m/s source heard at 2 m/s), active (a 2 m/s pinger) and the range a ping is HEARD at", Math.abs(K.passiveSNR({ sl: K.sourceLevel(2), range: rp, speed: 2 }) - 8) < 1e-6 && Math.abs(K.activeSNR({ range: ra, speed: 2 }) - 8) < 1e-6 && Math.abs(K.passiveSNR({ sl: 150, range: rh, speed: 2 }) - 8) < 1e-6, `${rp.toFixed(1)} ${ra.toFixed(1)} ${rh.toFixed(0)} m`);
    ok("!! a louder source is heard FURTHER, and a FASTER listener hears LESS: passive range rises with the source's speed (94 < 364 < 780 m) and falls with the listener's (the same 2 m/s source: 0.5 m/s listener hears it further than a 4.5 m/s one)", K.passiveRange(K.sourceLevel(0.5), 2) < K.passiveRange(K.sourceLevel(2), 2) && K.passiveRange(K.sourceLevel(2), 2) < K.passiveRange(K.sourceLevel(4.5), 2) && K.passiveRange(K.sourceLevel(2), 0.5) > K.passiveRange(K.sourceLevel(2), 4.5), `${K.passiveRange(K.sourceLevel(2), 0.5).toFixed(0)} vs ${K.passiveRange(K.sourceLevel(2), 4.5).toFixed(0)} m`);
    ok("rangeWhere returns 1 when the signal is already under the threshold at 1 m, and 100,000 when it never falls under it", K.rangeWhere(() => 0) === 1 && K.rangeWhere(() => 99) === 1e5 && Math.abs(K.rangeWhere((r) => 100 - r / 10, 50) - 500) < 1e-6);
}

console.log("\n3. THE TRADE-OFFS");
{
    const quiet = K.passiveRange(K.sourceLevel(0.5), 2), pingR = K.activeRange(2), heard = K.pingHeardRange(2), fast = K.passiveRange(K.sourceLevel(4.5), 2);
    ok("!! a boat creeping at 0.5 m/s is heard from under 100 m, but a ping finds it from more than 350 m: the active sonar's gift is the QUIET boat", quiet < 100 && pingR > 350 && pingR > 3.5 * quiet, `${quiet.toFixed(0)} vs ${pingR.toFixed(0)} m`);
    ok("!! a ping is HEARD from more than 20 x the range it reaches: the pinger announces itself to everything in ten kilometres (9.8 km vs 392 m)", heard > 20 * pingR && heard > 9000, `${(heard / pingR).toFixed(1)} x`);
    ok("!! going fast makes a boat heard from further than twice as far as the same boat at 2 m/s (780 vs 364 m): speed is noise", fast > 2 * K.passiveRange(K.sourceLevel(2), 2));
    ok("!! a torpedo (125 dB) is heard from further away than any boat at its top speed: 1.4 km by a 2 m/s listener", K.passiveRange(K.SONAR.torpedoSL, 2) > K.passiveRange(K.sourceLevel(4.55), 2) && K.passiveRange(K.SONAR.torpedoSL, 2) > 1000);
}

console.log("\n4. THE GEOMETRY");
{
    const g = (to, from = P(0, 0, -30, 0)) => K.geometry(from, to);
    ok("!! a target dead ahead (+x) is bearing 0; to the RIGHT (world -y) is +pi/2; to the left (+y) is -pi/2; astern is +-pi -- relative to the NOSE (heading 0.3 turns every one of them by -0.3)", Math.abs(g(P(100, 0, -30)).bearing) < 1e-12 && Math.abs(g(P(0, -100, -30)).bearing - Math.PI / 2) < 1e-12 && Math.abs(g(P(0, 100, -30)).bearing + Math.PI / 2) < 1e-12 && Math.abs(Math.abs(g(P(-100, 0, -30)).bearing) - Math.PI) < 1e-12 && Math.abs(g(P(100, 0, -30), P(0, 0, -30, 0.3)).bearing + 0.3) < 1e-12);
    ok("!! elevation is positive UP (a target 100 m ahead and 100 m shallower is +45 degrees), range is the 3-D distance (3-4-5), and 'absolute' is the heading that points at it", Math.abs(g(P(100, 0, -30 + 100)).elevation - Math.PI / 4) < 1e-12 && Math.abs(g(P(100, 0, -130)).elevation + Math.PI / 4) < 1e-12 && Math.abs(g(P(30, 0, -30 + 40)).range - 50) < 1e-12 && Math.abs(g(P(0, -100, -30)).absolute - Math.PI / 2) < 1e-12);
    ok("!! the baffles are the 60 degrees dead astern: 151 degrees off the nose is inside, 149 is not, on either side, and the nose is never", K.inBaffles(151 * DEG) && K.inBaffles(-151 * DEG) && !K.inBaffles(149 * DEG) && !K.inBaffles(-149 * DEG) && !K.inBaffles(0) && K.inBaffles(Math.PI));
    const st = S.createState({ depth: 30, speed: 2, heading: 0.5 }), pl = K.platformOf(st);
    ok("platformOf reads a vessel state: its position, its heading and its speed through the water (a current changes the speed it reads)", pl.pos === st.pos && Math.abs(pl.heading - 0.5) < 1e-12 && Math.abs(pl.speed - 2) < 1e-9 && Math.abs(K.platformOf(st, [1, 0, 0]).speed - 2) > 0.1);
}

console.log("\n5. THE LOOKS");
{
    const me = P(0, 0, -30, 0, 2), tg = P(200, -60, -35, 0, 2);
    const c = K.listen(me, tg, { seed: 4, tick: 30 });
    ok("!! listen() gives a BEARING and an ELEVATION and NO RANGE: a contact has exactly the fields bearing, elevation, snr (a passive array does not know how far)", c && Object.keys(c).sort().join() === "bearing,elevation,snr" && !("range" in c), JSON.stringify(c));
    const truth = K.geometry(me, tg);
    ok("!! the bearing is the truth to within the noise (right of the nose, positive; the error under 5 sd of the threshold's 5 degrees), and the same look twice is the same contact", c && Math.abs(c.bearing - truth.bearing) < 25 * DEG && c.bearing > 0 && JSON.stringify(K.listen(me, tg, { seed: 4, tick: 30 })) === JSON.stringify(c));
    ok("!! out of range is silence (a 2 m/s boat at 1,500 m), the baffles are silence (the same boat 200 m astern), and a quiet boat at 200 m is silence (0.5 m/s: 94 m)", K.listen(me, P(1500, 0, -30, 0, 2), { seed: 4, tick: 30 }) === null && K.listen(me, P(-200, 0, -30, 0, 2), { seed: 4, tick: 30 }) === null && K.listen(me, P(200, 0, -30, 0, 0.5), { seed: 4, tick: 30 }) === null);
    const N = 3000, L = Array.from({ length: N }, (_, i) => K.luck(7, i, 3)), mean = L.reduce((a, v) => a + v, 0) / N, sd = Math.sqrt(L.reduce((a, v) => a + (v - mean) ** 2, 0) / N);
    ok("!! the luck is deterministic, ~zero mean and unit sd (3,000 draws), different for another channel, tick and seed", Math.abs(mean) < 0.06 && Math.abs(sd - 1) < 0.06 && K.luck(7, 4, 3) === K.luck(7, 4, 3) && K.luck(7, 4, 3) !== K.luck(7, 4, 2) && K.luck(7, 4, 3) !== K.luck(7, 5, 3) && K.luck(7, 4, 3) !== K.luck(8, 4, 3), `mean ${mean.toFixed(3)} sd ${sd.toFixed(3)}`);
    // detection probability at the closed-form threshold range is one half; well inside it is one
    const rp = K.passiveRange(K.sourceLevel(2), 2), hit = (r) => { let n = 0; for (let t = 0; t < 600; t++) if (K.listen(me, P(r, 0, -30, 0, 2), { seed: 1, tick: t })) n++; return n / 600; };
    const half = hit(rp), near = hit(rp * 0.4), far = hit(rp * 2.5);
    ok("!! detection is a probability around the threshold range: about one half AT passiveRange (0.40..0.60 of 600 looks), certain well inside (0.4 x: > 0.99), hopeless well outside (2.5 x: < 0.01)", half > 0.40 && half < 0.60 && near > 0.99 && far < 0.01, `${half.toFixed(3)} / ${near.toFixed(3)} / ${far.toFixed(3)}`);
    const spread = (r) => { const e = []; for (let t = 0; t < 400; t++) { const k = K.listen(me, P(r, 0, -30, 0, 2), { seed: 2, tick: t }); if (k) e.push(k.bearing); } const m = e.reduce((a, v) => a + v, 0) / e.length; return Math.sqrt(e.reduce((a, v) => a + (v - m) ** 2, 0) / e.length); };
    ok("!! bearing noise shrinks as the signal grows: the spread of 400 looks at 100 m is under half the spread at 330 m, and above the 0.3 degree floor", spread(100) < 0.5 * spread(330) && spread(100) > 0.2 * DEG, `${(spread(100) / DEG).toFixed(2)} vs ${(spread(330) / DEG).toFixed(2)} degrees`);
    const e = K.ping(me, P(300, 0, -30, 0, 0.5), { seed: 3, tick: 12 });
    ok("!! ping() finds a creeping boat the passive ear cannot (300 m, 0.5 m/s), with a RANGE within 5 sd of 1% + 1 m (4 m: sd 3 m) of the truth, a bearing and an elevation", e && Object.keys(e).sort().join() === "bearing,elevation,range,snr" && Math.abs(e.range - 300) < 20 && K.listen(me, P(300, 0, -30, 0, 0.5), { seed: 3, tick: 12 }) === null, JSON.stringify(e));
    ok("!! a ping out of the echo's reach is silence (800 m), and a ping into the baffles is silence", K.ping(me, P(800, 0, -30, 0, 2), { seed: 3, tick: 12 }) === null && K.ping(me, P(-200, 0, -30, 0, 2), { seed: 3, tick: 12 }) === null);
    const hrd = K.pingHeard(me, P(5000, -5000, -30, 0, 2), { seed: 3, tick: 12 });
    ok("!! pingHeard() gives a bearing TO the pinger and no range, from 7 km (far outside the echo's reach); not from 50 km", hrd && Object.keys(hrd).sort().join() === "bearing,snr" && Math.abs(hrd.bearing - K.geometry(me, P(5000, -5000, -30)).bearing) < 15 * DEG && K.pingHeard(me, P(50000, 0, -30, 0, 2), { seed: 3, tick: 12 }) === null);
    ok("!! and a quiet listener hears the ping from further than a fast one (its flow noise masks less): 0.5 m/s vs 4.5 m/s", K.pingHeardRange(0.5) > K.pingHeardRange(4.5));
}

console.log("\n6. THE FRONT DOOR");
{
    const l = K.reportLines();
    ok("!! the export list is pinned", Object.keys(K).sort().join(",") === "SONAR,activeRange,activeSNR,geometry,inBaffles,listen,luck,noiseLevel,passiveRange,passiveSNR,ping,pingHeard,pingHeardRange,platformOf,rangeWhere,reportLines,selfNoise,sourceLevel,transmissionLoss", Object.keys(K).sort().join(","));
    ok("the report says real numbers (no NaN, no undefined) and the passive ranges 94 / 364 / 780 m", l.length === 2 && l.every((x) => !/NaN|undefined/.test(x)) && /94 \/ 364 \/ 780/.test(l[0]), l[0]);
    ok("SONAR is frozen", Object.isFrozen(K.SONAR));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
