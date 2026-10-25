# -*- coding: utf-8 -*-
"""战斗音效采样库生成器：把 SFX 池全面采样化（合成退居兜底）。

产物落 assets/audio/sfx/<case名>.wav（mono 44.1k 16bit），
文件名必须与 js/audio.js sfx() 的 case 名一一对应——SFX 池
（audio-bgm.js）文件就绪即接管，WebAudio 合成不再出声。

用户已生成的 6 个素材（音频工程师 demo）按光谱特征映射：
  sfx_weapon_hit(9.3kHz 亮) → hit_metal    sfx_weapon_crit → hit_crit
  sfx_weapon_slash(81% 高频) → swing_sharp sfx_magic_cast → cast_water
  sfx_skill_charge(789Hz)    → cast_earth  sfx_skill_release → burst_metal
其余 ~24 个由本脚本程序化合成（dev/audio_dsp.py 原语）。

运行：python3 dev/gen-sfx.py
"""
import math
import os
import shutil
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from audio_dsp import SR, time_axis, env, osc, apply, sweep, note  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'audio', 'sfx')
USER_DEMO = os.path.expanduser('~/WorkBuddy AI/2026-10-25-18-02-01/game-audio-demo/assets')

# 用户 demo 素材 → 游戏 case 名（按频谱特征映射，见模块 docstring）
COPY_MAP = {
    'sfx_weapon_hit.wav': 'hit_metal.wav',
    'sfx_weapon_crit.wav': 'hit_crit.wav',
    'sfx_weapon_slash.wav': 'swing_sharp.wav',
    'sfx_magic_cast.wav': 'cast_water.wav',
    'sfx_skill_charge.wav': 'cast_earth.wav',
    'sfx_skill_release.wav': 'burst_metal.wav',
}


# ---------------- 合成原语（numpy 版，参数与 audio.js WebAudio 版对齐） ----------------

def clang(base, dur=0.16, vol=0.5, seed=1):
    """金属撞击：瞬态噪声 + 非谐共振峰 + 低频 body。"""
    t, n = time_axis(dur)
    rng = np.random.default_rng(seed)
    x = np.zeros(n)
    # ① 瞬态：高通白噪声 8ms，直角 attack
    tn = min(int(0.008 * SR), n)
    burst = rng.uniform(-1, 1, tn) * np.pow(1 - np.arange(tn) / tn, 2)
    x[:tn] += vol * burst
    # ② 非谐共振峰 base×[1, 2.37, 4.11]
    for i, r in enumerate([1.0, 2.37, 4.11]):
        dec = 0.05 / (i + 1)
        k = min(int(dec * SR), n)
        tone = osc('sine' if i else 'triangle', base * r, t[:k])
        x[:k] += vol * (0.9 / (i + 1.2)) * tone * np.exp(-np.arange(k) / SR / (dec * 0.7))
    # ③ body
    kb = min(int(0.14 * SR), n)
    body = osc('sine', base * 0.28 * np.exp(-np.arange(kb) / SR * 1.1) + base * 0.16, t[:kb])
    x[:kb] += vol * 0.9 * body * np.exp(-np.arange(kb) / SR / 0.1)
    return apply(x, 'hp', 60.0, 0.707)


def growl(f0, f1, dur, vol=0.5, seed=3):
    """妖物嘶吼：锯齿下滑 + 颤音 + 呼气噪声。"""
    t, n = time_axis(dur)
    steps = max(2, int(dur / 0.06))
    farr = np.zeros(n)
    for i in range(1, steps + 1):
        j = 1 + (i % 2) * 0.06 * (0.5 + ((seed * i) % 7) / 7.0)
        a, b = int((i - 1) / steps * n), int(i / steps * n)
        farr[a:b] = f0 * (f1 / f0) ** (i / steps) * j
    o = osc('saw', farr, t)
    o = apply(o, 'bp', 420.0, 1.6)
    e = env(dur, [(0.0, 0.0), (min(0.05, dur * 0.3), 1.0), (dur * 0.75, 0.7), (dur, 0.0)])
    air = sweep(np.random.default_rng(seed).standard_normal(n), 'bp', 300.0, 300.0, Q=0.8) * 0.5
    return vol * (o + air) * e


