/* =========================================================
   FISOMOVIE PLAYER — application logic
   ========================================================= */
(() => {
  "use strict";

  /* ---------- Tiny helpers ---------- */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- Constants ---------- */
  const HLS_CDN = "https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js";
  const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  const ASPECTS = [
    { id: "fit",  label: "Fit",       css: "contain", scale: 1 },
    { id: "fill", label: "Fill",      css: "cover",   scale: 1 },
    { id: "zoom", label: "Zoom 16:9", css: "cover",   scale: 1.08 },
  ];
  const PREFS_KEY = "fiso-prefs";
  const THEME_KEY = "fiso-theme";

  /* ---------- DOM ---------- */
  const video       = $("#video");
  const stage       = $("#video-stage");
  const overlay     = $("#stage-overlay");
  const overlayMsg  = $("#stage-message");
  const spinner     = $("#stage-spinner");
  const bigPlay     = $("#big-play");

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

  const fileInput   = $("#file-input");
  const fileDrop    = $("#file-drop");
  const folderBtn   = $("#folder-btn");
  const folderInput = $("#folder-input");

  const playlistEl     = $("#playlist");
  const playlistItems  = $("#playlist-items");
  const playlistTitle  = $("#playlist-title");
  const playlistCount  = $("#playlist-count");

  const settingsBtn   = $("#settings-btn");
  const settingsPanel = $("#settings-panel");
  const settingsTitle = $("#settings-title");
  const settingsBack  = $("#settings-back");
  const settingsClose = $("#settings-close");
  const valSpeed      = $("#val-speed");
  const valQuality    = $("#val-quality");
  const valAudio      = $("#val-audio");
  const valSubs       = $("#val-subs");
  const valAspect     = $("#val-aspect");

  const speedView    = $('[data-view="speed"]');
  const qualityList  = $("#quality-list");
  const audioList    = $("#audio-list");
  const subsList     = $("#subs-list");
  const aspectList   = $("#aspect-list");
  const subtitleFile = $("#subtitle-file");

  const toggleAmbient = $("#toggle-ambient");
  const toggleLoop    = $("#toggle-loop");
  const resetBtn      = $("#reset-settings");

  const dropOverlay = $("#drop-overlay");

  /* ---------- State ---------- */
  const state = {
    hls: null,
    sources: [],          // { name, url, file? }
    currentIndex: -1,
    objectUrls: [],       // blob: URLs to revoke
    prefs: {
      volume: 1,
      muted: false,
      speed: 1,
      loop: false,
      ambient: false,
      aspect: "fit",
    },
    settingsStack: ["root"],
    qualityLevels: [],
    externalSubUrl: null,
    dragCount: 0,
    hideTimer: null,
  };

  /* =========================================================
     THEME
     ========================================================= */
  const themeToggle = $("#theme-toggle");
  const storedTheme = (() => {
    try { return localStorage.getItem(THEME_KEY); } catch { return null; }
  })();
  if (storedTheme === "dark" || storedTheme === "light") {
    document.documentElement.dataset.theme = storedTheme;
  }
  themeToggle.addEventListener("click", () => {
    const next =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch {}
  });

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
      $$(".pane").forEach((p) => {
        p.classList.toggle("active", p.dataset.pane === tab.dataset.tab);
      });
    });
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

  const showOverlay = (msg, isLoading) => {
    if (!overlay || !overlayMsg || !spinner) return;
    overlay.hidden = false;
    spinner.style.display = isLoading ? "block" : "none";
    overlayMsg.textContent = msg;
  };
  const showLoading = (msg) => showOverlay(msg || "Loading…", true);
  const showError   = (msg) => showOverlay(msg, false);
  const hideOverlay = () => { if (overlay) overlay.hidden = true; };

  const isDirectMediaUrl = (s) => {
    try {
      const u = new URL(s);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch { return false; }
  };
  const isHlsUrl = (s) => /\.m3u8(\?.*)?$/i.test(s);

  const loadHlsLib = () => {
    if (window.Hls) return Promise.resolve(window.Hls);
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = HLS_CDN;
      s.onload = () => resolve(window.Hls);
      s.onerror = () => reject(new Error("Failed to load HLS library."));
      document.head.appendChild(s);
    });
  };

  /* =========================================================
     SOURCE LOADING
     ========================================================= */
  const destroyHls = () => {
    if (state.hls) {
      try { state.hls.destroy(); } catch {}
      state.hls = null;
    }
  };

  const clearObjectUrls = () => {
    state.objectUrls.forEach((u) => { try { URL.revokeObjectURL(u); } catch {} });
    state.objectUrls = [];
  };

  const applyAspect = () => {
    const a = ASPECTS.find((x) => x.id === state.prefs.aspect) || ASPECTS[0];
    video.style.objectFit = a.css;
    video.style.transform = a.scale === 1 ? "none" : `scale(${a.scale})`;
  };

  const loadSource = async (src, { isUrl = false } = {}) => {
    destroyHls();
    video.removeAttribute("src");
    try { video.load(); } catch {}
    showLoading(isUrl ? "Fetching stream…" : "Opening file…");

    try {
      if (isUrl && isHlsUrl(src)) {
        const Hls = await loadHlsLib();
        if (Hls.isSupported()) {
          const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
          state.hls = hls;
          hls.loadSource(src);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
            state.qualityLevels = (data.levels || []).map((l, i) => ({
              id: i,
              label: l.height ? `${l.height}p` : `Level ${i + 1}`,
            }));
            if (settingsPanel && !settingsPanel.hidden) buildQualityList();
          });
          hls.on(Hls.Events.ERROR, (_, data) => {
            if (!data.fatal) return;
            const msg =
              data.type === "networkError"
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
      urlInput.focus();
      return;
    }
    if (!isDirectMediaUrl(val)) {
      urlError.textContent =
        "That doesn't look like a valid media URL. Use a direct link to a video file or an HLS .m3u8 stream.";
      urlError.hidden = false;
      return;
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

  /* Paste button — only if the Clipboard API is available. */
  if (navigator.clipboard && typeof navigator.clipboard.readText === "function") {
    pasteBtn.hidden = false;
    pasteBtn.addEventListener("click", async () => {
      try {
        const text = (await navigator.clipboard.readText()).trim();
        if (text) {
          urlInput.value = text;
          urlInput.focus();
        }
      } catch {
        urlInput.focus();
      }
    });
  }

  /* =========================================================
     FILES & PLAYLIST
     ========================================================= */
  const isPlayableFile = (f) => {
    const name = (f.name || "").toLowerCase();
    if (f.type && (f.type.startsWith("video/") || f.type.startsWith("audio/"))) {
      return true;
    }
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
      return { name: f.name, url, file: f };
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
    if (!playlistEl || !playlistItems) return;
    playlistEl.hidden = state.sources.length <= 1;
    playlistItems.innerHTML = "";
    playlistCount.textContent = String(state.sources.length);
    if (state.sources.length > 1 && playlistTitle) {
      playlistTitle.textContent = "Playlist";
    }
    state.sources.forEach((src, i) => {
      const li = document.createElement("li");
      li.dataset.index = String(i);
      if (i === state.currentIndex) li.classList.add("active");

      const idx = document.createElement("span");
      idx.className = "idx";
      idx.textContent = String(i + 1);

      const name = document.createElement("span");
      name.className = "name";
      name.textContent = src.name;

      li.append(idx, name);
      li.addEventListener("click", () => playIndex(i));
      playlistItems.appendChild(li);
    });
  };

  const playIndex = async (i) => {
    if (i < 0 || i >= state.sources.length) return;
    state.currentIndex = i;
    $$(".playlist li").forEach((li) =>
      li.classList.toggle("active", Number(li.dataset.index) === i)
    );
    const src = state.sources[i];
    await loadSource(src.url, { isUrl: false });
    video.play().catch(() => {});
  };

  fileInput?.addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length) setPlaylist(files);
    fileInput.value = "";
  });

  folderInput?.addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length) setPlaylist(files);
    folderInput.value = "";
  });

  folderBtn?.addEventListener("click", async () => {
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
    } else {
      folderInput.click();
    }
  });

  /* =========================================================
     DRAG & DROP
     ========================================================= */
  const showDropOverlay = () => { if (dropOverlay) dropOverlay.hidden = false; };
  const hideDropOverlay = () => { if (dropOverlay) dropOverlay.hidden = true; };

  document.addEventListener("dragenter", (e) => {
    if (!e.dataTransfer) return;
    const types = Array.from(e.dataTransfer.types || []);
    if (!types.includes("Files")) return;
    e.preventDefault();
    state.dragCount++;
    showDropOverlay();
  });
  document.addEventListener("dragover", (e) => {
    if (e.dataTransfer) e.preventDefault();
  });
  document.addEventListener("dragleave", (e) => {
    if (!e.dataTransfer) return;
    e.preventDefault();
    state.dragCount = Math.max(0, state.dragCount - 1);
    if (state.dragCount === 0) hideDropOverlay();
  });
  document.addEventListener("drop", (e) => {
    e.preventDefault();
    state.dragCount = 0;
    hideDropOverlay();
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length) setPlaylist(files);
  });

  /* =========================================================
     PLAYER CONTROLS
     ========================================================= */
  const updatePlayPauseUI = () => {
    const playing = !video.paused && !video.ended;
    if (playIcon) playIcon.hidden = playing;
    if (pauseIcon) pauseIcon.hidden = !playing;
    playPauseBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
    if (bigPlay) {
      const showBig = !playing && !!video.src && !video.ended;
      bigPlay.hidden = !showBig;
    }
  };

  const togglePlay = () => {
    if (!video.src) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  playPauseBtn.addEventListener("click", togglePlay);
  bigPlay?.addEventListener("click", togglePlay);

  skipBack.addEventListener("click", () => {
    video.currentTime = Math.max(0, video.currentTime - 10);
  });
  skipFwd.addEventListener("click", () => {
    video.currentTime = Math.min(
      video.duration || Infinity,
      video.currentTime + 10
    );
  });

  /* Volume */
  const updateVolumeUI = () => {
    const muted = video.muted || video.volume === 0;
    if (volIcon) volIcon.hidden = muted;
    if (muteIcon) muteIcon.hidden = !muted;
    muteBtn.setAttribute("aria-label", muted ? "Unmute" : "Mute");
    if (volSlider) volSlider.value = String(muted ? 0 : video.volume);
  };
  muteBtn.addEventListener("click", () => {
    video.muted = !video.muted;
    updateVolumeUI();
  });
  volSlider?.addEventListener("input", () => {
    video.volume = Number(volSlider.value);
    video.muted = video.volume === 0;
    updateVolumeUI();
  });
  video.addEventListener("volumechange", updateVolumeUI);

  /* Fullscreen */
  fsBtn.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      stage.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.();
    }
  });
  document.addEventListener("fullscreenchange", () => {
    const isFs = !!document.fullscreenElement;
    if (fsIcon) fsIcon.hidden = isFs;
    if (fsExitIcon) fsExitIcon.hidden = !isFs;
  });

  /* PiP */
  if (document.pictureInPictureEnabled && pipBtn) {
    pipBtn.hidden = false;
    pipBtn.addEventListener("click", async () => {
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else {
          await video.requestPictureInPicture();
        }
      } catch {}
    });
  }

  /* ---------- Progress ---------- */
  const updateProgress = () => {
    const d = video.duration;
    if (!isFinite(d) || d <= 0) {
      if (playedBar) playedBar.style.width = "0%";
      if (curTimeEl) curTimeEl.textContent = "0:00";
      if (durTimeEl) durTimeEl.textContent = "0:00";
      return;
    }
    const pct = (video.currentTime / d) * 100;
    if (playedBar) playedBar.style.width = pct + "%";
    if (curTimeEl) curTimeEl.textContent = fmtTime(video.currentTime);
    if (durTimeEl) durTimeEl.textContent = fmtTime(d);

    if (video.buffered.length && bufferBar) {
      const end = video.buffered.end(video.buffered.length - 1);
      bufferBar.style.width = Math.min(100, (end / d) * 100) + "%";
    }

    if (seek && document.activeElement !== seek) {
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

  seek?.addEventListener("input", () => {
    const d = video.duration;
    if (!isFinite(d) || d <= 0) return;
    const t = (Number(seek.value) / 1000) * d;
    video.currentTime = t;
    if (playedBar) playedBar.style.width = ((t / d) * 100) + "%";
    if (curTimeEl) curTimeEl.textContent = fmtTime(t);
  });

  video.addEventListener("playing", () => { hideOverlay(); updatePlayPauseUI(); });
  video.addEventListener("pause",   updatePlayPauseUI);
  video.addEventListener("play",    updatePlayPauseUI);
  video.addEventListener("ended",   updatePlayPauseUI);
  video.addEventListener("waiting", () => showLoading("Buffering…"));
  video.addEventListener("canplay", hideOverlay);
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

  /* ---------- Keyboard shortcuts ---------- */
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

  /* ---------- Auto-hide controls ---------- */
  const scheduleHide = () => {
    clearTimeout(state.hideTimer);
    if (video.paused) return;
    state.hideTimer = setTimeout(() => {
      stage.classList.add("controls-hidden");
    }, 2600);
  };
  const showControls = () => {
    stage.classList.remove("controls-hidden");
    scheduleHide();
  };
  ["mousemove", "touchstart", "click", "keydown"].forEach((ev) =>
    stage.addEventListener(ev, showControls, { passive: true })
  );
  video.addEventListener("play", scheduleHide);
  video.addEventListener("pause", () => {
    clearTimeout(state.hideTimer);
    stage.classList.remove("controls-hidden");
  });

  /* =========================================================
     SETTINGS MENU
     ========================================================= */
  const showView = (view) => {
    state.settingsStack = view === "root" ? ["root"] : ["root", view];
    $$(".settings-view", settingsPanel).forEach((v) => {
      v.hidden = v.dataset.view !== view;
    });
    settingsBack.hidden = view === "root";
    const titles = {
      root: "Settings",
      speed: "Playback speed",
      quality: "Quality",
      audio: "Audio track",
      subs: "Subtitles",
      aspect: "Aspect ratio",
    };
    settingsTitle.textContent = titles[view] || "Settings";
  };

  const openSettings = () => {
    settingsPanel.hidden = false;
    settingsBtn.setAttribute("aria-expanded", "true");
    showView("root");
  };
  const closeSettings = () => {
    settingsPanel.hidden = true;
    settingsBtn.setAttribute("aria-expanded", "false");
  };

  settingsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (settingsPanel.hidden) openSettings();
    else closeSettings();
  });
  settingsClose.addEventListener("click", closeSettings);
  settingsBack.addEventListener("click", () => showView("root"));

  document.addEventListener("click", (e) => {
    if (settingsPanel.hidden) return;
    if (!settingsPanel.contains(e.target) && e.target !== settingsBtn) {
      closeSettings();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !settingsPanel.hidden) closeSettings();
  });

  $$("[data-open]", settingsPanel).forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.open;
      if (view === "speed")    buildSpeedList();
      else if (view === "quality") buildQualityList();
      else if (view === "audio")   buildAudioList();
      else if (view === "subs")    buildSubsList();
      else if (view === "aspect")  buildAspectList();
      showView(view);
    });
  });

  /* ---------- Speed ---------- */
  const buildSpeedList = () => {
    if (!speedView) return;
    speedView.innerHTML = "";
    SPEEDS.forEach((s) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice" + (s === state.prefs.speed ? " selected" : "");
      btn.innerHTML = `
        <span>${s}×</span>
        <svg class="tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
      btn.addEventListener("click", () => {
        state.prefs.speed = s;
        video.playbackRate = s;
        if (valSpeed) valSpeed.textContent = s + "×";
        savePrefs();
        buildSpeedList();
      });
      speedView.appendChild(btn);
    });
  };

  /* ---------- Quality ---------- */
  const buildQualityList = () => {
    if (!qualityList) return;
    qualityList.innerHTML = "";

    const addChoice = (id, label, selected, disabled, onClick) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "choice" + (selected ? " selected" : "") + (disabled ? " disabled" : "");
      btn.disabled = !!disabled;
      btn.innerHTML = `
        <span>${label}</span>
        <svg class="tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
      btn.addEventListener("click", onClick);
      qualityList.appendChild(btn);
    };

    if (!state.hls) {
      addChoice("single", "Single quality (source file)", true, true, () => {});
      if (valQuality) valQuality.textContent = "Auto";
      return;
    }

    const current = state.hls.currentLevel;
    addChoice("auto", "Auto", current === -1, false, () => {
      state.hls.currentLevel = -1;
      if (valQuality) valQuality.textContent = "Auto";
      buildQualityList();
    });
    state.qualityLevels.forEach((q) => {
      addChoice(q.id, q.label, current === q.id, false, () => {
        state.hls.currentLevel = q.id;
        if (valQuality) valQuality.textContent = q.label;
        buildQualityList();
      });
    });
  };

  /* ---------- Audio tracks ---------- */
  const buildAudioList = () => {
    if (!audioList) return;
    audioList.innerHTML = "";
    const tracks = video.audioTracks ? Array.from(video.audioTracks) : [];
    if (!tracks.length) {
      const p = document.createElement("p");
      p.className = "settings-note";
      p.textContent =
        "This browser/media does not expose multiple audio tracks. Switching tracks requires an implementation that supports it.";
      audioList.appendChild(p);
      if (valAudio) valAudio.textContent = "Default";
      return;
    }
    tracks.forEach((t, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice" + (t.enabled ? " selected" : "");
      btn.innerHTML = `
        <span>${t.label || t.language || "Track " + (i + 1)}</span>
        <svg class="tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
      btn.addEventListener("click", () => {
        tracks.forEach((x) => (x.enabled = x === t));
        if (valAudio) valAudio.textContent = t.label || t.language || `Track ${i + 1}`;
        buildAudioList();
      });
      audioList.appendChild(btn);
    });
  };

  /* ---------- Subtitles ---------- */
  const hasActiveSub = () =>
    Array.from(video.textTracks || []).some((t) => t.mode === "showing");

  const disableAllSubs = () => {
    Array.from(video.textTracks || []).forEach((t) => (t.mode = "disabled"));
  };

  const buildSubsList = () => {
    if (!subsList) return;
    subsList.innerHTML = "";

    const addChoice = (label, selected, disabled, onClick) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "choice" + (selected ? " selected" : "") + (disabled ? " disabled" : "");
      btn.disabled = !!disabled;
      btn.innerHTML = `
        <span>${label}</span>
        <svg class="tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
      btn.addEventListener("click", onClick);
      subsList.appendChild(btn);
    };

    addChoice("Off", !hasActiveSub(), false, () => {
      disableAllSubs();
      if (valSubs) valSubs.textContent = "Off";
      buildSubsList();
    });

    const textTracks = Array.from(video.textTracks || []).filter(
      (t) => t.kind === "subtitles" || t.kind === "captions"
    );

    if (textTracks.length) {
      textTracks.forEach((t, i) => {
        const label = t.label || t.language || `Track ${i + 1}`;
        addChoice(label, t.mode === "showing", false, () => {
          textTracks.forEach((x) => (x.mode = x === t ? "showing" : "disabled"));
          if (valSubs) valSubs.textContent = label;
          buildSubsList();
        });
      });
    } else {
      const p = document.createElement("p");
      p.className = "settings-note";
      p.textContent =
        "No embedded subtitle tracks found. Load an external .vtt file below.";
      subsList.appendChild(p);
    }
  };

  subtitleFile?.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/\.vtt$/i.test(f.name)) {
      alert(
        "Only WebVTT (.vtt) files are supported natively. Convert .srt / .ass first."
      );
      subtitleFile.value = "";
      return;
    }
    const url = URL.createObjectURL(f);
    if (state.externalSubUrl) URL.revokeObjectURL(state.externalSubUrl);
    state.externalSubUrl = url;

    $$("track[data-external]", video).forEach((t) => t.remove());
    const track = document.createElement("track");
    track.kind = "subtitles";
    track.label = f.name;
    track.srclang = "en";
    track.src = url;
    track.default = true;
    track.dataset.external = "true";
    video.appendChild(track);

    setTimeout(() => {
      const tt = Array.from(video.textTracks).find((t) => t.label === f.name);
      if (tt) {
        Array.from(video.textTracks).forEach((t) => (t.mode = "disabled"));
        tt.mode = "showing";
        if (valSubs) valSubs.textContent = f.name;
      }
      buildSubsList();
    }, 100);
    subtitleFile.value = "";
  });

  /* ---------- Aspect ratio ---------- */
  const buildAspectList = () => {
    if (!aspectList) return;
    aspectList.innerHTML = "";
    ASPECTS.forEach((a) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice" + (a.id === state.prefs.aspect ? " selected" : "");
      btn.innerHTML = `
        <span>${a.label}</span>
        <svg class="tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
      btn.addEventListener("click", () => {
        state.prefs.aspect = a.id;
        applyAspect();
        if (valAspect) valAspect.textContent = a.label;
        savePrefs();
        buildAspectList();
      });
      aspectList.appendChild(btn);
    });
  };

  /* ---------- Ambient / Loop / Reset ---------- */
  toggleAmbient?.addEventListener("change", () => {
    state.prefs.ambient = toggleAmbient.checked;
    stage.classList.toggle("ambient-on", state.prefs.ambient);
    savePrefs();
  });
  toggleLoop?.addEventListener("change", () => {
    state.prefs.loop = toggleLoop.checked;
    savePrefs();
  });
  resetBtn?.addEventListener("click", () => {
    state.prefs.speed = 1;
    state.prefs.aspect = "fit";
    state.prefs.loop = false;
    state.prefs.ambient = false;
    video.playbackRate = 1;
    applyAspect();
    if (toggleLoop) toggleLoop.checked = false;
    if (toggleAmbient) toggleAmbient.checked = false;
    if (valSpeed) valSpeed.textContent = "1×";
    if (valAspect) valAspect.textContent = "Fit";
    savePrefs();
    closeSettings();
  });

  /* =========================================================
     PREFS PERSISTENCE
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
    if (toggleLoop) toggleLoop.checked = state.prefs.loop;
    if (toggleAmbient) toggleAmbient.checked = state.prefs.ambient;
    stage.classList.toggle("ambient-on", state.prefs.ambient);
    if (valSpeed) valSpeed.textContent = state.prefs.speed + "×";
    if (valAspect) {
      valAspect.textContent =
        (ASPECTS.find((a) => a.id === state.prefs.aspect) || ASPECTS[0]).label;
    }
    applyAspect();
    updateVolumeUI();
  };

  /* =========================================================
     INIT
     ========================================================= */
  const init = () => {
    loadPrefs();
    updatePlayPauseUI();
    updateVolumeUI();

    const year = $("#year");
    if (year) year.textContent = new Date().getFullYear();

    /* Page search (simple, in-page). */
    const pageSearch = $("#page-search");
    pageSearch?.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const q = pageSearch.value.trim().toLowerCase();
      if (!q) return;
      const targets = $$("h2, h3, .card h3, .format-card h3");
      const hit = targets.find((el) =>
        el.textContent.toLowerCase().includes(q)
      );
      if (hit) {
        hit.scrollIntoView({ behavior: "smooth", block: "center" });
        hit.classList.add("search-flash");
        setTimeout(() => hit.classList.remove("search-flash"), 1600);
      }
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
