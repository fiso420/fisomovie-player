/**
 * FISOMOVIE PLAYER — Next-Gen HTML5 Video Player
 * GitHub: https://github.com/fiso420/fisomovie-player
 * 
 * Production-ready Vanilla JavaScript Architecture
 */

(function () {
  'use strict';

  // --- STATE MANAGEMENT ---
  const state = {
    hls: null,
    isHlsSupported: typeof Hls !== 'undefined' && Hls.isSupported(),
    activeSourceUrl: '',
    currentQualityIndex: -1, // -1 is Auto in Hls.js
    availableQualities: [],
    availableAudioTracks: [],
    playbackSpeeds: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
    currentSpeed: 1,
    subtitlesEnabled: false,
    activeSubtitles: [],
    controlsTimer: null,
    isControlsLocked: false,
    lastPlayPosition: 0,
    hasRecoverableError: false,
    theme: localStorage.getItem('fiso_theme') || 'dark',
    accentColor: localStorage.getItem('fiso_accent') || '#6366f1',
    activeMenuType: null // 'quality', 'audio', 'speed', 'subtitles'
  };

  // Moderation filter list for client-side comments demonstration
  const restrictedPatterns = [
    /f+u+c+k+/i, /s+h+i+t+/i, /b+i+t+c+h+/i, /a+s+s+h+o+l+e+/i,
    /n+i+g+g+e+r+/i, /c+u+n+t+/i, /w+h+o+r+e+/i, /d+i+c+k+/i,
    /kill\s+your/i, /terror/i, /kys/i
  ];

  // --- DOM CACHED SELECTORS ---
  const el = {
    // Media & Wrappers
    video: document.getElementById('main-video'),
    playerWrapper: document.getElementById('player-wrapper'),
    controls: document.getElementById('player-controls'),
    spinner: document.getElementById('buffering-spinner'),
    centerFeedback: document.getElementById('center-feedback'),
    centerIcon: document.getElementById('center-icon'),
    subtitleRenderer: document.getElementById('subtitle-renderer'),
    
    // Scrubber
    timelineContainer: document.getElementById('timeline-container'),
    timelineProgress: document.getElementById('timeline-progress'),
    timelineBuffered: document.getElementById('timeline-buffered'),
    timelineThumb: document.getElementById('timeline-thumb'),
    timeTooltip: document.getElementById('time-tooltip'),
    currentTime: document.getElementById('current-time'),
    durationTime: document.getElementById('duration-time'),

    // Control Buttons
    playPauseBtn: document.getElementById('play-pause-btn'),
    playIcon: document.getElementById('play-icon'),
    skipBackBtn: document.getElementById('skip-back-btn'),
    skipFwdBtn: document.getElementById('skip-fwd-btn'),
    volMuteBtn: document.getElementById('volume-mute-btn'),
    volIcon: document.getElementById('vol-icon'),
    volumeSlider: document.getElementById('volume-slider'),
    speedBtn: document.getElementById('speed-btn'),
    speedLabel: document.getElementById('speed-label'),
    qualityBtn: document.getElementById('quality-btn'),
    qualityLabel: document.getElementById('quality-label'),
    audioTrackBtn: document.getElementById('audio-track-btn'),
    audioTrackLabel: document.getElementById('audio-track-label'),
    subtitlesBtn: document.getElementById('subtitles-btn'),
    pipBtn: document.getElementById('pip-btn'),
    fullscreenBtn: document.getElementById('fullscreen-btn'),
    fullscreenIcon: document.getElementById('fullscreen-icon'),

    // Overlays & Menus
    settingsMenu: document.getElementById('settings-menu'),
    menuTitle: document.getElementById('menu-title'),
    menuContent: document.getElementById('menu-content'),
    closeMenuBtn: document.getElementById('close-menu-btn'),
    recoveryOverlay: document.getElementById('recovery-overlay'),
    overlayTitle: document.getElementById('overlay-title'),
    overlayMessage: document.getElementById('overlay-message'),
    overlayNote: document.getElementById('overlay-note'),
    resumeRetryBtn: document.getElementById('resume-retry-btn'),
    restartBtn: document.getElementById('restart-btn'),

    // Media Sources
    streamUrlInput: document.getElementById('stream-url-input'),
    loadUrlBtn: document.getElementById('load-url-btn'),
    localFileInput: document.getElementById('local-file-input'),
    clearSourceBtn: document.getElementById('clear-source-btn'),
    sourceStatusText: document.getElementById('source-status-text'),

    // Subtitles Drawer
    subFileInput: document.getElementById('sub-file-input'),
    subSizeSelect: document.getElementById('sub-size-select'),

    // Theme Drawer
    themePanelBtn: document.getElementById('theme-panel-btn'),
    themeModal: document.getElementById('theme-modal'),
    closeThemeBtn: document.getElementById('close-theme-btn'),
    resetThemeBtn: document.getElementById('reset-theme-btn'),
    segmentBtns: document.querySelectorAll('.segment-btn'),
    accentSwatches: document.querySelectorAll('.palette-swatches .swatch'),
    customHexPicker: document.getElementById('custom-hex-picker'),
    customHexText: document.getElementById('custom-hex-text'),
    metaThemeColor: document.getElementById('meta-theme-color'),

    // Comments
    commentForm: document.getElementById('comment-form'),
    commenterName: document.getElementById('commenter-name'),
    commenterText: document.getElementById('commenter-text'),
    commentsList: document.getElementById('comments-list'),
    charCounter: document.getElementById('char-counter'),
    commentWarningBox: document.getElementById('comment-warning-box'),
    commentWarningText: document.getElementById('comment-warning-text'),
    commentCountBadge: document.getElementById('comment-count-badge')
  };

  // --- INITIALIZATION ---
  function init() {
    applyTheme(state.theme);
    applyAccent(state.accentColor);
    bindPlayerEvents();
    bindControls();
    bindSourceLoaders();
    bindSubtitleEngine();
    bindThemePanel();
    bindComments();

    // Check Picture-in-Picture capability
    if (!document.pictureInPictureEnabled) {
      el.pipBtn.classList.add('visually-hidden');
    }

    // Default sample video (HLS open test stream)
    loadVideoSource('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8');
  }

  // --- FORMAT TIME (SECONDS -> HH:MM:SS / MM:SS) ---
  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const s = Math.floor(seconds);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hrs > 0) {
      return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  // --- MEDIA SOURCE LOADING ENGINE ---
  function loadVideoSource(url, isLocalFile = false) {
    if (!url || typeof url !== 'string') return;
    
    // Clear state & previous instances
    resetOverlay();
    hideSettingsMenu();
    state.lastPlayPosition = 0;
    state.activeSourceUrl = url;

    if (state.hls) {
      state.hls.destroy();
      state.hls = null;
    }

    const isHlsStream = url.includes('.m3u8') || (!isLocalFile && url.endsWith('.m3u8'));

    el.sourceStatusText.textContent = `Loading: ${url.substring(0, 60)}...`;

    // CASE 1: HLS Stream on supported Hls.js browser
    if (isHlsStream && state.isHlsSupported) {
      state.hls = new Hls({
        capLevelToPlayerSize: true,
        autoStartLoad: true
      });

      state.hls.loadSource(url);
      state.hls.attachMedia(el.video);

      state.hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        populateHlsQualities(data.levels);
        populateHlsAudioTracks(state.hls.audioTracks);
        el.sourceStatusText.textContent = `HLS Adaptive Stream active (${data.levels.length} renditions detected)`;
      });

      state.hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (event, data) => {
        populateHlsAudioTracks(data.audioTracks);
      });

      state.hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          handleFatalHlsError(data);
        }
      });

    } 
    // CASE 2: Native HLS (Safari/iOS) or Standard Progressive Web Video (MP4, WebM)
    else {
      el.video.src = url;
      el.video.load();

      el.video.onloadedmetadata = () => {
        populateNativeQualities();
        populateNativeAudioTracks();
        el.sourceStatusText.textContent = `Native Playback: ${el.video.videoWidth}x${el.video.videoHeight} (${el.video.duration > 0 ? formatTime(el.video.duration) : 'Live'})`;
      };
    }
  }

  // --- HLS & NATIVE ERROR RECOVERY ---
  function handleFatalHlsError(data) {
    state.hasRecoverableError = true;
    switch (data.type) {
      case Hls.ErrorTypes.NETWORK_ERROR:
        showOverlay('Network Error', 'Cannot reach the media server. Check connectivity or CORS policy.', true);
        break;
      case Hls.ErrorTypes.MEDIA_ERROR:
        showOverlay('Media Decode Error', 'The stream encountered a decoder fault. Attempting recovery...', true);
        if (state.hls) state.hls.recoverMediaError();
        break;
      default:
        showOverlay('Playback Interrupted', 'An unrecoverable playback exception occurred.', false);
        if (state.hls) state.hls.destroy();
        break;
    }
  }

  function showOverlay(title, message, canResume = true) {
    el.overlayTitle.textContent = title;
    el.overlayMessage.textContent = message;
    el.resumeRetryBtn.style.display = canResume ? 'inline-flex' : 'none';
    el.overlayNote.textContent = state.lastPlayPosition > 0 ? `Saved position: ${formatTime(state.lastPlayPosition)}` : '';
    el.recoveryOverlay.classList.remove('visually-hidden');
  }

  function resetOverlay() {
    el.recoveryOverlay.classList.add('visually-hidden');
  }

  // --- PLAYBACK CONTROLS SYNCHRONIZATION ---
  function togglePlayPause() {
    if (el.video.paused || el.video.ended) {
      el.video.play().catch(err => {
        console.warn('Playback gesture required:', err);
      });
    } else {
      el.video.pause();
    }
  }

  function updatePlayPauseIcons() {
    if (el.video.paused) {
      el.playIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
      el.playPauseBtn.setAttribute('title', 'Play (Space / K)');
      el.playPauseBtn.setAttribute('aria-label', 'Play');
      flashFeedbackIcon('<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>');
    } else {
      el.playIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
      el.playPauseBtn.setAttribute('title', 'Pause (Space / K)');
      el.playPauseBtn.setAttribute('aria-label', 'Pause');
      flashFeedbackIcon('<path d="M8 5v14l11-7z"/>');
    }
  }

  function flashFeedbackIcon(svgPath) {
    el.centerIcon.innerHTML = svgPath;
    el.centerFeedback.classList.add('show');
    setTimeout(() => {
      el.centerFeedback.classList.remove('show');
    }, 400);
  }

  function seekRelative(seconds) {
    const target = Math.max(0, Math.min(el.video.duration || 0, el.video.currentTime + seconds));
    el.video.currentTime = target;
  }

  function setVolume(value) {
    const vol = Math.max(0, Math.min(1, value));
    el.video.volume = vol;
    el.video.muted = vol === 0;
    el.volumeSlider.value = vol;
    updateVolumeIcon(vol, el.video.muted);
  }

  function toggleMute() {
    el.video.muted = !el.video.muted;
    updateVolumeIcon(el.video.volume, el.video.muted);
  }

  function updateVolumeIcon(vol, isMuted) {
    if (isMuted || vol === 0) {
      el.volIcon.innerHTML = '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
    } else if (vol < 0.5) {
      el.volIcon.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>';
    } else {
      el.volIcon.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      el.playerWrapper.requestFullscreen().catch(err => console.warn(err));
    } else {
      document.exitFullscreen().catch(err => console.warn(err));
    }
  }

  // --- SCRUBBER / TIMELINE MANAGEMENT ---
  function updateProgress() {
    if (!el.video.duration) return;
    const current = el.video.currentTime;
    const duration = el.video.duration;
    const progressPct = (current / duration) * 100;
    
    el.timelineProgress.style.width = `${progressPct}%`;
    el.timelineThumb.style.left = `${progressPct}%`;
    el.currentTime.textContent = formatTime(current);
    el.durationTime.textContent = formatTime(duration);

    // Track last playback position for recovery
    state.lastPlayPosition = current;

    // Update buffered progress
    if (el.video.buffered.length > 0) {
      const bufferedEnd = el.video.buffered.end(el.video.buffered.length - 1);
      const bufferedPct = (bufferedEnd / duration) * 100;
      el.timelineBuffered.style.width = `${Math.min(100, bufferedPct)}%`;
    }
  }

  function handleTimelineSeek(event) {
    const rect = el.timelineContainer.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    if (el.video.duration) {
      el.video.currentTime = pos * el.video.duration;
    }
  }

  // --- QUALITY SELECTOR IMPLEMENTATION ---
  function populateHlsQualities(levels) {
    state.availableQualities = levels.map((lvl, idx) => ({
      index: idx,
      height: lvl.height,
      bitrate: lvl.bitrate,
      label: lvl.height ? `${lvl.height}p` : `Stream ${idx + 1}`
    }));
    // Sort highest quality to lowest
    state.availableQualities.sort((a, b) => b.height - a.height);
  }

  function populateNativeQualities() {
    if (el.video.videoHeight) {
      state.availableQualities = [{
        index: 0,
        height: el.video.videoHeight,
        label: `${el.video.videoHeight}p (Source)`
      }];
    } else {
      state.availableQualities = [];
    }
  }

  function openQualityMenu() {
    state.activeMenuType = 'quality';
    el.menuTitle.textContent = 'Select Quality';
    el.menuContent.innerHTML = '';

    if (state.hls && state.availableQualities.length > 0) {
      // Auto Option
      const autoBtn = document.createElement('button');
      autoBtn.className = `menu-option-btn ${state.currentQualityIndex === -1 ? 'active' : ''}`;
      autoBtn.textContent = 'Auto (Adaptive)';
      autoBtn.onclick = () => {
        state.hls.currentLevel = -1;
        state.currentQualityIndex = -1;
        el.qualityLabel.textContent = 'Auto';
        hideSettingsMenu();
      };
      el.menuContent.appendChild(autoBtn);

      // Real HLS Renditions
      state.availableQualities.forEach(q => {
        const btn = document.createElement('button');
        btn.className = `menu-option-btn ${state.currentQualityIndex === q.index ? 'active' : ''}`;
        btn.textContent = `${q.label} ${q.bitrate ? `(${Math.round(q.bitrate / 1000)} kbps)` : ''}`;
        btn.onclick = () => {
          state.hls.currentLevel = q.index;
          state.currentQualityIndex = q.index;
          el.qualityLabel.textContent = q.label;
          hideSettingsMenu();
        };
        el.menuContent.appendChild(btn);
      });
    } else if (state.availableQualities.length > 0) {
      // Single Source / Native MP4
      const info = document.createElement('button');
      info.className = 'menu-option-btn active';
      info.textContent = `${state.availableQualities[0].label} (Native File)`;
      el.menuContent.appendChild(info);

      const note = document.createElement('div');
      note.className = 'form-helper';
      note.style.padding = '0.5rem';
      note.textContent = 'True quality switching requires an adaptive stream (HLS .m3u8). Single MP4 files play at their source resolution.';
      el.menuContent.appendChild(note);
    } else {
      el.menuContent.innerHTML = '<p class="form-helper">No renditions available for this media.</p>';
    }

    el.settingsMenu.classList.remove('visually-hidden');
  }

  // --- AUDIO TRACK SELECTOR IMPLEMENTATION ---
  function populateHlsAudioTracks(tracks) {
    state.availableAudioTracks = tracks.map((track, idx) => ({
      id: idx,
      name: track.name || track.lang || `Track ${idx + 1}`,
      lang: track.lang || 'und'
    }));
  }

  function populateNativeAudioTracks() {
    // Standard Safari HTML5 video.audioTracks check
    if (el.video.audioTracks && el.video.audioTracks.length > 0) {
      state.availableAudioTracks = [];
      for (let i = 0; i < el.video.audioTracks.length; i++) {
        const t = el.video.audioTracks[i];
        state.availableAudioTracks.push({
          id: i,
          name: t.label || t.language || `Track ${i + 1}`,
          lang: t.language || 'und',
          nativeRef: t
        });
      }
    } else {
      state.availableAudioTracks = [];
    }
  }

  function openAudioMenu() {
    state.activeMenuType = 'audio';
    el.menuTitle.textContent = 'Select Audio Track';
    el.menuContent.innerHTML = '';

    if (state.hls && state.availableAudioTracks.length > 0) {
      state.availableAudioTracks.forEach(track => {
        const btn = document.createElement('button');
        const isActive = state.hls.audioTrack === track.id;
        btn.className = `menu-option-btn ${isActive ? 'active' : ''}`;
        btn.textContent = `${track.name} [${track.lang.toUpperCase()}]`;
        btn.onclick = () => {
          state.hls.audioTrack = track.id;
          el.audioTrackLabel.textContent = track.lang.toUpperCase();
          hideSettingsMenu();
        };
        el.menuContent.appendChild(btn);
      });
    } else if (state.availableAudioTracks.length > 0) {
      // Native audioTracks (Safari)
      state.availableAudioTracks.forEach(track => {
        const btn = document.createElement('button');
        btn.className = `menu-option-btn ${track.nativeRef.enabled ? 'active' : ''}`;
        btn.textContent = track.name;
        btn.onclick = () => {
          for (let i = 0; i < el.video.audioTracks.length; i++) {
            el.video.audioTracks[i].enabled = (i === track.id);
          }
          el.audioTrackLabel.textContent = track.name;
          hideSettingsMenu();
        };
        el.menuContent.appendChild(btn);
      });
    } else {
      el.menuContent.innerHTML = `
        <div style="padding:0.5rem;">
          <p class="form-helper">Single audio channel detected.</p>
          <p class="form-helper" style="margin-top:0.3rem;">Chromium/Firefox browsers restrict multi-track MP4 switching to adaptive streams (HLS/MSE).</p>
        </div>
      `;
    }

    el.settingsMenu.classList.remove('visually-hidden');
  }

  // --- PLAYBACK SPEED POPUP ---
  function openSpeedMenu() {
    state.activeMenuType = 'speed';
    el.menuTitle.textContent = 'Playback Speed';
    el.menuContent.innerHTML = '';

    state.playbackSpeeds.forEach(speed => {
      const btn = document.createElement('button');
      btn.className = `menu-option-btn ${state.currentSpeed === speed ? 'active' : ''}`;
      btn.textContent = `${speed}x ${speed === 1 ? '(Normal)' : ''}`;
      btn.onclick = () => {
        el.video.playbackRate = speed;
        state.currentSpeed = speed;
        el.speedLabel.textContent = `${speed}x`;
        hideSettingsMenu();
      };
      el.menuContent.appendChild(btn);
    });

    el.settingsMenu.classList.remove('visually-hidden');
  }

  function hideSettingsMenu() {
    el.settingsMenu.classList.add('visually-hidden');
    state.activeMenuType = null;
  }

  // --- SUBTITLE PARSING & SYNCHRONIZATION ---
  function bindSubtitleEngine() {
    el.subFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target.result;
        if (file.name.endsWith('.srt')) {
          parseSrtSubtitles(text);
        } else {
          parseVttSubtitles(text);
        }
        state.subtitlesEnabled = true;
        el.subtitlesBtn.classList.add('active');
      };
      reader.readAsText(file);
    });

    el.subSizeSelect.addEventListener('change', (e) => {
      el.subtitleRenderer.style.fontSize = e.target.value;
    });

    el.subtitlesBtn.addEventListener('click', () => {
      state.subtitlesEnabled = !state.subtitlesEnabled;
      el.subtitlesBtn.style.color = state.subtitlesEnabled ? 'var(--accent-color)' : '';
      if (!state.subtitlesEnabled) {
        el.subtitleRenderer.innerHTML = '';
      }
    });

    // Time update sync for subtitle overlay
    el.video.addEventListener('timeupdate', () => {
      if (!state.subtitlesEnabled || state.activeSubtitles.length === 0) {
        el.subtitleRenderer.innerHTML = '';
        return;
      }
      const ct = el.video.currentTime;
      const currentCue = state.activeSubtitles.find(sub => ct >= sub.start && ct <= sub.end);
      if (currentCue) {
        el.subtitleRenderer.innerHTML = `<span class="subtitle-cue">${escapeHtml(currentCue.text)}</span>`;
      } else {
        el.subtitleRenderer.innerHTML = '';
      }
    });
  }

  // Robust In-Memory SRT Parser
  function parseSrtSubtitles(srtText) {
    const pattern = /(\d+)\r?\n(\d{2}:\d{2}:\d{2}[,\.]\d{3}) --> (\d{2}:\d{2}:\d{2}[,\.]\d{3})\r?\n([\s\S]*?)(?=\r?\n\r?\n|\s*$)/g;
    const cues = [];
    let match;

    while ((match = pattern.exec(srtText)) !== null) {
      cues.push({
        start: srtTimeToSeconds(match[2]),
        end: srtTimeToSeconds(match[3]),
        text: match[4].replace(/<[^>]+>/g, '').trim()
      });
    }
    state.activeSubtitles = cues;
  }

  // Robust In-Memory VTT Parser
  function parseVttSubtitles(vttText) {
    const pattern = /(\d{2}:(?:\d{2}:)?\d{2}\.\d{3}) --> (\d{2}:(?:\d{2}:)?\d{2}\.\d{3}).*\r?\n([\s\S]*?)(?=\r?\n\r?\n|\s*$)/g;
    const cues = [];
    let match;

    while ((match = pattern.exec(vttText)) !== null) {
      cues.push({
        start: srtTimeToSeconds(match[1]),
        end: srtTimeToSeconds(match[2]),
        text: match[3].replace(/<[^>]+>/g, '').trim()
      });
    }
    state.activeSubtitles = cues;
  }

  function srtTimeToSeconds(timeStr) {
    const parts = timeStr.replace(',', '.').split(':');
    if (parts.length === 3) {
      return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
    }
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  }

  // --- AUTO-HIDE CONTROLS ON IDLE ---
  function resetControlsTimeout() {
    el.controls.classList.remove('auto-hidden');
    clearTimeout(state.controlsTimer);
    if (!el.video.paused && !state.isControlsLocked) {
      state.controlsTimer = setTimeout(() => {
        el.controls.classList.add('auto-hidden');
        hideSettingsMenu();
      }, 3000);
    }
  }

  // --- EVENT BINDING: MAIN PLAYER & KEYBOARD SHORTCUTS ---
  function bindPlayerEvents() {
    // Video status listeners
    el.video.addEventListener('play', updatePlayPauseIcons);
    el.video.addEventListener('pause', updatePlayPauseIcons);
    el.video.addEventListener('timeupdate', updateProgress);

    el.video.addEventListener('waiting', () => {
      el.spinner.classList.add('active');
    });

    el.video.addEventListener('playing', () => {
      el.spinner.classList.remove('active');
      resetOverlay();
    });

    el.video.addEventListener('ended', () => {
      showOverlay('Playback Completed', 'You have reached the end of the video.', false);
    });

    el.video.addEventListener('error', () => {
      el.spinner.classList.remove('active');
      showOverlay('Video Source Error', 'Could not stream or decode the requested file.', false);
    });

    // Scrubber interaction
    let isDraggingTimeline = false;
    el.timelineContainer.addEventListener('mousedown', (e) => {
      isDraggingTimeline = true;
      handleTimelineSeek(e);
    });

    window.addEventListener('mousemove', (e) => {
      if (isDraggingTimeline) handleTimelineSeek(e);
      // Tooltip position
      const rect = el.timelineContainer.getBoundingClientRect();
      if (e.clientY >= rect.top - 20 && e.clientY <= rect.bottom + 20 && e.clientX >= rect.left && e.clientX <= rect.right) {
        const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        if (el.video.duration) {
          el.timeTooltip.style.left = `${(pos * 100)}%`;
          el.timeTooltip.style.display = 'block';
          el.timeTooltip.textContent = formatTime(pos * el.video.duration);
        }
      } else {
        el.timeTooltip.style.display = 'none';
      }
    });

    window.addEventListener('mouseup', () => {
      isDraggingTimeline = false;
    });

    // Touch scrubber support
    el.timelineContainer.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        const rect = el.timelineContainer.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
        if (el.video.duration) el.video.currentTime = pos * el.video.duration;
      }
    }, { passive: true });

    // Idle controls handling
    el.playerWrapper.addEventListener('mousemove', resetControlsTimeout);
    el.playerWrapper.addEventListener('touchstart', resetControlsTimeout, { passive: true });
    el.playerWrapper.addEventListener('mouseleave', () => {
      if (!el.video.paused) el.controls.classList.add('auto-hidden');
    });

    // Keyboard Accessibility Shortcuts
    el.playerWrapper.addEventListener('keydown', (e) => {
      // Avoid firing when typing in comment or input forms
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlayPause();
          break;
        case 'arrowleft':
          e.preventDefault();
          seekRelative(-10);
          break;
        case 'arrowright':
          e.preventDefault();
          seekRelative(10);
          break;
        case 'arrowup':
          e.preventDefault();
          setVolume(el.video.volume + 0.05);
          break;
        case 'arrowdown':
          e.preventDefault();
          setVolume(el.video.volume - 0.05);
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'escape':
          if (document.fullscreenElement) document.exitFullscreen();
          hideSettingsMenu();
          break;
      }
      resetControlsTimeout();
    });
  }

  // --- BIND CONTROL BAR BUTTONS ---
  function bindControls() {
    el.playPauseBtn.addEventListener('click', togglePlayPause);
    el.video.addEventListener('click', togglePlayPause);
    el.skipBackBtn.addEventListener('click', () => seekRelative(-10));
    el.skipFwdBtn.addEventListener('click', () => seekRelative(10));
    el.volMuteBtn.addEventListener('click', toggleMute);
    
    el.volumeSlider.addEventListener('input', (e) => {
      setVolume(parseFloat(e.target.value));
    });

    el.speedBtn.addEventListener('click', () => {
      if (state.activeMenuType === 'speed') hideSettingsMenu();
      else openSpeedMenu();
    });

    el.qualityBtn.addEventListener('click', () => {
      if (state.activeMenuType === 'quality') hideSettingsMenu();
      else openQualityMenu();
    });

    el.audioTrackBtn.addEventListener('click', () => {
      if (state.activeMenuType === 'audio') hideSettingsMenu();
      else openAudioMenu();
    });

    el.pipBtn.addEventListener('click', async () => {
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else if (document.pictureInPictureEnabled) {
          await el.video.requestPictureInPicture();
        }
      } catch (err) {
        console.warn('PiP error:', err);
      }
    });

    el.fullscreenBtn.addEventListener('click', toggleFullscreen);

    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement) {
        el.fullscreenIcon.innerHTML = '<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>';
      } else {
        el.fullscreenIcon.innerHTML = '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>';
      }
    });

    el.closeMenuBtn.addEventListener('click', hideSettingsMenu);

    // Overlay Action Handlers
    el.resumeRetryBtn.addEventListener('click', () => {
      resetOverlay();
      if (state.lastPlayPosition > 0) {
        el.video.currentTime = state.lastPlayPosition;
      }
      el.video.play().catch(() => loadVideoSource(state.activeSourceUrl));
    });

    el.restartBtn.addEventListener('click', () => {
      resetOverlay();
      el.video.currentTime = 0;
      el.video.play().catch(() => loadVideoSource(state.activeSourceUrl));
    });
  }

  // --- SOURCE SELECTION & DRAG-AND-DROP ---
  function bindSourceLoaders() {
    el.loadUrlBtn.addEventListener('click', () => {
      const url = el.streamUrlInput.value.trim();
      if (url) {
        loadVideoSource(url);
      }
    });

    el.localFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const localUrl = URL.createObjectURL(file);
        loadVideoSource(localUrl, true);
        el.sourceStatusText.textContent = `Local File: ${file.name} (${(file.size / (1024*1024)).toFixed(1)} MB)`;
      }
    });

    el.clearSourceBtn.addEventListener('click', () => {
      if (state.hls) {
        state.hls.destroy();
        state.hls = null;
      }
      el.video.removeAttribute('src');
      el.video.load();
      el.streamUrlInput.value = '';
      el.localFileInput.value = '';
      el.sourceStatusText.textContent = 'Engine: Idle (Ready for video URL or file drop)';
      resetOverlay();
    });

    // Drag and drop video files onto window
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file.type.startsWith('video/') || file.name.endsWith('.mkv') || file.name.endsWith('.m3u8')) {
          const dropUrl = URL.createObjectURL(file);
          loadVideoSource(dropUrl, true);
          el.sourceStatusText.textContent = `Local Drop: ${file.name}`;
        }
      }
    });
  }

  // --- THEME & ACCENT CUSTOMIZER ---
  function applyTheme(mode) {
    state.theme = mode;
    localStorage.setItem('fiso_theme', mode);
    
    let activeTheme = mode;
    if (mode === 'system') {
      activeTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', activeTheme);
    el.metaThemeColor.setAttribute('content', activeTheme === 'dark' ? '#090b10' : '#f1f5f9');

    el.segmentBtns.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
    });
  }

  function applyAccent(hex) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return;
    state.accentColor = hex;
    localStorage.setItem('fiso_accent', hex);
    document.documentElement.style.setProperty('--accent-color', hex);
    
    // Compute RGB for glass highlights
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    document.documentElement.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);

    el.customHexPicker.value = hex;
    el.customHexText.value = hex;

    el.accentSwatches.forEach(swatch => {
      swatch.classList.toggle('active', swatch.getAttribute('data-color').toLowerCase() === hex.toLowerCase());
    });
  }

  function bindThemePanel() {
    el.themePanelBtn.addEventListener('click', () => {
      el.themeModal.classList.remove('visually-hidden');
    });

    el.closeThemeBtn.addEventListener('click', () => {
      el.themeModal.classList.add('visually-hidden');
    });

    el.segmentBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        applyTheme(btn.getAttribute('data-mode'));
      });
    });

    el.accentSwatches.forEach(swatch => {
      swatch.addEventListener('click', () => {
        applyAccent(swatch.getAttribute('data-color'));
      });
    });

    el.customHexPicker.addEventListener('input', (e) => {
      applyAccent(e.target.value);
    });

    el.customHexText.addEventListener('change', (e) => {
      let val = e.target.value.trim();
      if (!val.startsWith('#')) val = '#' + val;
      if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
        applyAccent(val);
      }
    });

    el.resetThemeBtn.addEventListener('click', () => {
      applyTheme('dark');
      applyAccent('#6366f1');
    });
  }

  // --- COMMENTS & BAD-LANGUAGE MODERATION (SAFE DOM) ---
  function bindComments() {
    // Dynamic char counter
    el.commenterText.addEventListener('input', () => {
      el.charCounter.textContent = `${el.commenterText.value.length} / 500`;
    });

    el.commentForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const author = el.commenterName.value.trim();
      const text = el.commenterText.value.trim();

      if (!author || !text) return;

      // Normalization check against banned terms
      const normalized = text.toLowerCase().replace(/[\s\-_.]+/g, '');
      const isRestricted = restrictedPatterns.some(pattern => pattern.test(normalized) || pattern.test(text));

      if (isRestricted) {
        el.commentWarningBox.classList.remove('visually-hidden');
        el.commentWarningText.textContent = 'Your comment contains terms that violate community standards. Please rephrase respectfully.';
        return;
      }

      el.commentWarningBox.classList.add('visually-hidden');

      // Create new comment safely via textContent to strictly prevent XSS
      addCommentNode(author, text, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

      // Reset Form
      el.commenterText.value = '';
      el.charCounter.textContent = '0 / 500';
    });

    // Populate default welcoming comment
    addCommentNode('FISOMOVIE Concierge', 'Welcome to the FISOMOVIE player! Drop an HLS .m3u8 stream or local video file above to experience adaptive playback.', 'Just now');
  }

  function addCommentNode(author, text, timestamp) {
    const card = document.createElement('div');
    card.className = 'comment-card';

    const meta = document.createElement('div');
    meta.className = 'comment-meta';

    const authorSpan = document.createElement('span');
    authorSpan.className = 'comment-author';
    authorSpan.textContent = author; // Safe assignment

    const timeSpan = document.createElement('span');
    timeSpan.className = 'comment-date';
    timeSpan.textContent = timestamp; // Safe assignment

    meta.appendChild(authorSpan);
    meta.appendChild(timeSpan);

    const body = document.createElement('p');
    body.className = 'comment-body';
    body.textContent = text; // Safe assignment: no HTML injection possible

    const tools = document.createElement('div');
    tools.className = 'comment-tools';
    const reportBtn = document.createElement('button');
    reportBtn.className = 'comment-report-btn';
    reportBtn.textContent = 'Report';
    reportBtn.onclick = () => {
      reportBtn.textContent = 'Reported';
      reportBtn.disabled = true;
    };
    tools.appendChild(reportBtn);

    card.appendChild(meta);
    card.appendChild(body);
    card.appendChild(tools);

    el.commentsList.prepend(card);
    updateCommentCount();
  }

  function updateCommentCount() {
    const count = el.commentsList.querySelectorAll('.comment-card').length;
    el.commentCountBadge.textContent = `${count} Comment${count === 1 ? '' : 's'}`;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Execute on DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
