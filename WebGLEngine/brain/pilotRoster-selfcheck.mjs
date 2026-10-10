// WebGLEngine/brain/pilotRoster-selfcheck.mjs -- v4829 (beside brain/pilotRoster.mjs and es-box3d-fly3d.html's Load Pilots panel)
//
// Run: node brain/pilotRoster-selfcheck.mjs
//
// GRADES brain/pilotRoster.mjs and es-box3d-fly3d.html's "Load Pilots" panel built on it: for each of the two teams, who flies it -- the scripted AI the demo always flew, or a brain on one of
// several weight sets -- then Start Fight.
//
// Section 1, THE DEFAULT IS THE OLD DEMO: "default for this team" is exactly the line the page had before there was a panel (kept here as the oracle): team A flies the Brain panel's pilot
// when Brain pilot is on -- the imported one, else the shipped default, else the hand weights -- and the scripted AI otherwise, team B is always scripted, in every state the page can be in.
// Section 2, EVERY CHOICE: each id resolves to one weight vector per ship of the right length and all finite, an id nothing holds falls back by name and says so, noise is drawn per ship in
// SHIP order from a seeded stream (ship 3 is the same pilot whatever the fleet size, the two teams do not share a stream), a source the page does not hold is not offered, saved choices are
// sanitised. Section 3, THE CHOICE REACHES THE FIGHT: real duels on the headless substrate with the resolved weights on BOTH sides -- a hand pilot against a zero pilot lands hits and takes none, swapped
// it takes damage and lands none, the same pairing twice is the same fingerprint and swapped is another. Section 4, THE PAGE: es-box3d-fly3d.html in its own browser -- the panel is there with two
// selects, the default lineup is scripted against scripted (brain on: the Brain panel's pilot against scripted), a choice made in a select is the pilot that flies after Start Fight (a zero team turns
// nothing and takes the damage, a hand team turns and deals it), Start Fight rebuilds the battle and clears the tally, an imported pilot is offered and flies, and the choices survive a reload.
//
// SABOTAGE LOG -- v4829, twenty-one, each applied to the file named, the gate run, the file restored. Reds are rows (`grep -c '^  FAIL'`).
//   A  pilotRoster.mjs: team A stays scripted with Brain pilot on                                 3 red (the default-is-the-old-demo rows, in node and in the page)
//   B  pilotRoster.mjs: an unavailable choice is substituted in silence                           1 red (the by-name fallback row)
//   C  pilotRoster.mjs: the zero pilot resolves to the hand weights                               5 red (the every-choice row, the hand-against-zero and zero-against-hand duels, both page fights)
//   D  pilotRoster.mjs: every ship of a noise team gets the SAME noise                            2 red (per-ship, and each-ship-flies-its-own-place)
//   E  pilotRoster.mjs: the two teams share a noise stream                                        1 red (ship order and the two teams)
//   F  pilotRoster.mjs: the Brain panel's pilot prefers the shipped pilot over the imported one   2 red (the order row, and the page's Brain-on label)
//   G  pilotRoster.mjs: every ship flies the first ship's pilot                                   1 red (each ship flies its own place)
//   H  pilotRoster.mjs: 'imported' offered when none is held                                      2 red (not-offered rows, node and page)
//   J  pilotRoster.mjs: team B follows the Brain pilot toggle too                                 2 red (the default rows)
//   K  pilotRoster.mjs: a 200-character saved id is kept                                          1 red (the sanitise row)
//   L  pilotPolicy.mjs: duel() ignores a weight vector as the opponent                            2 red (hand against zero and zero against hand: the opponent is the scripted AI)
//   M  es-box3d-fly3d.html: team B flies the default whatever was chosen                          1 red (the page's hand-against-zero fight)
//   N  es-box3d-fly3d.html: Start Fight does not clear the tally                                  1 red
//   O  es-box3d-fly3d.html: the choices are not saved                                             1 red (the reload row)
//   P  es-box3d-fly3d.html: Default pilots does nothing                                           1 red
//   Q  es-box3d-fly3d.html: the selects are not rebuilt when the shipped pilot arrives            1 red -- *** FOUND BY THE GATE BEFORE THE SABOTAGE: the first draft built the selects once, at load, before the
//      shipped file had been fetched, so the shipped pilot was never offered; pilotLine() now rebuilds them whenever availability changes ***
//   R  es-box3d-fly3d.html: the pilot cache ignores the Brain pilot toggle                        1 red (Brain on never makes team A the Brain panel's pilot)
//   S  es-box3d-fly3d.html: Start Fight does not rebuild the battle                               1 red (the swapped fight starts with team B already hurt from the last one)
//   T  pilotRoster.mjs: choices() ignores ctx.brainPanel === false (the 6DOF page has no Brain panel)   1 red (the no-Brain-panel row)
//   U  pilotRoster.mjs: choices() ignores ctx.scriptedLabel                                       1 red (same row)
//   V  pilotRoster.mjs: resolveTeam() ignores ctx.scriptedName                                    1 red (same row). T-V were added for brain/pilot6dofPolicy-selfcheck.mjs's page and are graded here.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as PP from "./pilotPolicy.mjs";
import * as R from "./pilotRoster.mjs";
import { planarFallbackWorld } from "../physics/planarFallbackWorld.js";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);
const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
const worldFrom = () => planarFallbackWorld();
const shippedW = PP.perturb(PP.handWeights(), 0.2, (() => { let a = 7; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; })());
const importedW = PP.perturb(PP.handWeights(), 0.3, (() => { let a = 11; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; })());
const ctxOf = (o = {}) => ({ PP, shipped: null, imported: null, brainPilotOn: false, ...o });
const N = 6;
// the states the pilot function is read in: a ship, a target off to one side and above, one close and dead ahead
const CASES = [
    [{ x: 0, y: 0, alt: 0, heading: 0, pitch: 0, id: "A#0" }, { x: 600, y: 300, alt: 150, id: "B#0" }],
    [{ x: 0, y: 0, alt: 0, heading: 90, pitch: 0, id: "A#3" }, { x: 150, y: 20, alt: 0, id: "B#0" }],
    [{ x: 0, y: 0, alt: 0, heading: 200, pitch: 0.2, id: "A#5" }, { x: -900, y: 100, alt: -300, id: "B#1" }],
];
const OPTS = { range: 1400, standoff: 160 };
const call = (f, [s, t]) => JSON.stringify(f({ ...s }, { ...t }, OPTS));

