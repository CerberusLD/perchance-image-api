"""Scorer restringido: logits solo de las columnas (tokens) de los candidatos."""

import os
import sys
import time

import torch

ROOT = "/media/kevin/DISCODATOSHDD/Proyectos/PromptGenerator"
OUT = "/media/kevin/DISCODATOSHDD/Proyectos/ImageGenerator Servidor/mobile/assets/prompt_model"
sys.path.insert(0, os.path.join(ROOT, "src"))

from mdlm import MDLM, Config  # noqa: E402

blob = torch.load(os.path.join(ROOT, "artifacts/opt/model_best.pt"), map_location="cpu", weights_only=False)
cfg = Config(**blob["cfg"])
model = MDLM(cfg)
model.load_state_dict(blob["model"])
model.eval()


class Scorer(torch.nn.Module):
    """ids (B,S) + sel (N,) + cols (M,) -> logits (N,M)."""

    def __init__(self, m):
        super().__init__()
        self.m = m

    def forward(self, ids, sel, cols):
        h = self.m(ids, None)
        flat = h.reshape(-1, h.shape[-1]).index_select(0, sel)
        w = self.m.tok.weight.index_select(0, cols)
        return flat @ w.t()


sc = Scorer(model).eval()
S = cfg.max_len
B, L, M = 14, 8, 320
ids = torch.randint(0, cfg.vocab_size, (B, S), dtype=torch.long)
sel = torch.randint(0, B * S, (B * L,), dtype=torch.long)
cols = torch.randint(0, cfg.vocab_size, (M,), dtype=torch.long)
with torch.no_grad():
    ref = sc(ids, sel, cols)
print("salida:", tuple(ref.shape))

fp32 = os.path.join(OUT, "scorer.fp32.onnx")
torch.onnx.export(
    sc, (ids, sel, cols), fp32,
    input_names=["ids", "sel", "cols"], output_names=["logits"],
    dynamic_axes={
        "ids": {0: "batch", 1: "seq"},
        "sel": {0: "n"},
        "cols": {0: "m"},
        "logits": {0: "n", 1: "m"},
    },
    opset_version=17, do_constant_folding=True, dynamo=False,
)

import onnxruntime as ort  # noqa: E402
from onnxruntime.quantization import QuantType, quantize_dynamic  # noqa: E402

sess = ort.InferenceSession(fp32, providers=["CPUExecutionProvider"])
out = sess.run(None, {"ids": ids.numpy(), "sel": sel.numpy(), "cols": cols.numpy()})[0]
print("fp32 paridad:", float(abs(out - ref.numpy()).max()))

int8 = os.path.join(OUT, "scorer.int8.onnx")
quantize_dynamic(fp32, int8, weight_type=QuantType.QInt8)
s8 = ort.InferenceSession(int8, providers=["CPUExecutionProvider"])
o8 = s8.run(None, {"ids": ids.numpy(), "sel": sel.numpy(), "cols": cols.numpy()})[0]
print("int8:", round(os.path.getsize(int8) / 1e6, 1), "MB | diff:", round(float(abs(o8 - ref.numpy()).max()), 3))

a = ref.numpy()
ov = sum(len(set(a[r].argsort()[-20:].tolist()) & set(o8[r].argsort()[-20:].tolist())) for r in range(a.shape[0]))
print("solape top-20:", round(ov / (a.shape[0] * 20), 3))

feed = {"ids": ids.numpy(), "sel": sel.numpy(), "cols": cols.numpy()}
for label, s in (("fp32", sess), ("int8", s8)):
    t0 = time.time()
    for _ in range(10):
        s.run(None, feed)
    print(f"{label} scorer B=14 S=64 N=112 M=320:", round((time.time() - t0) / 10 * 1000, 1), "ms")

os.remove(fp32)
for f in ("mdlm.int8.onnx",):
    p = os.path.join(OUT, f)
    if os.path.exists(p):
        os.remove(p)
        print("eliminado", f)
print("assets:", sorted(os.listdir(OUT)))
