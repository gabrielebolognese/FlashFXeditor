"""Search and fetch free media (Wikimedia Commons, NASA, Internet Archive) with credits.

Only media files are fetched (video, audio, images), from upload.wikimedia.org, images-assets.nasa.gov
and archive.org. Segments of long videos are cut straight from the URL with ffmpeg (HTTP range reads),
so only the bytes needed are downloaded.
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse

import requests

UA = "ShortsEditorTemplateBuilder/1.0 (https://github.com/gabrielebolognese/FlashFXeditor; test fixtures)"
S = requests.Session()
S.headers["User-Agent"] = UA

OK_LICENSES = re.compile(r"^(public domain|pd|cc0|cc[ -]by([ -]sa)?[ -]\d|no restrictions|attribution|cc-by)", re.I)
IDLE = 0x00000040  # IDLE_PRIORITY_CLASS: never slow the batch runner's own work


def get_json(url, params=None, tries=4):
    for attempt in range(tries):
        try:
            r = S.get(url, params=params, timeout=60)
            if r.status_code == 200:
                return r.json()
            if r.status_code in (429, 503):
                time.sleep(5 * (attempt + 1))
                continue
            r.raise_for_status()
        except requests.RequestException as error:
            if attempt == tries - 1:
                raise
            print("retry", url, error, file=sys.stderr)
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"failed: {url}")


def strip_html(text):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", text or "")).strip()


def commons_search(query, filetype="video", limit=40, minsize=0, maxsize=2_000_000_000):
    """Files on Commons matching `query` (filetype: video, audio, bitmap, drawing) with usable licenses."""
    params = {
        "action": "query", "format": "json", "generator": "search", "gsrnamespace": 6,
        "gsrsearch": f"{query} filetype:{filetype}", "gsrlimit": limit,
        "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata",
        "iiextmetadatafilter": "LicenseShortName|Artist|ObjectName|ImageDescription|Credit",
    }
    data = get_json("https://commons.wikimedia.org/w/api.php", params)
    pages = sorted((data.get("query") or {}).get("pages", {}).values(), key=lambda p: p.get("index", 0))
    out = []
    for page in pages:
        info = (page.get("imageinfo") or [{}])[0]
        meta = info.get("extmetadata", {})
        lic = strip_html(meta.get("LicenseShortName", {}).get("value", ""))
        if not OK_LICENSES.match(lic) or "nc" in lic.lower() or "nd" in lic.lower().split():
            continue
        size = info.get("size", 0)
        if size < minsize or size > maxsize:
            continue
        out.append({
            "source": "Wikimedia Commons",
            "title": page["title"].removeprefix("File:"),
            "url": (info.get("url") or "").split("?")[0],
            "page": info.get("descriptionurl"),
            "mime": info.get("mime"),
            "size": size,
            "width": info.get("width"),
            "height": info.get("height"),
            "duration": info.get("duration"),
            "license": lic,
            "author": strip_html(meta.get("Artist", {}).get("value", ""))[:200],
            "description": strip_html(meta.get("ImageDescription", {}).get("value", ""))[:300],
        })
    return out


def commons_category(category, filetype=None, limit=200):
    """Files of a Commons category (and their licenses)."""
    params = {
        "action": "query", "format": "json", "generator": "categorymembers", "gcmtitle": f"Category:{category}",
        "gcmtype": "file", "gcmlimit": limit, "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata",
        "iiextmetadatafilter": "LicenseShortName|Artist|ImageDescription",
    }
    data = get_json("https://commons.wikimedia.org/w/api.php", params)
    out = []
    for page in (data.get("query") or {}).get("pages", {}).values():
        info = (page.get("imageinfo") or [{}])[0]
        meta = info.get("extmetadata", {})
        lic = strip_html(meta.get("LicenseShortName", {}).get("value", ""))
        mime = info.get("mime", "")
        if filetype and not mime.startswith(filetype) and not (filetype == "video" and mime in ("application/ogg",)):
            continue
        if not OK_LICENSES.match(lic) or "nc" in lic.lower():
            continue
        out.append({
            "source": "Wikimedia Commons", "title": page["title"].removeprefix("File:"), "url": (info.get("url") or "").split("?")[0],
            "page": info.get("descriptionurl"), "mime": mime, "size": info.get("size", 0), "width": info.get("width"),
            "height": info.get("height"), "duration": info.get("duration"), "license": lic,
            "author": strip_html(meta.get("Artist", {}).get("value", ""))[:200],
            "description": strip_html(meta.get("ImageDescription", {}).get("value", ""))[:300],
        })
    return out


def nasa_search(query, media_type="video", limit=30):
    data = get_json("https://images-api.nasa.gov/search", {"q": query, "media_type": media_type})
    out = []
    for item in data["collection"]["items"][:limit]:
        d = item["data"][0]
        out.append({"source": "NASA Image and Video Library", "nasa_id": d["nasa_id"], "title": d.get("title", ""),
                    "description": strip_html(d.get("description", ""))[:300], "center": d.get("center", ""),
                    "page": f"https://images.nasa.gov/details/{urllib.parse.quote(d['nasa_id'])}",
                    "license": "Public domain (NASA media policy)", "author": d.get("center", "NASA")})
    return out


def nasa_asset(nasa_id, prefer=("~medium.mp4", "~small.mp4", "~mobile.mp4", "~orig.mp4")):
    data = get_json(f"https://images-api.nasa.gov/asset/{urllib.parse.quote(nasa_id)}")
    hrefs = [i["href"] for i in data["collection"]["items"]]
    for suffix in prefer:
        for href in hrefs:
            if href.endswith(suffix):
                return href.replace("http://", "https://").replace(" ", "%20")
    return None


def ia_search(query, rows=30, mediatype="movies"):
    params = {"q": f"({query}) AND mediatype:{mediatype}", "fl[]": ["identifier", "title", "licenseurl", "year", "creator"],
              "rows": rows, "output": "json", "sort[]": "downloads desc"}
    data = get_json("https://archive.org/advancedsearch.php", params)
    return data["response"]["docs"]


def ia_files(identifier):
    data = get_json(f"https://archive.org/metadata/{identifier}")
    files = data.get("files", [])
    meta = data.get("metadata", {})
    return meta, files


def ia_best_video(identifier):
    meta, files = ia_files(identifier)
    mp4 = [f for f in files if f.get("name", "").lower().endswith(".mp4")]
    if not mp4:
        return meta, None, None
    # Prefer the h.264 derivative over huge originals.
    mp4.sort(key=lambda f: (0 if f.get("format", "").lower().startswith("h.264") else 1 if "512kb" in f.get("name", "").lower() else 2, int(f.get("size", 0) or 0)))
    best = mp4[0]
    url = f"https://archive.org/download/{identifier}/{urllib.parse.quote(best['name'])}"
    length = best.get("length")
    try:
        length = float(length) if length and ":" not in str(length) else None
    except ValueError:
        length = None
    return meta, url, length


def run(cmd, timeout=900):
    """Runs a command at idle priority; returns (code, stderr tail)."""
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, creationflags=IDLE)
    return p.returncode, (p.stderr or "")[-1500:]


def probe(path_or_url):
    code = subprocess.run(["ffprobe", "-v", "error", "-user_agent", UA, "-show_entries", "format=duration:stream=codec_type,width,height,r_frame_rate",
                           "-of", "json", path_or_url], capture_output=True, text=True, timeout=120, creationflags=IDLE)
    try:
        return json.loads(code.stdout)
    except json.JSONDecodeError:
        return {}


def duration_of(path_or_url):
    try:
        return float(probe(path_or_url)["format"]["duration"])
    except (KeyError, ValueError, TypeError):
        return None


def cut_video(url, start, dur, out, width=1280, height=720, fps=None, audio=True, crf=24, fit="pad", extra_vf=None):
    """Cuts [start, start+dur) of `url` into an H.264/AAC MP4 scaled to fit width x height."""
    if os.path.exists(out) and os.path.getsize(out) > 10_000:
        return True
    if fit == "pad":
        vf = f"scale={width}:{height}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=ceil(iw/2)*2:ceil(ih/2)*2"
    elif fit == "crop":
        vf = f"scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height}"
    else:  # keep aspect, cap size
        vf = f"scale='min({width},iw)':'min({height},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2"
    if extra_vf:
        vf += "," + extra_vf
    if fps:
        vf += f",fps={fps}"
    vf += ",format=yuv420p"
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-ss", f"{start:.3f}", "-t", f"{dur:.3f}",
           "-user_agent", UA, "-reconnect", "1", "-reconnect_delay_max", "5", "-i", url.split("?utm_")[0],
           "-vf", vf, "-c:v", "libx264", "-preset", "medium", "-crf", str(crf), "-threads", "3", "-g", "48"]
    if audio:
        cmd += ["-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2"]
    else:
        cmd += ["-an"]
    cmd += ["-movflags", "+faststart", out]
    for attempt in range(4):
        time.sleep(2.0)
        code, err = run(cmd)
        if code == 0 and os.path.exists(out) and os.path.getsize(out) >= 10_000:
            break
        if "429" in err or "Too Many" in err or "ended prematurely" in err or "403" in err:
            time.sleep(25 * (attempt + 1))
            continue
        break
    if code != 0 or not os.path.exists(out) or os.path.getsize(out) < 10_000:
        print("cut failed", url, start, err[-400:], file=sys.stderr)
        if os.path.exists(out):
            os.remove(out)
        return False
    return True


def download(url, out, max_bytes=200_000_000, tries=6):
    if os.path.exists(out) and os.path.getsize(out) > 0:
        return True
    for attempt in range(tries):
        time.sleep(2.5)  # polite pacing for upload.wikimedia.org
        with S.get(url, stream=True, timeout=120) as r:
            if r.status_code == 429:
                wait = int(r.headers.get("Retry-After", "0") or 0) or 20 * (attempt + 1)
                print("429, waiting", wait, url, file=sys.stderr)
                time.sleep(min(wait, 120))
                continue
            if r.status_code != 200:
                print("download failed", r.status_code, url, file=sys.stderr)
                return False
            total = 0
            with open(out + ".part", "wb") as f:
                for chunk in r.iter_content(1 << 16):
                    total += len(chunk)
                    if total > max_bytes:
                        print("too big, stopped", url, file=sys.stderr)
                        f.close()
                        os.remove(out + ".part")
                        return False
                    f.write(chunk)
        os.replace(out + ".part", out)
        return True
    return False


class Credits:
    def __init__(self, path):
        self.path = path
        self.items = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}

    def add(self, file_name, record):
        keep = {k: record.get(k) for k in ("source", "title", "page", "license", "author", "description") if record.get(k)}
        self.items[file_name] = keep
        json.dump(self.items, open(self.path, "w", encoding="utf-8"), indent=1, ensure_ascii=False)


if __name__ == "__main__":
    kind = sys.argv[1]
    query = sys.argv[2]
    if kind == "commons":
        ft = sys.argv[3] if len(sys.argv) > 3 else "video"
        for r in commons_search(query, ft):
            print(f"{r['size']/1e6:7.1f}MB {r['width']}x{r['height']} {r.get('duration') or '':>8} {r['license'][:14]:14} {r['title'][:90]}")
    elif kind == "nasa":
        for r in nasa_search(query):
            print(r["nasa_id"], "|", r["title"][:90])
    elif kind == "ia":
        for r in ia_search(query):
            print(r.get("identifier"), "|", str(r.get("title"))[:80], "|", r.get("year"), "|", r.get("licenseurl", ""))


def commons_file(title):
    """One Commons file by exact title (without the File: prefix), with its license and URL."""
    params = {"action": "query", "format": "json", "titles": f"File:{title}", "prop": "imageinfo",
              "iiprop": "url|size|mime|extmetadata", "iiextmetadatafilter": "LicenseShortName|Artist|ImageDescription"}
    data = get_json("https://commons.wikimedia.org/w/api.php", params)
    page = next(iter(data["query"]["pages"].values()))
    if "imageinfo" not in page:
        return None
    info = page["imageinfo"][0]
    meta = info.get("extmetadata", {})
    return {"source": "Wikimedia Commons", "title": title, "url": info["url"].split("?")[0], "page": info.get("descriptionurl"),
            "mime": info.get("mime"), "size": info.get("size"), "width": info.get("width"), "height": info.get("height"),
            "duration": info.get("duration"), "license": strip_html(meta.get("LicenseShortName", {}).get("value", "")),
            "author": strip_html(meta.get("Artist", {}).get("value", ""))[:200],
            "description": strip_html(meta.get("ImageDescription", {}).get("value", ""))[:300]}
