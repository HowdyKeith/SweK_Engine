// WebGLEngine/tools/ship/subDeepTransitStudyCmd.mjs -- UNNUMBERED (v4926). The command line of tools/ship/subDeepTransitStudy.mjs (see there for the arguments; its gate holds the library). This file
// exports nothing on purpose: it is the library's caller that is not a gate, so the library is not an orphan (tools/ship/graveyard-selfcheck.mjs).
//   node tools/ship/subDeepTransitStudyCmd.mjs --set dev|held82 [--write]
const { command } = await import("./subDeepTransitStudy.mjs");
process.exitCode = await command(process.argv.slice(2));
