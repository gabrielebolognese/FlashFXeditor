"""03 WW2 documentary: archival film, narration with word-timed subtitles, maps, stills, title cards, music and sound."""
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import scripts  # noqa: E402
from tplkit import (AAC, AAC_VOICE, MP3, OGG, OPUS_OGG, Proj, anim, conv, cues_from_tts, grad, hexc, kf, pick_font, rgba, text_style,  # noqa: E402
                    tts_words)

from tplkit import WORK as ROOT  # noqa: E402
G, DL, TTS = os.path.join(ROOT, "gen"), os.path.join(ROOT, "dl"), os.path.join(ROOT, "tts")
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "out")

p = Proj("03-ww2-documentary", "03 The Second World War (documentary, 1080p 24)", 1920, 1080, fps=(24, 1), background=(0, 0, 0))
W, H = p.w, p.h
f = p.f
SERIF = pick_font("Playfair Display")
DISPLAY = pick_font("Cinzel")
TYPE = pick_font("Special Elite", "Courier Prime")
CAPS = pick_font("Oswald")
BODY = pick_font("Lora", "Merriweather")
SUB = pick_font("Source Sans 3", "Lato", "Inter")

V1 = p.vtrack("Archival film", height="L")
V2 = p.vtrack("Stills and maps")
V3 = p.vtrack("Map arrows", height="S")
V4 = p.vtrack("Map pins", height="S")
V5 = p.vtrack("Map labels", height="S")
V6 = p.vtrack("Card backdrop", height="S")
V7 = p.vtrack("Lower third bars", height="S")
V8 = p.vtrack("Titles")
V9 = p.vtrack("Dates and credits")
V10 = p.vtrack("Chapter numbers", height="S")
V11 = p.vtrack("Letterbox", height="S")
V12 = p.vtrack("Vignette", height="S")
V13 = p.vtrack("Film grain", height="S")
CC = p.ctrack({"text": text_style(SUB, 46, 600, stroke=(4, rgba(0, 0, 0, 0.9)), bg=(rgba(0, 0, 0, 0.45), 18, 8, 6, "line"), line_height=1.15),
               "position": "bottom", "x": 0, "y": 0, "maxWidth": 1500, "maxLines": 2,
               "highlight": {"mode": "color", "color": hexc("#ffd166"), "inactiveColor": rgba(1, 1, 1, 0.92)}})
A1 = p.atrack("Narration", height="L")
A2 = p.atrack("Music A")
A3 = p.atrack("Music B")
A4 = p.atrack("Sound effects")
A5 = p.atrack("Typewriter keys", height="S")
A6 = p.atrack("Ambience")

# ---------------- media
films = {}
for path in sorted(glob.glob(os.path.join(DL, "ww2", "*.mp4"))):
    base = os.path.basename(path)
    key = base.rsplit("_", 1)[0] if "_" in base else base[:-4]
    films.setdefault(key, []).append(p.add_media(path, "video", bin="Archival film"))
stills = {os.path.basename(x)[:-4]: p.add_media(x, "image", bin="Photos and maps") for x in sorted(glob.glob(os.path.join(DL, "ww2", "*.jpg")))}
mapanim = films.get("map-anim-", [None])[0] or next((v[0] for k, v in films.items() if k.startswith("map-anim")), None)

au = os.path.join(DL, "audio")
music = {
    "andante": p.add_media(conv(os.path.join(au, "beethoven-5-ii.ogg"), "doc-beethoven-5-ii.ogg", OGG, seconds=300), "audio", bin="Music"),
    "allegro": p.add_media(conv(os.path.join(au, "beethoven-5-i.ogg"), "doc-beethoven-5-i.mp3", MP3, seconds=240), "audio", bin="Music"),
    "march": p.add_media(conv(os.path.join(au, "radetzky-march.mp3"), "doc-radetzky-march.m4a", AAC), "audio", bin="Music"),
    "cinematic": p.add_media(conv(os.path.join(G, "audio", "music", "cinematic.wav"), "doc-cinematic.m4a", AAC), "audio", bin="Music"),
}
sfx = {n: p.add_media(conv(os.path.join(au, src), f"doc-{n}.{ext}", args), "audio", bin="Sound effects") for n, src, ext, args in [
    ("siren", "siren.ogg", "ogg", OGG), ("explosion-1", "explosion-1.ogg", "ogg", OGG), ("explosion-2", "explosion-2.ogg", "ogg", OGG),
    ("sonic-boom", "sonic-boom.ogg", "ogg", OGG), ("morse", "morse.wav", "mp3", MP3), ("rain-thunder", "rain-thunder.ogg", "ogg", OGG),
    ("church-bells", "church-bells.oga", "ogg", OPUS_OGG), ("clapping", "clapping-hurray.ogg", "ogg", OGG), ("march-band", "march-band-passing.ogg", "ogg", OGG),
    ("static", "static.wav", "m4a", AAC), ("steam", "steam-engine.ogg", "ogg", OGG), ("wind", "wind-1.ogg", "ogg", OGG), ("ding", "typewriter-ding.wav", "m4a", AAC)]}
