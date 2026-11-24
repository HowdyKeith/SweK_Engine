// WebGLEngine/tools/ship/subNav3dStudyCmd.mjs -- UNNUMBERED. The command line of tools/ship/subNav3dStudy.mjs, so that the library has a caller beside its own gate:
//   node tools\ship\subNav3dStudyCmd.mjs [the same arguments as node tools\ship\subNav3dStudy.mjs]
// (the library still runs by itself when it is the entry, as it always did; this file adds nothing to what it does).
const { command } = await import("./subNav3dStudy.mjs");
process.exitCode = await command(process.argv.slice(2));
