// 默认地图注入 —— 让任何玩家(线上/新设备)首次进游戏都能看到作者预设的地图。
//
// 原理:作者的地图数据存在本地 localStorage(布局/组件清单)+ IndexedDB(视频 Blob)。
// 别人的浏览器是空的,所以这里在游戏启动时检测:若本地没有地图数据,就从打包的
// assets/default-map/default-map-bundle.json + assets/map-videos/*.mp4 注入一次。
//
// 作者本人因为本地已有数据,会跳过注入,不受影响。

const LAYOUT_DEFAULT_KEY = 'tinyswords.layout.v1.island.0.defense';
const LAYOUT_LEGACY_KEY = 'tinyswords.layout.v1.island.0';
const COMP_LIB_KEY = 'tinyswords.component.library.v1';
const INJECT_FLAG_KEY = 'tinyswords.defaultmap.injected.v1';

// 视频文件名 → IndexedDB 里的 key 映射
// (文件名是导出时把 ":" 换成 "_" 得到的,注入时要换回原 key)
const VIDEO_FILES = [
  { file: 'assets/map-videos/idb-video_1780560857683-558505.mp4', idbKey: 'idb-video:1780560857683-558505' },
  { file: 'assets/map-videos/video-comp_c-1780561986177-49288.mp4', idbKey: 'video-comp:c-1780561986177-49288' },
];

// 把一个视频文件读成 Blob 存进 IndexedDB(走 storage.js 的 saveBlob)
async function injectVideo(saveBlob, file, idbKey) {
  const resp = await fetch(file);
  if (!resp.ok) throw new Error(`fetch ${file} 失败: ${resp.status}`);
  const blob = await resp.blob();
  await saveBlob(idbKey, blob);
}

// 主入口:必要时注入默认地图。在 BootScene 启动早期 await 调用。
export async function ensureDefaultMap() {
  try {
    // 已经有人工地图 或 已注入过 → 跳过
    const hasLayout = localStorage.getItem(LAYOUT_DEFAULT_KEY) || localStorage.getItem(LAYOUT_LEGACY_KEY);
    const alreadyInjected = localStorage.getItem(INJECT_FLAG_KEY);
    if (hasLayout || alreadyInjected) return false;

    // 拉打包数据
    const resp = await fetch('assets/default-map/default-map-bundle.json');
    if (!resp.ok) return false; // 没打包文件就静默跳过(本地开发等)
    const bundle = await resp.json();

    // 1. 注入 localStorage 布局 + 组件清单
    if (bundle.layout_default) localStorage.setItem(LAYOUT_DEFAULT_KEY, bundle.layout_default);
    if (bundle.layout_legacy) localStorage.setItem(LAYOUT_LEGACY_KEY, bundle.layout_legacy);
    if (bundle.component_library) localStorage.setItem(COMP_LIB_KEY, bundle.component_library);
    if (bundle.gameMode) localStorage.setItem('tinyswords.gameMode', bundle.gameMode);

    // 2. 注入视频 Blob 到 IndexedDB
    const { saveBlob } = await import('./storage.js?v=3');
    for (const v of VIDEO_FILES) {
      try {
        await injectVideo(saveBlob, v.file, v.idbKey);
      } catch (e) {
        console.warn('[default-map] 视频注入失败:', v.file, e);
      }
    }

    localStorage.setItem(INJECT_FLAG_KEY, '1');
    console.log('[default-map] ✅ 默认地图已注入');
    return true;
  } catch (e) {
    console.warn('[default-map] 注入跳过:', e);
    return false;
  }
}
