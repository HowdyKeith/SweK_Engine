// FILE: face/wireframeHead.js
// VERSION: v1 -- v3239
//
// THE PROCEDURAL WIREFRAME HEAD, EXTRACTED FROM thead.html SO THERE IS ONE DEFINITION OF ITS SHAPE.
//
// *** WHAT MOVED IS THE GEOMETRY AND NOTHING ELSE. *** thead.html carries about 450 further lines of animation:
// a mood vocabulary, live channels shaped like a MOODS entry, a face-rig feed (ui/faceRig.js passes
// channelSource "face"), signalLost handling, a gesture vocabulary. THAT LAYER STAYED WHERE IT IS. Moving it
// would have been a large refactor with real regression risk on a page Keith uses, to solve a problem nobody
// has: the animation is not what would diverge.
//
// THE SHAPE IS WHAT WOULD DIVERGE. The Pip-Boy wants the same head on its main screen, and a second copy of
// these fifty lines would be the ninth instance this session of a thing declared twice and compared never --
// MODES in nine files, the gate-file walk in three, a mesher's liveness in four, stated runtime in 59 of 82.
// SO THE SHAPE IS BUILT HERE AND BOTH CONSUMERS ASK FOR IT.
//
// THE PARTS ARE RETURNED, NOT HIDDEN, because the animation layer that stayed behind drives them by name --
// jaw, eyes, brows, the mood curve, the lip ring. A module that owned the geometry and hid the handles would
// have forced the caller to re-find them, which is the same coupling with an extra step.
//
//   import { buildWireframeHead } from "/face/wireframeHead.js";
//   const rig = buildWireframeHead(THREE);          // one root group -- add it anywhere
//   scene.add(rig.root);                            // ... or an RTT scene, which is the Pip-Boy's case
//
// ONE ROOT GROUP IS THE POINT OF THE EXTRACTION. thead.html added the head to the scene and the neck and torso
// SEPARATELY, because they must not nod with the head. That is fine for a page that owns its scene and useless
// to anybody who wants to place the whole figure somewhere. Here they are all children of `root`, the head is
// still a nested group that nods alone, and THE VISUAL RESULT IS UNCHANGED.

export function buildWireframeHead(THREE, opts = {}) {
    const root = new THREE.Group();
    root.name = "swek-wireframe-head";

    // ---------- the procedural wireframe head/torso ----------
    // A group we can nod/turn; children: skull, jaw, eyes, brows, torso — all wireframe.
    const head = new THREE.Group(); root.add(head);
    const WIRE = 0x37e6a0, WIRE2 = 0x2bd0ff;
    function wireMat(color){ return new THREE.MeshBasicMaterial({ color, wireframe: true, transparent:true, opacity:0.9 }); }
    const mats = [];
    function mkWire(geo, color, parent){ const m = wireMat(color); mats.push(m); const mesh = new THREE.Mesh(geo, m); (parent||head).add(mesh); return mesh; }

    // Skull — a slightly squashed icosphere
    const skull = mkWire(new THREE.IcosahedronGeometry(0.62, 2), WIRE);
    skull.scale.set(0.92, 1.06, 0.96);
    skull.position.y = 0.18;

    // Cranium accent ring (gives it a "head" read)
    const crown = mkWire(new THREE.TorusGeometry(0.5, 0.02, 6, 24), WIRE2);
    crown.position.set(0, 0.5, 0); crown.rotation.x = Math.PI/2; crown.scale.set(1,1,0.9);

    // Jaw — a lower box we open/close for talking
    const jaw = new THREE.Group(); head.add(jaw);
    jaw.position.set(0, -0.12, 0.02);
    const jawMesh = mkWire(new THREE.BoxGeometry(0.5, 0.26, 0.5, 3, 2, 3), WIRE, jaw);
    jawMesh.position.y = -0.10; jawMesh.scale.set(0.92, 1, 0.86);
    const JAW_PIVOT_Y = 0.02; // rotate jaw around the back-top so it hinges

    // Eyes — two spheres in sockets that we can aim + scale for blink
    function mkEye(x){
      const g = new THREE.Group(); g.position.set(x, 0.22, 0.52); head.add(g);
      const ball = mkWire(new THREE.SphereGeometry(0.11, 10, 8), WIRE2, g);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: 0xdffcff }));
      pupil.position.z = 0.09; g.add(pupil);
      return { g, ball, pupil };
    }
    const eyeL = mkEye(-0.22), eyeR = mkEye(0.22);

    // Brows — thin boxes above the eyes we tilt for mood
    function mkBrow(x){ const b = mkWire(new THREE.BoxGeometry(0.2, 0.03, 0.06), WIRE, head); b.position.set(x, 0.38, 0.55); return b; }
    const browL = mkBrow(-0.22), browR = mkBrow(0.22);

    // Mouth — TWO parts so it can both EXPRESS (smile/frown/flat/o) and OPEN as the jaw drops:
    //   moodCurve = the lip line that curves for mood (∪ smile / ∩ frown / flat neutral)
    //   lipRing   = an ellipse that OPENS (grows tall) as the jaw drops or for a surprised "o"
    const moodCurve = mkWire(new THREE.TorusGeometry(0.16, 0.012, 6, 20, Math.PI), WIRE2);
    moodCurve.position.set(0, -0.04, 0.54);
    const lipRing = mkWire(new THREE.TorusGeometry(0.13, 0.012, 6, 22), WIRE2);   // full ellipse (open mouth)
    lipRing.position.set(0, -0.06, 0.54); lipRing.visible = false;

    // Neck + torso — a tapered cylinder + shoulders box so it's "head/torso"
    const neck = mkWire(new THREE.CylinderGeometry(0.16, 0.2, 0.28, 10, 1), WIRE);
    neck.position.y = -0.42;
    const torso = mkWire(new THREE.CylinderGeometry(0.34, 0.5, 0.7, 12, 2), WIRE);
    torso.position.y = -0.95; torso.scale.set(1.25, 1, 0.7);
    root.add(neck); root.add(torso);   // torso/neck do NOT nod with the head group -- same as thead.html

    function dispose() {
        for (const m of mats) { try { m.dispose(); } catch {} }
        root.traverse((o) => { try { o.geometry && o.geometry.dispose(); } catch {} });
    }

    return { root, head, jaw, jawMesh, JAW_PIVOT_Y, skull, crown, eyeL, eyeR, browL, browR, moodCurve, lipRing,
             neck, torso, mats, dispose, mkWire, wireMat, WIRE, WIRE2 };
}
