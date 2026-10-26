// WebGLEngine/brain/seaOgre-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/seaOgre-selfcheck.mjs      (~10 s)
//
// THE SEA OGRE AGAINST THE SUBS (brain/seaOgre.mjs):
//   1  THE SCENARIO   n defenders, the OGRE 650..800 m out steering for the origin, the defenders 90..150 m out on the same side; the same call the same scenario; frozen
//   2  THE ZONES      four hit zones 7 m apart or more, ids unique and clear of the hull's and the escorts'; ogrePoints is hand-worked at two headings (the zone ahead of the hull is AHEAD of it); a
//                     destroyed zone is no longer a target; phaseOf cuts at 50% and 20% of the hull
//   3  THE CONTRACT   a roster the size of the scenario or a refusal by name; the fight deterministic; a trace changes nothing and is a frame every 6 ticks of the shape the page draws
//   4  THE DAMAGE     a hull's left is exactly 300 less the hull hits plus half of every zone hit (the spill); a zone that is gone is never hit again; a defender's torpedo never lands on a friend
//   5  THE ZONES DO   (a damaged OGRE to begin with) no tubes: it never fires; no sonar: it never fires; no cannon: the headquarters is not shelled; a dead engine: it crawls; a hull under 50%: escorts, at
//                     most two alive; under 20%: berserk, faster; escorts and shells only in their phase and depth (the cannon only when it is UP, the tubes only when it is DOWN)
//   6  THE OUTCOMES   the breach (inside 60 m, or the headquarters at 0), the holdout, the defence; the score is the formula, written out
//   7  THE LEVEL      measured on fixed seeds: the default hand tactician NEVER FIRES at a loud OGRE it has to ping to range and loses every time (said: its fire gate wants an echo inside 320 m and the OGRE shoots from
//                     380); a gunner theta (fire from 420 m, on a loud passive contact) defends most of the time with four boats and less with three and one
//
// SABOTAGES (each mutant breaks the thing a row guards; the row that went red, by name; an entry that went 0 red is a finding, and was fixed):
//   brain/seaOgre.mjs: S1 spill 0 (1: the four-gunner defence rate) | S2 spill 1 (2: the holdout seed is now a defence) | S3 sonar zone 5 m from the tubes (2: the gap row) | S4 zone side flipped (3) | S5 a dead zone stays a target (3) |
//   S6 phase cuts swapped (2) | S7 friendly fire, defenders in the OGRE-side target list (1: no torpedo on a friend) | S8 tubes not needed (1) | S9 sonar not needed (1) | S10 cannon not needed (1) | S11 cannon from below (1) |
//   S12 tubes while surfacing (1) | S13 engine crawl ignored (1) | S14 escorts in phase 1 (6) | S15 escort cap ignored (2) | S16 escort never ages (2) | S17 berserk speed ignored (1) | S18 breach range 0 (3) | S19 score's
//   loss term 0.1 (2) | S20 TRACE_EVERY 5 (0 red THE FIRST TIME: the row read the constant back from the module; the number is pinned now, 1) | S21 hull hit doubled (1) | S22 headquarters unclamped (0 red THE FIRST TIME: no
//   fight in the set shelled it to the bottom; start.hq makes one, 1) | S23 surfaced 100 ticks (4) | S24 roster size unchecked (1) | S25 holdout default breached (1) | S26 berserk fire interval same (1) | S27 the OGRE
//   quiet (6) | S28 AMMO 2 (0 red THE FIRST TIME: a ceiling row cannot see a lower cap; 'someone fires all six' on named seeds, 1) | S31 AMMO 7 (1) | S29 the trace mutates the fight (12) | S30 the OGRE does not move (7).
"use strict";
import * as G from "./seaOgre.mjs";
import * as T from "./subTournament.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const near = (a, b, t = 1e-9) => Math.abs(a - b) <= t;
const GUNNER = { fireRange: 420, blindSnr: 22, pingAfter: 1, trackSpeed: 2.5 };
const sides = (n, theta = null) => Array.from({ length: n }, (_, i) => T.makeSide("d" + i, { theta }).side());
const run = (n, seed, opts = {}, theta = GUNNER) => { const trace = []; const r = G.fight(sides(n, theta), G.scenario(seed, n), { ...opts, trace }); return { r, trace }; };

