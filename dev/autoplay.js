/* 自动通关冒烟测试：在页面里注入贪心 AI，逐单位行动直到章节结束
 * node dev/autoplay.js [--max 400] [--chapter 1]
 */
const fs = require('fs');
const http = require('http');

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i < 0 ? fallback : process.argv[i + 1];
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

const INJECT = `
(function () {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  window.__auto = {
    async dismiss() {
      const modal = document.getElementById('modalOverlay');
      if (modal && !modal.classList.contains('hidden')) {
        const log = document.getElementById('battleLog');
        const tail = log && log.innerText ? ' LOG{' + log.innerText.replace(/\\s*\\n\\s*/g, ' / ') + '}' : '';
        const bs = [...modal.querySelectorAll('button')];
        const pick = bs.find(b => /继续|确认|知道了|出征|返回营地/.test(b.textContent)) || bs[bs.length - 1];
        if (pick) { const t = modal.innerText.replace(/\\s+/g, ' ').slice(0, 46); pick.click(); await wait(120); return 'modal[' + t + ']' + tail; }
      }
      const dlg = document.getElementById('dialogOverlay');
      if (dlg && !dlg.classList.contains('hidden')) { dlg.click(); await wait(60); return 'dialog'; }
      const fc = document.getElementById('forecastOverlay');
      if (fc && !fc.classList.contains('hidden')) { const g = fc.querySelector('.fc-go'); if (g) g.click(); await wait(60); return 'forecast'; }
      return '';
    },
    incomingAt(x, y, target, foes, ctx) {
      const ox = target.x, oy = target.y;
      target.x = x; target.y = y;
      let total = 0, n = 0;
      for (const e of foes) {
        const w = Combat.weaponOf(e);
        const reach = (e.move || 0) + (w ? w.w.rng[1] : 1);
        const d0 = Combat.distance(x, y, e.x, e.y);
        if (d0 > reach) continue;
        const ex = e.x, ey = e.y;
        const lo = w ? w.w.rng[0] : 1, hi = w ? w.w.rng[1] : 1;
        if (d0 > hi || d0 < lo) { e.x = x + hi; e.y = y; }
        const f = Combat.forecast(e, target, ctx);
        e.x = ex; e.y = ey;
        if (!f.canHit) continue;
        n++;
        total += f.attacker.hit / 100 * f.attacker.dmg * (f.attacker.double ? 2 : 1);
      }
      target.x = ox; target.y = oy;
      return { total, n };
    },
    threatAt(x, y, foes) {
      let n = 0, dmg = 0;
      for (const e of foes) {
        const w = Combat.weaponOf(e);
        const reach = (e.move || 0) + (w ? w.w.rng[1] : 1);
        if (Combat.distance(x, y, e.x, e.y) <= reach) {
          n++;
          dmg += Math.max(1, e.stats.str || 5);
        }
      }
      return { n, dmg };
    },
    score(u, t, node, ctx, foes) {
      const f = Combat.forecast(u, t, ctx);
      if (!f.canHit) return -1;
      const dealt = f.attacker.hit / 100 * f.attacker.dmg * (f.attacker.double ? 2 : 1);
      let s = dealt * 2 + f.attacker.crit / 100 * f.attacker.dmg * 0.6;
      if (dealt >= t.hp) s += 60;
      const back = f.defender.canCounter ? f.defender.hit / 100 * f.defender.dmg * (f.defender.double ? 2 : 1) : 0;
      s -= back * 0.9;
      if (back >= u.hp) s -= 90;
      const terr = Battle.tileAt(node.x, node.y) || {};
      s += (terr.avoid || 0) * 0.15 + (terr.def || 0) * 0.8;
      const nd = Battle.nodeAt(node.x, node.y);
      if (nd && nd.owner !== u.side) s += 12;
      const th = this.threatAt(node.x, node.y, foes);
      const inc = this.incomingAt(node.x, node.y, u, foes, ctx);
      s -= th.n * 4 + inc.total * 1.1;
      if (u.charId === 'yunce' && inc.total + back >= u.hp) return -9999;
      if (inc.total + back >= u.hp) s -= 90;
      if (u.charId === 'yunce') s -= inc.total * 0.8;
      if (th.n >= 2 && dealt < t.hp) s -= 30;
      return s;
    },
    async place(u, node) {
      const B = Battle.B;
      const range = Battle.reachFor(u);
      const path = Battle.pathBetween(range, u, node.x, node.y);
      if (!path) return false;
      const oldX = u.x, oldY = u.y;
      u.x = node.x; u.y = node.y;
      u.hasMoved = !(node.x === oldX && node.y === oldY);
      u.movedDist = Math.max(0, path.length - 1);
      Battle.computeVisibility(false);
      Render.hpView = null;
      await Render.animateMove(u, path, 6);
      Battle.computeVisibility(false);
      UI.updateBattle(B);
      return true;
    },
    async step() {
      const B = Battle.B;
      if (!B) return 'no-battle';
      if (B.ending) return 'ending';
      if (B.phase !== 'player') return 'phase:' + B.phase;
      if (B.busy) { await wait(200); return 'busy'; }
      const ctx = Battle.combatCtx();
      const me = B.units.filter(u => u.side === 'player' && u.hp > 0 && !u.escaped && !u.acted);
      if (!me.length) { await Battle.endPlayerPhase(); return 'end-player-phase'; }
      const rank = x => (Combat.staffOf(x) ? 3 : (x.charId === 'yunce' ? 2 : 1));
      me.sort((a, b) => rank(a) - rank(b) || b.stats.def - a.stats.def);
      const u = me[0];
      const range = Battle.reachFor(u);
      const foes = B.units.filter(x => x.side === 'enemy' && x.hp > 0 && !x.escaped);
      // 1. 村庄 / 宝箱 / 神龛
      const poi = []
        .concat((B.chapter.villages || []).map(v => ({ v, kind: 'village', f: 'villages' })))
        .concat((B.chapter.chests || []).map(v => ({ v, kind: 'chest', f: 'chests' })))
        .concat((B.chapter.shrines || []).map(v => ({ v, kind: 'shrine', f: 'shrines' })));
      for (const o of poi) {
        const v = o.v;
        const done = B.flags[o.f] && B.flags[o.f][v.x + ',' + v.y];
        if (done) continue;        const node = range.get(v.x + ',' + v.y);
        if (node && node.endable) {
          B.selectedUnit = u;
          await this.place(u, node);
          if (o.kind === 'village') await Battle.visitVillage(v);
          else if (o.kind === 'chest') await Battle.openChest(v);
          else await Battle.visitShrine(v);
          B.selectedUnit = null;
          return 'poi:' + o.kind;
        }
      }
      // 2. 攻击
      const w = Combat.weaponOf(u);
      let best = null, kill = null;
      if (w) {
        const ox = u.x, oy = u.y, om = u.hasMoved, od = u.movedDist;
        for (const node of range.values()) {
          if (!node.endable) continue;
          for (const t of foes) {
            const d = Combat.distance(node.x, node.y, t.x, t.y);
            if (d < w.w.rng[0] || d > w.w.rng[1]) continue;
            u.x = node.x; u.y = node.y; u.hasMoved = !(node.x === ox && node.y === oy); u.movedDist = node.cost;
            const f = Combat.forecast(u, t, ctx);
            const s = this.score(u, t, node, ctx, foes);
            if (s > 0 && (!best || s > best.score)) best = { x: node.x, y: node.y, target: t, score: s };
            const dealt = f.attacker.hit / 100 * f.attacker.dmg * (f.attacker.double ? 2 : 1);
            if (f.canHit && dealt >= t.hp && (!kill || s > kill.score)) kill = { x: node.x, y: node.y, target: t, score: s };
          }
        }
        u.x = ox; u.y = oy; u.hasMoved = om; u.movedDist = od;
      }
      best = best || (kill && kill.score > -40 ? kill : null);
      if (best) {
        await this.place(u, best);
        if (best.target.hp > 0) await Battle.performCombat(u, best.target, false);
        if (!Battle.B.ending) await Battle.finishUnitAction(u);
        return 'atk:' + u.charId + '->' + (best.target.name || best.target.charId);
      }
      // 3. 治疗
      const staff = Combat.staffOf(u);
      if (staff) {
        const hurt = B.units.filter(a => a.side === 'player' && a.hp > 0 && a.hp < a.stats.hp)
          .sort((a, b) => a.hp / a.stats.hp - b.hp / b.stats.hp)[0];
        if (hurt) {
          let spot = null;
          for (const node of range.values()) {
            if (!node.endable) continue;
            const d = Combat.distance(node.x, node.y, hurt.x, hurt.y);
            if (d >= staff.w.rng[0] && d <= staff.w.rng[1]) { spot = node; break; }
          }
          if (spot && !(spot.x === hurt.x && spot.y === hurt.y)) {
            B.selectedUnit = u;
            await this.place(u, spot);
            await Battle.chooseHealTarget(hurt);
            B.selectedUnit = null;
            return 'heal:' + u.charId;
          }
        }
      }
      // 4. 接近（避开被围）/ 残血后撤
      const hurt = u.hp / u.stats.hp < 0.45;
      let app = null;
      for (const node of range.values()) {
        if (!node.endable) continue;
        let near = Infinity;
        for (const t of foes) near = Math.min(near, Combat.distance(node.x, node.y, t.x, t.y));
        const terr = Battle.tileAt(node.x, node.y) || {};
        const th = this.threatAt(node.x, node.y, foes);
        if (th.n >= 3 && !hurt) continue;
        const inc = this.incomingAt(node.x, node.y, u, foes, ctx);
        if (inc.total >= u.hp) continue;
        let s = -near * 6 + (terr.avoid || 0) * 0.2 + (terr.def || 0) * 1.2 - th.n * 9 - inc.total * 1.2;
        const nd = Battle.nodeAt(node.x, node.y);
        if (nd && nd.owner !== 'player') s += 14;
        if (hurt) s = near * 8 - th.n * 14 + (terr.def || 0) * 1.5 - inc.total * 2;
        if (!app || s > app.score) app = { x: node.x, y: node.y, score: s };
      }
      if (app && (app.x !== u.x || app.y !== u.y)) await this.place(u, app);
      await Battle.finishUnitAction(u);
      return (hurt ? 'retreat:' : 'move:') + u.charId;
    }
  };
  return 'installed';
})()
`;

