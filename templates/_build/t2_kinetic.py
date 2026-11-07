"""02 Kinetic typography: a narrated film made of words, using every text animation, unit, ease, style and caption feature."""
import glob
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(__file__))
import scripts  # noqa: E402
from tplkit import (AAC, ANIMS, EASES, FAMILIES, MP3, Proj, anim, conv, grad, hexc, kf, pick_font, rgba, text_style, tts_words)  # noqa: E402

from tplkit import WORK as ROOT  # noqa: E402
G, DL, TTS = os.path.join(ROOT, "gen"), os.path.join(ROOT, "dl"), os.path.join(ROOT, "tts")
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "out")
random.seed(5)

p = Proj("02-kinetic-typography", "02 Kinetic Typography (vertical 60 fps)", 1080, 1920, fps=(60, 1), background=(0.04, 0.04, 0.06))
W, H = p.w, p.h
f = p.f
F = lambda *n: pick_font(*n)  # noqa: E731
DISPLAY_FONTS = [x for x in ["Anton", "Bebas Neue", "Archivo Black", "Black Ops One", "Bangers", "Bungee", "Monoton", "Righteous", "Abril Fatface", "Alfa Slab One",
                             "Playfair Display", "Cinzel", "Lobster", "Pacifico", "Permanent Marker", "Caveat", "Dancing Script", "Great Vibes", "Satisfy",
                             "Orbitron", "Audiowide", "Russo One", "Press Start 2P", "VT323", "Silkscreen", "Space Mono", "Courier Prime", "Special Elite",
                             "Creepster", "Nosifer", "Butcherman", "Rye", "Shrikhand", "Titan One", "Luckiest Guy", "Boogaloo", "Fredoka", "Comfortaa",
                             "Unbounded", "Syne", "Teko", "Staatliches", "Big Shoulders Display", "Oswald", "Barlow Condensed", "Raleway", "Montserrat",
                             "Poppins", "DM Serif Display", "Yeseva One", "Major Mono Display", "Rubik Glitch", "Chewy", "Bowlby One"] if x in FAMILIES]
PALETTE = ["#ff4757", "#ffa502", "#2ed573", "#1e90ff", "#a55eea", "#ff6b81", "#eccc68", "#70a1ff", "#7bed9f", "#ff7f50", "#00d2d3", "#feca57"]
GRADS = [("#ff9a9e", "#fad0c4"), ("#a18cd1", "#fbc2eb"), ("#fbc2eb", "#a6c1ee"), ("#84fab0", "#8fd3f4"), ("#f6d365", "#fda085"), ("#5ee7df", "#b490ca"),
         ("#c3cfe2", "#f5f7fa"), ("#667eea", "#764ba2"), ("#f093fb", "#f5576c"), ("#4facfe", "#00f2fe"), ("#43e97b", "#38f9d7"), ("#fa709a", "#fee140"),
         ("#30cfd0", "#330867"), ("#ff0844", "#ffb199"), ("#0f2027", "#2c5364"), ("#141e30", "#243b55")]

BG = p.vtrack("Background", height="S")
BG2 = p.vtrack("Background video", height="S")
PIP = p.vtrack("Picture in picture", height="S")
T = [p.vtrack(f"Type {i + 1}") for i in range(14)]
STK = p.vtrack("Stickers", height="S")
CC = p.ctrack({"text": text_style(F("Poppins", "Inter"), 54, 700, stroke=(6, rgba(0, 0, 0, 0.9))), "position": "custom", "x": 0, "y": 760,
               "maxWidth": 960, "maxLines": 2, "highlight": {"mode": "colorAndScale", "color": hexc("#ffd32a"), "inactiveColor": rgba(1, 1, 1, 0.9)}})
VO = p.atrack("Voice", height="L")
MUS = p.atrack("Music")
SFX = p.atrack("Whooshes and hits")
SFX2 = p.atrack("Pops and sparkles")
KEYS = p.atrack("Typewriter keys", height="S")

# ---------------- media
vo = {i: p.add_media(conv(os.path.join(TTS, "kinetic", f"k{i + 1:02d}.wav"), f"kin-k{i + 1:02d}.wav", ["-c:a", "pcm_s16le", "-ar", "48000"]), "audio", bin="Voice")
      for i in range(len(scripts.KINETIC))}
