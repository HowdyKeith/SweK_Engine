// WebGLEngine/tools/ship/takeRotorLeagueCmd.mjs -- UNNUMBERED. The command line of tools/ship/takeRotorLeague.mjs, so that the library has a caller beside its own gate:
//   node tools\ship\takeRotorLeagueCmd.mjs [the same arguments as node tools\ship\takeRotorLeague.mjs]
// (the library still runs by itself when it is the entry, as it always did; this file adds nothing to what it does).
const { command } = await import("./takeRotorLeague.mjs");
process.exitCode = await command(process.argv.slice(2));
