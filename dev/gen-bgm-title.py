# -*- coding: utf-8 -*-
"""《山海策 · 灵脉》大菜单（title）古风 BGM 生成器。

设计：D 宫五声 / 66 BPM / 16 小节无缝循环（约 58s）。
编制：洞箫主奏（A 段）→ 古筝主奏（B 段）+ 箫长音对位，
      低音革胡长音铺底、稀疏大鼓与木鱼、五度氛围垫。
输出：assets/audio/bgm/bgm_title.wav（44.1k/16bit/立体声）。
运行：python3 dev/gen-bgm-title.py   （依赖 dev/audio_dsp.py：numpy+scipy）
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from audio_dsp import SR, time_axis, env, osc, apply, sweep, make_ir, note, finish  # noqa: E402
from scipy.signal import lfilter, fftconvolve  # noqa: E402

BPM = 76.0
BEAT = 60.0 / BPM          # 0.789s
BAR = 4.0 * BEAT           # 3.158s
N_BARS = 16
DUR = N_BARS * BAR         # ≈ 50.5s
TAIL = 1.2                 # 循环尾巴（末音衰减空间）
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'audio', 'bgm')

# D 宫五声音阶：D E F# A B
# 低音 D3=50 A2=45 B2=47；中 D4=62 E4=64 F#4=66 A4=69 B4=71；高 D5=74 E5=76 F#5=78 A5=81 B5=83
LEAD_XIAO = [  # (bar, beat, 时长拍, MIDI) —— A 段箫主旋律：级进为主的流动线条（清朗，避大跳长音）
    (0, 0.0, 1.0, 74), (0, 1.0, 0.5, 76), (0, 1.5, 0.5, 78), (0, 2.0, 1.0, 76), (0, 3.0, 1.0, 74),
    (1, 0.0, 1.0, 71), (1, 1.0, 1.0, 74), (1, 2.0, 1.0, 76), (1, 3.0, 1.0, 78),
    (2, 0.0, 1.5, 81), (2, 1.5, 0.5, 78), (2, 2.0, 1.0, 76), (2, 3.0, 1.0, 74),
    (3, 0.0, 1.0, 71), (3, 1.0, 1.0, 69), (3, 2.0, 2.0, 74),
    (4, 0.0, 1.0, 74), (4, 1.0, 0.5, 76), (4, 1.5, 0.5, 78), (4, 2.0, 1.0, 81), (4, 3.0, 1.0, 78),
    (5, 0.0, 1.0, 76), (5, 1.0, 1.0, 74), (5, 2.0, 2.0, 71),
    (6, 0.0, 1.0, 74), (6, 1.0, 1.0, 76), (6, 2.0, 1.0, 78), (6, 3.0, 1.0, 81),
    (7, 0.0, 4.0, 74),
]
LEAD_ZHENG = [  # B 段古筝主奏（第 9 小节起），带跳跃与切分
    (8, 0.0, 0.5, 74), (8, 0.5, 0.5, 81), (8, 1.0, 1.0, 78), (8, 2.0, 1.0, 76), (8, 3.0, 1.0, 74),
    (9, 0.0, 0.5, 71), (9, 0.5, 0.5, 74), (9, 1.0, 1.0, 76), (9, 2.0, 2.0, 74),
    (10, 0.0, 0.5, 69), (10, 0.5, 0.5, 76), (10, 1.0, 1.0, 74), (10, 2.0, 1.0, 71), (10, 3.0, 1.0, 69),
    (11, 0.0, 1.0, 66), (11, 1.0, 1.0, 69), (11, 2.0, 2.0, 74),
    (12, 0.0, 0.5, 74), (12, 0.5, 0.5, 81), (12, 1.0, 1.0, 78), (12, 2.0, 1.0, 76), (12, 3.0, 1.0, 74),
    (13, 0.0, 0.5, 71), (13, 0.5, 0.5, 74), (13, 1.0, 1.0, 76), (13, 2.0, 2.0, 71),
    (14, 0.0, 0.5, 69), (14, 0.5, 0.5, 76), (14, 1.0, 1.0, 74), (14, 2.0, 1.0, 71), (14, 3.0, 1.0, 69),
    (15, 0.0, 4.0, 74),
]
XIAO_ECHO = [  # B 段箫长音对位（每两小节一口，气声绵长）
    (8, 0.0, 4.0, 69), (10, 0.0, 4.0, 66),
    (12, 0.0, 4.0, 69), (14, 0.0, 3.5, 62),
]
BASS = [  # 每小节根音（D 徵羽商交替，3 拍留缝——忌持续低音 drone）
    (0, 50, 3.0), (1, 45, 3.0), (2, 47, 3.0), (3, 45, 3.0),
    (4, 50, 3.0), (5, 45, 3.0), (6, 47, 3.0), (7, 45, 3.0),
    (8, 50, 3.0), (9, 45, 3.0), (10, 47, 3.0), (11, 45, 3.0),
    (12, 50, 3.0), (13, 45, 3.0), (14, 47, 3.0), (15, 50, 3.0),
]
ARPEGGIO = [  # A 段古筝琶音铺底：每拍分解和弦音（D 宫五声）
    (0, [62, 69, 74, 78]), (1, [57, 64, 69, 76]), (2, [59, 66, 71, 78]), (3, [57, 64, 69, 74]),
    (4, [62, 69, 74, 78]), (5, [57, 64, 69, 76]), (6, [59, 66, 71, 78]), (7, [62, 69, 74, 78]),
]
# 氛围垫：每 4 小节一口 8s（根音+五度），忌 15s 长鸣
PAD = [(0, [50, 57]), (4, [50, 57]), (8, [45, 52]), (12, [45, 52])]


def guzheng(f, dur, gain=1.0, damp=0.996, seed=None):
    """古筝：Karplus-Strong 拨弦 + 整体衰减。damp 越接近 1 余音越长。"""
    D = max(2, int(round(SR / f)))
    n = int(dur * SR)
    rng = np.random.default_rng(seed if seed is not None else int(f * 7) % 9999)
    x = rng.uniform(-1.0, 1.0, n + D)
    # y[n] = x[n] + damp·(y[n-D] + y[n-D-1]) / 2 —— 延时线平均=弦阻尼
    a = np.zeros(D + 2)
    a[0] = 1.0
    a[D] = -damp * 0.5
    a[D + 1] = -damp * 0.5
    y = lfilter([1.0], a, x)[:n]
    y *= np.exp(-np.arange(n) / SR / (dur * 0.85))       # 整体衰减
    y = apply(y, "hp", 90.0, 0.707)                       # 去泥
    return gain * y / (np.abs(y).max() + 1e-9)


def xiao(f, dur, gain=1.0, vib=4.6, cents=7.0):
    """洞箫：正弦基音+弱泛音+轻气声，浅颤音（深颤+浓气声=鬼片感，忌）。"""
    t, n = time_axis(dur)
    vibarr = 1.0 + (cents / 1200.0) * np.sin(2.0 * math.pi * vib * t) / 100.0 * 100.0
    farr = f * (1.0 + (cents / 100.0) * np.sin(2.0 * math.pi * vib * t))
    body = osc("sine", farr, t)
    body += 0.22 * osc("sine", 2.0 * farr, t)
    body += 0.08 * osc("sine", 3.0 * farr, t)
    air = sweep(np.random.default_rng(7).standard_normal(n), "bp", 1700.0, 2300.0, Q=0.8) * 0.045
    e = env(dur, [(0.0, 0.0), (0.09, 1.0), (0.25, 0.82), (dur * 0.72, 0.66), (dur, 0.0)])
    return gain * (body + air) * e


def gehu(f, dur, gain=1.0):
    """革胡/低音：基音+奇泛音，慢 attack 长音。"""
    t, n = time_axis(dur)
    x = osc("sine", f, t) + 0.30 * osc("sine", 3.0 * f, t) + 0.10 * osc("sine", 5.0 * f, t)
    e = env(dur, [(0.0, 0.0), (0.12, 0.9), (dur * 0.8, 0.7), (dur, 0.0)])
    return gain * x * e


def drum(gain=1.0):
    """大堂鼓：低频下滑 + 鼓皮噪声。"""
    t, n = time_axis(0.42)
    x = osc("sine", 130.0 * np.exp(-t * 26.0) + 44.0, t) * np.exp(-t * 7.0)
    x += 0.22 * np.random.default_rng(101).standard_normal(n) * np.exp(-t * 260.0)
    return gain * x


def muyu(gain=1.0):
    """木鱼：短促木感 click。"""
    t, n = time_axis(0.12)
    x = osc("sine", 880.0 * np.exp(-t * 8.0) + 500.0, t) * np.exp(-t * 60.0)
    x += 0.3 * np.random.default_rng(103).standard_normal(n) * np.exp(-t * 900.0)
    return gain * apply(x, "bp", 1600.0, 1.2)


def pad_chord(f, dur, gain=1.0):
    """氛围垫：单音长音 + 大混响在外层统一加。"""
    t, n = time_axis(dur)
    x = osc("sine", f, t) + 0.12 * osc("sine", 2.0 * f, t)
    e = env(dur, [(0.0, 0.0), (0.6, 0.85), (dur * 0.8, 0.6), (dur, 0.0)])
    return gain * x * e


def build():
    total = int((DUR + TAIL) * SR)
    mixL = np.zeros(total)
    mixR = np.zeros(total)

    def put(buf, t0, pan=0.5, g=1.0):
        i0 = int(round(t0 * SR))
        i1 = min(total, i0 + len(buf))
        if i1 <= i0:
            return
        seg = buf[: i1 - i0] * g
        mixL[i0:i1] += seg * (1.0 - pan)
        mixR[i0:i1] += seg * pan

    # ---- 氛围垫（最底层，宽） ----
    for bar, midis in PAD:
        for m in midis:
            put(pad_chord(note(m), BAR * 2.4 + 0.4, gain=0.036), bar * BAR, pan=0.5)
    # ---- 低音根音 ----
    for bar, m, beats in BASS:
        put(gehu(note(m), beats * BEAT, gain=0.105), bar * BAR, pan=0.5)
    # ---- A 段古筝琶音（每拍一音，轻，偏右） ----
    for bar, chord in ARPEGGIO:
        for i, m in enumerate(chord):
            put(guzheng(note(m), 1.6, gain=0.18, damp=0.9955, seed=bar * 10 + i),
                bar * BAR + i * BEAT, pan=0.68)
    # ---- A 段箫主旋律（偏左） ----
    for bar, beat, dur, m in LEAD_XIAO:
        put(xiao(note(m), dur * BEAT, gain=0.26), (bar + beat / 4.0) * BAR, pan=0.32)
    # ---- B 段箫长音对位 ----
    for bar, beat, dur, m in XIAO_ECHO:
        put(xiao(note(m), dur * BEAT, gain=0.22), (bar + beat / 4.0) * BAR, pan=0.30)
    # ---- B 段古筝主奏（偏右，音量略顶） ----
    for bar, beat, dur, m in LEAD_ZHENG:
        put(guzheng(note(m), min(dur * BEAT, 2.0), gain=0.55, damp=0.997, seed=m * 3 + bar),
            (bar + beat / 4.0) * BAR, pan=0.66)
    # ---- 打击：大鼓（段首/小节头）+ 木鱼（B 段每小节第 3 拍，极简） ----
    for bar in (0, 4, 8, 12):
        put(drum(gain=0.6), bar * BAR, pan=0.5)
    for bar in range(8, 16):
        put(muyu(gain=0.16), bar * BAR + 2 * BEAT, pan=0.42)

    # ---- 混响：亮而短（长而暗的混响是阴森感主源） ----
    ir = make_ir(1.7, 3.8, seed=42, cutoff=5200.0)
    for mix in (mixL, mixR):
        wet = fftconvolve(mix, ir)[:total]
        wet *= np.sqrt(np.mean(mix ** 2) + 1e-12) / (np.sqrt(np.mean(wet ** 2) + 1e-12) * 3.2)
        mix[:] = mix + wet
    # ---- 总线：首尾淡入淡出（loop 边界对齐） ----
    fade_in = int(0.8 * SR)
    fade_out = int(0.5 * SR)
    ramp = np.linspace(0.0, 1.0, fade_in)
    mixL[:fade_in] *= ramp
    mixR[:fade_in] *= ramp
    ramp = np.linspace(1.0, 0.0, fade_out)
    mixL[-fade_out:] *= ramp
    mixR[-fade_out:] *= ramp
    return np.stack([finish(mixL, 0.82), finish(mixR, 0.82)])


def main():
    os.makedirs(OUT, exist_ok=True)
    print('合成中（约 58s 循环，Karplus-Strong 古筝较慢，耐心等待）…')
    stereo = build()
    path = os.path.join(OUT, 'bgm_title.wav')
    import wave
    pcm = (np.clip(stereo.T, -1.0, 1.0) * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print('写出', path, '|', stereo.shape[1] / SR, 's 立体声')


if __name__ == '__main__':
    main()
