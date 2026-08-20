# Local audio workflows (ComfyUI text → audio)

Drop ComfyUI workflow JSON exports here to enable the **🖥 Local** backend
for the pipeline's *Text → audio* phase. These run on your own ComfyUI at
`127.0.0.1:8188` — no Kaggle round-trip.

## How to add one

1. In ComfyUI, build a text-to-audio graph and confirm it renders a clip.
   Native options (no exotic installs):
   - **ACE-Step** (music) — ComfyUI ships ACE-Step nodes; great for songs/loops.
   - **Stable Audio Open** — text → sound/music via the audio sampler nodes.
   Either ends in a **SaveAudio** node (that's what produces the output file).
2. Put the literal token `__PROMPT__` in your positive text node where the
   prompt should go (e.g. the ACE-Step "tags"/lyrics field, or a
   CLIPTextEncode `text`). The bridge replaces every `__PROMPT__` with the
   caller's prompt at submit time.
3. **Save (API Format)** — the menu item that exports the prompt graph as a
   flat `{ "<nodeId>": { class_type, inputs } }` JSON. (The normal "Save"
   produces a UI graph the API can't run.)
4. Save the `.json` into this folder. It appears in the pipeline's Local
   workflow dropdown for audio routes (name = filename without `.json`).

## Notes

- Output is whatever your SaveAudio node writes (`.flac` / `.wav`). The
  pipeline pulls it through `/comfyui/proxy/view` and ingests it as an
  `audio` asset, same as a Kaggle clip — so ▶ Play / 🔁 Ambient work on it.
- No `__PROMPT__` token → the submit is rejected with a clear error, so a
  mis-exported graph fails fast instead of generating the wrong thing.
- This is the audio analogue of `../comfyui-workflows/` (which is image →
  mesh). They're kept separate so an image graph never gets a text prompt.
