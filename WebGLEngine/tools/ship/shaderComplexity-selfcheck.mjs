#!/usr/bin/env node
// WebGLEngine/tools/ship/shaderComplexity-selfcheck.mjs -- v4299 (Level 11)
//
// GRADES render/shaderComplexity.mjs: SHADER COMPLEXITY AS AN ENCODED SCALE, AND ORDERINGS DERIVED FROM IT.
//
// The claim is not that the score is a millisecond. It is that (1) the scale moves the way cost moves -- a
// sample outweighs an add, sixteen trips outweigh four, nested loops multiply -- (2) the same effect in two
// languages lands in the same class, and (3) an ordering built from it is the SAME whatever order the inputs
// arrive in, which is the property a typed list cannot have and the whole reason to derive one.
"use strict";
import { complexityOf, classOf, orderByComplexity, tripCount, describe, WEIGHTS, UNKNOWN_TRIPS } from "../../render/shaderComplexity.mjs";
import { FRAGMENT_WGSL, PROBE_WGSL } from "../../render/badTvWgsl.mjs";
import { FRAGMENT_GLSL } from "../../render/badTvDevicePass.mjs";
import { RENDER_WGSL, cullLodWgsl, cullProbeWgsl, rankLods, quadMesh } from "../../render/gpuDriven.mjs";
import * as B from "../../render/bloomFused.mjs";
import * as PT from "../../physics/render/pathTracerWgsl.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sc = (src, o) => complexityOf(src, o).score;

console.log("\n1. THE SCALE MOVES THE WAY COST MOVES");
{
    const flat = "fn fs() -> vec4<f32> { return vec4<f32>(1.0); }";
    ok("a shader that returns a constant scores 0, class 0", sc(flat) === 0 && classOf(0) === 0, describe(complexityOf(flat)));
    const add = "fn fs() { x = a + b; }", samp = "fn fs() { x = textureSample(t, s, uv); }";
    ok("one texture sample outweighs one add", sc(samp) > sc(add), `${sc(samp)} vs ${sc(add)} (weights ${WEIGHTS.sample}:${WEIGHTS.alu})`);
    const l4 = "fn fs() { for (var i = 0u; i < 4u; i++) { x = x + sin(x); } }", l16 = l4.replace("4u;", "16u;");
    const nested = "fn fs() { for (var i = 0u; i < 4u; i++) { for (var j = 0u; j < 4u; j++) { x = x + sin(x); } } }";
    // The header (`i++`) is work too and runs once per trip of the ENCLOSING loop, so the relations are
    // stated with it rather than around it: score = header + trips * body, nested = header + 4 * (inner).
    const h = sc("fn fs() { for (var i = 0u; i < 4u; i++) { } }"), body = sc("fn fs() { x = x + sin(x); }");
    ok("*** sixteen trips cost four times four trips, and 4x4 nested is four inner loops ***",
        sc(l4) === h + 4 * body && sc(l16) === h + 16 * body && sc(nested) === h + 4 * sc(l4),
        `header ${h}, body ${body}: 4 -> ${sc(l4)}  16 -> ${sc(l16)}  4x4 -> ${sc(nested)}`);
    const unk = "fn fs() { for (var i = 0u; i < n; i++) { x = x + sin(x); } }";
    ok(`a loop with no literal bound is assumed ${UNKNOWN_TRIPS} trips, not free`, sc(unk) === sc(l4.replace("4u;", UNKNOWN_TRIPS + "u;")) && complexityOf(unk).counts.unknownLoops === 1);
    ok("  tripCount reads <, <= and a start value", tripCount("for (var i = 2u; i < 6u; i++)").trips === 4 && tripCount("for (int i = 0; i <= 3; ++i)").trips === 4 && tripCount("while (x)").literal === false);
    const commented = "fn fs() { /* textureSample(a,b,c) sin(x) */ // for (var i = 0u; i < 99u; i++) { pow(x, y) }\n return 1.0; }";
    ok("comments and strings do not count as work", sc(commented) === 0, describe(complexityOf(commented)));
    ok("  and `->` is not an arithmetic operator", sc("fn fs() -> f32 { return x; }") === 0);
    ok("GLSL scores the same way: `x += sin(x)` over 4 trips equals the WGSL loop exactly", sc("void main() { for (int i = 0; i < 4; ++i) { x += sin(x); } }") === sc(l4),
        `${sc("void main() { for (int i = 0; i < 4; ++i) { x += sin(x); } }")} vs ${sc(l4)}`);
    ok("  and a GLSL loop of 4 costs less than one of 16", sc("void main() { for (int i = 0; i < 4; ++i) { x += sin(x); } }") < sc("void main() { for (int i = 0; i < 16; ++i) { x += sin(x); } }"));
}

