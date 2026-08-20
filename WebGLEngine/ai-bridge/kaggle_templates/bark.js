// kaggle_templates/bark.js — Suno Bark (text → speech / TTS) on Kaggle.
//
// Suno's Bark is a transformer text-to-audio model that produces natural
// speech (plus laughs, sighs, music cues via [bracketed] tags). No speaker
// reference needed — pick a built-in voice preset. Fits on a T4. Output is
// a .wav the bridge ingests as an audio asset.
//
// HONEST: best-effort template. The `bark` / `suno-bark` package + voice
// preset names are the source of truth (github.com/suno-ai/bark). Run the
// Diagnostic template first.

const cell = (lines) => ({ cell_type: "code", metadata: {}, source: lines.join("\n"), outputs: [], execution_count: null });
const md   = (lines) => ({ cell_type: "markdown", metadata: {}, source: lines.join("\n") });

module.exports = {
    id: "bark",
    label: "Bark (Suno · text → speech / TTS · ~T4)",
    gpu: true,
    inputKind: "text",
    defaultDatasets: [],
    paramsSchema: [
        { name: "prompt", type: "text", required: true,
          help: "the text to speak. Bracketed cues work: [laughs], [sighs], — for pauses" },
        { name: "voice", type: "text", default: "v2/en_speaker_6",
          help: "voice preset — e.g. v2/en_speaker_0 .. _9 (different speakers/accents)" },
        { name: "seed", type: "int", default: 42 },
    ],

    buildNotebook(params, ctx) {
        const prompt = String(params.prompt || "").slice(0, 2000);
        const voice  = String(params.voice || "v2/en_speaker_6").slice(0, 60);
        const seed   = parseInt(params.seed, 10) || 42;

        return {
            cells: [
                md([`# ${ctx.title}`, "",
                    "Suno **Bark** text → speech (TTS).",
                    "First run installs bark + downloads the model from HuggingFace.",
                    "Output: `/kaggle/working/output.wav` (ingested as an audio asset)."]),

                cell([
                    "# 1. env sanity check",
                    "import torch",
                    "print('torch =', torch.__version__, '· cuda =', torch.version.cuda, '· device =', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU')",
                ]),

                cell([
                    "# 2. install bark",
                    "!pip install -q --upgrade pip",
                    "!pip install -q git+https://github.com/suno-ai/bark.git",
                    "!pip install -q scipy",
                ]),

                cell([
                    "# 3. preload models + generate speech",
                    "import os, numpy as np",
                    `os.environ['SUNO_OFFLOAD_CPU'] = 'False'`,
                    `TEXT  = ${JSON.stringify(prompt)}`,
                    `VOICE = ${JSON.stringify(voice)}`,
                    "from bark import SAMPLE_RATE, generate_audio, preload_models",
                    "preload_models()",
                    "audio_array = generate_audio(TEXT, history_prompt=VOICE)",
                    "from scipy.io.wavfile import write as write_wav",
                    "write_wav('/kaggle/working/output.wav', SAMPLE_RATE, audio_array)",
                    "print('saved /kaggle/working/output.wav  ·', len(audio_array)/SAMPLE_RATE, 'sec')",
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
