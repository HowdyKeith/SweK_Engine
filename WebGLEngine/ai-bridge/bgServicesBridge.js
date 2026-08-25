// ai-bridge/bgServicesBridge.js — generalizes the go2rtc install/detect/start/
// autostart lifecycle to the OTHER background SERVERS the engine leans on:
//   • Ollama  — local LLM at :11434 (HeartbeatAvatar, lore, TradingAgents, …)
//   • OpenRGB — RGB SDK server at :6742 (the rgbBridge / pip-boy color sync)
// Detect (on PATH + a running probe), install (winget on Windows), start/stop
// (spawn the server), and autostart on engine boot. Tool-only deps (ffmpeg, git)
// stay in the Diagnostics deps-check; this is specifically for things that RUN.
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const net = require("net");
const { spawn, spawnSync, execFile } = require("child_process");

const WIN = process.platform === "win32";
const MAC = process.platform === "darwin";
const CFG = path.join(__dirname, "bgservices.json");

// Registry. `serve` = args to launch the server. `probe` = how to tell it's up.
const SERVICES = {
    ollama: {
        label: "Ollama (local LLM)", bin: "ollama", winget: "Ollama.Ollama",
        serve: ["serve"], probe: { type: "http", host: "127.0.0.1", port: 11434, path: "/api/version" },
        note: "Often already runs as a tray app on Windows after install.",
        paths: WIN ? [path.join(process.env.LOCALAPPDATA || "", "Programs", "Ollama", "ollama.exe")] : ["/usr/local/bin/ollama", "/usr/bin/ollama"],
    },
    openrgb: {
        label: "OpenRGB (RGB server)", bin: "OpenRGB", winget: "CalcProgrammer1.OpenRGB",
        serve: ["--server", "--startminimized"], probe: { type: "tcp", host: "127.0.0.1", port: 6742 },
        note: "Start with the SDK server so the engine can drive your case lights.",
        paths: WIN ? ["C:\\Program Files\\OpenRGB\\OpenRGB.exe", path.join(process.env.LOCALAPPDATA || "", "OpenRGB", "OpenRGB.exe")] : ["/usr/bin/openrgb", "/usr/local/bin/openrgb"],
    },
    mosquitto: {
        label: "Mosquitto (MQTT broker)", bin: "mosquitto", winget: "EclipseMosquitto.Mosquitto",
        serve: ["-v"], probe: { type: "tcp", host: "127.0.0.1", port: 1883 },
        note: "MQTT broker that Home Assistant + Frigate publish to.",
        paths: WIN ? ["C:\\Program Files\\mosquitto\\mosquitto.exe"] : ["/usr/sbin/mosquitto", "/usr/bin/mosquitto", "/opt/homebrew/sbin/mosquitto"],
    },
    // v1791 — AI/local-service entries -------------------------------------------------------
    openwebui: {
        label: "Open WebUI (local LLM browser UI)", bin: "open-webui", winget: "",
        serve: ["serve"], probe: { type: "http", host: "127.0.0.1", port: 3000, path: "/health" },
        note: "Browser UI for Ollama and local LLMs (open-webui/open-webui). Install: pip install open-webui. Start: open-webui serve",
        url: "http://localhost:3000",
        github: "open-webui/open-webui",
        paths: WIN ? [] : ["/usr/local/bin/open-webui", "/opt/homebrew/bin/open-webui"],
        installCmd: "pip install open-webui",
    },
    vllm: {
        label: "vLLM (fast LLM inference server)", bin: "vllm", winget: "",
        serve: ["serve", "--model", "Qwen/Qwen2.5-7B-Instruct"], probe: { type: "http", host: "127.0.0.1", port: 8000, path: "/health" },
        note: "High-throughput GPU LLM inference server (vllm-project/vllm). Install: pip install vllm. Start: vllm serve <model>",
        url: "http://localhost:8000",
        github: "vllm-project/vllm",
        paths: WIN ? [] : ["/usr/local/bin/vllm", "/opt/homebrew/bin/vllm"],
        installCmd: "pip install vllm",
    },
    qdrant: {
        label: "QDrant (vector database)", bin: "qdrant", winget: "",
        serve: [], probe: { type: "http", host: "127.0.0.1", port: 6333, path: "/" },
        note: "Vector DB for AI similarity search (qdrant/qdrant). Install: docker run -p 6333:6333 qdrant/qdrant or download binary. REST at :6333.",
        url: "http://localhost:6333",
        github: "qdrant/qdrant",
        paths: WIN ? [path.join(process.env.USERPROFILE || "", ".qdrant", "qdrant.exe")] : ["/usr/local/bin/qdrant", "/opt/homebrew/bin/qdrant"],
        installCmd: "docker run -p 6333:6333 qdrant/qdrant",
    },
    crawl4ai: {
        label: "Crawl4AI (LLM-optimized web crawler)", bin: "crawl4ai-server", winget: "",
        serve: [], probe: { type: "http", host: "127.0.0.1", port: 11235, path: "/health" },
        note: "Async web crawler tuned for LLM context extraction (unclecode/crawl4ai). Install: pip install 'crawl4ai[all]'. Server: crawl4ai-server",
        url: "http://localhost:11235",
        github: "unclecode/crawl4ai",
        paths: WIN ? [] : ["/usr/local/bin/crawl4ai-server"],
        installCmd: "pip install 'crawl4ai[all]'",
    },
    virtualbox: {
        label: "Oracle VirtualBox (hypervisor)", bin: "VBoxManage", winget: "Oracle.VirtualBox",
        serve: [], probe: { type: "cmd", run: "VBoxManage --version" },
        note: "Free cross-platform hypervisor. Install (Windows): winget install Oracle.VirtualBox. Supports USB pass-through (needed for a Zigbee/Z-Wave dongle). Then create a Linux VM and attach the official Home Assistant .vdi. Control it from SweK: server-mode VM panel -> hypervisor: VirtualBox + the VM name.",
        url: "",
        github: "",
        paths: WIN ? ["C:\\Program Files\\Oracle\\VirtualBox\\VBoxManage.exe"] : ["/usr/local/bin/VBoxManage", "/opt/homebrew/bin/VBoxManage", "/Applications/VirtualBox.app/Contents/MacOS/VBoxManage"],
        installCmd: WIN ? "winget install --id Oracle.VirtualBox --accept-source-agreements --accept-package-agreements" : "echo 'Install VirtualBox from virtualbox.org (or: brew install --cask virtualbox on macOS)'",
        winOnlyInstall: false,
    },
    hyperv: {
        label: "Microsoft Hyper-V (Windows Pro/Enterprise)", bin: "", winget: "",
        serve: [], probe: { type: "cmd", run: "powershell -NoProfile -Command \"(Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V).State\"" },
        note: "Built-in Windows Pro/Enterprise hypervisor (native, low overhead). Enable (admin PowerShell): Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V -All, then REBOOT. Boot the official Home Assistant .vhdx as a Generation 2 VM. WARNING: Hyper-V has NO native USB pass-through -- if you need a Zigbee/Z-Wave USB stick on this box, use VirtualBox instead. Requires an ELEVATED shell + reboot; SweK can't fully automate this.",
        url: "",
        github: "",
        paths: [],
        installCmd: "powershell -NoProfile -Command \"Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-Command','Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V -All'\"",
        winOnlyInstall: true,
        needsReboot: true,
    },
    vibe_trading: {
        label: "Vibe-Trading (NL finance research agent)", bin: "vibe-trading", winget: "",
        serve: [], probe: { type: "tcp", host: "127.0.0.1", port: 5899 },
        note: "Natural-language finance RESEARCH agent (HKUDS/Vibe-Trading) - ask in plain English, get backtests, factor analysis, and multi-agent 'swarm' reviews across stocks/crypto/macro. It has its own Web UI (vibe-trading serve -> http://localhost:5899) plus CLI and REST. 21 of 22 tools work with NO API keys (HK/US equities + crypto data are free); only the multi-agent swarm needs an LLM key. Broker trading is OPT-IN and gated behind a connector you authorize yourself - by default it's research/simulation only and holds no funds. It's a Python package (pip install vibe-trading-ai); if Python isn't present SweK auto-installs it via winget, the same way the Trader/Doc/Email-rules tools do. Then SweK's Trading page links to its UI.",
        url: "http://localhost:5899",
        github: "HKUDS/Vibe-Trading",
        paths: [],
        installCmd: "pip install vibe-trading-ai",
        binaryNote: "Python package (pip install vibe-trading-ai), then `vibe-trading serve` for the web UI on :5899, or `vibe-trading run -p \"...\"` from the CLI. Free market data for HK/US/crypto needs no keys; the swarm feature needs an LLM key in agent/.env. SweK auto-installs Python via winget (Python.Python.3.12) if it isn't already present.",
    },
    autohedge: {
        label: "AutoHedge (autonomous AI hedge-fund agents)", bin: "", winget: "",
        serve: [], probe: { type: "tcp", host: "127.0.0.1", port: 8000 },
        note: "A multi-agent 'autonomous hedge fund' (The-Swarm-Corporation/AutoHedge, MIT): four AI agents - Director (thesis) -> Quant (validation) -> Risk (position sizing) -> Execution (orders) - with a FastAPI backend. IMPORTANT: it can place LIVE trades (currently crypto on Solana), so treat it carefully: start in analysis-only, use test funds, and read its risk disclaimer. Any return figures on its page are backtest marketing, not guarantees. It's a Python package (pip install autohedge) + needs LLM keys (OpenAI/Anthropic) + a Jupiter key for prices; SweK auto-installs Python via winget if it's not present, same as the other Python tools.",
        url: "http://localhost:8000",
        github: "The-Swarm-Corporation/AutoHedge",
        paths: [],
        installCmd: "pip install autohedge",
        binaryNote: "Python package. `from autohedge import AutoHedge` in code, or run its FastAPI server. Requires OPENAI_API_KEY/ANTHROPIC_API_KEY + JUPITER_API_KEY in .env. LIVE-TRADING CAPABLE - keep it in analysis/paper mode until you fully understand the execution path. SweK auto-installs Python via winget if it isn't already present.",
    },
    librechat: {
        label: "LibreChat (multi-model chat UI)", bin: "docker", winget: "",
        serve: [], probe: { type: "tcp", host: "127.0.0.1", port: 3080 },
        note: "Self-hosted ChatGPT-style chat UI (danny-avila/LibreChat, MIT) that unifies every major provider - OpenAI, Anthropic, Google, Groq, Mistral, DeepSeek, OpenRouter, and local models via Ollama - with mid-thread model switching, agents, MCP, code interpreter, conversation search, and multi-user auth. Bring your own API keys. Docker-compose stack (LibreChat + MongoDB + MeiliSearch + PGVector + RAG API); runs at http://localhost:3080. Resource-ish (2-4 GB RAM before models) - fine on PurtyGF or the Mac. First account you register becomes admin. SweK just links to it.",
        url: "http://localhost:3080",
        github: "danny-avila/LibreChat",
        paths: [],
        installCmd: "git clone https://github.com/danny-avila/LibreChat.git && cd LibreChat && " + (WIN ? "copy .env.example .env" : "cp .env.example .env") + " && docker compose up -d",
        dockerImage: "ghcr.io/danny-avila/librechat-dev",
        binaryNote: "Docker + docker-compose. Clone the repo, copy .env.example to .env (add your provider API keys), then `docker compose up -d`. Opens on :3080; first registered account is admin. Custom endpoints (Ollama, OpenRouter, etc.) go in librechat.yaml. Node-based images - no Python needed.",
    },
    open_generative_ai: {
        label: "Open Generative AI (image/video studio)", bin: "node", winget: "",
        serve: [], probe: { type: "tcp", host: "127.0.0.1", port: 3000 },
        note: "Open-source AI image & video generation studio (Anil-matcha/Open-Generative-AI, formerly Open-Higgsfield-AI; MIT) - 200+ models (Flux, Midjourney, Kling, Sora, Veo, etc.) behind one UI. NODE-based (Vite/Next.js) - `npm run dev` serves the web version at http://localhost:3000, or grab the prebuilt Electron desktop installer from GitHub releases (no Node needed). Generation is powered by MuAPI's cloud, so it needs a MuAPI API key (entered in the app, stored in your browser) - models don't run locally. NOTE: it advertises itself as 'unrestricted / no content filters', so the usual care applies to what you generate. SweK links to the local web version.",
        url: "http://localhost:3000",
        github: "Anil-matcha/Open-Generative-AI",
        paths: [],
        installCmd: "git clone --recurse-submodules https://github.com/Anil-matcha/Open-Generative-AI.git && cd Open-Generative-AI && npm run setup && npm run dev",
        dockerImage: "",
        binaryNote: "Two ways: (1) prebuilt desktop installer from GitHub releases (macOS .dmg / Windows / Linux .deb - no Node). (2) From source: clone with --recurse-submodules, `npm run setup` (required - builds the studio/workflow/agent workspaces), then `npm run dev` for the web version on :3000 or `npm run electron:dev` for the desktop app. Needs a MuAPI key; generation runs in MuAPI's cloud.",
    },
    hyperframes: {
        label: "HyperFrames (HTML->video CLI, for agents)", bin: "npx", winget: "",
        serve: [], probe: { type: "tcp", host: "127.0.0.1", port: 0 },
        note: "A 'write HTML, render video' toolkit from HeyGen (heygen-com/hyperframes, Apache-2.0) - author a composition in HTML/CSS/JS (GSAP, Lottie, Three.js, shaders) and render it to MP4. It's a CLI, not a server: `npx hyperframes init my-video`, then `npx hyperframes preview` (opens a studio in your browser with live reload) and `npx hyperframes render` (-> MP4). Built for AI agents - it ships ~20 agent skills (npx skills add heygen-com/hyperframes). Needs Node.js 22+ and FFmpeg (you already have the static ffmpeg). Pairs well with the engine's existing TTS + asset tooling for making promo/demo clips of SweK itself.",
        url: "https://hyperframes.heygen.com",
        github: "heygen-com/hyperframes",
        paths: [],
        installCmd: "npx hyperframes init my-video",
        dockerImage: "",
        binaryNote: "No install step - runs via npx (Node.js 22+). `npx hyperframes init <name>` scaffolds a project (and installs the AI-agent skills), `npx hyperframes preview` opens the browser studio, `npx hyperframes render` encodes to MP4 (needs FFmpeg - the engine's static ffmpeg works). `npx hyperframes --help` for the full CLI. Optional AWS Lambda cloud rendering exists but local render is the default.",
    },
    ai_berkshire: {
        label: "AI-Berkshire (value-investing skill pack)", bin: "", winget: "",
        serve: [], probe: { type: "none" },
        note: "A Claude Code / Codex SKILL collection (xbtlin/ai-berkshire, MIT) that systematizes four value-investing masters (Buffett, Munger, Duan Yongping, Li Lu) into multi-agent research. Forces concrete Pass/Fail/Gray-zone verdicts with price ranges (not wishy-washy 'on one hand...'), cross-checks data from 2+ sources, and uses Python decimal math so PE/market-cap aren't miscalculated. NOT an app or server - you install its skills into Claude Code's commands dir and run /investment-research <ticker> inside your coding agent. Reachable from the engine's Trading page as a reference card.",
        url: "https://github.com/xbtlin/ai-berkshire",
        github: "xbtlin/ai-berkshire",
        paths: [],
        installCmd: "git clone https://github.com/xbtlin/ai-berkshire && cd ai-berkshire && ./scripts/install-claude-commands.sh",
        binaryNote: "Claude Code / Codex skill pack (Python tools for the exact-math parts). Clone, run ./scripts/install-claude-commands.sh (or install-codex-skills.sh), then use /investment-research in Claude Code. It runs in your coding agent, not as a SweK service.",
    },
    ai_website_cloner: {
        label: "AI Website Cloner (Claude Code skill)", bin: "", winget: "",
        serve: [], probe: { type: "none" },
        note: "A Claude Code / Codex SKILL (JCodesMore/ai-website-cloner-template, TS) that reverse-engineers a website: screenshots it (via the Chrome MCP), extracts its design system (colors, type, components), then spins up parallel agents to rebuild it in Next.js/React/Tailwind and diffs the result against the original. USEFUL HERE: point it at your OWN SweK pages (server.html, phone.html, the LCARS UI) to get a clean modern React rebuild or a design-system audit of your own front-end - the author tested it on their own site. (Author's note: not for phishing or copying others' designs.) Install into Claude Code and run /clone-website <url>.",
        url: "https://github.com/JCodesMore/ai-website-cloner-template",
        github: "JCodesMore/ai-website-cloner-template",
        paths: [],
        installCmd: "git clone https://github.com/JCodesMore/ai-website-cloner-template my-clone && cd my-clone && npm install",
        binaryNote: "Claude Code / Codex skill. Clone + npm install, launch Claude Code with the Chrome MCP, then /clone-website <url>. Point it at your own SweK page to analyze/rebuild it. Runs in your coding agent.",
    },
    ponytail: {
        label: "PonyTail (lazy-senior-dev skill)", bin: "", winget: "",
        serve: [], probe: { type: "none" },
        note: "A Claude Code / Codex / Copilot SKILL (DietrichGebert/ponytail, MIT) that injects a 'laziest senior dev in the room' ruleset into your AI coding agent - YAGNI-first, reuse-before-rewrite, deletion over addition, shortest working diff. Measured to cut generated code substantially while keeping safety guards. NOT an app - it's an instruction/skill layer for your coding agent (install via its marketplace/plugin, or drop the ruleset file into Cursor/Windsurf/etc). Handy for keeping SweK's own additions minimal.",
        url: "https://github.com/DietrichGebert/ponytail",
        github: "DietrichGebert/ponytail",
        paths: [],
        installCmd: "codex plugin marketplace add DietrichGebert/ponytail  (or: gemini extensions install https://github.com/DietrichGebert/ponytail)",
        binaryNote: "Claude Code / Codex / Copilot / Gemini skill+plugin. Install via your agent's plugin/marketplace (or copy the rules file into Cursor/Windsurf/Cline). ~100 lines of ruleset - it disciplines the agent, it isn't a service.",
    },
    lingbot_map: {
        label: "LingBot-Map (video -> 3D scene, GPU)", bin: "", winget: "",
        serve: [], probe: { type: "none" },
        note: "A feed-forward 3D foundation model (Robbyant/lingbot-map; Robbyant = Ant Group embodied-AI) that reconstructs a 3D scene from a streaming video or image folder - ~20 FPS, handles 10,000+ frames. FUN FIT with your VoxelEngine work: walk a phone around a room (or feed drone/tour footage) -> a reconstructed 3D point/mesh scene you could import as reference geometry. HEAVY: Python + CUDA 12.8 + PyTorch + NVIDIA Kaolin + FlashInfer, tuned for recent NVIDIA GPUs. Your Pascal 1070/1080 may run the demo.py path but it's not the target hardware - expect to fiddle. Runs on the box with the beefiest GPU; SweK auto-installs Python but the CUDA/torch stack is a manual, careful install.",
        url: "https://github.com/Robbyant/lingbot-map",
        github: "Robbyant/lingbot-map",
        paths: [],
        installCmd: "conda create -n lingbot-map python=3.10 -y && conda activate lingbot-map && pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128",
        binaryNote: "GPU research model (Python/CUDA). conda env + PyTorch cu128 + Kaolin (prebuilt wheels for torch-2.8.0_cu128) + flashinfer-python. Then `python demo.py --model_path <ckpt> --image_folder <frames>`. Weights + demo sequences on Hugging Face (robbyant/lingbot-map, robbyant/lingbot-map-demo). Pascal GPUs may manage demo.py but the batch renderer wants a newer card.",
    },
    languagetool: {
        label: "LanguageTool (grammar/spell/style server)", bin: "docker", winget: "",
        serve: [], probe: { type: "tcp", host: "127.0.0.1", port: 8010 },
        note: "Self-hosted grammar/spell/style checker (an open-source Grammarly-ish engine, 30+ languages) - languagetool-org/languagetool (LGPL). It's a headless HTTP server with NO UI and NO key; SweK provides the UI on the LanguageTool page. Docker image erikvl87/languagetool listens on 8010; the check API is POST /v2/check {language,text}. Needs Java (bundled in the image). Optional n-gram data hugely improves 'confused words' detection but is a ~15 GB download - skip it to start. If you'd rather not host anything, SweK can also point at the public server https://api.languagetool.org/v2 (rate-limited, no key) - set that as the URL on the LanguageTool page.",
        url: "http://localhost:8010",
        github: "languagetool-org/languagetool",
        paths: [],
        installCmd: "docker run -d --name languagetool --restart=unless-stopped -p 8010:8010 erikvl87/languagetool:latest",
        dockerImage: "erikvl87/languagetool",
        binaryNote: "Docker is easiest (erikvl87/languagetool on :8010, or meyay/languagetool). No-Docker: download the LanguageTool zip and run `java -cp languagetool-server.jar org.languagetool.server.HTTPServer --port 8081 --allow-origin '*'` (Java 8+). After it's up, set the URL on SweK's LanguageTool page (e.g. http://localhost:8010/v2). n-gram data (~15 GB) is optional and only improves confused-word detection.",
    },
    llamaserver: {
        label: "llama-server (llama.cpp inference, grammars + parallel slots)", bin: "llama-server", winget: "",
        serve: [], probe: { type: "tcp", host: "127.0.0.1", port: 8080 },
        note: "ggml-org/llama.cpp's OpenAI-compatible inference server (MIT). Why run it NEXT TO Ollama: (1) GBNF GRAMMARS - constrains decoding so output CAN'T be malformed; SweK's OBJ generation auto-uses /ai/grammars/obj.gbnf through it when configured (set voxelengine.llamaServerUrl, e.g. http://127.0.0.1:8080), which attacks FailedOBJStore rejects at the source; (2) PARALLEL SLOTS (-np 4 -c 16384) - variant expansion, narrative, and OBJ gen share one loaded model concurrently instead of queueing; (3) SPECULATIVE DECODING (-md <small-draft.gguf>) for 2-3x tokens/s on the GPU boxes; (4) KV-cache quantization + partial GPU offload (-ngl N) to fit bigger brains on low-VRAM fleet members. Needs a GGUF model file (grab one from Hugging Face with -hf, e.g. `llama-server -hf ggml-org/gemma-3-1b-it-GGUF`).",
        url: "http://localhost:8080",
        github: "ggml-org/llama.cpp",
        ghAsset: { win: "bin-win", mac: "bin-macos", linux: "bin-ubuntu" },   // v1989 — llama.cpp asset names: llama-<b>-bin-{win,macos,ubuntu}-...zip
        paths: [],
        installCmd: "winget install ggml.llamacpp  (or: brew install llama.cpp / download a release from github.com/ggml-org/llama.cpp/releases)",
        binaryNote: "Start with: llama-server -m model.gguf -c 16384 -np 4 --port 8080  (add -ngl 99 for full GPU offload, -md draft.gguf for speculative decoding). Then set voxelengine.llamaServerUrl = http://127.0.0.1:8080 in SweK to route grammar-constrained OBJ generation through it; everything else keeps using Ollama.",
    },
    lazydocker: {
        label: "lazydocker (terminal Docker dashboard)", bin: "lazydocker", winget: "JesseDuffield.lazydocker",
        serve: [], probe: null,
        note: "jesseduffield/lazydocker (MIT) - a zero-config terminal UI for Docker: every container/service in one keyboard-driven dashboard with live log tails, CPU/mem graphs, and one-key restart/rebuild/prune. Companion tool for any SweK box that runs Docker services from this catalog (LanguageTool, Postiz, ...). SweK's own Services Dashboard (servicesdash.html) borrows its layout for the engine's managed services.",
        url: "https://github.com/jesseduffield/lazydocker",
        github: "jesseduffield/lazydocker",
        paths: [],
        installCmd: "winget install JesseDuffield.lazydocker  (or: brew install lazydocker / scoop install lazydocker)",
        binaryNote: "Run `lazydocker` in any terminal on a box with Docker. Not a server - nothing to probe.",
    },
    postiz: {
        label: "Postiz (social scheduling, 28+ channels)", bin: "docker", winget: "",
        serve: [], probe: { type: "tcp", host: "127.0.0.1", port: 5000 },
        note: "Self-hosted social-media scheduling (post + SCHEDULE to Facebook Page, X, LinkedIn, Instagram, Threads, Mastodon, Bluesky, Telegram, Discord, YouTube, TikTok, Pinterest, ... 28+ channels) with an AI-assisted composer. AGPL-3.0. Self-host needs a few services (PostgreSQL + Redis + the app; the full stack also uses Temporal for reliable scheduling). Once up: open its dashboard, connect your channels (each platform needs its own app/credentials), then Settings -> copy the API Key and paste it into SweK's Social page. SweK posts/schedules through Postiz's public API with the key kept server-side. Or skip hosting entirely: use Postiz Cloud (api.postiz.com) with just an API key.",
        url: "http://localhost:5000",
        github: "gitroomhq/postiz-app",
        paths: [],
        installCmd: "echo 'Postiz self-host needs Postgres + Redis; see https://docs.postiz.com/installation/docker-compose . Quickest path: Postiz Cloud (api.postiz.com) + an API key, no hosting. Then paste the key into SweK Settings -> Social.'",
        dockerImage: "ghcr.io/gitroomhq/postiz-app:latest",
        binaryNote: "Full self-host = the postiz app container + PostgreSQL + Redis (+ Temporal). Node 22 from source. Platform OAuth apps (X/LinkedIn/etc.) each need their own developer credentials, so many people use Postiz Cloud for managed OAuth and self-host nothing — SweK works with either: set the base URL + API key on the Social page.",
    },
    huly: {
        label: "Huly (all-in-one PM: Jira/Linear/Slack/Notion alt)", bin: "docker", winget: "",
        serve: [], probe: { type: "tcp", host: "127.0.0.1", port: 8087 },
        note: "Self-hosted all-in-one work platform (project tracking + docs + chat + CRM/HR, an open alternative to Jira/Linear/Slack/Notion). RESOURCE-HEAVY: the team recommends >= 4 vCPU / 16 GB RAM and it uses ~35 GB disk (many containers: front/account/transactor + MongoDB/Elasticsearch/MinIO/CockroachDB/Redpanda). Best run on your beefiest box (e.g. PurtyGF), NOT the Mac. QUICK LOCAL TRY: clone huly-selfhost and run setup.sh in localhost mode -> it comes up at http://localhost:8087 in ~60s with Docker named volumes, no nginx/domain needed. PRODUCTION (LAN/remote): run ./setup.sh <host-or-ip>, wire the generated nginx.conf, then docker compose up -d. Note: hardcoreeng's HOSTED huly.io service is shutting down ~July 20 2026 - self-hosting is unaffected (and is the reason to self-host). Has a typed API client for integrations.",
        url: "http://localhost:8087",
        github: "hcengineering/huly-selfhost",
        paths: [],
        installCmd: WIN
            ? "echo Huly self-host is Linux/Docker-first. On Windows use WSL2 (Ubuntu) then: git clone https://github.com/hcengineering/huly-selfhost.git && cd huly-selfhost && ./setup.sh"
            : "git clone https://github.com/hcengineering/huly-selfhost.git && cd huly-selfhost && ./setup.sh && sudo docker compose up -d",
        dockerImage: "hardcoreeng/front",
        binaryNote: "Docker + docker-compose required (Linux, or WSL2 on Windows). The interactive setup.sh prompts for host address, HTTP port (default 8087), SSL, and volume paths - press Enter through them for a localhost trial. Source: hcengineering/platform (the app) + hcengineering/huly-selfhost (the compose deploy). Use production v* image tags (e.g. v0.7.x). Don't expose MongoDB/MinIO/Elastic to the internet; change default credentials before any public deployment.",
    },
    netbird_server: {
        label: "NetBird (self-hosted WireGuard mesh)", bin: "netbird", winget: "NetBird.NetBird",
        serve: [], probe: { type: "tcp", host: "127.0.0.1", port: 443 },
        note: "Your OWN WireGuard P2P mesh control plane (a self-hosted, open-source alternative/complement to Tailscale). Devices form direct encrypted peer-to-peer tunnels; the management server only brokers keys/discovery, traffic stays P2P. HONEST REQUIREMENTS for the SERVER: a Linux box with a PUBLIC domain name pointing to it and public reachability on TCP 80/443 + UDP 3478 (for automatic Let's Encrypt TLS + STUN). It has a built-in identity provider now (Dex) so NO external IdP is needed. Server install (Linux): set NETBIRD_DOMAIN then run the getting-started script. If you just want your boxes on a mesh WITHOUT hosting the control plane, install the CLIENT agent instead (winget NetBird.NetBird / brew install netbird / the Linux package) and use NetBird's free managed cloud, or point it at this server. The client is the P2P piece that mirrors how you use Tailscale.",
        url: "https://localhost",
        github: "netbirdio/netbird",
        paths: WIN ? [] : ["/usr/local/bin/netbird", "/usr/bin/netbird", "/opt/homebrew/bin/netbird"],
        installCmd: WIN ? "winget install --id NetBird.NetBird -e" : "export NETBIRD_DOMAIN=netbird.example.com; curl -fsSL https://github.com/netbirdio/netbird/releases/latest/download/getting-started.sh | bash",
        binaryNote: "SERVER needs a public domain + ports 80/443/UDP-3478 (that's what the getting-started.sh script sets up, with Traefik + Let's Encrypt). CLIENT agent (to just join a mesh) installs via: Windows `winget install NetBird.NetBird`, macOS `brew install netbird` then `netbird up`, Linux the netbird apt/rpm package then `netbird up`. Repo netbirdio/netbird is BSD-3 (the management/, signal/, relay/ dirs are AGPLv3). Once a box runs `netbird up` and joins, its mesh IP is in the 100.x range — SweK can use that as a peer URL.",
    },
    coolify: {
        label: "Coolify (self-hosted PaaS / git-push deploy)", bin: "docker", winget: "",
        serve: [], probe: { type: "tcp", host: "127.0.0.1", port: 8000 },
        note: "Self-hosted PaaS (Apache-2.0) that gives you Heroku/Vercel-style git-push CI/CD from your GitHub repos: connect a repo + branch, every push builds and deploys, with automatic Let's Encrypt SSL, PostgreSQL/MySQL/Mongo/Redis provisioning, and per-PR PREVIEW deployments via a GitHub App. This is a DIFFERENT capability than SweK's existing GitHub bits (which PULL tool repos + version-check peers) — Coolify DEPLOYS your projects. HONEST REQUIREMENTS: it's Docker-based (uses Docker + Traefik + nixpacks; runs on Docker or Docker Swarm ONLY — no native Podman and no Kubernetes). Wants its OWN box: the recommended layout is one server for the Coolify control plane and one+ for the apps it deploys — so on this fleet, PurtyGF (the heavy-Docker CPU box) is the natural host, not every box. Best fit for deploying your portfolio projects (SweK itself, or the codegraph/dev-browser/humanizer front-ends) straight from github.com/HowdyKeith. CAVEATS: v4 line was still in late beta as of early 2026 with a v5 rewrite planned (possible future migration), and it has a CVE on record (CVE-2026-31431) — keep it patched since it's a deploy control plane. v4 also ships a Coolify MCP Server for programmatic/agent control if you want to wire it up later.",
        url: "http://localhost:8000",
        github: "coollabsio/coolify",
        paths: [],
        installCmd: "curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash",
        dockerImage: "",
        binaryNote: "Install is one command (it sets up Docker, Traefik, and the dashboard) on a Linux box; then open http://<box>:8000, connect GitHub, and point it at a repo. NOT a per-box install — put it on ONE box (PurtyGF) and deploy to the others over SSH. Podman is NOT supported as a drop-in (community has a patched workaround only); Kubernetes is not a supported target either. If you want lighter, Dokploy/CapRover/Kamal are Docker-based alternatives; none of them do WASM.",
    },
    wasmtime: {
        label: "Wasmtime (portable WASM runtime)", bin: "wasmtime", winget: "BytecodeAlliance.Wasmtime",
        serve: [], probe: { type: "none" },
        note: "The reference WASI runtime (Bytecode Alliance). Runs ONE portable .wasm binary byte-identically on Windows / macOS / Linux / ARM / x86 - the 'compile once, run anywhere' WASM actually delivers - with NO Docker and NO per-OS binary. This is the STANDALONE runtime; SweK's own bridge already runs .wasm via Node's built-in WebAssembly (see the SHA-256 demo on /wasm-demo.html), so you don't NEED wasmtime just to run wasm inside SweK - install it to run .wasm from the command line / outside Node, or to build a Docker-free compute-plugin layer. HONEST SCOPE (2026): server-side WASM is production-ready for STATELESS compute - sandboxed code execution, plugins, transforms, edge/FaaS handlers - NOT for stateful daemons (DBs, Home Assistant, Coolify) or GPU work. Threading + networking are still the weak spots; keep wasm modules to self-contained compute.",
        url: "",
        github: "bytecodealliance/wasmtime",
        paths: WIN ? [] : ["/usr/local/bin/wasmtime", "/usr/bin/wasmtime", (process.env.HOME || "~") + "/.wasmtime/bin/wasmtime"],
        installCmd: WIN ? "winget install --id BytecodeAlliance.Wasmtime -e" : "curl https://wasmtime.dev/install.sh -sSf | bash",
        binaryNote: "macOS also: brew install wasmtime. Run: `wasmtime run module.wasm`. WASI Preview 2 + Component Model are stable in 2026; WASI 0.3 (Feb 2026) added native async I/O. Apache-2.0-WITH-LLVM-exception.",
    },
    spin: {
        label: "Fermyon Spin (WASM microservices)", bin: "spin", winget: "Fermyon.Spin",
        serve: [], probe: { type: "tcp", host: "127.0.0.1", port: 3000 },
        note: "A framework for building + running WASM microservices and HTTP handlers with routing, key-value storage, SQLite, and pub/sub - the easiest way to build Docker-free 'serverless' compute that starts in ~1ms and ships as a few-KB .wasm. Good fit for SweK's stateless compute (transforms, sandboxed handlers, plugin endpoints) you'd otherwise reach for Docker to run. NOT for stateful apps or GPU. Uses wasmtime under the hood. CNCF Sandbox project.",
        url: "http://localhost:3000",
        github: "fermyon/spin",
        paths: WIN ? [] : ["/usr/local/bin/spin", "/usr/bin/spin", (process.env.HOME || "~") + "/.spin/bin/spin"],
        installCmd: WIN ? "winget install --id Fermyon.Spin -e" : "curl -fsSL https://developer.fermyon.com/downloads/install.sh | bash",
        binaryNote: "macOS also: brew install fermyon/tap/spin. Then `spin new` scaffolds an app, `spin build && spin up` runs it. Apache-2.0.",
    },
    rustdesk_server: {
        label: "RustDesk Server (self-hosted hbbs+hbbr)", bin: "hbbs", winget: "",
        serve: [], probe: { type: "tcp", host: "127.0.0.1", port: 21116 },
        note: "Your OWN RustDesk ID/relay server so remote-desktop sessions broker through YOUR box instead of RustDesk's public servers (private, faster, no session limits). Two processes: hbbs (ID/rendezvous, TCP 21115/21116/21118 + UDP 21116) and hbbr (relay, TCP 21117/21119). Docker install runs BOTH containers. After first start, the ID Server = this box's LAN IP and the Key is printed in the hbbs logs / lands in ~/rustdesk-server/data/id_ed25519.pub — put those in each RustDesk client's Network settings (ID Server + Key). NOTE: --network=host is Linux-only; on Docker Desktop (Mac/Windows) it maps the ports instead.",
        url: "http://localhost:21114",
        github: "rustdesk/rustdesk-server",
        paths: WIN ? [] : ["/usr/local/bin/hbbs", "/usr/bin/hbbs"],
        installCmd: "docker run -d --name hbbs --restart=unless-stopped " + (WIN ? "-p 21115:21115 -p 21116:21116 -p 21116:21116/udp -p 21118:21118 " : "--net=host ") + "-v " + (WIN ? "%USERPROFILE%\\rustdesk-server" : "$HOME/rustdesk-server") + ":/root rustdesk/rustdesk-server hbbs && docker run -d --name hbbr --restart=unless-stopped " + (WIN ? "-p 21117:21117 -p 21119:21119 " : "--net=host ") + "-v " + (WIN ? "%USERPROFILE%\\rustdesk-server" : "$HOME/rustdesk-server") + ":/root rustdesk/rustdesk-server hbbr",
        dockerImage: "rustdesk/rustdesk-server",
        binaryNote: "No-Docker options: (1) prebuilt binaries from github.com/rustdesk/rustdesk-server releases (hbbs + hbbr; run both), (2) Windows via PM2/NSSM, (3) the techahold install.sh script on Linux. hbbr (relay) is only used when direct hole-punching fails.",
    },
    homeassistant: {
        label: "Home Assistant (Container)", bin: "hass", winget: "",
        serve: [], probe: { type: "http", host: "127.0.0.1", port: 8123, path: "/" },
        note: "Open-source home automation hub. Easiest install is the Docker Container: `docker run -d --name homeassistant --restart=unless-stopped -e TZ=America/New_York -v ~/homeassistant:/config --network=host ghcr.io/home-assistant/home-assistant:stable`. NOTE: --network=host is Linux-only; on Docker Desktop (Mac/Windows) drop it and use `-p 8123:8123` instead. First boot takes a minute; then open http://localhost:8123 to create your account. Once up, connect SweK to it in Settings (Home Assistant) with a long-lived token.",
        url: "http://localhost:8123",
        github: "home-assistant/core",
        paths: WIN ? [] : ["/usr/local/bin/hass", "/opt/homebrew/bin/hass"],
        installCmd: "docker run -d --name homeassistant --restart=unless-stopped -e TZ=America/New_York -v " + (WIN ? "%USERPROFILE%\\homeassistant" : "$HOME/homeassistant") + ":/config --network=host ghcr.io/home-assistant/home-assistant:stable",
        dockerImage: "ghcr.io/home-assistant/home-assistant:stable",
        binaryNote: "No-Docker options: HA Operating System (a full appliance image for a Pi / VM / NUC) or HA Core in a Python venv (`pip install homeassistant` then `hass`) — but Container is the simplest cross-platform route. On Docker Desktop (Mac/Windows), replace --network=host with -p 8123:8123.",
    },
    whisper: {
        label: "Whisper (offline speech-to-text server)", bin: "whisper-server", winget: "",
        serve: [], probe: { type: "http", host: "127.0.0.1", port: 8080, path: "/" },
        note: "Local speech-to-text via whisper.cpp (ggml-org/whisper.cpp). Build whisper-server + grab a model (e.g. models/ggml-base.en.bin), then run: whisper-server -m models/ggml-base.en.bin --port 8080. Drives the Dictation page.",
        url: "http://localhost:8080",
        github: "ggml-org/whisper.cpp",
        paths: WIN ? [] : ["/usr/local/bin/whisper-server"],
        installCmd: "git clone https://github.com/ggml-org/whisper.cpp && cd whisper.cpp && cmake -B build && cmake --build build --config Release && ./models/download-ggml-model.sh base.en",
    },
    nextcloud: {
        label: "Nextcloud (self-hosted cloud)", bin: "nextcloud", winget: "",
        serve: [], probe: { type: "http", host: "127.0.0.1", port: 8080, path: "/status.php" },
        note: "Self-hosted file/cloud storage (nextcloud/server). Easiest install: docker run -p 8080:80 nextcloud. Or AIO: nextcloud-aio.",
        url: "http://localhost:8080",
        github: "nextcloud/server",
        paths: WIN ? [] : ["/usr/bin/nextcloud", "/opt/nextcloud/nextcloud"],
        installCmd: "docker run -d -p 8080:80 --name nextcloud nextcloud",
        dockerImage: "nextcloud",
    },
    // v1829 — ownCloud Infinite Scale (oCIS). Single Go binary OR a single Docker container,
    // no external database. Good lighter alternative to Nextcloud, and the Docker container
    // is one `docker run` (unlike Seafile's multi-container compose stack). Web-verified
    // against github.com/owncloud/ocis + hub.docker.com/r/owncloud/ocis (Jun 2026).
    owncloud: {
        label: "ownCloud Infinite Scale (oCIS)", bin: "ocis", winget: "",
        serve: [], probe: { type: "http", host: "127.0.0.1", port: 9200, path: "/status.php" },
        note: "Modern file sync/share, single Go binary or one Docker container, no database. Docker: docker run -p 9200:9200 -e OCIS_INSECURE=true owncloud/ocis. Or run the single binary from github.com/owncloud/ocis releases (no Docker needed): ocis init && ocis server.",
        url: "https://localhost:9200",
        github: "owncloud/ocis",
        paths: WIN ? [] : ["/usr/local/bin/ocis", "/opt/homebrew/bin/ocis", "/usr/bin/ocis"],
        installCmd: "docker run -d -p 9200:9200 --name ocis -e OCIS_INSECURE=true -e OCIS_URL=https://localhost:9200 -e PROXY_HTTP_ADDR=0.0.0.0:9200 owncloud/ocis",
        dockerImage: "owncloud/ocis",
        binaryNote: "No-Docker option: download the single `ocis` binary from github.com/owncloud/ocis/releases, then `ocis init --insecure yes` and `ocis server`. Works without Docker — handy on older macOS where Docker Desktop won't install.",
    },
    // v1829 — Seafile. Listed honestly: as of Seafile 13 the Community Edition is Docker-ONLY
    // and is a MULTI-CONTAINER compose stack (MariaDB + Redis + Seafile + Caddy + SeaDoc), NOT
    // a single `docker run`. So the engine can't one-button it; it points to the official
    // compose docs. Web-verified against manual.seafile.com (Jun 2026).
    seafile: {
        label: "Seafile (self-hosted cloud)", bin: "seafile", winget: "",
        serve: [], probe: { type: "http", host: "127.0.0.1", port: 8000, path: "/" },
        note: "High-performance file sync/share. Seafile 13 CE is Docker-only and a MULTI-CONTAINER compose stack (MariaDB+Redis+Seafile+Caddy) \u2014 not a one-line run. Follow the official docker-compose guide: manual.seafile.com (Setup CE by Docker). The engine can't one-button this one.",
        url: "http://localhost:8000",
        github: "haiwen/seafile",
        paths: WIN ? [] : ["/usr/bin/seafile", "/opt/seafile/seafile-server-latest/seafile.sh"],
        installCmd: "",   // intentionally blank — compose stack, no single docker-run command
        composeOnly: true,
        docsUrl: "https://manual.seafile.com/latest/setup/setup_ce_by_docker/",
    },
    fluidvoice: {
        label: "FluidVoice (macOS offline dictation)", bin: "FluidVoice", winget: "",
        serve: [], probe: { type: "process", name: "FluidVoice" },
        note: "Fast local voice-to-text for macOS with on-device AI (altic-dev/FluidVoice). Install: brew install --cask fluidvoice (macOS 15+).",
        github: "altic-dev/FluidVoice",
        macOnly: true,
        paths: ["/Applications/FluidVoice.app/Contents/MacOS/FluidVoice"],
        installCmd: "brew install --cask fluidvoice",
    },
    // v1977 — SweK's OWN dictation helper (the tray app in tools/dictate-tray). Runs via node; slots in
    // like any other service so you can start/stop it from server.html. It's a bridge client (hotkey ->
    // whisper -> optional Ollama polish -> type into the focused app), so it needs THIS bridge running.
    dictate: {
        label: "SweK Dictate (speak-to-type)", bin: process.execPath,   // node
        serve: [path.join(__dirname, "..", "tools", "dictate-tray", "dictate-tray.js")],
        probe: { type: "process", name: "dictate-tray" },
        note: "Global-hotkey dictation (hold Right Alt): mic -> local whisper -> optional Ollama polish -> types into the focused app. First run: `npm install` in tools/dictate-tray. Needs ffmpeg on PATH + whisper.cpp set up.",
        swekPage: "/dictation.html",
        paths: [process.execPath],
    },
};

