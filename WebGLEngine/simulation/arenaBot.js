// FILE: simulation/arenaBot.js
//
// Lightweight first-person-arena combatant for modes that run in ANY WAD room
// (deathmatch, team deathmatch, CTF). Wanders to reachable points, engages the
// nearest visible enemy within range, shoots on a cooldown. Combat constants
// match the CS bots (CSBot.js) for consistency: 35-unit range, 0.7s cooldown,
// 55% hit, 18 damage. For the structured bomb-defusal mode, use CSBotManager
// instead (it has the corridor-graph navigation + plant/defuse logic).
//
// Wall occlusion is not yet modelled (no level raycast exposed) — bots engage
// within range regardless of walls. That's the obvious next refinement.

import { BOT_DEFAULT } from "./weapons.js";

const SPEED = 4.5, REACH = 1.2, MAX_HP = 100, RESPAWN_S = 4;

let _id = 0;

export class ArenaBot {
  constructor({ team, x, z, color, weapon }) {
    this.id = "bot_" + (++_id);
    this.team = team;                // "red" | "blue" | string
    this.x = x; this.z = z; this.y = undefined;  // y filled by host eye height
    this.hp = MAX_HP; this.alive = true;
    this.color = color || (team === "red" ? [1,0.35,0.3] : [0.4,0.6,1]);
    this.r = this.color[0]; this.g = this.color[1]; this.b = this.color[2];
    this.scale = 0.8;
    this.weapon = weapon || BOT_DEFAULT;
    this._fire = 0; this._respawn = 0;
    this._wx = x; this._wz = z;       // current wander target
    this.frags = 0;
  }

  setWeapon(w) { if (w) this.weapon = w; }

  get dead() { return !this.alive; }

  // ctx = { dt, bounds, enemiesOf(bot)->[{x,z,alive,applyDamage(n,attacker)}],
  //         pickWander()->{x,z}, onFire(self,target) }
  update(ctx) {
    const dt = ctx.dt;
    if (!this.alive) {
      this._respawn -= dt;
      if (this._respawn <= 0) ctx.respawn(this);
      return;
    }
    if (this._fire > 0) this._fire -= dt;

    // acquire nearest live enemy in weapon range with clear line of sight
    const wr = this.weapon.range;
    let target = null, best = wr * wr;
    for (const e of ctx.enemiesOf(this)) {
      if (!e.alive) continue;
      const dx = e.x - this.x, dz = e.z - this.z, d2 = dx*dx + dz*dz;
      if (d2 >= best) continue;
      if (ctx.losClear && !ctx.losClear(this.x, this.y, this.z, e.x, (e.y ?? this.y), e.z)) continue;
      best = d2; target = e;
    }

    if (target) {
      // face + hold position, fire on cooldown
      if (this._fire <= 0) {
        this._fire = this.weapon.fireCd;
        ctx.onFire?.(this, target);
        if (Math.random() < this.weapon.hitChance) target.applyDamage(this.weapon.damage, this);
      }
    } else {
      // navigate toward the goal, pathing around walls if a nav grid is offered
      const gx = this._wx, gz = this._wz;
      if (ctx.findPath) {
        this._pathCd = (this._pathCd || 0) - dt;
        if (!this._path || !this._path.length || this._pathCd <= 0) {
          this._path = ctx.findPath(this.x, this.z, gx, gz) || null;
          this._pathCd = 1.0;
        }
        if (this._path && this._path.length) {
          let wp = this._path[0];
          let d = Math.hypot(wp.x - this.x, wp.z - this.z);
          while (d < REACH && this._path.length > 1) { this._path.shift(); wp = this._path[0]; d = Math.hypot(wp.x - this.x, wp.z - this.z); }
          if (d > 1e-3) { this.x += ((wp.x - this.x) / d) * SPEED * dt; this.z += ((wp.z - this.z) / d) * SPEED * dt; }
          if (d < REACH && this._path.length === 1) { const w = ctx.pickWander(); this.setGoal(w.x, w.z); }
          return;
        }
      }
      // straight-line fallback (no nav grid, or no path found)
      const dx = gx - this.x, dz = gz - this.z, d = Math.hypot(dx, dz);
      if (d < REACH) { const w = ctx.pickWander(); this.setGoal(w.x, w.z); }
      else { this.x += (dx / d) * SPEED * dt; this.z += (dz / d) * SPEED * dt; }
    }
  }

  applyDamage(n, attacker) {
    if (!this.alive) return;
    this.hp -= n;
    if (this.hp <= 0) {
      this.hp = 0; this.alive = false; this._respawn = RESPAWN_S;
      if (attacker) attacker.frags = (attacker.frags || 0) + 1;
    }
  }

  respawnAt(x, z) { this.x = x; this.z = z; this.hp = MAX_HP; this.alive = true; this._fire = 0; }

  // Objective steering (used by CTF: head to the enemy flag, or home when carrying).
  // Recomputes the path only when the goal moves enough, so per-frame calls are cheap.
  setGoal(x, z) {
    if (this._gx === undefined || Math.hypot(x - this._gx, z - this._gz) > 3) this._path = null;
    this._gx = x; this._gz = z; this._wx = x; this._wz = z;
  }
}

export const ARENA_BOT_CONSTS = { MAX_HP, RESPAWN_S, weapon: BOT_DEFAULT };
