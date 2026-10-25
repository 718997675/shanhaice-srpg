/* ============================================================
 * 入口：输入、主循环与标题/难度按钮
 * ============================================================ */
(function () {
  'use strict';

  const state = {
    cursor: { x: 0, y: 0 },
    audioArmed: true
  };

  function init() {
    const canvas = document.getElementById('game');
    Render.init(canvas);
    UI.init();
    Camp.init();
    Game.init();
    buildDifficulty();
    bindTitle();
    bindCanvas(canvas);
    bindKeyboard();
    bindLifecycle();

    let last = 0;
    const loop = (now) => {
      const dt = last ? now - last : 16;
      last = now;
      /* 打击感（二期 G）：顿帧期 update 返回 0，渲染层时钟停走 */
      if (typeof Juice !== 'undefined') Juice.update(dt);
      Render.draw();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  function buildDifficulty() {
    const list = document.getElementById('diffList');
    if (!list) return;
    const order = ['easy', 'normal', 'hard'];
    list.innerHTML = order.map(key => {
      const d = DIFFICULTIES[key];
      const meta = '敌军 ×' + d.enemyMul + ' · 敌等级 ' + (d.enemyLv >= 0 ? '+' : '') + d.enemyLv +
        ' · 悔棋 ' + d.rewinds + ' 次 · 经验 ×' + d.expMul;
      return '<button class="diff-card" data-diff="' + key + '">' +
        '<div class="diff-name">' + d.name + '</div>' +
        '<span class="diff-tag">' + (key === 'easy' ? '初入山海' : key === 'normal' ? '守脉之路' : '不可回头') + '</span>' +
        '<div class="diff-desc">' + d.desc + '</div>' +
        '<div class="diff-meta">' + meta + '</div>' +
        '</button>';
    }).join('');
    list.addEventListener('click', e => {
      const card = e.target.closest('[data-diff]');
      if (!card) return;
      Audio.sfx('tap');
      const hero = document.getElementById('heroicToggle');
      Game.askNewJourney(card.dataset.diff, !!(hero && hero.checked));
    });
  }

  function bindTitle() {
    const on = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', () => {
        Audio.ensure();
        Audio.sfx('tap');
        fn();
      });
    };
    on('btnContinue', async () => {
      const ok = Game.continueJourney();
      if (!ok) UI.showScreen('difficulty');
    });
    on('btnNew', () => UI.showScreen('difficulty'));
    on('btnHow', () => Game.showHelp());
    on('btnSettings', () => Game.openSettings());
    const back = document.getElementById('diffBack');
    if (back) back.addEventListener('click', () => {
      Audio.sfx('tap');
      UI.showScreen('title');
      Game.refreshTitle();
    });
  }

  function bindCanvas(canvas) {
    if (!canvas) return;
    canvas.addEventListener('pointerdown', e => {
      if (!Battle.active || !Battle.B || UI.isBlocking()) return;
      /* 点击跳过演出（二期 G）：必须清零 hitstop/timeScale/flash，否则卡半帧 */
      if (Battle.B.busy && typeof Juice !== 'undefined') Juice.clearAll();
      const tile = Render.toTile(e.clientX, e.clientY);
      if (!tile) return;
      state.cursor = tile;
      Battle.onTileTap(tile.x, tile.y);
    });
    canvas.addEventListener('pointermove', e => {
      if (!Battle.active || UI.isBlocking()) return;
      const tile = Render.toTile(e.clientX, e.clientY);
      if (tile) {
        state.cursor = tile;
        Battle.onHover(tile.x, tile.y);
      } else {
        Battle.onHover(null);
      }
    });
    canvas.addEventListener('pointerleave', () => {
      if (Battle.active && Battle.B) Battle.onHover(null);
    });
    canvas.addEventListener('contextmenu', e => {
      e.preventDefault();
      if (!Battle.active || !Battle.B || UI.isBlocking()) return;
      if (Battle.B.selectedUnit) Battle.cancelSelection();
    });
  }

  function bindKeyboard() {
    window.addEventListener('keydown', e => {
      if (!Battle.active || !Battle.B || UI.isBlocking()) return;
      const B = Battle.B;
      const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      if (keys.includes(e.key)) {
        e.preventDefault();
        if (e.key === 'ArrowUp') state.cursor.y = Math.max(0, state.cursor.y - 1);
        if (e.key === 'ArrowDown') state.cursor.y = Math.min(7, state.cursor.y + 1);
        if (e.key === 'ArrowLeft') state.cursor.x = Math.max(0, state.cursor.x - 1);
        if (e.key === 'ArrowRight') state.cursor.x = Math.min(15, state.cursor.x + 1);
        Battle.onHover(state.cursor.x, state.cursor.y);
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        Battle.onTileTap(state.cursor.x, state.cursor.y);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (B.selectedUnit) Battle.cancelSelection();
        else Battle.openMenu();
        return;
      }
      const k = e.key.toLowerCase();
      if (k === 'e') { e.preventDefault(); Battle.askEndTurn(); }
      else if (k === 'd') { e.preventDefault(); Battle.toggleDanger(); }
      else if (k === 'm') { e.preventDefault(); Battle.openMenu(); }
    });
  }

  function bindLifecycle() {
    const kick = () => {
      if (!state.audioArmed) return;
      state.audioArmed = false;
      Audio.ensure();
      if (Battle.active) {
        Audio.playMusic(Battle.B && Battle.B.flags && Battle.B.flags.bossPhase >= 2 ? 'boss' : 'battle');
      } else if (!document.getElementById('campScreen').classList.contains('hidden')) {
        Audio.playMusic('camp');
      } else {
        Audio.playMusic('title');
      }
    };
    window.addEventListener('pointerdown', kick, { once: true });
    window.addEventListener('keydown', kick, { once: true });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && Battle.active && Battle.B && window.Game && Game.saveSuspend) {
        const s = Battle.getSuspendState();
        if (s) Game.saveSuspend(s);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
