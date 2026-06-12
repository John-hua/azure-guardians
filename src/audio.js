// 程序化音频：用 Web Audio API 合成音效与背景音乐（无需音频文件）。
let ctx = null;
let master = null;
let musicGain = null;
let sfxGain = null;
let musicStarted = false;
let musicStep = 0;
let musicTimer = null;

function ensure() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
  musicGain = ctx.createGain(); musicGain.gain.value = 0.2; musicGain.connect(master);
  sfxGain = ctx.createGain(); sfxGain.gain.value = 0.85; sfxGain.connect(master);
  preloadSkillSfx();
}

export function resumeAudio() {
  ensure();
  if (ctx.state === 'suspended') ctx.resume();
}

function tone({ freq = 440, dur = 0.1, type = 'square', vol = 0.3, attack = 0.005, slideTo = null, dest = null }) {
  ensure();
  const out = dest || sfxGain;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g); g.connect(out);
  osc.start(t); osc.stop(t + dur + 0.02);
}

function noise({ dur = 0.3, vol = 0.4, lpStart = 2000, lpEnd = 200 }) {
  ensure();
  const t = ctx.currentTime;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.setValueAtTime(lpStart, t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(lpEnd, 1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(lp); lp.connect(g); g.connect(sfxGain);
  src.start(t); src.stop(t + dur);
}

// ===== 史诗感合成工具 (技能特效专用) =====
// 失谐振荡器堆叠 — 3 个同型振荡器 ±cents 失谐, 过低通, 厚实电影感铺底
function epicLayer({ freq = 220, dur = 0.5, vol = 0.2, type = 'sawtooth', detune = 14, slideTo = null, attack = 0.02, lp = 2400, lpEnd = null }) {
  ensure();
  const t = ctx.currentTime;
  const filter = ctx.createBiquadFilter(); filter.type = 'lowpass';
  filter.frequency.setValueAtTime(lp, t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(lpEnd != null ? lpEnd : lp * 0.6, 60), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  filter.connect(g); g.connect(sfxGain);
  [-detune, 0, detune].forEach((cents) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.detune.setValueAtTime(cents, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), t + dur);
    o.connect(filter);
    o.start(t); o.stop(t + dur + 0.02);
  });
}

// 低频 sub 轰 — 电影 trailer 的"咚", 音高下坠
function subBoom({ from = 120, to = 38, dur = 0.45, vol = 0.4 }) {
  ensure();
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(sfxGain);
  o.start(t); o.stop(t + dur + 0.02);
}

// 带通气声 — whoosh / 撕裂 / 炸裂, 比纯低通更"空气感"
function airBurst({ dur = 0.4, vol = 0.25, bpStart = 600, bpEnd = 3000, q = 1.2, delay = 0 }) {
  ensure();
  const t = ctx.currentTime + delay;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q;
  bp.frequency.setValueAtTime(bpStart, t);
  bp.frequency.exponentialRampToValueAtTime(Math.max(bpEnd, 1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp); bp.connect(g); g.connect(sfxGain);
  src.start(t); src.stop(t + dur);
}

export const Sfx = {
  attack() { tone({ freq: 620, slideTo: 220, dur: 0.12, type: 'sawtooth', vol: 0.22 }); },
  hit() { tone({ freq: 220, slideTo: 90, dur: 0.1, type: 'square', vol: 0.28 }); noise({ dur: 0.08, vol: 0.18, lpStart: 3000, lpEnd: 500 }); },
  explosion() { noise({ dur: 0.5, vol: 0.5, lpStart: 1200, lpEnd: 70 }); tone({ freq: 120, slideTo: 40, dur: 0.4, type: 'sine', vol: 0.4 }); },
  footstep() { noise({ dur: 0.06, vol: 0.1, lpStart: 1400, lpEnd: 500 }); },
  coin() { tone({ freq: 880, dur: 0.05, type: 'square', vol: 0.18 }); setTimeout(() => tone({ freq: 1320, dur: 0.08, type: 'square', vol: 0.18 }), 45); },
  arrow() { tone({ freq: 1100, slideTo: 360, dur: 0.14, type: 'sawtooth', vol: 0.14 }); },
  hurt() { tone({ freq: 170, slideTo: 60, dur: 0.24, type: 'square', vol: 0.33 }); },
  upgrade() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone({ freq: f, dur: 0.12, type: 'square', vol: 0.24 }), i * 70)); },
  waveStart() { [392, 523, 659].forEach((f, i) => setTimeout(() => tone({ freq: f, dur: 0.16, type: 'square', vol: 0.28 }), i * 90)); },
  death() { [392, 311, 233, 147].forEach((f, i) => setTimeout(() => tone({ freq: f, dur: 0.22, type: 'sawtooth', vol: 0.3 }), i * 130)); },

  // —— 主动技能音效 (皇家起义卡通明亮风:三角/方波层叠,中频饱满,短促有颗粒) ——

  // U 剑气波 — "嗖!" 一刀挥出 + 金属振铃 (类似 RR 大兵挥剑)
  swordWave() {
    // 中频主体:square slide (中音"咝")
    tone({ freq: 540, slideTo: 340, dur: 0.14, type: 'square', vol: 0.2 });
    // 高频金属点睛
    tone({ freq: 1320, slideTo: 880, dur: 0.1, type: 'triangle', vol: 0.16 });
    // 风噪 (短而清亮)
    noise({ dur: 0.09, vol: 0.1, lpStart: 5000, lpEnd: 2200 });
    setTimeout(() => tone({ freq: 1760, dur: 0.06, type: 'triangle', vol: 0.1 }), 60);
  },

  // 自动剑环 — 一圈剑气:RR 大锤旋的那种"叮叮叮"
  swordNova() {
    // 三连快速上行的明亮叮(像马刺/号角)
    [659, 880, 1175].forEach((f, i) => {
      setTimeout(() => tone({ freq: f, dur: 0.09, type: 'square', vol: 0.18 }), i * 30);
    });
    // 中频实体
    setTimeout(() => tone({ freq: 440, slideTo: 220, dur: 0.18, type: 'triangle', vol: 0.15 }), 20);
  },

  // J 重击 — 卡通木块大锤砸落 (RR Wall Brakers / 巨人砸)
  heavy() {
    // 沉重 thud (低频 + 木质感方波)
    tone({ freq: 110, dur: 0.08, type: 'square', vol: 0.28 });
    setTimeout(() => {
      // 撞击噪点 — 中频 / 短促,不要爆炸那种长低频拖尾
      noise({ dur: 0.14, vol: 0.34, lpStart: 2400, lpEnd: 400 });
      // 余震 sine,但很短
      tone({ freq: 60, slideTo: 30, dur: 0.12, type: 'sine', vol: 0.32 });
      // 高频"啪"加颗粒感
      tone({ freq: 880, dur: 0.04, type: 'square', vol: 0.15 });
    }, 60);
  },

  // F 横扫斩 — 重剑大刀挥过去的"咔嚓" + 金属振铃 (RR 国王挥剑感)
  slash() {
    // 高频起手"嚓" — 短促犀利
    tone({ freq: 1760, slideTo: 880, dur: 0.07, type: 'square', vol: 0.22 });
    // 中频实体 — 厚重感
    tone({ freq: 660, slideTo: 220, dur: 0.16, type: 'triangle', vol: 0.24 });
    // 风噪 — 划过空气
    noise({ dur: 0.12, vol: 0.16, lpStart: 6000, lpEnd: 1200 });
    // 后段金属余韵
    setTimeout(() => {
      tone({ freq: 1320, dur: 0.08, type: 'triangle', vol: 0.12 });
      tone({ freq: 880, dur: 0.06, type: 'square', vol: 0.1 });
    }, 90);
  },

  // K 冲刺斩 — 极短风切 + "唰" (RR 骑士冲刺感)
  dash() {
    // 高频快速 sweep,极短
    tone({ freq: 1320, slideTo: 440, dur: 0.08, type: 'triangle', vol: 0.2 });
    noise({ dur: 0.08, vol: 0.16, lpStart: 6000, lpEnd: 1800 });
    // 击中尾音 (后面 80ms 出现,模拟刀过)
    setTimeout(() => tone({ freq: 880, slideTo: 330, dur: 0.06, type: 'square', vol: 0.16 }), 60);
  },

  // I 战吼 — 号角集结,RR 国王召唤兵 (上扬铜管感,不是低吼)
  warCry() {
    // 主号角:中频 square 上升 (类似喇叭)
    tone({ freq: 220, slideTo: 440, dur: 0.32, type: 'square', vol: 0.22 });
    // 同步五度 (440 → 880) 营造和声
    setTimeout(() => tone({ freq: 330, slideTo: 660, dur: 0.28, type: 'square', vol: 0.15 }), 60);
    // 顶端亮音收尾
    setTimeout(() => tone({ freq: 880, dur: 0.16, type: 'triangle', vol: 0.18 }), 220);
    // 轻噪点缀 (像旗帜啪嗒)
    noise({ dur: 0.06, vol: 0.08, lpStart: 4000, lpEnd: 1500 });
  },

  // 火球 — "嗖" 飞出 + 火星颗粒 (RR 法师投火)
  fireball() {
    // 主体明亮"咻"
    tone({ freq: 880, slideTo: 330, dur: 0.22, type: 'triangle', vol: 0.22 });
    tone({ freq: 660, slideTo: 220, dur: 0.18, type: 'square', vol: 0.12 });
    // 火苗噪点
    noise({ dur: 0.2, vol: 0.16, lpStart: 3500, lpEnd: 800 });
    // 高频火星
    setTimeout(() => tone({ freq: 1760, dur: 0.04, type: 'triangle', vol: 0.1 }), 80);
  },

  // 圣光环 持续 tick — 像 RR 治疗法师的小铃
  aura() {
    tone({ freq: 1568, dur: 0.06, type: 'triangle', vol: 0.07 });
    setTimeout(() => tone({ freq: 2093, dur: 0.04, type: 'triangle', vol: 0.05 }), 25);
  },

  // 🌟 圣光爆 — 明亮神圣轰击: 轻 sub + 高亮和弦绽放 + 1s 钟鸣圣辉长尾
  holyBurst() {
    if (playSkillSfx('holyburst')) return;
    subBoom({ from: 150, to: 55, dur: 0.3, vol: 0.22 });
    // 大调和弦 — 滤波保持明亮不收死
    epicLayer({ freq: 523, dur: 0.8, vol: 0.13, type: 'sawtooth', lp: 5200, lpEnd: 2800, attack: 0.02 });
    epicLayer({ freq: 659, dur: 0.85, vol: 0.1, type: 'sawtooth', lp: 5600, lpEnd: 3000, attack: 0.03 });
    epicLayer({ freq: 784, dur: 0.95, vol: 0.1, type: 'triangle', lp: 7000, lpEnd: 4500, attack: 0.04 });
    // 空气炸开 (扫向高频)
    airBurst({ dur: 0.4, vol: 0.2, bpStart: 1500, bpEnd: 7000, q: 0.8 });
    // 钟鸣圣辉长尾 — 双层下行, 1 秒余韵
    setTimeout(() => tone({ freq: 2093, slideTo: 1568, dur: 0.9, type: 'sine', vol: 0.09, attack: 0.04 }), 100);
    setTimeout(() => tone({ freq: 1568, slideTo: 1047, dur: 1.0, type: 'triangle', vol: 0.06, attack: 0.08 }), 220);
  },

  // 💜 奥术冲击 — 魔刃撕裂: 明亮俯冲 + 长撕裂 + 0.8s 金属振铃尾
  arcaneBolt() {
    if (playSkillSfx('arcanebolt')) return;
    // 俯冲保留, 但滤波提亮
    epicLayer({ freq: 420, slideTo: 110, dur: 0.5, vol: 0.15, type: 'sawtooth', detune: 22, lp: 3400, lpEnd: 1600 });
    // 撕裂空气拉长
    airBurst({ dur: 0.55, vol: 0.22, bpStart: 800, bpEnd: 6000, q: 1.3 });
    subBoom({ from: 95, to: 48, dur: 0.25, vol: 0.16 });
    // 金属振铃长尾 (双层, 0.8s)
    setTimeout(() => tone({ freq: 1568, slideTo: 1175, dur: 0.7, type: 'triangle', vol: 0.09, attack: 0.02 }), 120);
    setTimeout(() => tone({ freq: 2349, slideTo: 1568, dur: 0.8, type: 'sine', vol: 0.05, attack: 0.05 }), 200);
  },

  // ⚡ 天罚雷 — 亮裂雷击: 高频炸裂 + 适度 sub + 1.2s 雷尾滚动衰减
  thunderBolt() {
    if (playSkillSfx('thunderbolt')) return;
    // 炸裂更亮更脆
    airBurst({ dur: 0.15, vol: 0.32, bpStart: 9000, bpEnd: 1500, q: 0.7 });
    subBoom({ from: 150, to: 40, dur: 0.45, vol: 0.3 });
    // 雷腹滚动 — 滤波不收太低, 保持轰鸣的"亮芯"
    noise({ dur: 1.1, vol: 0.18, lpStart: 1600, lpEnd: 150 });
    // 远处回响二段 (更晚更长)
    setTimeout(() => noise({ dur: 0.8, vol: 0.1, lpStart: 900, lpEnd: 100 }), 300);
    // 电弧嘶鸣长尾
    setTimeout(() => tone({ freq: 3200, slideTo: 1100, dur: 0.5, type: 'sawtooth', vol: 0.05, attack: 0.02 }), 50);
  },

  // 🔥 烈焰柱 — 火山喷发: 亮 whoosh 升腾 + 咆哮长尾 + 1s 余焰
  flamePillar() {
    if (playSkillSfx('flamepillar')) return;
    subBoom({ from: 115, to: 45, dur: 0.4, vol: 0.26 });
    // 升腾 whoosh — 扫得更高更亮
    airBurst({ dur: 0.55, vol: 0.24, bpStart: 400, bpEnd: 3200, q: 0.9 });
    // 火焰咆哮 — 滤波提亮, 时长拉到 1s
    epicLayer({ freq: 110, slideTo: 180, dur: 1.0, vol: 0.12, type: 'sawtooth', detune: 30, lp: 1800, lpEnd: 700, attack: 0.05 });
    // 余焰气流长尾
    setTimeout(() => airBurst({ dur: 0.7, vol: 0.1, bpStart: 2200, bpEnd: 900, q: 1.0 }), 250);
    // 余烬噼啪
    setTimeout(() => airBurst({ dur: 0.08, vol: 0.1, bpStart: 4500, bpEnd: 2500, q: 2 }), 350);
    setTimeout(() => airBurst({ dur: 0.06, vol: 0.07, bpStart: 5500, bpEnd: 3000, q: 2 }), 550);
  },

  // ❄️ 寒冰爆 — 寒霜降临: 轻 sub + 玻璃绽裂 + 1s 冰晶风铃长尾
  frostFall() {
    if (playSkillSfx('frostfall')) return;
    subBoom({ from: 105, to: 50, dur: 0.28, vol: 0.2 });
    // 冰晶绽裂 — 高频全开
    epicLayer({ freq: 1568, dur: 0.6, vol: 0.1, type: 'triangle', detune: 18, lp: 9000, lpEnd: 5000, attack: 0.008 });
    epicLayer({ freq: 2093, dur: 0.55, vol: 0.08, type: 'triangle', detune: 24, lp: 10000, lpEnd: 6000, attack: 0.012 });
    // 凛冽气流长尾
    airBurst({ dur: 0.8, vol: 0.15, bpStart: 6000, bpEnd: 9500, q: 0.6 });
    // 冰晶风铃下行 — 三粒错落, 1s 余韵
    setTimeout(() => tone({ freq: 2349, slideTo: 1760, dur: 0.6, type: 'sine', vol: 0.07, attack: 0.03 }), 150);
    setTimeout(() => tone({ freq: 1760, slideTo: 1319, dur: 0.7, type: 'sine', vol: 0.06, attack: 0.04 }), 320);
    setTimeout(() => tone({ freq: 1319, slideTo: 988, dur: 0.8, type: 'sine', vol: 0.05, attack: 0.05 }), 520);
  },

  // 晶体拾取 — RR 金币那种愉悦"叮叮"
  gem() {
    tone({ freq: 1175, dur: 0.05, type: 'square', vol: 0.2 });
    setTimeout(() => tone({ freq: 1568, dur: 0.07, type: 'square', vol: 0.18 }), 40);
    setTimeout(() => tone({ freq: 2093, dur: 0.05, type: 'triangle', vol: 0.1 }), 100);
  },

  // H 回血 — 圣光降临的小琶音 (大调三和弦上行)
  heal() {
    [523, 659, 784, 1047].forEach((f, i) => {
      setTimeout(() => tone({ freq: f, dur: 0.13, type: 'triangle', vol: 0.18 }), i * 55);
    });
    // 顶端 sparkle
    setTimeout(() => tone({ freq: 1568, dur: 0.1, type: 'triangle', vol: 0.12 }), 240);
  },
};

