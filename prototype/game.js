/* QWOP² – Rendering (Tintenfisch-Mutant, bunte Welt), Eingabe, Wachstums-Meta, Spielschleife */
(function () {
  const Q = window.QWOP2;
  const { createSim, KEYS, LABELS, DT, TUNE, EDGES, OBSTACLES, ZONES, WIND, windAccel, GAP, START_X, CHECKPOINTS } = Q;
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const errBox = document.getElementById('err');
  window.addEventListener('error', e => { errBox.textContent = 'Fehler: ' + e.message; });

  const PPM = 60;
  const PLATEAU_Y = EDGES[EDGES.length - 2].y1;
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };

  // --- Zustand ---
  let genome = Q.sanitizeGenome(store.get('qwop2.genome'));
  let meta = Object.assign({ fails: 0, deaths: 0, cp: 0 }, store.get('qwop2.meta'));
  if (!(meta.cp >= 0 && meta.cp < CHECKPOINTS.length)) meta.cp = 0;
  let best = store.get('qwop2.best') || { dist: 0, frames: [] };
  if (best.ghostDist == null) best.ghostDist = best.frames.length ? best.dist : 0;   // Ghost nur von Läufen ab Start
  const down = new Array(8).fill(false);
  let space = false;
  let camSnap = true, cpToast = null;
  let sim = createSim(genome, meta.cp);
  let offers = null;
  let justGrown = null, grownAt = -1e9;
  let particles = [];

  const saveMeta = () => { store.set('qwop2.meta', meta); store.set('qwop2.genome', genome); };
  function newRun(cpIdx) { sim = createSim(genome, cpIdx === undefined ? meta.cp : cpIdx); down.fill(false); offers = null; camSnap = true; }

  function handleRunEnd() {
    if (sim.handled) return;
    sim.handled = true;
    const d = sim.distance();
    const isBest = d > best.dist;
    if (isBest) best.dist = d;
    if (sim.cpIdx === 0 && d > best.ghostDist) { best.frames = sim.ghost; best.ghostDist = d; }   // Ghost nur ab Start
    if (isBest || sim.cpIdx === 0) store.set('qwop2.best', best);
    meta.deaths++;
    meta.fails = isBest ? 0 : meta.fails + 1;
    saveMeta();
    offers = (meta.fails >= TUNE.offerAfter) ? Q.rollOffers(genome) : null;
    if (offers && !offers.length) offers = null;
    A.over(sim.finished, isBest);
    if (offers) setTimeout(() => A.chime(), 900);
  }

  function chooseOffer(i) {
    const m = offers[i]; if (!m) return;
    genome = Q.applyMutation(genome, m);
    justGrown = m; grownAt = performance.now(); A.grow();
    meta.fails = 0; saveMeta();
    newRun();
    for (let k = 0; k < 28; k++) {
      const a = Math.random() * Math.PI * 2, v = 1 + Math.random() * 3;
      particles.push({ x: 2, y: 1.6, vx: Math.cos(a) * v, vy: Math.sin(a) * v + 2, life: 1.3, hue: Math.random() * 360 });
    }
  }
  function declineOffer() { meta.fails = Math.max(0, Math.round(TUNE.offerAfter / 2)); saveMeta(); newRun(); }

  function onRestartKey() {
    if (!sim.over) {
      if (sim.time > 3) { sim.forceEnd('Aufgegeben'); handleRunEnd(); if (offers) return; }
      newRun();
    } else if (offers) declineOffer();
    else newRun();
  }

  const A = window.QWOP2Audio;
  addEventListener('keydown', e => {
    A.init();                                              // Browser erlaubt Ton erst nach einer Taste
    if (e.code === 'KeyM') { A.toggle(); return; }
    if (e.code === 'Space') { space = true; e.preventDefault(); return; }
    if (e.code === 'KeyR') { onRestartKey(); return; }
    if (e.code === 'KeyT') {                      // von ganz vorn starten (auch für den Ghost)
      if (!sim.over && sim.time > 3) { sim.forceEnd('Aufgegeben'); handleRunEnd(); if (offers) return; }
      if (offers) declineOffer();
      newRun(0); return;
    }
    if (e.code === 'Delete') {
      genome = Q.defaultGenome(); meta = { fails: 0, deaths: 0, cp: 0 }; best = { dist: 0, frames: [], ghostDist: 0 };
      store.set('qwop2.best', best); saveMeta(); justGrown = null; newRun(); return;
    }
    if (offers && sim.over) {
      const n = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
      if (n !== undefined) { chooseOffer(n); return; }
    }
    const i = KEYS.indexOf(e.code);
    if (i >= 0) { if (!down[i] && sim.legs[i] && !sim.over) A.press(i); down[i] = true; e.preventDefault(); }
  });
  addEventListener('keyup', e => {
    if (e.code === 'Space') { space = false; return; }
    const i = KEYS.indexOf(e.code);
    if (i >= 0) { if (down[i] && sim.legs[i] && !sim.over) A.release(i); down[i] = false; }
  });
  addEventListener('blur', () => { down.fill(false); space = false; });

  function resize() {
    const d = window.devicePixelRatio || 1;
    canvas.width = innerWidth * d; canvas.height = innerHeight * d;
    ctx.setTransform(d, 0, 0, d, 0, 0);
  }
  addEventListener('resize', resize); resize();

  // ---------- Darstellung ----------
  let camX = 0, camY = 0;
  const hue = i => `hsl(${i * 40},75%,62%)`;
  const hueDark = i => `hsl(${i * 40},60%,32%)`;
  const BODY = '#5eead4', BODY_DARK = '#0f766e', SPOT = '#2dd4bf';

  function drawBackground(W, H) {
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.85);
    g.addColorStop(0, '#2d1b69'); g.addColorStop(0.5, '#c2418f'); g.addColorStop(1, '#ffb36b');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // Sonne mit Glühen
    const sg = ctx.createRadialGradient(W * 0.75, H * 0.3, 10, W * 0.75, H * 0.3, 170);
    sg.addColorStop(0, 'rgba(255,240,170,.95)'); sg.addColorStop(0.35, 'rgba(255,200,120,.45)'); sg.addColorStop(1, 'rgba(255,160,120,0)');
    ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);
    // Parallax-Hügel
    const layers = [
      { f: 0.08, base: 0.60, amp: 38, wave: 190, c: '#8b3fa0' },
      { f: 0.18, base: 0.66, amp: 46, wave: 130, c: '#5b2a86' },
      { f: 0.32, base: 0.72, amp: 30, wave: 95, c: '#3d1f6b' },
    ];
    for (const L of layers) {
      ctx.fillStyle = L.c; ctx.beginPath(); ctx.moveTo(0, H);
      for (let px = 0; px <= W + 8; px += 8) {
        const wx = px + camX * PPM * L.f;
        const y = H * L.base - L.amp * Math.sin(wx / L.wave) - L.amp * 0.4 * Math.sin(wx / (L.wave * 0.37) + 1.7);
        ctx.lineTo(px, y);
      }
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    }
    // Wolken
    ctx.fillStyle = 'rgba(255,220,240,.22)';
    for (let i = 0; i < 7; i++) {
      const span = W + 400;
      const cx = ((i * 330 - camX * PPM * 0.05) % span + span) % span - 200;
      const cy = 60 + (i * 53) % 160;
      ctx.beginPath(); ctx.ellipse(cx, cy, 70, 18, 0, 0, Math.PI * 2); ctx.ellipse(cx + 40, cy - 10, 45, 16, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  function ellipsePath(rx, ry) { ctx.beginPath(); ctx.ellipse(0, 0, rx * PPM, ry * PPM, 0, 0, Math.PI * 2); }

  function drawTentacle(l, X, Y) {
    const hipP = l.thigh.getWorldPoint(new planck.Vec2(0, TUNE.thigh / 2));
    const kneeP = l.thigh.getWorldPoint(new planck.Vec2(0, -TUNE.thigh / 2));
    const footP = l.shin.getWorldPoint(new planck.Vec2(0, -TUNE.shin / 2));
    const hx = X(hipP.x), hy = Y(hipP.y), kx = X(kneeP.x), ky = Y(kneeP.y), fx = X(footP.x), fy = Y(footP.y);
    const k = 1 + 0.25 * genome.power;
    const w0 = 15 * k, w1 = 10 * k;
    const seg = (x1, y1, x2, y2, w, col) => {
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    };
    seg(hx, hy, kx, ky, w0 + 4, hueDark(l.idx)); seg(kx, ky, fx, fy, w1 + 4, hueDark(l.idx));
    seg(hx, hy, kx, ky, w0, hue(l.idx)); seg(kx, ky, fx, fy, w1, hue(l.idx));
    // Saugnäpfe
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    for (const [x1, y1, x2, y2, ts, r] of [[hx, hy, kx, ky, [0.3, 0.6], 2.6], [kx, ky, fx, fy, [0.3, 0.65], 2.2]]) {
      for (const t of ts) { ctx.beginPath(); ctx.arc(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, r, 0, Math.PI * 2); ctx.fill(); }
    }
    // Krallen
    if (genome.claws > 0) {
      const dx = fx - kx, dy = fy - ky, len = Math.hypot(dx, dy) || 1, base = Math.atan2(dy, dx);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      const n = genome.claws + 1;
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * 0.55;
        ctx.beginPath(); ctx.moveTo(fx + Math.cos(base) * 2, fy + Math.sin(base) * 2); ctx.lineTo(fx + Math.cos(a) * 11, fy + Math.sin(a) * 11); ctx.stroke();
      }
    }
  }

  function mood(now) {
    if (sim.over) return sim.finished ? 'happy' : 'dead';
    if (justGrown && now - grownAt < 3000) return 'happy';
    const tiltAbs = Math.max(Math.abs(sim.rear.getAngle()), Math.abs(sim.front.getAngle()));
    if (tiltAbs > 0.7 || sim.tilt > 0.05) return 'scared';
    const held = down.filter(Boolean).length;
    if (held >= Math.max(2, sim.legCount() * 0.6)) return 'strain';
    return 'idle';
  }

  function drawFace(m, now) {
    const f = sim.front, p = f.getPosition(), v = f.getLinearVelocity();
    ctx.save(); ctx.translate(X_(p.x), Y_(p.y)); ctx.rotate(-f.getAngle());
    const shake = m === 'strain' ? Math.sin(now * 0.07) * 1.6 : 0;
    ctx.translate(shake, 0);
    const blink = (now % 3300) < 130 && m !== 'dead' && m !== 'scared';
    const eyes = [{ x: 0.18, y: 0.2, r: 0.17 }, { x: 0.58, y: 0.17, r: 0.2 }];
    const look = Math.max(-1, Math.min(1, v.x / 3)), lookY = Math.max(-1, Math.min(1, v.y / 3));
    const U = PPM;
    eyes.forEach((e, idx) => {
      let r = e.r * (m === 'scared' ? 1.3 : m === 'strain' ? 0.85 : 1) * U;
      const ex = e.x * U, ey = -e.y * U;
      ctx.lineWidth = 2; ctx.strokeStyle = '#1b1035'; ctx.fillStyle = '#fff';
      if (blink || (m === 'happy' && idx >= 0)) {
        ctx.beginPath();
        if (m === 'happy') ctx.arc(ex, ey + 3, r * 0.8, Math.PI * 1.1, Math.PI * 1.9);   // ^ ^ Freudenaugen
        else { ctx.moveTo(ex - r, ey); ctx.lineTo(ex + r, ey); }
        ctx.lineWidth = 3; ctx.stroke(); return;
      }
      ctx.beginPath(); ctx.arc(ex, ey, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (m === 'dead') {
        ctx.lineWidth = 3; ctx.beginPath();
        ctx.moveTo(ex - r * 0.5, ey - r * 0.5); ctx.lineTo(ex + r * 0.5, ey + r * 0.5);
        ctx.moveTo(ex + r * 0.5, ey - r * 0.5); ctx.lineTo(ex - r * 0.5, ey + r * 0.5); ctx.stroke(); return;
      }
      const pr = r * (m === 'scared' ? 0.28 : 0.5);
      const px = ex + look * (r - pr) * 0.8 + (m === 'strain' ? Math.sin(now * 0.05) : 0);
      const py = ey - lookY * (r - pr) * 0.6;
      ctx.fillStyle = '#1b1035'; ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px - pr * 0.3, py - pr * 0.3, pr * 0.28, 0, Math.PI * 2); ctx.fill();
    });
    // Augenbrauen
    ctx.strokeStyle = '#1b1035'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    if (m !== 'dead') eyes.forEach((e, idx) => {
      const ex = e.x * U, top = -(e.y + e.r) * U - 5, s = idx === 0 ? 1 : -1;   // s=1: innen rechts
      let inY = 0, outY = 0;
      if (m === 'strain') { inY = 6; outY = -3; }               // wütend/konzentriert
      else if (m === 'scared') { inY = -9; outY = 0; }          // besorgt
      else if (m === 'happy') { inY = -5; outY = -5; }
      else { inY = -1; outY = 0; }
      ctx.beginPath(); ctx.moveTo(ex - s * 11, top + outY); ctx.lineTo(ex + s * 11, top + inY); ctx.stroke();
    });
    // Mund
    const mx = 0.4 * U, my = -(-0.1) * U;
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (m === 'happy') {
      ctx.fillStyle = '#7f1d4d'; ctx.arc(mx, my - 4, 13, 0.05 * Math.PI, 0.95 * Math.PI); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (m === 'scared') {
      ctx.fillStyle = '#4a1230'; ctx.ellipse(mx, my + 4, 7, 11, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (m === 'strain') {
      ctx.fillStyle = '#fff'; ctx.rect(mx - 14, my - 2, 28, 9); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 1.5; ctx.beginPath(); for (let i = -10; i <= 10; i += 5) { ctx.moveTo(mx + i, my - 2); ctx.lineTo(mx + i, my + 7); } ctx.stroke();
    } else if (m === 'dead') {
      ctx.moveTo(mx - 14, my + 3); for (let i = 0; i < 6; i++) ctx.lineTo(mx - 14 + (i + 1) * 5, my + (i % 2 ? 3 : -2)); ctx.stroke();
    } else {
      const sm = Math.max(0, Math.min(1, v.x / 3));
      ctx.arc(mx, my - 6, 11, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      if (sm > 0.4) { ctx.stroke(); }
    }
    // Schweißtropfen bei Anstrengung
    if (m === 'strain' || m === 'scared') {
      const d = (now / 400) % 1;
      ctx.fillStyle = 'rgba(160,220,255,.9)'; ctx.beginPath();
      ctx.ellipse(0.9 * U, -(0.5 - d * 0.35) * U, 4, 6, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // X_/Y_ werden pro Frame gesetzt
  let X_ = x => x, Y_ = y => y;

  let lastMood = 'idle';
  function drawCreature(now) {
    // Fangarme zuerst
    sim.legs.forEach(l => { if (l) drawTentacle(l, X_, Y_); });
    // Körperteile als Mantel (hinten) und Kopf (vorn)
    const parts = [
      { b: sim.rear, rx: 1.0, ry: 0.52, oy: 0.14, mantle: true },
      { b: sim.front, rx: 0.94, ry: 0.47, oy: 0.1, mantle: false },
    ];
    for (const P of parts) {
      const p = P.b.getPosition();
      ctx.save(); ctx.translate(X_(p.x), Y_(p.y)); ctx.rotate(-P.b.getAngle());
      ctx.translate(0, -P.oy * PPM);
      ellipsePath(P.rx, P.ry);
      ctx.fillStyle = BODY; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = BODY_DARK; ctx.stroke();
      ctx.fillStyle = SPOT;
      const spots = P.mantle ? [[-0.5, -0.1, 0.12], [-0.1, -0.28, 0.1], [0.35, -0.12, 0.14], [-0.3, 0.2, 0.09]] : [[-0.6, -0.1, 0.1], [0.75, 0.1, 0.08]];
      for (const [sx, sy, sr] of spots) { ctx.beginPath(); ctx.arc(sx * PPM, sy * PPM, sr * PPM, 0, Math.PI * 2); ctx.fill(); }
      if (genome.spine) {          // Kamm entlang des Rückens
        ctx.fillStyle = '#fde047'; ctx.strokeStyle = '#a16207'; ctx.lineWidth = 2;
        for (let i = -2; i <= 2; i++) {
          const bx = i * 0.3 * PPM, by = -P.ry * PPM * Math.sqrt(Math.max(0, 1 - (i * 0.3 / P.rx) ** 2)) + 3;
          ctx.beginPath(); ctx.moveTo(bx - 6, by); ctx.lineTo(bx, by - 13); ctx.lineTo(bx + 6, by); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
      }
      ctx.restore();
    }
    const m = mood(now);
    if (m === 'scared' && lastMood !== 'scared') A.scared();
    lastMood = m;
    drawFace(m, now);
  }

  function draw(now, dtSec) {
    const W = innerWidth, H = innerHeight;
    ctx.textAlign = 'left'; ctx.shadowBlur = 0;
    const mx = (sim.rear.getPosition().x + sim.front.getPosition().x) / 2;
    const my = (sim.rear.getPosition().y + sim.front.getPosition().y) / 2;
    if (camSnap) { camX = mx; camY = Math.max(-2, my - 1.55); camSnap = false; }    // nach Neustart sofort hinspringen
    camX += (mx - camX) * 0.1;
    camY += (Math.max(-2, my - 1.55) - camY) * 0.06;
    const groundScreenY = H * 0.72;
    const X = x => W / 2 + (x - camX) * PPM;
    const Y = y => groundScreenY - (y - camY) * PPM;
    X_ = X; Y_ = Y;

    drawBackground(W, H);

    // Meter-Marker
    ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = '11px monospace'; ctx.lineWidth = 1;
    const x0 = Math.floor((camX - W / 2 / PPM) / 10) * 10;
    for (let x = x0; x < camX + W / 2 / PPM + 10; x += 10) {
      ctx.beginPath(); ctx.moveTo(X(x), 0); ctx.lineTo(X(x), H); ctx.stroke();
      ctx.fillText((x - sim.startX).toFixed(0) + ' m', X(x) + 4, 100);
    }

    // Lava in der Schlucht
    const gx0 = X(GAP[0]), gx1 = X(GAP[1]);
    const lg = ctx.createLinearGradient(0, Y(-2.5), 0, Y(-6));
    lg.addColorStop(0, '#ff9f43'); lg.addColorStop(1, '#c0392b');
    ctx.fillStyle = lg; ctx.fillRect(gx0, Y(-2.5), gx1 - gx0, H);
    ctx.fillStyle = 'rgba(255,230,150,.6)';
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(gx0 + ((i * 37 + now * 0.02) % Math.max(1, gx1 - gx0)), Y(-2.5) + 4 + Math.sin(now / 300 + i) * 3, 5, 0, Math.PI * 2); ctx.fill(); }

    // Boden: Erde + Grasnarbe, Eis blau
    const vx0 = camX - W / 2 / PPM - 2, vx1 = camX + W / 2 / PPM + 2;
    ctx.fillStyle = '#2b1d4e';
    for (const e of EDGES) {
      if (e.y1 < -5 || e.x1 === e.x2) continue;
      if (e.x2 < vx0 || e.x1 > vx1) continue;
      ctx.beginPath(); ctx.moveTo(X(e.x1), Y(e.y1)); ctx.lineTo(X(e.x2) + 1, Y(e.y2)); ctx.lineTo(X(e.x2) + 1, H + 20); ctx.lineTo(X(e.x1), H + 20); ctx.closePath(); ctx.fill();
    }
    ctx.lineWidth = 6; ctx.lineCap = 'round';
    for (const e of EDGES) {
      if (e.y1 < -5) continue;
      if (Math.max(e.x1, e.x2) < vx0 || Math.min(e.x1, e.x2) > vx1) continue;
      ctx.strokeStyle = e.f < 0.1 ? '#bfe9ff' : '#7ee081';
      ctx.beginPath(); ctx.moveTo(X(e.x1), Y(e.y1)); ctx.lineTo(X(e.x2), Y(e.y2)); ctx.stroke();
    }
    // Hürden
    for (const o of OBSTACLES) {
      ctx.fillStyle = '#ffb347'; ctx.strokeStyle = '#a65b00'; ctx.lineWidth = 3;
      ctx.fillRect(X(o.x - o.w / 2), Y(o.y + o.h), o.w * PPM, o.h * PPM); ctx.strokeRect(X(o.x - o.w / 2), Y(o.y + o.h), o.w * PPM, o.h * PPM);
    }
    // Checkpoint-Fahnen
    CHECKPOINTS.forEach((c, i) => {
      if (i === 0 || c.x < vx0 || c.x > vx1) return;
      const on = i <= meta.cp, px = X(c.x), py = Y(c.y);
      ctx.strokeStyle = on ? '#fff' : 'rgba(255,255,255,.4)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - 64); ctx.stroke();
      ctx.fillStyle = on ? '#4ade80' : 'rgba(255,255,255,.3)';
      ctx.beginPath(); ctx.moveTo(px, py - 64); ctx.lineTo(px + 30, py - 54 + Math.sin(now / 250 + i) * 2); ctx.lineTo(px, py - 44); ctx.closePath(); ctx.fill();
    });
    // Zonenschilder
    ctx.font = 'bold 12px monospace';
    for (const z of ZONES) {
      if (z.x1 < vx0 || z.x0 > vx1) continue;
      const by = z.x0 >= 148 ? PLATEAU_Y : 0;
      ctx.fillStyle = z.color; ctx.fillText(z.name.toUpperCase(), X(z.x0) + 6, Y(by) + 26);
      ctx.fillRect(X(z.x0), Y(by) + 30, 3, 12);
    }
    ctx.fillStyle = '#b6ffb0'; ctx.fillText('ZIEL', X(TUNE.finishX) + 8, Y(PLATEAU_Y) - 46);
    ctx.fillRect(X(TUNE.finishX), Y(PLATEAU_Y) - 60, 3, 60);
    ctx.fillStyle = '#fff'; ctx.fillRect(X(TUNE.finishX) + 3, Y(PLATEAU_Y) - 60, 26, 14);
    // Wind-Streifen
    if (vx1 > WIND.x0 && vx0 < WIND.x1) {
      const str = Math.abs(windAccel((WIND.x0 + WIND.x1) / 2, sim.time)) / WIND.accel, span = WIND.x1 - WIND.x0;
      ctx.strokeStyle = `rgba(230,220,255,${0.2 + 0.5 * str})`; ctx.lineWidth = 2;
      for (let i = 0; i < 28; i++) {
        const wx = WIND.x0 + (((i * 7.3 - sim.time * (6 + str * 8)) % span) + span) % span;
        const wy = PLATEAU_Y + 0.4 + (i * 0.37) % 3;
        ctx.beginPath(); ctx.moveTo(X(wx), Y(wy)); ctx.lineTo(X(wx - 0.8 - str), Y(wy)); ctx.stroke();
      }
    }

    // Ghost
    const g = sim.cpIdx === 0 ? best.frames[Math.min(best.frames.length - 1, sim.steps >> 1)] : null;
    if (g) {
      ctx.globalAlpha = 0.3; ctx.fillStyle = '#ffd54f';
      for (const [px, py, pa] of [[g[0], g[1], g[2]], [g[3], g[4], g[5]]]) {
        ctx.save(); ctx.translate(X(px), Y(py)); ctx.rotate(-pa); ellipsePath(0.95, 0.48); ctx.fill(); ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    drawCreature(now);

    // Funken beim Wachsen
    particles = particles.filter(p => (p.life -= dtSec) > 0);
    for (const p of particles) {
      p.vy -= 6 * dtSec; p.x += p.vx * dtSec; p.y += p.vy * dtSec;
      ctx.globalAlpha = Math.min(1, p.life); ctx.fillStyle = `hsl(${p.hue},90%,65%)`;
      ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    drawHud(W, H, now, X, Y);
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(20,10,50,.62)'; ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, 10); else ctx.rect(x, y, w, h);
    ctx.fill();
  }

  function drawHud(W, H, now) {
    // Streckenband
    const sw = W - 40, sxs = 20, sys = 8, total0 = TUNE.finishX;
    for (const z of ZONES) {
      ctx.fillStyle = z.color; ctx.globalAlpha = 0.8;
      ctx.fillRect(sxs + z.x0 / total0 * sw, sys, (z.x1 - z.x0) / total0 * sw - 1, 6);
    }
    ctx.globalAlpha = 1;
    const curX = Math.max(0, Math.min(total0, sim.front.getPosition().x));
    ctx.fillStyle = '#fff'; ctx.fillRect(sxs + curX / total0 * sw - 2, sys - 4, 4, 14);
    ctx.fillStyle = '#ffd54f'; ctx.fillRect(sxs + Math.min(total0, best.dist + START_X) / total0 * sw - 1, sys - 2, 2, 10);
    ctx.fillStyle = '#4ade80';
    CHECKPOINTS.forEach((c, i) => { if (i) ctx.fillRect(sxs + c.x / total0 * sw - 1, sys + 7, 2, 5); });
    if (cpToast && now - cpToast.t < 2200) {
      ctx.textAlign = 'center'; ctx.font = 'bold 26px system-ui';
      ctx.fillStyle = `rgba(134,239,172,${Math.min(1, (2200 - (now - cpToast.t)) / 700)})`;
      ctx.fillText('Checkpoint: ' + cpToast.name, W / 2, 130); ctx.textAlign = 'left';
    }
    const zone = ZONES.find(z => curX >= z.x0 && curX < z.x1);

    // Info-Panel
    const line = 'Bestleistung ' + best.dist.toFixed(1) + ' m  ·  Beine ' + sim.legCount() + '/8  ·  Tode ' + meta.deaths +
      '  ·  Läufe ohne Rekord ' + Math.min(meta.fails, TUNE.offerAfter) + '/' + TUNE.offerAfter + '  ·  R = ab Checkpoint  ·  T = von vorn';
    ctx.font = '14px system-ui';
    const pw = Math.min(W - 20, ctx.measureText(line).width + 28);
    panel(10, 22, pw, 62);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 22px system-ui'; ctx.fillText(sim.distance().toFixed(1) + ' m', 24, 50);
    if (zone) { ctx.fillStyle = zone.color; ctx.font = 'bold 14px system-ui'; ctx.fillText(zone.name, 24 + 110, 50); }
    ctx.font = '14px system-ui'; ctx.fillStyle = '#d9c9ff'; ctx.fillText(line, 24, 72);
    ctx.font = '11px system-ui'; ctx.fillStyle = 'rgba(255,255,255,.45)';
    ctx.fillText('Entf = Fortschritt zurücksetzen  ·  M = Ton an/aus', 20, H - 14);

    // Tastenanzeige
    const kw = 44, gap = 8, mid = 2 * kw;
    const total = 8 * kw + 7 * gap + mid, kx = W / 2 - total / 2, ky = H - 120;
    panel(kx - 16, ky - 28, total + 32, kw + 12 + 30 + 44);
    const pulse = 0.5 + 0.5 * Math.sin(now / 150);
    const growing = justGrown && now - grownAt < 15000;
    ctx.textAlign = 'center';
    for (let i = 0; i < 8; i++) {
      const has = !!sim.legs[i];
      const sx = kx + i * (kw + gap) + (i >= 4 ? mid : 0);
      ctx.lineWidth = 2;
      if (has) {
        ctx.fillStyle = down[i] ? hue(i) : '#262b33'; ctx.fillRect(sx, ky, kw, kw);
        ctx.strokeStyle = hue(i); ctx.strokeRect(sx, ky, kw, kw);
        ctx.fillStyle = down[i] ? '#111' : '#e8ecf2'; ctx.font = 'bold 18px system-ui'; ctx.fillText(LABELS[i], sx + kw / 2, ky + 29);
      } else {
        ctx.setLineDash([4, 4]); ctx.strokeStyle = '#5a5470'; ctx.strokeRect(sx, ky, kw, kw); ctx.setLineDash([]);
        ctx.fillStyle = '#5a5470'; ctx.font = 'bold 18px system-ui'; ctx.fillText(LABELS[i], sx + kw / 2, ky + 29);
      }
      if (growing && justGrown.kind === 'leg' && justGrown.idx === i) {
        ctx.strokeStyle = `rgba(255,255,255,${0.4 + 0.6 * pulse})`; ctx.lineWidth = 4; ctx.strokeRect(sx - 4, ky - 4, kw + 8, kw + 8);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 11px system-ui'; ctx.fillText('NEU', sx + kw / 2, ky - 10);
      }
    }
    const spx = W / 2 - 130, spy = ky + kw + 12;
    if (genome.spine) {
      ctx.fillStyle = space ? '#fbbf24' : '#262b33'; ctx.fillRect(spx, spy, 260, 30);
      ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2; ctx.strokeRect(spx, spy, 260, 30);
      ctx.fillStyle = space ? '#111' : '#e8ecf2'; ctx.font = '13px system-ui'; ctx.fillText('LEERTASTE · Wirbelsäule', W / 2, spy + 20);
      if (growing && justGrown.kind === 'spine') {
        ctx.strokeStyle = `rgba(255,255,255,${0.4 + 0.6 * pulse})`; ctx.lineWidth = 4; ctx.strokeRect(spx - 4, spy - 4, 268, 38);
      }
    } else {
      ctx.setLineDash([4, 4]); ctx.strokeStyle = '#5a5470'; ctx.lineWidth = 2; ctx.strokeRect(spx, spy, 260, 30); ctx.setLineDash([]);
      ctx.fillStyle = '#5a5470'; ctx.font = '13px system-ui'; ctx.fillText('LEERTASTE · noch nicht gewachsen', W / 2, spy + 20);
    }

    // Game-Over / Angebot
    if (sim.over) {
      ctx.fillStyle = 'rgba(15,5,40,.62)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 34px system-ui';
      ctx.fillText(sim.overReason, W / 2, offers ? 80 : H / 2 - 20);
      ctx.font = '18px system-ui'; ctx.fillStyle = '#e0d4ff';
      ctx.fillText(sim.distance().toFixed(1) + ' m', W / 2, offers ? 108 : H / 2 + 14);
      if (!offers) { ctx.fillStyle = '#b8a8e0'; ctx.fillText('R für Neustart', W / 2, H / 2 + 44); }
      else drawOffers(W, H);
    }
    ctx.textAlign = 'left';
  }

  function drawOffers(W, H) {
    ctx.fillStyle = '#ffd54f'; ctx.font = 'bold 22px system-ui';
    ctx.fillText('Du bist oft genug gescheitert. Lass etwas wachsen!', W / 2, 160);
    const cw = Math.min(260, (W - 80) / offers.length - 16), ch = 150, y = 190;
    const totalW = offers.length * cw + (offers.length - 1) * 16;
    offers.forEach((m, i) => {
      const x = W / 2 - totalW / 2 + i * (cw + 16), d = Q.describe(m);
      ctx.fillStyle = '#2a1f55'; ctx.fillRect(x, y, cw, ch);
      ctx.strokeStyle = m.kind === 'leg' ? hue(m.idx) : '#ffd54f'; ctx.lineWidth = 2; ctx.strokeRect(x, y, cw, ch);
      ctx.fillStyle = '#ffd54f'; ctx.font = 'bold 30px system-ui'; ctx.fillText(String(i + 1), x + cw / 2, y + 40);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 16px system-ui'; ctx.fillText(d.title, x + cw / 2, y + 74);
      ctx.fillStyle = '#b8a8e0'; ctx.font = '13px system-ui';
      wrap(d.text, cw - 24).forEach((ln, j) => ctx.fillText(ln, x + cw / 2, y + 102 + j * 18));
    });
    ctx.fillStyle = '#b8a8e0'; ctx.font = '14px system-ui';
    ctx.fillText('Taste 1–' + offers.length + ' wählt  ·  R = ohne Wachstum weiter', W / 2, y + ch + 36);
  }
  function wrap(text, maxW) {
    const words = text.split(' '), lines = []; let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur); return lines;
  }

  // --- Schleife mit festem Zeitschritt ---
  let acc = 0, prev = performance.now();
  function frame(now) {
    const dtSec = Math.min(0.1, (now - prev) / 1000);
    acc += dtSec; prev = now;
    while (acc >= DT) { sim.step(down, space); acc -= DT; }
    if (sim.over) handleRunEnd();
    else {                                          // Checkpoints erreicht?
      while (meta.cp + 1 < CHECKPOINTS.length && sim.front.getPosition().x >= CHECKPOINTS[meta.cp + 1].x + 3) {
        meta.cp++; saveMeta(); cpToast = { name: CHECKPOINTS[meta.cp].name, t: now }; A.checkpoint();
      }
    }
    A.wind(sim.over ? 0 : Math.abs(windAccel(sim.front.getPosition().x, sim.time)) / WIND.accel);
    draw(now, dtSec);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
