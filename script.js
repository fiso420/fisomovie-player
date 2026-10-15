(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const on = (t, e, f) => t.addEventListener(e, f);
  const v = $('video'), stage = $('stage'), root = document.documentElement;
  const E = {};
  ['bar','seek','cur','dur','play','bigPlay','back','fwd','mute','vol','rate','cc','pip','fs','note','now','url','urlForm','fileBtn','vttBtn','fileIn','vttIn','themeBtn','statusText'].forEach(i => E[i] = $(i));

  const HLS_URL = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js';
  const ERR = {
    1: 'Playback was cancelled.',
    2: 'Network error. The link may have expired, the server may be offline, or your connection dropped.',
    3: 'The video couldn’t be decoded. The file may be damaged or use a codec this browser doesn’t support.',
    4: 'This source can’t be played. Common causes: the URL is a web page rather than a direct video file, the format or codec isn’t supported by this browser, the link expired, or the server blocks access (CORS or hotlink protection).'
  };
  let hls = null, hlsLib = null, blobs = [], loadId = 0, idleT = 0, scrubbing = false, isLocal = false, hlsRetry = 0, wasIdle = false;

  const fmt = s => {
    if (!isFinite(s) || s < 0) s = 0; s = Math.floor(s);
    const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), c = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${c}` : `${m}:${c}`;
  };
  const hasSrc = () => !!v.getAttribute('src') || !!hls;
  const note = (t, type) => { E.note.textContent = t || ''; E.note.className = 'note' + (type ? ' ' + type : ''); };
  const setState = (s, msg) => {
    stage.dataset.state = s;
    E.statusText.textContent = msg || '';
    E.bar.inert = s === 'idle' || s === 'error';
  };
  const fail = msg => { setState('error', msg); note(msg, 'error'); v.pause(); stage.dataset.playing = ''; };

  /* ---------- Source loading ---------- */
  function cleanup() {
    if (hls) { hls.destroy(); hls = null; }
    v.pause(); v.removeAttribute('src');
    v.querySelectorAll('track').forEach(t => t.remove());
    v.load();
    blobs.forEach(u => URL.revokeObjectURL(u)); blobs = [];
    E.seek.value = 0; E.seek.disabled = true; E.cur.textContent = E.dur.textContent = '0:00';
    E.seek.style.setProperty('--p', '0%'); E.seek.style.setProperty('--b', '0%');
    stage.dataset.playing = ''; hlsRetry = 0; updateCc();
  }
  function loadHls() {
    return hlsLib || (hlsLib = new Promise((res, rej) => {
      if (window.Hls) return res();
      const s = document.createElement('script');
      s.src = HLS_URL; s.async = true; s.onload = res;
      s.onerror = () => { hlsLib = null; s.remove(); rej(new Error('lib')); };
      document.head.appendChild(s);
    }));
  }
  async function load(source, label, local) {
    const id = ++loadId;
    cleanup(); isLocal = local;
    setState('loading', 'Loading…'); E.now.textContent = label;
    try {
      if (local) { const u = URL.createObjectURL(source); blobs.push(u); v.src = u; }
      else if (/\.m3u8$/i.test(new URL(source).pathname) && !v.canPlayType('application/vnd.apple.mpegurl')) {
        await loadHls();
        if (id !== loadId) return;
        if (!window.Hls || !Hls.isSupported()) throw new Error('nohls');
        hls = new Hls({ enableWorker: true });
        hls.on(Hls.Events.ERROR, onHlsError);
        hls.loadSource(source); hls.attachMedia(v);
      } else v.src = source;
    } catch (e) {
      if (id === loadId) fail(e.message === 'nohls' ? 'This browser can’t play HLS streams.' : 'Couldn’t load the HLS player library. Check your connection, or self-host hls.js (see README).');
    }
  }
  function onHlsError(_, d) {
    if (!d.fatal) return;
    const T = Hls.ErrorTypes;
    if (d.type === T.MEDIA_ERROR && hlsRetry++ < 1) return hls.recoverMediaError();
    if (d.type === T.NETWORK_ERROR && hlsRetry++ < 1) return hls.startLoad();
    fail(d.type === T.NETWORK_ERROR ? ERR[2] + ' Streams from other sites also need CORS enabled.' : 'This stream can’t be played in this browser.');
    if (hls) { hls.destroy(); hls = null; }
  }

  /* ---------- Video events ---------- */
  on(v, 'error', () => {
    if (!hasSrc()) return;
    const c = v.error && v.error.code;
    fail(c === 4 && isLocal ? 'This browser can’t play this file’s format or codec. MP4 (H.264/AAC) and WebM play most widely.' : ERR[c] || 'Playback failed.');
  });
  on(v, 'loadedmetadata', () => { setState('ready'); upd(); E.seek.disabled = !isFinite(v.duration); note('Ready. Press play.'); });
  on(v, 'waiting', () => { if (hasSrc() && stage.dataset.state === 'ready') setState('buffering', 'Buffering…'); });
  ['playing', 'canplay', 'seeked'].forEach(e => on(v, e, () => { if (['loading', 'buffering'].includes(stage.dataset.state)) setState('ready'); }));
  ['play', 'pause', 'ended'].forEach(e => on(v, e, sync));
  ['timeupdate', 'durationchange', 'progress'].forEach(e => on(v, e, upd));
  on(v, 'ratechange', () => { E.rate.value = String(v.playbackRate); });
  on(v, 'volumechange', () => {
    const m = v.muted || v.volume === 0;
    E.vol.value = m ? 0 : v.volume; E.vol.style.setProperty('--p', E.vol.value * 100 + '%');
    E.mute.setAttribute('aria-label', m ? 'Unmute' : 'Mute'); stage.dataset.muted = m ? '1' : '';
  });
  function sync() {
    const p = !v.paused && !v.ended;
    stage.dataset.playing = p ? '1' : '';
    E.play.setAttribute('aria-label', p ? 'Pause' : 'Play'); E.bigPlay.setAttribute('aria-label', p ? 'Pause' : 'Play');
    poke();
  }
  function upd() {
    const d = v.duration, fin = isFinite(d) && d > 0;
    E.cur.textContent = fmt(v.currentTime);
    E.dur.textContent = fin ? fmt(d) : (d === Infinity && hasSrc() ? 'LIVE' : '0:00');
    if (!fin) return;
    if (!scrubbing) E.seek.value = v.currentTime / d * 1000;
    E.seek.style.setProperty('--p', v.currentTime / d * 100 + '%');
    E.seek.setAttribute('aria-valuetext', fmt(v.currentTime) + ' of ' + fmt(d));
    let end = 0;
    for (let i = 0; i < v.buffered.length; i++) if (v.buffered.start(i) <= v.currentTime + .5) end = Math.max(end, v.buffered.end(i));
    E.seek.style.setProperty('--b', end / d * 100 + '%');
  }

  /* ---------- Controls ---------- */
  function toggle() {
    if (!hasSrc() || stage.dataset.state === 'error') return;
    if (v.paused || v.ended) {
      const p = v.play();
      if (p) p.catch(e => {
        if (e.name === 'NotAllowedError') note('Your browser blocked playback. Press play again.', 'error');
        else if (e.name === 'NotSupportedError') fail(ERR[4]);
      });
    } else v.pause();
  }
  const skip = n => { if (isFinite(v.duration)) v.currentTime = Math.min(v.duration, Math.max(0, v.currentTime + n)); };
  const vol = d => { v.muted = false; v.volume = Math.min(1, Math.max(0, v.volume + d)); };
  on(E.play, 'click', toggle); on(E.bigPlay, 'click', toggle);
  on(E.back, 'click', () => skip(-10)); on(E.fwd, 'click', () => skip(10));
  on(E.mute, 'click', () => { v.muted = !v.muted; });
  on(E.vol, 'input', () => { v.volume = +E.vol.value; v.muted = v.volume === 0; });
  on(E.rate, 'change', () => { v.defaultPlaybackRate = v.playbackRate = +E.rate.value; });
  on(E.seek, 'input', () => { if (isFinite(v.duration)) { scrubbing = true; v.currentTime = E.seek.value / 1000 * v.duration; upd(); } });
  on(E.seek, 'change', () => { scrubbing = false; });
  { const t = v.volume; v.volume = .5; if (v.volume !== .5) E.vol.hidden = true; v.volume = t; } // iOS: volume is read-only

  /* tap/click on video, auto-hide controls */
  function poke() {
    stage.classList.remove('idle'); clearTimeout(idleT);
    idleT = setTimeout(() => { if (!v.paused && !E.bar.matches(':hover') && !E.bar.contains(document.activeElement)) stage.classList.add('idle'); }, 2800);
  }
  on(stage, 'pointermove', poke); on(stage, 'focusin', poke);
  on(stage, 'pointerdown', () => { wasIdle = stage.classList.contains('idle'); poke(); });
  on(v, 'click', () => { if (wasIdle) { wasIdle = false; return; } toggle(); });
  on(v, 'dblclick', () => toggleFs());

  /* fullscreen */
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  async function toggleFs() {
    try {
      if (fsEl()) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else if (stage.requestFullscreen || stage.webkitRequestFullscreen) await (stage.requestFullscreen || stage.webkitRequestFullscreen).call(stage);
      else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen(); // iPhone Safari
    } catch (e) { note('Fullscreen isn’t available right now.', 'error'); }
  }
  on(E.fs, 'click', toggleFs);
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(e => on(document, e, () => E.fs.setAttribute('aria-label', fsEl() ? 'Exit fullscreen' : 'Fullscreen')));

  /* picture in picture */
  const pipStd = !!document.pictureInPictureEnabled && !v.disablePictureInPicture;
  const pipWk = !!(v.webkitSupportsPresentationMode && v.webkitSupportsPresentationMode('picture-in-picture'));
  E.pip.hidden = !(pipStd || pipWk);
  async function togglePip() {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (pipStd) await v.requestPictureInPicture();
      else v.webkitSetPresentationMode(v.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture');
    } catch (e) { note('Picture in Picture isn’t available for this video right now.', 'error'); }
  }
  on(E.pip, 'click', togglePip);

  /* subtitles */
  const tracks = () => [...v.textTracks];
  function updateCc() { const s = tracks().some(t => t.mode === 'showing'); E.cc.setAttribute('aria-pressed', s); E.cc.classList.toggle('on', s); }
  function cycleCc() {
    const ts = tracks();
    if (!ts.length) return hasSrc() ? E.vttIn.click() : note('Load a video first, then add subtitles.', 'error');
    const i = ts.findIndex(t => t.mode === 'showing'), next = ts[i + 1];
    ts.forEach(t => { t.mode = 'disabled'; });
    if (next) next.mode = 'showing';
    updateCc(); note(next ? 'Subtitles: ' + next.label : 'Subtitles off');
  }
  function addSubs(f) {
    if (!f) return;
    if (!hasSrc()) return note('Load a video first, then add subtitles.', 'error');
    if (!/\.vtt$/i.test(f.name) && f.type !== 'text/vtt') return note('Choose a WebVTT (.vtt) subtitle file.', 'error');
    const u = URL.createObjectURL(f); blobs.push(u);
    const t = document.createElement('track');
    t.kind = 'subtitles'; t.label = f.name.replace(/\.vtt$/i, ''); t.srclang = 'und'; t.src = u;
    on(t, 'error', () => note('Couldn’t read that subtitle file. Use a valid WebVTT file.', 'error'));
    v.appendChild(t);
    tracks().forEach(x => { x.mode = 'disabled'; }); t.track.mode = 'showing';
    updateCc(); note('Subtitles on: ' + t.label + '. Press C to cycle or turn them off.');
  }
  on(E.cc, 'click', cycleCc);
  on(E.vttBtn, 'click', () => hasSrc() ? E.vttIn.click() : note('Load a video first, then add subtitles.', 'error'));
  on(E.vttIn, 'change', () => { addSubs(E.vttIn.files[0]); E.vttIn.value = ''; });

  /* keyboard */
  on(document, 'keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target, tag = t.tagName, k = e.key;
    if ((tag === 'INPUT' && t.type !== 'range') || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'SUMMARY') return;
    if ((k === ' ' || k === 'Enter') && tag === 'BUTTON') return;
    if (tag === 'INPUT' && k.startsWith('Arrow')) return;
    const map = { ' ': toggle, k: toggle, j: () => skip(-10), l: () => skip(10), ArrowLeft: () => skip(-5), ArrowRight: () => skip(5), ArrowUp: () => vol(.05), ArrowDown: () => vol(-.05), m: () => { v.muted = !v.muted; }, f: toggleFs, c: cycleCc, p: togglePip };
    const fn = map[k.length === 1 ? k.toLowerCase() : k];
    if (fn && hasSrc()) { e.preventDefault(); fn(); poke(); }
  });

  /* ---------- URL, file and drag-drop input ---------- */
  on(E.urlForm, 'submit', e => {
    e.preventDefault();
    const raw = E.url.value.trim(); let u;
    if (!raw) return note('Paste a direct video link first.', 'error');
    try { u = new URL(raw); } catch (_) { return note('That doesn’t look like a valid URL. Include https:// at the start.', 'error'); }
    if (!/^https?:$/.test(u.protocol)) return note('Only http:// and https:// links are supported.', 'error');
    if (location.protocol === 'https:' && u.protocol === 'http:') return note('Browsers block http:// video on https:// pages. Use an https:// link.', 'error');
    if (/(^|\.)(youtube\.com|youtu\.be|vimeo\.com|netflix\.com|facebook\.com|instagram\.com|tiktok\.com|dailymotion\.com)$/i.test(u.hostname)) return note('That’s a web page, not a video file. Paste a direct link to an MP4/WebM file or an .m3u8 playlist.', 'error');
    note(''); load(u.href, u.pathname.split('/').pop() || u.hostname, false);
  });
  function openFile(f) {
    if (!f) return;
    if (!f.type.startsWith('video/') && !/\.(mp4|m4v|webm|mov|mkv|ogv|ogg)$/i.test(f.name)) return note('That doesn’t look like a video file.', 'error');
    note(''); load(f, f.name, true);
  }
  on(E.fileBtn, 'click', () => E.fileIn.click());
  on(E.fileIn, 'change', () => { openFile(E.fileIn.files[0]); E.fileIn.value = ''; });
  let dc = 0;
  on(document, 'dragenter', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { dc++; stage.classList.add('drop'); } });
  on(document, 'dragleave', () => { if (--dc <= 0) { dc = 0; stage.classList.remove('drop'); } });
  on(document, 'dragover', e => e.preventDefault());
  on(document, 'drop', e => {
    e.preventDefault(); dc = 0; stage.classList.remove('drop');
    const fs = [...e.dataTransfer.files], vtt = fs.find(f => /\.vtt$/i.test(f.name));
    if (vtt && hasSrc()) addSubs(vtt); else openFile(fs[0]);
  });

  /* ---------- Network and theme ---------- */
  on(window, 'offline', () => { if (hasSrc()) note('You’re offline. Playback continues only while buffered video lasts.', 'error'); });
  on(window, 'online', () => note('Back online.'));
  const meta = document.querySelector('meta[name=theme-color]');
  function setTheme(t, save) {
    root.dataset.theme = t; meta.content = t === 'dark' ? '#0a0d1a' : '#eef2fb';
    E.themeBtn.setAttribute('aria-label', 'Switch to ' + (t === 'dark' ? 'light' : 'dark') + ' theme');
    if (save) try { localStorage.setItem('fm-theme', t); } catch (_) {}
  }
  setTheme(root.dataset.theme);
  on(E.themeBtn, 'click', () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true));
  matchMedia('(prefers-color-scheme:dark)').addEventListener('change', e => { try { if (localStorage.getItem('fm-theme')) return; } catch (_) {} setTheme(e.matches ? 'dark' : 'light'); });

  setState('idle', 'Paste a video link or open a local file to begin.');
  v.dispatchEvent(new Event('volumechange'));
})();
