/* ============================================================
   ROCKET DUEL — 1v1 car soccer, first to 3.
   Canvas 2.5D arena + arcade physics + touch / tilt / keyboard.
   ============================================================ */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const angleLerp = (a, b, t) => {
  const d = ((((b - a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  return a + d * t;
};
const $ = (sel) => document.querySelector(sel);

const FIELD = {
  w: 760,
  h: 1080,
  goalW: 300,
  goalDepth: 62,
  crossbar: 168
};

const BALL_R = 27;
const CAR = { w: 56, l: 90, radius: 43 };
const Z_SCALE = 0.78;
const FIXED = 1 / 120;

const COLORS = {
  cyan: "#36f0ff",
  cyanSoft: "#9dfbff",
  pink: "#ff3d7f",
  pinkSoft: "#ff9bbd",
  gold: "#ffd166",
  white: "#f2fbff",
  green: "#b6ff5c"
};

const DIFF = {
  rookie: { label: "ROOKIE", base: 345, boost: 500, reaction: 0.36, error: 74, boostChance: 0.4, jump: 0.35 },
  pro: { label: "PRO", base: 425, boost: 625, reaction: 0.19, error: 38, boostChance: 0.72, jump: 0.55 },
  allstar: { label: "ALL-STAR", base: 472, boost: 690, reaction: 0.09, error: 15, boostChance: 0.95, jump: 0.8 }
};

const PAD_SPAWNS = [
  { x: 0, y: -395, amount: 40, big: true, respawn: 9 },
  { x: 0, y: 395, amount: 40, big: true, respawn: 9 },
  { x: -272, y: -168, amount: 15, big: false, respawn: 5 },
  { x: 272, y: -168, amount: 15, big: false, respawn: 5 },
  { x: -272, y: 168, amount: 15, big: false, respawn: 5 },
  { x: 272, y: 168, amount: 15, big: false, respawn: 5 }
];

/* ---------------- DOM ---------------- */

const canvas = $("#arena");
const mainCtx = canvas.getContext("2d", { alpha: true });
let ctx = mainCtx;
const staticCanvas = document.createElement("canvas");
const staticCtx = staticCanvas.getContext("2d", { alpha: true });

const el = {
  hud: $("#hud"),
  controls: $("#controls"),
  menu: $("#menu"),
  pause: $("#pauseMenu"),
  end: $("#endMenu"),
  pScore: $("#pScore"),
  bScore: $("#bScore"),
  pPips: $("#pPips"),
  bPips: $("#bPips"),
  matchTag: $("#matchTag"),
  announce: $("#announce"),
  annMain: $("#annMain"),
  annSub: $("#annSub"),
  boostRing: $("#boostRing"),
  boostValue: $("#boostValue"),
  boostBtn: $("#boostBtn"),
  jumpBtn: $("#jumpBtn"),
  stick: $("#stick"),
  stickWrap: $("#stickWrap"),
  knob: $("#knob"),
  tiltMeter: $("#tiltMeter"),
  tiltDot: $("#tiltDot"),
  tiltState: $("#tiltState"),
  pauseTiltState: $("#pauseTiltState"),
  iosHint: $("#iosHint"),
  toast: $("#toast"),
  pauseScore: $("#pauseScore"),
  endTitle: $("#endTitle"),
  endKicker: $("#endKicker"),
  endCopy: $("#endCopy"),
  finalScore: $("#finalScore"),
  soundBtn: $("#soundBtn")
};

/* ---------------- View / camera ---------------- */

const view = {
  w: 0,
  h: 0,
  dpr: 1,
  scale: 1,
  cx: 0,
  top: 0,
  rect: { x: 0, y: 0, w: 0, h: 0 },
  landscape: false,
  bg: null,
  crowd: []
};

const SX = (x) => view.cx + x * view.scale;
const SY = (y, z = 0) => view.top + (y + FIELD.h / 2) * view.scale - z * view.scale * Z_SCALE;

function resize() {
  view.w = window.innerWidth;
  view.h = window.innerHeight;
  view.dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(view.w * view.dpr);
  canvas.height = Math.round(view.h * view.dpr);
  canvas.style.width = view.w + "px";
  canvas.style.height = view.h + "px";

  const landscape = view.w > view.h;
  view.landscape = landscape;
  const small = view.h < 620;
  const safe = 0;
  let top = landscape ? 76 : 90;
  let bottom = landscape ? 16 : small ? 168 : 195;
  let availW = view.w - (landscape ? 310 : 20);
  let availH = view.h - top - bottom - safe;

  if (landscape && availW < 240) availW = view.w - 26;
  if (availW < 200) availW = view.w - 18;
  if (availH < 200) availH = view.h * 0.5;

  view.scale = Math.min(availW / FIELD.w, availH / FIELD.h);
  const fw = FIELD.w * view.scale;
  const fh = FIELD.h * view.scale;
  view.cx = view.w / 2;
  view.top = top + Math.max(0, (availH - fh) / 2);
  view.rect = { x: view.cx - fw / 2, y: view.top, w: fw, h: fh };

  buildCrowd();
  rebuildStatic();
}

function rebuildStatic() {
  if (!view.rect.w) return;
  staticCanvas.width = Math.round(view.w * view.dpr);
  staticCanvas.height = Math.round(view.h * view.dpr);
  staticCtx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  staticCtx.clearRect(0, 0, view.w, view.h);

  const prev = ctx;
  ctx = staticCtx;
  view.bg = ctx.createLinearGradient(0, 0, 0, view.h);
  view.bg.addColorStop(0, "#081722");
  view.bg.addColorStop(0.45, "#050d15");
  view.bg.addColorStop(1, "#03060a");

  drawBackground();
  drawStadium();
  drawField();
  drawGoalNet(-1);
  drawGoalNet(1);
  ctx = prev;
}

function buildCrowd() {
  view.crowd = [];
  const palette = [COLORS.cyan, COLORS.pink, COLORS.gold, "#d8f6ff", "#8aabc0"];
  for (let i = 0; i < 300; i++) {
    const side = Math.floor(Math.random() * 4);
    let x, y;
    if (side === 0) {
      x = -FIELD.w / 2 - rand(34, 150);
      y = rand(-FIELD.h / 2 - 110, FIELD.h / 2 + 110);
    } else if (side === 1) {
      x = FIELD.w / 2 + rand(34, 150);
      y = rand(-FIELD.h / 2 - 110, FIELD.h / 2 + 110);
    } else if (side === 2) {
      x = rand(-FIELD.w / 2 - 130, FIELD.w / 2 + 130);
      y = -FIELD.h / 2 - rand(40, 122);
    } else {
      x = rand(-FIELD.w / 2 - 130, FIELD.w / 2 + 130);
      y = FIELD.h / 2 + rand(40, 122);
    }
    view.crowd.push({
      x,
      y,
      c: palette[Math.floor(Math.random() * palette.length)],
      r: rand(1, 2.4),
      phase: rand(0, TAU),
      speed: rand(0.6, 2.2),
      a: rand(0.16, 0.52)
    });
  }
}

/* ---------------- Audio ---------------- */

const Sound = {
  ctx: null,
  master: null,
  boostGain: null,
  enabled: true,
  lastHit: 0,

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      this.ctx = null;
    }
    if (!this.ctx) return;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);

    const len = Math.floor(this.ctx.sampleRate * 2);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 900;
    bp.Q.value = 0.7;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(bp);
    bp.connect(gain);
    gain.connect(this.master);
    src.start();
    this.boostGain = gain;
  },

  setBoost(on) {
    G.boostSound = !!on;
    if (!this.ctx || !this.boostGain) return;
    const v = on && this.enabled ? 0.05 : 0;
    this.boostGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.06);
  },

  tone(freq, dur = 0.12, type = "sine", vol = 0.1, when = 0) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.04);
  },

  noise(dur = 0.1, vol = 0.1, freq = 900, q = 1) {
    if (!this.enabled || !this.ctx) return;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start();
  },

  hit(power) {
    if (!this.enabled || !this.ctx) return;
    if (this.ctx.currentTime - this.lastHit < 0.055) return;
    this.lastHit = this.ctx.currentTime;
    const v = clamp(power / 900, 0.04, 0.18);
    this.noise(0.075, v, 1500, 0.8);
    this.tone(64 + power * 0.035, 0.09, "sine", v * 0.75);
  },

  pickup(big) {
    this.tone(big ? 880 : 660, 0.07, "triangle", 0.075);
    this.tone(big ? 1320 : 990, 0.1, "sine", 0.045, 0.04);
  },

  jump() {
    this.tone(260, 0.07, "square", 0.028);
    this.tone(500, 0.11, "sine", 0.028, 0.03);
  },

  flip() {
    this.noise(0.13, 0.055, 520, 1.4);
    this.tone(180, 0.08, "sawtooth", 0.025);
  },

  count() {
    this.tone(440, 0.09, "sine", 0.06);
  },

  go() {
    this.tone(880, 0.18, "sine", 0.085);
    this.tone(1320, 0.24, "sine", 0.05, 0.02);
  },

  goal(good) {
    const notes = good ? [523, 659, 784, 1047] : [392, 330, 262];
    notes.forEach((n, i) => this.tone(n, 0.3, "triangle", 0.08, i * 0.12));
    this.noise(0.42, 0.06, 340, 0.7);
  },

  win() {
    [523, 659, 784, 1047, 1319].forEach((n, i) => this.tone(n, 0.42, "triangle", 0.085, i * 0.11));
  },

  lose() {
    [392, 349, 294, 196].forEach((n, i) => this.tone(n, 0.38, "sine", 0.075, i * 0.14));
  },

  click() {
    this.tone(620, 0.035, "sine", 0.022);
  }
};

/* ---------------- Game state ---------------- */