(async () => {
  const pages = await getJSON('http://127.0.0.1:9222/json');
  const page = pages.find(p => p.type === 'page' && p.url.includes('127.0.0.1:4173'));
  if (!page) { console.error('no page'); process.exit(1); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const errors = [];
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
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push('CONSOLE ' + msg.params.args.map(a => a.value !== undefined ? a.value : (a.description || a.type)).join(' '));
    }
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 932, height: 430, deviceScaleFactor: 1, mobile: false });

  const evaluate = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text);
    return r.result && r.result.value;
  };

  await evaluate(INJECT);
  if (arg('fresh', false)) {
    console.log('FRESH ' + await evaluate(`(async()=>{
      window.__hits = [];
      if(window.Battle&&Battle.active){Battle.active=false;Battle.B=null;Render.clearBattle();Game.leaveBattleToCamp('deploy');}
      else{Game.continueJourney();await new Promise(r=>setTimeout(r,400));Camp.show('deploy');}
      await new Promise(r=>setTimeout(r,300));
      const b=[...document.querySelectorAll('#campBody button')].find(x=>x.textContent.replace(/\\s/g,'')==='出征');
      if(!b)return 'no-deploy';
      b.click();await new Promise(r=>setTimeout(r,1400));
      return 'ch='+(Battle.B?Battle.B.chapter.id:'-')+' battle='+Battle.active;
    })()`));
  }
  await evaluate('window.__hits=window.__hits||[];if(!Battle.__dmgHook){Battle.__dmgHook=true;const o=Battle.performCombat.bind(Battle);Battle.performCombat=async function(a,d,fe){const bh=d.hp,ah=a.hp;await o(a,d,fe);window.__hits.push((fe?"E":"P")+" "+a.name+"->"+d.name+" -"+(bh-d.hp)+" 反-"+(ah-a.hp)+" t"+Battle.B.turn);};}');
  const max = parseInt(arg('max', '400'), 10);
  let same = 0, last = '';
  for (let i = 0; i < max; i++) {
    const dismissed = await evaluate('window.__auto.dismiss()');
    if (dismissed) { same = 0; console.log(i + '  ' + dismissed); continue; }
    const res = await evaluate('window.__auto.step()');
    if (res === last) same++; else same = 0;
    last = res;
    if (same > 60) { console.log('STUCK at ' + res); break; }
    if (i % 5 === 0 || /ending|phase-end|atk|poi|STUCK/.test(res)) {
      const st = await evaluate("Battle.B?('t'+Battle.B.turn+'/'+Battle.B.phase+' P['+Battle.B.units.filter(u=>u.side==='player'&&u.hp>0).map(u=>u.charId+':'+u.hp+'/'+u.stats.hp).join(' ')+'] E'+Battle.B.units.filter(u=>u.side==='enemy'&&u.hp>0).length+' nodes='+Battle.B.nodes.map(n=>n.owner||'-').join('')):'-'");
      console.log(i + '  ' + res + '  |  ' + st);
    }
    if (res === 'ending') break;
    if (res === 'no-battle') { console.log('  battle closed'); break; }
    if (res && res.startsWith('phase:')) { await sleep(600); continue; }
    await sleep(60);
  }
  const fin = await evaluate("JSON.stringify({ending:Battle.B?Battle.B.ending:null,resultShown:!document.getElementById('resultScreen').classList.contains('hidden'),camp:!document.getElementById('campScreen').classList.contains('hidden'),chapter:Game.campaign?Game.campaign.chapter:null,gold:Game.campaign?Game.campaign.gold:null,roster:Game.campaign?Game.campaign.roster.map(r=>r.id+':'+r.level):null})");
  console.log('HITS ' + await evaluate('(window.__hits||[]).join(" | ")'));
  console.log('FINAL ' + fin);
  if (arg('shot', '')) {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(arg('shot'), Buffer.from(r.data, 'base64'));
  }
  console.log('ERRORS ' + JSON.stringify(errors.slice(0, 12), null, 1));
  ws.close();
})().catch(e => { console.error('FAILED ' + e.message); process.exit(1); });
