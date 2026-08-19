#!/usr/bin/env python3
# brain/rl/rocketsim_bridge.py -- v2216 -- REAL Rocket League physics for the RL spike.
#
# RIG-ONLY. Speaks the strict one-JSON-object-per-line protocol that rocketsimBackend.js
# drives, backed by RocketSim (ground-truth Rocket League physics). It emits the SAME
# 20-float observation layout as the JS kinematic stub (see rocketPolicy.js / rocketEnv.js),
# so the policy and the training loop cannot tell the stub from real physics -- develop
# against the stub, flip backend=rocketsim here, nothing else changes.
#
# SETUP (once, on a box that has Rocket League installed):
#   pip install RocketSim
#   # RocketSim needs the arena COLLISION MESHES, which are NOT redistributable. Dump them
#   # from your installed game with the bundled dumper, then point us at them:
#   set ROCKETSIM_MESHES=C:\path\to\collision_meshes      (Windows)
#   export ROCKETSIM_MESHES=/path/to/collision_meshes     (mac/Linux)
# Then the JS side spawns this automatically when you run the loop with --backend rocketsim.
#
# PROTOCOL:
#   <- {"cmd":"reset","seed":123}          -> {"obs":[20 floats]}
#   <- {"cmd":"step","action":[8 floats]}  -> {"obs":[20],"reward":f,"done":b,"info":{...}}
#   <- {"cmd":"close"}                      -> {"bye":true}
#
# Convention matches the stub: we control the BLUE car and attack the +Y goal.

import sys, os, json, math

# Constants -- identical to rocketEnv.js so obs/reward line up.
FIELD_X, FIELD_Y, CEIL = 4096.0, 5120.0, 2044.0
GOAL_HALF_W, GOAL_H = 892.0, 642.0
MAX_CAR_V = 2300.0
BALL_R = 92.75
MAX_STEPS = 300
TICK_SKIP = 8  # 120 Hz sim, 15 Hz decisions


def _fail(msg):
    sys.stdout.write(json.dumps({"error": msg}) + "\n")
    sys.stdout.flush()


def _clamp(v, lo, hi):
    return lo if v < lo else hi if v > hi else v


try:
    import RocketSim as rs
except Exception as e:  # pragma: no cover - rig only
    _fail("RocketSim not importable: %s. pip install RocketSim (rig-only)." % e)
    sys.exit(2)

# RocketSim must load collision meshes before an Arena is created.
_MESHES = os.environ.get("ROCKETSIM_MESHES", "collision_meshes")
try:
    rs.init(_MESHES)
except Exception as e:  # pragma: no cover - rig only
    _fail("rs.init(%r) failed: %s. Set ROCKETSIM_MESHES to your dumped meshes." % (_MESHES, e))
    sys.exit(3)


