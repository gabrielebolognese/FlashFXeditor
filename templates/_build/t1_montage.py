"""01 Montage marathon: a ~20 minute vertical montage with well over a thousand cuts on the beat, punch-in zooms, pans,
speed ramps, freeze frames, transitions, picture in picture, split screens, 2x2 grids, flashes, stickers, a cut counter,
voice-over with captions, beat-synced music, and linked audio."""
import glob
import json
import os
import random
import sys

sys.path.insert(0, os.path.dirname(__file__))
import scripts  # noqa: E402
from tplkit import (AAC, AAC_VOICE, EASES, LABELS, MP3, OGG, Proj, anim, conv, cues_from_tts, grad, hexc, kf, pick_font, rgba, text_style, tts_words)  # noqa: E402

from tplkit import WORK as ROOT  # noqa: E402
G, DL, TTS = os.path.join(ROOT, "gen"), os.path.join(ROOT, "dl"), os.path.join(ROOT, "tts")
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "out")
random.seed(1)

p = Proj("01-montage-marathon", "01 Montage Marathon (vertical 30 fps, 20 min)", 1080, 1920, fps=(30, 1), background=(0, 0, 0))
W, H = p.w, p.h
f = p.f
DISP = pick_font("Anton")
MONO = pick_font("JetBrains Mono", "Space Mono")

V1 = p.vtrack("A-roll cuts", height="L")
V2 = p.vtrack("Overlay 1")
V3 = p.vtrack("Overlay 2")
V4 = p.vtrack("Overlay 3", height="S")
V5 = p.vtrack("Overlay 4", height="S")
V6 = p.vtrack("Frames and flashes", height="S")
V7 = p.vtrack("Stickers", height="S")
V8 = p.vtrack("Titles")
V9 = p.vtrack("Cut counter", height="S")
V10 = p.vtrack("Chapter labels", height="S")
CC = p.ctrack({"text": text_style(pick_font("Montserrat"), 62, 800, stroke=(7, rgba(0, 0, 0)), case="upper"), "position": "custom", "x": 0, "y": 520,
               "maxWidth": 940, "maxLines": 2, "highlight": {"mode": "color", "color": hexc("#00e5ff"), "inactiveColor": rgba(1, 1, 1, 1)}})
A_VO = p.atrack("Voice-over", height="L")
A_MUS = p.atrack("Music")
A_MUS2 = p.atrack("Music (crossfade lane)")
A_FX = p.atrack("Transitions SFX")
A_FX2 = p.atrack("Hits SFX")
A_NAT = p.atrack("Natural sound (linked)")

# ---------------- media
stock = {os.path.basename(x)[:-4]: p.add_media(x, "video", bin="Stock video") for x in sorted(glob.glob(os.path.join(DL, "stock", "*.mp4")))}
photos = {os.path.basename(x)[:-4]: p.add_media(x, "image", bin="Stock photos") for x in sorted(glob.glob(os.path.join(DL, "stock", "*.jpg")))}
mg = {os.path.basename(x)[:-4]: p.add_media(x, "video", bin="Motion graphics") for x in sorted(glob.glob(os.path.join(G, "mg", "*.mp4")))}
counters = [p.add_media(x, "video", bin="Counters") for x in sorted(glob.glob(os.path.join(G, "counters", "*.mp4")))]
stickers = [p.add_media(x, "image", bin="Stickers") for x in sorted(glob.glob(os.path.join(G, "stickers", "*.webp")))]
music = [(p.add_media(conv(os.path.join(G, "audio", "music", "beat-120.wav"), "mon-beat-120.m4a", AAC), "audio", bin="Music"), 0.5),
         (p.add_media(conv(os.path.join(G, "audio", "music", "house-128.wav"), "mon-house-128.mp3", MP3), "audio", bin="Music"), 60 / 128)]
fx = {n: p.add_media(os.path.join(G, "audio", "sfx", f"{n}.wav"), "audio", bin="SFX") for n in
      ("whoosh-short", "whoosh-long", "whoosh-down", "riser", "impact", "sub-drop", "punch", "shutter", "glitch", "tape-stop", "drum-fill", "swoosh-tick")}
vo = {k: p.add_media(conv(os.path.join(TTS, "montage", f"{k}.wav"), f"mon-{k}.m4a", AAC_VOICE), "audio", bin="Voice-over") for k, _ in scripts.MONTAGE_VO}
frame_png = p.add_media(os.path.join(G, "overlays", "frame-film-tall.png"), "image", bin="Overlays")
grid_png = p.add_media(os.path.join(G, "overlays", "grid-thirds.png"), "image", bin="Overlays")
vig = p.add_media(os.path.join(G, "overlays", "vignette-tall.png"), "image", bin="Overlays")


