// WebGLEngine/brain/subStations-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). Run: node brain/subStations-selfcheck.mjs
//
// THE GATE OF brain/subStations.mjs: the stations of a submarine and the fixed-priority captain (backlog `ai-managed-sub-stations`; the design is brain/SUB_STATIONS_WIP.md).
//   1  the parts refuse what they cannot use, by name
//   2  ONE STATION SPEAKING IS ITS WRAPPER, BIT FOR BIT: the captain with the energy station alone is brain/needsAdvisor.mjs's wrap, and with damage control alone is brain/emergencyPilot.mjs's wrap -- each flown beside it in the same loop,
//      every command of every tick compared, on dives chosen so the station does act (a low charge that sends the boat up; a leak that blows the tank and drops the weight)
//   3  THE CAPTAIN: the highest priority claim wins, a tie goes to the earlier station, a command station overrides after the helm, aux is the largest asked, the log and the watch say who had the con
//   4  SEVERAL AT ONCE: a boat that is both low on charge and flooding (the tank runs one event at a time and cannot fly this) -- both stations act in the same dive, the boat ends afloat and not lost, and the watch counts both
// The flights: the needs-task vessel (brain/needsTask.mjs model: the Explorer with a tank and a 6-unit bottle), a 60 m battery hull, physics/mechanics/subNeeds.mjs stepNeeds with the leak as its extra weight.
// SABOTAGED -- 26 mutants, each alone in place and restored, EVERY ONE RED BY NAME (final pass): brain/subStations.mjs M01 a tie to the later station | M02 the lowest priority wins | M03 aux the last asked, not the largest |
//   M04 aux only from the winning claim | M05 command stations judging the mission, not the target flown | M06 only the first override kept | M07 overrides not sanitized | M08 every command sanitized (the helm's own object lost) |
//   M09 the caller's aux not passed to the helm | M10 the mission's ticks not counted | M11 the log handed out live | M12 the watch handed out live | M13 an override's reason over the claim's | M14 no duplicate-name refusal |
//   M15 any kind accepted | M16 the energy station claiming without the advice | M17 the energy station asking no pump | M18 the energy station flying the raw mission (no snorkel band, no speed) | M19 the weight dropped at the blow |
//   M20 damage control judging a target 50 m deeper | M21 the rescue without full thrust | M22 the helm without the surfacing wrapper | M23 damage control below energy | M24 PRIORITY not frozen;
//   brain/needsAdvisor.mjs (the shared surfaceTarget) V01 the snorkel band ignored | V02 the target's speed ignored.
// SEVEN WENT 0 RED ON THE FIRST PASS AND GOT ROWS: M03 and M04 (the station that asked most was also the last to ask, and every asker claimed), M07 (no override was out of range), M10 (no captain ever ran a tick with the mission's con),
//   M17, M18 and V01 (the energy station was only met inside whole flights, which never asked it for the pump or flew a snorkel boat). Each row was written, then the mutant run against it.
// AND A ROW OF MINE WAS WRONG, NOT THE CODE: the "hurt at the surface" fixture had 50% charge at 1 m, where the rule's threshold is 55%, so the station rightly claimed the surface; the fixture's charge is 90%.
"use strict";
import * as SS from "./subStations.mjs";
import * as AV from "./needsAdvisor.mjs";
import * as EP from "./emergencyPilot.mjs";
import * as SP from "./surfacePilot.mjs";
import * as A from "./autopilotSub.mjs";
import * as NT from "./needsTask.mjs";
import * as N from "../physics/mechanics/subNeeds.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";

let fails = 0, finished = false;
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const guarded = (name, f) => { try { f(); } catch (e) { ok(`${name} ran to the end`, false, "THREW " + String((e && e.stack) || e).split("\n").slice(0, 2).join(" | ").slice(0, 300)); } };
const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message || e); } };
const J = JSON.stringify;
console.log("subStations-selfcheck -- the stations of a submarine and the captain between them\n");