console.log("1. THE SCENARIO");
{
    const a = G.scenario(7, 3), b = G.scenario(7, 3), c = G.scenario(8, 3);
    ok("the same call, the same scenario; another seed another one", JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(a) !== JSON.stringify(c));
    ok("one defender per n and frozen", a.defenders.length === 3 && Object.isFrozen(a) && Object.isFrozen(a.ogre) && Object.isFrozen(a.defenders[0]));
    let rangeOk = true, nearOk = true, headOk = true, sameSide = true;
    for (let s = 1; s <= 40; s++) {
        const sc = G.scenario(s, 3), d = Math.hypot(...sc.ogre.pos); rangeOk &&= d >= 650 && d <= 800;
        const toHq = Math.atan2(sc.ogre.pos[1], -sc.ogre.pos[0]); headOk &&= near(Math.abs(Math.atan2(Math.sin(sc.ogre.heading - toHq), Math.cos(sc.ogre.heading - toHq))), 0, 1e-9);
        for (const q of sc.defenders) { const dd = Math.hypot(...q.pos); nearOk &&= dd >= 90 - 80 && dd <= 150 + 80; sameSide &&= (q.pos[0] * sc.ogre.pos[0] + q.pos[1] * sc.ogre.pos[1]) > 0; }
    }
    ok("the OGRE starts 650..800 m out and heads for the origin", rangeOk && headOk);
    ok("the defenders start near the origin, on the OGRE's side", nearOk && sameSide);
    ok("the roster size is the scenario's n (1..4 all work)", [1, 2, 3, 4].every((n) => G.scenario(3, n).defenders.length === n));
}

console.log("\n2. THE ZONES");
{
    const at = ZONES_AT();
    function ZONES_AT() { return G.ZONES.map((z) => z.at).sort((x, y) => x - y); }
    let gap = Infinity; for (let i = 1; i < at.length; i++) gap = Math.min(gap, at[i] - at[i - 1]);
    ok("four zones, tubes ahead of sonar ahead of cannon ahead of engine", G.ZONES.map((z) => z.name).join() === "tubes,sonar,cannon,engine" && G.ZONES[0].at > G.ZONES[1].at && G.ZONES[1].at > G.ZONES[2].at && G.ZONES[2].at > G.ZONES[3].at);
    ok("!! 7 m apart or more (the fuse names the nearest, and its shell is 8 m)", gap >= 7, `gap ${gap}`);
    ok("ids unique and clear of the hull's 900 and the escorts' 800s", new Set(G.ZONES.map((z) => z.id)).size === 4 && G.ZONES.every((z) => z.id > 900));
    const o = { x: 100, y: 50, depth: 14, heading: 0, speed: 2, zones: { tubes: 1, sonar: 1, cannon: 1, engine: 1 } }, p = G.ogrePoints(o), by = Object.fromEntries(p.map((q) => [q.zone, q]));
    ok("hand-worked at heading 0: the tubes 14 m AHEAD of the hull (x + 14), the engine 14 m astern (x - 14), y unchanged, all at the OGRE's depth", p.length === 5 && near(by.tubes.pos[0], 114) && near(by.engine.pos[0], 86) && near(by.sonar.pos[0], 107) && near(by.cannon.pos[0], 93) && near(by.tubes.pos[1], 50) && p.every((q) => near(q.pos[2], -14)));
    const q = G.ogrePoints({ ...o, heading: Math.PI / 2 }), bq = Object.fromEntries(q.map((z) => [z.zone, z]));
    ok("at heading pi/2 (the engine's +y is the vessel's LEFT, so ahead is -y): the tubes at y - 14", near(bq.tubes.pos[1], 36) && near(bq.tubes.pos[0], 100, 1e-9) && near(bq.engine.pos[1], 64));
    const dead = G.ogrePoints({ ...o, zones: { tubes: 0, sonar: 1, cannon: 1, engine: 0 } });
    ok("a destroyed zone is no longer a target", dead.length === 3 && !dead.some((z) => z.zone === "tubes" || z.zone === "engine") && dead[0].id === 900);
    ok("phaseOf: 1 above 50%, 2 under 50%, 3 under 20%", G.phaseOf(300) === 1 && G.phaseOf(150) === 1 && G.phaseOf(149.9) === 2 && G.phaseOf(60) === 2 && G.phaseOf(59.9) === 3 && G.phaseOf(0) === 3);
}

