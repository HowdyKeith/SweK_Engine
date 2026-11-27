// WebGLEngine/tools/ship/takeEvadeGatesCmd.mjs -- UNNUMBERED (v4927). The command line of tools/ship/takeEvadeGates.mjs (see there for the arguments and the registration; its gate holds the library). This file
// exports nothing on purpose: it is the library's caller that is not a gate, so the library is not an orphan (tools/ship/graveyard-selfcheck.mjs). The library still runs as a program too.
//   node tools/ship/takeEvadeGatesCmd.mjs smoke                 the 66 matchups on geometries 1 to 4; never recorded, free to read: the command runs
//   node tools/ship/takeEvadeGatesCmd.mjs dev  [--write]        the DEV read on geometries 126001 to 126048; --write records brain/subEvadeGatesDev.json once; DEV decides whether HELD is spent (rule R0)
//   node tools/ship/takeEvadeGatesCmd.mjs held --write          the HELD read on geometries 127001 to 127048, flown ONCE: refuses without a recorded DEV that replicates and lists no failed check, refuses without --write, refuses if brain/subEvadeGatesHeld.json exists
const { command } = await import("./takeEvadeGates.mjs");
process.exitCode = await command(process.argv.slice(2));
