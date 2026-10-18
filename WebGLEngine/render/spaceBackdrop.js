// WebGLEngine/render/spaceBackdrop.js -- the PAGE-SIDE half of the baked space backdrop, for the 6DOF pages.
//
// es-box3d-fly3d.html has worn a baked nebula cubemap and a procedural star since v3833/v3835 (the pure generators are
// render/nebulaSkybox.js and render/proceduralStar.js, both gated). The two 6DOF space pages -- es-box3d-6dof.html and
// space-battleship.html -- sat under a flat fill. This is the thirty lines fly3d keeps inline, lifted into one module the
// 6DOF pages share, with three differences that are the point of the lift:
//
//   1. IT IS OFF UNTIL ASKED, AND BAKES NOTHING UNTIL ASKED. mountBackdrop leaves scene.background the page's flat
//      colour and does no work; the first set(true) pays the bake (measured below), so a page that never turns it on
//      pays nothing and its existing pictures do not move.
//   2. THE STAR IS AT INFINITY. fly3d puts its star on a sphere 1400 units from the origin, which is right for a camera
//      that orbits within 300 of the origin and wrong for a battle that spans thousands: the star would be a
//      thing the fighters could fly past. Here the star is re-seated on every draw (onBeforeRender, which three calls
//      per render CALL with the camera that call uses) at a fixed direction and a fixed fraction of that camera's far
//      plane, drawn first with no depth test so that everything else paints over it. One mesh serves every window.
//   3. THE BACKGROUND IS THE WORLD'S, NOT THE CRAFT'S. scene.background as a cube texture is looked up by the world
//      direction of each pixel (three draws it with the camera's rotation and not its position), so a window whose camera
//      sits on a craft sees the sky turn as the craft turns, and two windows looking the same way see the same sky.
//
// THREE IS A PARAMETER, and so is the canvas factory and the baker: the module imports no Three and touches no DOM of its
// own, which is what lets render/spaceBackdrop-selfcheck.mjs run it in node against a recording stand-in and sabotage it.
//
// MEASURED (node, this box, one run, size 256 for the nebula): nebula 282 ms, star 522 ms at 256 and 133 ms at 128; the
// star is small on screen (about 5 degrees across) and is baked at 128, so the first switch-on is about 0.4 s on the main
// thread. That is a hitch, not a stall, and the page says "baking" for it. The per-window draw cost is one cube-sampled
// quad per render call (the battleship page makes up to a dozen into one canvas); the page gate times it.
//
// HONEST LIMITS: the cubemap's gradient runs along world +Y, which is up in a Y-up scene and a horizontal axis in the
// Z-up battleship page -- in space there is no up and nothing reads it. The star is cosmetic: it is a disc where the key
// light comes from, and the pages' lighting does not depend on it.

export const NEBULA = Object.freeze({ seed: 0xBEEF, size: 256 });          // fly3d's own seed and size
export const STAR = Object.freeze({ seed: 909, kelvin: 6200, size: 128 });  // fly3d's seed and temperature; 128 because it covers ~5 degrees
export const STAR_ANGLE = 0.0925;   // radians, the star's angular radius: fly3d's 130 / 1400
export const STAR_DISTANCE = 0.5;   // of the drawing camera's far plane

// six RGB byte buffers (one per face, in the generator's face order) -> six canvases. The face order is NOT touched here:
// the generator's order is [+X, -X, +Y, -Y, +Z, -Z], which is the order THREE.CubeTexture reads its images in.
export function faceCanvases(faces, size, makeCanvas) {
    return faces.map((rgb) => {
        const cv = makeCanvas(size, size);
        const ctx = cv.getContext("2d"), img = ctx.createImageData(size, size), d = img.data;
        for (let k = 0, p = 0; k < rgb.length; k += 3, p += 4) { d[p] = rgb[k]; d[p + 1] = rgb[k + 1]; d[p + 2] = rgb[k + 2]; d[p + 3] = 255; }
        ctx.putImageData(img, 0, 0);
        return cv;
    });
}

function cubeTexture(THREE, bake, opts, makeCanvas) {
    const { size, faces } = bake(opts);
    const tex = new THREE.CubeTexture(faceCanvases(faces, size, makeCanvas));
    if ("colorSpace" in tex) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
}

const STAR_VERTEX = `
      varying vec3 vN; varying vec3 vView;
      void main(){ vN = normalize(position); vec4 wp = modelMatrix * vec4(position,1.0); vView = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`;