console.log("\n3. THE CONTRACT");
{
    let msg = ""; try { G.fight(sides(2), G.scenario(1, 3)); } catch (e) { msg = String(e.message); }
    ok("a roster that is not the scenario's size is refused by name", /3 defenders/.test(msg) && /2 sides/.test(msg), msg);
    const a = run(3, 4, { seconds: 90 }), b = run(3, 4, { seconds: 90 });
    ok("the fight is deterministic (the fingerprint and the events)", a.r.fingerprint === b.r.fingerprint && JSON.stringify(a.r.events) === JSON.stringify(b.r.events));
    const noTrace = G.fight(sides(3, GUNNER), G.scenario(4, 3), { seconds: 90 });
    ok("!! a trace changes nothing: the same fingerprint and score with and without it", noTrace.fingerprint === a.r.fingerprint && noTrace.score === a.r.score);
    ok("!! a frame every 6 ticks (the number is pinned, not read back from the module)", G.TRACE_EVERY === 6 && a.trace.length === Math.ceil(a.r.ticks / 6) && a.trace.every((f, i) => f.tick === i * 6));
    const f = a.trace[10];
    ok("the frame carries what the page draws", Object.keys(f).sort().join() === "boats,escorts,fix,hq,ogre,probes,tick,torps" && f.boats.length === 3 && Object.keys(f.ogre).sort().join() === "depth,heading,hull,phase,speed,surfaced,x,y,zones" && Object.keys(f.ogre.zones).sort().join() === "cannon,engine,sonar,tubes");
    ok("the verdict carries what the page tells", ["outcome", "score", "hull", "hq", "hullDamage", "lost", "fates", "fired", "hits", "ogreFired", "zones", "phase", "escorts", "ticks", "events", "seed", "n", "fingerprint"].every((k) => k in a.r));
}

console.log("\n4. THE DAMAGE");
{
    let spill = true, gone = true, friend = true, fates = true, hqOk = true, cnt = 0;
    for (const [n, seed] of [[3, 1], [3, 2], [3, 6], [4, 1], [4, 8], [2, 5]]) {
        const { r } = run(n, seed), hit = r.events.filter((e) => e.type === "hit" && e.boat >= 1);
        const zoneDmg = hit.filter((e) => e.zone && e.zone !== "hull").reduce((a, e) => a + e.damage, 0), hullDmg = hit.filter((e) => e.zone === "hull").reduce((a, e) => a + e.damage, 0);
        spill &&= near(r.hull, Math.max(0, G.OGRE.hull - G.OGRE.spill * zoneDmg - hullDmg), 1e-6); cnt += hit.length;
        const goneAt = {}; for (const e of r.events) if (e.type === "hit" && e.gone) goneAt[e.zone] = e.tick;
        gone &&= !r.events.some((e) => e.type === "hit" && e.zone && goneAt[e.zone] !== undefined && e.tick > goneAt[e.zone]);
        friend &&= !r.events.some((e) => e.type === "hit" && e.boat >= 1 && e.target >= 1 && e.target <= n);
        for (const [i, fate] of r.fates.entries()) fates &&= (fate === "sunk") === r.events.some((e) => e.type === "loss" && e.boat === i + 1 && e.why === "sunk") || fate !== "sunk";
        hqOk &&= r.hq <= G.HQ_HP && r.hq >= 0;
    }
    ok("measured on 6 fights", cnt >= 10, `${cnt} defender hits`);
    ok("!! the hull's left is 300 less the hull hits less HALF of every zone hit (the spill), exactly", spill);
    ok("a zone that is gone is never hit again (the next hit goes to the next nearest)", gone);
    ok("!! a defender's torpedo never lands on a friend", friend);
    ok("a sunk boat has its loss event", fates);
    let mostFired = 0; for (const [n, seed] of [[3, 1], [3, 4], [3, 10], [4, 8]]) mostFired = Math.max(mostFired, ...run(n, seed).r.fired);
    ok("!! six torpedoes a boat: no one fires more, and someone fires all six", G.AMMO === 6 && mostFired === 6, `${mostFired}`);
    ok("the headquarters' points stay within 0..100", hqOk);
    const { r } = run(3, 1);
    ok("at least one fight in this set kills a zone (the machinery is exercised)", ["tubes", "sonar"].some((z) => r.zones[z] === 0) || run(3, 2).r.zones.tubes === 0);
}

