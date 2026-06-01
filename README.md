# Handlebars

A personal POC for syncing ride GPS data with MTB video footage, so I can
generate insights about my riding and compare footage of the same trail
sections across multiple rides.

> Status: **Milestone 1** — load a ride's GPX, see the track on a satellite map,
> drop in a local video file, and scrub one while the other follows.

## Vision / roadmap

- **M1 (now):** import a **GPX** ride → GPS track on a satellite map → local
  video playback synced to the track via timestamps, with a manual offset nudge.
- **M2:** Define trail "sections" and compare speed/time across rides.
- **M3:** ffmpeg backend — frame/thumbnail extraction, side-by-side comparison,
  GoPro GPMF telemetry ingestion (GPS embedded in the video itself).
- **Later:** Mobile app (React Native / Expo) with **in-app ride recording**
  (reliable background GPS, which a browser can't do).

## Architecture

```
handlebars/
├── web/      Vite + React + TypeScript + Leaflet — the whole M1 app.
└── server/   Stub Express backend, NOT used in M1. Returns in M3 for the
               ffmpeg work (frame extraction, GoPro telemetry).
```

M1 is **100% client-side and free**: the GPX is parsed in the browser and the
video is loaded via an in-browser object URL — **nothing is uploaded anywhere**.

## Setup

### 1. Get a GPX file (free — no API, no account tier)

Export an **activity** (a recorded ride, so it has per-point timestamps):

- **Strava:** open the activity → `···` menu → **Export GPX**. (Or bulk-export
  all your data from Settings → My Account → Download or Delete Your Account.)
- **Garmin / Wahoo / others:** export the activity as GPX.

> A *route* file won't work — it has no timestamps to sync against. Use a
> recorded activity.

### 2. Install & run

From the project root:

```bash
npm install        # installs the web app's deps
npm run dev        # web app on http://localhost:5173
```

Open http://localhost:5173, **Load ride (.gpx)**, then **Load video**.

## How the sync works

Each GPS point in the GPX has an absolute timestamp. We anchor to the first
point (`startEpoch`) and store seconds-from-start per point. The video has its
own clock starting at 0; an offset aligns the two:

```
elapsed  = offsetSeconds + video.currentTime
position = interpolate(track, elapsed)   // lat/lng → pin on the satellite map
```

**Auto clock-sync (default):** MP4/MOV files embed a recording start time in the
`moov → mvhd` atom. We read it in-browser (`web/src/lib/videoMeta.ts`, no
dependency) and set `offset = videoStart − rideStart` automatically. For a clip
filmed mid-ride this drops the pin in the right place instantly.

**Manual fallback:** if the video has no usable timestamp (re-exported files,
some cameras) or the clocks drift, use **Align to map** — pause on a spot you
recognize, click it on the trail, and the offset is computed from that. The
slider/number box fine-tunes. Clicking the track also seeks the video (reverse
sync).

The sync math lives in `web/src/lib/sync.ts` (pure, no React), GPX parsing in
`web/src/lib/gpx.ts`, and video-timestamp reading in `web/src/lib/videoMeta.ts`.

## Notes

- Satellite imagery is **Esri World Imagery** — free tiles, no API key.
- Personal project — lives on my personal GitHub, not Bitbucket.
