"""Stage 2: classify pages as cover / coloring / solution / extra.

Works on small renders so the whole book takes seconds. The result is a
suggestion: the QA report shows it and the user confirms or fixes it.
"""
from __future__ import annotations

import cv2
import numpy as np

KINDS = ("front_cover", "coloring", "solution", "back_cover", "extra")


def features(bgr_small: np.ndarray) -> dict:
    hsv = cv2.cvtColor(bgr_small, cv2.COLOR_BGR2HSV)
    sat = hsv[:, :, 1].astype(np.float32)
    val = hsv[:, :, 2].astype(np.float32)
    white = float(((sat < 30) & (val > 200)).mean())
    colorful = float((sat > 60).mean())
    h = bgr_small.shape[0]
    bottom = hsv[int(h * 0.94):]
    # coloured blocks in the bottom strip = legend swatches
    legend = float(((bottom[:, :, 1] > 60) | (bottom[:, :, 2] < 90)).mean())
    return {"white": round(white, 3), "colorful": round(colorful, 3), "legend": round(legend, 3)}


def classify(feats: list[dict]) -> list[str]:
    n = len(feats)
    kinds = []
    for i, f in enumerate(feats):
        if f["white"] > 0.85 and f["legend"] > 0.02 and f["colorful"] < 0.05:
            kinds.append("coloring")
        elif f["colorful"] > 0.08 and f["white"] > 0.25:
            kinds.append("solution")  # coloured pictures on a white page
        else:
            kinds.append("extra")
    # covers: first and last non-coloring pages at either end
    if kinds and kinds[0] != "coloring":
        kinds[0] = "front_cover"
    if n > 1 and kinds[-1] != "coloring":
        kinds[-1] = "back_cover"
    return kinds
