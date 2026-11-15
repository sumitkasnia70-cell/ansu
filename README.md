# RunTrack

A running app that works in the phone browser (installable as an app). It shows distance, pace and speed live, saves your runs, and creates a link you can send to anyone.

## Features

- Live distance (km), time, current pace and average pace (min/km), current and average speed (km/h)
- Split time for every completed km
- Pause / resume (paused time is not counted)
- Route map drawn from your GPS points
- Run history saved on your phone
- Share: one tap makes a public link such as `https://your-app.replit.app/r/abc123` that shows distance, time, pace, speed, splits and (optionally) the route
- Installable on the home screen (PWA) and opens offline

## Run on Replit

1. Go to replit.com, click **Create Repl**, choose **Node.js**.
2. Delete the default files, then upload every file and folder from this project (or import the zip). Keep the structure: `server.js`, `package.json`, `.replit` and the `public/` folder.
3. Press **Run**. No install step is needed (no dependencies).
4. Click **Deploy** to get a permanent public URL. Use the `https://` link on your phone.
5. Open the link on your phone and tap **Start run**. Allow Location when asked.
6. To install it as an app: Android Chrome menu, "Add to Home screen". iPhone Safari Share button, "Add to Home Screen".

GPS only works on `https://` pages. Replit links are https, so this works. Plain `http://` links will not give location.

## Files

| File | What it does |
|---|---|
| `server.js` | Serves the app, stores shared runs, renders the public share page |
| `public/index.html` | The whole phone UI |
| `public/core.js` | Distance, pace, speed and GPS-filtering logic (also used by the server) |
| `public/sw.js`, `manifest.webmanifest`, icons | Make it installable and offline-capable |
| `test.js` | Checks the maths. Run with `node test.js` |

## How the numbers are worked out

- Distance: sum of distances between GPS points (haversine formula).
- Bad GPS points are ignored: accuracy worse than 35 m, jumps faster than 12 m/s, and movement under 3 m (standing-still jitter).
- Current pace and speed use the last 30 seconds.
- Average pace = total time / total km. Average speed = total km / total time.

## Important limits (read this)

- **Keep the screen on while running.** A website cannot track GPS in the background. When the screen locks or you switch apps, the browser pauses GPS and some distance is missed. The app asks the phone to keep the screen awake and warns you if it was hidden. For all-day background tracking you would need a native app (for example React Native or Flutter), which is a bigger project.
- **Shared links are public.** Anyone with the link can see the run. The route is off by default because it can reveal your home. Tick "Route map" only if you are fine with that.
- **Storage is a JSON file** (`data/shares.json`) on the server, capped at 2000 shares. On Replit, files can reset on redeploy, so old links may stop working. For permanent links, move this to a database later.
- Runs shared by link are not tied to any account. There is no login in this version.

## Settings

Environment variables (Replit Secrets), all optional:

- `PORT` (default 3000)
- `DAILY_SHARE_LIMIT` (default 30 shares per IP per day)

## Ideas for next steps

Login and friend feed, a real map background, running goals, voice announcements each km, a database for permanent shares, and a native app for background GPS.
