// WebGLEngine/tools/ship/wireframeHead-selfcheck.mjs
//
// Run: node tools/ship/wireframeHead-selfcheck.mjs   (~3s -- MEASURED)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// v3239 -- ONE DEFINITION OF THE WIREFRAME HEAD'S SHAPE.
//
// The Pip-Boy's main screen wants the same head thead.html draws, and a second copy of those fifty lines would
// have been THE NINTH INSTANCE THIS SESSION of a thing declared twice and compared never: MODES in nine files,
// the gate-file walk in three, a mesher's liveness in four records, stated runtime in 59 of 82 headers,
// page-index's 256 against pageReach's 315, two limb-severance implementations, two page groupings.
//
// *** WHAT MOVED IS THE GEOMETRY AND NOTHING ELSE, AND THAT IS THE DESIGN RATHER THAN A SHORTCUT. *** thead.html
// carries ~450 further lines: a mood vocabulary, LIVE CHANNELS shaped exactly like a MOODS entry, a face-rig
// feed (ui/faceRig.js passes channelSource "face"), signalLost handling, a gesture vocabulary. Relocating that
// would be a large refactor with real regression risk on a page Keith uses, to solve a problem nobody has --
// only ONE page drives it. THE SHAPE IS WHAT WOULD DIVERGE.
//
// AND THE EXTRACTION IS PROVEN BY THE PAGE STILL ASKING FOR IT. thead.html imports the module and destructures
// the same names it used to declare, so if the module stops returning one, the page breaks loudly rather than
// silently drawing a head with no jaw.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { noComments, codeOnly, prose } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const modRaw = fs.readFileSync(path.join(ROOT, "face", "wireframeHead.js"), "utf8");
const mod = codeOnly(modRaw);
const page = fs.readFileSync(path.join(ROOT, "thead.html"), "utf8");
const pageCode = codeOnly(page);

// ---- 1. THE SHAPE IS DEFINED ONCE -------------------------------------------------------------------------------------
{
    ok("!! *** the head geometry is built in the MODULE, not in the page ***",
        /IcosahedronGeometry/.test(mod) && !/IcosahedronGeometry/.test(pageCode),
        "the skull is a squashed icosphere and it is declared in exactly one file. A SECOND COPY WOULD BE THE " +
        "NINTH INSTANCE THIS SESSION of a thing declared twice and compared never");

    ok("...and the page asks for it by import",
        /buildWireframeHead/.test(pageCode) && /face\/wireframeHead\.js/.test(page),
        "THE EXTRACTION IS PROVEN BY THE PAGE STILL WORKING -- an extraction nobody consumes is a copy with a " +
        "better address");
}

// ---- 2. IT BUILDS, AND EVERY HANDLE THE ANIMATION NEEDS COMES BACK ------------------------------------------------------
{
    const { buildWireframeHead } = await import(pathToFileURL(path.join(ROOT, "face", "wireframeHead.js")).href);
    // A THREE stand-in: this gate has no GPU and needs none -- the module only COMPOSES objects.
    const mk = () => ({ children: [], add(c) { this.children.push(c); return this; }, position: { y: 0, set() {} },
                        scale: { set() {} }, rotation: { x: 0, y: 0, z: 0 },
                        traverse(f) { f(this); this.children.forEach((c) => c.traverse && c.traverse(f)); } });
    const geo = () => ({ dispose() {} });
    // `new THREE.Group()` -- ARROW FUNCTIONS ARE NOT CONSTRUCTIBLE, and my first stand-in used them, so the
    // gate crashed with "THREE.Group is not a constructor" while the module was perfectly fine. The stand-in has
    // to be callable the way the real library is called, which is the whole point of driving it rather than
    // reading it.
    function G() { return mk(); }
    function M(g, m) { const o = mk(); o.geometry = g; o.material = m; return o; }
    function Mat(o) { return { ...o, dispose() {} }; }
    function Geo() { return geo(); }
    const THREE = { Group: G, Mesh: M, MeshBasicMaterial: Mat,
                    IcosahedronGeometry: Geo, TorusGeometry: Geo, BoxGeometry: Geo, SphereGeometry: Geo,
                    CylinderGeometry: Geo };
    const rig = buildWireframeHead(THREE);

    // DERIVED FROM THE PAGE, NOT TYPED HERE: whatever thead.html destructures is what the module must return.
    const destr = (pageCode.match(/const \{([^}]+)\} = _rig;/) || [, ""])[1];
    const wanted = destr.split(",").map((x) => x.trim()).filter(Boolean);
    const missing = wanted.filter((k) => rig[k] === undefined);

    ok("!! *** every name the page destructures is a name the module returns ***",
        wanted.length >= 12 && missing.length === 0,
        wanted.length + " handles, checked against the page's OWN destructuring rather than a list typed here -- " +
        "so adding a part to one side and not the other fails HERE instead of drawing a head with no jaw" +
        (missing.length ? ". MISSING: " + missing.join(", ") : ""));

    ok("!! ...and it is ONE root group, which is the point of the extraction",
        rig.root && rig.root.children.length === 3,
        "thead.html added the head to the scene and the neck and torso SEPARATELY, because they must not nod " +
        "with the head. Fine for a page that owns its scene, useless to anybody placing the figure elsewhere -- " +
        "and the Pip-Boy's screen is exactly elsewhere. Head still nests alone, so the visual result is unchanged");

    let disposed = true;
    try { rig.dispose(); } catch { disposed = false; }
    ok("...and dispose() walks the tree rather than a list it has to remember",
        disposed && /root\.traverse/.test(mod),
        "a disposal list maintained by hand is one more thing to forget when a part is added");
}

