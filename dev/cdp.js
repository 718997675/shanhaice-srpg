/* 极简 CDP 驱动：调试/回归用
 * node dev/cdp.js [--size 932x430] [--reload] [--wait 1200] [--expr "JS"] [--shot out.png]
 */
const fs = require('fs');
const http = require('http');

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return fallback;
  return process.argv[i + 1] !== undefined ? process.argv[i + 1] : true;
}
function args(name) {
  const out = [];
  process.argv.forEach((v, i) => { if (v === '--' + name && process.argv[i + 1]) out.push(process.argv[i + 1]); });
  return out;
}
function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const pages = await getJSON('http://127.0.0.1:9222/json');
  const page = pages.find(p => p.type === 'page' && p.url.includes('127.0.0.1:4173'));
  if (!page) { console.error('no page'); process.exit(1); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const errors = [];
  const warnings = [];
  const failed = [];

  const send = (method, params) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
  });

  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
      else p.resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push('EXCEPTION ' + (d.exception && d.exception.description || d.text) + ' @' + (d.url || '') + ':' + d.lineNumber);
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args.map(a => a.value !== undefined ? a.value : (a.description || a.type)).join(' ');
      if (msg.params.type === 'error') errors.push('CONSOLE ' + text);
      else if (msg.params.type === 'warning') warnings.push('WARN ' + text);
    }
    if (msg.method === 'Log.entryAdded') {
      const e = msg.params.entry;
      if (e.level === 'error') errors.push('LOG ' + e.source + ' ' + e.text + (e.url ? ' ' + e.url : ''));
      else if (e.level === 'warning') warnings.push('LOGW ' + e.text);
    }
    if (msg.method === 'Network.responseReceived') {
      const r = msg.params.response;
      if (r.status >= 400 && !r.url.includes('favicon')) failed.push(r.status + ' ' + r.url);
    }
  });

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
  await send('Page.enable');

  const size = arg('size', null);
  if (size) {
    const [w, h] = size.split('x').map(Number);
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 900 });
  }
  if (arg('reload', false)) {
    await send('Page.reload', { ignoreCache: true });
    await sleep(parseInt(arg('wait', '1600'), 10));
  }
  for (const expr of args('expr')) {
    try {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      console.log('EXPR', expr);
      const v = r.result || {};
      const out = v.value !== undefined ? v.value : (v.description || v.subtype || v.type);
      console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 1));
      if (r.exceptionDetails) {
        console.log('THROW ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
      }
    } catch (e) {
      console.log('EXPR_ERR', e.message);
    }
  }
  const shot = arg('shot', null);
  if (shot) {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(shot, Buffer.from(r.data, 'base64'));
    console.log('SHOT ' + shot);
  }
  console.log('ERRORS ' + JSON.stringify(errors, null, 1));
  console.log('WARNINGS ' + JSON.stringify(warnings.slice(0, 10), null, 1));
  console.log('HTTP_FAIL ' + JSON.stringify(failed.slice(0, 20), null, 1));
  ws.close();
})();
