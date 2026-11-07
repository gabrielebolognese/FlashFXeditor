"""04 Overlay stack: dozens of simultaneous layers, a 4x4 video wall, shape motion graphics with every ease, a sticker storm,
split screens, track states, stand-ins for future features, and a voice-over with sound design on many audio tracks."""
import glob
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(__file__))
import scripts  # noqa: E402
from tplkit import (AAC, AAC_VOICE, EASES, LABELS, MP3, OGG, Proj, anim, conv, grad, hexc, kf, pick_font, rgba, text_style, tts_words)  # noqa: E402

from tplkit import WORK as ROOT  # noqa: E402
G, DL, TTS = os.path.join(ROOT, "gen"), os.path.join(ROOT, "dl"), os.path.join(ROOT, "tts")
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "out")
random.seed(9)

p = Proj("04-overlay-stack", "04 Overlay Stack (square 29.97)", 1080, 1080, fps=(30000, 1001), background=(0.03, 0.03, 0.05))
W, H = p.w, p.h
f = p.f
FONT = pick_font("Montserrat")
DISP = pick_font("Bungee", "Anton")
PAL = ["#ff4757", "#ffa502", "#2ed573", "#1e90ff", "#a55eea", "#ff6b81", "#eccc68", "#70a1ff", "#7bed9f", "#ff7f50", "#00d2d3", "#feca57", "#ff9ff3", "#54a0ff", "#5f27cd", "#10ac84"]

BG = p.vtrack("Background")
L = [p.vtrack(f"Layer {i + 1:02d}", height="S") for i in range(24)]
STAND = p.vtrack("Stand-ins", height="S")
HID = p.vtrack("Hidden layer", hidden=True, height="S")
LOCK = p.vtrack("Locked layer", locked=True, height="S")
TOP = p.vtrack("Top text")
A_VO = p.atrack("Voice-over (recorded)", height="L")
A_MUS = p.atrack("Music")
A_FX = [p.atrack(f"SFX {i + 1}", height="S") for i in range(4)]
A_AMB = p.atrack("Ambience")
A_MUTE = p.atrack("Muted on purpose", muted=True)

# ---------------- media
vo = {k: p.add_media(conv(os.path.join(TTS, "overlay", f"{k}.wav"), f"ov-{k}.m4a", AAC_VOICE), "audio", bin="Voice-over") for k, _ in scripts.OVERLAY_VO}
house = p.add_media(conv(os.path.join(G, "audio", "music", "house-128.wav"), "ov-house-128.ogg", OGG), "audio", bin="Music")
beat = p.add_media(conv(os.path.join(G, "audio", "music", "beat-120.wav"), "ov-beat-120.mp3", MP3), "audio", bin="Music")
fx = {n: p.add_media(os.path.join(G, "audio", "sfx", f"{n}.wav"), "audio", bin="SFX") for n in
      ("pop", "whoosh-short", "whoosh-long", "riser", "impact", "sparkle", "click", "glitch", "ping", "swoosh-tick", "punch", "drum-fill")}
amb = [p.add_media(conv(os.path.join(DL, "audio", n), f"ov-{n.split('.')[0]}.ogg", OGG), "audio", bin="Ambience") for n in ("birds-forest.ogg", "ocean-waves.ogg", "rain.ogg")
       if os.path.exists(os.path.join(DL, "audio", n))]
stock = [p.add_media(x, "video", bin="Stock") for x in sorted(glob.glob(os.path.join(DL, "stock", "*.mp4")))]
counters = [p.add_media(x, "video", bin="Counters") for x in sorted(glob.glob(os.path.join(G, "counters", "*.mp4")))]
mg = [p.add_media(x, "video", bin="Motion graphics") for x in sorted(glob.glob(os.path.join(G, "mg", "*.mp4")))]
stickers = [p.add_media(x, "image", bin="Stickers") for x in sorted(glob.glob(os.path.join(G, "stickers", "*.*")))]
pngs = {os.path.basename(x)[:-4]: p.add_media(x, "image", bin="Overlays") for x in glob.glob(os.path.join(G, "overlays", "*.png")) + glob.glob(os.path.join(G, "overlays", "*.svg"))}
wall_pool = (stock + mg + counters)
bgvid = p.add_media(os.path.join(G, "mg", "mg-gradient-vertical.mp4"), "video")
leak = p.add_media(os.path.join(G, "mg", "mg-light-leak.mp4"), "video")