// 背景音乐：远征英雄主题 — D 大调起势,带号角颂歌感
// 节奏稳如行军 (STEP_DUR 0.2s),旋律有上下起伏,主歌 32 step + 副歌 32 step 共 ~13s 循环
const MELODY = [
  // 主歌:小步号角 (D5 → F5 → A5)
  587, 0, 698, 0, 880, 880, 0, 698, 880, 0, 1047, 0, 880, 0, 0, 0,
  784, 0, 698, 0, 587, 587, 0, 698, 587, 0, 494, 0, 440, 0, 0, 0,
  // 副歌:扬声唱出 (拉高八度)
  880, 0, 1047, 0, 1175, 1175, 0, 1047, 1175, 0, 1397, 0, 1175, 0, 0, 0,
  1047, 0, 880, 0, 784, 698, 0, 587, 698, 0, 587, 0, 440, 0, 0, 0,
];
const BASS = [
  // 行军低音 — 强拍 D / A 切换
  147, 0, 147, 0, 110, 0, 110, 0, 147, 0, 147, 0, 196, 0, 196, 0,
  147, 0, 147, 0, 110, 0, 110, 0, 220, 0, 220, 0, 147, 0, 147, 0,
  147, 0, 147, 0, 110, 0, 110, 0, 147, 0, 147, 0, 196, 0, 196, 0,
  147, 0, 196, 0, 220, 0, 196, 0, 165, 0, 147, 0, 147, 0, 110, 0,
];
const STEP_DUR = 0.2;

