// WebGLEngine/tools/ship/trainNeedsCircuitCmd.mjs -- UNNUMBERED. The command line of piece 4 (tools/ship/trainNeedsCircuit.mjs); see there for the arguments.
import { command } from "./trainNeedsCircuit.mjs";
process.exitCode = await command(process.argv.slice(2));