const G = {
  phase: "menu",
  prevPhase: null,
  time: 0,
  score: [0, 0],
  difficulty: "pro",
  countdown: 0,
  lastCount: 0,
  goalTimer: 0,
  goalBy: -1,
  goalLog: [],
  endDelay: 0,
  shake: 0,
  flash: 0,
  flashColor: "#ffffff",
  pads: [],
  particles: [],
  ballTrail: [],
  player: null,
  bot: null,
  ball: null,
  trailClock: 0,
  lastTouch: null,
  input: { boost: false, jump: false },
  jumpQueued: false,
  joy: { active: false, pointer: null, x: 0, y: 0, mx: 0, my: 0 },
  tilt: {
    enabled: false,
    ready: false,
    gotData: false,
    calibrating: false,
    samples: [],
    zero: null,
    target: 0,
    value: 0,
    listener: false
  },
  sound: true,
  boostSound: false,
  lastUI: { boost: -1, phase: "", tag: "" },
  menuClock: 0,
  shakeX: 0,
  shakeY: 0
};

function makeCar(isPlayer) {
  const diff = DIFF[G.difficulty];
  return {
    isPlayer,
    x: 0,
    y: isPlayer ? FIELD.h / 2 - 250 : -FIELD.h / 2 + 250,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    angle: isPlayer ? -Math.PI / 2 : Math.PI / 2,
    boost: 65,
    boosting: false,
    onGround: true,
    airJumps: 1,
    jumpHeld: false,
    flip: 0,
    hitCd: 0,
    fx: 0,
    baseSpeed: isPlayer ? 500 : diff.base,
    boostSpeed: isPlayer ? 735 : diff.boost,
    think: 0,
    targetX: 0,
    targetY: 0,
    wantBoost: false,
    jumpQueued: false
  };
}

function makeBall() {
  return { x: 0, y: 0, z: BALL_R, vx: 0, vy: 0, vz: 0, spin: 0 };
}

function makePads() {
  return PAD_SPAWNS.map((p) => ({ ...p, active: true, timer: 0, phase: rand(0, TAU) }));
}

function resetWorld() {
  G.player = makeCar(true);
  G.bot = makeCar(false);
  G.ball = makeBall();
  G.pads = makePads();
  G.particles = [];
  G.ballTrail = [];
  G.trailClock = 0;
  G.shake = 0;
  G.flash = 0;
  G.countdown = 0;
  G.goalTimer = 0;
  G.endDelay = 0;
  G.input.boost = false;
  G.jumpQueued = false;
  resetJoystick();
}

function resetPositions() {
  const p = G.player;
  p.x = 0;
  p.y = FIELD.h / 2 - 250;
  p.z = 0;
  p.vx = p.vy = p.vz = 0;
  p.angle = -Math.PI / 2;
  p.boost = 65;
  p.onGround = true;
  p.airJumps = 1;
  p.flip = 0;
  p.hitCd = 0;
  p.boosting = false;

  const b = G.bot;
  b.x = 0;
  b.y = -FIELD.h / 2 + 250;
  b.z = 0;
  b.vx = b.vy = b.vz = 0;
  b.angle = Math.PI / 2;
  b.boost = 65;
  b.onGround = true;
  b.airJumps = 1;
  b.flip = 0;
  b.hitCd = 0;
  b.boosting = false;
  b.think = 0;

  G.ball = makeBall();
  G.ballTrail = [];
  G.pads = makePads();
  G.particles = [];
  G.input.boost = false;
  G.jumpQueued = false;
  resetJoystick();
  resetKnob();
}

/* ---------------- UI ---------------- */

let annTimer = null;
let toastTimer = null;
let lastTag = "";

function announce(main, sub = "", tone = "", ms = 1100) {
  el.annMain.textContent = main;
  el.annSub.textContent = sub;
  el.announce.classList.remove("show", "tone-pink", "tone-gold", "tone-go");
  void el.announce.offsetWidth;
  if (tone) el.announce.classList.add("tone-" + tone);
  el.announce.classList.add("show");
  clearTimeout(annTimer);
  annTimer = setTimeout(() => el.announce.classList.remove("show"), ms);
}

function hideAnnounce() {
  clearTimeout(annTimer);
  el.announce.classList.remove("show");
}

function showToast(msg, ms = 2400) {
  el.toast.textContent = msg;
  el.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove("show"), ms);
}

function hideToast() {
  clearTimeout(toastTimer);
  el.toast.classList.remove("show");
}

function updateScoreUI() {
  el.pScore.textContent = String(G.score[0]);
  el.bScore.textContent = String(G.score[1]);
  Array.from(el.pPips.children).forEach((n, i) => n.classList.toggle("on", i < G.score[0]));
  Array.from(el.bPips.children).forEach((n, i) => n.classList.toggle("on", i < G.score[1]));
  G.lastUI.tag = "";
  updateTag();
}

function updateTag() {
  let tag = "LIVE";
  if (G.phase === "menu") tag = "KICK OFF";
  else if (G.phase === "countdown") tag = "KICK OFF";
  else if (G.phase === "goal") tag = "GOAL";
  else if (G.phase === "gameover") tag = "FULL TIME";
  else if (G.phase === "paused") tag = "PAUSED";
  else if (Math.max(G.score[0], G.score[1]) >= 2) tag = "MATCH POINT";

  if (tag !== lastTag) {
    lastTag = tag;
    el.matchTag.textContent = tag;
    el.matchTag.classList.toggle("is-hot", tag === "MATCH POINT");
  }
}

function syncSoundUI() {
  Sound.enabled = G.sound;
  el.soundBtn.classList.toggle("is-muted", !G.sound);
  el.soundBtn.setAttribute("aria-pressed", String(G.sound));
  if (!G.sound) Sound.setBoost(false);
}

function syncTiltUI() {
  const on = G.tilt.enabled;
  const state = !on ? "Optional · off" : G.tilt.ready ? "On · tilt to steer" : "Calibrating…";
  el.tiltState.textContent = state;
  el.pauseTiltState.textContent = state;
  $("#tiltBtn").setAttribute("aria-pressed", String(on));
  $("#pauseTiltBtn").setAttribute("aria-pressed", String(on));
  $("#tiltBtn").classList.toggle("is-busy", on && !G.tilt.ready);
  $("#pauseTiltBtn").classList.toggle("is-busy", on && !G.tilt.ready);
}

function showHUD(show) {
  el.hud.classList.toggle("is-hidden", !show);
}

function showControls(show) {
  el.controls.classList.toggle("is-hidden", !show);
}

function startMatch() {
  Sound.init();
  Sound.click();
  hideAnnounce();
  el.menu.classList.add("is-hidden");
  el.pause.classList.add("is-hidden");
  el.end.classList.add("is-hidden");
  showHUD(true);
  showControls(true);
  G.score = [0, 0];
  G.phase = "countdown";
  G.prevPhase = null;
  resetPositions();
  G.goalLog = [];
  updateScoreUI();
  G.countdown = 3;
  G.lastCount = 4;
  G.shake = 0;
  G.flash = 0;
  G.endDelay = 0;
  updateTiltMeterVisibility();
  updateUI(true);
}

function beginKickoff() {
  resetPositions();
  G.phase = "countdown";
  G.countdown = 3;
  G.lastCount = 4;
  G.goalTimer = 0;
  G.goalBy = -1;
  G.input.boost = false;
  G.jumpQueued = false;
  updateScoreUI();
  updateTiltMeterVisibility();
}

function scoreGoal(scorer) {
  if (G.phase !== "play") return;
  G.score[scorer] = Math.min(3, G.score[scorer] + 1);
  G.phase = "goal";
  G.goalTimer = 2.55;
  G.goalBy = scorer;
  G.goalLog.push({
    t: Number(G.time.toFixed(2)),
    scorer,
    ball: { x: Math.round(G.ball.x), y: Math.round(G.ball.y), z: Math.round(G.ball.z) },
    vel: { x: Math.round(G.ball.vx), y: Math.round(G.ball.vy) },
    touch: G.lastTouch,
    player: { x: Math.round(G.player.x), y: Math.round(G.player.y) },
    bot: { x: Math.round(G.bot.x), y: Math.round(G.bot.y) }
  });
  if (G.goalLog.length > 30) G.goalLog.shift();
  G.shake = Math.max(G.shake, 17);
  G.flash = 0.55;
  G.flashColor = scorer === 0 ? COLORS.cyan : COLORS.pink;
  G.input.boost = false;
  G.jumpQueued = false;
  G.player.boosting = false;
  G.bot.boosting = false;
  Sound.setBoost(false);
  spawnGoalBurst(scorer);
  Sound.goal(scorer === 0);
  announce(
    "GOAL!",
    scorer === 0 ? "YOU SCORE" : "BOT SCORES",
    scorer === 0 ? "go" : "pink",
    2100
  );
  updateScoreUI();
}

function finishMatch() {
  G.phase = "gameover";
  G.endDelay = 0.85;
  G.shake = Math.max(G.shake, 9);
  G.input.boost = false;
  G.player.boosting = false;
  G.bot.boosting = false;
  Sound.setBoost(false);
  const win = G.score[0] >= 3;
  if (win) Sound.win();
  else Sound.lose();
  announce(win ? "VICTORY" : "DEFEAT", win ? "GG · WELL PLAYED" : "THE BOT TAKES IT", win ? "go" : "pink", 1200);
  updateScoreUI();
  updateTiltMeterVisibility();
}

function showEnd() {
  const win = G.score[0] >= 3;
  const margin = Math.abs(G.score[0] - G.score[1]);
  el.endTitle.textContent = win ? "VICTORY" : "DEFEAT";
  el.endTitle.className = win ? "win" : "lose";
  el.finalScore.innerHTML = `${G.score[0]} <span>:</span> ${G.score[1]}`;
  el.endKicker.textContent = `${DIFF[G.difficulty].label} BOT · FIRST TO 3`;
  if (win) {
    el.endCopy.textContent = margin === 3 ? "Clean sweep. The bot never found the net." : margin === 2 ? "Match point converted. That one had some heat." : "Down to the wire. You found another gear.";
  } else {
    el.endCopy.textContent = margin === 3 ? "The bot ran the table. Shake it off and go again." : "So close. One more kickoff might flip it.";
  }
  el.end.classList.remove("is-hidden");
  updateTiltMeterVisibility();
}

function toMenu() {
  G.phase = "menu";
  G.prevPhase = null;
  G.score = [0, 0];
  resetWorld();
  hideAnnounce();
  hideToast();
  el.menu.classList.remove("is-hidden");
  el.pause.classList.add("is-hidden");
  el.end.classList.add("is-hidden");
  showHUD(false);
  showControls(false);
  Sound.setBoost(false);
  updateTiltMeterVisibility();
}

