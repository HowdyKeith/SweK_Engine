// WebGLEngine/brain/pilot6dofMlpPage-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/pilot6dofMlpPage-selfcheck.mjs      (a browser; ~30-60 s)
//
// THE GPU BRAIN'S PILOT ON THE PAGE: es-box3d-6dof.html's Load Pilots panel offers the GPU Brain's 6-DOF pilot (brain/pilot6dofMlpWeightsDefault.json, hash 0ffd8554) beside the fruit fly's three, as
// brain/SIXDOF_GPU_BRAIN_WIP.md's page round registers it. The roster's half (a choice that carries its own network) is graded in brain/pilotRoster-selfcheck.mjs; this is the page's, in its own browser:
//   0  Node's side: the file imports as the GPU Brain's pilot and flies the committed held-out tally (brain/sixdofGpuBrainResults.json's champion)
//   1  the file LOADS and "gpu" is offered right after "close"; the pilot line names its hash and held-out score
//   2  choosing it flies it: every ship of the team on the file's vector, under its own label, through its own network (the MLP); and it meets the fruit fly's shipped pilot, each through its own
//   3  *** THE PILOT ON THE PAGE IS THE PILOT THAT WAS MEASURED ***: the page's own pilot function for that team, flown through the headless duel in the page's browser on the held-out seeds, gives the
//      committed tally (20.02, W4/L0/D4) and Node's duel fingerprints, seed for seed
//   4  a fight on the page shows it: the GPU team moves and deals damage, a zero team holds still and is hurt
//   5  a SAVED choice of it survives the next load (made before the file arrives, it falls back to the hand pilot, and becomes the GPU pilot when the file lands)
//   6  the GPU file offered to the page's importer (the fruit fly's network) is REFUSED, with the reason on the line, and nothing is imported
// NOT CLAIMED, as the registration says: anything about how this pilot does in the page's own fight (three a side, fleet targeting, collisions and ram damage on), which was never measured for it.
//
// SABOTAGE LOG (2026-11-02) -- the byte-safe runner, this gate and brain/pilotRoster-selfcheck.mjs run, each file restored byte-identical (sha256); the number is the rows that went red HERE, by name:
//   PG1 the page never offers 'gpu' 4 (1, 2, the meeting, 3) | PG2 the page hands the roster no network for it 4 (2, the meeting, 3, 5) | PG3 its file read with the fruit fly's descriptor 5 (1, 2, the meeting, 3, 5)
//   PG4 the pilot line leaves it out 1 (1) | PG5 the page's importer takes its file as a fruit-fly pilot 1 (6)
//   and the roster's four (brain/pilotRoster-selfcheck.mjs's AG-AJ): 'gpu' offered when none is held 0 here (7 there) | teamPilot() ignoring the choice's own network 2 (3, 4) | 'gpu' resolved without its
//   network 0 here (1 there: the page always hands both) | 'gpu' resolved to the shipped fruit-fly pilot's weights 3 (2, 3, 4)
//   PG1 leaves row 5 green, and rightly: a saved 'gpu' still resolves through the roster's context; row 1 is the one that says the select never offers it.
"use strict";
import "../physics/mechanics/rigidBody6dofEuler.mjs";   // 2026-11-04 -- the 6-DOF numbers this gate holds were measured under the first-order orientation step, so it flies that step (see that file)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as P6 from "./pilot6dofPolicy.mjs";
import * as M6 from "./pilot6dofMlp.mjs";
import * as PB from "./peerBrain.mjs";
import { weightsHash } from "./drivePolicy.mjs";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ----  " + m);
const t0 = Date.now();
const tally = (r) => ({ score: r.score, wins: r.wins, losses: r.losses, draws: r.draws, hits: r.hits, hitsTaken: r.hitsTaken });
const wl = (r) => `${r.score.toFixed(2)} (W${r.wins}/L${r.losses}/D${r.draws})`;

console.log("0. NODE'S SIDE: the file, imported the way the page imports it");
const blob = JSON.parse(fs.readFileSync(path.join(ENG, "brain", "pilot6dofMlpWeightsDefault.json"), "utf8")), imp = PB.importBrain(PB.describePolicy("pilot6dofMlp", M6), blob);
const RES = JSON.parse(fs.readFileSync(path.join(ENG, "brain", "sixdofGpuBrainResults.json"), "utf8")), W = imp.ok ? imp.weights : M6.handWeights();
const nodeFps = P6.HELD_OUT_SEEDS.map((seed) => P6.duel(M6.pilotFor(W), "autopilot", { seed }).fingerprint), nodeHeld = tally(M6.evaluate(W, P6.HELD_OUT_SEEDS));
ok("!! the file imports as the GPU Brain's pilot (hash 0ffd8554, 1,637 weights), and in Node it flies the committed held-out tally to the last digit",
    imp.ok && weightsHash(W) === "0ffd8554" && W.length === M6.WEIGHT_COUNT && JSON.stringify(nodeHeld) === JSON.stringify(RES.champion.heldOut), imp.ok ? wl(nodeHeld) : imp.reason);

