/* ============================================================
 * 战役流程：存档、章节推进、结算、续战与标题流转
 * ============================================================ */
const Game = {
  SAVE_KEY: 'shanhaice.save.v4',
  SUSPEND_KEY: 'shanhaice.suspend.v4',
  SETTINGS_KEY: 'shanhaice.settings.v4',
  campaign: null,
  settings: { music: true, sfx: true, speed: 1, battleShow: true },
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
      speed: s && s.speed === 2 ? 2 : 1,
      battleShow: !s || s.battleShow !== false
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

  newCampaign(diffKey, cycle, heroic) {
    const roster = ['yunce', 'yankui', 'luming'].map(id => this.makeRec(id)).filter(Boolean);
    return {
      version: SAVE_VERSION,
      difficulty: DIFFICULTIES[diffKey] ? diffKey : 'normal',
      heroic: !!heroic,
      cycle: Math.max(1, Math.floor(cycle || 1)),
      chapter: 1,
      route: null,
      gold: 800,
      seals: 0,
      roster,
      fallen: [],
      memorial: {},
      relics: [],
      codex: {},
      supports: {},
      knots: {},
      convoy: [{ key: 'potion', uses: 3 }],
      sideCleared: {},
      introSeen: {},
      hintsSeen: {},
      legendary: {},
      legendaryPity: {},
      cleared: false,
      startedAt: Date.now(),
      savedAt: Date.now(),
      settings: { music: this.settings.music, sfx: this.settings.sfx, speed: this.settings.speed, battleShow: this.settings.battleShow !== false },
      records: { chapters: {}, kills: 0, lost: 0, recruits: 0, turns: 0, levels: 0 }
    };
  },

  normalizeCampaign(raw) {
    if (!raw) return null;
    /* v3 → v4：第 4 章末 A/B 分歧；chapter 由位置下标改存章节 id */
    if (raw.version === 3) {
      const mig = Route.migrateLegacyChapter(raw.chapter);
      raw.chapter = mig.chapter;
      raw.route = mig.route;
      if (mig.cleared) raw.cleared = true;
      raw.version = SAVE_VERSION;
    }
    if (raw.version !== SAVE_VERSION) return null;
    const c = raw;
    if (!DIFFICULTIES[c.difficulty]) c.difficulty = 'normal';
    c.heroic = !!c.heroic;
    c.route = (c.route === 'A' || c.route === 'B') ? c.route : null;
    if (!Route.byId(c.chapter)) c.chapter = 1;
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
    /* 强化等级钳制（旧档无 plus 字段；上限 +3） */
    const clampPlus = it => {
      if (it && typeof it.plus !== 'undefined') it.plus = Math.max(0, Math.min(3, Math.floor(it.plus) || 0));
    };
    c.roster.forEach(r => (r.items || []).forEach(clampPlus));
    (c.convoy || []).forEach(clampPlus);
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
        weaponIndex: Math.max(0, Math.min(items.length - 1, r.weaponIndex || 0)),
        /* P2.2 技能继承与熟练度进度：旧档没有则给空，有则原样保留 */
        inherited: Array.isArray(r.inherited) ? r.inherited.filter(s => s && s.name).slice(-INHERIT_CAP) : [],
        rankPts: (r.rankPts && typeof r.rankPts === 'object') ? Object.assign({}, r.rankPts) : {}
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
    /* 英魂碑（P3.3）：memorial 记阵亡生平与传承，relics 存封存的传说兵装 */
    if (!c.memorial || typeof c.memorial !== 'object') c.memorial = {};
    for (const id of Object.keys(c.memorial)) {
      if (!CHARS[id]) delete c.memorial[id];
    }
    if (!Array.isArray(c.relics)) c.relics = [];
    c.relics = c.relics.filter(it => it && (WEAPONS[it.key] || ITEMS[it.key]));
    /* 图鉴解锁表（P3.4）：只保留当前数据表里存在的键 */
    if (!c.codex || typeof c.codex !== 'object') c.codex = {};
    if (typeof CODEX !== 'undefined') {
      const known = new Set(CODEX.map(e => e.key));
      for (const k of Object.keys(c.codex)) {
        if (!known.has(k)) delete c.codex[k];
      }
    }
    /* 心结（P3.2）：旧档没有该字段；已有路线却漏挂时补挂 */
    if (!c.knots || typeof c.knots !== 'object') c.knots = {};
    if (c.route && HEART_KNOTS[c.route] && !c.knots[HEART_KNOTS[c.route].char]) {
      c.knots[HEART_KNOTS[c.route].char] = { resolved: false, route: c.route };
    }
    if (!Array.isArray(c.convoy)) c.convoy = [];
    c.convoy = c.convoy.filter(it => it && (WEAPONS[it.key] || ITEMS[it.key]));
    if (!c.sideCleared || typeof c.sideCleared !== 'object') c.sideCleared = {};
    if (!c.introSeen || typeof c.introSeen !== 'object') c.introSeen = {};
    if (!c.hintsSeen || typeof c.hintsSeen !== 'object') c.hintsSeen = {};
    c.cleared = !!c.cleared || (c.chapter === Route.FINALE && !Route.nextId(c.route, c.chapter));
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
    this.campaign.settings = { music: this.settings.music, sfx: this.settings.sfx, speed: this.settings.speed, battleShow: this.settings.battleShow !== false };
    this.writeJSON(this.SAVE_KEY, this.campaign);
  },

  /* 新手引导（P4）：同一条提示整个战役只弹一次。
   * 返回 true 表示这次真的弹了（测试与调试用）。 */
  hintOnce(key) {
    const c = this.campaign;
    if (!c || !key) return false;
    if (typeof HINTS === 'undefined' || !HINTS[key]) return false;
    if (!c.hintsSeen || typeof c.hintsSeen !== 'object') c.hintsSeen = {};
    if (c.hintsSeen[key]) return false;
    c.hintsSeen[key] = true;
    try { UI.toast(HINTS[key], 5200); } catch (e) { /* 无 DOM 时静默 */ }
    try { this.saveCampaign(); } catch (e) { /* 存档失败不影响战斗 */ }
    return true;
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
    if (!this.campaign || !state) return;
    const id = state.chapterId || state.chapterIndex;
    if (!id || !Route.byId(id)) return;
    const packed = {
      version: SAVE_VERSION,
      chapterId: id,
      campaign: JSON.parse(JSON.stringify(this.campaign)),
      state: JSON.parse(JSON.stringify(state)),
      savedAt: Date.now()
    };
    this.writeJSON(this.SUSPEND_KEY, packed);
  },

  loadSuspend() {
    const s = this.readJSON(this.SUSPEND_KEY);
    if (!s || s.version !== SAVE_VERSION || !s.state || !s.campaign) return null;
    const id = (s.state.chapterId || s.state.chapterIndex) || s.chapterId;
    if (!Route.byId(id)) return null;
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
      const ch = Route.byId((sus.state.chapterId || sus.state.chapterIndex) || sus.chapterId);
      const diff = diffOf(sus.campaign);
      info.textContent = '战局待续 · ' + UI.chapterLabel(ch.no) + ' ' + ch.name + ' · ' + diff.name + '难度';
      return;
    }
    if (!camp) {
      info.textContent = '尚无行旅记录 · 点「新的旅程」入山';
      return;
    }
    const ch = Route.byId(camp.chapter);
    const diff = diffOf(camp);
    const cyc = Math.max(1, camp.cycle || 1);
    if (camp.cleared) {
      info.textContent = '旅程已完成 · ' + diff.name + '难度' + (cyc > 1 ? ' · ' + cyc + ' 周目' : '') + ' · 可回营地重游旧章';
    } else {
      info.textContent = '行旅进行中 · ' + (ch ? UI.chapterLabel(ch.no) + ' ' + ch.name : '终章') +
        (camp.route ? ' · ' + Route.label(camp.route) : '') +
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
  async askNewJourney(diffKey, heroic) {
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
    this.campaign = this.newCampaign(diffKey, cycle, heroic);
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
      this.currentChapter = (sus.state && (sus.state.chapterId || sus.state.chapterIndex)) || sus.chapterId;
      this.lastDeploy = null;
      UI.showScreen('battle');
      Render.resize();
      Battle.start({
        chapterId: this.currentChapter,
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
  async startChapter(chapterId, deployedIds) {
    if (!this.campaign || this.busy) return;
    const ch = Route.byId(chapterId);
    if (!ch) { UI.toast('没有下一章了'); return; }
    this.busy = true;
    try {
      let ids = Array.from(new Set(deployedIds || []))
        .filter(id => this.campaign.roster.some(r => r.id === id));
      if (!ids.includes('yunce')) ids = ['yunce'].concat(ids);
      ids = ids.slice(0, ch.deployCount);
      if (!ids.length) { UI.toast('没有可出战的同伴'); return; }
      this.lastDeploy = ids;
      this.currentChapter = ch.id;
      if (!this.campaign.introSeen[ch.id] && ch.intro && DIALOGUES[ch.intro]) {
        await UI.dialogue(DIALOGUES[ch.intro]);
        this.campaign.introSeen[ch.id] = true;
        this.saveCampaign();
      }
      this.removeSuspend();
      UI.showScreen('battle');
      Render.resize();
      await Battle.start({ chapterId: ch.id, campaign: this.campaign, deployedIds: ids });
    } catch (err) {
      console.error(err);
      UI.toast('章节启动失败');
      Camp.show('team');
    } finally {
      this.busy = false;
    }
  },

  async retryChapter(chapterId) {
    if (!this.campaign) return;
    const ids = this.lastDeploy || (Camp.deploySel ? Array.from(Camp.deploySel) : ['yunce']);
    this.removeSuspend();
    UI.showScreen('battle');
    Render.resize();
    await Battle.start({ chapterId: chapterId, campaign: this.campaign, deployedIds: ids });
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
      const ch = Route.byId(result.chapterId);
      const diff = diffOf(this.campaign);
      const sideOk = !!result.sideSuccess;
      const side = ch.side || null;
      const joined = [];
      const gainedItems = [];

      this.campaign.supports = Object.assign({}, this.campaign.supports, result.supports || {});
      const byId = new Map(this.campaign.roster.map(r => [r.id, r]));
      const rankUps = [];
      for (const rec of result.units || []) {
        if (!CHARS[rec.id]) continue;
        const prev = byId.get(rec.id) || null;
        const clean = this.normalizeUnitRecord(rec, prev);
        if (prev) Object.assign(prev, clean);
        else {
          this.campaign.roster.push(clean);
          byId.set(rec.id, clean);
          joined.push(rec.id);
        }
        for (const up of this.applyRankGrowth(rec)) rankUps.push(up);
      }
      const legacies = [];
      for (const id of result.fallen || []) {
        const legacy = this.passOnLegacy(id, ch.id);
        if (legacy) legacies.push(legacy);
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
            if (def.stack) {   // 材料堆叠
              const st = this.campaign.convoy.find(i => i.key === key);
              if (st) { st.uses = (st.uses || 0) + (def.uses || 1); continue; }
            }
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
          /* 替补援军（P3.3）：等级对齐队伍平均，免得第 5 章后进来的人形同虚设 */
          if (CHARS[id] && CHARS[id].reserve) this.alignLevel(rec, this.averageLevel());
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

      if (ch.outro && DIALOGUES[ch.outro]) {
        await UI.dialogue(DIALOGUES[ch.outro]);
      }

      /* 分歧点：第 4 章末「追与守」二选一（P3.1） */
      if (ch.id === 4 && !this.campaign.route) {
        const pick = await this.chooseRoute();
        this.campaign.route = pick;
        this.applyKnots(pick);
        this.saveCampaign();
      }
      const nextId = Route.nextId(this.campaign.route, ch.id);
      this.campaign.chapter = nextId;
      if (!nextId) this.campaign.cleared = true;
      /* 图鉴（P3.4）：并入本章击破的敌型；本章若为遗迹所在地，解锁遗迹条目 */
      if (!this.campaign.codex || typeof this.campaign.codex !== 'object') this.campaign.codex = {};
      for (const k of Object.keys(result.codex || {})) this.campaign.codex[k] = true;
      for (const e of (typeof CODEX !== 'undefined' ? CODEX : [])) {
        if (e.kind === 'ruin' && String(e.chapter) === String(ch.id)) this.campaign.codex[e.key] = true;
      }
      /* 勇者模式通关授徽（P3.4） */
      if (!nextId && this.campaign.heroic) {
        if (!this.campaign.records) this.campaign.records = { chapters: {} };
        this.campaign.records.heroicBadge = true;
      }
      this.removeSuspend();
      this.saveCampaign();
      this.refreshTitle();

      const itemNames = gainedItems.map(k => (WEAPONS[k] || ITEMS[k]).name);
      const joinNames = joined.map(id => CHARS[id].name);
      const fallenNames = (result.fallen || []).map(id => CHARS[id] ? CHARS[id].name : id);
      const stats = result.stats || {};
      const nextCh = Route.byId(nextId);
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
      if (rankUps.length) list += '<div>熟练精进：<b>' + rankUps.map(u =>
        UI.escape(CHARS[u.id].name) + '·' + UI.escape((WEAPON_TYPES[u.wt] && WEAPON_TYPES[u.wt].name) || u.wt) +
        ' ' + u.from + '→' + u.to).join('、') + '</b></div>';
      if (fallenNames.length) list += '<div style="color:#8b3b2d;">阵亡：' + fallenNames.map(n => UI.escape(n)).join('、') + '。他们将留在行录里。</div>';
      for (const lg of legacies) {
        const parts = [];
        if (lg.skill) parts.push('「' + UI.escape(lg.skill) + '」');
        if (lg.weapon) parts.push(UI.escape((WEAPONS[lg.weapon] || {}).name || lg.weapon));
        let line = '<div style="color:#7a4a35;">殉志传承：' + UI.escape(lg.name) + ' 把 ' +
          (parts.length ? parts.join(' 与 ') : '遗志') + ' 交给了 ' + UI.escape(lg.heirName || '同行者') + '。</div>';
        if (lg.sealed) line += '<div style="color:#8a806a;font-size:10px;">' + UI.escape((WEAPONS[lg.sealed] || {}).name || lg.sealed) + ' 无人能持，已封存于行囊。</div>';
        list += line;
      }
      if (nextCh) list += '<div>下一程：<b>' + UI.escape(UI.chapterLabel(nextCh.no) + ' ' + nextCh.name) +
        (nextCh.route ? '（' + UI.escape(Route.label(this.campaign.route)) + '）' : '') + '</b></div>';
      /* 终章：按「存活人数 × A 级支援组数 × 三阵眼是否全控」给尾声（P3.4） */
      let ending = null;
      if (!nextId) {
        ending = endingOf({
          alive: this.campaign.roster.length,
          rankA: SUPPORTS.filter(p => Combat.supportRank(this.campaign.supports[p.id] || 0) === 'A').length,
          nodesHeld: result.nodesHeld || 0,
          nodesTotal: result.nodesTotal || 0
        });
        this.campaign.ending = ending.key;
        const m = ending.metrics;
        list += '<div class="ending-block">' +
          '<div class="ending-kicker">' + UI.escape(ending.kicker) + '</div>' +
          '<div class="ending-name">' + UI.escape(ending.name) + '</div>' +
          ending.lines.map(t => '<p>' + UI.escape(t) + '</p>').join('') +
          '<div class="ending-metrics">同行 ' + m.alive + ' 人 · A 级羁绊 ' + m.rankA + ' 组 · 阵眼 ' +
          m.nodesHeld + '/' + m.nodesTotal + '</div></div>';
      }

      const title = !nextId ? (ending ? ending.name : '山海重明') : ch.name;
      const kicker = !nextId ? (ending ? ending.kicker : '旅 程 终 章') : '章 节 完 成';
      const html = '<div class="result-kicker">' + kicker + '</div>' +
        '<div class="result-title">' + UI.escape(title) + '</div>' +
        '<div class="result-sub">' + UI.escape(UI.chapterLabel(ch.no)) + ' · ' + (result.turns || 0) + ' 回合 · ' + diff.name + '难度</div>' +
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

  /* ---------------- 路线分歧（P3.1） ----------------
   * 第 4 章末「追与守」二选一：先演军帐对话，再出抉择弹层。
   * 返回 'A'（焚脉·追）或 'B'（守脉·守），写入 campaign.route 后不可更改。 */
  async chooseRoute() {
    if (DIALOGUES.ch4_route) await UI.dialogue(DIALOGUES.ch4_route);
    const card = (key) => {
      const r = ROUTES[key];
      return '<div style="padding:10px 12px;background:rgba(80,68,45,.06);border-left:2px solid rgba(145,105,58,.45);">' +
        '<div style="font-size:13px;color:#3a3423;"><b>' + UI.escape(r.title) + '</b>' +
        '<span style="margin-left:8px;color:#8a6b3a;">「' + UI.escape(r.slogan) + '」</span></div>' +
        '<div style="font-size:11px;color:#6b6450;margin-top:4px;line-height:1.85;">' + UI.escape(r.desc) + '</div></div>';
    };
    const pick = await UI.modal({
      title: '追 与 守',
      sub: '两条路，只能走一条。另一条，交给留下的那一半人心结。',
      body: '<div style="display:flex;flex-direction:column;gap:8px;">' + card('A') + card('B') + '</div>' +
        '<div style="margin-top:10px;font-size:10px;color:#8a806a;line-height:1.7;">' +
        '选定后不可更改。两条线各有三章独立地图、同伴与剧情，第 8 章天柱废墟汇合，共赴浊潮之眼。</div>',
      buttons: [
        { label: '追 · 焚脉', value: 'A', cls: 'primary' },
        { label: '守 · 守脉', value: 'B', cls: 'gold' }
      ],
      closable: false
    });
    return pick === 'B' ? 'B' : 'A';
  },

  /* 心结：选定路线后，把「被放弃的那条路」挂到对应角色身上（P3.2） */
  applyKnots(route) {
    const spec = HEART_KNOTS[route];
    if (!spec) return null;
    this.campaign.knots = this.campaign.knots || {};
    this.campaign.knots[spec.char] = { resolved: false, route: route };
    return spec;
  },

  /* 心结汇总：{ open: [charId], resolved: [charId], all: [charId], cleared: bool } */
  knotSummary(campaign) {
    const c = campaign || this.campaign;
    const knots = (c && c.knots) || {};
    const all = Object.keys(knots).filter(id => CHARS[id]);
    const open = all.filter(id => !knots[id].resolved);
    return { all, open, resolved: all.filter(id => knots[id].resolved), cleared: all.length > 0 && open.length === 0 };
  },

  /* 熟练度成长（P2.2）：本章各武器类型的出手次数累加到 rec.rankPts，
   * 满 RANK_UP_USES 升一阶（D→C→B→A→S），升阶后扣掉阈值、余数留到下章。
   * 规则本体在 Battle.rankGrowth（纯函数，可单测），此处只负责定位存档行。
   * 返回本章升阶记录供结算面板展示。 */
  applyRankGrowth(rec) {
    const row = this.campaign && this.campaign.roster.find(r => r.id === rec.id);
    if (!row || !rec || !rec.weaponUses) return [];
    if (!row.rankPts || typeof row.rankPts !== 'object') row.rankPts = {};
    if (!row.ranks || typeof row.ranks !== 'object') row.ranks = {};
    return Battle.rankGrowth(row.ranks, row.rankPts, rec.weaponUses)
      .map(u => Object.assign({ id: rec.id }, u));
  },

  /* 队伍平均等级（替补援军对齐用） */
  averageLevel() {
    const roster = (this.campaign && this.campaign.roster) || [];
    if (!roster.length) return 1;
    const sum = roster.reduce((s, r) => s + (r.level || 1), 0);
    return Math.round(sum / roster.length);
  },

  /* 替补援军等级对齐（P3.3）：按成长率的期望值补足属性，而不是随机 roll——
   * 同一存档无论何时入队，数值都一样，测试也好断言。 */
  alignLevel(rec, target) {
    const base = CHARS[rec.id];
    if (!base || !rec) return rec;
    const to = Math.max(base.level, Math.min(MAX_LEVEL, Math.round(target || base.level)));
    const up = to - base.level;
    if (up > 0) {
      for (const k of STAT_ORDER) {
        const g = (base.growth && base.growth[k]) || 0;
        const add = Math.round(g / 100 * up);
        if (add > 0) rec.stats[k] = Math.min(STAT_CAPS[k] || 99, (rec.stats[k] || 0) + add);
      }
    }
    rec.level = to;
    return rec;
  },

  /* 殉志传承（P3.3）：阵亡者把一条个人技（或继承技，职业技能不传）交给支援等级最高的
   * 存活者；传说兵装随传承，类型/熟练度不符或行囊满则封存进 campaign.relics，不凭空消失。
   * 返回传承记录，写进 campaign.memorial 供英魂碑展示。须在死者移出 roster 之前调用。 */
  passOnLegacy(fallenId, chapterId) {
    const c = this.campaign;
    const base = CHARS[fallenId];
    if (!base) return null;
    const dead = c.roster.find(r => r.id === fallenId) || null;
    if (!c.memorial || typeof c.memorial !== 'object') c.memorial = {};
    if (!Array.isArray(c.relics)) c.relics = [];
    const rec = {
      id: fallenId, name: base.name,
      cls: dead ? dead.cls : base.cls,
      chapter: chapterId || null,
      heir: null, heirName: null,
      skill: null, weapon: null, sealed: null,
      epitaph: (typeof EPITAPHS !== 'undefined' && EPITAPHS[fallenId]) || ''
    };
    /* 继承者：存活者中支援点数最高者；同分取等级高的；都没有支援就取等级最高 */
    const pairOf = (a, b) => SUPPORT_PAIR_MAP[a + '_' + b] || SUPPORT_PAIR_MAP[b + '_' + a] || null;
    let best = null;
    for (const r of c.roster) {
      if (r.id === fallenId) continue;
      const pair = pairOf(fallenId, r.id);
      const pts = pair ? (c.supports[pair.id] || 0) : 0;
      const key = pts * 100 + (r.level || 0);
      if (!best || key > best.key) best = { row: r, key };
    }
    if (!best) return rec;                       // 全队只剩死者：无人可传
    const heir = best.row;
    rec.heir = heir.id;
    rec.heirName = CHARS[heir.id] ? CHARS[heir.id].name : heir.id;

    /* 技能：个人技① → 个人技② → 死者已有的继承技；继承者已会的跳过 */
    const cands = [base.personal, base.personal2].filter(s => s && s.name);
    if (dead && Array.isArray(dead.inherited)) cands.push(...dead.inherited);
    const pick = cands.find(s => !(heir.inherited || []).some(x => x && x.name === s.name));
    if (pick) {
      if (!Array.isArray(heir.inherited)) heir.inherited = [];
      heir.inherited.push(JSON.parse(JSON.stringify(pick)));
      while (heir.inherited.length > INHERIT_CAP) heir.inherited.shift();
      rec.skill = pick.name;
    }

    /* 传说兵装：类型相符 + 熟练度够 + 行囊未满才随传承，否则封存 */
    const legend = ((dead && dead.items) || []).find(it => it && LEGENDARY_WEAPONS[it.key]);
    if (legend) {
      const w = WEAPONS[legend.key];
      const heirCls = CLASSES[heir.cls];
      const canCarry = !!(w && heirCls && (heirCls.weapons || []).includes(w.type) &&
        RANK_ORDER[heir.ranks[w.type]] !== undefined &&
        RANK_ORDER[heir.ranks[w.type]] >= RANK_ORDER[w.rank] &&
        (heir.items || []).length < 5);
      const copy = JSON.parse(JSON.stringify(legend));
      if (canCarry) {
        heir.items = heir.items || [];
        heir.items.push(copy);
        rec.weapon = legend.key;
      } else {
        c.relics.push(copy);
        rec.sealed = legend.key;
      }
    }
    c.memorial[fallenId] = rec;
    return rec;
  },

  normalizeUnitRecord(rec, prev) {
    const base = this.makeRec(rec.id);
    let items = Array.isArray(rec.items) ? rec.items.filter(it => it && (WEAPONS[it.key] || ITEMS[it.key])) : base.items;
    if (!items.length) items = base.items;
    /* 技能继承（P2.2）：战报带了就覆盖，没带就沿用旧档里的，避免普通章节把继承技洗掉 */
    let inherited = [];
    if (Array.isArray(rec.inherited)) inherited = rec.inherited.filter(s => s && s.name).slice(-INHERIT_CAP);
    else if (prev && Array.isArray(prev.inherited)) inherited = prev.inherited.slice(-INHERIT_CAP);
    const rankPts = Object.assign({}, (prev && prev.rankPts) || {}, rec.rankPts || {});
    return {
      id: rec.id,
      cls: CLASSES[rec.cls] ? rec.cls : base.cls,
      level: Math.max(1, Math.min(MAX_LEVEL, rec.level || base.level)),
      exp: Math.max(0, Math.min(99, rec.exp || 0)),
      stats: Object.assign({}, base.stats, rec.stats || {}),
      ranks: Object.assign({}, base.ranks, rec.ranks || {}),
      items,
      weaponIndex: Math.max(0, Math.min(items.length - 1, rec.weaponIndex || 0)),
      inherited,
      rankPts
    };
  },

  onChapterDefeat(reason, chapterId) {
    this.removeSuspend();
    const id = chapterId || this.currentChapter;
    const ch = Route.byId(id);
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
      if (choice === 'retry') this.retryChapter(id);
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
      this.settingRow('battleShow', '横版演出', '攻击时切换全身立绘对峙画面，底部显示克制与弱点') +
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
          const vb = box.querySelector('[data-setting="battleShow"]');
          if (mb) mb.textContent = this.settings.music ? '开' : '关';
          if (sb) sb.textContent = this.settings.sfx ? '开' : '关';
          if (pb) pb.textContent = '×' + this.settings.speed;
          if (vb) vb.textContent = this.settings.battleShow !== false ? '开' : '关';
        };
        box.querySelectorAll('[data-setting]').forEach(btn => {
          btn.addEventListener('click', () => {
            const key = btn.dataset.setting;
            if (key === 'music') this.settings.music = !this.settings.music;
            else if (key === 'sfx') this.settings.sfx = !this.settings.sfx;
            else if (key === 'battleShow') this.settings.battleShow = this.settings.battleShow === false;
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
    const ch = Route.byId(this.campaign.chapter);
    return ch ? UI.chapterLabel(ch.no) + ' ' + ch.name : '终章';
  }
};

if (typeof window !== 'undefined') window.Game = Game;
