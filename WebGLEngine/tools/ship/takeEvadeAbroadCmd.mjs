// WebGLEngine/tools/ship/takeEvadeAbroadCmd.mjs -- UNNUMBERED (v4927). The command line of tools/ship/takeEvadeAbroad.mjs (see there for the arguments and the registration; its gate holds the library). This file
// exports nothing on purpose: it is the library's caller that is not a gate, so the library is not an orphan (tools/ship/graveyard-selfcheck.mjs). The library still runs as a program too.
//   node tools/ship/takeEvadeAbroadCmd.mjs smoke                 the 44 matchups on geometries 1 to 4; never recorded, free to read: the command runs
//   node tools/ship/takeEvadeAbroadCmd.mjs dev  [--write]        the DEV read on geometries 132001 to 132096 (96); --write records brain/subEvadeAbroadDev.json once; DEV decides whether HELD is spent (rule R0)
//   node tools/ship/takeEvadeAbroadCmd.mjs held --write          the HELD read on geometries 133001 to 133096 (96), flown ONCE: refuses without a recorded DEV that replicates and lists no failed check, refuses without --write, refuses if brain/subEvadeAbroadHeld.json exists
const { command } = await import("./takeEvadeAbroad.mjs");
process.exitCode = await command(process.argv.slice(2));
