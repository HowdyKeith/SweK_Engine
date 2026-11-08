// WebGLEngine/tools/ship/takeCountermeasuresCmd.mjs -- UNNUMBERED. The command line of tools/ship/takeCountermeasures.mjs, so that the library has a caller beside its own gate:
//   node tools\ship\takeCountermeasuresCmd.mjs [the same arguments as node tools\ship\takeCountermeasures.mjs]
// (the library still runs by itself when it is the entry, as it always did; this file adds nothing to what it does).
const { command } = await import("./takeCountermeasures.mjs");
process.exitCode = await command(process.argv.slice(2));
