#!/usr/bin/env node
// WebGLEngine/tools/ship/peerBrain-selfcheck.mjs
//
// Run: node tools/ship/peerBrain-selfcheck.mjs
//
// brain/peerBrain.mjs held to: a real round trip through JSON.stringify/parse (not just an in-memory object) for both
// brain/drivePolicy.mjs's and brain/gunnerPolicy.mjs's real, live weight vectors (zero and hand); and importBrain()
// NEVER throwing, refusing every malformed shape "at the door" the same way driveStore()/gunnerStore() already refuse
// a malformed LOCAL training offer -- wrong format tag, cross-policy mixup, stale weight count, non-finite weight,
// non-array weights, and outright garbage input.
//
// SABOTAGE LOG:
//   A  importBrain()'s weight-count check replaced with `blob.weights.length >= policy.WEIGHT_COUNT` (off-by-laxity:
//      accepts a too-long array) -> 1 red: the "extra weight rejected" case, which a >= check waves through.
//   B  importBrain()'s finite check removed entirely -> 2 red, not the 1 a first guess assumed: BOTH the NaN-weight
//      AND the Infinity-weight cases (Number.isFinite() rejects both, so removing the check waves both through --
//      a NaN or an Infinity would silently reach Float32Array.from and then the policy's forward pass, corrupting
//      the whole hidden state the way tools/ship/drivePolicy-selfcheck.mjs's own SABOTAGE B found for a stray
//      recurrent weight -- this is the transport-layer version of the same risk, worth refusing at the same door).
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { initNode, mod } from "../../physics/box3d/box3dNode.mjs";
import { worldFromModule } from "../../render/slugTicker.mjs";
import * as D from "../../brain/drivePolicy.mjs";
import * as GP from "../../brain/gunnerPolicy.mjs";
import * as PB from "../../brain/peerBrain.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);

console.log("peerBrain-selfcheck -- a portable trained-weights format, round-tripped through real JSON, refusing malformed input at the door\n");

const DRIVE = PB.describePolicy("drivePolicy", D), GUNNER = PB.describePolicy("gunnerPolicy", GP);

sec("1. describePolicy READS THE LIVE MODULE'S OWN SHAPE, NOT A TYPED COPY");
{
    ok("drivePolicy's descriptor matches its own live exports", DRIVE.FEATURES === D.FEATURES && DRIVE.HIDDEN === D.HIDDEN && DRIVE.OUTPUTS === D.OUTPUTS && DRIVE.WEIGHT_COUNT === D.WEIGHT_COUNT, `${DRIVE.FEATURES}-${DRIVE.HIDDEN}-${DRIVE.OUTPUTS}, ${DRIVE.WEIGHT_COUNT} weights`);
    ok("gunnerPolicy's descriptor matches its own live exports", GUNNER.FEATURES === GP.FEATURES && GUNNER.HIDDEN === GP.HIDDEN && GUNNER.OUTPUTS === GP.OUTPUTS && GUNNER.WEIGHT_COUNT === GP.WEIGHT_COUNT, `${GUNNER.FEATURES}-${GUNNER.HIDDEN}-${GUNNER.OUTPUTS}, ${GUNNER.WEIGHT_COUNT} weights`);
}

sec("2. A REAL ROUND TRIP THROUGH JSON, FOR BOTH REAL POLICIES' REAL WEIGHTS");
{
    for (const [label, policy, mod] of [["drivePolicy", DRIVE, D], ["gunnerPolicy", GUNNER, GP]]) {
        for (const [wlabel, w] of [["zero", mod.zeroWeights()], ["hand", mod.handWeights()]]) {
            const blob = PB.exportBrain(policy, w, { score: 42.5, by: "test-peer", citation: "unit test" });
            const wire = JSON.parse(JSON.stringify(blob));   // the actual wire format -- not the in-memory object
            const back = PB.importBrain(policy, wire);
            ok(`!! ${label}/${wlabel}: export -> real JSON -> import is byte-identical`, back.ok && back.weights.length === w.length && Array.from(back.weights).every((v, i) => v === w[i]), back.ok ? "match" : back.reason);
            ok(`  ...and carries the format tag, policy id, shape and metadata`, wire.format === PB.FORMAT && wire.policy === policy.id && wire.weightCount === policy.WEIGHT_COUNT && back.meta.score === 42.5 && back.meta.by === "test-peer" && back.meta.citation === "unit test");
        }
    }
}

