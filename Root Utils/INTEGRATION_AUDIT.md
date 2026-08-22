# SweK Engine — PowerShell Listener <-> Engine integration audit (v1226)

Purpose: an honest map of what the KPop (PowerShell) listener can do vs. what is
actually wired to the ai-bridge / WebGL2 engine, so we know what's left to "bow tie."

Legend: [WIRED] reachable from the engine/web today · [PARTIAL] works but overlapping
or one-directional · [PS-ONLY] PowerShell-internal, no engine hook · [N/A] not
engine-relevant.

## Direction A — PowerShell -> engine (PS pushes to the bridge over HTTP/pipe)

These bridge routes exist and are reachable; the listener (or any device) drives them:

- [WIRED] GET  /kpop/status        — listener running/stale via Listener_Alive.txt sentinel (10s freshness).
- [WIRED] POST /kpop/speak         — broadcast spoken text to every avatar surface (caption + talking-head zoom); pipe-backed.
- [WIRED] POST /kpop/speak-end     — end-of-speech (drops the zoom / clears caption).
- [WIRED] POST /kpop/speak-wav     — TTS to a WAV under .kpop-wav/, returns /kpop/wav/<id>.wav.
- [WIRED] GET  /kpop/wav/<file>    — serves those WAVs.
- [WIRED] POST /kpop/toast         — WinRT / BurntToast notification (via named pipe to the listener).
- [WIRED] POST /kpop/stop          — stop the listener process.
- [WIRED] POST /kpop/stdin         — write a line to the listener stdin.
- [WIRED] GET  /kpop/log-history   — recent listener log lines.
- [WIRED] POST /kpop/repl-start | repl-stop | repl-stdin , GET /kpop/repl-state — interactive REPL spawn.
- [WIRED] POST /kpop/install-deps , GET /kpop/spawn-state — first-run dep install + spawn status.
- [WIRED] GET  /kpop/queue , POST /kpop/clip , POST /kpop/queue/clear — clipboard queue.
- [WIRED] POST /avatar/mood , POST /avatar/quip (v1224/25) — mood + Talking-Moose quips (Ollama-backed).

Transport: Windows named pipe \\.\pipe\KPopListenerPipe (Unix socket on POSIX) for
speak/toast; a sentinel file for status; plain HTTP for the rest.

## Direction B — engine -> PowerShell (the gap we just closed)

Before v1226 the only engine->listener control was a file the **PS dashboard** wrote:
%TEMP%/KPopListener/KPopShimControl.txt, polled every 1s by Start-ShimControlPoller.
The web UI could NOT write it.

- [WIRED v1226] POST /kpop/control {cmd} — bridge now writes KPopShimControl.txt.
  Allowed cmds: rawstream_on, rawstream_off, raiseevent_on, raiseevent_off, restart_pipes.
  UI: control.html "Listener control" section (listener tab).
- [WIRED] speak / toast — engine -> PS over the named pipe (already worked).
- [WIRED] mood / quip / moose — Set-AvatarMood / Send-AvatarQuip / Set-MooseMood (PS) AND
  engine FPS watcher, all via the /avatar/mood bus.

NEXT for fuller engine->PS control: extend the shim poller's switch with more verbs
(e.g. speak_test, set_voice, reload_config) and surface them on /kpop/control's allowlist.

## Module-by-module

- [WIRED]   KPopShim.psm1        — core: pipe listener, file watcher, Process-Message, speak,
                                    toast, sentinel, ShimControlPoller. + v1224/25/26 Set-AvatarMood /
                                    Send-AvatarQuip / Set-MooseMood / Get-KPopBridgeUrl.
- [WIRED]   KPopPipes.psm1 / PipeManager.psm1 — the named-pipe transport the bridge connects to.
- [WIRED]   AppIDManager.psm1 / KPopToast.psm1 — toast templates + WinRT/BurntToast; reached via /kpop/toast.
- [WIRED]   KPopLog.psm1         — logging; surfaced read-only via /kpop/log-history.
- [PARTIAL] KPopMqtt.psm1        — bridge mirrors engine events to MQTT (mqttMirror) and probes the
                                    aedes broker; PS publisher/subscriber run in parallel. Works, but the
                                    PS and bridge MQTT paths are not unified. TODO: pick one broker of record.
- [PARTIAL] KPopDiscord.psm1     — PS Send-DiscordWebhook + integrations exist; the BRIDGE has its OWN
                                    Discord (/discord/post, discordVoice.js). Two parallel implementations,
                                    not bridged to each other. TODO: decide which owns Discord.
- [PARTIAL] KPopWebSocket.psm1   — PS ships a WS server; the engine uses the BRIDGE WS instead. The PS WS
                                    server is not invoked on the engine path — looks legacy/parallel.
                                    TODO: confirm it can be retired, or give it a job.
- [WIRED]   KPopDashboard.psm1   — PS GUI; wrote the control file (the bridge can now write it too).
- [N/A]     KPopupTrayIcon.psm1  — Windows tray icon, PS-local.
- [N/A]     KPopCommon.psm1      — shared helpers.

## Bottom line

PS -> engine is essentially complete (status, speech x3, toast, stop/stdin, log, REPL,
install/spawn, clipboard queue, mood/quip). engine -> PS was the thin spot; /kpop/control
(v1226) closes the runtime-settings gap. The remaining real items are **deduplication**,
not missing wiring: MQTT (PS vs bridge broker), Discord (PS webhook vs bridge), and the
unused PS WebSocket server. Those are the "bow tie" decisions for the .js side before we
move on to the Excel/VBA workbook review and the WebGL2 -> VBA 3D FPS control path.
