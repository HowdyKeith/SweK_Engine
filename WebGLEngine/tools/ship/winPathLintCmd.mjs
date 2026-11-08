// WebGLEngine/tools/ship/winPathLintCmd.mjs -- UNNUMBERED. The command line of tools/ship/winPathLint.mjs, so that the library has a caller beside its own gate:
//   node tools\ship\winPathLintCmd.mjs [the same arguments as node tools\ship\winPathLint.mjs]
// (the library still runs by itself when it is the entry, as it always did; this file adds nothing to what it does).
const { main } = await import("./winPathLint.mjs");
process.exitCode = await main(process.argv.slice(2));
