# WildNetwork Base and the field app (Phase 0)

How the field app (BirdEcho) sets up a WildNetwork Base, shows its health, and carries its data out when the Base has no 4G. The Base software lives in the `wildnetwork-base` repo; its README has the exact request and response shapes.

## Onboarding: "What do you have?"

The first screen after install asks what the user has, then sends them down the right path. Every path ends on the same home screen (their station's detections plus Near you from WildNetwork). Users can add more devices later from settings ("Add a device"), which reuses the same screen.

| Choice | What the app does | Sharing with WildNetwork |
| --- | --- | --- |
| **WildNetwork Base** | The "Add a Base" flow below. | Automatic: the Base sends detections itself, or the phone carries them out. |
| **BirdWeather station** (PUC, or a BirdNET-Pi or BirdNET-Go uploading to BirdWeather) | The existing BirdWeather connect: station id, or a token for a private station. | Already included on WildNetwork as anonymous counts. Offer the optional opt-in at `https://wildnetwork.arunrajiah.com/stations/join` (opens in the browser; the token is entered there, never sent through the app). Say clearly: do not also install wdx-agent, or detections are counted twice. |
| **BirdNET-Pi** | The existing local connect (address on the home network). | Ask "Is it also uploading to BirdWeather?" If yes: nothing to do (see above). If no: offer "Share with WildNetwork". Register it with `POST /api/v1/devices` (`model: "birdnet-pi"`, `source: "birdnet-pi"`), then show the one-line wdx-agent install command with the key filled in, to copy into the Pi's terminal. |
| **BirdNET-Go** | The existing local connect. | Same as BirdNET-Pi, with `model` and `source` `"birdnet-go"`. |
| **Recorder without internet** (AudioMoth, Song Meter) | Explain that SD card import is coming in a later release; let them register the device now. | `POST /api/v1/devices` with `model: "audiomoth"` (or `"song-meter"`) and `source: "audiomoth"`. |
| **Camera trap** | Point to SpeciesNet Studio for identifying the photos; SD card import comes later. | `POST /api/v1/devices` with `model: "camera-trap"`, `source: "speciesnet"`. |
| **My own (DIY) device** | Ask for a name, the type (sound, camera, other) and what software identifies species. Register it with `POST /api/v1/devices` (`model: "diy"`, `source: "other"`). Show the device id, the key (once; offer copy and share), the events endpoint, and links to the WDX format (`https://github.com/arunrajiah/wildlife-detection-exchange`) and to wdx-agent's CSV and NDJSON inputs. | The device sends WDX itself, or through wdx-agent. |
| **No device yet** | Go straight to the home screen with Near you and the map, plus a card "Get a WildNetwork Base" linking to the plan page when it is public. | None. |

Notes:
- Ask for location once, on the first path that needs it, and explain that only a rounded position (about 1 km) is shared.
- The device key is shown once. Keep it in secure storage for devices the app manages (Base, phone-carried data); for others, the user copies it to their device.
- Registration allows 5 devices per IP address per day. Show the server's error message if it is hit.

## Findings from the end-to-end test of BirdEcho 0.11.2 (9 October 2026)

Tested on the Android emulator against a real BirdNET-Go station and live WildNetwork. No crashes. Fix in the next release:

1. **"Today" counts use the station's UTC day.** With three detections stamped 2:02 to 2:12 AM local on 9 October, the hero said "TODAY 0 detections" and Stats said "0 Today", because BirdNET-Go's `date` field was still 8 October UTC. Count by local date.
2. **Near you rows leave the app with no warning.** Tapping a species in "Near you" opens the WildNetwork site in the browser; on a fresh phone that lands on Chrome's first-run screen. Either open an in-app species page, or mark the row with an external-link icon and open a custom tab.
3. **Empty Near you reads as "no birds".** With Bangalore set it says "No arrivals or departures in your area in the last 4 weeks." Say also when no area is set, and when WildNetwork has no stations nearby yet, with a link to add one.
4. **Station shown by raw URL twice** ("http://10.0.2.2:8080 / BirdNET-Go · http://10.0.2.2:8080"). Let the user name the station; the onboarding chooser above gives a natural place.
5. **Build numbers:** the GitHub release asset for v0.11.2 is build 48, while Play has build 49. Build the release asset from the same commit as the Play submission, or note the difference in the release.

What worked: connecting to BirdNET-Go, the feed and sighting detail, saving an area, Near you in Boston (four arrivals, all with arrival support 0.5 or more, Eurasian Curlew correctly absent), the "Moving in North America" list.

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
