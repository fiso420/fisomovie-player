/* =========================================================
   FISOMOVIE PLAYER — application logic
   ========================================================= */
(() => {
  "use strict";

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- Config ---------- */
  const HLS_CDN = "https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js";
  const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  const ASPECTS = [
    { id: "fit",  label: "Fit",       css: "contain" },
    { id: "fill", label: "Fill",      css: "cover" },
    { id: "zoom", label: "Zoom 16:9", css: "cover" },
  ];

  const PREFS_KEY  = "fiso-prefs";
  const THEME_KEY  = "fiso-theme";
  const ACCENT_KEY = "fiso-accent";
  const COMMENTS_KEY = "fiso-comments";

  /* Bad-word filter. Add more words here. Matches word boundaries. */
  const BAD_WORDS = [
    "fuck","shit","bitch","asshole","bastard","damn","cunt","dick","pussy",
    "slut","whore","nigger","nigga","faggot","retard","cock","twat","wanker",
    "motherfucker","bullshit","piss","crap"
  ];
  const BAD_RE = new RegExp("\\b(" + BAD_WORDS.join("|") + ")\\b", "i");

  /* ---------- DOM ---------- */
  const video       = $("#video");
  const ambientVid  = $("#ambient-video");
  const stage       = $("#video-stage");
  const overlay     = $("#stage-overlay");
  const overlayMsg  = $("#stage-message");
  const spinner     = $("#stage-spinner");
  const bigPlay     = $("#big-play");
  const cutModal    = $("#cut-modal");
  const cutMessage  = $("#cut-message");
  const cutContinue = $("#cut-continue");
  const cutRestart  = $("#cut-restart");

  const playPauseBtn = $("#play-pause");
  const playIcon     = playPauseBtn.querySelector(".i-play");
  const pauseIcon    = playPauseBtn.querySelector(".i-pause");
  const skipBack     = $("#skip-back");
  const skipFwd      = $("#skip-fwd");
  const muteBtn      = $("#mute-btn");
  const volIcon      = muteBtn.querySelector(".i-vol");
  const muteIcon     = muteBtn.querySelector(".i-mute");
  const volSlider    = $("#volume");
  const seek         = $("#seek");
  const playedBar    = $("#progress-played");
  const bufferBar    = $("#progress-buffer");
  const curTimeEl    = $("#current-time");
  const durTimeEl    = $("#duration");
  const fsBtn        = $("#fs-btn");
  const fsIcon       = fsBtn.querySelector(".i-fs");
  const fsExitIcon   = fsBtn.querySelector(".i-fs-exit");
  const pipBtn       = $("#pip-btn");

  const urlInput   = $("#url-input");
  const loadBtn    = $("#load-btn");
  const pasteBtn   = $("#paste-btn");
  const urlError   = $("#url-error");
  const fileInput  = $("#file-input");
  const folderBtn  = $("#folder-btn");
  const folderInput = $("#folder-input");

  const playlistEl    = $("#playlist");
  const playlistItems = $("#playlist-items");
  const playlistCount = $("#playlist-count");

  const settingsBtn   = $("#settings-btn");
  const settingsPanel = $("#settings-panel");
  const settingsTitle = $("#settings-title");
  const settingsBack  = $("#settings-back");
  const settingsClose = $("#settings-close");
  const valQuality    = $("#val-quality");
  const valSpeed      = $("#val-speed");
  const valAudio      = $("#val-audio");
  const valSubs       = $("#val-subs");
  const valAspect     = $("#val-aspect");
  const speedView     = $('[data-view="speed"]');
  const qualityList   = $("#quality-list");
  const audioList     = $("#audio-list");
  const subsList      = $("#subs-list");
  const aspectList    = $("#aspect-list");
  const subtitleFile  = $("#subtitle-file");

  const toggleAmbient = $("#toggle-ambient");
  const toggleStable  = $("#toggle-stable");
  const toggleCrop    = $("#toggle-crop");
  const toggleLoop    = $("#toggle-loop");
  const resetBtn      = $("#reset-settings");

  const dropOverlay = $("#drop-overlay");

  /* ---------- State ---------- */
  const state = {
    hls: null,
    sources: [],
    currentIndex: -1,
    objectUrls: [],
    externalSubUrl: null,
    dragCount: 0,
    hideTimer: 0,
    stallTimer: 0,
    lastTime: 0,
    audioCtx: null,
    stableSource: null,
    stableComp: null,
    prefs: {
      volume: 1, muted: false, speed: 1, loop: false,
      ambient: false, stable: false, crop: false, aspect: "fit",
    },
  };

  /* =========================================================
     THEME + ACCENT
     ========================================================= */
  const themeToggle = $("#theme-toggle");
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t) document.documentElement.dataset.theme = t;
  } catch {}
  themeToggle.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch {}
  });

  const accentPicker = $("#accent-picker");
  const hexToRgb = (hex) => {
    const h = hex.replace("#", "");
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const applyAccent = (hex) => {
    document.documentElement.style.setProperty("--accent", hex);
    const [r, g, b] = hexToRgb(hex);
    document.documentElement.style.setProperty("--accent-glow", `rgba(${r},${g},${b},0.35)`);
    // Slightly lighter hover
    const lr = Math.min(255, r + 30), lg = Math.min(255, g + 30), lb = Math.min(255, b + 30);
    document.documentElement.style.setProperty("--accent-hover", `rgb(${lr},${lg},${lb})`);
    accentPicker.value = hex;
  };
  try {
    const savedAccent = localStorage.getItem(ACCENT_KEY);
    if (savedAccent) applyAccent(savedAccent);
  } catch {}
  accentPicker.addEventListener("input", () => {
    applyAccent(accentPicker.value);
    try { localStorage.setItem(ACCENT_KEY, accentPicker.value); } catch {}
  });

  /* =========================================================
     HELPERS
     ========================================================= */
  const fmtTime = (s) => {
    if (!isFinite(s) || s < 0) return "0:00";
    const total = Math.floor(s);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
  };

  const showOverlay = (msg, loading) => {
    overlay.hidden = false;
    spinner.style.display = loading ? "block" : "none";
    overlayMsg.textContent = msg;
  };
  const showLoading = (m) => showOverlay(m || "Loading…", true);
  const showError   = (m) => showOverlay(m, false);
  const hideOverlay = () => { overlay.hidden = true; };

  const isValidUrl = (s) => {
    try {
      const u = new URL(s);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch { return false; }
  };
  const isHls = (s) => /\.m3u8(\?.*)?$/i.test(s);

  const loadHls = () => {
    if (window.Hls) return Promise.resolve(window.Hls);
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = HLS_CDN;
      s.onload = () => res(window.Hls);
      s.onerror = () => rej(new Error("Failed to load HLS library."));
      document.head.appendChild(s);
    });
  };

  /* =========================================================
     TABS
     ========================================================= */
  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      $$(".tab").forEach((t) => {
        const on = t === tab;
        t.classList.toggle("active", on);
        t.setAttribute("aria-selected", on ? "true" : "false");
      });
      $$(".pane").forEach((p) => p.classList.toggle("active", p.dataset.pane === tab.dataset.tab));
    });
  });

  /* =========================================================
     SOURCE LOADING
     ========================================================= */
  const destroyHls = () => {
    if (state.hls) { try { state.hls.destroy(); } catch {} state.hls = null; }
  };
  const clearObjectUrls = () => {
    state.objectUrls.forEach((u) => { try { URL.revokeObjectURL(u); } catch {} });
    state.objectUrls = [];
  };

  const applyAspect = () => {
    const a = ASPECTS.find((x) => x.id === state.prefs.aspect) || ASPECTS[0];
    video.style.objectFit = a.css;
    ambientVid.style.objectFit = a.css;
    video.style.transform = a.id === "zoom" ? "scale(1.08)" : "none";
  };

  const loadSource = async (src, { isUrl = false } = {}) => {
    destroyHls();
    video.removeAttribute("src");
    try { video.load(); } catch {}
    showLoading(isUrl ? "Fetching stream…" : "Opening file…");
    state.lastTime = 0;

    try {
      if (isUrl && isHls(src)) {
        const Hls = await loadHls();
        if (Hls.isSupported()) {
          const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
          state.hls = hls;
          hls.loadSource(src);
          hls.attachMedia(video);

          hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
            // Build quality list from HLS levels — YouTube-like
            state.qualityLevels = (data.levels || []).map((l, i) => ({
              id: i,
              label: l.height ? `${l.height}p` : `Level ${i + 1}`,
            }));
            buildQualityList();
          });

          // HLS audio tracks are the correct place to switch languages
          hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_, data) => {
            state.hlsAudioTracks = data.audioTracks || [];
            buildAudioList();
          });
          hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_, data) => {
            const t = state.hlsAudioTracks?.[data.id];
            if (t && valAudio) valAudio.textContent = t.name || t.lang || "Track";
            buildAudioList();
          });

          hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
            const q = state.qualityLevels?.[data.level];
            if (q && valQuality) valQuality.textContent = q.label;
          });

          hls.on(Hls.Events.ERROR, (_, data) => {
            if (!data.fatal) return;
            const msg = data.type === "networkError"
              ? "Network error. The stream may be offline, CORS-blocked, or expired."
              : "The HLS stream could not be played.";
            showError(msg);
          });
          return;
        }
        if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = src;
          return;
        }
        throw new Error("This browser cannot play HLS streams.");
      }

      video.src = src;
      video.load();
      // Native audio-track detection fallback
      setTimeout(() => buildAudioList(), 400);
    } catch (err) {
      showError(err.message || "Could not load the source.");
    }
  };

  /* =========================================================
     URL INPUT
     ========================================================= */
  loadBtn.addEventListener("click", async () => {
    urlError.hidden = true;
    const val = urlInput.value.trim();
    if (!val) {
      urlError.textContent = "Please paste a video URL.";
      urlError.hidden = false;
      urlInput.focus(); return;
    }
    if (!isValidUrl(val)) {
      urlError.textContent = "That doesn't look like a valid media URL. Use a direct link to a video file or HLS .m3u8 stream.";
      urlError.hidden = false; return;
    }
    loadBtn.disabled = true;
    try {
      clearPlaylist();
      await loadSource(val, { isUrl: true });
    } finally {
      loadBtn.disabled = false;
    }
  });

  urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); loadBtn.click(); }
  });

  if (navigator.clipboard && typeof navigator.clipboard.readText === "function") {
    pasteBtn.hidden = false;
    pasteBtn.addEventListener("click", async () => {
      try {
        const text = (await navigator.clipboard.readText()).trim();
        if (text) { urlInput.value = text; urlInput.focus(); }
      } catch { urlInput.focus(); }
    });
  }

  /* =========================================================
     FILES & PLAYLIST
     ========================================================= */
  const isPlayableFile = (f) => {
    const name = (f.name || "").toLowerCase();
    if (f.type && (f.type.startsWith("video/") || f.type.startsWith("audio/"))) return true;
    return /\.(mp4|m4v|webm|mkv|mov|avi|flv|ts|m2ts|mp3|m4a|aac|flac|wav|ogg|oga|opus)$/.test(name);
  };
  const naturalSort = (a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

  const setPlaylist = (files) => {
    const vids = files.filter(isPlayableFile).sort(naturalSort);
    if (!vids.length) return;
    clearObjectUrls();
    clearPlaylist();
    state.sources = vids.map((f) => {
      const url = URL.createObjectURL(f);
      state.objectUrls.push(url);
      return { name: f.name, url };
    });
    renderPlaylist();
    playIndex(0);
  };

  const clearPlaylist = () => {
    state.sources = [];
    state.currentIndex = -1;
    if (playlistEl) playlistEl.hidden = true;
    if (playlistItems) playlistItems.innerHTML = "";
    if (playlistCount) playlistCount.textContent = "0";
  };

  const renderPlaylist = () => {
    playlistEl.hidden = state.sources.length <= 1;
    playlistItems.innerHTML = "";
    playlistCount.textContent = String(state.sources.length);
    state.sources.forEach((src, i) => {
      const li = document.createElement("li");
      li.dataset.index = String(i);
      if (i === state.currentIndex) li.classList.add("active");
      const idx = document.createElement("span");
      idx.className = "idx"; idx.textContent = String(i + 1);
      const name = document.createElement("span");
      name.className = "name"; name.textContent = src.name;
      li.append(idx, name);
      li.addEventListener("click", () => playIndex(i));
      playlistItems.appendChild(li);
    });
  };

  const playIndex = async (i) => {
    if (i < 0 || i >= state.sources.length) return;
    state.currentIndex = i;
    $$(".playlist li").forEach((li) =>
      li.classList.toggle("active", Number(li.dataset.index) === i));
    const src = state.sources[i];
    await loadSource(src.url);
    video.play().catch(() => {});
  };

  fileInput.addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length) setPlaylist(files);
    fileInput.value = "";
  });
  folderInput.addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length) setPlaylist(files);
    folderInput.value = "";
  });
  folderBtn.addEventListener("click", async () => {
    if ("showDirectoryPicker" in window) {
      try {
        const dir = await window.showDirectoryPicker();
        const files = [];
        for await (const entry of dir.values()) {
          if (entry.kind === "file") {
            const f = await entry.getFile();
            if (isPlayableFile(f)) files.push(f);
          }
        }
        if (files.length) setPlaylist(files);
        else alert("No playable video files found in that folder.");
      } catch (err) {
        if (err && err.name !== "AbortError") folderInput.click();
      }
    } else folderInput.click();
  });

  /* =========================================================
     DRAG & DROP
     ========================================================= */
  document.addEventListener("dragenter", (e) => {
    if (!e.dataTransfer) return;
    const types = Array.from(e.dataTransfer.types || []);
    if (!types.includes("Files")) return;
    e.preventDefault();
    state.dragCount++;
    dropOverlay.hidden = false;
  });
  document.addEventListener("dragover", (e) => { if (e.dataTransfer) e.preventDefault(); });
  document.addEventListener("dragleave", (e) => {
    if (!e.dataTransfer) return;
    e.preventDefault();
    state.dragCount = Math.max(0, state.dragCount - 1);
    if (state.dragCount === 0) dropOverlay.hidden = true;
  });
  document.addEventListener("drop", (e) => {
    e.preventDefault();
    state.dragCount = 0;
    dropOverlay.hidden = true;
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length) setPlaylist(files);
  });

  /* =========================================================
     PLAYER CONTROLS — the play/pause fix
     ========================================================= */
  const updatePlayPauseUI = () => {
    const playing = !video.paused && !video.ended;
    // FIX: use style.display directly. Hidden attribute works too, but
    // for the two icons inside one button we just toggle a class.
    playIcon.hidden = playing;
    pauseIcon.hidden = !playing;
    playPauseBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
    if (bigPlay) bigPlay.hidden = playing || !video.src || video.ended;
  };

  // FIX: single source of truth for play/pause.
  const togglePlay = () => {
    if (!video.src) return;
    if (video.paused || video.ended) {
      video.play().catch((err) => console.warn("Play failed:", err));
    } else {
      video.pause();
    }
  };
  playPauseBtn.addEventListener("click", togglePlay);
  bigPlay.addEventListener("click", togglePlay);

  // Listen to ALL the events that change play state
  ["play", "playing", "pause", "ended", "loadedmetadata", "emptied"].forEach((ev) => {
    video.addEventListener(ev, updatePlayPauseUI);
  });

  skipBack.addEventListener("click", () => {
    video.currentTime = Math.max(0, video.currentTime - 10);
  });
  skipFwd.addEventListener("click", () => {
    video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10);
  });

  /* Volume */
  const updateVolumeUI = () => {
    const muted = video.muted || video.volume === 0;
    volIcon.hidden = muted;
    muteIcon.hidden = !muted;
    muteBtn.setAttribute("aria-label", muted ? "Unmute" : "Mute");
    volSlider.value = String(muted ? 0 : video.volume);
  };
  muteBtn.addEventListener("click", () => { video.muted = !video.muted; updateVolumeUI(); });
  volSlider.addEventListener("input", () => {
    video.volume = Number(volSlider.value);
    video.muted = video.volume === 0;
    updateVolumeUI();
  });
  video.addEventListener("volumechange", () => {
    updateVolumeUI();
    state.prefs.volume = video.muted ? 0 : video.volume;
    state.prefs.muted = video.muted;
    savePrefs();
  });

  /* Fullscreen */
  fsBtn.addEventListener("click", () => {
    if (!document.fullscreenElement) stage.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.();
  });
  document.addEventListener("fullscreenchange", () => {
    const isFs = !!document.fullscreenElement;
    fsIcon.hidden = isFs;
    fsExitIcon.hidden = !isFs;
  });

  /* PiP */
  if (document.pictureInPictureEnabled && pipBtn) {
    pipBtn.hidden = false;
    pipBtn.addEventListener("click", async () => {
      try {
        if (document.pictureInPictureElement) await document.exitPictureInPicture();
        else await video.requestPictureInPicture();
      } catch {}
    });
  }

  /* Progress */
  const updateProgress = () => {
    const d = video.duration;
    if (!isFinite(d) || d <= 0) {
      playedBar.style.width = "0%";
      curTimeEl.textContent = "0:00";
      durTimeEl.textContent = "0:00";
      return;
    }
    playedBar.style.width = (video.currentTime / d) * 100 + "%";
    curTimeEl.textContent = fmtTime(video.currentTime);
    durTimeEl.textContent = fmtTime(d);
    if (video.buffered.length) {
      const end = video.buffered.end(video.buffered.length - 1);
      bufferBar.style.width = Math.min(100, (end / d) * 100) + "%";
    }
    if (document.activeElement !== seek) {
      seek.value = String(Math.round((video.currentTime / d) * 1000));
    }
  };
  video.addEventListener("timeupdate", updateProgress);
  video.addEventListener("progress", updateProgress);
  video.addEventListener("durationchange", updateProgress);

  video.addEventListener("loadedmetadata", () => {
    updateProgress();
    hideOverlay();
    updatePlayPauseUI();
  });

  seek.addEventListener("input", () => {
    const d = video.duration;
    if (!isFinite(d) || d <= 0) return;
    const t = (Number(seek.value) / 1000) * d;
    video.currentTime = t;
    playedBar.style.width = (t / d) * 100 + "%";
    curTimeEl.textContent = fmtTime(t);
  });

  video.addEventListener("playing", hideOverlay);
  video.addEventListener("canplay", hideOverlay);
  video.addEventListener("waiting", () => showLoading("Buffering…"));
  video.addEventListener("error", () => {
    const codes = {
      1: "Playback aborted.",
      2: "A network error occurred while loading the video.",
      3: "The video could not be decoded — the codec may be unsupported.",
      4: "The video format is not supported by this browser.",
    };
    showError(codes[video.error?.code] || "The video could not be played.");
  });

  video.addEventListener("ended", () => {
    if (state.prefs.loop) {
      video.currentTime = 0;
      video.play().catch(() => {});
    }
  });

  /* =========================================================
     CUT-OFF / STALL DETECTION
     Continue from here, or Restart.
     ========================================================= */
  const showCutModal = (msg) => {
    cutMessage.textContent = msg || "The video stream was cut or the network dropped.";
    cutModal.hidden = false;
  };
  const hideCutModal = () => { cutModal.hidden = true; };

  cutContinue.addEventListener("click", () => {
    hideCutModal();
    // Try to resume from where we were
    if (state.lastTime > 0) video.currentTime = state.lastTime;
    video.play().catch(() => {});
  });
  cutRestart.addEventListener("click", () => {
    hideCutModal();
    video.currentTime = 0;
    video.play().catch(() => {});
  });

  // Track "last good time"
  video.addEventListener("timeupdate", () => {
    if (!video.paused && video.readyState >= 2) {
      state.lastTime = video.currentTime;
      clearTimeout(state.stallTimer);
      // Watch for stalls: if no timeupdate for 12s while playing → cut modal
      state.stallTimer = setTimeout(() => {
        if (!video.paused && !video.ended && video.readyState < 3) {
          showCutModal("Playback looks stalled. Network drop or stream cut?");
        }
      }, 12000);
    }
  });
  video.addEventListener("play", () => { hideCutModal(); });
  video.addEventListener("pause", () => { clearTimeout(state.stallTimer); });
  video.addEventListener("ended", () => { clearTimeout(state.stallTimer); });

  // Hard error while playing → cut modal
  video.addEventListener("error", () => {
    if (!video.paused) showCutModal("The stream was cut. What would you like to do?");
  });

  /* =========================================================
     KEYBOARD SHORTCUTS
     ========================================================= */
  document.addEventListener("keydown", (e) => {
    const t = e.target;
    if (t && (t.matches?.("input, textarea, select") || t.isContentEditable)) return;
    if (!video.src) return;
    const k = e.key;
    if (k === " " || k === "k") { e.preventDefault(); togglePlay(); }
    else if (k === "ArrowLeft")  { e.preventDefault(); video.currentTime = Math.max(0, video.currentTime - 5); }
    else if (k === "ArrowRight") { e.preventDefault(); video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 5); }
    else if (k === "j") { video.currentTime = Math.max(0, video.currentTime - 10); }
    else if (k === "l") { video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10); }
    else if (k === "m") { video.muted = !video.muted; updateVolumeUI(); }
    else if (k === "f") { fsBtn.click(); }
    else if (k === "ArrowUp")   { e.preventDefault(); video.volume = Math.min(1, video.volume + 0.05); updateVolumeUI(); }
    else if (k === "ArrowDown") { e.preventDefault(); video.volume = Math.max(0, video.volume - 0.05); updateVolumeUI(); }
  });

  /* =========================================================
     AUTO-HIDE CONTROLS
     ========================================================= */
  const scheduleHide = () => {
    clearTimeout(state.hideTimer);
    if (video.paused) return;
    state.hideTimer = setTimeout(() => stage.classList.add("controls-hidden"), 2600);
  };
  const showControls = () => {
    stage.classList.remove("controls-hidden");
    scheduleHide();
  };
  ["mousemove", "touchstart", "click", "keydown"].forEach((ev) =>
    stage.addEventListener(ev, showControls, { passive: true }));
  video.addEventListener("play", scheduleHide);
  video.addEventListener("pause", () => {
    clearTimeout(state.hideTimer);
    stage.classList.remove("controls-hidden");
  });

  /* =========================================================
     SETTINGS MENU
     ========================================================= */
  const showView = (view) => {
    $$(".settings-view", settingsPanel).forEach((v) => v.hidden = v.dataset.view !== view);
    settingsBack.hidden = view === "root";
    const titles = { root: "Settings", speed: "Playback speed", quality: "Quality", audio: "Audio track", subs: "Subtitles", aspect: "Aspect" };
    settingsTitle.textContent = titles[view] || "Settings";
  };
  const openSettings  = () => { settingsPanel.hidden = false; settingsBtn.setAttribute("aria-expanded", "true"); showView("root"); };
  const closeSettings = () => { settingsPanel.hidden = true;  settingsBtn.setAttribute("aria-expanded", "false"); };

  settingsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    settingsPanel.hidden ? openSettings() : closeSettings();
  });
  settingsClose.addEventListener("click", closeSettings);
  settingsBack.addEventListener("click", () => showView("root"));
  document.addEventListener("click", (e) => {
    if (settingsPanel.hidden) return;
    if (!settingsPanel.contains(e.target) && e.target !== settingsBtn) closeSettings();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !settingsPanel.hidden) closeSettings();
  });
  $$("[data-open]", settingsPanel).forEach((btn) => {
    btn.addEventListener("click", () => {
      const v = btn.dataset.open;
      if (v === "speed")    buildSpeedList();
      if (v === "quality")  buildQualityList();
      if (v === "audio")    buildAudioList();
      if (v === "subs")     buildSubsList();
      if (v === "aspect")   buildAspectList();
      showView(v);
    });
  });

  /* ---------- Speed ---------- */
  const buildSpeedList = () => {
    speedView.innerHTML = "";
    SPEEDS.forEach((s) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice" + (s === state.prefs.speed ? " selected" : "");
      btn.innerHTML = `<span>${s}×</span>
        <svg class="tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
      btn.addEventListener("click", () => {
        state.prefs.speed = s;
        video.playbackRate = s;
        valSpeed.textContent = s + "×";
        savePrefs();
        buildSpeedList();
      });
      speedView.appendChild(btn);
    });
  };

  /* ---------- Quality (YouTube-like) ---------- */
  const buildQualityList = () => {
    if (!qualityList) return;
    qualityList.innerHTML = "";

    const addChoice = (label, selected, disabled, onClick) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice" + (selected ? " selected" : "") + (disabled ? " disabled" : "");
      btn.disabled = !!disabled;
      btn.innerHTML = `<span>${label}</span>
        <svg class="tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
      btn.addEventListener("click", onClick);
      qualityList.appendChild(btn);
    };

    // HLS: real quality levels
    if (state.hls) {
      const cur = state.hls.currentLevel;
      addChoice("Auto", cur === -1, false, () => {
        state.hls.currentLevel = -1;
        valQuality.textContent = "Auto";
        buildQualityList();
      });
      (state.qualityLevels || []).forEach((q) => {
        addChoice(q.label, cur === q.id, false, () => {
          state.hls.currentLevel = q.id;
          valQuality.textContent = q.label;
          buildQualityList();
        });
      });
      return;
    }

    // Native: read video.videoHeight and try to build a "current" label.
    // We can't actually switch quality on a single MP4, but we still
    // show the option so the UI matches YouTube and explains why.
    const h = video.videoHeight;
    const currentLabel = h ? `${h}p` : "Auto";
    if (valQuality) valQuality.textContent = currentLabel;

    addChoice(currentLabel + " (current)", true, false, () => {});
    addChoice("Auto (source decides)", false, false, () => {
      valQuality.textContent = "Auto";
      buildQualityList();
    });
    const note = document.createElement("p");
    note.className = "settings-note";
    note.textContent = "This source is a single-quality file. To switch quality, load an HLS .m3u8 stream or a multi-bitrate source.";
    qualityList.appendChild(note);
  };

  /* ---------- Audio tracks (HLS + native) ---------- */
  const buildAudioList = () => {
    if (!audioList) return;
    audioList.innerHTML = "";

    const addChoice = (label, selected, disabled, onClick) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice" + (selected ? " selected" : "") + (disabled ? " disabled" : "");
      btn.disabled = !!disabled;
      btn.innerHTML = `<span>${label}</span>
        <svg class="tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
      btn.addEventListener("click", onClick);
      audioList.appendChild(btn);
    };

    // 1. HLS.js audio tracks (this actually works)
    if (state.hls && state.hlsAudioTracks && state.hlsAudioTracks.length) {
      const cur = state.hls.audioTrack;
      state.hlsAudioTracks.forEach((t, i) => {
        const label = [t.name, t.lang, t.channels ? `${t.channels}ch` : ""].filter(Boolean).join(" · ") || `Track ${i + 1}`;
        addChoice(label, cur === i, false, () => {
          state.hls.audioTrack = i;
          valAudio.textContent = label;
          buildAudioList();
        });
      });
      const note = document.createElement("p");
      note.className = "settings-note";
      note.textContent = `${state.hlsAudioTracks.length} audio track${state.hlsAudioTracks.length === 1 ? "" : "s"} available`;
      audioList.appendChild(note);
      return;
    }

    // 2. Native video.audioTracks (Safari and some Chromium builds)
    const nativeTracks = video.audioTracks ? Array.from(video.audioTracks) : [];
    if (nativeTracks.length > 1) {
      nativeTracks.forEach((t, i) => {
        const label = [t.label, t.language, t.kind].filter(Boolean).join(" · ") || `Track ${i + 1}`;
        addChoice(label, t.enabled, false, () => {
          nativeTracks.forEach((x) => (x.enabled = x === t));
          valAudio.textContent = label;
          buildAudioList();
        });
      });
      const note = document.createElement("p");
      note.className = "settings-note";
      note.textContent = `${nativeTracks.length} audio tracks available`;
      audioList.appendChild(note);
      return;
    }

    // 3. Nothing exposed
    const p = document.createElement("p");
    p.className = "settings-note";
    p.textContent = "Audio track switching isn't supported for this source in your browser. It works on HLS .m3u8 streams and on browsers that expose the audioTracks API (Safari, some Chromium builds).";
    audioList.appendChild(p);
    if (valAudio) valAudio.textContent = "Default";
  };

  /* ---------- Subtitles ---------- */
  const hasActiveSub = () => Array.from(video.textTracks || []).some((t) => t.mode === "showing");
  const disableAllSubs = () => Array.from(video.textTracks || []).forEach((t) => (t.mode = "disabled"));

  const buildSubsList = () => {
    if (!subsList) return;
    subsList.innerHTML = "";
    const addChoice = (label, selected, disabled, onClick) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice" + (selected ? " selected" : "") + (disabled ? " disabled" : "");
      btn.disabled = !!disabled;
      btn.innerHTML = `<span>${label}</span>
        <svg class="tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
      btn.addEventListener("click", onClick);
      subsList.appendChild(btn);
    };
    addChoice("Off", !hasActiveSub(), false, () => {
      disableAllSubs();
      valSubs.textContent = "Off";
      buildSubsList();
    });
    const tracks = Array.from(video.textTracks || []).filter((t) => t.kind === "subtitles" || t.kind === "captions");
    if (tracks.length) {
      tracks.forEach((t, i) => {
        const label = t.label || t.language || `Track ${i + 1}`;
        addChoice(label, t.mode === "showing", false, () => {
          tracks.forEach((x) => (x.mode = x === t ? "showing" : "disabled"));
          valSubs.textContent = label;
          buildSubsList();
        });
      });
    } else {
      const p = document.createElement("p");
      p.className = "settings-note";
      p.textContent = "No embedded subtitle tracks found. Load an external .vtt file below.";
      subsList.appendChild(p);
    }
  };

  subtitleFile.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/\.vtt$/i.test(f.name)) {
      alert("Only WebVTT (.vtt) files are supported natively. Convert .srt / .ass first.");
      subtitleFile.value = "";
      return;
    }
    const url = URL.createObjectURL(f);
    if (state.externalSubUrl) URL.revokeObjectURL(state.externalSubUrl);
    state.externalSubUrl = url;
    $$("track[data-external]", video).forEach((t) => t.remove());
    const track = document.createElement("track");
    track.kind = "subtitles"; track.label = f.name; track.srclang = "en";
    track.src = url; track.default = true; track.dataset.external = "true";
    video.appendChild(track);
    setTimeout(() => {
      const tt = Array.from(video.textTracks).find((t) => t.label === f.name);
      if (tt) {
        Array.from(video.textTracks).forEach((t) => (t.mode = "disabled"));
        tt.mode = "showing";
        valSubs.textContent = f.name;
      }
      buildSubsList();
    }, 100);
    subtitleFile.value = "";
  });

  /* ---------- Aspect ---------- */
  const buildAspectList = () => {
    aspectList.innerHTML = "";
    ASPECTS.forEach((a) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice" + (a.id === state.prefs.aspect ? " selected" : "");
      btn.innerHTML = `<span>${a.label}</span>
        <svg class="tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
      btn.addEventListener("click", () => {
        state.prefs.aspect = a.id;
        applyAspect();
        valAspect.textContent = a.label;
        savePrefs();
        buildAspectList();
      });
      aspectList.appendChild(btn);
    });
  };

  /* ---------- Ambient mode (blurred clone) ---------- */
  let ambientSyncRaf = null;
  const syncAmbient = () => {
    if (ambientVid.src !== video.src && video.src) {
      ambientVid.src = video.src;
    }
    ambientVid.currentTime = video.currentTime;
    ambientVid.playbackRate = video.playbackRate;
    if (video.paused) ambientVid.pause();
    else ambientVid.play().catch(() => {});
    if (state.prefs.ambient) {
      ambientSyncRaf = requestAnimationFrame(syncAmbient);
    }
  };
  toggleAmbient.addEventListener("change", () => {
    state.prefs.ambient = toggleAmbient.checked;
    stage.classList.toggle("ambient-on", state.prefs.ambient);
    if (state.prefs.ambient) {
      syncAmbient();
    } else {
      cancelAnimationFrame(ambientSyncRaf);
      ambientVid.pause();
    }
    savePrefs();
  });

  /* ---------- Stable volume (Web Audio compressor) ---------- */
  const initStableVolume = () => {
    if (state.stableSource) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = state.audioCtx || (state.audioCtx = new Ctx());
      const source = ctx.createMediaElementSource(video);
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -24;
      comp.knee.value = 20;
      comp.ratio.value = 6;
      comp.attack.value = 0.005;
      comp.release.value = 0.25;
      source.connect(comp).connect(ctx.destination);
      state.stableSource = source;
      state.stableComp = comp;
      ctx.resume().catch(() => {});
    } catch (err) {
      console.warn("Stable volume init failed:", err);
    }
  };
  toggleStable.addEventListener("change", () => {
    state.prefs.stable = toggleStable.checked;
    if (state.prefs.stable) initStableVolume();
    if (state.stableComp) {
      state.stableComp.ratio.value = state.prefs.stable ? 6 : 1;
      state.stableComp.threshold.value = state.prefs.stable ? -24 : 0;
    }
    savePrefs();
  });

  /* ---------- Crop black bars ---------- */
  toggleCrop.addEventListener("change", () => {
    state.prefs.crop = toggleCrop.checked;
    stage.classList.toggle("crop-black", state.prefs.crop);
    video.style.transform = state.prefs.crop
      ? "scale(1.06)"
      : (state.prefs.aspect === "zoom" ? "scale(1.08)" : "none");
    savePrefs();
  });

  /* ---------- Loop ---------- */
  toggleLoop.addEventListener("change", () => {
    state.prefs.loop = toggleLoop.checked;
    video.loop = state.prefs.loop;
    savePrefs();
  });

  /* ---------- Reset ---------- */
  resetBtn.addEventListener("click", () => {
    Object.assign(state.prefs, { speed: 1, aspect: "fit", loop: false, ambient: false, stable: false, crop: false });
    video.playbackRate = 1;
    video.loop = false;
    applyAspect();
    video.style.transform = "none";
    toggleLoop.checked = false;
    toggleAmbient.checked = false;
    toggleStable.checked = false;
    toggleCrop.checked = false;
    stage.classList.remove("ambient-on", "crop-black");
    cancelAnimationFrame(ambientSyncRaf);
    ambientVid.pause();
    valSpeed.textContent = "1×";
    valAspect.textContent = "Fit";
    savePrefs();
    closeSettings();
  });

  /* =========================================================
     PREFS
     ========================================================= */
  const savePrefs = () => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(state.prefs)); } catch {}
  };
  const loadPrefs = () => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) Object.assign(state.prefs, JSON.parse(raw));
    } catch {}
    video.volume = state.prefs.volume;
    video.muted = state.prefs.muted;
    video.playbackRate = state.prefs.speed;
    video.loop = state.prefs.loop;
    toggleLoop.checked = state.prefs.loop;
    toggleAmbient.checked = state.prefs.ambient;
    toggleStable.checked = state.prefs.stable;
    toggleCrop.checked = state.prefs.crop;
    stage.classList.toggle("ambient-on", state.prefs.ambient);
    stage.classList.toggle("crop-black", state.prefs.crop);
    valSpeed.textContent = state.prefs.speed + "×";
    valAspect.textContent = (ASPECTS.find((a) => a.id === state.prefs.aspect) || ASPECTS[0]).label;
    applyAspect();
    updateVolumeUI();
  };

  /* =========================================================
     COMMENTS (localStorage + bad-word filter)
     ========================================================= */
  const commentForm = $("#comment-form");
  const commentName = $("#comment-name");
  const commentBody = $("#comment-body");
  const commentCounter = $("#comment-count");
  const commentSubmit = $("#comment-submit");
  const commentStatus = $("#comment-status");
  const commentList = $("#comment-list");

  const loadComments = () => {
    try { return JSON.parse(localStorage.getItem(COMMENTS_KEY) || "[]"); }
    catch { return []; }
  };
  const saveComments = (arr) => {
    try { localStorage.setItem(COMMENTS_KEY, JSON.stringify(arr)); } catch {}
  };

  const relTime = (ms) => {
    const diff = Date.now() - ms;
    if (diff < 60_000) return "just now";
    const m = Math.floor(diff / 60_000); if (m < 60) return m + "m ago";
    const h = Math.floor(m / 60); if (h < 24) return h + "h ago";
    const d = Math.floor(h / 24); if (d < 30) return d + "d ago";
    return new Date(ms).toLocaleDateString();
  };

  const renderComment = (c) => {
    const card = document.createElement("div");
    card.className = "comment-card";
    const head = document.createElement("div");
    head.className = "comment-card-head";
    const av = document.createElement("div");
    av.className = "comment-avatar";
    av.textContent = (c.name || "?").trim().charAt(0).toUpperCase() || "?";
    av.style.background = `hsl(${(c.name || "anon").split("").reduce((a, ch) => a + ch.charCodeAt(0), 0) % 360}, 60%, 45%)`;
    const author = document.createElement("span");
    author.className = "comment-author";
    author.textContent = c.name || "Anonymous";
    const time = document.createElement("time");
    time.className = "comment-time";
    time.textContent = relTime(c.createdAt);
    head.append(av, author, time);
    const body = document.createElement("p");
    body.className = "comment-body";
    body.textContent = c.body;
    card.append(head, body);
    return card;
  };

  const renderComments = () => {
    const list = loadComments();
    commentList.innerHTML = "";
    if (!list.length) {
      const empty = document.createElement("p");
      empty.className = "comment-empty";
      empty.textContent = "No comments yet — be the first.";
      commentList.appendChild(empty);
      return;
    }
    list.slice().reverse().forEach((c) => commentList.appendChild(renderComment(c)));
  };

  commentBody.addEventListener("input", () => {
    commentCounter.textContent = commentBody.value.length + " / 1000";
  });

  const setCommentStatus = (msg, kind) => {
    if (!msg) { commentStatus.hidden = true; return; }
    commentStatus.textContent = msg;
    commentStatus.className = "comment-status " + (kind || "");
    commentStatus.hidden = false;
  };

  commentForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = commentName.value.trim().slice(0, 40);
    const body = commentBody.value.trim();

    if (body.length < 2) {
      setCommentStatus("Please write a comment first.", "error");
      commentBody.focus(); return;
    }
    if (BAD_RE.test(body) || BAD_RE.test(name)) {
      setCommentStatus("Your comment contains language that isn't allowed. Please keep it civil.", "error");
      return;
    }

    const list = loadComments();
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: name || "Anonymous",
      body,
      createdAt: Date.now(),
    };
    list.push(entry);
    // Keep only the last 100 comments
    if (list.length > 100) list.splice(0, list.length - 100);
    saveComments(list);

    commentForm.reset();
    commentCounter.textContent = "0 / 1000";
    setCommentStatus("Posted — thanks for the feedback!", "ok");
    setTimeout(() => setCommentStatus(null), 3500);
    renderComments();
  });

  renderComments();

  /* =========================================================
     SEARCH
     ========================================================= */
  const pageSearch = $("#page-search");
  pageSearch?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const q = pageSearch.value.trim().toLowerCase();
    if (!q) return;
    const targets = $$("h2, h3, .card h3, .format-card h3");
    const hit = targets.find((el) => el.textContent.toLowerCase().includes(q));
    if (hit) {
      hit.scrollIntoView({ behavior: "smooth", block: "center" });
      hit.classList.add("search-flash");
      setTimeout(() => hit.classList.remove("search-flash"), 1600);
    }
  });

  /* =========================================================
     INIT
     ========================================================= */
  const init = () => {
    loadPrefs();
    updatePlayPauseUI();
    updateVolumeUI();
    applyAspect();
    const year = $("#year");
    if (year) year.textContent = new Date().getFullYear();
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
