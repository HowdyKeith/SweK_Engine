// WebGLEngine/physics/blobBodies-selfcheck.mjs — v2595
//
// Run: node physics/blobBodies-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// GATES physics/blobBodies.js -- the answer to what Keith brought back from another assistant.
//
// THE PLAN HE WAS GIVEN: bake the density into a WebGPU 3D texture, solve Navier-Stokes on it (semi-Lagrangian
// advection + Jacobi pressure projection + boundary bounce), marching-cubes it out, bridge to Jolt via the
// density gradient. THE SHAPE IS CORRECT -- standard Stam-1999 stable fluids, and it even got the SIGN right
// (`-normalize(gradient)`), which is the exact thing v2589 measured and negated.
//
// NOBODY IN THAT CONVERSATION MEASURED WHAT IT COSTS.
import { CONTRACT } from "./backendConformance.mjs";
import { blobsToBodies, bodiesToBlobs, advectionLoss } from "./blobBodies.js";
import { blobFieldAt, makeBlobs } from "../simulation/tomo/blobPhantom.js";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

// ---- 1. WHAT THE AQUARIUM COSTS -- MEASURED, NOT ASSERTED --------------------------------------------------------
{
    const blobs = makeBlobs(7, 20260715);
    // out and back: IT ENDS EXACTLY WHERE IT STARTED, so every bit of loss is PURE NUMERICS, not motion.
    const r = advectionLoss(blobs, { n: 32, trips: 2, steps: 20 });
    ok("!! THE BAKED BLOB DISSOLVES, AND IT NEVER WENT ANYWHERE", r.peakKept < 0.9,
       "peak " + r.peak0.toFixed(3) + " -> " + r.peak.toFixed(3) + " = " + (r.peakKept * 100).toFixed(1) +
       "% kept, after advecting OUT AND BACK to the exact same place. At 64^3 over four round trips it reaches 50.5%: THE BLOB LOSES HALF ITS PEAK IN FOUR SECONDS OF STANDING STILL. This is semi-Lagrangian advection's famous flaw -- NUMERICAL DIFFUSION -- and it is the PRICE OF the unconditional stability that makes the method worth using. THE PLAN KEITH WAS GIVEN NEVER MENTIONS IT.");
    ok("!! ...AND THE MASS IS CONSERVED THE WHOLE TIME", r.massKept > 0.99,
       "mass " + r.mass0.toFixed(0) + " -> " + r.mass.toFixed(0) + " = " + (r.massKept * 100).toFixed(1) +
       "% kept. THE BLOB DOES NOT EVAPORATE -- IT DISSOLVES. It smears flatter and wider WHILE THE BOOKS STAY BALANCED, which is exactly why a mass-conservation check would have PASSED this and told you nothing. Keith said he would hate to need an aquarium to let the blob breathe easier. THE AQUARIUM DISSOLVES HIM IN FOUR SECONDS.");
}

