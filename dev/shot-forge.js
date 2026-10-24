/* 一次性：营地 · 打造坊截图（验证传说图鉴新 UI） */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = '/Users/niekai/Documents/ai-game/shanhaice';
const PORT = 4173;
const CDP_PORT = 9222;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const ready = new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const send = (method, params) => ready.then(() => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
    setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); reject(new Error(method + ' timeout')); } }, 60000);
  }));
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  });
  const evalJs = async (expression, awaitPromise = false) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
    if (r.exceptionDetails) throw new Error('JS 异常: ' + JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
    return r.result.value;
  };
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ROOT, 'dev', name), Buffer.from(r.data, 'base64'));
    console.log('截图 → dev/' + name);
  };
  const waitJs = async (expr, timeout = 20000, step = 250) => {
    const t0 = Date.now();
    for (;;) {
      try { if (await evalJs(expr)) return true; } catch (e) { /* 页面加载中 */ }
      if (Date.now() - t0 > timeout) return false;
      await sleep(step);
    }
  };
  return { send, evalJs, shot, waitJs, close: () => ws.close() };
}

(async () => {
  let target = null;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(500);
    try {
      const list = await new Promise((res, rej) => {
        http.get(`http://127.0.0.1:${CDP_PORT}/json/list`, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
      });
      target = list.find(t => t.type === 'page' && t.url.includes(`127.0.0.1:${PORT}`)) || list.find(t => t.type === 'page');
    } catch (e) { /* 继续等 */ }
  }
  if (!target) throw new Error('未找到 Chrome 调试页面');
  const c = cdp(target.webSocketDebuggerUrl);
  await c.send('Page.enable');
  await c.send('Runtime.enable');

  await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await c.waitJs(`document.readyState === 'complete'`, 20000);
  await c.evalJs(`try { localStorage.clear(); } catch (e) {}`);
  await c.send('Page.reload', { ignoreCache: true });
  if (!await c.waitJs(`document.getElementById('titleScreen') && !document.getElementById('titleScreen').classList.contains('hidden')`, 30000)) throw new Error('标题画面未出现');
  await sleep(1000);

  /* 进营地 */
  await c.evalJs(`document.getElementById('btnNew').click()`);
  await c.waitJs(`!document.getElementById('difficultyScreen').classList.contains('hidden')`);
  await sleep(600);
  await c.evalJs(`(() => {
    const items = [...document.querySelectorAll('#diffList > *')];
    const t = items.find(e => /普通/.test(e.textContent)) || items[1] || items[0];
    (t.querySelector('button') || t).click();
  })()`);
  if (!await c.waitJs(`!document.getElementById('campScreen').classList.contains('hidden')`, 20000)) throw new Error('营地未出现');
  await sleep(900);

  /* 切到打造页签 */
  await c.evalJs(`document.querySelector('[data-tab="forge"]').click()`);
  await sleep(900);
  const html = await c.evalJs(`document.querySelector('.camp-detail') ? document.querySelector('.camp-detail').innerHTML : ''`);
  console.log('打造页字符数:', html.length, '；含掉率文案 =', html.indexOf('掉率') >= 0, '；含缘值 =', html.indexOf('缘 ') >= 0);
  await c.shot('shot-forge.png');
  c.close();
  console.log('完成');
})().catch(e => { console.error('失败：', e.message); process.exit(1); });
