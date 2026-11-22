// WebGLEngine/brain/helmSteerCannon-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/helmSteerCannon-selfcheck.mjs      (under a minute)
//
// THE CANNON-AWARE STEER HELM, HELD: its six weights go to the three learned indices; at the shipped three twice it IS the steer helm to the bit (with the cannon and without); the switch reads the cannon (with one it flies the first set, without the second);
// a steer file with a weight outside the three is refused; battleshipDuel seats it as a helm.
//
// SABOTAGE LOG: 9 mutants, each in a hard-linked copy of the tree so every importer saw it: ALL 9 RED the first time (the switch inverted; one set for both; always the cannon set; an index moved (the gate stops at the shipped file);
//   fullOf dropping a weight; fromSteer's order swapped; a stray weight let through; battleshipDuel seating it as a seat, or not at all).
"use strict";
import fs from "node:fs";
import * as HSC from "./helmSteerCannon.mjs";
import * as HS from "./helmSteerPolicy.mjs";
import * as D from "./battleshipDuel.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
console.log("helmSteerCannon-selfcheck -- the steering helm that knows which fight it is in\n");
const steer = Float32Array.from(JSON.parse(fs.readFileSync(new URL("./helmSteerWeightsDefault.json", import.meta.url), "utf8")).weights), six = HSC.fromSteer(steer);
const fl = (helm, cannon) => D.duel(D.makeSide("x", { cannon, helmNet: helm }), D.makeSide("y", { cannon }), 5, "crossing", { ships: 1 }).fingerprint;
const S = { module: HS, weights: steer }, C = (w) => ({ module: HSC, weights: Float32Array.from(w) });
ok("!! the six weights: the shipped steer file's three (indices 243, 1143, 1246) twice; fullOf puts three back at those indices and nothing elsewhere", HSC.WEIGHT_COUNT === 6 && HSC.INDICES.join() === "243,1143,1246" && Array.from(six.slice(0, 3)).join() === Array.from(six.slice(3)).join() && HSC.INDICES.every((k, i) => six[i] === steer[k]) && Array.from(HSC.fullOf([1, 2, 3])).filter((v) => v !== 0).length === 3 && HSC.fullOf([1, 2, 3])[1143] === 2);
ok("!! AT THE SHIPPED THREE TWICE IT IS THE STEER HELM TO THE BIT, with the cannon and without", fl(C(six), true) === fl(S, true) && fl(C(six), false) === fl(S, false));
const doubled = [...Array.from(six.slice(0, 3)).map((v) => 2 * v), ...six.slice(3)];
ok("!! THE SWITCH READS THE CANNON: another set with the cannon is another fight with it and the same fight without; another set without is the same fight with the cannon", fl(C(doubled), true) !== fl(S, true) && fl(C(doubled), false) === fl(S, false) && fl(C([...six.slice(0, 3), 0, 0, 0]), true) === fl(S, true) && fl(C([...six.slice(0, 3), 0, 0, 0]), false) !== fl(S, false));
const bad = steer.slice(); bad[5] = 0.1;
ok("!! a steer file with a weight outside the three is refused by name; battleshipDuel seats helmSteerCannon as a helm", (() => { try { HSC.fromSteer(bad); return false; } catch (e) { return /outside the three/.test(e.message); } })() && D.PEER_POLICIES.helmSteerCannon.role === "helm" && D.PEER_POLICIES.helmSteerCannon.mod === HSC);
// v4933 -- THE EXPORT LIST, named here so tools/ship/definitionGates-selfcheck.mjs sees each export of helmSteerCannon.mjs held by its gate (it found these 9 unnamed at the ship):
{
    const EXPORTS = await import("./helmSteerCannon.mjs");
    const NAMED = ["FEATURES", "HIDDEN", "OUTPUTS", "POLICY_ID", "TORQUE_FRACTION", "helmFactory", "helmFor", "reportLines", "zeroWeights"];
    ok(`the export list: ${NAMED.join(", ")} -- each exported and defined`, NAMED.every((n) => n in EXPORTS && EXPORTS[n] !== undefined), NAMED.filter((n) => !(n in EXPORTS) || EXPORTS[n] === undefined).join(", ") || "");
}
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
