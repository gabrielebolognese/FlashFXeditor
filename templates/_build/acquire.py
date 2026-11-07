"""Fetches the free media of the templates into dl/ (archival WW2 film, stock b-roll, sounds, music, images).

Usage: python -I acquire.py <lib dir> <dl dir> <what...>   (what: ww2 stock audio images)
Writes dl/<group>/<file> and dl/credits.json (file -> source, title, page, license, author).
"""
import json
import os
import re
import sys

sys.path.insert(0, sys.argv[1])
from fetch import (Credits, commons_file, commons_search, cut_video, download, nasa_asset, nasa_search, run)  # noqa: E402

DL = sys.argv[2]
WHAT = set(sys.argv[3:])
credits = Credits(os.path.join(DL, "credits.json"))
log = []


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:40]


def spread(duration, count, seg, lo=0.08, hi=0.92):
    usable_lo, usable_hi = duration * lo, max(duration * lo, duration * hi - seg)
    if count == 1:
        return [usable_lo + (usable_hi - usable_lo) * 0.5]
    return [usable_lo + (usable_hi - usable_lo) * i / (count - 1) for i in range(count)]


def segments_from(record, group, name, count, seg=9.0, starts=None, width=1280, height=720, fit="keep", audio=True, crf=26):
    os.makedirs(os.path.join(DL, group), exist_ok=True)
    duration = float(record.get("duration") or 0)
    if not duration and not starts:
        log.append(f"no duration: {record['title']}")
        return 0
    starts = starts or spread(duration, count, seg)
    made = 0
    for i, start in enumerate(starts):
        out = os.path.join(DL, group, f"{name}_{i + 1:02d}.mp4")
        if cut_video(record["url"], start, seg, out, width, height, audio=audio, fit=fit, crf=crf):
            credits.add(f"{group}/{os.path.basename(out)}", {**record, "description": f"{record.get('description', '')} [segment at {start:.0f} s]".strip()})
            made += 1
    log.append(f"{group}/{name}: {made}/{len(starts)}")
    return made


# ---------- WW2 archival film (all public domain US/UK government or expired works) ----------
WW2 = [
    ("prelude", "Why We Fight.1.Prelude to War.webm", 3),
    ("nazis-strike", "Why We Fight.2.The Nazis Strike.webm", 4),
    ("divide", "Why We Fight.3.Divide And Conquer.webm", 4),
    ("britain", "Why We Fight.4.Battle of Britain.webm", 4),
    ("russia1", "Why We Fight.5a.The Battle Of Russia Part1.webm", 3),
    ("russia2", "Why We Fight.5b.The Battle Of Russia Part2.webm", 4),
    ("red-square", "Red Square military parade November 7, 1941.ogv", 2),
    ("dec7", "December 7th (1943).webm", 4),
    ("midway", "The Battle of Midway (1942).webm", 4),
    ("doolittle", "Doolittle Raid Over Tokyo.ogv", 2),
    ("normandy", "Normandy Invasion.webm", 4),
    ("dday-owi", "D-Day 1944 Office of War Information.webm", 3),
    ("iwo-flag", "Flag Raising on Iwo Jima NARA.webm", 2),
    ("iwo-shores", "To the Shores of Iwo Jima.ogv", 2),
    ("ve-day", "The War Ends in Europe.webm", 3),
    ("truman", "President Harry S. Truman on the Atomic Bombing of Hiroshima (1945).webm", 2),
    ("hiroshima", "342-usaf-11080 Hiroshima-Blast Effects.webm", 2),
]

if "ww2" in WHAT:
    for name, title, count in WW2:
        record = commons_file(title)
        if not record:
            log.append(f"missing: {title}")
            continue
        segments_from(record, "ww2", name, count)
    # The surrender on USS Missouri closes "Appointment in Tokyo".
    record = commons_file("Appointment in Tokyo.webm")
    if record:
        d = float(record["duration"])
        segments_from(record, "ww2", "surrender", 2, starts=[d - 260, d - 170])
    # Long colour reel: France and Luxembourg, 1944.
    hits = commons_search("World War II color footage American troops France Luxembourg", "video", limit=10)
    hits = [h for h in hits if h["title"].lower().startswith("world war ii color footage")]
    if hits:
        segments_from(hits[0], "ww2", "color-1944", 3)
    # Animated maps of the war in Europe.
    for query in ("Second World War Europe 1939-1945 animation", "Second World War Europe 1939-1942"):
        for hit in commons_search(query, "video", limit=10):
            if "second world war europe" in hit["title"].lower() and float(hit.get("duration") or 0) < 400:
                out = os.path.join(DL, "ww2", f"map-anim-{slug(hit['title'])[-12:]}.mp4")
                if cut_video(hit["url"], 0, float(hit["duration"]), out, 1280, 1128, audio=False, fit="keep", crf=24):
                    credits.add(f"ww2/{os.path.basename(out)}", hit)
                    log.append(f"map anim: {hit['title']}")
                break