keys = [p.add_media(os.path.join(G, "audio", "sfx", f"type-key-{i}.wav"), "audio", bin="Sound effects") for i in range(1, 6)]
impact = p.add_media(conv(os.path.join(G, "audio", "sfx", "impact.wav"), "doc-impact.mp3", MP3), "audio", bin="Sound effects")
grain = p.add_media(os.path.join(G, "mg", "mg-film-grain.mp4"), "video", bin="Overlays")
vignette = p.add_media(os.path.join(G, "overlays", "vignette-wide.png"), "image", bin="Overlays")
pin = p.add_media(os.path.join(G, "overlays", "map-pin.svg"), "image", bin="Overlays")
narr = {cid: p.add_media(conv(os.path.join(TTS, "doc", f"{cid}.wav"), f"doc-narration-{cid}.m4a", AAC_VOICE), "audio", bin="Narration")
        for cid, *_ in scripts.DOC}

# ---------------- map helpers
MAPS = {"europe41": ("map-europe-1941", 1090, 1000), "europe43": ("map-europe-1943", 1090, 1000), "asia45": ("map-asia-1945", 780, 600)}
PLACES = {
    "berlin": ("europe41", 0.44, 0.53), "warsaw": ("europe41", 0.57, 0.53), "moscow": ("europe41", 0.74, 0.33), "london": ("europe41", 0.24, 0.50),
    "paris": ("europe41", 0.28, 0.62), "dunkirk": ("europe41", 0.29, 0.56), "stalingrad": ("europe41", 0.95, 0.55), "rome": ("europe41", 0.45, 0.79),
    "normandy": ("europe43", 0.23, 0.60), "sicily": ("europe43", 0.47, 0.92), "elalamein": ("europe43", 0.80, 0.99), "rhine": ("europe43", 0.36, 0.58),
    "pearl": ("asia45", 0.965, 0.48), "midway": ("asia45", 0.78, 0.38), "iwojima": ("asia45", 0.50, 0.43), "okinawa": ("asia45", 0.35, 0.40),
    "tokyo": ("asia45", 0.47, 0.30), "hiroshima": ("asia45", 0.41, 0.33), "leyte": ("asia45", 0.35, 0.57), "guam": ("asia45", 0.45, 0.59),
}
LABEL = text_style(CAPS, 40, 700, stroke=(5, rgba(0, 0, 0, 0.85)), case="upper", spacing=3)


