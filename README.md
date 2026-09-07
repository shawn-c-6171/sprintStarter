# SprintStarter Web App

SprintStarter is a mobile-first web app for practicing sprint-start reaction time on iPhone without an Apple developer license.

## What it does

- Press and hold the thumb button while you set in your 4-point start.
- The app runs a 3-2-1 countdown.
- On GO, release immediately.
- It calculates and shows your reaction time in milliseconds.
- Releasing before GO is marked as a false start.
- Includes two modes in Settings:
	- Hold to start, release on GO
	- Tap to start, auto-detect run on GO (no continuous hold)
- Gunshot intensity is configurable in Settings (50% to 200%).

## Run locally

1. In this folder, start a local server:
	- `python3 -m http.server 8080`
2. On your iPhone, open Safari and visit:
	- `http://YOUR_COMPUTER_LOCAL_IP:8080`
3. Tap Share -> Add to Home Screen for full-screen app behavior.

## Files

- `index.html`: app layout
- `styles.css`: mobile UI styling
- `app.js`: hold/countdown/release timing logic
- `manifest.webmanifest`: install metadata

## Using a real meet countdown sample

1. Put your licensed/recorded audio file in this project, for example `assets/meet-countdown.mp3`.
2. Open Settings in the app.
3. Set "Optional real countdown sample URL/path" to `assets/meet-countdown.mp3`.
4. Set "Gunshot moment in sample" to the millisecond timestamp where the gun fires.
5. Save settings and run a start.

If no sample URL is set, the app uses built-in voice cues and a synthesized loud gunshot.
