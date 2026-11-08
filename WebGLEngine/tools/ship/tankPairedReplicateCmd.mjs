// WebGLEngine/tools/ship/tankPairedReplicateCmd.mjs -- UNNUMBERED. The command line of tools/ship/tankPairedReplicate.mjs, so that the library has a caller beside its own gate:
//   node tools\ship\tankPairedReplicateCmd.mjs [the same arguments as node tools\ship\tankPairedReplicate.mjs]
// (the library still runs by itself when it is the entry, as it always did; this file adds nothing to what it does).
const { main } = await import("./tankPairedReplicate.mjs");
process.exitCode = await main(process.argv.slice(2));