def thump(f0, dur=0.15, vol=0.5):
    """低频闷击（肉身/倒地）。"""
    t, n = time_axis(dur)
    o = osc('sine', f0 * np.exp(-np.arange(n) / SR * 22) + f0 * 0.35, t)
    return vol * o * np.exp(-np.arange(n) / SR / (dur * 0.5))


def noise_burst(dur, vol, fc, q=1.4, decay=None):
    """带通噪声爆发。"""
    t, n = time_axis(dur)
    x = np.random.default_rng(11).standard_normal(n)
    x = apply(x, 'bp', fc, q)
    return vol * x * np.exp(-np.arange(n) / SR / (decay or dur * 0.4))


def sweep_noise(dur, vol, f0, f1, q=1.2, kind='bandpass'):
    """扫频噪声（挥击破空/miss）。"""
    t, n = time_axis(dur)
    x = np.random.default_rng(13).standard_normal(n)
    x = sweep(x, kind, f0, f1, Q=q)
    e = env(dur, [(0.0, 0.0), (min(0.02, dur * 0.2), 1.0), (dur, 0.0)])
    return vol * x * e


def tone(f, dur, vol=0.4, kind='sine', slide=1.0, delay=0.0, decay=None):
    """单音（支持滑音与延迟）。"""
    t, n = time_axis(dur)
    farr = f * slide ** (np.arange(n) / SR / dur) if slide != 1.0 else f
    o = osc(kind, farr, t)
    o *= np.exp(-np.arange(n) / SR / (decay or dur * 0.5))
    out = np.zeros(n + int(delay * SR))
    out[int(delay * SR):] = o
    return vol * out


def arp(midis, step, vol=0.4, kind='triangle', decay=0.22):
    """琶音（召唤法阵用）。"""
    total = step * (len(midis) - 1) + 0.5
    out = np.zeros(int(total * SR))
    for i, m in enumerate(midis):
        buf = tone(note(m), 0.5, vol, kind, 1.0, 0, decay)
        i0 = int(i * step * SR)
        nb = min(len(buf), len(out) - i0)
        out[i0:i0 + nb] += buf[:nb]
    return out


def mix(*parts):
    """多轨对齐混音。"""
    n = max(len(p) for p in parts)
    out = np.zeros(n)
    for p in parts:
        out[:len(p)] += p
    return out


def finish(x, peak=0.85):
    """软限幅 + 归一化。"""
    x = np.tanh(x * 1.1)
    m = float(np.max(np.abs(x))) if len(x) else 0.0
    return x / m * peak if m > 0 else x


def tail_reverb(x, mix_ratio=0.10, dur=0.35, seed=5):
    """短混响尾巴（采样比合成版敢加，wav 无实时开销）。"""
    t, n = time_axis(dur)
    ir = np.random.default_rng(seed).standard_normal(n) * np.exp(-8 * t)
    ir = apply(ir, 'lp', 5000, 0.707)
    wet = np.convolve(x, ir)[:len(x)]
    wet *= np.sqrt(np.mean(x ** 2) + 1e-12) / (np.sqrt(np.mean(wet ** 2) + 1e-12) + 1e-12) * 0.5
    return x + mix_ratio * wet


# ---------------- 音效定义（名字 = audio.js case 名） ----------------

def sfx_hit_flesh():
    """肉身命中：金属擦感 + 低频闷击 + crunch（冷兵器刀刀见金）。"""
    return mix(clang(1500, 0.14, 0.42, seed=21), thump(120, 0.14, 0.34),
               noise_burst(0.09, 0.30, 900, 1.4, 0.035))


def sfx_hit_wood():
    """木器命中：木腔共鸣 + 方波 click。"""
    return mix(tone(320, 0.10, 0.34, 'square', 0.7, 0, 0.05),
               tone(780, 0.06, 0.26, 'triangle', 0.8, 0, 0.04),
               noise_burst(0.05, 0.20, 1800, 2.0, 0.02))


def sfx_foe_hit():
    """妖物受击：短嘶吼 + 钝击。"""
    return mix(growl(300, 120, 0.26, 0.5), clang(220, 0.12, 0.34, seed=22))


def sfx_swing_light():
    """轻武器挥击：划空噪声 + 金属泛音。"""
    return mix(sweep_noise(0.16, 0.42, 2600, 700, 1.2),
               tone(2400, 0.07, 0.10, 'sine', 1.4, 0, 0.04))