class Bridge:
    def __init__(self):
        self.arena = rs.Arena(rs.GameMode.SOCCAR)
        self.car = self.arena.add_car(rs.Team.BLUE)
        self.t = 0
        self.prev_touch = False

    def reset(self, seed):
        try:
            self.arena.reset_to_random_kickoff(seed if seed is not None else -1)
        except TypeError:
            self.arena.reset_to_random_kickoff()
        self.t = 0
        self.prev_touch = False
        return self._obs()

    def _states(self):
        b = self.arena.ball.get_state()
        c = self.car.get_state()
        return b, c

    def _obs(self):
        b, c = self._states()
        bp, bv = b.pos, b.vel
        cp, cv = c.pos, c.vel
        # heading from forward vector (rot_mat forward column); fall back to yaw if needed.
        try:
            fwd = c.rot_mat.forward
            yaw = math.atan2(fwd.y, fwd.x)
        except Exception:
            yaw = getattr(c, "yaw", 0.0)
        boost = getattr(c, "boost", 0.0) / 100.0
        nx, ny, nz, nv = 1.0 / FIELD_X, 1.0 / FIELD_Y, 1.0 / CEIL, 1.0 / MAX_CAR_V
        o = [
            _clamp(bp.x * nx, -2, 2), _clamp(bp.y * ny, -2, 2), _clamp(bp.z * nz, 0, 2),
            _clamp(bv.x * nv, -3, 3), _clamp(bv.y * nv, -3, 3), _clamp(bv.z * nv, -3, 3),
            _clamp(cp.x * nx, -2, 2), _clamp(cp.y * ny, -2, 2), _clamp(cp.z * nz, 0, 2),
            _clamp(cv.x * nv, -3, 3), _clamp(cv.y * nv, -3, 3), _clamp(cv.z * nv, -3, 3),
            math.cos(yaw), math.sin(yaw),
            boost * 2 - 1,
            _clamp((bp.x - cp.x) * nx, -2, 2), _clamp((bp.y - cp.y) * ny, -2, 2), _clamp((bp.z - cp.z) * nz, -2, 2),
            _clamp((0 - bp.x) * nx, -2, 2), _clamp((FIELD_Y - bp.y) * ny, -2, 2),
        ]
        return o

    def step(self, action):
        a = list(action) + [0.0] * (8 - len(action))
        ctrl = rs.CarControls()
        ctrl.throttle = _clamp(a[0], -1, 1)
        ctrl.steer = _clamp(a[1], -1, 1)
        ctrl.pitch = _clamp(a[2], -1, 1)
        ctrl.yaw = _clamp(a[3], -1, 1)
        ctrl.roll = _clamp(a[4], -1, 1)
        ctrl.jump = a[5] > 0
        ctrl.boost = a[6] > 0
        ctrl.handbrake = a[7] > 0
        self.car.set_controls(ctrl)

        b0, _ = self._states()
        self.arena.step(TICK_SKIP)
        b, c = self._states()
        self.t += 1

        # touch: RocketSim exposes ball_touches on the car state in most builds; fall back to
        # a proximity test so the reward still works on builds that lack the counter.
        touched = False
        try:
            touched = c.ball_hit_info.is_valid and c.ball_hit_info.tick_count_when_hit >= 0
        except Exception:
            dx, dy, dz = b.pos.x - c.pos.x, b.pos.y - c.pos.y, b.pos.z - c.pos.z
            touched = (dx * dx + dy * dy + dz * dz) ** 0.5 < (BALL_R + 150)

        scored = 0
        done = False
        if b.pos.y > FIELD_Y - BALL_R and abs(b.pos.x) < GOAL_HALF_W and b.pos.z < GOAL_H:
            scored, done = 1, True
        elif b.pos.y < -FIELD_Y + BALL_R and abs(b.pos.x) < GOAL_HALF_W and b.pos.z < GOAL_H:
            scored, done = -1, True
        if self.t >= MAX_STEPS:
            done = True

        # reward -- same shape as the stub so a policy transfers meaningfully
        reward = (b.vel.y / MAX_CAR_V) * 0.10
        carball = ((b.pos.x - c.pos.x) ** 2 + (b.pos.y - c.pos.y) ** 2 + (b.pos.z - c.pos.z) ** 2) ** 0.5
        reward += -carball / (FIELD_Y * 2) * 0.02
        if touched:
            reward += 0.05 + (0.0 if self.prev_touch else 0.05)
        if scored == 1:
            reward += 10
        if scored == -1:
            reward -= 10
        reward -= 0.002
        self.prev_touch = touched

        return {"obs": self._obs(), "reward": reward, "done": done,
                "info": {"scored": scored, "touched": bool(touched), "t": self.t}}


def main():
    bridge = Bridge()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except Exception:
            sys.stdout.write(json.dumps({"error": "bad json"}) + "\n"); sys.stdout.flush(); continue
        cmd = msg.get("cmd")
        if cmd == "reset":
            out = {"obs": bridge.reset(msg.get("seed"))}
        elif cmd == "step":
            out = bridge.step(msg.get("action", []))
        elif cmd == "close":
            sys.stdout.write(json.dumps({"bye": True}) + "\n"); sys.stdout.flush(); break
        else:
            out = {"error": "unknown cmd %r" % cmd}
        sys.stdout.write(json.dumps(out) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
