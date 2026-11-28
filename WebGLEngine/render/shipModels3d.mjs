// WebGLEngine/render/shipModels3d.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE SHIP MODELS, SHARED (Keith, 2026-11-28: "Do we have ship models we can take from battleship3d" -- "then sub vs ship"). battleship3d.html built its carrier, battleship,
// cruiser and destroyer from boxes, cylinders and an extruded prow, page-local. They live here now, MOVED WORD FOR WORD (three.js and the board's cell size handed in where
// the page read its globals), so the page draws exactly what it drew -- tools/ship/shipModels3d-selfcheck.mjs holds this module's bodies to the page's old code, mesh for
// mesh -- and the sub arena can draw its surface ships with them.
//
//   const M = createShipModels(THREE, { cell = 3 })
//   M.buildShipBody(name, len) -> { grp, segMeshes }     battleship3d's own: name CARRIER | BATTLESHIP | CRUISER | DESTROYER, len cells long, centred, bow toward -x
//   M.shipForClass(cls) -> THREE.Group                  (2026-11-28) a physics/mechanics/surfaceShip.mjs class at its size in metres: the nearest design (freighter: the
//                                                       carrier's flat deck as a cargo deck; corvette: the destroyer; destroyer: the cruiser), scaled so its length, beam
//                                                       and draft are the class's, bow toward +x (the arena's heading 0), waterline at y = 0
"use strict";
import { SHIP_CLASSES } from "../physics/mechanics/surfaceShip.mjs";

