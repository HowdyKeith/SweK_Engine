// WebGLEngine/tools/ship/takeEvadeMoveCmd.mjs -- UNNUMBERED (v4927). The command line of tools/ship/takeEvadeMove.mjs (see there for the arguments and the registration; its gate holds the library). This file
// exports nothing on purpose: it is the library's caller that is not a gate, so the library is not an orphan (tools/ship/graveyard-selfcheck.mjs). The library still runs as a program too.
//   node tools/ship/takeEvadeMoveCmd.mjs smoke                 the 28 matchups on geometries 1 to 4; never recorded, free to read: the command runs
//   node tools/ship/takeEvadeMoveCmd.mjs dev  [--write]        the DEV read on geometries 116001 to 116048; --write records brain/subEvadeMoveDev.json once; DEV decides whether HELD is spent (rule R0)
//   node tools/ship/takeEvadeMoveCmd.mjs held --write          the HELD read on geometries 117001 to 117048, flown ONCE: refuses without a recorded DEV that replicates and lists no failed check, refuses without --write, refuses if brain/subEvadeMoveHeld.json exists
const { command } = await import("./takeEvadeMove.mjs");
process.exitCode = await command(process.argv.slice(2));
