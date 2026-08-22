# SweK Dictate — global-hotkey dictation tray helper

FluidVoice-style dictation for the SweK Engine, built as a tiny bridge client. Nothing leaves your
LAN — it uses your own whisper.cpp (STT) and Ollama (optional cleanup) through the SweK bridge.

```
hold hotkey → mic (ffmpeg) → /whisper/transcribe → [optional] /dictate/polish → /dictate/type
```

## What it needs
- **The SweK bridge running** on this machine (the engine / server.html box, default `:8787`).
- **whisper.cpp** set up in the bridge (⚙ Auto-Install → Whisper, or point `whisper.json` at a peer's).
- **ffmpeg** on PATH — you already have it on the SweK boxes.
- **Ollama** running only if you turn on the polish pass.

## Install + run
```bash
cd tools/dictate-tray
npm install          # pulls node-global-key-listener (prebuilt, no compiler) + systray2
npm start            # arms the global hotkey + tray
# or test one clip without the hotkey:
npm run once         # records ~4s, transcribes, types into the focused window
```

## Configure (env vars)
| var | default | meaning |
|-----|---------|---------|
| `SWEK_BRIDGE` | `http://127.0.0.1:8787` | your local bridge |
| `SWEK_HOTKEY` | `RIGHT ALT` | push-to-talk key (e.g. `F9`, `RIGHT CONTROL`) |
| `SWEK_POLISH` | `0` | `1` to run the Ollama cleanup pass |
| `SWEK_STYLE` | `clean` | `clean` \| `email` \| `notes` \| `code-comment` |
| `SWEK_MIC` | auto | ffmpeg input device name if auto-detect picks wrong |
| `SWEK_VAD` | `0` | `1` = **hands-free**: tap the hotkey once, speak, and it auto-stops after a silence gap (endpointing) instead of holding the key |
| `SWEK_SILENCE` | `1.2` | seconds of trailing silence that ends a hands-free clip |

## The STT backend (whisper.cpp vs faster-whisper / CTranslate2)
The tray talks to the bridge's `/whisper/transcribe`, so the *engine* it hits is set once in Settings → Whisper (or `~/.voxelbridge/whisper.json`), `backend`:
- **`whispercpp`** (default) — whisper.cpp `whisper-server`, `/inference`. Best on **Stellar Atlas / any Mac or CPU box** (Metal/Core ML; faster-whisper has no Metal).
- **`fasterwhisper`** — a CTranslate2 / faster-whisper OpenAI-compatible server, `/v1/audio/transcriptions`. Best on **Galaxina (NVIDIA GTX 1070/1080)** — int8 quantization + built-in **Silero VAD** trimming, the speed/VRAM winner on NVIDIA. Run one with e.g. `pip install whisper-ctranslate2` (its server exposes the OpenAI route) or `faster-whisper-server`, then point `whisper.json` `baseUrl` at it.

So the ideal split for your fleet: **Galaxina → faster-whisper** (CTranslate2 + Silero VAD server-side), **Stellar Atlas → whisper.cpp**. The tray + polish pass are identical either way.

Example (Windows PowerShell):
```powershell
$env:SWEK_HOTKEY="F9"; $env:SWEK_POLISH="1"; npm start
```

## Per-OS notes
- **Windows (Galaxina):** works out of the box. If the mic device isn't found, list devices with
  `ffmpeg -list_devices true -f dshow -i dummy` and set `SWEK_MIC` to the exact name.
- **macOS (Stellar Atlas):** grant **Accessibility** + **Microphone** permission to the terminal/node
  running this (System Settings → Privacy & Security). List mics with
  `ffmpeg -f avfoundation -list_devices true -i ""`.
- **Linux:** needs `xdotool` for the type-out (`sudo apt install xdotool`) and ALSA/`arecord`.

## Run it as a SweK service
Point your process manager (or a `.bat` / `launchd` / the bridge's service list) at
`node tools/dictate-tray/dictate-tray.js`. It's a plain long-running Node process — it registers like
Ollama/OpenRGB do. Ctrl+C (or the tray Quit) stops it.

## How it maps to FluidVoice
| FluidVoice (Swift, macOS) | this helper |
|---|---|
| global hotkey | node-global-key-listener |
| on-device STT | your whisper.cpp via the bridge |
| AI enhancement | your Ollama via `/dictate/polish` |
| smart typing (Accessibility) | `/dictate/type` (SendKeys / osascript / xdotool) |

The heavy lifting (STT, LLM) lives in the bridge and is shared with the rest of SweK — this process is
just the trigger + the glue.
