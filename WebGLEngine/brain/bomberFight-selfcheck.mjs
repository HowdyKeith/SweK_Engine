// WebGLEngine/brain/bomberFight-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/bomberFight-selfcheck.mjs      (~25 s: 72 fights)
//
// THE BOMBER'S FIGHT, HELD TO ITS OWN ARITHMETIC AND PINNED TO THE NUMBERS IT GIVES. brain/bomberFight.mjs places a bomber and the fighters that attack it for a seed and a kind of attack, seats the gunners at one of four skills, and sums a fight up. Five things hold it:
//
//   1  THE SCENARIO IS THE SEED'S         the same seed is the same scenario to the bit and another seed is another; every fighter of every kind, over 40 seeds, is inside the stated box (stern 400-600 m back and 120 m aside, beam 500-700 m out and 0-200 back
//                                         and nose at the bomber, head-on 900-1,100 m ahead on the reciprocal heading; 60 m of height; 44-48 m/s) AND REACHES the box's edges (a range collapsed to a point is red); both sides of the beam occur; mixed is stern, beam,
//                                         head-on, stern; the first three fighters of a flight of five are the three of a flight of three; the scale moves the altitude; a bad kind and a bad count are refused
//   2  THE BUILD IS WIRED                 ids, teams, names, scripts and triggers; the bomber is the bomber with five seats each with its own gunner; the fighters' pilot (one function, or one per fighter in turn), hold-fire, seconds and scale reach the arena;
//                                         the four gunner settings are the numbers the header states, in the order of skill, `regular` is the default, an options object is taken as it is and a name that is not one is refused
//   3  THE TALLY SUMS WHAT IT SAYS        on arenas whose numbers are set by hand: the winner for every combination of who is flying, destroyed against grounded (crashed, touchdown, collided), hit points floored at 0, hits, friendly hits and seat rounds summed
//   4  THE FIGHTS ARE PINNED              seven fights to the tick, and the totals of 72 fights (three gunner skills against the PD autopilot, the shipped fruit fly and the shipped GPU Brain as the fighters) -- plus the findings they state: the bomber is only lost to
//                                         green gunners; the trained fighters hurt it where the PD fighters never touch it; and, without the hold-fire rule, the fighters kill each other (167 friendly hits against none on the bomber) where with it they do not
//   5  THE FRONT DOOR                     the export list is pinned and the report lines say real numbers
//
// SABOTAGE LOG -- FIFTY-SEVEN, each applied to brain/bomberFight.mjs in a scratch worktree, the gate run, the worktree restored; every one red by name (the number is how many rows went red):
//   B1 stern comes from 400-500 m 9 | B2 stern is only 60 m aside 9 | B3 stern height is 20 m 9 | B4 stern nose 0.3 rad off 9 | B5 beam comes from 300-500 m 10 | B6 beam only from one side 9
//   B7 beam back 0-400 9 | B8 beam nose away from the bomber 9 | B9 beam nose 0.5 rad off 9 | B10 head-on from 700-900 m 4 | B11 head-on 300 m aside 3 | B12 head-on flies the bomber's heading 3
//   B13 fighters fly 40-44 m/s 14 | B14 fighters' pitch 0.1 12 | B15 the bomber starts level 13 | B16 the bomber starts on another heading 13 | B17 the bomber starts at 40 m/s 14
//   B18 mixed starts with the beam 2 | B19 a kind that is not one is accepted 1 | B20 no fighters is accepted 1 | B21 a fraction of a fighter is accepted 1 | B22 the seed is used another way 12
//   B23 the fighters ignore the bomber's altitude 17 | B24 the fighters are on the bomber's team 16 | B25 the fighters' ids start at 3 12 | B26 the fighters do not fire 10 | B27 hold-fire is always on 2
//   B28 the bomber fires a forward gun 1 | B29 the seconds are not passed on 9 | B30 the scale is not passed on 1 | B31 one pilot for every fighter 1 | B32 the bomber's pilot is ignored 1
//   B33 every seat's gunner has the same seed 12 | B34 the gunner settings are ignored 11 | B35 the default gunners are the aces 7 | B36 regular gunners react in 0.5 s 8 | B37 green gunners aim to 0.05 4
//   B38 ace gunners' window 0.5 s 1 | B39 perfect gunners only see positions 3 | B40 an unknown gunner name is accepted 1 | B41 an options object is looked up 1 | B42 the gunner table is not frozen 1
//   B43 a fight is 60 s 9 | B44 a flight is four fighters 20 | B45 the bomber wins while it flies 5 | B46 the fighters win while one flies 5 | B47 killed counts every fighter that is out 7
//   B48 a collision is not a grounding 3 | B49 the bomber's hit points left are not floored 1 | B50 a fighter's hit points left are not floored 2 | B51 hits on the bomber are the fighters' friendly hits 7
//   B52 friendly hits are the friendly hits taken 1 | B53 the seat rounds are the first seat's 11 | B54 flying counts every fighter 1 | B55 a fight is one tick 15 | B56 the fighters' killedAt is dropped 1
//   B57 the report forgets it is chosen 1
// TWO WENT 0 RED THE FIRST TIME AND WERE FIXED IN THE GATE, NOT EXCUSED: B41 (an options object is looked up as a name) because the gate called build() with it unguarded and the exception ended the run before a row could fail -- every section now runs inside a guard that turns a throw into a named FAIL, and the row calls build() inside a try; and B52 (friendly hits summed from the wrong field) because the numbers\n// I had set by hand for the two fields happened to add up to the same 6 -- friendly hits taken are now 0, 2 and 5. THE FIRST DRAFT OF THE GATE ALSO FOUND A BUG IN THE SCENARIO: the beam attack's 'back' distance was drawn twice (once for each coordinate), so the position was not 0-200 m behind the bomber at all but a skewed vector (the stated box failed at 419-717 m out) -- it is drawn once, and every pinned fight below is from the corrected scenario.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as BF from "./bomberFight.mjs";
import * as A from "./dogfightArena.mjs";
import * as AF from "./autopilotFlight.mjs";
import * as PF from "./pilotFlightPolicy.mjs";
import * as MF from "./pilotFlightMlp.mjs";
import * as BM from "../physics/mechanics/bomber.mjs";
import * as F from "../physics/mechanics/flightModel6dof.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const throws = (fn) => { try { fn(); return null; } catch (e) { return String(e.message); } };
const section = (fn) => { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const weights = (f) => Float32Array.from(JSON.parse(fs.readFileSync(path.join(ENG, "brain", f), "utf8")).weights);
const FLY = PF.pilotFor(weights("pilotDogfightWeightsDefault.json")), GPU = MF.pilotFor(weights("pilotDogfightMlpWeightsDefault.json"));

console.log("bomberFight-selfcheck -- a bomber and the fighters that attack it\n");

console.log("1. THE SCENARIO IS THE SEED'S");
section(() => {
    const same = JSON.stringify(BF.scenario(5, "stern")) === JSON.stringify(BF.scenario(5, "stern")), other = JSON.stringify(BF.scenario(5, "stern")) !== JSON.stringify(BF.scenario(6, "stern"));
    ok("!! the same seed and kind are the same scenario to the bit, another seed is another scenario, and the same seed with another kind is another", same && other && JSON.stringify(BF.scenario(5, "stern")) !== JSON.stringify(BF.scenario(5, "beam")));
    const bomber = BM.createBomber(), sc0 = BF.scenario(1, "stern");
    ok("!! the bomber starts at its own altitude and cruise speed on a heading inside +-3 rad, nose up 0.16, at the origin; three fighters by default", sc0.fighters.length === 3 && sc0.bomber.pos.join() === `0,0,${bomber.altitude}` && sc0.bomber.speed === bomber.cruiseSpeed && sc0.bomber.heading === sc0.heading && Math.abs(sc0.heading) <= 3 && sc0.bomber.pitch === 0.16);
    // the box, in the bomber's own frame: back along its heading, lateral to its right
    const geo = (sc, f) => { const h = sc.heading, fw = [Math.cos(h), -Math.sin(h)], rt = [-Math.sin(h), -Math.cos(h)]; return { back: -(f.pos[0] * fw[0] + f.pos[1] * fw[1]), lat: f.pos[0] * rt[0] + f.pos[1] * rt[1], dz: f.pos[2] - sc.bomber.pos[2] }; };
    const seen = {}, bad = [];
    for (const kind of ["stern", "beam", "head-on", "mixed"]) for (let seed = 1; seed <= 40; seed++) {
        const sc = BF.scenario(seed, kind, { fighters: 4 });
        sc.fighters.forEach((f, i) => {
            const g = geo(sc, f), k = f.kind, rec = (seen[k] ||= { back: [1e9, -1e9], lat: [1e9, -1e9], dz: [1e9, -1e9], sp: [1e9, -1e9], sides: new Set() });
            const widen = (r, v) => { r[0] = Math.min(r[0], v); r[1] = Math.max(r[1], v); };
            widen(rec.back, Math.abs(g.back)); widen(rec.lat, Math.abs(g.lat)); widen(rec.dz, g.dz); widen(rec.sp, f.speed); rec.sides.add(Math.sign(g.lat));
            const toward = Math.acos(Math.max(-1, Math.min(1, (Math.cos(f.heading) * -f.pos[0] + -Math.sin(f.heading) * -f.pos[1]) / Math.hypot(f.pos[0], f.pos[1]))));
            const hd = f.heading - sc.heading;
            if (kind === "mixed" && k !== ["stern", "beam", "head-on", "stern"][i]) bad.push(`mixed ${seed}.${i} is ${k}`);
            if (k === "stern" && !(g.back >= 400 && g.back <= 600 && Math.abs(g.lat) <= 120 && Math.abs(hd) <= 0.1)) bad.push(`stern ${seed}.${i} ${g.back.toFixed(0)} ${g.lat.toFixed(0)} ${hd.toFixed(2)}`);
            if (k === "beam" && !(Math.abs(g.lat) >= 500 && Math.abs(g.lat) <= 700 && g.back >= 0 && g.back <= 200 && toward <= 0.15 + 1e-9)) bad.push(`beam ${seed}.${i} ${g.back.toFixed(0)} ${g.lat.toFixed(0)} ${toward.toFixed(2)}`);
            if (k === "head-on" && !(-g.back >= 900 && -g.back <= 1100 && Math.abs(g.lat) <= 150 && Math.abs(hd - Math.PI) <= 0.1)) bad.push(`head-on ${seed}.${i} ${(-g.back).toFixed(0)} ${g.lat.toFixed(0)} ${hd.toFixed(2)}`);
            if (!(Math.abs(g.dz) <= 60 && f.speed >= 44 && f.speed <= 48 && f.pitch === 0.03)) bad.push(`${k} ${seed}.${i} dz ${g.dz.toFixed(0)} speed ${f.speed.toFixed(1)}`);
        });
    }
    ok("!! over 40 seeds x 4 kinds x 4 fighters every fighter is inside its kind's box in the bomber's frame (stern 400-600 m back, 120 m aside, nose within 0.1 rad of the bomber's; beam 500-700 m out, 0-200 back, nose at the bomber within 0.15 rad; head-on 900-1,100 m ahead, 150 m aside, nose on the reciprocal within 0.1 rad), within 60 m of its altitude, at 44-48 m/s, nose up 0.03; and mixed is stern, beam, head-on, stern", bad.length === 0, bad.slice(0, 3).join("; "));
    const edge = (k, key, lo, hi, tol) => seen[k] && seen[k][key][0] < lo + tol && seen[k][key][1] > hi - tol;
    ok("!! ...and the draws REACH the edges of those boxes (a range collapsed to a point would pass the row above): stern back 400-600 reached to within 15 m at both ends, beam out 500-700, head-on 900-1,100, the height +-60 and the speed 44-48 to within 3, the stern and the head-on aside to within 15 m of 120 and 150", edge("stern", "back", 400, 600, 15) && edge("beam", "lat", 500, 700, 15) && edge("head-on", "back", 900, 1100, 15) && edge("stern", "lat", 0, 120, 15) && edge("head-on", "lat", 0, 150, 15) && edge("stern", "dz", -60, 60, 3) && edge("beam", "dz", -60, 60, 3) && edge("beam", "sp", 44, 48, 0.5) && edge("beam", "back", 0, 200, 15), JSON.stringify({ stern: seen.stern && seen.stern.back, beam: seen.beam && seen.beam.lat }));
    ok("both sides of the bomber occur in the beam attacks and in the stern attacks (the sign of the lateral offset)", seen.beam.sides.has(1) && seen.beam.sides.has(-1) && seen.stern.sides.has(1) && seen.stern.sides.has(-1));
    const three = BF.scenario(3, "mixed", { fighters: 3 }), five = BF.scenario(3, "mixed", { fighters: 5 });
    ok("!! a flight of five begins with the three of a flight of three (the draws go fighter by fighter, so adding fighters does not move the others)", JSON.stringify(five.fighters.slice(0, 3)) === JSON.stringify(three.fighters) && five.fighters.length === 5 && JSON.stringify(five.bomber) === JSON.stringify(three.bomber));
    const big = BM.createBomber({ scale: 3 }), s3 = BF.scenario(2, "stern", { bomber: big });
    ok("the scale moves the altitude: for a bomber of scale 3 the bomber starts at 750 m at its own cruise speed and the fighters within 60 m of that", s3.bomber.pos[2] === 750 && s3.bomber.speed === big.cruiseSpeed && s3.fighters.every((f) => Math.abs(f.pos[2] - 750) <= 60));
    ok("!! a kind that is not one, no fighters, and a fraction of a fighter are refused by name", /kind must be/.test(throws(() => BF.scenario(1, "tail")) || "") && /at least one fighter/.test(throws(() => BF.scenario(1, "stern", { fighters: 0 })) || "") && /at least one fighter/.test(throws(() => BF.scenario(1, "stern", { fighters: 1.5 })) || ""));
});

console.log("\n2. THE BUILD IS WIRED");
section(() => {
    const b = BF.build(2, "beam"), cs = b.arena.crafts, sc = BF.scenario(2, "beam");
    ok("!! ids 1 to 4, the bomber team 1 and the three fighters team 2, named 'bomber' and 'fighter 1' to 'fighter 3'; the bomber scripts its heading, altitude and cruise airspeed and does not fire a forward gun; the fighters hunt, fire and hold fire for team-mates", cs.map((c) => c.id).join() === "1,2,3,4" && cs.map((c) => c.team).join() === "1,2,2,2" && cs.map((c) => c.name).join() === "bomber,fighter 1,fighter 2,fighter 3" && cs[0].behaviour === "script" && cs[0].fires === false && cs.slice(1).every((c) => c.behaviour === "hunt" && c.fires === true && c.holdFire === true) && JSON.stringify(cs[0].script(0)) === JSON.stringify({ heading: sc.heading, altitude: b.bomber.altitude, airspeed: b.bomber.cruiseSpeed }));
    ok("!! the bomber is the bomber (scale 2, five seats, each with a gunner of its own, 60 hit points, four engines), the arena runs 90 s, and the fighters and the bomber begin where the scenario says", cs[0].bomber.scale === 2 && cs[0].seats.length === 5 && new Set(cs[0].seats.map((s) => s.decide)).size === 5 && cs[0].hp === 60 && cs[0].enginesRunning === 4 && b.arena.seconds === 90 && cs.slice(1).every((c, i) => c.state.pos.join() === sc.fighters[i].pos.join() && Math.abs(Math.hypot(...c.state.vel) - sc.fighters[i].speed) < 1e-9 && Math.abs(F.attitude(c.state).heading - sc.fighters[i].heading) < 1e-9 || Math.abs(Math.abs(F.attitude(c.state).heading - sc.fighters[i].heading) - 2 * Math.PI) < 1e-9) && cs[0].state.pos.join() === sc.bomber.pos.join() && b.scenario.seed === 2);
    const opts = BF.build(2, "beam", { fighters: 5, holdFire: false, seconds: 20, scale: 3 });
    ok("!! the options reach the arena: five fighters make six crafts, hold-fire false is every fighter's, 20 s is the arena's, and scale 3 makes a bomber of scale 3 at its altitude (750 m)", opts.arena.crafts.length === 6 && opts.arena.crafts.slice(1).every((c) => c.holdFire === false) && opts.arena.seconds === 20 && opts.arena.crafts[0].bomber.scale === 3 && opts.arena.crafts[0].state.pos[2] === 750);
    const p1 = () => ({ pitch: 0, roll: 0, yaw: 0, throttle: 0.5 }), p2 = () => ({ pitch: 0, roll: 0, yaw: 0, throttle: 0.6 });
    const many = BF.build(2, "beam", { pilot: [p1, p2] }).arena.crafts, one = BF.build(2, "beam", { pilot: p2 }).arena.crafts;
    ok("!! the fighters' pilot is one function for all or one per fighter in turn (two pilots, three fighters: 1, 2, 1)", many[1].pilot === p1 && many[2].pilot === p2 && many[3].pilot === p1 && one.slice(1).every((c) => c.pilot === p2));
    let seen = null; const spy = (s, t, w) => { if (!seen) seen = { alt: s.pos[2], target: t }; return AF.pilot(s, t, w); };
    const bp = BF.build(2, "beam", { bomberPilot: spy }); A.stepArena(bp.arena);
    ok("the bomber's own pilot can be named: a spy in its place is called with the trainer's world (half the altitude at scale 2)", seen && Math.abs(seen.alt - bp.bomber.altitude / 2) < 1e-9);
    const exp = '{"perfect":{"delay":0.25,"sigma":0.012},"ace":{"delay":0.25,"sigma":0.012,"observe":{"window":0.6,"sigmaRange":0.004}},"regular":{"delay":0.4,"sigma":0.03,"observe":{"window":0.6,"sigmaRange":0.01}},"green":{"delay":0.6,"sigma":0.06,"observe":{"window":0.5,"sigmaRange":0.02}}}';
    ok("!! the four gunner settings are the numbers the header states (perfect 0.25 s / 0.012 rad with the target's exact velocity; ace the same but seeing only positions over 0.6 s at 0.4%; regular 0.4 s / 0.03 / 1%; green 0.6 s / 0.06 / 2% over 0.5 s), frozen, and in the order of skill", JSON.stringify(BF.GUNNERS) === exp && Object.isFrozen(BF.GUNNERS) && Object.isFrozen(BF.GUNNERS.green) && Object.isFrozen(BF.GUNNERS.green.observe) && !("observe" in BF.GUNNERS.perfect) && BF.GUNNERS.ace.delay < BF.GUNNERS.regular.delay && BF.GUNNERS.regular.delay < BF.GUNNERS.green.delay && BF.GUNNERS.ace.sigma < BF.GUNNERS.regular.sigma && BF.GUNNERS.regular.sigma < BF.GUNNERS.green.sigma && BF.GUNNERS.ace.observe.sigmaRange < BF.GUNNERS.regular.observe.sigmaRange && BF.GUNNERS.regular.observe.sigmaRange < BF.GUNNERS.green.observe.sigmaRange);
    const custom = { delay: 0.1, sigma: 0 };
    ok("!! `regular` is the default, a name is looked up, an options object is taken as it is, and anything else is refused by name", BF.DEFAULT_GUNNERS === "regular" && b.gunners === BF.GUNNERS.regular && BF.build(2, "beam", { gunners: "green" }).gunners === BF.GUNNERS.green && (() => { try { return BF.build(2, "beam", { gunners: custom }).gunners === custom; } catch (e) { return false; } })() && /gunners must be/.test(throws(() => BF.build(2, "beam", { gunners: "ace of spades" })) || "") && /gunners must be/.test(throws(() => BF.build(2, "beam", { gunners: null })) || ""));
    ok("the constants: the bomber is craft 1, a flight is three fighters, a fight is 90 s, the kinds are stern, beam, head-on, mixed", BF.BOMBER_ID === 1 && BF.FIGHTERS === 3 && BF.SECONDS === 90 && BF.KINDS.join() === "stern,beam,head-on,mixed" && Object.isFrozen(BF.KINDS));
});

console.log("\n3. THE TALLY SUMS WHAT IT SAYS");
section(() => {
    const mk = () => BF.build(1, "stern").arena;
    const set = (ar, bs, fs) => { ar.crafts[0].status = bs; fs.forEach((s, i) => { ar.crafts[i + 1].status = s; }); return BF.tally(ar); };
    const T = [["airborne", ["airborne", "airborne", "airborne"], "none"], ["airborne", ["destroyed", "crashed", "touchdown"], "bomber"], ["airborne", ["collided", "destroyed", "destroyed"], "bomber"], ["destroyed", ["airborne", "destroyed", "destroyed"], "fighters"],
        ["collided", ["airborne", "airborne", "destroyed"], "fighters"], ["destroyed", ["destroyed", "destroyed", "destroyed"], "none"], ["crashed", ["collided", "destroyed", "touchdown"], "none"], ["airborne", ["airborne", "destroyed", "destroyed"], "none"]];
    const got = T.map(([b, f]) => set(mk(), b, f).winner);
    ok("!! the winner: the bomber when it flies and no fighter does; the fighters when one flies and the bomber does not (destroyed, collided and the rest all count as out); 'none' when both fly or neither does", got.join() === T.map((r) => r[2]).join(), got.join());
    const a = mk(); a.crafts[1].status = "destroyed"; a.crafts[2].status = "collided"; a.crafts[3].status = "touchdown"; const t = BF.tally(a);
    ok("!! killed counts the destroyed and grounded counts crashed, touchdown and collided apart (1 and 2 here), and `flying` is the fighters still in the air", t.killed === 1 && t.grounded === 2 && t.flying === 0 && BF.tally(mk()).flying === 3 && BF.tally(mk()).killed === 0 && BF.tally(mk()).grounded === 0);
    const c = mk(); c.crafts[0].taken = 75; c.crafts[0].hits = 9; c.crafts[0].enginesRunning = 2; c.crafts[0].friendlyTaken = 4; c.crafts[1].taken = 5; c.crafts[2].taken = 99; c.crafts[3].taken = 0;
    [3, 4, 5].forEach((h, i) => { c.crafts[i + 1].hits = h; c.crafts[i + 1].friendlyHits = i + 1; c.crafts[i + 1].friendlyTaken = 2 * i + (i === 2 ? 1 : 0); c.crafts[i + 1].held = 10 * (i + 1); }); c.crafts[1].gun = { ...c.crafts[1].gun, fired: 7 }; c.crafts[2].killedAt = 12.5;
    c.crafts[0].seats.forEach((s, i) => { s.state = { ...s.state, gun: { ...s.state.gun, fired: i + 1 } }; });
    const u = BF.tally(c);
    ok("!! hit points are floored at 0 (75 taken of 60 is 0 left; 5 taken of 20 is 15; 99 taken is 0), the bomber's taken, engines, hits dealt and friendly hits taken are its own, the seat rounds are the five seats' summed (1+2+3+4+5 = 15), and the fighters' rows carry id, name, status, hit points left, rounds fired, hits dealt, friendly hits dealt and taken, trigger ticks held and the time killed", u.bomber.hpLeft === 0 && u.bomber.taken === 75 && u.bomber.enginesRunning === 2 && u.bomber.hitsDealt === 9 && u.bomber.friendlyTaken === 4 && u.bomber.seatRounds === 15 && u.fighters[0].hpLeft === 15 && u.fighters[1].hpLeft === 0 && u.fighters[2].hpLeft === 20 && u.fighters[0].fired === 7 && u.fighters[0].id === 2 && u.fighters[2].name === "fighter 3" && u.fighters.map((f) => f.hitsDealt).join() === "3,4,5" && u.fighters.map((f) => f.friendlyHits).join() === "1,2,3" && u.fighters.map((f) => f.friendlyTaken).join() === "0,2,5" && u.fighters.map((f) => f.held).join() === "10,20,30" && u.fighters[1].killedAt === 12.5 && u.fighters[0].killedAt === null && u.fighters[0].status === "airborne");
    ok("...and hitsOnBomber is the fighters' hits dealt summed (3+4+5 = 12) and friendlyHits theirs (1+2+3 = 6); the clock and the ending are the arena's", u.hitsOnBomber === 12 && u.friendlyHits === 6 && u.t === c.t && u.ticks === c.i && u.over === c.over);
});

console.log("\n4. THE FIGHTS ARE PINNED (the numbers are what the MODEL gives with the chosen gunner settings, not what a war gave)");
section(() => {
    const pin = (label, t, want) => { const got = { winner: t.winner, over: t.over, ticks: t.ticks, killed: t.killed, grounded: t.grounded, hitsOnBomber: t.hitsOnBomber, hpLeft: t.bomber.hpLeft, seatRounds: t.bomber.seatRounds, seatHits: t.bomber.hitsDealt, fighters: t.fighters.map((f) => `${f.status}/${f.hpLeft}/${f.fired}/${f.hitsDealt}`).join(" ") }; const miss = Object.keys(want).filter((k) => String(got[k]) !== String(want[k])); ok(`!! ${label}`, miss.length === 0, miss.length ? miss.map((k) => `${k}: ${got[k]} vs ${want[k]}`).join("; ") : `${got.winner}, ${got.ticks} ticks, ${got.killed} shot down, ${got.hitsOnBomber} hits on the bomber`); };
    pin("perfect gunners, a stern attack (seed 1): three fighters shot down before one fires a round (22.4 s), the bomber untouched", BF.fight(1, "stern", { gunners: "perfect" }), { winner: "bomber", over: "one team left flying", ticks: 671, killed: 3, grounded: 0, hitsOnBomber: 0, hpLeft: 60, seatRounds: 307, seatHits: 60, fighters: "destroyed/0/0/0 destroyed/0/0/0 destroyed/0/0/0" });
    pin("regular gunners, a stern attack (seed 2): 60 s, the third fighter never fires either", BF.fight(2, "stern"), { winner: "bomber", over: "one team left flying", ticks: 1812, killed: 3, grounded: 0, hitsOnBomber: 0, hpLeft: 60, seatRounds: 560, seatHits: 60, fighters: "destroyed/0/59/0 destroyed/0/64/0 destroyed/0/0/0" });
    pin("green gunners, a beam attack (seed 3): the BOMBER is lost at 52.8 s to 60 hits, all from one fighter (the other two collided and never fired it a round)", BF.fight(3, "beam", { gunners: "green" }), { winner: "fighters", over: "one team left flying", ticks: 1583, killed: 0, grounded: 2, hitsOnBomber: 60, hpLeft: 0, seatRounds: 140, seatHits: 9, fighters: "airborne/13/268/60 collided/19/71/0 collided/19/0/0" });
    pin("regular gunners, a head-on attack (seed 1): a draw at the 90 s limit, two shot down and the third alive with 5 hit points", BF.fight(1, "head-on"), { winner: "none", over: "time", ticks: 2700, killed: 2, grounded: 0, hitsOnBomber: 0, hpLeft: 60, seatRounds: 168, seatHits: 57, fighters: "airborne/5/0/0 destroyed/0/0/0 destroyed/0/0/0" });
    pin("regular gunners, a mixed attack (seed 4): a draw at the 90 s limit, two shot down and the third alive with 11 hit points that never got a round off", BF.fight(4, "mixed"), { winner: "none", over: "time", ticks: 2700, killed: 2, grounded: 0, hitsOnBomber: 0, hpLeft: 60, seatRounds: 354, seatHits: 49, fighters: "destroyed/0/143/0 destroyed/0/119/0 airborne/11/0/0" });
    pin("the shipped fruit fly as the three fighters, regular gunners, a beam attack (seed 1): the bomber wins at 26.4 s with 25 hits taken (35 of its 60 left) -- the trained fighters hit it where the PD autopilot never does; one is shot down and two collided", BF.fight(1, "beam", { pilot: FLY }), { winner: "bomber", over: "one team left flying", ticks: 793, killed: 1, grounded: 2, hitsOnBomber: 25, hpLeft: 35, seatRounds: 225, seatHits: 22, fighters: "collided/19/10/6 destroyed/0/31/13 collided/19/44/6" });
    pin("the shipped GPU Brain as the three fighters, the same attack: the BOMBER is lost at 30.0 s (60 hits: 21 and 39 from the two fighters left, with 12 and 15 hit points), one fighter shot down", BF.fight(1, "beam", { pilot: GPU }), { winner: "fighters", over: "one team left flying", ticks: 899, killed: 1, grounded: 0, hitsOnBomber: 60, hpLeft: 0, seatRounds: 311, seatHits: 33, fighters: "airborne/12/33/21 airborne/15/42/39 destroyed/0/0/0" });

    const sweep = (opts) => { const rows = []; for (const k of ["stern", "beam"]) for (let s = 1; s <= 6; s++) rows.push(BF.fight(s, k, opts)); const sum = (f) => rows.reduce((a, t) => a + f(t), 0); return { n: rows.length, killed: sum((t) => t.killed), bomberWins: rows.filter((t) => t.winner === "bomber").length, fightersWin: rows.filter((t) => t.winner === "fighters").length, hitsOnBomber: sum((t) => t.hitsOnBomber), friendly: sum((t) => t.friendlyHits), seatRounds: sum((t) => t.bomber.seatRounds) }; };
    const S = { perfect: sweep({ gunners: "perfect" }), regular: sweep({ gunners: "regular" }), green: sweep({ gunners: "green" }), fly: sweep({ pilot: FLY }), gpu: sweep({ pilot: GPU }) };
    const line = (s) => `${s.killed} shot down of ${s.n * 3}, bomber won ${s.bomberWins}, fighters won ${s.fightersWin}, ${s.hitsOnBomber} hits on the bomber, ${s.seatRounds} seat rounds`;
    const same = (s, want) => Object.keys(want).every((k) => s[k] === want[k]);
    ok("!! 12 PD-fighter attacks (stern and beam, seeds 1-6) by PERFECT gunners: all 36 fighters shot down, the bomber wins 12, 4,010 seat rounds, not one hit on the bomber", same(S.perfect, { killed: 36, bomberWins: 12, fightersWin: 0, hitsOnBomber: 0, seatRounds: 4010 }), line(S.perfect));
    ok("!! ...by REGULAR gunners: 34 shot down, the bomber wins 12 and loses none, 6,096 seat rounds, still not one hit on the bomber", same(S.regular, { killed: 34, bomberWins: 12, fightersWin: 0, hitsOnBomber: 0, seatRounds: 6096 }), line(S.regular));
    ok("!! ...by GREEN gunners: 2 shot down, the bomber wins 2 and the FIGHTERS win 6 (the other four end at the 90 s limit), 467 hits on the bomber", same(S.green, { killed: 2, bomberWins: 2, fightersWin: 6, hitsOnBomber: 467, seatRounds: 2690 }), line(S.green));
    ok("!! the skill order holds: more fighters are shot down by perfect gunners than regular ones and by regular ones than green ones, and the bomber is only ever lost to the green", S.perfect.killed >= S.regular.killed && S.regular.killed > S.green.killed && S.perfect.fightersWin === 0 && S.regular.fightersWin === 0 && S.green.fightersWin > 0);
    ok("!! the TRAINED fighters are the threat the PD autopilot is not: against REGULAR gunners the shipped fruit fly puts 334 hits on the bomber and wins 2 of 12 (30 shot down), the shipped GPU Brain 530 hits and wins 7 of 12 (27 shot down), where the PD fighters put 0", same(S.fly, { killed: 30, bomberWins: 10, fightersWin: 2, hitsOnBomber: 334 }) && same(S.gpu, { killed: 27, bomberWins: 5, fightersWin: 7, hitsOnBomber: 530 }) && S.fly.hitsOnBomber > 100 && S.gpu.hitsOnBomber > S.fly.hitsOnBomber && S.regular.hitsOnBomber === 0, `${line(S.fly)} | ${line(S.gpu)}`);
    const rows = (opts) => { const out = []; for (let s = 1; s <= 6; s++) out.push(BF.fight(s, "stern", { gunners: "green", ...opts })); return { friendly: out.reduce((a, t) => a + t.friendlyHits, 0), onBomber: out.reduce((a, t) => a + t.hitsOnBomber, 0), killed: out.reduce((a, t) => a + t.killed, 0) }; };
    const hold = rows({}), open = rows({ holdFire: false });
    ok("!! FRIENDLY FIRE IS THE FINDING THE FIRST COUNT HID: six green stern attacks WITHOUT the hold-fire rule have the fighters hit each other 167 times and the bomber not at all -- 12 of the 18 fighters 'shot down' are shot down by their own side; WITH it (the default) there are none and the fighters put 178 hits on the bomber, 2 shot down", open.friendly === 167 && open.onBomber === 0 && open.killed === 12 && hold.friendly === 0 && hold.onBomber === 178 && hold.killed === 2, `without: ${JSON.stringify(open)}; with: ${JSON.stringify(hold)}`);
    const again = BF.fight(3, "beam", { gunners: "green" }), ar = BF.build(3, "beam", { gunners: "green" }).arena; while (!ar.done) A.stepArena(ar);
    ok("!! a fight is deterministic: flown twice it is the same tally, and fight() is build() stepped by hand and summed with tally()", JSON.stringify(again) === JSON.stringify(BF.fight(3, "beam", { gunners: "green" })) && JSON.stringify(again) === JSON.stringify(BF.tally(ar)));
    const mid = BF.build(1, "stern").arena; for (let i = 0; i < 30; i++) A.stepArena(mid); const m = BF.tally(mid);
    ok("a fight can be summed up while it is still going: after 1 s nobody is out, nobody has won, the clock is 30 ticks", m.ticks === 30 && m.over === null && m.winner === "none" && m.flying === 3 && m.bomber.status === "airborne");
});

console.log("\n5. THE FRONT DOOR");
section(() => {
    ok("!! the export list is pinned: BOMBER_ID, DEFAULT_GUNNERS, FIGHTERS, GUNNERS, KINDS, SECONDS, build, fight, reportLines, scenario, tally", Object.keys(BF).sort().join(",") === "BOMBER_ID,DEFAULT_GUNNERS,FIGHTERS,GUNNERS,KINDS,SECONDS,build,fight,reportLines,scenario,tally", Object.keys(BF).sort().join(","));
    const lines = BF.reportLines();
    ok("the report lines say real numbers and that the settings are chosen, not measured", lines.length === 2 && lines.every((l) => !/NaN|undefined/.test(l)) && /chosen, not measured/.test(lines[0]) && /perfect 4\/4 bomber, 12\/12/.test(lines[1]), lines[1]);
});

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