function setPaused(paused) {
  if (paused) {
    if (!["play", "countdown", "goal"].includes(G.phase)) return;
    G.prevPhase = G.phase;
    G.phase = "paused";
    el.pauseScore.textContent = `YOU ${G.score[0]} — ${G.score[1]} BOT`;
    el.pause.classList.remove("is-hidden");
    G.input.boost = false;
    G.jumpQueued = false;
    Sound.setBoost(false);
    releaseHold(el.boostBtn);
    releaseHold(el.jumpBtn);
    updateTiltMeterVisibility();
    updateTag();
  } else if (G.phase === "paused") {
    G.phase = G.prevPhase || "play";
    G.prevPhase = null;
    el.pause.classList.add("is-hidden");
    updateTiltMeterVisibility();
    updateTag();
  }
}

function updateTiltMeterVisibility() {
  const show = G.tilt.enabled && ["play", "countdown", "goal"].includes(G.phase);
  el.tiltMeter.classList.toggle("is-hidden", !show);
}

/* ---------------- Input ---------------- */

const keys = new Set();
let knobHome = { x: 0, y: 0 };

function resetJoystick() {
  G.joy.active = false;
  G.joy.pointer = null;
  G.joy.x = 0;
  G.joy.y = 0;
  G.joy.mx = 0;
  G.joy.my = 0;
  el.stick.classList.remove("is-active");
  resetKnob();
}

function resetKnob() {
  el.knob.style.transform = "translate(0px, 0px)";
}

function updateJoystick(clientX, clientY) {
  const r = el.stick.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const reach = r.width * 0.29;
  let dx = clientX - cx;
  let dy = clientY - cy;
  const d = Math.hypot(dx, dy);
  if (d > reach) {
    dx = (dx / d) * reach;
    dy = (dy / d) * reach;
  }
  G.joy.x = dx / reach;
  G.joy.y = dy / reach;
  G.joy.mx = dx;
  G.joy.my = dy;
  el.knob.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
  el.stick.classList.toggle("is-active", d > 3);
}

el.stickWrap.addEventListener("pointerdown", (e) => {
  if (G.phase !== "play" && G.phase !== "countdown") return;
  e.preventDefault();
  G.joy.active = true;
  G.joy.pointer = e.pointerId;
  try {
    el.stickWrap.setPointerCapture(e.pointerId);
  } catch {}
  updateJoystick(e.clientX, e.clientY);
});

window.addEventListener("pointermove", (e) => {
  if (!G.joy.active || e.pointerId !== G.joy.pointer) return;
  e.preventDefault();
  updateJoystick(e.clientX, e.clientY);
});

function endJoy(e) {
  if (!G.joy.active || (e && e.pointerId !== G.joy.pointer)) return;
  resetJoystick();
}
window.addEventListener("pointerup", endJoy);
window.addEventListener("pointercancel", endJoy);
window.addEventListener("blur", () => {
  resetJoystick();
  releaseHold(el.boostBtn);
  releaseHold(el.jumpBtn);
  G.input.boost = false;
  if (["play", "countdown", "goal"].includes(G.phase)) setPaused(true);
});

function releaseHold(node) {
  node.classList.remove("is-held");
}

function bindHold(node, onChange) {
  const down = (e) => {
    e.preventDefault();
    node.classList.add("is-held");
    onChange(true);
    try {
      node.setPointerCapture(e.pointerId);
    } catch {}
  };
  const up = (e) => {
    if (e) e.preventDefault();
    node.classList.remove("is-held");
    onChange(false);
  };
  node.addEventListener("pointerdown", down);
  node.addEventListener("pointerup", up);
  node.addEventListener("pointercancel", up);
  node.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse" && e.buttons === 0) up(e);
  });
}

bindHold(el.boostBtn, (on) => {
  if (on && G.phase === "play") Sound.init();
  G.input.boost = on;
});

el.jumpBtn.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  el.jumpBtn.classList.add("is-held");
  queueJump();
});
["pointerup", "pointercancel", "pointerleave"].forEach((evt) => {
  el.jumpBtn.addEventListener(evt, () => releaseHold(el.jumpBtn));
});

function queueJump() {
  if (G.phase !== "play") return;
  G.jumpQueued = true;
  Sound.init();
}

window.addEventListener("keydown", (e) => {
  const code = e.code;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(code);
  if (code === "Space") queueJump();
  if (code === "Enter" && G.phase === "menu") startMatch();
  if (code === "Escape" || code === "KeyP") {
    if (G.phase === "paused") setPaused(false);
    else setPaused(true);
  }
});

window.addEventListener("keyup", (e) => keys.delete(e.code));

function keyboardVector() {
  let x = 0;
  let y = 0;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
  if (keys.has("KeyW") || keys.has("ArrowUp")) y -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) y += 1;
  return { x, y };
}

function getPlayerInput() {
  const k = keyboardVector();
  let ix = 0;
  let iy = 0;
  if (k.x || k.y) {
    const m = Math.hypot(k.x, k.y) || 1;
    ix = k.x / m;
    iy = k.y / m;
  } else {
    ix = G.joy.x;
    iy = G.joy.y;
    if (G.tilt.enabled && G.tilt.ready) {
      ix = clamp(G.tilt.value + G.joy.x * 0.22, -1, 1);
    }
  }
  const jump = G.jumpQueued;
  G.jumpQueued = false;
  return {
    x: ix,
    y: iy,
    boost: G.input.boost || keys.has("ShiftLeft") || keys.has("ShiftRight"),
    jump
  };
}

/* ---------------- Motion / iOS permission ---------------- */

function readTiltAxis(e) {
  const angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
  if (angle === 90) return e.beta;
  if (angle === -90 || angle === 270) return e.beta == null ? null : -e.beta;
  if (angle === 180) return e.gamma == null ? null : -e.gamma;
  return e.gamma;
}

function onDeviceOrientation(e) {
  if (!G.tilt.enabled) return;
  const raw = readTiltAxis(e);
  if (raw == null || Number.isNaN(raw)) return;
  G.tilt.gotData = true;
  if (G.tilt.calibrating) {
    G.tilt.samples.push(raw);
    if (G.tilt.samples.length >= 18) {
      const sum = G.tilt.samples.reduce((a, b) => a + b, 0);
      G.tilt.zero = sum / G.tilt.samples.length;
      G.tilt.calibrating = false;
      G.tilt.ready = true;
      G.tilt.samples = [];
      syncTiltUI();
      showToast("Tilt ready — tilt left / right, push the stick to drive.", 3000);
    }
    return;
  }
  if (G.tilt.zero == null) G.tilt.zero = raw;
  const delta = raw - G.tilt.zero;
  const dead = 1.6;
  const max = 21;
  const sign = delta < 0 ? -1 : 1;
  G.tilt.target = sign * clamp((Math.abs(delta) - dead) / (max - dead), 0, 1);
}

async function toggleTilt() {
  if (G.tilt.enabled) {
    G.tilt.enabled = false;
    G.tilt.ready = false;
    G.tilt.target = 0;
    G.tilt.value = 0;
    syncTiltUI();
    updateTiltMeterVisibility();
    showToast("Tilt steering off.");
    return;
  }

  if (typeof window.DeviceOrientationEvent === "undefined") {
    showToast("Motion tilt is not available on this device.");
    return;
  }

  if (typeof window.DeviceOrientationEvent.requestPermission === "function") {
    try {
      const result = await window.DeviceOrientationEvent.requestPermission();
      if (result !== "granted") {
        showToast("Motion access was denied. You can still drive with touch.");
        return;
      }
    } catch {
      showToast("Motion needs a secure page and a direct tap. Touch still works.");
      return;
    }
  }

  if (!G.tilt.listener) {
    window.addEventListener("deviceorientation", onDeviceOrientation, true);
    G.tilt.listener = true;
  }
  G.tilt.enabled = true;
  G.tilt.calibrating = true;
  G.tilt.ready = false;
  G.tilt.gotData = false;
  G.tilt.samples = [];
  G.tilt.zero = null;
  G.tilt.target = 0;
  G.tilt.value = 0;
  syncTiltUI();
  updateTiltMeterVisibility();
  showToast("Tilt on — hold your device naturally to calibrate.", 2600);

  const checkAt = performance.now();
  setTimeout(() => {
    if (G.tilt.enabled && !G.tilt.gotData && performance.now() - checkAt > 1200) {
      showToast("No motion data yet. On iPhone, allow Motion & Orientation access.", 3000);
    }
  }, 1700);
}

$("#tiltBtn").addEventListener("click", toggleTilt);
$("#pauseTiltBtn").addEventListener("click", toggleTilt);

/* ---------------- Menu / buttons ---------------- */

$("#playBtn").addEventListener("click", startMatch);
$("#pauseBtn").addEventListener("click", () => setPaused(true));
$("#resumeBtn").addEventListener("click", () => setPaused(false));
$("#restartBtn").addEventListener("click", () => {
  el.pause.classList.add("is-hidden");
  startMatch();
});
$("#quitBtn").addEventListener("click", toMenu);
$("#rematchBtn").addEventListener("click", () => {
  el.end.classList.add("is-hidden");
  startMatch();
});
$("#endMenuBtn").addEventListener("click", toMenu);

el.soundBtn.addEventListener("click", () => {
  G.sound = !G.sound;
  Sound.init();
  syncSoundUI();
  if (G.sound) Sound.click();
});

document.querySelectorAll("#difficulty button").forEach((btn) => {
  btn.addEventListener("click", () => {
    G.difficulty = btn.dataset.diff;
    document.querySelectorAll("#difficulty button").forEach((b) => b.classList.toggle("is-active", b === btn));
    Sound.init();
    Sound.click();
  });
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && ["play", "countdown", "goal"].includes(G.phase)) setPaused(true);
});

/* ---------------- Physics ---------------- */

function particle(p) {
  if (G.particles.length > 260) return;
  G.particles.push({
    x: p.x,
    y: p.y,
    z: p.z || 0,
    vx: p.vx || 0,
    vy: p.vy || 0,
    vz: p.vz || 0,
    life: p.life || 0.5,
    max: p.life || 0.5,
    size: p.size || 3,
    color: p.color || COLORS.white,
    kind: p.kind || "spark",
    drag: p.drag == null ? 0.99 : p.drag,
    grav: p.grav == null ? 380 : p.grav,
    rot: rand(0, TAU),
    spin: rand(-8, 8)
  });
}

