// WebGLEngine/tools/ship/takeEvadeLadderCmd.mjs -- UNNUMBERED (v4927). The command line of tools/ship/takeEvadeLadder.mjs (see there for the arguments and the registration; its gate holds the library). This file
// exports nothing on purpose: it is the library's caller that is not a gate, so the library is not an orphan (tools/ship/graveyard-selfcheck.mjs). The library still runs as a program too.
//   node tools/ship/takeEvadeLadderCmd.mjs smoke                 the 26 matchups on geometries 1 to 4; never recorded, free to read: the command runs
//   node tools/ship/takeEvadeLadderCmd.mjs dev  [--write]        the DEV read on geometries 114001 to 114048; --write records brain/subEvadeLadderDev.json once; DEV decides whether HELD is spent (rule R0)
//   node tools/ship/takeEvadeLadderCmd.mjs held --write          the HELD read on geometries 115001 to 115048, flown ONCE: refuses without a recorded DEV that replicates and lists no failed check, refuses without --write, refuses if brain/subEvadeLadderHeld.json exists
const { command } = await import("./takeEvadeLadder.mjs");
process.exitCode = await command(process.argv.slice(2));