const _children = {};   // id -> child process we started
function load() { try { return JSON.parse(fs.readFileSync(CFG, "utf8")); } catch { return {}; } }
function save(o) { try { fs.writeFileSync(CFG, JSON.stringify(o, null, 2)); } catch {} }

// v1809 — was spawnSync("which"/"where"), which BLOCKS THE ENTIRE NODE EVENT LOOP
// for the duration of the lookup. statusOne() calls this once per service, so even
// though statusAll() was parallelized in v1807, the 9 synchronous `where` calls still
// ran serially (and on Windows `where` scans the whole PATH and can be slow), blocking
// every other route — which is why /bgsvc/status still timed out at 8s. resolveBinAsync
// uses non-blocking execFile so the lookups truly overlap and don't freeze the process.
function _checkPaths(svc) {
    for (const p of (svc.paths || [])) { try { if (p && fs.statSync(p).size > 0) return p; } catch {} }
    return "";
}
function resolveBinAsync(svc) {
    return new Promise((resolve) => {
        const finishWithPaths = () => resolve(_checkPaths(svc));
        try {
            execFile(WIN ? "where" : "which", [svc.bin], { windowsHide: true, timeout: 2500 }, (err, stdout) => {
                const out = String(stdout || "").trim();
                if (!err && out) return resolve(out.split(/\r?\n/)[0]);
                finishWithPaths();
            });
        } catch { finishWithPaths(); }
    });
}
// sync version kept ONLY for start() (a deliberate user action, not the hot status path)
function resolveBin(svc) {
    try { const r = spawnSync(WIN ? "where" : "which", [svc.bin], { windowsHide: true, timeout: 2500 }); const out = String((r && r.stdout) || "").trim(); if (r && r.status === 0 && out) return out.split(/\r?\n/)[0]; } catch {}
    const viaPaths = _checkPaths(svc);
    if (viaPaths) return viaPaths;
    // v1989 — last resort: a binary we installed from GitHub Releases into ~/.swek/tools/<id>
    const id = Object.keys(SERVICES).find(k => SERVICES[k] === svc);
    if (id) { const gh = _githubBin(id); if (gh) return gh; }
    return null;
}