function spawnSparks(x, y, z, n, color, speed = 240) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU);
    const s = rand(speed * 0.25, speed);
    particle({
      x,
      y,
      z: z + rand(-4, 8),
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      vz: rand(20, 180),
      life: rand(0.16, 0.42),
      size: rand(1.4, 3.6),
      color: Math.random() < 0.6 ? color : COLORS.white,
      kind: "spark",
      grav: 500
    });
  }
}

function spawnHitParticles(car, ball, power) {
  const n = clamp(Math.round(power / 55), 3, 14);
  spawnSparks(ball.x, ball.y, ball.z, n, car.isPlayer ? COLORS.cyan : COLORS.pink, 190 + power * 0.22);
  if (power > 430) {
    for (let i = 0; i < 5; i++) {
      particle({
        x: ball.x + rand(-10, 10),
        y: ball.y + rand(-10, 10),
        z: ball.z + rand(-5, 10),
        vx: rand(-40, 40),
        vy: rand(-40, 40),
        vz: rand(30, 80),
        life: rand(0.25, 0.5),
        size: rand(8, 18),
        color: car.isPlayer ? "rgba(54,240,255,0.22)" : "rgba(255,61,127,0.22)",
        kind: "puff",
        grav: -20
      });
    }
  }
}

function spawnGoalBurst(scorer) {
  const top = scorer === 0;
  const y = top ? -FIELD.h / 2 - 20 : FIELD.h / 2 + 20;
  const colors = [COLORS.cyan, COLORS.pink, COLORS.gold, COLORS.white, COLORS.green];
  for (let i = 0; i < 90; i++) {
    particle({
      x: rand(-FIELD.goalW / 2, FIELD.goalW / 2),
      y,
      z: rand(10, 160),
      vx: rand(-260, 260),
      vy: (top ? 1 : -1) * rand(60, 320),
      vz: rand(80, 620),
      life: rand(0.7, 1.8),
      size: rand(2.5, 6.5),
      color: colors[Math.floor(Math.random() * colors.length)],
      kind: "confetti",
      grav: 780,
      drag: 0.985
    });
  }
  for (let i = 0; i < 26; i++) {
    particle({
      x: rand(-FIELD.goalW / 2, FIELD.goalW / 2),
      y,
      z: rand(0, 90),
      vx: rand(-70, 70),
      vy: (top ? 1 : -1) * rand(20, 100),
      vz: rand(10, 70),
      life: rand(0.5, 1.2),
      size: rand(20, 50),
      color: scorer === 0 ? "rgba(54,240,255,0.2)" : "rgba(255,61,127,0.2)",
      kind: "puff",
      grav: -30
    });
  }
}

function updateParticles(dt) {
  const list = G.particles;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.life -= dt;
    if (p.life <= 0) {
      list.splice(i, 1);
      continue;
    }
    p.vz -= p.grav * dt;
    const drag = Math.pow(p.drag, dt * 60);
    p.vx *= drag;
    p.vy *= drag;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    p.rot += p.spin * dt;
    if (p.z < 0) {
      p.z = 0;
      if (p.kind === "confetti") {
        p.vz *= -0.35;
        p.vx *= 0.7;
        p.vy *= 0.7;
      } else {
        p.vz = 0;
        p.vx *= 0.8;
        p.vy *= 0.8;
      }
    }
  }
}

function updateTrail(dt) {
  G.trailClock -= dt;
  const speed = Math.hypot(G.ball.vx, G.ball.vy);
  if ((speed > 230 || G.ball.z > BALL_R + 8) && G.trailClock <= 0) {
    G.trailClock = 0.024;
    G.ballTrail.push({ x: G.ball.x, y: G.ball.y, z: G.ball.z, life: 0.34 });
    if (G.ballTrail.length > 20) G.ballTrail.shift();
  }
  for (let i = G.ballTrail.length - 1; i >= 0; i--) {
    G.ballTrail[i].life -= dt;
    if (G.ballTrail[i].life <= 0) G.ballTrail.splice(i, 1);
  }
}

function updateCar(car, input, dt) {
  car.hitCd = Math.max(0, car.hitCd - dt);
  car.flip = Math.max(0, car.flip - dt);
  const ix = clamp(input.x || 0, -1, 1);
  const iy = clamp(input.y || 0, -1, 1);
  const rawMag = Math.hypot(ix, iy);
  const mag = Math.min(1, rawMag);
  const boosting = !!input.boost && car.boost > 0.2;
  car.boosting = boosting;

  if (boosting) car.boost = Math.max(0, car.boost - 30 * dt);

  const air = !car.onGround;
  const cap = boosting ? car.boostSpeed : car.baseSpeed * 1.04;

  if (mag > 0.06) {
    const nx = ix / rawMag;
    const ny = iy / rawMag;
    const targetSpeed = cap * clamp(0.34 + mag * 0.82, 0.28, 1);
    const rate = (boosting ? 7.4 : 5.4) * (air ? 0.36 : 1);
    const k = 1 - Math.exp(-rate * dt);
    car.vx = lerp(car.vx, nx * targetSpeed, k);
    car.vy = lerp(car.vy, ny * targetSpeed, k);
    car.angle = angleLerp(car.angle, Math.atan2(ny, nx), 1 - Math.exp(-(air ? 3.2 : 10.5) * dt));
  } else {
    const f = Math.exp(-(air ? 0.6 : 3.1) * dt);
    car.vx *= f;
    car.vy *= f;
    if (boosting) {
      car.vx += Math.cos(car.angle) * 1080 * dt;
      car.vy += Math.sin(car.angle) * 1080 * dt;
    }
  }

  const sp = Math.hypot(car.vx, car.vy);
  const speedCap = boosting ? car.boostSpeed : car.baseSpeed * 1.08;
  if (sp > speedCap) {
    car.vx = (car.vx / sp) * speedCap;
    car.vy = (car.vy / sp) * speedCap;
  }

  // Jump / air flip
  if (input.jump) {
    if (car.onGround) {
      car.z = 0.5;
      car.vz = 460;
      car.onGround = false;
      car.airJumps = 1;
      Sound.jump();
      spawnSparks(car.x, car.y, 4, 4, car.isPlayer ? COLORS.cyan : COLORS.pink, 90);
    } else if (car.airJumps > 0) {
      car.airJumps--;
      car.vz = Math.max(car.vz, 255);
      car.flip = 0.32;
      const dashMag = Math.hypot(ix, iy);
      const dx = dashMag > 0.08 ? ix / dashMag : Math.cos(car.angle);
      const dy = dashMag > 0.08 ? iy / dashMag : Math.sin(car.angle);
      car.vx += dx * 340;
      car.vy += dy * 340;
      car.angle = Math.atan2(dy, dx);
      Sound.flip();
      spawnSparks(car.x, car.y, car.z, 10, car.isPlayer ? COLORS.cyan : COLORS.pink, 200);
    }
  }

  if (!car.onGround) {
    car.vz -= 1450 * dt;
    car.z += car.vz * dt;
    if (car.z <= 0) {
      const impact = -car.vz;
      car.z = 0;
      car.vz = 0;
      car.onGround = true;
      car.flip = 0;
      if (impact > 330) {
        G.shake = Math.max(G.shake, 2.4);
        spawnSparks(car.x, car.y, 2, 5, car.isPlayer ? COLORS.cyan : COLORS.pink, 100);
      }
    }
  } else {
    car.z = 0;
  }

  car.x += car.vx * dt;
  car.y += car.vy * dt;

  // Arena walls
  const bx = FIELD.w / 2 - 31;
  const by = FIELD.h / 2 - 36;
  if (car.x < -bx) {
    car.x = -bx;
    if (car.vx < 0) car.vx *= -0.32;
  } else if (car.x > bx) {
    car.x = bx;
    if (car.vx > 0) car.vx *= -0.32;
  }
  if (car.y < -by) {
    car.y = -by;
    if (car.vy < 0) car.vy *= -0.32;
  } else if (car.y > by) {
    car.y = by;
    if (car.vy > 0) car.vy *= -0.32;
  }

  // Boost exhaust
  if (boosting) {
    car.fx -= dt;
    if (car.fx <= 0) {
      car.fx = 0.018;
      const rx = car.x - Math.cos(car.angle) * CAR.l * 0.48;
      const ry = car.y - Math.sin(car.angle) * CAR.l * 0.48;
      particle({
        x: rx + rand(-4, 4),
        y: ry + rand(-4, 4),
        z: car.z + rand(4, 14),
        vx: -Math.cos(car.angle) * rand(50, 150) + car.vx * 0.08 + rand(-25, 25),
        vy: -Math.sin(car.angle) * rand(50, 150) + car.vy * 0.08 + rand(-25, 25),
        vz: rand(5, 60),
        life: rand(0.12, 0.3),
        size: rand(2.2, 5.5),
        color: Math.random() < 0.55 ? COLORS.gold : COLORS.cyanSoft,
        kind: "spark",
        grav: -30
      });
    }
  }
}

function updateBall(dt) {
  const b = G.ball;
  b.spin += Math.hypot(b.vx, b.vy) * dt * 0.055;

  if (b.z > BALL_R + 0.05 || b.vz > 0) {
    b.vz -= 1500 * dt;
    b.z += b.vz * dt;
  }

  if (b.z < BALL_R) {
    b.z = BALL_R;
    if (b.vz < -65) {
      b.vz = -b.vz * 0.6;
      if (b.vz > 280) spawnSparks(b.x, b.y, BALL_R, 4, COLORS.white, 90);
    } else {
      b.vz = 0;
    }
    const f = Math.exp(-1.05 * dt);
    b.vx *= f;
    b.vy *= f;
  } else {
    const f = Math.exp(-0.06 * dt);
    b.vx *= f;
    b.vy *= f;
  }

  const maxSpeed = 1650;
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > maxSpeed) {
    b.vx = (b.vx / sp) * maxSpeed;
    b.vy = (b.vy / sp) * maxSpeed;
  }

  b.x += b.vx * dt;
  b.y += b.vy * dt;

  const lim = FIELD.w / 2 - BALL_R;
  if (b.x < -lim) {
    b.x = -lim;
    b.vx = Math.abs(b.vx) * 0.83;
    spawnSparks(b.x, b.y, b.z, 4, COLORS.cyanSoft, 120);
  } else if (b.x > lim) {
    b.x = lim;
    b.vx = -Math.abs(b.vx) * 0.83;
    spawnSparks(b.x, b.y, b.z, 4, COLORS.cyanSoft, 120);
  }

  handlePosts();
  checkGoal();
}

