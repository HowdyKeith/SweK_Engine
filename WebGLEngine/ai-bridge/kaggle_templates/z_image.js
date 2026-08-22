// kaggle_templates/z_image.js — Alibaba Z-Image-Turbo on Kaggle.
//
// 6B-param distilled diffusion model from Tongyi-MAI. The paper claims
// <16GB VRAM compatibility, so on Kaggle T4 (16GB) it should fit
// comfortably with room to spare. Few-step distillation means inference
// is fast — sub-second on H800, ~3-10s on T4 per the same compute math.
//
// HONEST: best-effort template based on the Dec-2025 / Jan-2026 release.
// The HF model card at huggingface.co/Tongyi-MAI/Z-Image-Turbo is the
// source of truth — if the example code there changes, this template
// will need iteration. The current pipeline path uses the official
// github.com/Tongyi-MAI/Z-Image repo's inference script. Run the
// Diagnostic template first to confirm bridge plumbing.

const cell = (lines) => ({ cell_type: "code", metadata: {}, source: lines.join("\n"), outputs: [], execution_count: null });
const md   = (lines) => ({ cell_type: "markdown", metadata: {}, source: lines.join("\n") });

module.exports = {
    id: "z_image",
    label: "Z-Image-Turbo (6B text → image, fast on T4)",
    gpu: true,
    inputKind: "text",
    defaultDatasets: [],            // once you cache weights as a Kaggle Dataset, add the slug here
    paramsSchema: [
        { name: "prompt", type: "text", required: true,
          help: "text prompt — Z-Image is strong on photorealism and bilingual text rendering (English + Chinese)" },
        { name: "negativePrompt", type: "text", default: "",
          help: "optional negative prompt (things to avoid)" },
        { name: "width", type: "int", default: 1024,
          help: "output width in pixels (multiples of 64 recommended)" },
        { name: "height", type: "int", default: 1024,
          help: "output height in pixels (multiples of 64 recommended)" },
        { name: "steps", type: "int", default: 8,
          help: "diffusion steps — Turbo is distilled so 4-8 steps usually look good (vs 20-30 for base)" },
        { name: "guidance", type: "float", default: 1.0,
          help: "classifier-free guidance scale — Turbo distillation usually wants low CFG (~1.0)" },
        { name: "seed", type: "int", default: 42 },
    ],

    buildNotebook(params, ctx) {
        const prompt    = String(params.prompt || "").slice(0, 2000);
        const negPrompt = String(params.negativePrompt || "").slice(0, 1000);
        const width     = Math.max(256, Math.min(2048, parseInt(params.width, 10) || 1024));
        const height    = Math.max(256, Math.min(2048, parseInt(params.height, 10) || 1024));
        const steps     = Math.max(1, Math.min(50, parseInt(params.steps, 10) || 8));
        const guidance  = parseFloat(params.guidance);
        const cfg       = Number.isFinite(guidance) ? guidance : 1.0;
        const seed      = parseInt(params.seed, 10) || 42;

        return {
            cells: [
                md([`# ${ctx.title}`, "",
                    "Alibaba Tongyi-MAI **Z-Image-Turbo** (6B) text → image on Kaggle.",
                    "",
                    "Released Jan 2026. Few-step distilled diffusion — typically 4-8 steps with low CFG (~1.0) gives clean output.",
                    "First-run installs the official Tongyi-MAI repo + downloads the model from HuggingFace (~12GB).",
                    "Cache the weights as a Kaggle Dataset and attach via `dataset_sources` to skip the download on subsequent runs."]),

                cell([
                    "# 1. env sanity check",
                    "import torch",
                    "print('torch =', torch.__version__, '· cuda =', torch.version.cuda, '· device =', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU')",
                    "print('vram:', round(torch.cuda.get_device_properties(0).total_memory / 1024**3, 1) if torch.cuda.is_available() else 0, 'GB')",
                ]),

                cell([
                    "# 2. clone the official Z-Image repo + install deps",
                    "# TODO verify versions when this template hits a real Kaggle run — Z-Image is brand new.",
                    "import os, subprocess",
                    "if not os.path.isdir('/kaggle/working/Z-Image'):",
                    "    subprocess.check_call(['git', 'clone', '--depth=1', 'https://github.com/Tongyi-MAI/Z-Image.git', '/kaggle/working/Z-Image'])",
                    "os.chdir('/kaggle/working/Z-Image')",
                    "!pip install -q --upgrade pip",
                    "# If the repo has a requirements.txt, install it. Otherwise the next cell installs deps manually.",
                    "if os.path.exists('requirements.txt'):",
                    "    !pip install -q -r requirements.txt",
                    "else:",
                    "    !pip install -q diffusers transformers accelerate safetensors huggingface_hub",
                    "    !pip install -q sentencepiece protobuf",
                ]),

                cell([
                    "# 3a. v696 — check for cached weights attached as a Kaggle Dataset.",
                    "# When the user has configured a cached dataset for z_image (via the",
                    "# engine's Kaggle Dataset Cache panel), Kaggle mounts it at",
                    "# /kaggle/input/<slug-tail>/. We scan for safetensors there and point",
                    "# MODEL_DIR at the cached location to skip the HF download.",
                    "import os",
                    "MODEL_DIR = None",
                    "CACHED = False",
                    "if os.path.isdir('/kaggle/input'):",
                    "    for d in sorted(os.listdir('/kaggle/input')):",
                    "        p = os.path.join('/kaggle/input', d)",
                    "        if not os.path.isdir(p): continue",
                    "        # Heuristic: a Z-Image dataset will have safetensors at the root or one level deep",
                    "        hits = []",
                    "        for root, _, files in os.walk(p):",
                    "            if any(f.endswith('.safetensors') for f in files):",
                    "                hits.append(root); break",
                    "        if hits:",
                    "            MODEL_DIR = hits[0]",
                    "            CACHED = True",
                    "            print(f'cached weights found at {MODEL_DIR} — skipping download')",
                    "            break",
                    "if not CACHED:",
                    "    print('no cached dataset attached — will download from HF')",
                ]),

                cell([
                    "# 3. download Z-Image-Turbo weights from HuggingFace (skipped if cached)",
                    "from huggingface_hub import snapshot_download",
                    "import os",
                    "if not CACHED:",
                    "    MODEL_DIR = '/kaggle/working/z-image-turbo'",
                    "    if not os.path.isdir(MODEL_DIR) or not os.listdir(MODEL_DIR):",
                    "        snapshot_download(repo_id='Tongyi-MAI/Z-Image-Turbo', local_dir=MODEL_DIR)",
                    "print('weights at:', MODEL_DIR)",
                    "print('files:', os.listdir(MODEL_DIR)[:20])",
                ]),

                cell([
                    "# 4. run text-to-image inference",
                    "# Pipeline class name is the OFFICIAL repo's name — verify against the README on github.com/Tongyi-MAI/Z-Image",
                    "# if this throws AttributeError, check the repo's example_inference.py or README for the current class.",
                    "import torch",
                    `torch.manual_seed(${seed})`,
                    `PROMPT          = ${JSON.stringify(prompt)}`,
                    `NEGATIVE_PROMPT = ${JSON.stringify(negPrompt)}`,
                    `WIDTH, HEIGHT   = ${width}, ${height}`,
                    `STEPS           = ${steps}`,
                    `CFG             = ${cfg}`,
                    "",
                    "# Try the official-repo path first (S3-DiT custom pipeline).",
                    "try:",
                    "    import sys; sys.path.insert(0, '/kaggle/working/Z-Image')",
                    "    from z_image.pipeline import ZImagePipeline   # TODO verify name",
                    "    pipe = ZImagePipeline.from_pretrained('/kaggle/working/z-image-turbo', torch_dtype=torch.bfloat16)",
                    "    pipe.to('cuda')",
                    "    img = pipe(prompt=PROMPT, negative_prompt=NEGATIVE_PROMPT, width=WIDTH, height=HEIGHT,",
                    "               num_inference_steps=STEPS, guidance_scale=CFG).images[0]",
                    "except Exception as e1:",
                    "    print('official pipeline path failed, trying Diffusers fallback:', e1)",
                    "    # Diffusers fallback — if HF registered Z-Image as a community pipeline.",
                    "    from diffusers import DiffusionPipeline",
                    "    pipe = DiffusionPipeline.from_pretrained('/kaggle/working/z-image-turbo', torch_dtype=torch.bfloat16, trust_remote_code=True)",
                    "    pipe.to('cuda')",
                    "    img = pipe(prompt=PROMPT, negative_prompt=NEGATIVE_PROMPT or None, width=WIDTH, height=HEIGHT,",
                    "               num_inference_steps=STEPS, guidance_scale=CFG).images[0]",
                    "",
                    "img.save('/kaggle/working/output.png')",
                    "print('saved /kaggle/working/output.png  size=', img.size)",
                ]),

                cell([
                    "# 5. list outputs (bridge picks up everything matching .glb/.gltf/.obj/.ply/.png/.jpg)",
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
