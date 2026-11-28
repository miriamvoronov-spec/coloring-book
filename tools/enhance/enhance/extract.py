"""Stage 1: get each page's best source pixels with PyMuPDF."""
from __future__ import annotations

import cv2
import numpy as np
import pymupdf


def page_image(doc: pymupdf.Document, index: int, vector_dpi: int = 600) -> np.ndarray:
    """BGR image of a page.

    A page that is one full-page scanned image gives back that image at its
    native resolution (no resampling). Anything else is rendered at vector_dpi.
    """
    page = doc[index]
    imgs = page.get_images(full=True)
    if len(imgs) == 1 and not page.get_drawings():
        info = doc.extract_image(imgs[0][0])
        arr = cv2.imdecode(np.frombuffer(info["image"], np.uint8), cv2.IMREAD_COLOR)
        if arr is not None:
            return arr
    pix = page.get_pixmap(dpi=vector_dpi)
    a = np.frombuffer(pix.samples, np.uint8).reshape(pix.h, pix.w, pix.n)[:, :, :3]
    return cv2.cvtColor(a, cv2.COLOR_RGB2BGR)


def thumbnail(doc: pymupdf.Document, index: int, dpi: int = 24) -> np.ndarray:
    pix = doc[index].get_pixmap(dpi=dpi)
    a = np.frombuffer(pix.samples, np.uint8).reshape(pix.h, pix.w, pix.n)[:, :, :3]
    return cv2.cvtColor(a, cv2.COLOR_RGB2BGR)