sec("1. THE DEFAULT IS THE OLD DEMO, in every state the page can be in");
{
    // the line es-box3d-fly3d.html had before the panel, kept as the oracle: team A on `brainPilotOn ? pilotFor(imported || shipped || hand) : scripted`, team B always scripted
    const legacy = (c) => (c.brainPilotOn ? PP.pilotFor(c.imported || c.shipped || PP.handWeights()) : null);
    let allMatch = true, nStates = 0, detail = [];
    for (const brainPilotOn of [false, true]) for (const imported of [null, importedW]) for (const shipped of [null, shippedW]) {
        const c = ctxOf({ brainPilotOn, imported, shipped }), r = R.resolveRoster(R.defaultSpecs(), c, N), fa = R.teamPilot(r.A, PP), fb = R.teamPilot(r.B, PP), old = legacy(c);
        const a = old === null ? fa === null : fa !== null && CASES.every((k) => call(fa, k) === call(old, k)), b = fb === null;
        nStates++; if (!(a && b && r.problems.length === 0)) { allMatch = false; detail.push(`brain ${brainPilotOn} imported ${!!imported} shipped ${!!shipped}`); }
    }
    ok(`!! with every team on "default for this team" the pilots are the old demo's in all ${nStates} states (Brain pilot on or off x an imported pilot or not x the shipped one or not): team A flies the Brain panel's pilot, call for call, or the scripted AI; team B is scripted`, allMatch && nStates === 8, detail.join("; "));
    const r0 = R.resolveRoster(R.defaultSpecs(), ctxOf(), N), r1 = R.resolveRoster(R.defaultSpecs(), ctxOf({ brainPilotOn: true, shipped: shippedW }), N);
    ok("...named as such: scripted AI / scripted AI with Brain pilot off, and 'shipped pilot brain' on team A with it on", r0.A.scripted && r0.B.scripted && !r1.A.scripted && r1.A.label === "shipped pilot brain" && r1.B.scripted, `${R.describe(r0, N)}  //  ${R.describe(r1, N)}`);
    ok("the same specs, context and fleet give the same pilots twice (a lineup is a function of its inputs)", (() => { const a = R.resolveTeam("A", "noise10", ctxOf(), N), b = R.resolveTeam("A", "noise10", ctxOf(), N); return a.weights.every((w, i) => same(w, b.weights[i])); })());
}

