/* ============================================================
 * 游戏截图采集：CDP 驱动 Chrome 跑真实对局
 * 用法：先 node dev/serve.js 起服务，再 node dev/capture-shots.js
 * 产出（dev/ 下）：
 *   shot-title.png          标题画面
 *   shot-diff.png           难度选择
 *   shot-camp-team.png      营地 · 队伍
 *   shot-deploy.png         出征编成
 *   shot-battle.png         战斗初始
 *   shot-battle-select.png  选中单位 + 行动菜单
 *   shot-battle-target.png  攻击目标选择（红框）
 *   shot-battle-forecast.png 战斗预测
 *   shot-battle-danger.png  危险范围
 *   shot-battle-fight.png   交手后的战场
 *   frames-gif/             动态帧序列（移动+交战），供 mk-gif.js 合成 GIF
 * ============================================================ */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = 4173;
const CDP_PORT = 9222;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FRAMES_DIR = path.join(ROOT, 'dev', 'frames-gif');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = m => console.log('  ' + m);

/* ---------- 迷你 CDP 客户端 ---------- */
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const handlers = new Map();
  const events = [];
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) {
      events.push(msg);
      const hs = handlers.get(msg.method);
      if (hs) for (const h of hs) h(msg.params);
    }
  });
  const ready = new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const send = (method, params) => ready.then(() => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
    setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); reject(new Error(method + ' timeout')); } }, 60000);
  }));
  const on = (method, cb) => { if (!handlers.has(method)) handlers.set(method, []); handlers.get(method).push(cb); };
  const evalJs = async (expression, awaitPromise = false) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
    if (r.exceptionDetails) throw new Error('JS 异常: ' + JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
    return r.result.value;
  };
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    const p = path.join(ROOT, 'dev', name);
    fs.writeFileSync(p, Buffer.from(r.data, 'base64'));
    log('截图 → dev/' + name);
    return p;
  };
  const waitJs = async (expr, timeout = 20000, step = 250) => {
    const t0 = Date.now();
    for (;;) {
      try { if (await evalJs(expr)) return true; } catch (e) { /* 页面加载中 */ }
      if (Date.now() - t0 > timeout) return false;
      await sleep(step);
    }
  };
  return { send, evalJs, shot, waitJs, on, events, close: () => ws.close() };
}

