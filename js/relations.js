/* ============================================================
 * 人物关系图（P4.7）：把 SUPPORTS 的支援组画成一张关系网
 * ------------------------------------------------------------
 * 纯字符串 + 纯计算：不碰 DOM、不读全局存档，由 camp 传入 campaign。
 * 等级判定一律走 Combat.supportRank（公式单一来源）；页面每个数字
 * 都来自 SUPPORT_RANKS / SUPPORT_POINTS_ADJACENT / SUPPORT_RANGE，
 * 改文案先过 formulas 第 36 节与 smoke 的 P4.7 块。
 * 布局为确定性设计：SEED 手工摆位（12 条支援线零交叉），
 * 再过一遍去重叠松弛夹边界；未录入 SEED 的新角色按圆环兜底，
 * 任何数据下都不重叠、不出界。同一份数据两次渲染坐标一致。
 * ============================================================ */
const Relations = {
  sel: null,          // { type:'char', id } | { type:'pair', id } | null
  W: 960, H: 560,
  R: 24,              // 节点半径
  _lay: null,

  esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  /* ---------- 数据视图 ---------- */
  charIds() { return Object.keys(CHARS); },
  netIds() {
    const set = {};
    for (const p of SUPPORTS) { set[p.a] = 1; set[p.b] = 1; }
    return Object.keys(set);
  },
  loneIds() {
    const net = this.netIds();
    return this.charIds().filter(id => net.indexOf(id) < 0);
  },
  pairsOf(id) { return SUPPORTS.filter(p => p.a === id || p.b === id); },
  partnerOf(pair, id) { return pair.a === id ? pair.b : pair.a; },

  /* ---------- 状态 ---------- */
  rosterOf(c) { return (c && c.roster) ? c.roster.map(r => r.id) : []; },
  stateOf(c, id) {
    if (this.rosterOf(c).indexOf(id) >= 0) return 'roster';
    if (((c && c.fallen) || []).indexOf(id) >= 0) return 'fallen';
    return 'away';
  },
  edgeInfo(c, pair) {
    const roster = this.rosterOf(c);
    const unlocked = roster.indexOf(pair.a) >= 0 && roster.indexOf(pair.b) >= 0;
    const points = (c && c.supports && c.supports[pair.id]) || 0;
    const rank = (typeof Combat !== 'undefined' && Combat.supportRank) ? Combat.supportRank(points) : null;
    return { pair: pair, unlocked: unlocked, points: points, rank: rank, key: unlocked ? (rank || 'none') : 'lock' };
  },
  bestRankOf(c, id) {
    const order = { C: 1, B: 2, A: 3 };
    let best = null;
    for (const p of this.pairsOf(id)) {
      const r = this.edgeInfo(c, p).rank;
      if (r && (!best || order[r] > order[best])) best = r;
    }
    return best;
  },

  /* ---------- 布局 ----------
   * 支援关系是写死的故事数据：按设计手工摆位（云策居中，各组沿关系
   * 簇散开，12 条线零交叉），再去重叠松弛夹边界。新角色没进 SEED
   * 时按圆环兜底，保证不重叠、不出界、可复现。
   * -------------------------------------------- */
  SEED: {
    yunce: [480, 270], luming: [350, 400], bailu: [210, 470], yankui: [640, 420],
    moya: [730, 240], jiangsi: [330, 190], aman: [850, 350], xuanyi: [620, 100],
    chisang: [790, 70], yusqiu: [450, 60], qingluo: [150, 120], yunling: [70, 60]
  },

  layout() {
    if (this._lay) return this._lay;
    const ids = this.netIds();
    const n = ids.length;
    const W = this.W, H = this.H, R = this.R;
    const pos = ids.map((id, i) => {
      const s = this.SEED[id];
      if (s) return { id: id, x: s[0], y: s[1] };
      /* 兜底：圆环摆位，避免新角色挤在一处 */
      const ang = (i / n) * Math.PI * 2 + 0.6;
      const r = Math.min(W, H) * 0.3;
      return { id: id, x: W / 2 + Math.cos(ang) * r, y: H / 2 + Math.sin(ang) * r * 0.9 };
    });
    /* 去重叠 + 夹边界，反复至稳定（两节点圆心距不小于 2R+14） */
    const padX = R + 30, padY = R + 26, minD = R * 2 + 14;
    for (let pass = 0; pass < 160; pass++) {
      let moved = false;
      for (const p of pos) {
        p.x = Math.max(padX, Math.min(W - padX, p.x));
        p.y = Math.max(padY, Math.min(H - R - 50, p.y));
      }
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        let dx = pos[j].x - pos[i].x, dy = pos[j].y - pos[i].y;
        let d = Math.sqrt(dx * dx + dy * dy);
        if (d < minD) {
          if (d < 0.01) { dx = 1; dy = 0; d = 1; }
          const push = (minD - d) / 2 + 0.5;
          const ux = dx / d, uy = dy / d;
          pos[i].x -= ux * push; pos[i].y -= uy * push;
          pos[j].x += ux * push; pos[j].y += uy * push;
          moved = true;
        }
      }
      if (!moved) break;
    }
    const map = {};
    for (const p of pos) {
      map[p.id] = {
        x: Math.round(Math.max(padX, Math.min(W - padX, p.x)) * 10) / 10,
        y: Math.round(Math.max(padY, Math.min(H - R - 50, p.y)) * 10) / 10
      };
    }
    this._lay = map;
    return map;
  },

  /* ---------- 选中态 ---------- */
  litSets() {
    const litNodes = {}, litEdges = {};
    const sel = this.sel;
    if (sel && sel.type === 'char' && CHARS[sel.id]) {
      litNodes[sel.id] = 1;
      for (const p of this.pairsOf(sel.id)) { litEdges[p.id] = 1; litNodes[p.a] = 1; litNodes[p.b] = 1; }
    } else if (sel && sel.type === 'pair') {
      const p = SUPPORTS.find(x => x.id === sel.id);
      if (p) { litEdges[p.id] = 1; litNodes[p.a] = 1; litNodes[p.b] = 1; }
    }
    return { nodes: litNodes, edges: litEdges };
  },
  hasSel() {
    const sel = this.sel;
    if (!sel) return false;
    if (sel.type === 'char') return !!CHARS[sel.id];
    if (sel.type === 'pair') return SUPPORTS.some(x => x.id === sel.id);
    return false;
  },

  /* ---------- SVG ---------- */
  svg(c) {
    const lay = this.layout();
    const lit = this.litSets();
    const hasSel = this.hasSel();
    const defs = this.netIds().map(id =>
      '<clipPath id="relclip-' + id + '"><circle cx="0" cy="0" r="' + this.R + '"/></clipPath>'
    ).join('');
    const edges = SUPPORTS.map(p => {
      const A = lay[p.a], B = lay[p.b];
      const info = this.edgeInfo(c, p);
      const isLit = !!lit.edges[p.id];
      const dim = hasSel && !isLit;
      const showLab = !!info.rank || isLit;
      const mx = Math.round((A.x + B.x) / 2), my = Math.round((A.y + B.y) / 2);
      const cls = 'rel-e e-' + info.key + (isLit ? ' lit' : '') + (dim ? ' dim' : '');
      return '<line class="rel-hit" x1="' + A.x + '" y1="' + A.y + '" x2="' + B.x + '" y2="' + B.y + '" data-act="relPair" data-pair="' + p.id + '"/>' +
        '<line class="' + cls + '" x1="' + A.x + '" y1="' + A.y + '" x2="' + B.x + '" y2="' + B.y + '"/>' +
        (showLab
          ? '<text class="rel-lab' + (isLit ? ' lit' : '') + (dim ? ' dim' : '') + '" x="' + mx + '" y="' + (my - 6) + '" text-anchor="middle">' +
            this.esc(p.name) + (info.rank ? ' · ' + info.rank : '') + '</text>'
          : '');
    }).join('');
    const nodes = this.netIds().map(id => {
      const p = lay[id], base = CHARS[id];
      const state = this.stateOf(c, id);
      const isLit = !!lit.nodes[id];
      const dim = hasSel && !isLit;
      const isSel = !!(this.sel && this.sel.type === 'char' && this.sel.id === id);
      const best = this.bestRankOf(c, id);
      const fb = 'if(this.dataset.fb){this.style.display=\'none\'}else{this.dataset.fb=1;this.setAttribute(\'href\',\'assets/portraits/' + id + '.svg\')}';
      return '<g class="rel-n n-' + state + (isLit ? ' lit' : '') + (dim ? ' dim' : '') + (isSel ? ' n-sel' : '') + '"' +
        ' transform="translate(' + p.x + ',' + p.y + ')" data-act="relChar" data-id="' + id + '">' +
        '<circle class="n-halo" r="' + (this.R + 6) + '"/>' +
        '<circle class="n-disk" r="' + this.R + '"/>' +
        '<text class="n-letter" y="6">' + this.esc(base.name.charAt(0)) + '</text>' +
        '<image class="n-img" href="assets/portraits/' + id + '.jpg" x="' + (-this.R) + '" y="' + (-this.R) + '" width="' + (this.R * 2) + '" height="' + (this.R * 2) + '" preserveAspectRatio="xMidYMid slice" clip-path="url(#relclip-' + id + ')" onerror="' + fb + '"/>' +
        '<text class="n-name" y="' + (this.R + 16) + '">' + this.esc(base.name) + '</text>' +
        (state === 'away' ? '<text class="n-tag" y="' + (-this.R - 8) + '">未入队</text>' : '') +
        (state === 'fallen' ? '<text class="n-tag n-dead" y="' + (-this.R - 8) + '">已殁</text>' : '') +
        (best ? '<g class="n-badge b-' + best + '" transform="translate(' + (this.R - 7) + ',' + (-(this.R - 7)) + ')"><circle r="8"/><text y="3">' + best + '</text></g>' : '') +
        '</g>';
    }).join('');
    return '<svg class="rel-svg" viewBox="0 0 ' + this.W + ' ' + this.H + '" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="人物关系图">' +
      '<defs>' + defs + '</defs>' +
      '<rect class="rel-bg" data-act="relClear" x="0" y="0" width="' + this.W + '" height="' + this.H + '"/>' +
      edges + nodes + '</svg>';
  },

  /* ---------- 侧栏 ---------- */
  pfp(id) {
    const base = CHARS[id] || {};
    const name = base.name || id;
    return '<span class="rel-pfp"><span class="rel-pfp-l">' + this.esc(name.charAt(0)) + '</span>' +
      '<img src="assets/portraits/' + id + '.jpg" alt=""' +
      ' onerror="if(this.dataset.fb){this.style.display=\'none\'}else{this.dataset.fb=1;this.src=\'assets/portraits/' + id + '.svg\'}"></span>';
  },
  rankChip(rank) {
    return '<span class="rk rk-' + (rank || 'z') + '">' + (rank || '—') + '</span>';
  },
  rankRuleText() {
    const needs = SUPPORT_RANKS.map(r => r.rank + ' ' + r.need).join(' · ');
    const hit = SUPPORT_RANKS.map(r => r.rank + ' +' + r.hit + ' 命中/回避').join(' · ');
    const crit = SUPPORT_RANKS.map(r => r.rank + ' +' + r.crit).join(' / ');
    return { needs: needs, hit: hit, crit: crit };
  },

  overviewPanel(c) {
    const counts = { A: 0, B: 0, C: 0 };
    let locked = 0, none = 0;
    for (const p of SUPPORTS) {
      const e = this.edgeInfo(c, p);
      if (!e.unlocked) locked++;
      else if (e.rank) counts[e.rank]++;
      else none++;
    }
    const r = this.rankRuleText();
    const legend = [
      ['e-lock', '未同行（有人未入队）'], ['e-none', '同行 · 未达 C'],
      ['e-C', 'C 级'], ['e-B', 'B 级'], ['e-A', 'A 级']
    ].map(([k, label]) =>
      '<div class="rel-lg-row"><svg class="rel-lg-svg" viewBox="0 0 34 10" width="34" height="10"><line class="rel-e rel-lg ' + k + '" x1="2" y1="5" x2="32" y2="5"/></svg><span>' + label + '</span></div>'
    ).join('');
    return '<div class="rel-side-title">总 览</div>' +
      '<div class="rel-stat"><b>' + SUPPORTS.length + '</b> 组羁绊线</div>' +
      '<div class="rel-stat">已缔结 <b>A ' + counts.A + ' · B ' + counts.B + ' · C ' + counts.C + '</b></div>' +
      '<div class="rel-stat">同行未达 C <b>' + none + '</b> · 未同行 <b>' + locked + '</b></div>' +
      '<div class="rel-legend">' + legend + '</div>' +
      '<div class="rel-rules">' +
      '<div class="rel-rule">相邻结束我方阶段 <b>+' + SUPPORT_POINTS_ADJACENT + '</b> 点（' + SUPPORT_RANGE + ' 格内有效）</div>' +
      '<div class="rel-rule">等级门槛 <b>' + r.needs + '</b></div>' +
      '<div class="rel-rule">加成 <b>' + r.hit + '</b>；各级另加等量必杀与暴击回避（' + r.crit + '）</div>' +
      '</div>' +
      '<div class="rel-tip">点击人物或连线查看细节；去「羁绊」页可以听对白、加深羁绊。</div>';
  },

  charPanel(c, id) {
    const base = CHARS[id];
    const cls = (typeof CLASSES !== 'undefined' && CLASSES[base.cls]) || {};
    const el = (typeof ELEMENTS !== 'undefined' && base.element && ELEMENTS[base.element]) || null;
    const state = this.stateOf(c, id);
    const stateText = state === 'roster' ? '已在队中' : state === 'fallen' ? '已殁' : '尚未同行';
    const rows = this.pairsOf(id).map(p => {
      const info = this.edgeInfo(c, p);
      const need = info.rank ? 90 : (info.points >= 50 ? 90 : info.points >= 20 ? 50 : 20);
      return '<button class="rel-prow" data-act="relPair" data-pair="' + p.id + '">' +
        '<span class="rel-pname">' + this.esc(CHARS[this.partnerOf(p, id)].name) + '</span>' +
        '<span class="rel-pair">' + this.esc(p.name) + '</span>' +
        this.rankChip(info.rank) +
        '<span class="rel-ppts">' + info.points + ' / ' + need + '</span></button>';
    }).join('');
    return '<div class="rel-side-title">' + this.esc(base.name) + '</div>' +
      '<div class="rel-who">' + this.pfp(id) +
      '<span class="rel-who-meta"><b>' + this.esc(cls.name || '') + '</b> · ' + this.esc(el ? el.name : '无') + '行<br>' +
      '<span class="rel-who-state s-' + state + '">' + stateText + '</span></span></div>' +
      (rows || '<div class="rel-empty">此人暂无羁绊线。</div>') +
      '<button class="mini-btn rel-goto" data-act="relGoto">前往羁绊页 ▸</button>';
  },

  pairPanel(c, p) {
    const info = this.edgeInfo(c, p);
    const r = this.rankRuleText();
    const nextNeed = info.points >= 90 ? 90 : info.points >= 50 ? 90 : info.points >= 20 ? 50 : 20;
    const dlg = ['C', 'B', 'A'].filter(rk => info.points >= SUPPORT_RANKS.find(x => x.rank === rk).need);
    const rk = info.rank ? SUPPORT_RANKS.find(x => x.rank === info.rank) : null;
    return '<div class="rel-side-title">' + this.esc(p.name) + '</div>' +
      '<div class="rel-who">' + this.pfp(p.a) + '<span class="amp">相</span>' + this.pfp(p.b) + '</div>' +
      '<div class="rel-stat">羁绊 ' + this.rankChip(info.rank) + ' <b>' + info.points + ' / ' + nextNeed + '</b></div>' +
      '<div class="rel-rule">' + (info.points >= 90 ? '已达最高羁绊。' : '再累积 ' + (nextNeed - info.points) + ' 点可升级。') + '</div>' +
      (rk ? '<div class="rel-rule">当前加成：命中/回避 <b>+' + rk.hit + '</b>，必杀与暴击回避 <b>+' + rk.crit + '</b>。</div>' :
        '<div class="rel-rule">尚无羁绊加成（' + r.needs + '）。</div>') +
      '<div class="rel-rule">可听对白：' + (dlg.length ? dlg.join(' / ') : '暂无（需先攒羁绊点）') + '</div>' +
      '<button class="mini-btn rel-goto" data-act="relGoto">前往羁绊页 ▸</button>';
  },

  sidePanel(c) {
    const sel = this.sel;
    let inner = '';
    if (sel && sel.type === 'char' && CHARS[sel.id]) inner = this.charPanel(c, sel.id);
    else if (sel && sel.type === 'pair') {
      const p = SUPPORTS.find(x => x.id === sel.id);
      if (p) inner = this.pairPanel(c, p);
    }
    if (!inner) inner = this.overviewPanel(c);
    return '<aside class="rel-side">' + inner + '</aside>';
  },

  /* ---------- 整页 ---------- */
  html(c) {
    const counts = { A: 0, B: 0, C: 0 };
    for (const p of SUPPORTS) {
      const r = this.edgeInfo(c, p).rank;
      if (r) counts[r]++;
    }
    const lone = this.loneIds();
    return '<div class="rel-head"><h3>人 物 关 系 <span class="codex-count">' + SUPPORTS.length +
      ' 组羁绊 · A ' + counts.A + ' / B ' + counts.B + ' / C ' + counts.C + '</span></h3>' +
      '<div class="codex-hint">点击人物看他与谁结缘，点击连线看这一组。虚线是尚未同行的人。</div></div>' +
      '<div class="rel-wrap"><div class="rel-stage">' + this.svg(c) + '</div>' + this.sidePanel(c) + '</div>' +
      (lone.length
        ? '<div class="rel-foot">独行：' + lone.map(id => this.esc(CHARS[id].name)).join('、') + '——暂未与谁结下羁绊。</div>'
        : '');
  },

  /* ---------- 交互 ---------- */
  selectChar(id) {
    if (!CHARS[id]) return;
    this.sel = (this.sel && this.sel.type === 'char' && this.sel.id === id) ? null : { type: 'char', id: id };
    this.rerender();
  },
  selectPair(id) {
    if (!SUPPORTS.some(x => x.id === id)) return;
    this.sel = (this.sel && this.sel.type === 'pair' && this.sel.id === id) ? null : { type: 'pair', id: id };
    this.rerender();
  },
  clear() { this.sel = null; this.rerender(); },
  rerender() {
    if (typeof Camp !== 'undefined' && Camp.tab === 'relations' && typeof Game !== 'undefined' && Game.campaign) Camp.render();
  }
};