def pool(*keys):
    out = [m for k, m in list(stock.items()) + list(mg.items()) if any(x in k for x in keys)]
    return out


CHAPTERS = [
    ("EARTH", "vo-earth", pool("earth", "hurricane", "aurora", "ocean", "forest", "waterfall", "snow"), ["photo-earth", "photo-earthrise"]),
    ("MOTION", "vo-motion", pool("waterfall", "ocean", "fireworks", "traffic", "shapes", "particles", "train", "river"), []),
    ("SKY", "vo-sky", pool("clouds", "lightning", "volcano", "snow", "aurora", "light-leak", "gradient"), []),
    ("CITY", "vo-city", pool("traffic", "city", "market", "train", "aerial", "night", "fireworks"), []),
    ("SPACE", "vo-space", pool("nasa"), ["photo-pillars", "photo-saturn", "photo-jupiter", "photo-aldrin"]),
    ("PATTERN", "vo-pattern", pool("mg-") + counters, []),
]
everything = list(stock.values()) + list(mg.values())
for c in CHAPTERS:
    if len(c[2]) < 6:
        c[2].extend(random.sample(everything, min(len(everything), 8)))

cut_no = 0


def cut_counter(start, dur):
    global cut_no
    cut_no += 1
    p.text(V9, start, dur, f"CUT {cut_no:04d}", text_style(MONO, 34, 700, fill=rgba(1, 1, 1, 0.75), align="right"), x=W / 2 - 40, y=-H / 2 + 60,
           anchor=(1, 0.5), name=f"Cut {cut_no}")


def a_roll(start, dur, mid, n, speed=1.0, src_in=None, treat=None):
    """One A-roll cut with a treatment chosen by its index."""
    avail = p.mdur(mid)
    if dur * speed / 30 > avail:
        speed = max(0.25, min(4.0, avail * 30 / dur * 0.98)) if avail * 30 / dur * 0.98 >= 0.25 else None
        if speed is None:
            return None
    span = dur * speed / 30
    src = src_in if src_in is not None else random.uniform(0, max(0.0, avail - span))
    s0 = p.fit_scale(mid, "cover")
    treat = treat or ["plain", "punch", "pan", "plain", "zoomout", "tilt", "plain", "flip"][n % 8]
    kw = {}
    if treat == "punch":
        kw["kf"] = kf(("transform.scale", [(0, s0, "easeOut"), (min(dur, 12), s0 * 1.22), (dur, s0 * 1.28)]))
    elif treat == "pan":
        info = p.media_info[mid]
        excess = max(0, info["width"] * s0 - W) / 2 if info["width"] else 0
        kw["kf"] = kf(("transform.x", [(0, excess * 0.9, "smooth"), (dur, -excess * 0.9)]))
    elif treat == "zoomout":
        kw["kf"] = kf(("transform.scale", [(0, s0 * 1.35, "easeOut"), (dur, s0)]))
    elif treat == "tilt":
        kw["kf"] = kf(("transform.rotation", [(0, -4, "smooth"), (dur, 4)]), ("transform.scale", [(0, s0 * 1.15, "linear"), (dur, s0 * 1.15)]))
    elif treat == "flip":
        kw["flip_h"] = True
    return p.video(V1, start, dur, mid, src_in=src, speed=speed, fit="cover", gain=-30, muted=n % 3 != 0, color=LABELS[n % 8], **kw)


def music_bed(start, length, which, track):
    mid, beat = music[which]
    pos, ids = start, []
    seg = p.ff(p.mdur(mid)) - f(2)  # loop on whole bars: drop the last 2 s tail
    bars = int(seg / (beat * 4 * 30))
    seg = f(bars * beat * 4)
    while pos < start + length:
        d = min(seg, start + length - pos)
        cid = p.audio(track, pos, d, mid, gain=-6, fades=(f(0.5) if pos == start else 0, f(2) if pos + d >= start + length else 0), name="Music loop")
        ids.append(cid)
        pos += d
    return ids


# ---------------- intro
t = 0
p.marker(0, "Intro", "grey")
p.text(V8, f(0.3), f(4.5), "MONTAGE\nMARATHON", text_style(DISP, 200, 400, line_height=0.88, fill=grad(hexc("#ffffff"), hexc("#00e5ff"))),
       anim_in=anim("lineReveal", 24, per="line", stagger=8), anim_out=anim("blurIn", 12))
