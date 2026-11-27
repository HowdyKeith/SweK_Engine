// WebGLEngine/tools/ship/subTrafficUnderStudyCmd.mjs -- UNNUMBERED (v4926). The command line of tools/ship/subTrafficUnderStudy.mjs (see there for the arguments; its gate holds the library). This file
// exports nothing on purpose: it is the library's caller that is not a gate, so the library is not an orphan (tools/ship/graveyard-selfcheck.mjs).
//   node tools/ship/subTrafficUnderStudyCmd.mjs --set dev               DEV (seeds 1-30, spent): checks 1 and 3 and a sanity run, no verdict
const { command } = await import("./subTrafficUnderStudy.mjs");
process.exitCode = await command(process.argv.slice(2));
