#!/usr/bin/env node
// WebGLEngine/tools/ship/qualityTiers-selfcheck.mjs -- v4299 (Level 12)
//
// GRADES ai/qualityTiers.mjs: THE QUALITY TIERS ORDERED BY DERIVED COST, NOT BY A TYPED ARRAY.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tierOrder, tierCost, KNOB_SHADERS } from "../../ai/qualityTiers.mjs";
import { TIER_KNOBS, deriveTierOrder, currentTierOrder } from "../../ai/AutoQualityController.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const read = (rel) => { try { return fs.readFileSync(path.join(ENG, rel), "utf8"); } catch { return null; } };

console.log("\n1. THE ORDER IS DERIVED FROM THE SHADERS THE KNOBS SWITCH ON");
{
    const src = read("ai/AutoQualityController.js").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    ok("*** AutoQualityController no longer types TIER_ORDER ***", !/TIER_ORDER\s*=\s*\[/.test(src) && /tierOrder\(TIER_KNOBS/.test(src));
    ok("  every knob names the shader file it pulls in, and the file exists", Object.values(KNOB_SHADERS).flat().every((rel) => read(rel) != null), Object.values(KNOB_SHADERS).flat().join(", "));
    const t = tierOrder(TIER_KNOBS, read);
    ok("*** derived: fast is cheapest ***", t.order[0] === "fast", t.rows.map((r) => `${r.name}(${r.score})`).join(" < "));
    ok("  balanced and quality TIE, and the tie is reported rather than hidden", t.ties.length === 1 && t.ties[0].join(",") === "balanced,quality", "their knob sets are identical -- the controller's own header calls the separating knobs future tiers");
    ok("  the derived order equals the one the controller walked for 3,600 rounds", t.order.join() === "fast,balanced,quality", "so nothing changes today, and the day a knob separates the tiers nothing needs retyping");
    const rev = tierOrder(Object.fromEntries(Object.entries(TIER_KNOBS).reverse()), read);
    ok("  the same tiers declared in reverse order rank identically", rev.order.join() === t.order.join());
    ok("  the bloom shader's score is real, not a stand-in", t.rows.find((r) => r.name === "balanced").shaders.every((s) => !s.standIn && s.score > 100), JSON.stringify(t.rows.find((r) => r.name === "balanced").shaders));
}

console.log("\n2. WITHOUT A READER THE ORDER STAYS SANE, AND WITH ONE THE CONTROLLER TAKES IT");
{
    const t0 = tierOrder(TIER_KNOBS, () => null);
    ok("no reader: an ON knob costs one stand-in point, so fast is still first", t0.order[0] === "fast" && t0.rows.every((r) => r.shaders.every((s) => s.standIn)));
    ok("  the controller boots on that fallback", currentTierOrder().join() === "fast,balanced,quality");
    const derived = deriveTierOrder(read);
    ok("  and deriveTierOrder(readShader) installs the measured order", derived.join() === "fast,balanced,quality" && currentTierOrder().join() === derived.join());
    const heavy = { off: { bloom: false }, on: { bloom: true } };
    ok("CONTROL: a knob set with bloom on costs more than one without", tierCost(heavy.on, read).score > tierCost(heavy.off, read).score);
    const main = read("main.js").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    ok("*** main.js fetches the knob shaders and calls deriveTierOrder with them ***", /deriveTierOrder\(\(rel\) => texts\[rel\]/.test(main) && /KNOB_SHADERS\).flat\(\)\.map/.test(main));
}

// SABOTAGE LOG -- MEASURED at Level 12, restored: the sort reversed in tierOrder -> exit=1, 5 red -- fast last
// (balanced(1900) < quality(1900) < fast(0)), the controller's walked order, the no-reader fallback, the boot
// order, and deriveTierOrder's installed order. Reversing the declaration still agrees with itself, correctly.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: THAT THE SCORE TRACKS FRAME TIME on Keith's box -- the controller polls real fps and the " +
    "score is static. The claim is only that the ladder's ORDER is computed from what each rung turns on. Also: " +
    "main.js's fetch-backed derivation is checked as source here, not run -- the page boots on the stand-in order " +
    "until the fetch lands, and both orders are the same three names today.");
process.exit(fails ? 1 : 0);
