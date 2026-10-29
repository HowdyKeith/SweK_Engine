// WebGLEngine/tools/ship/ensureBrowserGatesCmd.mjs -- the command of tools/ship/ensureBrowserGates.mjs (no exports on purpose).
// Run: node tools/ship/ensureBrowserGatesCmd.mjs [--dry-run] [--cap-mb N]
import { command } from "./ensureBrowserGates.mjs";
process.exitCode = command(process.argv.slice(2));
