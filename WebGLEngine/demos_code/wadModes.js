// FILE: demos_code/wadModes.js
//
// Game-mode layer on top of wadLevelHost. A mode implements the host hooks
// (init/update/onShoot/updateHUD/dispose) and exposes `entities` for the host
// to draw. Pick a mode + WAD room, mount, play.
//
//   import { mountWadModes, MODES } from "./wadModes.js";
//   const host = await mountWadModes({ mode: "deathmatch", bridgeUrl, kpop });
//
// Modes:
//   deathmatch / tdm — WORKING: red vs blue ArenaBots + you, frags, respawn.
//   ctf              — scaffold (flags placed; carry/capture is the next pass).
//   bomb             — delegates to the existing CSBotManager (de_-style match);
//                      needs a CS-format layout, not an arbitrary WAD room.
import { WadLevelHost } from "../multiplayer/wadLevelHost.js";
import { ArenaBot }     from "../simulation/arenaBot.js";
import { WEAPONS, GUNGAME_LADDER } from "../simulation/weapons.js";

// ---- Deathmatch (and Team Deathmatch) --------------------------------------
class Deathmatch {
  constructor(opts = {}) {
    this.name = opts.name || "Deathmatch";
    this.redCount = opts.red ?? 5;
    this.blueCount = opts.blue ?? 4;
    this.playerTeam = "blue";
    this.bots = []; this.entities = [];
    this.score = { red: 0, blue: 0 };
    this.playerHp = 100; this.playerFrags = 0; this._deadFor = 0;
    this.weaponKey = opts.weapon || null;     // fixed weapon for all (e.g. Instagib)
  }
  init(host) {
    const eye = host.camera.y;
    if (this.weaponKey) { host.weaponSet = [this.weaponKey]; host.playerWeapon = this.weaponKey; }
    const sr = host.spawnPoints(this.redCount), sb = host.spawnPoints(this.blueCount);
    for (let i = 0; i < this.redCount; i++)  { const b = new ArenaBot({ team:"red",  x:sr[i].x, z:sr[i].z }); if (this.weaponKey) b.setWeapon(WEAPONS[this.weaponKey]); b.y = eye; this.bots.push(b); }
    for (let i = 0; i < this.blueCount; i++) { const b = new ArenaBot({ team:"blue", x:sb[i].x, z:sb[i].z }); if (this.weaponKey) b.setWeapon(WEAPONS[this.weaponKey]); b.y = eye; this.bots.push(b); }
    this.entities = this.bots;
  }
  _wander(host) { const b = host.getBounds();
    return { x: b.minX+1+Math.random()*(b.maxX-b.minX-2), z: b.minZ+1+Math.random()*(b.maxZ-b.minZ-2) }; }
  update(dt, host) {
    const eye = host.camera.y;
    const player = { x: host.camera.x, z: host.camera.z, y: eye, team: this.playerTeam,
      alive: this.playerHp > 0, applyDamage: (n) => { this.playerHp = Math.max(0, this.playerHp - n); } };
    const ctx = {
      dt, bounds: host.getBounds(),
      enemiesOf: (bot) => {
        const list = this.bots.filter(o => o !== bot && o.team !== bot.team && o.alive);
        if (bot.team !== this.playerTeam && player.alive) list.push(player);
        return list;
      },
      pickWander: () => this._wander(host),
      respawn: (bot) => { const sp = this._wander(host); bot.respawnAt(sp.x, sp.z); },
      losClear: (ax,ay,az,bx,by,bz) => host.losClear(ax,ay,az,bx,by,bz),
      findPath: (ax,az,bx,bz) => host.findPath(ax,az,bx,bz),
    };
    for (const b of this.bots) { b.y = eye; b.update(ctx); }
    this.score.red  = this.bots.filter(b => b.team==="red").reduce((s,b)=>s+(b.frags||0),0) + (this.playerTeam==="red"  ? this.playerFrags : 0);
    this.score.blue = this.bots.filter(b => b.team==="blue").reduce((s,b)=>s+(b.frags||0),0) + (this.playerTeam==="blue" ? this.playerFrags : 0);
    if (this.playerHp <= 0) { this._deadFor += dt;
      if (this._deadFor > 4) { this.playerHp = 100; this._deadFor = 0; const sp = this._wander(host); host.camera.x = sp.x; host.camera.z = sp.z; } }
  }
  onShoot(host, ray) {
    let hit = null, bestT = 1e9;
    for (const b of this.bots) {
      if (!b.alive || b.team === this.playerTeam) continue;
      if (!host.losClear(ray.ox, ray.oy, ray.oz, b.x, (b.y ?? ray.oy), b.z)) continue;
      const t = this._rayHit(ray, b); if (t != null && t < bestT) { bestT = t; hit = b; }
    }
    if (hit && Math.random() < 0.7) { hit.applyDamage(25, null); if (!hit.alive) this.playerFrags++; }
  }
  _rayHit(ray, b) {
    const by = b.y ?? ray.oy;
    const t = (b.x-ray.ox)*ray.dx + (by-ray.oy)*ray.dy + (b.z-ray.oz)*ray.dz;
    if (t < 0 || t > 40) return null;
    const cx = ray.ox+ray.dx*t, cy = ray.oy+ray.dy*t, cz = ray.oz+ray.dz*t;
    return Math.hypot(b.x-cx, by-cy, b.z-cz) < 1.2 ? t : null;
  }
  updateHUD(el) {
    const alive = this.bots.filter(b => b.alive).length;
    el.textContent =
      `${this.name.toUpperCase()}    RED ${this.score.red} : ${this.score.blue} BLUE\n` +
      `HP ${Math.round(this.playerHp)}    frags ${this.playerFrags}    bots alive ${alive}/${this.bots.length}\n` +
      `WASD move · drag look · click shoot · Esc quit`;
  }
  dispose() {}
}

