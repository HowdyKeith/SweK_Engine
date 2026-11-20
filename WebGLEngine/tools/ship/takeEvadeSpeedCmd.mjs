// WebGLEngine/tools/ship/takeEvadeSpeedCmd.mjs -- UNNUMBERED (v4927). The command line of tools/ship/takeEvadeSpeed.mjs (see there for the arguments and the registration; its gate holds the library). This file
// exports nothing on purpose: it is the library's caller that is not a gate, so the library is not an orphan (tools/ship/graveyard-selfcheck.mjs). The library still runs as a program too.
//   node tools/ship/takeEvadeSpeedCmd.mjs smoke                 the 24 arms, 21 steps and 6 spans on geometries 1 to 4; never recorded, free to read: the command runs
//   node tools/ship/takeEvadeSpeedCmd.mjs dev  [--write]        the DEV read on geometries 108001 to 108024; --write records brain/subEvadeSpeedDev.json once; DEV decides whether HELD is spent (rule R0)
//   node tools/ship/takeEvadeSpeedCmd.mjs held --write          the HELD read on geometries 109001 to 109024, flown ONCE: refuses without a recorded DEV that replicates, refuses without --write, refuses if brain/subEvadeSpeedHeld.json exists
const { command } = await import("./takeEvadeSpeed.mjs");
process.exitCode = await command(process.argv.slice(2));