console.log("\n5. THE ZONES DO");
{
    const count = (r, t) => r.events.filter((e) => e.type === t).length;
    const noTubes = run(3, 1, { start: { zones: { tubes: 0 } } }).r, noSonar = run(3, 1, { start: { zones: { sonar: 0 } } }).r, base = run(3, 1, {}, null).r;
    ok("the OGRE fires when it has tubes and sonar (the base case)", base.ogreFired >= 5, `${base.ogreFired}`);
    ok("!! no tubes: it never fires", noTubes.ogreFired === 0);
    ok("!! no sonar: it never fires (it is deaf and cannot aim)", noSonar.ogreFired === 0);
    const withGun = run(3, 3, {}, null), noGun = run(3, 3, { start: { zones: { cannon: 0 } } }, null);
    ok("with the cannon, a breach comes with shells on the headquarters (the base case)", count(withGun.r, "shell") >= 3 && withGun.r.hq < G.HQ_HP, `${count(withGun.r, "shell")} shells, hq ${withGun.r.hq}`);
    ok("!! no cannon: the headquarters is not shelled", count(noGun.r, "shell") === 0 && noGun.r.hq === G.HQ_HP);
    const shellFrames = withGun.trace.filter((f) => withGun.r.events.some((e) => e.type === "shell" && e.tick >= f.tick && e.tick < f.tick + G.TRACE_EVERY));
    ok("!! the cannon only when it is UP (depth under 6 m: a frame is up to 0.4 m behind the tick) and inside 220 m", shellFrames.length > 0 && shellFrames.every((f) => f.ogre.depth <= 6.5 && Math.hypot(f.ogre.x, f.ogre.y) <= G.OGRE.cannonRange + 3));
    const fireFrames = base ? run(3, 1, {}, null).trace : [];
    const fires = run(3, 1, {}, null); const fireTicks = fires.r.events.filter((e) => e.type === "ogre-fire").map((e) => e.tick);
    const downAtFire = fireTicks.every((t) => { const f = fires.trace[Math.floor(t / G.TRACE_EVERY)]; return f && f.ogre.depth >= 11.5; });
    ok("!! the tubes only when it is DOWN (12 m or deeper: a frame is up to 0.4 m behind the tick)", fireTicks.length >= 5 && downAtFire && fireFrames.length > 0);
    const dep = fires.trace.map((f) => f.ogre.depth), up = fires.trace.filter((f) => f.ogre.surfaced).length / fires.trace.length;
    ok("the cycle: depth within 4..14 m, surfaced about 150 of 420 ticks", Math.min(...dep) >= 3.99 && Math.max(...dep) <= 14.01 && Math.abs(up - 150 / 420) < 0.04, `${Math.min(...dep).toFixed(1)}..${Math.max(...dep).toFixed(1)} m, ${(100 * up).toFixed(0)}% up`);
    const healthy = run(3, 5, { seconds: 120 }, null), noEngine = run(3, 5, { seconds: 120, start: { zones: { engine: 0 } } }, null);
    const sp = (x) => x.trace.at(-1).ogre.speed;
    ok("!! a dead engine: it crawls at 40% (2.3 -> 0.92 m/s)", near(sp(healthy), G.OGRE.speed, 0.02) && near(sp(noEngine), G.OGRE.speed * G.OGRE.crawl, 0.02), `${sp(healthy).toFixed(2)} v ${sp(noEngine).toFixed(2)}`);
    const p2 = run(3, 5, { seconds: 120, start: { hull: 140 } }, null), p1 = run(3, 5, { seconds: 120 }, null);
    ok("!! escorts only under 50% of the hull: none at full, some below", p1.r.escorts === 0 && p2.r.escorts >= 3, `${p1.r.escorts} v ${p2.r.escorts}`);
    ok("at most two escorts alive at a time, each with a ttl-bounded life", p2.trace.every((f) => f.escorts.length <= G.OGRE.escortMax));
    const lifeOk = (() => { const first = {}, last = {}; for (const f of p2.trace) for (const e of f.escorts) { first[e.id] ??= f.tick; last[e.id] = f.tick; } return Object.keys(first).every((id) => (last[id] - first[id]) / 30 <= G.OGRE.escortTtl + 0.5); })();
    ok("an escort lives no longer than 35 s", lifeOk);
    const p3 = run(3, 5, { seconds: 120, start: { hull: 50 } }, null);
    ok("!! under 20%: berserk, 2.3 -> 3.2 m/s and a shorter fire interval", near(sp(p3), G.OGRE.speed * G.OGRE.berserkSpeed, 0.03) && G.OGRE.berserkFireEvery < G.OGRE.fireEvery, `${sp(p3).toFixed(2)} m/s`);
}

