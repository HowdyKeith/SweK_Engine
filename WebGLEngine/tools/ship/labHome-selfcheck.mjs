// tools/ship/labHome-selfcheck.mjs -- v4585
//
// THE PHYSICS LAB'S FRONT DOOR, GRADED ON ITS DERIVATION. Task 71 asked for a plain landing page anyone can open: one
// Initiate button, a 2D live view of what the engine is doing (which scene, which proposer, the adjudicator's verdicts
// as they land) with the 3D GPU Brain view a click away, the curated presets as buttons, and under each a plain line
// naming what the Physics AI pulls from -- the instrument, its key, the device or peer that runs it -- gated on the
// page's data derivation headless. lab-home.html is that page and physics/labHome.mjs is the derivation, so this gate
// runs the derivation against the LIVE proposer registry (proposers.mjs + knobRegistry.registerAll, the same join the
// bridge's /roundhouse/lab-scenes serves), the curated presets, the instrument registry and a routing ledger, and holds
// every line to the records it came from. Then it smokes the page in the harness's browser, where no bridge answers,
// and reads that the page says so rather than inventing a registry.
//
// v4586 -- the 12 untriaged scenes named below were triaged that round (physics/labScenes.mjs), four of them registered
// (black-hole, neutron-star, impact, hologram), so section A's "untriaged" check is now vacuous by design and the door
// shows 25 triaged and 9 registered; the finding stands as the history of why the check exists.
// FOUND WHILE BUILDING IT: physics/labPresets.js's header says physicsLab-selfcheck.mjs runs each preset; no gate in the
// tree imports labPresets (there is no physicsLab-selfcheck.mjs). This gate is the first to hold the presets to the
// scene triage, and it found every curated preset naming a triaged scene and NONE naming the race, which is why the
// door adds a button per registered scene the presets miss. Said plainly: the proposer runs in the bridge's node
// process for every scene, and the race is the only scene whose work the v4584 ledger routes to named peers.
//
// SABOTAGES (each restored):
//   A  presetButtons drops the registry's extra button     -> 1 red, by name (the race unreachable from the door)
//   B  sourcesLine names the instrument without its gate    -> 5 red, one per registered scene's line
//   C  liveStrip reports the oldest verdict first           -> 1 red, by name (newest first)
//   D  lab-home.html loses the brain-3d link                -> 1 red, by name (the 3D view one click away)
//   E  whereItRuns names the race's peers with no ledger    -> 1 red, by name (no peer named without the ledger)
//   The gate reached its verdict line under every sabotage; none crashed.
//
// Run: node tools/ship/labHome-selfcheck.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import * as H from "../../physics/labHome.mjs";
import { PRESETS } from "../../physics/labPresets.js";
import { INSTRUMENTS } from "../../physics/instruments.mjs";
import * as L from "../../physics/labScenes.mjs";
import * as P from "../../physics/proposers.mjs";
import * as K from "../../physics/knobRegistry.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);
const read = (f) => fs.readFileSync(path.join(ENG, f), "utf8");

P.resetRegistry(); K.registerAll();
const proposers = P.listProposers(), scenes = L.joinRegistered(proposers);
const registered = scenes.filter((r) => r.registered);
const LEDGER = { summary: { peers: [{ id: "gate-fast", gpu: "RTX-gate", count: 5, kinds: { train: 3, race: 2 }, last: { what: "race seed 1 / policy log / ticks 0..300" } },
                                    { id: "gate-field", gpu: "x", count: 2, kinds: { field: 2 }, last: { what: "field world / policy solve / ticks 0..1" } }] } };

