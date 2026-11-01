// WebGLEngine/tools/ship/subNavigatorReferenceCmd.mjs -- UNNUMBERED. THE COMMAND for tools/ship/subNavigatorReference.mjs (see its header for the two lines that call it). NO EXPORTS ON PURPOSE.
"use strict";
import { command } from "./subNavigatorReference.mjs";

process.exit(await command(process.argv.slice(2)));
