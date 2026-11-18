// WebGLEngine/tools/ship/latenessStudyCmd.mjs -- UNNUMBERED (v4926). The command line of tools/ship/latenessStudy.mjs (see there for the arguments; its gate holds the library). This file
// exports nothing on purpose: it is the library's caller that is not a gate, so the library is not an orphan (tools/ship/graveyard-selfcheck.mjs).
//   node tools/ship/latenessStudyCmd.mjs [--write]
const { command } = await import("./latenessStudy.mjs");
process.exitCode = await command(process.argv.slice(2));
