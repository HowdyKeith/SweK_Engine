// WebGLEngine/tools/ship/trainStationCmd.mjs -- UNNUMBERED. The command line of the station-and-price training (tools/ship/trainStation.mjs); see there for the arguments.
// THE FIRST-ORDER ORIENTATION STEP, said out loud as in tools/ship/trainDecisionCircuitCmd.mjs (the needs series was measured under it), in every worker process.
import { setOrientationDefault } from "../../physics/mechanics/rigidBody6dof.mjs";
setOrientationDefault("euler");
const { command } = await import("./trainStation.mjs");
process.exitCode = await command(process.argv.slice(2));