function handlePosts() {
  const b = G.ball;
  const rr = BALL_R + 7;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const px = (sx * FIELD.goalW) / 2;
      const py = (sy * FIELD.h) / 2;
      const dx = b.x - px;
      const dy = b.y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < rr * rr && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        b.x = px + nx * rr;
        b.y = py + ny * rr;
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) {
          b.vx -= 1.72 * vn * nx;
          b.vy -= 1.72 * vn * ny;
          b.vx *= 0.82;
          b.vy *= 0.82;
          spawnSparks(px, py, b.z, 5, COLORS.gold, 160);
          Sound.hit(260);
        }
      }
    }
  }
}

function checkGoal() {
  const b = G.ball;
  const half = FIELD.h / 2;
  const mouth = Math.abs(b.x) < FIELD.goalW / 2 - 3;
  const underBar = b.z + BALL_R * 0.55 < FIELD.crossbar;

  if (b.y < -half) {
    if (mouth && underBar) {
      scoreGoal(0);
      return;
    }
    b.y = -half + BALL_R;
    if (b.vy < 0) b.vy = Math.abs(b.vy) * 0.8;
    spawnSparks(b.x, -half, b.z, 3, COLORS.pinkSoft, 90);
  } else if (b.y > half) {
    if (mouth && underBar) {
      scoreGoal(1);
      return;
    }
    b.y = half - BALL_R;
    if (b.vy > 0) b.vy = -Math.abs(b.vy) * 0.8;
    spawnSparks(b.x, half, b.z, 3, COLORS.cyanSoft, 90);
  }
}

function collideCarBall(car) {
  if (car.hitCd > 0 || G.phase !== "play") return;
  const b = G.ball;
  const dx = b.x - car.x;
  const dy = b.y - car.y;
  const rr = CAR.radius + BALL_R;
  const d2 = dx * dx + dy * dy;
  if (d2 > rr * rr || d2 < 0.001) return;
  if (b.z - BALL_R > car.z + 57) return;
  if (b.z + BALL_R < car.z) return;

  const d = Math.sqrt(d2);
  const nx = dx / d;
  const ny = dy / d;
  const overlap = rr - d;
  b.x += nx * overlap;
  b.y += ny * overlap;

  const cs = Math.hypot(car.vx, car.vy);
  const rel = (b.vx - car.vx) * nx + (b.vy - car.vy) * ny;
  const incoming = rel < -18;
  if (!incoming && cs < 45) {
    car.hitCd = 0.08;
    return;
  }

  let power = Math.max(0, -rel * 1.12) + cs * 0.58;
  if (car.boosting) power += 170;
  if (car.flip > 0) power += 300;
  if (car.z > 18) power += 95;
  power = clamp(power, 115, 1450);

  b.vx += nx * power + car.vx * 0.34;
  b.vy += ny * power + car.vy * 0.34;

  let lift = 30 + cs * 0.12;
  if (car.z > 12) lift += 130;
  if (car.flip > 0) lift += 210;
  b.vz = Math.max(b.vz, lift);

  const bs = Math.hypot(b.vx, b.vy);
  if (bs > 1650) {
    b.vx = (b.vx / bs) * 1650;
    b.vy = (b.vy / bs) * 1650;
  }

  car.hitCd = 0.075;
  car.vx *= 0.92;
  car.vy *= 0.92;
  G.lastTouch = { who: car.isPlayer ? "player" : "bot", power: Math.round(power), t: Number(G.time.toFixed(2)) };
  G.shake = Math.max(G.shake, clamp(power * 0.011, 0.5, 8));
  spawnHitParticles(car, b, power);
  Sound.hit(power);
}

function collideCars() {
  const p = G.player;
  const b = G.bot;
  const dx = b.x - p.x;
  const dy = b.y - p.y;
  const rr = CAR.radius * 1.72;
  const d2 = dx * dx + dy * dy;
  if (d2 > rr * rr || d2 < 0.01) return;
  if (Math.abs(b.z - p.z) > 50) return;
  const d = Math.sqrt(d2);
  const nx = dx / d;
  const ny = dy / d;
  const push = (rr - d) / 2;
  p.x -= nx * push;
  p.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;
  const rel = (b.vx - p.vx) * nx + (b.vy - p.vy) * ny;
  if (rel < 0) {
    const imp = -rel * 0.55;
    p.vx -= nx * imp;
    p.vy -= ny * imp;
    b.vx += nx * imp;
    b.vy += ny * imp;
    if (imp > 90) {
      spawnSparks((p.x + b.x) / 2, (p.y + b.y) / 2, Math.max(p.z, b.z) + 12, 6, COLORS.white, 170);
      Sound.hit(imp * 2.4);
      G.shake = Math.max(G.shake, 2.6);
    }
  }
}

function updatePads(dt) {
  const cars = [G.player, G.bot];
  for (const pad of G.pads) {
    pad.phase += dt;
    if (!pad.active) {
      pad.timer -= dt;
      if (pad.timer <= 0) pad.active = true;
      continue;
    }
    for (const car of cars) {
      if (car.z > 34) continue;
      const d = Math.hypot(car.x - pad.x, car.y - pad.y);
      if (d < (pad.big ? 45 : 38)) {
        car.boost = Math.min(100, car.boost + pad.amount);
        pad.active = false;
        pad.timer = pad.respawn;
        if (car.isPlayer) Sound.pickup(pad.big);
        for (let i = 0; i < (pad.big ? 16 : 8); i++) {
          const a = rand(0, TAU);
          particle({
            x: pad.x,
            y: pad.y,
            z: rand(4, 20),
            vx: Math.cos(a) * rand(30, 140),
            vy: Math.sin(a) * rand(30, 140),
            vz: rand(20, 120),
            life: rand(0.25, 0.6),
            size: rand(2, 5),
            color: pad.big ? COLORS.gold : COLORS.cyan,
            kind: "spark",
            grav: 220
          });
        }
        break;
      }
    }
  }
}

/* ---------------- Bot ---------------- */

function updateBotBrain(dt) {
  const b = G.bot;
  const ball = G.ball;
  const diff = DIFF[G.difficulty];

  b.think -= dt;
  if (b.think <= 0) {
    b.think = Math.max(0.055, diff.reaction * rand(0.72, 1.32));

    const px = ball.x + ball.vx * 0.22;
    const py = ball.y + ball.vy * 0.22;
    let gx = 0 - px;
    let gy = FIELD.h / 2 - py;
    const gd = Math.hypot(gx, gy) || 1;
    gx /= gd;
    gy /= gd;

    const behind = 132 + clamp(Math.hypot(ball.vx, ball.vy) * 0.055, 0, 55);
    let tx = px - gx * behind;
    let ty = py - gy * behind;

    const bx = ball.x - b.x;
    const by = ball.y - b.y;
    const bd = Math.hypot(bx, by) || 1;
    const align = (bx * gx + by * gy) / bd;

    if (bd < 310 && align > 0.08) {
      tx = ball.x + gx * 112;
      ty = ball.y + gy * 112;
    }

    const dangerY = -FIELD.h / 2 + 330;
    const danger = ball.y < dangerY && ball.y < b.y + 140;
    if (danger) {
      if (b.y < ball.y - 18) {
        tx = ball.x;
        ty = ball.y + 175;
      } else {
        const side = b.x >= ball.x ? 1 : -1;
        tx = ball.x + side * 95;
        ty = ball.y - 150;
      }
    }

    tx += rand(-1, 1) * diff.error * (danger ? 0.35 : 1);
    ty += rand(-1, 1) * diff.error * (danger ? 0.35 : 1);
    b.targetX = clamp(tx, -FIELD.w / 2 + 55, FIELD.w / 2 - 55);
    b.targetY = clamp(ty, -FIELD.h / 2 + 44, FIELD.h / 2 - 70);

    const targetD = Math.hypot(b.targetX - b.x, b.targetY - b.y);
    b.wantBoost = b.boost > 3 && Math.random() < diff.boostChance && (targetD > 285 || bd < 320);

    if (!b.onGround) {
      if (b.airJumps > 0 && ball.z > 145 && bd < 145 && Math.random() < diff.jump * 0.4) {
        b.jumpQueued = true;
      }
    } else if (ball.z > 95 && ball.z < 260 && bd < 150 && Math.random() < diff.jump * 0.2) {
      b.jumpQueued = true;
    }
  }

  const dx = b.targetX - b.x;
  const dy = b.targetY - b.y;
  const d = Math.hypot(dx, dy);
  let ix = d > 0.5 ? dx / d : 0;
  let iy = d > 0.5 ? dy / d : 0;

  // Tiny human-ish wobble so it isn't perfectly robotic.
  ix += Math.sin(G.time * 2.3 + 1.7) * 0.035;
  iy += Math.cos(G.time * 1.9 + 0.4) * 0.035;

  const jump = b.jumpQueued;
  b.jumpQueued = false;
  return { x: ix, y: iy, boost: b.wantBoost && b.boost > 0.5, jump };
}

/* ---------------- Simulation step ---------------- */

function updateTilt(dt) {
  const t = G.tilt;
  if (!t.enabled) {
    t.value = 0;
    return;
  }
  t.value = lerp(t.value, t.target, 1 - Math.exp(-9 * dt));
}