const MODEL = NT.model(), DT = S.DT, pilot = A.pilot();
/** Fly `make(ctx)` (ctx = { read, model }) for `seconds`: from `depth` at 2 m/s with a target of `depth`, the charge at `frac`, a leak of `leak` of the weight from t 5 s (built over 5 s). Returns the commands of every tick and the end. */
function fly(make, { seconds = 120, depth = 30, frac = 1, leak = 0, auxFrom = null } = {}) {
    let s = S.createState({ depth, speed: 2, model: MODEL }), needs = N.initialNeeds("battery", { crushDepth: 60 }); needs.energy = needs.capacity !== undefined ? needs.capacity * frac : N.CLASSES.battery.capacityJ * frac;
    const read = () => N.readings(MODEL, needs, s), p = make({ read, model: MODEL }), target = { depth, heading: 0.3, speed: 2 }, cmds = [], total = Math.round(seconds / DT);
    let status = "submerged", released = false, minDepth = depth, maxDepth = depth;
    for (let i = 0; i < total; i++) {
        const cmd = p(s, target, [0, 0, 0]); cmds.push(cmd);
        const res = N.stepNeeds(MODEL, s, needs, cmd, DT, [0, 0, 0], leak * Math.min(1, Math.max(0, (i * DT - 5) / 5)), auxFrom ? auxFrom(p) : null);
        s = res.state; needs = res.needs;
        if (res.status !== "submerged") { status = res.status; break; }
        const d = -s.pos[2]; minDepth = Math.min(minDepth, d); maxDepth = Math.max(maxDepth, d); if (s.tank && s.tank.released) released = true;
    }
    return { cmds, status, released, minDepth, maxDepth, finalDepth: -s.pos[2], frac: read().frac, flood: needs.flood };
}
const sameCmds = (a, b) => { const n = Math.max(a.cmds.length, b.cmds.length); for (let i = 0; i < n; i++) if (J(a.cmds[i]) !== J(b.cmds[i])) return i; return -1; };