sec("2. EVERY CHOICE THE PANEL CAN OFFER");
{
    const held = ctxOf({ shipped: shippedW, imported: importedW }), ch = R.choices({ shipped: true, imported: true }), bare = R.choices({ shipped: false, imported: false });
    let allFine = true, fineDetail = "";
    for (const c of ch) for (const t of R.TEAMS) {
        const r = R.resolveTeam(t, c.id, held, N);
        const fine = r.problems.length === 0 && (r.scripted ? r.weights === null : r.weights.length === N && r.weights.every((w) => w.length === PP.WEIGHT_COUNT && w.every(Number.isFinite)));
        if (!fine) { allFine = false; fineDetail = `${t} ${c.id}`; }
    }
    ok(`!! all ${ch.length} choices x 2 teams resolve: the scripted AI to no weights, every brain choice to one finite vector of ${PP.WEIGHT_COUNT} per ship, and no problem is raised`, allFine && ch.length === 9, fineDetail || `${ch.length} choices: ${ch.map((c) => c.id).join(",")}`);
    ok("a source the page does not hold is NOT OFFERED: no shipped pilot and no imported one before they exist", !bare.some((c) => c.id === "shipped" || c.id === "imported") && bare.some((c) => c.id === "hand") && bare.some((c) => c.id === "scripted") && bare.length === 7, bare.map((c) => c.id).join(","));
    const ghost = R.resolveRoster({ A: "imported", B: "no-such-pilot" }, ctxOf(), N);
    ok("!! a choice nothing holds (a saved 'imported' when none is held, an unknown id) falls back to the hand pilot AND IS REPORTED BY NAME -- never a silent substitute, never a throw", ghost.problems.length === 2 && /team A.*"imported"/.test(ghost.problems[0]) && /team B.*"no-such-pilot"/.test(ghost.problems[1]) && !ghost.A.scripted && ghost.A.weights.every((w) => same(w, PP.handWeights())), ghost.problems[0]);
    const brainOrder = [R.resolveTeam("A", "brain", ctxOf({ imported: importedW, shipped: shippedW }), 2), R.resolveTeam("A", "brain", ctxOf({ shipped: shippedW }), 2), R.resolveTeam("A", "brain", ctxOf(), 2)];
    ok("the Brain panel's pilot is the imported one, else the shipped default, else the hand weights (what Brain pilot has always flown), and each is the vector itself, not a copy that drifts", brainOrder[0].weights[0] === importedW && brainOrder[1].weights[0] === shippedW && same(brainOrder[2].weights[0], PP.handWeights()));
    const n6 = R.resolveTeam("A", "noise10", ctxOf(), 6), n4 = R.resolveTeam("A", "noise10", ctxOf(), 4), nB = R.resolveTeam("B", "noise10", ctxOf(), 6);
    ok("!! noise is PER SHIP: six ships on 'hand + noise 0.1' fly six different pilots, none of them the hand weights", new Set(n6.weights.map((w) => Array.from(w.slice(0, 40)).join(","))).size === 6 && n6.weights.every((w) => !same(w, PP.handWeights())));
    ok("...drawn in SHIP order from a seeded stream: ship 3 is the same pilot in a fleet of four as in a fleet of six, and the two teams do not share a stream", same(n4.weights[3], n6.weights[3]) && !same(n6.weights[0], nB.weights[0]));
    ok("...and 0.05 differs from 0.1 by a smaller step: the 0.05 pilot sits nearer the hand weights", (() => { const d = (w) => w.reduce((a, v, i) => a + Math.abs(v - PP.handWeights()[i]), 0); return d(R.resolveTeam("A", "noise05", ctxOf(), 1).weights[0]) < d(R.resolveTeam("A", "noise10", ctxOf(), 1).weights[0]); })());
    const six = R.choices({ shipped: false, imported: false, brainPanel: false, scriptedLabel: "PD autopilot" }), sx = R.resolveTeam("B", "scripted", ctxOf({ scriptedName: "PD autopilot" }), N);
    ok("a page with its own scripted pilot and no Brain panel (the 6DOF battle) names it and leaves 'the Brain panel's pilot' out: six choices, the scripted one labelled 'PD autopilot', and the resolved team says so", six.length === 6 && !six.some((c) => c.id === "brain") && six.find((c) => c.id === R.SCRIPTED).label === "PD autopilot" && sx.label === "PD autopilot" && sx.scripted && R.choices({ shipped: false, imported: false }).some((c) => c.id === "brain"), six.map((c) => c.id).join(","));
    const s = R.sanitizeSpecs({ A: "hand", B: 7, extra: "x" });
    ok("saved choices from storage are sanitised: a non-string, an extra key, a 200-character id, a non-object and null all become 'default for this team' or are ignored, two teams always", s.A === "hand" && s.B === R.AUTO && Object.keys(s).length === 2 && R.sanitizeSpecs({ A: "z".repeat(200) }).A === R.AUTO && R.sanitizeSpecs("junk").A === R.AUTO && R.sanitizeSpecs(null).B === R.AUTO && R.sanitizeSpecs([1, 2]).A === R.AUTO);
    const fn = R.teamPilot(R.resolveTeam("A", "noise10", ctxOf(), 6), PP), hand = R.teamPilot(R.resolveTeam("A", "hand", ctxOf(), 6), PP);
    const outs = [0, 1, 2, 3, 4, 5].map((i) => call(fn, [{ ...CASES[0][0], id: "A#" + i }, CASES[0][1]]));
    ok("!! each SHIP flies the weights of its own place on the team: the same state read by ships A#0..A#5 on 'noise' gives six different answers, and on 'hand' the same one", new Set(outs).size === 6 && new Set([0, 1, 2, 3, 4, 5].map((i) => call(hand, [{ ...CASES[0][0], id: "A#" + i }, CASES[0][1]]))).size === 1);
    ok("a ship whose id carries no number flies the first pilot, and one past the end flies the last (a fleet that outgrew its roster is never undefined)", call(fn, [{ ...CASES[0][0], id: "ghost" }, CASES[0][1]]) === outs[0] && call(fn, [{ ...CASES[0][0], id: "A#99" }, CASES[0][1]]) === outs[5]);
}