function step(dt) {
  if (G.shake > 0) G.shake = Math.max(0, G.shake - 46 * dt);
  if (G.flash > 0) G.flash = Math.max(0, G.flash - dt * 1.8);
  if (G.phase !== "paused") updateTilt(dt);

  if (G.phase === "menu") {
    G.ball.spin += dt * 0.35;
    G.ball.z = BALL_R + Math.sin(G.time * 1.4) * 16;
    updateParticles(dt);
    return;
  }

  if (G.phase === "countdown") {
    updateParticles(dt);
    G.countdown -= dt;
    const n = Math.ceil(G.countdown);
    if (n > 0 && n !== G.lastCount) {
      G.lastCount = n;
      announce(String(n), "", "", 760);
      Sound.count();
    }
    if (G.countdown <= 0) {
      G.phase = "play";
      G.lastCount = 0;
      announce("GO!", "", "go", 720);
      Sound.go();
      G.shake = 2.6;
      updateTag();
      Sound.setBoost(false);
    }
    return;
  }

  if (G.phase === "goal") {
    updateParticles(dt);
    G.goalTimer -= dt;
    if (G.goalTimer <= 0) {
      if (G.score[0] >= 3 || G.score[1] >= 3) finishMatch();
      else beginKickoff();
    }
    return;
  }

  if (G.phase === "gameover") {
    updateParticles(dt);
    if (G.endDelay > 0) {
      G.endDelay -= dt;
      if (G.endDelay <= 0) showEnd();
    }
    return;
  }

  if (G.phase !== "play") return;

  const pInput = getPlayerInput();
  const bInput = updateBotBrain(dt);
  updateCar(G.player, pInput, dt);
  updateCar(G.bot, bInput, dt);
  collideCars();
  updateBall(dt);
  if (G.phase === "play") {
    collideCarBall(G.player);
    collideCarBall(G.bot);
  }
  updatePads(dt);
  updateParticles(dt);
  updateTrail(dt);
  const wantBoostSound = G.player.boosting && G.sound;
  if (wantBoostSound !== G.boostSound) {
    G.boostSound = wantBoostSound;
    Sound.setBoost(wantBoostSound);
  }
  G.lastUI.tag = "";
}

/* ---------------- Rendering ---------------- */

