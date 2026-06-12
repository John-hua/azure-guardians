// 通用"角色库"弹窗 — HomeScene / WorldScene 都可调起。
// 用法:
//   import { openHeroPicker } from './hero-picker.js';
//   openHeroPicker(scene, {
//     onPick(entry) { /* 切换玩家形态 */ },
//   });
//
// onPick 在用户点击某条目时同步触发(包括新上传/删除当前后回落到默认),参数是被选中的 entry。

import {
  getLibrary, getCurrentId, setCurrent, addCustomFromGif,
  removeEntry, renameEntry, getPreviewSource, getEntry,
} from './config/hero.js?v=3';

export function openHeroPicker(scene, opts = {}) {
  const onPick = typeof opts.onPick === 'function' ? opts.onPick : null;
  // 已开 → 不重复
  let wrap = document.getElementById('hero-picker');
  if (wrap) return wrap;
  wrap = document.createElement('div');
  wrap.id = 'hero-picker';
  wrap.innerHTML = `
    <style>
      #hero-picker {
        position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 200;
        display: flex; align-items: center; justify-content: center;
        font: 13px/1.4 monospace; color: #fff;
      }
      #hero-picker .panel {
        background: #1a0e08; border: 3px solid #c2a35e; border-radius: 6px;
        padding: 18px; min-width: 520px; max-width: 720px; max-height: 86vh; overflow-y: auto;
      }
      #hero-picker h2 { margin: 0 0 8px; color: #ffe070; font-size: 18px; }
      #hero-picker .hint { color: #aaa; font-size: 11px; margin: 4px 0 8px; }
      #hero-picker .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
      #hero-picker .card {
        position: relative; border: 2px solid #6b5836; border-radius: 4px;
        background: #2a1d10; padding: 10px 8px 8px; cursor: pointer; text-align: center;
        transition: border-color 0.15s; min-height: 150px;
      }
      #hero-picker .card:hover { border-color: #ffd07a; }
      #hero-picker .card.sel { border-color: #4fd6ff; background: #1c3550; }
      #hero-picker .card.add { border-style: dashed; color: #ffd07a; display: flex; align-items: center; justify-content: center; }
      #hero-picker .card.add .plus { font-size: 28px; line-height: 1; }
      #hero-picker .card.add .lbl { color: #ffd07a; }
      #hero-picker .preview {
        width: 96px; height: 96px; margin: 0 auto 6px;
        background-color: #0d0805; background-repeat: no-repeat;
        image-rendering: pixelated;
        border: 1px solid #4a3a22; border-radius: 2px;
      }
      #hero-picker .lbl {
        color: #ffe9b6; font-weight: bold; font-size: 12px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 2px;
      }
      #hero-picker .badge {
        position: absolute; top: 4px; left: 4px;
        background: #6b5836; color: #1a0e08; font-size: 9px; padding: 1px 4px;
        border-radius: 2px; font-weight: bold;
      }
      #hero-picker .card .x {
        position: absolute; top: 4px; right: 4px;
        width: 18px; height: 18px; border-radius: 9px;
        background: #c25e5e; color: #fff; border: 0;
        font: bold 11px monospace; cursor: pointer; padding: 0;
        display: none;
      }
      #hero-picker .card.custom:hover .x { display: block; }
      #hero-picker .card .rename {
        position: absolute; bottom: 4px; right: 4px;
        width: 18px; height: 18px; border-radius: 2px;
        background: #6b5836; color: #fff; border: 0;
        font: 10px monospace; cursor: pointer; padding: 0;
        display: none;
      }
      #hero-picker .card.custom:hover .rename { display: block; }
      #hero-picker .status { min-height: 22px; color: #ffe070; margin-top: 10px; font-size: 12px; }
      #hero-picker .actions { display: flex; gap: 8px; margin-top: 12px; }
      #hero-picker button.action {
        flex: 1; background: #c2a35e; color: #1a0e08; border: 0;
        padding: 8px 12px; font: bold 13px monospace; border-radius: 3px; cursor: pointer;
      }
      #hero-picker button.action:hover { background: #ffd07a; }
    </style>
    <div class="panel">
      <h2>🦸 角色库</h2>
      <div class="hint">点击卡片切换形态。鼠标悬停在自定义卡片上可重命名 / 删除。+ 卡片用来上传新 GIF (192×192 推荐,前 32 帧;不限战士,任意角色或怪物都行)。</div>
      <div class="grid" id="hero-grid"></div>
      <div class="status" id="hero-status"></div>
      <div class="actions">
        <button class="action" id="hero-close">关闭</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);

  const grid = wrap.querySelector('#hero-grid');
  const status = wrap.querySelector('#hero-status');

  const fileInput = document.createElement('input');
  fileInput.type = 'file'; fileInput.accept = 'image/gif'; fileInput.style.display = 'none';
  wrap.appendChild(fileInput);

  const applyChoice = (entry, msg) => {
    if (scene.game && scene.game.registry) scene.game.registry.set('heroPrefix', entry.prefix);
    status.textContent = msg || `✓ 已选: ${entry.name}`;
    if (onPick) {
      try { onPick(entry); } catch (e) { console.warn(e); }
    }
  };

  const render = () => {
    grid.innerHTML = '';
    const lib = getLibrary();
    const curId = getCurrentId();
    lib.forEach((entry) => {
      const card = document.createElement('div');
      card.className = 'card ' + (entry.kind === 'custom' ? 'custom' : 'builtin');
      if (entry.id === curId) card.classList.add('sel');
      const src = getPreviewSource(entry);
      const previewStyle = src
        ? `background-image:url(${src.url}); background-size: auto 96px; background-position: 0 0;`
        : '';
      card.innerHTML = `
        <div class="preview" style="${previewStyle}"></div>
        <div class="lbl" title="${entry.name}">${entry.name}</div>
        ${entry.kind === 'builtin' ? '<span class="badge">内建</span>' : ''}
        ${entry.kind === 'custom' ? '<button class="x" title="删除">×</button><button class="rename" title="重命名">✎</button>' : ''}
      `;
      card.onclick = (e) => {
        if (e.target.closest('.x') || e.target.closest('.rename')) return;
        setCurrent(entry.id);
        applyChoice(entry);
        render();
      };
      const xb = card.querySelector('.x');
      if (xb) xb.onclick = (e) => {
        e.stopPropagation();
        if (!confirm(`删除 ${entry.name}?`)) return;
        removeEntry(scene, entry.id);
        const fallback = getEntry(getCurrentId()) || getLibrary()[0];
        applyChoice(fallback, `🗑 已删除: ${entry.name}`);
        render();
      };
      const rb = card.querySelector('.rename');
      if (rb) rb.onclick = (e) => {
        e.stopPropagation();
        const name = prompt('新名字', entry.name);
        if (!name) return;
        renameEntry(entry.id, name);
        status.textContent = `✎ 已重命名`;
        render();
      };
      grid.appendChild(card);
    });

    const add = document.createElement('div');
    add.className = 'card add';
    add.innerHTML = `<div><div class="plus">+</div><div class="lbl">上传新 GIF</div></div>`;
    add.onclick = () => fileInput.click();
    grid.appendChild(add);
  };

  fileInput.onchange = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const name = prompt('给这个角色起个名字', file.name.replace(/\.gif$/i, '')) || file.name;
    status.textContent = '🎞 正在拆帧... (大 GIF 需几秒)';
    try {
      const { entry, totalFrames } = await addCustomFromGif(scene, file, name);
      setCurrent(entry.id);
      applyChoice(entry, `✓ ${entry.name} 已加入并选中 (${entry.frameCount}/${totalFrames} 帧, ${entry.frameRate} fps)`);
      render();
    } catch (err) {
      console.error(err);
      status.textContent = `⚠ ${err.message || '加载失败'}`;
    } finally {
      e.target.value = '';
    }
  };

  wrap.querySelector('#hero-close').onclick = () => wrap.remove();
  render();
  return wrap;
}

export function closeHeroPicker() {
  const wrap = document.getElementById('hero-picker');
  if (wrap) wrap.remove();
}