function probe(svc, timeoutMs) {
    const p = svc.probe; const to = timeoutMs || 1200;
    if (!p) return Promise.resolve(false);
    if (p.type === "http") {
        return new Promise((resolve) => {
            const req = http.get({ host: p.host, port: p.port, path: p.path || "/", timeout: to }, (res) => { res.resume(); resolve(res.statusCode >= 200 && res.statusCode < 500); });
            req.on("error", () => resolve(false));
            req.on("timeout", () => { try { req.destroy(); } catch {} resolve(false); });
        });
    }
    // process presence check (macOS/Linux: pgrep; Windows: tasklist)
    if (p.type === "process") {
        return new Promise((resolve) => {
            const name = p.name || "";
            const cmd = WIN
                ? `tasklist /FI "IMAGENAME eq ${name}.exe" /NH`
                : `pgrep -x "${name}"`;
            require("child_process").exec(cmd, { timeout: 3000, windowsHide: true }, (err, stdout) => {
                if (WIN) resolve(!err && stdout.toLowerCase().includes(name.toLowerCase()));
                else resolve(!err && stdout.trim().length > 0);
            });
        });
    }
    // tcp connect = server listening
    return new Promise((resolve) => {
        const sock = net.connect({ host: p.host, port: p.port }, () => { sock.end(); resolve(true); });
        sock.setTimeout(to, () => { try { sock.destroy(); } catch {} resolve(false); });
        sock.on("error", () => resolve(false));
    });
}

