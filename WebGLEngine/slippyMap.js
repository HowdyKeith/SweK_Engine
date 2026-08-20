// slippyMap.js — reusable, dependency-free interactive pan/zoom map (OpenStreetMap tiles, no key, no library).
// Plain script: defines a global makeSlippyMap(container) -> { setMarkers(markers), fit(), render() }.
// markers: [{ lat, lng, color:'red'|'orange'|'green', label?, address? }]. Drag to pan, wheel/+/- to zoom; auto-fits.
// Used by petfbi.html (PetFBI report pins); load via <script src="/slippyMap.js"></script> before your inline script.
function makeSlippyMap(container){
  const TILE=256, el=t=>document.createElement(t);
  let z=3,cLat=20,cLng=0,W=0,H=0,markers=[];
  container.style.position="relative"; container.style.overflow="hidden"; container.style.cursor="grab"; container.style.touchAction="none";
  const tileLayer=el("div"); Object.assign(tileLayer.style,{position:"absolute",left:0,top:0});
  const markerLayer=el("div"); Object.assign(markerLayer.style,{position:"absolute",left:0,top:0,pointerEvents:"none"});
  const attrib=el("div"); attrib.innerHTML='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener" style="color:#9ac8ff">OpenStreetMap</a>';
  Object.assign(attrib.style,{position:"absolute",right:"4px",bottom:"2px",font:"10px sans-serif",color:"#9fb3cc",background:"rgba(6,10,18,0.65)",padding:"1px 5px",borderRadius:"4px",pointerEvents:"auto",zIndex:5});
  const zc=el("div"); Object.assign(zc.style,{position:"absolute",left:"6px",top:"6px",display:"flex",flexDirection:"column",gap:"3px",zIndex:5});
  const zbtn=(t,fn)=>{const b=el("button");b.textContent=t;Object.assign(b.style,{width:"26px",height:"26px",font:"16px/1 sans-serif",background:"rgba(10,20,31,0.85)",color:"#cfe6ff",border:"1px solid #2f628f",borderRadius:"5px",cursor:"pointer"});b.onclick=fn;return b;};
  zc.append(zbtn("+",()=>zoomBy(1)),zbtn("\u2212",()=>zoomBy(-1)));
  container.append(tileLayer,markerLayer,zc,attrib);
  const project=(lat,lng,zz)=>{const s=TILE*Math.pow(2,zz);const x=(lng+180)/360*s;const sl=Math.sin(lat*Math.PI/180);const y=(0.5-Math.log((1+sl)/(1-sl))/(4*Math.PI))*s;return{x,y};};
  const unproject=(x,y,zz)=>{const s=TILE*Math.pow(2,zz);const lng=x/s*360-180;const n=Math.PI-2*Math.PI*y/s;const lat=180/Math.PI*Math.atan(0.5*(Math.exp(n)-Math.exp(-n)));return{lat,lng};};
  function render(){
    W=container.clientWidth; H=container.clientHeight; if(!W||!H) return;
    const c=project(cLat,cLng,z), originX=c.x-W/2, originY=c.y-H/2, n=Math.pow(2,z);
    const x0=Math.floor(originX/TILE), x1=Math.floor((originX+W)/TILE), y0=Math.floor(originY/TILE), y1=Math.floor((originY+H)/TILE);
    tileLayer.innerHTML="";
    for(let tx=x0;tx<=x1;tx++) for(let ty=y0;ty<=y1;ty++){
      if(ty<0||ty>=n) continue; const wx=((tx%n)+n)%n;
      const img=el("img"); img.src="https://tile.openstreetmap.org/"+z+"/"+wx+"/"+ty+".png"; img.width=TILE; img.height=TILE; img.alt=""; img.draggable=false;
      Object.assign(img.style,{position:"absolute",left:(tx*TILE-originX)+"px",top:(ty*TILE-originY)+"px",userSelect:"none"});
      img.onerror=()=>{img.style.visibility="hidden";}; tileLayer.appendChild(img);
    }
    markerLayer.innerHTML="";
    for(const m of markers){
      const p=project(m.lat,m.lng,z), col=m.color==="green"?"#3bd17a":m.color==="orange"?"#ffb14e":"#ff5b5b";
      const pin=el("div"); pin.title=(m.label?m.label+" \u00b7 ":"")+(m.address||(m.lat.toFixed(4)+","+m.lng.toFixed(4)));
      Object.assign(pin.style,{position:"absolute",left:(p.x-originX)+"px",top:(p.y-originY)+"px",transform:"translate(-50%,-100%)",pointerEvents:"auto"});
      pin.innerHTML='<svg width="22" height="30" viewBox="0 0 22 30"><path d="M11 0C5 0 0 5 0 11c0 8 11 19 11 19s11-11 11-19C22 5 17 0 11 0z" fill="'+col+'" stroke="#04121c" stroke-width="1.5"/><circle cx="11" cy="11" r="4.3" fill="#04121c"/></svg>';
      markerLayer.appendChild(pin);
    }
  }
  function fit(){
    if(!markers.length){z=3;cLat=20;cLng=0;render();return;}
    if(markers.length===1){cLat=markers[0].lat;cLng=markers[0].lng;z=13;render();return;}
    let mnLat=90,mxLat=-90,mnLng=180,mxLng=-180;
    for(const m of markers){mnLat=Math.min(mnLat,m.lat);mxLat=Math.max(mxLat,m.lat);mnLng=Math.min(mnLng,m.lng);mxLng=Math.max(mxLng,m.lng);}
    cLat=(mnLat+mxLat)/2; cLng=(mnLng+mxLng)/2; const w=container.clientWidth||640, h=container.clientHeight||420; let best=2;
    for(let zz=18;zz>=2;zz--){const a=project(mnLat,mnLng,zz),b=project(mxLat,mxLng,zz); if(Math.abs(b.x-a.x)<w*0.85&&Math.abs(b.y-a.y)<h*0.85){best=zz;break;}}
    z=best; render();
  }
  function zoomBy(d){ const nz=Math.max(2,Math.min(18,z+d)); if(nz!==z){z=nz;render();} }
  function zoomAt(mx,my,d){
    const nz=Math.max(2,Math.min(18,z+d)); if(nz===z) return;
    const c=project(cLat,cLng,z), ll=unproject(c.x-W/2+mx, c.y-H/2+my, z);
    const c2=project(ll.lat,ll.lng,nz), nc=unproject(c2.x-mx+W/2, c2.y-my+H/2, nz);
    z=nz; cLat=Math.max(-85,Math.min(85,nc.lat)); cLng=nc.lng; render();
  }
  let drag=false,lx=0,ly=0;
  container.addEventListener("pointerdown",e=>{drag=true;lx=e.clientX;ly=e.clientY;container.style.cursor="grabbing";try{container.setPointerCapture(e.pointerId);}catch{}});
  container.addEventListener("pointermove",e=>{if(!drag)return;const dx=e.clientX-lx,dy=e.clientY-ly;lx=e.clientX;ly=e.clientY;const c=project(cLat,cLng,z),u=unproject(c.x-dx,c.y-dy,z);cLat=Math.max(-85,Math.min(85,u.lat));cLng=u.lng;render();});
  container.addEventListener("pointerup",()=>{drag=false;container.style.cursor="grab";});
  container.addEventListener("wheel",e=>{e.preventDefault();const r=container.getBoundingClientRect();zoomAt(e.clientX-r.left,e.clientY-r.top,e.deltaY<0?1:-1);},{passive:false});
  try{new ResizeObserver(()=>render()).observe(container);}catch{}
  return { setMarkers(ms){ markers=ms||[]; const go=()=>{ if(!container.clientWidth){requestAnimationFrame(go);return;} fit(); }; go(); }, fit, render };
}
