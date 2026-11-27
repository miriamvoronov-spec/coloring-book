"""Stage 11: improve colour pages (covers) without turning them into line art."""
from __future__ import annotations

import cv2
import numpy as np


def enhance_color(bgr: np.ndarray, min_long_side: int = 4000) -> np.ndarray:
    h, w = bgr.shape[:2]
    if max(h, w) < min_long_side:  # Real-ESRGAN slot; Lanczos until it is wired in
        s = min_long_side / max(h, w)
        bgr = cv2.resize(bgr, None, fx=s, fy=s, interpolation=cv2.INTER_LANCZOS4)
    # gentle denoise of JPEG/scan grain, then local contrast and sharpening
    out = cv2.fastNlMeansDenoisingColored(bgr, None, 3, 3, 7, 21)
    lab = cv2.cvtColor(out, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l = cv2.createCLAHE(clipLimit=1.6, tileGridSize=(8, 8)).apply(l)
    out = cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)
    blur = cv2.GaussianBlur(out, (0, 0), 2.0)
    out = cv2.addWeighted(out, 1.5, blur, -0.5, 0)
    # grey-world white balance, half strength
    m = out.reshape(-1, 3).mean(0)
    gain = 1 + 0.5 * (m.mean() / np.maximum(m, 1) - 1)
    return np.clip(out * gain, 0, 255).astype(np.uint8)
