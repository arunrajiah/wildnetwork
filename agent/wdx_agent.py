#!/usr/bin/env python3
"""wdx-agent: push wildlife detections from a Raspberry Pi (or any machine) to a WDX endpoint.

Reads detections that already exist on the device and forwards them as WDX 0.1 events
(https://github.com/arunrajiah/wildlife-detection-exchange). Standard library only: no pip needed.

Sources:
  birdnet-pi   BirdNET-Pi SQLite database (table `detections`)
  birdnet-go   BirdNET-Go SQLite database (table `notes`)
  speciesnet   SpeciesNet / MegaDetector `predictions.json` files in a folder (camera traps)
  ndjson       any `.wdx.ndjson` file that another tool appends WDX events to

Usage:
  wdx_agent.py --config /etc/wdx-agent.ini            run forever
  wdx_agent.py --config wdx-agent.ini --once          one pass, then exit
  wdx_agent.py --config wdx-agent.ini --dry-run       print events instead of sending
"""
from __future__ import annotations

import argparse
import configparser
import hashlib
import json
import os
import socket
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

VERSION = "0.1.0"
BATCH = 500


def log(msg: str) -> None:
    print(f"{datetime.now().isoformat(timespec='seconds')} {msg}", flush=True)


def local_iso(date: str, clock: str) -> str:
    """Device-local 'YYYY-MM-DD' + 'HH:MM:SS' to ISO 8601 with the local UTC offset for that date."""
    dt = datetime.strptime(f"{date} {clock.split('.')[0]}", "%Y-%m-%d %H:%M:%S")
    return dt.astimezone().isoformat(timespec="seconds")


class Settings:
    def __init__(self, path: str):
        cp = configparser.ConfigParser()
        if not cp.read(path):
            sys.exit(f"config not found: {path}")
        a = cp["agent"]
        self.endpoint = a.get("endpoint", "https://wildnetwork.arunrajiah.com/api/v1/events")
        self.api_key = a.get("api_key", "")
        self.source = a.get("source", "birdnet-pi")
        self.path = os.path.expanduser(a.get("path", ""))
        self.station_id = a.get("station_id", "") or default_station_id()
        self.station_name = a.get("station_name", "")
        self.latitude = a.getfloat("latitude", fallback=None)
        self.longitude = a.getfloat("longitude", fallback=None)
        # Privacy: coordinates are rounded before they leave the device. 2 decimals is about 1 km.
        self.round_coords = a.getint("round_coords", fallback=2)
        self.min_confidence = a.getfloat("min_confidence", fallback=0.7)
        self.interval = a.getint("interval_seconds", fallback=60)
        self.media_base_url = a.get("media_base_url", "")
        self.license = a.get("license", "https://creativecommons.org/licenses/by/4.0/")
        self.state_path = os.path.expanduser(a.get("state_file", "~/.wdx-agent-state.json"))


def default_station_id() -> str:
    seed = socket.gethostname()
    try:
        seed += Path("/etc/machine-id").read_text().strip()
    except OSError:
        pass
    return hashlib.sha256(seed.encode()).hexdigest()[:12]


def deployment(s: Settings, lat, lon, sensor_type: str, model: str) -> dict | None:
    lat = lat if lat not in (None, 0, 0.0) else s.latitude
    lon = lon if lon not in (None, 0, 0.0) else s.longitude
    if lat is None or lon is None:
        return None
    d = {
        "deploymentId": s.station_id,
        "latitude": round(float(lat), s.round_coords),
        "longitude": round(float(lon), s.round_coords),
        "coordinateUncertaintyMeters": max(1, int(111_000 / (10 ** s.round_coords))),
        "sensorType": sensor_type,
        "sensorModel": model,
    }
    if s.station_name:
        d["name"] = s.station_name
    return d


def base_event(s: Settings, event_id: str, start: str, dep: dict, record_id: str) -> dict:
    return {
        "wdx": "0.1",
        "eventId": event_id,
        "eventStart": start,
        "deployment": dep,
        "review": {"status": "unreviewed"},
        "source": {"system": s.source, "systemVersion": f"wdx-agent/{VERSION}", "sourceRecordId": record_id},
        "license": s.license,
    }


