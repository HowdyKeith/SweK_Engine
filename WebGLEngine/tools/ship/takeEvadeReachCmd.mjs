// WebGLEngine/tools/ship/takeEvadeReachCmd.mjs -- UNNUMBERED (v4927). The command line of tools/ship/takeEvadeReach.mjs (see there for the arguments and the registration; its gate holds the library). This file
// exports nothing on purpose: it is the library's caller that is not a gate, so the library is not an orphan (tools/ship/graveyard-selfcheck.mjs). The library still runs as a program too.
//   node tools/ship/takeEvadeReachCmd.mjs smoke                 the 28 matchups on geometries 1 to 4; never recorded, free to read: the command runs
//   node tools/ship/takeEvadeReachCmd.mjs dev  [--write]        the DEV read on geometries 122001 to 122048; --write records brain/subEvadeReachDev.json once; DEV decides whether HELD is spent (rule R0)
//   node tools/ship/takeEvadeReachCmd.mjs held --write          the HELD read on geometries 123001 to 123048, flown ONCE: refuses without a recorded DEV that replicates and lists no failed check, refuses without --write, refuses if brain/subEvadeReachHeld.json exists
const { command } = await import("./takeEvadeReach.mjs");
process.exitCode = await command(process.argv.slice(2));