console.log("\n1-6. THE PAGE: es-box3d-6dof.html in its own browser");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 240000, script: `async () => {
        await import("/physics/mechanics/rigidBody6dofEuler.mjs");   // 2026-11-04 -- the page flies the step this gate's 6-DOF numbers were measured under (sessionStorage carries it into the iframe)
        const boot = async () => {
            const f = document.createElement("iframe"); f.style.cssText = "width:900px;height:600px;border:0"; f.src = "/es-box3d-6dof.html"; document.body.appendChild(f);
            const t = performance.now(); while (performance.now() - t < 60000) { await new Promise((r) => setTimeout(r, 250)); const w = f.contentWindow; if (w && w.__sixdof && w.__sixdof.roster) break; }
            return { f, w: f.contentWindow, d: f.contentDocument };
        };
        const waitFor = async (fn, ms) => { const t = performance.now(); while (performance.now() - t < ms) { try { if (fn()) return true; } catch (e) {} await new Promise((r) => setTimeout(r, 100)); } return false; };
        const P = await boot(); const S = P.w.__sixdof, d = P.d, byId = (id) => d.getElementById(id), choose = (id, v) => { const s = byId(id); s.value = v; s.dispatchEvent(new P.w.Event("change", { bubbles: true })); };
        const out = { booted: !!(S && S.roster) };
        const hurt = (fl) => fl.some((s) => s.hp < 100), moved = (fl) => fl.some((s) => Math.hypot(...s.body.vel) > 0.5);
        const observe = async (ms) => {   // the fruit fly's page rows' own sampler: OR the evidence every 30 ms until the tally ticks or the time is up
            const o = { aHurt: false, bHurt: false, aMoved: false, bMoved: false, ended: false }, w0 = S.state().wins, t = performance.now();
            while (performance.now() - t < ms) {
                const F = S.fleets; o.aHurt ||= hurt(F.A); o.bHurt ||= hurt(F.B); o.aMoved ||= moved(F.A); o.bMoved ||= moved(F.B);
                const w = S.state().wins; if (w.A + w.B > w0.A + w0.B) { o.ended = true; break; }
                await new Promise((r) => setTimeout(r, 30));
            }
            return o;
        };
        // 1 -- both the GPU file and the close-quarters one, so the order in the select is read with both present
        await waitFor(() => (S.roster.gpu || S.roster.gpuError) && (S.roster.close || S.roster.closeError), 30000);
        out.loaded = { gpu: !!S.roster.gpu, error: S.roster.gpuError, len: S.roster.gpu ? S.roster.gpu.length : 0, choices: S.roster.choices, line: byId("pilotLine").textContent };
        // 2 -- choose it
        choose("pilotA", "gpu"); choose("pilotB", "zero"); byId("startFight").click();
        { const L = S.roster.lineup.A; out.fight = { A: L.id, B: S.roster.lineup.B.id, label: L.label, ships: L.weights.length, same: L.weights.every((w) => w === S.roster.gpu), net: L.PP ? L.PP.WEIGHT_COUNT : null, note: byId("rosterNote").textContent }; }
        // 3 -- the page's own pilot function for team A, through the headless duel, in this browser
        const P6b = await import("/brain/pilot6dofPolicy.mjs"), fn = S.roster.pilotAi("A"), seeds = ${JSON.stringify(P6.HELD_OUT_SEEDS)}, ev = P6b.evaluate(fn, seeds);
        out.duel = { fps: seeds.map((seed) => P6b.duel(fn, "autopilot", { seed }).fingerprint), tally: { score: ev.score, wins: ev.wins, losses: ev.losses, draws: ev.draws, hits: ev.hits, hitsTaken: ev.hitsTaken } };
        // 4 -- the fight on the page
        out.obs = await observe(40000);
        // 2b -- the two networks meet: the GPU pilot on team A, the fruit fly's shipped pilot on team B
        await waitFor(() => S.roster.shipped, 30000);
        choose("pilotB", "shipped"); byId("startFight").click();
        { const A = S.roster.lineup.A, B = S.roster.lineup.B; out.meet = { A: A.id, B: B.id, aNet: A.PP ? A.PP.WEIGHT_COUNT : null, bOwnNet: B.PP !== undefined, bSame: B.weights.every((w) => w === S.roster.shipped), note: byId("rosterNote").textContent }; }
        // 6 -- the GPU file offered to the page's importer, which is the fruit fly's
        const gblob = await (await fetch("/brain/pilot6dofMlpWeightsDefault.json")).json();
        out.refused = { ok: S.roster.importBlob(gblob), line: byId("pilotLine").textContent, imported: !!S.roster.imported };
        // 5 -- a saved choice of it, on the next load
        S.roster.setSpecs({ A: "gpu", B: "scripted" }); P.f.remove();
        const Q = await boot(); await waitFor(() => Q.w.__sixdof.roster.gpu, 30000);
        await waitFor(() => Q.w.__sixdof.roster.lineup.A && Q.w.__sixdof.roster.lineup.A.id === "gpu", 5000);
        { const L = Q.w.__sixdof.roster.lineup.A; out.reload = { A: L && L.id, label: L && L.label, selected: Q.d.getElementById("pilotA").value }; }
        Q.w.__sixdof.roster.setSpecs({ A: "auto", B: "auto" });   // leave this browser's storage as a fresh page finds it
        return out;
    }` });
    ok("the harness booted es-box3d-6dof.html and drove the panel", r.ok && r.result && r.result.booted, r.ok ? "" : String(r.reason || r.error || (r.pageErrors || []).join(" | ")).slice(0, 300));
    if (r.ok && r.result && r.result.booted) {
        const p = r.result, ld = p.loaded;
        ok("!! 1. the GPU Brain's pilot LOADS and is offered: the file arrives (1,637 weights), 'gpu' is in the select right after 'close', and the pilot line names its hash and held-out score",
            ld.gpu && !ld.error && ld.len === M6.WEIGHT_COUNT && ld.choices.includes("gpu") && ld.choices.indexOf("gpu") === ld.choices.indexOf("close") + 1 && /GPU Brain pilot 0ffd8554: held-out score 20\.021/.test(ld.line),
            JSON.stringify({ error: ld.error, choices: ld.choices.join(","), line: ld.line }).slice(0, 300));
        ok("!! 2. choosing it flies it: team A is the GPU Brain pilot, all three ships on the very vector the file carries, THROUGH ITS OWN NETWORK (the MLP's 1,637 weights), against a zero team B",
            p.fight.A === "gpu" && p.fight.B === "zero" && /GPU Brain pilot/.test(p.fight.label) && p.fight.ships === 3 && p.fight.same && p.fight.net === M6.WEIGHT_COUNT && /GPU Brain pilot/.test(p.fight.note), JSON.stringify(p.fight));
        ok("!! ...and the two networks meet on the page: the GPU pilot on team A through the MLP, the fruit fly's shipped pilot on team B through the fly's own network, on the very weights its file carries",
            p.meet.A === "gpu" && p.meet.B === "shipped" && p.meet.aNet === M6.WEIGHT_COUNT && !p.meet.bOwnNet && p.meet.bSame && /GPU Brain pilot/.test(p.meet.note) && /shipped pilot brain/.test(p.meet.note), JSON.stringify(p.meet));
        ok(`!! 3. THE PILOT ON THE PAGE IS THE PILOT THAT WAS MEASURED: the page's own pilot function for team A, flown through the headless duel in the page's browser on the held-out seeds, gives the committed tally ${wl(RES.champion.heldOut)} and Node's fingerprints, seed for seed`,
            JSON.stringify(p.duel.tally) === JSON.stringify(RES.champion.heldOut) && p.duel.fps.join() === nodeFps.join(), `${wl(p.duel.tally)}; ${p.duel.fps.filter((f, i) => f === nodeFps[i]).length} of ${nodeFps.length} fingerprints`);
        ok("!! 4. a fight on the page shows it: the GPU team moves and deals damage, and the zero team holds still and is hurt", p.obs.bHurt && p.obs.aMoved && !p.obs.bMoved, JSON.stringify(p.obs));
        ok("!! 5. a SAVED choice of it survives the next load: made before the file has arrived, it falls back to the hand pilot for a moment and becomes the GPU Brain pilot when the file lands",
            p.reload.A === "gpu" && p.reload.selected === "gpu" && /GPU Brain pilot/.test(p.reload.label), JSON.stringify(p.reload));
        ok("!! 6. the GPU file offered to the page's importer (the fruit fly's network) is REFUSED, with the reason on the line, and nothing is imported",
            p.refused.ok === false && /import refused: .*pilot6dofMlp/.test(p.refused.line) && !p.refused.imported, p.refused.line.slice(-160));
    }
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here, as registered: how this pilot does in the page's own fight -- measured since by brain/SIXDOF_PAGE_FIGHT_WIP.md (it ties the PD autopilot and loses to the fruit fly's Default 76-123).");
process.exit(fails ? 1 : 0);
