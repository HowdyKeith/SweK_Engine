// kaggle_templates/qwen_image.js — Alibaba Qwen-Image on Kaggle.
//
// 20B-param MMDiT with industry-leading text rendering (esp. Chinese /
// multilingual). The full model is ~40GB in fp16 — does NOT fit in T4
// 16GB raw. Two paths to make it work:
//
//   (a) Diffusers + enable_model_cpu_offload  ← what this template does
//       Swaps components between CPU and GPU as needed. Slower than full
//       GPU residence but reliably fits. Expect ~60-120s per image at
//       1024² on T4.
//
//   (b) DFloat11 compressed weights (DFloat11/Qwen-Image-DF11) which
//       claim 32% memory reduction with bit-identical outputs. Better
//       speed than offload but more setup. The template installs the
//       DF11 path as an OPT-IN switch — set useDF11=true.
//
// HONEST: 20B models on free Kaggle compute is genuinely tight. Z-Image
// is the lighter / faster pick for sprite-gen iteration; Qwen-Image is
// worth it specifically for in-game signage / posters where its text
// rendering category lead matters. Run Diagnostic first to confirm the
// bridge works, then iterate from any errors.

const cell = (lines) => ({ cell_type: "code", metadata: {}, source: lines.join("\n"), outputs: [], execution_count: null });
const md   = (lines) => ({ cell_type: "markdown", metadata: {}, source: lines.join("\n") });

