import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, SkipForward, RotateCcw, Settings, X } from 'lucide-react';

const MODES = {
  focus: { label: '专注', color: '#B86B4C', light: '#F5EDE7' },
  short: { label: '短休', color: '#5C8A6E', light: '#EAF2EC' },
  long: { label: '长休', color: '#5A7A9B', light: '#E9EEF3' },
};

const DEFAULT_SETTINGS = {
  focus: 25,
  short: 5,
  long: 15,
  autoStart: false,
  sound: true,
};

const STORAGE_KEY = 'onnx-pomodoro';

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// 用 WebAudio 生成柔和提示音，免去音频文件
function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.value = 660;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    o.start();
    o.stop(ctx.currentTime + 0.6);
  } catch {}
}

export default function App() {
  const saved = useRef(loadState());

  // 恢复运行态：若存的 endTime 仍在未来，继续计时；否则按剩余 left 显示
  const restored = (() => {
    const sv = saved.current;
    if (sv?.running && sv.endTime && sv.endTime > Date.now()) {
      return { running: true, endTime: sv.endTime, left: Math.round((sv.endTime - Date.now()) / 1000) };
    }
    return { running: false, endTime: null, left: sv?.left ?? null };
  })();

  const [settings, setSettings] = useState(() => saved.current?.settings || DEFAULT_SETTINGS);
  const [mode, setMode] = useState(() => saved.current?.mode || 'focus');
  const [running, setRunning] = useState(restored.running);
  // left：暂停时的剩余秒数；running 时由 endTime 实时推算
  const [left, setLeft] = useState(() => {
    if (restored.left != null) return restored.left;
    const s = saved.current?.settings || DEFAULT_SETTINGS;
    return s[saved.current?.mode || 'focus'] * 60;
  });
  // endTime：运行中的结束时刻（时间戳）。基于它推算剩余，息屏/后台不影响精度
  const [endTime, setEndTime] = useState(restored.endTime);
  const [counts, setCounts] = useState(() => saved.current?.counts || { date: todayKey(), focus: 0 });
  const [showSettings, setShowSettings] = useState(false);

  const total = settings[mode] * 60;

  // 跨天重置今日番茄数
  useEffect(() => {
    if (counts.date !== todayKey()) {
      setCounts({ date: todayKey(), focus: 0 });
    }
  }, [counts.date]);

  // 计时：running 时用时间戳推算剩余，setInterval 仅负责刷新显示（后台挂起不影响精度）
  useEffect(() => {
    if (!running || !endTime) return;
    const tick = () => {
      const remain = Math.round((endTime - Date.now()) / 1000);
      if (remain <= 0) {
        setLeft(0);
        setRunning(false);
        setEndTime(null);
      } else {
        setLeft(remain);
      }
    };
    tick();
    const id = setInterval(tick, 250); // 250ms 刷新，平滑显示
    return () => clearInterval(id);
  }, [running, endTime]);

  // 到点处理
  useEffect(() => {
    if (left !== 0 || running) return;
    if (settings.sound) playBeep();

    if (mode === 'focus') {
      const newFocus = counts.focus + 1;
      setCounts({ date: counts.date, focus: newFocus });
      // 每4个专注进入长休，否则短休
      const nextMode = newFocus % 4 === 0 ? 'long' : 'short';
      switchMode(nextMode, settings.autoStart);
    } else {
      switchMode('focus', settings.autoStart);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, running]);

  // 持久化
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings, mode, left, endTime, running, counts }));
  }, [settings, mode, left, endTime, running, counts]);

  // 更新文档标题
  useEffect(() => {
    if (running) {
      document.title = `${fmt(left)} · ${MODES[mode].label} — 番茄钟`;
    } else {
      document.title = '番茄钟';
    }
  }, [left, running, mode]);

  const switchMode = useCallback((m, auto) => {
    setMode(m);
    const remain = settings[m] * 60;
    setLeft(remain);
    setEndTime(null);
    setRunning(false);
    if (auto) {
      // 下一帧再启动，确保 left 已更新
      setEndTime(Date.now() + remain * 1000);
      setRunning(true);
    }
  }, [settings]);

  const toggleRun = () => {
    if (running) {
      // 暂停：保留当前剩余，清掉 endTime
      setRunning(false);
      setEndTime(null);
    } else {
      // 开始/继续：基于当前剩余设 endTime
      const remain = left === 0 ? total : left;
      setLeft(remain);
      setEndTime(Date.now() + remain * 1000);
      setRunning(true);
    }
  };

  const reset = () => {
    setRunning(false);
    setEndTime(null);
    setLeft(total);
  };

  const skip = () => {
    if (mode === 'focus') {
      const nextMode = (counts.focus + 1) % 4 === 0 ? 'long' : 'short';
      switchMode(nextMode, false);
    } else {
      switchMode('focus', false);
    }
  };

  const resetAll = () => {
    if (!confirm('清空今日番茄数与所有设置？')) return;
    localStorage.removeItem(STORAGE_KEY);
    setSettings(DEFAULT_SETTINGS);
    setMode('focus');
    setLeft(DEFAULT_SETTINGS.focus * 60);
    setEndTime(null);
    setRunning(false);
    setCounts({ date: todayKey(), focus: 0 });
  };

  // 设置变更时同步当前模式剩余时间（未运行才同步）
  const updateSetting = (key, val) => {
    const next = { ...settings, [key]: val };
    setSettings(next);
    if (!running && key === mode) {
      setLeft(val * 60);
    }
  };

  const R = 130;
  const C = 2 * Math.PI * R;
  const progress = total > 0 ? left / total : 0;
  const modeStyle = {
    '--mode': MODES[mode].color,
    '--mode-light': MODES[mode].light,
  };

  return (
    <div className="app" style={modeStyle}>
      <div className="topbar">
        <div className="tabs">
          {Object.entries(MODES).map(([k, v]) => (
            <button
              key={k}
              className={`tab ${mode === k ? 'tab--active' : ''}`}
              onClick={() => { if (mode !== k) switchMode(k, false); }}
            >{v.label}</button>
          ))}
        </div>
        <button className="settings-fab" onClick={() => setShowSettings(true)} title="设置" aria-label="设置">
          <Settings size={18} />
        </button>
      </div>

      <div className="timer">
        <svg className="timer__svg" viewBox="0 0 280 280">
          <circle className="timer__track" cx="140" cy="140" r={R} strokeWidth="8" />
          <circle
            className="timer__progress"
            cx="140" cy="140" r={R} strokeWidth="8"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - progress)}
          />
        </svg>
        <div className="timer__center">
          <div className="timer__time">{fmt(left)}</div>
          <div className="timer__label">{MODES[mode].label}{running ? ' · 进行中' : ''}</div>
        </div>
      </div>

      <div className="controls">
        <button className="btn btn--icon" onClick={reset} title="重置">
          <RotateCcw size={18} />
        </button>
        <button className="btn btn--primary" onClick={toggleRun}>
          {running ? <Pause size={20} /> : <Play size={20} />}
          <span>{running ? '暂停' : (left === total || left === 0 ? '开始' : '继续')}</span>
        </button>
        <button className="btn btn--icon" onClick={skip} title="跳过">
          <SkipForward size={18} />
        </button>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat__num">{counts.focus}</div>
          <div className="stat__label">今日番茄</div>
        </div>
        <div className="stat">
          <div className="stat__num">{counts.focus % 4 || (counts.focus > 0 ? 4 : 0)}/{4}</div>
          <div className="stat__label">至长休</div>
        </div>
        <div className="stat">
          <div className="stat__num">{Math.round(counts.focus * settings.focus / 60 * 10) / 10}</div>
          <div className="stat__label">专注小时</div>
        </div>
      </div>

      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal" style={modeStyle} onClick={(e) => e.stopPropagation()}>
            <div className="modal__head">
              <span className="modal__title">设置</span>
              <button className="modal__close" onClick={() => setShowSettings(false)} aria-label="关闭">
                <X size={18} />
              </button>
            </div>
            <div className="settings">
              <div className="settings__title">时长（分钟）</div>
              <SettingStepper label="专注" value={settings.focus} min={5} max={90} step={5}
                onChange={(v) => updateSetting('focus', v)} />
              <SettingStepper label="短休" value={settings.short} min={1} max={30} step={1}
                onChange={(v) => updateSetting('short', v)} />
              <SettingStepper label="长休" value={settings.long} min={5} max={60} step={5}
                onChange={(v) => updateSetting('long', v)} />
              <div className="setting">
                <span className="setting__label">完成自动开始下一阶段</span>
                <button className={`toggle ${settings.autoStart ? 'toggle--on' : ''}`}
                  onClick={() => updateSetting('autoStart', !settings.autoStart)} />
              </div>
              <div className="setting">
                <span className="setting__label">提示音</span>
                <button className={`toggle ${settings.sound ? 'toggle--on' : ''}`}
                  onClick={() => updateSetting('sound', !settings.sound)} />
              </div>
              <button className="modal__danger" onClick={resetAll}>清空全部数据</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingStepper({ label, value, min, max, step, onChange }) {
  return (
    <div className="setting">
      <span className="setting__label">{label}</span>
      <div className="setting__ctrl">
        <button className="step" onClick={() => onChange(Math.max(min, value - step))}>−</button>
        <span className="setting__val">{value}</span>
        <button className="step" onClick={() => onChange(Math.min(max, value + step))}>+</button>
      </div>
    </div>
  );
}

function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
