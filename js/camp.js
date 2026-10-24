/* ============================================================
 * 营地：队伍整备、市集、羁绊、行录与出征
 * ============================================================ */
const Camp = {
  tab: 'team',
  selectedId: null,
  shopTab: 'weapon',
  deploySel: null,
  deployChapter: 0,

  init() {
    const tabs = document.getElementById('campTabs');
    if (tabs) {
      tabs.addEventListener('click', e => {
        const btn = e.target.closest('button[data-tab]');
        if (!btn) return;
        Audio.sfx('tap');
        this.show(btn.dataset.tab);
      });
    }
    const body = document.getElementById('campBody');
    if (body) {
      body.addEventListener('click', e => {
        const btn = e.target.closest('[data-act]');
        if (!btn || btn.disabled) return;
        Audio.sfx('tap');
        this.handleAction(btn).catch(err => {
          console.error(err);
          UI.toast('操作失败');
        });
      });
    }
    const titleBtn = document.getElementById('campTitleBtn');
    if (titleBtn) titleBtn.addEventListener('click', () => Game.showTitle());
  },

  show(tab) {
    if (!Game.campaign) {
      Game.showTitle();
      return;
    }
    let next = tab || this.tab || 'team';
    if (next === 'deploy' && (Game.campaign.cleared || !CHAPTERS[Game.campaign.chapter - 1])) {
      next = 'record';
      UI.toast('九脉已通，可回看行录');
    }
    this.tab = next;
    UI.showScreen('camp');
    Audio.playMusic('camp');
    this.render();
  },

  render() {
    const c = Game.campaign;
    if (!c) return;
    const gold = document.getElementById('campGold');
    const seals = document.getElementById('campSeals');
    if (gold) gold.textContent = c.gold;
    if (seals) seals.textContent = c.seals;
    const tabs = document.getElementById('campTabs');
    if (tabs) {
      tabs.querySelectorAll('button[data-tab]').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === this.tab);
      });
    }
    const roster = c.roster;
    if (!roster.some(r => r.id === this.selectedId)) {
      this.selectedId = roster[0] ? roster[0].id : null;
    }
    const body = document.getElementById('campBody');
    if (!body) return;
    if (this.tab === 'team') this.renderTeam(body);
    else if (this.tab === 'shop') this.renderShop(body);
    else if (this.tab === 'forge') this.renderForge(body);
    else if (this.tab === 'support') this.renderSupport(body);
    else if (this.tab === 'record') this.renderRecord(body);
    else if (this.tab === 'deploy') this.renderDeploy(body);
  },

  /* ============================================================
   * 队伍
   * ============================================================ */
  renderTeam(body) {
    const c = Game.campaign;
    const list = c.roster.map(rec => this.rosterCard(rec)).join('');
    const rec = c.roster.find(r => r.id === this.selectedId) || c.roster[0];
    body.innerHTML = '<div class="camp-list">' + list + '</div>' +
      '<div class="camp-detail">' + (rec ? this.unitDetail(rec) : '<div class="item-empty">队伍中没有同伴。</div>') + '</div>';
  },

  rosterCard(rec) {
    const base = CHARS[rec.id];
    const cls = CLASSES[rec.cls] || {};
    const active = rec.id === this.selectedId ? ' active' : '';
    return '<button class="roster-card' + active + '" data-act="selectUnit" data-id="' + rec.id + '">' +
      UI.portraitHTML(base.name) +
      '<span class="roster-meta"><span class="roster-name">' + UI.escape(base.name) + '</span>' +
      '<span class="roster-sub">' + UI.escape(cls.name || '') + ' · ' + (rec.id === 'yunce' ? '守脉人' : '同行') + '</span></span>' +
      '<span class="roster-lv">Lv.' + rec.level + '</span></button>';
  },

  unitDetail(rec) {
    const base = CHARS[rec.id];
    const cls = CLASSES[rec.cls] || {};
    const nextCls = cls.promote ? CLASSES[cls.promote] : null;
    const stats = STAT_ORDER.map(k =>
      '<div class="stat-cell"><div class="lab">' + (STAT_NAMES[k] || k) + '</div>' +
      '<span class="val">' + (rec.stats[k] || 0) + '</span><span class="grow">' + ((base.growth && base.growth[k]) || 0) + '%</span></div>'
    ).join('');
    const img = 'assets/portraits/' + rec.id + '.svg';
    const equip = rec.items.map((it, i) => this.itemRow(rec, it, i)).join('') ||
      '<div class="item-empty">行囊空着。</div>';
    const convoy = (Game.campaign.convoy || []).map((it, i) => {
      const def = WEAPONS[it.key] || ITEMS[it.key];
      if (!def) return '';
      const full = rec.items.length >= 5;
      return '<div class="convoy-item"><span class="inv-name">' + UI.escape(def.name) +
        '<small style="color:#83795f;margin-left:6px;">' + (WEAPONS[it.key] ? '耐久 ' + it.uses + '/' + def.uses : '× ' + it.uses) + '</small></span>' +
        '<button class="mini-btn" data-act="take" data-i="' + i + '"' + (full ? ' disabled' : '') + '>携带</button></div>';
    }).join('') || '<div class="item-empty">行囊里没有多余兵装。</div>';
    const canLevel = rec.level >= PROMO_LEVEL;
    const branches = this.promoteBranches(cls);
    const promoBtn = nextCls
      ? '<button class="mini-btn gold" data-act="promote" data-id="' + rec.id + '"' + (canLevel && Game.campaign.seals > 0 ? '' : ' disabled') + '>转职 · ' + (branches.length > 1 ? branches.map(b => b.name).join(' / ') : nextCls.name) + '</button>'
      : '';
    const promoHint = nextCls
      ? '<div class="promo-hint">' + (canLevel ? '' : '需 Lv.' + PROMO_LEVEL + '。') +
        '消耗脉印 1 枚（现有 ' + Game.campaign.seals + '）。转职后习得「' +
        (branches.length > 1 ? branches.map(b => b.name + '（' + (b.skill ? b.skill.name : '新技') + '）').join(' 或 ') : (nextCls.skill ? nextCls.skill.name : '新技')) + '」。</div>'
      : '<div class="promo-hint">此职业已至化境。</div>';

    return '<div class="unit-hero">' +
      '<div class="unit-portrait"><div class="portrait-fallback">' + UI.escape(base.name.charAt(0)) + '</div>' +
      '<img src="' + img + '" alt="" onerror="this.style.display=\'none\'"></div>' +
      '<div class="unit-id"><div class="unit-name">' + UI.escape(base.name) + '</div>' +
      '<div class="unit-class">' + UI.escape(cls.name || '') + ' · Lv.' + rec.level + ' · ' + (rec.exp || 0) + '/100</div>' +
      '<div class="unit-skillline">职业技：<b>' + UI.escape((cls.skill && cls.skill.name) || '—') + '</b>　' + UI.escape((cls.skill && cls.skill.desc) || '') + '</div>' +
      '<div class="unit-skillline">个人技：<b>' + UI.escape((base.personal && base.personal.name) || '—') + '</b>　' + UI.escape((base.personal && base.personal.desc) || '') + '</div>' +
      '<div class="unit-bio">' + UI.escape(base.bio || '') + '</div></div></div>' +
      '<h4>能力</h4><div class="stat-grid">' + stats + '</div>' +
      '<h4>兵装</h4>' + equip +
      '<div class="detail-actions">' + promoBtn + '</div>' + promoHint +
      '<h4>行囊</h4>' + convoy;
  },

  itemRow(rec, it, i) {
    const w = WEAPONS[it.key];
    const d = ITEMS[it.key];
    if (!w && !d) return '';
    const equipped = w && rec.weaponIndex === i;
    const canEquip = w ? Combat.canEquipKey(rec, it.key) : false;
    const meta = w
      ? '耐久 ' + it.uses + '/' + (w.uses || 1) + ' · ' + (w.magic ? '灵' : '力') + '+' + w.mt + ' · 命中 ' + w.hit
      : '剩余 ' + it.uses + ' 次 · 回复 ' + (d.heal || 0);
    const max = w ? (w.uses || 1) : 0;
    const missing = w ? Math.max(0, max - it.uses) : 0;
    const cost = w ? this.repairCost(w, it) : 0;
    return '<div class="inv-item"><span class="inv-name">' + UI.escape(w ? w.name : d.name) +
      (w ? ' <span style="font-family:var(--sans);font-size:9px;color:#8a806a;">' + w.rank + ' · ' + (WEAPON_TYPES[w.type] ? WEAPON_TYPES[w.type].name : '') + '</span>' : '') +
      '<div class="inv-meta">' + meta + '</div></span>' +
      (w ? (equipped
        ? '<span class="mini-btn gold" style="pointer-events:none;">已装备</span>'
        : '<button class="mini-btn" data-act="equip" data-i="' + i + '"' + (canEquip ? '' : ' disabled') + '>装备</button>') : '') +
      (w && missing > 0 ? '<button class="mini-btn" data-act="repair" data-i="' + i + '" title="修补 ' + cost + ' 盘缠">修 ' + cost + '</button>' : '') +
      (rec.items.length > 1 ? '<button class="mini-btn danger" data-act="store" data-i="' + i + '">存入</button>' : '') +
      '</div>';
  },

  repairCost(def, item) {
    const max = def.uses || 1;
    const missing = Math.max(0, max - item.uses);
    return Math.max(15, Math.round((def.price || 100) * (missing / max) * 0.55));
  },

  /* ============================================================
   * 市集
   * ============================================================ */
  renderForge(body) {
    const c = Game.campaign;
    const gate = rank => {
      if (rank === 'D') return 1;
      if (rank === 'C') return 2;
      if (rank === 'B') return 4;
      if (rank === 'A') return 6;
      return 8;
    };
    const order = { sword: 1, axe: 2, lance: 3, bow: 4, tome: 5, talisman: 6, dagger: 7, staff: 8 };
    const list = Object.keys(WEAPONS)
      .filter(key => Forge.canCraft(key) && WEAPONS[key].type !== 'beast' && gate(WEAPONS[key].rank) <= c.chapter)
      .sort((a, b) => (order[WEAPONS[a].type] || 9) - (order[WEAPONS[b].type] || 9) || (WEAPONS[a].mt || 0) - (WEAPONS[b].mt || 0));
    const rows = list.map(key => {
      const def = WEAPONS[key];
      const cost = Forge.cost(key);
      const desc = (WEAPON_TYPES[def.type] ? WEAPON_TYPES[def.type].name : '') + ' · ' + def.rank +
        ' · 威力 ' + def.mt + ' · 命中 ' + def.hit + (def.uses ? ' · 耐久 ' + def.uses : '');
      const afford = c.gold >= cost.gold && c.seals >= cost.seals && c.convoy.length < 60;
      return '<div class="shop-row"><span class="s-name">' + UI.escape(def.name) +
        '<div class="s-desc">' + UI.escape(desc) + '</div></span>' +
        '<span class="s-price">' + cost.gold + ' 金' + (cost.seals ? ' + ' + cost.seals + ' 印' : '') + '</span>' +
        '<button class="shop-buy" data-act="forge" data-key="' + key + '"' + (afford ? '' : ' disabled') + '>打造</button></div>';
    }).join('');
    const legend = Object.keys(LEGENDARY_WEAPONS).map(key => {
      const w = LEGENDARY_WEAPONS[key];
      const owned = Legendary.isOwned(c, key);
      const boss = ENEMY_TYPES[w.source];
      const d = Legendary.dropChance(c, w.source);
      const prog = owned ? '' :
        '<div class="s-desc" style="color:#b08540;">本次讨伐掉率 ' + Math.round(d.chance * 100) + '%' +
        (d.guaranteed ? '（必掉）' : ' · 缘 ' + d.since + '/' + d.hardPity + (d.ngplus ? ' · 周目加成' : '')) + '</div>';
      return '<div class="shop-row"><span class="s-name">' + UI.escape(w.name) +
        '<div class="s-desc">' + UI.escape((boss ? boss.name : w.source) + ' · ' + w.desc) + '</div>' + prog + '</span>' +
        '<span class="s-price" style="color:' + (owned ? '#9fd39a' : '#c9a37a') + '">' + (owned ? '已入手' : '未获得') + '</span>' +
        '<span class="s-desc" style="max-width:180px;text-align:right;">' + UI.escape(Legendary.hint(key)) + '</span></div>';
    }).join('');
    body.innerHTML = '<div class="shop-wrap">' +
      '<div class="shop-col"><h3>打 造</h3>' +
      '<div class="shop-note">以盘缠与脉印请匠人开炉。高阶兵装还需脉印，品质与市集无异，打造的兵装进入行囊。</div>' +
      (rows || '<div class="item-empty">当前章节无可打造的兵装。</div>') +
      '</div>' +
      '<div class="shop-col"><h3>传说图鉴</h3>' +
      '<div class="shop-note">七把传说兵器各随一位守关首领，每次讨伐仅有极小概率直接掉落；未掉则缘值累积、掉率攀升，满 ' +
      Legendary.DROP.hardPity + ' 次必得，二周目起基础掉率提升。已持有后重打转化为盘缠与脉印（二周目翻倍）。传说兵器不可打造。</div>' +
      legend +
      '<div class="shop-note" style="margin-top:10px;">已收录 ' + Legendary.ownedCount(c) + ' / 7</div>' +
      '</div></div>';
  },

  renderShop(body) {
    const c = Game.campaign;
    const isWeapon = this.shopTab !== 'item';
    const stock = isWeapon ? this.weaponStock() : this.itemStock();
    const rows = stock.map(s => {
      const def = s.def;
      const desc = WEAPONS[s.key]
        ? (WEAPON_TYPES[def.type] ? WEAPON_TYPES[def.type].name : '') + ' · ' + def.rank + ' · 威力 ' + def.mt + ' · 命中 ' + def.hit + (def.uses ? ' · 耐久 ' + def.uses : '')
        : def.desc;
      return '<div class="shop-row"><span class="s-name">' + UI.escape(def.name) +
        '<div class="s-desc">' + UI.escape(desc) + '</div></span>' +
        '<span class="s-price">' + def.price + '</span>' +
        '<button class="shop-buy" data-act="buy" data-kind="' + (isWeapon ? 'weapon' : 'item') + '" data-key="' + s.key + '"' + (c.gold < def.price ? ' disabled' : '') + '>购入</button></div>';
    }).join('');
    const repairs = [];
    for (const rec of c.roster) {
      for (const it of rec.items) {
        const def = WEAPONS[it.key];
        if (!def) continue;
        const missing = Math.max(0, (def.uses || 1) - it.uses);
        if (missing <= 0) continue;
        const cost = this.repairCost(def, it);
        repairs.push('<div class="repair-row"><span class="s-name">' + UI.escape(CHARS[rec.id].name) + ' · ' + UI.escape(def.name) +
          '<div class="s-desc">耐久 ' + it.uses + '/' + def.uses + '</div></span>' +
          '<span class="s-price">' + cost + '</span>' +
          '<button class="shop-buy" data-act="repair" data-id="' + rec.id + '" data-key="' + it.key + '"' + (c.gold < cost ? ' disabled' : '') + '>修补</button></div>');
      }
    }
    body.innerHTML = '<div class="shop-wrap">' +
      '<div class="shop-col"><h3>市 集</h3>' +
      '<div class="shop-tabs">' +
      '<button data-act="shopTab" data-tab="weapon" class="' + (isWeapon ? 'active' : '') + '">兵装</button>' +
      '<button data-act="shopTab" data-tab="item" class="' + (!isWeapon ? 'active' : '') + '">药物</button></div>' +
      '<div class="shop-note">购入的兵装与药物进入行囊，在「队伍」中交给同伴。' + (isWeapon ? '' : '脉印可直接向行商购得。') + '</div>' +
      rows + '</div>' +
      '<div class="shop-col"><h3>修 补</h3>' +
      (repairs.length ? repairs.join('') : '<div class="item-empty">所有兵装都还完好。</div>') +
      '<h3 style="margin-top:16px;">行 囊</h3>' +
      '<div class="shop-note">行囊共 ' + c.convoy.length + ' 件。战利品也会先存入这里。</div>' +
      '<div class="shop-note" style="margin-top:10px;">盘缠 ' + c.gold + ' · 脉印 ' + c.seals + '</div>' +
      '<div class="item-empty" style="line-height:1.8;">升级到 Lv.10 后，在队伍详情中消耗脉印转职。转职保留等级与经验，并提升武器资质。</div>' +
      '</div></div>';
  },

  weaponStock() {
    const chapter = Game.campaign.chapter;
    const gate = rank => {
      if (rank === 'D') return 1;
      if (rank === 'C') return 2;
      if (rank === 'B') return 4;
      if (rank === 'A') return 6;
      return 8;
    };
    const order = { sword: 1, axe: 2, lance: 3, bow: 4, tome: 5, talisman: 6, dagger: 7, staff: 8 };
    return Object.keys(WEAPONS)
      .map(key => ({ key, def: WEAPONS[key] }))
      .filter(s => s.def.price > 0 && !s.def.unique && s.def.type !== 'beast' && gate(s.def.rank) <= chapter)
      .sort((a, b) => (order[a.def.type] || 9) - (order[b.def.type] || 9) || (a.def.mt || 0) - (b.def.mt || 0));
  },

  itemStock() {
    const chapter = Game.campaign.chapter;
    const list = [];
    for (const key of ['potion', 'herb', 'elixir']) {
      const def = ITEMS[key];
      if (!def) continue;
      const min = key === 'potion' ? 1 : key === 'herb' ? 1 : 3;
      if (chapter >= min) list.push({ key, def });
    }
    list.push({ key: 'seal', def: ITEMS.seal });
    return list;
  },

  /* ============================================================
   * 羁绊
   * ============================================================ */
  renderSupport(body) {
    const c = Game.campaign;
    const rosterIds = c.roster.map(r => r.id);
    const cards = SUPPORTS.map(pair => {
      const unlocked = rosterIds.includes(pair.a) && rosterIds.includes(pair.b);
      const points = c.supports[pair.id] || 0;
      const rank = Combat.supportRank(points) || '—';
      const next = points < 20 ? 20 : points < 50 ? 50 : points < 90 ? 90 : 90;
      const pct = Math.min(100, Math.round(points / 90 * 100));
      const buttons = ['C', 'B', 'A'].map(r => {
        const need = r === 'C' ? 20 : r === 'B' ? 50 : 90;
        const ok = unlocked && points >= need;
        return '<button class="mini-btn' + (ok ? '' : '') + '" data-act="supportTalk" data-pair="' + pair.id + '" data-rank="' + r + '"' + (ok ? '' : ' disabled') + '>' + r + ' 对白</button>';
      }).join('');
      return '<div class="support-card' + (unlocked ? '' : ' support-locked') + '">' +
        '<div class="support-names">' + UI.escape(CHARS[pair.a].name) + '<span class="amp">相</span>' + UI.escape(CHARS[pair.b].name) + '</div>' +
        '<div class="support-name">' + UI.escape(pair.name) + ' · ' + (unlocked ? '并肩同行' : '尚未同行') + '</div>' +
        '<div class="support-rank">羁绊 ' + rank + ' · ' + points + ' / ' + (points >= 90 ? 90 : next) + '</div>' +
        '<div class="support-bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="support-dialogues">' + buttons + '</div>' +
        '<div class="support-bonus">C 级 +5 命中/回避 · B 级 +10 · A 级 +15 命中/回避，并加暴击回避。相邻结束我方阶段可加深羁绊。</div>' +
        '</div>';
    }).join('');
    body.innerHTML = '<div class="support-wrap">' + cards + '</div>';
  },

  async supportTalk(pairId, rank) {
    const pair = SUPPORTS.find(p => p.id === pairId);
    if (!pair || !pair.dialogues || !pair.dialogues[rank]) return;
    const points = Game.campaign.supports[pair.id] || 0;
    const need = rank === 'C' ? 20 : rank === 'B' ? 50 : 90;
    if (points < need) return;
    const lines = pair.dialogues[rank].map(line => {
      const who = CHARS[line.who] ? CHARS[line.who].name : line.who;
      return Object.assign({}, line, { who });
    });
    await UI.dialogue(lines);
  },

  /* ============================================================
   * 行录
   * ============================================================ */
  renderRecord(body) {
    const c = Game.campaign;
    const diff = DIFFICULTIES[c.difficulty] || DIFFICULTIES.normal;
    const rec = c.records || { chapters: {} };
    const chapterRows = CHAPTERS.map(ch => {
      const r = rec.chapters && rec.chapters[ch.id];
      return '<div class="record-line">' + UI.chapterLabel(ch.id) + ' ' + UI.escape(ch.name) +
        ' <span class="muted">' + (r ? r.turns + ' 回合 · ' + r.kills + ' 击破 · ' + (r.side ? '支线达成' : '支线未成') : '未成行') + '</span></div>';
    }).join('');
    const roster = c.roster.map(r => {
      const base = CHARS[r.id];
      return '<div class="record-line">' + UI.escape(base.name) + ' <span class="muted">' + UI.escape((CLASSES[r.cls] || {}).name || '') + ' Lv.' + r.level + '</span></div>';
    }).join('');
    const fallen = c.fallen.length
      ? c.fallen.map(id => '<div class="record-line fallen-line">' + UI.escape(CHARS[id] ? CHARS[id].name : id) + ' <span class="muted">已殁</span></div>').join('')
      : '<div class="record-line"><span class="muted">无人留在路上。</span></div>';
    const supports = SUPPORTS.filter(p => (c.supports[p.id] || 0) >= 20).map(p => {
      const rank = Combat.supportRank(c.supports[p.id]);
      return '<div class="record-line">' + UI.escape(CHARS[p.a].name) + ' × ' + UI.escape(CHARS[p.b].name) + ' <span class="muted">' + rank + ' 级</span></div>';
    }).join('') || '<div class="record-line"><span class="muted">羁绊尚未成形。</span></div>';
    const stamp = c.savedAt ? new Date(c.savedAt).toLocaleString('zh-CN', { hour12: false }) : '—';
    body.innerHTML = '<div class="record-wrap">' +
      '<h3>行 录</h3>' +
      '<div class="record-list">' +
      '<div class="record-line">当前：<b>' + UI.escape(Game.chapterProgressText()) + '</b></div>' +
      '<div class="record-line">难度：<b>' + diff.name + '</b></div>' +
      '<div class="record-line">盘缠：<b>' + c.gold + '</b> · 脉印：<b>' + c.seals + '</b></div>' +
      '<div class="record-line">总击破：<b>' + (rec.kills || 0) + '</b> · 阵亡：<b>' + (rec.lost || 0) + '</b></div>' +
      '<div class="record-line">累计回合：<b>' + (rec.turns || 0) + '</b> · 境界提升：<b>' + (rec.levels || 0) + '</b></div>' +
      '<div class="record-line">存档时间：<span class="muted">' + UI.escape(stamp) + '</span></div>' +
      '</div>' +
      '<h3 style="margin-top:16px;">章 节</h3><div class="record-list">' + chapterRows + '</div>' +
      '<h3 style="margin-top:16px;">同 行</h3><div class="record-list">' + roster + '</div>' +
      '<h3 style="margin-top:16px;">陨 落</h3><div class="record-list">' + fallen + '</div>' +
      '<h3 style="margin-top:16px;">羁 绊</h3><div class="record-list">' + supports + '</div>' +
      '<div class="record-actions">' +
      '<button class="mini-btn gold" data-act="settings">设置</button>' +
      '<button class="mini-btn" data-act="help">战斗说明</button>' +
      '<button class="mini-btn danger" data-act="reset">重开旅程</button>' +
      '<button class="mini-btn" data-act="title">回到标题</button>' +
      '</div></div>';
  },

  /* ============================================================
   * 出征
   * ============================================================ */
  renderDeploy(body) {
    const c = Game.campaign;
    const ch = CHAPTERS[c.chapter - 1];
    if (!ch) {
      body.innerHTML = '<div class="record-wrap"><h3>旅 程 已 完 成</h3>' +
        '<div class="record-list"><div class="record-line">九条灵脉已经重新亮起，山海间不再有浊潮。</div>' +
        '<div class="record-line"><span class="muted">可以在「行录」回看这一路，或回到标题开始新的旅程。</span></div></div>' +
        '<div class="record-actions"><button class="mini-btn" data-act="record">查看行录</button>' +
        '<button class="mini-btn" data-act="title">回到标题</button></div></div>';
      return;
    }
    if (this.deployChapter !== ch.id) {
      this.deployChapter = ch.id;
      this.deploySel = new Set();
    }
    if (!this.deploySel) this.deploySel = new Set();
    const ids = c.roster.map(r => r.id);
    for (const id of Array.from(this.deploySel)) {
      if (!ids.includes(id)) this.deploySel.delete(id);
    }
    if (!this.deploySel.size) {
      for (const rec of c.roster.slice(0, ch.deployCount)) this.deploySel.add(rec.id);
    }
    if (!this.deploySel.has('yunce')) this.deploySel.add('yunce');
    while (this.deploySel.size > ch.deployCount) {
      const extra = Array.from(this.deploySel).find(id => id !== 'yunce');
      if (!extra) break;
      this.deploySel.delete(extra);
    }
    const cards = c.roster.map(rec => {
      const base = CHARS[rec.id];
      const cls = CLASSES[rec.cls] || {};
      const selected = this.deploySel.has(rec.id);
      const w = Combat.weaponOf(rec);
      const wname = w ? w.w.name : ((rec.items[0] && (WEAPONS[rec.items[0].key] || ITEMS[rec.items[0].key]) || {}).name || '空手');
      const lord = rec.id === 'yunce';
      return '<button class="deploy-card' + (selected ? ' selected' : '') + (lord ? ' lord' : '') + '" data-act="toggleDeploy" data-id="' + rec.id + '">' +
        '<div class="dc-top">' + UI.portraitHTML(base.name) +
        '<span><span class="dc-name">' + UI.escape(base.name) + (lord ? '<span class="roster-lv" style="margin-left:5px;">守脉</span>' : '') + '</span>' +
        '<span class="dc-sub">' + UI.escape(cls.name || '') + ' Lv.' + rec.level + '</span></span></div>' +
        '<div class="dc-hp">生命 ' + rec.stats.hp + ' · ' + (cls.moveType === 'flying' ? '飞行' : cls.moveType === 'horse' ? '骑马' : cls.moveType === 'armor' ? '重装' : '步行') + '</div>' +
        '<div class="dc-item">' + UI.escape(wname) + '</div></button>';
    }).join('');
    const side = ch.side ? '<div class="deploy-obj"><b>支线</b>　' + UI.escape(ch.side.text) + '</div>' : '';
    body.innerHTML = '<div class="deploy-view">' +
      '<div class="deploy-info"><div class="ch-no">' + UI.chapterLabel(ch.id) + '</div>' +
      '<h3>' + UI.escape(ch.name) + '</h3>' +
      '<p>目标：' + UI.escape(ch.objective.text) + '</p>' + side +
      '<p>' + UI.escape(ch.tips || '') + '</p>' +
      '<p style="color:#8a6a3f;">出击上限 ' + ch.deployCount + ' 人 · 云策必须出战</p>' +
      '<div class="item-empty" style="line-height:1.8;">' + UI.escape((DIFFICULTIES[c.difficulty] || DIFFICULTIES.normal).desc) + '</div>' +
      '</div>' +
      '<div class="deploy-roster">' + cards +
      '<div class="deploy-counter"><span>已选 ' + this.deploySel.size + ' / ' + ch.deployCount + '</span>' +
      '<button class="deploy-go" data-act="startChapter">出 征</button></div>' +
      '</div></div>';
  },

  /* ============================================================
   * 操作
   * ============================================================ */
  async handleAction(btn) {
    const act = btn.dataset.act;
    const c = Game.campaign;
    if (!c) return;
    if (act === 'forge') {
      const key = btn.dataset.key;
      if (!Forge.canCraft(key)) { UI.toast('此物不可打造'); return; }
      const cost = Forge.cost(key);
      const r = Forge.craft(c, key);
      if (!r.ok) {
        if (r.why === 'gold') UI.toast('盘缠不足（需 ' + cost.gold + '）');
        else if (r.why === 'seals') UI.toast('脉印不足（需 ' + cost.seals + '）');
        else if (r.why === 'convoy') UI.toast('行囊已满');
        else if (r.why === 'legendary') UI.toast('传说兵器不可打造，需击败首领');
        else UI.toast('此物不可打造');
        return;
      }
      Game.saveCampaign();
      UI.toast('打造成功：' + WEAPONS[key].name + '（-' + cost.gold + ' 金' + (cost.seals ? ' -' + cost.seals + ' 印' : '') + '）');
      Audio.sfx('gold');
      this.render();
      return;
    }
    if (act === 'selectUnit') {
      this.selectedId = btn.dataset.id;
      this.render();
      return;
    }
    if (act === 'equip') {
      const rec = this.currentUnit();
      if (!rec) return;
      const i = +btn.dataset.i;
      if (!Combat.canEquipKey(rec, rec.items[i] && rec.items[i].key)) { UI.toast('此兵装无法装备'); return; }
      rec.weaponIndex = i;
      Game.saveCampaign();
      UI.toast(CHARS[rec.id].name + ' 已装备 ' + (WEAPONS[rec.items[i].key] || {}).name);
      this.render();
      return;
    }
    if (act === 'repair') {
      if (btn.dataset.id) return this.repairWeapon(btn.dataset.id, btn.dataset.key);
      const rec = this.currentUnit();
      const it = rec && rec.items[+btn.dataset.i];
      if (!rec || !it) return;
      return this.repairItem(rec, it);
    }
    if (act === 'promote') {
      const rec = c.roster.find(r => r.id === btn.dataset.id);
      if (rec) await this.promote(rec);
      return;
    }
    if (act === 'store') {
      const rec = this.currentUnit();
      if (!rec) return;
      const i = +btn.dataset.i;
      if (rec.items.length <= 1) { UI.toast('至少要留下一件兵装'); return; }
      const it = rec.items[i];
      if (!it) return;
      c.convoy.push({ key: it.key, uses: it.uses });
      rec.items.splice(i, 1);
      if (rec.weaponIndex === i) rec.weaponIndex = 0;
      else if (rec.weaponIndex > i) rec.weaponIndex--;
      Game.saveCampaign();
      UI.toast('已存入行囊');
      this.render();
      return;
    }
    if (act === 'take') {
      const rec = this.currentUnit();
      if (!rec) return;
      if (rec.items.length >= 5) { UI.toast('随身最多携带 5 件'); return; }
      const i = +btn.dataset.i;
      const it = c.convoy[i];
      if (!it) return;
      c.convoy.splice(i, 1);
      rec.items.push({ key: it.key, uses: it.uses });
      if (Combat.canEquipKey(rec, it.key) && (!Combat.weaponOf(rec) && !Combat.staffOf(rec))) {
        rec.weaponIndex = rec.items.length - 1;
      }
      Game.saveCampaign();
      UI.toast('已交给 ' + CHARS[rec.id].name);
      this.render();
      return;
    }
    if (act === 'shopTab') {
      this.shopTab = btn.dataset.tab;
      this.render();
      return;
    }
    if (act === 'buy') {
      await this.buy(btn.dataset.kind, btn.dataset.key);
      return;
    }
    if (act === 'supportTalk') {
      await this.supportTalk(btn.dataset.pair, btn.dataset.rank);
      return;
    }
    if (act === 'settings') {
      await Game.openSettings();
      this.render();
      return;
    }
    if (act === 'help') {
      await Game.showHelp();
      return;
    }
    if (act === 'reset') {
      const ok = await UI.confirm('重开旅程', '当前行旅存档、行录与续战进度都会消失，无法找回。', '就此重来', '取消');
      if (!ok) return;
      Game.clearCampaign();
      Game.showTitle();
      UI.showScreen('difficulty');
      return;
    }
    if (act === 'title') {
      Game.showTitle();
      return;
    }
    if (act === 'record') {
      this.show('record');
      return;
    }
    if (act === 'toggleDeploy') {
      const id = btn.dataset.id;
      const ch = CHAPTERS[Game.campaign.chapter - 1];
      if (!ch) return;
      if (id === 'yunce') { UI.toast('守脉人云策必须出战'); return; }
      if (this.deploySel.has(id)) this.deploySel.delete(id);
      else {
        if (this.deploySel.size >= ch.deployCount) { UI.toast('出击上限 ' + ch.deployCount + ' 人'); return; }
        this.deploySel.add(id);
      }
      this.render();
      return;
    }
    if (act === 'startChapter') {
      const ch = CHAPTERS[c.chapter - 1];
      if (!ch) return;
      const ids = Array.from(this.deploySel || []);
      if (!ids.includes('yunce')) ids.unshift('yunce');
      btn.disabled = true;
      await Game.startChapter(ch.id, ids);
      return;
    }
  },

  currentUnit() {
    return Game.campaign.roster.find(r => r.id === this.selectedId) || null;
  },

  /* 转职分支：单线用 cls.promote；双线用 cls.promotes（姜姒/虞素秋） */
  promoteBranches(cls) {
    if (!cls) return [];
    if (Array.isArray(cls.promotes) && cls.promotes.length) {
      return cls.promotes.map(k => CLASSES[k]).filter(Boolean);
    }
    return cls.promote && CLASSES[cls.promote] ? [CLASSES[cls.promote]] : [];
  },

  async promote(rec) {
    const c = Game.campaign;
    const cls = CLASSES[rec.cls];
    if (!cls || !cls.promote) return;
    const branches = this.promoteBranches(cls);
    if (!branches.length) return;
    let next = branches[0];
    if (rec.level < PROMO_LEVEL) { UI.toast('需达到 Lv.' + PROMO_LEVEL); return; }
    if (c.seals <= 0) { UI.toast('没有脉印，可在市集购得'); return; }
    if (branches.length > 1) {
      const pick = await UI.modal({
        title: '转职 · ' + CHARS[rec.id].name,
        sub: '选择前路 · 消耗 1 枚脉印',
        list: branches.map(b => ({ label: b.name, meta: (b.skill ? b.skill.name + '：' + b.skill.desc : b.desc), value: b.name })),
        buttons: [{ label: '再等等', value: null }]
      });
      if (pick === null || pick === undefined) return;
      next = branches.find(b => b.name === pick) || branches[0];
    }
    const ok = await UI.confirm('转职 · ' + next.name, '消耗 1 枚脉印，' + CHARS[rec.id].name + ' 将转职为「' + next.name + '」。', '转职', '再等等');
    if (!ok) return;
    c.seals--;
    rec.cls = Object.keys(CLASSES).find(k => CLASSES[k] === next) || cls.promote;
    for (const k of Object.keys(cls.promoGain || {})) {
      rec.stats[k] = Math.min(STAT_CAPS[k] || 99, (rec.stats[k] || 0) + cls.promoGain[k]);
    }
    for (const wt of Object.keys(cls.promoRanks || {})) {
      const cur = RANK_ORDER[rec.ranks[wt]] || 0;
      const step = cls.promoRanks[wt] || 1;
      rec.ranks[wt] = RANK_NAMES[Math.min(RANK_NAMES.length - 1, cur + step)];
    }
    Game.saveCampaign();
    Audio.sfx('levelup');
    UI.toast(CHARS[rec.id].name + ' 转职为 ' + next.name);
    this.render();
  },

  repairItem(rec, item) {
    const def = WEAPONS[item.key];
    if (!def) return;
    const cost = this.repairCost(def, item);
    if (Game.campaign.gold < cost) { UI.toast('盘缠不足'); return; }
    Game.campaign.gold -= cost;
    item.uses = def.uses;
    Game.saveCampaign();
    UI.toast('已修补，花费 ' + cost + ' 盘缠');
    this.render();
  },

  repairWeapon(id, key) {
    const rec = Game.campaign.roster.find(r => r.id === id);
    const item = rec && rec.items.find(it => it.key === key && it.uses < (WEAPONS[key] || {}).uses);
    if (!rec || !item) return;
    this.repairItem(rec, item);
  },

  async buy(kind, key) {
    const c = Game.campaign;
    if (kind === 'item' && key === 'seal') {
      const def = ITEMS.seal;
      if (c.gold < def.price) { UI.toast('盘缠不足'); return; }
      c.gold -= def.price;
      c.seals++;
      Audio.sfx('gold');
      Game.saveCampaign();
      UI.toast('购得脉印 · 现有 ' + c.seals);
      this.render();
      return;
    }
    const def = WEAPONS[key] || ITEMS[key];
    if (!def) return;
    if (c.gold < def.price) { UI.toast('盘缠不足'); return; }
    c.gold -= def.price;
    c.convoy.push({ key, uses: def.uses || 1 });
    Audio.sfx('gold');
    Game.saveCampaign();
    UI.toast('购入 ' + def.name + '，已放入行囊');
    this.render();
  }
};

if (typeof window !== 'undefined') window.Camp = Camp;