sec("3. IMPORTBRAIN NEVER THROWS AND REFUSES EVERY MALFORMED SHAPE AT THE DOOR");
{
    const goodBlob = JSON.parse(JSON.stringify(PB.exportBrain(DRIVE, D.zeroWeights())));
    const tryImport = (label, blob) => { let r; try { r = PB.importBrain(DRIVE, blob); } catch (e) { ok(`!! ${label}: does not throw`, false, String(e)); return; } ok(`!! ${label}: refused, ok:false, with a reason`, r.ok === false && typeof r.reason === "string" && r.reason.length > 0, r.reason); };
    tryImport("undefined", undefined);
    tryImport("null", null);
    tryImport("a bare string", "not a brain");
    tryImport("a bare array", [1, 2, 3]);
    tryImport("an empty object", {});
    tryImport("the wrong format tag", { ...goodBlob, format: "swek-brain-v0" });
    tryImport("a gunner brain fed to the driver importer (cross-policy mixup)", { ...JSON.parse(JSON.stringify(PB.exportBrain(GUNNER, GP.zeroWeights()))) });
    tryImport("a stale weight count (one short)", { ...goodBlob, weights: goodBlob.weights.slice(0, -1) });
    tryImport("an extra weight (one too many)", { ...goodBlob, weights: [...goodBlob.weights, 0] });
    tryImport("a NaN weight", { ...goodBlob, weights: goodBlob.weights.map((v, i) => (i === 3 ? NaN : v)) });
    tryImport("an Infinity weight", { ...goodBlob, weights: goodBlob.weights.map((v, i) => (i === 3 ? Infinity : v)) });
    tryImport("weights as a non-array (an object)", { ...goodBlob, weights: { 0: 1, length: goodBlob.weights.length } });
    ok("!! ...and a genuinely valid blob is still accepted (the checks above aren't just refusing everything)", PB.importBrain(DRIVE, goodBlob).ok);
}

sec("4. EXPORTBRAIN REFUSES A SHAPE MISMATCH AT THE DOOR TOO, RATHER THAN SILENTLY WRITING A BROKEN BLOB");
{
    let threw = false; try { PB.exportBrain(DRIVE, D.zeroWeights().slice(0, 10)); } catch { threw = true; }
    ok("!! exporting the wrong-length weights throws rather than producing a mismatched blob", threw);
    let threw2 = false; try { PB.exportBrain({ id: "x" }, D.zeroWeights()); } catch { threw2 = true; }
    ok("  ...and a policy descriptor missing WEIGHT_COUNT throws too", threw2);
}

