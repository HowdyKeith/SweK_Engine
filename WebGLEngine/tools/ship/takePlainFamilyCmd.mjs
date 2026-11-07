// WebGLEngine/tools/ship/takePlainFamilyCmd.mjs -- UNNUMBERED. The command line of the round 10 reader (tools/ship/takePlainFamily.mjs). The training and the flights are the existing commands' (the first-order orientation step is set there); `plan` prints every command of the registration from the ledgers:
//   node tools/ship/takePlainFamilyCmd.mjs plan          (after the two ledgers are in: the common-block flight and one flight for each eligible new search)
//   node tools/ship/takePlainFamilyCmd.mjs report        (READ ONCE; OFFLINE)
import { command } from "./takePlainFamily.mjs";
process.exitCode = await command(process.argv.slice(2));