function musicTick() {
  if (!musicStarted) return;
  const m = MELODY[musicStep % MELODY.length];
  const b = BASS[musicStep % BASS.length];
  if (m) tone({ freq: m, dur: 0.2, type: 'triangle', vol: 0.2, dest: musicGain });
  if (b) tone({ freq: b, dur: 0.34, type: 'square', vol: 0.12, dest: musicGain });
  musicStep += 1;
  musicTimer = setTimeout(musicTick, STEP_DUR * 1000);
}

export function startMusic() {
  ensure();
  // 检查持久化的"音乐开关"和"当前曲目"
  if (!isMusicEnabled()) return; // 关着就不启动
  const trackId = getCurrentTrackId();
  if (trackId === '__builtin__') {
    _startBuiltin();
  } else {
    _startCustom(trackId);
  }
}

function _startBuiltin() {
  if (musicStarted) return;
  _stopCustom();
  musicStarted = true;
  musicStep = 0;
  musicTick();
}

function _stopBuiltin() {
  musicStarted = false;
  if (musicTimer) { clearTimeout(musicTimer); musicTimer = null; }
}

// 自定义音乐:用 HTMLAudioElement 播放 (从 IDB Blob 创建 blob URL)
let customAudio = null;
let customBlobUrl = null;
async function _startCustom(trackId) {
  _stopBuiltin();
  if (customAudio) return; // 已经在播了
  try {
    const { loadBlob } = await import('./storage.js?v=3');
    const blob = await loadBlob(trackId);
    if (!blob) { _startBuiltin(); return; }
    customBlobUrl = URL.createObjectURL(blob);
    customAudio = document.createElement('audio');
    customAudio.src = customBlobUrl;
    customAudio.loop = true;
    customAudio.volume = 0.5;
    await customAudio.play().catch(() => {});
  } catch (e) {
    _startBuiltin();
  }
}

