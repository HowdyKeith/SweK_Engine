// WebGLEngine/render/subAquariumLabel-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node render/subAquariumLabel-selfcheck.mjs      (about a second)
//
// THE GATE OF render/subAquariumLabel.mjs AND OF THE PAGE'S FISH KIND (nextRounds fly-kind-peer-registration and fish-pilot-tank-kind, 2026-11-17).
//   1 LABELS    each case of pilotLabel on hand records: a seated kind by name, a refused kind with its reason, a sub waiting for its kind, a gfc network, the autopilot.
//   2 THE TANK  a real tank: a fish sub synced before the fish kind is registered is `waiting` and labelled so; registering fishKind seats it ("zebrafish"); a builder that throws
//               says so; a gfc network and the autopilot read as before.
//   3 THE PAGE  sub-aquarium.html imports the label module and labels every row with it, and registers the fish kind at load.
// NOT CHECKED, said plainly: the page in a real browser (the row text is built from these strings; nobody has looked at it here).
// SABOTAGE LOG (9 mutants, each alone, restored byte-identical, sha-256 checked): the fish named "fish" (2 red), a refused kind unnamed (2), the waiting line dropped (2),
//   "network" for any circuit (1), waiting ignoring kindError (1), waiting for every unseated sub (1), the page's old label (1), the page not registering the fish kind (1),
//   the bridge's fish count 802 (4, with ai-bridge/subAquariumCore-selfcheck.mjs). All red by name. While writing it: my first fixture called a sub with pilot "network" and no
//   weights the autopilot; the label (and the old row) call it "network", so the fixture was wrong, not the label.
"use strict";
import fs from "node:fs";
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
import * as L from "./subAquariumLabel.mjs";
import * as A from "./subAquariumSim.mjs";
import * as F from "./subAquariumFish.mjs";
const t0 = Date.now();
console.log("subAquariumLabel-selfcheck -- what flies a sub, said in its row\n");

sec("1. LABELS");
ok("!! a seated kind by its name: flycx 'stateful', fish 'zebrafish', any other kind its circuit", L.pilotLabel({ kind: "flycx" }) === "stateful" && L.pilotLabel({ kind: "fish" }) === "zebrafish" && L.pilotLabel({ kind: "plain14" }) === "plain14");
ok("!! a refused kind says the autopilot flies it and why (the circuit and the first 60 characters of the reason)", L.pilotLabel({ kind: null, circuit: "fish", kindError: "the fish circuit takes exactly 803 weights, got 802" }) === "PD autopilot (fish refused: the fish circuit takes exactly 803 weights, got 802)" &&
    L.pilotLabel({ kind: null, circuit: "x", kindError: "e".repeat(90) }).length === "PD autopilot (x refused: )".length + 60);
ok("!! a sub waiting for its kind says so, with its circuit", L.pilotLabel({ kind: null, circuit: "flycx", waiting: true, pilot: "stateful" }) === "PD autopilot, waiting for its kind (flycx)");
ok("!! a gfc network reads 'network'; the autopilot, and a non-gfc sub neither seated nor waiting, read 'PD autopilot' as before", L.pilotLabel({ kind: null, pilot: "network", circuit: "gfc" }) === "network" && L.pilotLabel({ kind: null, pilot: "network" }) === "network" &&
    L.pilotLabel({ kind: null, pilot: "autopilot", circuit: "gfc" }) === "PD autopilot" && L.pilotLabel({ kind: null, pilot: "network", circuit: "fish" }) === "PD autopilot");
ok("!! KIND_NAMES is the frozen { flycx: 'stateful', fish: 'zebrafish' }, and pilotLabel reads every seated kind's label from it", JSON.stringify(L.KIND_NAMES) === JSON.stringify({ flycx: "stateful", fish: "zebrafish" }) && Object.isFrozen(L.KIND_NAMES) && Object.keys(L.KIND_NAMES).every((k) => L.pilotLabel({ kind: k }) === L.KIND_NAMES[k]));

sec("2. THE TANK");
{
    const file = JSON.parse(fs.readFileSync(new URL("../brain/pilotSubWeightsFishWip.json", import.meta.url), "utf8"));
    const entry = (id, extra = {}) => ({ id, name: id, hue: 10, pilot: "network", from: "10.0.0.2", local: true, ...extra });
    const t = A.createTank(), fish = entry("f1", { circuit: "fish", weights: file.weights });
    t.sync([fish, entry("ap", { pilot: "autopilot" }), entry("bad", { circuit: "fish", weights: file.weights.slice(1) })]);
    const snap1 = Object.fromEntries(t.snapshot().map((s) => [s.id, s]));
    ok("!! before the fish kind is registered, the fish sub is `waiting` and its row says 'waiting for its kind (fish)'; the autopilot is not waiting", snap1.f1.waiting === true && snap1.f1.kind === null && L.pilotLabel(snap1.f1) === "PD autopilot, waiting for its kind (fish)" && snap1.ap.waiting === false && L.pilotLabel(snap1.ap) === "PD autopilot");
    t.registerPilotKind(F.CIRCUIT, F.fishKind());
    const snap2 = Object.fromEntries(t.snapshot().map((s) => [s.id, s]));
    ok("!! registering fishKind seats it: kind 'fish', no longer waiting, labelled 'zebrafish'; a fish sub with 802 weights stays on the autopilot, still waiting (the count does not match)", snap2.f1.kind === "fish" && snap2.f1.waiting === false && L.pilotLabel(snap2.f1) === "zebrafish" && snap2.bad.kind === null && snap2.bad.waiting === true);
    const te = A.createTank(); te.registerPilotKind("fish", { weightCount: 803, build() { throw new Error("no circuit here"); } }); te.sync([fish]);
    const s3 = te.snapshot()[0];
    ok("!! a builder that throws leaves the sub refused, not waiting, and the row says why", s3.kind === null && s3.waiting === false && /fish refused: no circuit here/.test(L.pilotLabel(s3)));
}

sec("3. THE PAGE");
{
    const page = fs.readFileSync(new URL("../sub-aquarium.html", import.meta.url), "utf8");
    ok("!! the page imports the label module and every row's pilot text is pilotLabel(s)", /import \* as LBL from "\/render\/subAquariumLabel\.mjs";/.test(page) && /m\.textContent = `\$\{LBL\.pilotLabel\(s\)\} · /.test(page) && !/s\.kind === "flycx" \? "stateful"/.test(page));
    ok("!! the page registers the fish kind at load from render/subAquariumFish.mjs, and says so when it cannot", /const fk = await import\("\/render\/subAquariumFish\.mjs"\);\s*tank\.registerPilotKind\(fk\.CIRCUIT, fk\.fishKind\(\)\);/.test(page) && /the zebrafish pilot is not available here/.test(page));
}

finished = true;
console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)\nnot checked here: the page in a real browser.`);
process.exitCode = fails ? 1 : 0;