// ---- Capture the Flag (in the WAD room) ------------------------------------
class CaptureTheFlag {
  constructor(opts = {}) {
    this.name = "Capture the Flag";
    this.redCount = opts.red ?? 3; this.blueCount = opts.blue ?? 3;
    this.playerTeam = "blue";
    this.bots = []; this.flags = []; this.entities = [];
    this.score = { red: 0, blue: 0 };
    this.playerHp = 100; this._deadFor = 0; this.playerCarry = null;
    this.RETURN_S = 8; this.PICKUP = 2.0; this.CAP = 2.5;
  }
  init(host) {
    const eye = host.camera.y;
    const sp = host.spawnPoints(2 + this.redCount + this.blueCount);
    this.flags = [
      { team:"red",  x:sp[0].x, z:sp[0].z, home:{x:sp[0].x,z:sp[0].z}, carrier:null, dropped:false, returnT:0, r:1, g:0.3, b:0.3, scale:0.6 },
      { team:"blue", x:sp[1].x, z:sp[1].z, home:{x:sp[1].x,z:sp[1].z}, carrier:null, dropped:false, returnT:0, r:0.4, g:0.6, b:1, scale:0.6 },
    ];
    for (let i=0;i<this.redCount;i++)  { const b=new ArenaBot({team:"red",  x:sp[2+i].x, z:sp[2+i].z}); b.y=eye; this.bots.push(b); }
    for (let i=0;i<this.blueCount;i++) { const b=new ArenaBot({team:"blue", x:sp[2+this.redCount+i].x, z:sp[2+this.redCount+i].z}); b.y=eye; this.bots.push(b); }
    this.entities = this.flags.concat(this.bots);
  }
  _flagOf(team)    { return this.flags.find(f => f.team === team); }
  _enemyFlag(team) { return this.flags.find(f => f.team !== team); }
  _wander(host)    { const b=host.getBounds(); return { x:b.minX+1+Math.random()*(b.maxX-b.minX-2), z:b.minZ+1+Math.random()*(b.maxZ-b.minZ-2) }; }
  _d2(a, f)        { const dx=a.x-f.x, dz=a.z-f.z; return dx*dx+dz*dz; }
  _near(a, p, r)   { const dx=a.x-p.x, dz=a.z-p.z; return dx*dx+dz*dz < r*r; }
  _drop(f)         { if (f.carrier && f.carrier!=="player") { f.x=f.carrier.x; f.z=f.carrier.z; } f.carrier=null; f.dropped=true; f.returnT=this.RETURN_S; }
  _returnHome(f)   { f.carrier=null; f.dropped=false; f.x=f.home.x; f.z=f.home.z; if (this.playerCarry===f) this.playerCarry=null; }
  _capture(team,f) { this.score[team]++; this._returnHome(f); }
  update(dt, host) {
    const eye = host.camera.y;
    const player = { x:host.camera.x, z:host.camera.z, y:eye, team:this.playerTeam,
      alive:this.playerHp>0, applyDamage:(n)=>{ this.playerHp=Math.max(0,this.playerHp-n); } };
    const ctx = {
      dt, bounds: host.getBounds(),
      enemiesOf:(bot)=>{ const l=this.bots.filter(o=>o!==bot && o.team!==bot.team && o.alive); if (bot.team!==this.playerTeam && player.alive) l.push(player); return l; },
      pickWander:()=>this._wander(host),
      respawn:(bot)=>{ const h=this._flagOf(bot.team).home; bot.respawnAt(h.x+(Math.random()*4-2), h.z+(Math.random()*4-2)); },
      losClear:(ax,ay,az,bx,by,bz)=>host.losClear(ax,ay,az,bx,by,bz),
      findPath:(ax,az,bx,bz)=>host.findPath(ax,az,bx,bz),
    };
    // flag follow / drop / return-timer
    for (const f of this.flags) {
      if (f.carrier) {
        const dead = (f.carrier !== "player" && (!f.carrier.alive || !this.bots.includes(f.carrier)));
        if (dead) this._drop(f);
        else if (f.carrier !== "player") { f.x=f.carrier.x; f.z=f.carrier.z; }
        else { f.x=player.x; f.z=player.z; }
      } else if (f.dropped) { f.returnT -= dt; if (f.returnT<=0) this._returnHome(f); }
    }
    // bots: head to enemy flag, or home when carrying; fight along the way
    for (const b of this.bots) {
      b.y = eye;
      const ef=this._enemyFlag(b.team), hf=this._flagOf(b.team);
      const goal = (ef.carrier===b) ? hf.home : { x:ef.x, z:ef.z };
      b.setGoal(goal.x, goal.z);
      b.update(ctx);
      if (!ef.carrier && this._d2(b,ef) < this.PICKUP*this.PICKUP) { ef.carrier=b; ef.dropped=false; }
      if (ef.carrier===b && this._near(b, hf.home, this.CAP) && !hf.carrier && !hf.dropped) { this._capture(b.team, ef); b.frags=(b.frags||0)+1; }
      if (hf.dropped && this._d2(b,hf) < this.PICKUP*this.PICKUP) this._returnHome(hf);
    }
    // player pickups / captures / returns
    if (player.alive) {
      const pef=this._enemyFlag(this.playerTeam), phf=this._flagOf(this.playerTeam);
      if (!pef.carrier && this._d2(player,pef) < this.PICKUP*this.PICKUP) { pef.carrier="player"; pef.dropped=false; this.playerCarry=pef; }
      if (this.playerCarry && this._near(player, phf.home, this.CAP) && !phf.carrier && !phf.dropped) this._capture(this.playerTeam, this.playerCarry);
      if (phf.dropped && this._near(player, phf, this.PICKUP)) this._returnHome(phf);
    }
    if (this.playerHp <= 0) {
      this._deadFor += dt;
      if (this.playerCarry) { this._drop(this.playerCarry); this.playerCarry=null; }
      if (this._deadFor > 4) { this.playerHp=100; this._deadFor=0; const h=this._flagOf(this.playerTeam).home; host.camera.x=h.x; host.camera.z=h.z; }
    }
  }
  onShoot(host, ray) {
    let hit=null, bestT=1e9;
    for (const b of this.bots) {
      if (!b.alive || b.team===this.playerTeam) continue;
      if (!host.losClear(ray.ox,ray.oy,ray.oz, b.x,(b.y??ray.oy),b.z)) continue;
      const by=b.y??ray.oy;
      const t=(b.x-ray.ox)*ray.dx+(by-ray.oy)*ray.dy+(b.z-ray.oz)*ray.dz;
      if (t<0||t>40) continue;
      const cx=ray.ox+ray.dx*t, cy=ray.oy+ray.dy*t, cz=ray.oz+ray.dz*t;
      if (Math.hypot(b.x-cx, by-cy, b.z-cz) < 1.2 && t<bestT) { bestT=t; hit=b; }
    }
    if (hit && Math.random()<0.7) hit.applyDamage(25, null);
  }
  updateHUD(el) {
    const carry = this.playerCarry ? "   [carrying — return to your base!]" : "";
    el.textContent =
      `CAPTURE THE FLAG    RED ${this.score.red} : ${this.score.blue} BLUE${carry}\n` +
      `HP ${Math.round(this.playerHp)}    grab the enemy flag, bring it to your base\n` +
      `WASD move · drag look · click shoot · Esc quit`;
  }
  dispose() {}
}

