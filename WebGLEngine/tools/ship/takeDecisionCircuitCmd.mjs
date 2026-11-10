// WebGLEngine/tools/ship/takeDecisionCircuitCmd.mjs -- UNNUMBERED. The command line of the decision-circuit audit (tools/ship/takeDecisionCircuit.mjs); see there for the arguments.
//   node tools/ship/takeDecisionCircuitCmd.mjs fly --out brain/decisionCircuitAudit.jsonl --workers 4        (the registered block: seeds 17001-17300 of far and both; resumable)
//   node tools/ship/takeDecisionCircuitCmd.mjs report --in brain/decisionCircuitAudit.jsonl                  (READ ONCE)
// THE FIRST-ORDER ORIENTATION STEP, said out loud as in the training command (see tools/ship/trainDecisionCircuitCmd.mjs): the series' numbers and Round 33's twin gain were measured under it.
import { setOrientationDefault } from "../../physics/mechanics/rigidBody6dof.mjs";
setOrientationDefault("euler");
const { command } = await import("./takeDecisionCircuit.mjs");
process.exitCode = await command(process.argv.slice(2));
