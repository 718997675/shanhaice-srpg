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
    if (next === 'deploy' && (Game.campaign.cleared || !Route.byId(Game.campaign.chapter))) {
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
    else if (this.tab === 'memorial') this.renderMemorial(body);
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
    /* 技能列表（P2.2）：职业技 + 个人技① + 个人技② + 继承技 */
    const pseudo = { cls: rec.cls, personal: base.personal, personal2: base.personal2, inherited: rec.inherited || [] };
    const skillList = (typeof Battle !== 'undefined' && Battle.skillListOf) ? Battle.skillListOf(pseudo) : [];
    const kindLabel = { cls: '职业技', personal: '个人技', inherit: '继承技' };
    const skillHTML = skillList.map(s =>
      '<div class="unit-skillline' + (s.kind === 'inherit' ? ' inherited' : '') + '">' +
      (kindLabel[s.kind] || '技能') + '：<b>' + UI.escape(s.name || '—') + '</b>　' + UI.escape(s.desc || '') + '</div>'
    ).join('');
    /* 熟练度进度（P2.2）：每类武器当前阶位与距下一阶的累计出手数 */
    const profHTML = Object.keys(rec.ranks || {}).map(wt => {
      const nm = (WEAPON_TYPES[wt] && WEAPON_TYPES[wt].name) || wt;
      const top = rec.ranks[wt] === RANK_NAMES[RANK_NAMES.length - 1];
      const pts = (rec.rankPts && rec.rankPts[wt]) || 0;
      return '<span class="prof-chip"><span class="prof-name">' + UI.escape(nm) + '</span>' +
        '<b>' + UI.escape(rec.ranks[wt] || '—') + '</b>' +
        (top ? '<small>已至化境</small>' : '<small>' + Math.min(pts, RANK_UP_USES) + '/' + RANK_UP_USES + '</small>') + '</span>';
    }).join('');
    const equip = rec.items.map((it, i) => this.itemRow(rec, it, i)).join('') ||
      '<div class="item-empty">行囊空着。</div>';
    const convoy = (Game.campaign.convoy || []).map((it, i) => {
      const def = WEAPONS[it.key] || ITEMS[it.key];
      if (!def) return '';
      const full = rec.items.length >= 5;
      const plus = WEAPONS[it.key] ? (it.plus || 0) : 0;
      const sc = Smith.canStrengthen(it.key, it) ? Smith.cost(it) : null;
      const ev = Smith.canEvolve(it.key, it) ? Smith.evolveInfo(it.key) : null;
      return '<div class="convoy-item">' + this.weaponIconHTML(it.key, 'inv-icon sm') +
        '<span class="inv-name">' + UI.escape(def.name) +
        (plus ? ' <span class="plus-badge">+' + plus + '</span>' : '') +
        '<small style="color:#83795f;margin-left:6px;">' + (WEAPONS[it.key] ? '耐久 ' + it.uses + '/' + def.uses : '× ' + it.uses) + '</small></span>' +
        (sc ? '<button class="mini-btn" data-act="strengthen" data-where="convoy" data-i="' + i + '" title="' +
          UI.escape(ITEMS[sc.mat].name + ' ×' + sc.n + ' + ' + sc.gold + ' 盘缠') + '">强化</button>' : '') +
        (ev ? '<button class="mini-btn gold" data-act="evolve" data-where="convoy" data-i="' + i + '" title="' +
          UI.escape(Smith.evolveText(it.key, it.plus) + ' · ' + ITEMS[ev.mat].name + ' ×' + ev.n + ' + ' + ev.gold + ' 盘缠') + '">进化</button>' : '') +
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
      skillHTML +
      '<div class="unit-bio">' + UI.escape(base.bio || '') + '</div></div></div>' +
      '<h4>能力</h4><div class="stat-grid">' + stats + '</div>' +
      '<h4>熟练</h4><div class="prof-row">' + (profHTML || '<span class="prof-chip"><small>尚无熟练兵器</small></span>') + '</div>' +
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
    const plus = w ? (it.plus || 0) : 0;
    const meta = w
      ? '耐久 ' + it.uses + '/' + (w.uses || 1) + ' · ' + (w.magic ? '灵' : '力') + '+' + (w.mt + plus) + (plus ? '（+' + plus + '）' : '') +
        ' · 命中 ' + (w.hit + 3 * plus) + (plus && plus >= Smith.cap() ? ' · 必杀 +5' : '')
      : '剩余 ' + it.uses + ' 次 · 回复 ' + (d.heal || 0);
    const max = w ? (w.uses || 1) : 0;
    const missing = w ? Math.max(0, max - it.uses) : 0;
    const cost = w ? this.repairCost(w, it) : 0;
    const sc = w && Smith.canStrengthen(it.key, it) ? Smith.cost(it) : null;
    const ev = w && Smith.canEvolve(it.key, it) ? Smith.evolveInfo(it.key) : null;
    return '<div class="inv-item">' + this.weaponIconHTML(it.key) +
      '<span class="inv-name">' + UI.escape(w ? w.name : d.name) +
      (plus ? ' <span class="plus-badge">+' + plus + '</span>' : '') +
      (w ? ' <span style="font-family:var(--sans);font-size:9px;color:#8a806a;">' + w.rank + ' · ' + (WEAPON_TYPES[w.type] ? WEAPON_TYPES[w.type].name : '') + '</span>' : '') +
      '<div class="inv-meta">' + meta + '</div>' + (w ? this.weaponMechHTML(w) : '') + '</span>' +
      (w ? (equipped
        ? '<span class="mini-btn gold" style="pointer-events:none;">已装备</span>'
        : '<button class="mini-btn" data-act="equip" data-i="' + i + '"' + (canEquip ? '' : ' disabled') + '>装备</button>') : '') +
      (w && missing > 0 ? '<button class="mini-btn" data-act="repair" data-i="' + i + '" title="修补 ' + cost + ' 盘缠">修 ' + cost + '</button>' : '') +
      (sc ? '<button class="mini-btn" data-act="strengthen" data-where="item" data-i="' + i + '" title="' +
        UI.escape(ITEMS[sc.mat].name + ' ×' + sc.n + ' + ' + sc.gold + ' 盘缠') + '">强化</button>' : '') +
      (ev ? '<button class="mini-btn gold" data-act="evolve" data-where="item" data-i="' + i + '" title="' +
        UI.escape(Smith.evolveText(it.key, it.plus) + ' · ' + ITEMS[ev.mat].name + ' ×' + ev.n + ' + ' + ev.gold + ' 盘缠') + '">进化</button>' : '') +
      (rec.items.length > 1 ? '<button class="mini-btn danger" data-act="store" data-i="' + i + '">存入</button>' : '') +
      '</div>';
  },

  repairCost(def, item) {
    const max = def.uses || 1;
    const missing = Math.max(0, max - item.uses);
    return Math.max(15, Math.round((def.price || 100) * (missing / max) * 0.55));
  },

  /* 传说武器图标（assets/icons/weapons/wpn_{key}.png，文件缺失时 onerror 自动隐藏） */
  weaponIconHTML(key, cls) {
    if (!LEGENDARY_WEAPONS[key]) return '';
    return '<img class="' + (cls || 'inv-icon') + '" src="assets/icons/weapons/wpn_' + key + '.png" alt="" onerror="this.style.display=\'none\'">';
  },

  /* 传说武器的词条/技能说明行（图鉴与兵装行共用） */
  weaponMechHTML(wdef) {
    if (!wdef || !LEGENDARY_WEAPONS[wdef.key]) return '';
    const tt = Legendary.traitText(wdef);
    return (tt.traits ? '<div class="inv-mech">词条：' + UI.escape(tt.traits) + '</div>' : '') +
      (tt.skill ? '<div class="inv-mech">' + UI.escape(tt.skill) + '</div>' : '');
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
      const tt = Legendary.traitText(w);
      const mech = (tt.traits ? '<div class="s-desc legend-mech">词条：' + UI.escape(tt.traits) + '</div>' : '') +
        (tt.skill ? '<div class="s-desc legend-mech">' + UI.escape(tt.skill) + '</div>' : '');
      return '<div class="shop-row"><span class="s-name">' +
        '<img class="legend-icon" src="assets/icons/weapons/wpn_' + key + '.png" alt="" onerror="this.style.display=\'none\'">' +
        UI.escape(w.name) +
        '<div class="s-desc">' + UI.escape((boss ? boss.name : w.source) + ' · ' + w.desc) + '</div>' + mech + prog + '</span>' +
        '<span class="s-price" style="color:' + (owned ? '#9fd39a' : '#c9a37a') + '">' + (owned ? '已入手' : '未获得') + '</span>' +
        '<span class="s-desc" style="max-width:180px;text-align:right;">' + UI.escape(Legendary.hint(key)) + '</span></div>';
    }).join('');
    body.innerHTML = '<div class="shop-wrap">' +
      '<div class="shop-col"><h3>打 造</h3>' +
      '<div class="shop-note">以盘缠与脉印请匠人开炉。高阶兵装还需脉印，品质与市集无异，打造的兵装进入行囊。</div>' +
      '<div class="shop-note" style="margin-top:8px;color:#8a6a35;">强化：耐久完好的兵装可强化至 +3（每级 +1 威力、+3 命中，+3 额外 +5 必杀），消耗铁髓/钢核/银晶与盘缠；在「队伍」的兵装行或行囊行点击「强化」开炉。传说与损坏兵装不可强化。</div>' +
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
    const tab = this.shopTab || 'weapon';
    const isWeapon = tab === 'weapon';
    const stock = isWeapon ? this.weaponStock() : (tab === 'mat' ? this.matStock() : this.itemStock());
    const rows = stock.map(s => {
      const def = s.def;
      let desc = WEAPONS[s.key]
        ? (WEAPON_TYPES[def.type] ? WEAPON_TYPES[def.type].name : '') + ' · ' + def.rank + ' · 威力 ' + def.mt + ' · 命中 ' + def.hit + (def.uses ? ' · 耐久 ' + def.uses : '')
        : def.desc;
      /* 传送武器的机制说明直接上架（读得懂才有人买） */
      if (def.warp) desc += ' · 射程 ' + def.rng[1] + ' · 把友军传到身侧（耗行动）';
      if (def.swapOnHit) desc += ' · 命中后与目标换位（对 Boss 无效）';
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
      '<button data-act="shopTab" data-tab="item" class="' + (tab === 'item' ? 'active' : '') + '">药物</button>' +
      '<button data-act="shopTab" data-tab="mat" class="' + (tab === 'mat' ? 'active' : '') + '">材料</button></div>' +
      '<div class="shop-note">' + (tab === 'mat'
        ? '强化材料堆叠进行囊。铁匠铺强化：耐久完好的兵装 +0 → +3，每级 +1 威力、+3 命中，+3 额外 +5 必杀；在「队伍」的兵装行或行囊行点击「强化」开炉。同型兵装可「进化」到下一阶（铁→钢→银/名器）：保留强化等级、耐久刷满。传说、角色专属与损坏兵装不可强化，也不可进化。'
        : '购入的兵装与药物进入行囊，在「队伍」中交给同伴。' + (tab === 'item' ? '脉印可直接向行商购得。' : '')) + '</div>' +
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
    const rosterIds = (Game.campaign.roster || []).map(r => r.id);
    return Object.keys(WEAPONS)
      .map(key => ({ key, def: WEAPONS[key] }))
      .filter(s => {
        if (!(s.def.price > 0) || s.def.unique || s.def.type === 'beast') return false;
        /* 传送武器等特殊上架：shopGate 可指定章节门槛与前置角色（说得墨鸦后售追影刃） */
        const g = s.def.shopGate;
        if (g) {
          if (chapter < (g.chapter || 1)) return false;
          if (g.char && !rosterIds.includes(g.char)) return false;
          return true;
        }
        return gate(s.def.rank) <= chapter;
      })
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

  /* 强化材料（按章节解锁） */
  matStock() {
    const chapter = Game.campaign.chapter;
    const gate = { mat_iron: 1, mat_steel: 2, mat_silver: 4 };
    return Object.keys(ITEMS)
      .filter(k => ITEMS[k].kind === 'mat' && chapter >= (gate[k] || 1))
      .map(key => ({ key, def: ITEMS[key] }));
  },

  /* ============================================================
   * 羁绊
   * ============================================================ */
  renderSupport(body) {
    const c = Game.campaign;
    const rosterIds = c.roster.map(r => r.id);
    const knotCards = Object.keys(c.knots || {}).filter(id => CHARS[id]).map(id => {
      const k = c.knots[id];
      const spec = HEART_KNOTS[k.route] || {};
      const rank = Combat.supportRank(c.supports[spec.pairId] || 0);
      const canResolve = rank === 'A' && !k.resolved;
      return '<div class="knot-card' + (k.resolved ? ' knot-done' : '') + '">' +
        '<div class="knot-title">心结 · ' + UI.escape(spec.name || '') + '　<b>' + UI.escape(CHARS[id].name) + '</b>' +
        '<span class="knot-tag">' + (k.resolved ? '已了断' : '未解') + '</span></div>' +
        '<div class="knot-desc">' + UI.escape(spec.desc || '') + '</div>' +
        '<div class="knot-state">' + (k.resolved
          ? '心结已了。全部解开时，终章全队 +5 命中 +5 必杀。'
          : '未解：命中 -5。' + UI.escape(spec.hint || '')) + '</div>' +
        (k.resolved ? '' : '<button class="mini-btn gold" data-act="knotResolve" data-id="' + id + '"' +
          (canResolve ? '' : ' disabled') + '>' + (canResolve ? '了断' : '羁绊未达 A 级') + '</button>') +
        '</div>';
    }).join('');
    const knotHTML = knotCards ? '<div class="knot-wrap"><h3>心 结</h3>' + knotCards + '</div>' : '';
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
    body.innerHTML = knotHTML + '<div class="support-wrap">' + cards + '</div>';
  },

  /* 了断心结（P3.2）：需对应支援 A 级，播完对白即解，终章全解给全队加成 */
  async resolveKnot(charId) {
    const c = Game.campaign;
    const k = c.knots && c.knots[charId];
    if (!k || k.resolved) return;
    const spec = HEART_KNOTS[k.route];
    if (!spec) return;
    if (Combat.supportRank(c.supports[spec.pairId] || 0) !== 'A') {
      UI.toast('羁绊需达到 A 级才能了断');
      return;
    }
    const lines = (spec.resolve || []).map(line =>
      Object.assign({}, line, { who: CHARS[line.who] ? CHARS[line.who].name : line.who }));
    await UI.dialogue(lines);
    k.resolved = true;
    Game.saveCampaign();
    Audio.sfx('levelup');
    const sum = Game.knotSummary(c);
    UI.toast(sum.cleared
      ? '心结已了 · 终章全队 +5 命中 +5 必杀'
      : CHARS[charId].name + ' 的心结已了断');
    this.render();
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
      return '<div class="record-line">' + UI.chapterLabel(ch.no) + (ch.route ? ' <span class="muted">' + UI.escape(Route.label(ch.route)) + '</span>' : '') + ' ' + UI.escape(ch.name) +
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
   * 英魂碑（P3.3）：阵亡者生平、遗言与传承去向
   * ============================================================ */
  renderMemorial(body) {
    const c = Game.campaign;
    const list = (c.fallen || []).map(id => {
      const base = CHARS[id];
      if (!base) return '';
      const m = (c.memorial && c.memorial[id]) || {};
      const ch = m.chapter ? Route.byId(m.chapter) : null;
      const where = ch ? UI.chapterLabel(ch.no) + ' ' + ch.name : '不知名的路上';
      const cls = CLASSES[m.cls || base.cls];
      const heir = (m.heir && CHARS[m.heir]) ? CHARS[m.heir].name : (m.heirName || '');
      const carried = [];
      if (m.skill) carried.push('个人技「' + UI.escape(m.skill) + '」');
      if (m.weapon) carried.push(UI.escape((WEAPONS[m.weapon] || {}).name || m.weapon));
      const pass = carried.length
        ? '传给 <b>' + UI.escape(heir || '同行者') + '</b>：' + carried.join('、')
        : (heir ? '遗志由 <b>' + UI.escape(heir) + '</b> 接下' : '无人可传');
      const sealed = m.sealed
        ? '<div class="mem-sealed">' + UI.escape((WEAPONS[m.sealed] || {}).name || m.sealed) + ' 无人能持，封存于行囊。</div>'
        : '';
      return '<div class="mem-card">' +
        '<div class="mem-head"><span class="mem-name">' + UI.escape(base.name) + '</span>' +
        '<span class="mem-meta">' + UI.escape(cls ? cls.name : '') + ' · 殁于 ' + UI.escape(where) + '</span></div>' +
        '<div class="mem-bio">' + UI.escape(base.bio || '') + '</div>' +
        '<div class="mem-epitaph">「' + UI.escape(m.epitaph || (typeof EPITAPHS !== 'undefined' && EPITAPHS[id]) || '') + '」</div>' +
        '<div class="mem-pass">' + pass + '</div>' + sealed + '</div>';
    }).join('');
    const relics = (c.relics || []).map(it => {
      const w = WEAPONS[it.key] || ITEMS[it.key];
      return '<div class="record-line">' + UI.escape(w ? w.name : it.key) + ' <span class="muted">封存</span></div>';
    }).join('');
    body.innerHTML = '<div class="record-wrap">' +
      '<h3>英 魂 碑</h3>' +
      (list
        ? '<div class="mem-list">' + list + '</div>'
        : '<div class="record-list"><div class="record-line"><span class="muted">碑上还没有名字。愿它一直空着。</span></div></div>') +
      (relics ? '<h3 style="margin-top:16px;">封 存</h3><div class="record-list">' + relics + '</div>' : '') +
      '</div>';
  },

  /* ============================================================
   * 出征
   * ============================================================ */
  renderDeploy(body) {
    const c = Game.campaign;
    const ch = Route.byId(c.chapter);
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
      '<div class="deploy-info"><div class="ch-no">' + UI.chapterLabel(ch.no) + '</div>' +
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
    if (act === 'strengthen') {
      const where = btn.dataset.where;
      const idx = +btn.dataset.i;
      let item = null;
      if (where === 'convoy') item = c.convoy[idx];
      else {
        const rec = this.currentUnit();
        item = rec && rec.items[idx];
      }
      if (!item) return;
      const cost = Smith.cost(item);
      if (!cost) { UI.toast('已达强化上限 +' + Smith.cap()); return; }
      const def = WEAPONS[item.key];
      const mat = ITEMS[cost.mat];
      UI.modal({
        title: '铁匠铺 · 强化',
        sub: UI.escape(def.name) + (item.plus ? ' +' + item.plus : '') + ' → +' + ((item.plus || 0) + 1),
        list: [{
          label: '消耗：' + UI.escape(mat.name) + ' ×' + cost.n + '　盘缠 ' + cost.gold +
                 '（现有 ' + Smith.matCount(c, cost.mat) + ' / ' + c.gold + '）',
          meta: Smith.effectText((item.plus || 0) + 1),
          value: 'go'
        }],
        buttons: [{ label: '再想想', value: null }, { label: '开炉', value: 'go' }]
      }).then(v => {
        if (v !== 'go' || !this.active || !Game.campaign) return;
        const r = Smith.strengthen(Game.campaign, item);
        if (!r.ok) {
          UI.toast(r.why === 'gold' ? '盘缠不足' : r.why === 'mat' ? '材料不足' : r.why === 'broken' ? '兵装已损坏，先修补' : '无法强化');
          return;
        }
        Audio.sfx('levelup');
        Game.saveCampaign();
        UI.toast(r.name + ' 强化至 +' + r.plus + '（' + Smith.effectText(r.plus) + '）');
        this.render();
      });
      return;
    }
    if (act === 'evolve') {
      const where = btn.dataset.where;
      const idx = +btn.dataset.i;
      const rec = this.currentUnit();
      const item = where === 'convoy' ? c.convoy[idx] : (rec && rec.items[idx]);
      if (!item) return;
      const spec = Smith.evolveInfo(item.key);
      if (!spec || !Smith.canEvolve(item.key, item)) { UI.toast('此兵装已无法进化'); return; }
      /* 已装备的兵装：进化后若熟练度不够装备不了，先挡住 */
      if (where !== 'convoy' && rec && rec.weaponIndex === idx && !Combat.canEquipKey(rec, spec.to)) {
        UI.toast('熟练度不足，进化后将无法装备（先转职提升熟练度）');
        return;
      }
      const mat = ITEMS[spec.mat];
      const from = WEAPONS[item.key], to = WEAPONS[spec.to];
      UI.modal({
        title: '铁匠铺 · 进化',
        sub: UI.escape(from.name) + (item.plus ? ' +' + item.plus : '') + ' → ' + UI.escape(to.name),
        list: [{
          label: '消耗：' + UI.escape(mat.name) + ' ×' + spec.n + '　盘缠 ' + spec.gold +
                 '（现有 ' + Smith.matCount(c, spec.mat) + ' / ' + c.gold + '）',
          meta: Smith.evolveText(item.key, item.plus),
          value: 'go'
        }],
        buttons: [{ label: '再想想', value: null }, { label: '开炉', value: 'go' }]
      }).then(v => {
        if (v !== 'go' || !this.active || !Game.campaign) return;
        const r = Smith.evolve(Game.campaign, item);
        if (!r.ok) {
          UI.toast(r.why === 'gold' ? '盘缠不足' : r.why === 'mat' ? '材料不足' : r.why === 'broken' ? '兵装已损坏，先修补' : '无法进化');
          return;
        }
        Audio.sfx('levelup');
        Game.saveCampaign();
        UI.toast(r.fromName + ' 进化为 ' + r.name + (r.plus ? '（保留 +' + r.plus + '）' : ''));
        this.render();
      });
      return;
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
    if (act === 'knotResolve') {
      await this.resolveKnot(btn.dataset.id);
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
      const ch = Route.byId(Game.campaign.chapter);
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
      const ch = Route.byId(c.chapter);
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
    /* 技能继承（P2.2）：转职前先把原职业技能记下来，上限 INHERIT_CAP 条，先进先出 */
    const learned = cls.skill && cls.skill.name ? JSON.parse(JSON.stringify(cls.skill)) : null;
    rec.cls = Object.keys(CLASSES).find(k => CLASSES[k] === next) || cls.promote;
    if (learned) {
      if (!Array.isArray(rec.inherited)) rec.inherited = [];
      const dup = rec.inherited.findIndex(s => s && s.name === learned.name);
      if (dup >= 0) rec.inherited.splice(dup, 1);
      rec.inherited.push(learned);
      while (rec.inherited.length > INHERIT_CAP) rec.inherited.shift();
    }
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
    UI.toast(CHARS[rec.id].name + ' 转职为 ' + next.name + (learned ? '，继承「' + learned.name + '」' : ''));
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
    if (def.stack) {   // 材料堆叠进行囊
      const st = c.convoy.find(i => i.key === key);
      if (st) st.uses = (st.uses || 0) + 1;
      else c.convoy.push({ key, uses: 1 });
    } else {
      c.convoy.push({ key, uses: def.uses || 1 });
    }
    Audio.sfx('gold');
    Game.saveCampaign();
    UI.toast('购入 ' + def.name + '，已放入行囊');
    this.render();
  }
};

if (typeof window !== 'undefined') window.Camp = Camp;
