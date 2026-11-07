"""06 Format torture: every container, codec, frame rate, image and audio format, and the edge cases of the document."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from tplkit import EASES, LABELS, Proj, anim, grad, hexc, kf, rgba, text_style  # noqa: E402

from tplkit import WORK as ROOT  # noqa: E402
G = os.path.join(ROOT, "gen")
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "out")

p = Proj("06-format-torture", "06 Format Torture (4K 23.976)", 3840, 2160, fps=(24000, 1001), background=(0.06, 0.06, 0.08),
         description="Every container, codec, frame rate, image and audio format the editor lists, plus document edge cases.")
W, H = p.w, p.h
T = lambda name: os.path.join(G, "torture", name)  # noqa: E731
C = lambda fps: os.path.join(G, "counters", f"counter-{fps}fps.mp4")  # noqa: E731

v_bg = p.vtrack("Backgrounds")
v_main = p.vtrack("Media under test", height="L")
v_grid = [p.vtrack(f"Grid {i + 1}", height="S") for i in range(10)]
v_fx = p.vtrack("Edge clips")
v_stand = p.vtrack("Stand-ins")
v_hidden = p.vtrack("Hidden track", hidden=True)
v_locked = p.vtrack("Locked track", locked=True)
v_empty = p.vtrack("Empty track")
v_labels = p.vtrack("Labels", height="L")
v_labels2 = p.vtrack("Labels 2")
v_labels3 = p.vtrack("Labels 3")
cap_style = {"text": text_style("Atkinson Hyperlegible" if "Atkinson Hyperlegible" in __import__("tplkit").FAMILIES else "Inter", 110, 700,
                                stroke=(10, rgba(0, 0, 0)), bg=(rgba(0, 0, 0, 0.55), 40, 18, 24, "line")),
             "position": "bottom", "x": 0, "y": 0, "maxWidth": 3000, "maxLines": 2,
             "highlight": {"mode": "colorAndScale", "color": hexc("#ffd32a"), "inactiveColor": rgba(1, 1, 1, 0.85)}}
cc = p.ctrack(cap_style)
a_main = p.atrack("Audio under test", height="L")
a_lanes = [p.atrack(f"Audio lane {i + 1}") for i in range(5)]
a_muted = p.atrack("Muted track", muted=True)
a_empty = p.atrack("Empty audio")

LBL = text_style("JetBrains Mono" if "JetBrains Mono" in __import__("tplkit").FAMILIES else "Space Mono", 96, 700, fill=hexc("#7bed9f"),
                 bg=(rgba(0, 0, 0, 0.7), 36, 16, 12, "block"), align="left", anchor="top")


def label(start, dur, text, y=-H / 2 + 140):
    track = next(tr for tr in (v_labels, v_labels2, v_labels3) if p.free(tr, start, dur))
    if track != v_labels and y == -H / 2 + 140:
        y += 160 if track == v_labels2 else 320
    p.text(track, start, dur, text, LBL, x=-W / 2 + 80, y=y, anchor=(0, 0), anim_in=anim("fade", 6), name=f"Label: {text[:30]}")


t = 0
f = p.f
p.marker(0, "A. Video containers and codecs", "red")
p.solid(v_bg, 0, f(300), grad(hexc("#1e272e"), hexc("#0b0e11")), name="Background gradient")
videos = [
    ("h264-4k60.mp4", "H.264 3840x2160 60 fps (4K60 decode)"), ("hevc-1080p.mp4", "HEVC hvc1 1080p (needs a HEVC decoder)"),
    ("av1-1080p.mp4", "AV1 1080p"), ("vp9-1080p.webm", "VP9 + Opus WebM"), ("vp8-720p.webm", "VP8 WebM"),
    ("vp9-alpha.webm", "VP9 with alpha (videoAlpha: false, drawn opaque)"), ("h264-rotated-90.mp4", "H.264, rotate=90 metadata"),
    ("mov-h264.mov", "QuickTime MOV, H.264 + AAC"), ("prores-422.mov", "ProRes 422 MOV (not decodable: offline / failed state)"),
    ("m4v-sd.m4v", "M4V 720x480 29.97"), ("h264-high10.mp4", "H.264 High 10 (10-bit)"), ("h264-odd-1278x718.mp4", "Odd size 1278x718"),
    ("h264-tiny-64.mp4", "Tiny 64x64, scaled up 30x"), ("h264-ultrawide-3000x200.mp4", "Ultra wide 3000x200"),
    ("h264-vfr.mp4", "Variable frame rate"), ("h264-allintra.mp4", "All intra (GOP 1)"), ("h264-longgop-300.mp4", "Long GOP 300, B-frames (seek stress)"),
    ("h264-8k-2s.mp4", "H.264 7680x4320 (8K, beyond most decoders)"),
]
for name, desc in videos:
    mid = p.add_media(T(name), "video", bin="Codecs")
    d = f(3.2)
    if p.mdur(mid) < 3.2:
        d = max(1, p.f(p.mdur(mid)))
    kw = {"fit": "fit"}
    if "tiny" in name:
        kw = {"scale": 30.0, "fit": None}
    p.video(v_main, t, d, mid, **kw)
    label(t, d, desc)
    t += d
one = p.add_media(T("h264-one-frame.mp4"), "video", bin="Codecs")
p.freeze(v_main, t, f(2), one, at=0.0, fit="fit", name="One-frame video as a freeze")
label(t, f(2), "One-frame file held as a freeze frame")
t += f(2)

# ---------------- B. frame rates
p.marker(t, "B. Frame rates side by side", "orange")
fps_list = ["12", "23976", "24", "25", "2997", "30", "50", "5994", "60", "120"]
grid_start = t
for i, fps in enumerate(fps_list):
    mid = p.add_media(C(fps), "video", bin="Counters")
    col, row = i % 5, i // 5
    tile_w, tile_h = W / 5, H / 2
    sc = p.fit_scale(mid, "fit", (tile_w - 24, tile_h - 24))
    p.video(v_grid[i], grid_start, f(7.5), mid, fit=None, scale=sc, x=-W / 2 + tile_w * (col + 0.5), y=-H / 2 + tile_h * (row + 0.5),
            gain=-60 if i else -18, color=LABELS[i % 8])
label(grid_start, f(7.5), "10 counters at 12 / 23.976 / 24 / 25 / 29.97 / 30 / 50 / 59.94 / 60 / 120 fps at once")
t = grid_start + f(7.5)
for fps in fps_list:
    mid = p.add_media(C(fps), "video", bin="Counters")
    p.video(v_main, t, f(3), mid, fit="fit", src_in=2.0)
    label(t, f(3), f"Counter {fps} fps, full frame (frame numbers must step evenly)")
    t += f(3)

# ---------------- C. speed and freeze
p.marker(t, "C. Speed 0.25x to 4x, freeze frames", "green")
c30 = p.add_media(C("30"), "video", bin="Counters")
for sp in (0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0):
    d = min(f(3), int(p.mdur(c30) / sp * 24000 / 1001) - 2)
    p.video(v_main, t, d, c30, speed=sp, fit="fit", name=f"Counter at {sp}x")
    label(t, d, f"Speed {sp}x")
    t += d
for at in (0.0, 3.3, 7.7):
    p.freeze(v_main, t, f(1.5), c30, at=at, fit="fit", name=f"Freeze at {at}s")
    label(t, f(1.5), f"Freeze frame at {at} s")
    t += f(1.5)

# ---------------- D. images
p.marker(t, "D. Image formats", "teal")
images = [
    ("png-16bit.png", "16-bit grayscale PNG"), ("png-alpha-gradient.png", "PNG with alpha gradient"), ("png-1x1.png", "1x1 PNG scaled to the frame"),
    ("png-huge-8192.png", "8192x8192 PNG (texture size limit)"), ("jpg-progressive.jpg", "Progressive JPEG 4K"), ("jpg-cmyk.jpg", "CMYK JPEG"),
    ("jpg-exif-rotated.jpg", "JPEG with EXIF orientation 6"), ("webp-lossless-alpha.webp", "Lossless WebP with alpha"), ("gif-static.gif", "Static GIF"),
]
for name, desc in images:
    mid = p.add_media(T(name), "image", bin="Images")
    kw = {"fit": "fit"} if "1x1" not in name else {"fit": "cover"}
    p.image(v_main, t, f(2.5), mid, **kw)
    label(t, f(2.5), desc)
    t += f(2.5)
for name in ("logo-badge.svg", "map-pin.svg", "arrow-right.svg", "badge-new.svg", "wave-divider.svg"):
    mid = p.add_media(os.path.join(G, "overlays", name), "image", bin="Images")
    p.image(v_main, t, f(1.6), mid, fit="fit")
    label(t, f(1.6), f"SVG: {name}")
    t += f(1.6)
anim_start = t
for i, name in enumerate(("sticker-big-tunnel.gif", "sticker-big-tunnel.webp", "sticker-confetti.webp", "sticker-star-spin.gif", "sticker-fire.webp")):
    mid = p.add_media(os.path.join(G, "stickers", name), "image", bin="Animated")
    p.image(v_grid[i], anim_start, f(6), mid, fit=None, scale=1.6, x=-W / 2 + W / 6 * (i + 1), y=0)
label(anim_start, f(6), "Animated GIF and WebP (alpha) looping, 800x800 tunnel at 90 frames")
t = anim_start + f(6)

# ---------------- E. audio formats
p.marker(t, "E. Audio formats and levels", "blue")
audio_files = ["wav-8bit-8k-mono.wav", "wav-24bit-96k-stereo.wav", "wav-float32-48k.wav", "wav-6ch-51.wav", "mp3-vbr-44k.mp3", "mp3-cbr-22k-mono.mp3",
               "ogg-vorbis.ogg", "ogg-opus.ogg", "m4a-aac.m4a", "aac-adts.aac"]
aud_start = t
for name in audio_files:
    mid = p.add_media(T(name), "audio", bin="Audio formats")
    d = f(2.4)
    p.audio(a_main, t, d, mid, fades=(4, 4))
    label(t, d, f"Audio: {name}", y=-H / 2 + 140)
    t += d
only = p.add_media(T("audio-only.mp4"), "audio", bin="Audio formats")
p.audio(a_main, t, f(3), only)
label(t, f(3), "MP4 with only an audio track, imported as audio")
t += f(3)
# levels on the lanes: -60 dB, +12 dB, muted clip, gain keyframes, a disabled clip
m48 = p.add_media(T("wav-float32-48k.wav"), "audio")
p.audio(a_lanes[0], aud_start, f(6), m48, gain=-60, name="-60 dB (silent)")
p.audio(a_lanes[1], aud_start + f(6), f(6), m48, gain=12, name="+12 dB (clips)", color="red")
p.audio(a_lanes[2], aud_start + f(12), f(6), m48, muted=True, name="Muted clip")
p.audio(a_lanes[3], aud_start, f(7.5), m48, name="Gain automation, every ease",
        kf=kf(("volume.gainDb", [(i * 20, -40 if i % 2 else 6, EASES[i % 8]) for i in range(10)])))
p.audio(a_lanes[4], aud_start + f(9), f(5), m48, enabled=False, name="Disabled clip")
p.audio(a_muted, aud_start, f(7), m48, name="On a muted track")
label(aud_start + f(14), f(10), "Lanes: -60 dB, +12 dB, muted clip, gain keys with every ease, disabled clip, muted track", y=-H / 2 + 300)

# ---------------- F. edge clips
p.marker(t, "F. Edge clips", "violet")
edge = t
for i in range(24):  # 1-frame strobe of solids
    p.solid(v_fx, edge + i, 1, hexc(["#ff3838", "#fff200", "#32ff7e", "#18dcff"][i % 4]), name=f"1-frame solid {i + 1}")
label(edge, f(2), "24 one-frame solids (strobe)")
pos = edge + f(2)
for i, ease in enumerate(EASES):  # one bar per ease
    x0 = -W / 2 + 300
    p.solid(v_grid[i], pos, f(4), hexc(["#ff4757", "#ffa502", "#2ed573", "#1e90ff", "#a55eea", "#ff6b81", "#eccc68", "#70a1ff"][i]),
            w=200, h=120, shape="roundedRect", radius=30, x=x0, y=-H / 2 + 300 + i * 200,
            kf=kf(("transform.x", [(0, x0, ease), (f(3), W / 2 - 300)])), name=f"Ease {ease}")
    p.text(v_grid[9] if i == 0 else p.vtrack(f"Ease label {i + 1}", height="S") if False else v_grid[9], pos + i, f(4) - i, ease, text_style("Inter", 64, 600), x=-W / 2 + 900, y=-H / 2 + 300 + i * 200, name=f"Ease label {ease}") if p.free(v_grid[9], pos + i, f(4) - i) else None
label(pos, f(4), "transform.x with each ease: linear, easeIn, easeOut, easeInOut, hold, smooth, snap, overshoot", y=H / 2 - 200)
pos += f(4)
mid = p.add_media(os.path.join(G, "overlays", "logo-badge.png"), "image")
extremes = [("Scale 0.02", {"scale": 0.02}), ("Scale 12", {"scale": 12.0}), ("Rotation 720", {"rot": 720}), ("Flip H", {"flip_h": True}),
            ("Flip V", {"flip_v": True}), ("ScaleY 3 (non-uniform)", {"scale": 1.0, "scale_y": 3.0}), ("Opacity 0 (invisible)", {"opacity": 0.0}),
            ("Anchor top-left, rotate 30", {"anchor": (0, 0), "rot": 30}), ("Off-frame x=5000", {"x": 5000})]
for name, kw in extremes:
    kw.setdefault("scale", 1.5)
    p.image(v_fx, pos, f(1.5), mid, fit=None, name=name, **kw)
    label(pos, f(1.5), name)
    pos += f(1.5)
p.image(v_fx, pos, f(3), mid, fit=None, scale=1.0, name="Keys before the start and past the end",
        kf=kf(("transform.rotation", [(-30, -90), (0, 0, "smooth"), (f(3) + 40, 360)]), ("opacity", [(-10, 0), (f(1), 1), (f(5), 0.2)])))
label(pos, f(3), "Keyframes at negative frames and past the clip end")
pos += f(3)
p.image(v_fx, pos, f(2), mid, fit=None, scale=1.0, enabled=False, name="Disabled image")
label(pos, f(2), "A disabled clip (not drawn)")
pos += f(2)
for i, col in enumerate(LABELS):
    p.solid(v_grid[i], pos, f(3), hexc("#dfe4ea"), w=300, h=300, x=-W / 2 + 300 + i * 420, y=0, color=col, name=f"Label color {col}", group="label-colors")
label(pos, f(3), "Every label color, one selection group")
pos += f(3)
lk = p.add_media(C("2997"), "video")
p.video(v_fx, pos, f(4), lk, fit="fit", link="link-a", name="Linked video")
p.audio(a_lanes[0], pos, f(4), lk, link="link-a", name="Linked audio")
label(pos, f(4), "A video and an audio clip in one link group")
pos += f(4)
# transitions: every kind, symmetric and one-sided
seq = [p.add_media(C(x), "video") for x in ("24", "25", "30", "60")]
prev = None
for i, (kind, b, a) in enumerate([("crossDissolve", 12, 12), ("dipToBlack", 0, 18), ("dipToWhite", 18, 0), ("crossDissolve", 1, 0), ("dipToBlack", 24, 24)]):
    cid = p.video(v_main, pos, f(2.5), seq[i % 4], fit="fit", src_in=1.0, name=f"Transition clip {i + 1}")
    if prev:
        p.transition(prev, cid, kind, b, a)
    prev = cid
    label(pos, f(2.5), f"Transition {kind} before {b} after {a}")
    pos += f(2.5)
p.marker(pos, "G. Stand-ins (fallbackOf)", "pink")
stand = [
    ("shape", "A vector star baked to a PNG sprite", {"kind": "shape", "name": "Star", "transform": {"x": 0, "y": 0}}),
    ("lottie", "A Lottie animation baked to an animated WebP", {"kind": "lottie", "name": "Confetti burst"}),
    ("text", "Styled spans baked to an image", {"kind": "text", "text": {"value": "Mixed styles"}, "spans": [{"from": 0, "to": 5, "fill": "#ff0000"}]}),
    ("hologram", "A layer kind no editor knows (stays a stand-in)", {"kind": "hologram", "name": "Unknown"}),
]
for i, (kind, reason, data) in enumerate(stand):
    src = os.path.join(G, "stickers", "sticker-star-spin.webp" if kind != "lottie" else "sticker-confetti.webp")
    sid = p.add_media(src, "image", bin="Stand-ins")
    cid = p.image(v_stand, pos + i * f(3), f(3), sid, fit=None, scale=2.0, color="violet", name=f"Stand-in: {kind}")
    p.clips[cid]["fallbackOf"] = {"kind": kind, "reason": reason, "schemaVersion": 4, "headTrim": 5 * i, "data": data}
    label(pos + i * f(3), f(3), f"Stand-in for a '{kind}' clip: {reason}")
pos += f(12)
sd = p.solid(v_stand, pos, f(3), hexc("#a55eea"), w=600, h=600, shape="ellipse", color="violet", name="Stand-in solid for a shape")
p.clips[sd]["fallbackOf"] = {"kind": "shape", "reason": "An ellipse path baked to a solid", "schemaVersion": 3, "data": {"kind": "shape", "name": "Ellipse"}}
label(pos, f(3), "A solid standing in for a schema 3 shape")
pos += f(3)
# hidden and locked tracks carry content
p.solid(v_hidden, 0, pos, rgba(1, 0, 0, 0.5), name="On a hidden track (never drawn)")
p.text(v_locked, edge, f(6), "This text sits on a locked track", text_style("Bebas Neue", 180, 400, fill=hexc("#ff6b81")), y=H / 2 - 400)
# captions: long text, unicode, per-cue overrides, negative word starts
cues = [
    (f(1), f(4), "Format torture test: every codec, every rate, every edge case", None),
    (f(6), f(4), "Unicode: Größe · Ελληνικά · Кириллица · 日本語 · العربية · עברית · 😀🎬", {"text": {"fontFamily": "Inter", "fontSize": 90}}),
    (f(11), f(5), "A deliberately long cue that keeps going and going so that it has to wrap onto more lines than the two the track allows, which means it is drawn smaller until it fits inside the box", {"maxLines": 2}),
    (f(17), f(3), "Top, custom color", {"position": "top", "text": {"fill": hexc("#ffd32a")}}),
    (f(21), f(3), "Custom position", {"position": "custom", "x": -1200, "y": -500}),
]
for start, dur, text, ov in cues:
    words = None
    if start == f(1):
        ws = text.split()
        step = max(1, dur // len(ws))
        words = [{"text": w, "start": i * step - (6 if i == 0 else 0), "end": (i + 1) * step} for i, w in enumerate(ws)]
    p.caption(start, dur, text, words=words, override=ov)
for i in range(300):  # many short cues near the end
    p.caption(pos + i * 2, 2, f"Cue {i + 1} of 300")
p.marker(pos + 600, "End of the cue storm", "grey")
p.marker(pos + 610, "Last marker", "red")
p.extra_files["OPEN.txt"] = ("Format torture test. Expect some clips to be offline or failed on purpose: ProRes (not decodable in browsers), "
                             "8K H.264 and HEVC depend on the GPU decoder. Section markers A to G on the timeline.\n")
p.extra_files["FALLBACKS.md"] = ("# Stand-ins\n\n- Stand-in: shape (star sprite, headTrim 0)\n- Stand-in: lottie (confetti WebP)\n- Stand-in: text with styled spans\n"
                                 "- Stand-in: hologram (unknown kind, stays baked)\n- Solid standing in for a schema 3 ellipse shape\n")
ok = p.save(OUT)
print("length", p.length(), "frames", round(p.length() * 1001 / 24000, 1), "s")
sys.exit(0 if ok else 1)