async function statusOne(id) {
    const svc = SERVICES[id]; if (!svc) return { id, ok: false, error: "unknown service" };
    const binPath = await resolveBinAsync(svc);
    const running = await probe(svc);
    const c = load();
    // v1977 — a service we STARTED and is still alive counts as running even if the process-name probe
    // can't see it (node-hosted helpers like `dictate` show up as "node", not their script name).
    const managedAlive = !!(_children[id] && !_children[id].killed);
    return { id, ok: true, label: svc.label, note: svc.note, winget: svc.winget, port: svc.probe && svc.probe.port, onPath: !!binPath, binPath, running: running || managedAlive, autostart: !!(c[id] && c[id].autostart), managedPid: managedAlive ? _children[id].pid : null, platform: process.platform };
}
// v1807 — was a sequential await loop over every service, each doing a network/process
// probe (1.2s http/tcp timeout, 3s process timeout). With 8+ services that's up to
// ~10s of serial probing, which blocked the Node event loop long enough that OTHER
// routes competing for it (e.g. /github/peer-config, also hit by the Settings panel)
// timed out at 5s even though they're individually instant. Fixed: probe all services
// in PARALLEL via Promise.all so the whole call takes ~one probe-timeout, not the sum.
async function statusAll() {
    const ids = Object.keys(SERVICES);
    // v1809 — hard 4s overall ceiling. Each statusOne is now fully async (non-blocking
    // bin lookup + probe), so all 9 overlap and should finish in ~1-2s; the ceiling is a
    // belt-and-suspenders guard so a single pathological probe can never make the whole
    // /bgsvc/status route exceed the client's timeout. Services not resolved by the
    // deadline are reported as unknown rather than blocking the response.
    const perSvc = ids.map((id) => statusOne(id).catch((e) => ({ id, ok: false, error: String(e && e.message || e) })));
    const withCeiling = Promise.race([
        Promise.all(perSvc),
        new Promise((resolve) => setTimeout(() => resolve(null), 4000)),
    ]);
    const results = await withCeiling;
    const out = {};
    if (results) {
        ids.forEach((id, i) => { out[id] = results[i]; });
    } else {
        // timed out — return whatever each promise has settled to, falling back to a stub
        for (const id of ids) out[id] = { id, ok: true, label: (SERVICES[id] && SERVICES[id].label) || id, running: false, onPath: false, pending: true };
        await Promise.allSettled(perSvc).then((settled) => {
            settled.forEach((s, i) => { if (s.status === "fulfilled" && s.value) out[ids[i]] = s.value; });
        });
    }
    return { ok: true, services: out };
}

