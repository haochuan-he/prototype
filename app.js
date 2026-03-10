/**
 * Pomodoro Timer — app.js
 * Pure vanilla JS · No dependencies · Web Audio API for sounds
 */

/* ══════════════════════════════
   STATE
══════════════════════════════ */
const DEFAULT_SETTINGS = {
  pomodoro: 25,
  short: 5,
  long: 15,
  rounds: 4,
  sound: true,
  notify: false,
};

let settings = loadSettings();

let state = {
  mode: 'pomodoro',      // 'pomodoro' | 'short' | 'long'
  running: false,
  timeLeft: settings.pomodoro * 60,
  totalSeconds: settings.pomodoro * 60,
  session: 1,            // 1..rounds
  round: 1,
  totalFocused: 0,       // mins
  totalSessions: 0,
  intervalId: null,
};

/* ══════════════════════════════
   DOM REFS
══════════════════════════════ */
const timerDisplay = document.getElementById('timerDisplay');
const timerLabel   = document.getElementById('timerLabel');
const ringProgress = document.getElementById('ringProgress');
const startBtn     = document.getElementById('startBtn');
const resetBtn     = document.getElementById('resetBtn');
const skipBtn      = document.getElementById('skipBtn');
const roundDots    = document.getElementById('roundDots');
const sessionText  = document.getElementById('sessionText');
const totalFocusedEl  = document.getElementById('totalFocused');
const totalSessionsEl = document.getElementById('totalSessions');
const timerCard    = document.querySelector('.timer-card');

const tabs         = document.querySelectorAll('.tab-btn');
const settingsBtn  = document.getElementById('settingsBtn');
const modalOverlay = document.getElementById('modalOverlay');
const modalClose   = document.getElementById('modalClose');
const saveSettings = document.getElementById('saveSettings');

const iconPlay  = startBtn.querySelector('.icon-play');
const iconPause = startBtn.querySelector('.icon-pause');

/* ══════════════════════════════
   RING CONSTANTS
══════════════════════════════ */
const CIRCUMFERENCE = 603.2; // 2π × 96

/* ══════════════════════════════
   WEB AUDIO — CHIME SOUNDS
══════════════════════════════ */
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playChime(type = 'end') {
  if (!settings.sound) return;
  try {
    const ctx = getAudioCtx();
    const notes = type === 'end'
      ? [523.25, 659.25, 783.99, 1046.5]   // C5 E5 G5 C6 — bright finish
      : [440, 349.23];                        // A4 F4 — soft break start

    notes.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.18);

      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.18);
      gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + i * 0.18 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.5);

      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.6);
    });
  } catch (_) { /* silently fail */ }
}

function playTick() {
  if (!settings.sound) return;
  try {
    const ctx = getAudioCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 800;
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.08);
  } catch (_) {}
}

/* ══════════════════════════════
   NOTIFICATIONS
══════════════════════════════ */
function requestNotifyPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function sendNotification(title, body) {
  if (!settings.notify) return;
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '' });
  }
}

