// WebGLEngine/tools/shedding-settle.mjs -- v2844
//
// THE LONG-WARMUP 2f RUN, as something you can start and walk away from.
//
// Run: node tools/shedding-settle.mjs            (defaults: ~40k settling steps, several minutes)
//      node tools/shedding-settle.mjs --warm 80000 --rec 20000
//
// WHY THIS EXISTS AS A SCRIPT RATHER THAN A GATE: it takes minutes, and its output is a MEASUREMENT rather than
// a pass or a fail. A gate that took ten minutes would stop being run, and a measurement dressed up as a gate
// would invite someone to tune the threshold until it passed.
//
// WHAT IT IS TESTING, and the history matters because this is the fourth attempt:
//   v2797  measured the vortex street twice and could not reproduce f_drag = 2 f_lift. Prescribed "longer runs
//          at lower blockage". WRONG -- the drive was above the LBM validity ceiling, so the flow was
//          accelerating toward a speed it could never reach.
//   v2834  diagnosed that with arithmetic and prescribed a different BOUNDARY CONDITION.
//   v2835  built it: a Zou-He driven inlet. RIGHT -- Reynolds drift fell from 21% to 4.16% and both observables
//          sustained at once for the first time.
//   v2842  still no 2f. Proposed the wake probe sat too close.
//   v2843  tested that with a rake of six probes: REFUTED. Disagreement did not fall with distance, and the
//          probes disagreed with EACH OTHER (Strouhal 0.079 to 0.194 along one wake) -- there was no coherent
//          street to find. The variable that DID track everything was warmup: less settling gave more drift and
//          worse agreement, monotonically.
//
// SO THIS CHANGES ONE THING: it settles for far longer, and nothing else. If the wake becomes coherent -- the
// probes agreeing with each other and with the lift -- then settling was the answer and 2f can be read honestly.
// If it does NOT, then a body-force-free driven channel at this blockage does not produce a clean street, and
// that is worth knowing too rather than trying a sixth thing.

import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ENG = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function arg(name, fallback) {
    const i = process.argv.indexOf("--" + name);
    return i > 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : fallback;
}

