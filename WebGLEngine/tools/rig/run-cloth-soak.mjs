// tools/rig/run-cloth-soak.mjs -- the honest-radius cloth soak, as a runnable job.
//   node tools/rig/run-cloth-soak.mjs [--quick]
// Thin, like its neighbours: the physics AND the analysis live in physics/xpbd/clothSoak.mjs, which its own gate
// proves. This only sequences and prints, so the job and the gate can never disagree about what was measured.
//
// IT IS THE CHEAPEST JOB ON THE LIST BY TWO ORDERS AND THAT IS DELIBERATE. The rig registry is where a run with
// a Run button and a pasteable report lives; it is not a club with a minimum duration. Padding this out to look
// like its 25-minute neighbours would be inventing work to fit a registry.
//
// --quick shortens the holds and the sweep points. IT NEVER CHANGES THE FIXTURE: the first quick mode written
// here used a smaller drape, which does not fold at all, and reported a confident zero contacts -- a DIFFERENT
// experiment wearing the same name, which is precisely the coarse-run-that-looks-like-a-result failure the rig
// panel warns about. Same cloth, same radius, fewer frames.
import { reportLines, MEASURED_V3604 } from "../../physics/xpbd/clothSoak.mjs";

const quick = process.argv.includes("--quick");
const t0 = Date.now();
console.log("[cloth-soak] " + (quick ? "QUICK: shorter holds and fewer sweep points -- shape only, it settles NOTHING"
                                     : "full run: three derived bounds, a bisection, two controls, the soak and both knob sweeps"));
for (const l of reportLines({ quick })) console.log(l);
console.log("");
console.log("[cloth-soak] done in " + ((Date.now() - t0) / 1000).toFixed(1) + "s" +
            (quick ? "   REMINDER: QUICK MODE settles NOTHING." : ""));
console.log("[cloth-soak] " + MEASURED_V3604.notChanged);
process.exit(0);