/* ══════════════════════════════
   SETTINGS PERSISTENCE
══════════════════════════════ */
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('pomodoroSettings'));
    return s ? { ...DEFAULT_SETTINGS, ...s } : { ...DEFAULT_SETTINGS };
  } catch (_) {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveToStorage() {
  localStorage.setItem('pomodoroSettings', JSON.stringify(settings));
}

/* ══════════════════════════════
   RENDER HELPERS
══════════════════════════════ */
function formatTime(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function updateDisplay() {
  timerDisplay.textContent = formatTime(state.timeLeft);
  document.title = `${formatTime(state.timeLeft)} — 番茄时钟`;

  // Ring progress
  const ratio = state.timeLeft / state.totalSeconds;
  const offset = CIRCUMFERENCE * (1 - ratio);
  ringProgress.style.strokeDashoffset = offset;
}

function updateMode() {
  const labels = { pomodoro: '专注时间', short: '短休息', long: '长休息' };
  timerLabel.textContent = labels[state.mode];
  document.body.setAttribute('data-mode', state.mode);

  // Update gradient stop colors to match mode
  const colors = {
    pomodoro: ['#e94560', '#9b59b6'],
    short:    ['#27ae60', '#1abc9c'],
    long:     ['#2980b9', '#8e44ad'],
  };
  const [c1, c2] = colors[state.mode];
  document.getElementById('ringGradient').children[0].setAttribute('stop-color', c1);
  document.getElementById('ringGradient').children[1].setAttribute('stop-color', c2);
}

function buildDots() {
  roundDots.innerHTML = '';
  for (let i = 1; i <= settings.rounds; i++) {
    const dot = document.createElement('div');
    dot.className = 'dot';
    if (i < state.session) dot.classList.add('filled');
    if (i === state.session) dot.classList.add('current');
    roundDots.appendChild(dot);
  }
}

function updateSessionText() {
  sessionText.textContent = `第 ${state.round} 轮 · 第 ${state.session} / ${settings.rounds} 个专注`;
}

function updateStats() {
  totalFocusedEl.textContent = state.totalFocused;
  totalSessionsEl.textContent = state.totalSessions;
}

function setPlayPauseIcon() {
  if (state.running) {
    iconPlay.classList.add('hidden');
    iconPause.classList.remove('hidden');
    timerCard.classList.add('running');
    startBtn.setAttribute('aria-label', '暂停计时');
  } else {
    iconPlay.classList.remove('hidden');
    iconPause.classList.add('hidden');
    timerCard.classList.remove('running');
    startBtn.setAttribute('aria-label', '开始计时');
  }
}

/* ══════════════════════════════
   TIMER ENGINE
══════════════════════════════ */
function startTimer() {
  if (state.running) return;
  state.running = true;
  setPlayPauseIcon();

  // Resume AudioContext if suspended (autoplay policy)
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

  state.intervalId = setInterval(() => {
    if (state.timeLeft <= 0) {
      onSessionEnd();
      return;
    }
    state.timeLeft--;
    updateDisplay();

    // Subtle tick in last 10 seconds of pomodoro
    if (state.mode === 'pomodoro' && state.timeLeft <= 10 && state.timeLeft > 0) {
      playTick();
    }
  }, 1000);
}

function pauseTimer() {
  clearInterval(state.intervalId);
  state.running = false;
  setPlayPauseIcon();
}

function resetTimer() {
  clearInterval(state.intervalId);
  state.running = false;
  state.timeLeft = getDuration(state.mode);
  state.totalSeconds = state.timeLeft;
  setPlayPauseIcon();
  updateDisplay();
}

function skipSession() {
  clearInterval(state.intervalId);
  state.running = false;
  onSessionEnd(true);
}

function onSessionEnd(skipped = false) {
  clearInterval(state.intervalId);
  state.running = false;

  if (state.mode === 'pomodoro') {
    if (!skipped) {
      state.totalFocused += settings.pomodoro;
      state.totalSessions++;
      updateStats();
      playChime('end');
      sendNotification('🍅 专注完成！', '漂亮！现在去休息一下吧。');
    }

    // Decide next break
    if (state.session >= settings.rounds) {
      // Long break
      state.session = settings.rounds; // keep at max before advancing
      switchMode('long');
    } else {
      switchMode('short');
    }
  } else {
    // Break ended → back to pomodoro
    if (!skipped) {
      playChime('start');
      sendNotification('☕ 休息结束！', '准备好重新专注了吗？');
    }

    // Advance session counter
    if (state.mode === 'long') {
      state.session = 1;
      state.round++;
    } else {
      state.session++;
    }
    switchMode('pomodoro');
  }

  setPlayPauseIcon();
}

function getDuration(mode) {
  const map = { pomodoro: settings.pomodoro, short: settings.short, long: settings.long };
  return map[mode] * 60;
}

function switchMode(mode) {
  state.mode = mode;
  state.timeLeft = getDuration(mode);
  state.totalSeconds = state.timeLeft;

  // Update tab highlight
  tabs.forEach(t => {
    const isActive = t.dataset.mode === mode;
    t.classList.toggle('active', isActive);
    t.setAttribute('aria-selected', isActive);
  });

  updateMode();
  buildDots();
  updateSessionText();
  updateDisplay();
}

/* ══════════════════════════════
   SETTINGS MODAL
══════════════════════════════ */
function openModal() {
  document.getElementById('settingPomodoro').value = settings.pomodoro;
  document.getElementById('settingShort').value    = settings.short;
  document.getElementById('settingLong').value     = settings.long;
  document.getElementById('settingRounds').value   = settings.rounds;
  document.getElementById('settingSound').checked  = settings.sound;
  document.getElementById('settingNotify').checked = settings.notify;
  modalOverlay.hidden = false;
}

function closeModal() { modalOverlay.hidden = true; }

function applySettings() {
  const newSettings = {
    pomodoro: Math.max(1, parseInt(document.getElementById('settingPomodoro').value) || 25),
    short:    Math.max(1, parseInt(document.getElementById('settingShort').value)    || 5),
    long:     Math.max(1, parseInt(document.getElementById('settingLong').value)     || 15),
    rounds:   Math.max(1, parseInt(document.getElementById('settingRounds').value)   || 4),
    sound:    document.getElementById('settingSound').checked,
    notify:   document.getElementById('settingNotify').checked,
  };

  // If notify turned on, request permission
  if (newSettings.notify && !settings.notify) requestNotifyPermission();

  settings = newSettings;
  saveToStorage();
  closeModal();

  // Reset timer with new durations
  pauseTimer();
  state.timeLeft = getDuration(state.mode);
  state.totalSeconds = state.timeLeft;

  // Rebuild dots if rounds changed
  if (state.session > settings.rounds) state.session = 1;
  buildDots();
  updateSessionText();
  updateDisplay();
}

/* ══════════════════════════════
   EVENT LISTENERS
══════════════════════════════ */
startBtn.addEventListener('click', () => {
  state.running ? pauseTimer() : startTimer();
});

resetBtn.addEventListener('click', () => {
  pauseTimer();
  state.timeLeft = getDuration(state.mode);
  state.totalSeconds = state.timeLeft;
  setPlayPauseIcon();
  updateDisplay();
});

skipBtn.addEventListener('click', skipSession);

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    if (tab.dataset.mode === state.mode) return;
    pauseTimer();
    state.session = 1;
    switchMode(tab.dataset.mode);
  });
});

settingsBtn.addEventListener('click', openModal);
modalClose.addEventListener('click', closeModal);
saveSettings.addEventListener('click', applySettings);

// Close modal on overlay click
modalOverlay.addEventListener('click', e => {
  if (e.target === modalOverlay) closeModal();
});

// Keyboard: Escape to close modal, Space to start/pause
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !modalOverlay.hidden) closeModal();
  if (e.key === ' ' && modalOverlay.hidden) {
    e.preventDefault();
    state.running ? pauseTimer() : startTimer();
  }
});

/* ══════════════════════════════
   INIT
══════════════════════════════ */
function init() {
  settings = loadSettings();
  state.timeLeft = getDuration('pomodoro');
  state.totalSeconds = state.timeLeft;

  updateMode();
  updateDisplay();
  buildDots();
  updateSessionText();
  updateStats();
  setPlayPauseIcon();
}

init();