# --- sources: each yields (cursor, event) with cursor strictly increasing ---------------------------------

def read_birdnet_pi(s: Settings, cursor):
    db = sqlite3.connect(f"file:{s.path}?mode=ro", uri=True, timeout=10)
    rows = db.execute(
        "SELECT rowid, Date, Time, Sci_Name, Com_Name, Confidence, Lat, Lon, File_Name FROM detections "
        "WHERE rowid > ? AND Confidence >= ? ORDER BY rowid LIMIT ?",
        (int(cursor or 0), s.min_confidence, BATCH),
    ).fetchall()
    db.close()
    for rowid, date, clock, sci, com, conf, lat, lon, fname in rows:
        dep = deployment(s, lat, lon, "acoustic-recorder", "BirdNET-Pi")
        if dep is None:
            sys.exit("no coordinates: set latitude/longitude in the config")
        ev = base_event(s, f"{s.source}:{s.station_id}:{rowid}", local_iso(date, clock), dep, str(rowid))
        ev["detection"] = {"scientificName": sci, "vernacularName": com, "taxonRank": "species",
                           "confidence": float(conf), "classifier": {"name": "BirdNET", "version": "unknown"}}
        ev["media"] = {"mediaType": "audio", "fileName": fname}
        if s.media_base_url:
            ev["media"]["url"] = f"{s.media_base_url.rstrip('/')}/{fname}"
        yield rowid, ev


def read_birdnet_go(s: Settings, cursor):
    db = sqlite3.connect(f"file:{s.path}?mode=ro", uri=True, timeout=10)
    rows = db.execute(
        "SELECT id, date, time, scientific_name, common_name, confidence, latitude, longitude, clip_name FROM notes "
        "WHERE id > ? AND confidence >= ? ORDER BY id LIMIT ?",
        (int(cursor or 0), s.min_confidence, BATCH),
    ).fetchall()
    db.close()
    for rid, date, clock, sci, com, conf, lat, lon, clip in rows:
        dep = deployment(s, lat, lon, "acoustic-recorder", "BirdNET-Go")
        if dep is None:
            sys.exit("no coordinates: set latitude/longitude in the config")
        ev = base_event(s, f"{s.source}:{s.station_id}:{rid}", local_iso(date, clock), dep, str(rid))
        ev["detection"] = {"scientificName": sci, "vernacularName": com, "taxonRank": "species",
                           "confidence": float(conf), "classifier": {"name": "BirdNET", "version": "unknown"}}
        if clip:
            ev["media"] = {"mediaType": "audio", "fileName": os.path.basename(clip)}
        yield rid, ev


def read_speciesnet(s: Settings, cursor):
    """Folder of SpeciesNet predictions JSON. Cursor maps each file already sent to its mtime."""
    dep = deployment(s, None, None, "camera-trap", "SpeciesNet")
    if dep is None:
        sys.exit("camera traps need latitude/longitude in the config")
    seen = dict(cursor or {})
    sent = 0
    for f in sorted(Path(s.path).glob("**/*.json")):
        mtime = f.stat().st_mtime
        if seen.get(str(f)) == mtime:
            continue
        try:
            preds = json.loads(f.read_text()).get("predictions", [])
        except (OSError, ValueError):
            continue
        file_events = []
        for p in preds:
            score = p.get("prediction_score")
            label = p.get("prediction", "")
            if score is None or score < s.min_confidence or not label:
                continue
            # SpeciesNet label: uuid;class;order;family;genus;species;common name
            parts = label.split(";")
            genus, species, common = (parts + [""] * 7)[4:7]
            if not genus or common in ("blank", "human", "vehicle"):
                continue
            img = Path(p.get("filepath", ""))
            try:
                start = datetime.fromtimestamp(img.stat().st_mtime).astimezone().isoformat(timespec="seconds")
            except OSError:
                start = datetime.fromtimestamp(mtime).astimezone().isoformat(timespec="seconds")
            rid = hashlib.sha256(f"{f}:{p.get('filepath')}".encode()).hexdigest()[:16]
            ev = base_event(s, f"{s.source}:{s.station_id}:{rid}", start, dep, rid)
            det = {"scientificName": f"{genus.capitalize()} {species}".strip(), "taxonRank": "species" if species else "genus",
                   "confidence": float(score), "classifier": {"name": "SpeciesNet", "version": str(p.get("model_version", "unknown"))}}
            if common:
                det["vernacularName"] = common
            ev["detection"] = det
            ev["media"] = {"mediaType": "image", "fileName": img.name or "unknown.jpg"}
            file_events.append(ev)
        seen[str(f)] = mtime
        for ev in file_events:
            sent += 1
            yield dict(seen), ev
        if sent >= BATCH:
            break