let _install = null;
// v1989 — GitHub Releases installer: fills the winget gap (Windows-only) and covers
// the catalog's GitHub-native tools (lazydocker, netbird, llama-server, ...) on Mac
// and Linux too. Opt-in per entry via `github: "owner/repo"` (+ optional `ghAsset`).
const githubInstall = require("./githubInstall.js");
function toolsDir() { return path.join(os.homedir(), ".swek", "tools"); }
function installGithub(id, opts = {}) {
    const svc = SERVICES[id];
    if (!svc) return Promise.resolve({ ok: false, error: "unknown service" });
    if (!svc.github) return Promise.resolve({ ok: false, error: svc.label + " has no github repo to install from" });
    if (_install && _install.running) return Promise.resolve({ ok: false, error: "an install is already running" });
    _install = { id, running: true, via: "github" };
    return githubInstall.installFromGithub(id, svc, { token: opts.token, toolsDir: toolsDir() })
        .then(r => { _install = null; return r; })
        .catch(e => { _install = null; return { ok: false, error: String((e && e.message) || e) }; });
}
// v1989 — prefer a GitHub-installed binary when the catalog resolveBin can't find one.
function _githubBin(id) { try { return githubInstall.installedBin(id, toolsDir()); } catch { return null; } }
function install(id) {
    const svc = SERVICES[id]; if (!svc) return Promise.resolve({ ok: false, error: "unknown service" });
    if (!WIN) return Promise.resolve({ ok: false, error: "winget install is Windows-only. Install " + svc.label + " from its site / your package manager." });
    if (_install && _install.running) return Promise.resolve({ ok: false, error: "an install is already running" });
    return new Promise((resolve) => {
        _install = { id, running: true };
        const cmd = "winget install --id " + svc.winget + " -e --source winget --accept-package-agreements --accept-source-agreements --disable-interactivity";
        let child; let out = "";
        try { child = spawn(cmd, [], { shell: true, windowsHide: true }); }
        catch (e) { _install = null; return resolve({ ok: false, error: "spawn failed: " + String((e && e.message) || e) }); }
        child.stdout && child.stdout.on("data", d => out += d);
        child.stderr && child.stderr.on("data", d => out += d);
        child.on("close", (code) => { _install = null; const okWords = /successfully installed|already installed/i.test(out); resolve({ ok: code === 0 || okWords, code, output: out.slice(-3000) }); });
        child.on("error", (e) => { _install = null; resolve({ ok: false, error: String((e && e.message) || e) }); });
    });
}

// v1989 — pick the best installer automatically: winget on Windows when the entry has
// a winget id, otherwise (Mac/Linux, or a github-native tool) install from GitHub
// Releases. Falls back winget->github and vice-versa so one path missing isn't fatal.
function installSmart(id, opts = {}) {
    const svc = SERVICES[id];
    if (!svc) return Promise.resolve({ ok: false, error: "unknown service" });
    const canWinget = WIN && svc.winget;
    const canGithub = !!svc.github;
    if (canWinget) {
        return install(id).then(r => (r && r.ok) ? r : (canGithub ? installGithub(id, opts) : r));
    }
    if (canGithub) return installGithub(id, opts);
    if (svc.dockerImage) return Promise.resolve({ ok: false, error: svc.label + " installs via Docker — use the Docker install button", needsDocker: true });
    return Promise.resolve({ ok: false, error: WIN ? (svc.label + " has no winget id or github repo") :
        ("On " + process.platform + ", install " + svc.label + " from its site/package manager (" + (svc.url || svc.github || "") + ")") });
}

function start(id) {
    const svc = SERVICES[id]; if (!svc) return { ok: false, error: "unknown service" };
    if (_children[id] && !_children[id].killed) return { ok: true, already: true, pid: _children[id].pid };
    const bin = resolveBin(svc);
    if (!bin) return { ok: false, error: svc.label + " not found — install it first" };
    try {
        const child = spawn(bin, svc.serve || [], { windowsHide: true, stdio: "ignore", detached: false });
        _children[id] = child;
        child.on("exit", () => { if (_children[id] === child) delete _children[id]; });
        return { ok: true, pid: child.pid, binPath: bin };
    } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}
function stop(id) { const c = _children[id]; if (c) { try { c.kill(); } catch {} delete _children[id]; return { ok: true }; } return { ok: true, note: "not started by the engine" }; }

// v1824 — run a Docker-based service's install (e.g. Nextcloud). Honest about the one
// hard dependency the engine can't conjure: Docker itself must be installed + running.
// Flow: check `docker` is on PATH and the daemon answers → if a container with the
// service name already exists, `docker start` it (don't error on re-install) → else run
// the service's `docker run` command. Reports the container id or a clear, actionable error.
let _dockerInstall = null;
// v1828 — resolve the `docker` binary WITHOUT relying on PATH. When the bridge launches
// from a GUI/login-less context on macOS (the Mac launcher, nohup, osascript, launchd),
// it inherits a minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin) that does NOT include where
// Docker Desktop puts its CLI (/usr/local/bin, /opt/homebrew/bin, or inside Docker.app).
// So `which docker` / bare `execFile("docker")` fail and we wrongly report "not installed".
// Fix: check the real install locations on disk, then fall back to PATH lookup.
let _dockerBinCache = null;
function _dockerCandidates() {
    if (WIN) return [
        "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe",
    ];
    if (MAC) return [
        "/usr/local/bin/docker",
        "/opt/homebrew/bin/docker",
        "/Applications/Docker.app/Contents/Resources/bin/docker",
    ];
    return ["/usr/bin/docker", "/usr/local/bin/docker", "/snap/bin/docker"];
}
function resolveDocker() {
    if (_dockerBinCache && fs.existsSync(_dockerBinCache)) return Promise.resolve(_dockerBinCache);
    return new Promise((resolve) => {
        for (const p of _dockerCandidates()) { try { if (fs.existsSync(p)) { _dockerBinCache = p; return resolve(p); } } catch {} }
        // fall back to PATH (covers custom installs / docker on PATH)
        execFile(WIN ? "where" : "which", ["docker"], { timeout: 3000, windowsHide: true }, (err, out) => {
            const hit = !err && String(out || "").trim().split(/\r?\n/)[0].trim();
            if (hit) { _dockerBinCache = hit; return resolve(hit); }
            resolve(null);
        });
    });
}
// v1829 — OS version detection, so we can warn when Docker Desktop's minimum macOS isn't met
// (the real blocker the user hit: Docker Desktop needs macOS 14 Sonoma+, they were on macOS 12).
// Web-verified: current Docker Desktop requires macOS Sonoma (14)+; Colima works on older macOS.
let _osCache = null;
function osInfo() {
    if (_osCache) return _osCache;
    const os = require("os");
    let version = "", name = process.platform;
    try {
        if (MAC) { const { execFileSync } = require("child_process"); version = String(execFileSync("sw_vers", ["-productVersion"], { timeout: 3000 })).trim(); name = "macOS"; }
        else if (WIN) { version = String(os.release() || ""); name = "Windows"; }
        else { version = String(os.release() || ""); name = "Linux"; }
    } catch (e) {}
    const major = parseInt(String(version).split(".")[0], 10) || 0;
    // Docker Desktop minimums: macOS 14 (Sonoma). Windows 10/11. Linux uses native engine.
    let dockerDesktopOK = true, dockerDesktopReason = "";
    if (MAC && major && major < 14) { dockerDesktopOK = false; dockerDesktopReason = "Docker Desktop requires macOS 14 (Sonoma) or newer. You're on macOS " + version + "."; }
    _osCache = { ok: true, platform: process.platform, name, version, major, dockerDesktopOK, dockerDesktopReason,
        // the alternative that works on older macOS: Colima provides the Docker runtime in a small VM.
        colimaSuggested: MAC && !dockerDesktopOK };
    return _osCache;
}
async function _hasDocker() {
    const bin = await resolveDocker();
    if (!bin) return { ok: false, reason: "not-installed", detail: "docker binary not found in PATH or standard install locations" };
    return await new Promise((resolve) => {
        execFile(bin, ["info", "--format", "{{.ServerVersion}}"], { timeout: 5000, windowsHide: true }, (err, stdout) => {
            if (err) { resolve({ ok: false, reason: "daemon-down", bin, detail: String(err.message || err).slice(0, 200) }); return; }
            resolve({ ok: true, version: String(stdout || "").trim(), bin });
        });
    });
}

