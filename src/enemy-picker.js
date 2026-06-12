// 敌人库面板 — 预览所有敌人,开关参与刷怪,上传自定义。
// 用法:
//   import { openEnemyPicker } from './enemy-picker.js';
//   openEnemyPicker(scene);  // 任意场景都可调

import {
  getLibrary, isEnabled, setEnabled, isBuiltin,
  addCustomEnemyFromAnimatedFile, removeCustomEnemy,
} from './config/enemy.js?v=3';

export function openEnemyPicker(scene) {
  if (document.getElementById('enemy-picker')) return;
  const wrap = document.createElement('div');
  wrap.id = 'enemy-picker';
  wrap.innerHTML = `
    <style>
      #enemy-picker {
        position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 200;
        display: flex; align-items: center; justify-content: center;
        font: 13px/1.4 monospace; color: #fff;
      }
      #enemy-picker .panel {
        background: #1a0e08; border: 3px solid #c2a35e; border-radius: 6px;
        padding: 18px; min-width: 540px; max-width: 760px; max-height: 86vh; overflow-y: auto;
      }
      #enemy-picker h2 { margin: 0 0 6px; color: #ffe070; font-size: 18px; }
      #enemy-picker .hint { color: #aaa; font-size: 11px; margin: 4px 0 10px; }
      #enemy-picker .grid {
        display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px;
      }
      #enemy-picker .card {
        position: relative; border: 2px solid #6b5836; border-radius: 4px;
        background: #2a1d10; padding: 10px 8px 8px; text-align: center;
        transition: border-color 0.15s; min-height: 170px;
      }
      #enemy-picker .card.off { opacity: 0.4; }
      #enemy-picker .card.add {
        border-style: dashed; color: #ffd07a; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
      }
      #enemy-picker .card.add:hover { background: #3a2810; }
      #enemy-picker .preview {
        width: 96px; height: 96px; margin: 0 auto 6px;
        background-color: #0d0805; background-repeat: no-repeat;
        background-size: auto 96px; background-position: 0 0;
        image-rendering: pixelated;
        border: 1px solid #4a3a22; border-radius: 2px;
      }
      #enemy-picker .lbl {
        color: #ffe9b6; font-weight: bold; font-size: 12px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 2px;
      }
      #enemy-picker .meta { color: #aaa; font-size: 10px; margin-top: 2px; }
      #enemy-picker .badge {
        position: absolute; top: 4px; left: 4px;
        background: #6b5836; color: #1a0e08; font-size: 9px; padding: 1px 4px;
        border-radius: 2px; font-weight: bold;
      }
      #enemy-picker .x {
        position: absolute; top: 4px; right: 4px;
        width: 18px; height: 18px; border-radius: 9px;
        background: #c25e5e; color: #fff; border: 0;
        font: bold 11px monospace; cursor: pointer; padding: 0; display: none;
      }
      #enemy-picker .card.custom:hover .x { display: block; }
      #enemy-picker .toggle {
        margin-top: 6px;
        display: flex; align-items: center; justify-content: center; gap: 4px;
        background: #4a3418; color: #ffe9b6; border: 1px solid #6b5836;
        padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;
      }
      #enemy-picker .toggle.on { background: #2e6b3a; border-color: #4fbf66; }
      #enemy-picker .toggle:hover { filter: brightness(1.2); }
      #enemy-picker .status { min-height: 22px; color: #ffe070; margin-top: 10px; font-size: 12px; }
      #enemy-picker .actions { display: flex; gap: 8px; margin-top: 12px; }
      #enemy-picker button.action {
        flex: 1; background: #c2a35e; color: #1a0e08; border: 0;
        padding: 8px 12px; font: bold 13px monospace; border-radius: 3px; cursor: pointer;
      }
      #enemy-picker button.action:hover { background: #ffd07a; }
      #enemy-picker button.action.danger { background: #886; }
      #enemy-picker .bulk { display: flex; gap: 6px; margin-bottom: 8px; }
      #enemy-picker .bulk button {
        background: #4a3418; color: #ffe9b6; border: 1px solid #6b5836;
        padding: 4px 8px; font: 11px monospace; border-radius: 3px; cursor: pointer;
      }
    </style>
    <div class="panel">
      <h2>👹 敌人库</h2>
      <div class="hint">点卡片下方按钮开关参与刷怪 — 关掉的不会再出现。+ 卡片上传新角色作为额外敌人(idle/run/attack 同一组帧)。</div>
      <div class="bulk">
        <button id="enemy-all-on">全部开启</button>
        <button id="enemy-all-off">全部关闭</button>
      </div>
      <div class="grid" id="enemy-grid"></div>
      <div class="status" id="enemy-status"></div>
      <div class="actions">
        <button class="action" id="enemy-close">关闭</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);

  const grid = wrap.querySelector('#enemy-grid');
  const status = wrap.querySelector('#enemy-status');

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/gif,image/webp,image/apng,image/png,.apng';
  fileInput.style.display = 'none';
  wrap.appendChild(fileInput);

  const render = () => {
    grid.innerHTML = '';
    const lib = getLibrary();
    lib.forEach((entry) => {
      const card = document.createElement('div');
      const enabled = isEnabled(entry.key);
      const builtin = isBuiltin(entry.key);
      card.className = 'card' + (enabled ? '' : ' off') + (builtin ? ' builtin' : ' custom');
      const previewStyle = entry.preview
        ? `background-image:url(${entry.preview});`
        : '';
      card.innerHTML = `
        <div class="preview" style="${previewStyle}"></div>
        <div class="lbl" title="${entry.label}">${entry.label}</div>
        <div class="meta">${entry.kind === 'ranged' ? '远程' : '近战'}${entry.hp ? ` · ${entry.hp}HP` : ''}</div>
        <button class="toggle ${enabled ? 'on' : ''}" data-key="${entry.key}">
          ${enabled ? '✓ 刷怪中' : '✕ 已禁用'}
        </button>
        ${builtin ? '<span class="badge">内建</span>' : '<button class="x" title="删除">×</button>'}
      `;
      card.querySelector('.toggle').onclick = () => {
        setEnabled(entry.key, !enabled);
        status.textContent = `${entry.label}: ${!enabled ? '已加入' : '已移出'} 刷怪池`;
        render();
      };
      const xb = card.querySelector('.x');
      if (xb) xb.onclick = () => {
        if (!confirm(`删除自定义 ${entry.label}?`)) return;
        removeCustomEnemy(scene, entry.key);
        status.textContent = `🗑 已删除 ${entry.label}`;
        render();
      };
      grid.appendChild(card);
    });
    // + 上传卡片
    const add = document.createElement('div');
    add.className = 'card add';
    add.innerHTML = `<div><div style="font-size:28px;line-height:1">+</div><div class="lbl">上传新敌人 GIF/WebP</div></div>`;
    add.onclick = () => fileInput.click();
    grid.appendChild(add);
  };

  fileInput.onchange = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const name = prompt('给这个敌人起个名字', file.name.replace(/\.(gif|webp|apng|png)$/i, '')) || file.name;
    const kindAns = (prompt('类型: melee (近战) 或 ranged (远程)?', 'melee') || 'melee').toLowerCase();
    const kind = kindAns.startsWith('r') ? 'ranged' : 'melee';
    status.textContent = '🎞 正在拆帧...';
    try {
      const { entry, totalFrames } = await addCustomEnemyFromAnimatedFile(scene, file, name, { kind });
      status.textContent = `✓ ${entry.label} (${kind === 'ranged' ? '远程' : '近战'}) 已加入并启用 (${entry.frameCount}/${totalFrames} 帧)`;
      render();
    } catch (err) {
      console.error(err);
      status.textContent = `⚠ ${err.message || '加载失败'}`;
    } finally {
      e.target.value = '';
    }
  };

  wrap.querySelector('#enemy-all-on').onclick = () => {
    getLibrary().forEach((e) => setEnabled(e.key, true));
    status.textContent = '✓ 已开启全部';
    render();
  };
  wrap.querySelector('#enemy-all-off').onclick = () => {
    getLibrary().forEach((e) => setEnabled(e.key, false));
    status.textContent = '✕ 已关闭全部 (兜底保留第一个内建)';
    render();
  };
  wrap.querySelector('#enemy-close').onclick = () => wrap.remove();
  render();
  return wrap;
}

export function closeEnemyPicker() {
  const w = document.getElementById('enemy-picker');
  if (w) w.remove();
}
