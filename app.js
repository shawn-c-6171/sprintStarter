const statusEl = document.getElementById("status");
const reactionValueEl = document.getElementById("reactionValue");
const thumbButton = document.getElementById("thumbButton");
const thumbLabel = document.getElementById("thumbLabel");
const resetButton = document.getElementById("resetButton");
const settingsButton = document.getElementById("settingsButton");
const settingsSheet = document.getElementById("settingsSheet");
const initialDelayInput = document.getElementById("initialDelayInput");
const markToSetInput = document.getElementById("markToSetInput");
const setToGoInput = document.getElementById("setToGoInput");
const sampleAudioUrlInput = document.getElementById("sampleAudioUrlInput");
const sampleGunshotOffsetInput = document.getElementById("sampleGunshotOffsetInput");
const cancelSettingsButton = document.getElementById("cancelSettingsButton");
const saveSettingsButton = document.getElementById("saveSettingsButton");

let phase = "ready";
let isHolding = false;
let goTime = null;
let countdownTimeouts = [];

const settingsStorageKey = "sprint-trainer-settings-v1";
const defaultSettings = {
  initialDelayMs: 500,
  markToSetMs: 1100,
  setToGoMs: 1300,
  sampleAudioUrl: "",
  sampleGunshotOffsetMs: 2400,
};
let timingSettings = loadSettings();
let activeSampleAudio = null;

function updateStatus(text, style = "") {
  statusEl.textContent = text;
  statusEl.classList.remove("go", "false");
  if (style) {
    statusEl.classList.add(style);
  }
}

function setReaction(ms) {
  reactionValueEl.textContent = ms === null ? "-- ms" : `${ms} ms`;
}

function vibrate(pattern) {
  if (navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}

function sanitizeMs(value, minimum, maximum, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(maximum, Math.max(minimum, Math.round(n)));
}

function loadSettings() {
  try {
    const saved = localStorage.getItem(settingsStorageKey);
    if (!saved) {
      return { ...defaultSettings };
    }

    const parsed = JSON.parse(saved);
    return {
      initialDelayMs: sanitizeMs(parsed.initialDelayMs, 0, 10000, defaultSettings.initialDelayMs),
      markToSetMs: sanitizeMs(parsed.markToSetMs, 200, 10000, defaultSettings.markToSetMs),
      setToGoMs: sanitizeMs(parsed.setToGoMs, 200, 10000, defaultSettings.setToGoMs),
      sampleAudioUrl: typeof parsed.sampleAudioUrl === "string" ? parsed.sampleAudioUrl.trim() : "",
      sampleGunshotOffsetMs: sanitizeMs(parsed.sampleGunshotOffsetMs, 100, 30000, defaultSettings.sampleGunshotOffsetMs),
    };
  } catch (error) {
    return { ...defaultSettings };
  }
}

function saveSettings() {
  localStorage.setItem(settingsStorageKey, JSON.stringify(timingSettings));
}

function fillSettingsInputs() {
  initialDelayInput.value = String(timingSettings.initialDelayMs);
  markToSetInput.value = String(timingSettings.markToSetMs);
  setToGoInput.value = String(timingSettings.setToGoMs);
  sampleAudioUrlInput.value = timingSettings.sampleAudioUrl;
  sampleGunshotOffsetInput.value = String(timingSettings.sampleGunshotOffsetMs);
}

function openSettings() {
  fillSettingsInputs();
  settingsSheet.classList.remove("hidden");
  settingsSheet.setAttribute("aria-hidden", "false");
}

function closeSettings() {
  settingsSheet.classList.add("hidden");
  settingsSheet.setAttribute("aria-hidden", "true");
}

function beep(freq = 880, duration = 120) {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    return;
  }

  const ctx = new AudioContextCtor();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = freq;
  gain.gain.value = 0.0001;

  oscillator.connect(gain);
  gain.connect(ctx.destination);

  const now = ctx.currentTime;
  gain.gain.exponentialRampToValueAtTime(0.13, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration / 1000);

  oscillator.start(now);
  oscillator.stop(now + duration / 1000 + 0.02);

  oscillator.onended = () => {
    ctx.close();
  };
}

function speakCue(text) {
  if (!("speechSynthesis" in window)) {
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.9;
  utterance.pitch = 0.85;
  utterance.volume = 1;
  window.speechSynthesis.speak(utterance);
}

function playGunshotCue() {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    beep(1600, 220);
    return;
  }

  const ctx = new AudioContextCtor();
  const duration = 0.32;
  const sampleRate = ctx.sampleRate;
  const frameCount = Math.floor(sampleRate * duration);
  const buffer = ctx.createBuffer(1, frameCount, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < frameCount; i += 1) {
    const decay = Math.exp(-i / (sampleRate * 0.035));
    data[i] = (Math.random() * 2 - 1) * decay;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 500;

  const thump = ctx.createOscillator();
  thump.type = "triangle";
  thump.frequency.setValueAtTime(120, ctx.currentTime);
  thump.frequency.exponentialRampToValueAtTime(62, ctx.currentTime + 0.16);

  const thumpGain = ctx.createGain();
  thumpGain.gain.value = 0.0001;

  const gain = ctx.createGain();
  gain.gain.value = 0.0001;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-12, ctx.currentTime);
  compressor.knee.setValueAtTime(20, ctx.currentTime);
  compressor.ratio.setValueAtTime(12, ctx.currentTime);
  compressor.attack.setValueAtTime(0.002, ctx.currentTime);
  compressor.release.setValueAtTime(0.12, ctx.currentTime);

  noise.connect(highpass);
  highpass.connect(gain);
  thump.connect(thumpGain);

  gain.connect(compressor);
  thumpGain.connect(compressor);
  compressor.connect(ctx.destination);

  const now = ctx.currentTime;
  gain.gain.exponentialRampToValueAtTime(1, now + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  thumpGain.gain.exponentialRampToValueAtTime(0.95, now + 0.006);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.19);

  noise.start(now);
  noise.stop(now + duration);
  thump.start(now);
  thump.stop(now + 0.2);

  noise.onended = () => {
    ctx.close();
  };
}

