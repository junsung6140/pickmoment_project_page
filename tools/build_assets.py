#!/usr/bin/env python3
"""Turn rendered results into web assets for the PickMoment project page.

This script does NOT run the model. Render frames with your own inference
code first, save them with the file names described below, then run one of
the subcommands. Every subcommand copies/resizes files into ``static/`` and
upserts an entry in ``static/data.json`` + ``static/data.js`` (the page reads
``data.js``; ``data.json`` is the editable source of truth).

Requirements: Python 3.8+, Pillow. ``video`` additionally needs ffmpeg on PATH.

Subcommands
-----------
demo    One Pick-a-Moment scene (tau sweep + interval grid).
        --src DIR must contain (any of .png/.jpg/.jpeg/.webp):
            input.*                 blurry input B(0,1)
            tau_<k>.*               k = 0..tau_steps       query (s,t) = (k/T, k/T)
            int_<i>_<j>.*           0 <= i < j <= G        query (s,t) = (i/G, j/G)
        Integers may be zero-padded or not (tau_7 and tau_07 both work).

video   One side-by-side blur-to-video clip.
        --input BLUR.png --col "Blur2Vid=DIR" --col "Ours=DIR" --col "GT=DIR"
        Each DIR holds the frames of one method, sorted by file name.
        All columns must have the same number of frames.

deblur  One before/after pair for the deblurring slider.
        --blur B.png --ours O.png [--fidediff F.png]

figure  A static figure (teaser / method). PDFs are rasterised with pdftoppm.
        --src FILE --name teaser|method

check   Verify that every file referenced by data.json exists.
remove  Delete an entry: --section demo|videos|deblur --id ID

Examples
--------
  python tools/build_assets.py demo  --src renders/gopro01 --id gopro01 --label "GoPro #1"
  python tools/build_assets.py video --id clip01 --label "GoPro #1" --input renders/clip01/blur.png \\
      --col "Blur2Vid=renders/clip01/blur2vid" --col "Ours=renders/clip01/ours" --col "GT=renders/clip01/gt"
  python tools/build_assets.py deblur --id hide03 --label "HIDE #3" --blur b.png --ours o.png --fidediff f.png
  python tools/build_assets.py figure --src ../2026NeurIPS/figures/figure1.pdf --name teaser
  python tools/build_assets.py check
"""
import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.exit("Pillow is required:  pip install pillow")

IMG_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff")
DEFAULT_DATA = {
    "demo": {"tauSteps": 32, "intervalSteps": 8, "includeToy": True, "scenes": []},
    "videos": [],
    "deblur": [],
}
JS_HEADER = (
    "// PickMoment project page — asset registry.\n"
    "// GENERATED from static/data.json by tools/build_assets.py. Edit data.json, not this file.\n"
    "// Empty lists make the page fall back to a labelled synthetic illustration / placeholder.\n"
)


# ─────────────────────────── helpers ───────────────────────────
def die(msg):
    sys.exit(f"error: {msg}")


def site_paths(site):
    site = Path(site).resolve()
    if not (site / "index.html").exists():
        die(f"{site} does not look like the project page folder (no index.html)")
    return site, site / "static" / "data.json", site / "static" / "data.js"


def load_data(json_path):
    if json_path.exists():
        data = json.loads(json_path.read_text())
    else:
        data = json.loads(json.dumps(DEFAULT_DATA))
    for k, v in DEFAULT_DATA.items():
        data.setdefault(k, json.loads(json.dumps(v)))
    for k, v in DEFAULT_DATA["demo"].items():
        data["demo"].setdefault(k, v)
    return data


def save_data(data, json_path, js_path):
    json_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    js_path.write_text(JS_HEADER + "window.PM_DATA = " + json.dumps(data, indent=2, ensure_ascii=False) + ";\n")
    print(f"updated {json_path.name} and {js_path.name}")


def upsert(items, entry):
    for i, it in enumerate(items):
        if it.get("id") == entry["id"]:
            items[i] = entry
            return "replaced"
    items.append(entry)
    return "added"


def rel(site, p):
    return p.relative_to(site).as_posix()


def check_id(id_):
    if not re.fullmatch(r"[A-Za-z0-9_\-]+", id_):
        die(f"--id must be alphanumeric/underscore/dash, got {id_!r}")


