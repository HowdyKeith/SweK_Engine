// WebGLEngine/tools/ship/trainSubVestibularCmd.mjs -- UNNUMBERED. The command line of the rung 4b trainer (tools/ship/trainSubVestibular.mjs); see there for the arguments.
import { command } from "./trainSubVestibular.mjs";
process.exitCode = await command(process.argv.slice(2));
