// WebGLEngine/tools/ship/plainNetStudyCmd.mjs -- UNNUMBERED. The command line of the plain-net control of rung 4b (tools/ship/plainNetStudy.mjs); see there for the arguments.
import { command } from "./plainNetStudy.mjs";
process.exitCode = await command(process.argv.slice(2));