def find_image(folder, stem_regex):
    """Return {int-tuple: path} for files whose stem fully matches stem_regex."""
    pat = re.compile(stem_regex)
    out = {}
    for p in folder.iterdir():
        if p.suffix.lower() in IMG_EXTS:
            m = pat.fullmatch(p.stem)
            if m:
                key = tuple(int(g) for g in m.groups())
                if key in out:
                    die(f"duplicate file for {stem_regex} {key}: {out[key].name} and {p.name}")
                out[key] = p
    return out


def open_rgb(path):
    im = Image.open(path)
    return im.convert("RGB")


def resize_to_width(im, width):
    if width and im.width > width:
        h = round(im.height * width / im.width)
        im = im.resize((width, h), Image.LANCZOS)
    return im


def save_jpg(im, path, quality):
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "JPEG", quality=quality, optimize=True, progressive=True)


# ─────────────────────────── demo ───────────────────────────
def cmd_demo(a):
    site, jp, js = site_paths(a.site)
    check_id(a.id)
    src = Path(a.src)
    if not src.is_dir():
        die(f"--src {src} is not a directory")
    data = load_data(jp)
    T, G = data["demo"]["tauSteps"], data["demo"]["intervalSteps"]
    if a.tau_steps or a.interval_steps:
        if data["demo"]["scenes"] and (a.tau_steps not in (None, T) or a.interval_steps not in (None, G)):
            die("tauSteps/intervalSteps are shared by all scenes; remove existing scenes before changing them")
        T = a.tau_steps or T
        G = a.interval_steps or G
        data["demo"]["tauSteps"], data["demo"]["intervalSteps"] = T, G

    inputs = [p for p in src.iterdir() if p.stem == "input" and p.suffix.lower() in IMG_EXTS]
    if len(inputs) != 1:
        die(f"expected exactly one input.* in {src}, found {len(inputs)}")
    taus = find_image(src, r"tau_(\d+)")
    ints = find_image(src, r"int_(\d+)_(\d+)")

    missing = [f"tau_{k}" for k in range(T + 1) if (k,) not in taus]
    missing += [f"int_{i}_{j}" for i in range(G) for j in range(i + 1, G + 1) if (i, j) not in ints]
    extra = [p.name for k, p in taus.items() if not 0 <= k[0] <= T]
    extra += [p.name for (i, j), p in ints.items() if not (0 <= i < j <= G)]
    if missing:
        die(f"{len(missing)} file(s) missing for tauSteps={T}, intervalSteps={G}: " + ", ".join(missing[:12])
            + (" ..." if len(missing) > 12 else ""))
    if extra:
        print("warning: ignoring out-of-grid files: " + ", ".join(extra[:12]))

    out = site / "static" / "demo" / a.id
    if out.exists():
        shutil.rmtree(out)
    size = None

    def put(src_path, name):
        nonlocal size
        im = resize_to_width(open_rgb(src_path), a.width)
        if size is None:
            size = im.size
        elif im.size != size:
            im = im.resize(size, Image.LANCZOS)
        save_jpg(im, out / name, a.quality)

    put(inputs[0], "input.jpg")
    for k in range(T + 1):
        put(taus[(k,)], f"tau_{k:02d}.jpg")
    for i in range(G):
        for j in range(i + 1, G + 1):
            put(ints[(i, j)], f"int_{i:02d}_{j:02d}.jpg")

    entry = {"id": a.id, "label": a.label or a.id, "dir": rel(site, out), "input": rel(site, out / "input.jpg")}
    how = upsert(data["demo"]["scenes"], entry)
    save_data(data, jp, js)
    n = 1 + (T + 1) + G * (G + 1) // 2
    mb = sum(f.stat().st_size for f in out.iterdir()) / 1e6
    print(f"demo scene {a.id!r} {how}: {n} images, {size[0]}x{size[1]}, {mb:.1f} MB")


# ─────────────────────────── video ───────────────────────────
def list_frames(folder):
    folder = Path(folder)
    if not folder.is_dir():
        die(f"{folder} is not a directory")
    frames = sorted(p for p in folder.iterdir() if p.suffix.lower() in IMG_EXTS)
    if not frames:
        die(f"no frames in {folder}")
    return frames