sec("5. A REAL RACE AGAINST AN IMPORTED PEER BRAIN -- NOT JUST A SHAPE CHECK, THE PEER BRAIN ACTUALLY DRIVES");
{
    const st = await initNode();
    if (!st.ready) { console.log("  FAIL  box3d wasm: " + st.reason); fails++; }
    else {
        const m = mod(), worldFrom = () => worldFromModule(m, [0, -9.81, 0]);
        // a "peer's brain": the KNOWN-GOOD hand policy, standing in for a policy that arrived over the wire from
        // another machine -- what matters here is that it went THROUGH exportBrain -> JSON -> importBrain, not
        // that it was actually trained elsewhere (peerBrain.mjs cannot tell the difference, by design). NOT a
        // perturbation: measured directly, perturb() applies gaussian noise to ALL WEIGHT_COUNT weights uniformly,
        // including the (previously exactly zero) recurrent-core weights -- for a masked-recurrent policy that
        // breaks the identity trick and lets the real connectome core amplify unpredictably (by design, the same
        // property that makes it trainable), and a "small" sigma of 0.05 was enough to take the driver from 375 m
        // to comparable progress but drop the gunner's hand-perturbed duel from 13/15 hits to 0/0 at sigma 0.02 --
        // real, but a distraction from what THIS test is for. Robustness under perturbation is
        // tools/ship/drivePolicy-selfcheck.mjs's and brain/gunnerPolicy-selfcheck.mjs's own job, not this file's.
        const peerWeights = D.handWeights();
        const wire = JSON.parse(JSON.stringify(PB.exportBrain(PB.describePolicy("drivePolicy", D), peerWeights, { score: 900, by: "peer-box-7", citation: "test" })));
        const back = PB.importBrain(PB.describePolicy("drivePolicy", D), wire);
        ok("the peer's exported brain imports cleanly", back.ok, back.ok ? "" : back.reason);
        const fleet = D.machineFingerprint(m);
        const R1 = D.race(worldFrom, [D.zeroWeights(), back.weights], { seed: 1, seconds: 20, fleet });
        const R2 = D.race(worldFrom, [D.zeroWeights(), back.weights], { seed: 1, seconds: 20, fleet });
        const zeroCar = D.race(worldFrom, [D.zeroWeights(), D.zeroWeights()], { seed: 1, seconds: 20, fleet });
        ok("!! *** the peer brain's car actually drives -- real metres of progress, not the zero policy's near-standstill ***", R1.results[1].metres > 5 && R1.results[1].metres > zeroCar.results[1].metres * 5, `peer car ${R1.results[1].metres.toFixed(1)} m vs zero car ${zeroCar.results[1].metres.toFixed(1)} m`);
        ok("!! ...and racing the SAME re-imported weights twice reaches the SAME fingerprint -- the export/import round trip preserves determinism, byte for byte", R1.fingerprint === R2.fingerprint && JSON.stringify(R1.results.map((r) => [r.laps, +r.metres.toFixed(3)])) === JSON.stringify(R2.results.map((r) => [r.laps, +r.metres.toFixed(3)])), R1.fingerprint);
        report(`peer car: ${R1.results[1].laps} laps, ${R1.results[1].metres.toFixed(1)} m in 20 s; fingerprint ${R1.fingerprint}`);

        // the same proof for gunnerPolicy: a peer's exported gunner actually fights, not just imports cleanly
        const peerGunWeights = GP.handWeights();
        const gWire = JSON.parse(JSON.stringify(PB.exportBrain(PB.describePolicy("gunnerPolicy", GP), peerGunWeights, { score: 12, by: "peer-box-7" })));
        const gBack = PB.importBrain(PB.describePolicy("gunnerPolicy", GP), gWire);
        ok("the peer's exported gunner imports cleanly", gBack.ok, gBack.ok ? "" : gBack.reason);
        const duel = GP.duel(worldFrom, gBack.weights, { seed: 1, seconds: 20 });
        ok("!! *** the peer gunner's imported weights actually fight: real shots and hits, not a silent zero gunner ***", duel.shots > 0 && duel.hits > 0, `${duel.hits} hits of ${duel.shots} shots`);
    }
}