// v1827 — rich Docker status for pre-detection in the UI. Distinguishes three real states:
//  - "ready"          : CLI present AND daemon answering -> can install/run containers now
//  - "installed-stopped": CLI present but daemon down -> Docker Desktop installed but NOT
//                       launched yet (the exact case after a fresh `brew install --cask docker`).
//  - "not-installed"  : no docker CLI at all.
// Checks the CLI binary separately from the daemon so "installed but not launched" is detected
// (docker info fails the same way whether absent or down; the binary check disambiguates).
async function dockerProbe() {
    const cliBin = await resolveDocker();
    const cliPresent = !!cliBin;
    const os = osInfo();
    const dk = await _hasDocker();
    if (dk.ok) return { ok: true, state: "ready", installed: true, running: true, version: dk.version, bin: dk.bin, os };
    if (cliPresent) return { ok: true, state: "installed-stopped", installed: true, running: false, bin: cliBin, os,
        hint: MAC ? "Docker is installed but not running. Launch Docker Desktop (the engine can do it below), wait for it to say \u2018running\u2019, then install Nextcloud."
                  : (WIN ? "Docker is installed but not running. Start Docker Desktop, then install Nextcloud."
                         : "Docker is installed but the daemon isn't running. Start it (sudo systemctl start docker), then install Nextcloud.") };
    // not installed — if this macOS is too old for Docker Desktop, say so and point to Colima.
    if (!os.dockerDesktopOK) {
        return { ok: true, state: "not-installed", installed: false, running: false, os, incompatible: true, colimaSuggested: true,
            hint: os.dockerDesktopReason + " Use Colima instead (a lightweight Docker runtime that works on older macOS): the engine can install it below." };
    }
    return { ok: true, state: "not-installed", installed: false, running: false, os,
        hint: "Docker isn't installed. Install it first, then install Nextcloud." };
}

// v1869 — WSL container (wslc) detection. Windows-only. Microsoft shipped `wslc.exe` in WSL 2.9.3+
// (public preview, June 2026) as a native Linux-container runtime — a no-Docker-Desktop path with
// GPU passthrough. Detect the binary, its version, and the underlying WSL version (needs 2.9.3+).
// container.exe is an alias for wslc. Web-verified: `wsl --update --pre-release` installs it;
// `wslc --version` reports it (e.g. "wslc 2.9.3.0").
function _wslcCandidates() {
    // wslc.exe lands on PATH; also check the System32 lxss location where WSL binaries live.
    const sys = process.env.SystemRoot || "C:\\Windows";
    return [
        path.join(sys, "System32", "wslc.exe"),
        path.join(sys, "System32", "lxss", "wslc.exe"),
    ];
}
function _resolveWslc() {
    return new Promise((resolve) => {
        for (const p of _wslcCandidates()) { try { if (fs.existsSync(p)) return resolve(p); } catch {} }
        execFile("where", ["wslc"], { timeout: 3000, windowsHide: true }, (err, out) => {
            const hit = !err && String(out || "").trim().split(/\r?\n/)[0].trim();
            resolve(hit || null);
        });
    });
}
function _cmdVersion(bin, args) {
    return new Promise((resolve) => {
        execFile(bin, args || ["--version"], { timeout: 6000, windowsHide: true }, (err, out, errout) => {
            if (err && !out && !errout) return resolve("");
            resolve(String(out || errout || "").trim().replace(/\r?\n/g, " ").slice(0, 120));
        });
    });
}
// parse a dotted version (e.g. "2.9.3.0" or "WSL version: 2.9.3.0") into [major,minor,patch].
function _parseVer(s) {
    const m = /(\d+)\.(\d+)\.(\d+)/.exec(String(s || ""));
    return m ? [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)] : null;
}
function _verAtLeast(v, a, b, c) {
    if (!v) return false;
    if (v[0] !== a) return v[0] > a;
    if (v[1] !== b) return v[1] > b;
    return v[2] >= c;
}
async function wslcProbe() {
    if (!WIN) return { ok: true, platform: process.platform, supported: false, installed: false,
        reason: "WSL containers (wslc) are Windows-only.", hint: "This is a Windows feature. On Mac/Linux use Docker/Colima instead." };
    const bin = await _resolveWslc();
    // WSL version (whether or not wslc is present yet) — needs 2.9.3+ for the container feature.
    const wslVerRaw = await _cmdVersion("wsl", ["--version"]);
    const wslVer = _parseVer(wslVerRaw);
    const wslOldEnough = _verAtLeast(wslVer, 2, 9, 3);
    if (!bin) {
        return { ok: true, platform: "windows", supported: true, installed: false, running: false,
            wslVersion: wslVerRaw || "(unknown)", wslOldEnough,
            state: "not-installed",
            hint: wslVer && !wslOldEnough
                ? ("WSL " + (wslVerRaw || "") + " is older than 2.9.3 (needed for containers). Update with:  wsl --update --pre-release")
                : "wslc not found. WSL containers ship in the pre-release WSL. Install with:  wsl --update --pre-release  (then reopen a terminal so wslc.exe is on PATH).",
            installCmd: "wsl --update --pre-release" };
    }
    const wslcVerRaw = await _cmdVersion(bin, ["--version"]);
    return { ok: true, platform: "windows", supported: true, installed: true, running: true,
        bin, version: wslcVerRaw || "(installed)", wslVersion: wslVerRaw || "", wslOldEnough,
        state: "ready",
        preview: true,
        hint: "wslc is installed. It's a public-preview feature (GA targeted fall 2026) with no Docker Compose support yet \u2014 fine for single containers + GPU workloads. Try:  wslc run --rm hello-world" };
}

