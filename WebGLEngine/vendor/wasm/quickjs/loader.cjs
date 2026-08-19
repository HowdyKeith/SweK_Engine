// vendor/wasm/quickjs/loader.cjs — loads the loosely-vendored QuickJS (no node_modules).
// The variant + core dist files are plain CommonJS; the only bare specifier anywhere in the
// runtime path is "@jitl/quickjs-ffi-types" (a types + enum-constants module), which we remap
// to the vendored copy via a scoped Module._resolveFilename hook. Returns { core, variant }.
"use strict";
const path = require("path");
const Module = require("module");
const HERE = __dirname;

let _patched = false;
function patchResolve() {
    if (_patched) return; _patched = true;
    const orig = Module._resolveFilename;
    Module._resolveFilename = function (request, parent, isMain, options) {
        if (request === "@jitl/quickjs-ffi-types") {
            return orig.call(this, path.join(HERE, "quickjs-ffi-types", "dist", "index.js"), parent, isMain, options);
        }
        return orig.call(this, request, parent, isMain, options);
    };
}

function load() {
    patchResolve();
    const core = require(path.join(HERE, "quickjs-emscripten-core", "dist", "index.js"));
    const variant = require(path.join(HERE, "quickjs-wasmfile-release-sync", "dist", "index.js"));
    return { core, variant: variant.default || variant };
}

module.exports = { load };
