const statusEl = document.getElementById("status");
const reactionValueEl = document.getElementById("reactionValue");
const thumbButton = document.getElementById("thumbButton");
const thumbLabel = document.getElementById("thumbLabel");
const hintText = document.getElementById("hintText");
const resetButton = document.getElementById("resetButton");
const settingsButton = document.getElementById("settingsButton");
const settingsSheet = document.getElementById("settingsSheet");
const startModeSelect = document.getElementById("startModeSelect");
const initialDelayInput = document.getElementById("initialDelayInput");
const markToSetInput = document.getElementById("markToSetInput");
const setToGoInput = document.getElementById("setToGoInput");
const sampleAudioUrlInput = document.getElementById("sampleAudioUrlInput");
const sampleGunshotOffsetInput = document.getElementById("sampleGunshotOffsetInput");
const gunshotIntensityInput = document.getElementById("gunshotIntensityInput");
const cancelSettingsButton = document.getElementById("cancelSettingsButton");
const saveSettingsButton = document.getElementById("saveSettingsButton");

let phase = "ready";
let isHolding = false;
let goTime = null;
let countdownTimeouts = [];
let motionListenerActive = false;
let motionDetected = false;
let motionPermissionState = "unknown";

const settingsStorageKey = "sprint-trainer-settings-v1";
const defaultSettings = {
  startMode: "hold",
  initialDelayMs: 500,
  markToSetMs: 1100,
  setToGoMs: 1300,
  sampleAudioUrl: "",
  sampleGunshotOffsetMs: 2400,
  gunshotIntensity: 125,
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
      startMode: parsed.startMode === "tap" ? "tap" : "hold",
      initialDelayMs: sanitizeMs(parsed.initialDelayMs, 0, 10000, defaultSettings.initialDelayMs),
      markToSetMs: sanitizeMs(parsed.markToSetMs, 200, 10000, defaultSettings.markToSetMs),
      setToGoMs: sanitizeMs(parsed.setToGoMs, 200, 10000, defaultSettings.setToGoMs),
      sampleAudioUrl: typeof parsed.sampleAudioUrl === "string" ? parsed.sampleAudioUrl.trim() : "",
      sampleGunshotOffsetMs: sanitizeMs(parsed.sampleGunshotOffsetMs, 100, 30000, defaultSettings.sampleGunshotOffsetMs),
      gunshotIntensity: sanitizeMs(parsed.gunshotIntensity, 50, 200, defaultSettings.gunshotIntensity),
    };
  } catch (error) {
    return { ...defaultSettings };
  }
}

function saveSettings() {
  localStorage.setItem(settingsStorageKey, JSON.stringify(timingSettings));
}

function fillSettingsInputs() {
  startModeSelect.value = timingSettings.startMode;
  initialDelayInput.value = String(timingSettings.initialDelayMs);
  markToSetInput.value = String(timingSettings.markToSetMs);
  setToGoInput.value = String(timingSettings.setToGoMs);
  sampleAudioUrlInput.value = timingSettings.sampleAudioUrl;
  sampleGunshotOffsetInput.value = String(timingSettings.sampleGunshotOffsetMs);
  gunshotIntensityInput.value = String(timingSettings.gunshotIntensity);
}

function isTapMode() {
  return timingSettings.startMode === "tap";
}

function applyModeText() {
  if (isTapMode()) {
    hintText.textContent = "Tap once to arm. On GO, sprint immediately. Reaction auto-detects from motion.";
  } else {
    hintText.textContent = "Hold the button while set in your 4-point start. Release exactly on GO.";
  }
}

async function ensureMotionPermission() {
  if (!isTapMode()) {
    return true;
  }

  if (typeof DeviceMotionEvent === "undefined") {
    motionPermissionState = "unavailable";
    return false;
  }

  if (typeof DeviceMotionEvent.requestPermission !== "function") {
    motionPermissionState = "granted";
    return true;
  }

  if (motionPermissionState === "granted") {
    return true;
  }

  try {
    const permission = await DeviceMotionEvent.requestPermission();
    motionPermissionState = permission === "granted" ? "granted" : "denied";
    return motionPermissionState === "granted";
  } catch (error) {
    motionPermissionState = "denied";
    return false;
  }
}

function stopMotionReactionDetection() {
  if (motionListenerActive) {
    window.removeEventListener("devicemotion", onMotionSample);
    motionListenerActive = false;
  }
}

function onMotionSample(event) {
  if (!isTapMode() || phase !== "go" || goTime === null || motionDetected) {
    return;
  }

  const accel = event.acceleration;
  if (!accel) {
    return;
  }

  const x = accel.x || 0;
  const y = accel.y || 0;
  const z = accel.z || 0;
  const magnitude = Math.sqrt(x * x + y * y + z * z);

  if (magnitude < 1.9) {
    return;
  }

  motionDetected = true;
  stopMotionReactionDetection();

  const reactionMs = Math.max(0, Math.round(performance.now() - goTime));
  setReaction(reactionMs);
  phase = "result";
  isHolding = false;
  thumbButton.classList.remove("holding");
  thumbLabel.textContent = "THUMB";
  updateStatus("Nice start");
  vibrate(50);
}