sec("A. *** THE PRESETS BECOME BUTTONS, JOINED TO THE TRIAGE; A REGISTERED SCENE NO PRESET NAMES GETS ONE ***");
{
    const b = H.presetButtons(PRESETS, scenes);
    ok("one button per curated preset, in the curated order, each naming its scene", b.slice(0, PRESETS.length).every((x, i) => x.preset && x.label === PRESETS[i].name && x.scene === PRESETS[i].scene), b.length + " buttons");
    // FOUND: 12 of the 25 curated presets name scenes labScenes.SCENE_TRIAGE never assessed (pendulum-wave through hologram,
    // the scenes added after v3587's triage). That is a fact about the triage, not the door: the door's job is to SAY it,
    // so those buttons are disabled and their line reads "not assessed" rather than implying an instrument.
    const untriaged = [...new Set(b.filter((x) => x.eligible === "untriaged").map((x) => x.scene))];
    ok("!! every curated preset whose scene the triage never assessed is disabled and its line says 'not assessed' (a fact reported, not hidden)",
        b.filter((x) => x.eligible === "untriaged").every((x) => !x.registered && /not assessed/.test(H.sourcesLine(x.scene, scenes, proposers, INSTRUMENTS).text)),
        untriaged.length + " untriaged scenes: " + untriaged.join(", "));
    const extra = b.filter((x) => !x.preset);
    ok("!! *** every registered scene is reachable: the ones no preset names (the race) get a button of their own, marked ***",
        registered.every((r) => b.some((x) => x.scene === r.scene && x.registered)) && extra.every((x) => /from the registry/.test(x.label) && x.registered),
        extra.map((x) => x.label).join(", ") || "none needed");
    ok("a button is enabled exactly when its scene has a registered proposer", b.every((x) => x.registered === !!(H.sceneRow(scenes, x.scene) || {}).registered), b.filter((x) => x.registered).length + " of " + b.length + " enabled");
    report(`${PRESETS.length} presets, ${scenes.length} triaged scenes, ${registered.length} registered (${registered.map((r) => r.scene).join(", ")}), ${b.length} buttons`);
}

