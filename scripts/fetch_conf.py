"""Conference virtual-site JSON -> public/data/<conf><year>.json (+ public/data/index.json)

OpenReview API blocks anonymous requests (challenge), so we use the <conf>.cc public dump.
Works for neurips / iclr / icml (same miniconf platform).
Usage: python3 scripts/fetch_conf.py neurips 2025
"""
import json
import re
import sys
import urllib.request
from pathlib import Path

NAMES = {"neurips": "NeurIPS", "iclr": "ICLR", "icml": "ICML"}
RANK = {"oral": 3, "spotlight": 2, "poster": 1, None: 0}
DATA = Path(__file__).resolve().parent.parent / "public/data"


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


def normalize(raw):
    papers = {}
    for e in raw:
        if not e.get("abstract"):
            continue
        paper_url = e.get("paper_url") or ""
        forum = re.search(r"openreview\.net/forum\?id=([\w-]{8,12})$", paper_url)  # oral events carry fake ids like 2025-Oral--9558-…
        # orals appear up to 3x (Oral/Poster events, some without an OpenReview link), cdmx repeats too → dedupe by title
        key = re.sub(r"\W+", " ", e["name"]).strip().lower()
        if forum:
            pdf, url = f"https://openreview.net/pdf?id={forum.group(1)}", f"https://openreview.net/forum?id={forum.group(1)}"
        elif "proceedings.neurips.cc" in paper_url:  # NeurIPS ≤2024 links the proceedings page instead
            pdf, url = re.sub(r"/hash/(\w+)-Abstract-(\w+)\.html", r"/file/\1-Paper-\2.pdf", paper_url), paper_url
        else:
            pdf, url = e.get("paper_pdf_url"), f"https://{e['_host']}{e['virtualsite_url']}"
        p = {
            "id": forum.group(1) if forum else key,
            "title": e["name"].strip(),
            "abstract": e["abstract"].strip(),
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


def main():
    conf, year = sys.argv[1].lower(), sys.argv[2]
    host = f"{conf}.cc"
    req = urllib.request.Request(f"https://{host}/static/virtual/data/{conf}-{year}-orals-posters.json",
                                 headers={"User-Agent": "Mozilla/5.0"})
    raw = json.load(urllib.request.urlopen(req))["results"]
    for e in raw:
        e["_host"] = host
    papers = normalize(raw)
    if not papers:
        sys.exit(f"{conf} {year}: dump has no abstracts, skipped")
    cid = f"{conf}{year}"
    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / f"{cid}.json").write_text(json.dumps(papers, ensure_ascii=False))

    index_file = DATA / "index.json"
    index = {c["id"]: c for c in (json.loads(index_file.read_text()) if index_file.exists() else [])}
    index[cid] = {"id": cid, "name": f"{NAMES.get(conf, conf.upper())} {year}", "count": len(papers)}
    index_file.write_text(json.dumps(sorted(index.values(), key=lambda c: c["id"][-4:] + c["id"], reverse=True), indent=1))
    print(f"{len(raw)} events -> {len(papers)} papers -> {cid}.json")


if __name__ == "__main__":
    main()