console.log("\n2. THE TREE'S OWN PAIR LANDS IN ONE CLASS");
{
    const w = complexityOf(FRAGMENT_WGSL, { entry: "fs" }), g = complexityOf(FRAGMENT_GLSL, { entry: "main" });
    ok("*** badTv's WGSL fragment and GLSL fragment share a class ***", w.class === g.class, `wgsl ${describe(w)} | glsl ${describe(g)}`);
    ok("  both reach the simplex noise the effect is made of", w.reached.includes("snoise2") && g.reached.includes("snoise2"), `wgsl reaches ${w.reached.join(",")}`);
    ok("  the vertex stage of the same module is cheaper than its fragment stage", complexityOf(FRAGMENT_WGSL, { entry: "vs" }).score < w.score);
    const r = complexityOf(RENDER_WGSL, { entry: "fs" }), c = complexityOf(cullLodWgsl(), { entry: "main" });
    ok("gpuDriven's fragment stage is trivial and its cull pass is not", r.class <= 1 && c.class > r.class, `fs ${describe(r)} | cull ${describe(c)}`);
    ok("  the cull pass counts its loops and its atomic", c.counts.loops >= 2 && c.counts.atomic >= 1);
    report("the score is RELATIVE. That two classes agree says the two texts do the same amount of the same kinds of work, which is what a port should be.");
}

console.log("\n3. THE ORDERING IS DERIVED: SHUFFLE THE INPUTS, GET THE SAME RANKS");
{
    const shaders = [
        { id: "bloomFused", src: B.fusedWgsl() }, { id: "badTv.fs", src: FRAGMENT_WGSL }, { id: "badTv.probe", src: PROBE_WGSL },
        { id: "pathTracer.lcg", src: PT.lcgWgsl() }, { id: "gpuDriven.render", src: RENDER_WGSL }, { id: "gpuDriven.cull", src: cullLodWgsl() },
        { id: "gpuDriven.probe", src: cullProbeWgsl() }, { id: "flat", src: "fn fs() -> vec4<f32> { return vec4<f32>(1.0); }" },
    ];
    const rank = (list) => orderByComplexity(list, (x) => x.src, (x) => x.id).map((r) => r.item.id).join(" > ");
    const base = rank(shaders);
    let seed = 7, same = 0;
    const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
    for (let t = 0; t < 20; t++) { const sh = shaders.slice().sort(() => rnd() - 0.5); if (rank(sh) === base) same++; }
    ok("*** twenty shuffles of eight shaders produce one ordering ***", same === 20, `${same}/20 identical`);
    report("derived: " + base);
    ok("  flat is last and something with a loop is first", /flat$/.test(base) && !/^flat/.test(base));
    const twins = [{ id: "b", src: "fn fs() { x = a + b; }" }, { id: "a", src: "fn fs() { x = a + b; }" }];
    ok("  equal scores break ties by name, so the order is total", rank(twins) === "a > b" && rank(twins.slice().reverse()) === "a > b");
    // a sabotage this file can run on itself: a typed order disagrees with the derived one and is caught
    const typed = shaders.map((x) => x.id).join(" > ");
    ok("CONTROL: the typed (declaration) order is NOT the derived order, so deriving changed something", typed !== base);
}

