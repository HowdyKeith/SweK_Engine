// WebGLEngine/tools/ship/advisorLiveCmd.mjs -- UNNUMBERED. The command line of the language-model chip's live adapter (tools/ship/advisorLive.mjs); see there for the arguments.
import { command } from "./advisorLive.mjs";
process.exitCode = await command(process.argv.slice(2));
