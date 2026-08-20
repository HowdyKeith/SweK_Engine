# SweK Engine — Raycast extension (v2194 scaffold)

Drive a running SweK Engine from Raycast: bridge health + version + tunnel + external
peers (Engine Status), jump to any engine page (Open Engine Panel), and fire toasts on
the engine box (Send Toast). Works against localhost, a LAN peer, or a Cloudflare
tunnel URL — set it in the extension preferences (default http://127.0.0.1:8787).

## Run it (dev mode — no store publish needed)
1. On the Mac: install Raycast, Node 20+.
2. `cd raycast-extension/swek-engine && npm install && npm run dev`
   Raycast opens with the extension loaded; it stays installed after you stop dev mode.
3. Add a 512x512 `icon.png` next to package.json (any SweK logo) — `ray develop`
   requires one; a plain colored square works.

## Notes
- Uses only public/AUTH_PUBLIC-adjacent bridge endpoints: /net/info, /kpop/status,
  /raycast/status, /tunnels, /kpop/toast. Passworded boxes may gate some of these
  for non-LAN callers.
- Raycast extensions are React/TypeScript running in Raycast's Node runtime —
  this is the "SweK panel as a native Raycast app" answer: the bridge's HTTP API
  is the engine's universal remote-control surface, so any panel that talks HTTP
  can be re-skinned as Raycast commands like these three.