console.log("\n4. THE LOD LADDER USES IT: LOD 0 IS THE MOST EXPENSIVE LEVEL HOWEVER THE LEVELS ARRIVE");
{
    const lods = [{ name: "coarse", mesh: quadMesh(1) }, { name: "fine", mesh: quadMesh(8) }, { name: "mid", mesh: quadMesh(3) }];
    const a = rankLods(lods, [0.01, 0.05]), b = rankLods(lods.slice().reverse(), [0.05, 0.01]);
    ok("*** the same levels in reverse order rank identically ***", a.lods.map((l) => l.name).join(",") === b.lods.map((l) => l.name).join(","), a.lods.map((l) => `${l.name}(${l.cost})`).join(" > "));
    ok("  LOD 0 is the finest mesh", a.lods[0].name === "fine" && a.lods[0].rank === 0);
    ok("  thresholds come back DESCENDING whatever order they were typed in", a.thresholds.join(",") === "0.05,0.01" && b.thresholds.join(",") === "0.05,0.01");
    ok("  a level count that does not match its thresholds is refused by name", (() => { try { rankLods(lods, [0.5]); return false; } catch (e) { return /need 2 thresholds/.test(e.message); } })());
    const heavy = { name: "heavy", mesh: quadMesh(1), shader: "@fragment fn fs() -> @location(0) vec4<f32> { var x = 0.0; for (var i = 0u; i < 64u; i++) { x = x + sin(x); } return vec4<f32>(x); }" };
    const c = rankLods([lods[0], heavy], [0.02]);
    ok("  a level whose SHADER is expensive outranks one whose MESH is, at equal triangles", c.lods[0].name === "heavy", c.lods.map((l) => `${l.name}(${l.cost})`).join(" > "));
}

console.log("\n5. WHAT IS STILL TYPED");
{
    const aqc = fs.readFileSync(path.join(ENG, "ai/AutoQualityController.js"), "utf8");
    const typed = /TIER_ORDER\s*=\s*\[/.test(aqc);
    report(typed ? "ai/AutoQualityController.js still types TIER_ORDER by hand (v643). Its tiers are knob SETS (bloom on/off), not shaders, so this scale does not yet reach it -- named here so it is a known remainder rather than a forgotten one."
                 : "ai/AutoQualityController.js no longer types TIER_ORDER");
}

// =============================================================================================================
// SABOTAGE LOG -- each applied, gate run, exit code read, restored. MEASURED at Level 11.
//   A  loop multiplier dropped (trips treated as 1) -> exit=1, 3 red: "sixteen trips cost four times four" red
//      with 4 -> 10, 16 -> 10, 4x4 -> 11, the unbounded-loop line red, and the GLSL 4-vs-16 line red.
//      Section 4 stays green: rankLods' meshes differ by triangles, so the ladder does not need the multiplier
//      to order them -- which is why section 1 exists.
//   B  sort key reversed in orderByComplexity (cheapest first) -> exit=1, 1 red: "flat is last" in section 3.
//      Section 4 stays green because rankLods sorts on its own cost, not through orderByComplexity; a reversal
//      there would be a second sabotage, and the shuffle check would still pass on a consistently wrong order --
//      determinism is not correctness, and only the "flat is last" line says which way is up.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: THAT THE SCORE PREDICTS TIME. It is a static count with textbook weights, encoded on a " +
    "log2 scale so that only doublings separate classes. tools/ship/webgpuHarness.mjs could time the corpus on " +
    "SwiftShader, and SwiftShader's ratios are not a GPU's. The claim made is ordering, and it is made only at the " +
    "class level.");
process.exit(fails ? 1 : 0);