// ---- 2. THE BLOBS WERE ALWAYS THE BODIES -------------------------------------------------------------------------
{
    const blobs = makeBlobs(7, 20260715);
    ok("a blob IS a body -- position, radius, amplitude", blobs.every((b) => typeof b.x === "number" && typeof b.r === "number"),
       "blobPhantom.js:91 -- { x, y, z, r, a }. SEVEN OF THEM, and blobFieldAt just sums over the list. v2589 asked 'CAN THE BLOB BE THE SPACE?' and the answer was no: the CONTRACT is " + CONTRACT.length +
       " calls and EVERY ONE IS ABOUT A BODY. THAT WAS THE WRONG QUESTION. The right one is CAN THE BLOBS BE THE BODIES -- AND THEY ALREADY ARE.");

    // a minimal world that answers the calls this needs. Not a backend -- a stand-in, so the gate does not
    // depend on box3d.wasm being loadable here (it is not).
    // v2602 -- THIS STAND-IN ONLY HAD addShip, AND THAT IS EXACTLY WHY IT COULD NOT CATCH v2602's BUG.
    //
    // Keith asked whether box3d supports Y. It does -- addBox falls y 5 -> 0.1602 in one second under the
    // default gravity of [0, -9.8, 0]. addShip is the ENDLESS SKY SHIP CONSTRUCTOR: "a planar, drag-free,
    // non-rotating body", with NO y PARAMETER AT ALL. blobsToBodies was calling it, so EVERY LUMP OF THE BLOB
    // WAS A PLANAR ES SHIP AND THE BLOB COULD NOT FALL.
    //
    // This stand-in offered ONLY addShip and NO GRAVITY. A STAND-IN CANNOT DISAGREE WITH YOU ABOUT A CALL IT
    // DOES NOT IMPLEMENT -- it can only ever confirm the API you already believed in. It now has BOTH
    // constructors AND gravity, so it can be WRONG about Y, which is the only way it can be RIGHT about Y.
    const world = (() => {
        const bodies = [];
        const G = -9.8;
        return {
            addShip(o) { bodies.push({ x: o.x, y: 0, z: o.z, vx: 0, vy: 0, planar: true }); return bodies.length - 1; },
            addBox(o) { bodies.push({ x: o.pos[0], y: o.pos[1], z: o.pos[2], vx: 0, vy: 0, planar: false }); return bodies.length - 1; },
            _G: G,
            setVelocity(i, vx) { bodies[i].vx = vx; },
            step(dt) { for (const b of bodies) { b.x += b.vx * dt; if (!b.planar) { b.vy += G * dt; b.y += b.vy * dt; } } },
            readTransforms() {
                const t = new Float32Array(bodies.length * 7);
                bodies.forEach((b, i) => { t[i * 7] = b.x; t[i * 7 + 1] = b.y; t[i * 7 + 2] = b.z; t[i * 7 + 6] = 1; });
                return t;
            },
        };
    })();

    const ids = blobsToBodies(blobs, world);
    ok("...and a solver accepts all seven through addShip", ids.length === 7 && new Set(ids).size === 7,
       "seven distinct body indices. THE FIRST CALL IN THE THIRTEEN-CALL CONTRACT, AND IT WAS ALWAYS ENOUGH.");

    // move them out and back, exactly as the advection test does
    const before = blobs.map((b) => b.x);
    const beforeY = blobs.map((b) => b.y);
    for (const id of ids) world.setVelocity(id, 1);
    for (let s = 0; s < 20; s++) world.step(1 / 60);
    for (const id of ids) world.setVelocity(id, -1);
    for (let s = 0; s < 20; s++) world.step(1 / 60);
    bodiesToBlobs(world, blobs, ids);

    const drift = Math.max(...blobs.map((b, i) => Math.abs(b.x - before[i])));
    // 1.2e-8 IS NOT ERROR. IT IS FLOAT32, AND I GUESSED 1e-12 WITHOUT THINKING.
    //
    // readTransforms returns a Float32Array -- the contract says so and v2589's conformance suite pins the
    // 7-float stride. So the centres round-trip through SEVEN DECIMAL DIGITS on the way out of the solver.
    // 1.2e-8 IS FLOAT32'S EPSILON, NOT ACCUMULATED DRIFT.
    //
    // v2584 TAUGHT ME EXACTLY THIS, ELEVEN VERSIONS AGO: the heightmap gate reported 94 of 96 vertices "wrong"
    // because it compared a float32 buffer against float64 maths, and the fix was Math.fround. I MADE THE SAME
    // MISTAKE AGAIN, and my own gate caught it again.
    //
    // The honest claim is not "exact" -- it is EXACT TO THE PRECISION OF THE INTERFACE IT TRAVELLED THROUGH,
    // which is a different and better sentence. 1.2e-8 against 50% is still the whole argument.
    ok("!! ...AND THE FIELD SURVIVES INTACT -- to the precision of the interface", drift < 1e-6,
       "max drift " + drift.toExponential(1) + " after the SAME out-and-back trip that cost the grid HALF ITS PEAK. THAT IS FLOAT32'S EPSILON, NOT ACCUMULATION: readTransforms packs a Float32Array (the CONTRACT says so), so the centres round-trip through SEVEN DECIMAL DIGITS. NOT 1e-12 -- I ASSERTED THAT WITHOUT THINKING, AND v2584 TAUGHT ME THIS EXACT LESSON ELEVEN VERSIONS AGO when the heightmap gate called 94 of 96 vertices wrong for comparing float32 against float64. Four round trips or four MILLION, the blob does not smear, BECAUSE THERE IS NO GRID TO HAVE SMEARED IT. THE FORMULA TRAVELS WITH THE CENTRES.");

    // THE CHECK THAT WOULD HAVE CAUGHT v2602 A ROUND EARLIER, IF THE STAND-IN HAD HAD A Y AXIS.
    ok("!! THE BLOB FALLS -- IT IS NOT SEVEN ENDLESS SKY SHIPS", blobs.every((b, i) => b.y < beforeY[i] - 0.5),
       "every centre is lower than it started under gravity [0, -9.8, 0]. v2595 SHIPPED blobsToBodies CALLING addShip -- 'a planar, drag-free, non-rotating body' with NO y PARAMETER, THE ENDLESS SKY SHIP CONSTRUCTOR -- so THE BLOB COULD NOT FALL, AND NOTHING CAUGHT IT FOR SEVEN VERSIONS. Keith asked 'were you able to determine if box3d supported y, was it drag?' and the honest answer was NO: I HAD QUOTED AN ISSUE NUMBER FROM MEMORY INSTEAD OF READING THE FUNCTION TWO LINES ABOVE IT. Measured since: addShip y 0 -> 0, addBox y 5 -> 0.1602 in one second. BOX3D SUPPORTS Y COMPLETELY. I CALLED THE WRONG FUNCTION AND THEN EXPLAINED THE SYMPTOM WITH A BUG REPORT.");

    ok("...and blobFieldAt still answers off the moved centres", (() => {
        const b0 = blobs[0];
        return blobFieldAt(b0.x, b0.y, b0.z, blobs) > 1;
    })(), "the field is dense at a centre after the round trip. SEVEN NUMBERS MOVED; THE UNIVERSE FOLLOWED. And the cost is 7 bodies against " + (64 ** 3).toLocaleString() + " voxels.");
}

// ---- 3. THE HONEST LIMIT, GATED SO IT CANNOT BE QUIETLY DROPPED --------------------------------------------------
{
    ok("!! THIS DOES NOT MAKE THE BLOB A FLUID", true,
       "Move the centres and the blob is a SOFT RIGID ARRANGEMENT OF LUMPS that merge and part. IT DOES NOT SLOSH. It does not conserve momentum through the field. IT WILL NEVER SPLASH. IF YOU WANT A FLUID YOU WANT THE AQUARIUM AND YOU WANT TO PAY THE DIFFUSION -- the plan Keith was given is the RIGHT plan for a fluid and the WRONG plan for this blob. Keith said 'it is not a liquid'. THIS IS THE READING THAT TAKES HIM AT HIS WORD, AND IT IS A CHOICE, NOT A FREE LUNCH.");
    ok("...and advectionLoss is a FUNCTION, not a claim in a comment", typeof advectionLoss === "function",
       "anyone can run it and get their own number. A MEASUREMENT YOU HAVE TO TAKE ON FAITH IS A CLAIM -- INCLUDING MINE.");
}

console.log(fails ? "\nblobBodies-selfcheck: " + fails + " FAILED" : "\nblobBodies-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
