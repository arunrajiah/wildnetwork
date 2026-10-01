# wdx-agent

Free, open tool that sends the wildlife detections your device already makes to [WildNetwork](https://wildnetwork.arunrajiah.com) (or any [WDX](https://github.com/arunrajiah/wildlife-detection-exchange) endpoint). One Python file, standard library only, no pip.

## Install on a Raspberry Pi

```bash
curl -fsSL https://wildnetwork.arunrajiah.com/agent/install.sh | bash
```

The installer finds BirdNET-Pi or BirdNET-Go, registers a device key, writes `/etc/wdx-agent.ini` and starts a systemd service. Watch it with `journalctl -u wdx-agent -f`.

## Sources

| `source` | `path` | What it reads |
|---|---|---|
| `birdnet-pi` | `~/BirdNET-Pi/scripts/birds.db` | SQLite table `detections` |
| `birdnet-go` | `birdnet.db` | SQLite table `notes` |
| `speciesnet` | folder | SpeciesNet `predictions.json` files (camera traps); set `latitude` and `longitude` |
| `ndjson` | file | any `.wdx.ndjson` file another tool appends WDX events to |

For camera traps or a custom path:

```bash
curl -fsSL https://wildnetwork.arunrajiah.com/agent/install.sh | WDX_SOURCE=speciesnet WDX_PATH=/data/camtrap WDX_LAT=11.41 WDX_LON=76.69 bash
```

## Config (`/etc/wdx-agent.ini`)

```ini
[agent]
endpoint = https://wildnetwork.arunrajiah.com/api/v1/events
api_key = wn_...
source = birdnet-pi
path = /home/pi/BirdNET-Pi/scripts/birds.db
station_name = my-garden
latitude =            ; only needed when the database has no coordinates
longitude =
round_coords = 2      ; privacy: 2 decimals is about 1 km, 1 is about 11 km
min_confidence = 0.7
interval_seconds = 60
```

## Behaviour

- Sends new detections every minute in batches of up to 500.
- The cursor only advances after the server accepts a batch, so a Pi that was offline catches up by itself.
- Event ids are stable, so re-sending never creates duplicates.
- Try it without sending anything: `python3 wdx_agent.py --config wdx-agent.ini --dry-run`.

Get a key by hand: `curl -X POST https://wildnetwork.arunrajiah.com/api/v1/register -H 'content-type: application/json' -d '{"name":"my-station","source":"birdnet-pi"}'`.

Made by [Arun Rajiah](https://www.arunrajiah.com).