def sfx_swing_heavy():
    """重武器挥击：低频破空 + 风压。"""
    return mix(sweep_noise(0.30, 0.40, 900, 180, 0.8, 'lowpass'),
               tone(60, 0.22, 0.22, 'sine', 0.7, 0, 0.12))


def sfx_miss():
    """闪避：高频嗖声。"""
    return mix(sweep_noise(0.10, 0.30, 2400, 3200, 2.0),
               tone(880, 0.09, 0.16, 'sine', 1.3, 0, 0.05))


def sfx_death():
    """敌军人类倒地：钝响 + 身体落地。"""
    return mix(clang(300, 0.14, 0.42, seed=31), noise_burst(0.28, 0.34, 200, 1.0, 0.12),
               thump(95, 0.25, 0.30))


def sfx_death_hero():
    """我军阵亡：披甲倒地闷响 + 远钟。"""
    return mix(clang(680, 0.16, 0.46, seed=32), noise_burst(0.35, 0.30, 240, 1.0, 0.18),
               tone(174, 0.9, 0.22, 'sine', 0.55, 0.04, 0.5),
               tone(87, 0.9, 0.18, 'sine', 0.6, 0.10, 0.5))


def sfx_foe_death():
    """妖物死亡：嘶吼长下滑 + 倒地。"""
    return mix(growl(240, 60, 0.70, 0.55), clang(200, 0.14, 0.34, seed=33),
               noise_burst(0.30, 0.26, 160, 1.0, 0.15))


def sfx_boss_death():
    """Boss 死亡：金属闷响 + 长嘶吼 + 低频轰鸣。"""
    return mix(clang(1400, 0.20, 0.5, seed=34), growl(200, 50, 0.90, 0.5, seed=8),
               tone(48, 1.1, 0.34, 'sine', 0.5, 0.1, 0.6),
               noise_burst(0.5, 0.26, 180, 1.0, 0.3))


def sfx_step_foot():
    """真实行走步声：噪声瞬态为主（脚跟「嗒」+ 鞋底「沙」），低频只做重量点缀。

    前两版都失败在主体是 sine 下滑——正弦波瞬态衰减在声学上就是鼓的结构，
    不管频率多低听起来都像鼓。真实脚步声的辨识度全在噪声的高频瞬态纹理上
    （频谱重心 800~2500Hz）。
    """
    def one_step(vol=1.0, seed=1):
        dur = 0.28
        t, n = time_axis(dur)
        rng = np.random.default_rng(seed)
        raw = rng.standard_normal(n)
        # ① 脚跟「嗒」：窄带噪声脉冲，8ms 直角 attack
        click = apply(raw, 'bp', 1800.0, 2.5)
        ec = env(dur, [(0.0, 0.0), (0.008, vol * 0.32), (0.05, vol * 0.10), (0.10, 0.0)])
        # ② 鞋底「沙」：宽带高通噪声，15ms 钝起、长拖尾
        scuff = apply(raw, 'hp', 500.0, 0.8)
        es = env(dur, [(0.0, 0.0), (0.018, vol * 0.30), (0.06, vol * 0.20), (0.14, vol * 0.08), (dur, 0.0)])
        # ③ 极弱地面共振（只给重量感，不能盖过噪声）
        gr = osc('sine', 80, t) * env(dur, [(0.0, 0.0), (0.012, vol * 0.06), (0.08, 0.0)])
        return click * ec + scuff * es + gr

    total = 0.66
    t, n = time_axis(total)
    out = np.zeros(n)
    a = one_step(1.0, seed=1)
    out[:len(a)] += a
    i0 = int(0.30 * SR)
    b = one_step(0.74, seed=2)   # 第二步稍弱，自然左右脚不等响
    nb = min(len(b), len(out) - i0)
    out[i0:i0 + nb] += b[:nb]
    return apply(out, 'lp', 11000, 0.707)


def sfx_step_armor():
    return mix(clang(1300, 0.10, 0.42, seed=41), noise_burst(0.08, 0.34, 1400, 1.6, 0.04))


def sfx_step_beast():
    return mix(noise_burst(0.10, 0.46, 420, 1.2, 0.05),
               tone(85, 0.13, 0.44, 'triangle', 0.6, 0, 0.07))


def sfx_step_fly():
    return sweep_noise(0.22, 0.34, 500, 1300, 1.2)