words = {i: tts_words(os.path.join(TTS, "kinetic", f"k{i + 1:02d}.json")) for i in vo}
pulse = p.add_media(conv(os.path.join(G, "audio", "music", "pulse-100.wav"), "kin-pulse-100.m4a", AAC), "audio", bin="Music")
house = p.add_media(conv(os.path.join(G, "audio", "music", "house-128.wav"), "kin-house-128.mp3", MP3), "audio", bin="Music")
fx = {n: p.add_media(os.path.join(G, "audio", "sfx", f"{n}.wav"), "audio", bin="SFX") for n in
      ("whoosh-short", "whoosh-long", "whoosh-down", "riser", "impact", "sub-drop", "punch", "pop", "click", "sparkle", "swoosh-tick", "glitch", "ping", "countdown-beep", "long-beep")}
keys = [p.add_media(os.path.join(G, "audio", "sfx", f"type-key-{i}.wav"), "audio", bin="SFX") for i in range(1, 6)]
bgv = {n: p.add_media(os.path.join(G, "mg", f"{n}.mp4"), "video", bin="Backgrounds") for n in
       ("mg-gradient-vertical", "mg-particles-vertical", "mg-shapes-loop", "mg-light-leak", "mg-glitch-vertical", "mg-life", "mg-zoneplate")}
stock = [p.add_media(x, "video", bin="Stock") for x in sorted(glob.glob(os.path.join(DL, "stock", "*.mp4")))[:10]]
stick = {os.path.basename(x)[8:-5]: p.add_media(x, "image", bin="Stickers") for x in sorted(glob.glob(os.path.join(G, "stickers", "*.webp")))}


def slot(start, dur):
    """The lowest type track free over [start, start+dur)."""
    tr = p.any_free(T, start, dur)
    if tr is None:
        raise ValueError(f"no free type track at {start}")
    return tr


def txt(start, dur, value, style, **kw):
    return p.text(slot(start, dur), start, dur, value, style, **kw)


def sfx(start, name, gain=-8):
    m = fx[name]
    p.audio_any([SFX, SFX2], start, p.ff(p.mdur(m)), m, gain=gain, name=name)


