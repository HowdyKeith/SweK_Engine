// WebGLEngine/physics/spellAmmo-selfcheck.mjs -- v4592
//
// Run: node physics/spellAmmo-selfcheck.mjs
//
// THE SIBLING GATE OF physics/spellAmmo.mjs: the book read by reference (the ammo names ARE SPELL_NAMES; every effect field equals
// the book's row; the dungeon grenade's falloff), the magazine (a pickup holds the energy pool over the spell's measured mana;
// loading, spending, the fullest held spell taking over, then the plain shell), the pickups on a track (seeded, on the asphalt,
// taken within reach, back after the respawn), THE HITS headless on box3d (a spark hit is v4588's impulse to the metre per second;
// a cataclysm hit 40 / 3 of it; frostbite slows; ember lights a fire under the target; causticSpray leaves a pool that burns; the
// splash reaches a second car with falloff and not a third), and THE RACE with pickups (a car takes them and lands spell shells;
// deterministic; replayed from its log; the duel without pickups unchanged to the thousandth).
//
// SABOTAGE LOG -- v4592 (each against physics/spellAmmo.mjs, the gate run, the module restored):
//   A. the falloff never falls (always 1)                                 -> 2 red: the falloff row, the splash (the far car takes full damage)
//   B. a pickup holds ten shells whatever the spell                       -> 4 red: the magazine rule and the three loading rows (ember x5 became x10)
//   C. the impulse ignores the spell (every shell a spark)                 -> 1 red: the cataclysm hit (0.743 m/s against 10.0)
//   D. a taken pickup never comes back                                     -> 1 red: the respawn row
//   E. the slow is never applied                                           -> 1 red: the frostbite row
//   F. the hit reads the wrong row (ember for everything)                   -> 9 red: every hit row, the race, the duel's unchanged score
//   G. the splash reaches only the car hit                                 -> 1 red: the quake splash row
// The gate's first run was red on the plain-shell pickup: the endless magazine (count Infinity) swallowed a pickup of spark, and the
// design said a pickup is a magazine; a pickup of the plain spell is a finite one now (x10) that gives way to the endless one at zero.
"use strict";
import { initNode, mod } from "./box3d/box3dNode.mjs";
import { worldFromModule } from "../render/slugTicker.mjs";
import * as A from "./spellAmmo.mjs";
import * as U from "./turret.mjs";
import * as S from "./slick.mjs";
import * as C from "./raceCar.mjs";
import * as G from "../brain/gunnerPolicy.mjs";
import * as D from "../brain/drivePolicy.mjs";
import { SPELLS, SPELL_NAMES, manaFor, ENERGY_POOL, byCost } from "../world/spellBook.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const quiet = () => { const log = console.log; console.log = (...a) => { if (!/\[GLBParser\]|\[box3d\]|\[CityGen\]/.test(String(a[0]))) log(...a); }; };
quiet();
console.log("spellAmmo-selfcheck -- the dungeon spellbook as the turret's ammunition, and the pickups that load it\n");
const st = await initNode();
if (!st.ready) { console.log("  FAIL  box3d wasm: " + st.reason + " -- the wasm is the substrate"); console.log("\nspellAmmo-selfcheck: 1 FAILED"); process.exit(1); }
const m = mod(), worldFrom = () => worldFromModule(m, [0, -9.81, 0]);

