# FISOMOVIE PLAYER

Liquid Glass. Minimal. Fast. Responsive.

A static video player built with HTML, CSS and vanilla JavaScript. No build step, no backend, no analytics, no ads.

## Files

- `index.html` – entry point
- `style.css` – themes (CSS custom properties), glass surfaces, responsive layout
- `script.js` – player logic (native HTML5 video; HLS.js is loaded only when needed)

## Run locally

Serve the folder with any static server, for example `python3 -m http.server 8080`, then open http://localhost:8080.

## Deploy

**Vercel**
1. Push the folder to a Git repository, then choose *Add New → Project* and import it.
2. Framework Preset: *Other*. Leave build command and output directory empty. The project root is served as-is.
3. Deploy. (CLI alternative: run `vercel --prod` inside the folder.)

**Netlify**
1. Drag the folder onto https://app.netlify.com/drop, or import the Git repository.
2. Build command: empty. Publish directory: `.` (the folder containing `index.html`).
3. Deploy.

No `vercel.json` or `netlify.toml` is required. Both platforms serve over HTTPS, which is needed for `https://` media, Picture-in-Picture and fullscreen on many browsers.

## Playing media

- Use **direct** links to a video file (MP4 H.264/AAC and WebM play most widely) or an `.m3u8` HLS playlist. Web page URLs (YouTube, Vimeo and similar) cannot be played.
- Because this site is served over HTTPS, `http://` media is blocked by browsers (mixed content). Use `https://`.
- Plain file links usually play without CORS headers. **HLS needs CORS**: the playlist and segments must be served with `Access-Control-Allow-Origin` allowing your site. Without it, HLS.js cannot load them.
- Safari (iOS/macOS) plays HLS natively. Other browsers load HLS.js (v1.5.17) from jsDelivr on first use only. To avoid the third-party request, download `hls.min.js`, place it in the project (for example `vendor/hls.min.js`) and change `HLS_URL` at the top of `script.js` to `'vendor/hls.min.js'`.
- Expired signed links, blocked hotlinking, unsupported codecs (for example HEVC or MKV in some browsers) and server outages show an error message instead of playing.
- Smooth playback depends on your connection, the server and the encoding. The player loads only metadata up front and uses native streaming; it never downloads the whole file first.

## Local files and subtitles

Choose or drag a video file onto the page. It plays through a temporary in-browser URL and is never uploaded. Add `.vtt` (WebVTT) subtitles after a video is loaded; press **C** to cycle tracks or turn them off. Subtitles are cleared when you switch videos.

## Shortcuts

Space / K play-pause · J / L skip 10 s · ← / → skip 5 s · ↑ / ↓ volume · M mute · F fullscreen · C subtitles · P Picture in Picture

## Browser notes

- iPhone Safari uses the system fullscreen player, and the volume slider is hidden because iOS keeps volume under hardware control.
- Autoplay is never attempted; playback always starts from a user action.
- Picture-in-Picture appears only where the browser supports it.

## Testing status

The code was syntax-checked with Node. It has **not** been run in real browsers, on devices or on Vercel/Netlify from this environment. Before relying on it, run through: theme toggle and reload persistence, valid and invalid URLs, local file and source switching, play/seek/volume/speed, subtitles, fullscreen and PiP, keyboard use, reduced-motion, and layouts at phone, tablet and desktop sizes in portrait and landscape.
