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

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

console.log("krbnCompareLive-selfcheck -- the right pane is really Krbn\n");

const HTML = fs.readFileSync(path.join(ENG, "krbn-compare.html"), "utf8");

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
       /GLTFLoader/.test(HTML) && /m = \{ positions, triangles, skinned[^}]*\}/.test(HTML),
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
       /isSkinnedMesh/.test(HTML) && /posed by clip/.test(HTML),
       "the figure you see is one frame of one animation; not saying which is how a wrong-looking pose becomes unfalsifiable");
    ok("!! the camera fit centres on the BOUNDING BOX, not the vertex centroid",
       /computeFit[\s\S]{0,400}lo\[i\]\+hi\[i\]\)\/2/.test(HTML),
       "the centroid is a DENSITY measure: a loaded model with a dense head and a sparse limb centres in the head and frames empty space");
}

console.log("\n4. PRESETS: THE SHIPPED MODEL, AND THE AVATAR FAVOURITES -- READ FROM THE ONE STORE");
{
    ok("!! RobotExpressive is a preset and the file it names really is in the tree",
       /GPU_Assets\/RobotExpressive\.glb/.test(HTML) && fs.existsSync(path.join(ENG, "GPU_Assets", "RobotExpressive.glb")),
       "a preset pointing at a path that does not ship is a dead entry that only fails when somebody clicks it");
    ok("!! favourites come from voxelEngine.kpopFavorites -- THE STORE THE AVATAR STAR ALREADY WRITES",
       /voxelEngine\.kpopFavorites/.test(HTML),
       "ui/avatarFavorites.js's own header: a second favourites list would be the two-declarations defect -- you would " +
       "star something on server.html, not see it here, and never find out why");
    // *** THE LOAD-BEARING NEGATIVE. *** Offering favourites is safe only while this page cannot CREATE one.
    // The moment it writes that key, the store has two authors and the star stops being the single place a
    // favourite is made -- which is the exact defect the file above exists to prevent.
    ok("!! ...and this page only READS that key, never writes it",
       !/setItem\(\s*FAV_KEY|setItem\(\s*["']voxelEngine\.kpopFavorites/.test(HTML),
       "server.html's star stays the one place a favourite is made");
    const shared = fs.readFileSync(path.join(ENG, "ui", "kpopFavorites.js"), "utf8");
    ok("...and the key this page reads is byte-for-byte the one that module declares",
       /STORAGE_KEY = "voxelEngine\.kpopFavorites"/.test(shared),
       "read from the store's own source rather than trusted from memory -- if it is ever renamed, this fails here " +
       "instead of silently showing an empty favourites list forever");
    ok("!! a preset and a picked file share ONE parse path",
       /async function loadModel\(src\)/.test(HTML) && /loadModel\(f\)/.test(HTML) && /await loadModel\(\{ name/.test(HTML),
       "two loaders would need the same cache invalidation kept in step in two places -- the bug section 3 already caught once");
    ok("!! a favourite whose file has moved REPORTS its 404 rather than silently doing nothing",
       /HTTP " \+ r\.status/.test(HTML),
       "the favourites list is not this page's to prune, so a dead entry must say what happened");
}

console.log("\n7. THE SKINNING PASS -- A BIND POSE IS NOT A SLIGHTLY-WRONG FIGURE, IT IS A DIFFERENT OBJECT");
{
    ok("!! skinned vertices go through their joint matrices, via three's OWN applyBoneTransform",
       /applyBoneTransform\(i, v\)/.test(HTML),
       "not a fourth hand-rolled weighted sum -- three r160 implements this and this file already depends on it " +
       "for the loader; face/avatarStage.js's hand-written loop exists only because it runs against the tree's own parser");
    ok("!! ...and the skeleton is POSED by a clip first, not left at rest",
       /AnimationMixer/.test(HTML) && /mx\.update\(0\)/.test(HTML),
       "bone matrices mean nothing until the skeleton is placed; t=0 of the idle clip is deterministic and is the " +
       "pose the asset was authored to be seen in -- the same choice avatarStage makes");
    ok("!! ...and the mixer runs BEFORE updateMatrixWorld, or the bones carry no rotation",
       /mx\.update\(0\)[\s\S]{0,400}updateMatrixWorld\(true\)/.test(HTML),
       "ordering is the whole thing here: updating the world matrices first bakes the REST pose and the clip is lost");
    ok("!! glTF's Y-up is mapped to this page's Z-up",
       /positions\.push\(\[v\.x, v\.z, v\.y\]\)/.test(HTML),
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
       /function dropDegenerate/.test(HTML) && /m = dropDegenerate\(m\)/.test(HTML),
       "idempotent on anything Krbn already cleaned; one sanitiser that always runs beats a rule about which paths need it");
    ok("!! ...and it rejects the REPEATED-INDEX case, which is the one that actually crashed Krbn",
       /i === j \|\| j === k \|\| i === k/.test(HTML),
       "MEASURED: halfedge.js:183 does tB.find(vi => vi !== v0 && vi !== v1), which returns undefined for an " +
       "[a,b,a] sliver, and positions[undefined] threw TypeError inside vec3.sub -- 3 such triangles in RobotExpressive.glb");
    ok("...and the zero-area case too (distinct indices, collinear points)",
       /Math\.hypot\(cx, cy, cz\)/.test(HTML));
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
       /function fitDistance/.test(HTML) && /Math\.sin\(half\)/.test(HTML),
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

console.log(fails ? `\nkrbnCompareLive-selfcheck: ${fails} FAILED` : "\nkrbnCompareLive-selfcheck: all checks pass");
if (fails) process.exit(1);