def cmd_video(a):
    site, jp, js = site_paths(a.site)
    check_id(a.id)
    if shutil.which("ffmpeg") is None:
        die("ffmpeg not found on PATH")
    cols = []
    for spec in a.col:
        if "=" not in spec:
            die(f'--col must look like "Name=DIR", got {spec!r}')
        name, d = spec.split("=", 1)
        cols.append((name.strip(), list_frames(d)))
    counts = {n: len(f) for n, f in cols}
    if len(set(counts.values())) != 1:
        die(f"all columns need the same number of frames, got {counts}")
    n_frames = next(iter(counts.values()))

    names = ([a.input_label] if a.input else []) + [n for n, _ in cols]
    ours_idx = next((i for i, n in enumerate(names) if n.lower().startswith("ours")), None)
    blur = open_rgb(a.input) if a.input else None

    def fit(im):
        w = round(im.width * a.height / im.height)
        w -= w % 2
        return im.resize((w, a.height), Image.LANCZOS)

    out_dir = site / "static" / "videos"
    out_dir.mkdir(parents=True, exist_ok=True)
    mp4 = out_dir / f"{a.id}.mp4"
    poster = out_dir / f"{a.id}_poster.jpg"
    with tempfile.TemporaryDirectory() as tmp:
        blur_fit = fit(blur) if blur else None
        for t in range(n_frames):
            tiles = ([blur_fit] if blur_fit else []) + [fit(open_rgb(f[t])) for _, f in cols]
            W = sum(x.width for x in tiles) + a.gap * (len(tiles) - 1)
            canvas = Image.new("RGB", (W + W % 2, a.height), (15, 23, 42))
            x = 0
            for tile in tiles:
                canvas.paste(tile, (x, 0))
                x += tile.width + a.gap
            canvas.save(Path(tmp) / f"{t:05d}.png")
            if t == 0:
                save_jpg(canvas, poster, 88)
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(a.fps), "-i", str(Path(tmp) / "%05d.png"),
               "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", str(a.crf), "-preset", "slow",
               "-movflags", "+faststart", str(mp4)]
        subprocess.run(cmd, check=True)

    data = load_data(jp)
    entry = {"id": a.id, "label": a.label or a.id, "src": rel(site, mp4), "poster": rel(site, poster),
             "columns": names}
    if ours_idx is not None:
        entry["oursIndex"] = ours_idx
    how = upsert(data["videos"], entry)
    save_data(data, jp, js)
    print(f"video {a.id!r} {how}: {n_frames} frames @ {a.fps} fps, columns {names}, {mp4.stat().st_size/1e6:.2f} MB")


# ─────────────────────────── deblur ───────────────────────────
def cmd_deblur(a):
    site, jp, js = site_paths(a.site)
    check_id(a.id)
    ours = resize_to_width(open_rgb(a.ours), a.width)
    out = site / "static" / "deblur"
    entry = {"id": a.id, "label": a.label or a.id}
    for key, path in (("blur", a.blur), ("ours", a.ours), ("fidediff", a.fidediff)):
        if not path:
            continue
        im = open_rgb(path)
        if im.size != ours.size:
            im = im.resize(ours.size, Image.LANCZOS)
        dst = out / f"{a.id}_{key}.jpg"
        save_jpg(im, dst, a.quality)
        entry[key] = rel(site, dst)
    data = load_data(jp)
    how = upsert(data["deblur"], entry)
    save_data(data, jp, js)
    print(f"deblur pair {a.id!r} {how}: {ours.size[0]}x{ours.size[1]}")


# ─────────────────────────── figure ───────────────────────────
def cmd_figure(a):
    site, _, _ = site_paths(a.site)
    src = Path(a.src)
    dst = site / "static" / "image" / f"{a.name}.jpg"
    if src.suffix.lower() == ".pdf":
        if shutil.which("pdftoppm") is None:
            die("pdftoppm not found (brew install poppler / apt install poppler-utils), or export the figure as PNG")
        with tempfile.TemporaryDirectory() as tmp:
            subprocess.run(["pdftoppm", "-r", str(a.dpi), "-png", "-singlefile", str(src), str(Path(tmp) / "fig")],
                           check=True)
            im = open_rgb(Path(tmp) / "fig.png")
    else:
        im = open_rgb(src)
    im = resize_to_width(im, a.width)
    save_jpg(im, dst, a.quality)
    print(f"figure -> {rel(site, dst)} ({im.size[0]}x{im.size[1]})")