function _stopCustom() {
  if (customAudio) {
    try { customAudio.pause(); } catch (e) {}
    customAudio = null;
  }
  if (customBlobUrl) {
    URL.revokeObjectURL(customBlobUrl);
    customBlobUrl = null;
  }
}

export function stopMusic() {
  _stopBuiltin();
  _stopCustom();
}

// ===== 音乐开关 & 当前曲目持久化 =====
const ENABLED_KEY = 'tinyswords.music.enabled';
const CURRENT_KEY = 'tinyswords.music.current';

export function isMusicEnabled() {
  try {
    const v = localStorage.getItem(ENABLED_KEY);
    return v === null ? true : v === '1'; // 默认开
  } catch (e) { return true; }
}
export function setMusicEnabled(on) {
  try { localStorage.setItem(ENABLED_KEY, on ? '1' : '0'); } catch (e) {}
  if (on) startMusic();
  else stopMusic();
}
export function getCurrentTrackId() {
  try { return localStorage.getItem(CURRENT_KEY) || '__builtin__'; } catch (e) { return '__builtin__'; }
}
export function setCurrentTrackId(id) {
  try { localStorage.setItem(CURRENT_KEY, id); } catch (e) {}
  // 立刻切换 (若开关开着)
  if (isMusicEnabled()) {
    stopMusic();
    startMusic();
  }
}

export function toggleMute() {
  ensure();
  master.gain.value = master.gain.value > 0 ? 0 : 0.5;
  _sfxMuted = master.gain.value === 0;
  return master.gain.value === 0;
}

// ===== 技能 MP3 音效 (HTMLAudio, 与合成并存) =====
const SKILL_SFX_KEYS = ['holyburst', 'arcanebolt', 'thunderbolt', 'flamepillar', 'frostfall'];
const _skillSamples = {};
let _skillSfxLoaded = false;
let _sfxMuted = false;
function preloadSkillSfx() {
  if (_skillSfxLoaded) return;
  _skillSfxLoaded = true;
  SKILL_SFX_KEYS.forEach((k) => {
    const a = new Audio(`assets/audio/skills/sfx-${k}.mp3`);
    a.preload = 'auto';
    _skillSamples[k] = a;
  });
}
export function playSkillSfx(key, vol = 0.5) {
  if (_sfxMuted) return true;
  const base = _skillSamples[key];
  if (!base) return false;
  try {
    const a = base.cloneNode();
    a.volume = vol;
    const pr = a.play();
    if (pr && pr.catch) pr.catch(() => {});
    return true;
  } catch (e) { return false; }
}