// ---- Bomb Defusal (delegate to the existing CS system) ---------------------
class BombDefusalDelegate {
  constructor(opts = {}) { this.name = "Bomb Defusal (CSBotManager)"; this.entities = []; this._opts = opts; }
  init(host) {
    console.log("[wadModes] Bomb Defusal uses the existing CSBotManager / cs.play() path, " +
                "which needs a CS-format layout (t_spawn/ct_spawn/a_site/b_site + corridor graph), " +
                "not an arbitrary WAD room. Wire CSBotManager here once a CS layout is loaded.");
  }
  update() {} 
  updateHUD(el) { el.textContent = "BOMB DEFUSAL — runs via CSBotManager on a CS-format map.\nSee simulation/CSBotManager.js / cs.play(). Arbitrary-WAD support TBD."; }
  dispose() {}
}

// ---- shared player-shot helpers (weapon-aware, LoS-gated) ------------------
function spreadRay(ray, s) {
  if (!s) return ray;
  let dx = ray.dx + (Math.random()*2-1)*s, dy = ray.dy + (Math.random()*2-1)*s, dz = ray.dz;
  const len = Math.hypot(dx, dy, dz) || 1;
  return { ox:ray.ox, oy:ray.oy, oz:ray.oz, dx:dx/len, dy:dy/len, dz:dz/len };
}
function nearestBotAlongRay(host, ray, bots, playerTeam, range) {
  let hit = null, bestT = 1e9;
  for (const b of bots) {
    if (!b.alive || b.team === playerTeam) continue;
    if (!host.losClear(ray.ox, ray.oy, ray.oz, b.x, (b.y ?? ray.oy), b.z)) continue;
    const by = b.y ?? ray.oy;
    const t = (b.x-ray.ox)*ray.dx + (by-ray.oy)*ray.dy + (b.z-ray.oz)*ray.dz;
    if (t < 0 || t > range) continue;
    const cx = ray.ox+ray.dx*t, cy = ray.oy+ray.dy*t, cz = ray.oz+ray.dz*t;
    if (Math.hypot(b.x-cx, by-cy, b.z-cz) < 1.2 && t < bestT) { bestT = t; hit = b; }
  }
  return hit;
}
// Uses the player's current weapon (host.weapon()): per-pellet spread, range,
// hit chance, and rocket splash. Returns the primary bot hit (for frag counts).
function shootEnemyBot(host, ray, bots, playerTeam) {
  const w = (host.weapon && host.weapon()) || { damage:25, range:45, hitChance:0.7, pellets:1, spread:0.03 };
  let primary = null;
  for (let p = 0; p < (w.pellets || 1); p++) {
    const b = nearestBotAlongRay(host, spreadRay(ray, w.spread || 0), bots, playerTeam, w.range);
    if (b && Math.random() < (w.hitChance ?? 1)) {
      b.applyDamage(w.damage, null);
      if (w.splash) {
        for (const o of bots) {
          if (!o.alive || o === b || o.team === playerTeam) continue;
          const dx = o.x-b.x, dz = o.z-b.z;
          if (dx*dx + dz*dz <= w.splash*w.splash) o.applyDamage(w.damage * 0.5, null);
        }
      }
      if (!primary) primary = b;
    }
  }
  return primary;
}

