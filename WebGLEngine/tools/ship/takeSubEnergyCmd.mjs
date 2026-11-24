// WebGLEngine/tools/ship/takeSubEnergyCmd.mjs -- UNNUMBERED (v4927). The command line of tools/ship/takeSubEnergy.mjs (see there for the arguments and the registration; its gate holds the library). This file
// exports nothing on purpose: it is the library's caller that is not a gate, so the library is not an orphan (tools/ship/graveyard-selfcheck.mjs). The library still runs as a program too.
//   node tools/ship/takeSubEnergyCmd.mjs dev [--set smoke|dev] [--write]       the calibration: the five capacities of the ladder, the search-ping champion against the default tactician on the DEV geometries (94001 to 94024), and where the cost BINDS
//   node tools/ship/takeSubEnergyCmd.mjs held --rung N --write                 read 1, flown ONCE for rung N on the HELD geometries (95001 to 95024): the four doctrines' round robin with and without the cost
//   node tools/ship/takeSubEnergyCmd.mjs retune [--dir brain] [--write]        read 2: the four searches of tools/tuneSubTactics.mjs --needs (seeds 6100 to 6103, files subEnergyTuned610N.json) against the no-cost champion
const { command } = await import("./takeSubEnergy.mjs");
process.exitCode = await command(process.argv.slice(2));