def sfx_step_horse():
    """马蹄：双蹄击。"""
    a = mix(noise_burst(0.06, 0.42, 700, 1.4, 0.03), tone(130, 0.08, 0.40, 'triangle', 0.7, 0, 0.05))
    b = mix(noise_burst(0.06, 0.38, 700, 1.4, 0.03), tone(120, 0.08, 0.36, 'triangle', 0.7, 0, 0.05))
    out = np.zeros(int(0.25 * SR))
    out[:len(a)] += a
    i0 = int(0.15 * SR)
    nb = min(len(b), len(out) - i0)
    out[i0:i0 + nb] += b[:nb]
    return out


def sfx_cast_metal():
    """金系吟唱：三音上升 + 高频能量聚集。"""
    return mix(arp([62, 69, 74, 78], 0.09, 0.30, 'sine', 0.3),
               sweep_noise(0.70, 0.22, 3000, 6000, 4.0))


def sfx_cast_wood():
    """木系吟唱：温润三音 + 草木生长感。"""
    return mix(arp([50, 57, 62, 69], 0.11, 0.32, 'triangle', 0.35),
               sweep_noise(0.60, 0.16, 500, 900, 1.5))


def sfx_cast_fire():
    """火系吟唱：火焰升腾。"""
    return mix(sweep_noise(0.80, 0.30, 300, 1800, 0.8, 'lowpass'),
               tone(110, 0.60, 0.22, 'sawtooth', 1.6, 0, 0.35))


def sfx_burst_wood():
    return mix(sweep_noise(0.35, 0.42, 1400, 300, 1.2), tone(160, 0.25, 0.34, 'triangle', 0.6, 0, 0.12))


def sfx_burst_water():
    return mix(sweep_noise(0.40, 0.40, 2400, 400, 1.0), tone(520, 0.20, 0.24, 'sine', 0.5, 0, 0.1))


def sfx_burst_fire():
    return mix(sweep_noise(0.45, 0.42, 1600, 200, 0.9, 'lowpass'),
               tone(80, 0.40, 0.36, 'sawtooth', 0.45, 0, 0.25))


def sfx_burst_earth():
    return mix(tone(55, 0.45, 0.44, 'sine', 0.4, 0, 0.3),
               sweep_noise(0.40, 0.36, 400, 120, 1.0, 'lowpass'),
               tone(140, 0.20, 0.20, 'square', 0.6, 0, 0.1))


def sfx_summon():
    """召唤法阵：五声琶音上升 + 低频 swell + 闪高频（新音效）。"""
    swell = tone(80, 1.0, 0.30, 'sine', 2.2, 0.05, 0.55)
    return mix(arp([62, 69, 74, 78, 81], 0.14, 0.36, 'triangle', 0.4),
               swell,
               sweep_noise(0.30, 0.20, 4000, 8000, 3.0),
               tone(48, 0.9, 0.26, 'sine', 0.6, 0.1, 0.5))


def sfx_heal():
    """治疗效果音：暖音琶音（C5-E5-G5-C6）+ 低频「注入暖流」+ 高频光晕尾。

    有温度、可感知生命回流，不是纯电子琴琶音。
    """
    arp_notes = [note(72), note(76), note(79), note(84)]   # C5 E5 G5 C6
    dur_ar = 0.45
    total = 0.06 * 3 + dur_ar + 0.4
    t, n = time_axis(total)
    x = np.zeros(n)
    # ① 暖音琶音（triangle 比 sine 多一点谐波，像钟琴/暖铃）
    for i, f in enumerate(arp_notes):
        i0 = int(i * 0.06 * SR)
        tn = int(dur_ar * SR)
        seg = osc('triangle', f, t[:tn])
        e = env(dur_ar, [(0.0, 0.0), (0.01, 1.0), (dur_ar * 0.3, 0.7), (dur_ar, 0.0)])
        buf = np.zeros(n)
        buf[i0:i0 + tn] += 0.05 * seg * e
        x += buf
    # ② 低频注入：110Hz sine + 5Hz 颤音（像呼吸），0.7s 渐强、1.0s 淡出
    farr = 110 + 8 * np.sin(2 * np.pi * 5 * t)
    x += osc('sine', farr, t) * env(total, [(0.0, 0.0), (0.7, 0.06), (1.0, 0.0)])
    # ③ 高频光点扫频（弱，通透光晕尾）
    glow = sweep(np.random.default_rng(7).standard_normal(n) * 0.3, 'bp', 4000, 8000, Q=3.0)
    x += 0.04 * glow * env(total, [(0.0, 0.0), (0.1, 1.0), (0.45, 0.0), (total, 0.0)])
    # ④ 短混响尾（本音效自带混响，main 里不再叠加）
    ir = np.random.default_rng(11).standard_normal(int(0.4 * SR)) * np.exp(-6 * np.arange(int(0.4 * SR)) / SR)
    ir = apply(ir, 'lp', 5500, 0.707)
    wet = np.convolve(x, ir)[:len(x)]
    wet *= np.sqrt(np.mean(x ** 2) + 1e-12) / (np.sqrt(np.mean(wet ** 2)) + 1e-12) * 0.5
    return apply(x + 0.12 * wet, 'hp', 50.0, 0.707)