sec("3. THE CHOICE REACHES THE FIGHT: real duels on the headless substrate, the resolved weights on both sides");
{
    const pair = (a, b, extra = {}) => { const r = R.resolveRoster({ A: a, B: b }, ctxOf(), 1); return PP.duel(worldFrom, r.A.weights[0], { seed: 1, seconds: 25, opponent: r.B.scripted ? "scripted" : r.B.weights[0], ...extra }); };
    const hz = pair("hand", "zero"), zh = pair("zero", "hand");
    ok("!! a HAND pilot against a ZERO pilot lands hits and takes none: the zero pilot never fires, so it deals nothing to the hand pilot", hz.hits >= 1 && hz.damageTaken === 0 && hz.shotsFired > 0, `hits ${hz.hits} of ${hz.shotsFired}, took ${hz.damageTaken}`);
    ok("!! ...and swapped, the ZERO pilot is the one that takes the damage and lands none (B's weights reach B's ship)", zh.hits === 0 && zh.shotsFired === 0 && zh.damageTaken > 0, `hits ${zh.hits} of ${zh.shotsFired}, took ${zh.damageTaken}`);
    const hz2 = pair("hand", "zero"), hn = pair("hand", "noise10");
    ok("the same pairing twice is the same fight to the bit, and the pairing swapped is another", hz.fingerprint === hz2.fingerprint && hz.fingerprint !== zh.fingerprint, `${hz.fingerprint} / ${hz2.fingerprint} / swapped ${zh.fingerprint}`);
    ok("a noisy pilot is a different fight from the hand pilot it is made from (the weights reach the ship)", hn.fingerprint !== hz.fingerprint && hn.opponent === "weights", `${hn.fingerprint} against ${hz.fingerprint}`);
    const hs = pair("hand", "scripted");
    ok("and the scripted AI is still an opponent: 'scripted' on team B is the duel's own default, a weight vector the new one", hs.opponent === "scripted" && PP.duel(worldFrom, PP.handWeights(), { seed: 1, seconds: 25 }).fingerprint === hs.fingerprint, hs.fingerprint);
}

