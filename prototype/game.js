/* QWOP² – Rendering, Eingabe, Wachstums-Meta, Spielschleife */
(function () {
  const Q = window.QWOP2;
  const { createSim, KEYS, LABELS, DT, TUNE, EDGES, OBSTACLES, ZONES, WIND, windAccel } = Q;
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const errBox = document.getElementById('err');
  window.addEventListener('error', e => { errBox.textContent = 'Fehler: ' + e.message; });

  const PPM = 60;
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };

  // --- Zustand ---
  let genome = Q.sanitizeGenome(store.get('qwop2.genome'));
  let meta = Object.assign({ fails: 0, deaths: 0 }, store.get('qwop2.meta'));
  let best = store.get('qwop2.best') || { dist: 0, frames: [] };
  const down = new Array(8).fill(false);
  let space = false;
  let sim = createSim(genome);
  let offers = null;          // Wachstums-Angebot auf dem Game-Over-Screen
  let justGrown = null;       // {kind, idx} für Hervorhebung im nächsten Lauf
  let grownUntil = 0;

  const saveMeta = () => { store.set('qwop2.meta', meta); store.set('qwop2.genome', genome); };

  function newRun() { sim = createSim(genome); down.fill(false); offers = null; }

  // Ein Lauf ist zu Ende: Bestleistung, Frust-Zähler, ggf. Angebot
  function handleRunEnd() {
    if (sim.handled) return;
    sim.handled = true;
    const d = sim.distance();
    const isBest = d > best.dist;
    if (isBest) { best = { dist: d, frames: sim.ghost }; store.set('qwop2.best', best); }
    meta.deaths++;
    meta.fails = isBest ? 0 : meta.fails + 1;
    saveMeta();
    offers = (meta.fails >= TUNE.offerAfter) ? Q.rollOffers(genome) : null;
    if (offers && !offers.length) offers = null;
  }

  function chooseOffer(i) {
    const m = offers[i]; if (!m) return;
    genome = Q.applyMutation(genome, m);
    justGrown = m; grownUntil = performance.now() + 15000;
    meta.fails = 0; saveMeta();
    newRun();
  }
  function declineOffer() { meta.fails = Math.max(0, Math.round(TUNE.offerAfter / 2)); saveMeta(); newRun(); }

  function onRestartKey() {
    if (!sim.over) {
      // Aufgeben nach >3 s zählt als gescheiterter Lauf
      if (sim.time > 3) {
        sim.forceEnd('Aufgegeben'); handleRunEnd();
        if (offers) return;     // Angebot erst ansehen
      }
      newRun();
    } else if (offers) declineOffer();
    else newRun();
  }

  addEventListener('keydown', e => {
    if (e.code === 'Space') { space = true; e.preventDefault(); return; }
    if (e.code === 'KeyR') { onRestartKey(); return; }
    if (e.code === 'Delete') { // Fortschritt zurücksetzen
      genome = Q.defaultGenome(); meta = { fails: 0, deaths: 0 }; best = { dist: 0, frames: [] };
      store.set('qwop2.best', best); saveMeta(); justGrown = null; newRun(); return;
    }
    if (offers && sim.over) {
      const n = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
      if (n !== undefined) { chooseOffer(n); return; }
    }
    const i = KEYS.indexOf(e.code); if (i >= 0) { down[i] = true; e.preventDefault(); }
  });
  addEventListener('keyup', e => {
    if (e.code === 'Space') { space = false; return; }
    const i = KEYS.indexOf(e.code); if (i >= 0) down[i] = false;
  });
  addEventListener('blur', () => { down.fill(false); space = false; });

  function resize() {
    const d = window.devicePixelRatio || 1;
    canvas.width = innerWidth * d; canvas.height = innerHeight * d;
    ctx.setTransform(d, 0, 0, d, 0, 0);
  }
  addEventListener('resize', resize); resize();

  // --- Zeichnen ---
  let camX = 0, camY = 0;
  const hue = i => `hsl(${i * 40},70%,60%)`;

  function draw() {
    const W = innerWidth, H = innerHeight, now = performance.now();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#14161a'; ctx.fillRect(0, 0, W, H);
    const mx = (sim.rear.getPosition().x + sim.front.getPosition().x) / 2;
    camX += (mx - camX) * 0.1;
    const my = (sim.rear.getPosition().y + sim.front.getPosition().y) / 2;
    camY += (Math.max(-2, my - 1.55) - camY) * 0.06;     // folgt Treppen/Plateau
    const groundScreenY = H * 0.72;
    const X = x => W / 2 + (x - camX) * PPM;
    const Y = y => groundScreenY - (y - camY) * PPM;

    // Meter-Marker
    ctx.strokeStyle = '#2a2e36'; ctx.fillStyle = '#566'; ctx.font = '11px monospace'; ctx.lineWidth = 1;
    const x0 = Math.floor((camX - W / 2 / PPM) / 10) * 10;
    for (let x = x0; x < camX + W / 2 / PPM + 10; x += 10) {
      ctx.beginPath(); ctx.moveTo(X(x), 0); ctx.lineTo(X(x), H); ctx.stroke();
      ctx.fillText((x - sim.startX).toFixed(0) + ' m', X(x) + 4, 16);
    }
    // Boden (Kantenliste), Hürden, Zonenfarben
    const vx0 = camX - W / 2 / PPM - 2, vx1 = camX + W / 2 / PPM + 2;
    ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (const e of EDGES) {
      if (e.y1 < -5) continue;                                  // Grubenboden nicht zeichnen
      if (Math.max(e.x1, e.x2) < vx0 || Math.min(e.x1, e.x2) > vx1) continue;
      ctx.strokeStyle = e.f < 0.1 ? '#8fd0ff' : '#cfd6e0';
      ctx.beginPath(); ctx.moveTo(X(e.x1), Y(e.y1)); ctx.lineTo(X(e.x2), Y(e.y2)); ctx.stroke();
    }
    ctx.fillStyle = '#fb923c';
    for (const o of OBSTACLES) ctx.fillRect(X(o.x - o.w / 2), Y(o.y + o.h), o.w * PPM, o.h * PPM);
    ctx.font = '12px monospace';
    for (const z of ZONES) {
      if (z.x1 < vx0 || z.x0 > vx1) continue;
      ctx.fillStyle = z.color; ctx.globalAlpha = 0.9;
      const by = z.x0 >= 148 ? Q.EDGES[Q.EDGES.length - 2].y1 : 0;
      ctx.fillText(z.name.toUpperCase(), X(z.x0) + 6, Y(by) + 24);
      ctx.fillRect(X(z.x0), Y(by) + 28, 3, 10); ctx.globalAlpha = 1;
    }
    ctx.fillStyle = '#9f9'; ctx.fillText('ZIEL', X(TUNE.finishX) + 6, Y(Q.EDGES[Q.EDGES.length - 2].y1) - 8);
    ctx.fillRect(X(TUNE.finishX), Y(Q.EDGES[Q.EDGES.length - 2].y1) - 40, 3, 40);
    // Wind-Streifen
    if (vx1 > WIND.x0 && vx0 < WIND.x1) {
      const str = Math.abs(windAccel((WIND.x0 + WIND.x1) / 2, sim.time)) / WIND.accel;
      ctx.strokeStyle = `rgba(196,181,253,${0.15 + 0.5 * str})`; ctx.lineWidth = 2;
      for (let i = 0; i < 28; i++) {
        const wx = WIND.x0 + ((i * 7.3 - sim.time * (6 + str * 8)) % (WIND.x1 - WIND.x0) + (WIND.x1 - WIND.x0)) % (WIND.x1 - WIND.x0);
        const wy = Q.EDGES[Q.EDGES.length - 2].y1 + 0.4 + (i * 0.37) % 3;
        ctx.beginPath(); ctx.moveTo(X(wx), Y(wy)); ctx.lineTo(X(wx - 0.8 - str), Y(wy)); ctx.stroke();
      }
    }

    // Ghost
    const g = best.frames[Math.min(best.frames.length - 1, sim.steps >> 1)];
    if (g) {
      ctx.globalAlpha = 0.25; ctx.fillStyle = '#ffd54f';
      for (const [px, py, pa] of [[g[0], g[1], g[2]], [g[3], g[4], g[5]]]) {
        ctx.save(); ctx.translate(X(px), Y(py)); ctx.rotate(-pa);
        ctx.fillRect(-TUNE.bodyHalfW * PPM, -TUNE.bodyHalfH * PPM, TUNE.bodyHalfW * 2 * PPM, TUNE.bodyHalfH * 2 * PPM);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    // Kreatur
    for (let b = sim.world.getBodyList(); b; b = b.getNext()) {
      const ud = b.getUserData(); if (!ud || ud === 'ground') continue;
      const p = b.getPosition(), a = b.getAngle();
      const vs = b.getFixtureList().getShape().m_vertices;
      ctx.save(); ctx.translate(X(p.x), Y(p.y)); ctx.rotate(-a);
      ctx.beginPath(); vs.forEach((v, i) => i ? ctx.lineTo(v.x * PPM, -v.y * PPM) : ctx.moveTo(v.x * PPM, -v.y * PPM)); ctx.closePath();
      ctx.fillStyle = ud.kind === 'body' ? (genome.spine ? '#6ee7b7' : '#4fb08e') : hue(ud.idx);
      ctx.fill(); ctx.restore();
    }

    // HUD
    ctx.fillStyle = '#e8ecf2'; ctx.font = 'bold 22px system-ui';
    ctx.fillText(sim.distance().toFixed(1) + ' m', 20, 40);
    ctx.font = '14px system-ui'; ctx.fillStyle = '#9aa5b1';
    ctx.fillText('Bestleistung ' + best.dist.toFixed(1) + ' m  ·  Beine ' + sim.legCount() + '/8  ·  Tode ' + meta.deaths +
      '  ·  Läufe ohne Rekord ' + Math.min(meta.fails, TUNE.offerAfter) + '/' + TUNE.offerAfter + '  ·  R = Neustart', 20, 62);
    ctx.font = '11px system-ui'; ctx.fillStyle = '#566';
    ctx.fillText('Entf = Fortschritt zurücksetzen', 20, H - 14);

    // Streckenband oben: Zonen, Position und Bestweite
    const sw = Math.min(520, W - 40), sxs = W / 2 - sw / 2, sys = 14, total0 = TUNE.finishX;
    for (const z of ZONES) {
      ctx.fillStyle = z.color; ctx.globalAlpha = 0.55;
      ctx.fillRect(sxs + z.x0 / total0 * sw, sys, (z.x1 - z.x0) / total0 * sw - 1, 6);
    }
    ctx.globalAlpha = 1;
    const curX = Math.max(0, Math.min(total0, sim.front.getPosition().x - sim.startX));
    ctx.fillStyle = '#fff'; ctx.fillRect(sxs + curX / total0 * sw - 2, sys - 4, 4, 14);
    ctx.fillStyle = '#ffd54f'; ctx.fillRect(sxs + Math.min(total0, best.dist) / total0 * sw - 1, sys - 2, 2, 10);
    const zone = ZONES.find(z => curX + sim.startX >= z.x0 && curX + sim.startX < z.x1);
    if (zone) { ctx.textAlign = 'center'; ctx.fillStyle = zone.color; ctx.font = '12px system-ui'; ctx.fillText(zone.name, W / 2, sys + 24); ctx.textAlign = 'left'; }

    // Tastenanzeige
    const kw = 44, gap = 8, mid = 2 * kw;
    const total = 8 * kw + 7 * gap + mid, kx = W / 2 - total / 2, ky = H - 120;
    const pulse = 0.5 + 0.5 * Math.sin(now / 150);
    const growing = justGrown && now < grownUntil;
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
        ctx.setLineDash([4, 4]); ctx.strokeStyle = '#3a4048'; ctx.strokeRect(sx, ky, kw, kw); ctx.setLineDash([]);
        ctx.fillStyle = '#3a4048'; ctx.font = 'bold 18px system-ui'; ctx.fillText(LABELS[i], sx + kw / 2, ky + 29);
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
      ctx.setLineDash([4, 4]); ctx.strokeStyle = '#3a4048'; ctx.lineWidth = 2; ctx.strokeRect(spx, spy, 260, 30); ctx.setLineDash([]);
      ctx.fillStyle = '#3a4048'; ctx.font = '13px system-ui'; ctx.fillText('LEERTASTE · noch nicht gewachsen', W / 2, spy + 20);
    }

    // Game-Over / Angebot
    if (sim.over) {
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 34px system-ui';
      ctx.fillText(sim.overReason, W / 2, offers ? 80 : H / 2 - 20);
      ctx.font = '18px system-ui'; ctx.fillStyle = '#cfd6e0';
      ctx.fillText(sim.distance().toFixed(1) + ' m', W / 2, offers ? 108 : H / 2 + 14);
      if (!offers) { ctx.fillStyle = '#9aa5b1'; ctx.fillText('R für Neustart', W / 2, H / 2 + 44); }
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
      ctx.fillStyle = '#20252d'; ctx.fillRect(x, y, cw, ch);
      ctx.strokeStyle = m.kind === 'leg' ? hue(m.idx) : '#ffd54f'; ctx.lineWidth = 2; ctx.strokeRect(x, y, cw, ch);
      ctx.fillStyle = '#ffd54f'; ctx.font = 'bold 30px system-ui'; ctx.fillText(String(i + 1), x + cw / 2, y + 40);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 16px system-ui'; ctx.fillText(d.title, x + cw / 2, y + 74);
      ctx.fillStyle = '#9aa5b1'; ctx.font = '13px system-ui';
      wrap(d.text, cw - 24).forEach((ln, j) => ctx.fillText(ln, x + cw / 2, y + 102 + j * 18));
    });
    ctx.fillStyle = '#9aa5b1'; ctx.font = '14px system-ui';
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
    acc += Math.min(0.1, (now - prev) / 1000); prev = now;
    while (acc >= DT) { sim.step(down, space); acc -= DT; }
    if (sim.over) handleRunEnd();
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
