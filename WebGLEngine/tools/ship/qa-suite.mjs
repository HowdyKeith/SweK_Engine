// tools/ship/qa-suite.mjs -- the headless QA suite the ship gate enforces. These are the invariants proven by hand
// across the voxel-filter + wormhole work; running them every ship means a regression that breaks physics or drifts
// a shader from its verified reference CANNOT reach a release. Pure Node, no browser. runQA() -> {pass, results[]};
// also runnable standalone: `node tools/ship/qa-suite.mjs`.
import { voxelizePage, physicsState, impact, updatePhysics, blobState, updateBlob, plasmaState, updatePlasma, waterState, dropAt, updateWater } from "../../fx/voxelize/pageVoxels.js";
import { pathToFileURL } from "node:url";
import { renderWormholeNebulaCPU, wormholeNebulaShadow } from "../../fx/wormhole/wormholeNebula.js";
import { makeVortons, swirlOffset, vortonSwirlShadow } from "../../fx/vorton/vortonNebula.js";
import { inducedVelocity, stepVortons } from "../../fx/vorton/vorton.js";

function _page(W, H) { const d = new Uint8ClampedArray(W * H * 4); for (let i = 0; i < W * H; i++) { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 180; d[i * 4 + 3] = 255; } return d; }

export async function runQA() {
    const results = [];
    const ck = (name, ok, detail) => results.push({ name, ok: !!ok, detail: detail || "" });

    // 1. physics invariant: an impact-shattered slab never clips through the floor, stays finite, settles
    try {
        const vg = voxelizePage(_page(40, 40), 40, 40, { cell: 3 }); physicsState(vg, { g: 2.4, floor: 0.85 }); impact(vg, { x: 0, y: 0, z: 0 }, 1.8);
        for (let s = 0; s < 400; s++) updatePhysics(vg, 1 / 60);
        let clip = 0, finite = true, settled = 0; for (const v of vg.voxels) { if (v.py > 0.87) clip++; if (![v.px, v.py, v.pz].every(Number.isFinite)) finite = false; if (v.settled) settled++; }
        ck("physics: no floor clip-through + finite + settles", clip === 0 && finite && settled / vg.voxels.length > 0.9, clip ? clip + " clipped" : (!finite ? "non-finite" : "settled " + Math.round(settled / vg.voxels.length * 100) + "%"));
    } catch (e) { ck("physics invariant", false, String(e && e.message || e)); }

    // 2. shader fidelity: the merged wormhole+nebula GPU shader's shadow is bit-identical to the CPU reference
    try {
        const V = makeVortons(5), opt = { k: 1, a: 0.5, camL: 6, maxPsi: 1.35, vortons: V, sigma: 0.35, gain: 0.5 };
        const ref = renderWormholeNebulaCPU(32, 32, opt), sh = wormholeNebulaShadow(32, 32, opt); let diff = 0; for (let i = 0; i < ref.length; i++) diff += Math.abs(ref[i] - sh[i]);
        ck("shader: wormhole+nebula shadow bit-identical to CPU", diff === 0, diff ? "diff " + diff : "");
    } catch (e) { ck("wormhole+nebula shadow", false, String(e && e.message || e)); }

    // 3. shader fidelity: the vorton nebula swirl shadow is bit-identical to the CPU swirl
    try {
        const V = makeVortons(7); let maxd = 0; for (let i = 0; i < 60; i++) { const u = (i % 8) / 4 - 1, v = ((i / 8) | 0) / 4 - 1, a = swirlOffset(u, v, V, 0.35), b = vortonSwirlShadow(u, v, V, 0.35); maxd = Math.max(maxd, Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])); }
        ck("shader: vorton swirl shadow bit-identical to CPU", maxd === 0, maxd ? "maxdiff " + maxd : "");
    } catch (e) { ck("vorton swirl shadow", false, String(e && e.message || e)); }

    // 4. physics correctness: a vortex dipole self-advects at the speed one vorton induces at the other
    try {
        const sigma = 0.25, dip = [{ x: [0, 0.5, 0], w: [0, 0, 1] }, { x: [0, -0.5, 0], w: [0, 0, -1] }];
        const vAtOther = Math.abs(inducedVelocity([dip[0]], dip[1].x, sigma)[0]); for (let i = 0; i < 200; i++) stepVortons(dip, 0.02, sigma);
        const cx = (dip[0].x[0] + dip[1].x[0]) / 2, speed = cx / (200 * 0.02), drift = Math.abs((dip[0].x[1] + dip[1].x[1]) / 2);
        ck("physics: vortex dipole self-advects correctly", Math.abs(speed - vAtOther) < 0.02 && drift < 0.01, "speed " + speed.toFixed(3) + " vs " + vAtOther.toFixed(3));
    } catch (e) { ck("vortex dipole", false, String(e && e.message || e)); }

    // 5. filter: the blob pseudopod actually reaches its target
    try {
        const vg = voxelizePage(_page(36, 36), 36, 36, { cell: 3 }); blobState(vg, { tendrilFrac: 0.5 }); const tgt = { x: 1.15, y: 0 }; let t = 0;
        for (let s = 0; s < 60; s++) { t += 0.05; updateBlob(vg, t, tgt, { reachDur: 2.0 }); }
        let reach = 0; for (const v of vg.voxels) reach = Math.max(reach, v.px); const finite = vg.voxels.every(v => Number.isFinite(v.px) && Number.isFinite(v.py));
        ck("filter: blob reaches its target + finite", reach > tgt.x * 0.9 && finite, "reached " + reach.toFixed(2) + "/" + tgt.x);
    } catch (e) { ck("blob reach", false, String(e && e.message || e)); }

    // 6. filter: a plasma arc connects core to target, is jagged, and stays finite
    try {
        const vg = voxelizePage(_page(36, 36), 36, 36, { cell: 2 }); plasmaState(vg); const T = [{ x: 1.2, y: 0.4 }]; updatePlasma(vg, 0.02, T, { branch: false });
        const arc = vg.pArcs[0], core = vg.pcore; const jagged = arc.length > 5, ends = Math.hypot(arc[arc.length - 1][0] - T[0].x, arc[arc.length - 1][1] - T[0].y) < 0.01, starts = Math.hypot(arc[0][0] - core.x, arc[0][1] - core.y) < 0.01;
        const finite = vg.voxels.every(v => Number.isFinite(v.cr) && Number.isFinite(v.cg));
        ck("filter: plasma arc reaches core->target, jagged, finite", jagged && ends && starts && finite, "arc pts " + arc.length);
    } catch (e) { ck("plasma arc", false, String(e && e.message || e)); }

    // 7. filter: water ripple peaks then damps (stable + bounded + finite). Peak AMPLITUDE (max|wh|) must decay -- summing
    // height across cells would grow just from the wave spreading, so amplitude is the honest stability signal.
    try {
        const vg = voxelizePage(_page(40, 40), 40, 40, { cell: 2 }); waterState(vg); dropAt(vg, vg.nx >> 1, vg.ny >> 1, 1.5);
        const maxH = () => { let m = 0; for (let i = 0; i < vg.wh.length; i++) { const a = Math.abs(vg.wh[i]); if (a > m) m = a; } return m; };
        let peak = 0; for (let s = 0; s < 40; s++) { updateWater(vg, 1 / 60, { c: 12 }); peak = Math.max(peak, maxH()); }
        for (let s = 0; s < 600; s++) updateWater(vg, 1 / 60, { c: 12 });
        const late = maxH(), finite = vg.wh.every(Number.isFinite);
        ck("filter: water ripple peaks then damps + finite", peak > 0 && peak < 1e3 && late < peak * 0.7 && finite, "peak " + peak.toFixed(3) + " -> late " + late.toFixed(3));
    } catch (e) { ck("water stability", false, String(e && e.message || e)); }

    return { pass: results.every(r => r.ok), results };
}

// standalone
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    runQA().then(({ pass, results }) => { for (const r of results) console.log((r.ok ? "  PASS " : "  FAIL ") + r.name + (r.detail ? "  [" + r.detail + "]" : "")); console.log(pass ? "\n[qa] ALL PASS" : "\n[qa] FAILURES PRESENT"); process.exit(pass ? 0 : 1); });
}