console.log("\n6. THE OUTCOMES");
{
    const sc = G.scenario(3, 3), mk = () => sides(3, null);
    const breach = G.fight(mk(), sc, { seconds: 300 });
    ok("a defence that does nothing is breached", breach.outcome === "breached" && breach.hull === G.OGRE.hull);
    const lastBreach = (() => { const t = []; G.fight(mk(), sc, { trace: t }); return t.at(-1); })();
    ok("!! a breach is the OGRE inside 60 m, or the headquarters at 0", Math.hypot(lastBreach.ogre.x, lastBreach.ogre.y) <= G.OGRE.breachRange + 3 || lastBreach.hq === 0);
    const shelled = G.fight(mk(), sc, { start: { hq: 4 } });
    ok("!! the headquarters never goes under 0 (one shell on 4 left leaves 0, not -2) and a headquarters at 0 is a breach", shelled.hq === 0 && shelled.outcome === "breached" && shelled.ticks < breach.ticks);
    const d = run(4, 1).r;
    ok("a good defence sinks it: outcome defended, hull 0, the headquarters whole", d.outcome === "defended" && d.hull === 0 && d.hq === G.HQ_HP);
    const hold = G.fight(sides(4, GUNNER), G.scenario(8, 4), { seconds: 300 });
    ok("the clock runs out: a holdout is neither (hull left, no breach)", hold.outcome === "holdout" && hold.hull > 0 && hold.ticks === 300 * 30, hold.outcome);
    for (const r of [breach, d, hold]) {
        const left = 1 - r.ticks / (300 * 30), want = (1 - r.hull / G.OGRE.hull) + (r.outcome === "defended" ? 1 + 0.5 * left : 0) - (r.outcome === "breached" ? 1 : 0) - 0.15 * r.lost;
        ok(`!! the score is the formula (${r.outcome})`, near(r.score, want, 1e-9), `${r.score.toFixed(3)}`);
    }
    ok("the defended score beats the holdout, which beats the breach", d.score > hold.score && hold.score > breach.score);
}

console.log("\n7. THE LEVEL");
{
    const tally = (n, theta, seeds) => { const o = { defended: 0, breached: 0, holdout: 0, fired: 0 }; for (let s = 1; s <= seeds; s++) { const r = G.fight(sides(n, theta), G.scenario(s, n)); o[r.outcome]++; o.fired += r.fired.reduce((a, b) => a + b, 0); } return o; };
    const def = tally(3, null, 6), four = tally(4, GUNNER, 8), three = tally(3, GUNNER, 8), solo = tally(1, GUNNER, 8);
    ok("!! the default hand tactician never fires and is breached every time", def.fired === 0 && def.breached === 6, JSON.stringify(def));
    ok("four gunners defend at least five times in eight", four.defended >= 5, JSON.stringify(four));
    ok("three gunners win some and lose some", three.defended >= 2 && three.defended <= 6 && three.breached >= 2, JSON.stringify(three));
    ok("one gunner is not enough (it defends at most once in eight)", solo.defended <= 1, JSON.stringify(solo));
    ok("!! more boats, more defences (four >= three >= one, defended)", four.defended >= three.defended && three.defended >= solo.defended);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
