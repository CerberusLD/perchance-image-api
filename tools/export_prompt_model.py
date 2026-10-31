"""Exporta el modelo a ONNX y genera los assets que consumirá la app Android."""

import json
import os
import re
import sys
import time

import torch

ROOT = "/media/kevin/DISCODATOSHDD/Proyectos/PromptGenerator"
OUT = "/media/kevin/DISCODATOSHDD/Proyectos/ImageGenerator Servidor/mobile/assets/prompt_model"
sys.path.insert(0, os.path.join(ROOT, "src"))

from mdlm import MDLM, Config  # noqa: E402
from enhance_template import CATEGORY, CLASS_WORDS, FALLBACK, STOP, TEMPLATE  # noqa: E402
from build_group_dataset import GROUPS  # noqa: E402

os.makedirs(OUT, exist_ok=True)
blob = torch.load(os.path.join(ROOT, "artifacts/opt/model_best.pt"), map_location="cpu", weights_only=False)
cfg = Config(**blob["cfg"])
model = MDLM(cfg)
model.load_state_dict(blob["model"])
model.eval()
print("cfg:", blob["cfg"], "| params:", model.param_count())


class Export(torch.nn.Module):
    def __init__(self, m):
        super().__init__()
        self.m = m

    def forward(self, idx):
        h = self.m(idx, None)
        return h @ self.m.tok.weight.t()


ex = Export(model).eval()
S = cfg.max_len
idx = torch.randint(0, cfg.vocab_size, (4, S), dtype=torch.long)
with torch.no_grad():
    ref = ex(idx)

fp32 = os.path.join(OUT, "mdlm.fp32.onnx")
torch.onnx.export(
    ex, (idx,), fp32,
    input_names=["ids"], output_names=["logits"],
    dynamic_axes={"ids": {0: "batch", 1: "seq"}, "logits": {0: "batch", 1: "seq"}},
    opset_version=17, do_constant_folding=True, dynamo=False,
)

import onnxruntime as ort  # noqa: E402
from onnxruntime.quantization import QuantType, quantize_dynamic  # noqa: E402

sess = ort.InferenceSession(fp32, providers=["CPUExecutionProvider"])
out = sess.run(None, {"ids": idx.numpy()})[0]
print("fp32 paridad:", float(abs(out - ref.numpy()).max()), "|", round(os.path.getsize(fp32) / 1e6, 1), "MB")

int8 = os.path.join(OUT, "mdlm.int8.onnx")
quantize_dynamic(fp32, int8, weight_type=QuantType.QInt8)
s8 = ort.InferenceSession(int8, providers=["CPUExecutionProvider"])
o8 = s8.run(None, {"ids": idx.numpy()})[0]
print("int8:", round(os.path.getsize(int8) / 1e6, 1), "MB | diff:", round(float(abs(o8 - ref.numpy()).max()), 3))

# ¿se conserva el RANKING de candidatos? (es lo único que usa la app)
def rank_corr():
    a = ref[0].numpy()
    b = o8[0]
    same = 0
    total = 0
    for pos in range(0, S, 8):
        ia = a[pos].argsort()[-20:][::-1]
        ib = b[pos].argsort()[-20:][::-1]
        same += len(set(ia.tolist()) & set(ib.tolist()))
        total += 20
    return same / total


print("solape top-20 logits int8 vs fp32:", round(rank_corr(), 3))

x = torch.randint(0, cfg.vocab_size, (14, S), dtype=torch.long).numpy()
for label, s in (("fp32", sess), ("int8", s8)):
    t0 = time.time()
    for _ in range(5):
        s.run(None, {"ids": x})
    print(f"{label} forward B=14 S={S}:", round((time.time() - t0) / 5 * 1000, 1), "ms")

os.remove(fp32)

# ---------------------------------------------------------------- tokenizer
tok = json.load(open(os.path.join(ROOT, "artifacts/tokenizer.json"), encoding="utf-8"))
m = tok["model"]
vocab = m["vocab"]
merges = [tuple(pair) if isinstance(pair, list) else tuple(pair.split(" ")) for pair in m["merges"]]
added = [
    {"id": t["id"], "content": t["content"], "special": bool(t.get("special"))}
    for t in tok.get("added_tokens", [])
]
json.dump(
    {"vocab": vocab, "merges": merges, "added": added},
    open(os.path.join(OUT, "tokenizer.json"), "w", encoding="utf-8"),
    ensure_ascii=False,
)
print("tokenizer.json:", round(os.path.getsize(os.path.join(OUT, 'tokenizer.json')) / 1e6, 2), "MB",
      "| vocab:", len(vocab), "| merges:", len(merges))

# ---------------------------------------------------------------- enhance data
json.dump(
    {
        "template": TEMPLATE,
        "fallback": FALLBACK,
        "category": CATEGORY,
        "class_words": CLASS_WORDS,
        "stop": sorted(STOP),
        "pools": {tag: list(pool) for tag, pool in GROUPS},
        "pools_order": [tag for tag, _ in GROUPS],
    },
    open(os.path.join(OUT, "enhance.json"), "w", encoding="utf-8"),
    ensure_ascii=False,
    indent=1,
)
print("enhance.json:", round(os.path.getsize(os.path.join(OUT, 'enhance.json')) / 1e3, 1), "KB",
      "| grupos:", len(GROUPS), "| candidatos:", sum(len(p) for _, p in GROUPS))
print("OK")