// v1827 — launch Docker Desktop (Mac/Windows). On Mac `open -a Docker`; on Windows start the
// Docker Desktop exe. Returns immediately — the daemon takes ~15-40s to come up after launch,
// so the UI should poll dockerProbe() until state flips to "ready".
function dockerStart() {
    return new Promise((resolve) => {
        if (MAC) {
            execFile("open", ["-a", "Docker"], { timeout: 8000 }, (err) => {
                if (err) return resolve({ ok: false, error: "couldn't launch Docker Desktop: " + String(err.message || err).slice(0, 200) + " (open it manually from Applications)" });
                resolve({ ok: true, launching: true, note: "Docker Desktop launching \u2014 it takes ~30s to start its engine. This panel will detect it." });
            });
        } else if (WIN) {
            // Docker Desktop default install path; fall back to a PATH lookup via `start`.
            const exe = "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe";
            try { const c = spawn("cmd", ["/c", "start", "", exe], { windowsHide: true, detached: true }); c.unref(); resolve({ ok: true, launching: true, note: "Docker Desktop launching \u2014 give it ~30s." }); }
            catch (e) { resolve({ ok: false, error: "couldn't launch Docker Desktop \u2014 start it from the Start menu." }); }
        } else {
            // Linux: try to start the daemon (needs sudo/systemd; may not be permitted unattended).
            execFile("sh", ["-c", "sudo systemctl start docker"], { timeout: 10000 }, (err) => {
                if (err) return resolve({ ok: false, error: "couldn't start the docker daemon (needs sudo). Run: sudo systemctl start docker" });
                resolve({ ok: true, launching: true, note: "docker daemon starting\u2026" });
            });
        }
    });
}
// v1855 — Docker uninstall / cleanup. Two-part, deliberately conservative:
//  (a) dockerUninstallInfo(): report what's actually on disk (the Docker.app, its bundled
//      uninstaller, Colima) so the UI can show the user what will be removed BEFORE they commit,
//      plus the exact sudo cleanup lines they can copy-paste (the engine never runs sudo itself).
//  (b) dockerUninstall(): run Docker's OWN official uninstaller at
//      /Applications/Docker.app/Contents/MacOS/uninstall (the safe, supported path that undoes what
//      the app set up), then move Docker.app to the Trash. Non-sudo, non-destructive to anything else.
// On macOS 12 (this box) Docker Desktop can't fully install anyway, so this mostly cleans up a
// partial/failed install. The peer list already filters the 172.17.x Docker bridge IP regardless.
const _MAC_DOCKER_APP = "/Applications/Docker.app";
const _MAC_DOCKER_UNINSTALLER = "/Applications/Docker.app/Contents/MacOS/uninstall";
function _existsSafe(p) { try { return fs.existsSync(p); } catch { return false; } }
async function dockerUninstallInfo() {
    const os = osInfo();
    if (WIN) {
        const app = _existsSafe("C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe");
        return { ok: true, platform: "windows", appPresent: app,
            canAutoUninstall: false,
            note: app ? "Docker Desktop is installed. On Windows, uninstall it from Settings \u2192 Apps \u2192 Docker Desktop \u2192 Uninstall (the engine doesn't remove Windows apps for you)."
                      : "No Docker Desktop found in the default install location.",
            manual: ["Settings \u2192 Apps \u2192 Installed apps \u2192 Docker Desktop \u2192 Uninstall",
                     "Then, in PowerShell (admin), remove leftovers if any: Remove-Item \"$env:USERPROFILE\\.docker\" -Recurse -Force -ErrorAction SilentlyContinue"] };
    }
    if (MAC) {
        const app = _existsSafe(_MAC_DOCKER_APP);
        const uninstaller = _existsSafe(_MAC_DOCKER_UNINSTALLER);
        let colima = false; try { colima = !!(await new Promise(r => execFile("which", ["colima"], { timeout: 3000 }, (e, o) => r(!e && String(o||"").trim())))); } catch {}
        return { ok: true, platform: "macos", osVersion: os.version, appPresent: app, uninstallerPresent: uninstaller, colimaPresent: colima,
            canAutoUninstall: app && uninstaller,
            note: app ? (uninstaller ? "Docker.app is present. The engine can run Docker's own uninstaller, then move the app to the Trash."
                                     : "Docker.app is present but its bundled uninstaller is missing (a partial install). Drag Docker.app to the Trash, then run the cleanup lines below.")
                      : (colima ? "No Docker.app, but Colima is installed. Remove it with: colima stop && colima delete, then: brew uninstall colima (if installed via Homebrew)."
                                : "No Docker.app and no Colima found. There may still be leftover CLI symlinks or config \u2014 the cleanup lines below remove those."),
            // sudo lines the engine will NOT run itself — surfaced for the user to paste into Terminal.
            manual: [
                "# after the app uninstaller runs, clear any leftovers (Terminal):",
                "rm -rf ~/.docker ~/Library/Group\\ Containers/group.com.docker ~/Library/Containers/com.docker.docker",
                "rm -rf ~/Library/Application\\ Support/Docker\\ Desktop ~/Library/Caches/com.docker.docker",
                "sudo rm -f /usr/local/bin/docker /usr/local/bin/docker-compose /usr/local/bin/com.docker.cli",
                "sudo rm -f /Library/PrivilegedHelperTools/com.docker.vmnetd /Library/LaunchDaemons/com.docker.vmnetd.plist",
                "# if you used Colima: colima stop && colima delete"
            ] };
    }
    // linux
    return { ok: true, platform: "linux", canAutoUninstall: false,
        note: "On Linux, remove Docker with your package manager (the engine doesn't run sudo package removals).",
        manual: ["sudo apt-get purge docker-ce docker-ce-cli containerd.io   # (Debian/Ubuntu)",
                 "sudo rm -rf /var/lib/docker /var/lib/containerd", "rm -rf ~/.docker"] };
}
function dockerUninstall() {
    return new Promise((resolve) => {
        if (!MAC) return resolve({ ok: false, error: "Auto-uninstall is macOS-only. See dockerUninstallInfo().manual for your platform." });
        if (!_existsSafe(_MAC_DOCKER_APP)) return resolve({ ok: false, error: "No Docker.app found in /Applications \u2014 nothing to uninstall. (Leftover CLI/config, if any, is in the manual cleanup lines.)" });
        _dockerBinCache = null;   // invalidate cached bin path
        const finishByTrashing = () => {
            // move the app bundle to the Trash via Finder (no sudo, reversible from the Trash).
            const osa = 'tell application "Finder" to delete POSIX file "' + _MAC_DOCKER_APP + '"';
            execFile("osascript", ["-e", osa], { timeout: 15000 }, (e2) => {
                if (e2) return resolve({ ok: true, ranUninstaller: true, appTrashed: false,
                    note: "Docker's uninstaller ran. Couldn't move Docker.app to the Trash automatically (it may need Finder permission) \u2014 drag /Applications/Docker.app to the Trash manually. Then run the cleanup lines.", needsManualTrash: true });
                resolve({ ok: true, ranUninstaller: true, appTrashed: true,
                    note: "Docker uninstalled: ran the official uninstaller and moved Docker.app to the Trash. Run the leftover-cleanup lines (some need sudo) to remove CLI symlinks + config. The 172.17.x bridge IP disappears once Docker's networking is gone." });
            });
        };
        if (_existsSafe(_MAC_DOCKER_UNINSTALLER)) {
            // Docker's own uninstaller. It may prompt for admin in a GUI; --uninstall runs non-interactively where supported.
            execFile(_MAC_DOCKER_UNINSTALLER, [], { timeout: 90000 }, (err) => {
                // even if the uninstaller returns non-zero (e.g. daemon not running), proceed to trash the bundle.
                finishByTrashing();
            });
        } else {
            // partial install: no bundled uninstaller. Just trash the app; cleanup lines handle the rest.
            finishByTrashing();
        }
    });
}
async function dockerInstall(id) {
    const svc = SERVICES[id];
    if (!svc) return { ok: false, error: "unknown service" };
    if (!svc.dockerImage && !/^docker\s+run/i.test(svc.installCmd || "")) {
        return { ok: false, error: svc.label + " isn't a Docker-based service — use its own installer." };
    }
    if (_dockerInstall && _dockerInstall.running) return { ok: false, error: "a docker install is already running" };

    // 1. Docker present + daemon up?
    const dk = await _hasDocker();
    if (!dk.ok) {
        if (dk.reason === "not-installed") {
            return { ok: false, needsDocker: true,
                error: "Docker isn't installed on this box. Install Docker first (Mac: Docker Desktop from docker.com/products/docker-desktop, or `brew install --cask docker`; Linux: your package manager), start it, then click Install again." };
        }
        return { ok: false, needsDocker: true,
            error: "Docker is installed but the daemon isn't running. Start Docker Desktop (or `sudo systemctl start docker`), then click Install again." + (dk.detail ? " [" + dk.detail + "]" : "") };
    }

    const containerName = (svc.installCmd && (svc.installCmd.match(/--name\s+(\S+)/) || [])[1]) || id;
    const DBIN = dk.bin || "docker";   // v1828 — use the resolved absolute path, not bare "docker"

    return await new Promise((resolve) => {
        _dockerInstall = { id, running: true };
        // 2. does a container with this name already exist? if so, start it rather than re-run.
        execFile(DBIN, ["ps", "-a", "--filter", "name=^/" + containerName + "$", "--format", "{{.Names}}\t{{.Status}}"], { timeout: 5000, windowsHide: true }, (err, stdout) => {
            const exists = !err && String(stdout || "").trim().length > 0;
            if (exists) {
                execFile(DBIN, ["start", containerName], { timeout: 15000, windowsHide: true }, (e2, out2) => {
                    _dockerInstall = null;
                    if (e2) return resolve({ ok: false, error: "container '" + containerName + "' exists but failed to start: " + String(e2.message || e2).slice(0, 300) });
                    resolve({ ok: true, started: true, existing: true, container: containerName, note: "existing container started", port: svc.probe && svc.probe.port });
                });
                return;
            }
            // 3. fresh run. Parse the service's docker-run command into argv (no shell — avoids injection).
            const cmd = svc.installCmd || ("docker run -d -p 8080:80 --name " + containerName + " " + svc.dockerImage);
            const parts = cmd.trim().split(/\s+/);            // ["docker","run","-d","-p","8080:80","--name","nextcloud","nextcloud"]
            if (parts[0] !== "docker") { _dockerInstall = null; return resolve({ ok: false, error: "unexpected install command: " + cmd }); }
            const args = parts.slice(1);
            execFile(DBIN, args, { timeout: 120000, windowsHide: true }, (e3, out3, err3) => {
                _dockerInstall = null;
                const outStr = String(out3 || "").trim();
                if (e3) {
                    const msg = String((err3 || e3.message || e3)).slice(0, 400);
                    // a name clash here means it raced with an existing container; surface clearly.
                    if (/is already in use|Conflict/i.test(msg)) return resolve({ ok: false, error: "a container named '" + containerName + "' already exists. Click Recheck — it may already be running — or remove it with `docker rm -f " + containerName + "`." });
                    return resolve({ ok: false, error: "docker run failed: " + msg });
                }
                resolve({ ok: true, started: true, container: containerName, containerId: outStr.slice(0, 12), note: "container started", port: svc.probe && svc.probe.port });
            });
        });
    });
}
function dockerInstallStatus() { return { ok: true, running: !!(_dockerInstall && _dockerInstall.running), id: _dockerInstall && _dockerInstall.id }; }

// v1825 — install Docker ITSELF (the prerequisite for the docker-based services above).
// Honest per-platform: Mac needs Homebrew (we run `brew install --cask docker`); Linux
// uses the official convenience script (needs sudo, runs non-interactively where it can);
// Windows uses winget. After install, Docker Desktop (Mac/Win) must be LAUNCHED once by
// the user — a GUI app the engine can start but not click through. We report that clearly.
let _dockerSetup = null;
function _hasBin(bin) {
    return new Promise((resolve) => {
        execFile(WIN ? "where" : "which", [bin], { timeout: 3000, windowsHide: true }, (err, out) => resolve(!err && String(out || "").trim().length > 0));
    });
}
async function dockerEnsure() {
    // already there?
    const dk = await _hasDocker();
    if (dk.ok) return { ok: true, already: true, version: dk.version, note: "Docker is already installed and running." };
    if (_dockerSetup && _dockerSetup.running) return { ok: false, error: "a Docker install is already running" };

    let cmd, args, needsLaunch = false, pre = null;
    if (MAC) {
        if (!(await _hasBin("brew"))) return { ok: false, needsBrew: true, error: "Installing Docker on macOS uses Homebrew, which isn't installed. Install Homebrew first (https://brew.sh), or download Docker Desktop directly from docker.com/products/docker-desktop." };
        cmd = "brew"; args = ["install", "--cask", "docker"]; needsLaunch = true;
    } else if (WIN) {
        cmd = "winget"; args = ["install", "--id", "Docker.DockerDesktop", "-e", "--source", "winget", "--accept-package-agreements", "--accept-source-agreements", "--disable-interactivity"]; needsLaunch = true;
    } else {
        // Linux — official convenience script. Needs sudo; we can't supply a password, so this
        // only completes unattended where sudo is passwordless. Otherwise it surfaces the error.
        cmd = "sh"; args = ["-c", "curl -fsSL https://get.docker.com | sudo sh"];
    }

    return await new Promise((resolve) => {
        _dockerSetup = { running: true };
        let out = "";
        let child;
        try { child = spawn(cmd, args, { windowsHide: true }); }
        catch (e) { _dockerSetup = null; return resolve({ ok: false, error: "spawn failed: " + String(e && e.message || e) }); }
        child.stdout && child.stdout.on("data", d => out += d);
        child.stderr && child.stderr.on("data", d => out += d);
        child.on("error", (e) => { _dockerSetup = null; resolve({ ok: false, error: String(e && e.message || e) }); });
        child.on("close", (code) => {
            _dockerSetup = null;
            const okWords = /successfully|already installed|cask .*installed/i.test(out);
            if (code === 0 || okWords) {
                resolve({ ok: true, installed: true, needsLaunch,
                    note: needsLaunch
                        ? "Docker installed. Now LAUNCH Docker Desktop once (open it from Applications / Start) and wait for it to say \u2018running\u2019 \u2014 then come back and install Nextcloud."
                        : "Docker installed. If the daemon isn\u2019t running yet, start it (sudo systemctl start docker), then install Nextcloud.",
                    output: out.slice(-2000) });
            } else {
                resolve({ ok: false, code, error: "Docker install exited with code " + code + (/sudo|password/i.test(out) ? " \u2014 it needs sudo/admin rights this session can\u2019t supply. Run the install in a terminal." : ""), output: out.slice(-2000) });
            }
        });
    });
}
function dockerSetupStatus() { return { ok: true, running: !!(_dockerSetup && _dockerSetup.running) }; }

