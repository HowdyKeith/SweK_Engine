#!/usr/bin/env python3
"""SweK remote embedder -- Hugging Face Optimum + ONNX Runtime, served over HTTP for the SweK server's
embedder seam (SWEK_EMBED_URL). This is the maximum-performance backend, and it runs ANYWHERE: it selects the
fastest ONNX Runtime execution provider that's actually available and falls all the way back to CPU.

    NVIDIA GPU ....... CUDAExecutionProvider  (or TensorrtExecutionProvider)
    Windows any-GPU .. DmlExecutionProvider    (DirectML: AMD / Intel / NVIDIA)
    Apple Silicon .... CoreMLExecutionProvider
    Intel CPU/iGPU ... OpenVINOExecutionProvider
    anything ......... CPUExecutionProvider    (always present -- the guaranteed fallback)

So CUDA is preferred, never required: on a non-CUDA box this quietly runs on DirectML / CoreML / OpenVINO / CPU.
Optimum exports all-MiniLM-L6-v2 to ONNX on first run and caches it; after that it's offline.

Setup (CPU, works everywhere):   pip install "optimum[onnxruntime]" transformers
       (NVIDIA CUDA):            pip install "optimum[onnxruntime-gpu]" transformers
Run:                             python embed_service.py            # serves on :8900
Point the SweK server at it:     SWEK_EMBED_URL=http://localhost:8900/embed  node ai-bridge/server.js

Contract (matches embedModel.js): POST {text} -> {ok,embedding,model,provider,dim};
                                  POST {texts:[...]} -> {ok,embeddings,...};  GET / -> {ok,model,provider,dim}
Vectors are mean-pooled + L2-normalized, so they match transformers.js all-MiniLM sentence embeddings (same
384-d space) -- but a different model still means re-index, which the `model` tag on every vector flags.
"""
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import onnxruntime as ort
from optimum.onnxruntime import ORTModelForFeatureExtraction
from transformers import AutoTokenizer

MODEL = os.environ.get("SWEK_EMBED_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
PORT = int(os.environ.get("SWEK_EMBED_PORT", "8900"))

# Pick the best available provider; CPU is always last and always works.
_PREF = ["CUDAExecutionProvider", "TensorrtExecutionProvider", "DmlExecutionProvider",
         "CoreMLExecutionProvider", "OpenVINOExecutionProvider", "CPUExecutionProvider"]
_AVAIL = ort.get_available_providers()
PROVIDER = next((p for p in _PREF if p in _AVAIL), "CPUExecutionProvider")

_tok = AutoTokenizer.from_pretrained(MODEL)
_model = ORTModelForFeatureExtraction.from_pretrained(MODEL, export=True, provider=PROVIDER)
DIM = int(getattr(_model.config, "hidden_size", 384))


def embed(texts):
    enc = _tok(list(texts), padding=True, truncation=True, return_tensors="np")
    out = _model(**enc)
    last = out.last_hidden_state                         # (batch, tokens, dim)
    mask = enc["attention_mask"][..., None].astype(np.float32)
    summed = (last * mask).sum(axis=1)
    counts = np.clip(mask.sum(axis=1), 1e-9, None)
    vecs = summed / counts                               # mean pooling
    vecs = vecs / np.clip(np.linalg.norm(vecs, axis=1, keepdims=True), 1e-9, None)  # L2 normalize
    return vecs.astype(np.float32).tolist()


class Handler(BaseHTTPRequestHandler):
    def _send(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self._send({"ok": True, "model": MODEL, "provider": PROVIDER, "dim": DIM})

    def do_POST(self):
        try:
            n = int(self.headers.get("Content-Length", 0) or 0)
            o = json.loads(self.rfile.read(n) or "{}")
            if isinstance(o.get("texts"), list):
                self._send({"ok": True, "embeddings": embed(o["texts"]), "model": MODEL, "provider": PROVIDER, "dim": DIM})
            else:
                self._send({"ok": True, "embedding": embed([o.get("text", "")])[0], "model": MODEL, "provider": PROVIDER, "dim": DIM})
        except Exception as e:  # noqa: BLE001 -- report any failure to the caller
            self._send({"ok": False, "error": str(e)}, 400)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    print(f"[embed] Optimum/ONNX ready: {MODEL} on {PROVIDER} (dim {DIM}); available: {_AVAIL}")
    print(f"[embed] serving http://0.0.0.0:{PORT}/embed")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
