// WebGLEngine/tools/ship/subNavRouteCondStudyCmd.mjs -- UNNUMBERED (v4926). The command line of tools/ship/subNavRouteCondStudy.mjs (see there for the arguments; its gate holds the library). This file
// exports nothing on purpose: it is the library's caller that is not a gate, so the library is not an orphan (tools/ship/graveyard-selfcheck.mjs).
//   node tools/ship/subNavRouteCondStudyCmd.mjs --set dev3                 DEV (seeds 901 to 930): check 4 (the chain bites, field only), checks 2 and 3, the sanity flights (not a result)
const { command } = await import("./subNavRouteCondStudy.mjs");
process.exitCode = await command(process.argv.slice(2));