def read_ndjson(s: Settings, cursor):
    """Tail a WDX NDJSON file. Cursor is the byte offset."""
    offset = int(cursor or 0)
    with open(s.path, "rb") as fh:
        if os.path.getsize(s.path) < offset:
            offset = 0  # file was rotated
        fh.seek(offset)
        n = 0
        while n < BATCH:
            line = fh.readline()
            if not line or not line.endswith(b"\n"):
                break
            offset = fh.tell()
            if line.strip():
                try:
                    yield offset, json.loads(line)
                    n += 1
                except ValueError:
                    log(f"skipping malformed line before byte {offset}")


SOURCES = {"birdnet-pi": read_birdnet_pi, "birdnet-go": read_birdnet_go, "speciesnet": read_speciesnet, "ndjson": read_ndjson}


def post(s: Settings, events: list) -> dict:
    body = "\n".join(json.dumps(e, separators=(",", ":")) for e in events).encode()
    req = urllib.request.Request(s.endpoint, data=body, method="POST", headers={
        "authorization": f"Bearer {s.api_key}", "content-type": "application/x-ndjson", "user-agent": f"wdx-agent/{VERSION}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def run_once(s: Settings, dry: bool) -> int:
    state = {}
    try:
        state = json.loads(Path(s.state_path).read_text())
    except (OSError, ValueError):
        pass
    key = f"{s.source}:{s.path}"
    batch = list(SOURCES[s.source](s, state.get(key)))
    if not batch:
        return 0
    events = [e for _, e in batch]
    if dry:
        for e in events[:5]:
            print(json.dumps(e, indent=2))
        log(f"dry run: {len(events)} events ready (showing up to 5)")
        return len(events)
    res = post(s, events)
    log(f"sent {res.get('received')} (new {res.get('inserted')}, updated {res.get('updated')}, rejected {res.get('rejected')})")
    if res.get("rejected"):
        log(f"rejected sample: {json.dumps(res.get('rejectedDetails', [])[:2])}")
    if events and not res.get("received"):
        log("server rejected the whole batch; not advancing (check api_key and source in the config)")
        return 0
    # The cursor only advances after the server accepted the batch, so an offline Pi just catches up later.
    state[key] = batch[-1][0]
    tmp = s.state_path + ".tmp"
    Path(tmp).write_text(json.dumps(state))
    os.replace(tmp, s.state_path)
    return len(events)


def main() -> None:
    ap = argparse.ArgumentParser(description="Push wildlife detections to a WDX endpoint")
    ap.add_argument("--config", default="/etc/wdx-agent.ini")
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    s = Settings(args.config)
    if s.source not in SOURCES:
        sys.exit(f"unknown source {s.source}; choose one of {', '.join(SOURCES)}")
    if not s.api_key and not args.dry_run:
        sys.exit("api_key is empty: register at the endpoint or run install.sh")
    log(f"wdx-agent {VERSION} source={s.source} path={s.path} station={s.station_id} -> {s.endpoint}")
    backoff = s.interval
    while True:
        try:
            n = run_once(s, args.dry_run)
            backoff = s.interval
            if args.once or args.dry_run:
                return
            if n >= BATCH:
                continue  # more waiting, keep draining
        except (urllib.error.URLError, TimeoutError, sqlite3.OperationalError) as e:
            detail = e.read().decode()[:200] if isinstance(e, urllib.error.HTTPError) else str(e)
            log(f"error: {detail}; retrying in {backoff}s")
            if args.once:
                sys.exit(1)
            backoff = min(backoff * 2, 3600)
        time.sleep(backoff)


if __name__ == "__main__":
    main()