sec("6. IN THE BROWSER: race-brain.html's EXPORT/IMPORT/CLEAR BUTTONS, ROUND-TRIPPED FOR REAL");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 120000, script: `async (a) => {
            globalThis.__swekStep = "booting race-brain.html in an iframe";
            const f = document.createElement("iframe"); f.style.width = "1100px"; f.style.height = "760px"; f.src = "/race-brain.html"; document.body.appendChild(f);
            await new Promise((res) => { f.onload = res; });
            const doc = f.contentDocument, win = f.contentWindow, txt = (id) => (doc.getElementById(id) || {}).textContent || "";
            const t1 = performance.now(); while (performance.now() - t1 < 150000 && !/a turret on each/.test(txt("tick")) && !/threw|HTTP/.test(txt("be") + txt("tick"))) { globalThis.__swekStep = "waiting: " + txt("tick").slice(0, 60); await new Promise((res) => setTimeout(res, 250)); }
            const booted = /a turret on each/.test(txt("tick"));
            if (!booted) return { booted, be: txt("be") };

            // Export: capture the Blob downloadJSON() hands to URL.createObjectURL() directly, before its own
            // synchronous URL.revokeObjectURL() (correct behavior for a real download) would invalidate a captured
            // blob: URL out from under an async read -- measured directly: spying on the anchor's .click() instead
            // and fetching its .href afterwards hit exactly that revocation race (TypeError: Failed to fetch).
            const realCreateObjectURL = win.URL.createObjectURL.bind(win.URL); let capturedBlob = null;
            win.URL.createObjectURL = (blob) => { capturedBlob = blob; return realCreateObjectURL(blob); };
            doc.getElementById("exportBrain").click();
            win.URL.createObjectURL = realCreateObjectURL;
            const exportedBlob = capturedBlob ? JSON.parse(await capturedBlob.text()) : null;
            const peerBefore = txt("peer");

            // Import: feed the JUST-exported blob back in through the real file-input change event, no server round trip.
            const setFile = (inputId, file) => { const input = doc.getElementById(inputId), dt = new win.DataTransfer(); dt.items.add(file); input.files = dt.files; input.dispatchEvent(new win.Event("change", { bubbles: true })); };
            if (exportedBlob) {
                const file = new win.File([JSON.stringify(exportedBlob)], "peer.json", { type: "application/json" });
                setFile("importBrainFile", file);
                await new Promise((res) => setTimeout(res, 300));
            }
            const peerAfterGoodImport = txt("peer");

            const tickAfterGoodImport = txt("tick");

            // A malformed import must be refused, with the reason DISPLAYED (overwriting the status line -- the
            // point of this check is the underlying race state below, not this text), and must NOT touch the
            // already-loaded peer brain's actual effect on the race.
            const badFile = new win.File([JSON.stringify({ format: "not-a-brain" })], "bad.json", { type: "application/json" });
            setFile("importBrainFile", badFile);
            await new Promise((res) => setTimeout(res, 300));
            const peerAfterBadImport = txt("peer"), tickAfterBadImport = txt("tick");

            // Clear must revert to the no-peer-brain state, in both the status line and the actual race.
            doc.getElementById("clearPeer").click();
            const peerAfterClear = txt("peer"), tickAfterClear = txt("tick");

            return { booted, captured: !!capturedBlob, exportedBlob: exportedBlob ? { format: exportedBlob.format, policy: exportedBlob.policy, weightCount: exportedBlob.weightCount } : null, peerBefore, peerAfterGoodImport, tickAfterGoodImport, peerAfterBadImport, tickAfterBadImport, peerAfterClear, tickAfterClear };
        }` });
        ok("the harness booted race-brain.html and ran the export/import/clear flow", r.ok && r.result && r.result.booted, r.ok ? (r.result ? r.result.be : "") : String(r.reason || r.error || (r.pageErrors || []).join(" | ")).slice(0, 300));
        if (r.ok && r.result && r.result.booted) {
            const p = r.result;
            ok("!! Export brain triggered a real download: a JSON blob shaped like drivePolicy.mjs's own live export, 1396 weights", p.captured && p.exportedBlob && p.exportedBlob.format === PB.FORMAT && p.exportedBlob.policy === "drivePolicy" && p.exportedBlob.weightCount === D.WEIGHT_COUNT, JSON.stringify(p.exportedBlob));
            ok("before any import: the fourth car is named zero, not a peer brain", /zero/.test(p.peerBefore) || /no peer brain/.test(p.peerBefore), p.peerBefore);
            ok("!! importing the JUST-exported blob through the real file input succeeds and the HUD says so", /peer brain/.test(p.peerAfterGoodImport) && !/refused|failed/.test(p.peerAfterGoodImport), p.peerAfterGoodImport);
            ok("!! ...and the race actually picks it up: the fourth car in the HUD's car list is named \"peer brain\"", /peer brain/.test(p.tickAfterGoodImport), p.tickAfterGoodImport.slice(0, 200));
            ok("!! a malformed import is refused, with the reason displayed", /refused/.test(p.peerAfterBadImport), p.peerAfterBadImport);
            ok("!! ...and the refused import does NOT silently drop the already-loaded peer brain from the actual race", /peer brain/.test(p.tickAfterBadImport), p.tickAfterBadImport.slice(0, 200));
            ok("!! Clear peer brain reverts the status line AND the actual race to the no-peer state", /no peer brain/.test(p.peerAfterClear) && !/peer brain/.test(p.tickAfterClear), `${p.peerAfterClear} | ${p.tickAfterClear.slice(0, 200)}`);
        }
    }
}

console.log("\n" + (fails ? `${fails} FAILED` : "all checks pass"));
process.exit(fails ? 1 : 0);
