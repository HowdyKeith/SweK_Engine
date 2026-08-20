// headless self-check: a Jolt ragdoll holds together at its joints, flops (non-rigid), can be flung, deterministic.
import { createJoltBackend } from "./joltLoader.js";
import { createRagdoll } from "./joltRagdoll.js";

const backend = await createJoltBackend();

// 1. holds together + flops when dropped
{
    const w = backend.createWorld({ gravity: [0, -9.8, 0] });
    w.addBox({ type: "static", pos: [0, -0.5, 0], half: [30, 0.5, 30] });
    const rag = createRagdoll(w, { x: 0, y: 4, z: 0 });
    const xf0 = w.readTransforms(); const idx = rag.idxs();
    const headRel0 = [xf0[idx[2] * 7] - xf0[idx[0] * 7], xf0[idx[2] * 7 + 1] - xf0[idx[0] * 7 + 1]];   // head vs pelvis
    let maxCoh = 0;
    for (let t = 0; t < 150; t++) { w.step(1 / 60, 2); maxCoh = Math.max(maxCoh, rag.cohesion()); }
    const xf1 = w.readTransforms();
    const headRel1 = [xf1[idx[2] * 7] - xf1[idx[0] * 7], xf1[idx[2] * 7 + 1] - xf1[idx[0] * 7 + 1]];
    const poseChange = Math.hypot(headRel1[0] - headRel0[0], headRel1[1] - headRel0[1]);
    console.log("1. dropped: max joint drift " + maxCoh.toFixed(2) + "u (joints " + (maxCoh < 2 ? "HOLD" : "FAILED") + "), pose deformed by " + poseChange.toFixed(2) + "u (" + (poseChange > 0.2 ? "FLOPS like a ragdoll" : "stayed rigid") + ")");
    w.destroy();
}

// 2. fling launches the whole figure
{
    const w = backend.createWorld({ gravity: [0, -9.8, 0] });
    w.addBox({ type: "static", pos: [0, -0.5, 0], half: [30, 0.5, 30] });
    const rag = createRagdoll(w, { x: 0, y: 2, z: 0 });
    const c0 = rag.center();
    rag.fling(90, 40, 0, 5);
    for (let t = 0; t < 60; t++) w.step(1 / 60, 2);
    const c1 = rag.center();
    console.log("2. flung: center moved (" + (c1[0] - c0[0]).toFixed(1) + ", " + (c1[1] - c0[1]).toFixed(1) + ")u, cohesion " + rag.cohesion().toFixed(2) + " -> " + (c1[0] - c0[0] > 3 && rag.cohesion() < 2 ? "LAUNCHED + still connected" : "check"));
    w.destroy();
}

// 3. determinism
{
    function run() { const w = backend.createWorld({ gravity: [0, -9.8, 0] }); w.addBox({ type: "static", pos: [0, -0.5, 0], half: [30, 0.5, 30] }); const rag = createRagdoll(w, { x: 0, y: 3, z: 0 }); rag.fling(50, 30, 10, 4);
        for (let t = 0; t < 120; t++) w.step(1 / 60, 2); const xf = w.readTransforms(); const sig = rag.idxs().map((i) => xf[i * 7].toFixed(2) + "," + xf[i * 7 + 1].toFixed(2)).join(";"); w.destroy(); return sig; }
    const r1 = run(), r2 = run();
    console.log("3. determinism: " + (r1 === r2 ? "IDENTICAL -> lockstep-safe ragdolls" : "DIVERGED"));
}
