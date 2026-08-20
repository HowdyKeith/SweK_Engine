// kaggle_templates/musicgen.js — Meta MusicGen (text → music) on Kaggle.
//
// Meta's MusicGen (via the audiocraft library) generates short music
// clips from a text prompt. The "small" model (300M) fits comfortably on
// a T4; "medium" (1.5B) also fits. Output is a .wav the bridge ingests as
// an audio asset.
//
// HONEST: best-effort template. audiocraft's API + model names are the
// source of truth (github.com/facebookresearch/audiocraft). Run the
// Diagnostic template first to confirm bridge plumbing.

const cell = (lines) => ({ cell_type: "code", metadata: {}, source: lines.join("\n"), outputs: [], execution_count: null });
const md   = (lines) => ({ cell_type: "markdown", metadata: {}, source: lines.join("\n") });

module.exports = {
    id: "musicgen",
    label: "MusicGen (Meta · text → music · ~T4)",
    gpu: true,
    inputKind: "text",
    defaultDatasets: [],
    paramsSchema: [
        { name: "prompt", type: "text", required: true,
          help: "describe the music — e.g. 'upbeat 8-bit chiptune boss battle, driving bass'" },
        { name: "model", type: "text", default: "facebook/musicgen-small",
          help: "facebook/musicgen-small (300M, fast) · -medium (1.5B) · -large (3.3B, needs more VRAM)" },
        { name: "duration", type: "int", default: 10,
          help: "clip length in seconds (longer = slower + more VRAM)" },
        { name: "seed", type: "int", default: 42 },
    ],

    buildNotebook(params, ctx) {
        const prompt   = String(params.prompt || "").slice(0, 2000);
        const model    = String(params.model || "facebook/musicgen-small").slice(0, 80);
        const duration = Math.max(1, Math.min(60, parseInt(params.duration, 10) || 10));
        const seed     = parseInt(params.seed, 10) || 42;

        return {
            cells: [
                md([`# ${ctx.title}`, "",
                    "Meta **MusicGen** text → music via the `audiocraft` library.",
                    "First run installs audiocraft + downloads the model from HuggingFace.",
                    "Output: `/kaggle/working/output.wav` (ingested as an audio asset)."]),

                cell([
                    "# 1. env sanity check",
                    "import torch",
                    "print('torch =', torch.__version__, '· cuda =', torch.version.cuda, '· device =', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU')",
                    "print('vram:', round(torch.cuda.get_device_properties(0).total_memory / 1024**3, 1) if torch.cuda.is_available() else 0, 'GB')",
                ]),

                cell([
                    "# 2. install audiocraft (+ ffmpeg for encoding)",
                    "# TODO verify versions when this hits a real Kaggle run.",
                    "!pip install -q --upgrade pip",
                    "!pip install -q audiocraft",
                    "!pip install -q av",
                ]),

                cell([
                    "# 3. load MusicGen + generate",
                    "import torch",
                    `torch.manual_seed(${seed})`,
                    `PROMPT   = ${JSON.stringify(prompt)}`,
                    `MODEL    = ${JSON.stringify(model)}`,
                    `DURATION = ${duration}`,
                    "from audiocraft.models import MusicGen",
                    "from audiocraft.data.audio import audio_write",
                    "model = MusicGen.get_pretrained(MODEL)",
                    "model.set_generation_params(duration=DURATION)",
                    "wav = model.generate([PROMPT])   # batch of 1",
                    "# audio_write appends .wav and normalizes loudness",
                    "audio_write('/kaggle/working/output', wav[0].cpu(), model.sample_rate,",
                    "            strategy='loudness', loudness_compressor=True)",
                    "print('saved /kaggle/working/output.wav')",
                ]),

                cell([
                    "# 4. list outputs (bridge picks up .wav/.mp3/.flac/.ogg)",
                    "import os",
                    "for f in sorted(os.listdir('/kaggle/working')):",
                    "    p = os.path.join('/kaggle/working', f)",
                    "    if os.path.isfile(p):",
                    "        print(f, os.path.getsize(p))",
                ]),
            ],
            metadata: {
                kernelspec: { name: "python3", display_name: "Python 3", language: "python" },
                language_info: { name: "python" },
            },
            nbformat: 4,
            nbformat_minor: 4,
        };
    },
};
