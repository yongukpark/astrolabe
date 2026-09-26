"""Accepted papers -> public/data/<conf><year>.json (+ public/data/index.json)

neurips / iclr / icml: the <conf>.cc virtual-site dump (OpenReview's API blocks anonymous requests).
  Recent dumps ship without abstracts; those are filled from papercopilot/paperlists by OpenReview id or title.
If neither has abstracts yet (e.g. NeurIPS right after decisions), papers are kept title-only and marked in index.json.
Usage: python3 scripts/fetch_conf.py icml 2026 [local-dump.json]    (stdlib only)
"""
import json
import re
import sys
import urllib.request
from pathlib import Path

NAMES = {"neurips": "NeurIPS", "iclr": "ICLR", "icml": "ICML"}
RANK = {"oral": 3, "spotlight": 2, "poster": 1, None: 0}
DATA = Path(__file__).resolve().parent.parent / "public/data"


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=120).read()


def norm(title):
    return re.sub(r"\W+", " ", title).strip().lower()


def decision(e):
    m = re.search(r"\((\w+)[^)]*\)", e.get("decision") or "")  # "spotlight poster" → spotlight
    d = m.group(1).lower() if m else None
    return "poster" if d == "regular" else d  # ICML calls posters "regular"


def track(e):
    m = re.search(r"\.cc/\d+/(\w+)", e["sourceurl"] or "")
    if not m:
        return "Journal"  # JMLR / TMLR / Annals of Statistics journal-to-conference papers
    return {"Conference": "Main", "Datasets_and_Benchmarks_Track": "Datasets & Benchmarks",
            "Position_Paper_Track": "Position"}.get(m.group(1), m.group(1))


def fill_abstracts(raw, conf, year):
    """Dumps published before the conference have no abstracts; borrow them from paperlists."""
    folder = "nips" if conf == "neurips" else conf
    path = f"papercopilot/paperlists/main/{folder}/{folder}{year}.json"
    for url in (f"https://media.githubusercontent.com/media/{path}", f"https://raw.githubusercontent.com/{path}"):  # big files are LFS
        try:
            pl = json.loads(get(url))
            break
        except Exception as err:
            print(f"paperlists {folder}{year}: {err} ({url.split('/')[2]})")
    else:
        return
    by_id = {x["id"]: x["abstract"] for x in pl if x.get("abstract")}
    by_title = {norm(x["title"]): x["abstract"] for x in pl if x.get("abstract")}
    for e in raw:
        forum = re.search(r"forum\?id=([\w-]+)", e.get("paper_url") or "")
        e["abstract"] = (forum and by_id.get(forum.group(1))) or by_title.get(norm(e["name"]))


def normalize(raw, title_only=False):
    papers = {}
    for e in raw:
        if not e.get("abstract") and not title_only:
            continue
        paper_url = e.get("paper_url") or ""
        forum = re.search(r"openreview\.net/forum\?id=([\w-]{8,12})$", paper_url)  # oral events carry fake ids like 2025-Oral--9558-…
        # orals appear up to 3x (Oral/Poster events, some without an OpenReview link), cdmx repeats too → dedupe by title
        key = norm(e["name"])
        if forum:
            pdf, url = f"https://openreview.net/pdf?id={forum.group(1)}", f"https://openreview.net/forum?id={forum.group(1)}"
        elif "proceedings.neurips.cc" in paper_url:  # NeurIPS ≤2024 links the proceedings page instead
            pdf, url = re.sub(r"/hash/(\w+)-Abstract-(\w+)\.html", r"/file/\1-Paper-\2.pdf", paper_url), paper_url
        else:
            pdf, url = e.get("paper_pdf_url"), f"https://{e['_host']}{e['virtualsite_url']}"
        p = {
            "id": forum.group(1) if forum else key,
            "title": e["name"].strip(),
            "abstract": (e.get("abstract") or "").strip(),
            "pdf": pdf,
            "url": url,
            "track": track(e),
            "workshop": None,
            "decision": decision(e),
            "topic": e.get("topic"),
        }
        old = papers.get(key)
        if old:  # keep the best decision and any OpenReview link either copy has
            if RANK.get(p["decision"], 0) < RANK.get(old["decision"], 0):
                p["decision"] = old["decision"]
            if "openreview" not in p["url"] and "openreview" in old["url"]:
                p.update(id=old["id"], pdf=old["pdf"], url=old["url"])
        papers[key] = p
    return list(papers.values())


def fetch_miniconf(conf, year, local=None):
    host = f"{conf}.cc"
    dump = Path(local).read_bytes() if local else get(f"https://{host}/static/virtual/data/{conf}-{year}-orals-posters.json")
    raw = json.loads(dump)["results"]
    for e in raw:
        e["_host"] = host
    if sum(bool(e.get("abstract")) for e in raw) < len(raw) / 2:
        fill_abstracts(raw, conf, year)
    title_only = sum(bool(e.get("abstract")) for e in raw) < len(raw) / 2
    return normalize(raw, title_only), len(raw), title_only


def main():
    conf, year = sys.argv[1].lower(), int(sys.argv[2])
    papers, n_raw, title_only = fetch_miniconf(conf, year, sys.argv[3] if len(sys.argv) > 3 else None)
    if not papers:
        sys.exit(f"{conf} {year}: no papers with abstracts, skipped")
    cid = f"{conf}{year}"
    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / f"{cid}.json").write_text(json.dumps(papers, ensure_ascii=False))

    index_file = DATA / "index.json"
    index = {c["id"]: c for c in (json.loads(index_file.read_text()) if index_file.exists() else [])}
    old = {k: v for k, v in index.get(cid, {}).items() if k not in ("pending", "note", "titleOnly")}  # keep hand-set place/month
    index[cid] = {**old, "id": cid, "conf": conf, "year": year, "name": f"{NAMES.get(conf, conf.upper())} {year}", "count": len(papers)}
    if title_only:
        index[cid]["titleOnly"] = True
    index_file.write_text(json.dumps(sorted(index.values(), key=lambda c: (c["conf"], c["year"])), indent=1, ensure_ascii=False))
    print(f"{n_raw} raw -> {len(papers)} papers -> {cid}.json" + (" (title-only: no abstracts yet)" if title_only else ""))


if __name__ == "__main__":
    main()