# ---------- Stock b-roll: NASA (public domain) and Commons (PD / CC) ----------
NASA_QUERIES = ["ISS earth timelapse", "rocket launch", "aurora from space", "hurricane from space", "Artemis I launch",
                "Mars rover landing animation", "solar flare", "Apollo 11 launch", "astronaut spacewalk", "galaxy visualization",
                "earth city lights night", "space shuttle launch"]
COMMONS_STOCK = ["timelapse clouds", "waterfall", "city traffic night", "fireworks", "ocean waves beach", "forest drone",
                 "snow falling", "volcano eruption", "lightning storm", "street market", "train", "flowers macro",
                 "time-lapse city", "aerial view", "river"]
BAD_STOCK = re.compile(r"interview|speech|lecture|conference|wikipedia|presentation|tutorial|ceremony|press|trump|biden|obama", re.I)

if "stock" in WHAT:
    for query in NASA_QUERIES:
        taken = 0
        for item in nasa_search(query, limit=8):
            if taken >= 1:
                break
            try:
                url = nasa_asset(item["nasa_id"])
            except Exception as error:  # noqa: BLE001
                log.append(f"nasa asset error {item['nasa_id']}: {error}")
                continue
            if not url:
                continue
            from fetch import duration_of
            d = duration_of(url)
            if not d or d < 12:
                continue
            item = {**item, "url": url, "duration": d, "title": item["title"]}
            if segments_from(item, "stock", "nasa-" + slug(query)[:24], 2 if d > 40 else 1, seg=8.0) > 0:
                taken += 1
    for query in COMMONS_STOCK:
        taken = 0
        for hit in commons_search(query, "video", limit=25, maxsize=600_000_000):
            if taken >= 2:
                break
            d = float(hit.get("duration") or 0)
            if d < 10 or d > 1800 or (hit.get("width") or 0) < 1200 or BAD_STOCK.search(hit["title"]):
                continue
            if segments_from(hit, "stock", slug(query)[:18] + f"-{taken + 1}", 1 if d < 30 else 2, seg=8.0, crf=27) > 0:
                taken += 1

# ---------- Sounds and music ----------
AUDIO = [
    ("Civil-defense-siren-waver.ogg", "siren"),
    ("Explosion 10.ogg", "explosion-1"),
    ("Explosion-LS100155.ogg", "explosion-2"),
    ("Sonic-boom-massive-sound.ogg", "sonic-boom"),
    ("Psalm 23 1 Morse Code.wav", "morse"),
    ("Ludwig van Beethoven - Symphonie 5 c-moll - 1. Allegro con brio.ogg", "beethoven-5-i"),
    ("Ludwig van Beethoven - symphony no. 5 in c minor, op. 67 - ii. andante con moto.ogg", "beethoven-5-ii"),
    ("USMC Band - Radetzky March.mp3", "radetzky-march"),
    ("March band playing military march parading by.ogg", "march-band-passing"),
    ("Rain and thunder.ogg", "rain-thunder"),
    ("Rain (1).ogg", "rain"),
    ("Clapping hurray.ogg", "clapping-hurray"),
    ("277021 sandermotions applause-2.wav", "applause"),
    ("406243 stubb typewriter-ding-near-mono.wav", "typewriter-ding"),
    ("Paper Radio - Typewriters.opus", "typewriters"),
    ("Static B.wav", "static"),
    ("Steam engine.ogg", "steam-engine"),
    ("Church bells - Leverkusen, 2007.oga", "church-bells"),
    ("Birds forest.ogg", "birds-forest"),
    ("Oceanwavescrushing.ogg", "ocean-waves"),
    ("Applause i.ogg", "applause-2"),
]
AUDIO_SEARCH = [("propeller airplane flyover", "plane"), ("gunshot rifle", "gunshot"), ("Loyalty Freak Music", "lfm"),
                ("crowd talking ambience", "crowd"), ("wind howling", "wind"), ("door slam", "door"), ("bell ring", "bell")]

