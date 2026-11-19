// WebGLEngine/tools/ship/takeEvadeSeatCmd.mjs -- UNNUMBERED (v4927). The command line of tools/ship/takeEvadeSeat.mjs (see there for the arguments and the registration; its gate holds the library). This file
// exports nothing on purpose: it is the library's caller that is not a gate, so the library is not an orphan (tools/ship/graveyard-selfcheck.mjs). The library still runs as a program too.
//   node tools/ship/takeEvadeSeatCmd.mjs smoke                 the 17 sides against themselves on geometries 1 to 4; never recorded, free to read: the command runs
//   node tools/ship/takeEvadeSeatCmd.mjs dev  [--write]        the DEV read on geometries 106001 to 106024; --write records brain/subEvadeSeatDev.json once; DEV decides whether HELD is spent (rule R0)
//   node tools/ship/takeEvadeSeatCmd.mjs held --write          the HELD read on geometries 107001 to 107024, flown ONCE: refuses without a recorded DEV that holds R0, refuses without --write, refuses if brain/subEvadeSeatHeld.json exists
const { command } = await import("./takeEvadeSeat.mjs");
process.exitCode = await command(process.argv.slice(2));
