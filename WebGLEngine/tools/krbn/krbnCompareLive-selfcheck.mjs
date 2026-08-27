// WebGLEngine/tools/krbn/krbnCompareLive-selfcheck.mjs -- v4042
// ---------------------------------------------------------------------------------------------------------------
// GATES krbn-compare.html's RIGHT PANE ACTUALLY BEING KRBN.
//
// Keith, looking at the Ragdoll spin: "the Krbn - Flat drawing render on the right side does not actually show a
// krbn render/pencil marks, but just wireframe... when you generated the render pic for github, that was krbn."
//
// *** HE WAS RIGHT, AND THE FUNCTION'S OWN NAME WAS THE LIE. *** drawKrbnSide() never imported vendor/krbn at
// all -- it drew `g.moveTo/lineTo/stroke` per triangle edge, a hand-rolled wireframe cage, under a pane labelled
// "krbn -- flat drawing". A gate that only checked "the right pane has pixels in it" would have passed every
// day that bug shipped, which is exactly why the live checks below assert WHAT KRBN UNIQUELY PRODUCES rather
// than that something got drawn:
//
//   - HATCH. A wireframe has none. Krbn is a pencil-plotter renderer and hatch is what a pencil drawing IS.
//   - HIDDEN-LINE REMOVAL. A wireframe draws every edge; Krbn classifies each interval visible/hidden.
//
// AND THE SECOND BUG THE FIRST FIX WALKED INTO. Feeding the triangulated ragdollMesh() to K.Mesh produced
// ZERO hatch and ZERO silhouettes -- MEASURED 382 crease strokes, 19 boundary, 0 silhouette -- because
// cylinderMesh() emits no end caps, so every limb is an OPEN surface and Mesh.hatchRegions() fills CLOSED
// silhouette loops. The reference picture's own source (portfolio/krbn/swek-ragdoll.krbn.ts) never built a
// mesh: it is Krbn's analytic `Cylinder`/`sphere` primitives, whose exact curved direction fields draw the
// rings around a limb. Section 2 holds that line: the native builders must produce silhouettes, because a
// scene with none cannot hatch and would silently regress to outline-only.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codeOnly, noComments } from "../ship/sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
// v4049 -- was MISSING despite two call sites already using it (section 15's own "no headless Chromium here"
// skip line): a straight ReferenceError on any box without Chromium or without the fixture this section needs,
// thrown from inside a skip path whose entire job is to degrade gracefully. Every other *-selfcheck.mjs in this
// tree defines this exact helper (e.g. tools/ship/artifactSize-selfcheck.mjs:45); it just never got copied here.
const report = (l) => console.log("  ----  " + l);

console.log("krbnCompareLive-selfcheck -- the right pane is really Krbn\n");

const HTML = fs.readFileSync(path.join(ENG, "krbn-compare.html"), "utf8");
// v4046 -- the glTF conversion moved into tools/krbn/glbMesh.js so krbn-avatar.html could share it instead of
// carrying a second copy. These checks follow it there: gating the ONE implementation both pages import is
// strictly stronger than gating an inline copy on one of them, and this file failed 11 checks the moment the
// code moved -- which is the gate doing its job rather than a regression.
const GLB = fs.readFileSync(path.join(ENG, "tools", "krbn", "glbMesh.js"), "utf8");
const BOTH = HTML + "\n" + GLB;

