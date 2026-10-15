/* =========================================================
   FISOMOVIE PLAYER — application logic
   ========================================================= */
(() => {
  "use strict";

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- Config ---------- */
  const PREFS_KEY   = "fiso-prefs";
  const THEME_KEY   = "fiso-theme";
  const ACCENT_KEY  = "fiso-accent";
  const COMMENTS_KEY = "fiso-comments";

  /* Bad-word filter. Matches word boundaries only — add more here. */
  const BAD_WORDS = [
    "fuck","shit","bitch","asshole","bastard","damn","cunt","dick","pussy",
    "slut","whore","nigger","nigga","faggot","retard","cock","twat","wanker",
    "motherfucker","bullshit","piss","crap"
  ];
  const BAD_RE = new RegExp("\\b(" + BAD_WORDS.join("|") + ")\\b", "i");

  /* ---------- DOM ---------- */
  const player      = $("#movi-player");
  const stage       = $("#video-stage");
  const cutModal    = $("#cut-modal");
  const cutMessage  = $("#cut-message");
  const cutContinue = $("#cut-continue");
  const cutRestart  = $("#cut-restart");

  const urlInput = $("#url-input");
  const loadBtn  = $("#load-btn");
  const pasteBtn = $("#paste-btn");
  const urlError = $("#url-error");
  const fileInput = $("#file-input");
  const folderBtn = $("#folder-btn");
  const folderInput = $("#folder-input");

  const playlistEl    = $("#playlist");
  const playlistItems = $("#playlist-items");
  const playlistCount = $("#playlist-count");

  const dropOverlay = $("#drop-overlay");

  /* ---------- State ---------- */
  const state = {
    sources: [],
    currentIndex: -1,
    objectUrls: [],
    dragCount: 0,
    stallTimer: 0,
    lastTime: 0,
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
    // Push the new theme into the player too
    player.setAttribute("theme", next);
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
    const lr = Math.min(255, r + 30), lg = Math.min(255, g + 30), lb = Math.min(255, b + 30);
    document.documentElement.style.setProperty("--accent-hover", `rgb(${lr},${lg},${lb})`);
    accentPicker.value = hex;
    // Give the accent to the player too
    player.style.setProperty("--movi-accent", hex);
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
  const isValidUrl = (s) => {
    try {
      const u = new URL(s);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch { return false; }
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
  const clearObjectUrls = () => {
    state.objectUrls.forEach((u) => { try { URL.revokeObjectURL(u); } catch {} });
    state.objectUrls = [];
  };

  const setSource = (src) => {
    // The movi-player element accepts a string src, a File, or a Blob
    if (!player) return;
    player.removeAttribute("src");
    // Detach then re-attach — this forces a clean reload for the element
    player.src = src;
    player.load?.();
  };

  /* ---------- URL ---------- */
  loadBtn.addEventListener("click", () => {
    urlError.hidden = true;
    const val = urlInput.value.trim();
    if (!val) {
      urlError.textContent = "Please paste a video URL.";
      urlError.hidden = false;
      urlInput.focus();
      return;
    }
    if (!isValidUrl(val)) {
      urlError.textContent = "That doesn't look like a valid media URL. Use a direct link to a video file or HLS .m3u8 stream.";
      urlError.hidden = false;
      return;
    }
    clearPlaylist();
    setSource(val);
    // Scroll the player into view
    stage.scrollIntoView({ behavior: "smooth", block: "center" });
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

  /* ---------- FILES & PLAYLIST ---------- */
  const isPlayableFile = (f) => {
    const name = (f.name || "").toLowerCase();
    if (f.type && (f.type.startsWith("video/") || f.type.startsWith("audio/"))) return true;
    return /\.(mp4|m4v|webm|mkv|mov|avi|flv|ts|m2ts|mp3|m4a|aac|flac|wav|ogg|oga|opus|m3u8)$/.test(name);
  };
  const naturalSort = (a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

  const setPlaylist = (files) => {
    const vids = files.filter(isPlayableFile).sort(naturalSort);
    if (!vids.length) return;
    clearObjectUrls();
    clearPlaylist();
    state.sources = vids.map((f) => ({ name: f.name, file: f }));
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

  const playIndex = (i) => {
    if (i < 0 || i >= state.sources.length) return;
    state.currentIndex = i;
    $$(".playlist li").forEach((li) =>
      li.classList.toggle("active", Number(li.dataset.index) === i));
    const src = state.sources[i];
    setSource(src.file);
    stage.scrollIntoView({ behavior: "smooth", block: "center" });
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

  /* ---------- DRAG & DROP ---------- */
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
     CUT / STALL DETECTION
     ========================================================= */
  const showCutModal = (msg) => {
    cutMessage.textContent = msg || "The video stream was cut or the network dropped.";
    cutModal.hidden = false;
  };
  const hideCutModal = () => { cutModal.hidden = true; };

  cutContinue.addEventListener("click", () => {
    hideCutModal();
    if (state.lastTime > 0) player.currentTime = state.lastTime;
    player.play?.().catch(() => {});
  });
  cutRestart.addEventListener("click", () => {
    hideCutModal();
    player.currentTime = 0;
    player.play?.().catch(() => {});
  });

  // Watch for stalls via timeupdate
  player.addEventListener("timeupdate", () => {
    if (!player.paused && player.readyState >= 2) {
      state.lastTime = player.currentTime;
      clearTimeout(state.stallTimer);
      state.stallTimer = setTimeout(() => {
        if (!player.paused && !player.ended && player.readyState < 3) {
          showCutModal("Playback looks stalled. Network drop or stream cut?");
        }
      }, 12000);
    }
  });
  player.addEventListener("play", () => { hideCutModal(); });
  player.addEventListener("pause", () => { clearTimeout(state.stallTimer); });
  player.addEventListener("ended", () => { clearTimeout(state.stallTimer); });

  player.addEventListener("error", () => {
    if (!player.paused) showCutModal("The stream was cut. What would you like to do?");
  });

  /* =========================================================
     COMMENTS (localStorage + bad-word filter)
     ========================================================= */
  const commentForm = $("#comment-form");
  const commentName = $("#comment-name");
  const commentBody = $("#comment-body");
  const commentCounter = $("#comment-count");
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
    list.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: name || "Anonymous",
      body,
      createdAt: Date.now(),
    });
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
    const year = $("#year");
    if (year) year.textContent = new Date().getFullYear();
    // Set the initial theme on the player
    player.setAttribute("theme", document.documentElement.dataset.theme || "dark");
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
