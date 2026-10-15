/* =========================================================
   FISO VDO PLAYER — Application logic
   Handles: theme, navigation, URL / local file / folder input,
   drag-and-drop, playlist, player lifecycle, errors.
   ========================================================= */

(function () {
  'use strict';

  /* ---------- Helpers ---------- */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const fmtBytes = (n) => {
    if (!n && n !== 0) return '';
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return n.toFixed(i ? 1 : 0) + ' ' + u[i];
  };
  const fmtTime = (s) => {
    if (!isFinite(s) || s < 0) return '0:00';
    s = Math.floor(s);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(sec).padStart(2, '0');
  };
  const isMediaFile = (name) => /\.(mp4|m4v|mkv|webm|mov|avi|ts|m2ts|mp3|m4a|aac|flac|opus|ogg|wav|m3u8|mpd)$/i.test(name);

  /* ---------- Theme ---------- */
  const themeToggle = $('#theme-toggle');
  const root = document.documentElement;

  function applyTheme(theme, persist) {
    root.setAttribute('data-theme', theme);
    const player = $('#fiso-player');
    if (player) player.setAttribute('theme', theme);
    if (persist) {
      try { localStorage.setItem('fiso-theme', theme); } catch (e) { /* ignore */ }
    }
    themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  }

  themeToggle.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next, true);
  });

  // Sync player theme on load
  const initialTheme = root.getAttribute('data-theme') || 'dark';
  applyTheme(initialTheme, false);

  /* ---------- Mobile navigation ---------- */
  const menuBtn = $('#mobile-menu-btn');
  const mainNav = $('#main-nav');
  menuBtn.addEventListener('click', () => {
    const open = mainNav.classList.toggle('is-open');
    menuBtn.setAttribute('aria-expanded', String(open));
  });
  $$('.nav-link', mainNav).forEach((a) => a.addEventListener('click', () => {
    mainNav.classList.remove('is-open');
    menuBtn.setAttribute('aria-expanded', 'false');
  }));

  /* ---------- Footer year ---------- */
  const yearEl = $('#footer-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- Input tabs ---------- */
  const tabs = $$('.input-tab');
  const panels = {
    url: $('#panel-url'),
    files: $('#panel-files'),
    folder: $('#panel-folder'),
  };
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => {
        const active = t === tab;
        t.classList.toggle('is-active', active);
        t.setAttribute('aria-selected', String(active));
      });
      Object.entries(panels).forEach(([key, panel]) => {
        const active = key === tab.dataset.tab;
        panel.classList.toggle('is-active', active);
        panel.hidden = !active;
      });
    });
  });

  /* ---------- Player elements ---------- */
  const player = $('#fiso-player');
  const playerShell = $('#player-shell');
  const playerEmpty = $('#player-empty');
  const playerLoading = $('#player-loading');
  const playerLoadingText = $('#player-loading-text');
  const playerError = $('#player-error');
  const playerErrorText = $('#player-error-text');
  const playerRetryBtn = $('#player-retry-btn');
  const nowPlaying = $('#now-playing');
  const nowPlayingTitle = $('#now-playing-title');
  const resetPlayerBtn = $('#reset-player-btn');
  const statusRegion = $('#status-region');

  let currentSource = null;   // { kind: 'url' | 'file', value, label }
  let lastError = null;

  /* ---------- Status helper ---------- */
  function setStatus(message, type) {
    statusRegion.innerHTML = '';
    if (!message) return;
    const div = document.createElement('div');
    div.className = 'status status--' + (type || 'info');
    div.textContent = message;
    statusRegion.appendChild(div);
  }

  /* ---------- Player state helpers ---------- */
  function showLoading(text) {
    playerLoadingText.textContent = text || 'Loading media…';
    playerLoading.hidden = false;
    playerError.hidden = true;
  }
  function hideLoading() { playerLoading.hidden = true; }
  function showError(message) {
    hideLoading();
    playerErrorText.textContent = message || 'Playback failed.';
    playerError.hidden = false;
  }
  function hideError() { playerError.hidden = true; }

  function markHasMedia() {
    playerShell.classList.add('has-media');
    playerEmpty.style.display = 'none';
  }
  function markNoMedia() {
    playerShell.classList.remove('has-media');
    playerEmpty.style.display = '';
    nowPlaying.hidden = true;
  }

  /* ---------- Load a source ---------- */
  function loadSource(source) {
    if (!player) return;
    hideError();
    showLoading('Loading media…');
    currentSource = source;

    try {
      // MoviPlayer accepts a File object directly, or a URL string.
      player.src = source.value;
      markHasMedia();
      nowPlayingTitle.textContent = source.label || 'Media';
      nowPlaying.hidden = false;
      setStatus('', 'info');
    } catch (err) {
      lastError = err;
      showError('Could not load this media: ' + (err && err.message ? err.message : 'unknown error'));
    }
  }

  /* ---------- Player events ---------- */
  if (player) {
    player.addEventListener('statechange', (e) => {
      const state = e.detail && e.detail.state;
      if (state === 'loading') showLoading('Loading media…');
      else if (state === 'ready' || state === 'playing' || state === 'paused' || state === 'seeking') {
        hideLoading();
        hideError();
      } else if (state === 'buffering') {
        showLoading('Buffering…');
      } else if (state === 'error') {
        hideLoading();
        showError('The player reported an error while loading or decoding this media.');
      }
    });

    player.addEventListener('error', (e) => {
      const msg = e && e.detail && e.detail.message ? e.detail.message : 'Playback error.';
      lastError = e && e.detail;
      showError(msg);
    });

    player.addEventListener('loadeddata', () => { hideLoading(); hideError(); });
    player.addEventListener('play', () => { hideLoading(); });
    player.addEventListener('pause', () => {});
    player.addEventListener('ended', () => {});
  }

  playerRetryBtn.addEventListener('click', () => {
    if (currentSource) loadSource(currentSource);
  });

  resetPlayerBtn.addEventListener('click', () => {
    if (!player) return;
    try {
      player.pause();
      player.src = '';
    } catch (e) { /* ignore */ }
    currentSource = null;
    markNoMedia();
    hideError();
    hideLoading();
    setStatus('', 'info');
    // Reset playback preferences
    try {
      player.volume = 1;
      player.muted = false;
      player.playbackRate = 1;
    } catch (e) { /* ignore */ }
  });

  /* ---------- URL mode ---------- */
  const urlInput = $('#url-input');
  const pasteBtn = $('#paste-btn');
  const playUrlBtn = $('#play-url-btn');
  const urlHint = $('#url-hint');

  function validateUrl(url) {
    if (!url) return 'Please enter a URL.';
    let parsed;
    try { parsed = new URL(url); } catch (e) { return 'This does not look like a valid URL.'; }
    if (!/^https?:$/.test(parsed.protocol)) return 'Only http:// and https:// URLs are supported.';
    if (!/\.(mp4|m4v|mkv|webm|mov|avi|ts|m2ts|mp3|m4a|aac|flac|opus|ogg|wav|m3u8|mpd)(\?|#|$)/i.test(parsed.pathname + parsed.search)) {
      return 'The URL does not end with a recognised media extension. It may still work, but double-check it.';
    }
    return null;
  }

  urlInput.addEventListener('input', () => {
    urlInput.classList.remove('is-invalid');
    const v = urlInput.value.trim();
    if (!v) { urlHint.textContent = 'Direct video or audio URL. CORS must allow browser access.'; return; }
    const err = validateUrl(v);
    if (err && err.startsWith('The URL does not end')) {
      urlHint.textContent = err;
      urlHint.style.color = 'var(--accent-blue)';
    } else {
      urlHint.textContent = 'Direct video or audio URL. CORS must allow browser access.';
      urlHint.style.color = '';
    }
  });

  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); playUrlBtn.click(); }
  });

  playUrlBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();
    const err = validateUrl(url);
    if (err) {
      urlInput.classList.add('is-invalid');
      setStatus(err, 'error');
      return;
    }
    urlInput.classList.remove('is-invalid');
    setStatus('', 'info');
    loadSource({ kind: 'url', value: url, label: url.split('/').pop() || url });
  });

  pasteBtn.addEventListener('click', async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          urlInput.value = text.trim();
          urlInput.dispatchEvent(new Event('input'));
          urlInput.focus();
        } else {
          setStatus('Clipboard is empty.', 'info');
        }
      } else {
        // Fallback: focus the input and let the user paste manually
        urlInput.focus();
        setStatus('Clipboard access is not available. Paste the URL manually with Ctrl/Cmd+V.', 'info');
      }
    } catch (e) {
      urlInput.focus();
      setStatus('Clipboard permission was denied. Paste the URL manually with Ctrl/Cmd+V.', 'info');
    }
  });

  /* ---------- Local files mode ---------- */
  const fileInput = $('#file-input');
  const dropZoneFiles = $('#drop-zone-files');
  const playlistFiles = $('#playlist-files');
  const playlistFilesList = $('#playlist-files-list');
  const playlistFilesLabel = $('#playlist-files-label');
  const clearFilesBtn = $('#clear-files-btn');

  let filesState = { items: [], activeIndex: -1 };

  function renderFilesPlaylist() {
    const { items, activeIndex } = filesState;
    playlistFilesList.innerHTML = '';
    playlistFilesLabel.textContent = items.length + (items.length === 1 ? ' file' : ' files');
    if (!items.length) {
      playlistFiles.hidden = true;
      return;
    }
    playlistFiles.hidden = false;
    items.forEach((f, i) => {
      const li = document.createElement('li');
      li.className = i === activeIndex ? 'is-active' : '';
      li.tabIndex = 0;
      li.setAttribute('role', 'button');
      li.setAttribute('aria-label', 'Play ' + f.name);
      const name = document.createElement('span');
      name.className = 'pl-name';
      name.textContent = f.name;
      const size = document.createElement('span');
      size.className = 'pl-size';
      size.textContent = fmtBytes(f.size);
      li.append(name, size);
      const activate = () => {
        filesState.activeIndex = i;
        renderFilesPlaylist();
        loadSource({ kind: 'file', value: f, label: f.name });
      };
      li.addEventListener('click', activate);
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } });
      playlistFilesList.appendChild(li);
    });
  }

  function setLocalFiles(fileList) {
    const items = Array.from(fileList).filter((f) => isMediaFile(f.name) || f.type.startsWith('video/') || f.type.startsWith('audio/'));
    if (!items.length) {
      setStatus('No supported media files were found in that selection.', 'error');
      return;
    }
    filesState.items = items;
    filesState.activeIndex = 0;
    renderFilesPlaylist();
    loadSource({ kind: 'file', value: items[0], label: items[0].name });
  }

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length) setLocalFiles(e.target.files);
    e.target.value = '';
  });

  clearFilesBtn.addEventListener('click', () => {
    filesState = { items: [], activeIndex: -1 };
    renderFilesPlaylist();
    if (currentSource && currentSource.kind === 'file') {
      player.src = '';
      currentSource = null;
      markNoMedia();
    }
    setStatus('File selection cleared.', 'info');
  });

  /* ---------- Folder mode ---------- */
  const folderInput = $('#folder-input');
  const dropZoneFolder = $('#drop-zone-folder');
  const folderFallbackHint = $('#folder-fallback-hint');
  const playlistFolder = $('#playlist-folder');
  const playlistFolderList = $('#playlist-folder-list');
  const playlistFolderLabel = $('#playlist-folder-label');
  const clearFolderBtn = $('#clear-folder-btn');

  const folderSupported = 'webkitdirectory' in document.createElement('input');
  if (!folderSupported) {
    folderFallbackHint.hidden = false;
    folderInput.removeAttribute('webkitdirectory');
    folderInput.removeAttribute('directory');
    folderInput.setAttribute('multiple', '');
  }

  let folderState = { items: [], activeIndex: -1 };

  function renderFolderPlaylist() {
    const { items, activeIndex } = folderState;
    playlistFolderList.innerHTML = '';
    playlistFolderLabel.textContent = items.length + (items.length === 1 ? ' file' : ' files');
    if (!items.length) { playlistFolder.hidden = true; return; }
    playlistFolder.hidden = false;
    items.forEach((f, i) => {
      const li = document.createElement('li');
      li.className = i === activeIndex ? 'is-active' : '';
      li.tabIndex = 0;
      li.setAttribute('role', 'button');
      li.setAttribute('aria-label', 'Play ' + f.name);
      const name = document.createElement('span');
      name.className = 'pl-name';
      name.textContent = f.name;
      const size = document.createElement('span');
      size.className = 'pl-size';
      size.textContent = fmtBytes(f.size);
      li.append(name, size);
      const activate = () => {
        folderState.activeIndex = i;
        renderFolderPlaylist();
        loadSource({ kind: 'file', value: f, label: f.name });
      };
      li.addEventListener('click', activate);
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } });
      playlistFolderList.appendChild(li);
    });
  }

  folderInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []).filter((f) => isMediaFile(f.name));
    if (!files.length) {
      setStatus('No supported media files were found in that folder.', 'error');
      e.target.value = '';
      return;
    }
    folderState.items = files;
    folderState.activeIndex = 0;
    renderFolderPlaylist();
    loadSource({ kind: 'file', value: files[0], label: files[0].name });
    e.target.value = '';
  });

  clearFolderBtn.addEventListener('click', () => {
    folderState = { items: [], activeIndex: -1 };
    renderFolderPlaylist();
    if (currentSource && currentSource.kind === 'file') {
      player.src = '';
      currentSource = null;
      markNoMedia();
    }
    setStatus('Folder selection cleared.', 'info');
  });

  /* ---------- Drag & drop (window-level, overlay only during drag) ---------- */
  const dragOverlay = $('#drag-overlay');
  let dragDepth = 0;
  let dragTimer = null;

  function hasFiles(e) {
    if (!e.dataTransfer) return false;
    const types = e.dataTransfer.types;
    if (!types) return false;
    return Array.from(types).some((t) => t === 'Files');
  }

  function showDragOverlay() {
    if (dragTimer) { clearTimeout(dragTimer); dragTimer = null; }
    dragOverlay.hidden = false;
  }
  function scheduleHideDragOverlay() {
    if (dragTimer) clearTimeout(dragTimer);
    dragTimer = setTimeout(() => {
      dragOverlay.hidden = true;
      dragDepth = 0;
    }, 120);
  }

  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    showDragOverlay();
  });

  window.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    showDragOverlay();
  });

  window.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) scheduleHideDragOverlay();
  });

  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    scheduleHideDragOverlay();

    const dt = e.dataTransfer;
    if (!dt || !dt.files || !dt.files.length) return;

    // If the drop target is the folder zone and folder API is supported, treat as folder if entries exist
    const items = Array.from(dt.files).filter((f) => isMediaFile(f.name) || f.type.startsWith('video/') || f.type.startsWith('audio/'));
    if (!items.length) {
      setStatus('No supported media files were dropped.', 'error');
      return;
    }
    setLocalFiles(items);
    // Switch to files tab so the user sees the playlist
    const filesTab = $('#tab-files');
    if (filesTab) filesTab.click();
  });

  // Prevent the browser from opening dropped files outside our handlers
  window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', (e) => { if (hasFiles(e)) e.preventDefault(); });

  /* ---------- Keyboard: avoid page scroll when player is focused ---------- */
  document.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
    // Let MoviPlayer handle its own shortcuts when focused; nothing global here.
  });

  /* ---------- Cleanup on page hide ---------- */
  window.addEventListener('pagehide', () => {
    if (player) {
      try { player.pause(); } catch (e) { /* ignore */ }
    }
  });

  /* ---------- Feature detection message ---------- */
  if (!('WebCodecs' in window) && !('VideoDecoder' in window)) {
    setStatus('Your browser does not expose the WebCodecs API. Some formats (MKV, HEVC, AV1) may not play. Chrome, Edge, and Safari 18+ offer the best support.', 'info');
  }

})();