# ─────────────────────────── check / remove ───────────────────────────
def cmd_check(a):
    site, jp, _ = site_paths(a.site)
    data = load_data(jp)
    T, G = data["demo"]["tauSteps"], data["demo"]["intervalSteps"]
    missing = []
    for sc in data["demo"]["scenes"]:
        d = site / sc["dir"]
        need = [site / sc["input"]] + [d / f"tau_{k:02d}.jpg" for k in range(T + 1)]
        need += [d / f"int_{i:02d}_{j:02d}.jpg" for i in range(G) for j in range(i + 1, G + 1)]
        missing += [p for p in need if not p.exists()]
    for v in data["videos"]:
        missing += [site / v[k] for k in ("src", "poster") if k in v and not (site / v[k]).exists()]
    for pr in data["deblur"]:
        missing += [site / pr[k] for k in ("blur", "ours", "fidediff") if k in pr and not (site / pr[k]).exists()]
    for fig in ("teaser", "method"):
        if not (site / "static" / "image" / f"{fig}.jpg").exists():
            print(f"note: static/image/{fig}.jpg not added yet (page shows a placeholder)")
    print(f"demo scenes: {len(data['demo']['scenes'])}, videos: {len(data['videos'])}, deblur pairs: {len(data['deblur'])}")
    if missing:
        for p in missing[:20]:
            print("MISSING", rel(site, p))
        die(f"{len(missing)} referenced file(s) missing")
    print("all referenced files exist")


def cmd_remove(a):
    site, jp, js = site_paths(a.site)
    data = load_data(jp)
    items = data["demo"]["scenes"] if a.section == "demo" else data[a.section]
    keep = [it for it in items if it.get("id") != a.id]
    if len(keep) == len(items):
        die(f"no {a.section} entry with id {a.id!r}")
    items[:] = keep
    save_data(data, jp, js)
    print(f"removed {a.section}/{a.id} from the registry (files under static/ were left in place)")


# ─────────────────────────── CLI ───────────────────────────
def main():
    here = Path(__file__).resolve().parent.parent
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--site", default=str(here), help="project page folder (default: parent of tools/)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("demo", help="add a Pick-a-Moment scene")
    p.add_argument("--src", required=True)
    p.add_argument("--id", required=True)
    p.add_argument("--label")
    p.add_argument("--tau-steps", type=int, help="override the shared tau grid (default from data.json: 32)")
    p.add_argument("--interval-steps", type=int, help="override the shared interval grid (default: 8)")
    p.add_argument("--width", type=int, default=960, help="max output width in px (default 960)")
    p.add_argument("--quality", type=int, default=88)
    p.set_defaults(func=cmd_demo)

    p = sub.add_parser("video", help="add a side-by-side blur-to-video clip")
    p.add_argument("--id", required=True)
    p.add_argument("--label")
    p.add_argument("--input", help="blurry input image, shown as the first (static) column")
    p.add_argument("--input-label", default="Blurry input")
    p.add_argument("--col", action="append", required=True, help='"Name=DIR", repeat per column, left to right')
    p.add_argument("--height", type=int, default=360, help="tile height in px (default 360)")
    p.add_argument("--gap", type=int, default=4, help="gap between tiles in px")
    p.add_argument("--fps", type=float, default=8)
    p.add_argument("--crf", type=int, default=20)
    p.set_defaults(func=cmd_video)

    p = sub.add_parser("deblur", help="add a before/after deblurring pair")
    p.add_argument("--id", required=True)
    p.add_argument("--label")
    p.add_argument("--blur", required=True)
    p.add_argument("--ours", required=True)
    p.add_argument("--fidediff")
    p.add_argument("--width", type=int, default=1280)
    p.add_argument("--quality", type=int, default=90)
    p.set_defaults(func=cmd_deblur)

    p = sub.add_parser("figure", help="add teaser/method figure")
    p.add_argument("--src", required=True)
    p.add_argument("--name", required=True, choices=["teaser", "method"])
    p.add_argument("--width", type=int, default=2000)
    p.add_argument("--dpi", type=int, default=200)
    p.add_argument("--quality", type=int, default=92)
    p.set_defaults(func=cmd_figure)

    p = sub.add_parser("check", help="verify referenced files exist")
    p.set_defaults(func=cmd_check)

    p = sub.add_parser("remove", help="remove an entry from the registry")
    p.add_argument("--section", required=True, choices=["demo", "videos", "deblur"])
    p.add_argument("--id", required=True)
    p.set_defaults(func=cmd_remove)

    a = ap.parse_args()
    a.func(a)


if __name__ == "__main__":
    main()
