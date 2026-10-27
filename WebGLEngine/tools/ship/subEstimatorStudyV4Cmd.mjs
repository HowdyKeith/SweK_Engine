// WebGLEngine/tools/ship/subEstimatorStudyV4Cmd.mjs -- UNNUMBERED. The command line of the rung 4a version 4 study (tools/ship/subEstimatorStudyV4.mjs); see there for the arguments.
import { command } from "./subEstimatorStudyV4.mjs";
process.exitCode = await command(process.argv.slice(2));
