// WebGLEngine/tools/ship/takeSubTournamentCmd.mjs -- UNNUMBERED (v4927). The command line of tools/ship/takeSubTournament.mjs (see there for the arguments and the registration; its gate holds the library). This file
// exports nothing on purpose: it is the library's caller that is not a gate, so the library is not an orphan (tools/ship/graveyard-selfcheck.mjs). The library still runs as a program too.
//   node tools/ship/takeSubTournamentCmd.mjs [--only id,id,...] [--geometries N] [--first SEED] [--smoke] [--record FILE]
const { command } = await import("./takeSubTournament.mjs");
process.exitCode = await command(process.argv.slice(2));
