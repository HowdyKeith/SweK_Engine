// WebGLEngine/tools/ship/probe/fsShim.mjs -- v4567
//
// *** THIS EXISTS BECAUSE A NAMED IMPORT OF A BUILTIN IS NOT THE BUILTIN'S EXPORTS OBJECT. ***
// v4566 patched `fs.readFileSync` on the default-export object, which is what a CJS require and a DEFAULT
// import both hand out -- and disqualified 102 gates that write `import { readFileSync } from "node:fs"`,
// on the stated theory that a named binding is resolved when the module links and may not route through the
// patch. MEASURED at v4567: it does not route through it AT ALL. A file reading through a named import
// recorded an EMPTY set, not a partial one, so the disqualifier was doing real work and the empty-set rule
// would have caught it anyway.
//
// A module.register() loader hook redirects `node:fs` to this module, so the named bindings a gate imports
// ARE these functions. `export *` re-exports everything else unchanged, and a local export wins over a
// star-export of the same name, so the overrides below are the only difference from the real thing.
export * from "node:fs";
import real from "node:fs";
import { addRead, addDir } from "./record.mjs";

export const readFileSync = (p, ...r) => { addRead(p); return real.readFileSync(p, ...r); };
export const readFile = (p, ...r) => { addRead(p); return real.readFile(p, ...r); };
export const openSync = (p, ...r) => { addRead(p); return real.openSync(p, ...r); };
export const createReadStream = (p, ...r) => { addRead(p); return real.createReadStream(p, ...r); };
// A stat is a read of the DIRECTORY ENTRY rather than of the file, and a gate that stats a path to decide
// whether it exists depends on that path existing -- so an ABSENCE is a dependency and is recorded as one.
export const readdirSync = (p, ...r) => { addDir(p); return real.readdirSync(p, ...r); };
export const readdir = (p, ...r) => { addDir(p); return real.readdir(p, ...r); };
export const statSync = (p, ...r) => { addDir(p); return real.statSync(p, ...r); };
export const lstatSync = (p, ...r) => { addDir(p); return real.lstatSync(p, ...r); };
export const existsSync = (p, ...r) => { addDir(p); return real.existsSync(p, ...r); };
export default real;
