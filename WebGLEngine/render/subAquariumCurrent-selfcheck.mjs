// WebGLEngine/render/subAquariumCurrent-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node render/subAquariumCurrent-selfcheck.mjs      (a few seconds)
//
// THE TANK'S STEADY CURRENT (Keith, 2026-11-17: "add the tank current, steady, off by default"), render/subAquariumSim.mjs setCurrent and sub-aquarium.html's picker:
//   1 THE SWITCH   off (null) by default; setCurrent returns what it was; [0, 0] is off; a bad value (not two finite numbers, stronger than CURRENT_MAX) throws and changes nothing.
//   2 OFF IS THE OLD TANK  a tank whose current was set and then switched off flies bit for bit as a tank never touched.
//   3 THE WATER    a sub on the PD autopilot in 1 m/s to the right drifts with it: between 10 and 20 s it gains 9 to 11.5 m in x on the same sub in still water (measured 10.3), and
//                  stays within 2 m in y; the same current to the left mirrors it.
//   4 THE PILOTS   every pilot is TOLD the current: the third argument it is called with is [vx, vy, 0] (and [0, 0, 0] when off); the needs model and the physics are handed the same
//                  (the source: the three calls of the step loop all read it, and no hard zero is left there).
//   5 THE PAGE     a picker, off by default, speeds up to CURRENT_MAX, four plan-view directions, wired to tank.setCurrent.
// NOT CHECKED, said plainly: how the page looks with it on; the couriers' plans do not know the current (a crab for them is now possible, not built).
// SABOTAGE LOG (2026-11-17; 11 mutants of render/subAquariumSim.mjs and sub-aquarium.html, each alone, restored byte-identical; every one red): C1 a 0.1 m/s current on by default (4),
//   C2 the pilot told still water (4), C3 the physics in still water (3), C4 the needs model in still water (1, the source row), C5 no speed limit (1), C6 non-numbers accepted (1),
//   C7 the y component flipped and [0, 0] kept on (3), C8 null not switching it off (2), C9 the picker not off by default (1), C10 up and down swapped (1), C11 the direction picker unwired (1).
"use strict";
import fs from "node:fs";
import * as A from "./subAquariumSim.mjs";
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify;
const thr = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
const entry = (id) => ({ id, name: "Sub " + id, hue: 100, pilot: "autopilot", from: "x", local: false, weights: null });
const mk = () => { const t = A.createTank(); t.sync([entry("a")]); return t; };
const run = (t, seconds) => { for (let i = 0; i < Math.round(seconds * 30); i++) t.step(1 / 30); };
console.log("subAquariumCurrent-selfcheck -- the tank's steady current\n");

sec("1. THE SWITCH");
{
    const t = mk();
    ok("!! off by default: current is null; CURRENT_MAX is 1.5 m/s", t.current === null && A.CURRENT_MAX === 1.5);
    ok("!! setCurrent returns what it was and the getter follows; [0, 0], null, undefined and false are off", t.setCurrent([1, 0]) === null && J(t.current) === J([1, 0]) && J(t.setCurrent([0, -0.5])) === J([1, 0]) && J(t.setCurrent([0, 0])) === J([0, -0.5]) && t.current === null && (t.setCurrent([1, 0]), t.setCurrent(null), t.current === null) && (t.setCurrent([1, 0]), t.setCurrent(false), t.current === null) && (t.setCurrent([1, 0]), t.setCurrent(undefined), t.current === null));
    t.setCurrent([0.5, 0.5]);
    const bad = [[NaN, 0], [1], [1, 0, 0], "1", [1.2, 1.0], [Infinity, 0]].map((v) => thr(() => t.setCurrent(v)));
    ok("!! a bad value throws by name and changes nothing: NaN, one or three numbers, a string, 1.56 m/s (over 1.5), Infinity", bad.every((m) => /subAquariumSim\.setCurrent/.test(m)) && /more than 1.5 m\/s/.test(bad[4]) && J(t.current) === J([0.5, 0.5]), bad.join(" | "));
    ok("  exactly CURRENT_MAX is accepted", thr(() => t.setCurrent([1.5, 0])) === "" && J(t.current) === J([1.5, 0]));
}

