// WebGLEngine/tools/ship/advisorChipStudyCmd.mjs -- UNNUMBERED. The command line of the advisor chip test (tools/ship/advisorChipStudy.mjs); see there for the arguments.
import { command } from "./advisorChipStudy.mjs";
process.exitCode = await command(process.argv.slice(2));
