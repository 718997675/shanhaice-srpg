/* ============================================================
 * 界面层：战斗 HUD、对话、弹层、战报与预测
 * ============================================================ */
const UI = {
  el: {},
  _toastTimer: 0,
  _modalResolve: null,
  _modalKeyHandler: null,
  _dlg: null,
  _forecastResolve: null,
  _forecastKeyHandler: null,

  init() {
    const $ = id => document.getElementById(id);
    this.el = {
      battleUI: $('battleUI'), topBar: $('topBar'), chapterName: $('chapterName'),
      objectiveText: $('objectiveText'), turnNum: $('turnNum'), phaseName: $('phaseName'),
      btnDanger: $('btnDanger'), btnSpeed: $('btnSpeed'), btnEndTurn: $('btnEndTurn'),
      sidePanel: $('sidePanel'), battleLog: $('battleLog'), unitCard: $('unitCard'),
      actionBar: $('actionBar'), forecast: $('forecastOverlay'), dangerBadge: $('dangerBadge'),
      phaseBanner: $('phaseBanner'), tapHint: $('tapHint'),
      title: $('titleScreen'), difficulty: $('difficultyScreen'), camp: $('campScreen'),
      result: $('resultScreen'), resultCard: $('resultCard'),
      dialog: $('dialogOverlay'), dialogStage: $('dialogStage'), dialogPortrait: $('dialogPortraitWrap'),
      dialogImg: $('dialogImg'), dialogFallback: $('dialogFallback'), dialogName: $('dialogName'),
      dialogText: $('dialogText'), dialogSkip: $('dialogSkip'),
      modal: $('modalOverlay'), modalBox: $('modalBox'), toast: $('toast'),
      campGold: $('campGold'), campSeals: $('campSeals'), campBody: $('campBody'),
      campTabs: $('campTabs')
    };
    this.el.dialog.addEventListener('click', e => {
      if (e.target.closest('#dialogSkip')) return;
      this._dialogAdvance();
    });
    this.el.dialogSkip.addEventListener('click', e => {
      e.stopPropagation();
      this._dialogSkipAll();
    });
    this.el.modal.addEventListener('click', e => {
      if (e.target === this.el.modal && this.el.modal.dataset.closable === '1') this.closeModal(null);
    });
    this.el.btnDanger.addEventListener('click', () => {
      if (window.Battle) Battle.toggleDanger();
    });
    this.el.btnSpeed.addEventListener('click', () => {
      if (window.Battle) Battle.toggleSpeed();
    });
    this.el.btnEndTurn.addEventListener('click', () => {
      if (window.Battle) Battle.askEndTurn();
    });
    document.getElementById('btnMenu').addEventListener('click', () => {
      if (window.Battle) Battle.openMenu();
    });
  },

  showScreen(name) {
    const screens = {
      title: this.el.title, difficulty: this.el.difficulty, camp: this.el.camp,
      battle: this.el.battleUI, result: this.el.result
    };
    for (const k of Object.keys(screens)) {
      if (screens[k]) screens[k].classList.toggle('hidden', k !== name);
    }
    if (name !== 'battle') {
      this.hideActionBar();
      this.hideUnitCard();
      this.el.dangerBadge.classList.add('hidden');
      this.el.tapHint.classList.add('hidden');
    }
  },

  isBlocking() {
    return !this.el.modal.classList.contains('hidden') ||
      !this.el.dialog.classList.contains('hidden') ||
      !this.el.forecast.classList.contains('hidden');
  },

  chapterLabel(index) {
    const nums = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    return '第' + (nums[index] || index) + '章';
  },

  updateBattle(B) {
    if (!B || !B.chapter) return;
    this.el.chapterName.textContent = this.chapterLabel(B.chapter.id) + ' · ' + B.chapter.name;
    this.el.objectiveText.textContent = '目标：' + B.chapter.objective.text;
    this.el.turnNum.textContent = '第 ' + B.turn + ' 回合';
    this.el.phaseName.textContent = B.phase === 'player' ? '我方阶段' : B.phase === 'enemy' ? '敌方阶段' : '友军阶段';
    this.el.btnSpeed.textContent = '×' + (B.speed || 1);
    this.el.btnDanger.classList.toggle('active', !!B.dangerOn);
    this.el.dangerBadge.classList.toggle('hidden', !B.dangerOn);
    this.el.btnEndTurn.disabled = B.phase !== 'player' || B.busy || B.ending;
    const anyReady = B.units && B.units.some(u => u.side === 'player' && u.hp > 0 && !u.acted && !u.escaped);
    this.el.btnEndTurn.classList.toggle('ready', B.phase === 'player' && !B.busy && !anyReady && !B.ending);
    this.updateSide(B);
    const hint = B.phase === 'player' && !B.busy && !B.ending ? (B.tapHint || '') : '';
    if (hint) {
      this.el.tapHint.textContent = hint;
      this.el.tapHint.classList.remove('hidden');
    } else {
      this.el.tapHint.classList.add('hidden');
    }
  },

  updateSide(B) {
    if (!B || typeof B.sideInfo !== 'function') { this.el.sidePanel.innerHTML = ''; return; }
    const info = B.sideInfo() || [];
    this.el.sidePanel.innerHTML = info.map(item => {
      const cls = item.done ? 'side-item done' : 'side-item';
      const prog = item.progress ? ' <span class="side-progress">' + item.progress + '</span>' : '';
      return '<div class="' + cls + '"><span class="dot"></span>' + this.escape(item.text) + prog + '</div>';
    }).join('');
  },

  setBattleVisible(on) {
    this.el.battleUI.classList.toggle('hidden', !on);
    if (!on) {
      this.hideActionBar();
      this.hideUnitCard();
      this.el.dangerBadge.classList.add('hidden');
      this.el.tapHint.classList.add('hidden');
    }
  },

  log(text, cls) {
    if (!this.el.battleLog) return;
    const div = document.createElement('div');
    div.className = 'log-line' + (cls ? ' ' + cls : '');
    div.textContent = text;
    this.el.battleLog.appendChild(div);
    while (this.el.battleLog.children.length > 4) this.el.battleLog.removeChild(this.el.battleLog.firstChild);
  },

  clearLog() { if (this.el.battleLog) this.el.battleLog.innerHTML = ''; },

  escape(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  charOf(name) {
    const specials = {
      '玄阙': 'xuanque', '山魈王': 'shanxiao', '赤砂将军': 'chisha', '竹妖': 'bamboo',
      '水鬼': 'waterghost', '冰魈': 'icexiao', '沼龙': 'swampdragon', '浊将': 'turbidgeneral',
      '噬脉兽': 'xuanque'
    };
    if (specials[name]) return specials[name];
    for (const id of HERO_ORDER) {
      if (CHARS[id] && CHARS[id].name === name) return id;
    }
    return null;
  },

  portraitHTML(name, cls) {
    const id = this.charOf(name);
    const initial = name ? name.charAt(0) : '？';
    const src = id ? 'assets/portraits/' + id + '.svg' : '';
    return '<span class="thumb-wrap ' + (cls || '') + '"><span class="thumb-letter">' + this.escape(initial) + '</span>' +
      (src ? '<img src="' + src + '" alt="" onerror="this.remove()">' : '') + '</span>';
  },

  unitPortraitHTML(unit) {
    const id = unit.charId || (unit.side === 'enemy' ? this.charOf(unit.name) : null);
    const initial = (unit.name || '？').charAt(0);
    const src = id && CHARS[id] ? 'assets/portraits/' + id + '.svg' : '';
    return '<div class="unit-portrait"><div class="portrait-fallback">' + this.escape(initial) + '</div>' +
      (src ? '<img src="' + src + '" alt="" onerror="this.style.display=\'none\'">' : '') + '</div>';
  },

  unitCard(unit, B, hint) {
    if (!unit) { this.hideUnitCard(); return; }
    const cls = CLASSES[unit.cls];
    const w = Combat.weaponOf(unit) || Combat.staffOf(unit);
    const maxHp = unit.stats.hp;
    const hpPct = Math.max(0, Math.min(100, Math.round(unit.hp / maxHp * 100)));
    const tags = [];
    if (unit.boss) tags.push('首领');
    if (unit.recruitable && unit.side === 'enemy') tags.push('可说得');
    if (unit.escaped) tags.push('已撤离');
    if (unit.statuses && unit.statuses.movePenalty) tags.push('移速下降');
    if (unit.statuses && (unit.statuses.def || unit.statuses.res)) tags.push('破甲');
    if (unit.statuses && unit.statuses.avoid) tags.push('迷眼');
    if (unit.statuses && unit.statuses.root) tags.push('定身');
    if (unit.summoned && unit.summon) {
      const oi = Summon.orderInfo(unit);
      if (oi) tags.push(oi.name);
    }
    const weaponLine = w
      ? '<span class="wchip">' + this.escape(WEAPON_TYPES[w.w.type] ? WEAPON_TYPES[w.w.type].name : '') + '</span>' +
        this.escape(w.w.name) + (w.item.plus ? ' <span class="wchip plus">+' + w.item.plus + '</span>' : '') +
        ' <span class="wchip">耐久 ' + w.item.uses + '</span>'
      : '<span class="wchip">无武器</span>';
    const sideName = unit.side === 'player' ? (unit.summoned ? '友军召唤' : (unit.cls === 'swordsman' && unit.charId === 'yunce' ? '守脉人' : (cls ? cls.name : '友军'))) : (unit.rawType && ENEMY_TYPES[unit.rawType] ? ENEMY_TYPES[unit.rawType].name : (cls ? cls.name : '敌军'));
    this.el.unitCard.innerHTML =
      '<div class="uc-top">' +
        '<div class="uc-face">' + this.portraitHTML(unit.name).replace('thumb-wrap ', 'thumb-inner ') + '</div>' +
        '<div class="uc-id">' +
          '<div class="uc-name">' + (unit.side === 'enemy' ? '<span class="enemy">' + this.escape(unit.name) + '</span>' : this.escape(unit.name)) +
            ' <span class="uc-lv">Lv.' + unit.level + '</span></div>' +
          '<div class="uc-sub">' + this.escape(sideName) + ' · ' + this.escape(unit.rawType && ENEMY_TYPES[unit.rawType] ? '敌军' : (unit.charId ? CHARS[unit.charId] ? CHARS[unit.charId].personal.name : '' : '')) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="uc-hpbar' + (hpPct <= 35 ? ' low' : '') + '"><i style="width:' + hpPct + '%"></i></div>' +
      '<div class="uc-hptext"><span>生命</span><span>' + unit.hp + ' / ' + maxHp + '</span></div>' +
      '<div class="uc-weapon">' + weaponLine + '</div>' +
      '<div class="uc-stats">' +
        '<div>力量<b>' + unit.stats.str + '</b></div>' +
        '<div>技巧<b>' + unit.stats.skl + '</b></div>' +
        '<div>速度<b>' + unit.stats.spd + '</b></div>' +
        '<div>护甲<b>' + unit.stats.def + '</b></div>' +
        '<div>魔抗<b>' + unit.stats.res + '</b></div>' +
      '</div>' +
      (tags.length ? '<div class="uc-tags">' + tags.map(t => '<span>' + t + '</span>').join('') + '</div>' : '') +
      (hint ? '<div class="uc-hint">' + this.escape(hint) + '</div>' : '');
    this.el.unitCard.classList.remove('hidden');
  },

  hideUnitCard() { this.el.unitCard.classList.add('hidden'); },

  actionBar(buttons, hint) {
    const bar = this.el.actionBar;
    bar.innerHTML = '';
    if (hint) {
      const h = document.createElement('div');
      h.className = 'act-hint';
      h.style.cssText = 'flex-basis:100%;text-align:right;font-size:9px;color:#a9a590;padding:0 3px 1px;';
      h.textContent = hint;
      bar.appendChild(h);
    }
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.className = 'act-btn' + (b.cls ? ' ' + b.cls : '');
      btn.disabled = !!b.disabled;
      btn.innerHTML = this.escape(b.label) + (b.sub ? '<span class="act-icon">' + this.escape(b.sub) + '</span>' : '');
      btn.addEventListener('click', () => {
        Audio.sfx('tap');
        if (b.onClick) b.onClick();
      });
      bar.appendChild(btn);
    }
    bar.classList.remove('hidden');
  },

  hideActionBar() { if (this.el.actionBar) this.el.actionBar.classList.add('hidden'); },

  phaseBanner(text, enemy) {
    const el = this.el.phaseBanner;
    el.textContent = text;
    el.classList.remove('hidden');
    el.classList.toggle('enemy', !!enemy);
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => el.classList.add('hidden'), 1350);
  },

  toast(text, ms) {
    clearTimeout(this._toastTimer);
    this.el.toast.textContent = text;
    this.el.toast.classList.remove('hidden');
    this._toastTimer = setTimeout(() => this.el.toast.classList.add('hidden'), ms || 1900);
  },

  /* ---------------- 通用弹层 ---------------- */
  modal(options) {
    const opt = options || {};
    return new Promise(resolve => {
      if (this._modalResolve) this.closeModal(null);
      this._modalResolve = resolve;
      this.el.modal.dataset.closable = opt.closable === false ? '0' : '1';
      let html = '';
      if (opt.title) html += '<h3>' + this.escape(opt.title) + '</h3>';
      if (opt.sub) html += '<div class="modal-sub">' + opt.sub + '</div>';
      if (opt.body) html += '<div class="modal-body">' + opt.body + '</div>';
      if (opt.list && opt.list.length) {
        html += '<div class="modal-list">' + opt.list.map((item, i) =>
          '<button data-mi="' + i + '"' + (item.disabled ? ' disabled' : '') + '><span class="ml-name">' + this.escape(item.label) + '</span><span class="ml-meta">' + this.escape(item.meta || '') + '</span></button>'
        ).join('') + '</div>';
      }
      html += '<div class="modal-actions">' + (opt.buttons || [{ label: '关闭', value: null }]).map((b, i) =>
        '<button data-mb="' + i + '" class="' + (b.cls || '') + '">' + this.escape(b.label) + '</button>'
      ).join('') + '</div>';
      this.el.modalBox.innerHTML = html;
      this.el.modal.classList.remove('hidden');
      if (opt.onMount) {
        try { opt.onMount(this.el.modalBox, this); } catch (e) { console.warn(e); }
      }
      this.el.modalBox.querySelectorAll('[data-mi]').forEach(btn => {
        btn.addEventListener('click', () => {
          const item = opt.list[+btn.dataset.mi];
          Audio.sfx('tap');
          this.closeModal(item ? item.value : null);
        });
      });
      this.el.modalBox.querySelectorAll('[data-mb]').forEach(btn => {
        btn.addEventListener('click', () => {
          const b = (opt.buttons || [])[+btn.dataset.mb] || {};
          Audio.sfx('tap');
          if (b.onClick) {
            const r = b.onClick(this.el.modalBox);
            if (r === false) return;
          }
          if (b.keepOpen) return;
          this.closeModal(b.value === undefined ? null : b.value);
        });
      });
      this._modalKeyHandler = e => {
        if (e.key === 'Escape' && opt.closable !== false) {
          e.preventDefault();
          this.closeModal(null);
        }
      };
      window.addEventListener('keydown', this._modalKeyHandler);
    });
  },

  closeModal(value) {
    if (!this._modalResolve) return;
    const resolve = this._modalResolve;
    this._modalResolve = null;
    this.el.modal.classList.add('hidden');
    this.el.modalBox.innerHTML = '';
    if (this._modalKeyHandler) {
      window.removeEventListener('keydown', this._modalKeyHandler);
      this._modalKeyHandler = null;
    }
    resolve(value === undefined ? null : value);
  },

  async confirm(title, body, yes, no) {
    const r = await this.modal({
      title, sub: body, closable: true,
      buttons: [
        { label: no || '取消', value: false },
        { label: yes || '确认', value: true, cls: 'primary' }
      ]
    });
    return r === true;
  },

  /* ---------------- 战斗预测 ---------------- */
  forecast(ctx, attacker, defender) {
    return new Promise(resolve => {
      if (this._forecastResolve) this._forecastClose(false);
      this._forecastResolve = resolve;
      const f = Combat.forecast(attacker, defender, ctx);
      const aw = Combat.weaponOf(attacker);
      const dw = Combat.weaponOf(defender);
      const atkName = attacker.name;
      const defName = defender.name;
      const tri = f.triangle;
      const tags = [];
      if (f.effective) tags.push('<span class="tri-good">特效克制</span>');
      if (tri.state === 'good') tags.push('<span class="tri-good">' + this.escape(tri.text) + '</span>');
      if (tri.state === 'bad') tags.push('<span class="tri-bad">' + this.escape(tri.text) + '</span>');
      if (f.attacker.double) tags.push('我方追击');
      if (f.defender.canCounter) tags.push('敌方反击');
      if (f.defender.double) tags.push('敌方追击');
      if (attacker.recruitable) tags.push('可说得目标');
      const sideHtml = (u, title, isDef, weapon) => {
        const dmg = isDef ? f.defender.dmg : f.attacker.dmg;
        const hit = isDef ? f.defender.hit : f.attacker.hit;
        const crit = isDef ? f.defender.crit : f.attacker.crit;
        const double = isDef ? f.defender.double : f.attacker.double;
        const counterOk = !isDef || f.defender.canCounter;
        return '<div class="fc-side ' + (isDef ? 'def' : '') + '">' +
          '<div class="fc-who">' + this.escape(title) + '<small>' + this.escape(CLASSES[u.cls] ? CLASSES[u.cls].name : (ENEMY_TYPES[u.rawType] ? ENEMY_TYPES[u.rawType].name : '')) + ' Lv.' + u.level + '</small></div>' +
          '<div class="fc-hp">生命 ' + u.hp + ' / ' + u.stats.hp + (weapon ? ' · ' + this.escape(weapon.w.name) + '（' + weapon.item.uses + '）' : '') + '</div>' +
          (counterOk ? '<div class="fc-row"><span>伤害</span><span class="big">' + dmg + (double ? ' ×2' : '') + '</span></div>' +
          '<div class="fc-row"><span>命中</span><span class="hit">' + hit + '%</span></div>' +
          '<div class="fc-row"><span>暴击</span><span class="crit">' + crit + '%</span></div>' :
          '<div class="fc-row"><span>无法反击</span><span class="hit">—</span></div>') +
          '</div>';
      };
      const html = '<div class="forecast-card">' +
        '<div class="fc-head"><span class="fc-title">交 战 预 测</span><span class="fc-vs">距离 ' + f.distance + ' 格</span></div>' +
        '<div class="fc-sides">' + sideHtml(attacker, atkName, false, aw) + sideHtml(defender, defName, true, dw) + '</div>' +
        '<div class="fc-tags">' + tags.join(' · ') + '</div>' +
        '<div class="fc-actions"><button class="fc-cancel">返回</button><button class="go fc-go">出击</button></div>' +
        (f.attacker.hit < 40 ? '<div class="fc-note">命中偏低，请谨慎。失败的一击仍会消耗武器耐久。</div>' : '<div class="fc-note">暴击造成三倍伤害；攻速差 4 以上可追击。</div>') +
        '</div>';
      this.el.forecast.innerHTML = html;
      this.el.forecast.classList.remove('hidden');
      this.el.forecast.querySelector('.fc-cancel').addEventListener('click', () => this._forecastClose(false));
      this.el.forecast.querySelector('.fc-go').addEventListener('click', () => this._forecastClose(true));
      this._forecastKeyHandler = e => {
        if (e.key === 'Escape') { e.preventDefault(); this._forecastClose(false); }
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._forecastClose(true); }
      };
      window.addEventListener('keydown', this._forecastKeyHandler);
    });
  },

  _forecastClose(result) {
    if (!this._forecastResolve) return;
    const resolve = this._forecastResolve;
    this._forecastResolve = null;
    this.el.forecast.classList.add('hidden');
    this.el.forecast.innerHTML = '';
    if (this._forecastKeyHandler) {
      window.removeEventListener('keydown', this._forecastKeyHandler);
      this._forecastKeyHandler = null;
    }
    resolve(!!result);
  },

  /* ---------------- 剧情对话 ---------------- */
  dialogue(lines, opts) {
    const options = opts || {};
    if (!lines || !lines.length) return Promise.resolve();
    return new Promise(resolve => {
      if (this._dlg) {
        this._dlg.resolve();
        this._dlg = null;
      }
      const state = {
        lines, index: 0, char: 0, text: '', typing: false, timer: 0,
        done: false, resolve
      };
      this._dlg = state;
      this.el.dialog.classList.remove('hidden');
      this.el.dialog.dataset.closable = '1';
      const renderLine = () => {
        const line = lines[state.index];
        if (!line) { this._finishDialogue(); return; }
        const who = line.who || '旁白';
        const isNarration = who === '旁白' || who === '旁白。';
        this.el.dialog.classList.toggle('narration', isNarration);
        this.el.dialogName.textContent = who;
        this.el.dialogText.textContent = '';
        state.text = line.text || '';
        state.char = 0;
        state.typing = true;
        if (!isNarration) {
          const charId = this.charOf(who);
          const id = charId || (line.portrait || '');
          this.el.dialogImg.style.display = 'none';
          this.el.dialogFallback.style.display = 'flex';
          this.el.dialogFallback.textContent = who.charAt(0);
          if (id && CHARS[id]) {
            this.el.dialogImg.onload = () => {
              this.el.dialogImg.style.display = 'block';
              this.el.dialogFallback.style.display = 'none';
            };
            this.el.dialogImg.onerror = () => {
              this.el.dialogImg.style.display = 'none';
              this.el.dialogFallback.style.display = 'flex';
            };
            this.el.dialogImg.src = 'assets/portraits/' + id + '.svg';
            this.el.dialogImg.alt = who;
          } else if (id) {
            this.el.dialogImg.onload = () => {
              this.el.dialogImg.style.display = 'block';
              this.el.dialogFallback.style.display = 'none';
            };
            this.el.dialogImg.onerror = () => {
              this.el.dialogImg.style.display = 'none';
              this.el.dialogFallback.style.display = 'flex';
            };
            this.el.dialogImg.src = 'assets/portraits/' + id + '.svg';
            this.el.dialogImg.alt = who;
          } else {
            this.el.dialogImg.removeAttribute('src');
          }
        }
        clearInterval(state.timer);
        state.timer = setInterval(() => {
          state.char++;
          this.el.dialogText.textContent = state.text.slice(0, state.char);
          if (state.char >= state.text.length) {
            clearInterval(state.timer);
            state.timer = 0;
            state.typing = false;
          }
        }, 18);
      };
      this._renderDialogueLine = renderLine;
      renderLine();
    });
  },

  _dialogAdvance() {
    const s = this._dlg;
    if (!s) return;
    if (!this.el.dialog.classList.contains('hidden') && this.el.dialog.classList.contains('narration')) {
      // 旁白也按同样节奏推进
    }
    if (s.typing) {
      clearInterval(s.timer);
      s.timer = 0;
      s.typing = false;
      this.el.dialogText.textContent = s.text;
      return;
    }
    s.index++;
    if (s.index >= s.lines.length) {
      this._finishDialogue();
      return;
    }
    Audio.sfx('tap');
    this._renderDialogueLine();
  },

  _dialogSkipAll() {
    if (!this._dlg) return;
    this._finishDialogue();
  },

  _finishDialogue() {
    const s = this._dlg;
    if (!s) return;
    this._dlg = null;
    clearInterval(s.timer);
    this.el.dialog.classList.add('hidden');
    this.el.dialog.classList.remove('narration');
    this.el.dialogText.textContent = '';
    this.el.dialogImg.style.display = 'none';
    s.resolve();
  },

  /* ---------------- 升级 ---------------- */
  levelUp(unit, levels) {
    if (!levels || !levels.length) return Promise.resolve();
    Audio.sfx('levelup');
    const gains = {};
    for (const l of levels) {
      for (const k of Object.keys(l.gains || {})) gains[k] = (gains[k] || 0) + l.gains[k];
    }
    const cells = Object.keys(gains).map(k =>
      '<div><b>+' + gains[k] + '</b>' + (STAT_NAMES[k] || k) + '</div>'
    ).join('');
    const html = '<div class="levelup-title">境界精进</div>' +
      '<div class="levelup-sub">' + this.escape(unit.name) + ' 升至 Lv.' + unit.level + '</div>' +
      '<div class="levelup-grid">' + (cells || '<div>无属性成长</div>') + '</div>';
    return this.modal({
      body: html, closable: true,
      buttons: [{ label: '继续', value: true, cls: 'gold' }]
    });
  },

  setResult(html) {
    this.el.resultCard.innerHTML = html;
    this.showScreen('result');
  }
};

if (typeof window !== 'undefined') window.UI = UI;