function clearCountdown() {
  countdownTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
  countdownTimeouts = [];

  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }

  if (activeSampleAudio) {
    activeSampleAudio.pause();
    activeSampleAudio.currentTime = 0;
    activeSampleAudio = null;
  }
}

function startCountdown() {
  clearCountdown();
  phase = "counting";
  updateStatus("Hold steady");

  const markDelay = timingSettings.initialDelayMs;
  const setDelay = markDelay + timingSettings.markToSetMs;
  const goDelay = setDelay + timingSettings.setToGoMs;
  const hasCustomSample = timingSettings.sampleAudioUrl.length > 0;

  const markTimeoutId = setTimeout(() => {
    if (!isHolding || phase !== "counting") {
      return;
    }

    if (hasCustomSample) {
      updateStatus("On your mark");
      activeSampleAudio = new Audio(timingSettings.sampleAudioUrl);
      activeSampleAudio.volume = 1;
      activeSampleAudio.play().catch(() => {
        activeSampleAudio = null;
      });
    } else {
      updateStatus("On your mark");
      speakCue("On your mark");
    }
    vibrate(30);
  }, markDelay);

  const setTimeoutId = setTimeout(() => {
    if (!isHolding || phase !== "counting") {
      return;
    }

    updateStatus("Get set");
    if (!hasCustomSample) {
      speakCue("Get set");
    }
    vibrate(30);
  }, setDelay);

  const goTimeoutId = setTimeout(() => {
    if (!isHolding || phase !== "counting") {
      return;
    }

    clearCountdown();
    phase = "go";
    goTime = performance.now();
    updateStatus("GO!", "go");
    if (!hasCustomSample) {
      playGunshotCue();
    }
    vibrate([45, 25, 45]);
  }, hasCustomSample ? markDelay + timingSettings.sampleGunshotOffsetMs : goDelay);

  countdownTimeouts.push(markTimeoutId, setTimeoutId, goTimeoutId);
}

function onHoldStart(event) {
  event.preventDefault();
  if (isHolding) {
    return;
  }

  isHolding = true;
  thumbButton.classList.add("holding");
  thumbLabel.textContent = "HOLD";

  setReaction(null);
  goTime = null;
  startCountdown();
}

function onHoldEnd(event) {
  event.preventDefault();
  if (!isHolding) {
    return;
  }

  isHolding = false;
  thumbButton.classList.remove("holding");
  thumbLabel.textContent = "THUMB";

  if (phase === "counting") {
    clearCountdown();
    phase = "false";
    updateStatus("False start", "false");
    beep(300, 200);
    vibrate([25, 60, 25]);
    return;
  }

  if (phase === "go" && goTime !== null) {
    const reactionMs = Math.max(0, Math.round(performance.now() - goTime));
    setReaction(reactionMs);
    phase = "result";
    updateStatus("Nice start");
    vibrate(50);
  }
}

function resetSession() {
  clearCountdown();
  phase = "ready";
  isHolding = false;
  goTime = null;
  thumbButton.classList.remove("holding");
  thumbLabel.textContent = "THUMB";
  setReaction(null);
  updateStatus("Place your thumb and hold");
}

function applySettingsFromInputs() {
  timingSettings = {
    initialDelayMs: sanitizeMs(initialDelayInput.value, 0, 10000, timingSettings.initialDelayMs),
    markToSetMs: sanitizeMs(markToSetInput.value, 200, 10000, timingSettings.markToSetMs),
    setToGoMs: sanitizeMs(setToGoInput.value, 200, 10000, timingSettings.setToGoMs),
    sampleAudioUrl: sampleAudioUrlInput.value.trim(),
    sampleGunshotOffsetMs: sanitizeMs(sampleGunshotOffsetInput.value, 100, 30000, timingSettings.sampleGunshotOffsetMs),
  };
  saveSettings();
}

thumbButton.addEventListener("pointerdown", onHoldStart);
thumbButton.addEventListener("pointerup", onHoldEnd);
thumbButton.addEventListener("pointercancel", onHoldEnd);
thumbButton.addEventListener("lostpointercapture", onHoldEnd);

resetButton.addEventListener("click", resetSession);
settingsButton.addEventListener("click", openSettings);
cancelSettingsButton.addEventListener("click", closeSettings);
saveSettingsButton.addEventListener("click", () => {
  applySettingsFromInputs();
  closeSettings();
  if (!isHolding) {
    updateStatus("Settings saved");
    setTimeout(() => {
      if (!isHolding && phase !== "go") {
        updateStatus("Place your thumb and hold");
      }
    }, 700);
  }
});

settingsSheet.addEventListener("click", (event) => {
  if (event.target === settingsSheet) {
    closeSettings();
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    resetSession();
    closeSettings();
  }
});

window.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

fillSettingsInputs();