def keyclicks(start, text, frames):
    step = max(1, frames // max(1, len(text)))
    for i, ch in enumerate(text):
        if ch.strip():
            p.audio_any([KEYS], start + i * step, 4, keys[i % 5], gain=-6, name=f"key {ch}")


bg_i = 0


def background(start, dur, kind=None):
    global bg_i
    bg_i += 1
    a, b = GRADS[bg_i % len(GRADS)]
    if kind is None:
        kind = ["grad", "grad", "video", "grad", "stock", "grad", "solid"][bg_i % 7]
    if kind == "video":
        m = list(bgv.values())[bg_i % len(bgv)]
        d = min(dur, p.ff(p.mdur(m)))
        p.video(BG2, start, d, m, fit="cover", muted=True, opacity=0.85, fades=(8, 8))
        p.solid(BG, start, dur, grad(hexc(b), hexc(a)), name="Background gradient")
    elif kind == "stock" and stock:
        m = stock[bg_i % len(stock)]
        d = min(dur, p.ff(p.mdur(m)))
        p.video(BG2, start, d, m, fit="cover", muted=True, opacity=0.45, fades=(10, 10), kf=kf(("transform.scale", [(0, p.fit_scale(m) * 1.0), (d, p.fit_scale(m) * 1.15)])))
        p.solid(BG, start, dur, rgba(0.02, 0.02, 0.03), name="Background black")
    elif kind == "solid":
        p.solid(BG, start, dur, hexc(PALETTE[bg_i % len(PALETTE)]), name="Background color")
    else:
        p.solid(BG, start, dur, grad(hexc(a), hexc(b)), name="Background gradient")


def word_times(i):
    """Frame offsets of each spoken word of line i."""
    return [(w["w"], f(w["t"] / 1000)) for w in words[i]]


# ---------------- captions (every VO line, cycling highlight modes and cue styles)
MODES = ["colorAndScale", "color", "background", "scale", "none"]


def captions_for(i, start):
    ws = words[i]
    text = scripts.KINETIC[i]
    chunks, cur = [], []
    for w in ws:
        cur.append(w)
        if len(cur) == 4:
            chunks.append(cur)
            cur = []
    if cur:
        chunks.append(cur)
    vlen = p.mdur(vo[i])
    for k, ch in enumerate(chunks):
        s = start + f(ch[0]["t"] / 1000)
        e = start + (f(chunks[k + 1][0]["t"] / 1000) if k + 1 < len(chunks) else f(vlen))
        if e - s < 4:
            continue
        seg = text[ch[0]["pos"]: ch[-1]["pos"] + ch[-1]["len"]]
        rel = []
        for j, w in enumerate(ch):
            ws_ = start + f(w["t"] / 1000) - s
            we_ = (start + f(ch[j + 1]["t"] / 1000) - s) if j + 1 < len(ch) else e - s
            rel.append({"text": w["w"], "start": ws_, "end": max(ws_ + 1, we_)})
        mode = MODES[i % len(MODES)]
        ov = None
        if mode != "colorAndScale":
            ov = {"highlight": {"mode": mode, "color": hexc(PALETTE[i % 12])}}
        if i % 7 == 3:
            ov = {**(ov or {}), "text": {"fontFamily": DISPLAY_FONTS[i % len(DISPLAY_FONTS)], "fontSize": 64}, "position": "top"}
        if i % 9 == 5:
            ov = {**(ov or {}), "position": "center", "maxWidth": 700}
        p.caption(s, e - s, seg, words=rel, override=ov)


# ---------------- scenes
def scene(i, start, length):
    line = scripts.KINETIC[i]
    wt = word_times(i)
    fnt = DISPLAY_FONTS[i % len(DISPLAY_FONTS)]
    col = hexc(PALETTE[i % 12])
    L = length
    if i == 0:
        txt(start, L, line, text_style(F("Special Elite"), 84, 400), box={"mode": "fixed", "width": 900}, anim_in=anim("typewriter", f(1.8), per="char", ease="linear"))
        keyclicks(start, line, f(1.8))
    elif i == 1:
        txt(start, L, line, text_style(F("Anton"), 160, 400, fill=col), anim_in=anim("pop", 20, ease="overshoot"), anim_out=anim("fade", 12))
        sfx(start, "pop")
    elif i == 2:
        txt(start, L, line, text_style(F("Archivo Black"), 92, 400), box={"mode": "fixed", "width": 960}, anim_in=anim("wordPop", 40, per="word", stagger=5))
        for k in range(36):  # a crowd of flying words
            w = random.choice(["word", "type", "read", "letter", "say", "text", "line", "voice", "story", "page"])
            s = start + k * 3
            d = max(10, min(L - k * 3, f(1.6)))
            y = -800 + (k * 47) % 1600
            x0, x1 = (-900, 900) if k % 2 else (900, -900)
            tr = p.any_free(T, s, d)
            if tr:
                p.text(tr, s, d, w, text_style(random.choice(DISPLAY_FONTS), 40 + (k * 7) % 60, 700, fill=rgba(1, 1, 1, 0.35)), x=x0, y=y,
                       kf=kf(("transform.x", [(0, x0, "linear"), (d, x1)])), name=f"Flying word {k}")
    elif i == 3:
        txt(start, L, "THIS IS A FILM\nMADE OF WORDS", text_style(F("Anton"), 150, 400, line_height=0.95), anim_in=anim("lineReveal", 30, per="line", stagger=10))
    elif i == 4:
        txt(start, L, line, text_style(fnt, 96, 700, fill=col), box={"mode": "fixed", "width": 900}, anim_in=anim("slideRight", 30, per="word", stagger=6, ease="easeOut"))
        sfx(start, "whoosh-short")
    elif i == 5:
        txt(start, L, line, text_style(fnt, 104, 700), box={"mode": "fixed", "width": 900}, anim_in=anim("slideDown", 36, per="word", stagger=6, ease="overshoot"))
        sfx(start, "whoosh-down")
    elif i == 6:
        txt(start, L, line, text_style(F("Bangers"), 120, 400, fill=col, stroke=(8, rgba(0, 0, 0))), box={"mode": "fixed", "width": 960},
            anim_in=anim("scaleBounce", 40, per="word", stagger=8),
            kf=kf(("transform.rotation", [(k * 12, (-4 if k % 2 else 4), "smooth") for k in range(L // 12 + 1)])))
        for w, fr in wt:
            if w.lower().startswith(("pop", "bounce")):
                sfx(start + fr, "pop", -4)
    elif i == 7:
        d = int(L * 0.8)
        txt(start, L, line, text_style(F("Courier Prime", "Special Elite"), 64, 400, align="left", anchor="top"), box={"mode": "fixed", "width": 900},
            x=-450, y=-300, anchor=(0, 0), anim_in=anim("typewriter", d, per="char", ease="linear"))
        keyclicks(start, line, d)
    elif i == 8:
        txt(start, L, line, text_style(fnt, 110, 700), anim_in=anim("fade", 4))
    elif i in (9, 10, 11):
        big = {9: ("LOUD.", F("Archivo Black"), 330), 10: ("BOLD.", F("Black Ops One"), 300), 11: ("IMPOSSIBLE\nTO IGNORE.", F("Anton"), 170)}[i]
        txt(start, L, big[0], text_style(big[1], big[2], 900, fill=col, stroke=(10, rgba(0, 0, 0)), line_height=0.9),
            anim_in=anim(["pop", "scaleBounce", "blurIn"][i - 9], 16, ease="snap"),
            kf=kf(("transform.x", [(k * 2, (-18 if k % 2 else 18) * max(0, 1 - k / 14), "snap") for k in range(16)])))
        sfx(start, "impact" if i == 9 else "punch", -3)
        if i == 11:
            p.solid(slot(start, 10), start, 10, rgba(1, 1, 1, 0.9), name="Flash", fades=(0, 8))
    elif i == 12:
        txt(start, L, line, text_style(F("Raleway"), 64, 200, fill=rgba(1, 1, 1, 0.8), spacing=4), box={"mode": "fixed", "width": 860},
            anim_in=anim("wordFade", int(L * 0.6), per="word"), anim_out=anim("fade", 40), opacity=0.8)
    elif i == 13:
        txt(start, L, "HEAVY", text_style(F("Archivo Black"), 260, 900, fill=hexc("#57606f")), y=0,
            kf=kf(("transform.y", [(0, -1200, "easeIn"), (24, 120, "overshoot"), (40, 0)])))
        txt(start + 30, L - 30, "like a stone dropped into deep water", text_style(F("Lora"), 54, 400, italic=True), y=260, anim_in=anim("fade", 20))
        sfx(start + 22, "sub-drop", -2)
    elif i == 14:
        txt(start, L, "light", text_style(F("Dancing Script"), 200, 700, fill=hexc("#f5f6fa")),
            kf=kf(("transform.y", [(0, 300, "smooth"), (L // 2, -120, "smooth"), (L, -380)]), ("transform.x", [(0, -120, "smooth"), (L // 3, 140, "smooth"), (2 * L // 3, -90, "smooth"), (L, 60)]),
                  ("transform.rotation", [(0, -12, "smooth"), (L // 2, 10, "smooth"), (L, -6)])))
        txt(start + 20, L - 20, "like a feather caught in the wind", text_style(F("Lora"), 50, 400, italic=True), y=320, anim_in=anim("blurIn", 30))
    elif i == 15:
        pieces = [("Type has a voice.", F("Inter"), 70), ("Serif", F("Playfair Display"), 130), ("or sans.", F("Inter"), 110), ("Condensed", F("Oswald", "Barlow Condensed"), 150),
                  ("or wide.", F("Unbounded", "Syne"), 90), ("Handwritten", F("Caveat"), 140), ("or machine made.", F("Space Mono"), 70)]
        for k, (w, fn, sz) in enumerate(pieces):
            s = start + wt[min(len(wt) - 1, [0, 4, 6, 8, 10, 12, 14][k])][1] if len(wt) > 14 else start + k * (L // 7)
            s = min(s, start + L - 20)
            txt(s, start + L - s, w, text_style(fn, sz, 700, fill=hexc(PALETTE[k])), y=-650 + k * 210, anim_in=anim("slideUp", 18, ease="easeOut"))
    elif i == 16:
        n = 12
        step = L // n
        for k in range(n):
            txt(start + k * step, step, "the same sentence", text_style(DISPLAY_FONTS[(k * 5) % len(DISPLAY_FONTS)], 96, 700, fill=hexc(PALETTE[k % 12])),
                name=f"Font swap {k}")
    elif i == 17:
        txt(start, L, "HUGE", text_style(F("Anton"), 200, 400, fill=col), kf=kf(("transform.scale", [(0, 1.0, "easeIn"), (L, 6.0)])))
        sfx(start, "riser", -10)
    elif i == 18:
        txt(start, L, "make it tiny.", text_style(F("Inter"), 14, 500), kf=kf(("transform.scale", [(0, 3.0, "easeOut"), (L // 2, 1.0)])))
    elif i == 19:
        txt(start, L, "S P A C E", text_style(F("Montserrat"), 90, 800, spacing=0), kf=kf(("transform.scale", [(0, 0.8, "easeOut"), (L, 1.0)])))
        txt(start + L // 3, L - L // 3, "drift apart", text_style(F("Montserrat"), 60, 300, spacing=60, case="upper"), y=200, anim_in=anim("fade", 20))
    elif i == 20:
        txt(start, L, "PULL THE LINES\nSO CLOSE\nTHEY ALMOST\nTOUCH", text_style(F("Bebas Neue"), 170, 400, line_height=0.62, fill=col), anim_in=anim("lineReveal", 30, per="line", stagger=6))
    elif i == 21:
        third = L // 3
        txt(start, third, "OUTLINE", text_style(F("Anton"), 180, 400, fill=rgba(0, 0, 0, 0), stroke=(8, hexc("#ffffff"))), anim_in=anim("pop", 12))
        txt(start + third, third, "SHADOW", text_style(F("Anton"), 180, 400, shadow=(18, 18, 0, hexc("#ff4757"))), anim_in=anim("pop", 12))
        txt(start + 2 * third, L - 2 * third, "IN A BOX", text_style(F("Anton"), 150, 400, fill=hexc("#111111"), bg=(hexc("#feca57"), 40, 20, 24, "block")), anim_in=anim("pop", 12))
    elif i == 22:
        txt(start, L, "GRADIENT", text_style(F("Archivo Black"), 200, 900, fill=grad(hexc("#ff7f50"), hexc("#1e3799"))), anim_in=anim("blurIn", 24))
        txt(start + 20, L - 20, "sunrise orange to midnight blue", text_style(F("Lora"), 54, 400, italic=True, fill=grad(hexc("#ffbe76"), hexc("#686de0"))), y=220, anim_in=anim("fade", 20))
        sfx(start, "sparkle")
    elif i == 23:
        txt(start, L, "SPIN", text_style(F("Bungee"), 220, 400, fill=col),
            kf=kf(("transform.rotation", [(0, 0, "easeInOut"), (L // 2, 360, "overshoot"), (L, 360)]), ("transform.scale", [(0, 0.3, "overshoot"), (L // 2, 1.4, "overshoot"), (L, 1.0)])))
        sfx(start, "whoosh-long", -10)
    elif i == 24:
        txt(start, L, "Line by line,\nthe paragraph\nreveals\nitself.", text_style(F("Playfair Display"), 110, 700, line_height=1.05, align="left"),
            box={"mode": "fixed", "width": 900}, anim_in=anim("lineReveal", int(L * 0.7), per="line"))
    elif i == 25:
        txt(start, L, line, text_style(F("Poppins"), 96, 800), box={"mode": "fixed", "width": 900}, anim_in=anim("wordFade", int(L * 0.7), per="word"))
    elif i == 26:
        txt(start, L, line, text_style(F("Space Mono"), 80, 700, fill=col), box={"mode": "fixed", "width": 900}, anim_in=anim("pop", int(L * 0.7), per="char", stagger=2))
    elif i == 27:
        txt(start, L, "TITLES", text_style(F("Cinzel"), 140, 700, spacing=20, fill=grad(hexc("#ffffff"), hexc("#c8d6e5"))), y=-200, preset="preset-title",
            anim_in=anim("blurIn", 30))
        txt(start + 15, L - 15, line, text_style(F("Lora"), 54, 400, italic=True), y=40, anim_in=anim("fade", 20))
    elif i == 28:
        txt(start, L, line, text_style(F("Inter"), 58, 600, bg=(rgba(0, 0, 0, 0.75), 24, 10, 8, "line")), y=600, preset="preset-subtitle", anim_in=anim("fade", 10))
    elif i == 29:
        txt(start, L, "CAPTIONS\nFOLLOW\nEVERY\nWORD", text_style(F("Poppins"), 130, 800, line_height=1.0, fill=hexc("#ffd32a")), anim_in=anim("wordPop", int(L * 0.6), per="word"))
    elif i == 30:
        nums = [w for w in wt if w[0].lower() in ("ten", "nine", "eight", "seven", "six", "five", "four", "three", "two", "one")]
        digits = {"ten": "10", "nine": "9", "eight": "8", "seven": "7", "six": "6", "five": "5", "four": "4", "three": "3", "two": "2", "one": "1"}
        for k, (w, fr) in enumerate(nums):
            end = nums[k + 1][1] if k + 1 < len(nums) else L
            txt(start + fr, max(6, end - fr), digits[w.lower()], text_style(F("Anton"), 520, 400, fill=hexc(PALETTE[k % 12])), anim_in=anim("pop", 8, ease="overshoot"))
            sfx(start + fr, "countdown-beep", -12)
    elif i == 31:
        for k, n in enumerate(["123", "4,567", "8.9", "3.14159", "1/2", "100%", "0x1F", "2026"]):
            txt(start + k * (L // 8), L - k * (L // 8), n, text_style(F("Space Mono", "Courier Prime"), 90, 700, fill=hexc(PALETTE[k])), x=-260 + (k % 2) * 520, y=-700 + k * 190,
                anim_in=anim("slideLeft" if k % 2 else "slideRight", 14))
    elif i == 32:
        hello = [(w, fr) for w, fr in wt if w.lower() in ("ciao", "hola", "bonjour", "hallo", "ola", "merhaba")]
        for k, (w, fr) in enumerate(hello):
            txt(start + fr, max(10, L - fr), w, text_style(DISPLAY_FONTS[(k * 3) % len(DISPLAY_FONTS)], 100, 700, fill=hexc(PALETTE[k])), y=-760 + k * 150, anim_in=anim("pop", 10))
        for k, w in enumerate(["こんにちは", "Привет", "Γειά σου", "مرحبا", "שלום", "你好", "안녕하세요", "नमस्ते"]):
            txt(start + 30 + k * 6, L - 30 - k * 6, w, text_style(F("Inter"), 70, 700, fill=rgba(1, 1, 1, 0.8)), x=-300 + (k % 2) * 600, y=150 + (k // 2) * 140, anim_in=anim("fade", 12))
    elif i == 33:
        for k, al in enumerate(["left", "center", "right"]):
            txt(start + k * 10, L - k * 10, f"{al.title()} aligned\ntext in a box", text_style(F("Montserrat"), 64, 700, align=al, bg=(rgba(1, 1, 1, 0.12), 20, 10, 8, "block")),
                box={"mode": "fixed", "width": 820}, y=-450 + k * 420, anim_in=anim("slideUp", 16))
    elif i == 34:
        for k, va in enumerate(["top", "middle", "bottom"]):
            txt(start + k * 10, L - k * 10, f"anchored\n{va}", text_style(F("Oswald"), 70, 600, anchor=va, bg=(hexc(PALETTE[k], 0.5), 24, 12, 12, "line")),
                x=-330 + k * 330, y=0, anim_in=anim("fade", 14), box={"mode": "fixed", "width": 300})
    elif i == 35:
        for k, (cs, label) in enumerate([("upper", "upper case shouts"), ("lower", "LOWER CASE SPEAKS SOFTLY"), ("title", "title case sits politely in between")]):
            txt(start + k * (L // 3), L - k * (L // 3), label, text_style(F("Poppins"), 72, 700, case=cs, fill=hexc(PALETTE[k + 3])), box={"mode": "fixed", "width": 900},
                y=-400 + k * 400, anim_in=anim("wordPop", 24, per="word"))
    elif i == 36:
        for k in range(28):
            d = L
            x0, y0 = random.uniform(-500, 500), random.uniform(-900, 900)
            tr = p.any_free(T, start, d)
            if not tr:
                break
            p.text(tr, start, d, random.choice(["move", "shake", "spin", "fly", "jump"]), text_style(random.choice(DISPLAY_FONTS), 60 + k % 5 * 20, 700, fill=hexc(PALETTE[k % 12])),
                   x=x0, y=y0, kf=kf(("transform.x", [(0, x0, "smooth"), (d // 2, -x0, "smooth"), (d, x0)]), ("transform.rotation", [(0, 0, "linear"), (d, 360 * (1 if k % 2 else -1))])),
                   name=f"Chaos word {k}")
    elif i == 37:
        txt(start, L, "still.", text_style(F("Playfair Display"), 180, 700, italic=True), anim_in=anim("fade", 30))
    elif i == 38:
        txt(start, L, "Breathe.", text_style(F("Raleway"), 150, 300), kf=kf(("transform.scale", [(k * 30, 1.0 if k % 2 == 0 else 1.18, "smooth") for k in range(L // 30 + 1)])))
    elif i == 39:
        for k in range(14):
            a = k / 14 * 2 * math.pi
            txt(start, L, random.choice(["go", "free", "fly", "away"]), text_style(random.choice(DISPLAY_FONTS), 90, 700, fill=hexc(PALETTE[k % 12])),
                kf=kf(("transform.x", [(0, 0, "easeOut"), (L, math.cos(a) * 1100)]), ("transform.y", [(0, 0, "easeOut"), (L, math.sin(a) * 1500)]),
                      ("opacity", [(0, 1, "easeIn"), (L, 0)])), name=f"Released word {k}")
        sfx(start, "whoosh-long", -6)
    elif i == 40:
        txt(start, L, "THIS WAS A FILM\nMADE OF WORDS", text_style(F("Anton"), 150, 400, line_height=0.95, fill=grad(hexc("#ffffff"), hexc("#a4b0be"))),
            anim_in=anim("lineReveal", 30, per="line"), anim_out=anim("fade", 30))
    else:
        txt(start, L, line, text_style(F("Playfair Display"), 100, 700), box={"mode": "fixed", "width": 900}, anim_in=anim("blurIn", 40), anim_out=anim("fade", 40))


# ---------------- interludes (music only)
def interlude(kind, start, length):
    p.marker(start, f"Interlude: {kind}", "orange")
    if kind == "font parade":
        step = max(8, length // len(DISPLAY_FONTS))
        for k, fn in enumerate(DISPLAY_FONTS):
            if k * step >= length:
                break
            txt(start + k * step, step, fn, text_style(fn, 120, 700, fill=hexc(PALETTE[k % 12])), name=f"Font {fn}")
            if k % 4 == 0:
                sfx(start + k * step, "click", -14)
    elif kind == "animation catalogue":
        for k, a in enumerate(ANIMS):
            d = length - k * 6
            txt(start + k * 6, d, a, text_style(DISPLAY_FONTS[k * 2 % len(DISPLAY_FONTS)], 76, 700, fill=hexc(PALETTE[k])), y=-840 + k * 150,
                anim_in=anim(a, 40, ease=EASES[k % 8]), anim_out=anim(ANIMS[(k + 6) % 12], 30), name=f"Anim {a}")
    elif kind == "ease catalogue":
        for k, e in enumerate(EASES):
            txt(start, length, e, text_style(F("Space Mono"), 56, 700, fill=hexc(PALETTE[k]), align="left"), x=-380, y=-700 + k * 200, anchor=(0, 0.5),
                kf=kf(("transform.x", [(0, -380, e), (length // 2, 120, e), (length, -380)])), name=f"Ease {e}")
    elif kind == "unit matrix":
        cells = [(a, u) for a in ("pop", "slideUp", "fade", "blurIn", "scaleBounce", "typewriter") for u in ("char", "word", "line")]
        step = length // 6
        for k, (a, u) in enumerate(cells):
            s = start + (k // 3) * step
            txt(s, step, f"{a} by {u}\nsecond line here", text_style(F("Poppins"), 58, 700, fill=hexc(PALETTE[k % 12])), y=-500 + (k % 3) * 500,
                anim_in=anim(a, step // 2, per=u, stagger=3 if u == "char" else 8), name=f"{a} x {u}")
    elif kind == "stroke and shadow lab":
        step = length // 12
        for k in range(12):
            st = text_style(DISPLAY_FONTS[(k * 7) % len(DISPLAY_FONTS)], 130, 800, fill=hexc(PALETTE[k]),
                            stroke=(2 + k * 2, hexc(PALETTE[(k + 5) % 12])) if k % 2 == 0 else None,
                            shadow=((k - 6) * 4, 8 + k, k * 4, rgba(0, 0, 0, 0.8)) if k % 3 != 0 else None)
            txt(start + k * step, step, f"STYLE {k + 1}", st, anim_in=anim("pop", 8))
    elif kind == "box lab":
        step = length // 8
        for k in range(8):
            mode = "line" if k % 2 else "block"
            txt(start + k * step, step, f"{mode} box\nradius {k * 10}\npadding {10 + k * 8}", text_style(F("Montserrat"), 70, 700, fill=hexc("#111111"),
                bg=(hexc(PALETTE[k]), 10 + k * 8, 6 + k * 4, k * 10, mode)), anim_in=anim("scaleBounce", 14))
    elif kind == "paragraph stress":
        para = " ".join(scripts.KINETIC * 2)
        txt(start, length, para, text_style(F("Lora"), 30, 400, align="left", line_height=1.35, anchor="top"), box={"mode": "fixed", "width": 960},
            x=-480, y=-900, anchor=(0, 0), anim_in=anim("lineReveal", int(length * 0.8), per="line"), name="Long paragraph (lineReveal per line)")
    elif kind == "credits":
        lines = ["KINETIC TYPOGRAPHY", "a Shorts Editor template", "", "VOICES", "Microsoft David and Zira (text to speech)", "", "MUSIC", "Original synthesized tracks",
                 "", "FONTS", *DISPLAY_FONTS, "", "Every animation: " + ", ".join(ANIMS), "Every ease: " + ", ".join(EASES)]
        body = "\n".join(lines)
        h = len(lines) * 56 * 1.3
        txt(start, length, body, text_style(F("Montserrat"), 48, 600, line_height=1.3), box={"mode": "fixed", "width": 960},
            kf=kf(("transform.y", [(0, H / 2 + h / 2, "linear"), (length, -H / 2 - h / 2)])), name="Credits roll")


# ---------------- timeline
p.preset("preset-title", "Doc title", text_style(F("Cinzel"), 140, 700, spacing=20), anim_in={"id": "blurIn", "durationMs": 500}, sample="TITLES", sets=["titles"], tags=["kinetic"])
p.preset("preset-subtitle", "Boxed subtitle", text_style(F("Inter"), 58, 600, bg=(rgba(0, 0, 0, 0.75), 24, 10, 8, "line")), anim_in={"id": "fade", "durationMs": 160},
         sample="Subtitles tell you what was said.", sets=["subtitles"], position=(0, 600), tags=["kinetic"])
p.preset("preset-shout", "Shout", text_style(F("Archivo Black"), 260, 900, stroke=(10, rgba(0, 0, 0))), anim_in={"id": "pop", "durationMs": 250, "ease": "overshoot"},
         anim_out={"id": "fade", "durationMs": 200}, sample="LOUD", tags=["kinetic", "big"], favorite=True)
p.preset("preset-whisper", "Whisper", text_style(F("Raleway"), 64, 200, spacing=4), anim_in={"id": "wordFade", "durationMs": 900, "perUnit": "word", "staggerMs": 120},
         sample="others whisper", tags=["kinetic"])
p.preset("preset-karaoke", "Karaoke caption", text_style(F("Poppins"), 64, 800, stroke=(6, rgba(0, 0, 0))), sets=["captions"],
         highlight={"mode": "colorAndScale", "color": hexc("#ffd32a"), "inactiveColor": rgba(1, 1, 1, 0.9)}, sample="Captions follow every word")
p.preset("preset-typewriter", "Typewriter", text_style(F("Special Elite"), 80, 400), anim_in={"id": "typewriter", "durationMs": 1500, "perUnit": "char", "ease": "linear"},
         sample="one letter at a time", tags=["kinetic"])

INTERLUDES = {4: ("font parade", 26), 9: ("animation catalogue", 30), 13: ("ease catalogue", 22), 17: ("unit matrix", 36), 21: ("stroke and shadow lab", 24),
              24: ("box lab", 24), 30: ("paragraph stress", 30), 36: ("animation catalogue", 26)}
t = 0
p.marker(0, "Start", "violet")
p.text(T[0], 0, f(3), "THE SHAPE\nOF WORDS", text_style(F("Anton"), 190, 400, line_height=0.9, fill=grad(hexc("#ffffff"), hexc("#70a1ff"))),
       anim_in=anim("lineReveal", 40, per="line", stagger=12), anim_out=anim("blurIn", 20))
background(0, f(3), "video")
sfx(0, "riser", -8)
t = f(3)
for i, line in enumerate(scripts.KINETIC):
    if i in INTERLUDES:
        kind, secs = INTERLUDES[i]
        L = f(secs)
        background(t, L, "video" if kind in ("font parade", "unit matrix") else "stock" if kind == "ease catalogue" else None)
        sfx(t, "whoosh-long", -10)
        interlude(kind, t, L)
        t += L
    vlen = p.mdur(vo[i])
    L = max(f(1.9), f(vlen + 0.7))
    p.marker(t, f"Line {i + 1}: {line[:30]}", "blue") if i % 5 == 0 else None
    background(t, L)
    p.audio(VO, t + 6, p.ff(vlen), vo[i], name=f"VO {i + 1}: {line[:30]}")
    scene(i, t, L)
    captions_for(i, t + 6)
    if i % 6 == 2 and stick:
        name = list(stick)[i % len(stick)]
        p.image(STK, t, L, stick[name], fit=None, scale=0.8, x=330, y=-760, kf=kf(("transform.scale", [(0, 0.01, "overshoot"), (18, 0.8)])), name=f"Sticker {name}")
    if i % 8 == 5 and stock:
        m = stock[i % len(stock)]
        d = min(L, p.ff(p.mdur(m)))
        p.video(PIP, t, d, m, fit=None, scale=p.fit_scale(m, "fit", (420, 300)), x=-270, y=-700, muted=True, fades=(10, 10),
                kf=kf(("transform.rotation", [(0, -3, "smooth"), (d, 3)])), name="Picture in picture")
    t += L
L = f(24)
background(t, L, "video")
interlude("credits", t, L)
t += L
total = t
# music bed: two tracks alternating, ducked a little under the voice
pos, k = 0, 0
ids = []
while pos < total:
    m = pulse if k % 2 == 0 else house
    d = min(p.ff(p.mdur(m)), total - pos)
    cid = p.audio(MUS, pos, d, m, gain=-12, fades=(f(1) if pos == 0 else 0, f(3) if pos + d >= total else 0), name="Music bed")
    if ids:
        p.transition(ids[-1], cid, "crossDissolve", f(1.5), f(1.5))
    ids.append(cid)
    pos += d
    k += 1
p.extra_files["OPEN.txt"] = "Kinetic typography: 42 narrated scenes, 8 music interludes, every text animation, unit, ease and style. Project text presets live in presets/text/.\n"
ok = p.save(OUT)
print("length", total, "frames =", round(total / 60 / 60, 2), "min;", len(DISPLAY_FONTS), "display fonts")
sys.exit(0 if ok else 1)