export const DESIGN_OF_CLASS = Object.freeze({ freighter: Object.freeze({ name: "CARRIER", len: 4 }), corvette: Object.freeze({ name: "DESTROYER", len: 2 }), destroyer: Object.freeze({ name: "CRUISER", len: 3 }) });
export function createShipModels(THREE, { cell = 3 } = {}) {
    const CELL = cell;
    const SP = { steel:0x47565e, steelHi:0x5d6f77, deck:0x4a5a55, gun:0x2b3537, island:0x6c7e85, detail:0x82949b, funnel:0x3a4248, carrierDeck:0x2c3633, stripe:0xc9b23a };
    function smat(color,o={}){ return new THREE.MeshStandardMaterial({ color, roughness:o.r??0.65, metalness:o.m??0.35 }); }
    function sbox(w,h,d,color,o){ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d), smat(color,o)); m.castShadow=true; return m; }
    function scyl(rt,rb,h,seg,color,o){ const m=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg), smat(color,o)); m.castShadow=true; return m; }
    function makeProw(len,width,height){
      const s=new THREE.Shape(); s.moveTo(-len,0); s.lineTo(0,width/2); s.lineTo(0,-width/2); s.closePath();
      const g=new THREE.ExtrudeGeometry(s,{depth:height,bevelEnabled:false}); g.rotateX(-Math.PI/2); return g;
    }
    function mkTurret(scale,barrels,face){
      const g=new THREE.Group();
      const base=scyl(0.30*scale,0.38*scale,0.2,12,SP.gun,{m:0.5}); base.position.y=0.1; g.add(base);
      const house=sbox(0.6*scale,0.36*scale,0.74*scale,0x37434a,{m:0.5}); house.position.y=0.34; g.add(house);
      for(let b=0;b<barrels;b++){ const bar=scyl(0.045,0.045,0.85*scale,8,SP.gun); bar.rotation.z=Math.PI/2;
        bar.position.set(face*0.5*scale,0.36,(b-(barrels-1)/2)*0.16*scale); g.add(bar); }
      return g;
    }
    function mkBridge(){
      // v4205 -- THESE THREE LINES CRASHED THE PAGE ON LOAD, AND HAD SINCE THEY WERE WRITTEN.
      // Object.assign(mesh,{position:...}) tries to REPLACE Object3D.position, which three.js has defined as a
      // read-only accessor since r15x -- so it threw "Cannot assign to read only property 'position'" inside
      // init() -> newGame() -> placeFleet() -> makeShipMesh() -> buildShipBody() -> decorateSegment() ->
      // mkBridge(), before a single frame was drawn. Measured: the main canvas held 0 lit pixels and exactly 1
      // distinct colour. Every other mesh in this file uses .position.set(), which is what these now do.
      const g=new THREE.Group();
      const isle1=sbox(0.78,0.5,0.95,SP.island); isle1.position.set(0,0.25,0); g.add(isle1);
      const isle2=sbox(0.55,0.42,0.66,SP.island); isle2.position.set(0,0.7,0); g.add(isle2);
      const isle3=sbox(0.34,0.32,0.42,SP.detail); isle3.position.set(0,1.07,0); g.add(isle3);
      const mast=scyl(0.035,0.035,0.9,6,SP.detail); mast.position.y=1.6; g.add(mast);
      return g;
    }
    function mkFunnel(){ const g=new THREE.Group();
      const f=scyl(0.17,0.21,0.62,10,SP.funnel,{m:0.4}); f.position.y=0.55; f.rotation.x=-0.08; g.add(f);
      const cap=scyl(0.19,0.19,0.05,10,0x20262a); cap.position.y=0.86; g.add(cap); return g; }
    function mkMiniPlane(){ const g=new THREE.Group();
      g.add(sbox(0.5,0.07,0.1,0xb9c4c4)); g.add(sbox(0.12,0.04,0.46,0x9fb0b0));
      const t=sbox(0.1,0.04,0.22,0x9fb0b0); t.position.x=-0.2; g.add(t); return g; }

    function decorateSegment(ship,i,seg,ctx){
      const {midIdx,last}=ctx, T=ship.name, sb=CELL*0.32;
      if(T==="CARRIER"){
        const fd=sbox(CELL*0.99,0.07,CELL*0.84,SP.carrierDeck,{r:0.95}); fd.position.y=0.72; seg.add(fd);
        const stripe=sbox(CELL*0.9,0.02,0.12,SP.stripe,{r:0.6}); stripe.position.y=0.76; seg.add(stripe);
        if(i===1){ const island=sbox(0.42,0.72,0.5,SP.island); island.position.set(0,1.05,sb); seg.add(island);
          const fn=mkFunnel(); fn.scale.setScalar(0.6); fn.position.set(-0.22,0.78,sb); seg.add(fn);
          const mast=scyl(0.03,0.03,0.7,6,SP.detail); mast.position.set(0.1,1.6,sb); seg.add(mast); }
        if(i===2||i===last){ const p=mkMiniPlane(); p.position.set(0.2,0.8,-0.4); p.rotation.y=0.35; seg.add(p); }
      } else if(T==="BATTLESHIP"){
        if(i===0){ const t=mkTurret(1.15,3,-1); t.position.y=0.66; seg.add(t); }
        if(i===midIdx){ const b=mkBridge(); b.position.y=0.66; seg.add(b);
          const f1=mkFunnel(); f1.position.set(0.42,0.5,0); seg.add(f1); const f2=mkFunnel(); f2.position.set(-0.18,0.5,0); seg.add(f2); }
        if(i===last){ const t=mkTurret(1.15,3,1); t.position.y=0.66; seg.add(t); }
      } else if(T==="CRUISER"){
        if(i===0){ const t=mkTurret(0.92,2,-1); t.position.y=0.66; seg.add(t); }
        if(i===midIdx){ const b=mkBridge(); b.scale.setScalar(0.85); b.position.y=0.66; seg.add(b);
          const f=mkFunnel(); f.position.set(0.1,0.5,0); seg.add(f); }
        if(i===last){ const t=mkTurret(0.92,2,1); t.position.y=0.66; seg.add(t); }
      } else { // DESTROYER
        if(i===0){ const t=mkTurret(0.8,1,-1); t.position.y=0.66; seg.add(t); }
        if(i===last){ const b=mkBridge(); b.scale.setScalar(0.7); b.position.set(-0.15,0.66,0); seg.add(b);
          const f=mkFunnel(); f.scale.setScalar(0.85); f.position.set(0.35,0.5,0); seg.add(f); }
      }
    }

    // builds the per-segment visual body (centered at local origin). Reused by the
    // board ships AND the fleet-status mini view.
    function buildShipBody(name, len){
      const grp=new THREE.Group(); const segMeshes=[];
      const W=CELL*0.58, L=CELL*0.98, last=len-1, midIdx=Math.floor(len/2);
      for(let i=0;i<len;i++){
        const localOff=(i-(len-1)/2)*CELL;
        const seg=new THREE.Group(); const isBow=(i===0), isStern=(i===last);
        const lower=sbox(L,0.5,W,SP.steel,{r:0.7,m:0.3}); lower.position.y=0; seg.add(lower);
        const upper=sbox(L*0.98,0.4,W*0.8,SP.steelHi,{r:0.7}); upper.position.y=0.42; seg.add(upper);
        const deck=sbox(L*0.95,0.06,W*0.74,SP.deck,{r:0.92}); deck.position.y=0.62; seg.add(deck);
        if(isBow){ const prow=new THREE.Mesh(makeProw(W*0.95,W,0.55), smat(SP.steel,{r:0.7,m:0.3}));
          prow.position.set(-L*0.5,-0.05,0); prow.castShadow=true; seg.add(prow);
          const fdeck=new THREE.Mesh(makeProw(W*0.9,W*0.74,0.06), smat(SP.deck,{r:0.92})); fdeck.position.set(-L*0.5,0.6,0); seg.add(fdeck); }
        if(isStern){ const tr=sbox(L*0.28,0.34,W*0.82,SP.steel,{r:0.7}); tr.position.set(L*0.52,0.05,0); seg.add(tr); }
        decorateSegment({name,len}, i, seg, {midIdx,last});
        seg.position.x=localOff; seg.userData.localOff=localOff;
        grp.add(seg); segMeshes.push(seg);
      }
      return { grp, segMeshes };
    }

    /** A surface-ship class at its size in metres (see the header): bow toward +x, the waterline at y = 0, the keel `draft` below it. */
    function shipForClass(cls) {
        const C = SHIP_CLASSES[cls], D = DESIGN_OF_CLASS[cls]; if (!C || !D) throw new Error("shipModels3d.shipForClass: unknown class " + cls);
        const { grp } = buildShipBody(D.name, D.len), box = new THREE.Box3().setFromObject(grp), size = box.getSize(new THREE.Vector3());
        const hull = new THREE.Group(); hull.add(grp);
        grp.rotation.y = Math.PI;                 // battleship3d's bow is toward -x; the arena's heading 0 is +x
        grp.position.y = -box.min.y;              // the design's lowest point on y = 0 ...
        const keel = new THREE.Group(); keel.add(hull); hull.position.y = 0;
        hull.scale.set(C.length / size.x, C.draft * 2.2 / size.y, C.beam / size.z);   // ... its full height 2.2 drafts (a hull rides with some 45% of it under water)
        hull.position.y = -C.draft;               // ... and the keel `draft` below the waterline
        keel.userData.cls = cls; keel.userData.length = C.length; keel.userData.draft = C.draft;
        return keel;
    }
    return { SP, buildShipBody, shipForClass, cell: CELL };
}
