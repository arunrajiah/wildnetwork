#!/usr/bin/env bash
# wdx-agent installer for Raspberry Pi / Linux.
#   curl -fsSL https://wildnetwork.arunrajiah.com/agent/install.sh | bash
# Detects BirdNET-Pi or BirdNET-Go, registers a device key, and installs a systemd service.
# Override anything with env vars: WDX_SOURCE, WDX_PATH, WDX_LAT, WDX_LON, WDX_NAME, WDX_KEY, WDX_BASE.
set -euo pipefail

BASE="${WDX_BASE:-https://wildnetwork.arunrajiah.com}"
CONF=/etc/wdx-agent.ini
RUN_USER="${SUDO_USER:-$USER}"
HOME_DIR="$(eval echo "~$RUN_USER")"

say() { printf '\033[1;36m%s\033[0m\n' "$*"; }
command -v python3 >/dev/null || { echo "python3 is required"; exit 1; }

SOURCE="${WDX_SOURCE:-}"; DBPATH="${WDX_PATH:-}"
if [ -z "$SOURCE" ]; then
  for p in "$HOME_DIR/BirdNET-Pi/scripts/birds.db" /home/*/BirdNET-Pi/scripts/birds.db; do
    [ -f "$p" ] && { SOURCE=birdnet-pi; DBPATH="$p"; break; }
  done
fi
if [ -z "$SOURCE" ]; then
  for p in "$HOME_DIR/birdnet-go-app/data/birdnet.db" "$HOME_DIR/birdnet-go/birdnet.db" /data/birdnet.db /home/*/birdnet-go-app/data/birdnet.db; do
    [ -f "$p" ] && { SOURCE=birdnet-go; DBPATH="$p"; break; }
  done
fi
[ -n "$SOURCE" ] || { echo "No BirdNET-Pi or BirdNET-Go database found. Re-run with WDX_SOURCE and WDX_PATH set (sources: birdnet-pi, birdnet-go, speciesnet, ndjson)."; exit 1; }
say "Found $SOURCE at $DBPATH"

NAME="${WDX_NAME:-$(hostname)}"
KEY="${WDX_KEY:-}"
if [ -z "$KEY" ]; then
  REG_SOURCE="$SOURCE"; [ "$SOURCE" = ndjson ] && REG_SOURCE=other
  say "Registering this device with $BASE"
  KEY="$(python3 - "$BASE" "$NAME" "$REG_SOURCE" <<'PY'
import json, sys, urllib.request
base, name, source = sys.argv[1:4]
req = urllib.request.Request(base + "/api/v1/register", data=json.dumps({"name": name, "source": source}).encode(),
                             headers={"content-type": "application/json"}, method="POST")
try:
    print(json.loads(urllib.request.urlopen(req, timeout=30).read())["apiKey"])
except Exception as e:
    sys.stderr.write(f"registration failed: {e}\n"); sys.exit(1)
PY
)"
fi

say "Installing to /opt/wdx-agent"
sudo mkdir -p /opt/wdx-agent
sudo curl -fsSL "$BASE/agent/wdx_agent.py" -o /opt/wdx-agent/wdx_agent.py
sudo chmod 755 /opt/wdx-agent/wdx_agent.py

if [ ! -f "$CONF" ]; then
  sudo tee "$CONF" >/dev/null <<INI
[agent]
endpoint = $BASE/api/v1/events
api_key = $KEY
source = $SOURCE
path = $DBPATH
station_name = $NAME
# Used only when the detection database has no coordinates.
latitude = ${WDX_LAT:-}
longitude = ${WDX_LON:-}
# Coordinates are rounded before leaving this device. 2 decimals is about 1 km; use 1 for about 11 km.
round_coords = 2
min_confidence = 0.7
interval_seconds = 60
state_file = /var/lib/wdx-agent/state.json
INI
  sudo chmod 640 "$CONF"; sudo chown "root:$(id -gn "$RUN_USER")" "$CONF"
else
  say "Keeping existing $CONF"
fi
sudo mkdir -p /var/lib/wdx-agent && sudo chown "$RUN_USER" /var/lib/wdx-agent

curl -fsSL "$BASE/agent/wdx-agent.service" | sed "s/__USER__/$RUN_USER/" | sudo tee /etc/systemd/system/wdx-agent.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now wdx-agent

say "Done. Your detections will appear on $BASE within a minute or two."
echo "Logs:   journalctl -u wdx-agent -f"
echo "Config: $CONF"
