#!/bin/bash
# paper-doc setup check: tools, Python packages, fonts. Usage: bash scripts/setup_check.sh [python]
PY="${1:-python3}"
ok=0
check() { if eval "$2" >/dev/null 2>&1; then echo "  ✓ $1"; else echo "  ✗ $1 — $3"; ok=1; fi; }
echo "paper-doc setup check"
check "macOS 14+"            '[ "$(uname)" = Darwin ] && [ "$(sw_vers -productVersion | cut -d. -f1)" -ge 14 ]' "needs a Mac on macOS 14 or newer (fonts + Apple Vision)"
check "ffmpeg / ffprobe"     'command -v ffmpeg && command -v ffprobe' "brew install ffmpeg"
check "swift (cut-outs)"     'command -v swift' "xcode-select --install"
check "python numpy + Pillow" "\"$PY\" -c 'import numpy, PIL'" "\"$PY\" -m pip install numpy pillow"
check "Futura + Menlo fonts" '[ -f /System/Library/Fonts/Supplemental/Futura.ttc ] && [ -f /System/Library/Fonts/Menlo.ttc ]' "macOS system fonts missing"
echo "optional (voice + words):"
check "pedalboard (voice polish)" "\"$PY\" -c 'import pedalboard'" "\"$PY\" -m pip install pedalboard"
check "whisper-cli (transcribe)"  'command -v whisper-cli' "brew install whisper-cpp"
check "whisper model"             '[ -f ~/.whisper-models/ggml-large-v3-turbo-q5_0.bin ]' "download ggml-large-v3-turbo-q5_0.bin to ~/.whisper-models/"
[ $ok = 0 ] && echo "ready. Next: \"$PY\" scripts/paper_doc.py selftest ./selftest" || echo "fix the ✗ lines above (optional ones only matter for voice/words)."