p.text(V10, f(1.5), f(3), "20 minutes. 1,000+ cuts.", text_style(MONO, 44, 700), y=300, anim_in=anim("typewriter", 30, per="char"))
p.video(V1, 0, f(5), mg["mg-particles-vertical"], fit="cover", muted=True)
p.audio(A_FX2, 0, p.ff(p.mdur(fx["riser"])), fx["riser"], gain=-6)
t = f(5)

# ---------------- chapters
CH_LEN = 180.0  # seconds per chapter
prev_last = p.track_clips[V1][-1]
for ci, (name, vo_key, vids, phs) in enumerate(CHAPTERS):
    which = ci % 2
    mid_m, beat = music[which]
    c0 = t
    p.marker(c0, f"Chapter {ci + 1}: {name}", ["red", "orange", "teal", "blue", "violet", "green"][ci])
    bars_total = int(CH_LEN / (beat * 4))
    clen = f(bars_total * 4 * beat)
    music_bed(c0, clen, which, A_MUS if ci % 2 == 0 else A_MUS2)
    drop_bars = [16, 48] if bars_total > 60 else [16]
    # chapter title
    p.text(V8, c0, f(beat * 16), name, text_style(DISP, 260, 400, fill=hexc("#ffffff"), stroke=(10, rgba(0, 0, 0)), spacing=10),
           anim_in=anim("scaleBounce", 18, per="char", stagger=3), anim_out=anim("slideUp", 12),
           kf=kf(("transform.scale", [(0, 1.0, "linear"), (f(beat * 16), 1.12)])))
    p.text(V10, c0 + 6, f(beat * 8), f"CHAPTER {ci + 1}", text_style(MONO, 48, 700, fill=hexc("#00e5ff")), y=-200, anim_in=anim("typewriter", 20, per="char"))
    p.audio_any([A_FX2, A_FX], c0, p.ff(p.mdur(fx["impact"])), fx["impact"], gain=-4)
    # voice-over + captions after the title
    vlen = p.ff(p.mdur(vo[vo_key]))
    v0 = c0 + f(beat * 16)
    p.audio(A_VO, v0, vlen, vo[vo_key], fades=(2, 6), name=f"VO {name}")
    text = dict(scripts.MONTAGE_VO)[vo_key]
    for cs, ce, ctext, cw in cues_from_tts(tts_words(os.path.join(TTS, "montage", f"{vo_key}.json")), text, max_words=3, max_ms=1500):
        s, e = v0 + f(cs / 1000), v0 + f(ce / 1000)
        last = p.track_clips[CC][-1] if p.track_clips[CC] else None
        if last and p.clips[last]["start"] + p.clips[last]["duration"] > s:
            p.clips[last]["duration"] = max(1, s - p.clips[last]["start"])
        rel = [{"text": w, "start": v0 + f(ws / 1000) - s, "end": max(v0 + f(ws / 1000) - s + 1, v0 + f(we / 1000) - s)} for w, ws, we in cw]
        if e - s > 3:
            p.caption(s, e - s, ctext, words=rel)
    # A-roll: cuts on the beat grid
    beat_pos = lambda b: c0 + f(b * beat)  # noqa: E731
    b, n = 0, 0
    total_beats = bars_total * 4
    first_in_chapter = None
    while b < total_beats:
        bar = b // 4
        in_drop = any(d0 <= bar < d0 + 16 for d0 in drop_bars)
        length_beats = random.choice([1, 1, 2] if in_drop else [2, 2, 4, 1, 4])
        if b + length_beats > total_beats:
            length_beats = total_beats - b
        s, e = beat_pos(b), beat_pos(b + length_beats)
        mid = vids[(n * 5 + ci) % len(vids)]
        # speed ramps at the end of a build (the 4 bars before each drop)
        speed = 1.0
        if any(d0 - 4 <= bar < d0 for d0 in drop_bars):
            speed = [1.0, 1.5, 2.0, 3.0, 4.0][min(4, (b % 16) // 3)]
        elif n % 11 == 7:
            speed = 0.5
        cid = None
        if bar in drop_bars and b % 4 == 0 and n % 2 == 0:
            cid = p.freeze(V1, s, e - s, mid, at=random.uniform(0, max(0.1, p.mdur(mid) - 0.2)), fit="cover", name="Freeze hit")
        else:
            cid = a_roll(s, e - s, mid, n, speed=speed)
        if cid is None:
            cid = a_roll(s, e - s, mg["mg-gradient-vertical"], n)
        if first_in_chapter is None:
            first_in_chapter = cid
        prev = p.track_clips[V1][-2] if len(p.track_clips[V1]) > 1 else None
        if prev and p.clips[prev]["start"] + p.clips[prev]["duration"] == s and prev != prev_last:
            if n % 32 == 31:
                p.transition(prev, cid, "dipToBlack", 4, 4)
                p.audio_any([A_FX, A_FX2], s - 4, p.ff(p.mdur(fx["whoosh-down"])), fx["whoosh-down"], gain=-12)
            elif n % 8 == 3:
                p.transition(prev, cid, "crossDissolve", 3, 3)
            elif n % 16 == 9:
                p.transition(prev, cid, "dipToWhite", 2, 3)
                p.audio_any([A_FX, A_FX2], s, p.ff(p.mdur(fx["shutter"])), fx["shutter"], gain=-10)
        cut_counter(s, e - s)
        if in_drop and length_beats == 1 and n % 2 == 0:  # 2-frame white flash on the beat
            p.solid(V6, s, 2, rgba(1, 1, 1, 0.8), name="Beat flash") if p.free(V6, s, 2) else None
        if n % 6 == 0:
            p.audio_any([A_FX, A_FX2], max(0, s - 6), p.ff(p.mdur(fx["swoosh-tick"])), fx["swoosh-tick"], gain=-18)
        # linked natural sound for every 10th cut
        if n % 10 == 5 and p.media_info[mid]["hasAudio"] and p.free(A_NAT, s, e - s):
            grp = f"link-{ci}-{n}"
            clip = p.clips[cid]
            clip["linkGroup"] = grp
            p.audio(A_NAT, s, e - s, mid, src_in=clip["in"] / 1e6, speed=clip["speed"] if clip["speed"] else 1.0, gain=-14, link=grp, name="Linked natural sound") if clip["speed"] else None
        b += length_beats
        n += 1
    if prev_last and first_in_chapter:
        pl = p.clips[prev_last]
        if pl["start"] + pl["duration"] == p.clips[first_in_chapter]["start"]:
            p.transition(prev_last, first_in_chapter, "dipToWhite", 6, 6)
    prev_last = p.track_clips[V1][-1]
    # risers before drops, impacts on drops
    for d0 in drop_bars:
        p.audio_any([A_FX2, A_FX], beat_pos(d0 * 4) - p.ff(p.mdur(fx["riser"])), p.ff(p.mdur(fx["riser"])), fx["riser"], gain=-8)
        p.audio_any([A_FX2, A_FX], beat_pos(d0 * 4), p.ff(p.mdur(fx["impact"])), fx["impact"], gain=-4)
        p.marker(beat_pos(d0 * 4), f"{name} drop", "red")
    # overlays: PIP every 8 bars, split screens and 2x2 grids in drops, photos with Ken Burns
    for bar in range(8, bars_total - 4, 8):
        s, e = beat_pos(bar * 4), beat_pos(bar * 4 + 8)
        in_drop = any(d0 <= bar < d0 + 16 for d0 in drop_bars)
        if in_drop and bar % 16 == 0:
            for q in range(4):  # 2x2 grid
                m = vids[(bar + q * 3) % len(vids)]
                info = p.media_info[m]
                tw, th = W / 2, H / 2
                ta, sa = tw / th, info["width"] / info["height"]
                crop = {"left": round((1 - ta / sa) / 2, 4), "right": round((1 - ta / sa) / 2, 4)} if sa > ta else {"top": round((1 - sa / ta) / 2, 4), "bottom": round((1 - sa / ta) / 2, 4)}
                sc = th / info["height"] if sa > ta else tw / info["width"]
                d = min(e - s, p.ff(p.mdur(m)))
                p.video([V2, V3, V4, V5][q], s, d, m, fit=None, scale=sc, crop=crop, x=-W / 4 + (q % 2) * W / 2, y=-H / 4 + (q // 2) * H / 2, muted=True,
                        kf=kf(("transform.scale", [(0, 0.01, "overshoot"), (8 + q * 2, sc)])), name=f"Grid {q + 1}")
        elif in_drop:
            for q in range(2):  # split top/bottom
                m = vids[(bar * 3 + q * 7) % len(vids)]
                info = p.media_info[m]
                ta, sa = W / (H / 2), info["width"] / info["height"]
                crop = {"left": round((1 - ta / sa) / 2, 4), "right": round((1 - ta / sa) / 2, 4)} if sa > ta else {"top": round((1 - sa / ta) / 2, 4), "bottom": round((1 - sa / ta) / 2, 4)}
                sc = (H / 2) / info["height"] if sa > ta else W / info["width"]
                d = min(e - s, p.ff(p.mdur(m)))
                p.video([V2, V3][q], s, d, m, fit=None, scale=sc, crop=crop, y=-H / 4 + q * H / 2, muted=True,
                        kf=kf(("transform.x", [(0, W if q else -W, "easeOut"), (10, 0)])), name=f"Split {'top' if q == 0 else 'bottom'}")
            p.solid(V6, s, e - s, rgba(1, 1, 1), w=W, h=8, name="Split divider") if p.free(V6, s, e - s) else None
        else:
            m = vids[(bar * 7 + 3) % len(vids)]
            d = min(e - s, p.ff(p.mdur(m)))
            sc = p.fit_scale(m, "fit", (620, 620))
            x0 = 240 if bar % 16 else -240
            p.solid(V2, s, d, rgba(1, 1, 1), w=sc * p.media_info[m]["width"] + 16, h=sc * p.media_info[m]["height"] + 16, x=x0, y=-520,
                    kf=kf(("transform.y", [(0, -1400, "overshoot"), (12, -520), (d - 10, -520, "easeIn"), (d, -1400)])), name="PIP frame")
            p.video(V3, s, d, m, fit=None, scale=sc, x=x0, y=-520, muted=True, kf=kf(("transform.y", [(0, -1400, "overshoot"), (12, -520), (d - 10, -520, "easeIn"), (d, -1400)])),
                    name="Picture in picture")
            p.audio_any([A_FX, A_FX2], s, p.ff(p.mdur(fx["whoosh-short"])), fx["whoosh-short"], gain=-14)
    for k, ph in enumerate(phs):
        if ph in photos:
            bar = 4 + k * 24
            s, e = beat_pos(bar * 4), beat_pos(bar * 4 + 12)
            if p.free(V4, s, e - s):
                s0 = p.fit_scale(photos[ph], "cover")
                p.image(V4, s, e - s, photos[ph], fit=None, scale=s0, fades=(6, 6), kf=kf(("transform.scale", [(0, s0, "smooth"), (e - s, s0 * 1.2)])), name=f"Photo {ph}")
    for k in range(6):  # stickers
        s = c0 + f(beat * (24 + k * 40))
        d = f(beat * 8)
        if s + d < c0 + clen and stickers and p.free(V7, s, d):
            p.image(V7, s, d, stickers[(ci * 3 + k) % len(stickers)], fit=None, scale=0.9, x=300 - (k % 2) * 600, y=600,
                    kf=kf(("transform.scale", [(0, 0.01, "overshoot"), (10, 0.9)]), ("transform.rotation", [(0, -10, "smooth"), (d, 10)])))
    t = c0 + clen

# ---------------- finale
p.marker(t, "Finale", "pink")
fin = f(20)
p.audio(A_VO, t + f(2), p.ff(p.mdur(vo["vo-finale"])), vo["vo-finale"], name="VO finale")
p.text(V8, t, fin, f"{cut_no + 1} CUTS\nLATER", text_style(DISP, 220, 400, line_height=0.9, fill=grad(hexc("#00e5ff"), hexc("#ffffff"))),
       anim_in=anim("pop", 20, per="word", ease="overshoot"), anim_out=anim("fade", 30))
fm = mg["mg-light-leak"]
p.video(V1, t, min(fin, p.ff(p.mdur(fm))), fm, fit="cover", muted=True, fades=(0, 30))
p.transition(prev_last, p.track_clips[V1][-1], "crossDissolve", 15, 15)
p.audio(A_FX2, t, p.ff(p.mdur(fx["sub-drop"])), fx["sub-drop"], gain=-4) if p.free(A_FX2, t, p.ff(p.mdur(fx["sub-drop"]))) else None
total = t + fin
p.image(V6, 0, 1, grid_png, fit="cover", name="1-frame thirds grid") if p.free(V6, 0, 1) else None
p.image(V7, 0, f(5), frame_png, fit="cover", opacity=0.9, name="Film frame overlay") if p.free(V7, 0, f(5)) else None
p.extra_files["OPEN.txt"] = (f"Montage marathon: {cut_no} numbered cuts on V1 cut to a beat grid (120 and 128 BPM), punch-ins, pans, speed ramps, freeze hits, "
                             "dissolves and dips, picture in picture, split screens and 2x2 grids in the drops, and a cut counter on V9.\n")
ok = p.save(OUT)
print("length", total, "frames =", round(total / 30 / 60, 2), "min;", cut_no, "cuts;", len(p.track_clips[V1]), "A-roll clips")
sys.exit(0 if ok else 1)
