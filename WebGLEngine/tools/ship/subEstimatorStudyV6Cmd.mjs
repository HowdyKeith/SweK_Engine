// WebGLEngine/tools/ship/subEstimatorStudyV6Cmd.mjs -- UNNUMBERED. The command line of the rung 4a version 6 study (tools/ship/subEstimatorStudyV6.mjs); see there for the arguments.
import { command } from "./subEstimatorStudyV6.mjs";
process.exitCode = await command(process.argv.slice(2));
