// kaggle_templates/text2video.js — text → short video on Kaggle.
//
// Runs on Kaggle's GPU (T4/P100), so it sidesteps a local card entirely.
// Default model is ModelScope text-to-video (damo-vilab/text-to-video-ms-1.7b),
// a small, easy diffusers pipeline — no Trellis-style model wrangling. Output
// is a short .mp4 the bridge ingests as a "video" asset.
//
// Alt model: cerspense/zeroscope_v2_576w (also diffusers TextToVideoSD,
// crisper 576x320). Same code path — just change the model param.
//
// HONEST: best-effort template. diffusers' text-to-video API is stable, but
// model names / VRAM behavior are the source of truth — run the Diagnostic
// template first to confirm bridge plumbing.

const cell = (lines) => ({ cell_type: "code", metadata: {}, source: lines.join("\n"), outputs: [], execution_count: null });
const md   = (lines) => ({ cell_type: "markdown", metadata: {}, source: lines.join("\n") });

module.exports = {
    id: "text2video",
    label: "Text → Video (ModelScope · ~T4)",
    gpu: true,
    inputKind: "text",
    defaultDatasets: [],
    paramsSchema: [
        { name: "prompt", type: "text", required: true,
          help: "describe the clip — e.g. 'a spaceship flying over a neon city at night, cinematic'" },
        { name: "model", type: "text", default: "damo-vilab/text-to-video-ms-1.7b",
          help: "damo-vilab/text-to-video-ms-1.7b (small, fast) · cerspense/zeroscope_v2_576w (crisper 576x320)" },
        { name: "num_frames", type: "int", default: 16,
          help: "frames in the clip (more = longer + slower + more VRAM)" },
        { name: "steps", type: "int", default: 25,
          help: "denoise steps per frame (quality vs speed)" },
        { name: "fps", type: "int", default: 8,
          help: "playback frames-per-second of the exported mp4" },
        { name: "seed", type: "int", default: 42 },
    ],

    buildNotebook(params, ctx) {
        const prompt = String(params.prompt || "").slice(0, 2000);
        const model  = String(params.model || "damo-vilab/text-to-video-ms-1.7b").slice(0, 120);
        const frames = Math.max(8, Math.min(64, parseInt(params.num_frames, 10) || 16));
        const steps  = Math.max(10, Math.min(60, parseInt(params.steps, 10) || 25));
        const fps    = Math.max(4, Math.min(30, parseInt(params.fps, 10) || 8));
        const seed   = parseInt(params.seed, 10) || 42;

        return {
            cells: [
                md([`# ${ctx.title}`, "",
                    "Text → short **video** via diffusers (ModelScope / Zeroscope).",
                    "First run downloads the model from HuggingFace.",
                    "Output: `/kaggle/working/output.mp4` (ingested as a video asset)."]),

                cell([
                    "# 1. env sanity check",
                    "import torch",
                    "print('torch =', torch.__version__, '· cuda =', torch.version.cuda, '· device =', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU')",
                    "print('vram:', round(torch.cuda.get_device_properties(0).total_memory / 1024**3, 1) if torch.cuda.is_available() else 0, 'GB')",
                ]),

                cell([
                    "# 2. install diffusers + video encoder deps",
                    "# TODO verify versions when this hits a real Kaggle run.",
                    "!pip install -q --upgrade pip",
                    "!pip install -q diffusers transformers accelerate",
                    "!pip install -q imageio imageio-ffmpeg opencv-python-headless",
                ]),

                cell([
                    "# 3. load the text-to-video pipeline + generate",
                    "import torch",
                    `torch.manual_seed(${seed})`,
                    `PROMPT = ${JSON.stringify(prompt)}`,
                    `MODEL  = ${JSON.stringify(model)}`,
                    `FRAMES = ${frames}`,
                    `STEPS  = ${steps}`,
                    "from diffusers import DiffusionPipeline, DPMSolverMultistepScheduler",
                    "from diffusers.utils import export_to_video",
                    "pipe = DiffusionPipeline.from_pretrained(MODEL, torch_dtype=torch.float16)",
                    "pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config)",
                    "# keep VRAM low so it fits a T4",
                    "pipe.enable_model_cpu_offload()",
                    "try: pipe.enable_vae_slicing()",
                    "except Exception: pass",
                    "result = pipe(PROMPT, num_inference_steps=STEPS, num_frames=FRAMES)",
                    "frames = result.frames[0]   # diffusers returns a batch of frame-lists",
                ]),

                cell([
                    "# 4. export mp4",
                    `export_to_video(frames, '/kaggle/working/output.mp4', fps=${fps})`,
                    "import os",
                    "print('saved', '/kaggle/working/output.mp4', os.path.getsize('/kaggle/working/output.mp4'), 'bytes')",
                ]),

                cell([
                    "# 5. list outputs (bridge picks up .mp4/.webm/.mov)",
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