// ---- King of the Hill ------------------------------------------------------
class KingOfTheHill {
  constructor(opts = {}) {
    this.name = "King of the Hill";
    this.redCount = opts.red ?? 4; this.blueCount = opts.blue ?? 4;
    this.playerTeam = "blue"; this.bots = []; this.entities = [];
    this.score = { red: 0, blue: 0 };
    this.playerHp = 100; this._deadFor = 0; this._owner = null; this.RADIUS = 8;
  }
  init(host) {
    const eye = host.camera.y, b = host.getBounds();
    this.hill = { x:(b.minX+b.maxX)/2, z:(b.minZ+b.maxZ)/2, y:eye, r:0.9, g:0.85, b:0.3, scale:1.3 };
    const sr = host.spawnPoints(this.redCount), sb = host.spawnPoints(this.blueCount);
    for (let i=0;i<this.redCount;i++)  { const x=new ArenaBot({team:"red",  x:sr[i].x, z:sr[i].z}); x.y=eye; this.bots.push(x); }
    for (let i=0;i<this.blueCount;i++) { const x=new ArenaBot({team:"blue", x:sb[i].x, z:sb[i].z}); x.y=eye; this.bots.push(x); }
    this.entities = [this.hill].concat(this.bots);
  }
  _wander(host){ const b=host.getBounds(); return { x:b.minX+1+Math.random()*(b.maxX-b.minX-2), z:b.minZ+1+Math.random()*(b.maxZ-b.minZ-2) }; }
  _inHill(e){ const dx=e.x-this.hill.x, dz=e.z-this.hill.z; return dx*dx+dz*dz < this.RADIUS*this.RADIUS; }
  update(dt, host) {
    const eye = host.camera.y;
    const player = { x:host.camera.x, z:host.camera.z, y:eye, team:this.playerTeam, alive:this.playerHp>0, applyDamage:(n)=>{ this.playerHp=Math.max(0,this.playerHp-n); } };
    const ctx = { dt, bounds: host.getBounds(),
      enemiesOf:(bot)=>{ const l=this.bots.filter(o=>o!==bot&&o.team!==bot.team&&o.alive); if (bot.team!==this.playerTeam&&player.alive) l.push(player); return l; },
      pickWander:()=>({ x:this.hill.x+(Math.random()*6-3), z:this.hill.z+(Math.random()*6-3) }),
      respawn:(bot)=>{ const sp=this._wander(host); bot.respawnAt(sp.x,sp.z); },
      losClear:(ax,ay,az,bx,by,bz)=>host.losClear(ax,ay,az,bx,by,bz),
      findPath:(ax,az,bx,bz)=>host.findPath(ax,az,bx,bz) };
    for (const b of this.bots) { b.y=eye; b.setGoal(this.hill.x, this.hill.z); b.update(ctx); }
    let red=0, blue=0;
    for (const b of this.bots) if (b.alive && this._inHill(b)) (b.team==="red"?red++:blue++);
    if (player.alive && this._inHill(player)) (this.playerTeam==="red"?red++:blue++);
    this._owner = red>blue ? "red" : (blue>red ? "blue" : null);
    if (this._owner) {
      this.score[this._owner] += dt;
      this.hill.r = this._owner==="red"?1:0.4; this.hill.g = this._owner==="red"?0.3:0.6; this.hill.b = this._owner==="red"?0.3:1;
    } else { this.hill.r=0.9; this.hill.g=0.85; this.hill.b=0.3; }
    if (this.playerHp<=0){ this._deadFor+=dt; if(this._deadFor>4){ this.playerHp=100; this._deadFor=0; const sp=this._wander(host); host.camera.x=sp.x; host.camera.z=sp.z; } }
  }
  onShoot(host, ray) { shootEnemyBot(host, ray, this.bots, this.playerTeam); }
  updateHUD(el) {
    el.textContent =
      `KING OF THE HILL    RED ${Math.floor(this.score.red)} : ${Math.floor(this.score.blue)} BLUE\n` +
      `hill: ${this._owner ? this._owner.toUpperCase() : "contested"}    HP ${Math.round(this.playerHp)}\n` +
      `stand on the hill to score · WASD · drag look · click shoot · Esc`;
  }
  dispose() {}
}

// ---- Domination (multiple capture points) ----------------------------------
class Domination {
  constructor(opts = {}) {
    this.name = "Domination";
    this.redCount = opts.red ?? 4; this.blueCount = opts.blue ?? 4;
    this.numPoints = opts.points ?? 3;
    this.playerTeam = "blue"; this.bots = []; this.points = []; this.entities = [];
    this.score = { red: 0, blue: 0 };
    this.playerHp = 100; this._deadFor = 0; this.CAP_R = 6; this.CAP_TIME = 3;
  }
  init(host) {
    const eye = host.camera.y;
    const sp = host.spawnPoints(this.numPoints + this.redCount + this.blueCount);
    for (let i=0;i<this.numPoints;i++) this.points.push({ x:sp[i].x, z:sp[i].z, y:eye, owner:null, capTeam:null, prog:0, r:0.6, g:0.6, b:0.6, scale:1.0 });
    for (let i=0;i<this.redCount;i++)  { const x=new ArenaBot({team:"red",  x:sp[this.numPoints+i].x, z:sp[this.numPoints+i].z}); x.y=eye; this.bots.push(x); }
    for (let i=0;i<this.blueCount;i++) { const x=new ArenaBot({team:"blue", x:sp[this.numPoints+this.redCount+i].x, z:sp[this.numPoints+this.redCount+i].z}); x.y=eye; this.bots.push(x); }
    this.entities = this.points.concat(this.bots);
  }
  _wander(host){ const b=host.getBounds(); return { x:b.minX+1+Math.random()*(b.maxX-b.minX-2), z:b.minZ+1+Math.random()*(b.maxZ-b.minZ-2) }; }
  _near(a,p,r){ const dx=a.x-p.x, dz=a.z-p.z; return dx*dx+dz*dz < r*r; }
  _targetPointFor(bot){ let best=this.points[0], bd=1e9; for (const p of this.points){ if (p.owner===bot.team) continue; const dx=p.x-bot.x,dz=p.z-bot.z,d=dx*dx+dz*dz; if (d<bd){ bd=d; best=p; } } return best; }
  update(dt, host) {
    const eye = host.camera.y;
    const player = { x:host.camera.x, z:host.camera.z, y:eye, team:this.playerTeam, alive:this.playerHp>0, applyDamage:(n)=>{ this.playerHp=Math.max(0,this.playerHp-n); } };
    const ctx = { dt, bounds: host.getBounds(),
      enemiesOf:(bot)=>{ const l=this.bots.filter(o=>o!==bot&&o.team!==bot.team&&o.alive); if (bot.team!==this.playerTeam&&player.alive) l.push(player); return l; },
      pickWander:()=>this._wander(host),
      respawn:(bot)=>{ const sp=this._wander(host); bot.respawnAt(sp.x,sp.z); },
      losClear:(ax,ay,az,bx,by,bz)=>host.losClear(ax,ay,az,bx,by,bz),
      findPath:(ax,az,bx,bz)=>host.findPath(ax,az,bx,bz) };
    for (const b of this.bots) { b.y=eye; const tp=this._targetPointFor(b); b.setGoal(tp.x, tp.z); b.update(ctx); }
    for (const p of this.points) {
      let red=0, blue=0;
      for (const b of this.bots) if (b.alive && this._near(b,p,this.CAP_R)) (b.team==="red"?red++:blue++);
      if (player.alive && this._near(player,p,this.CAP_R)) (this.playerTeam==="red"?red++:blue++);
      const holder = (red>0&&blue===0) ? "red" : (blue>0&&red===0) ? "blue" : null;
      if (holder && holder!==p.owner) {
        if (p.capTeam!==holder) { p.capTeam=holder; p.prog=0; }
        p.prog += dt;
        if (p.prog>=this.CAP_TIME) { p.owner=holder; p.prog=0; p.capTeam=null; }
      } else { p.capTeam=null; p.prog=0; }
      if (p.owner==="red") { p.r=1; p.g=0.3; p.b=0.3; } else if (p.owner==="blue") { p.r=0.4; p.g=0.6; p.b=1; } else { p.r=0.6; p.g=0.6; p.b=0.6; }
    }
    for (const p of this.points) if (p.owner) this.score[p.owner] += dt;
    if (this.playerHp<=0){ this._deadFor+=dt; if(this._deadFor>4){ this.playerHp=100; this._deadFor=0; const sp=this._wander(host); host.camera.x=sp.x; host.camera.z=sp.z; } }
  }
  onShoot(host, ray) { shootEnemyBot(host, ray, this.bots, this.playerTeam); }
  updateHUD(el) {
    const tag = (p) => p.owner ? p.owner[0].toUpperCase() : "·";
    el.textContent =
      `DOMINATION    RED ${Math.floor(this.score.red)} : ${Math.floor(this.score.blue)} BLUE\n` +
      `points  ${this.points.map((p,i)=>String.fromCharCode(65+i)+":"+tag(p)).join("  ")}    HP ${Math.round(this.playerHp)}\n` +
      `capture & hold the points · WASD · drag look · click shoot · Esc`;
  }
  dispose() {}
}

