# WildNetwork Base and the field app (Phase 0)

How the field app (BirdEcho) sets up a WildNetwork Base, shows its health, and carries its data out when the Base has no 4G. The Base software lives in the `wildnetwork-base` repo; its README has the exact request and response shapes.

## Connecting to a Base

Phase 0 uses Wi-Fi only; Bluetooth comes later. A Base runs its own hotspot:

- SSID `WildNetwork-<last 4 characters of the hardware id>`
- password `wn-<setup code>`
- address `10.42.0.1`, port 80

The setup code (8 characters) is printed on the device label. On Android, join with `WifiNetworkSpecifier` and bind only the requests to the Base to that network, so calls to WildNetwork still go over mobile data.

## Local API on the Base

| Request | Setup code needed | Returns |
| --- | --- | --- |
| `GET /api/info` | no | hardwareId, model, hostname, software, configured, deviceId, name, latitude, longitude |
| `POST /api/config` | yes (`X-Setup-Code`) | `{ok, configured}`. Body (all optional): name, latitude, longitude, roundCoords, apiKey, deviceId, endpoint, apn, wifi `{ssid, psk}` |
| `GET /api/status` | no | WDX device-status record: battery, storage, temperatureC, uptimeSeconds, queue.pending, software, network |
| `GET /api/detections?limit=N` | no | `{cursor, events}`: WDX events the Base has not uploaded yet |
| `POST /api/ack` | yes | `{ok}`. Body `{cursor}` from the last `/api/detections` response, sent only after WildNetwork accepted those events |
| `GET /api/recent?hours=24` | no | recent detections for a local view |
| `GET /clips/<file>` | no | the audio clip |
| `GET /` | no | the Base's own dashboard page (a WebView is fine) |

No endpoint ever returns the API key.

## WildNetwork cloud

| Request | What it does |
| --- | --- |
| `POST https://wildnetwork.arunrajiah.com/api/v1/devices` | Body `{name, model: "wildnetwork-base", hardwareId, contact?}`. Returns `{deviceId, apiKey, source: "wildnetwork-base", eventsEndpoint, statusEndpoint}`. 5 per IP per day. |
| `POST /api/v1/events` | Header `Authorization: Bearer <apiKey>`. NDJSON WDX events; used for data pickup. |
| `POST /api/v1/devices/status` | A health report; the Base's wdx-agent sends these itself. |
| `GET /api/v1/devices` | Registered devices with their latest health report (no hardware ids, no locations). |

## Flows for the app

1. **Add a Base**
   1. Scan or type the SSID and setup code.
   2. Join the Base's Wi-Fi and call `GET /api/info`.
   3. Ask for a name. Use the phone's location and let the user adjust it; keep the default rounding of 2 decimals (about 1 km).
   4. Over mobile data, call `POST /api/v1/devices` with that hardwareId.
   5. Call `POST /api/config` with name, latitude, longitude, apiKey and deviceId, plus the APN if a SIM is fitted.
   6. Show the Base as configured.

   Keep the setup code and the API key in the app's secure storage: they are needed for later changes, data pickup and acknowledgements.
2. **Base health:** show `/api/status` when connected to the Base, and `/api/v1/devices` from the cloud otherwise.
3. **Data pickup, when the Base has no 4G**
   1. Connect and call `GET /api/detections`.
   2. Store the events on the phone.
   3. Once the phone has internet, POST them to `/api/v1/events` with the Base's API key.
   4. On the next connection to the Base, call `POST /api/ack` with the cursor.

   WildNetwork deduplicates on eventId, so a retry is safe.
4. **Local view:** open `http://10.42.0.1/` in a WebView while connected.
