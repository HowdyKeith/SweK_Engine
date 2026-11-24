// WebGLEngine/tools/ship/takeSeekerEccmCmd.mjs -- UNNUMBERED (v4927). The command line of tools/ship/takeSeekerEccm.mjs (see there for the arguments and the registration; its gate holds the library). This file
// exports nothing on purpose: it is the library's caller that is not a gate, so the library is not an orphan (tools/ship/graveyard-selfcheck.mjs). The library still runs as a program too.
//   node tools/ship/takeSeekerEccmCmd.mjs dev  [--set smoke|dev] [--write]      the calibration: the six rungs of the ladder, each flown on the DEV geometries (91001 to 91024; `smoke` is geometries 1 to 4), and the rule's choice
//   node tools/ship/takeSeekerEccmCmd.mjs held --rung N [--write]                 the read, flown ONCE for rung N on the HELD geometries (93001 to 93024; Amendment A); --write writes brain/subEccmHeld.json and a second run refuses
const { command } = await import("./takeSeekerEccm.mjs");
process.exitCode = await command(process.argv.slice(2));
