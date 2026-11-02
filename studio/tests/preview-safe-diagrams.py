"""Visual regression contact sheet for the no-overlap V9 mechanism renderer.

Run: python3 studio/tests/preview-safe-diagrams.py [optional-output.png]
No APIs, voice, paid media or remote images needed.
"""
import importlib.util
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("paper_doc", root / "scripts" / "paper_doc.py")
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)

examples = [
    ("pathways", [{"label": "पानी", "detail": "सर्दियों का तालाब"},
                  {"label": "बर्फ़", "detail": "पतली तैरती चादर"},
                  {"label": "हवा", "detail": "चादर को धकेले"},
                  {"label": "पत्थर", "detail": "ज़मीन पर लकीर"}]),
    ("mechanism", [{"label": "पतली बर्फ़", "detail": "पानी पर तैरती"},
                   {"label": "सर्दी", "detail": "बर्फ़ जमती है"},
                   {"label": "हवा", "detail": "बर्फ़ को धकेले"}]),
    ("spotlight", [{"label": "IRON OXIDE", "detail": "Explains the red water"},
                   {"label": "SALTWATER", "detail": "Flows from glacier"},
                   {"label": "RUSTY RED", "detail": "Visible color"}]),
    ("contrast", [{"label": "SALTWATER", "detail": "Flows from ice"},
                  {"label": "IRON OXIDE", "detail": "Tints the water"}]),
]

output = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "samples" / "qa-diagram-layout-v9.png"
tile_w, tile_h = 405, 720
sheet = Image.new("RGB", (tile_w * 3, tile_h * len(examples)), (245, 246, 247))
for row, (style, nodes) in enumerate(examples):
    for col, mode in enumerate(("white", "black", "random")):
        bg = (250, 250, 248) if mode == "white" else (12, 16, 24) if mode == "black" else (197, 209, 204)
        frame = Image.new("RGBA", (engine.W, engine.H), bg + (255,))
        engine.draw_cinematic_diagram(frame,
            {"style": style, "nodes": nodes, "background_palette": mode, "dur": 2.1}, 1.92)
        thumb = frame.convert("RGB").resize((tile_w, tile_h), Image.Resampling.LANCZOS)
        ImageDraw.Draw(thumb).text((16, 16), f"{style} / {mode}",
                                   fill=(0, 0, 0) if mode == "white" else (255, 255, 255),
                                   font=ImageFont.load_default())
        sheet.paste(thumb, (tile_w * col, tile_h * row))
output.parent.mkdir(parents=True, exist_ok=True)
sheet.save(output)
print(output)