def map_sequence(start, dur, which, focus, zoom, places, arrows=()):
    """A still map: zooms from the whole map to `focus` in 3 s, then holds while pins, labels and arrows appear."""
    name, iw, ih = MAPS[which]
    mid = stills[name]
    s0 = max(W / iw, H / ih)
    s1 = s0 * zoom
    fx, fy = focus
    x1, y1 = -(fx - 0.5) * iw * s1, -(fy - 0.5) * ih * s1
    x1 = max(-(iw * s1 - W) / 2, min((iw * s1 - W) / 2, x1))
    y1 = max(-(ih * s1 - H) / 2, min((ih * s1 - H) / 2, y1))
    z = f(3)
    p.image(V2, start, dur, mid, fit=None, scale=s0, fades=(10, 10), name=f"Map {name}",
            kf=kf(("transform.scale", [(0, s0, "easeInOut"), (z, s1)]), ("transform.x", [(0, 0, "easeInOut"), (z, x1)]),
                  ("transform.y", [(0, 0, "easeInOut"), (z, y1)])))

    def at(place):
        _, u, v = PLACES[place]
        return x1 + (u - 0.5) * iw * s1, y1 + (v - 0.5) * ih * s1
    t = start + z
    for i, place in enumerate(places):
        px, py = at(place)
        ps = start + z + i * 8
        if not p.free(V4, ps, start + dur - ps):
            continue
        p.image(V4, ps, start + dur - ps, pin, fit=None, scale=0.22, x=px, y=py, anchor=(0.5, 1.0), name=f"Pin {place}",
                kf=kf(("transform.scale", [(0, 0.01, "overshoot"), (10, 0.22)])), fades=(0, 8))
        p.text(V5, ps + 4, start + dur - ps - 4, place.replace("elalamein", "El Alamein").replace("iwojima", "Iwo Jima").title() if place not in ("elalamein", "iwojima") else
               {"elalamein": "El Alamein", "iwojima": "Iwo Jima"}[place], LABEL, x=px, y=py + 34, anim_in=anim("pop", 8), anim_out=anim("fade", 6),
               name=f"Label {place}") if p.free(V5, ps + 4, start + dur - ps - 4) else None
    for j, (a, b, col) in enumerate(arrows):
        ax, ay = at(a)
        bx, by = at(b)
        import math
        length = math.hypot(bx - ax, by - ay)
        ang = math.degrees(math.atan2(by - ay, bx - ax))
        s = t + 12 + j * 10
        d = start + dur - s
        if d < 12 or not p.free(V3, s, d):
            continue
        p.solid(V3, s, d, col, w=length, h=14, shape="line", radius=7, x=ax, y=ay, rot=ang, anchor=(0, 0.5), scale_y=1.0, name=f"Arrow {a} to {b}",
                kf=kf(("transform.scale", [(0, 0.01, "easeOut"), (f(1.4), 1.0)])), fades=(0, 8))


def ken_burns(track, start, dur, mid, zoom_in=True, pan=(0, 0), name=None):
    s0 = p.fit_scale(mid, "cover")
    a, b = (s0, s0 * 1.14) if zoom_in else (s0 * 1.14, s0)
    p.image(track, start, dur, mid, fit=None, scale=a, fades=(12, 12), name=name,
            kf=kf(("transform.scale", [(0, a, "smooth"), (dur, b)]), ("transform.x", [(0, -pan[0], "smooth"), (dur, pan[0])]),
                  ("transform.y", [(0, -pan[1], "smooth"), (dur, pan[1])])))


def fill_film(start, end, keys_, chapter_i):
    """Archival clips over [start, end) on V1: varied lengths, in points, push-ins, slow motion, cuts and dissolves."""
    pool = [m for k in keys_ for m in films.get(k, [])]
    ids, pos, n = [], start, 0
    while pos < end:
        mid = pool[(n * 7 + chapter_i) % len(pool)]
        d = min(f([5.5, 7, 4.5, 6, 8][n % 5]), end - pos)
        if end - (pos + d) < f(2):
            d = end - pos
        speed = 0.75 if n % 6 == 4 else 1.0
        avail = p.mdur(mid)
        if d * speed / 24 > avail:
            d = int(avail * 24 / speed) - 1
        src_in = max(0.0, min(avail - d * speed / 24, [0.4, 1.5, 0.0, 2.2][n % 4]))
        mode = "fit" if n % 3 else "cover"
        push = None
        if n % 4 == 1:
            s0 = p.fit_scale(mid, mode)
            push = kf(("transform.scale", [(0, s0, "linear"), (d, s0 * 1.08)]))
        cid = p.video(V1, pos, d, mid, src_in=src_in, speed=speed, fit=mode, gain=-22, muted=(n % 5 == 3), kf=push)
        if ids and n % 3 == 0:
            p.transition(ids[-1], cid, "crossDissolve", 10, 10)
        ids.append(cid)
        pos += d
        n += 1
    return ids