def sq_crop(mid):
    """Crop that makes the media square."""
    info = p.media_info[mid]
    w, h = info["width"] or 1, info["height"] or 1
    if w > h:
        c = (1 - h / w) / 2
        return {"left": round(c, 4), "right": round(c, 4)}, h
    c = (1 - w / h) / 2
    return {"top": round(c, 4), "bottom": round(c, 4)}, w


def sfx(start, name, gain=-10):
    m = fx[name]
    p.audio_any(A_FX, start, p.ff(p.mdur(m)), m, gain=gain, name=name)


def vo_at(start, key):
    m = vo[key]
    p.audio(A_VO, start, p.ff(p.mdur(m)), m, fades=(3, 6), name=f"VO {key}")
    return p.ff(p.mdur(m))


def caption_text(start, dur, text):
    p.text(TOP, start, dur, text, text_style(FONT, 40, 700, bg=(rgba(0, 0, 0, 0.6), 20, 10, 10, "line")), box={"mode": "fixed", "width": 900}, y=430,
           anim_in=anim("wordFade", min(30, dur // 3), per="word"), anim_out=anim("fade", 8), name=f"Subtitle: {text[:30]}")


def title(start, dur, text, color="#ffffff"):
    p.text(TOP, start, dur, text, text_style(DISP, 96, 400, fill=hexc(color), stroke=(6, rgba(0, 0, 0))), y=-400,
           anim_in=anim("scaleBounce", 18), anim_out=anim("slideUp", 10))


# ---------------- 1. layer cake intro
t0 = 0
SEC1 = f(40)
p.marker(t0, "1. Layer cake", "red")
p.video(BG, t0, min(SEC1, p.ff(p.mdur(bgvid))), bgvid, fit="cover", muted=True)
p.solid(BG, t0 + p.ff(p.mdur(bgvid)), SEC1 - p.ff(p.mdur(bgvid)), grad(hexc("#1d2b64"), hexc("#f8cdda")), name="Gradient") if SEC1 > p.ff(p.mdur(bgvid)) else None
for i in range(16):
    s = t0 + f(1) + i * f(1.2)
    d = SEC1 - (s - t0)
    shape = ["rect", "roundedRect", "ellipse", "line"][i % 4]
    size = 820 - i * 46
    p.solid(L[i], s, d, grad(hexc(PAL[i]), hexc(PAL[(i + 5) % 16])), w=size, h=size if shape != "line" else 24, shape=shape, radius=60 if shape != "rect" else 0,
            rot=i * 11, opacity=0.9, name=f"Layer {i + 1} {shape}",
            kf=kf(("transform.scale", [(0, 0.01, "overshoot"), (f(0.6), 1.0)]), ("transform.rotation", [(0, i * 11, "linear"), (d, i * 11 + (90 if i % 2 else -90))])))
    if i % 3 == 0:
        sfx(s, "pop", -14)
vo_len = vo_at(t0 + f(2), "ov-1")
caption_text(t0 + f(2), vo_len, scripts.OVERLAY_VO[0][1])
vo_len = vo_at(t0 + f(12), "ov-2")
caption_text(t0 + f(12), vo_len, scripts.OVERLAY_VO[1][1])
title(t0 + f(22), f(6), "16 LAYERS")
for k in range(6):
    s = t0 + f(28) + k * f(1.5)
    st = stickers[k % len(stickers)]
    p.image(L[16 + k], s, SEC1 - (s - t0), st, fit=None, scale=0.6, x=-380 + k * 150, y=380, kf=kf(("transform.scale", [(0, 0.01, "overshoot"), (14, 0.6)])))
    sfx(s, "pop", -12)

# ---------------- 2. video wall
t1 = t0 + SEC1
SEC2 = f(62)
p.marker(t1, "2. Video wall 4x4 (16 decodes)", "orange")
p.solid(BG, t1, SEC2, rgba(0.02, 0.02, 0.03), name="Wall background")
vo_len = vo_at(t1 + f(1), "ov-3")
caption_text(t1 + f(1), vo_len, scripts.OVERLAY_VO[2][1])
cell = W / 4
zoom_tile = 5
for i in range(16):
    m = wall_pool[(i * 3) % len(wall_pool)]
    crop, side = sq_crop(m)
    sc = (cell - 8) / side
    cx, cy = -W / 2 + cell * (i % 4 + 0.5), -H / 2 + cell * (i // 4 + 0.5)
    s = t1 + i * 4
    # each tile is a sequence of clips (the source loops), all on the tile's own track
    pos, n = s, 0
    end = t1 + SEC2
    zx, zy = -W / 2 + cell * (zoom_tile % 4 + 0.5), -H / 2 + cell * (zoom_tile // 4 + 0.5)
    Z = 4.0
    zs, zh, ze = t1 + f(20), t1 + f(24), t1 + f(34)
    while pos < end:
        mm = wall_pool[(i * 3 + n * 5) % len(wall_pool)] if n else m
        crop, side = sq_crop(mm)
        sc = (cell - 8) / side
        d = min(p.ff(p.mdur(mm)), end - pos)
        if d < 4:
            break
        keys = {}
        rel = lambda fr: fr - pos  # noqa: E731
        if pos < ze and pos + d > zs:
            kx = [(rel(zs), cx, "easeInOut"), (rel(zh), (cx - zx) * Z, "hold"), (rel(ze - f(2)), (cx - zx) * Z, "easeInOut"), (rel(ze), cx)]
            ky = [(rel(zs), cy, "easeInOut"), (rel(zh), (cy - zy) * Z, "hold"), (rel(ze - f(2)), (cy - zy) * Z, "easeInOut"), (rel(ze), cy)]
            ks = [(rel(zs), sc, "easeInOut"), (rel(zh), sc * Z, "hold"), (rel(ze - f(2)), sc * Z, "easeInOut"), (rel(ze), sc)]
            keys = kf(("transform.x", kx), ("transform.y", ky), ("transform.scale", ks))
        elif n == 0:
            keys = kf(("transform.scale", [(0, 0.01, "overshoot"), (f(0.5), sc)]))
        p.video(L[i], pos, d, mm, fit=None, scale=sc, x=cx, y=cy, crop=crop, gain=-60 if i else -20, muted=i > 0, kf=keys or None,
                color=LABELS[i % 8], name=f"Tile {i + 1}")
        pos += d
        n += 1
    if i % 4 == 0:
        sfx(s, "click", -10)
title(t1 + f(20), f(4), "ZOOM")
sfx(t1 + f(20), "whoosh-long", -8)
sfx(t1 + f(32), "whoosh-long", -8)
title(t1 + f(40), f(5), "16 VIDEOS")

# ---------------- 3. shape ballet
t2 = t1 + SEC2
SEC3 = f(60)
p.marker(t2, "3. Shape ballet (every ease)", "green")
p.solid(BG, t2, SEC3, grad(hexc("#0f2027"), hexc("#2c5364")), name="Ballet background")
vo_len = vo_at(t2 + f(1), "ov-4")
caption_text(t2 + f(1), vo_len, scripts.OVERLAY_VO[3][1])
for i in range(8):  # orbiting planets, keys every 1/8 orbit
    r = 120 + i * 45
    per = f(4 + i)
    keys_x, keys_y = [], []
    steps = SEC3 // (per // 8) + 1
    for k in range(steps):
        fr = k * (per // 8)
        a = 2 * math.pi * fr / per + i
        keys_x.append((fr, math.cos(a) * r, "smooth"))
        keys_y.append((fr, math.sin(a) * r, "smooth"))
    p.solid(L[i], t2, SEC3, hexc(PAL[i]), w=40 + i * 6, h=40 + i * 6, shape="ellipse", kf=kf(("transform.x", keys_x), ("transform.y", keys_y)), name=f"Orbit {i + 1}")
    p.solid(L[8 + i], t2, SEC3, rgba(1, 1, 1, 0.12), w=2 * r, h=2 * r, shape="ellipse", opacity=0.25, name=f"Orbit ring {i + 1}")
for i, e in enumerate(EASES):  # equalizer bars, one ease each
    x = -W / 2 + 90 + i * 128
    keys = [(k * f(1), 0.15 if k % 2 == 0 else 1.0, e) for k in range(int(SEC3 / f(1)) + 1)]
    p.solid(L[16 + i], t2 + f(10), SEC3 - f(10), grad(hexc(PAL[i + 8]), hexc("#ffffff")), w=80, h=320, shape="roundedRect", radius=20, x=x, y=H / 2 - 60,
            anchor=(0.5, 1.0), scale_y=1.0, kf=kf(("transform.scaleY", keys)), name=f"Bar {e}")
    p.text(TOP, t2 + f(10) + i, 1, e, text_style(FONT, 10, 400), name="1-frame ease tick") if p.free(TOP, t2 + f(10) + i, 1) else None
for k in range(4):  # clock hands (lines rotating around one end)
    p.solid(L[(20 + k) % 24], t2 + f(30), SEC3 - f(30), hexc(PAL[k + 2]), w=300 - k * 50, h=12, shape="line", radius=6, anchor=(0, 0.5),
            kf=kf(("transform.rotation", [(0, k * 90, "linear"), (SEC3 - f(30), k * 90 + 360 * (k + 1))])), name=f"Clock hand {k + 1}") if p.free(L[(20 + k) % 24], t2 + f(30), SEC3 - f(30)) else None
title(t2 + f(44), f(6), "EASES")

# ---------------- 4. sticker storm
t3 = t2 + SEC3
SEC4 = f(45)
p.marker(t3, "4. Sticker storm (animated GIF and WebP)", "teal")
p.video(BG, t3, min(SEC4, p.ff(p.mdur(leak))), leak, fit="cover", muted=True)
if SEC4 > p.ff(p.mdur(leak)):
    p.video(BG, t3 + p.ff(p.mdur(leak)), min(SEC4 - p.ff(p.mdur(leak)), p.ff(p.mdur(leak))), leak, fit="cover", muted=True, flip_h=True)
for k in range(30):
    s = t3 + k * f(1.2)
    d = min(f(9), t3 + SEC4 - s)
    if d < f(1):
        break
    tr = p.any_free(L, s, d)
    if not tr:
        continue
    x0, y0 = random.uniform(-450, 450), 650
    x1, y1 = random.uniform(-450, 450), -650
    p.image(tr, s, d, stickers[k % len(stickers)], fit=None, scale=random.uniform(0.3, 0.9), x=x0, y=y0, rot=random.uniform(-30, 30),
            kf=kf(("transform.x", [(0, x0, "smooth"), (d, x1)]), ("transform.y", [(0, y0, EASES[k % 8]), (d, y1)]), ("transform.rotation", [(0, 0, "linear"), (d, random.choice([-360, 360]))])),
            name=f"Sticker {k + 1}")
    sfx(s, "pop", -16)
title(t3 + f(2), f(5), "STICKER STORM", "#feca57")

# ---------------- 5. split screens and picture in picture
t4 = t3 + SEC4
SEC5 = f(45)
p.marker(t4, "5. Split screens and PIP", "blue")
p.solid(BG, t4, SEC5, rgba(0, 0, 0), name="Split background")
layouts = [2, 3, 4, 2, 3]
seg = SEC5 // len(layouts)
for k, n in enumerate(layouts):
    s = t4 + k * seg
    for j in range(n):
        m = stock[(k * 4 + j) % len(stock)] if stock else mg[j]
        info = p.media_info[m]
        w, h = info["width"], info["height"]
        # vertical strips: crop to strip aspect (W/n x H)
        target = (W / n) / H
        src_aspect = w / h
        crop = {}
        if src_aspect > target:
            c = (1 - target / src_aspect) / 2
            crop = {"left": round(c, 4), "right": round(c, 4)}
            sc = H / h
        else:
            c = (1 - src_aspect / target) / 2
            crop = {"top": round(c, 4), "bottom": round(c, 4)}
            sc = (W / n) / w
        d = min(seg, p.ff(p.mdur(m)))
        p.video(L[j], s, d, m, fit=None, scale=sc, x=-W / 2 + W / n * (j + 0.5), crop=crop, muted=True,
                kf=kf(("transform.y", [(0, H if j % 2 else -H, "easeOut"), (f(0.7), 0)])), name=f"Split {n}-up {j + 1}")
    for j in range(1, n):
        p.solid(L[10 + j], s, seg, rgba(1, 1, 1), w=6, h=H, x=-W / 2 + W / n * j, name="Divider")
    sfx(s, "swoosh-tick", -8)
pm = stock[3] if len(stock) > 3 else mg[0]
p.video(L[20], t4 + f(10), f(8), pm, fit=None, scale=p.fit_scale(pm, "fit", (380, 380)), x=300, y=-300, muted=True, opacity=0.95,
        kf=kf(("transform.x", [(0, 700, "overshoot"), (f(0.8), 300)])), name="PIP window")
p.solid(L[19], t4 + f(10), f(8), rgba(1, 1, 1), w=390, h=390 * 9 / 16 + 10, x=300, y=-300, name="PIP frame",
        kf=kf(("transform.x", [(0, 700, "overshoot"), (f(0.8), 300)])))

# ---------------- 6. track states
t5 = t4 + SEC5
SEC6 = f(36)
p.marker(t5, "6. Hidden, locked, muted, disabled", "violet")
p.solid(BG, t5, SEC6, grad(hexc("#232526"), hexc("#414345")), name="States background")
vo_len = vo_at(t5 + f(1), "ov-5")
caption_text(t5 + f(1), vo_len, scripts.OVERLAY_VO[4][1])
p.text(HID, t5, SEC6, "YOU SHOULD NOT SEE THIS (hidden track)", text_style(DISP, 80, 400, fill=hexc("#ff4757")))
p.text(LOCK, t5, SEC6, "locked track: try to move me", text_style(FONT, 56, 700, fill=hexc("#feca57")), y=-200)
p.solid(L[0], t5, SEC6, hexc("#2ed573"), w=300, h=300, shape="roundedRect", radius=40, x=-250, y=150, enabled=False, name="Disabled solid (not drawn)")
p.text(L[1], t5, SEC6, "disabled clip on the left (invisible)", text_style(FONT, 40, 600), y=360)
if amb:
    p.audio(A_MUTE, t5, min(SEC6, p.ff(p.mdur(amb[0]))), amb[0], name="On the muted track")
for k in range(8):
    p.solid(L[2 + k], t5 + f(8), SEC6 - f(8), hexc("#dfe4ea"), w=100, h=100, x=-420 + k * 120, y=0, color=LABELS[k], group="state-group", name=f"Grouped {LABELS[k]}")

# ---------------- 7. stand-ins for features that come later (blend, masks, effects, adjustment, Lottie, shapes)
t6 = t5 + SEC6
SEC7 = f(30)
p.marker(t6, "7. Stand-ins for later features", "pink")
p.solid(BG, t6, SEC7, rgba(0.05, 0.05, 0.08), name="Stand-in background")
base = stock[0] if stock else mg[0]
cb = p.video(L[0], t6, min(SEC7, p.ff(p.mdur(base))), base, fit="cover", muted=True, name="Base footage")
lk = p.video(STAND, t6, min(f(8) - 1, p.ff(p.mdur(leak))), leak, fit="cover", opacity=0.55, muted=True, color="orange", name="Stand-in: light leak (screen blend)")
p.clips[lk]["fallbackOf"] = {"kind": "video", "reason": "Screen blend mode baked as 55% opacity", "schemaVersion": 4,
                             "data": {"kind": "video", "mediaId": leak, "blend": "screen", "opacity": 1}}
m2 = stock[1] if len(stock) > 1 else mg[1]
mk = p.video(STAND, t6 + f(8), f(15) - f(8), m2, fit=None, scale=p.fit_scale(m2, "fit", (500, 500)), crop={"left": 0.2, "right": 0.2}, color="violet", muted=True,
             name="Stand-in: ellipse mask (baked as a crop)")
p.clips[mk]["fallbackOf"] = {"kind": "video", "reason": "Feathered ellipse mask baked as a crop", "schemaVersion": 4,
                             "data": {"kind": "video", "mediaId": m2, "masks": [{"id": "mask1", "shape": {"kind": "ellipse", "x": 0, "y": 0, "w": 720, "h": 720},
                                                                                 "mode": "add", "feather": 60, "expansion": 0, "opacity": 1, "inverted": False}]}}
gl = p.image(STAND, t6 + f(15), f(20) - f(15), pngs.get("logo-badge", stickers[0]), fit=None, scale=0.7, color="violet", name="Stand-in: glow effect")
p.clips[gl]["fallbackOf"] = {"kind": "image", "reason": "Glow effect baked into the sprite", "schemaVersion": 4,
                             "data": {"kind": "image", "mediaId": pngs.get("logo-badge", stickers[0]), "effects": [{"id": "fx1", "type": "glow", "enabled": True, "params": {"radius": 40, "intensity": 1.5, "color": "#ffd32a"}}]}}
ad = p.solid(STAND, t6 + f(20), f(25) - f(20), rgba(0.5, 0.5, 0.5, 0.35), color="red", name="Stand-in: black and white adjustment")
p.clips[ad]["fallbackOf"] = {"kind": "adjustment", "reason": "Adjustment clip (desaturate) baked as a grey plate", "schemaVersion": 4,
                             "data": {"kind": "adjustment", "effects": [{"id": "fx2", "type": "colorAdjust", "enabled": True, "params": {"saturation": -100}}], "opacity": 1}}
lt = p.image(STAND, t6 + f(25), f(30) - f(25), stickers[1], fit=None, scale=1.0, color="violet", name="Stand-in: Lottie confetti")
p.clips[lt]["fallbackOf"] = {"kind": "lottie", "reason": "Lottie animation baked to an animated WebP", "schemaVersion": 4, "data": {"kind": "lottie", "name": "Confetti", "file": "lottie/confetti.json"}}
title(t6 + f(1), f(6), "STAND-INS", "#ff9ff3")
p.text(L[1], t6 + f(8), SEC7 - f(8), "baked layers: blend, mask, glow,\nadjustment, Lottie", text_style(FONT, 44, 700, bg=(rgba(0, 0, 0, 0.6), 20, 10, 10, "block")), y=380)

# ---------------- 8. finale: everything at once
t7 = t6 + SEC7
SEC8 = f(40)
p.marker(t7, "8. Finale: everything at once", "red")
p.video(BG, t7, min(SEC8, p.ff(p.mdur(bgvid))), bgvid, fit="cover", muted=True)
for i in range(9):
    m = wall_pool[(i * 5 + 2) % len(wall_pool)]
    crop, side = sq_crop(m)
    c3 = W / 3
    sc = (c3 - 10) / side
    d = min(SEC8, p.ff(p.mdur(m)))
    p.video(L[i], t7, d, m, fit=None, scale=sc, x=-W / 2 + c3 * (i % 3 + 0.5), y=-H / 2 + c3 * (i // 3 + 0.5), crop=crop, muted=True, opacity=0.85,
            kf=kf(("transform.rotation", [(0, 0, "smooth"), (d // 2, 8 if i % 2 else -8, "smooth"), (d, 0)])), name=f"Finale tile {i + 1}")
for k in range(10):
    s = t7 + f(4) + k * f(2)
    d = t7 + SEC8 - s - f(2)
    tr = p.any_free(L, s, d)
    if tr and d > f(2):
        p.image(tr, s, d, stickers[(k * 3) % len(stickers)], fit=None, scale=0.5, x=random.uniform(-400, 400), y=random.uniform(-400, 400),
                kf=kf(("transform.scale", [(0, 0.01, "overshoot"), (12, 0.5)])))
for k in range(5):
    s = t7 + f(8) + k * f(3)
    tr = p.any_free(L, s, t7 + SEC8 - s)
    if tr:
        p.solid(tr, s, t7 + SEC8 - s, grad(hexc(PAL[k]), hexc(PAL[k + 6])), w=200, h=200, shape="ellipse", x=-400 + k * 200, y=0, opacity=0.6,
                kf=kf(("transform.scale", [(0, 0.01, "overshoot"), (15, 1.0), (f(2), 1.4, "smooth"), (f(4), 1.0)])))
vo_len = vo_at(t7 + f(22), "ov-6")
caption_text(t7 + f(22), vo_len, scripts.OVERLAY_VO[5][1])
title(t7 + f(2), f(6), "EVERYTHING", "#2ed573")
p.solid(TOP, t7 + SEC8 - f(1.5), f(1.5), rgba(0, 0, 0, 1), fades=(f(1.4), 0), name="Fade to black") if p.free(TOP, t7 + SEC8 - f(1.5), f(1.5)) else None
total = t7 + SEC8

# ---------------- music and ambience across the piece
pos, k, ids = 0, 0, []
while pos < total:
    m = house if k % 2 == 0 else beat
    d = min(p.ff(p.mdur(m)), total - pos)
    duck = [(0, -9, "smooth")]
    cid = p.audio(A_MUS, pos, d, m, gain=-9, fades=(f(1) if pos == 0 else 0, f(2) if pos + d >= total else 0), name="Music")
    if ids:
        p.transition(ids[-1], cid, "crossDissolve", f(1), f(1))
    ids.append(cid)
    pos += d
    k += 1
for j, m in enumerate(amb):
    s = [t2, t3, t6][j % 3]
    p.audio(A_AMB, s, min(f(20), p.ff(p.mdur(m))), m, gain=-18, fades=(f(1), f(2)), name="Ambience") if p.free(A_AMB, s, min(f(20), p.ff(p.mdur(m)))) else None
for s in (t1, t2, t3, t4, t5, t6, t7):
    sfx(s - f(1.8) if s > f(2) else s, "riser", -12)
    sfx(s, "impact", -8)
p.extra_files["OPEN.txt"] = "Overlay stack: 24 layer tracks, a 4x4 video wall with a zoom, shapes with every ease, 30 stickers, split screens, track states and stand-ins.\n"
ok = p.save(OUT)
print("length", total, "frames =", round(total * 1001 / 30000 / 60, 2), "min")
sys.exit(0 if ok else 1)
