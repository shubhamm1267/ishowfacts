"""Segment a source photo and ground animation anchors in its opaque silhouette.

Input: image.jpg result.png [anchor-spec.json]. Output: result.bbox.json.
Returned anchor points stay in original-image fractions; the director remaps
them into the sprite's transparent-margin crop.
"""
import io
import json
import math
import os
import sys
from pathlib import Path

from PIL import Image, ImageFilter
from rembg import new_session, remove


def clamp(value, lo=0, hi=1):
    return max(lo, min(hi, value))


def nearest_mask_point(alpha, point, boundary=False):
    """Snap a model-estimated mouth/tail/organ onto actual visible foreground."""
    w, h = alpha.size
    cx, cy = round(clamp(point[0]) * (w - 1)), round(clamp(point[1]) * (h - 1))
    pix = alpha.load()
    radius = max(24, round(min(w, h) * 0.17))
    best, best_score = None, float("inf")
    for y in range(max(0, cy - radius), min(h, cy + radius + 1), 2):
        for x in range(max(0, cx - radius), min(w, cx + radius + 1), 2):
            if pix[x, y] < 155:
                continue
            d2 = (x - cx) ** 2 + (y - cy) ** 2
            if d2 >= best_score:
                continue
            if boundary:
                outside = any(px < 0 or py < 0 or px >= w or py >= h or pix[px, py] < 70
                              for px, py in ((x - 5, y), (x + 5, y), (x, y - 5), (x, y + 5)))
                if not outside:
                    continue
            best, best_score = (x, y), d2
    if best is None:
        return None
    distance = math.sqrt(best_score) / max(1, min(w, h))
    return (best[0] / max(1, w - 1), best[1] / max(1, h - 1)), distance


def main():
    photo, dest = map(Path, sys.argv[1:3])
    extras = sys.argv[3:]
    anchor_files = [arg for arg in extras if not arg.startswith("--")]
    requests = json.loads(Path(anchor_files[0]).read_text()) if anchor_files else {}
    trim_flag = next((arg.split("=", 1)[1] for arg in extras if arg.startswith("--edge-trim=")),
                     os.environ.get("CUTOUT_EDGE_TRIM", "0"))
    edge_trim = max(0, min(4, int(trim_flag)))
    model = os.environ.get("REMBG_MODEL", "isnet-general-use")
    try:
        session = new_session(model)
    except Exception:
        model = "u2netp"
        session = new_session(model)
    result = remove(photo.read_bytes(), session=session,
                    alpha_matting=os.environ.get("CUTOUT_ALPHA_MATTING", "0") == "1",
                    alpha_matting_foreground_threshold=230,
                    alpha_matting_background_threshold=12,
                    alpha_matting_erode_size=3)
    image = Image.open(io.BytesIO(result)).convert("RGBA")
    # A small dilation and subpixel feather preserve narrow fins, legs and antennae.
    alpha = image.getchannel("A").filter(ImageFilter.MaxFilter(3))
    if edge_trim:
        # Light studio backgrounds can leave a 1–3 px dark de-matting fringe.
        # Trim only when source QA reports an edge halo; do not erode thin fins
        # and antennae in ordinary animal photos.
        alpha = alpha.filter(ImageFilter.MinFilter(edge_trim * 2 + 1))
    alpha = alpha.filter(ImageFilter.GaussianBlur(.45))
    image.putalpha(alpha)
    bbox = alpha.point(lambda v: 255 if v > 28 else 0).getbbox()
    if not bbox:
        raise ValueError("Cutout QA: empty foreground")
    mask_fraction = sum(alpha.histogram()[60:]) / max(1, image.width * image.height)
    if not .012 <= mask_fraction <= .92:
        raise ValueError("Cutout QA: implausible foreground coverage")
    image.save(dest)
    anchors = {}
    for kind, spec in requests.items():
        if not isinstance(spec, dict) or not isinstance(spec.get("point"), list) or len(spec["point"]) != 2:
            continue
        try:
            point = [float(v) for v in spec["point"]]
        except (ValueError, TypeError):
            continue
        if not all(math.isfinite(v) for v in point):
            continue
        edge = kind in ("spray", "smoke", "spark")
        snapped = nearest_mask_point(alpha, point, boundary=edge)
        if not snapped:
            anchors[kind] = {"trusted": False}
            continue
        normalized, distance = snapped
        try:
            confidence = float(spec.get("confidence", 0))
        except (ValueError, TypeError):
            confidence = 0
        trusted = distance <= (.105 if edge else .15) and confidence >= .62
        anchor = {"point": [round(v, 5) for v in normalized],
                  "distance": round(distance, 4), "trusted": trusted}
        if edge and trusted:
            px, py = normalized[0] * image.width, normalized[1] * image.height
            vx, vy = px - (bbox[0] + bbox[2]) / 2, py - (bbox[1] + bbox[3]) / 2
            if abs(vx) + abs(vy) >= 5:
                anchor["direction"] = round(math.degrees(math.atan2(vy, vx)))
        anchors[kind] = anchor
    dest.with_suffix(".bbox.json").write_text(json.dumps({
        "source": list(image.size), "bbox": bbox, "model": model,
        "maskFraction": round(mask_fraction, 4), "anchors": anchors,
    }))


if __name__ == "__main__":
    main()
