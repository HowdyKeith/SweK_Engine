// WebGLEngine/tools/ship/navEnergyStudyCmd.mjs -- UNNUMBERED (v4926). The command line of tools/ship/navEnergyStudy.mjs (see there for the arguments; its gate holds the library). This file
// exports nothing on purpose: it is the library's caller that is not a gate, so the library is not an orphan (tools/ship/graveyard-selfcheck.mjs).
//   node tools/ship/navEnergyStudyCmd.mjs --set dev|held80 [--write]
const { command } = await import("./navEnergyStudy.mjs");
process.exitCode = await command(process.argv.slice(2));