def lower_third(start, title, credit):
    d = f(5.5)
    p.solid(V7, start, d, rgba(0.45, 0.05, 0.05, 0.85), w=760, h=104, shape="roundedRect", radius=8, x=-W / 2 + 480, y=H / 2 - 210,
            kf=kf(("transform.x", [(0, -W / 2 - 400, "easeOut"), (f(0.6), -W / 2 + 480), (d - f(0.6), -W / 2 + 480, "easeIn"), (d, -W / 2 - 400)])),
            name=f"Lower third bar: {title}")
    p.text(V8, start + 6, d - 6, title, text_style(CAPS, 46, 700, case="upper", spacing=4, align="left"), x=-W / 2 + 130, y=H / 2 - 226,
           anchor=(0, 0.5), anim_in=anim("slideRight", 10), anim_out=anim("fade", 8), name=f"Lower third: {title}")
    p.text(V9, start + 10, d - 10, credit, text_style(BODY, 26, 400, italic=True, fill=rgba(1, 1, 1, 0.85), align="left"), x=-W / 2 + 132, y=H / 2 - 186,
           anchor=(0, 0.5), anim_in=anim("fade", 10), anim_out=anim("fade", 8), name=f"Credit: {credit}")


def type_sounds(start, text, frames):
    """One key click per character of a typewriter animation, then the bell."""
    step = max(1, frames // max(1, len(text)))
    for i, ch in enumerate(text):
        if ch == " ":
            continue
        s = start + i * step
        if p.free(A5, s, 2):
            p.audio(A5, s, 2, keys[i % 5], gain=-4, name=f"Key {ch}")
    s = start + len(text) * step + 2
    if p.free(A5, s, f(0.9)):
        p.audio(A5, s, f(0.9), sfx["ding"], gain=-8, name="Bell")


# ---------------- opening
p.solid(V6, 0, f(22), rgba(0, 0, 0, 1), name="Black")
p.audio(A4, f(0.5), f(9), sfx["morse"], gain=-10, fades=(12, 24))
if mapanim:
    p.video(V1, f(3), f(19), mapanim, src_in=2.0, fit="fit", opacity=0.4, fades=(24, 0), muted=True,
            kf=kf(("transform.scale", [(0, p.fit_scale(mapanim, "fit"), "linear"), (f(19), p.fit_scale(mapanim, "fit") * 1.12)])))
p.text(V8, f(2), f(10), "THE SECOND WORLD WAR", text_style(DISPLAY, 132, 700, fill=grad(hexc("#ffffff"), hexc("#a9a9a9")), spacing=14,
       shadow=(0, 8, 30, rgba(0, 0, 0, 0.9))), anim_in=anim("blurIn", 36), anim_out=anim("fade", 18),
       kf=kf(("transform.scale", [(0, 1.0, "linear"), (f(10), 1.06)])))
p.text(V9, f(4), f(8), "1939 - 1945", text_style(SERIF, 72, 400, spacing=28, fill=hexc("#d9c7a3")), y=120, anim_in=anim("lineReveal", 24), anim_out=anim("fade", 18))
p.text(V10, f(12.5), f(7.5), "A documentary in fourteen chapters", text_style(BODY, 52, 400, italic=True), anim_in=anim("wordFade", 30, per="word"),
       anim_out=anim("fade", 18))
p.marker(0, "Opening titles", "grey")

# ---------------- chapters
COLORS = ["grey", "red", "orange", "blue", "teal", "red", "blue", "teal", "green", "orange", "blue", "green", "red", "grey"]
CH_MUSIC = ["andante", "andante", "andante", "cinematic", "cinematic", "allegro", "allegro", "cinematic", "andante", "allegro", "cinematic", "march", "cinematic", "andante"]
FILMS = {"prologue": ["prelude"], "poland": ["nazis-strike"], "france": ["divide"], "britain": ["britain"], "barbarossa": ["russia1"], "pearl": ["dec7"],
         "midway": ["midway"], "stalingrad": ["russia2"], "turning": ["color-1944"], "dday": ["normandy", "dday-owi"], "pacific": ["iwo-flag", "midway"],
         "ve": ["ve-day"], "surrender": ["hiroshima", "truman"], "epilogue": ["surrender", "ve-day", "normandy"]}
STILLS = {"prologue": [], "poland": [], "france": [], "britain": ["photo-spitfire", "photo-london-blitz", "photo-churchill"], "barbarossa": [],
          "pearl": ["photo-arizona"], "midway": [], "stalingrad": ["photo-stalingrad"], "turning": ["photo-rosie", "photo-b17"], "dday": ["photo-dday"],
          "pacific": ["photo-iwo-flag"], "ve": ["photo-ve-day", "photo-yalta"], "surrender": ["photo-nagasaki", "photo-missouri"], "epilogue": ["photo-st-pauls", "photo-yalta"]}
MAPSEQ = {
    "poland": ("europe41", (0.52, 0.52), 2.2, ["berlin", "warsaw"], [("berlin", "warsaw", hexc("#c0392b"))]),
    "france": ("europe41", (0.30, 0.57), 2.4, ["dunkirk", "paris", "london"], [("berlin", "paris", hexc("#c0392b")), ("dunkirk", "london", hexc("#2980b9"))]),
    "barbarossa": ("europe41", (0.66, 0.45), 1.6, ["warsaw", "moscow"], [("warsaw", "moscow", hexc("#c0392b"))]),
    "pearl": ("asia45", (0.75, 0.40), 1.5, ["tokyo", "pearl"], [("tokyo", "pearl", hexc("#c0392b"))]),
    "midway": ("asia45", (0.70, 0.40), 1.8, ["midway", "pearl"], [("pearl", "midway", hexc("#2980b9"))]),
    "stalingrad": ("europe41", (0.82, 0.50), 2.0, ["moscow", "stalingrad"], [("warsaw", "stalingrad", hexc("#c0392b"))]),
    "turning": ("europe43", (0.55, 0.85), 1.6, ["elalamein", "sicily", "rome"], [("elalamein", "sicily", hexc("#2980b9")), ("sicily", "rome", hexc("#2980b9"))]),
    "dday": ("europe43", (0.27, 0.58), 2.4, ["normandy", "paris"], [("london", "normandy", hexc("#2980b9")), ("normandy", "paris", hexc("#2980b9"))]),
    "pacific": ("asia45", (0.45, 0.45), 1.8, ["leyte", "iwojima", "okinawa", "tokyo"], [("guam", "iwojima", hexc("#2980b9")), ("leyte", "okinawa", hexc("#2980b9"))]),
    "surrender": ("asia45", (0.43, 0.32), 2.6, ["hiroshima", "tokyo"], []),
}
SOUND_WORDS = {"britain": [("Blitz", "siren", -6, 6)], "pearl": [("attacked", "explosion-1", -4, 3), ("sunk", "explosion-2", -4, 3)],
               "dday": [("beaches", "sonic-boom", -8, 4), ("terrible", "explosion-1", -6, 3)], "stalingrad": [("freezing", "wind", -10, 8)],
               "ve": [("celebrate", "clapping", -6, 6)], "surrender": [("radio", "static", -10, 3)], "turning": [("factories", "steam", -10, 6)],
               "poland": [("bombers", "sonic-boom", -10, 4)]}

t = f(22)
music_track = [A2, A3]
credits_used = set()
for i, (cid, title, date, _film, text) in enumerate(scripts.DOC):
    words = tts_words(os.path.join(TTS, "doc", f"{cid}.json"))
    nlen = p.mdur(narr[cid])
    ch_len = f(4.0 + nlen + 2.5)
    t0 = t
    p.marker(t0, f"Chapter {i + 1}: {title}", COLORS[i])
    film_ids = fill_film(t0, t0 + ch_len, FILMS[cid], i)
    if i > 0 and prev_last and film_ids:
        p.transition(prev_last, film_ids[0], "dipToBlack", 12, 12)
    prev_last = film_ids[-1]
    # title card
    p.solid(V6, t0, f(5), rgba(0, 0, 0, 0.72), fades=(12, 14), name=f"Card backdrop {i + 1}")
    p.text(V10, t0 + 4, f(4.6), f"Chapter {i + 1}", text_style(CAPS, 40, 500, case="upper", spacing=14, fill=hexc("#d9c7a3")), y=-130,
           anim_in=anim("slideUp", 12), anim_out=anim("fade", 10))
    p.text(V8, t0 + 8, f(4.4), title, text_style(SERIF, 112, 700, shadow=(0, 6, 24, rgba(0, 0, 0, 0.9))),
           anim_in=anim(["lineReveal", "blurIn", "fade", "wordPop"][i % 4], 18, per="word" if i % 4 == 3 else None), anim_out=anim("fade", 10))
    tw = f(1.6)
    p.text(V9, t0 + 18, f(4), date, text_style(TYPE, 52, 400, fill=hexc("#f1e9d2")), y=110, anim_in=anim("typewriter", tw, per="char", ease="linear"),
           anim_out=anim("fade", 8), name=f"Date: {date}")
    type_sounds(t0 + 18, date, tw)
    p.audio_any([A4, A6], t0 + 2, f(1.6), impact, gain=-9, name="Card impact")
    # narration and its subtitles
    n0 = t0 + f(4.0)
    p.audio(A1, n0, p.ff(nlen), narr[cid], gain=0, fades=(2, 6), name=f"Narration: {title}")
    for cs, ce, ctext, cw in cues_from_tts(words, text):
        s = n0 + f(cs / 1000)
        e = n0 + f(ce / 1000) + 2
        prev = p.track_clips[CC][-1] if p.track_clips[CC] else None
        if prev and p.clips[prev]["start"] + p.clips[prev]["duration"] > s:
            pc = p.clips[prev]
            pc["duration"] = max(1, s - pc["start"])
            if pc.get("words"):
                for wd in pc["words"]:
                    wd["end"] = min(wd["end"], pc["duration"] + 6)
                    wd["start"] = min(wd["start"], wd["end"] - 1)
        rel = [{"text": w, "start": n0 + f(ws / 1000) - s, "end": max(n0 + f(ws / 1000) - s + 1, n0 + f(we / 1000) - s)} for w, ws, we in cw]
        p.caption(s, max(e - s, 6), ctext, words=rel)
    # word-cued sound effects
    for word, name, gain, secs in SOUND_WORDS.get(cid, []):
        hit = next((w for w in words if w["w"].lower().startswith(word.lower())), None)
        if hit:
            s = n0 + f(hit["t"] / 1000)
            d = min(f(secs), p.ff(p.mdur(sfx[name])))
            p.audio_any([A4, A6], s, d, sfx[name], gain=gain, fades=(4, 12), name=f"SFX {name} on '{word}'")
    # music bed, ducked under the narration
    mm = music[CH_MUSIC[i]]
    mt = music_track[i % 2]
    mlen = min(ch_len + f(1.0), p.ff(p.mdur(mm)) - f(1))
    src = (i * 37.0) % max(1.0, p.mdur(mm) - mlen / 24 - 1)
    duck = kf(("volume.gainDb", [(0, -12, "smooth"), (f(3.6), -12, "smooth"), (f(4.4), -24, "smooth"), (f(4.0 + nlen), -24, "smooth"), (f(4.0 + nlen + 1.0), -14)]))
    p.audio(mt, t0, mlen, mm, src_in=src, fades=(f(1.0), f(1.5)), kf=duck, name=f"Music: {CH_MUSIC[i]}")
    # stills with Ken Burns, a map sequence, the lower third
    cursor = n0 + f(6.5)
    lower_third(n0 + f(1.0), title if cid not in ("prologue", "epilogue") else ("Europe, 1939" if cid == "prologue" else "After the war"),
                "Archival film: " + {"prelude": "Prelude to War (1942)", "nazis-strike": "The Nazis Strike (1943)", "divide": "Divide and Conquer (1943)",
                                     "britain": "The Battle of Britain (1943)", "russia1": "The Battle of Russia (1943)", "dec7": "December 7th (1943)",
                                     "midway": "The Battle of Midway (1942)", "russia2": "The Battle of Russia (1943)", "color-1944": "US Army colour film (1944)",
                                     "normandy": "Normandy Invasion (1944)", "iwo-flag": "Flag Raising on Iwo Jima (NARA)", "ve-day": "The War Ends in Europe (1945)",
                                     "hiroshima": "US Air Force film (1946)", "surrender": "Appointment in Tokyo (1945)"}.get(FILMS[cid][0], "National Archives"))
    if cid in MAPSEQ:
        which, focus, zoom, places, arrows = MAPSEQ[cid]
        md = f(10)
        map_sequence(cursor, md, which, focus, zoom, places, arrows)
        cursor += md + f(4)
    for j, sname in enumerate(STILLS[cid]):
        d = f(6.5)
        if cursor + d > t0 + ch_len - f(2):
            break
        if sname in stills and p.free(V2, cursor, d):
            ken_burns(V2, cursor, d, stills[sname], zoom_in=j % 2 == 0, pan=(40 * (1 if j % 2 else -1), 10), name=f"Still {sname}")
            cursor += d + f(5)
    if cid == "dday":  # letterbox bars slide in for the landing
        for sgn in (-1, 1):
            p.solid(V11, t0 + f(6), ch_len - f(8), rgba(0, 0, 0, 1), w=W, h=130, y=sgn * (H / 2 - 65), name=f"Letterbox {'top' if sgn < 0 else 'bottom'}",
                    kf=kf(("transform.y", [(0, sgn * (H / 2 + 65), "easeOut"), (f(1.2), sgn * (H / 2 - 65))]))) if p.free(V11, t0 + f(6), ch_len - f(8)) else None
    if cid == "ve":
        p.audio_any([A6, A4], t0 + f(6), p.ff(min(14, p.mdur(sfx["church-bells"]))), sfx["church-bells"], gain=-14, fades=(12, 36), name="Church bells")
    if cid == "stalingrad":
        p.audio_any([A6, A4], t0, min(ch_len, p.ff(p.mdur(sfx["rain-thunder"]))), sfx["rain-thunder"], gain=-16, fades=(24, 24), name="Rain and thunder")
    t = t0 + ch_len

# ---------------- end credits
end0 = t
last_film = films["surrender"][-1]
p.freeze(V1, end0, f(36), last_film, at=6.0, fit="fit", opacity=0.35, name="Freeze for the credits")
p.transition(prev_last, p.track_clips[V1][-1], "dipToWhite", 6, 18)
p.marker(end0, "End credits", "grey")
p.text(V8, end0 + f(1), f(7), "In memory of all who lived through it", text_style(SERIF, 64, 400, italic=True), anim_in=anim("fade", 24),
       anim_out=anim("fade", 24))
cred = json.load(open(os.path.join(DL, "credits.json"), encoding="utf-8"))
lines = ["ARCHIVAL SOURCES", ""]
seen = set()
for k, v in cred.items():
    if k.startswith("ww2/") and v.get("title") not in seen:
        seen.add(v.get("title"))
        lines.append(f"{v.get('title', '').rsplit('.', 1)[0][:70]}  ({v.get('license', '')})")
lines += ["", "NARRATION", "Microsoft David (text to speech)", "", "MUSIC", "Beethoven, Symphony No. 5 (public domain recording)",
          "Strauss, Radetzky March, US Marine Band (public domain)", "Original underscore (synthesized)", "", "Made to test the Shorts Editor"]
body = "\n".join(lines)
lh = 40 * 1.4
height = len(lines) * lh
roll = f(26)
p.text(V9, end0 + f(9), roll, body, text_style(BODY, 40, 400, line_height=1.4), box={"mode": "fixed", "width": 1500}, name="Credits roll",
       kf=kf(("transform.y", [(0, H / 2 + height / 2, "linear"), (roll, -H / 2 - height / 2)])))
p.audio(A2, end0, f(36), music["andante"], src_in=200.0, fades=(f(2), f(4)), gain=-10, name="Music: credits")
total = end0 + f(36)

# ---------------- overlays over the whole film
p.image(V12, 0, total, vignette, fit="cover", opacity=0.85, name="Vignette")
g = 0
while g < total:
    d = min(p.ff(p.mdur(grain)), total - g)
    p.video(V13, g, d, grain, fit="cover", opacity=0.10, muted=True, name="Film grain")
    g += d

p.extra_files["OPEN.txt"] = ("The Second World War, 1939-1945: a 14 chapter documentary made from public domain archival film (US National Archives, "
                             "Why We Fight series and others on Wikimedia Commons), narrated by text to speech. Sources and licenses: CREDITS.md.\n")
ok = p.save(OUT)
print("length", p.length(), "frames =", round(p.length() / 24 / 60, 2), "min")
sys.exit(0 if ok else 1)
