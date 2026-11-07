"""Renders every narration line with the Windows SAPI voices: tts/<group>/<id>.wav (16 kHz mono) + .json word events.

Usage: python -I make_tts.py <lib dir> <tts dir>
"""
import json
import os
import subprocess
import sys

sys.path.insert(0, sys.argv[1])
import scripts  # noqa: E402

LIB, OUT = sys.argv[1], sys.argv[2]
DAVID, ZIRA = "Microsoft David Desktop", "Microsoft Zira Desktop"
IDLE = 0x00000040


def say(group, ident, text, voice, rate=0):
    d = os.path.join(OUT, group)
    os.makedirs(d, exist_ok=True)
    wav, js, txt = (os.path.join(d, f"{ident}.{e}") for e in ("wav", "json", "txt"))
    if os.path.exists(wav) and os.path.exists(js):
        return
    open(txt, "w", encoding="utf-8").write(text)
    p = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", os.path.join(LIB, "tts.ps1"),
                        "-In", txt, "-Wav", wav, "-Json", js, "-Voice", voice, "-Rate", str(rate)], capture_output=True, text=True, creationflags=IDLE)
    if p.returncode != 0:
        print("TTS failed", ident, p.stderr[-500:])


for ident, _title, _date, _film, text in scripts.DOC:
    say("doc", ident, text, DAVID, 0)
for i, line in enumerate(scripts.KINETIC):
    say("kinetic", f"k{i + 1:02d}", line, ZIRA if i % 2 else DAVID, 1)
for i, (who, line) in enumerate(scripts.PODCAST):
    say("podcast", f"p{i + 1:02d}-{who}", line, DAVID if who == "host" else ZIRA, 1)
for ident, line in scripts.MONTAGE_VO:
    say("montage", ident, line, ZIRA, 0)
for ident, line in scripts.OVERLAY_VO:
    say("overlay", ident, line, DAVID, 1)
print("tts done")
