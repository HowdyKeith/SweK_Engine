// headless self-check: a flung ragdoll craters a constrained wall (ties ragdolls + destructible structures), and
// the ragdoll itself reacts (flops on impact) -- both emerge from the shared Jolt world, deterministically.
import { createJoltBackend } from "./joltLoader.js";
import { createStructures } from "./joltStructures.js";
import { createRagdoll } from "./joltRagdoll.js";

const backend = await createJoltBackend();

function scene() {
    const w = backend.createWorld({ gravity: [0, -9.8, 0] });
    w.addBox({ type: "static", pos: [0, -0.5, 0], half: [40, 0.5, 0.5] });
    const S = createStructures(w); const wall = S.addWall({ x: 0, y: 0, z: 0, cols: 7, rows: 6, half: 0.5 });
    for (let t = 0; t < 30; t++) { w.step(1 / 60, 2); S.update(); }   // settle
    const rag = createRagdoll(w, { x: -9, y: 3, z: 0, scale: 0.9 });
    return { w, S, wall, rag };
}

// 1. a fast-flung ragdoll craters the wall
{
    const { w, S, rag } = scene();
    const total = S.activeCount();
    rag.fling(34, 6, 0, 4);   // hurl toward the wall (+x)
    let broke = 0, headRel0 = null;
    const xf0 = w.readTransforms(); const idx = rag.idxs(); headRel0 = [xf0[idx[2] * 7] - xf0[idx[0] * 7], xf0[idx[2] * 7 + 1] - xf0[idx[0] * 7 + 1]];
    for (let t = 0; t < 120; t++) { w.step(1 / 60, 2); broke += S.update(); }
    const xf1 = w.readTransforms(); const headRel1 = [xf1[idx[2] * 7] - xf1[idx[0] * 7], xf1[idx[2] * 7 + 1] - xf1[idx[0] * 7 + 1]];
    const flop = Math.hypot(headRel1[0] - headRel0[0], headRel1[1] - headRel0[1]);
    console.log("1. flung crew vs wall: " + S.brokenCount() + "/" + total + " wall joints broke, ragdoll pose changed " + flop.toFixed(2) + "u, cohesion " + rag.cohesion().toFixed(2));
    console.log("   -> " + (S.brokenCount() > 0 && S.brokenCount() < total && flop > 0.2 && rag.cohesion() < 2.5 ? "CREW CRATERED THE WALL + REACTED (still connected)" : "check"));
    w.destroy();
}

// 2. a gently-placed ragdoll does NOT crater the wall (needs a real impact)
{
    const { w, S } = scene();
    const total = S.activeCount();
    for (let t = 0; t < 90; t++) { w.step(1 / 60, 2); S.update(); }   // ragdoll just falls to the ground, no fling
    console.log("2. crew standing near wall (no fling): " + S.brokenCount() + "/" + total + " joints broke -> " + (S.brokenCount() === 0 ? "WALL UNTOUCHED (only real impacts crater)" : "spurious break"));
    w.destroy();
}

// 3. determinism
{
    function run() { const { w, S, rag } = scene(); rag.fling(40, 8, 0, 5); for (let t = 0; t < 120; t++) { w.step(1 / 60, 2); S.update(); } const xf = w.readTransforms(); const sig = S.brokenCount() + ":" + rag.idxs().map((i) => xf[i * 7].toFixed(2)).join(","); w.destroy(); return sig; }
    const r1 = run(), r2 = run();
    console.log("3. determinism: " + (r1 === r2 ? "IDENTICAL -> lockstep-safe" : "DIVERGED"));
}
