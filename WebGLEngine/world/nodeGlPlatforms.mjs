// WebGLEngine/world/nodeGlPlatforms.mjs -- v4291
//
// *** NATIVE OPENGL IN NODE: WHAT IT ACTUALLY COSTS, AND THE FOUR CORRECTIONS THAT COST ME NOTHING TO MAKE
// AND WOULD HAVE COST A PERSON AN AFTERNOON. ***
//
// The open list has carried this item for a long time:
//
//     #122  "node-3d family + wgpuEngine: all six MIT, and the one that matters is native WebGL in Node"
//
// world/namedNotChecked.mjs exists because two OTHER open-list items asserted licence states for repositories
// whose names appear nowhere in this tree. #122 is the same shape and was not in that file's scope. It is now
// checked, and the sentence was wrong in three of its four claims.
//
// ================================================================================================
// THE CORRECTIONS
// ================================================================================================
//
//   "family"        -> node-3d is a GITHUB ORGANISATION OF 33 REPOSITORIES, not a family of six. The count in
//                      the note was invented; nobody had opened it.
//   "node-3d"       -> THERE IS NO npm PACKAGE BY THAT NAME. `npm view node-3d` is a 404. The scope is
//                      @node-3d/*, and the repository actually called node-3d is a documentation repo whose
//                      package.json says version 0.0.0 and license "None" -- which is very likely where the
//                      idea that something here is unlicensed would have come from, had anyone looked.
//   "all six MIT"   -> RIGHT, for the five that matter. webgl, core, glfw, deps-opengl and addon-tools each
//                      declare MIT and each ships a LICENSE file. This is the one claim that survived.
//   "native WebGL"  -> TRUE BUT NOT THE USEFUL KIND. See THE PART THAT MATTERS, below.
//
// A fifth correction belongs to me rather than to the note: I told Keith this needed a C toolchain --
// node-gyp, build-essential on Linux, MSVC Build Tools on Windows, Xcode CLT on macOS. *** IT NEEDS NO
// COMPILER AT ALL. *** Every package's install.js downloads a PREBUILT binary from that repository's GitHub
// Releases. Measured here: 4 packages, 3 seconds, ~7 MB on disk, and a webgl.node that loads.
//
// ================================================================================================
// THE PART THAT MATTERS, AND IT UNDOES THE REASON FOR WANTING IT
// ================================================================================================
//
// The argument for this dependency was that SweK's shader gates could stop paying for headless Chromium. They
// cannot:
//
//     GLFW Error 65550: Failed to detect any supported platform
//     Error: Failed to initialize GLFW
//
// GLFW opens a WINDOW. It needs a display server, and on a headless box it does not initialise at all. So
// @node-3d gives a native desktop OpenGL window driven from Node -- a real capability, and a different one
// from the capability that was wanted. On a workstation it works; in CI or a container it cannot run.
//
// `gl` (stackgl/headless-gl) is the package that does the headless job, and it is BSD-2-Clause rather than
// MIT -- a fourth licence correction, since the note's "all MIT" would have swept it in. It also returns null
// on this box: libGL and libX11 are present, libEGL and OSMesa are not, and there is no display. So the
// headless question is OPEN, not answered, and it is deliberately not answered here.
//
// ================================================================================================
// MEASURED HERE VERSUS READ UPSTREAM, KEPT APART
// ================================================================================================
//
// This distinction is the whole reason the file is trustworthy, and collapsing it would make it another #122.
//
//   MEASURED on this machine (linux-x64): the install runs without a compiler, the binaries land, the addon
//   loads, gl.getParameter is a function, and GLFW refuses to initialise headless.
//
//   READ from upstream source, NOT executed: the platform list. It comes from addon-tools/ts/include.ts, whose
//   map has exactly four entries. NOBODY HERE HAS RUN THIS ON WINDOWS, ON A MAC, OR ON ARM. The list says what
//   the package will LOOK FOR; it is not a report that those builds exist and work.
"use strict";

/** The five packages that are real, with the licence each declares and a LICENSE file to back it. */
export const PACKAGES = Object.freeze([
    Object.freeze({ npm: "@node-3d/webgl", repo: "node-3d/webgl", version: "6.0.1", licence: "MIT", prebuilt: true }),
    Object.freeze({ npm: "@node-3d/core", repo: "node-3d/core", version: "6.3.0", licence: "MIT", prebuilt: false }),
    Object.freeze({ npm: "@node-3d/glfw", repo: "node-3d/glfw", version: "7.3.1", licence: "MIT", prebuilt: true }),
    Object.freeze({ npm: "@node-3d/deps-opengl", repo: "node-3d/deps-opengl", version: "8.0.2", licence: "MIT", prebuilt: true }),
    Object.freeze({ npm: "@node-3d/addon-tools", repo: "node-3d/addon-tools", version: "10.0.5", licence: "MIT", prebuilt: false }),
]);

