# Genki Arcade · POC

Bare-bones proof-of-concept for the rebuilt Genki Arcade app. Validates that
the browser pipeline (UVC capture + low-latency audio passthrough +
on-the-fly resolution/fps switching + screenshot) works end-to-end with
ShadowCast 3 before we commit to the full rebuild.

## Run it

```bash
npm install
npm run dev
```

Open the printed `https://localhost:...` URL. `vite-plugin-mkcert` generates
a trusted local cert automatically — needed because `getUserMedia` only works
on HTTPS or `localhost`.

## What to test

1. Plug in ShadowCast 3 with an HDMI source running.
2. Click **Grant access & list devices** — accept the permission prompt.
   Device labels should now show "ShadowCast" and the picker auto-selects it.
3. Press **Start**. Video should appear; audio from the HDMI source should
   play through your speakers.
4. Change resolution / framerate from the dropdowns. The track should
   re-apply constraints without a full restart. Watch the live readout in
   the top bar to confirm what the device actually negotiated.
5. Toggle **Mirror** — picture flips horizontally.
6. **Screenshot** — saves a PNG matching the on-screen orientation.
7. Unplug ShadowCast — picker updates via `devicechange`.

## What this proves (or disproves)

- ✅ UVC enumeration works without device-locking.
- ✅ Audio DSP can be disabled (no AGC / noise suppression / echo cancel).
- ✅ Resolution/fps switching works on the live track.
- ✅ Screenshots match the displayed orientation.
- ❓ End-to-end latency. Eyeball it against the source; if it feels too
  laggy, that's the signal to consider a native Windows path
  (Media Foundation / WASAPI exclusive) for the desktop build.

## Next steps once this checks out

- Wire the same build into Electron for the Windows app.
- Add `MediaRecorder` for clip recording.
- Per-device capability inspection via `track.getCapabilities()` so the
  resolution/fps dropdowns reflect what the connected ShadowCast actually
  reports rather than the fallback list.
- Persist settings (last device, mirror, resolution) to localStorage.
- Dark/light theming, error states, connection-lost recovery.
