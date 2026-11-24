// WebGLEngine/tools/ship/takeEvadeTrackCmd.mjs -- UNNUMBERED (v4927). The command line of tools/ship/takeEvadeTrack.mjs (see there for the arguments and the registration; its gate holds the library). This file
// exports nothing on purpose: it is the library's caller that is not a gate, so the library is not an orphan (tools/ship/graveyard-selfcheck.mjs). The library still runs as a program too.
//   node tools/ship/takeEvadeTrackCmd.mjs smoke                 the 29 matchups on geometries 1 to 4; never recorded, free to read: the command runs
//   node tools/ship/takeEvadeTrackCmd.mjs dev  [--write]        the DEV read on geometries 118001 to 118048; --write records brain/subEvadeTrackDev.json once; DEV decides whether HELD is spent (rule R0)
//   node tools/ship/takeEvadeTrackCmd.mjs held --write          the HELD read on geometries 119001 to 119048, flown ONCE: refuses without a recorded DEV that replicates and lists no failed check, refuses without --write, refuses if brain/subEvadeTrackHeld.json exists
const { command } = await import("./takeEvadeTrack.mjs");
process.exitCode = await command(process.argv.slice(2));