console.log("1. THE BOOK, READ AND NOT COPIED");
{
    ok("!! AMMO_NAMES is SPELL_NAMES itself: the same frozen array, every spell an ammo type, the plain shell among them", A.AMMO_NAMES === SPELL_NAMES && Object.isFrozen(A.AMMO_NAMES) && A.AMMO_NAMES.includes(A.AMMO.plain) && A.ammoIndex(A.AMMO.plain) === SPELL_NAMES.indexOf("spark"));
    const rows = SPELL_NAMES.map((n) => { const e = A.hitEffect(n), s = SPELLS[n]; return e.damage === s.damage && e.radius === s.radius && e.element === s.element && e.ignite === !!s.ignite && e.slow === (s.slow || 0) && ((e.pool === null) === !s.pool) && (!s.pool || (e.pool.seconds === s.pool.seconds && e.pool.dps === s.pool.dps)) && e.colour === s.burst.colour && near(e.impulseScale, s.damage / SPELLS.spark.damage); });
    ok("!! for every spell the hit effect IS the book's row: damage, radius, element, ignite, slow, pool, the burst colour, and the impulse scale damage over spark's", rows.every(Boolean) && rows.length === 7, rows.map((r, i) => (r ? "" : SPELL_NAMES[i])).filter(Boolean).join(",") || "all seven");
    const q = A.hitEffect("quake", 3);
    ok("!! the falloff is the dungeon grenade's 1 - d / R: quake (radius 6) at 3 m is half the damage and half the impulse scale; at 6 m nothing; at 0 everything", near(q.falloff, 0.5) && near(q.damage, 4.5) && near(q.impulseScale, 1.5) && A.hitEffect("quake", 6).damage === 0 && A.hitEffect("quake", 0).falloff === 1 && A.hitEffect("quake", 9).falloff === 0);
    const per = SPELL_NAMES.map((n) => A.shellsPerPickup(n)), order = byCost();
    ok("!! a pickup holds ENERGY_POOL / manaFor(spell) shells, never under one: cataclysm 1, spark 10, novaBurst 100 -- the count follows the measured COST, so the cheapest spell fills the biggest magazine though its damage is 12", A.shellsPerPickup("cataclysm") === 1 && A.shellsPerPickup("spark") === Math.round(ENERGY_POOL / manaFor("spark")) && A.shellsPerPickup("novaBurst") === 100 && order[0] === "novaBurst" && SPELLS.novaBurst.damage === 12 && per.every((v) => v >= 1), SPELL_NAMES.map((n, i) => n + " x" + per[i]).join(" "));
    ok("...and the magazines never grow with the cost: along the book's cost order the shells per pickup are non-increasing", order.every((n, i) => i === 0 || A.shellsPerPickup(n) <= A.shellsPerPickup(order[i - 1])));
    ok("an unknown spell is refused by name", (() => { try { A.hitEffect("fireball"); return false; } catch (e) { return /no spell "fireball"/.test(e.message); } })());
}
console.log("\n2. THE MAGAZINE");
{
    const a = A.createAmmo();
    ok("a turret starts loaded with the plain shell and never runs out of it", a.loaded === A.AMMO.plain && a.count === Infinity && A.spendShell(a) === A.AMMO.plain && a.count === Infinity);
    A.takePickup(a, "ember");
    ok("!! a pickup loads its spell with the book's count: ember x5; spending counts down and returns the spell's name", a.loaded === "ember" && a.count === 5 && A.spendShell(a) === "ember" && a.count === 4 && a.taken === 1);
    A.takePickup(a, "cataclysm");
    ok("!! a second, different pickup is what fires next; the ember shells wait in `held`", a.loaded === "cataclysm" && a.count === 1 && a.held.ember === 4);
    ok("!! at zero the fullest held spell takes over (ember x4), and when that runs out the plain shell is back", A.spendShell(a) === "cataclysm" && a.loaded === "ember" && a.count === 4 && [0, 1, 2, 3].every(() => A.spendShell(a) === "ember") && a.loaded === A.AMMO.plain && a.count === Infinity && Object.keys(a.held).length === 0);
    A.takePickup(a, "spark"); A.takePickup(a, "spark");
    ok("the same spell picked twice adds up (spark x20), and a plain-shell pickup is a real magazine of the plain spell", a.loaded === "spark" && a.count === 20);
}
console.log("\n3. THE PICKUPS ON THE TRACK");
const surface = D.surfaceFor(1);
{
    const f = A.pickupField(surface, { seed: 1 }), g = A.pickupField(surface, { seed: 1 }), h2 = A.pickupField(surface, { seed: 2 });
    report(`seed 1: ${f.pickups.length} pickups over ${f.total.toFixed(0)} m; ${f.pickups.slice(0, 5).map((p) => `${p.spell}@${p.x.toFixed(0)},${p.z.toFixed(0)}`).join(" ")} ...`);
    ok("!! 15 pickups over seed 1's 379 m of centreline, every 24 m, every one on the asphalt, at the road plus 0.6", f.pickups.length === 15 && Math.abs(f.total - 379.3) < 1 && f.pickups.every((p) => surface.at(p.x, p.z).kind === "asphalt" && near(p.y, surface.at(p.x, p.z).y + 0.6)) && f.pickups.every((p, i) => i === 0 || near(p.s - f.pickups[i - 1].s, A.AMMO.spacing)), `${f.pickups.length} pickups`);
    ok("!! deterministic per seed, different across seeds, the spells in the book's cost order from a seeded first", JSON.stringify(f.pickups) === JSON.stringify(g.pickups) && JSON.stringify(f.pickups) !== JSON.stringify(h2.pickups) && f.pickups.every((p, i) => i === 0 || byCost().indexOf(p.spell) === (byCost().indexOf(f.pickups[i - 1].spell) + 1) % 7));
    const p0 = f.pickups[0], turrets = [U.createTurret(), U.createTurret()], on = { pos: [p0.x + 1, 1, p0.z + 1] }, off = { pos: [p0.x + 5, 1, p0.z] };
    const ev = A.collectPickups(f, [on, off], turrets, 10);
    ok("!! a car within 2.2 m takes the pickup into its turret's magazine; the car 5 m away does not; the pickup is spent until it respawns", ev.length === 1 && ev[0].car === 0 && ev[0].spell === p0.spell && turrets[0].ammo.loaded === p0.spell && !turrets[1].ammo && !A.pickupAvailable(p0, 11) && A.collectPickups(f, [on, off], turrets, 11).length === 0, JSON.stringify(ev[0]));
    ok("...and it is back after AMMO.respawnTicks", !A.pickupAvailable(p0, 10 + A.AMMO.respawnTicks - 1) && A.pickupAvailable(p0, 10 + A.AMMO.respawnTicks) && A.collectPickups(f, [on], turrets, 10 + A.AMMO.respawnTicks).length === 1 && turrets[0].ammo.taken === 2);
    const c0 = A.centrelinePoint(surface.centreline, 0), c1 = A.centrelinePoint(surface.centreline, f.total);
    ok("the centreline walk closes on itself: the point at the full length is the point at 0", near(c0.x, c1.x, 1e-6) && near(c0.z, c1.z, 1e-6) && near(Math.hypot(c0.nx, c0.nz), 1));
}
console.log("\n4. THE HITS, HEADLESS ON BOX3D: the book's row applied to a still car");
// two cars on a flat surface settled on their suspension; a shell of each ammo fired from car 0 at car 1; the velocity read after the
// step the impulse lands on (brain/gunnerPolicy-selfcheck.mjs's own arrangement, v4588)
const shoot = (ammo, { third = null, slicks = null, ticks = 60 } = {}) => {
    const world = worldFrom(), flat = C.flatSurface(), gunCar = C.createCar(world, { x: 0, z: 0, yaw: 0 }), tgCar = C.createCar(world, { x: 0, z: 12, yaw: 0 }), cars = [gunCar, tgCar];
    if (third) cars.push(C.createCar(world, { x: third[0], z: third[1], yaw: 0 }));
    const spec = U.TURRET, turrets = cars.map(() => U.createTurret(spec)), shells = [], rest = cars.map(() => ({ throttle: 0, steer: 0, brake: 0 }));
    turrets.forEach((tr) => { tr.ammo = A.createAmmo(); }); if (ammo !== A.AMMO.plain) A.takePickup(turrets[0].ammo, ammo, 1);
    for (let t = 0; t < 30; t++) C.stepCars(world, cars, flat, rest, C.CAR.dt);
    const poses0 = cars.map((c) => C.carPose(world, c)), sol = U.aimSolution(poses0[0], turrets[0], poses0[1].pos, [0, 0, 0]);
    turrets[0].yaw = sol.yaw - poses0[0].yaw; turrets[0].pitch = sol.pitch;
    let effects = [], v = null, hitTick = -1, burns = [];
    for (let t = 0; t < ticks; t++) {
        const ps = cars.map((c) => C.carPose(world, c));
        const tt = G.turretTick(world, cars, turrets, shells, ps, cars.map((c, i) => ({ yaw: 0, pitch: 0, fire: t === 0 && i === 0 ? 1 : 0, drop: 0, ignite: 0 })), t, spec, slicks);
        if (tt.effects.length && hitTick < 0) { effects = tt.effects; hitTick = t; }
        burns.push(...tt.burns);
        C.stepCars(world, cars, flat, rest, C.CAR.dt);
        if (t === hitTick) { const vel = world.readVelocities(); v = Math.hypot(vel[tgCar.body * 3], 0, vel[tgCar.body * 3 + 2]); }
    }
    const out = { effects, v, hitTick, turrets, burns, shells: shells.length, ammoAfter: turrets[0].ammo.loaded, poses: cars.map((c) => C.carPose(world, c)) };
    world.destroy(); return out;
};
{
    const plain = shoot("spark"), big = shoot("cataclysm"), base = U.TURRET.hitImpulse / C.CAR.mass;
    report(`spark: ${plain.v && plain.v.toFixed(3)} m/s (v4588 read 0.743); cataclysm: ${big.v && big.v.toFixed(3)} m/s; effects ${JSON.stringify(plain.effects.map((e) => [e.ammo, e.car, +e.damage.toFixed(2)]))}`);
    ok("!! a spark shell lands v4588's impulse to the metre per second (hitImpulse / mass), one effect of damage 3 on the target, the magazine still the plain shell", plain.effects.length === 1 && plain.effects[0].ammo === "spark" && plain.effects[0].damage === 3 && Math.abs(plain.v - base) < 0.15 && plain.ammoAfter === "spark", `${plain.v && plain.v.toFixed(3)} vs ${base.toFixed(3)}`);
    ok("!! a cataclysm shell lands 40 / 3 of it and damage 40, and the one-shell magazine falls back to the plain shell", big.effects.length === 1 && big.effects[0].damage === 40 && Math.abs(big.v - base * 40 / 3) < 0.6 && big.ammoAfter === "spark" && big.turrets[0].damageDealt === 40 && big.turrets[1].damageTaken === 40, `${big.v && big.v.toFixed(3)} vs ${(base * 40 / 3).toFixed(3)}`);
    const ice = shoot("frostbite");
    ok("!! a frostbite shell slows the target for the book's 3 s (180 ticks): slowUntil set, the throttle factor 0.5 while it lasts and 1 after", ice.effects[0] && ice.effects[0].slow === 3 && ice.turrets[1].slowUntil === ice.hitTick + 180 && A.throttleFactor(ice.turrets[1], ice.hitTick + 100) === 0.5 && A.throttleFactor(ice.turrets[1], ice.hitTick + 180) === 1 && A.throttleFactor(ice.turrets[0], ice.hitTick + 100) === 1, `hit at ${ice.hitTick}`);
    const sl = S.createSlicks(), fire = shoot("ember", { slicks: sl });
    const patch = sl.patches[0];
    ok("!! an ember shell lights a Doom Fire under the car it hit, owned by the shooter, free of the gunner's drop reload: one burning patch centred on the target, and the target takes burn ticks", fire.effects[0] && fire.effects[0].ignite && sl.patches.length === 1 && patch.owner === 0 && patch.free && S.isBurning(patch) && Math.abs(patch.x - fire.poses[1].pos[0]) < 2 && Math.abs(patch.z - fire.poses[1].pos[2]) < 2 && fire.turrets[1].burned > 0, `${fire.turrets[1].burned} burn ticks`);
    const sa = S.createSlicks(), acid = shoot("causticSpray", { slicks: sa, ticks: 120 });
    const pool = sa.patches[0];
    ok("!! a caustic shell leaves the book's pool -- 4 s, 1.2 a second -- under the target: acid events every tick it stands there, damage taken beyond the hit's 4, the surface kind 'acid' with the road's grip, and someoneOnMyOil never counts it", acid.effects[0] && acid.effects[0].pool && acid.effects[0].pool.dps === 1.2 && pool && pool.acid && pool.acid.dps === 1.2 && pool.acid.until === acid.hitTick + 240 && acid.burns.filter((b) => b.kind === "acid" && b.car === 1).length > 60 && acid.turrets[1].damageTaken > 4 + 0.5 && acid.turrets[1].acid > 60 && S.slickSurface(C.flatSurface(), sa).at(pool.x, pool.z).kind === S.KIND_ACID && !S.someoneOnMyOil(sa, 0, acid.poses), `${acid.turrets[1].acid} acid ticks, ${acid.turrets[1].damageTaken.toFixed(2)} taken`);
    const splash = shoot("quake", { third: [3, 12] }), far = shoot("quake", { third: [9, 12] });
    ok("!! a quake shell (radius 6) reaches a second car 3 m from the hit with the falloff, and not one 9 m from it", splash.effects.length === 2 && splash.effects[1].car === 2 && splash.effects[1].dist > 2 && splash.effects[1].dist < 4 && splash.effects[1].damage < 9 && splash.effects[1].damage > 0 && far.effects.length === 1, splash.effects.map((e) => `${e.car}: ${e.damage.toFixed(2)} at ${e.dist.toFixed(2)} m`).join("; "));
}
console.log("\n5. THE RACE WITH PICKUPS, AND THE DUEL WITHOUT THEM UNCHANGED");
{
    const fleet = D.machineFingerprint(m), drivers = [D.handWeights(), D.handWeights({ speed: 0.8 }), D.zeroWeights()], gunners = [G.handWeights(), G.zeroWeights(), G.handWeights()];
    const R = G.raceWithGunners(worldFrom, drivers, gunners, { seed: 1, seconds: 20, fleet }), taken = [];
    G.raceWithGunners(worldFrom, drivers, gunners, { seed: 1, seconds: 20, fleet, onTick: (t, poses, turrets, shells, events, slicks, burns, field, tk, eff) => { for (const e of eff) if (e.ammo !== "spark") taken.push(e.ammo); } });
    report(`20 s, 3 cars: pickups ${R.results.map((q) => q.pickups).join(" ")}, dealt ${R.results.map((q) => q.damageDealt.toFixed(1)).join(" ")}, taken ${R.results.map((q) => q.damageTaken.toFixed(1)).join(" ")}, acid ticks ${R.results.map((q) => q.acid).join(" ")}; spell shells landed: ${taken.join(" ")}`);
    ok("!! the leader's hand gunner drives over pickups (four) and lands SPELL shells on the car behind: causticSpray and cataclysm among them, the car behind taking more than its hits' plain damage and acid ticks", R.pickups && R.pickupCount === 15 && R.results[0].pickups >= 3 && taken.includes("causticSpray") && taken.includes("cataclysm") && R.results[1].damageTaken > R.results[0].hits * 3 && R.results[1].acid > 0, `${R.results[0].pickups} pickups, ${taken.length} spell shells`);
    const R2 = G.raceWithGunners(worldFrom, drivers, gunners, { seed: 1, seconds: 20, fleet }), rp = G.replayGunners(worldFrom, R);
    ok("!! deterministic, and replayed from its eight-field log to the same fingerprint, damage, pickups and loaded ammo", R2.fingerprint === R.fingerprint && rp.fingerprint === R.fingerprint && rp.results.every((q, i) => q.damageDealt === R.results[i].damageDealt && q.damageTaken === R.results[i].damageTaken && q.pickups === R.results[i].pickups && q.ammo === R.results[i].ammo && q.hits === R.results[i].hits), R.fingerprint);
    const R0 = G.raceWithGunners(worldFrom, drivers, gunners, { seed: 1, seconds: 20, fleet, pickups: false });
    ok("without pickups nobody takes one, every shell is a spark, and the fingerprint differs", !R0.pickups && R0.results.every((q) => q.pickups === 0 && q.ammo === "spark" && near(q.damageDealt, q.hits * 3)) && R0.fingerprint !== R.fingerprint);
    const d0 = G.duel(worldFrom, G.handWeights(), { seed: 1, seconds: 20 }), d1 = G.duel(worldFrom, G.handWeights(), { seed: 1, seconds: 20, pickups: true });
    report(`duel plain: ${d0.hits}/${d0.shots}, damage ${d0.damage}, score ${d0.score.toFixed(3)}; with pickups: ${d1.hits}/${d1.shots}, ${d1.pickups} pickups, damage ${d1.damage.toFixed(1)}, score ${d1.score.toFixed(3)}`);
    ok("!! the duel without pickups scores exactly as v4590's (13 of 15, 14.558): the damage bonus is only what the spells add beyond the plain shell", d0.hits === 13 && d0.shots === 15 && d0.damage === 39 && Math.abs(d0.score - 14.558) < 5e-4 && d0.pickups === 0);
    ok("...and with pickups the same gunner takes some, lands more damage and scores more", d1.pickups > 0 && d1.damage > d0.damage && d1.score > d0.score);
}
console.log("\n6. THE FRONT DOOR");
{
    const L = A.reportLines();
    ok("reportLines names the book, the magazine rule with every spell's count, and the pickups", L.length === 3 && /IS a spell of world\/spellBook\.mjs/.test(L[0]) && /cataclysm 40dmg r16 x1/.test(L[1]) && /every 24 m/.test(L[2]));
}
console.log(fails ? `\nspellAmmo-selfcheck: ${fails} FAILED` : "\nspellAmmo-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