function startMotionReactionDetection() {
  stopMotionReactionDetection();
  motionDetected = false;
  if (!isTapMode() || motionPermissionState !== "granted") {
    return;
  }

  motionListenerActive = true;
  window.addEventListener("devicemotion", onMotionSample);
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
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
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
  utterance.volume = 0.72;
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
  const intensity = timingSettings.gunshotIntensity / 100;
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

  const crack = ctx.createOscillator();
  crack.type = "square";
  crack.frequency.setValueAtTime(1600, ctx.currentTime);
  crack.frequency.exponentialRampToValueAtTime(240, ctx.currentTime + 0.06);

  const crackGain = ctx.createGain();
  crackGain.gain.value = 0.0001;

  const preMaster = ctx.createGain();
  preMaster.gain.value = 1;

  const clipper = ctx.createWaveShaper();
  const curve = new Float32Array(2048);
  for (let i = 0; i < curve.length; i += 1) {
    const x = (i * 2) / (curve.length - 1) - 1;
    curve[i] = Math.tanh(4.2 * x);
  }
  clipper.curve = curve;
  clipper.oversample = "4x";

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.setValueAtTime(-3, ctx.currentTime);
  limiter.knee.setValueAtTime(0, ctx.currentTime);
  limiter.ratio.setValueAtTime(20, ctx.currentTime);
  limiter.attack.setValueAtTime(0.001, ctx.currentTime);
  limiter.release.setValueAtTime(0.06, ctx.currentTime);

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-12, ctx.currentTime);
  compressor.knee.setValueAtTime(20, ctx.currentTime);
  compressor.ratio.setValueAtTime(12, ctx.currentTime);
  compressor.attack.setValueAtTime(0.002, ctx.currentTime);
  compressor.release.setValueAtTime(0.12, ctx.currentTime);

  noise.connect(highpass);
  highpass.connect(gain);
  thump.connect(thumpGain);

  crack.connect(crackGain);

  gain.connect(compressor);
  thumpGain.connect(compressor);
  crackGain.connect(compressor);
  compressor.connect(preMaster);
  preMaster.connect(clipper);
  clipper.connect(limiter);
  limiter.connect(ctx.destination);

  const now = ctx.currentTime;
  gain.gain.exponentialRampToValueAtTime(1.45 * intensity, now + 0.0025);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  thumpGain.gain.exponentialRampToValueAtTime(1.15 * intensity, now + 0.004);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.19);
  crackGain.gain.exponentialRampToValueAtTime(1.1 * intensity, now + 0.0015);
  crackGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);

  noise.start(now);
  noise.stop(now + duration);
  thump.start(now);
  thump.stop(now + 0.2);
  crack.start(now);
  crack.stop(now + 0.06);

  noise.onended = () => {
    ctx.close();
  };
}

function clearCountdown() {
  countdownTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
  countdownTimeouts = [];
  stopMotionReactionDetection();

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

    if (isTapMode()) {
      startMotionReactionDetection();
      if (motionPermissionState !== "granted") {
        updateStatus("GO! (motion off)", "go");
      }
    }
  }, hasCustomSample ? markDelay + timingSettings.sampleGunshotOffsetMs : goDelay);

  countdownTimeouts.push(markTimeoutId, setTimeoutId, goTimeoutId);
}

function onHoldStart(event) {
  if (isTapMode()) {
    onTapModePress(event);
    return;
  }

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
  if (isTapMode()) {
    return;
  }

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

async function onTapModePress(event) {
  event.preventDefault();
  if (!isTapMode()) {
    return;
  }

  if (phase === "ready" || phase === "result" || phase === "false") {
    await ensureMotionPermission();
    isHolding = true;
    thumbButton.classList.add("holding");
    thumbLabel.textContent = "ARMED";
    setReaction(null);
    goTime = null;
    startCountdown();
    return;
  }

  if (phase === "counting") {
    clearCountdown();
    phase = "false";
    isHolding = false;
    thumbButton.classList.remove("holding");
    thumbLabel.textContent = "THUMB";
    updateStatus("False start", "false");
    beep(300, 200);
    vibrate([25, 60, 25]);
    return;
  }

  if (phase === "go" && goTime !== null) {
    const reactionMs = Math.max(0, Math.round(performance.now() - goTime));
    setReaction(reactionMs);
    phase = "result";
    stopMotionReactionDetection();
    isHolding = false;
    thumbButton.classList.remove("holding");
    thumbLabel.textContent = "THUMB";
    updateStatus("Nice start");
    vibrate(50);
  }
}

function resetSession() {
  clearCountdown();
  phase = "ready";
  isHolding = false;
  goTime = null;
  motionDetected = false;
  thumbButton.classList.remove("holding");
  thumbLabel.textContent = "THUMB";
  setReaction(null);
  updateStatus(isTapMode() ? "Tap to arm your start" : "Place your thumb and hold");
}

function applySettingsFromInputs() {
  timingSettings = {
    startMode: startModeSelect.value === "tap" ? "tap" : "hold",
    initialDelayMs: sanitizeMs(initialDelayInput.value, 0, 10000, timingSettings.initialDelayMs),
    markToSetMs: sanitizeMs(markToSetInput.value, 200, 10000, timingSettings.markToSetMs),
    setToGoMs: sanitizeMs(setToGoInput.value, 200, 10000, timingSettings.setToGoMs),
    sampleAudioUrl: sampleAudioUrlInput.value.trim(),
    sampleGunshotOffsetMs: sanitizeMs(sampleGunshotOffsetInput.value, 100, 30000, timingSettings.sampleGunshotOffsetMs),
    gunshotIntensity: sanitizeMs(gunshotIntensityInput.value, 50, 200, timingSettings.gunshotIntensity),
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
  applyModeText();
  closeSettings();
  if (!isHolding) {
    updateStatus("Settings saved");
    setTimeout(() => {
      if (!isHolding && phase !== "go") {
        updateStatus(isTapMode() ? "Tap to arm your start" : "Place your thumb and hold");
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
applyModeText();
resetSession();