sec("B. *** EVERY SOURCES LINE NAMES THE INSTRUMENT, ITS KEY AND WHERE IT RUNS -- OR WHY NOTHING RUNS ***");
{
    for (const r of registered) {
        const s = H.sourcesLine(r.scene, scenes, proposers, INSTRUMENTS, LEDGER), inst = INSTRUMENTS.find((i) => i.id === r.instrument);
        ok(`${r.scene}: registered; instrument ${r.instrument} is in the registry and the line carries its gate, the proposer, the knob and the key's first sentence`,
            s.registered && !!inst && s.instrument === inst.id && s.gate === inst.gate && s.text.includes(inst.gate) && s.text.includes("proposer " + r.proposerIds.join("+")) && s.text.includes("knob " + r.knob) && s.key.length > 20 && s.text.includes(s.key),
            s.text.slice(0, 160));
    }
    const race = H.sourcesLine("race", scenes, proposers, INSTRUMENTS, LEDGER);
    ok("!! *** the race's line names the peers the routing ledger attributes its training and race ticks to, and not the field-only peer ***",
        race.registered && race.where.peers.join(",") === "gate-fast" && /gate-fast \(RTX-gate, 3 training, 2 race\)/.test(race.text) && /last: race seed 1/.test(race.text) && !/gate-field/.test(race.text), race.where.line);
    const raceNone = H.sourcesLine("race", scenes, proposers, INSTRUMENTS, null);
    ok("...and with no ledger it says none routed yet, naming no peer", raceNone.where.peers.length === 0 && /no training or race ticks routed yet/.test(raceNone.text));
    const pile = H.sourcesLine("pile", scenes, proposers, INSTRUMENTS, LEDGER);
    ok("a scene the bridge runs in-process says so and names no peer", pile.where.peers.length === 0 && /this hub's node process/.test(pile.text) && !/gate-fast/.test(pile.text));
    const cand = scenes.find((r) => r.eligible === "candidate" && !r.registered), ref = scenes.find((r) => r.eligible === "refused");
    if (cand) ok(`${cand.scene}: a candidate with no adjudicator says so and runs nothing`, !H.sourcesLine(cand.scene, scenes, proposers, INSTRUMENTS).registered && /no adjudicator/.test(H.sourcesLine(cand.scene, scenes, proposers, INSTRUMENTS).text));
    else report("every candidate scene is registered today; the no-adjudicator branch is exercised on a synthetic row");
    const synth = H.sourcesLine("synth", [{ scene: "synth", knob: "k", eligible: "candidate", registered: false, proposerIds: [], key: "a key" }], [], INSTRUMENTS);
    ok("a candidate row with no proposer reads 'no adjudicator has been written'", !synth.registered && /no adjudicator/.test(synth.text));
    ok(`${ref.scene}: a refused scene carries the triage's own reason, in its words`, !H.sourcesLine(ref.scene, scenes, proposers, INSTRUMENTS).registered && H.sourcesLine(ref.scene, scenes, proposers, INSTRUMENTS).text.includes(H.firstSentence(ref.reason || ref.key)));
    ok("an unknown scene is said to be unassessed, not invented", /not assessed/.test(H.sourcesLine("nope", scenes, proposers, INSTRUMENTS).text));
    const door = H.doorLine(scenes, proposers);
    ok("the door's sentence names the first registered scene, its proposer and knob, the registered count, and that it PROPOSES only", door.scene === registered[0].scene && door.text.includes(registered[0].proposerIds.join("+")) && door.text.includes("knob " + registered[0].knob) && door.text.includes(registered.length + " scene") && /never applies/.test(door.text), door.text.slice(0, 140));
    ok("with nothing registered the door says it has nothing to run", H.doorLine([], []).scene === null && /nothing to run/.test(H.doorLine([], []).text));
}

sec("C. *** THE LIVE STRIP FROM A REAL RUN: THE SCENE, THE PROPOSER'S PICK, THE VERDICTS NEWEST FIRST, THE OUTCOME ***");
{
    const id = "gyro-spin", p = P.getProposer(id); if (p.ready) await p.ready();
    const t0 = Date.now(), r = P.runProposer(id), ms = Date.now() - t0;
    const runJson = { ok: true, scene: "gyroscope", knob: "omega", applied: false, runs: [{ id, tier: r.tier, knobs: p.knobs, notes: p.notes, ms, tried: r.tried, adjudicated: r.adjudicated,
        greedy: r.best, greedyScore: r.bestScore, greedyVerdict: r.verdict, accepted: r.accepted, acceptedRank: r.acceptedRank, acceptedVerdict: r.acceptedVerdict,
        scored: r.scored.map((s) => ({ candidate: s.candidate, score: s.score, pass: s.verdict ? s.verdict.pass : null })) }] };
    const strip = H.liveStrip(runJson, H.sceneRow(scenes, "gyroscope"));
    ok("the strip names the scene, its knob and its key", strip.ok && strip.scene.id === "gyroscope" && strip.scene.knob === "omega" && /PRECESSION/.test(strip.scene.key));
    ok("the proposer column names the proposer, what it proposed and whether the search's own pick was refused", strip.proposer.id === id && strip.proposer.proposed === r.best && strip.proposer.proposedVerdict === (r.verdict.pass ? "accepted" : "refused") && strip.proposer.tried === r.tried);
    ok("!! *** the verdicts are the adjudicated candidates, NEWEST FIRST, each accepted or refused by name ***",
        strip.verdicts.length === r.adjudicated && strip.verdicts[0].rank === r.adjudicated && strip.verdicts[strip.verdicts.length - 1].rank === 1 && strip.verdicts.every((v) => v.word === (v.pass ? "accepted" : "refused")),
        strip.verdicts.map((v) => v.rank + ":" + v.word[0]).join(" "));
    ok("the outcome names the accepted value and its rank, and the strip says nothing was applied", (r.accepted === null ? /no candidate survived/.test(strip.outcome) : strip.outcome.includes("= " + r.accepted) && strip.outcome.includes("rank " + (r.acceptedRank + 1))) && strip.applied === false, strip.outcome);
    const refused = H.liveStrip({ ok: false, error: "no-proposer", message: "no adjudicator" }, H.sceneRow(scenes, "balloon"));
    ok("a refusal from the route is rendered as one, not swallowed", !refused.ok && refused.scene.id === "balloon" && /no proposer: no adjudicator/.test(refused.outcome) && refused.verdicts.length === 0);
    ok("an unknown-scene refusal and a failed request are told apart", /unknown scene/.test(H.liveStrip({ ok: false, error: "unknown-scene" }).outcome) && /request failed/.test(H.liveStrip(null).outcome));
    report(`${id}: ${r.tried} candidates, ${r.adjudicated} adjudicated in ${ms} ms; ${strip.outcome}`);
}

sec("D. *** THE PAGE HOLDS NO FACTS: IT IMPORTS THE DERIVATION, READS THE LIVE ROUTES, LINKS THE 3D VIEW ***");
{
    const page = read("lab-home.html");
    ok("lab-home.html imports physics/labHome.mjs, labPresets and instruments, and derives every band through them", /from "\.\/physics\/labHome\.mjs"/.test(page) && /labPresets\.js/.test(page) && /instruments\.mjs/.test(page) && /H\.presetButtons\(/.test(page) && /H\.sourcesLine\(/.test(page) && /H\.doorLine\(/.test(page) && /H\.liveStrip\(/.test(page));
    ok("it reads the same routes physics-lab.html's Initiate uses, and the routing ledger", /\/roundhouse\/lab-scenes/.test(page) && /\/roundhouse\/lab-scene-run\?scene=/.test(page) && /\/ai\/brain\/routed/.test(page));
    ok("!! the 3D GPU Brain view is one click away", /href="\/brain-3d\.html"/.test(page) && fs.existsSync(path.join(ENG, "brain-3d.html")));
    ok("one Initiate button, and the page says it proposes and never applies", (page.match(/id="initiate"/g) || []).length === 1 && /PROPOSED, NOT APPLIED/.test(page));
    ok("the page's own text is ASCII (entities for the dashes)", !/[^\x00-\x7F]/.test(page));
}

sec("E. *** THE PAGE IN A BROWSER WITH NO BRIDGE: IT LOADS, PAINTS THE PRESETS, AND SAYS THE BRIDGE IS UNREACHABLE ***");
{
    const skip = webgpuSkipReason();
    if (skip) ok("the harness browser", false, "skipped: " + skip);
    else {
        const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 60000, script: `async () => {
            const f = document.createElement("iframe"); f.style.width = "1000px"; f.style.height = "800px"; f.src = "/lab-home.html"; document.body.appendChild(f);
            const t0 = performance.now(); let d = null;
            while (performance.now() - t0 < 20000) { await new Promise((r) => setTimeout(r, 200)); d = f.contentDocument; const el = d && d.getElementById("doorLine"); if (el && /bridge not reachable|Initiate/.test(el.textContent) && d.querySelectorAll("#presets .preset").length) break; }
            const txt = (id) => { const el = d && d.getElementById(id); return el ? el.textContent : ""; };
            return { door: txt("doorLine"), presets: d ? d.querySelectorAll("#presets .preset").length : 0, enabled: d ? d.querySelectorAll("#presets button:not([disabled])").length : 0,
                     firstSrc: d && d.querySelector("#presets .src") ? d.querySelector("#presets .src").textContent : "", initiateDisabled: d && d.getElementById("initiate") ? d.getElementById("initiate").disabled : null, ms: performance.now() - t0 };
        }` });
        if (!r.ok) ok("the page loaded in the harness browser", false, r.reason || (r.pageErrors || []).join(" | "));
        else {
            const p = r.result;
            ok("the page loaded, and with no bridge it says the bridge is unreachable rather than inventing a registry", /bridge not reachable/.test(p.door), p.door.slice(0, 120));
            ok(`the presets band painted every curated preset (${p.presets}), all disabled, each with its sources line`, p.presets === PRESETS.length && p.enabled === 0 && /not assessed|not run/.test(p.firstSrc) && p.initiateDisabled === true, `${p.presets} presets, ${p.enabled} enabled, in ${p.ms.toFixed(0)} ms`);
        }
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
for (const l of H.reportLines()) console.log("  " + l);
// v4661 -- process.exitCode, NOT process.exit: this gate compiles a wasm module, and exiting while V8's
// background compiler still has work posts a task into a torn-down platform. tools/ship/wasmTeardown.mjs.
process.exitCode = fails ? 1 : 0;
