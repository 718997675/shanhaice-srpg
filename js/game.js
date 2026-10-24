/* ============================================================
 * 战役流程：存档、章节推进、结算、续战与标题流转
 * ============================================================ */
const Game = {
  SAVE_KEY: 'shanhaice.save.v3',
  SUSPEND_KEY: 'shanhaice.suspend.v3',
  SETTINGS_KEY: 'shanhaice.settings.v3',
  campaign: null,
  settings: { music: true, sfx: true, speed: 1 },
  lastDeploy: null,
  currentChapter: 0,
  busy: false,

  init() {
    this.settings = this.loadSettings();
    this.applySettings();
    this.campaign = this.loadCampaign();
    this.refreshTitle();
    UI.showScreen('title');
  },

  /* ---------------- 存储 ---------------- */
  readJSON(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      UI.toast('存档写入失败，请检查浏览器存储权限');
      return false;
    }
  },

  loadSettings() {
    const s = this.readJSON(this.SETTINGS_KEY);
    return {
      music: !s || s.music !== false,
      sfx: !s || s.sfx !== false,
      speed: s && s.speed === 2 ? 2 : 1
    };
  },

  saveSettings() {
    this.writeJSON(this.SETTINGS_KEY, this.settings);
  },

  applySettings() {
    Audio.musicOn = this.settings.music !== false;
    Audio.sfxOn = this.settings.sfx !== false;
  },

  /* ---------------- 战役存档 ---------------- */
  makeRec(id) {
    const c = CHARS[id];
    if (!c) return null;
    return {
      id,
      cls: c.cls,
      level: c.level,
      exp: c.exp || 0,
      stats: JSON.parse(JSON.stringify(c.stats)),
      ranks: JSON.parse(JSON.stringify(c.ranks)),
      items: JSON.parse(JSON.stringify(c.items || [])),
      weaponIndex: 0
    };
  },

  newCampaign(diffKey, cycle) {
    const roster = ['yunce', 'yankui', 'luming'].map(id => this.makeRec(id)).filter(Boolean);
    return {
      version: SAVE_VERSION,
      difficulty: DIFFICULTIES[diffKey] ? diffKey : 'normal',
      cycle: Math.max(1, Math.floor(cycle || 1)),
      chapter: 1,
      gold: 800,
      seals: 0,
      roster,
      fallen: [],
      supports: {},
      convoy: [{ key: 'potion', uses: 3 }],
      sideCleared: {},
      introSeen: {},
      legendary: {},
      legendaryPity: {},
      cleared: false,
      startedAt: Date.now(),
      savedAt: Date.now(),
      settings: { music: this.settings.music, sfx: this.settings.sfx, speed: this.settings.speed },
      records: { chapters: {}, kills: 0, lost: 0, recruits: 0, turns: 0, levels: 0 }
    };
  },

  normalizeCampaign(raw) {
    if (!raw || raw.version !== SAVE_VERSION) return null;
    const c = raw;
    if (!DIFFICULTIES[c.difficulty]) c.difficulty = 'normal';
    c.chapter = Math.max(1, Math.min(9, c.chapter || 1));
    c.cycle = Math.max(1, Math.floor(c.cycle || 1));
    c.gold = Math.max(0, Math.floor(c.gold || 0));
    c.seals = Math.max(0, Math.floor(c.seals || 0));
    if (!c.legendary || typeof c.legendary !== 'object') c.legendary = {};
    for (const k of Object.keys(c.legendary)) {
      if (!LEGENDARY_WEAPONS[k] || !c.legendary[k]) delete c.legendary[k];
    }
    /* 缘值：键为传说首领的 ENEMY_TYPES 键，值为非负整数 */
    if (!c.legendaryPity || typeof c.legendaryPity !== 'object') c.legendaryPity = {};
    const pitySrc = {};
    for (const lk in LEGENDARY_WEAPONS) pitySrc[LEGENDARY_WEAPONS[lk].source] = true;
    for (const k of Object.keys(c.legendaryPity)) {
      const v = c.legendaryPity[k];
      if (!pitySrc[k] || typeof v !== 'number' || v < 0) delete c.legendaryPity[k];
      else c.legendaryPity[k] = Math.floor(v);
    }
    if (!Array.isArray(c.roster)) c.roster = [];
    c.roster = c.roster.filter(r => r && CHARS[r.id]).map(r => {
      const base = this.makeRec(r.id);
      const stats = Object.assign({}, base.stats, r.stats || {});
      for (const k of STAT_ORDER) {
        if (typeof stats[k] !== 'number' || stats[k] < 0) stats[k] = base.stats[k];
      }
      const items = Array.isArray(r.items) ? r.items.filter(it => it && (WEAPONS[it.key] || ITEMS[it.key])) : base.items;
      return {
        id: r.id,
        cls: CLASSES[r.cls] ? r.cls : base.cls,
        level: Math.max(1, Math.min(MAX_LEVEL, r.level || base.level)),
        exp: Math.max(0, Math.min(99, r.exp || 0)),
        stats,
        ranks: Object.assign({}, base.ranks, r.ranks || {}),
        items,
        weaponIndex: Math.max(0, Math.min(items.length - 1, r.weaponIndex || 0))
      };
    });
    if (!c.roster.some(r => r.id === 'yunce')) {
      const lord = this.makeRec('yunce');
      if (lord) c.roster.unshift(lord);
    }
    const order = id => {
      const i = HERO_ORDER.indexOf(id);
      return i < 0 ? 99 : i;
    };
    c.roster.sort((a, b) => order(a.id) - order(b.id));
    if (!Array.isArray(c.fallen)) c.fallen = [];
    c.fallen = c.fallen.filter(id => CHARS[id] && id !== 'yunce');
    c.fallen = Array.from(new Set(c.fallen));
    if (!c.supports || typeof c.supports !== 'object') c.supports = {};
    if (!Array.isArray(c.convoy)) c.convoy = [];
    c.convoy = c.convoy.filter(it => it && (WEAPONS[it.key] || ITEMS[it.key]));
    if (!c.sideCleared || typeof c.sideCleared !== 'object') c.sideCleared = {};
    if (!c.introSeen || typeof c.introSeen !== 'object') c.introSeen = {};
    c.cleared = !!c.cleared || c.chapter >= 9;
    if (!c.records) c.records = { chapters: {}, kills: 0, lost: 0, recruits: 0, turns: 0, levels: 0 };
    if (!c.records.chapters) c.records.chapters = {};
    c.settings = Object.assign({}, this.settings, c.settings || {});
    return c;
  },

  loadCampaign() {
    return this.normalizeCampaign(this.readJSON(this.SAVE_KEY));
  },

  saveCampaign() {
    if (!this.campaign) return;
    this.campaign.version = SAVE_VERSION;
    this.campaign.savedAt = Date.now();
    this.campaign.settings = { music: this.settings.music, sfx: this.settings.sfx, speed: this.settings.speed };
    this.writeJSON(this.SAVE_KEY, this.campaign);
  },

  clearCampaign() {
    try {
      localStorage.removeItem(this.SAVE_KEY);
      localStorage.removeItem(this.SUSPEND_KEY);
    } catch (e) {}
    this.campaign = null;
    this.refreshTitle();
  },

  /* ---------------- 续战存档 ---------------- */
  saveSuspend(state) {
    if (!this.campaign || !state || !state.chapterIndex) return;
    const packed = {
      version: SAVE_VERSION,
      chapterIndex: state.chapterIndex,
      campaign: JSON.parse(JSON.stringify(this.campaign)),
      state: JSON.parse(JSON.stringify(state)),
      savedAt: Date.now()
    };
    this.writeJSON(this.SUSPEND_KEY, packed);
  },

  loadSuspend() {
    const s = this.readJSON(this.SUSPEND_KEY);
    if (!s || s.version !== SAVE_VERSION || !s.state || !s.campaign) return null;
    const idx = s.state.chapterIndex || s.chapterIndex;
    if (!CHAPTERS[idx - 1]) return null;
    return s;
  },

  removeSuspend() {
    try { localStorage.removeItem(this.SUSPEND_KEY); } catch (e) {}
  },

  /* ---------------- 标题 ---------------- */
  refreshTitle() {
    const info = document.getElementById('titleSaveInfo');
    if (!info) return;
    const sus = this.loadSuspend();
    const camp = this.campaign || this.loadCampaign();
    if (sus) {
      const ch = CHAPTERS[sus.chapterIndex - 1];
      const diff = DIFFICULTIES[(sus.campaign && sus.campaign.difficulty) || 'normal'];
      info.textContent = '战局待续 · ' + UI.chapterLabel(ch.id) + ' ' + ch.name + ' · ' + diff.name + '难度';
      return;
    }
    if (!camp) {
      info.textContent = '尚无行旅记录 · 点「新的旅程」入山';
      return;
    }
    const ch = CHAPTERS[camp.chapter - 1];
    const diff = DIFFICULTIES[camp.difficulty] || DIFFICULTIES.normal;
    const cyc = Math.max(1, camp.cycle || 1);
    if (camp.cleared) {
      info.textContent = '旅程已完成 · ' + diff.name + '难度' + (cyc > 1 ? ' · ' + cyc + ' 周目' : '') + ' · 可回营地重游旧章';
    } else {
      info.textContent = '行旅进行中 · ' + (ch ? UI.chapterLabel(ch.id) + ' ' + ch.name : '终章') +
        ' · ' + diff.name + '难度' + (cyc > 1 ? ' · ' + cyc + ' 周目' : '') + ' · 盘缠 ' + camp.gold;
    }
  },

  showTitle() {
    Battle.active = false;
    Battle.B = null;
    Render.clearBattle();
    UI.showScreen('title');
    this.campaign = this.loadCampaign() || this.campaign;
    this.refreshTitle();
    Audio.playMusic('title');
  },

  /* ---------------- 新旅程 ---------------- */
  async askNewJourney(diffKey) {
    const hasSave = !!this.loadCampaign() || !!this.loadSuspend();
    let cycle = 1;
    if (hasSave) {
      const prev = this.loadCampaign();
      if (prev && prev.cleared) {
        const ok = await UI.confirm('再入山海 · 二周目',
          '上一轮旅程已通关。新的旅程将继承难度设定并开启新一轮：传说武器重打保底翻倍（400 金 + 2 印）。',
          '开启新一轮', '重头开始');
        if (ok) cycle = Math.max(1, Math.floor(prev.cycle || 1)) + 1;
      }
      const ok2 = await UI.confirm('新的旅程', '现有的行旅记录与续战存档都会被覆盖。', '重新入山', '再想想');
      if (!ok2) return;
    }
    this.removeSuspend();
    this.campaign = this.newCampaign(diffKey, cycle);
    this.settings.speed = this.settings.speed === 2 ? 2 : 1;
    this.saveCampaign();
    this.currentChapter = 0;
    this.lastDeploy = null;
    UI.showScreen('camp');
    await UI.modal({
      title: '守脉人的路',
      sub: '九脉将枯，浊潮自海眼涌起。',
      body: '<div style="font-size:12px;line-height:1.95;color:#5f5a45;">' +
        '点击我方单位，再点蓝色格移动，随后选择行动。<br>' +
        '站在<b>灵脉阵眼</b>上结束行动即可占领，下个己方阶段起生效。<br>' +
        '武器有耐久；倒下的同伴不会归来，云策倒下则本章失败。<br>' +
        '每章可用「悔棋」回到我方阶段开始。' +
        '</div>',
      buttons: [{ label: '下山', value: true, cls: 'primary' }]
    });
    Camp.show('team');
    UI.toast('先整备队伍，再从「出征」出发');
  },

  continueJourney() {
    const sus = this.loadSuspend();
    if (sus) {
      const camp = this.normalizeCampaign(sus.campaign);
      if (!camp) { this.removeSuspend(); return this.continueJourney(); }
      this.campaign = camp;
      this.currentChapter = sus.chapterIndex;
      this.lastDeploy = null;
      UI.showScreen('battle');
      Render.resize();
      Battle.start({
        chapterIndex: sus.chapterIndex,
        campaign: this.campaign,
        suspended: sus.state
      }).catch(err => {
        console.error(err);
        UI.toast('续战存档读取失败，已返回营地');
        this.removeSuspend();
        Camp.show('team');
      });
      return true;
    }
    const camp = this.loadCampaign();
    if (!camp) {
      UI.toast('尚无行旅记录');
      return false;
    }
    this.campaign = camp;
    this.settings = Object.assign({}, this.settings, camp.settings || {});
    this.applySettings();
    Camp.show('team');
    return true;
  },

  /* ---------------- 章节开始 ---------------- */
  async startChapter(index, deployedIds) {
    if (!this.campaign || this.busy) return;
    const ch = CHAPTERS[index - 1];
    if (!ch) { UI.toast('没有下一章了'); return; }
    this.busy = true;
    try {
      let ids = Array.from(new Set(deployedIds || []))
        .filter(id => this.campaign.roster.some(r => r.id === id));
      if (!ids.includes('yunce')) ids = ['yunce'].concat(ids);
      ids = ids.slice(0, ch.deployCount);
      if (!ids.length) { UI.toast('没有可出战的同伴'); return; }
      this.lastDeploy = ids;
      this.currentChapter = index;
      if (!this.campaign.introSeen[ch.id] && ch.intro && DIALOGUES[ch.intro]) {
        await UI.dialogue(DIALOGUES[ch.intro]);
        this.campaign.introSeen[ch.id] = true;
        this.saveCampaign();
      }
      this.removeSuspend();
      UI.showScreen('battle');
      Render.resize();
      await Battle.start({ chapterIndex: index, campaign: this.campaign, deployedIds: ids });
    } catch (err) {
      console.error(err);
      UI.toast('章节启动失败');
      Camp.show('team');
    } finally {
      this.busy = false;
    }
  },

  async retryChapter(index) {
    if (!this.campaign) return;
    const ids = this.lastDeploy || (Camp.deploySel ? Array.from(Camp.deploySel) : ['yunce']);
    this.removeSuspend();
    UI.showScreen('battle');
    Render.resize();
    await Battle.start({ chapterIndex: index, campaign: this.campaign, deployedIds: ids });
  },

  leaveBattleToCamp(tab) {
    Battle.active = false;
    Battle.B = null;
    Render.clearBattle();
    UI.showScreen('camp');
    Camp.show(tab || 'team');
  },

  /* ---------------- 章节结算 ---------------- */
  async onChapterClear(result) {
    if (!this.campaign || this.busy) return;
    this.busy = true;
    try {
      const ch = CHAPTERS[result.chapterIndex - 1];
      const diff = DIFFICULTIES[this.campaign.difficulty] || DIFFICULTIES.normal;
      const sideOk = !!result.sideSuccess;
      const side = ch.side || null;
      const joined = [];
      const gainedItems = [];

      this.campaign.supports = Object.assign({}, this.campaign.supports, result.supports || {});
      const byId = new Map(this.campaign.roster.map(r => [r.id, r]));
      for (const rec of result.units || []) {
        if (!CHARS[rec.id]) continue;
        const clean = this.normalizeUnitRecord(rec);
        if (byId.has(rec.id)) Object.assign(byId.get(rec.id), clean);
        else {
          this.campaign.roster.push(clean);
          byId.set(rec.id, clean);
          joined.push(rec.id);
        }
      }
      for (const id of result.fallen || []) {
        const idx = this.campaign.roster.findIndex(r => r.id === id);
        if (idx >= 0) this.campaign.roster.splice(idx, 1);
        if (!this.campaign.fallen.includes(id)) this.campaign.fallen.push(id);
      }
      if (!this.campaign.roster.some(r => r.id === 'yunce')) {
        const lord = this.makeRec('yunce');
        if (lord) this.campaign.roster.unshift(lord);
      }

      let gold = (result.loot && result.loot.gold ? result.loot.gold : 0) + ((ch.rewards && ch.rewards.gold) || 0);
      let seals = (result.loot && result.loot.seals ? result.loot.seals : 0);
      const addLoot = keys => {
        for (const key of keys || []) {
          if (key === 'seal') { seals++; continue; }
          const def = WEAPONS[key] || ITEMS[key];
          if (!def) continue;
          gainedItems.push(key);
          if (this.campaign.convoy.length < 60) {
            this.campaign.convoy.push({ key, uses: def.uses || 1 });
          }
        }
      };
      addLoot(result.loot && result.loot.items);
      addLoot(ch.rewards && ch.rewards.items);
      if (sideOk && side) {
        gold += side.gold || 0;
        addLoot(side.items);
        this.campaign.sideCleared[ch.id] = true;
      }
      this.campaign.gold += gold;
      this.campaign.seals += seals;

      for (const id of AUTO_JOINS[ch.id] || []) {
        if (this.campaign.roster.some(r => r.id === id)) continue;
        const rec = this.makeRec(id);
        if (rec) {
          this.campaign.roster.push(rec);
          joined.push(id);
        }
      }
      const order = id => {
        const i = HERO_ORDER.indexOf(id);
        return i < 0 ? 99 : i;
      };
      this.campaign.roster.sort((a, b) => order(a.id) - order(b.id));

      const rec = this.campaign.records;
      rec.chapters[ch.id] = {
        turns: result.turns,
        side: sideOk,
        kills: (result.stats && result.stats.kills) || 0,
        lost: (result.stats && result.stats.lost) || 0
      };
      rec.kills += (result.stats && result.stats.kills) || 0;
      rec.lost += (result.stats && result.stats.lost) || 0;
      rec.recruits += (result.stats && result.stats.recruits) || 0;
      rec.turns += result.turns || 0;
      rec.levels += (result.stats && result.stats.levels) || 0;

      this.campaign.chapter = ch.id + 1;
      if (ch.id >= CHAPTERS.length) this.campaign.cleared = true;
      this.removeSuspend();
      this.saveCampaign();
      this.refreshTitle();

      if (ch.outro && DIALOGUES[ch.outro]) {
        await UI.dialogue(DIALOGUES[ch.outro]);
      }

      const itemNames = gainedItems.map(k => (WEAPONS[k] || ITEMS[k]).name);
      const joinNames = joined.map(id => CHARS[id].name);
      const fallenNames = (result.fallen || []).map(id => CHARS[id] ? CHARS[id].name : id);
      const stats = result.stats || {};
      const nextCh = CHAPTERS[ch.id];
      const rows = [];
      rows.push('<div class="result-stat"><div class="lab">回合</div><div class="val">' + (result.turns || 0) + '</div></div>');
      rows.push('<div class="result-stat"><div class="lab">击破</div><div class="val">' + (stats.kills || 0) + '</div></div>');
      rows.push('<div class="result-stat"><div class="lab">阵亡</div><div class="val">' + (stats.lost || 0) + '</div></div>');
      rows.push('<div class="result-stat"><div class="lab">盘缠</div><div class="val">+' + gold + '</div></div>');
      rows.push('<div class="result-stat"><div class="lab">脉印</div><div class="val">+' + seals + '</div></div>');
      rows.push('<div class="result-stat"><div class="lab">境界提升</div><div class="val">' + (stats.levels || 0) + '</div></div>');
      rows.push('<div class="result-stat"><div class="lab">访问村落</div><div class="val">' + (result.flags ? Object.keys(result.flags.villages || {}).length : 0) + '</div></div>');
      rows.push('<div class="result-stat"><div class="lab">支线</div><div class="val">' + (sideOk ? '达成' : '未成') + '</div></div>');
      rows.push('<div class="result-stat"><div class="lab">难度</div><div class="val">' + diff.name + '</div></div>');

      let list = '';
      if (itemNames.length) list += '<div>战利品：<b>' + itemNames.map(n => UI.escape(n)).join('、') + '</b></div>';
      if (side) list += '<div>支线「' + UI.escape(side.text) + '」' + (sideOk ? '已达成。' : '未达成。') + '</div>';
      if (joinNames.length) list += '<div>新同伴：<b>' + joinNames.map(n => UI.escape(n)).join('、') + '</b></div>';
      if (fallenNames.length) list += '<div style="color:#8b3b2d;">阵亡：' + fallenNames.map(n => UI.escape(n)).join('、') + '。他们将留在行录里。</div>';
      if (nextCh) list += '<div>下一程：<b>' + UI.escape(UI.chapterLabel(nextCh.id) + ' ' + nextCh.name) + '</b></div>';
      else list += '<div><b>九脉已通，山海重明。</b></div>';

      const title = ch.id >= CHAPTERS.length ? '山海重明' : ch.name;
      const kicker = ch.id >= CHAPTERS.length ? '旅 程 终 章' : '章 节 完 成';
      const html = '<div class="result-kicker">' + kicker + '</div>' +
        '<div class="result-title">' + UI.escape(title) + '</div>' +
        '<div class="result-sub">' + UI.escape(UI.chapterLabel(ch.id)) + ' · ' + (result.turns || 0) + ' 回合 · ' + diff.name + '难度</div>' +
        '<div class="result-stats">' + rows.join('') + '</div>' +
        '<div class="result-list">' + list + '</div>' +
        '<div class="result-actions">' +
        '<button id="resultToTitle">回到标题</button>' +
        '<button id="resultNext">' + (nextCh ? '返回营地' : '回望山海') + '</button>' +
        '</div>';
      UI.setResult(html);
      const nextBtn = document.getElementById('resultNext');
      const titleBtn = document.getElementById('resultToTitle');
      if (nextBtn) nextBtn.addEventListener('click', () => {
        if (nextCh) Camp.show('team');
        else this.showTitle();
      });
      if (titleBtn) titleBtn.addEventListener('click', () => this.showTitle());
      Audio.playMusic('camp');
    } catch (err) {
      console.error(err);
      UI.toast('结算写入失败');
      Camp.show('team');
    } finally {
      this.busy = false;
    }
  },

  normalizeUnitRecord(rec) {
    const base = this.makeRec(rec.id);
    let items = Array.isArray(rec.items) ? rec.items.filter(it => it && (WEAPONS[it.key] || ITEMS[it.key])) : base.items;
    if (!items.length) items = base.items;
    return {
      id: rec.id,
      cls: CLASSES[rec.cls] ? rec.cls : base.cls,
      level: Math.max(1, Math.min(MAX_LEVEL, rec.level || base.level)),
      exp: Math.max(0, Math.min(99, rec.exp || 0)),
      stats: Object.assign({}, base.stats, rec.stats || {}),
      ranks: Object.assign({}, base.ranks, rec.ranks || {}),
      items,
      weaponIndex: Math.max(0, Math.min(items.length - 1, rec.weaponIndex || 0))
    };
  },

  onChapterDefeat(reason, chapterIndex) {
    this.removeSuspend();
    const idx = chapterIndex || this.currentChapter;
    const ch = CHAPTERS[idx - 1];
    Audio.stopMusic();
    UI.modal({
      title: '行旅中断',
      sub: reason || '山海的路，在这里断了。',
      body: '<div style="font-size:12px;line-height:1.9;color:#5f5a45;">' +
        '本场战斗的阵亡与进度不会写入行旅记录。<br>' +
        '重新挑战会回到本章开始时的队伍状态。</div>',
      closable: false,
      buttons: [
        { label: '返回标题', value: 'title' },
        { label: '返回营地', value: 'camp' },
        { label: '重新挑战', value: 'retry', cls: 'primary' }
      ]
    }).then(choice => {
      if (choice === 'retry') this.retryChapter(idx);
      else if (choice === 'camp') this.leaveBattleToCamp('team');
      else this.showTitle();
    });
    if (ch) UI.log('战斗失败：' + (reason || ''), 'bad');
  },

  /* ---------------- 设置与帮助 ---------------- */
  openSettings() {
    const body = '<div style="display:flex;flex-direction:column;gap:8px;">' +
      this.settingRow('music', '音乐', '山间五声音阶与战斗脉动') +
      this.settingRow('sfx', '音效', '刀兵、脚步、界面与升级') +
      this.settingRow('speed', '战斗速度', '地图移动与交战的演出节奏') +
      '</div>' +
      '<div style="margin-top:12px;font-size:10px;color:#8a806a;line-height:1.7;">设置会立即生效，并存入行旅存档。音频需一次点击后才会启动。</div>';
    return UI.modal({
      title: '设置',
      sub: '山海路远，按自己的步调走。',
      body,
      buttons: [{ label: '关闭', value: null }],
      onMount: (box) => {
        const refresh = () => {
          const mb = box.querySelector('[data-setting="music"]');
          const sb = box.querySelector('[data-setting="sfx"]');
          const pb = box.querySelector('[data-setting="speed"]');
          if (mb) mb.textContent = this.settings.music ? '开' : '关';
          if (sb) sb.textContent = this.settings.sfx ? '开' : '关';
          if (pb) pb.textContent = '×' + this.settings.speed;
        };
        box.querySelectorAll('[data-setting]').forEach(btn => {
          btn.addEventListener('click', () => {
            const key = btn.dataset.setting;
            if (key === 'music') this.settings.music = !this.settings.music;
            else if (key === 'sfx') this.settings.sfx = !this.settings.sfx;
            else this.settings.speed = this.settings.speed === 2 ? 1 : 2;
            this.applySettings();
            Audio.setMusic(this.settings.music);
            Audio.setSfx(this.settings.sfx);
            if (this.campaign) {
              this.campaign.settings = Object.assign({}, this.campaign.settings, this.settings);
              this.saveCampaign();
            }
            if (Battle.B) Battle.B.speed = this.settings.speed;
            this.saveSettings();
            Audio.sfx('tap');
            refresh();
            if (key === 'music' && this.settings.music) Audio.playMusic(UI.el.title.classList.contains('hidden') ? 'camp' : 'title');
            if (key === 'speed' && Battle.B) UI.updateBattle(Battle.B);
          });
        });
        refresh();
      }
    });
  },

  settingRow(key, name, desc) {
    return '<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:rgba(80,68,45,.07);border-left:2px solid rgba(145,105,58,.42);">' +
      '<div style="flex:1;"><div style="font-size:13px;color:#3f4030;">' + name + '</div>' +
      '<div style="font-size:10px;color:#8a806a;margin-top:2px;">' + desc + '</div></div>' +
      '<button class="mini-btn gold" data-setting="' + key + '" style="min-width:44px;">' + (key === 'speed' ? '×' + this.settings.speed : (this.settings[key] ? '开' : '关')) + '</button>' +
      '</div>';
  },

  showHelp() {
    const body = '<div style="font-size:12px;line-height:1.95;color:#5f5a45;">' +
      '<b>行动</b>　点击我方单位 → 点蓝色格移动 → 选择攻击、杖、道具、访问或待机。<br>' +
      '<b>战斗</b>　武器三角：剑克重刃、重刃克枪、枪克剑。弓对飞行、符对披甲有特效。<br>' +
      '<b>命中</b>　命中越高越稳；暴击造成三倍伤害；攻速差 4 以上可追击，远射可躲开近战反击。<br>' +
      '<b>地形</b>　树林、丘壑、残垣提供回避与减伤；营垒在己方阶段开始回血。<br>' +
      '<b>灵脉阵眼</b>　站在阵眼上结束行动即可占领，下个己方阶段开始生效，持续三个己方阶段。攻脉加命中，生脉回血，行脉加移动，护脉加防。<br>' +
      '<b>成长</b>　击败敌军获得经验，升级随机成长；十级后消耗一枚脉印在营地转职。<br>' +
      '<b>永久死亡</b>　倒下的同伴不会归来；云策倒下则本章失败。每章可在菜单中悔棋，回到我方阶段开始。<br>' +
      '<b>保存</b>　营地与章节结束时自动保存；战斗中每个我方阶段开始写续战存档。' +
      '</div>';
    return UI.modal({
      title: '战斗说明',
      sub: '先看路，再出剑。',
      body,
      buttons: [{ label: '明白了', value: true, cls: 'primary' }]
    });
  },

  /* ---------------- 行录辅助 ---------------- */
  chapterProgressText() {
    if (!this.campaign) return '尚无行旅';
    if (this.campaign.cleared) return '旅程已完成';
    const ch = CHAPTERS[this.campaign.chapter - 1];
    return ch ? UI.chapterLabel(ch.id) + ' ' + ch.name : '终章';
  }
};

if (typeof window !== 'undefined') window.Game = Game;
