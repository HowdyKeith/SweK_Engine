// WebGLEngine/tools/ship/takeRankingValidityCmd.mjs -- UNNUMBERED. The command line of the ranking-validity audit (tools/ship/takeRankingValidity.mjs); see there for the arguments.
//   node tools/ship/takeRankingValidityCmd.mjs fly --out brain/rankingValidityAudit.jsonl --workers 4     (the registered block: seeds 19001-19600 of far and both; resumable)
//   node tools/ship/takeRankingValidityCmd.mjs report --in brain/rankingValidityAudit.jsonl               (READ ONCE)
// THE FIRST-ORDER ORIENTATION STEP, said out loud as in the training commands (see tools/ship/trainDecisionCircuitCmd.mjs): the series' numbers were measured under it.
import { setOrientationDefault } from "../../physics/mechanics/rigidBody6dof.mjs";
setOrientationDefault("euler");
const { command } = await import("./takeRankingValidity.mjs");
process.exitCode = await command(process.argv.slice(2));
