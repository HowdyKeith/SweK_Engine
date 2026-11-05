// WebGLEngine/tools/ship/plainNetVariantsCmd.mjs -- UNNUMBERED. The command line of the plain-net variants (tools/ship/plainNetVariants.mjs); see there for the arguments.
import { command } from "./plainNetVariants.mjs";
process.exitCode = await command(process.argv.slice(2));
