// WebGLEngine/tools/ship/takeDeepPlainCmd.mjs -- UNNUMBERED. The command line of the round 11 reader (tools/ship/takeDeepPlain.mjs). The flight is takeRankingValidityCmd.mjs's (the first-order orientation step is set there); `plan` prints its command:
//   node tools/ship/takeDeepPlainCmd.mjs plan
//   node tools/ship/takeDeepPlainCmd.mjs report        (READ ONCE; OFFLINE)
import { command } from "./takeDeepPlain.mjs";
process.exitCode = await command(process.argv.slice(2));
