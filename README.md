# FISOMOVIE PLAYER

A lightweight, modern HTML5 web video player featuring an Apple Liquid Glass design language, native cross-origin playback, adaptive HLS streaming, multi-track audio support, in-memory subtitle parsing, and built-in stream diagnostics.

**Repository:** [https://github.com/fiso420/fisomovie-player](https://github.com/fiso420/fisomovie-player)  
**Deployment:** Zero-build static website ready for Vercel, Netlify, GitHub Pages, or any standard HTTP server.

---

## Overview & Core Features

FISOMOVIE PLAYER is built using vanilla HTML5, CSS3, and JavaScript with no heavyweight frontend frameworks. It provides a clean, responsive interface optimized for mobile phones, tablets, laptops, and desktop monitors.

- **Streaming Pipelines**:
  - **Native Progressive Playback**: Direct streaming for compatible MP4 and WebM files without mandatory CORS headers on media endpoints.
  - **HLS Adaptive Streaming**: Pinned integration with `Hls.js` for `.m3u8` master and media playlists. Automatic fallback to native HLS on Apple Safari / iOS WebKit.
- **Playback Controls**:
  - Play, pause, skip backward/forward by 10 seconds.
  - Interactive timeline scrubber with buffered range display and seek preview tooltip.
  - Volume slider with persistent mute toggle.
  - Fullscreen API and Picture-in-Picture (PiP) support where permitted by the browser.
  - Playback speed selection (0.25x, 0.5x, 0.75x, 1x, 1.25x, 1.5x, 1.75x, 2x).
  - Auto-hiding control bar on idle during active playback.
- **Audio & Rendition Controls**:
  - **Adaptive Quality Menu**: Exposes real HLS stream levels (e.g., 1080p, 720p, 480p, 360p) with an Auto mode. Explains when progressive MP4 files are playing at their fixed native resolution.
  - **Audio Track Selector**: Seamlessly switches audio tracks on HLS streams (`hls.audioTracks`) and native multi-track engines (Safari `video.audioTracks`). Displays transparent diagnostic messages on Chromium/Firefox when container constraints prevent multi-audio demuxing on static files.
- **Subtitles & Text Tracks**:
  - Supports external `.vtt` and `.srt` subtitle files.
  - Instant client-side parsing of `.srt` files into memory using Web Workers and Blob URLs (no backend upload required).
  - Configurable subtitle text sizes (Small, Normal, Large, Extra Large).
- **Stream Diagnostics & Interruption Recovery**:
  - Pre-flight URL inspector that identifies file-host landing pages (such as VikingFile, Google Drive, MediaFire, Mega, Dropbox) and alerts users that direct media byte streams are required.
  - Granular error decomposition (`MEDIA_ERR_ABORTED`, `MEDIA_ERR_NETWORK`, `MEDIA_ERR_DECODE`, `MEDIA_ERR_SRC_NOT_SUPPORTED`).
  - Actionable recovery modal offering **Retry Stream**, **Open Local File**, and **Restart** options.
- **Appearance & Liquid Glass UI**:
  - Translucent glassmorphic panels (`backdrop-filter: blur()`), soft borders, and fluid micro-interactions.
  - Dark, Light, and System theme synchronization.
  - Accent palette presets plus a custom HEX color picker persisted in `localStorage`.
  - Respects user accessibility preferences (`prefers-reduced-motion`).
- **Community Discussion Demo**:
  - Client-side comment board with basic moderation filters and strict DOM text escaping to demonstrate safe UI rendering.

---

## Support the Project ☕

FISOMOVIE PLAYER is completely free and open source. All playback features, controls, and streaming modules are unrestricted for all users.

If this player has been useful to you and you wish to support ongoing maintenance and cross-browser testing, optional donations via WebMoney are appreciated.

### WebMoney Wallet Information

| Parameter | Details |
| :--- | :--- |
| **Payment Service** | WebMoney Transfer |
| **Wallet Type** | WMT |
| **Receiving Wallet Number** | `T668356659070` |
| **WMID** | `625444252474` |
| **Status** | Manual transfer supported. Direct web checkout pending gateway verification. |

> **Security & Privacy Notice:**
> - Donations are completely voluntary. Donating does not unlock extra features or bypass player limitations.
> - Always use the **Wallet Number** (`T668356659070`) as the payment destination. The WMID is an account identifier and should not be used as a replacement for the wallet number during a transfer.
> - FISOMOVIE PLAYER will never ask you for passwords, SMS confirmation codes, private keys, or personal account credentials.
> - Automated payment receipts and transaction verifications are not processed on this static site. Verify all details directly within your official WebMoney Keeper application before sending funds.

### How to Send an Optional Transfer
1. Open your official **WebMoney Keeper** application (mobile, desktop, or web).
2. Select **Transfer** &rarr; **To a purse**.
3. Choose **WMT** as the currency/purse type.
4. Enter the receiving purse number: `T668356659070`.
5. Enter your desired amount and confirm the transaction inside your WebMoney app.