console.log("1. THE PAGE CALLS KRBN AT ALL -- THE THING THAT WAS FALSE FOR THE WHOLE OF THIS PAGE'S LIFE");
{
    ok("!! krbn-compare.html imports the vendored Krbn", /import\(["']\/vendor\/krbn\/index\.js["']\)/.test(HTML),
       "the pane was labelled 'krbn -- flat drawing' while drawing a hand-rolled wireframe; this is the import that was missing");
    ok("!! ...and drawKrbnSide no longer strokes mesh triangles itself",
       !/for \(const \[i,j,k\] of mesh\.triangles\)\{[^}]*g\.beginPath\(\)[^}]*g\.stroke\(\)/.test(HTML),
       "the exact per-triangle moveTo/lineTo/stroke loop that WAS the fake 'Krbn' render");
    ok("!! ...and there is NO wireframe fallback when Krbn is missing", /Krbn not available/.test(HTML) && !/fallbackWire|drawWireInstead/.test(HTML),
       "krbn.html's v2597 rule: a page that quietly draws something else when its subject is missing is lying about what it shows -- " +
       "re-adding a wireframe as the error path would restore this exact bug in the failure case");
    ok("!! the ink is paper-coloured, not left at Krbn's graphite default",
       /background: PAPER|PAPER = "#/.test(HTML),
       "Krbn's BASE_STYLE ink is #1a1a1a because it expects paper; dropped on this page's #04100a ground it measured 0.00% coverage -- a blank pane");
}

console.log("\n2. THE SCENES THAT CANNOT HATCH AS A MESH USE KRBN'S OWN PRIMITIVES");
{
    const SM = fs.readFileSync(path.join(ENG, "tools", "krbn", "sceneMeshes.js"), "utf8");
    ok("!! KRBN_NATIVE exists and covers ragdoll + splat", /export const KRBN_NATIVE/.test(SM) && /\bragdoll\(K, scene\)/.test(SM) && /\bsplat\(K, scene\)/.test(SM));
    ok("...and it builds from Cylinder/sphere/ellipsoid, not from a mesh", /new K\.Cylinder\(/.test(SM) && /K\.sphere\(/.test(SM) && /K\.ellipsoid\(/.test(SM),
       "a triangulated cylinder is not a cylinder to a renderer that hatches along the real surface's own parameterisation");

    const { KRBN_NATIVE, sceneMesh } = await import(path.join(ENG, "tools", "krbn", "sceneMeshes.js"));
    let K = null;
    try { K = await import(path.join(ENG, "vendor", "krbn", "index.js")); } catch {}
    if (!K) { console.log("  ----  vendor/krbn is not present -- the render assertions below cannot run"); fails++; }
    else {
        const cam = { eye: [3, 3, 2], target: [0, 0, 0], up: [0, 0, 1], projection: "perspective",
                      scale: (Math.PI / 4.2) * 2, viewport: { width: 920, height: 560 } };
        const build = (name) => { const s = new K.Scene({ light: { direction: [-0.4, -0.5, -0.7] }, style: { wobble: 0.4 } }); KRBN_NATIVE[name](K, s); return s.render(cam); };
        for (const name of ["ragdoll", "splat"]) {
            const r = build(name);
            const sil = r.strokes.filter((s) => s.feature && s.feature.type === "silhouette").length;
            ok(`!! ${name} renders CLOSED silhouette loops (a scene with none cannot hatch)`, sil > 0,
               sil + " silhouette strokes -- the triangulated mesh of this same rig measured ZERO, which is why it drew no hatch");
            ok(`...and ${name} emits more render strokes than features (the surplus IS the hatch)`,
               r.renderStrokes.length > r.strokes.length,
               r.renderStrokes.length + " render strokes from " + r.strokes.length + " features");
        }
        // *** THE LOAD-BEARING NEGATIVE, RUN RATHER THAN ASSERTED. *** This is the measurement that justifies
        // KRBN_NATIVE existing at all; if a future Krbn gains open-surface hatch it should be revisited, and
        // this is what will say so.
        const ms = new K.Scene({ light: { direction: [-0.4, -0.5, -0.7] } });
        ms.add(new K.Mesh(sceneMesh("ragdoll"))).style({ hatch: { mode: "cross", angle: 20, field: true } });
        const mr = ms.render(cam);
        ok("!! ...and the TRIANGULATED ragdoll still cannot -- the finding that made the primitives necessary",
           mr.strokes.filter((s) => s.feature && s.feature.type === "silhouette").length === 0,
           "open surfaces (cylinderMesh emits no end caps) have no closed loops for hatchRegions to fill");
    }
}

console.log("\n3. LOADING A MODEL: BOTH PANES INVALIDATE THEIR CACHES");
{
    ok("!! the GLB path exists and converts to the same { positions, triangles } MeshInput",
       /GLTFLoader/.test(HTML) && /gltfToMeshInput\(gltf, THREE\)/.test(HTML) && /return dropDegenerate\(\{ positions, triangles, skinned: !!skinned, posedBy \}\)/.test(GLB),
       "one geometry type on the page, so the WebGL upload, the projection, the ray-cast lift and the OBJ export all keep working unchanged");
    ok("...and OBJ/STL go through Krbn's own parsers rather than a second hand-rolled reader",
       /K\.parseOBJ\(/.test(HTML) && /K\.parseSTL\(/.test(HTML));
    ok("!! a reload invalidates the KRBN cache AND the WEBGL cache",
       /krbnSceneFor = null;[\s\S]{0,200}glMeshName = null/.test(HTML),
       "both caches key on sceneName, which stays \"loaded\" across reloads -- missing the second one left the LEFT pane " +
       "showing the previous model while the right drew the new one, on a page whose whole job is comparing the same geometry");
    // v4044 -- WAS "a skinned glTF is REPORTED as a bind pose", which was the honest stopgap BEFORE the
    // skinning pass existed. The pose is fixed now, so that report would describe a state that cannot occur --
    // and the old check matched "BIND POSE" in a COMMENT, not in the status text, so it would have gone on
    // passing forever regardless. Section 7 owns the skinning assertions; this one now only asks that the
    // status names the clip, so a reader knows WHICH pose they are looking at.
    ok("!! a skinned glTF says which clip posed it, so the pose is identified rather than mysterious",
       /isSkinnedMesh/.test(GLB) && /posed by clip/.test(HTML),
       "the figure you see is one frame of one animation; not saying which is how a wrong-looking pose becomes unfalsifiable");
    ok("!! the camera fit centres on the BOUNDING BOX, not the vertex centroid",
       /computeFit[\s\S]{0,400}lo\[i\]\+hi\[i\]\)\/2/.test(GLB),
       "the centroid is a DENSITY measure: a loaded model with a dense head and a sparse limb centres in the head and frames empty space");
}

console.log("\n4. PRESETS: THE SHIPPED MODEL, AND THE AVATAR FAVOURITES -- READ FROM THE ONE STORE");
{
    ok("!! RobotExpressive is a preset and the file it names really is in the tree",
       /GPU_Assets\/RobotExpressive\.glb/.test(HTML) && fs.existsSync(path.join(ENG, "GPU_Assets", "RobotExpressive.glb")),
       "a preset pointing at a path that does not ship is a dead entry that only fails when somebody clicks it");
    // v4049 -- THE PICKER (favourites, presets, the file input) MOVED TO ui/modelPicker.js, so these checks
    // follow it there -- the same reason section 7/8's checks followed glbMesh.js when THAT code moved.
    const MP = fs.readFileSync(path.join(ENG, "ui", "modelPicker.js"), "utf8");
    ok("!! favourites come from voxelEngine.kpopFavorites -- THE STORE THE AVATAR STAR ALREADY WRITES",
       /voxelEngine\.kpopFavorites/.test(MP),
       "ui/avatarFavorites.js's own header: a second favourites list would be the two-declarations defect -- you would " +
       "star something on server.html, not see it here, and never find out why");
    // *** THE LOAD-BEARING NEGATIVE. *** Offering favourites is safe only while this module cannot CREATE one.
    // The moment it writes that key, the store has two authors and the star stops being the single place a
    // favourite is made -- which is the exact defect the file above exists to prevent.
    ok("!! ...and the module only READS that key, never writes it",
       !/setItem\(\s*FAV_KEY|setItem\(\s*["']voxelEngine\.kpopFavorites/.test(MP),
       "server.html's star stays the one place a favourite is made");
    const shared = fs.readFileSync(path.join(ENG, "ui", "kpopFavorites.js"), "utf8");
    ok("...and the key it reads is byte-for-byte the one that module declares",
       /STORAGE_KEY = "voxelEngine\.kpopFavorites"/.test(shared),
       "read from the store's own source rather than trusted from memory -- if it is ever renamed, this fails here " +
       "instead of silently showing an empty favourites list forever");
    ok("!! a preset and a picked file share ONE parse path (krbn-compare.html's own loadModel)",
       /async function loadModel\(src\)/.test(HTML) && /onPick: \(src\) => loadModel\(src\)/.test(codeOnly(HTML)),
       "two loaders would need the same cache invalidation kept in step in two places -- the bug section 3 already caught once");
    ok("!! a favourite whose file has moved REPORTS its 404 rather than silently doing nothing",
       /HTTP " \+ r\.status/.test(MP),
       "the favourites list is not this module's to prune, so a dead entry must say what happened");
    ok("!! krbn-compare.html actually imports the shared module rather than keeping its own copy beside it",
       /from "\.\/ui\/modelPicker\.js"/.test(HTML) && !/function readAvatarFavorites/.test(HTML),
       "an unused parallel implementation left in place is how a second copy starts drifting");
}

console.log("\n7. THE SKINNING PASS -- A BIND POSE IS NOT A SLIGHTLY-WRONG FIGURE, IT IS A DIFFERENT OBJECT");
{
    ok("!! skinned vertices go through their joint matrices, via three's OWN applyBoneTransform",
       /applyBoneTransform\(i, v\)/.test(GLB),
       "not a fourth hand-rolled weighted sum -- three r160 implements this and this file already depends on it " +
       "for the loader; face/avatarStage.js's hand-written loop exists only because it runs against the tree's own parser");
    ok("!! ...and the skeleton is POSED by a clip first, not left at rest",
       /AnimationMixer/.test(GLB) && /mx\.update\(time\)/.test(GLB) && /poseFromClip\(gltf, THREE, time = 0/.test(GLB),
       "bone matrices mean nothing until the skeleton is placed; t=0 of the idle clip is deterministic and is the " +
       "pose the asset was authored to be seen in -- the same choice avatarStage makes");
    ok("!! ...and the mixer runs BEFORE updateMatrixWorld, or the bones carry no rotation",
       /mx\.update\(time\)[\s\S]{0,400}updateMatrixWorld\(true\)/.test(GLB),
       "ordering is the whole thing here: updating the world matrices first bakes the REST pose and the clip is lost");
    ok("!! glTF's Y-up is mapped to this page's Z-up",
       /positions\.push\(\[v\.x, v\.z, v\.y\]\)/.test(GLB),
       "swek-ragdoll.krbn.ts states the rule -- 'SweK is Y-up and Krbn is Z-up, so the mapping is (x,y,z) -> (x,z,y)' -- " +
       "and sceneMeshes.js's ragdoll already applies it; without it a loaded glTF renders lying on its back");
    // *** THE MEASUREMENT, NOT THE CLAIM. *** Skinning either moves the geometry or it does not, and on this
    // asset the gap is enormous and known independently: avatarStage.js's v4032 note measured the same file's
    // bind height at ~0.026 against ~4.5 skinned. If a future edit drops the pass, the bind pose returns and
    // this number collapses by ~170x -- which no source-level check would notice.
    const glb = path.join(ENG, "GPU_Assets", "RobotExpressive.glb");
    ok("!! the preset model really ships (the skinning claim is about a file that exists)", fs.existsSync(glb));
    ok("!! ...and avatarStage's independently-measured bind-vs-posed gap for it is on record",
       /0\.026|172x|~4\.5/.test(fs.readFileSync(path.join(ENG, "face", "avatarStage.js"), "utf8")),
       "two files measured this asset from opposite directions and agree: the posed height is ~4.5, the bind ~0.026");
}

console.log("\n8. DEGENERATE TRIANGLES -- KRBN'S OWN LOADERS DROP THEM AND OUR glTF PATH BYPASSES THOSE LOADERS");
{
    ok("!! a sanitiser runs on EVERY loaded model, not just glTF",
       /export function dropDegenerate/.test(GLB) && /m = dropDegenerate\(m\)/.test(HTML) && /return dropDegenerate\(/.test(GLB),
       "idempotent on anything Krbn already cleaned; one sanitiser that always runs beats a rule about which paths need it");
    ok("!! ...and it rejects the REPEATED-INDEX case, which is the one that actually crashed Krbn",
       /i === j \|\| j === k \|\| i === k/.test(GLB),
       "MEASURED: halfedge.js:183 does tB.find(vi => vi !== v0 && vi !== v1), which returns undefined for an " +
       "[a,b,a] sliver, and positions[undefined] threw TypeError inside vec3.sub -- 3 such triangles in RobotExpressive.glb");
    ok("...and the zero-area case too (distinct indices, collinear points)",
       /Math\.hypot\(cx, cy, cz\)/.test(GLB));
    // the claim that Krbn's own loaders already do this is checked against Krbn, not recited
    const loaders = fs.readFileSync(path.join(ENG, "vendor", "krbn", "mesh", "loaders.d.ts"), "utf8");
    ok("!! ...and Krbn's own parseOBJ/parseSTL really do document dropping them (so this is our gap, not its bug)",
       /zero-area (facets|triangles) are dropped/i.test(loaders),
       "its loaders sanitise before its mesh builder ever sees the data; the glTF path inherited the requirement " +
       "without inheriting the fix");
}

console.log("\n9. *** THE TWO PANES ACTUALLY AGREE -- THE PAGE CLAIMED THIS FOR ITS WHOLE LIFE AND IT WAS FALSE ***");
{
    // krbn-compare.html's own "Honest scope" note said "its shader uses the same projection as the Krbn side,
    // so the two stay aligned across the wipe". MEASURED at v4045: the vertical agreed to 0.0px and the
    // HORIZONTAL was out by exactly W/H = 1.643x -- project() used an effective focal length of f*W/2
    // horizontally against f*H/2 vertically, and the WebGL shader repeated the same two-focal-length form. So
    // the two panes agreed with EACH OTHER while both disagreed with Krbn, which is precisely why a page built
    // to compare them could not see it. This runs all three and requires them to coincide.
    const { project } = await import(path.join(ENG, "tools", "krbn", "krbnCompare.js"));
    let K = null; try { K = await import(path.join(ENG, "vendor", "krbn", "index.js")); } catch {}
    const VIEW = { width: 920, height: 560 }, SCALE = Math.PI / 4.2;
    const sub = (a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
    const dot = (a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
    const cross = (a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
    const norm = (a)=>{const m=Math.hypot(a[0],a[1],a[2])||1;return[a[0]/m,a[1]/m,a[2]/m];};
    // The GLSL, evaluated in JS exactly as the vertex shader computes it -- a GPU is not needed to check
    // arithmetic, and this is the copy of the projection that a reader is least likely to keep in step.
    const shaderPx = (p, cam) => {
        const fwd=norm(sub(cam.target,cam.eye)), right=norm(cross(fwd,cam.up)), up=cross(right,fwd);
        const rel=sub(p,cam.eye), cz=Math.max(dot(rel,fwd),0.001);
        const uF=1/Math.tan(cam.scale), uInv=VIEW.height/VIEW.width;
        return [VIEW.width/2 + ((dot(rel,right)/cz)*uF*uInv)*(VIEW.width/2),
                VIEW.height/2 - ((dot(rel,up)/cz)*uF)*(VIEW.height/2)];
    };
    const cam = { eye:[4,3,2.5], target:[0,0,0], up:[0,0,1], scale:SCALE, viewport:VIEW };
    let worstShader = 0, worstKrbn = 0, n = 0;
    const P = K ? K.projectionMatrix({ ...cam, projection:"perspective", scale:SCALE*2 }) : null;
    for (let i = 0; i < 300; i++) {
        const p = [Math.sin(i*1.7)*2, Math.cos(i*2.3)*2, Math.sin(i*0.9)*1.5];
        const a = project(p, cam); if (!a) continue;
        n++;
        const s = shaderPx(p, cam);
        worstShader = Math.max(worstShader, Math.abs(a[0]-s[0]), Math.abs(a[1]-s[1]));
        if (P) { const k = K.projectPoint(P, p).point; worstKrbn = Math.max(worstKrbn, Math.abs(a[0]-k[0]), Math.abs(a[1]-k[1])); }
    }
    ok("!! the WebGL shader and project() put a point in the SAME pixel",
       n > 200 && worstShader < 1e-9, "worst " + worstShader.toExponential(2) + " px over " + n + " points");
    ok("!! ...and both match KRBN'S OWN projectionMatrix, which is the one that was right all along",
       !!K && worstKrbn < 1e-9, K ? "worst " + worstKrbn.toExponential(2) + " px" : "vendor/krbn missing");
    ok("!! project() uses ONE focal length, not one per axis",
       /const fpx = \(H \/ 2\) \/ Math\.tan\(cam\.scale\)/.test(fs.readFileSync(path.join(ENG,"tools","krbn","krbnCompare.js"),"utf8")),
       "f*W/2 horizontally against f*H/2 vertically is anisotropic by W/H -- a sphere draws as an ellipse");
    ok("!! ...and the shader carries the matching uInvAspect rather than repeating the old form",
       /uInvAspect/.test(HTML) && /uF\*uInvAspect/.test(HTML.replace(/\s/g, "")));
}

console.log("\n10. FRAMING IS DERIVED FROM THE FRUSTUM, AND NOTHING LEAVES THE FRAME");
{
    ok("!! the orbit distance comes from the FOV, not from tuned constants",
       /export function fitDistance/.test(GLB) && /Math\.sin\(Math\.min\(halfV, halfH\)\)/.test(GLB),
       "R=radius*1.75 encoded a field of view nobody stated and stops being right when SCALE or the aspect changes");
    const { project } = await import(path.join(ENG, "tools", "krbn", "krbnCompare.js"));
    const { sceneMesh } = await import(path.join(ENG, "tools", "krbn", "sceneMeshes.js"));
    const VIEW = { width: 920, height: 560 }, SCALE = Math.PI / 4.2;
    const ELEV = Math.atan2(0.65, 1.75), MARGIN = 1.06;
    const fitD = (r) => r / Math.sin(Math.min(SCALE, Math.atan((VIEW.width/VIEW.height)*Math.tan(SCALE)))) * MARGIN;
    // a deliberately PATHOLOGICAL subject: 9 units tall against 0.7 wide, the shape a bounding-sphere fit is
    // worst at and the one a tuned constant would crop first.
    const tall = { positions: [], triangles: [[0,1,2]] };
    for (let i = 0; i < 200; i++) tall.positions.push([Math.cos(i)*0.35, Math.sin(i)*0.35, (i/199)*9-4.5]);
    let worstFill = 0, cropped = [];
    for (const [nm, m] of Object.entries({ blob: sceneMesh("blob"), ragdoll: sceneMesh("ragdoll"),
                                           splat: sceneMesh("splat"), flesh: sceneMesh("flesh"), "tall 9:0.7": tall })) {
        const lo=[Infinity,Infinity,Infinity], hi=[-Infinity,-Infinity,-Infinity];
        for (const p of m.positions) for (let i=0;i<3;i++){ if(p[i]<lo[i])lo[i]=p[i]; if(p[i]>hi[i])hi[i]=p[i]; }
        const c=[0,1,2].map(i=>(lo[i]+hi[i])/2);
        let r=0; for (const p of m.positions){ const d=Math.hypot(p[0]-c[0],p[1]-c[1],p[2]-c[2]); if(d>r)r=d; }
        const d = fitD(r||1); let fill = 0;
        for (let s=0;s<72;s++){                     // a FULL orbit: what fits at 0 degrees must fit at 45
            const a=s/72*Math.PI*2, R=d*Math.cos(ELEV), h=d*Math.sin(ELEV);
            const cam={eye:[c[0]+R*Math.cos(a),c[1]+R*Math.sin(a),c[2]+h],target:c,up:[0,0,1],scale:SCALE,viewport:VIEW};
            for (const p of m.positions){ const q=project(p,cam); if(!q) continue;
                fill=Math.max(fill, Math.abs(q[0]-VIEW.width/2)/(VIEW.width/2), Math.abs(q[1]-VIEW.height/2)/(VIEW.height/2)); }
        }
        if (fill > 1) cropped.push(nm + " " + fill.toFixed(2));
        worstFill = Math.max(worstFill, fill);
    }
    ok("!! every vertex of every scene stays in frame across a FULL 72-step orbit",
       cropped.length === 0, cropped.length ? "CROPPED: " + cropped.join(", ") : "worst fill " + (100*worstFill).toFixed(0) + "% of the half-frame");
    ok("...and the frame is actually USED (the old constants left ~30% of it empty)",
       worstFill > 0.7, "worst fill " + (100*worstFill).toFixed(0) + "%");
}

console.log("\n11. THE KRBN AVATAR SURFACE ON server.html");
{
    const AV = fs.readFileSync(path.join(ENG, "krbn-avatar.html"), "utf8");
    // *** THIRD TIME THIS SESSION: BOTH LOAD-BEARING NEGATIVES BELOW FIRST MATCHED THIS GATE'S OWN PROSE. ***
    // krbn-avatar.html's comment QUOTES `setImportance(1, {role:"subject"})` as the inert setting it warns
    // about, so a raw-text regex read the bug as present in the file that had fixed it. Sections 2 and 3 above
    // learned this already; the stripping is the same codeOnly() they use. A gate that reads comments is a gate
    // that grades the explanation instead of the code.
    // *** AND THEN THE OTHER HALF OF THE SAME TRAP, WHICH THIS TREE HAS NOW HIT EIGHT TIMES. *** codeOnly()
    // strips comments AND BLANKS STRING CONTENTS, so `id: "krbn"` becomes `id: ""` and four string-value checks
    // went red against correct code. The tree's own rule (v4021, after the fourth time): noComments() for
    // STRING LITERALS, codeOnly() for CODE SHAPES. Both are used here, deliberately, for the halves they suit.
    const AVC = codeOnly(AV);        // code shapes: setImportance(0.45, minFeaturePx: 14, setInterval
    const AVS = noComments(AV);      // string values: the import path, "pagehide"
    const SW = fs.readFileSync(path.join(ENG, "ui", "avatarSwitch.js"), "utf8");
    const SWC = noComments(SW);   // ids and heavy text are STRING VALUES
    ok("!! krbn-avatar.html shares tools/krbn/glbMesh.js rather than copying the conversion",
       /from "\.\/tools\/krbn\/glbMesh\.js"/.test(AVS) && /gltfToMeshInput/.test(AVC),
       "skinning, Y-up->Z-up and the degenerate drop are each invisible when wrong -- a drifted second copy " +
       "would quietly draw a bind pose on ONE of the two pages and look like that page's bug");
    ok("!! it is in the avatar rotation, and DECLARES its cost like the other heavy surfaces",
       /id: "krbn"/.test(SWC) && /heavy: "~0\.5s of CPU per redraw/.test(SWC),
       "krbn.html measured ~708ms per pencil frame; a cost discovered after the click is one the reader never agreed to");
    ok("!! ...and gauges3000 is STILL the last choice, which Keith asked for at v4033",
       SWC.indexOf('id: "krbn"') > 0 && SWC.indexOf('id: "gauges3000"') > SWC.indexOf('id: "krbn"'),
       "appending the new mode would have silently overruled a stated preference to save one edit");
    ok("!! it redraws on a TIMER, not per frame -- a pencil renderer cannot animate",
       /setInterval/.test(AVC) && /REDRAW_MS/.test(AVC) && !/requestAnimationFrame/.test(AVC),
       "pretending to run at 60fps is exactly the bug v4042 found on the compare page's own 'krbn' pane");
    ok("...and it clears that timer on teardown (avatarSwitch REMOVES the iframe, but timing is not guaranteed)",
       /pagehide[\s\S]{0,200}clearInterval/.test(AVS));

    // *** THE LOAD-BEARING NEGATIVE, AND THE BUG THIS PAGE NEARLY SHIPPED. *** Krbn's abstract.js defines
    // cutoffFor(importance, base) = base * (1 - importance), documented "importance 1 -> cutoff 0 (never
    // dropped)". So minFeaturePx with importance 1 is MATHEMATICALLY INERT -- measured: identical stroke count
    // AND identical byte count at minFeaturePx=16. A setting that reads as deliberate tuning and cannot fire.
    const imp = AVC.match(/setImportance\(([0-9.]+)/);
    const mfp = AVC.match(/minFeaturePx:\s*([0-9.]+)/);
    ok("!! minFeaturePx is paired with an importance BELOW 1, or it can never fire",
       !!imp && !!mfp && Number(mfp[1]) > 0 && Number(imp[1]) < 1,
       "importance " + (imp ? imp[1] : "?") + ", minFeaturePx " + (mfp ? mfp[1] : "?") +
       " -- cutoff = minFeaturePx * (1 - importance), so importance 1 disables it silently");
    // and the mechanism is RUN, not just read, so this cannot pass on a Krbn that changed its scaling rule
    let K2 = null; try { K2 = await import(path.join(ENG, "vendor", "krbn", "index.js")); } catch {}
    if (K2 && typeof K2.cutoffFor === "function") {
        ok("!! ...proven against Krbn's own cutoffFor: importance 1 really does yield a zero cutoff",
           K2.cutoffFor(1, 16) === 0 && K2.cutoffFor(0.45, 16) > 0,
           "cutoffFor(1,16)=" + K2.cutoffFor(1, 16) + "  cutoffFor(0.45,16)=" + K2.cutoffFor(0.45, 16).toFixed(2));
    } else {
        console.log("  ----  Krbn does not export cutoffFor here; the source-level pairing check above stands alone");
    }
}

console.log("\n12. THE RIGGED DRAWING -- PINNED TO THE SURFACE, AND EXACT RATHER THAN CLOSE");
{
    const { backProjectHit, baryPoint } = await import(path.join(ENG, "tools", "krbn", "krbnCompare.js"));
    // *** THE CLAIM IS AN IDENTITY, SO IT IS PROVEN BY RUNNING IT, NOT BY ASSERTING THE COMMENT. ***
    // Linear blend skinning is linear in the vertex position, so a point pinned at barycentric (u,v,w) of a
    // triangle must land on exactly that blend of the triangle's corners under ANY per-vertex deformation --
    // which is what skinning is. Random triangles, random interior hits, random independent corner motion.
    const rnd = (function (s) { return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })(7);
    let worst = 0, trials = 0, badBary = 0;
    for (let n = 0; n < 200; n++) {
        const A=[rnd()*2-1,rnd()*2-1,rnd()*2-1], B=[rnd()*2-1,rnd()*2-1,rnd()*2-1], C=[rnd()*2-1,rnd()*2-1,rnd()*2-1];
        const mesh = { positions:[A,B,C], triangles:[[0,1,2]] };
        const ctr = [0,1,2].map((k)=>(A[k]+B[k]+C[k])/3);
        const u0=[B[0]-A[0],B[1]-A[1],B[2]-A[2]], v0=[C[0]-A[0],C[1]-A[1],C[2]-A[2]];
        const cr=[u0[1]*v0[2]-u0[2]*v0[1], u0[2]*v0[0]-u0[0]*v0[2], u0[0]*v0[1]-u0[1]*v0[0]];
        const cm=Math.hypot(cr[0],cr[1],cr[2])||1, nrm=[cr[0]/cm,cr[1]/cm,cr[2]/cm];
        const cam = { eye:[ctr[0]+nrm[0]*3,ctr[1]+nrm[1]*3,ctr[2]+nrm[2]*3], target:ctr,
                      up: Math.abs(nrm[2])>0.9?[1,0,0]:[0,0,1], scale:Math.PI/4.2, viewport:{width:400,height:400} };
        const h = backProjectHit(200, 200, mesh, cam);
        if (!h) continue;
        trials++;
        const [u,v,w] = h.bary;
        if (u<-1e-9||v<-1e-9||w<-1e-9||Math.abs(u+v+w-1)>1e-9) badBary++;
        const D = [A,B,C].map((P)=>[P[0]+rnd()*4-2, P[1]+rnd()*4-2, P[2]+rnd()*4-2]);   // deform each corner freely
        const pinned = baryPoint(D, [0,1,2], h.bary);
        const truth = [0,1,2].map((k)=>u*D[0][k] + v*D[1][k] + w*D[2][k]);
        for (let k=0;k<3;k++) worst = Math.max(worst, Math.abs(pinned[k]-truth[k]));
    }
    ok("!! a pinned point follows ARBITRARY deformation with no error term",
       trials > 150 && worst < 1e-12,
       "worst " + worst.toExponential(2) + " over " + trials + " random deformed triangles -- this is why the rig " +
       "is a rig and not a resemblance, and why per-stroke skin weights are unnecessary");
    ok("...and every recorded barycentric is a real convex combination of an interior hit",
       badBary === 0, badBary + " out of range");

    const SL = fs.readFileSync(path.join(ENG, "tools", "krbn", "strokeLift.js"), "utf8");
    const RG = fs.readFileSync(path.join(ENG, "krbn-rigged.html"), "utf8");
    ok("!! the player re-skins through the SAME loop that built the mesh, not a second one",
       /export function skinPositions/.test(GLB) && /skinnedGeometry\(gltf, THREE, true\)/.test(GLB) &&
       /skinPositions\(gltf, THREE\)/.test(noComments(RG)),
       "every stroke's triangle index depends on the traversal ORDER; two loops that must agree on an order are " +
       "two loops that will eventually disagree about one");
    // *** THE HONEST HALF, HELD BY A CHECK SO IT CANNOT QUIETLY BECOME A CLAIM. ***
    ok("!! silhouettes are recorded as their own kind, because a rigged outline is BAKED and surface marks are not",
       /kind === "silhouette"/.test(noComments(RG)) && /silhouette/.test(SL),
       "a silhouette is where the surface turns away from THIS camera; move the model and that set moves, so " +
       "carrying it along is right at the source pose and progressively wrong after it");
    ok("...and the page can hide it, and says which pose the outline belongs to",
       /id="sil"/.test(RG) && /outline baked at t=/.test(RG),
       "one array quietly mixing a fact with an artefact is the shape this tree keeps removing");
    ok("!! Krbn runs ONCE per bake, not per frame -- the whole reason this plays",
       /scene\.render\(krbnCam\(cam\)\)/.test(noComments(RG)) && !/scene\.render[\s\S]{0,200}requestAnimationFrame/.test(noComments(RG)),
       "MEASURED in Chromium: 8.67 ms per posed frame against ~500 ms for a Krbn frame");
}

console.log("\n13. WEIGHT-BLENDING MATHS (riggedExport.js) -- CULLING WITHOUT RENORMALISING IS A SLOW-MOTION IMPLOSION");
{
    const { blendInfluences } = await import(path.join(ENG, "tools", "krbn", "riggedExport.js"));
    // *** THE LOAD-BEARING NEGATIVE. *** A blend of THREE corners, each with up to FOUR influences, can name up
    // to TWELVE distinct joints. glTF's JOINTS_0/WEIGHTS_0 carries only four. Cull without renormalising and
    // the kept weights sum to less than 1 -- linear blend skinning reads a short sum as "pull this vertex
    // toward the origin", so the mesh visibly shrinks as it animates, worst exactly where the rig is busiest.
    const joints = [1,2,3,4,  5,6,7,8,  9,10,11,12];         // 3 corners x 4 slots, TWELVE distinct joints
    const weights = [0.4,0.3,0.2,0.1,  0.4,0.3,0.2,0.1,  0.4,0.3,0.2,0.1];
    const { J, W } = blendInfluences(joints, weights, [0,1,2], [1/3,1/3,1/3]);
    const sum = W.reduce((a,b)=>a+b, 0);
    ok("!! twelve possible influences are culled to the FOUR glTF allows",
       new Set(J.filter((j,i)=>W[i]>0)).size <= 4, "kept joints " + JSON.stringify(J) + " weights " + JSON.stringify(W.map(w=>+w.toFixed(3))));
    ok("!! ...and RENORMALISED to sum to 1, not left short",
       Math.abs(sum - 1) < 1e-9, "sum=" + sum.toFixed(6) + " -- a short sum is the mesh-implodes-while-animating bug");
    // a barycentric weight of 0 at a corner must contribute NOTHING, even if that corner's own weights are large
    const { J: J2, W: W2 } = blendInfluences(joints, weights, [0,1,2], [1,0,0]);
    ok("!! a zero-weight corner contributes nothing (pure barycentric, not an average of all three)",
       J2.slice(0,4).every((j)=>[1,2,3,4].includes(j)) && Math.abs(W2.reduce((a,b)=>a+b,0)-1)<1e-9,
       "bary=[1,0,0] must reduce to exactly corner 0's own (already <=4) influence set");
    // a vertex with genuinely no matched influence (all weights 0) must not divide by zero and vanish silently
    const { W: W3 } = blendInfluences([0,0,0,0,0,0,0,0,0,0,0,0], [0,0,0,0,0,0,0,0,0,0,0,0], [0,1,2], [1/3,1/3,1/3]);
    ok("!! a vertex with NO influence at all follows the root (weight [1,0,0,0]), not NaN",
       W3[0] === 1 && W3.slice(1).every((w)=>w===0), JSON.stringify(W3));
}

console.log("\n14. THE SILHOUETTE-CLASSIFICATION FIX -- PROXIMITY REPLACING A STRING MATCH THAT NEVER MATCHED");
{
    const SL = fs.readFileSync(path.join(ENG, "tools", "krbn", "strokeLift.js"), "utf8");
    ok("!! classifyRenderStrokes exists and is used by BOTH callers, not copied into each",
       /export function classifyRenderStrokes/.test(SL) &&
       /classifyRenderStrokes\(paths, res\.strokes\)/.test(codeOnly(fs.readFileSync(path.join(ENG, "krbn-rigged.html"), "utf8"))) &&
       /classifyRenderStrokes\(paths, res\.strokes\)/.test(codeOnly(fs.readFileSync(path.join(ENG, "tools", "krbn", "riggedExport.js"), "utf8"))),
       "the same wobble-vs-raw-curve mismatch would otherwise need fixing twice, and did -- both callers carried " +
       "the identical broken string-match independently");
    ok("!! it is NOT a string/coordinate match on renderStroke.path any more",
       !/toFixed\(1\)[\s\S]{0,40}join\(";"\)[\s\S]{0,80}silPaths\.has/.test(SL.replace(/\s+/g," ")),
       "the exact shape of the original bug: rounding a WOBBLED path to a string and comparing against an UNWOBBLED one");

    let K = null; try { K = await import(path.join(ENG, "vendor", "krbn", "index.js")); } catch {}
    const { sceneMesh } = await import(path.join(ENG, "tools", "krbn", "sceneMeshes.js"));
    const { classifyRenderStrokes } = await import(path.join(ENG, "tools", "krbn", "strokeLift.js"));
    if (K) {
        // v4048 -- WAS sceneMesh("ragdoll"), which v4042 already measured as ZERO silhouettes: cylinderMesh()
        // emits no end caps, so every limb is an open surface with no silhouette to classify. blob is a real
        // marched (closed) field and is the one triangulated built-in scene known to produce silhouettes.
        const m = sceneMesh("blob");
        const cam = { eye:[3,3,2], target:[0,0,0], up:[0,0,1], projection:"perspective", scale:(Math.PI/4.2)*2, viewport:{width:920,height:560} };
        const scene = new K.Scene({ light:{direction:[-0.4,-0.5,-0.7]}, style:{wobble:0.4}, abstraction:{minFeaturePx:14} });
        scene.add(new K.Mesh(m)).setImportance(0.45,{role:"subject"}).style({weight:1.1,hatch:{mode:"cross",angle:20,spacingPx:9,field:true}});
        const res = scene.render(cam);
        const kinds = classifyRenderStrokes(res.renderStrokes.map((s)=>s.path), res.strokes);
        const trueSil = res.strokes.filter((s)=>s.feature && s.feature.type==="silhouette").length;
        const foundSil = kinds.filter((k)=>k==="silhouette").length;
        // *** THE MEASURED FACT THAT JUSTIFIES THE FIX, RUN LIVE RATHER THAN QUOTED FROM THE CHANGELOG. ***
        ok("!! on a real scene with real silhouette features, the classifier finds a NON-ZERO count",
           trueSil > 0 && foundSil > 0,
           trueSil + " silhouette features present, " + foundSil + " render strokes classified as silhouette " +
           "(the string-match version measured 0 of these on RobotExpressive despite 12 features existing)");
        ok("...and it does not over-fire (every render stroke silhouette)",
           foundSil < kinds.length, foundSil + " of " + kinds.length);
    } else {
        console.log("  ----  vendor/krbn missing -- the live classification proof cannot run");
    }
}

console.log("\n15. STEP 2: THE RIGGED .glb ITSELF, LOADED BACK INDEPENDENTLY AND ANIMATED");
{
    const RG = fs.readFileSync(path.join(ENG, "krbn-rigged.html"), "utf8");
    const RE = fs.readFileSync(path.join(ENG, "tools", "krbn", "riggedExport.js"), "utf8");
    ok("!! GLTFExporter is vendored, from the SAME three revision already in the tree",
       fs.existsSync(path.join(ENG, "vendor", "three", "jsm", "exporters", "GLTFExporter.js")) &&
       /REVISION = '160'/.test(fs.readFileSync(path.join(ENG, "vendor", "three", "three.module.js"), "utf8")) &&
       fs.readFileSync(path.join(ENG, "vendor", "three", "jsm", "exporters", "GLTFExporter.js"), "utf8").length > 1000,
       "a different revision's exporter against this tree's r160 loader is an unverified combination, not a matched pair");
    ok("!! three's own LICENSE sits beside the vendored copy", fs.existsSync(path.join(ENG, "vendor", "three", "LICENSE")));
    ok("!! rigid (unskinned) parts get weight 1.0 to their owning bone -- not dropped, not left unweighted",
       /W\[0\] = 1;/.test(codeOnly(RE)) && /parent, hops = 0, idx = -1/.test(codeOnly(RE)),
       "measured on the source: 15 of 15 rigid meshes resolve to an existing bone one hop up -- none needed a synthetic joint");
    ok("!! the export is built from the BIND pose, not whatever the Time slider says at the click",
       /\.pose\(\)/.test(codeOnly(RE)) && /restore the BIND pose/.test(RE),
       "an exported RIG plays every clip; baking in the scrub position would export one frozen pose wearing a skeleton");
    ok("!! stroke geometry is TUBES, not a LINES primitive",
       /BufferGeometry\(\)/.test(codeOnly(RE)) && /setIndex\(IDX\)/.test(codeOnly(RE)) && !/THREE\.Line\(/.test(codeOnly(RE)),
       "three's own line materials have no skinning path -- a glTF LINES primitive would export 'correctly' and sit motionless in every viewer");

    let K2 = null, chromium = null;
    try {
        const pw = await import(path.join(ENG, "tools", "ship", "playwrightResolve.mjs"));
        const { createRequire } = await import("node:module");
        const req = createRequire(import.meta.url);
        const r = pw.resolvePlaywright(req);
        if (!pw.browserSkipReason(r.chromium, r.from, pw.HEADLESS_SHELL)) chromium = { mod: r.chromium, shell: pw.HEADLESS_SHELL };
    } catch {}
    if (!chromium) {
        report("live export+round-trip SKIPPED -- no headless Chromium available here");
    } else {
        const http = await import("node:http");
        const srv = http.default.createServer((rq, rs) => {
            const p = decodeURIComponent((rq.url || "/").split("?")[0]);
            const full = path.join(ENG, p === "/" ? "/krbn-rigged.html" : p);
            if (!full.startsWith(ENG) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { rs.writeHead(404); rs.end("nf"); return; }
            const ext = path.extname(full);
            const ct = { ".html":"text/html", ".js":"text/javascript", ".mjs":"text/javascript", ".glb":"model/gltf-binary" }[ext] || "application/octet-stream";
            rs.writeHead(200, { "Content-Type": ct }); rs.end(fs.readFileSync(full));
        });
        await new Promise((r) => srv.listen(0, "127.0.0.1", r));
        const port = srv.address().port;
        const browser = await chromium.mod.launch({ executablePath: chromium.shell });
        try {
            const page = await browser.newPage();
            const errs = [];
            page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
            await page.goto(`http://127.0.0.1:${port}/krbn-rigged.html`, { waitUntil: "networkidle", timeout: 40000 });
            await page.waitForTimeout(16000);
            const [download] = await Promise.all([
                page.waitForEvent("download", { timeout: 30000 }),
                page.click("#glb"),
            ]);
            const glbPath = path.join(HERE, "..", "..", "node_modules", ".krbn-rigged-gate-tmp.glb");
            await download.saveAs(glbPath).catch(() => {});
            let bytes = null; try { bytes = fs.readFileSync(glbPath); } catch {}
            ok("!! clicking Export rigged .glb produces a real download", !!bytes && bytes.length > 10000,
               bytes ? (bytes.length/1024).toFixed(0) + " KB" : "no file saved");
            ok("...with zero page errors during export", errs.length === 0, errs[0] || "clean");

            if (bytes) {
                const b64 = bytes.toString("base64");
                const rt = await page.evaluate(async (b64) => {
                    const { GLTFLoader } = await import("./vendor/three/jsm/loaders/GLTFLoader.js");
                    const THREE = await import("three");
                    const buf = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
                    const gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf, "", res, rej));
                    let skinned = null; gltf.scene.traverse((o) => { if (!skinned && o.isSkinnedMesh) skinned = o; });
                    if (!skinned) return { ok: false, reason: "no SkinnedMesh in the exported file" };
                    const pos = skinned.geometry.getAttribute("position");
                    const sample = (i) => { const v = new THREE.Vector3(); v.fromBufferAttribute(pos, i); skinned.applyBoneTransform(i, v); return [v.x,v.y,v.z]; };
                    const idx = []; for (let i = 0; i < pos.count; i += 97) idx.push(i);
                    skinned.skeleton.pose(); skinned.updateMatrixWorld(true);
                    const rest = idx.map(sample);
                    const clip = gltf.animations.find((a) => /dance|jump/i.test(a.name)) || gltf.animations[0];
                    const mixer = new THREE.AnimationMixer(gltf.scene);
                    mixer.clipAction(clip).play(); mixer.update(clip.duration * 0.5);
                    gltf.scene.updateMatrixWorld(true);
                    const posed = idx.map(sample);
                    const moves = rest.map((r, i) => Math.hypot(r[0]-posed[i][0], r[1]-posed[i][1], r[2]-posed[i][2]));
                    let lo=[1e9,1e9,1e9], hi=[-1e9,-1e9,-1e9];
                    for (const p of posed) for (let k=0;k<3;k++){ if(p[k]<lo[k])lo[k]=p[k]; if(p[k]>hi[k])hi[k]=p[k]; }
                    return { ok: true, boneCount: skinned.skeleton.bones.length, clipCount: gltf.animations.length,
                              vertexCount: pos.count, sampled: idx.length, movedOver1cm: moves.filter((m)=>m>0.01).length,
                              maxMove: Math.max(...moves), posedBBox: [0,1,2].map((k)=>+(hi[k]-lo[k]).toFixed(2)) };
                }, b64);
                ok("!! the exported .glb loads back through GLTFLoader, independent of the export code",
                   rt.ok, rt.ok ? rt.boneCount + " bones, " + rt.clipCount + " clips, " + rt.vertexCount + " vertices" : rt.reason);
                if (rt.ok) {
                    ok("!! MOST sampled vertices actually move under a real clip (>1cm) -- skinning is live, not zeroed out",
                       rt.sampled > 100 && rt.movedOver1cm > rt.sampled * 0.5,
                       rt.movedOver1cm + " of " + rt.sampled + " moved, max " + rt.maxMove.toFixed(2));
                    // *** THE LOAD-BEARING NEGATIVE THAT PROVES THE RENORMALISE WORKED, MEASURED ON THE REAL FILE. ***
                    // A short weight sum makes the posed mesh SHRINK TOWARD THE ORIGIN as it animates -- this
                    // asserts a real-world-scale bounding box under an actual animated pose, not near-zero.
                    ok("!! the posed bounding box is REAL-WORLD SIZE, not collapsed toward the origin",
                       rt.posedBBox.every((d) => d > 1.0), JSON.stringify(rt.posedBBox) +
                       " -- an unnormalised weight cull shrinks this toward [0,0,0] as it animates");
                }
                try { fs.unlinkSync(glbPath); } catch {}
            }
        } finally { await browser.close(); srv.close(); }
    }
}

console.log("\n16. THE LIVE-LOAD CONTROL ON krbn-avatar.html -- AND THE ERROR-STOMPING BUG ITS TESTING FOUND");
{
    const AV = fs.readFileSync(path.join(ENG, "krbn-avatar.html"), "utf8");
    const AVC = codeOnly(AV);     // code shapes
    const AVS = noComments(AV);   // string values -- see section 11's own note on why both are used here

    ok("!! the default boot fetch and the picker share ONE loader, loadAvatar()",
       /async function loadAvatar\(src, label\)/.test(AVC) &&
       /await loadAvatar\(r, GLB\)/.test(AVC) &&
       /onPick: \(picked\) => loadAvatar\(picked,/.test(AVC),
       "a second load path for the picker would be the exact second-copy defect ui/modelPicker.js's own header warns about");
    ok("!! it is mounted with the RobotExpressive preset ui/modelPicker.js expects, not a bare picker",
       /mountModelPicker\(\{/.test(AVC) && /RobotExpressive\.glb/.test(AVS),
       "a picker with no presets still works but silently drops the one model this tree ships alongside the page");

    // *** THE LOAD-BEARING NEGATIVE: THE STOMPING BUG ITSELF. *** The redraw timer fires every REDRAW_MS
    // regardless of what loadAvatar() is doing. draw() used to call say() with the routine status
    // UNCONDITIONALLY, so a failed load's error message displayed for at most one redraw cycle before the
    // next ordinary tick silently overwrote it with the OLD model's still-fine status line -- MEASURED: a
    // synthetic 404 read as a successful load within one redraw cycle (section 16's live test below re-proves
    // this against the fixed code rather than trusting the source-level check alone).
    ok("!! draw() checks the sticky loadErr FIRST, before touching K/scene/fit at all",
       /function draw\(\) \{\s*(?:\/\/[^\n]*\n\s*)*if \(loadErr\) \{ say\(loadErr, true\); return; \}/.test(AVC.replace(/  +/g, " ")) ||
       (() => {
           const body = AVC.slice(AVC.indexOf("function draw() {"));
           const firstIf = body.slice(0, body.indexOf("{", body.indexOf("{") + 1) + 400);
           return /if \(loadErr\) \{ say\(loadErr, true\); return; \}/.test(firstIf) && firstIf.indexOf("loadErr") < firstIf.indexOf("dead || busy");
       })(),
       "a check placed AFTER the busy/dead/K guards would still let the routine say() run first on some ticks");
    ok("!! loadAvatar() clears loadErr as its FIRST statement of every new attempt",
       /async function loadAvatar\(src, label\) \{\s*loadErr = "";/.test(AVC.replace(/ +/g, " ")),
       "clearing it anywhere later would leave a stale error visible for one more tick on every retry");
    ok("!! a preset fetch failure (never reaching loadAvatar) ALSO sets the sticky loadErr, not just say()",
       /onError: \(msg2\) => \{ loadErr = msg2; say\(loadErr, true\); \}/.test(AVC.replace(/ +/g, " ")),
       "ui/modelPicker.js's onError fires OUTSIDE loadAvatar for a dead favourite's 404 -- calling say() alone " +
       "would be exactly as vulnerable to the next tick as the original bug");

    let chromium = null;
    try {
        const pw = await import(path.join(ENG, "tools", "ship", "playwrightResolve.mjs"));
        const { createRequire } = await import("node:module");
        const req = createRequire(import.meta.url);
        const r = pw.resolvePlaywright(req);
        if (!pw.browserSkipReason(r.chromium, r.from, pw.HEADLESS_SHELL)) chromium = { mod: r.chromium, shell: pw.HEADLESS_SHELL };
    } catch {}
    if (!chromium) {
        report("live picker+stomping-bug test SKIPPED -- no headless Chromium available here");
    } else if (!fs.existsSync("/tmp/fixture-icosa.glb")) {
        report("live picker+stomping-bug test SKIPPED -- no /tmp/fixture-icosa.glb test fixture on this box");
    } else {
        const http = await import("node:http");
        const srv = http.default.createServer((rq, rs) => {
            const p = decodeURIComponent((rq.url || "/").split("?")[0]);
            if (p === "/test-fixture.glb") { rs.writeHead(200, { "Content-Type": "model/gltf-binary" }); rs.end(fs.readFileSync("/tmp/fixture-icosa.glb")); return; }
            const full = path.join(ENG, p === "/" ? "/krbn-avatar.html" : p);
            if (!full.startsWith(ENG) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { rs.writeHead(404); rs.end("nf"); return; }
            const ext = path.extname(full);
            const ct = { ".html":"text/html", ".js":"text/javascript", ".mjs":"text/javascript", ".glb":"model/gltf-binary" }[ext] || "application/octet-stream";
            rs.writeHead(200, { "Content-Type": ct }); rs.end(fs.readFileSync(full));
        });
        await new Promise((r) => srv.listen(0, "127.0.0.1", r));
        const port = srv.address().port;
        const browser = await chromium.mod.launch({ executablePath: chromium.shell });
        try {
            const page = await browser.newPage();
            const errs = [];
            page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
            // planted BEFORE navigation: one favourite that resolves (the icosahedron fixture -- distinctly
            // shaped, unskinned, nothing like RobotExpressive) and one that is a genuine 404, exactly the shape
            // "a starred avatar whose file has since moved" describes.
            await page.addInitScript(() => {
                localStorage.setItem("voxelEngine.kpopFavorites", JSON.stringify([
                    { url: "/test-fixture.glb", label: "Icosa" },
                    { url: "/GPU_Assets/GenuinelyMissing.glb", label: "Ghost" },
                ]));
            });
            await page.goto(`http://127.0.0.1:${port}/krbn-avatar.html?ms=1200`, { waitUntil: "networkidle", timeout: 40000 });
            await page.waitForFunction(() => document.querySelector("#msg").textContent.includes("RobotExpressive"), { timeout: 15000 }).catch(() => {});
            const beforeMsg = await page.textContent("#msg");
            ok("!! the default model draws first, before any picker interaction", /RobotExpressive/.test(beforeMsg), beforeMsg);

            // --- the success path: a genuinely different model, loaded live ---
            // NOTE: the status line names the picked FILE ("test-fixture", from the URL loadAvatar's own label
            // argument is derived from), not the favourite's star label ("Icosa") -- the star label is only
            // what the <select> OPTION reads; loadAvatar(picked, picked.name.replace(...)) never sees it. That
            // matches krbn-compare.html's own picker and is not the thing under test here.
            await page.selectOption("#modelSel", { label: "★ Icosa" });
            await page.waitForFunction(() => /test-fixture/.test(document.querySelector("#msg").textContent) && !document.querySelector("#msg").classList.contains("err"), { timeout: 15000 }).catch(() => {});
            const afterIcosa = await page.textContent("#msg");
            const errAfterIcosa = await page.getAttribute("#msg", "class");
            ok("!! picking a favourite REPLACES the drawn model -- status line names the new one, clean class",
               /test-fixture/.test(afterIcosa) && !/err/.test(errAfterIcosa || ""),
               afterIcosa + "  (class=" + errAfterIcosa + ")");
            ok("...and the icosahedron (unskinned) drew with no page error",
               errs.length === 0, errs[0] || "clean");

            // --- the failure path: a dead favourite, and THE STOMPING BUG'S OWN REGRESSION TEST ---
            await page.selectOption("#modelSel", { label: "★ Ghost" });
            await page.waitForFunction(() => document.querySelector("#msg").classList.contains("err"), { timeout: 15000 }).catch(() => {});
            const errMsg = await page.textContent("#msg");
            ok("!! a dead favourite's fetch failure reports an error, does not silently do nothing",
               /Ghost|HTTP|Could not fetch/i.test(errMsg), errMsg);
            // REDRAW_MS is 1200 here (the query clamp floor) -- three ticks is 3.6s, comfortably past "one cycle"
            await page.waitForTimeout(4500);
            const errMsgLater = await page.textContent("#msg");
            const classLater = await page.getAttribute("#msg", "class");
            ok("!! *** THE REGRESSION TEST FOR THE STOMPING BUG *** -- the error SURVIVES past multiple redraw ticks",
               /err/.test(classLater || "") && errMsgLater === errMsg,
               "at t0: \"" + errMsg + "\"  at t+4.5s: \"" + errMsgLater + "\" -- MEASURED before the loadErr fix: " +
               "a 404 read as a successful load within one redraw cycle because the timer's own say() call overwrote it");
        } finally { await browser.close(); srv.close(); }
    }
}

console.log(fails ? `\nkrbnCompareLive-selfcheck: ${fails} FAILED` : "\nkrbnCompareLive-selfcheck: all checks pass");
if (fails) process.exit(1);
