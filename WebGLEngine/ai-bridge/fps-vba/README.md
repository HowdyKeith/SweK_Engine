# FPS control path (#6) — first slice

**Option C: the WebGL2 engine is authoritative.** It owns the first-person camera,
enemy AI, and collision; it just *publishes* its camera pose to the bridge. VBA (and
any other surface) **mirrors** that pose — it does not drive it.

```
  WebGL2 engine / fpscontrol.html        ai-bridge :8787            VBA OpenGL engine
  -------------------------------        ---------------            -----------------
  pointer-lock + WASD + mouse-look  --POST /fps/state-->  [latest pose]  --GET /fps/state-->  ApplyFpsPose()
  (authoritative camera + AI)            (in-memory mailbox)             (mirror the view)
```

## Endpoints (live now)
- `POST /fps/state` — body `{ pos:[x,y,z], yaw, pitch, vel?:[x,y,z], src? }`. Latest wins, 4 KB cap.
- `GET  /fps/state` — `{ ok, pose, ts, ageMs }` (pose is `null` until something publishes).
- `GET  /fps/status` — `{ ok, has, ts, ageMs }`.

Angles are radians, **YXZ**: yaw about +Y, pitch about +X, forward = `(-sin yaw, 0, -cos yaw)`.

## Try the browser↔bridge half now (no VBA needed)
1. Start the bridge (`START_BUN_Full.bat`), open `http://127.0.0.1:8787/fpscontrol.html`.
2. Click to capture the mouse; WASD + look. Hit **Publish pose**.
3. In another tab: `http://127.0.0.1:8787/fps/state` — watch pos/yaw/pitch update live.

That verifies the whole publish path. The real engine can POST the same shape from its
own FPS controller instead of this page.

## VBA side (scaffold, untested)
`modFPSControl.bas` polls `GET /fps/state` on your OnTime tick (async XMLHTTP + pile-up
guard, same pattern as `modHTTPBridge.bas`) and exposes `FpsX/FpsY/FpsZ/FpsYaw/FpsPitch`
+ `FpsFresh`. **Wire `ApplyFpsPose()` to your `modCamera` / view-matrix setter** (marked
in the file). Two ways to run the async GET:
- callback (`OnReadyStateChange`) if your build supports it, or
- the **drain pattern**: call `FpsControl_Poll()` then `FpsControl_Drain()` once per tick.

Use `127.0.0.1`, not `localhost` (Bun binds IPv4 on Windows).

## Not in this slice (next, when you want)
- Touch sticks (phone) + gamepad (Shield) as alternate input sources.
- Publishing from the engine's *own* FPS controller (this page is the stand-in).
- Reverse channel if you ever want VBA→browser (would flip toward A/B authority).