/**
 * *** THE FOUR PREBUILT PLATFORM PAIRS, AND THE HOLE. ***
 *
 * Read off addon-tools/ts/include.ts, which maps "<process.platform>-<process.arch>" to a binary directory
 * name. A pair absent from that map gets no bin-<name> directory and therefore no binary.
 *
 * darwin-arm64 IS ABSENT. Every Apple Silicon Mac -- which is every Mac sold since 2020 -- is outside this
 * list. Intel Macs are inside it. That is the single most surprising fact in the file and the one most likely
 * to waste somebody's evening, so it is a named export rather than a line of prose.
 */
export const PLATFORMS = Object.freeze(["win32-x64", "linux-x64", "darwin-x64", "linux-arm64"]);
export const PLATFORM_DIRS = Object.freeze({
    "win32-x64": "windows", "linux-x64": "linux", "darwin-x64": "osx", "linux-arm64": "aarch64",
});
// v4291 -- *** THE GATE CAUGHT THIS FILE UNDER-RECORDING ITS OWN GAP. *** The first draft listed only
// darwin-arm64, because Apple Silicon is the one a person notices. The check that MISSING must equal what an
// os x arch product would over-admit came back red and named win32-arm64 too: Windows on ARM has no prebuilt
// either. Writing down the surprising half of a gap and not the boring half is how the boring half bites.
export const MISSING = Object.freeze(["win32-arm64", "darwin-arm64"]);
export const MISSING_NOTE =
    "Neither ARM desktop pair has a @node-3d prebuilt: Apple Silicon (darwin-arm64) and Windows on ARM (win32-arm64) both fall outside the map, while linux-arm64 is inside it -- so this is not 'ARM is unsupported', it is three specific OS-and-chip combinations that were built and one pair per OS that was not. Not an OS-version problem and not fixable by upgrading; the binary does not exist. Intel Macs (darwin-x64) and x64 Windows are supported.";

/** What the packages ask of the runtime. Warned by npm as EBADENGINE; NOT enforced -- it loaded on node 22. */
export const ENGINE = Object.freeze({
    node: ">=24.13.0", npm: ">=11.6.2",
    enforced: false,
    observed: "installed and loaded on node v22.22.2 / npm 10.9.7 with EBADENGINE warnings and no failure",
});

/** The install, as it actually behaved here. No compiler ran. */
export const INSTALL = Object.freeze({
    command: "npm i @node-3d/webgl",
    packages: 4, seconds: 3, megabytes: 7,
    compiler: false, nodeGyp: false,
    mechanism: "install.js fetches a prebuilt archive from the package's own GitHub Releases",
    landed: Object.freeze(["@node-3d/webgl/bin-linux/webgl.node", "@node-3d/deps-opengl/bin-linux",
                           "@node-3d/segfault/bin-linux/segfault.node"]),
    measuredOn: "linux-x64",
});

/** The finding that decides what this dependency is FOR. */
export const HEADLESS = Object.freeze({
    works: false,
    error: "GLFW Error 65550: Failed to detect any supported platform",
    because: "GLFW opens a window and needs a display server",
    soItIs: "a native desktop OpenGL window driven from Node",
    soItIsNot: "a headless replacement for the Chromium the shader gates use",
    alternative: Object.freeze({ npm: "gl", repo: "stackgl/headless-gl", licence: "BSD-2-Clause",
                                 status: "returns null here: libGL and libX11 present, libEGL and OSMesa absent, no display",
                                 verdict: "OPEN -- not investigated further this round, and deliberately not claimed either way" }),
});

/** True when this exact machine has a prebuilt. Pure: the environment is passed in, never read here. */
export function supports(env) {
    const pair = `${env.platform}-${env.arch}`;
    return { pair, supported: PLATFORMS.includes(pair), dir: PLATFORM_DIRS[pair] || null };
}

/** What the catalog row must declare, derived here so the row and this file cannot drift apart. */
export const CATALOG_REQUIRES = Object.freeze({
    platforms: PLATFORMS,
    why: "@node-3d ships prebuilt binaries only, for four platform/arch pairs. " + MISSING_NOTE,
});