# case 名 → 合成函数
GENERATED = {
    'hit_flesh': sfx_hit_flesh, 'hit_wood': sfx_hit_wood, 'foe_hit': sfx_foe_hit,
    'swing_light': sfx_swing_light, 'swing_heavy': sfx_swing_heavy,
    'miss': sfx_miss,
    'death': sfx_death, 'death_hero': sfx_death_hero,
    'foe_death': sfx_foe_death, 'boss_death': sfx_boss_death,
    'step_foot': sfx_step_foot, 'step_armor': sfx_step_armor,
    'step_beast': sfx_step_beast, 'step_fly': sfx_step_fly, 'step_horse': sfx_step_horse,
    'cast_metal': sfx_cast_metal, 'cast_wood': sfx_cast_wood, 'cast_fire': sfx_cast_fire,
    'burst_wood': sfx_burst_wood, 'burst_water': sfx_burst_water,
    'burst_fire': sfx_burst_fire, 'burst_earth': sfx_burst_earth,
    'summon': sfx_summon,
    'heal': sfx_heal,
}

# 不加统一混响的 case（heal 自带混响；脚步必须干声，加了就糊成一片）
NO_TAIL = {'heal', 'step_foot', 'step_armor', 'step_beast', 'step_fly', 'step_horse'}


def write_wav(path, x):
    import wave
    pcm = (np.clip(x, -1.0, 1.0) * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def main():
    """用法：
      python3 dev/gen-sfx.py                        # 全量生成到 assets/audio/sfx
      python3 dev/gen-sfx.py --only heal,step_foot  # 只生成指定 case（改音色后快速迭代）
      python3 dev/gen-sfx.py --only heal --out dev/sfx-preview   # 输出到试听目录
    """
    import argparse
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument('--only', default='', help='逗号分隔的 case 名，只生成这些')
    ap.add_argument('--out', default='', help='输出目录，默认 assets/audio/sfx')
    args = ap.parse_args()
    only = [s.strip() for s in args.only.split(',') if s.strip()]
    out_dir = os.path.abspath(args.out) if args.out else OUT
    os.makedirs(out_dir, exist_ok=True)
    n_ok = 0
    # ① 用户 demo 素材映射复制（只生成指定 case 时，跳过无关的复制）
    for src, dst in COPY_MAP.items():
        if only and dst[:-4] not in only:
            continue
        s = os.path.join(USER_DEMO, src)
        d = os.path.join(out_dir, dst)
        if os.path.exists(s):
            shutil.copyfile(s, d)
            print('复制', src, '→', dst)
            n_ok += 1
        else:
            print('!! 缺用户素材', s)
    # ② 程序化合成
    for name, fn in GENERATED.items():
        if only and name not in only:
            continue
        x = finish(fn())
        if name not in NO_TAIL:
            x = tail_reverb(x)
        write_wav(os.path.join(out_dir, name + '.wav'), x)
        print('合成', name + '.wav', '%.2fs' % (len(x) / SR))
        n_ok += 1
    # ③ 别名：crit 与 hit_crit 在 audio.js 共用同一合成，文件层同素材
    if not only or 'crit' in only or 'hit_crit' in only:
        hc = os.path.join(out_dir, 'hit_crit.wav')
        if os.path.exists(hc):
            shutil.copyfile(hc, os.path.join(out_dir, 'crit.wav'))
            print('别名 hit_crit.wav → crit.wav')
            n_ok += 1
    print('合计', n_ok, '个音效 →', out_dir)


if __name__ == '__main__':
    main()
