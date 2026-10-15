/* =========================================================
   FISOMOVIE PLAYER — application logic
   ========================================================= */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- Constants ---------- */
  const HLS_CDN = "https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js";
  const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  const ASPECTS = [
    { id: "fit", label: "Fit", css: "contain" },
    { id: "fill", label: "Fill", css: "cover" },
    { id: "zoom", label: "Zoom 16:9", css: "cover", zoom: true },
  ];
  const SUB_STYLE_KEY = "fiso-sub-style";
  const PREFS_KEY = "fiso-prefs";

  /* ---------- DOM ---------- */
  const video = $("#video");
  const stage = $("#video-stage");
  const overlay = $("#stage-overlay");
  const overlayMsg = $("#stage-message");
  const spinner = $("#stage-spinner");
  const bigPlay = $("#big-play");

  const playPauseBtn = $("#play-pause");
  const playIcon = playPauseBtn.querySelector(".i-play");
  const pauseIcon = playPauseBtn.querySelector(".i-pause");
  const skipBack = $("#skip-back");
  const skipFwd = $("#skip-fwd");
  const muteBtn = $("#mute-btn");
  const volIcon = muteBtn.querySelector(".i-vol");
  const muteIcon = muteBtn.querySelector(".i-mute");
  const volSlider = $("#volume");
  const seek = $("#seek");
  const playedBar = $("#progress-played");
  const bufferBar = $("#progress-buffer");
  const curTimeEl = $("#current-time");
  const durTimeEl = $("#duration");
  const fsBtn = $("#fs-btn");
  const fsIcon = fsBtn.querySelector(".i-fs");
  const fsExitIcon = fsBtn.querySelector(".i-fs-exit");
  const pipBtn = $("#pip-btn");

  const urlInput = $("#url-input");
  const loadBtn = $("#load-btn");
  const pasteBtn = $("#paste-btn");
  const urlError = $("#url-error");

  const fileInput = $("#file-input");
  const fileDrop = $("#file-drop");
  const folderBtn = $("#folder-btn");
  const folderInput = $("#folder-input");

  const playlistEl = $("#playlist");
  const playlistItems = $("#playlist-items");
  const playlistTitle = $("#playlist-title");
  const playlistCount = $("#playlist-count");

  const settingsBtn = $("#settings-btn");
  const settingsPanel = $("#settings-panel");
  const settingsTitle = $("#settings-title");
  const settingsBack = $("#settings-back");
  const settingsClose = $("#settings-close");
  const valSpeed = $("#val-speed");
  const valQuality = $("#val-quality");
  const valAudio = $("#val-audio");
  const valSubs = $("#val-subs");
  const valAspect = $("#val-aspect");

  const speedView = $('[data-view="speed"]');
  const qualityList = $("#quality-list");
  const audioList = $("#audio-list");
  const subsList = $("#subs-list");
  const aspectList = $("#aspect-list");
  const subtitleFile = $("#subtitle-file");

  const toggleAmbient = $("#toggle-ambient");
  const toggleLoop = $("#toggle-loop");
  const resetBtn = $("#reset-settings");

  /* ---------- State ---------- */
  const state = {
    hls: null,
    sources: [], // { name, url, file? }
    currentIndex: -1,
    objectUrls: [],
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
    subtitleTracks: [],
    externalSubUrl: null,
  };

  /* =========================================================
     THEME
     ========================================================= */
  const themeToggle = $("#theme-toggle");
  const THEME_KEY = "fiso-theme";
  const storedTheme = localStorage.getItem(THEME_KEY);
  if (storedTheme) document.documentElement.dataset.theme = storedTheme;
  themeToggle.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
  });

  /* =========================================================
     TABS (URL / Files / Folder)
     ========================================================= */
  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      $$(".tab").forEach((t) => {
        t.classList.toggle("active", t === tab);
        t.setAttribute("aria-selected", t === tab ? "true" : "false");
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

  const showError = (msg) => {
    overlay.hidden = false;
    spinner.style.display = "none";
    overlayMsg.textContent = msg;
  };
  const showLoading = (msg = "Loading…") => {
    overlay.hidden = false;
    spinner.style.display = "block";
    overlayMsg.textContent = msg;
  };
  const hideOverlay = () => { overlay.hidden = true; };

  const isDirectMediaUrl = (s) => {
    try {
      const u = new URL(s);
      if (u.protocol !== "http:" && u.protocol !== "https:") return false;
      return true;
    } catch { return false; }
  };

  const isHlsUrl = (s) => /\.m3u8(\?.*)?$/i.test(s);

  const loadHlsLib = () => {
    if (window.Hls) return Promise.resolve(window.Hls);
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = HLS_CDN;
      s.onload = () => resolve(window.Hls);
      s.onerror = () => reject(new Error("Failed to load HLS library"));
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
    state.objectUrls.forEach((u) => URL.revokeObjectURL(u));
    state.objectUrls = [];
  };

  const applyAspect = () => {
    const a = ASPECTS.find((x) => x.id === state.prefs.aspect) || ASPECTS[0];
    video.style.objectFit = a.css;
    if (a.zoom) {
      video.style.transform = "scale(1.08)";
    } else {
      video.style.transform = "none";
    }
  };

  const loadSource = async (src, { isUrl = false, name = "" } = {}) => {
    destroyHls();
    video.removeAttribute("src");
    video.load();
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
            buildQualityList();
          });
          hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) {
              const msg =
                data.type === "networkError"
                  ? "Network error. The stream may be offline, CORS-blocked, or expired."
                  : "The HLS stream could not be played.";
              showError(msg);
            }
          });
          return;
        }
        // Safari can play HLS natively
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
      urlError.textContent = "That doesn't look like a valid media URL. Use a direct link to a video file or an HLS .m3u8 stream.";
      urlError.hidden = false;
      return;
    }
    // Note: we do NOT claim every site URL is playable.
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

  // Paste button (only if allowed)
  if (navigator.clipboard && navigator.clipboard.readText) {
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
     FILES
     ========================================================= */
  const isPlayableFile = (f) => {
    const name = (f.name || "").toLowerCase();
    if (f.type && (f.type.startsWith("video/") || f.type.startsWith("audio/"))) return true;
    return /\.(mp4|m4v|webm|mkv|mov|avi|flv|ts|m2ts|mp3|m4a|aac|flac|wav|ogg|oga|opus)$/.test(name);
  };

  const naturalSort = (a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

  const setPlaylist = async (files) => {
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
    playlistEl.hidden = true;
    playlistItems.innerHTML = "";
    playlistCount.textContent = "0";
  };

  const renderPlaylist = () => {
    playlistEl.hidden = state.sources.length <= 1;
    playlistItems.innerHTML = "";
    playlistCount.textContent = String(state.sources.length);
    if (state.sources.length > 1) {
      playlistTitle.textContent = "Playlist";
    }
    state.sources.forEach((src, i) => {
      const li = document.createElement("li");
      li.dataset.index = String(i);
      if (i === state.currentIndex) li.classList.add("active");
      li.innerHTML = `<span class="idx">${i + 1}</span><span class="name"></span>`;
      li.querySelector(".name").textContent = src.name;
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
    await loadSource(src.url, { name: src.name });
    video.play().catch(() => { /* user can hit play */ });
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

  // Folder button: use File System Access API when available, else fallback
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
        if (err && err.name !== "AbortError") {
          // Fallback
          folderInput.click();
        }
      }
    } else {
      folderInput.click();
    }
  });

  /* =========================================================
     DRAG & DROP
     ========================================================= */
  const dropOverlay = $("#drop-overlay");
  let dragCount = 0;

  document.addEventListener("dragenter", (e) => {
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes("Files")) return;
    e.preventDefault();
    dragCount++;
    dropOverlay.hidden = false;
  });
  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dragCount = Math.max(0, dragCount - 1);
    if (dragCount === 0) dropOverlay.hidden = true;
  });
  document.addEventListener("drop", (e) => {
    e.preventDefault();
    dragCount = 0;
    dropOverlay.hidden = true;
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length) setPlaylist(files);
  });

  /* =========================================================
     PLAYER CONTROLS
     ========================================================= */
  const updatePlayPauseUI = () => {
    const playing = !video.paused && !video.ended && video.readyState > 2;
    playIcon.hidden = playing;
    pauseIcon.hidden = !playing;
    playPauseBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
    bigPlay.hidden = playing || !video.src || video.ended;
  };

  playPauseBtn.addEventListener("click", togglePlay);
  bigPlay.addEventListener("click", togglePlay);

  const togglePlay = () => {
    if (!video.src) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  skipBack.addEventListener("click", () => {
    video.currentTime = Math.max(0, video.currentTime - 10);
  });
  skipFwd.addEventListener("click", () => {
    video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10);
  });

  muteBtn.addEventListener("click", () => {
    video.muted = !video.muted;
    updateVolumeUI();
  });
  volSlider.addEventListener("input", () => {
    video.volume = Number(volSlider.value);
    video.muted = video.volume === 0;
    updateVolumeUI();
  });

  const updateVolumeUI = () => {
    const muted = video.muted || video.volume === 0;
    volIcon.hidden = muted;
    muteIcon.hidden = !muted;
    muteBtn.setAttribute("aria-label", muted ? "Unmute" : "Mute");
    volSlider.value = String(muted ? 0 : video.volume);
  };

  fsBtn.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      stage.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.();
    }
  });
  document.addEventListener("fullscreenchange", () => {
    const isFs = !!document.fullscreenElement;
    fsIcon.hidden = isFs;
    fsExitIcon.hidden = !isFs;
  });

  if (document.pictureInPictureEnabled) {
    pipBtn.hidden = false;
    pipBtn.addEventListener("click", async () => {
      try {
        if (document.pictureInPictureElement) await document.exitPictureInPicture();
        else await video.requestPictureInPicture();
      } catch {}
    });
  }

  /* ---------- Progress / Seek ---------- */
  const updateProgress = () => {
    const d = video.duration;
    if (!isFinite(d) || d <= 0) {
      playedBar.style.width = "0%";
      return;
    }
    const pct = (video.currentTime / d) * 100;
    playedBar.style.width = pct + "%";
    curTimeEl.textContent = fmtTime(video.currentTime);
    durTimeEl.textContent = fmtTime(d);

    // Buffered
    if (video.buffered.length) {
      const end = video.buffered.end(video.buffered.length - 1);
      bufferBar.style.width = Math.min(100, (end / d) * 100) + "%";
    }

    if (!seek.matches(":active")) {
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
    playedBar.style.width = ((t / d) * 100) + "%";
    curTimeEl.textContent = fmtTime(t);
  });

  video.addEventListener("playing", () => { hideOverlay(); updatePlayPauseUI(); });
  video.addEventListener("pause", updatePlayPauseUI);
  video.addEventListener("ended", updatePlayPauseUI);
  video.addEventListener("waiting", () => showLoading("Buffering…"));
  video.addEventListener("canplay", hideOverlay);
  video.addEventListener("error", () => {
    const codes = {
      1: "Playback aborted.",
      2: "A network error occurred while loading the video.",
      3: "The video could not be decoded — the codec may be unsupported.",
      4: "The video format is not supported by this browser.",
    };
    const msg = codes[video.error?.code] || "The video could not be played.";
    showError(msg);
  });

  // Auto-loop single source when loop is on
  video.addEventListener("ended", () => {
    if (state.prefs.loop) {
      video.currentTime = 0;
      video.play().catch(() => {});
    }
  });

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea, select") || e.target.isContentEditable) return;
    // Only when player has a source
    if (!video.src) return;
    const k = e.key;
    if (k === " " || k === "k") { e.preventDefault(); togglePlay(); }
    else if (k === "ArrowLeft") { e.preventDefault(); video.currentTime = Math.max(0, video.currentTime - 5); }
    else if (k === "ArrowRight") { e.preventDefault(); video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 5); }
    else if (k === "j") { video.currentTime = Math.max(0, video.currentTime - 10); }
    else if (k === "l") { video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10); }
    else if (k === "m") { video.muted = !video.muted; updateVolumeUI(); }
    else if (k === "f") { fsBtn.click(); }
    else if (k === "ArrowUp") { e.preventDefault(); video.volume = Math.min(1, video.volume + 0.05); updateVolumeUI(); }
    else if (k === "ArrowDown") { e.preventDefault(); video.volume = Math.max(0, video.volume - 0.05); updateVolumeUI(); }
  });

  /* ---------- Auto-hide controls ---------- */
  let hideTimer = null;
  const scheduleHide = () => {
    clearTimeout(hideTimer);
    if (video.paused) return;
    hideTimer = setTimeout(() => {
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
    clearTimeout(hideTimer);
    stage.classList.remove("controls-hidden");
  });

  /* =========================================================
     SETTINGS MENU
     ========================================================= */
  const showView = (view) => {
    state.settingsStack = view === "root" ? ["root"] : ["root", view];
    $$(".settings-view", settingsPanel).forEach((v) =>
      (v.hidden = v.dataset.view !== view)
    );
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
    if (!settingsPanel.contains(e.target) && e.target !== settingsBtn) closeSettings();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !settingsPanel.hidden) closeSettings();
  });

  // Open specific views
  $$("[data-open]", settingsPanel).forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.open;
      if (view === "speed") buildSpeedList();
      else if (view === "quality") buildQualityList();
      else if (view === "audio") buildAudioList();
      else if (view === "subs") buildSubsList();
      else if (view === "aspect") buildAspectList();
      showView(view);
    });
  });

  /* ---------- Speed ---------- */
  const buildSpeedList = () => {
    speedView.innerHTML = "";
    SPEEDS.forEach((s) => {
      const btn = document.createElement("button");
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

  /* ---------- Quality (HLS only) ---------- */
  const buildQualityList = () => {
    qualityList.innerHTML = "";
    const addChoice = (id, label, selected, disabled, onClick) => {
      const btn = document.createElement("button");
      btn.className = "choice" + (selected ? " selected" : "") + (disabled ? " disabled" : "");
      btn.disabled = !!disabled;
      btn.innerHTML = `<span>${label}</span>
        <svg class="tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
      btn.addEventListener("click", onClick);
      qualityList.appendChild(btn);
    };

    if (!state.hls) {
      addChoice("single", "Single quality (source file)", true, true, () => {});
      valQuality.textContent = "Auto";
      return;
    }

    const current = state.hls.currentLevel;
    addChoice("auto", "Auto", current === -1, false, () => {
      state.hls.currentLevel = -1;
      valQuality.textContent = "Auto";
      buildQualityList();
    });
    state.qualityLevels.forEach((q) => {
      addChoice(q.id, q.label, current === q.id, false, () => {
        state.hls.currentLevel = q.id;
        valQuality.textContent = q.label;
        buildQualityList();
      });
    });
  };

  /* ---------- Audio tracks ---------- */
  const buildAudioList = () => {
    audioList.innerHTML = "";
    const tracks = video.audioTracks ? Array.from(video.audioTracks) : [];
    if (!tracks.length) {
      const p = document.createElement("p");
      p.className = "settings-note";
      p.textContent =
        "This browser/media does not expose multiple audio tracks. Switching tracks requires an implementation that supports it.";
      audioList.appendChild(p);
      valAudio.textContent = "Default";
      return;
    }
    tracks.forEach((t, i) => {
      const btn = document.createElement("button");
      btn.className = "choice" + (t.enabled ? " selected" : "");
      btn.innerHTML = `<span>${t.label || t.language || "Track " + (i + 1)}</span>
        <svg class="tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
      btn.addEventListener("click", () => {
        tracks.forEach((x) => (x.enabled = x === t));
        valAudio.textContent = t.label || t.language || `Track ${i + 1}`;
        buildAudioList();
      });
      audioList.appendChild(btn);
    });
  };

  /* ---------- Subtitles ---------- */
  const buildSubsList = () => {
    subsList.innerHTML = "";
    const addChoice = (id, label, selected, disabled, onClick) => {
      const btn = document.createElement("button");
      btn.className = "choice" + (selected ? " selected" : "") + (disabled ? " disabled" : "");
      btn.disabled = !!disabled;
      btn.innerHTML = `<span>${label}</span>
        <svg class="tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
      btn.addEventListener("click", onClick);
      subsList.appendChild(btn);
    };

    addChoice("off", "Off", !hasActiveSub(), false, () => {
      disableAllSubs();
      valSubs.textContent = "Off";
      buildSubsList();
    });

    const textTracks = Array.from(video.textTracks).filter(
      (t) => t.kind === "subtitles" || t.kind === "captions"
    );

    if (textTracks.length) {
      textTracks.forEach((t, i) => {
        const label = t.label || t.language || `Track ${i + 1}`;
        addChoice(`tt-${i}`, label, t.mode === "showing", false, () => {
          textTracks.forEach((x) => (x.mode = x === t ? "showing" : "disabled"));
          valSubs.textContent = label;
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

    valSubs.textContent = hasActiveSub() ? valSubs.textContent : "Off";
  };

  const hasActiveSub = () =>
    Array.from(video.textTracks).some((t) => t.mode === "showing");

  const disableAllSubs = () => {
    Array.from(video.textTracks).forEach((t) => (t.mode = "disabled"));
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
    const track = document.createElement("track");
    track.kind = "subtitles";
    track.label = f.name;
    track.srclang = "en";
    track.src = url;
    track.default = true;
    // Remove old external track
    $$("track[data-external]", video).forEach((t) => t.remove());
    track.dataset.external = "true";
    video.appendChild(track);
    // Enable it
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

  /* ---------- Aspect ratio ---------- */
  const buildAspectList = () => {
    aspectList.innerHTML = "";
    ASPECTS.forEach((a) => {
      const btn = document.createElement("button");
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

  /* ---------- Ambient / Loop / Reset ---------- */
  toggleAmbient.addEventListener("change", () => {
    state.prefs.ambient = toggleAmbient.checked;
    stage.classList.toggle("ambient-on", state.prefs.ambient);
    savePrefs();
  });
  toggleLoop.addEventListener("change", () => {
    state.prefs.loop = toggleLoop.checked;
    savePrefs();
  });
  resetBtn.addEventListener("click", () => {
    state.prefs.speed = 1;
    state.prefs.aspect = "fit";
    state.prefs.loop = false;
    state.prefs.ambient = false;
    video.playbackRate = 1;
    applyAspect();
    toggleLoop.checked = false;
    toggleAmbient.checked = false;
    valSpeed.textContent = "1×";
    valAspect.textContent = "Fit";
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
    toggleLoop.checked = state.prefs.loop;
    toggleAmbient.checked = state.prefs.ambient;
    stage.classList.toggle("ambient-on", state.prefs.ambient);
    valSpeed.textContent = state.prefs.speed + "×";
    valAspect.textContent =
      (ASPECTS.find((a) => a.id === state.prefs.aspect) || ASPECTS[0]).label;
    applyAspect();
    updateVolumeUI();
  };

  // Save volume on change
  video.addEventListener("volumechange", () => {
    state.prefs.volume = video.muted ? 0 : video.volume;
    state.prefs.muted = video.muted;
    savePrefs();
  });

  /* =========================================================
     INIT
     ========================================================= */
  const init = () => {
    loadPrefs();
    updatePlayPauseUI();
    updateVolumeUI();
    $("#year").textContent = new Date().getFullYear();
    // Prevent page scroll for space/etc handled in keydown above.
    // Page-wide search (nice-to-have)
    const pageSearch = $("#page-search");
    if (pageSearch) {
      pageSearch.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        const q = pageSearch.value.trim().toLowerCase();
        if (!q) return;
        const target = $$("h2, h3, .card h3, .format-card h3").find((el) =>
          el.textContent.toLowerCase().includes(q)
        );
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "center" });
          target.classList.add("search-flash");
          setTimeout(() => target.classList.remove("search-flash"), 1600);
        }
      });
    }
  };

  init();
})();