async function main() {
    const { makeLBM } = await import(pathToFileURL(path.join(ENG, "simulation", "lbm", "lbm2d.js")).href);
    const { solidForce } = await import(pathToFileURL(path.join(ENG, "simulation", "lbm", "windTunnel.mjs")).href);
    const S = await import(pathToFileURL(path.join(ENG, "simulation", "lbm", "sheddingSpectrum.mjs")).href);

    // The configuration sheddingDesign approves: tau inside the stable band, Reynolds met by a BIGGER BODY
    // rather than a thinner fluid, and the velocity pinned from outside.
    const nx = 380, ny = 121, D = 14, tau = 0.55, U = 0.0714;
    const WARM = arg("warm", 40000), REC = arg("rec", 16000);
    const nu = (tau - 0.5) / 3, cy = (ny - 1) / 2 + 0.5, cx = 95, h = (ny - 2) / 2;

    console.log(`shedding settle -- ${nx}x${ny} D=${D} tau=${tau} U=${U}  Re=${(U * D / nu).toFixed(1)}`);
    console.log(`  warmup ${WARM} steps, then record ${REC}. Previous attempts used 12000-14000.`);

    const prof = (y) => { const d = (y - cy) / h; return U * Math.max(0, 1 - d * d); };
    const lbm = makeLBM({ nx, ny, tau, inflow: prof, solidAt: (x, y) => ((x - cx) ** 2 + (y - cy) ** 2) <= (D / 2) ** 2 });
    const upstream = () => { let m = 0; for (let dy = -4; dy <= 4; dy++) m = Math.max(m, lbm.ux[lbm.idx(Math.max(1, cx - 3 * D), Math.round(cy) + dy)]); return m; };

    // A rake, so the ONE thing v2843 could not tell apart -- a bad probe versus an incoherent wake -- is settled
    // by whether the probes come to agree with EACH OTHER as the flow settles.
    const DS = [3, 6, 10, 14, 18];
    const probes = DS.map((d) => ({ d, x: Math.min(nx - 3, cx + Math.round(d * D)), y: Math.round(cy) + Math.max(2, Math.round(D / 2)) }));

    const t0 = Date.now();
    let last = upstream() * D / nu;
    for (let i = 0; i < WARM; i++) {
        lbm.step();
        if ((i + 1) % 5000 === 0) {
            const re = upstream() * D / nu;
            // The settling curve itself is the interesting output: when this stops moving, the flow has arrived.
            console.log(`  warm ${String(i + 1).padStart(6)}  Re=${re.toFixed(2)}  change since last ${(100 * Math.abs(re - last) / last).toFixed(2)}%  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
            last = re;
        }
    }

    const reBefore = upstream() * D / nu;
    const cl = [], cd = [], uy = probes.map(() => []);
    for (let s = 0; s < REC; s++) {
        lbm.step();
        const f = solidForce(lbm, (x, y) => ((x - cx) ** 2 + (y - cy) ** 2) <= (D / 2) ** 2 + 2);
        cd.push(f.fx); cl.push(f.fy);
        for (let k = 0; k < probes.length; k++) uy[k].push(lbm.uy[lbm.idx(probes[k].x, probes[k].y)]);
    }
    const Un = upstream(), reAfter = Un * D / nu;

    const lift = S.detrend(cl), drag = S.detrend(cd);
    const fL = S.dominantFrequency(lift).freq;
    const rake = probes.map((p, k) => {
        const w = S.detrend(uy[k]);
        const fW = S.dominantFrequency(w).freq;
        return { d: p.d, sustained: S.isSustained(w), St: S.strouhal(fW, D, Un), apart: Math.abs(fL - fW) / fL };
    });
    const sts = rake.map((r) => r.St);
    const spread = Math.max(...sts) / Math.min(...sts);

    const magAt = (x, f) => {
        const m = x.reduce((a, b) => a + b, 0) / x.length;
        let re = 0, im = 0;
        for (let n = 0; n < x.length; n++) { const p = 2 * Math.PI * f * n; re += (x[n] - m) * Math.cos(p); im += (x[n] - m) * Math.sin(p); }
        return Math.hypot(re, im) / x.length;
    };
    const fD = S.dominantFrequency(drag).freq;

    console.log("");
    console.log(`  Re ${reBefore.toFixed(2)} -> ${reAfter.toFixed(2)}   DRIFT ${(100 * Math.abs(reAfter - reBefore) / reBefore).toFixed(2)}%   (v2797 21%, v2843 14.8%, v2842 4.16%)`);
    console.log(`  lift sustained=${S.isSustained(lift)}  St=${S.strouhal(fL, D, Un).toFixed(4)}`);
    for (const r of rake) console.log(`    ${String(r.d).padStart(2)}D  St=${r.St.toFixed(4)}  ${(r.apart * 100).toFixed(2)}% from lift${r.apart < 0.05 ? "  <<< agrees" : ""}`);
    console.log("");
    console.log(`  PROBES AGREE WITH EACH OTHER? spread ${spread.toFixed(2)}x  (v2843 got 2.45x -- no coherent street)`);
    console.log(`  f_drag / f_lift = ${(fD / fL).toFixed(4)}   TEXTBOOK 2.0`);
    console.log(`  drag power at 2*f_lift / at f_lift = ${(magAt(drag, 2 * fL) / magAt(drag, fL)).toFixed(2)}   (>1 means the harmonic dominates, which is the claim)`);
    console.log("");
    console.log(`  ${((Date.now() - t0) / 1000 / 60).toFixed(1)} minutes. Paste this back -- the settling curve above is as`);
    console.log("  interesting as the verdict: if Re stops moving and the probes still disagree, settling was NOT the answer.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((e) => { console.error("shedding-settle failed:", e && e.message); process.exit(1); });
}
export { main };