module.exports = {
    id: "qwen_image",
    label: "Qwen-Image (20B text → image, slow on T4)",
    gpu: true,
    inputKind: "text",
    defaultDatasets: [],
    paramsSchema: [
        { name: "prompt", type: "text", required: true,
          help: "text prompt — Qwen-Image's strength is rendering legible text in the image (signage, posters, captions, esp. Chinese + bilingual)" },
        { name: "negativePrompt", type: "text", default: "",
          help: "optional negative prompt" },
        { name: "width", type: "int", default: 1024,
          help: "output width in pixels" },
        { name: "height", type: "int", default: 1024,
          help: "output height in pixels" },
        { name: "steps", type: "int", default: 30,
          help: "diffusion steps — Qwen-Image is NOT distilled, so 20-30 typical (slower than Z-Image-Turbo's 4-8)" },
        { name: "guidance", type: "float", default: 7.5,
          help: "classifier-free guidance scale — Qwen-Image typically wants 5-9" },
        { name: "useDF11", type: "bool", default: false,
          help: "use DFloat11/Qwen-Image-DF11 compressed weights (32% less VRAM, bit-identical) instead of model_cpu_offload. Slightly faster but pulls a different repo." },
        { name: "seed", type: "int", default: 42 },
    ],

    buildNotebook(params, ctx) {
        const prompt    = String(params.prompt || "").slice(0, 2000);
        const negPrompt = String(params.negativePrompt || "").slice(0, 1000);
        const width     = Math.max(256, Math.min(2048, parseInt(params.width, 10) || 1024));
        const height    = Math.max(256, Math.min(2048, parseInt(params.height, 10) || 1024));
        const steps     = Math.max(1, Math.min(80, parseInt(params.steps, 10) || 30));
        const guidance  = parseFloat(params.guidance);
        const cfg       = Number.isFinite(guidance) ? guidance : 7.5;
        const useDF11   = params.useDF11 === true;
        const seed      = parseInt(params.seed, 10) || 42;

        return {
            cells: [
                md([`# ${ctx.title}`, "",
                    "Alibaba **Qwen-Image** (20B MMDiT) text → image on Kaggle.",
                    "",
                    "Tight fit on T4 16GB — uses `enable_model_cpu_offload` (default) OR DFloat11 compressed weights (`useDF11=true`).",
                    "Expect ~60-120s per image at 1024² with offload, ~30-60s with DF11.",
                    "First-run downloads are heavy (~25GB stock, ~17GB DF11). Cache as a Kaggle Dataset for repeat runs."]),

                cell([
                    "import torch; print('torch =', torch.__version__, '· cuda =', torch.version.cuda)",
                    "print('device:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU')",
                    "print('vram:', round(torch.cuda.get_device_properties(0).total_memory / 1024**3, 1) if torch.cuda.is_available() else 0, 'GB')",
                ]),

                cell([
                    "# 1. install Diffusers + supporting deps",
                    "!pip install -q --upgrade pip",
                    "!pip install -q --upgrade diffusers transformers accelerate safetensors huggingface_hub sentencepiece",
                ]),

                cell([
                    "# 2a. v696 — check for cached weights attached as a Kaggle Dataset.",
                    "# When the user has set up a cached dataset for qwen_image (via the",
                    "# engine's Kaggle Dataset Cache panel), Kaggle mounts it at",
                    "# /kaggle/input/<slug-tail>/. Detect that and point MODEL_DIR there",
                    "# instead of running the slow HF snapshot_download.",
                    "import os",
                    `USE_DF11 = ${useDF11 ? "True" : "False"}`,
                    "MODEL_DIR = None",
                    "CACHED = False",
                    "if os.path.isdir('/kaggle/input'):",
                    "    for d in sorted(os.listdir('/kaggle/input')):",
                    "        p = os.path.join('/kaggle/input', d)",
                    "        if not os.path.isdir(p): continue",
                    "        # Look for the canonical Qwen pipeline structure (transformer/, text_encoder/, vae/)",
                    "        if all(os.path.isdir(os.path.join(p, sub)) for sub in ('transformer', 'text_encoder', 'vae')):",
                    "            MODEL_DIR = p",
                    "            CACHED = True",
                    "            print(f'cached Qwen-Image weights found at {MODEL_DIR}')",
                    "            break",
                    "if not CACHED:",
                    "    print('no cached dataset attached — will download from HF')",
                ]),

                cell([
                    "# 2. download weights — switches between stock Qwen-Image and DF11 compressed (skipped if cached)",
                    "from huggingface_hub import snapshot_download",
                    "import os",
                    "if not CACHED:",
                    "    if USE_DF11:",
                    "        # DFloat11 compressed transformer + the stock text encoder / VAE / scheduler.",
                    "        MODEL_DIR = '/kaggle/working/Qwen-Image-DF11'",
                    "        if not os.path.isdir(MODEL_DIR) or not os.listdir(MODEL_DIR):",
                    "            # Pull the stock pipeline structure (config files, scheduler, tokenizer, etc.)",
                    "            snapshot_download(repo_id='Qwen/Qwen-Image', local_dir=MODEL_DIR,",
                    "                              ignore_patterns=['transformer/diffusion_pytorch_model*'])",
                    "            # Pull the DF11 compressed transformer weights",
                    "            snapshot_download(repo_id='DFloat11/Qwen-Image-DF11',",
                    "                              local_dir=os.path.join(MODEL_DIR, 'transformer'),",
                    "                              allow_patterns=['diffusion_pytorch_model*'])",
                    "        print('DF11 dir:', MODEL_DIR)",
                    "        !pip install -q dfloat11   # required to load DF11 weights at runtime",
                    "    else:",
                    "        MODEL_DIR = '/kaggle/working/Qwen-Image'",
                    "        if not os.path.isdir(MODEL_DIR) or not os.listdir(MODEL_DIR):",
                    "            snapshot_download(repo_id='Qwen/Qwen-Image', local_dir=MODEL_DIR)",
                    "        print('stock dir:', MODEL_DIR)",
                    "else:",
                    "    # Cached path — still need dfloat11 pkg if user cached the DF11 variant",
                    "    if USE_DF11:",
                    "        !pip install -q dfloat11",
                ]),

                cell([
                    "# 3. load the pipeline with the right VRAM strategy",
                    "import torch",
                    `torch.manual_seed(${seed})`,
                    "from diffusers import DiffusionPipeline",
                    "",
                    "if USE_DF11:",
                    "    # DF11 path — bit-identical to stock, just compressed in storage.",
                    "    # trust_remote_code lets HF's custom Qwen pipeline class register.",
                    "    pipe = DiffusionPipeline.from_pretrained(MODEL_DIR, torch_dtype=torch.bfloat16, trust_remote_code=True)",
                    "    pipe.to('cuda')",
                    "    print('DF11 pipeline loaded, VRAM after:', round(torch.cuda.memory_allocated() / 1024**3, 1), 'GB')",
                    "else:",
                    "    # Stock path — model is too big for T4 in raw fp16/bf16, so use CPU offload.",
                    "    pipe = DiffusionPipeline.from_pretrained(MODEL_DIR, torch_dtype=torch.bfloat16, trust_remote_code=True)",
                    "    pipe.enable_model_cpu_offload()",
                    "    # Optional: enable_attention_slicing trades a little speed for less peak memory",
                    "    try: pipe.enable_attention_slicing()",
                    "    except Exception: pass",
                    "    print('stock pipeline with cpu_offload ready')",
                ]),

                cell([
                    "# 4. generate the image",
                    `PROMPT          = ${JSON.stringify(prompt)}`,
                    `NEGATIVE_PROMPT = ${JSON.stringify(negPrompt)}`,
                    `WIDTH, HEIGHT   = ${width}, ${height}`,
                    `STEPS           = ${steps}`,
                    `CFG             = ${cfg}`,
                    `SEED            = ${seed}`,
                    "",
                    "import time, torch",
                    "gen = torch.Generator(device='cuda').manual_seed(SEED)",
                    "t0 = time.time()",
                    "img = pipe(",
                    "    prompt=PROMPT,",
                    "    negative_prompt=NEGATIVE_PROMPT or None,",
                    "    width=WIDTH,",
                    "    height=HEIGHT,",
                    "    num_inference_steps=STEPS,",
                    "    true_cfg_scale=CFG,   # Qwen-Image's Diffusers integration uses 'true_cfg_scale' (some versions use 'guidance_scale' — fall back below if needed)",
                    "    generator=gen,",
                    ").images[0] if False else None",
                    "if img is None:",
                    "    try:",
                    "        img = pipe(prompt=PROMPT, negative_prompt=NEGATIVE_PROMPT or None,",
                    "                   width=WIDTH, height=HEIGHT,",
                    "                   num_inference_steps=STEPS, true_cfg_scale=CFG, generator=gen).images[0]",
                    "    except TypeError:",
                    "        img = pipe(prompt=PROMPT, negative_prompt=NEGATIVE_PROMPT or None,",
                    "                   width=WIDTH, height=HEIGHT,",
                    "                   num_inference_steps=STEPS, guidance_scale=CFG, generator=gen).images[0]",
                    "print(f'generation took {time.time()-t0:.1f}s')",
                    "img.save('/kaggle/working/output.png')",
                    "print('saved /kaggle/working/output.png  size=', img.size)",
                ]),

                cell([
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