const STAR_FRAGMENT = `
      precision highp float; uniform samplerCube uStar; uniform float uLimb; uniform vec3 uCorona;
      varying vec3 vN; varying vec3 vView;
      void main(){
        vec3 base = textureCube(uStar, vN).rgb;
        float mu = clamp(dot(vN, vView), 0.0, 1.0);
        float limb = 1.0 - uLimb*(1.0-mu);   // mirrors proceduralStar.limbDarkening
        float rim = pow(1.0-mu, 3.0);
        gl_FragColor = vec4(base*limb + uCorona*rim, 1.0);
      }`;

// mountBackdrop(THREE, scene, opts) -> the handle. opts:
//   flat        the page's own background colour (a number, 0xRRGGBB) -- what scene.background is when the backdrop is off
//   light       [x, y, z], the direction the key light comes FROM; the star sits there
//   makeCanvas  (w, h) => canvas   (a page passes document.createElement; the gate passes a recorder)
//   bakeNebula, bakeStar   the generators (a page passes the real ones; the gate passes spies and a thrower)
//   hide        objects to hide while the backdrop is on (the battleship page's own star shell: two skies is clutter)
export function mountBackdrop(THREE, scene, opts) {
    const flat = new THREE.Color(opts.flat);
    const makeCanvas = opts.makeCanvas, bakeNebula = opts.bakeNebula, bakeStar = opts.bakeStar, hide = opts.hide || [];
    const now = opts.now || (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
    const L = opts.light || [30, 60, 40], ln = Math.hypot(L[0], L[1], L[2]) || 1, dir = [L[0] / ln, L[1] / ln, L[2] / ln];
    scene.background = flat;
    const h = { on: false, texture: null, star: null, error: null, bakeMs: null, flat, dir, baked: false };

    function bake() {
        if (h.baked) return;
        h.baked = true;
        const t0 = now();
        try { h.texture = cubeTexture(THREE, (o) => bakeNebula({ ...o }), NEBULA, makeCanvas); } catch (e) { h.texture = null; h.error = "nebula: " + (e && e.message || e); }
        const t1 = now();
        let starTex = null;
        try { starTex = cubeTexture(THREE, (o) => bakeStar({ ...o }), STAR, makeCanvas); } catch (e) { h.error = (h.error ? h.error + "; " : "") + "star: " + (e && e.message || e); }
        const t2 = now();
        h.bakeMs = { nebula: t1 - t0, star: t2 - t1 };
        if (starTex) {
            const mat = new THREE.ShaderMaterial({
                uniforms: { uStar: { value: starTex }, uLimb: { value: 0.6 }, uCorona: { value: new THREE.Color(0x3a2a10) } },
                vertexShader: STAR_VERTEX, fragmentShader: STAR_FRAGMENT, depthTest: false, depthWrite: false,
            });
            const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), mat);
            mesh.frustumCulled = false; mesh.renderOrder = -1000;
            // seat the star at infinity for the camera that is about to draw it
            mesh.onBeforeRender = (renderer, sc, cam) => {
                const D = cam.far * STAR_DISTANCE;
                mesh.position.set(cam.position.x + dir[0] * D, cam.position.y + dir[1] * D, cam.position.z + dir[2] * D);
                mesh.scale.setScalar(D * Math.sin(STAR_ANGLE));
                mesh.updateMatrixWorld(true);
            };
            scene.add(mesh); h.star = mesh; h.starTexture = starTex;
        }
    }

    h.set = (on) => {
        on = !!on;
        if (on) bake();
        const live = on && !!h.texture;   // a bake that failed leaves the flat fill, said by `error`, never a half-set scene
        h.on = live;
        scene.background = live ? h.texture : flat;
        if (h.star) h.star.visible = live;
        for (const o of hide) o.visible = !live;
        return live;
    };
    h.toggle = () => h.set(!h.on);
    // what a page hands its gate: plain data, no Three objects (the background is named by identity, not guessed from its type)
    h.describe = () => ({
        on: h.on, baked: h.baked, error: h.error, bakeMs: h.bakeMs, flat: opts.flat,
        background: h.texture && scene.background === h.texture ? "nebula" : scene.background === flat ? "flat" : "other",
        faces: h.texture ? h.texture.images.length : 0, faceSize: h.texture ? h.texture.images[0].width : 0,
        star: h.star ? { visible: h.star.visible, dir: dir.slice() } : null,
        hidden: hide.map((o) => !o.visible),
    });
    h.dispose = () => {
        h.set(false);
        for (const t of [h.texture, h.starTexture]) if (t && t.dispose) t.dispose();
        if (h.star) { scene.remove(h.star); h.star.geometry.dispose(); h.star.material.dispose(); }
        h.texture = null; h.star = null; h.starTexture = null; h.baked = false;
    };
    return h;
}
