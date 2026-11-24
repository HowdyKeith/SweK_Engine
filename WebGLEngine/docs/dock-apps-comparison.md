# Muelle and OpenTaskbar beside SweK's own dock

2026-11-21. Muelle (crafter-station/muelle, Rust) and OpenTaskbar (alztrk/opentaskbar, .NET WPF) are both MIT and both replace the **Windows taskbar**. SweK's dock (`ui/dockedGauges.js` over `ui/svgGaugeSet.js`) lives **inside a browser page**. The two can't do the same jobs. A page can't see other windows, the tray or the taskbar, so the native features below are things to install, not to rebuild. Both apps are in the install panel (rows `app-muelle` and `app-opentaskbar`, Windows only).

"SweK" below means what a search of the tree found, mostly the gauge sources in `ui/svgGaugeSet.js`.

## What SweK already covers

| Feature | Muelle | OpenTaskbar | SweK |
|---|---|---|---|
| CPU, RAM, GPU load | none | rings | **gauges** (CPU, RAM, GPU) |
| Battery | this machine (top bar) | Bluetooth devices | **gauge** (this machine) |
| Clock and weather | clock only | clock, weather, forecast | **weather gauge** with sky colours |
| A dock that hides and comes back | auto-hide | three auto-hide modes | hide to a restore pill |
| Things only SweK shows | | | FPS, world chunks, SweK peers and remote peers, fleet brains and how many are solving, email count, a live brain view, the robot that turns red on errors |

## What SweK's dock doesn't have and could add

These work from a page, either through the ai-bridge (which runs on the machine) or through browser APIs:

1. **AI usage limits.** Both apps show Claude Code and Codex session and weekly limits; OpenTaskbar adds Copilot, OpenRouter and DeepSeek. SweK has no such gauge. The bridge could read the same local files the CLIs keep and serve a `/usage` endpoint, which a new gauge source would then show. **The most useful gap.**
2. **GPU temperature.** OpenTaskbar shows it for NVIDIA. SweK's bridge already calls `nvidia-smi` in places, but temperature isn't a gauge source.
3. **Network speed and drive space.** Both are OpenTaskbar widgets, and neither is a SweK gauge source. The bridge can read both.
4. **Now playing, with controls.** This is an OpenTaskbar widget. SweK pages use the media session in places, but the dock has no media gauge.
5. **Bluetooth device batteries** (headsets, mice, controllers). OpenTaskbar reads them from Windows. It would need a Windows-only bridge helper.
6. **Focus timer, stopwatch and countdown.** These are OpenTaskbar widgets. There are timers on some SweK pages but no dock gauge.

## What only a native app can do (install it rather than rebuild it)

Replacing the Windows taskbar, live window thumbnails, jump lists, tray icons and their menus, pinning and grouping apps, dropping files on apps or the Recycle Bin, the genie minimise effect, a dock on each monitor, and hiding when a game goes full screen. A browser page has no access to any of these.

## Suggested next step

Add the **AI usage limits** gauge first: a bridge endpoint plus one gauge source, with a self-check that holds it to a fixture of the CLI's file. The other five then follow the same pattern.