// ---- Free-for-All (everyone hostile, individual frags) ---------------------
class FreeForAll {
  constructor(opts = {}) { this.name="Free-for-All"; this.count=opts.count??8; this.bots=[]; this.entities=[]; this.playerTeam="player"; this.playerHp=100; this.playerFrags=0; this._deadFor=0; }
  init(host) {
    const eye=host.camera.y, sp=host.spawnPoints(this.count);
    for (let i=0;i<this.count;i++){ const b=new ArenaBot({team:"ffa_"+i, x:sp[i].x, z:sp[i].z, color:[0.6+Math.random()*0.4, 0.4+Math.random()*0.4, 0.4+Math.random()*0.4]}); b.y=eye; this.bots.push(b); }
    this.entities=this.bots;
  }
  _wander(host){ const b=host.getBounds(); return { x:b.minX+1+Math.random()*(b.maxX-b.minX-2), z:b.minZ+1+Math.random()*(b.maxZ-b.minZ-2) }; }
  update(dt, host) {
    const eye=host.camera.y;
    const player={ x:host.camera.x, z:host.camera.z, y:eye, team:this.playerTeam, alive:this.playerHp>0, applyDamage:(n)=>{ this.playerHp=Math.max(0,this.playerHp-n); } };
    const ctx={ dt, bounds:host.getBounds(),
      enemiesOf:(bot)=>{ const l=this.bots.filter(o=>o!==bot&&o.alive); if (player.alive) l.push(player); return l; },
      pickWander:()=>this._wander(host), respawn:(bot)=>{ const sp=this._wander(host); bot.respawnAt(sp.x,sp.z); },
      losClear:(ax,ay,az,bx,by,bz)=>host.losClear(ax,ay,az,bx,by,bz), findPath:(ax,az,bx,bz)=>host.findPath(ax,az,bx,bz) };
    for (const b of this.bots){ b.y=eye; b.update(ctx); }
    if (this.playerHp<=0){ this._deadFor+=dt; if(this._deadFor>3){ this.playerHp=100; this._deadFor=0; const sp=this._wander(host); host.camera.x=sp.x; host.camera.z=sp.z; } }
  }
  onShoot(host, ray){ const hit=shootEnemyBot(host, ray, this.bots, this.playerTeam); if (hit && !hit.alive) this.playerFrags++; }
  updateHUD(el){ const top=Math.max(this.playerFrags, ...this.bots.map(b=>b.frags||0)); el.textContent=`FREE-FOR-ALL    your frags ${this.playerFrags}    leader ${top}    HP ${Math.round(this.playerHp)}\nWASD · drag look · click shoot · Esc`; }
  dispose(){}
}

