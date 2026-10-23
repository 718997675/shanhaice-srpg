/* 平衡取样：从部署线起连续空过数回合，记录敌方交手伤害 */
const http = require('http');
function getJSON(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const pages = await getJSON('http://127.0.0.1:9222/json');
  const page = pages.find(p => p.type === 'page' && p.url.includes('127.0.0.1:4173'));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 932, height: 430, deviceScaleFactor: 1, mobile: false });
  const ev2 = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text); return r.result && r.result.value; };

  // 从营地重开指定章节
  const chapter = process.argv[2] || '1';
  console.log(await ev2(`(async()=>{
    if(!Battle.active){
      Game.showTitle();await new Promise(r=>setTimeout(r,200));
      Game.continueJourney();await new Promise(r=>setTimeout(r,600));
      Camp.show('deploy');await new Promise(r=>setTimeout(r,200));
      const b=[...document.querySelectorAll('#campBody button')].find(x=>x.textContent.replace(/\\s/g,'')==='出征');
      if(!b)return 'no-deploy-btn';
      b.click();await new Promise(r=>setTimeout(r,1500));
    }
    if(window.__orig===undefined){
      window.__orig=Battle.performCombat.bind(Battle);
      window.__hits=[];
      Battle.performCombat=async function(a,d,fe){const bh=d.hp,ah=a.hp;await window.__orig(a,d,fe);window.__hits.push((fe?'E':'P')+' '+a.name+'->'+d.name+' -'+(bh-d.hp)+' 反击-'+(ah-a.hp)+' t'+Battle.B.turn+' @'+d.x+','+d.y);};
    }
    return 'ready ch='+(Battle.B?Battle.B.chapter.id:'-');
  })()`));

  for (let t = 0; t < 6; t++) {
    const r = await ev2(`(async()=>{
      const B=Battle.B;if(!B)return 'gone';
      const m=document.getElementById('modalOverlay');
      if(m&&!m.classList.contains('hidden')){const bs=[...m.querySelectorAll('button')];const p=bs.find(b=>/继续|确认|知道了/.test(b.textContent))||bs[bs.length-1];p.click();return 'modal';}
      const dl=document.getElementById('dialogOverlay');
      if(dl&&!dl.classList.contains('hidden')){dl.click();return 'dlg';}
      if(B.ending)return 'ending';
      if(B.phase!=='player')return B.phase;
      if(B.busy)return 'busy';
      await Battle.endPlayerPhase();
      return 'ended';
    })()`);
    console.log('--- ' + r + '  ' + await ev2(`Battle.B?('t'+Battle.B.turn+' P '+Battle.B.units.filter(u=>u.side==='player').map(u=>u.name+':'+u.hp+'/'+u.stats.hp).join(' ')):'gone'`));
    for (let k = 0; k < 40; k++) {
      const st = await ev2(`Battle.B?(Battle.B.busy?'busy':Battle.B.phase):'gone'`);
      if (st === 'player' || st === 'gone' || st === 'ending') break;
      await ev2(`(async()=>{const m=document.getElementById('modalOverlay');if(m&&!m.classList.contains('hidden')){const bs=[...m.querySelectorAll('button')];(bs.find(b=>/继续|确认/.test(b.textContent))||bs[bs.length-1]).click();}const dl=document.getElementById('dialogOverlay');if(dl&&!dl.classList.contains('hidden'))dl.click();})()`);
      await sleep(400);
    }
  }
  console.log(await ev2('window.__hits.join("\\n")'));
  console.log('STATE ' + await ev2(`Battle.B?('t'+Battle.B.turn+' phase='+Battle.B.phase+' P '+Battle.B.units.filter(u=>u.side==='player').map(u=>u.name+':'+u.hp+'/'+u.stats.hp).join(' ')+' E存活'+Battle.B.units.filter(u=>u.side==='enemy'&&u.hp>0).length):'gone'`));
  ws.close();
})().catch(e => { console.error('FAILED ' + e.message); process.exit(1); });