function roundRectPath(x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function roundRectFill(x, y, w, h, r, fillStyle) {
  roundRectPath(x, y, w, h, r);
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

function popText(text, x, y, size, color, align = "center", weight = "400") {
  ctx.font = `${size}px Bungee, "Arial Black", sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawBackground() {
  ctx.fillStyle = view.bg || "#050a10";
  ctx.fillRect(0, 0, view.w, view.h);

  const r = view.rect;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h * 0.46;
  const rad = Math.max(view.w, view.h) * 0.7;
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
  glow.addColorStop(0, "rgba(42,110,130,0.16)");
  glow.addColorStop(0.42, "rgba(22,52,70,0.08)");
  glow.addColorStop(1, "rgba(3,6,10,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, view.w, view.h);

  const topGlow = ctx.createRadialGradient(view.w * 0.18, r.y + r.h * 0.08, 0, view.w * 0.18, r.y + r.h * 0.08, view.w * 0.72);
  topGlow.addColorStop(0, "rgba(255,61,127,0.07)");
  topGlow.addColorStop(1, "rgba(255,61,127,0)");
  ctx.fillStyle = topGlow;
  ctx.fillRect(0, 0, view.w, view.h);

  const botGlow = ctx.createRadialGradient(view.w * 0.82, r.y + r.h * 0.9, 0, view.w * 0.82, r.y + r.h * 0.9, view.w * 0.72);
  botGlow.addColorStop(0, "rgba(54,240,255,0.07)");
  botGlow.addColorStop(1, "rgba(54,240,255,0)");
  ctx.fillStyle = botGlow;
  ctx.fillRect(0, 0, view.w, view.h);
}

function drawStadium() {
  const f = view.rect;
  const pad = Math.max(24, f.w * 0.07);

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 14;
  roundRectFill(f.x - pad, f.y - pad, f.w + pad * 2, f.h + pad * 2, 26, "rgba(7,16,25,0.92)");
  ctx.restore();

  roundRectPath(f.x - pad, f.y - pad, f.w + pad * 2, f.h + pad * 2, 26);
  ctx.strokeStyle = "rgba(126,205,222,0.11)";
  ctx.lineWidth = 1;
  ctx.stroke();

  roundRectPath(f.x - pad * 0.5, f.y - pad * 0.5, f.w + pad, f.h + pad, 17);
  ctx.fillStyle = "rgba(10,22,32,0.92)";
  ctx.fill();
  ctx.strokeStyle = "rgba(126,205,222,0.08)";
  ctx.stroke();

  // Crowd dots
  const t = G.time;
  for (const c of view.crowd) {
    const x = SX(c.x);
    const y = SY(c.y);
    if (x < -10 || x > view.w + 10 || y < -10 || y > view.h + 10) continue;
    const tw = 0.58 + 0.42 * Math.sin(t * c.speed + c.phase);
    ctx.globalAlpha = c.a * tw;
    ctx.fillStyle = c.c;
    ctx.beginPath();
    ctx.arc(x, y, c.r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Floodlight pools
  const lg = ctx.createRadialGradient(f.x + f.w * 0.2, f.y - pad, 0, f.x + f.w * 0.2, f.y - pad, f.w * 0.65);
  lg.addColorStop(0, "rgba(180,245,255,0.06)");
  lg.addColorStop(1, "rgba(180,245,255,0)");
  ctx.fillStyle = lg;
  ctx.fillRect(f.x - pad, f.y - pad * 2, f.w + pad * 2, f.h + pad * 2);

  const rg = ctx.createRadialGradient(f.x + f.w * 0.8, f.y - pad, 0, f.x + f.w * 0.8, f.y - pad, f.w * 0.65);
  rg.addColorStop(0, "rgba(255,130,170,0.05)");
  rg.addColorStop(1, "rgba(255,130,170,0)");
  ctx.fillStyle = rg;
  ctx.fillRect(f.x - pad, f.y - pad * 2, f.w + pad * 2, f.h + pad * 2);
}

function drawField() {
  const f = view.rect;
  const W = FIELD.w;
  const H = FIELD.h;
  const sc = view.scale;

  ctx.save();
  roundRectPath(f.x, f.y, f.w, f.h, 11);
  ctx.clip();

  const floor = ctx.createLinearGradient(0, f.y, 0, f.y + f.h);
  floor.addColorStop(0, "#12343c");
  floor.addColorStop(0.48, "#0d2830");
  floor.addColorStop(1, "#091c23");
  ctx.fillStyle = floor;
  ctx.fillRect(f.x, f.y, f.w, f.h);

  // Mowed stripes
  const stripes = 16;
  for (let i = 0; i < stripes; i++) {
    if (i % 2 === 0) continue;
    const yy = f.y + (i / stripes) * f.h;
    ctx.fillStyle = "rgba(210,255,255,0.018)";
    ctx.fillRect(f.x, yy, f.w, f.h / stripes);
  }

  // Team end tints
  const topTint = ctx.createLinearGradient(0, f.y, 0, f.y + f.h * 0.44);
  topTint.addColorStop(0, "rgba(255,61,127,0.11)");
  topTint.addColorStop(1, "rgba(255,61,127,0)");
  ctx.fillStyle = topTint;
  ctx.fillRect(f.x, f.y, f.w, f.h * 0.44);

  const botTint = ctx.createLinearGradient(0, f.y + f.h * 0.56, 0, f.y + f.h);
  botTint.addColorStop(0, "rgba(54,240,255,0)");
  botTint.addColorStop(1, "rgba(54,240,255,0.1)");
  ctx.fillStyle = botTint;
  ctx.fillRect(f.x, f.y + f.h * 0.56, f.w, f.h * 0.44);

  // Field markings
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(208,250,255,0.38)";
  ctx.lineWidth = Math.max(1.2, 3.6 * sc);
  ctx.shadowColor = "rgba(90,240,255,0.28)";
  ctx.shadowBlur = 7;

  const line = (x1, y1, x2, y2) => {
    ctx.beginPath();
    ctx.moveTo(SX(x1), SY(y1));
    ctx.lineTo(SX(x2), SY(y2));
    ctx.stroke();
  };

  line(0, -H / 2, 0, H / 2);

  ctx.beginPath();
  ctx.arc(SX(0), SY(0), 118 * sc, 0, TAU);
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(208,250,255,0.38)";
  ctx.beginPath();
  ctx.arc(SX(0), SY(0), 4.2 * sc, 0, TAU);
  ctx.fill();

  // Goal boxes
  const boxW = 452;
  const boxD = 186;
  for (const side of [-1, 1]) {
    const yLine = (side * H) / 2;
    const yBox = yLine - side * boxD;
    ctx.strokeStyle = "rgba(208,250,255,0.3)";
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(SX(-boxW / 2), SY(yLine));
    ctx.lineTo(SX(-boxW / 2), SY(yBox));
    ctx.lineTo(SX(boxW / 2), SY(yBox));
    ctx.lineTo(SX(boxW / 2), SY(yLine));
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(SX(0), SY(yLine - side * 238), 132 * sc, side === -1 ? 0.18 : Math.PI + 0.18, side === -1 ? Math.PI - 0.18 : TAU - 0.18);
    ctx.stroke();

    // Penalty spot
    ctx.fillStyle = "rgba(208,250,255,0.3)";
    ctx.beginPath();
    ctx.arc(SX(0), SY(yLine - side * 238), 3.2 * sc, 0, TAU);
    ctx.fill();
  }

  // Corner arcs
  ctx.strokeStyle = "rgba(208,250,255,0.22)";
  ctx.shadowBlur = 0;
  const corners = [
    [-W / 2, -H / 2, 0, Math.PI / 2],
    [W / 2, -H / 2, Math.PI / 2, Math.PI],
    [W / 2, H / 2, Math.PI, Math.PI * 1.5],
    [-W / 2, H / 2, Math.PI * 1.5, TAU]
  ];
  for (const [cx, cy, a0, a1] of corners) {
    ctx.beginPath();
    ctx.arc(SX(cx), SY(cy), 34 * sc, a0, a1);
    ctx.stroke();
  }

  // Center emblem
  ctx.globalAlpha = 0.075;
  ctx.strokeStyle = "#d8feff";
  ctx.lineWidth = 2 * sc;
  ctx.beginPath();
  ctx.arc(SX(0), SY(0), 176 * sc, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 0.055;
  popText("1V1", SX(0), SY(0) + 2, 44 * sc, "#e9ffff");
  ctx.globalAlpha = 1;

  // Inner border
  ctx.strokeStyle = "rgba(176,250,255,0.36)";
  ctx.lineWidth = Math.max(1, 2.2 * sc);
  ctx.shadowColor = "rgba(54,240,255,0.45)";
  ctx.shadowBlur = 10;
  ctx.strokeRect(f.x + 0.5, f.y + 0.5, f.w - 1, f.h - 1);

  ctx.restore();
}

function drawGoalNet(side) {
  const yLine = (side * FIELD.h) / 2;
  const yOut = yLine + side * FIELD.goalDepth;
  const x1 = -FIELD.goalW / 2;
  const x2 = FIELD.goalW / 2;
  const team = side === -1 ? COLORS.pink : COLORS.cyan;
  const sc = view.scale;
  const top = SY(yOut);
  const bottom = SY(yLine);
  const left = SX(x1);
  const right = SX(x2);

  ctx.save();
  const grad = ctx.createLinearGradient(0, top, 0, bottom);
  grad.addColorStop(0, "rgba(3,8,12,0.97)");
  grad.addColorStop(0.72, side === -1 ? "rgba(55,10,26,0.9)" : "rgba(6,36,43,0.9)");
  grad.addColorStop(1, side === -1 ? "rgba(120,16,52,0.42)" : "rgba(10,88,100,0.42)");
  ctx.fillStyle = grad;
  ctx.fillRect(left, Math.min(top, bottom), right - left, Math.abs(bottom - top));

  // Net grid
  ctx.strokeStyle = side === -1 ? "rgba(255,150,185,0.22)" : "rgba(140,250,255,0.22)";
  ctx.lineWidth = Math.max(0.6, 1 * sc);
  ctx.beginPath();
  for (let x = x1 + 12; x < x2; x += 17) {
    ctx.moveTo(SX(x), bottom);
    ctx.lineTo(SX(x), top);
  }
  const steps = 5;
  for (let i = 1; i < steps; i++) {
    const y = yLine + (side * FIELD.goalDepth * i) / steps;
    ctx.moveTo(left, SY(y));
    ctx.lineTo(right, SY(y));
  }
  ctx.stroke();

  // Mouth light
  ctx.shadowColor = team;
  ctx.shadowBlur = 18;
  ctx.strokeStyle = team;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = Math.max(1.5, 2.5 * sc);
  ctx.beginPath();
  ctx.moveTo(left, bottom);
  ctx.lineTo(right, bottom);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawGoalFrame(side) {
  const yLine = (side * FIELD.h) / 2;
  const team = side === -1 ? COLORS.pink : COLORS.cyan;
  const sc = view.scale;
  const postH = FIELD.crossbar;
  const baseY = SY(yLine);
  const topY = SY(yLine, postH);
  const left = SX(-FIELD.goalW / 2);
  const right = SX(FIELD.goalW / 2);

  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = team;
  const postW = Math.max(2.2, 7 * sc);
  const posts = [[left, baseY, left, topY], [right, baseY, right, topY], [left, topY, right, topY]];

  // Layered glow strokes instead of shadowBlur for cheaper per-frame rendering
  ctx.globalAlpha = 0.18;
  ctx.lineWidth = postW * 2.6;
  for (const [x1, y1, x2, y2] of posts) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.42;
  ctx.lineWidth = postW * 1.5;
  for (const [x1, y1, x2, y2] of posts) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.lineWidth = postW;

  for (const x of [left, right]) {
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.lineTo(x, topY);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(left, topY);
  ctx.lineTo(right, topY);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.58)";
  ctx.lineWidth = Math.max(0.8, 1.6 * sc);
  ctx.beginPath();
  ctx.moveTo(left, topY + 1);
  ctx.lineTo(right, topY + 1);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.9)";
  for (const x of [left, right]) {
    ctx.beginPath();
    ctx.arc(x, baseY, Math.max(2, 3.2 * sc), 0, TAU);
    ctx.fill();
  }

  // Goal-line glow
  const g = ctx.createLinearGradient(0, baseY - 8, 0, baseY + 8);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.5, side === -1 ? "rgba(255,61,127,0.18)" : "rgba(54,240,255,0.18)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(left, baseY - 8, right - left, 16);
  ctx.restore();
}

/* ---------------- Draw entities ---------------- */

function drawPads() {
  const sc = view.scale;
  for (const pad of G.pads) {
    const x = SX(pad.x);
    const y = SY(pad.y);
    const base = (pad.big ? 17 : 12) * sc;
    if (!pad.active) {
      const fade = clamp(1 - pad.timer / pad.respawn, 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.12 + fade * 0.14;
      ctx.strokeStyle = pad.big ? COLORS.gold : COLORS.cyan;
      ctx.lineWidth = Math.max(0.8, 1.2 * sc);
      ctx.beginPath();
      ctx.arc(x, y, base * 0.72, 0, TAU);
      ctx.stroke();
      ctx.restore();
      continue;
    }
    const pulse = 1 + Math.sin(G.time * 3.2 + pad.phase) * 0.08;
    const color = pad.big ? COLORS.gold : COLORS.cyan;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, base * 2.6);
    glow.addColorStop(0, pad.big ? "rgba(255,209,102,0.32)" : "rgba(54,240,255,0.24)");
    glow.addColorStop(1, pad.big ? "rgba(255,209,102,0)" : "rgba(54,240,255,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, base * 2.6, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pulse, pulse * 0.8);
    ctx.rotate(Math.PI / 6);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const px = Math.cos(a) * base;
      const py = Math.sin(a) * base;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = pad.big ? "rgba(255,209,102,0.18)" : "rgba(54,240,255,0.14)";
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.16;
    ctx.lineWidth = Math.max(4, 7 * sc);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = Math.max(1, 1.6 * sc);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = color;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1, base * 0.16), 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawTrail() {
  const sc = view.scale;
  if (!G.ballTrail.length) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const t of G.ballTrail) {
    const a = clamp(t.life / 0.34, 0, 1);
    const r = BALL_R * sc * (0.32 + a * 0.42);
    ctx.globalAlpha = a * 0.13;
    ctx.fillStyle = "#bffcff";
    ctx.beginPath();
    ctx.arc(SX(t.x), SY(t.y, t.z), r, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawShadows() {
  const sc = view.scale;
  const p = G.player;
  const b = G.bot;
  const ball = G.ball;

  for (const car of [p, b]) {
    const s = carScale(car.y);
    ctx.save();
    ctx.translate(SX(car.x) + car.z * 0.12, SY(car.y, 0) + car.z * 0.1);
    ctx.rotate(car.angle);
    ctx.globalAlpha = 0.34 / (1 + car.z / 240);
    ctx.fillStyle = "#000";
    roundRectPath(-CAR.l * s * 0.52, -CAR.w * s * 0.54, CAR.l * s * 1.04, CAR.w * s * 1.08, CAR.w * s * 0.3);
    ctx.fill();
    ctx.restore();
  }

  const r = BALL_R * sc;
  const alpha = 0.38 / (1 + ball.z / 260);
  ctx.save();
  ctx.translate(SX(ball.x) + ball.z * 0.1, SY(ball.y, 0) + ball.z * 0.08);
  ctx.scale(1, 0.46);
  const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.4);
  sg.addColorStop(0, `rgba(0,0,0,${alpha})`);
  sg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.4, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function carScale(y) {
  return view.scale * (1 + (y / (FIELD.h / 2)) * 0.045);
}

function drawCar(car) {
  const s = carScale(car.y);
  const px = SX(car.x);
  const py = SY(car.y, car.z);
  const L = CAR.l * s;
  const W = CAR.w * s;
  const team = car.isPlayer ? COLORS.cyan : COLORS.pink;

  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(car.angle);

  // Ground underglow
  if (car.z < 22) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const ug = ctx.createRadialGradient(0, 0, 0, 0, 0, L * 0.72);
    ug.addColorStop(0, car.isPlayer ? "rgba(54,240,255,0.17)" : "rgba(255,61,127,0.16)");
    ug.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = ug;
    ctx.beginPath();
    ctx.ellipse(0, 0, L * 0.72, W * 0.8, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // Boost flame
  if (car.boosting) {
    const flick = 0.72 + Math.sin(G.time * 38 + car.x) * 0.2 + Math.random() * 0.16;
    const len = L * (0.34 + flick * 0.24);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const fg = ctx.createLinearGradient(-L * 0.46, 0, -L * 0.46 - len, 0);
    fg.addColorStop(0, "rgba(255,248,200,0.95)");
    fg.addColorStop(0.45, "rgba(255,190,70,0.8)");
    fg.addColorStop(1, "rgba(255,70,30,0)");
    ctx.fillStyle = fg;
    for (const oy of [-W * 0.22, W * 0.22]) {
      ctx.beginPath();
      ctx.moveTo(-L * 0.44, oy - W * 0.09);
      ctx.quadraticCurveTo(-L * 0.44 - len * 0.55, oy, -L * 0.44 - len, oy);
      ctx.quadraticCurveTo(-L * 0.44 - len * 0.55, oy, -L * 0.44, oy + W * 0.09);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // Wheels
  ctx.fillStyle = "#04080b";
  ctx.strokeStyle = "rgba(190,230,240,0.16)";
  ctx.lineWidth = Math.max(0.5, 0.8 * s);
  const wheelW = L * 0.2;
  const wheelH = W * 0.16;
  for (const wx of [-L * 0.29, L * 0.29]) {
    for (const wy of [-W * 0.49, W * 0.49]) {
      roundRectPath(wx - wheelW / 2, wy - wheelH / 2, wheelW, wheelH, wheelH * 0.4);
      ctx.fill();
      ctx.stroke();
    }
  }

  // Chassis
  const bg = ctx.createLinearGradient(0, -W / 2, 0, W / 2);
  bg.addColorStop(0, "#344854");
  bg.addColorStop(0.42, "#1a2b37");
  bg.addColorStop(0.78, "#0d1922");
  bg.addColorStop(1, "#071017");
  ctx.fillStyle = bg;
  ctx.strokeStyle = team;
  roundRectPath(-L / 2, -W / 2, L, W, W * 0.34);
  ctx.fill();
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = Math.max(4, 6 * s);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = Math.max(0.9, 1.6 * s);
  ctx.stroke();

  // Rear spoiler
  ctx.fillStyle = "#0a1219";
  roundRectPath(-L * 0.54, -W * 0.55, L * 0.1, W * 1.1, W * 0.08);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.13)";
  ctx.lineWidth = Math.max(0.5, 0.7 * s);
  ctx.stroke();

  // Hood / front
  const hood = ctx.createLinearGradient(L * 0.1, 0, L * 0.52, 0);
  hood.addColorStop(0, car.isPlayer ? "rgba(54,240,255,0.22)" : "rgba(255,61,127,0.22)");
  hood.addColorStop(1, "rgba(255,255,255,0.03)");
  ctx.fillStyle = hood;
  roundRectPath(L * 0.05, -W * 0.43, L * 0.41, W * 0.86, W * 0.2);
  ctx.fill();

  // Center stripe
  ctx.fillStyle = car.isPlayer ? "rgba(157,251,255,0.32)" : "rgba(255,155,189,0.3)";
  roundRectPath(-L * 0.31, -W * 0.07, L * 0.72, W * 0.14, W * 0.05);
  ctx.fill();

  // Windshield
  const wg = ctx.createLinearGradient(0, -W * 0.3, 0, W * 0.3);
  wg.addColorStop(0, "#0b2029");
  wg.addColorStop(0.45, "#164451");
  wg.addColorStop(1, "#07151c");
  ctx.fillStyle = wg;
  ctx.beginPath();
  ctx.moveTo(-L * 0.1, -W * 0.33);
  ctx.lineTo(L * 0.17, -W * 0.25);
  ctx.lineTo(L * 0.2, W * 0.25);
  ctx.lineTo(-L * 0.1, W * 0.33);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(157,251,255,0.16)";
  ctx.lineWidth = Math.max(0.5, 0.8 * s);
  ctx.stroke();

  // Headlights
  ctx.fillStyle = "rgba(225,255,255,0.88)";
  for (const hy of [-W * 0.3, W * 0.3]) {
    ctx.beginPath();
    ctx.ellipse(L * 0.43, hy, L * 0.045, W * 0.055, 0, 0, TAU);
    ctx.fill();
  }

  // Flip energy ring
  if (car.flip > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = clamp(car.flip * 3, 0, 1) * 0.75;
    ctx.strokeStyle = team;
    ctx.beginPath();
    ctx.ellipse(0, 0, L * 0.7, W * 0.62, 0, 0, TAU);
    ctx.lineWidth = Math.max(5, 8 * s);
    ctx.globalAlpha *= 0.25;
    ctx.stroke();
    ctx.globalAlpha = clamp(car.flip * 3, 0, 1) * 0.75;
    ctx.lineWidth = Math.max(1, 2 * s);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();

  // Nameplate
  if (G.phase !== "menu") {
    drawNameplate(car, px, py - L * 0.62 - 13);
  }
}

function drawNameplate(car, x, y) {
  const label = car.isPlayer ? "YOU" : "BOT";
  const color = car.isPlayer ? COLORS.cyan : COLORS.pink;
  ctx.save();
  ctx.font = '800 7px Archivo, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const w = ctx.measureText(label).width + 12;
  ctx.globalAlpha = 0.82;
  roundRectFill(x - w / 2, y - 6, w, 12, 6, "rgba(2,8,13,0.72)");
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.42;
  ctx.lineWidth = 0.8;
  roundRectPath(x - w / 2, y - 6, w, 12, 6);
  ctx.stroke();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = color;
  ctx.fillText(label, x, y + 0.5);
  ctx.restore();
}

function drawBall() {
  const b = G.ball;
  const sc = view.scale;
  const r = BALL_R * sc;
  const x = SX(b.x);
  const y = SY(b.y, b.z);

  ctx.save();
  ctx.translate(x, y);
  // Soft halo behind the ball (cheaper than shadowBlur)
  const halo = ctx.createRadialGradient(0, 0, r * 0.8, 0, 0, r * 1.9);
  halo.addColorStop(0, "rgba(157,251,255,0.24)");
  halo.addColorStop(1, "rgba(157,251,255,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.9, 0, TAU);
  ctx.fill();

  const g = ctx.createRadialGradient(-r * 0.38, -r * 0.44, r * 0.06, 0, 0, r * 1.08);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.3, "#e5ffff");
  g.addColorStop(0.66, "#a8dfe3");
  g.addColorStop(1, "#4f7d83");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();

  // Panels
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.985, 0, TAU);
  ctx.clip();
  ctx.rotate(b.spin);
  ctx.strokeStyle = "rgba(28,72,80,0.48)";
  ctx.lineWidth = Math.max(0.7, r * 0.07);
  ctx.beginPath();
  for (let i = 0; i <= 5; i++) {
    const a = (i / 5) * TAU - Math.PI / 2;
    const px = Math.cos(a) * r * 0.36;
    const py = Math.sin(a) * r * 0.36;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.36, Math.sin(a) * r * 0.36);
    ctx.lineTo(Math.cos(a) * r * 1.05, Math.sin(a) * r * 1.05);
    ctx.stroke();
  }
  ctx.restore();

  // Rim + highlight
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = Math.max(0.5, r * 0.045);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.96, 0, TAU);
  ctx.stroke();

  const hl = ctx.createRadialGradient(-r * 0.35, -r * 0.42, 0, -r * 0.35, -r * 0.42, r * 0.55);
  hl.addColorStop(0, "rgba(255,255,255,0.82)");
  hl.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = hl;
  ctx.beginPath();
  ctx.arc(-r * 0.35, -r * 0.42, r * 0.55, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawParticles() {
  const sc = view.scale;
  ctx.save();
  for (const p of G.particles) {
    const lifeT = clamp(p.life / p.max, 0, 1);
    const x = SX(p.x);
    const y = SY(p.y, p.z);
    if (x < -40 || x > view.w + 40 || y < -40 || y > view.h + 40) continue;

    if (p.kind === "spark") {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = lifeT * 0.9;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(0.6, p.size * sc * 0.8);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(SX(p.x - p.vx * 0.022), SY(p.y - p.vy * 0.022, p.z - p.vz * 0.022));
      ctx.stroke();
    } else if (p.kind === "confetti") {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = lifeT;
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(p.rot);
      ctx.fillRect(-p.size * sc * 0.5, -p.size * sc * 0.28, p.size * sc, p.size * sc * 0.56);
      ctx.restore();
    } else {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = lifeT * 0.55;
      const rr = p.size * sc * (1.4 - lifeT * 0.4);
      const pg = ctx.createRadialGradient(x, y, 0, x, y, rr);
      pg.addColorStop(0, p.color);
      pg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawCrowdLights() {
  const t = G.time;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < view.crowd.length; i += 7) {
    const c = view.crowd[i];
    const x = SX(c.x);
    const y = SY(c.y);
    if (x < -8 || x > view.w + 8 || y < -8 || y > view.h + 8) continue;
    const tw = Math.max(0, Math.sin(t * c.speed * 1.8 + c.phase));
    if (tw < 0.15) continue;
    ctx.globalAlpha = tw * 0.5;
    ctx.fillStyle = c.c;
    ctx.beginPath();
    ctx.arc(x, y, c.r * 1.25, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/* ---------------- Frame ---------------- */

function render() {
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  if (!view.rect.w) return;

  ctx.save();
  if (G.shake > 0.2) {
    ctx.clearRect(0, 0, view.w, view.h);
    ctx.translate(rand(-1, 1) * G.shake * 0.55, rand(-1, 1) * G.shake * 0.4);
  }

  ctx.drawImage(staticCanvas, 0, 0, view.w, view.h);
  drawCrowdLights();
  drawPads();
  drawTrail();
  drawShadows();

  const ents = [
    { y: G.player.y + G.player.z * 0.35, draw: () => drawCar(G.player) },
    { y: G.bot.y + G.bot.z * 0.35, draw: () => drawCar(G.bot) },
    { y: G.ball.y + G.ball.z * 0.22, draw: () => drawBall() }
  ];
  ents.sort((a, b) => a.y - b.y);
  for (const e of ents) e.draw();

  drawGoalFrame(-1);
  drawGoalFrame(1);
  drawParticles();
  ctx.restore();

  if (G.flash > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.55, G.flash * 0.6);
    ctx.fillStyle = G.flashColor;
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.restore();
  }
}

/* ---------------- UI per frame ---------------- */

function updateUI(force = false) {
  if (!G.player) return;

  updateTag();
  const active = ["play", "countdown", "goal"].includes(G.phase);
  showControls(active);

  const bv = Math.round(G.player.boost);
  if (force || bv !== G.lastUI.boost) {
    G.lastUI.boost = bv;
    el.boostValue.textContent = String(bv);
    el.boostRing.style.setProperty("--boost", (bv / 100).toFixed(3));
  }

  const tiltOn = G.tilt.enabled && active;
  el.tiltMeter.classList.toggle("is-hidden", !tiltOn);
  if (tiltOn) {
    el.tiltDot.style.transform = `translateX(${(G.tilt.value * 58).toFixed(1)}px)`;
  }
}

/* ---------------- Main loop ---------------- */

let lastFrame = performance.now();
let accumulator = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastFrame) / 1000;
  lastFrame = now;
  if (!Number.isFinite(dt)) dt = 0;
  dt = Math.min(dt, 0.1);
  G.time += dt;

  if (G.phase !== "paused") {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED && steps < 10) {
      step(FIXED);
      accumulator -= FIXED;
      steps++;
    }
    if (steps >= 10) accumulator = 0;
  } else {
    accumulator = 0;
  }

  render();
  updateUI();
}

function init() {
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!isIOS) el.iosHint.style.display = "none";

  resize();
  resetWorld();
  syncSoundUI();
  syncTiltUI();
  updateScoreUI();
  showHUD(false);
  showControls(false);
  updateTiltMeterVisibility();
  requestAnimationFrame(frame);
}

window.addEventListener("resize", () => {
  resize();
  resetJoystick();
});

if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => {
    rebuildStatic();
    render();
  }).catch(() => {});
}

init();

window.__rocketDuel = {
  G,
  view,
  startMatch,
  beginKickoff,
  scoreGoal,
  finishMatch,
  toMenu,
  setPaused,
  toggleTilt,
  resize,
  render,
  updateUI,
  step
};




