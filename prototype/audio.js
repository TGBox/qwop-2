/* QWOP² – prozeduraler Sound (WebAudio, keine Dateien nötig). M schaltet Ton an/aus. */
(function (root) {
  let ac = null, master = null, windGain = null, windFilter = null, muted = false;
  try { muted = localStorage.getItem('qwop2.muted') === '1'; } catch (e) {}

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return ac; }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ac.destination);
    // Windrauschen: Dauerschleife, Lautstärke folgt der Windstärke
    const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
    windFilter = ac.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 500; windFilter.Q.value = 0.6;
    windGain = ac.createGain(); windGain.gain.value = 0;
    src.connect(windFilter); windFilter.connect(windGain); windGain.connect(master); src.start();
    return ac;
  }

  function tone(freq, dur, o) {
    if (!ac || muted) return;
    o = o || {};
    const t = ac.currentTime + (o.delay || 0), osc = ac.createOscillator(), g = ac.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * o.slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.2, t + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(master); osc.start(t); osc.stop(t + dur + 0.03);
  }

  const NOTE = { C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5, E6: 1318.5 };

  root.QWOP2Audio = {
    init,
    press(i)   { tone(260 + i * 35, 0.09, { type: 'triangle', vol: 0.16, slide: 1.6 }); },   // Bein zieht an
    release(i) { tone(190 + i * 22, 0.12, { type: 'sine', vol: 0.13, slide: 0.55 }); },       // Bein schiebt zurück
    scared()   { tone(520, 0.22, { type: 'square', vol: 0.06, slide: 0.5 }); tone(430, 0.28, { type: 'square', vol: 0.06, slide: 0.5, delay: 0.13 }); },
    checkpoint() { tone(NOTE.E5, 0.18, { type: 'triangle', vol: 0.15 }); tone(NOTE.G5, 0.18, { type: 'triangle', vol: 0.15, delay: 0.1 }); tone(NOTE.C6, 0.35, { type: 'triangle', vol: 0.15, delay: 0.2 }); },
    chime()    { tone(NOTE.G5, 0.25, { type: 'triangle', vol: 0.15 }); tone(NOTE.C6, 0.4, { type: 'triangle', vol: 0.15, delay: 0.14 }); },
    grow() {
      [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.E6].forEach((f, k) => tone(f, 0.35, { type: 'triangle', vol: 0.17, delay: k * 0.08 }));
      for (let k = 0; k < 6; k++) tone(1800 + Math.random() * 1800, 0.12, { vol: 0.05, delay: 0.1 + k * 0.07 });
    },
    over(finished, newBest) {
      if (finished) [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.G5, NOTE.C6, NOTE.E6].forEach((f, k) => tone(f, 0.3, { type: 'triangle', vol: 0.18, delay: k * 0.1 }));
      else {
        tone(330, 0.7, { type: 'sawtooth', vol: 0.09, slide: 0.35 });
        tone(247, 0.8, { type: 'triangle', vol: 0.1, slide: 0.4, delay: 0.1 });
        if (newBest) { tone(NOTE.G5, 0.2, { type: 'triangle', vol: 0.12, delay: 0.7 }); tone(NOTE.C6, 0.3, { type: 'triangle', vol: 0.12, delay: 0.85 }); }
      }
    },
    wind(level) {
      if (!ac) return;
      windGain.gain.setTargetAtTime(muted ? 0 : level * 0.22, ac.currentTime, 0.12);
      windFilter.frequency.setTargetAtTime(350 + level * 700, ac.currentTime, 0.12);
    },
    toggle() {
      init(); muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      try { localStorage.setItem('qwop2.muted', muted ? '1' : '0'); } catch (e) {}
      return muted;
    },
    isMuted: () => muted,
  };
})(typeof window !== 'undefined' ? window : globalThis);