sec("1. the parts refuse what they cannot use");
guarded("section 1", () => {
    const bad = [["a captain with no helm", () => SS.captain({}), /^subStations\.captain: a helm/], ["a station named twice", () => SS.captain({ helm: pilot, stations: [SS.damageStation(), SS.damageStation()] }), /a station is named twice \(damage, damage\)/],
        ["a station of no kind", () => SS.captain({ helm: pilot, stations: [{ name: "x", kind: "wish", propose: () => null }] }), /station x's kind must be one of target, command, got "wish"/], ["a station with no propose", () => SS.captain({ helm: pilot, stations: [{ name: "x", kind: "target" }] }), /station x needs a propose function/],
        ["a station with no name", () => SS.captain({ helm: pilot, stations: [{ kind: "target", propose: () => null }] }), /a station needs a name/], ["an energy station with no read()", () => SS.energyStation({}), /energyStation: a read\(\) function is needed/],
        ["a helm with no pilot", () => SS.helmOf(null), /helmOf: a pilot function is needed/], ["a target station with no function", () => SS.targetStation("nav", null), /station nav needs a function/]];
    for (const [what, f, re] of bad) { const e = throws(f); ok(`refuses ${what}, by name`, e !== null && re.test(e), e || "did not throw"); }
    ok("the priorities: damage above energy above navigation above the mission; the two kinds are target and command; all frozen", SS.PRIORITY.damage > SS.PRIORITY.energy && SS.PRIORITY.energy > SS.PRIORITY.navigation && SS.PRIORITY.navigation > SS.PRIORITY.mission && J(SS.KINDS) === '["target","command"]' && Object.isFrozen(SS.PRIORITY) && Object.isFrozen(SS.KINDS));
});

sec("2. one station speaking is its wrapper, bit for bit");
guarded("section 2", () => {
    // ENERGY: a boat at 20 m with 28% charge (under the rule's threshold at any depth past 6 m: 0.3) goes up for the charge
    const wrapE = ({ read, model }) => AV.wrap(SP.wrap(pilot, { model }), { read }), capE = ({ read, model }) => SS.captain({ helm: SS.helmOf(pilot, { model }), stations: [SS.energyStation({ read })] });
    const a = fly(wrapE, { depth: 20, frac: 0.28, seconds: 150 }), b = fly(capE, { depth: 20, frac: 0.28, seconds: 150 }), at = sameCmds(a, b);
    ok("the energy station alone is brain/needsAdvisor.mjs's wrap: every command of 150 s identical", at === -1 && a.cmds.length === b.cmds.length, at === -1 ? "" : `first difference at tick ${at}: ${J(a.cmds[at])} against ${J(b.cmds[at])}`);
    ok("...on a dive where the station ACTS: the low charge sends the boat up (from 20 m to within 1.5 m of the surface) and it charges", a.minDepth < 1.5 && a.frac > 0.28, `min depth ${a.minDepth.toFixed(2)} m, charge ${a.frac.toFixed(3)}`);
    const a2 = fly(wrapE, { depth: 25, frac: 1, seconds: 40 }), b2 = fly(capE, { depth: 25, frac: 1, seconds: 40 });
    ok("...and with a full charge it is silent: the same commands, and the boat holds its depth", sameCmds(a2, b2) === -1 && Math.abs(a2.finalDepth - 25) < 3, `final ${a2.finalDepth.toFixed(2)} m`);
    // DAMAGE CONTROL: a leak of 6% of the weight at 30 m with a full charge: the boat sinks past its target, blows, then drops the weight
    const wrapD = () => EP.wrap(pilot), capD = () => SS.captain({ helm: SS.helmOf(pilot), stations: [SS.damageStation()] });
    const c = fly(wrapD, { depth: 30, leak: 0.06, seconds: 120 }), d = fly(capD, { depth: 30, leak: 0.06, seconds: 120 }), at2 = sameCmds(c, d);
    ok("damage control alone is brain/emergencyPilot.mjs's wrap: every command of 120 s identical", at2 === -1 && c.cmds.length === d.cmds.length, at2 === -1 ? "" : `first difference at tick ${at2}: ${J(c.cmds[at2])} against ${J(d.cmds[at2])}`);
    ok("...on a dive where the station ACTS: the boat blows (a tick with blow 1) and drops its weight", c.cmds.some((x) => x.blow === 1) && c.released, `blow ticks ${c.cmds.filter((x) => x.blow === 1).length}, released ${c.released}`);
});

sec("3. the captain");
guarded("section 3", () => {
    const st = S.createState({ depth: 20, speed: 2, model: MODEL }), mission = { depth: 20, heading: 0, speed: 2 };
    const helmSeen = []; const helm = (s, t) => { helmSeen.push(t); return { pitch: 0.1, yaw: 0, thrust: 0.5, ballast: 0 }; };
    const claim = (name, priority, depth, aux = null) => ({ name, kind: "target", priority, propose: () => ({ claim: { ...mission, depth }, aux, reason: name + " wants " + depth }) });
    const asker = { name: "asker", kind: "target", priority: 1, propose: () => ({ claim: null, aux: { pump: 0.6, repair: 0 }, reason: null }) };
    const cap = SS.captain({ helm, stations: [claim("low", 10, 5), claim("high", 50, 2, { pump: 0.4 }), asker, claim("tie", 50, 9, { pump: 0.1, repair: 0.2 })] });
    cap(st, mission, [0, 0, 0]);
    ok("the highest priority claim is flown; at a tie the earlier station keeps it (high, not tie)", helmSeen[0].depth === 2 && cap.log.con === "high" && cap.log.reason === "high wants 2", J(cap.log));
    ok("aux is the LARGEST asked of each, from every station that asked, claiming or not: pump 0.6 (asker, which claimed nothing) and repair 0.2 (tie, which lost the target); a later, smaller ask lowers nothing", J(cap.aux) === '{"pump":0.6,"repair":0.2}' && J(cap.log.aux) === '{"pump":0.6,"repair":0.2}', J(cap.aux));
    const quiet = SS.captain({ helm, stations: [{ name: "q", kind: "target", priority: 99, propose: () => ({ claim: null, aux: null }) }] });
    quiet(st, mission);
    quiet(st, mission);
    ok("with no claim the MISSION is flown, the con is the mission's, nothing is asked for, and the watch counts the mission's ticks (2)", helmSeen[1] === mission && quiet.log.con === "mission" && quiet.aux === null && quiet.log.reason === null && J(quiet.watch.con) === '{"mission":2,"q":0}', J(quiet.watch));
    const wild = SS.captain({ helm, stations: [{ name: "wild", kind: "command", priority: 90, propose: ({ cmd }) => ({ cmd: { ...cmd, thrust: 7, pitch: -3 }, reason: "wild" }) }] }), wo = wild(st, mission);
    ok("an override is SANITIZED (thrust 7 -> 1, pitch -3 -> -1), as brain/emergencyPilot.mjs's wrap sanitizes its own", wo.thrust === 1 && wo.pitch === -1, J(wo));
    const order = []; const cmdSt = (name, edit) => ({ name, kind: "command", priority: 90, propose: ({ cmd, flown }) => { order.push([name, cmd.thrust, flown.depth]); return edit ? { cmd: { ...cmd, thrust: edit }, reason: name + " edits" } : { cmd: null }; } });
    const two = SS.captain({ helm, stations: [cmdSt("first", 0.9), cmdSt("second", 0.2), claim("nav", 10, 7)] }), out = two(st, mission);
    ok("command stations speak AFTER the helm, in order, each seeing the commands so far and the target flown; the last word is kept and sanitized", J(order) === '[["first",0.5,7],["second",0.9,7]]' && out.thrust === 0.2 && J(two.log.overrides) === '["first","second"]', J(order) + " " + J(out));
    ok("the reason is the target claim's when there is one", two.log.reason === "nav wants 7");
    const noReason = SS.captain({ helm, stations: [cmdSt("only", 0.3)] }); noReason(st, mission);
    ok("...and the first override's when no target was claimed", noReason.log.reason === "only edits");
    for (let i = 0; i < 4; i++) two(st, mission);
    ok("the watch counts the ticks each station held the con and each override (5 ticks: nav 5, mission 0; first 5, second 5)", J(two.watch) === J({ con: { mission: 0, nav: 5 }, overrides: { first: 5, second: 5 } }), J(two.watch));
    const w = two.watch; w.con.nav = 99; const l = two.log; l.overrides.push("x");
    ok("the log and the watch are copies (changing them changes nothing)", two.watch.con.nav === 5 && two.log.overrides.length === 2);
    ok("a helm's commands with no override are returned as the helm gave them (the same object)", (() => { const h0 = { pitch: 0, yaw: 0, thrust: 0, ballast: 0 }, c0 = SS.captain({ helm: () => h0 }); return c0(st, mission) === h0; })());
    const auxSeen = []; const h2 = (s, t, c, aux) => { auxSeen.push(aux); return { pitch: 0, yaw: 0, thrust: 0, ballast: 0 }; }; SS.captain({ helm: h2 })(st, mission, [0, 0, 0], { pump: 0.7 });
    ok("the caller's aux argument is handed to the helm unchanged", J(auxSeen) === '[{"pump":0.7}]');
    const ts = SS.targetStation("nav", (s, t) => (t.depth > 10 ? { ...t, depth: 10 } : null)), p1 = ts.propose({ state: st, target: mission }), p2 = ts.propose({ state: st, target: { ...mission, depth: 5 } });
    const reading = (o) => () => ({ cls: "battery", frac: 0.5, depth: 20, flood: 0, damage: 0, refills: true, refillDepth: 0.7, ...o });
    const eFlood = SS.energyStation({ read: reading({ flood: 0.02 }) }).propose({ state: st, target: mission }), eHurt = SS.energyStation({ read: reading({ depth: 1, damage: 0.3, frac: 0.9 }) }).propose({ state: st, target: mission });
    ok("the energy station asks for the PUMP on a boat with water in it and charge to spare, and for the REPAIR at the surface when hurt, without claiming the target", J(eFlood.aux) === '{"pump":1,"repair":0}' && eFlood.claim === null && J(eHurt.aux) === '{"pump":0,"repair":1}' && eHurt.claim === null, J([eFlood.aux, eHurt.aux]));
    const eLow = SS.energyStation({ read: reading({ frac: 0.1 }) }).propose({ state: st, target: { depth: 20, heading: 0.4 } }), eSnork = SS.energyStation({ read: reading({ frac: 0.1, refillDepth: 4 }) }).propose({ state: st, target: { depth: 20, heading: 0.4, speed: 3 } });
    ok("a low battery boat claims the SURFACE at the station's own speed when the mission gives none (1.5); a snorkel boat claims the snorkel band (3 m: 0.75 of its 4 m refill depth) at the mission's speed, and keeps the heading", J(eLow.claim) === '{"depth":20,"heading":0.4,"surface":true,"speed":1.5}' && J(eSnork.claim) === '{"depth":3,"heading":0.4,"speed":3}' && /^charge under 30% at 20 m$/.test(eLow.reason), J([eLow.claim, eSnork.claim, eLow.reason]));
    ok("a target station from a function claims what it returns and nothing when it returns null, at the navigation priority", p1.claim.depth === 10 && p1.reason === "nav's target" && p2.claim === null && ts.priority === SS.PRIORITY.navigation && ts.kind === "target");
});

sec("4. several at once: low on charge AND flooding (the case the tank cannot fly: it runs one event at a time)");
guarded("section 4", () => {
    // ONE BOAT, FOUR CREWS, 400 s: 25 m, 28% charge, a leak of 6% of the weight from 5 s. What each station does alone, and both under the fixed-priority captain. Measured 2026-11-19 and pinned here as the FINDING of this round
    // (brain/SUB_STATIONS_WIP.md section 4): each station was written for a boat with ONE problem, and the fixed captain only stacks them.
    const caps = {}, crew = (name, list) => ({ read, model }) => (caps[name] = SS.captain({ helm: SS.helmOf(pilot, { model }), stations: list(read) }));
    const run = (name, list) => { const t = []; const r = fly((ctx) => { const p = crew(name, list)(ctx); return (st, tg, cur) => { t.push(1); return p(st, tg, cur); }; }, { depth: 25, frac: 0.28, leak: 0.06, seconds: 400, auxFrom: () => caps[name].aux }); return { ...r, seconds: t.length * DT }; };
    const none = run("none", () => []), energy = run("energy", (read) => [SS.energyStation({ read })]), damage = run("damage", () => [SS.damageStation()]), both = run("both", (read) => [SS.energyStation({ read }), SS.damageStation()]);
    const line = (r) => `${r.status} at ${r.seconds.toFixed(0)} s, final ${r.finalDepth.toFixed(1)} m (deepest ${r.maxDepth.toFixed(1)}, shallowest ${r.minDepth.toFixed(1)}), charge ${r.frac.toFixed(3)}, weight ${r.released ? "dropped" : "kept"}`;
    console.log("    none:   " + line(none)); console.log("    energy: " + line(energy)); console.log("    damage: " + line(damage)); console.log("    both:   " + line(both));
    ok("with no station the leak crushes the boat", none.status === "crushed", line(none));
    ok("THE ENERGY STATION ALONE MAKES IT WORSE: crushed sooner than with none (the surfacing wrapper rations the bottle on the way up, written for a sound boat, and the leak needed that air)", energy.status === "crushed" && energy.seconds < none.seconds, `${energy.seconds.toFixed(0)} s against ${none.seconds.toFixed(0)} s`);
    ok("DAMAGE CONTROL ALONE holds the boat for a while and drops the weight, but spends the charge at depth and is crushed later than none", damage.status === "crushed" && damage.released && damage.seconds > none.seconds + 100, line(damage));
    ok("BOTH under the fixed captain: the only crew not crushed in 400 s; it drops the weight and comes up past 10 m", both.status === "submerged" && both.seconds >= 399.9 && both.released && both.minDepth < 10, line(both));
    ok("...BUT IT DOES NOT GET HOME: the battery is flat (under 1%) and the boat ends below 10 m, sinking again -- damage control's full-thrust rescue spent the charge the energy station needed to reach the surface", both.frac < 0.01 && both.finalDepth > 10, line(both));
    ok("both stations acted in the one dive: energy held the con, damage control overrode the helm", caps.both.watch.con.energy > 0 && caps.both.watch.overrides.damage > 0, J(caps.both.watch));
});

sec("5. the later rounds' parts, named here (each is driven in the gate of the round that made it)");
guarded("section 5", () => {
    ok("the parts of rounds 2 to 6 are exported functions: triageCaptain (brain/stationsTask-selfcheck), navigationStation, sonarStation, duelSide (brain/subStationsNavSonar-selfcheck), gatedStation (brain/duelStationsTask-selfcheck)",
        [SS.triageCaptain, SS.navigationStation, SS.sonarStation, SS.duelSide, SS.gatedStation].every((f) => typeof f === "function"));
    ok("TRIAGE_OFF is every knob off and frozen: with it the TRIAGE captain is the fixed one (brain/stationsTask-selfcheck flies the two side by side)", J(SS.TRIAGE_OFF) === '{"thrustFull":null,"thrustFloor":0,"earlyDropBelow":null,"unrationSink":null,"surfaceOnBreach":false}' && Object.isFrozen(SS.TRIAGE_OFF));
});

finished = true;
console.log(fails ? `\nsubStations-selfcheck: ${fails} FAILED` : "\nsubStations-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