(async () => {
  /* Chrome 已由外部以 9222 端口启动；直接附着 */
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
  if (!target) throw new Error('未找到 Chrome 调试页面（需先以 --remote-debugging-port=9222 启动并打开游戏）');
  const c = cdp(target.webSocketDebuggerUrl);
  await c.send('Page.enable');
  await c.send('Runtime.enable');

  console.log('\n  山海策 · 截图采集');
  console.log('  ' + '='.repeat(60));

  /* 打开游戏；先清存档再刷新，保证全新开局（避免续档弹窗干扰） */
  await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await c.waitJs(`document.readyState === 'complete'`, 20000);
  await c.evalJs(`try { localStorage.clear(); } catch (e) {}`);
  await c.send('Page.reload', { ignoreCache: true });
  if (!await c.waitJs(`document.getElementById('titleScreen') && !document.getElementById('titleScreen').classList.contains('hidden')`, 30000)) {
    throw new Error('标题画面未出现');
  }
  await sleep(1200);
  await c.shot('shot-title.png');

  /* 难度选择 */
  await c.evalJs(`document.getElementById('btnNew').click()`);
  await c.waitJs(`!document.getElementById('difficultyScreen').classList.contains('hidden')`);
  await sleep(700);
  await c.shot('shot-diff.png');

  /* 选「普通」→ 营地 */
  await c.evalJs(`(() => {
    const items = [...document.querySelectorAll('#diffList > *')];
    const t = items.find(e => /普通/.test(e.textContent)) || items[1] || items[0];
    (t.querySelector('button') || t).click();
  })()`);
  await c.waitJs(`!document.getElementById('campScreen').classList.contains('hidden')`, 20000);
  await sleep(900);
  await c.shot('shot-camp-team.png');

  /* 出征编成 */
  await c.evalJs(`document.querySelector('.camp-deploy').click()`);
  await sleep(900);
  await c.shot('shot-deploy.png');

  /* 教程/确认弹窗清理：下山 / 确认 / 知道了 / 继续（全等匹配，绝不误触「继续行动」这类取消键） */
  const dismissModals = async (maxRounds = 14) => {
    for (let i = 0; i < maxRounds; i++) {
      const clicked = await c.evalJs(`(() => {
        const m = document.getElementById('modalOverlay');
        if (m && !m.classList.contains('hidden')) {
          const bs = [...m.querySelectorAll('button')];
          const exact = t => bs.find(b => b.textContent.replace(/\\s/g, '') === t);
          const pick = exact('下山') || exact('确认') || exact('知道了') || exact('继续');
          if (pick) { pick.click(); return 'modal:' + pick.textContent.trim(); }
        }
        const d = document.getElementById('dialogOverlay');
        if (d && !d.classList.contains('hidden')) { document.getElementById('dialogSkip').click(); return 'dialog'; }
        const f = document.getElementById('forecastOverlay');
        if (f && !f.classList.contains('hidden')) { const g = f.querySelector('.fc-go'); if (g) g.click(); return 'forecast'; }
        return '';
      })()`);
      if (!clicked) break;
      log('弹窗处理 → ' + clicked);
      await sleep(400);
    }
  };
  await dismissModals();

  /* 结束我方回合：点确认弹窗里的「结束回合」（不是「继续行动」） */
  const endTurn = async () => {
    await c.evalJs(`Battle.askEndTurn()`);
    await sleep(450);
    const r = await c.evalJs(`(() => {
      const m = document.getElementById('modalOverlay');
      if (m && !m.classList.contains('hidden')) {
        const bs = [...m.querySelectorAll('button')];
        const ok = bs.find(b => b.textContent.replace(/\\s/g, '') === '结束回合');
        if (ok) { ok.click(); return 'confirmed'; }
        return 'no-confirm-btn';
      }
      return 'no-modal';
    })()`);
    log('结束回合 → ' + r);
    await sleep(450);
  };

  /* 确保停在出征页签，再精确匹配「出征」按钮（去空格全等，避开页签按钮） */
  const deployInfo = await c.evalJs(`(() => {
    const tabActive = (document.querySelector('.camp-tabs button.active') || {}).textContent || '';
    if (!/出征/.test(tabActive)) { document.querySelector('.camp-deploy').click(); }
    const bs = [...document.querySelectorAll('#campBody button')];
    const b = bs.find(x => x.textContent.replace(/\\s/g, '') === '出征');
    return { tabActive, hasBtn: !!b, btns: bs.map(x => x.textContent.replace(/\\s+/g, '').slice(0, 10)) };
  })()`);
  log('出征页状态: ' + JSON.stringify(deployInfo));
  if (deployInfo.hasBtn) {
    await c.evalJs(`(() => {
      const bs = [...document.querySelectorAll('#campBody button')];
      const b = bs.find(x => x.textContent.replace(/\\s/g, '') === '出征');
      if (b) b.click();
    })()`);
    await sleep(600);
    await dismissModals();
  }
  const inBattle = await c.waitJs(`typeof Battle !== 'undefined' && Battle.active && Battle.B && Battle.B.phase === 'player' && !Battle.B.busy`, 30000);
  if (!inBattle) {
    const st = await c.evalJs(`(() => {
      const vis = id => { const e = document.getElementById(id); return e && !e.classList.contains('hidden'); };
      const m = document.getElementById('modalOverlay');
      return { title: vis('titleScreen'), camp: vis('campScreen'), battle: vis('battleUI'),
        modal: m && !m.classList.contains('hidden') ? m.innerText.replace(/\\s+/g, ' ').slice(0, 50) : '',
        battleActive: typeof Battle !== 'undefined' && Battle.active, hasB: typeof Battle !== 'undefined' && !!Battle.B };
    })()`);
    throw new Error('未能进入战斗，当前状态: ' + JSON.stringify(st));
  }
  await dismissModals();
  await c.waitJs(`Battle.B && Battle.B.phase === 'player' && !Battle.B.busy && !UI.isBlocking()`, 20000);
  await sleep(1400);
  await c.shot('shot-battle.png');

  /* 速度降到 ×1，动画完整利于录制 */
  await c.evalJs(`(() => { if (Battle.B && (Battle.B.speed || 1) !== 1) Battle.toggleSpeed(); })()`);
  await sleep(300);

  /* ---------- 选单位 + 行动菜单（静态） ---------- */
  const pick = await c.evalJs(`(() => {
    const B = Battle.B;
    const u = B.units.find(x => x.side === 'player' && x.hp > 0 && !x.acted && Combat.weaponOf(x));
    if (!u) return null;
    Battle.onTileTap(u.x, u.y);
    return { name: u.name, x: u.x, y: u.y };
  })()`);
  if (pick) {
    await sleep(900);
    await c.shot('shot-battle-select.png');

    /* 攻击目标选择（红框） */
    const hasAtk = await c.evalJs(`(() => {
      const b = [...document.querySelectorAll('#actionBar button')].find(x => x.textContent.includes('攻击'));
      if (!b || b.disabled) return false;
      b.click(); return true;
    })()`);
    if (hasAtk) {
      await sleep(800);
      await c.shot('shot-battle-target.png');
      /* 点一个敌人 → 战斗预测 */
      const fc = await c.evalJs(`(() => {
        const B = Battle.B;
        const t = B.units.find(x => x.side === 'enemy' && x.hp > 0 && B.targetTiles && B.targetTiles.has(B.key ? B.key(x.x, x.y) : (x.x + ',' + x.y)));
        if (!t) return false;
        Battle.onTileTap(t.x, t.y);
        return true;
      })()`);
      if (fc) {
        await c.waitJs(`!document.getElementById('forecastOverlay').classList.contains('hidden')`, 8000);
        await sleep(600);
        await c.shot('shot-battle-forecast.png');
        /* 取消预测（点「返回」），绝不误触出击 */
        await c.evalJs(`(() => {
          const f = document.getElementById('forecastOverlay');
          const cancel = f.querySelector('.fc-cancel');
          if (cancel) cancel.click();
        })()`);
        await sleep(400);
        await c.evalJs(`if (Battle.B && Battle.B.selectedUnit) Battle.cancelSelection()`);
      }
    }
    await sleep(400);
  }

  /* ---------- 危险范围（静态） ---------- */
  await c.evalJs(`Battle.toggleDanger()`);
  await sleep(900);
  await c.shot('shot-battle-danger.png');
  await c.evalJs(`Battle.toggleDanger()`);
  await sleep(500);

  /* ---------- 动态序列：推进到有交战机会，录制 移动 + 攻击 + 交战 ---------- */
  console.log('  -- 录制动态帧（移动 + 交战）--');
  await c.evalJs(`if (Battle.B && Battle.B.selectedUnit) Battle.cancelSelection()`);
  await sleep(300);

  /* 找一个「移动后能攻击到敌人」的我方单位；找不到就结束回合让敌军靠近，最多推进 6 个我方回合 */
  const findPlan = () => c.evalJs(`(() => {
    const B = Battle.B;
    if (!B || B.phase !== 'player' || B.busy || B.ending) return null;
    const ctx = Battle.combatCtx();
    const me = B.units.filter(x => x.side === 'player' && x.hp > 0 && !x.acted && Combat.weaponOf(x));
    const foes = B.units.filter(x => x.side === 'enemy' && x.hp > 0 && !x.escaped);
    for (const u of me) {
      const range = Battle.reachFor(u);
      const w = Combat.weaponOf(u);
      const ox = u.x, oy = u.y, om = u.hasMoved, od = u.movedDist;
      let best = null;
      for (const node of range.values()) {
        if (!node.endable) continue;
        for (const t of foes) {
          const d = Combat.distance(node.x, node.y, t.x, t.y);
          if (d < w.w.rng[0] || d > w.w.rng[1]) continue;
          u.x = node.x; u.y = node.y; u.hasMoved = true; u.movedDist = node.cost;
          const f = Combat.forecast(u, t, ctx);
          const dealt = f.attacker.hit / 100 * f.attacker.dmg * (f.attacker.double ? 2 : 1);
          const back = f.defender.canCounter ? f.defender.hit / 100 * f.defender.dmg * (f.defender.double ? 2 : 1) : 0;
          const s = dealt * 2 - back * 0.9 + (dealt >= t.hp ? 60 : 0);
          if (!best || s > best.score) best = { score: s, node: { x: node.x, y: node.y }, target: { x: t.x, y: t.y } };
        }
      }
      u.x = ox; u.y = oy; u.hasMoved = om; u.movedDist = od;
      if (best) return { unit: { x: u.x, y: u.y, name: u.name }, node: best.node, target: best.target };
    }
    return null;
  })()`);

  let plan = await findPlan();
  for (let turn = 0; !plan && turn < 6; turn++) {
    log(`第 ${turn + 1} 个我方回合无可拍交战，结束回合等敌军靠近…`);
    await endTurn();
    const ok = await c.waitJs(`Battle.B && Battle.B.phase === 'player' && !Battle.B.busy && !Battle.B.ending`, 90000);
    if (!ok) break;
    await dismissModals();
    await sleep(900);
    plan = await findPlan();
  }

  if (plan) {
    fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
    fs.mkdirSync(FRAMES_DIR, { recursive: true });
    let frameIdx = 0;
    let capturing = true;
    /* screencast：合成器逐帧推送，保证录到动画中的真实画面 */
    await c.send('Page.startScreencast', { format: 'png', everyNthFrame: 2 });
    c.on('Page.screencastFrame', params => {
      if (!capturing) return;
      try {
        fs.writeFileSync(path.join(FRAMES_DIR, 'frame_' + String(frameIdx).padStart(3, '0') + '.png'), Buffer.from(params.data, 'base64'));
        frameIdx++;
      } catch (e) { /* 单帧失败继续 */ }
      c.send('Page.screencastFrameAck', { sessionId: params.sessionId }).catch(() => {});
    });

    /* 选中 → 移动 → 攻击 → 确认（沿途补静态截图） */
    await c.evalJs(`Battle.onTileTap(${plan.unit.x}, ${plan.unit.y})`);
    await sleep(600);
    await c.evalJs(`Battle.onTileTap(${plan.node.x}, ${plan.node.y})`);
    await c.waitJs(`!Render.moving && document.getElementById('actionBar') && !document.getElementById('actionBar').classList.contains('hidden')`, 12000);
    await sleep(400);
    await c.shot('shot-battle-target.png');   // 移动就位后的行动菜单
    await c.evalJs(`(() => {
      const b = [...document.querySelectorAll('#actionBar button')].find(x => x.textContent.includes('攻击'));
      if (b) b.click();
    })()`);
    await sleep(600);
    await c.evalJs(`Battle.onTileTap(${plan.target.x}, ${plan.target.y})`);
    await c.waitJs(`!document.getElementById('forecastOverlay').classList.contains('hidden')`, 8000);
    await sleep(500);
    await c.shot('shot-battle-forecast.png');
    await sleep(300);
    await c.evalJs(`(() => {
      const go = document.querySelector('#forecastOverlay .fc-go');
      if (go) go.click();
    })()`);
    /* 等交战结束（该单位行动完毕） */
    await c.waitJs(`(() => {
      const B = Battle.B;
      return B && !B.busy && (!B.selectedUnit || B.selectedUnit.acted) && B.phase === 'player';
    })()`, 25000);
    await sleep(700);
    capturing = false;
    await captureLoop;
    log(`共录制 ${frameIdx} 帧 → dev/frames-gif/`);

    await sleep(400);
    await c.shot('shot-battle-fight.png');
  } else {
    log('多轮内未出现可交战局面，跳过动态帧');
  }

  c.close();
  console.log('  ' + '='.repeat(60));
  console.log('  截图采集完成');
})().catch(e => { console.error('采集失败：', e); process.exit(1); });