// v1829 — Colima: a Docker runtime that works on OLDER macOS where Docker Desktop won't install
// (the user's macOS 12 case). Installs `colima` + the `docker` CLI via Homebrew, then `colima start`
// brings up a small Linux VM running the Docker daemon. After that, all the docker-run services work.
// Web-verified: `brew install colima docker` then `colima start` (github.com/abiosoft/colima, Jun 2026).
let _colimaSetup = null;
async function colimaEnsure() {
    if (!MAC) return { ok: false, error: "Colima setup here targets macOS." };
    if (!(await _hasBin("brew"))) return { ok: false, needsBrew: true, error: "Colima installs via Homebrew, which isn't installed. Install Homebrew first." };
    if (_colimaSetup && _colimaSetup.running) return { ok: false, error: "a Colima setup is already running" };

    const os = osInfo();
    // macOS < 13 can't use the vz backend — it MUST use QEMU. So on older macOS we also
    // install qemu and start with --vm-type qemu. (macOS 13+ can use vz; no qemu needed.)
    const needQemu = !!(os.major && os.major < 13);

    const run = (cmd, args) => new Promise((resolve) => {
        let out = "";
        let child;
        try { child = spawn(cmd, args, { windowsHide: true }); }
        catch (e) { return resolve({ code: -1, out: String(e && e.message || e) }); }
        child.stdout && child.stdout.on("data", d => out += d);
        child.stderr && child.stderr.on("data", d => out += d);
        child.on("error", (e) => resolve({ code: -1, out: out + "\n" + String(e && e.message || e) }));
        child.on("close", (code) => resolve({ code, out }));
    });

    _colimaSetup = { running: true };
    try {
        // step 1: brew install colima docker (+ qemu when needed)
        const pkgs = ["colima", "docker"].concat(needQemu ? ["qemu"] : []);
        const inst = await run("brew", ["install"].concat(pkgs));
        const instOk = inst.code === 0 || /already installed/i.test(inst.out);
        if (!instOk) {
            // the classic macOS 12 failure: brew can't compile qemu (compiler too old).
            if (needQemu && /qemu/i.test(inst.out) && /(compiler|clang|gcc|Xcode|C compiler|unsupported)/i.test(inst.out)) {
                _colimaSetup = null;
                return { ok: false, qemuFailed: true,
                    error: "Homebrew couldn't build QEMU on macOS " + os.version + " (its compiler is too old for the current QEMU formula). QEMU is required for Colima on macOS < 13. Two options: (1) install QEMU via MacPorts instead (`sudo port install qemu`, a long source compile), then this button will work; or (2) skip Docker entirely and run ownCloud oCIS as a single binary (no Docker needed).",
                    output: inst.out.slice(-1500) };
            }
            _colimaSetup = null;
            return { ok: false, error: "brew install " + pkgs.join(" ") + " failed (code " + inst.code + ").", output: inst.out.slice(-1500) };
        }

        // step 1b: when qemu is required, confirm qemu-img is actually resolvable before starting.
        if (needQemu && !(await _hasBin("qemu-img"))) {
            _colimaSetup = null;
            return { ok: false, qemuFailed: true,
                error: "QEMU still isn't on PATH (qemu-img not found) after install — on macOS " + os.version + " the Homebrew QEMU build often fails. Install QEMU via MacPorts (`sudo port install qemu`) and retry, or use the ownCloud oCIS single binary instead (no Docker needed).",
                output: "" };
        }

        // step 2: colima start — force the qemu backend on older macOS so it doesn't try vz.
        const startArgs = ["start"].concat(needQemu ? ["--vm-type", "qemu"] : []);
        const start = await run("colima", startArgs);
        _colimaSetup = null;
        _dockerBinCache = null;   // re-resolve docker now that colima provides it
        if (start.code === 0 || /done|already running/i.test(start.out)) {
            return { ok: true, note: "Colima is running" + (needQemu ? " (QEMU backend)" : "") + " and providing Docker. You can install Nextcloud / oCIS now.", output: start.out.slice(-1500) };
        }
        // qemu-img missing surfaced at start time
        if (/qemu-img not found/i.test(start.out)) {
            return { ok: false, qemuFailed: true,
                error: "Colima needs QEMU on macOS " + os.version + " but qemu-img isn't found. Install QEMU via MacPorts (`sudo port install qemu`) and retry, or use the ownCloud oCIS single binary (no Docker).",
                output: start.out.slice(-1500) };
        }
        return { ok: false, error: "Colima installed but `colima start` didn't finish cleanly (code " + start.code + "). Run `colima start" + (needQemu ? " --vm-type qemu" : "") + "` in a terminal to see details.", output: start.out.slice(-1500) };
    } catch (e) {
        _colimaSetup = null;
        return { ok: false, error: String(e && e.message || e) };
    }
}
function colimaSetupStatus() { return { ok: true, running: !!(_colimaSetup && _colimaSetup.running) }; }

// v1826 — install Homebrew (macOS), the prerequisite for the Mac Docker install.
// HONEST CAVEAT: Homebrew's official installer is interactive — it needs sudo (to create
// /opt/homebrew etc.) and normally asks you to press Return. We run it with NONINTERACTIVE=1
// to skip the Return prompt, but a background process CANNOT supply your sudo password. So
// this completes unattended only if sudo is already cached/passwordless; otherwise it returns
// the exact one-line command to paste into Terminal. We never pretend it worked when it didn't.
const BREW_INSTALL_CMD = '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"';
let _brewSetup = null;
async function brewEnsure() {
    if (!MAC) return { ok: false, error: "Homebrew install is macOS-only." };
    if (await _hasBin("brew")) return { ok: true, already: true, note: "Homebrew is already installed." };
    if (_brewSetup && _brewSetup.running) return { ok: false, error: "a Homebrew install is already running" };

    return await new Promise((resolve) => {
        _brewSetup = { running: true };
        let out = "";
        let child;
        // NONINTERACTIVE=1 skips the "press Return" gate; sudo is still required for dir creation.
        try { child = spawn("/bin/bash", ["-c", '$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)'], { windowsHide: true, env: Object.assign({}, process.env, { NONINTERACTIVE: "1" }) }); }
        catch (e) { _brewSetup = null; return resolve({ ok: false, error: "spawn failed: " + String(e && e.message || e), manualCmd: BREW_INSTALL_CMD }); }
        child.stdout && child.stdout.on("data", d => out += d);
        child.stderr && child.stderr.on("data", d => out += d);
        child.on("error", (e) => { _brewSetup = null; resolve({ ok: false, error: String(e && e.message || e), manualCmd: BREW_INSTALL_CMD }); });
        child.on("close", (code) => {
            _brewSetup = null;
            const okWords = /Installation successful|already installed|Homebrew is now/i.test(out);
            if (code === 0 || okWords) {
                resolve({ ok: true, installed: true,
                    note: "Homebrew installed. You may need to add it to your PATH (the installer prints the two `eval` lines for ~/.zprofile). Then install Docker.",
                    output: out.slice(-2000) });
            } else {
                const needsPw = /sudo|password|Need sudo|not allowed/i.test(out);
                resolve({ ok: false, code, needsTerminal: needsPw,
                    error: needsPw
                        ? "Homebrew's installer needs your admin password, which this can't supply in the background. Paste the command below into Terminal and run it there."
                        : "Homebrew install exited with code " + code + ". Paste the command below into Terminal to run it interactively.",
                    manualCmd: BREW_INSTALL_CMD, output: out.slice(-2000) });
            }
        });
    });
}
function brewSetupStatus() { return { ok: true, running: !!(_brewSetup && _brewSetup.running) }; }

function setAutostart(id, on) { if (!SERVICES[id]) return { ok: false, error: "unknown service" }; const c = load(); c[id] = c[id] || {}; c[id].autostart = !!on; save(c); return { ok: true, id, autostart: c[id].autostart }; }
async function startIfAuto() {
    const c = load(); const started = [];
    for (const id of Object.keys(SERVICES)) {
        if (c[id] && c[id].autostart) { if (!(await probe(SERVICES[id]))) { const r = start(id); if (r.ok && r.pid) started.push(id); } }
    }
    return { ok: true, started };
}

// v1791 — return static metadata for a service (url, github, installCmd, note)
function meta(id) {
    const svc = SERVICES[id];
    if (!svc) return { ok: false, error: "unknown service: " + id };
    return { ok: true, id, label: svc.label, url: svc.url || null, github: svc.github || null, installCmd: svc.installCmd || null, note: svc.note || "", macOnly: !!svc.macOnly, docsUrl: svc.docsUrl || null, binaryNote: svc.binaryNote || null, composeOnly: !!svc.composeOnly };
}

module.exports = { statusAll, statusOne, install, installGithub, installSmart, start, stop, setAutostart, startIfAuto, SERVICES, meta, dockerInstall, dockerInstallStatus, dockerEnsure, dockerSetupStatus, brewEnsure, brewSetupStatus, dockerProbe, dockerStart, dockerUninstall, dockerUninstallInfo, dockerPs, dockerContainer, dockerLogs, wslcProbe, osInfo, colimaEnsure, colimaSetupStatus };

// v1872 — run a docker CLI subcommand and resolve { ok, out } | { ok:false, error }. Reuses the
// resolveDocker() path finder so it works even from a login-less GUI launch.
function _dockerRun(args, timeoutMs) {
    return new Promise((resolve) => {
        resolveDocker().then((bin) => {
            if (!bin) return resolve({ ok: false, error: "docker CLI not found" });
            execFile(bin, args, { timeout: timeoutMs || 12000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
                if (err) return resolve({ ok: false, error: String((stderr || err.message || err)).trim().slice(0, 400) });
                resolve({ ok: true, out: String(stdout || "") });
            });
        }).catch((e) => resolve({ ok: false, error: String(e && e.message || e) }));
    });
}

// List containers (running + stopped). Uses a JSON-lines format so we don't parse columns.
// Returns { ok, running:<n>, containers:[{ id, name, image, state, status, ports }] }.
async function dockerPs() {
    const probe = await dockerProbe();
    if (!probe || probe.state !== "ready") return { ok: false, error: (probe && probe.hint) || "Docker isn't running", state: probe && probe.state };
    const r = await _dockerRun(["ps", "-a", "--format", "{{json .}}"], 10000);
    if (!r.ok) return { ok: false, error: r.error };
    const rows = [];
    for (const line of String(r.out).split(/\r?\n/)) {
        const s = line.trim(); if (!s) continue;
        try {
            const o = JSON.parse(s);
            rows.push({
                id: (o.ID || o.Id || "").slice(0, 12),
                name: o.Names || o.Name || "",
                image: o.Image || "",
                state: (o.State || "").toLowerCase(),          // running | exited | created | paused
                status: o.Status || "",                        // "Up 3 minutes" / "Exited (0) 1 hour ago"
                ports: o.Ports || "",
            });
        } catch {}
    }
    // flag which of OUR known services each container maps to (by name)
    const known = { nextcloud: "nextcloud", ocis: "owncloud" };
    for (const c of rows) c.svc = known[c.name] || "";
    const running = rows.filter(c => c.state === "running").length;
    return { ok: true, running, count: rows.length, containers: rows };
}

// Start / stop / restart a container by name or id. action in {start, stop, restart}.
async function dockerContainer(nameOrId, action) {
    const act = String(action || "").toLowerCase();
    if (!["start", "stop", "restart"].includes(act)) return { ok: false, error: "action must be start, stop, or restart" };
    if (!nameOrId) return { ok: false, error: "container name/id required" };
    const probe = await dockerProbe();
    if (!probe || probe.state !== "ready") return { ok: false, error: (probe && probe.hint) || "Docker isn't running" };
    const r = await _dockerRun([act, String(nameOrId)], 30000);   // stop can take ~10s for graceful shutdown
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, action: act, container: String(nameOrId), out: String(r.out).trim() };
}

// Tail recent logs for a container (bounded). Handy to see why oCIS/Nextcloud didn't come up.
async function dockerLogs(nameOrId, tail) {
    if (!nameOrId) return { ok: false, error: "container name/id required" };
    const n = Math.max(1, Math.min(500, parseInt(tail, 10) || 80));
    const r = await _dockerRun(["logs", "--tail", String(n), String(nameOrId)], 10000);
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, container: String(nameOrId), logs: String(r.out).slice(-8000) };
}
