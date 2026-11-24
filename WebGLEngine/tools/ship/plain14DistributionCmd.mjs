// WebGLEngine/tools/ship/plain14DistributionCmd.mjs -- UNNUMBERED. The command line of the round 7 stage 1 report (tools/ship/plain14Distribution.mjs):
//   node tools\ship\plain14DistributionCmd.mjs report --dir brain\rig-results\plain14        (READ ONCE, when all twenty dumps are in)
// It trains nothing and flies nothing. NO orientation default is set: the dumps were made by tools/ship/trainPilotSub.mjs under the engine's default (RK4), as the sub notes were.
import { command } from "./plain14Distribution.mjs";
process.exitCode = await command(process.argv.slice(2));