// ---- Last Man Standing (lives, no respawn once out) ------------------------
class LastManStanding {
  constructor(opts = {}) { this.name="Last Man Standing"; this.count=opts.count??6; this.lives=opts.lives??3; this.bots=[]; this.entities=[]; this.playerTeam="player"; this.playerHp=100; this.playerLives=this.lives; this._deadFor=0; this._botLives={}; }
  init(host){ const eye=host.camera.y, sp=host.spawnPoints(this.count);
    for (let i=0;i<this.count;i++){ const b=new ArenaBot({team:"lms_"+i, x:sp[i].x, z:sp[i].z}); b.y=eye; this._botLives[b.id]=this.lives; this.bots.push(b); }
    this.entities=this.bots; }
  _wander(host){ const b=host.getBounds(); return { x:b.minX+1+Math.random()*(b.maxX-b.minX-2), z:b.minZ+1+Math.random()*(b.maxZ-b.minZ-2) }; }
  update(dt, host){
    const eye=host.camera.y;
    const player={ x:host.camera.x, z:host.camera.z, y:eye, team:this.playerTeam, alive:this.playerHp>0, applyDamage:(n)=>{ this.playerHp=Math.max(0,this.playerHp-n); } };
    const ctx={ dt, bounds:host.getBounds(),
      enemiesOf:(bot)=>{ const l=this.bots.filter(o=>o!==bot&&o.alive); if (player.alive) l.push(player); return l; },
      pickWander:()=>this._wander(host),
      respawn:(bot)=>{ if (this._botLives[bot.id]>0){ this._botLives[bot.id]--; if (this._botLives[bot.id]>0){ const sp=this._wander(host); bot.respawnAt(sp.x,sp.z); } } },
      losClear:(ax,ay,az,bx,by,bz)=>host.losClear(ax,ay,az,bx,by,bz), findPath:(ax,az,bx,bz)=>host.findPath(ax,az,bx,bz) };
    for (const b of this.bots){ b.y=eye; b.update(ctx); }
    if (this.playerHp<=0){ this._deadFor+=dt; if(this._deadFor>3){ this.playerLives--; this._deadFor=0; if(this.playerLives>0){ this.playerHp=100; const sp=this._wander(host); host.camera.x=sp.x; host.camera.z=sp.z; } } }
  }
  onShoot(host, ray){ shootEnemyBot(host, ray, this.bots, this.playerTeam); }
  updateHUD(el){ const standing=this.bots.filter(b=>this._botLives[b.id]>0).length + (this.playerLives>0?1:0);
    el.textContent=`LAST MAN STANDING    you: ${this.playerLives} lives    standing ${standing}/${this.count+1}\nlast one alive wins · WASD · drag look · click shoot · Esc`; }
  dispose(){}
}

// ---- Double Domination (hold BOTH points to score) -------------------------
class DoubleDomination {
  constructor(opts = {}) { this.name="Double Domination"; this.redCount=opts.red??4; this.blueCount=opts.blue??4; this.playerTeam="blue"; this.bots=[]; this.points=[]; this.entities=[]; this.score={red:0,blue:0}; this.playerHp=100; this._deadFor=0; this.CAP_R=6; this.HOLD=3; this._holdT=0; this._holdTeam=null; }
  init(host){ const eye=host.camera.y, sp=host.spawnPoints(2+this.redCount+this.blueCount);
    this.points=[ {x:sp[0].x,z:sp[0].z,y:eye,owner:null,r:0.6,g:0.6,b:0.6,scale:1.0}, {x:sp[1].x,z:sp[1].z,y:eye,owner:null,r:0.6,g:0.6,b:0.6,scale:1.0} ];
    for (let i=0;i<this.redCount;i++){ const b=new ArenaBot({team:"red", x:sp[2+i].x, z:sp[2+i].z}); b.y=eye; this.bots.push(b); }
    for (let i=0;i<this.blueCount;i++){ const b=new ArenaBot({team:"blue", x:sp[2+this.redCount+i].x, z:sp[2+this.redCount+i].z}); b.y=eye; this.bots.push(b); }
    this.entities=this.points.concat(this.bots); }
  _wander(host){ const b=host.getBounds(); return { x:b.minX+1+Math.random()*(b.maxX-b.minX-2), z:b.minZ+1+Math.random()*(b.maxZ-b.minZ-2) }; }
  _near(a,p,r){ const dx=a.x-p.x,dz=a.z-p.z; return dx*dx+dz*dz<r*r; }
  update(dt, host){
    const eye=host.camera.y;
    const player={ x:host.camera.x, z:host.camera.z, y:eye, team:this.playerTeam, alive:this.playerHp>0, applyDamage:(n)=>{ this.playerHp=Math.max(0,this.playerHp-n); } };
    const ctx={ dt, bounds:host.getBounds(),
      enemiesOf:(bot)=>{ const l=this.bots.filter(o=>o!==bot&&o.team!==bot.team&&o.alive); if (bot.team!==this.playerTeam&&player.alive) l.push(player); return l; },
      pickWander:()=>this._wander(host), respawn:(bot)=>{ const sp=this._wander(host); bot.respawnAt(sp.x,sp.z); },
      losClear:(ax,ay,az,bx,by,bz)=>host.losClear(ax,ay,az,bx,by,bz), findPath:(ax,az,bx,bz)=>host.findPath(ax,az,bx,bz) };
    // bots split toward the two points
    this.bots.forEach((b,i)=>{ b.y=eye; const p=this.points[i%2]; b.setGoal(p.x,p.z); b.update(ctx); });
    // control: uncontested presence flips a point's owner (sticky)
    for (const p of this.points){
      let red=0,blue=0;
      for (const b of this.bots) if (b.alive&&this._near(b,p,this.CAP_R)) (b.team==="red"?red++:blue++);
      if (player.alive&&this._near(player,p,this.CAP_R)) (this.playerTeam==="red"?red++:blue++);
      if (red>0&&blue===0) p.owner="red"; else if (blue>0&&red===0) p.owner="blue";
      p.r = p.owner==="red"?1:(p.owner==="blue"?0.4:0.6); p.g = p.owner==="blue"?0.6:(p.owner==="red"?0.3:0.6); p.b = p.owner==="blue"?1:(p.owner==="red"?0.3:0.6);
    }
    // hold BOTH for HOLD seconds -> score, reset
    const both = (this.points[0].owner && this.points[0].owner===this.points[1].owner) ? this.points[0].owner : null;
    if (both){ if (this._holdTeam!==both){ this._holdTeam=both; this._holdT=0; } this._holdT+=dt;
      if (this._holdT>=this.HOLD){ this.score[both]++; this._holdT=0; this._holdTeam=null; this.points[0].owner=null; this.points[1].owner=null; } }
    else { this._holdTeam=null; this._holdT=0; }
    if (this.playerHp<=0){ this._deadFor+=dt; if(this._deadFor>4){ this.playerHp=100; this._deadFor=0; const sp=this._wander(host); host.camera.x=sp.x; host.camera.z=sp.z; } }
  }
  onShoot(host, ray){ shootEnemyBot(host, ray, this.bots, this.playerTeam); }
  updateHUD(el){ el.textContent=`DOUBLE DOMINATION    RED ${this.score.red} : ${this.score.blue} BLUE\nholding both: ${this._holdTeam?this._holdTeam.toUpperCase()+" "+this._holdT.toFixed(1)+"s":"no"}    HP ${Math.round(this.playerHp)}\nhold BOTH points together to score · WASD · click shoot · Esc`; }
  dispose(){}
}