sec("2. OFF IS THE OLD TANK");
{
    const a = mk(), b = mk(); b.setCurrent([1, 0.5]); b.setCurrent(null);
    run(a, 10); run(b, 10);
    ok("!! a tank whose current was set and switched off flies bit for bit as one never touched (10 s)", J(a.snapshot()) === J(b.snapshot()));
}

sec("3. THE WATER");
{
    const a = mk(), b = mk(), c = mk(); b.setCurrent([1, 0]); c.setCurrent([-1, 0]);
    run(a, 10); run(b, 10); run(c, 10); const x10 = [a, b, c].map((t) => t.snapshot()[0]);
    run(a, 10); run(b, 10); run(c, 10); const x20 = [a, b, c].map((t) => t.snapshot()[0]);
    const gain = (k) => (x20[k].x - x20[0].x) - (x10[k].x - x10[0].x);
    ok("!! 1 m/s to the right: between 10 and 20 s the sub gains 9 to 11.5 m in x on the same sub in still water (the current carries it), and stays within 2 m in y", gain(1) >= 9 && gain(1) <= 11.5 && Math.abs(x20[1].y - x20[0].y) < 2, `${gain(1).toFixed(2)} m, dy ${(x20[1].y - x20[0].y).toFixed(2)}`);
    ok("!! 1 m/s to the left mirrors it (loses 9 to 11.5 m)", -gain(2) >= 9 && -gain(2) <= 11.5, `${gain(2).toFixed(2)} m`);
}

sec("4. THE PILOTS");
{
    const t = mk(), sub = t.subs.get("a"), seen = [], real = sub.pilot;
    sub.pilot = (s, tg, cur, aux) => { seen.push(cur); return real(s, tg, cur, aux); };
    t.step(1 / 30); t.setCurrent([0.6, -0.3]); t.step(1 / 30);
    ok("!! the pilot is TOLD the current: [0, 0, 0] when off, [0.6, -0.3, 0] when on", J(seen[0]) === J([0, 0, 0]) && J(seen[1]) === J([0.6, -0.3, 0]), J(seen));
    const src = fs.readFileSync(new URL("./subAquariumSim.mjs", import.meta.url), "utf8"), loop = src.slice(src.indexOf("while (left > 1e-9)"), src.indexOf("if (ev) sub.eventT += dt;"));
    ok("!! the step loop hands the same current to the pilot, the needs model and the physics, and no hard zero is left there", (loop.match(/current \|\| STILL/g) || []).length === 3 && !/\[0, 0, 0\]/.test(loop) && /N\.stepNeeds\(model, s, sub\.needs, cmd, dt, current \|\| STILL/.test(loop) && /S\.stepSub\(model, s, cmd, dt, current \|\| STILL/.test(loop));
}

sec("5. THE PAGE");
{
    const page = fs.readFileSync(new URL("../sub-aquarium.html", import.meta.url), "utf8");
    const speeds = [...(page.match(/<select id="curSpeed">([\s\S]*?)<\/select>/) || ["", ""])[1].matchAll(/value="([\d.]+)"/g)].map((m) => Number(m[1]));
    ok("!! a current picker, OFF selected by default, speeds up to CURRENT_MAX, four plan-view directions (right is +x, down is +y)", /<option value="0" selected>off<\/option>/.test(page) && speeds[0] === 0 && Math.max(...speeds) === A.CURRENT_MAX && /right: \[1, 0\], left: \[-1, 0\], down: \[0, 1\], up: \[0, -1\]/.test(page));
    ok("!! the picker is wired: both selects call applyCurrent, which sets [v x dx, v x dy] or null", /\$\("curSpeed"\)\.onchange = applyCurrent; \$\("curDir"\)\.onchange = applyCurrent;/.test(page) && /tank\.setCurrent\(v > 0 \? \[v \* d\[0\], v \* d\[1\]\] : null\)/.test(page));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exitCode = fails ? 1 : 0;
