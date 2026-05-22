# spoolman-print

A browser-based label printer for [Spoolman](https://github.com/Donkie/Spoolman) running alongside a Bambu Lab AMS setup. Prints filament spool labels to a **SUPVAN T50M Pro** (and similar SUPVAN label printers) via the WebHID API — no drivers, no desktop app, no cloud.

## Features

- **Print spool labels** directly from your Spoolman library — QR code + filament info in one click
- **AMS tray overview** via [SpoolmanSync](https://github.com/gibz104/spoolmansync): see what is loaded in each AMS slot, detect unregistered spools and material/color mismatches
- **Register new spools** through a guided 5-step wizard:
  - Vendor auto-match from AMS tray name
  - Material defaults (extruder/bed temp, density) for 20+ material types
  - Color name lookup from the [Open Filament Database](https://openfilamentdatabase.org/)
  - Writes spool RFID tag to Spoolman `extra.tag` for future re-identification
- **4-line label layout**: Brand · Color name · Product line · Extruder temp
- Persists label size and QR/text scale settings in `localStorage`

## Requirements

- Chrome or Edge (WebHID is not supported in Firefox)
- A SUPVAN T50M Pro label printer (VID `0x1820`, PID `0x2076`)
- A running [Spoolman](https://github.com/Donkie/Spoolman) instance
- Optionally: [SpoolmanSync](https://github.com/gibz104/spoolmansync) with a Bambu Lab printer integrated via Home Assistant

## Local development

```bash
cp .env.example .env.local
# Edit .env.local — set SPOOLMAN_URL and SPOOLMANSYNC_URL to your local instances

npm install
npm run dev
```

Open http://localhost:5173 in Chrome.

The Vite dev server proxies `/api` → Spoolman and `/spoolmansync-api` → SpoolmanSync to avoid CORS issues during development.

## Docker

```bash
docker build -t spoolman-print .

docker run -p 8080:80 \
  -e SPOOLMAN_URL=http://spoolman.local:7912 \
  -e SPOOLMANSYNC_URL=http://spoolmansync.local:3000 \
  spoolman-print
```

Open http://localhost:8080 in Chrome.

The nginx reverse proxy inside the container handles the `/api` and `/spoolmansync-api` prefixes at runtime using the env vars — no rebuild needed when URLs change.

## Building and pushing to a registry

```bash
# Build and push :latest + :<version> to ghcr.io
./scripts/build-push.sh v1.0.0

# Use a different registry
IMAGE=docker.io/youruser/spoolman-print ./scripts/build-push.sh v1.0.0

# Multi-arch (amd64 + arm64)
PLATFORM=linux/amd64,linux/arm64 ./scripts/build-push.sh v1.0.0
```

## Kubernetes

The `k8s/` directory contains example manifests (Deployment, Service, Ingress) with placeholder values. Replace `YOUR_REGISTRY`, `YOUR_NAMESPACE`, and `YOUR_DOMAIN` before applying.

Environment variables required at runtime:

| Variable | Description |
|---|---|
| `SPOOLMAN_URL` | Base URL of the Spoolman service (no trailing slash) |
| `SPOOLMANSYNC_URL` | Base URL of the SpoolmanSync service (no trailing slash) |

## Credits

The WebHID print protocol implementation is derived from
**[gpioblink/supvan-t50-pro-webhid](https://github.com/gpioblink/supvan-t50-pro-webhid)**,
which reverse-engineered the SUPVAN T50 Pro USB/HID protocol from the vendor SDK.

## License

MIT — see [LICENSE](LICENSE)
