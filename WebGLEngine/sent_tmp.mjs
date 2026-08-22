import * as D from "./tools/roundhouse/devices.mjs";
import { declaredPlantMode, ERRORISH_FIELD } from "./tools/roundhouse/plantedCoverage.mjs";
for(const name of D.DEVICE_NAMES){
  let dev; try{dev=await D.getDevice(name);}catch{continue;}
  const d=declaredPlantMode(dev); if(!d||!ERRORISH_FIELD.test(d.flips)) continue;
  const primary=(dev.modes||[]).find(m=>m!==d.mode); if(!primary) continue;
  let a,b; try{a=await dev.build({mode:primary});b=await dev.build({mode:d.mode});}catch{continue;}
  const av=a?.[d.flips], bv=b?.[d.flips];
  const sent = v => v===-1 || v===null || v===undefined || !Number.isFinite(v);
  if(sent(av)||sent(bv)||av<0||bv<0)
    console.log("SENTINEL/NEG "+name+" ["+d.mode+"] "+d.flips+": "+av+" -> "+bv);
}
console.log("scan done");
