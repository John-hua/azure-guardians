// Vercel Serverless Function —— 取排行榜前 N 名（按分数降序）
// 存储：Upstash Redis 有序集合 key=lb:v1，member=记录 JSON 字符串，score=综合分。
// 协议：GET /api/top?n=10  →  返回 entry 数组（分数高→低）。
// 任何失败都返回空数组，客户端会自动回退到本地排行榜。

const KEY = 'lb:v1';

function creds() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return { url, token };
}

// 调 Upstash REST：POST 基址，body 是一个命令数组，返回 { result }
async function redis(command) {
  const { url, token } = creds();
  if (!url || !token) throw new Error('Upstash 未配置环境变量');
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!r.ok) throw new Error('redis HTTP ' + r.status);
  const j = await r.json();
  return j.result;
}

module.exports = async (req, res) => {
  try {
    let n = parseInt((req.query && req.query.n) || '10', 10);
    if (!Number.isFinite(n) || n < 1) n = 10;
    if (n > 50) n = 50;
    const raw = await redis(['ZREVRANGE', KEY, '0', String(n - 1)]);
    const list = (Array.isArray(raw) ? raw : [])
      .map((s) => { try { return JSON.parse(s); } catch (e) { return null; } })
      .filter(Boolean);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(list);
  } catch (e) {
    res.status(200).json([]);
  }
};