sec("4. THE PAGE: es-box3d-fly3d.html in its own browser");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 280000, args: { importedW: Array.from(importedW) }, script: `async (args) => {
            const boot = async () => {
                const f = document.createElement("iframe"); f.style.cssText = "width:900px;height:600px;border:0"; f.src = "/es-box3d-fly3d.html"; document.body.appendChild(f);
                const t = performance.now(); while (performance.now() - t < 90000) { await new Promise((r) => setTimeout(r, 250)); const w = f.contentWindow; if (w && w.__fly3d && w.__fly3d.booted && w.__fly3d.shipped) break; }
                return { f, w: f.contentWindow, d: f.contentDocument };
            };
            const waitFor = async (fn, ms) => { const t = performance.now(); while (performance.now() - t < ms) { try { if (fn()) return true; } catch (e) {} await new Promise((r) => setTimeout(r, 100)); } return false; };
            const P = await boot(); const F = P.w.__fly3d, d = P.d, byId = (id) => d.getElementById(id), choose = (id, v) => { const s = byId(id); s.value = v; s.dispatchEvent(new P.w.Event("change", { bubbles: true })); };
            const out = { booted: !!F.booted };
            out.btn = !!byId("rosterBtn") && !!byId("startFight") && !!byId("pilotA") && !!byId("pilotB");
            out.selA = Array.from(byId("pilotA").options).map((o) => o.value); out.defaults = [byId("pilotA").value, byId("pilotB").value];
            await waitFor(() => F.lineup && F.lineup.A && F.lineup.B, 8000);
            out.lineup0 = { A: F.lineup.A.id, B: F.lineup.B.id, note: byId("rosterNote").textContent };
            // Brain pilot on: default for team A becomes the Brain panel's pilot
            byId("brainBtn").click(); await waitFor(() => F.lineup.A.id === "brain", 4000); out.brainOn = { A: F.lineup.A.id, B: F.lineup.B.id, label: F.lineup.A.label };
            byId("brainBtn").click(); await waitFor(() => F.lineup.A.id === "scripted", 4000); out.brainOff = F.lineup.A.id;
            // a hand team against a zero team
            choose("pilotA", "hand"); choose("pilotB", "zero"); byId("startFight").click();
            out.afterStart = { A: F.lineup.A.id, B: F.lineup.B.id, ships: F.lineup.A.weights.length, tally: F.wins.A + F.wins.B, alive: F.A.length + F.B.length };
            await waitFor(() => F.B.some((e) => e.shield + e.armor < e.maxShield + e.maxArmor), 60000);
            out.hz = { turnsA: F.A.map((e) => +(e._turn || 0).toFixed(3)), turnsB: F.B.map((e) => +(e._turn || 0).toFixed(3)), bHurt: F.B.some((e) => e.shield + e.armor < e.maxShield + e.maxArmor), aHurt: F.A.some((e) => e.shield + e.armor < e.maxShield + e.maxArmor) };
            // swapped
            choose("pilotA", "zero"); choose("pilotB", "hand"); byId("startFight").click();
            await waitFor(() => F.A.some((e) => e.shield + e.armor < e.maxShield + e.maxArmor), 60000);
            out.zh = { turnsA: F.A.map((e) => +(e._turn || 0).toFixed(3)), turnsB: F.B.map((e) => +(e._turn || 0).toFixed(3)), aHurt: F.A.some((e) => e.shield + e.armor < e.maxShield + e.maxArmor), bHurt: F.B.some((e) => e.shield + e.armor < e.maxShield + e.maxArmor) };
            // an imported pilot is offered and flies
            F.setImported(new Float32Array(args.importedW)); out.selAfterImport = Array.from(byId("pilotA").options).map((o) => o.value);
            choose("pilotA", "imported"); choose("pilotB", "noise10"); byId("startFight").click();
            out.imp = { A: F.lineup.A.label, B: F.lineup.B.label, bWeights: F.lineup.B.weights.length, same: F.lineup.A.weights[0] === F.lineup.A.weights[1] };
            // the tally is cleared by Start Fight
            F.wins.A = 3; F.wins.B = 2; byId("startFight").click(); out.tallyCleared = F.wins.A + F.wins.B === 0;
            out.persisted = JSON.stringify(F.specs);
            P.f.remove();
            const Q = await boot(); const G = Q.w.__fly3d;
            out.reload = { A: Q.d.getElementById("pilotA").value, B: Q.d.getElementById("pilotB").value, specs: JSON.stringify(G.specs) };
            Q.d.getElementById("rosterReset").click(); out.afterReset = [Q.d.getElementById("pilotA").value, Q.d.getElementById("pilotB").value];
            return out;
        }` });
        ok("the harness booted es-box3d-fly3d.html and drove the panel", r.ok && r.result && r.result.booted, r.ok ? "" : String(r.reason || r.error || (r.pageErrors || []).join(" | ")).slice(0, 300));
        if (r.ok && r.result && r.result.booted) {
            const p = r.result;
            ok("!! the panel is there: a Load Pilots button, a select for each team and Start Fight; on load both teams are on 'default for this team', and the choices offered are the seven a bare page holds plus the shipped pilot once its file has loaded", p.btn && p.defaults.join() === "auto,auto" && p.selA.includes("shipped") && !p.selA.includes("imported") && p.selA.length === 8, p.selA.join(","));
            ok("!! the default lineup is the old demo: scripted against scripted; Brain pilot on makes team A the Brain panel's pilot (the shipped one here) against scripted B; off again, scripted", p.lineup0.A === "scripted" && p.lineup0.B === "scripted" && p.brainOn.A === "brain" && p.brainOn.B === "scripted" && /shipped/.test(p.brainOn.label) && p.brainOff === "scripted", `${p.lineup0.note}  //  brain on: ${p.brainOn.label}`);
            ok("!! a choice made in a select is the pilot that flies after Start Fight: team A hand, team B zero is the lineup, six ships a side, the tally and battle fresh", p.afterStart.A === "hand" && p.afterStart.B === "zero" && p.afterStart.ships === 6 && p.afterStart.tally === 0 && p.afterStart.alive === 12, JSON.stringify(p.afterStart));
            ok("!! a ZERO team turns nothing and takes the damage, a HAND team turns and deals it: every team B ship's turn is 0 while team A's ships are turning, and team B is the one hurt", p.hz.turnsB.every((t) => t === 0) && p.hz.turnsA.some((t) => t !== 0) && p.hz.bHurt && !p.hz.aHurt, JSON.stringify(p.hz));
            ok("!! ...and swapped, team A (zero) is the one that is hurt and team B (hand) is turning", p.zh.turnsA.every((t) => t === 0) && p.zh.turnsB.some((t) => t !== 0) && p.zh.aHurt && !p.zh.bHurt, JSON.stringify(p.zh));
            ok("!! an imported pilot is OFFERED once held and flies the team it is given to, and 'hand + noise' gives every ship of its team its own pilot", p.selAfterImport.includes("imported") && /imported/.test(p.imp.A) && /noise/.test(p.imp.B) && p.imp.bWeights === 6 && p.imp.same, `${p.imp.A} against ${p.imp.B}`);
            ok("Start Fight clears the tally (a score for one lineup is not added to a score for another)", p.tallyCleared);
            ok("!! the choices survive a reload: imported on A and noise on B are what a fresh page shows (the imported pilot itself does not persist -- it is this session's, and the page then says so by name)", p.reload.A === "imported" && p.reload.B === "noise10" && /imported/.test(p.persisted), `${p.reload.A} / ${p.reload.B}`);
            ok("...and Default pilots puts both selects back on 'default for this team'", p.afterReset.join() === "auto,auto", p.afterReset.join());
        }
    }
}

console.log(fails ? `\npilotRoster-selfcheck: ${fails} FAILED` : "\npilotRoster-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
