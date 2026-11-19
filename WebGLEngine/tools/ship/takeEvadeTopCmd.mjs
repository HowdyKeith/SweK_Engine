// WebGLEngine/tools/ship/takeEvadeTopCmd.mjs -- UNNUMBERED (v4927). The command line of tools/ship/takeEvadeTop.mjs (see there for the arguments and the registration; its gate holds the library). This file
// exports nothing on purpose: it is the library's caller that is not a gate, so the library is not an orphan (tools/ship/graveyard-selfcheck.mjs). The library still runs as a program too.
//   node tools/ship/takeEvadeTopCmd.mjs smoke                 the 22 matchups on geometries 1 to 4; never recorded, free to read: the command runs
//   node tools/ship/takeEvadeTopCmd.mjs dev  [--write]        the DEV read on geometries 130001 to 130096 (96); --write records brain/subEvadeTopDev.json once; DEV decides whether HELD is spent (rule R0)
//   node tools/ship/takeEvadeTopCmd.mjs held --write          the HELD read on geometries 131001 to 131096 (96), flown ONCE: refuses without a recorded DEV that replicates and lists no failed check, refuses without --write, refuses if brain/subEvadeTopHeld.json exists
const { command } = await import("./takeEvadeTop.mjs");
process.exitCode = await command(process.argv.slice(2));
