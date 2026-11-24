// WebGLEngine/tools/ship/takeEvadeOpponentCmd.mjs -- UNNUMBERED (v4927). The command line of tools/ship/takeEvadeOpponent.mjs (see there for the arguments and the registration; its gate holds the library). This file
// exports nothing on purpose: it is the library's caller that is not a gate, so the library is not an orphan (tools/ship/graveyard-selfcheck.mjs). The library still runs as a program too.
//   node tools/ship/takeEvadeOpponentCmd.mjs smoke                 the matchups on geometries 1 to 4; never recorded, free to read: the command runs
//   node tools/ship/takeEvadeOpponentCmd.mjs dev  [--write]        the DEV read on geometries 104001 to 104024; --write records brain/subEvadeOpponentDev.json once; DEV decides whether HELD is spent (rule R0)
//   node tools/ship/takeEvadeOpponentCmd.mjs held --write          the HELD read on geometries 105001 to 105024, flown ONCE: refuses without a recorded DEV that replicates, refuses without --write, refuses if brain/subEvadeOpponentHeld.json exists
const { command } = await import("./takeEvadeOpponent.mjs");
process.exitCode = await command(process.argv.slice(2));