// ---- Bombing Run (carry the neutral ball into the enemy goal) --------------
class BombingRun {
  constructor(opts = {}) { this.name="Bombing Run"; this.redCount=opts.red??3; this.blueCount=opts.blue??3; this.playerTeam="blue"; this.bots=[]; this.entities=[]; this.score={red:0,blue:0}; this.playerHp=100; this._deadFor=0; this.PICK=2; this.GOAL_R=3.5; this.playerCarry=false; }
  init(host){ const eye=host.camera.y, b=host.getBounds(), sp=host.spawnPoints(2+this.redCount+this.blueCount);
    this.ball={ x:(b.minX+b.maxX)/2, z:(b.minZ+b.maxZ)/2, y:eye, carrier:null, r:1, g:0.9, b:0.2, scale:0.55 };
    this.goals=[ {team:"red", x:sp[0].x, z:sp[0].z}, {team:"blue", x:sp[1].x, z:sp[1].z} ];   // a team scores in the OTHER team's goal
    for (let i=0;i<this.redCount;i++){ const x=new ArenaBot({team:"red", x:sp[2+i].x, z:sp[2+i].z}); x.y=eye; this.bots.push(x); }
    for (let i=0;i<this.blueCount;i++){ const x=new ArenaBot({team:"blue", x:sp[2+this.redCount+i].x, z:sp[2+this.redCount+i].z}); x.y=eye; this.bots.push(x); }
    this.entities=[this.ball].concat(this.bots); }
  _wander(host){ const b=host.getBounds(); return { x:b.minX+1+Math.random()*(b.maxX-b.minX-2), z:b.minZ+1+Math.random()*(b.maxZ-b.minZ-2) }; }
  _goalFor(team){ return this.goals.find(g=>g.team!==team); }  // you score in the enemy goal
  _d2(a,p){ const dx=a.x-p.x,dz=a.z-p.z; return dx*dx+dz*dz; }
  _resetBall(host){ const b=host.getBounds(); this.ball.x=(b.minX+b.maxX)/2; this.ball.z=(b.minZ+b.maxZ)/2; this.ball.carrier=null; this.playerCarry=false; }
  update(dt, host){
    const eye=host.camera.y;
    const player={ x:host.camera.x, z:host.camera.z, y:eye, team:this.playerTeam, alive:this.playerHp>0, applyDamage:(n)=>{ this.playerHp=Math.max(0,this.playerHp-n); } };
    const ctx={ dt, bounds:host.getBounds(),
      enemiesOf:(bot)=>{ const l=this.bots.filter(o=>o!==bot&&o.team!==bot.team&&o.alive); if (bot.team!==this.playerTeam&&player.alive) l.push(player); return l; },
      pickWander:()=>this._wander(host), respawn:(bot)=>{ const sp=this._wander(host); bot.respawnAt(sp.x,sp.z); },
      losClear:(ax,ay,az,bx,by,bz)=>host.losClear(ax,ay,az,bx,by,bz), findPath:(ax,az,bx,bz)=>host.findPath(ax,az,bx,bz) };
    // ball follows carrier / drops on death
    if (this.ball.carrier){
      if (this.ball.carrier==="player"){ if (player.alive){ this.ball.x=player.x; this.ball.z=player.z; } else { this.ball.carrier=null; this.playerCarry=false; } }
      else if (this.ball.carrier.alive && this.bots.includes(this.ball.carrier)){ this.ball.x=this.ball.carrier.x; this.ball.z=this.ball.carrier.z; }
      else this.ball.carrier=null;
    }
    // bots: carrier heads to enemy goal; others chase the ball; fight en route
    for (const b of this.bots){ b.y=eye;
      if (this.ball.carrier===b){ const g=this._goalFor(b.team); b.setGoal(g.x,g.z); } else b.setGoal(this.ball.x, this.ball.z);
      b.update(ctx);
      if (!this.ball.carrier && this._d2(b,this.ball)<this.PICK*this.PICK){ this.ball.carrier=b; }
      if (this.ball.carrier===b){ const g=this._goalFor(b.team); if (this._d2(b,g)<this.GOAL_R*this.GOAL_R){ this.score[b.team]++; this._resetBall(host); } }
    }
    // player pickup / score
    if (player.alive){
      if (!this.ball.carrier && this._d2(player,this.ball)<this.PICK*this.PICK){ this.ball.carrier="player"; this.playerCarry=true; }
      if (this.playerCarry){ const g=this._goalFor(this.playerTeam); if (this._d2(player,g)<this.GOAL_R*this.GOAL_R){ this.score[this.playerTeam]++; this._resetBall(host); } }
    }
    if (this.playerHp<=0){ this._deadFor+=dt; if(this._deadFor>4){ this.playerHp=100; this._deadFor=0; const sp=this._wander(host); host.camera.x=sp.x; host.camera.z=sp.z; } }
  }
  onShoot(host, ray){ shootEnemyBot(host, ray, this.bots, this.playerTeam); }
  updateHUD(el){ const carry=this.playerCarry?"   [you have the ball — run to the enemy goal!]":""; el.textContent=`BOMBING RUN    RED ${this.score.red} : ${this.score.blue} BLUE${carry}\nHP ${Math.round(this.playerHp)}    grab the ball, carry it into the enemy goal\nWASD · drag look · click shoot · Esc`; }
  dispose(){}
}

