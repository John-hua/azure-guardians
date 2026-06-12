// 音乐库面板 — 内建程序合成 + 用户上传 MP3/OGG/WAV/M4A
// 支持:开关音乐总闸 / 切曲 / 上传 / 删除 / 试听

import { isMusicEnabled, setMusicEnabled, getCurrentTrackId, setCurrentTrackId } from './audio.js?v=music1';
import { saveBlob, loadBlob, deleteBlob, idbKeys, saveKV, loadKV } from './storage.js?v=3';

const LIB_KEY = 'tinyswords.music.library.v1';
const TRACK_PREFIX = 'idb-music:';

const BUILTIN = { id: '__builtin__', name: '🎺 远征英雄主题 (内建合成)', builtin: true };

async function _getLibrary() {
  const raw = await loadKV(LIB_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch (e) { return []; }
}
async function _saveLibrary(lib) {
  await saveKV(LIB_KEY, JSON.stringify(lib));
}

export function openMusicPicker(scene) {
  if (document.getElementById('music-picker')) return;
  const wrap = document.createElement('div');
  wrap.id = 'music-picker';
  wrap.innerHTML = `
    <style>
      #music-picker {
        position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 200;
        display: flex; align-items: center; justify-content: center;
        font: 13px/1.4 monospace; color: #fff;
      }
      #music-picker .panel {
        background: #1a0e08; border: 3px solid #c2a35e; border-radius: 6px;
        padding: 18px; min-width: 500px; max-width: 640px; max-height: 86vh; overflow-y: auto;
      }
      #music-picker h2 { margin: 0 0 6px; color: #ffe070; font-size: 18px; }
      #music-picker .hint { color: #aaa; font-size: 11px; margin: 4px 0 8px; }
      #music-picker .switch-row {
        display: flex; align-items: center; gap: 12px;
        padding: 10px 14px; background: #2a1d10; border: 2px solid #6b5836; border-radius: 4px;
        margin-bottom: 12px;
      }
      #music-picker .switch {
        display: inline-block; width: 44px; height: 24px; border-radius: 12px;
        background: #555; position: relative; cursor: pointer; transition: background 0.15s;
      }
      #music-picker .switch.on { background: #4fbf66; }
      #music-picker .switch::after {
        content: ''; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px;
        background: #fff; border-radius: 50%; transition: left 0.15s;
      }
      #music-picker .switch.on::after { left: 22px; }
      #music-picker .switch-label { flex: 1; font-weight: bold; }
      #music-picker .list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
      #music-picker .track {
        position: relative;
        display: flex; align-items: center; gap: 10px;
        padding: 10px 12px; background: #2a1d10; border: 2px solid #6b5836; border-radius: 4px;
        cursor: pointer; transition: border-color 0.15s;
      }
      #music-picker .track:hover { border-color: #ffd07a; }
      #music-picker .track.sel { border-color: #4fd6ff; background: #1c3550; }
      #music-picker .track .name { flex: 1; color: #ffe9b6; }
      #music-picker .track .badge { background: #6b5836; color: #1a0e08; font-size: 9px; padding: 1px 5px; border-radius: 2px; font-weight: bold; }
      #music-picker .track .x {
        width: 22px; height: 22px; border-radius: 11px;
        background: #c25e5e; color: #fff; border: 0;
        font: bold 12px monospace; cursor: pointer; padding: 0;
      }
      #music-picker .upload {
        border: 2px dashed #c2a35e; padding: 14px; text-align: center;
        border-radius: 4px; cursor: pointer; background: #2a1d10; color: #ffd07a;
      }
      #music-picker .upload:hover { background: #3a2810; }
      #music-picker .status { min-height: 22px; color: #ffe070; margin-top: 10px; font-size: 12px; }
      #music-picker .actions { display: flex; gap: 8px; margin-top: 12px; }
      #music-picker button.action {
        flex: 1; background: #c2a35e; color: #1a0e08; border: 0;
        padding: 8px 12px; font: bold 13px monospace; border-radius: 3px; cursor: pointer;
      }
      #music-picker button.action:hover { background: #ffd07a; }
    </style>
    <div class="panel">
      <h2>🎵 背景音乐</h2>
      <div class="hint">支持 MP3 / OGG / WAV / M4A;文件不要超过 20MB。上传后存 IDB,刷新页面也在。</div>
      <div class="switch-row">
        <span class="switch-label">音乐总开关</span>
        <div class="switch" id="music-switch"></div>
      </div>
      <div class="list" id="music-list"></div>
      <label class="upload" id="music-upload-label">
        <input type="file" id="music-upload-file" accept="audio/mpeg,audio/ogg,audio/wav,audio/mp4,audio/x-m4a,.mp3,.ogg,.wav,.m4a" style="display:none">
        <div>📤 上传音乐文件</div>
        <div style="font-size:11px;color:#aaa;margin-top:4px">点击或拖拽 MP3 / OGG / WAV / M4A 到这里</div>
      </label>
      <div class="status" id="music-status"></div>
      <div class="actions">
        <button class="action" id="music-close">关闭</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);

  const list = wrap.querySelector('#music-list');
  const status = wrap.querySelector('#music-status');
  const fileInput = wrap.querySelector('#music-upload-file');
  const sw = wrap.querySelector('#music-switch');
  const label = wrap.querySelector('#music-upload-label');

  // 开关
  const refreshSwitch = () => {
    sw.classList.toggle('on', isMusicEnabled());
  };
  sw.onclick = () => {
    const next = !isMusicEnabled();
    setMusicEnabled(next);
    refreshSwitch();
    status.textContent = next ? '🎵 音乐已开启' : '🔇 音乐已关闭';
  };
  refreshSwitch();

  // 拖拽上传
  ['dragenter', 'dragover'].forEach((ev) => {
    label.addEventListener(ev, (e) => { e.preventDefault(); label.style.background = '#3a2810'; });
  });
  ['dragleave', 'drop'].forEach((ev) => {
    label.addEventListener(ev, (e) => { e.preventDefault(); label.style.background = ''; });
  });
  label.addEventListener('drop', (e) => {
    const f = e.dataTransfer && e.dataTransfer.files[0];
    if (f) handleUpload(f);
  });
  fileInput.onchange = (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) handleUpload(f);
    e.target.value = '';
  };

  async function handleUpload(file) {
    if (file.size > 20 * 1024 * 1024) {
      status.textContent = `⚠ 文件 ${(file.size / 1048576).toFixed(1)} MB 太大 (上限 20MB)`;
      return;
    }
    status.textContent = `💾 正在存 ${file.name} 到 IDB...`;
    const lib = await _getLibrary();
    const usedNums = new Set(lib.map((e) => parseInt((e.id || '').replace(/^idb-music:m/, ''), 10)).filter((n) => !isNaN(n)));
    let n = 1; while (usedNums.has(n)) n++;
    const id = `${TRACK_PREFIX}m${n}`;
    const name = prompt('给这首音乐起个名字', file.name.replace(/\.(mp3|ogg|wav|m4a)$/i, '')) || file.name;
    try {
      await saveBlob(id, file);
      lib.push({ id, name, size: file.size, type: file.type || '' });
      await _saveLibrary(lib);
      status.textContent = `✓ ${name} 已加入,选中即可播放`;
      await render();
    } catch (e) {
      console.error(e);
      status.textContent = `⚠ 保存失败: ${e.message || e}`;
    }
  }

  async function render() {
    list.innerHTML = '';
    const lib = await _getLibrary();
    const curId = getCurrentTrackId();
    const all = [BUILTIN, ...lib];
    all.forEach((entry) => {
      const row = document.createElement('div');
      row.className = 'track' + (entry.id === curId ? ' sel' : '');
      row.innerHTML = `
        <span class="name">${entry.name}</span>
        ${entry.builtin ? '<span class="badge">内建</span>' : ''}
        ${entry.builtin ? '' : '<button class="x" title="删除">×</button>'}
      `;
      row.onclick = (ev) => {
        if (ev.target.closest('.x')) return;
        setCurrentTrackId(entry.id);
        status.textContent = `▶ 已切换:${entry.name}`;
        render();
      };
      const xb = row.querySelector('.x');
      if (xb) xb.onclick = async (ev) => {
        ev.stopPropagation();
        if (!confirm(`删除「${entry.name}」?`)) return;
        await deleteBlob(entry.id);
        const next = (await _getLibrary()).filter((e) => e.id !== entry.id);
        await _saveLibrary(next);
        if (curId === entry.id) setCurrentTrackId('__builtin__');
        status.textContent = `🗑 已删除:${entry.name}`;
        render();
      };
      list.appendChild(row);
    });
  }

  wrap.querySelector('#music-close').onclick = () => wrap.remove();
  render();
  return wrap;
}

export function closeMusicPicker() {
  const w = document.getElementById('music-picker');
  if (w) w.remove();
}
