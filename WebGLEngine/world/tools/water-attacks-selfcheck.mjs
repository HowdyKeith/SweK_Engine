// WebGLEngine/world/tools/water-attacks-selfcheck.mjs — proves the water-spell -> waterField coupling.
//
// The in-game render is RIG-ONLY, but the PLAN (which waterField calls a spell makes, and with what
// direction/spread) is pure and must be right: a tidal wave has to travel TOWARD the target, a deluge
// has to scatter over the target zone, and a non-water attack must move no water at all.
//
//   run: node world/tools/water-attacks-selfcheck.mjs

const { waterPlanFor } = await import("../kaijuAttackFx.js");
const { KAIJU_ATTACKS } = await import("../kaijuAttacks.js");

let pass = 0, total = 0;
const ok = (n, c, d = "") => { total++; if (c) { pass++; console.log(`  ok   ${n}`); } else { console.log(`  FAIL ${n}${d ? "  -- " + d : ""}`); } };
const WATER_METHODS = new Set(["tidalWave", "splash", "setBaseLevel"]);
const finiteArgs = (plan) => plan.every(s => s.args.every(a => (typeof a === "number" ? Number.isFinite(a) : (a && typeof a === "object"))));

console.log("water-attacks-selfcheck: registry wiring");
ok("tidal_wave tagged waterEffect=tidalWave", KAIJU_ATTACKS.tidal_wave.waterEffect === "tidalWave");
ok("deluge tagged waterEffect=deluge", KAIJU_ATTACKS.deluge.waterEffect === "deluge");
ok("typhoon tagged waterEffect=vortex", KAIJU_ATTACKS.typhoon.waterEffect === "vortex");
ok("plague has NO waterEffect", !KAIJU_ATTACKS.plague.waterEffect);
ok("lightning has NO waterEffect", !KAIJU_ATTACKS.lightning.waterEffect);

console.log("water-attacks-selfcheck: tidal wave travels toward the target");
{
    const east = waterPlanFor(KAIJU_ATTACKS.tidal_wave, 0, 0, 20, 0);
    const wave = east.find(s => s.method === "tidalWave");
    ok("east target -> wave enters from 'west' (travels +X)", wave && wave.args[0].edge === "west", wave && wave.args[0].edge);
    ok("west target -> wave enters from 'east'", waterPlanFor(KAIJU_ATTACKS.tidal_wave, 0, 0, -20, 0).find(s => s.method === "tidalWave").args[0].edge === "east");
    ok("north (+Z) target -> wave enters from 'north'", waterPlanFor(KAIJU_ATTACKS.tidal_wave, 0, 0, 0, 20).find(s => s.method === "tidalWave").args[0].edge === "north");
    ok("south (-Z) target -> wave enters from 'south'", waterPlanFor(KAIJU_ATTACKS.tidal_wave, 0, 0, 0, -20).find(s => s.method === "tidalWave").args[0].edge === "south");
    ok("tidal wave also splashes at the aim point", east.some(s => s.method === "splash" && s.args[0] === 20 && s.args[1] === 0));
    ok("tidal wave plan args all finite/valid", finiteArgs(east));
}

console.log("water-attacks-selfcheck: deluge scatters over the target zone");
{
    const p = waterPlanFor(KAIJU_ATTACKS.deluge, 0, 0, 50, 50);
    ok("deluge is all splashes", p.length >= 12 && p.every(s => s.method === "splash"));
    const within = p.every(s => Math.hypot(s.args[0] - 50, s.args[1] - 50) <= 8.001);
    ok("every splash lands within the deluge radius of the target", within);
    ok("deluge args all finite", finiteArgs(p));
}

console.log("water-attacks-selfcheck: typhoon churns a ring");
{
    const p = waterPlanFor(KAIJU_ATTACKS.typhoon, 0, 0, 30, 30);
    ok("typhoon is all splashes", p.length >= 12 && p.every(s => s.method === "splash"));
    const ring = p.filter(s => Math.abs(Math.hypot(s.args[0] - 30, s.args[1] - 30) - 5) < 0.01);
    ok("most splashes sit on a ring of radius ~5", ring.length >= 12);
    ok("typhoon has an eye splash at the centre", p.some(s => s.args[0] === 30 && s.args[1] === 30));
}

console.log("water-attacks-selfcheck: non-water attacks move no water");
{
    ok("plague -> empty plan", waterPlanFor(KAIJU_ATTACKS.plague, 0, 0, 5, 5).length === 0);
    ok("lightning -> empty plan", waterPlanFor(KAIJU_ATTACKS.lightning, 0, 0, 5, 5).length === 0);
    ok("undefined attack -> empty plan", waterPlanFor(undefined, 0, 0, 5, 5).length === 0);
}

console.log("water-attacks-selfcheck: every step targets a real WaterField method");
{
    let bad = 0;
    for (const name of ["tidal_wave", "deluge", "typhoon"]) {
        for (const s of waterPlanFor(KAIJU_ATTACKS[name], 0, 0, 10, 3)) if (!WATER_METHODS.has(s.method)) bad++;
    }
    ok("no step names a method WaterField does not have", bad === 0, bad + " bad");
}

console.log(`\nwater-attacks-selfcheck: ${pass}/${total} passed`);
if (pass !== total && typeof process !== "undefined" && process.exit) process.exit(1);