// ---- Gun Game (weapon ladder; each kill bumps your weapon) -----------------
class GunGame {
  constructor(opts = {}) { this.name="Gun Game"; this.count=opts.count??7; this.ladder=GUNGAME_LADDER; this.bots=[]; this.entities=[]; this.playerTeam="player"; this.playerHp=100; this.playerLevel=0; this._deadFor=0; this.winner=null; }
  init(host){ const eye=host.camera.y, sp=host.spawnPoints(this.count);
    host.weaponSet=this.ladder.slice(); host.playerWeapon=this.ladder[0];
    for (let i=0;i<this.count;i++){ const b=new ArenaBot({ team:"gg_"+i, x:sp[i].x, z:sp[i].z, weapon:WEAPONS[this.ladder[0]] }); b.y=eye; b._lvl=0; this.bots.push(b); }
    this.entities=this.bots; }
  _wander(host){ const b=host.getBounds(); return { x:b.minX+1+Math.random()*(b.maxX-b.minX-2), z:b.minZ+1+Math.random()*(b.maxZ-b.minZ-2) }; }
  update(dt, host){
    const eye=host.camera.y;
    const player={ x:host.camera.x, z:host.camera.z, y:eye, team:this.playerTeam, alive:this.playerHp>0, applyDamage:(n)=>{ this.playerHp=Math.max(0,this.playerHp-n); } };
    const ctx={ dt, bounds:host.getBounds(),
      enemiesOf:(bot)=>{ const l=this.bots.filter(o=>o!==bot&&o.alive); if (player.alive) l.push(player); return l; },
      pickWander:()=>this._wander(host), respawn:(bot)=>{ const sp=this._wander(host); bot.respawnAt(sp.x,sp.z); },
      losClear:(ax,ay,az,bx,by,bz)=>host.losClear(ax,ay,az,bx,by,bz), findPath:(ax,az,bx,bz)=>host.findPath(ax,az,bx,bz) };
    for (const b of this.bots){ b.y=eye; b.update(ctx);
      const lvl=Math.min(b.frags||0, this.ladder.length-1);
      if (lvl!==b._lvl){ b._lvl=lvl; b.setWeapon(WEAPONS[this.ladder[lvl]]); }
      if ((b.frags||0) >= this.ladder.length && !this.winner) this.winner=b.id;
    }
    host.playerWeapon = this.ladder[Math.min(this.playerLevel, this.ladder.length-1)];
    if (this.playerLevel >= this.ladder.length && !this.winner) this.winner="YOU";
    if (this.playerHp<=0){ this._deadFor+=dt; if(this._deadFor>3){ this.playerHp=100; this._deadFor=0; const sp=this._wander(host); host.camera.x=sp.x; host.camera.z=sp.z; } }
  }
  onShoot(host, ray){ const hit=shootEnemyBot(host, ray, this.bots, this.playerTeam); if (hit && !hit.alive) this.playerLevel++; }
  updateHUD(el){ const w=this.ladder[Math.min(this.playerLevel,this.ladder.length-1)];
    el.textContent=`GUN GAME    level ${Math.min(this.playerLevel+1,this.ladder.length)}/${this.ladder.length}  (${WEAPONS[w].name})` +
      (this.winner?`    WINNER: ${this.winner}`:"") + `\neach kill upgrades your weapon — finish the ladder to win\nWASD · drag look · click shoot · Esc`; }
  dispose(){}
}

export const MODES = {
  deathmatch: { label: "Deathmatch (AI vs AI + you)", make: (o) => new Deathmatch(o) },
  tdm:        { label: "Team Deathmatch",             make: (o) => new Deathmatch(Object.assign({ name:"Team Deathmatch", red:6, blue:5 }, o)) },
  ffa:        { label: "Free-for-All",                make: (o) => new FreeForAll(o) },
  lms:        { label: "Last Man Standing",           make: (o) => new LastManStanding(o) },
  ctf:        { label: "Capture the Flag",            make: (o) => new CaptureTheFlag(o) },
  koth:       { label: "King of the Hill",            make: (o) => new KingOfTheHill(o) },
  dom:        { label: "Domination",                  make: (o) => new Domination(o) },
  ddom:       { label: "Double Domination",           make: (o) => new DoubleDomination(o) },
  brun:       { label: "Bombing Run",                 make: (o) => new BombingRun(o) },
  instagib:   { label: "Instagib (one-shot rail)",    make: (o) => new Deathmatch(Object.assign({ name:"Instagib", weapon:"instagib", red:5, blue:4 }, o)) },
  gungame:    { label: "Gun Game (weapon ladder)",    make: (o) => new GunGame(o) },
  bomb:       { label: "Bomb Defusal (CS bots)",      make: (o) => new BombDefusalDelegate(o) },
};

export async function mountWadModes(opts = {}) {
  const key = opts.mode || "deathmatch";
  const entry = MODES[key];
  if (!entry) { console.warn("[wadModes] unknown mode:", key, "— have:", Object.keys(MODES)); return null; }
  const host = new WadLevelHost({ bridgeUrl: opts.bridgeUrl, kpop: opts.kpop });
  const ok = await host.start(entry.make(opts), { mapName: opts.mapName });
  return ok ? host : null;
}
