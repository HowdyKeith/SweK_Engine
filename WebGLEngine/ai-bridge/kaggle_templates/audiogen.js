// kaggle_templates/audiogen.js — Meta AudioGen (text → sound effects) on Kaggle.
//
// Meta's AudioGen (also in the audiocraft library) generates environmental
// sounds / sound effects from a text prompt (e.g. "dog barking", "thunder
// rumble", "laser zap"). Sibling of MusicGen but trained on ambient/SFX
// audio rather than music. Output is a .wav the bridge ingests as audio.
//
// HONEST: best-effort template. audiocraft is the source of truth
// (github.com/facebookresearch/audiocraft). Run Diagnostic first.

const cell = (lines) => ({ cell_type: "code", metadata: {}, source: lines.join("\n"), outputs: [], execution_count: null });
const md   = (lines) => ({ cell_type: "markdown", metadata: {}, source: lines.join("\n") });

module.exports = {
    id: "audiogen",
    label: "AudioGen (Meta · text → sound effects · ~T4)",
    gpu: true,
    inputKind: "text",
    defaultDatasets: [],
    paramsSchema: [
        { name: "prompt", type: "text", required: true,
          help: "describe the sound — e.g. 'heavy rain on a tin roof with distant thunder'" },
        { name: "model", type: "text", default: "facebook/audiogen-medium",
          help: "facebook/audiogen-medium (1.5B) — the released AudioGen size" },
        { name: "duration", type: "int", default: 5,
          help: "clip length in seconds (SFX are usually short)" },
        { name: "seed", type: "int", default: 42 },
    ],

    buildNotebook(params, ctx) {
        const prompt   = String(params.prompt || "").slice(0, 2000);
        const model    = String(params.model || "facebook/audiogen-medium").slice(0, 80);
        const duration = Math.max(1, Math.min(30, parseInt(params.duration, 10) || 5));
        const seed     = parseInt(params.seed, 10) || 42;

        return {
            cells: [
                md([`# ${ctx.title}`, "",
                    "Meta **AudioGen** text → sound-effects via the `audiocraft` library.",
                    "First run installs audiocraft + downloads the model from HuggingFace.",
                    "Output: `/kaggle/working/output.wav` (ingested as an audio asset)."]),

                cell([
                    "# 1. env sanity check",
                    "import torch",
                    "print('torch =', torch.__version__, '· cuda =', torch.version.cuda, '· device =', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU')",
                ]),

                cell([
                    "# 2. install audiocraft",
                    "!pip install -q --upgrade pip",
                    "!pip install -q audiocraft",
                    "!pip install -q av",
                ]),

                cell([
                    "# 3. load AudioGen + generate",
                    "import torch",
                    `torch.manual_seed(${seed})`,
                    `PROMPT   = ${JSON.stringify(prompt)}`,
                    `MODEL    = ${JSON.stringify(model)}`,
                    `DURATION = ${duration}`,
                    "from audiocraft.models import AudioGen",
                    "from audiocraft.data.audio import audio_write",
                    "model = AudioGen.get_pretrained(MODEL)",
                    "model.set_generation_params(duration=DURATION)",
                    "wav = model.generate([PROMPT])",
                    "audio_write('/kaggle/working/output', wav[0].cpu(), model.sample_rate,",
                    "            strategy='loudness', loudness_compressor=True)",
                    "print('saved /kaggle/working/output.wav')",
                ]),

                cell([
                    "# 4. list outputs",
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