// ---- 3. WHAT DELIBERATELY DID NOT MOVE ---------------------------------------------------------------------------------
{
    ok("!! the animation layer stayed in the page, on purpose",
        /MOODS/.test(pageCode) && !/MOODS/.test(mod) && /channels/.test(pageCode),
        "moods, live channels, the face-rig feed and the gesture vocabulary are ~450 lines only this page uses. " +
        "MOVING THEM WOULD BE A LARGE REFACTOR WITH REAL REGRESSION RISK to solve a problem nobody has -- and " +
        "the module says so where a reader will meet it");

    ok("...and the module says which half it is",
        // gateQuality on its first run, SIXTH TIME THIS SESSION. Cut to load-bearing words: a phrase that wraps
        // across a comment line break stops matching text that never changed meaning.
        // SIXTH TIME THIS SESSION, and shortening was not enough -- the rule is the INSTRUMENT, not the length.
        // This asks "does the module explain which half it is", which is a question about PROSE, and prose() is
        // the tool built for exactly that (codeOnly for an IDIOM, noComments for TEXT the code contains,
        // prose() for "does this file EXPLAIN itself"). I reached for the first two twice each this session and
        // only now for the third.
        /WHAT MOVED IS THE GEOMETRY/.test(prose(modRaw)),
        "somebody will otherwise import this expecting a talking head and find a shape");
}

// ---- 4. SCREEN 1 SHOWS THE RIG (v3240) --------------------------------------------------------------------------------
{
    const host = fs.readFileSync(path.join(ROOT, "pipboy-models.html"), "utf8");
    const hostCode = codeOnly(host);
    const pip = codeOnly(fs.readFileSync(path.join(ROOT, "ui", "pipboyWireframe.js"), "utf8"));

    ok("!! *** screen 1 takes a TEXTURE, and the RENDERING is the host's job ***",
        /setScreen1Texture/.test(pip) && /WebGLRenderTarget/.test(hostCode) && !/WebGLRenderTarget/.test(pip),
        "pipboyWireframe is handed THREE and nothing else -- it composes objects and paints canvases. ASKING IT " +
        "TO RENDER WOULD MEAN HANDING IT A RENDERER IT HAS NO OTHER USE FOR, so it takes a texture and the host, " +
        "which already owns a WebGLRenderer, does the pass");

    ok("!! ...and the target is rendered BEFORE the main pass",
        /renderHeadRT\(\);[\s\S]{0,80}renderer\.render\(scene, camera\)/.test(hostCode),
        "a render target written AFTER the scene that samples it shows the PREVIOUS frame -- one frame of lag " +
        "that looks like nothing until the head moves and then looks like a bug nobody can place");

    ok("!! ...and it restores the previous render target rather than assuming null",
        /getRenderTarget\(\)/.test(hostCode) && /setRenderTarget\(prev\)/.test(hostCode),
        "assuming the screen buffer was current is the kind of guess that works until something else in the " +
        "frame does its own pass");

    ok("!! *** the head on the screen is the SAME module thead.html draws ***",
        /buildWireframeHead/.test(hostCode) && /face\/wireframeHead\.js/.test(host),
        "which is the entire reason v3239 extracted it. A second copy of those fifty lines would have been the " +
        "ninth instance this session of a thing declared twice and compared never");

    ok("...and handing a texture away is REVERSIBLE",
        /_screen1Tex \|\| mainScreen\.tex/.test(pip),
        "setScreen1Texture(null) restores STATS / INV / MAP / DATA. A screen that could only be given away once " +
        "would make this a ONE-WAY DOOR, and the canvas path is still what every other consumer uses");

    ok("...and the 2D repaint is SKIPPED while a texture is mounted",
        /if \(!_screen1Tex\) \{ try \{ \(_custom1/.test(pip),
        "repainting a canvas nobody samples is work that produces nothing -- and it would leave the old page " +
        "half-drawn underneath, so somebody wondering why STATS looks frozen would be right");
}

console.log();
console.log("  ----  NOT DONE, AND IT IS WHY THIS EXISTS: the Pip-Boy's screen 1 does not draw it yet.");
console.log("  ----  pipboy-models.html owns a THREE.WebGLRenderer, so the honest path is a WebGLRenderTarget --");
console.log("  ----  render the rig into it and hand the texture to the screen material, rather than blitting a");
console.log("  ----  second canvas. THAT IS THE HOST'S JOB, not the module's: it owns the renderer.");
if (fails) { console.log("wireframeHead-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("wireframeHead-selfcheck: all checks pass");
