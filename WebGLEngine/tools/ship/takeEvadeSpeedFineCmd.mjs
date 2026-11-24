// WebGLEngine/tools/ship/takeEvadeSpeedFineCmd.mjs -- UNNUMBERED (v4927). The command line of tools/ship/takeEvadeSpeedFine.mjs (see there for the arguments and the registration; its gate holds the library). This file
// exports nothing on purpose: it is the library's caller that is not a gate, so the library is not an orphan (tools/ship/graveyard-selfcheck.mjs). The library still runs as a program too.
//   node tools/ship/takeEvadeSpeedFineCmd.mjs smoke                 the 24 arms, 19 steps and 4 spans on geometries 1 to 4; never recorded, free to read: the command runs
//   node tools/ship/takeEvadeSpeedFineCmd.mjs dev  [--write]        the DEV read on geometries 110001 to 110048; --write records brain/subEvadeSpeedFineDev.json once; DEV decides whether HELD is spent (rule R0)
//   node tools/ship/takeEvadeSpeedFineCmd.mjs held --write          the HELD read on geometries 111001 to 111048, flown ONCE: refuses without a recorded DEV that replicates and lists no failed check, refuses without --write, refuses if brain/subEvadeSpeedFineHeld.json exists
const { command } = await import("./takeEvadeSpeedFine.mjs");
process.exitCode = await command(process.argv.slice(2));