if "audio" in WHAT:
    os.makedirs(os.path.join(DL, "audio"), exist_ok=True)
    for title, name in AUDIO:
        record = commons_file(title)
        if not record:
            log.append(f"missing audio: {title}")
            continue
        ext = os.path.splitext(title)[1].lower()
        raw = os.path.join(DL, "audio", f"{name}{ext}")
        if download(record["url"], raw, max_bytes=40_000_000):
            credits.add(f"audio/{os.path.basename(raw)}", record)
            log.append(f"audio {name}{ext}")
    for query, name in AUDIO_SEARCH:
        hits = [h for h in commons_search(query, "audio", limit=25) if 1 < float(h.get("duration") or 0) < 400 and (h["size"] or 0) < 25_000_000]
        for i, hit in enumerate(hits[: (6 if name == "lfm" else 1)]):
            ext = os.path.splitext(hit["title"])[1].lower()
            raw = os.path.join(DL, "audio", f"{name}-{i + 1}{ext}")
            if download(hit["url"], raw, max_bytes=30_000_000):
                credits.add(f"audio/{os.path.basename(raw)}", hit)
                log.append(f"audio {name}-{i + 1}{ext}: {hit['title']}")

# ---------- Images: WW2 photos, maps, space photos ----------
IMAGES = [
    ("ww2", "photo-dday", "Into the Jaws of Death Normandy 1944"),
    ("ww2", "photo-arizona", "USS Arizona burning Pearl Harbor"),
    ("ww2", "photo-iwo-flag", "Raising the Flag on Iwo Jima"),
    ("ww2", "photo-yalta", "Yalta Conference Churchill Roosevelt Stalin"),
    ("ww2", "photo-st-pauls", "St Paul's Survives"),
    ("ww2", "photo-nagasaki", "Nagasaki atomic bomb mushroom cloud"),
    ("ww2", "photo-missouri", "Surrender of Japan USS Missouri"),
    ("ww2", "photo-spitfire", "Supermarine Spitfire 1940"),
    ("ww2", "photo-churchill", "Winston Churchill 1941 portrait"),
    ("ww2", "photo-stalingrad", "Stalingrad 1942 ruins"),
    ("ww2", "photo-london-blitz", "London Blitz 1940 firemen"),
    ("ww2", "photo-ve-day", "VE Day London crowd 1945"),
    ("ww2", "photo-b17", "B-17 Flying Fortress formation"),
    ("ww2", "photo-rosie", "We Can Do It poster"),
    ("ww2", "map-europe-1941", "=Second world war europe 1941-1942 map en.png"),
    ("ww2", "map-europe-1943", "Second world war europe 1943-1945 map en"),
    ("ww2", "map-asia-1942", "=Second world war asia 1937-1942 map en.png"),
    ("ww2", "map-asia-1945", "=Second world war asia 1943-1945 map en.png"),
    ("stock", "photo-earth", "The Blue Marble"),
    ("stock", "photo-pillars", "Pillars of Creation"),
    ("stock", "photo-earthrise", "Earthrise Apollo 8"),
    ("stock", "photo-aldrin", "Aldrin Apollo 11 visor"),
    ("stock", "photo-saturn", "Saturn Cassini"),
    ("stock", "photo-jupiter", "Jupiter Juno"),
]

if "images" in WHAT:
    for group, name, query in IMAGES:
        os.makedirs(os.path.join(DL, group), exist_ok=True)
        if os.path.exists(os.path.join(DL, group, f"{name}.jpg")):
            continue
        if query.startswith("="):
            exact = commons_file(query[1:])
            hits = [exact] if exact else []
        else:
            hits = [h for h in commons_search(query, "bitmap", limit=15) if (h.get("width") or 0) >= 1000 and (h["size"] or 0) < 60_000_000]
        if not hits:
            log.append(f"no image: {query}")
            continue
        hit = hits[0]
        ext = os.path.splitext(hit["title"])[1].lower()
        raw = os.path.join(DL, group, f"{name}-raw{ext}")
        if download(hit["url"], raw, max_bytes=60_000_000):
            out = os.path.join(DL, group, f"{name}.jpg")
            code, err = run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", raw, "-vf",
                             "scale='min(2560,iw)':-2", "-frames:v", "1", "-q:v", "3", out])
            if code == 0:
                os.remove(raw)
                credits.add(f"{group}/{name}.jpg", hit)
                log.append(f"image {name}: {hit['title']}")
            else:
                log.append(f"image convert failed {name}: {err[-200:]}")

print("\n".join(log))
json.dump(log, open(os.path.join(DL, f"log-{'-'.join(sorted(WHAT))}.json"), "w"), indent=1)
