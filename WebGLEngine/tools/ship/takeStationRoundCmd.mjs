// WebGLEngine/tools/ship/takeStationRoundCmd.mjs -- UNNUMBERED. The command line of the station-and-price audit (tools/ship/takeStationRound.mjs); see there for the arguments.
//   node tools/ship/takeStationRoundCmd.mjs fly --out brain/stationRoundAudit.jsonl --workers 4        (the registered block: seeds 18001-18300 of far and both; resumable)
//   node tools/ship/takeStationRoundCmd.mjs report --in brain/stationRoundAudit.jsonl                  (READ ONCE)
// THE FIRST-ORDER ORIENTATION STEP, said out loud as in the training command (see tools/ship/trainDecisionCircuitCmd.mjs): the series' numbers and Round 33's twin gain were measured under it.
import { setOrientationDefault } from "../../physics/mechanics/rigidBody6dof.mjs";
setOrientationDefault("euler");
const { command } = await import("./takeStationRound.mjs");
process.exitCode = await command(process.argv.slice(2));
