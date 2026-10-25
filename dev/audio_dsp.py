# -*- coding: utf-8 -*-
"""迷你音频合成/DSP库：振荡器、包络、双二阶滤波器、扫频滤波、混响、延迟。"""
import math
import numpy as np
from scipy.signal import lfilter, fftconvolve

SR = 44100


def time_axis(dur):
    n = int(round(SR * dur))
    return np.arange(n) / SR, n


def env(dur, points):
    """折线包络，points=[(秒, 值), ...]，线性插值。"""
    t, _ = time_axis(dur)
    pts = sorted(points)
    xs, ys = [pts[0][0]], [pts[0][1]]
    for x, y in pts[1:]:
        if x > xs[-1]:
            xs.append(x)
            ys.append(y)
    return np.interp(t, xs, ys, left=ys[0], right=ys[-1])


def osc(kind, f, t, nharm=None):
    """抗锯齿振荡器。f 可为标量或与 t 等长的频率数组(Hz)，支持滑音/颤音。"""
    f = np.broadcast_to(np.asarray(f, dtype=float), t.shape) if np.ndim(f) else np.full(t.shape, float(f))
    ph = 2.0 * np.pi * np.cumsum(f) / SR
    fmax = max(float(f.max()), 1e-6)
    if kind == "sine":
        return np.sin(ph)
    if kind == "saw":
        nh = nharm or int(min(40, max(1, (SR * 0.45) / fmax)))
        out = np.zeros_like(t)
        for k in range(1, nh + 1):
            out += np.sin(k * ph) / k
        return out * (2.0 / math.pi)
    if kind == "sqr":
        nh = nharm or int(min(24, max(1, (SR * 0.45) / fmax)))
        nh = max(1, nh // 2)
        out = np.zeros_like(t)
        for k in range(1, nh + 1):
            out += np.sin((2 * k - 1) * ph) / (2 * k - 1)
        return out * (4.0 / math.pi)
    raise ValueError(kind)


def biquad(kind, fc, Q=0.707):
    """RBJ 双二阶系数。"""
    fc = float(min(max(fc, 10.0), SR * 0.49))
    w0 = 2.0 * math.pi * fc / SR
    cw, sw = math.cos(w0), math.sin(w0)
    alpha = sw / (2.0 * Q)
    if kind == "lp":
        b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == "hp":
        b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == "bp":
        b = [alpha, 0.0, -alpha]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    else:
        raise ValueError(kind)
    b = np.array(b) / a[0]
    a = np.array([1.0, a[1] / a[0], a[2] / a[0]])
    return b, a


def apply(x, kind, fc, Q=0.707):
    b, a = biquad(kind, fc, Q)
    return lfilter(b, a, x)


def sweep(x, kind, f0, f1, Q=1.0, chunk=128):
    """时变滤波：按 chunk 更新系数，保持滤波器状态连续。"""
    n = len(x)
    out = np.zeros(n)
    z = np.zeros(2)
    pos = 0
    while pos < n:
        m = min(chunk, n - pos)
        p = (pos + m / 2.0) / n
        fc = f0 * (f1 / f0) ** p if (f0 > 0 and f1 > 0) else f0 + (f1 - f0) * p
        b, a = biquad(kind, fc, Q)
        y, z = lfilter(b, a, x[pos:pos + m], zi=z)
        out[pos:pos + m] = y
        pos += m
    return out


def make_ir(dur, decay, seed=1, cutoff=3600.0):
    """指数衰减噪声混响脉冲响应（低通着色）。"""
    t, n = time_axis(dur)
    rng = np.random.default_rng(seed)
    ir = rng.standard_normal(n) * np.exp(-decay * t)
    ir = apply(ir, "lp", cutoff, 0.707)
    ir = apply(ir, "hp", 55.0, 0.707)
    ir /= (np.abs(ir).max() + 1e-9)
    return ir


def reverb(x, dur=1.0, decay=6.0, mix=0.3, seed=1, cutoff=3200.0):
    ir = make_ir(dur, decay, seed, cutoff)
    wet = fftconvolve(x, ir)[: len(x)]
    wet *= (np.sqrt(np.mean(x ** 2) + 1e-12) / (np.sqrt(np.mean(wet ** 2) + 1e-12)) * 0.6)
    return (1 - mix) * x + mix * wet


def delay(x, dsec, g=0.3, taps=3):
    """反馈延迟。"""
    out = x.copy()
    D = int(dsec * SR)
    amp = 1.0
    for k in range(1, taps + 1):
        amp *= g
        sh = np.zeros_like(x)
        if k * D < len(x):
            sh[k * D:] = x[: -k * D]
        out += amp * sh
    return out


def finish(x, peak=0.89):
    """软限幅 + 峰值归一化。"""
    x = np.tanh(x * 1.15)
    m = float(np.max(np.abs(x))) if len(x) else 0.0
    if m > 0:
        x = x / m * peak
    return x


def write_wav(path, x, stereo=False):
    x = np.clip(np.asarray(x, dtype=float), -1.0, 1.0)
    if stereo:
        pcm = (np.stack([x[0], x[1]], axis=1) * 32767).astype("<i2")
    else:
        pcm = (x * 32767).astype("<i2")
    import wave
    with wave.open(path, "wb") as w:
        w.setnchannels(2 if stereo else 1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    return path


def note(midi):
    return 440.0 * 2.0 ** ((midi - 69) / 12.0)


def place(mix, buf, t0):
    i0 = int(round(t0 * SR))
    i1 = min(len(mix), i0 + len(buf))
    if i1 > i0:
        mix[i0:i1] += buf[: i1 - i0]
