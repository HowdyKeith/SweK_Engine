// WebGLEngine/tools/ship/localModelCmd.mjs -- the command of tools/ship/localModel.mjs (no exports on purpose).
// Run: node tools/ship/localModelCmd.mjs status | setup [--model <tag>] [--yes] | inventory [--check-new] | smoke [--model <tag>] [--tries N]
import { command } from "./localModel.mjs";
process.exitCode = await command(process.argv.slice(2));
