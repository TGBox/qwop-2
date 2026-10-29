/* QWOP² – Simulation (Physik + Regeln + Mutationen), ohne Rendering.
 * Alle Tuning-Werte stehen in TUNE. */
(function (root) {
  const pl = root.planck;

  const KEYS = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'];
  const LABELS = ['A', 'S', 'D', 'F', 'J', 'K', 'L', ';'];
  const FINGERS = ['linker kleiner Finger', 'linker Ringfinger', 'linker Mittelfinger', 'linker Zeigefinger',
                   'rechter Zeigefinger', 'rechter Mittelfinger', 'rechter Ringfinger', 'rechter kleiner Finger'];
  const DT = 1 / 60;

  const TUNE = {
    gravity: -9.8,
    bodyHalfW: 0.8, bodyHalfH: 0.2,
    thigh: 0.7, shin: 0.7,
    legOffsets: [-0.55, -0.18, 0.18, 0.55],
    hipRest: -0.25, hipPress: 1.0,
    kneeRest: -0.15, kneePress: -1.3,
    hipLimits: [-1.0, 1.3],
    hipTorque: 14, kneeTorque: 9,
    motorGain: 12, motorMaxSpeed: 10,
    pressEase: 18,
    spineRest: -0.05, spinePress: 0.35, spineTorque: 25,
    footFriction: 1.2,
    clawBonus: 0.4,      // je Krallen-Stufe
    powerBonus: 0.3,     // je Muskel-Stufe
    // Regeln
    tiltLimit: 1.7, tiltEndTime: 3,     // erst wenn wirklich auf dem Rücken/Kopf: Lauf endet
    stallTime: 20,                      // s ohne neue Bestweite -> "Festgefahren"
    finishX: 200,
    pitY: -4,
    offerAfter: 10,      // Läufe ohne neuen Rekord bis zum Wachstums-Angebot
  };

  // ---------- Genom / Mutationen ----------
  const defaultGenome = () => ({ legs: [2, 5], spine: false, claws: 0, power: 0 });
  function sanitizeGenome(g) {
    const d = defaultGenome();
    if (!g || !Array.isArray(g.legs)) return d;
    const legs = [...new Set(g.legs.filter(i => Number.isInteger(i) && i >= 0 && i < 8))];
    return {
      legs: legs.length ? legs : d.legs, spine: !!g.spine,
      claws: Math.min(2, g.claws | 0), power: Math.min(2, g.power | 0),
    };
  }
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  function rollOffers(g) {
    const missing = shuffle([0, 1, 2, 3, 4, 5, 6, 7].filter(i => !g.legs.includes(i)));
    const legOpts = missing.slice(0, 2).map(idx => ({ kind: 'leg', idx }));
    const extras = [];
    if (!g.spine && g.legs.length >= 4) extras.push({ kind: 'spine' });
    if (g.claws < 2) extras.push({ kind: 'claws' });
    if (g.power < 2) extras.push({ kind: 'power' });
    const res = [];
    if (legOpts[0]) res.push(legOpts[0]);
    const spine = extras.find(e => e.kind === 'spine');
    if (spine) res.push(spine);
    const rest = shuffle([...legOpts.slice(1), ...extras.filter(e => e !== spine)]);
    return [...res, ...rest].slice(0, 3);
  }
  function applyMutation(g, m) {
    const n = JSON.parse(JSON.stringify(g));
    if (m.kind === 'leg') n.legs.push(m.idx);
    else if (m.kind === 'spine') n.spine = true;
    else if (m.kind === 'claws') n.claws++;
    else if (m.kind === 'power') n.power++;
    return n;
  }
  function describe(m) {
    if (m.kind === 'leg') return { title: 'Neues Bein · Taste ' + LABELS[m.idx], text: FINGERS[m.idx] + ' · ' + (m.idx < 4 ? 'hinten' : 'vorn') };
    if (m.kind === 'spine') return { title: 'Wirbelsäule', text: 'Beide Daumen · Leertaste beugt den Körper' };
    if (m.kind === 'claws') return { title: 'Krallenfüße', text: 'Mehr Halt an den Füßen (+40 %)' };
    return { title: 'Starke Muskeln', text: 'Alle Beingelenke +30 % Kraft' };
  }

  // ---------- Gelände ----------
  // Zonen: jede hat eine eigene Aufgabe
  const ZONES = [
    { name: 'Einstieg', x0: 0, x1: 40, color: '#6ee7b7' },
    { name: 'Hügel', x0: 40, x1: 90, color: '#a3e635' },
    { name: 'Eis', x0: 90, x1: 115, color: '#8fd0ff' },
    { name: 'Schlucht', x0: 115, x1: 118.5, color: '#ff8a80' },
    { name: 'Treppe', x0: 118.5, x1: 148, color: '#fbbf24' },
    { name: 'Windkorridor', x0: 148, x1: 175, color: '#c4b5fd' },
    { name: 'Hürden', x0: 175, x1: 200, color: '#fb923c' },
  ];
  const GAP = [115, 118.5];
  const STAIRS = { x0: 128, steps: 10, run: 2.0, rise: 0.18 };
  const PLATEAU_Y = STAIRS.steps * STAIRS.rise;
  const WIND = { x0: 150, x1: 175, accel: 2.8 };   // m/s² nach hinten, pulsiert

  // Gelände als Kantenliste {x1,y1,x2,y2,f}
  function buildEdges() {
    const E = [];
    const line = (x1, y1, x2, y2, f) => E.push({ x1, y1, x2, y2, f: f == null ? 0.9 : f });
    line(-10, 0, 40, 0);
    for (let x = 40; x < 90; x += 0.5) {                      // Hügel
      const y = a => 0.5 * (1 - Math.cos((a - 40) * 2 * Math.PI / 12)) * 0.9;
      line(x, y(x), x + 0.5, y(x + 0.5));
    }
    line(90, 0, 115, 0, 0.04);                                 // Eis
    line(GAP[1], 0, STAIRS.x0, 0);                             // nach der Schlucht
    for (let i = 0; i < STAIRS.steps; i++) {                   // Treppe
      const x = STAIRS.x0 + i * STAIRS.run, y = i * STAIRS.rise;
      line(x, y, x + STAIRS.run, y);
      line(x + STAIRS.run, y, x + STAIRS.run, y + STAIRS.rise);
    }
    line(STAIRS.x0 + STAIRS.steps * STAIRS.run, PLATEAU_Y, 240, PLATEAU_Y);
    E.push({ x1: GAP[0] - 1, y1: -8, x2: GAP[1] + 1, y2: -8, f: 0.5 });  // Grubenboden
    return E;
  }
  const EDGES = buildEdges();
  const OBSTACLES = [177, 181, 185, 189, 193].map((x, i) => ({ x, w: 0.3, h: i % 2 ? 0.55 : 0.4, y: PLATEAU_Y }));

  // Wind: negative Beschleunigung (nach hinten), pulsierend
  function windAccel(x, t) {
    if (x < WIND.x0 || x > WIND.x1) return 0;
    return -WIND.accel * (0.55 + 0.45 * Math.sin(t * 1.4));
  }

  // ---------- Simulation ----------
  function createSim(genome) {
    const gen = sanitizeGenome(genome);
    const world = new pl.World({ gravity: new pl.Vec2(0, TUNE.gravity) });
    const ground = world.createBody({ type: 'static', userData: 'ground' });
    for (const e of EDGES) {
      ground.createFixture(new pl.Edge(new pl.Vec2(e.x1, e.y1), new pl.Vec2(e.x2, e.y2)),
        { friction: e.f, filterCategoryBits: 1, filterMaskBits: 0xffff });
    }
    for (const o of OBSTACLES) {
      ground.createFixture(new pl.Box(o.w / 2, o.h / 2, new pl.Vec2(o.x, o.y + o.h / 2), 0),
        { friction: 0.9, filterCategoryBits: 1, filterMaskBits: 0xffff });
    }

    const MASK = { filterCategoryBits: 2, filterMaskBits: 1 };
    const sx = 2, sy = 0.2 + TUNE.thigh + TUNE.shin + 0.05;
    const power = 1 + TUNE.powerBonus * gen.power;
    const foot = TUNE.footFriction * (1 + TUNE.clawBonus * gen.claws);

    function mkBody(cx, cy, hw, hh, ud, friction) {
      const b = world.createBody({ type: 'dynamic', position: new pl.Vec2(cx, cy), userData: ud });
      b.createFixture(new pl.Box(hw, hh), Object.assign({ density: 1, friction }, MASK));
      return b;
    }

    const rear = mkBody(sx - TUNE.bodyHalfW - 0.05, sy, TUNE.bodyHalfW, TUNE.bodyHalfH, { kind: 'body' }, 0.4);
    const front = mkBody(sx + TUNE.bodyHalfW + 0.05, sy, TUNE.bodyHalfW, TUNE.bodyHalfH, { kind: 'body' }, 0.4);
    const spine = world.createJoint(new pl.RevoluteJoint({
      enableLimit: true, lowerAngle: gen.spine ? -0.5 : 0, upperAngle: gen.spine ? 0.6 : 0,
      enableMotor: true, maxMotorTorque: TUNE.spineTorque, motorSpeed: 0,
    }, rear, front, new pl.Vec2(sx, sy)));

    const legs = new Array(8).fill(null);
    [rear, front].forEach((seg, si) => {
      TUNE.legOffsets.forEach((ox, li) => {
        const idx = si * 4 + li;
        if (!gen.legs.includes(idx)) return;
        const hx = seg.getPosition().x + ox, hy = sy - TUNE.bodyHalfH;
        const thigh = mkBody(hx, hy - TUNE.thigh / 2, 0.06, TUNE.thigh / 2, { kind: 'leg', idx }, 0.5);
        const shin = mkBody(hx, hy - TUNE.thigh - TUNE.shin / 2, 0.05, TUNE.shin / 2, { kind: 'leg', idx }, foot);
        const hip = world.createJoint(new pl.RevoluteJoint({
          enableLimit: true, lowerAngle: TUNE.hipLimits[0], upperAngle: TUNE.hipLimits[1],
          enableMotor: true, maxMotorTorque: TUNE.hipTorque * power, motorSpeed: 0,
        }, seg, thigh, new pl.Vec2(hx, hy)));
        const knee = world.createJoint(new pl.RevoluteJoint({
          enableLimit: true, lowerAngle: -1.8, upperAngle: 0.1,
          enableMotor: true, maxMotorTorque: TUNE.kneeTorque * power, motorSpeed: 0,
        }, thigh, shin, new pl.Vec2(hx, hy - TUNE.thigh)));
        legs[idx] = { idx, thigh, shin, hip, knee, press: 0 };
      });
    });

    const s = {
      world, rear, front, spine, legs, genome: gen,
      steps: 0, time: 0, startX: sx, bestX: sx, lastProgressT: 0,
      tilt: 0, over: false, overReason: '', finished: false, handled: false,
      spinePress: 0, ghost: [],
    };

    function drive(joint, target) {
      const err = target - joint.getJointAngle();
      joint.setMotorSpeed(Math.max(-TUNE.motorMaxSpeed, Math.min(TUNE.motorMaxSpeed, err * TUNE.motorGain)));
    }
    function end(reason, finished) { s.over = true; s.overReason = reason; s.finished = !!finished; }

    s.step = function (down, space) {
      if (s.over) { world.step(DT, 6, 3); return; }
      const k = Math.min(1, DT * TUNE.pressEase);
      for (const l of legs) {
        if (!l) continue;
        l.press += ((down[l.idx] ? 1 : 0) - l.press) * k;
        drive(l.hip, TUNE.hipRest + (TUNE.hipPress - TUNE.hipRest) * l.press);
        drive(l.knee, TUNE.kneeRest + (TUNE.kneePress - TUNE.kneeRest) * l.press);
      }
      if (gen.spine) {
        s.spinePress += ((space ? 1 : 0) - s.spinePress) * k;
        drive(spine, TUNE.spineRest + (TUNE.spinePress - TUNE.spineRest) * s.spinePress);
      } else drive(spine, 0);

      for (let b = world.getBodyList(); b; b = b.getNext()) {   // Wind
        if (!b.isDynamic()) continue;
        const a = windAccel(b.getPosition().x, s.time);
        if (a) b.applyForceToCenter(new pl.Vec2(a * b.getMass(), 0), true);
      }
      world.step(DT, 8, 3);
      s.steps++; s.time += DT;

      const tilted = Math.abs(rear.getAngle()) > TUNE.tiltLimit || Math.abs(front.getAngle()) > TUNE.tiltLimit;
      s.tilt = tilted ? s.tilt + DT : Math.max(0, s.tilt - DT);

      const x = front.getPosition().x;
      if (x > s.bestX + 0.05) { s.bestX = x; s.lastProgressT = s.time; }
      if (s.steps % 2 === 0) {
        const a = rear.getPosition(), b = front.getPosition();
        s.ghost.push([+a.x.toFixed(2), +a.y.toFixed(2), +rear.getAngle().toFixed(2),
                      +b.x.toFixed(2), +b.y.toFixed(2), +front.getAngle().toFixed(2)]);
      }

      if (front.getPosition().y < TUNE.pitY || rear.getPosition().y < TUNE.pitY) end('In die Grube gefallen');
      else if (x >= TUNE.finishX) end('Ziel erreicht!', true);
      else if (s.tilt > TUNE.tiltEndTime) end('Umgekippt');
      else if (s.time - s.lastProgressT > TUNE.stallTime) end('Festgefahren');
    };

    s.forceEnd = reason => end(reason);
    s.distance = () => Math.max(0, s.bestX - s.startX);
    s.legCount = () => legs.filter(Boolean).length;
    return s;
  }

  root.QWOP2 = { createSim, KEYS, LABELS, FINGERS, DT, TUNE, GAP, EDGES, OBSTACLES, ZONES, WIND, windAccel,
                 defaultGenome, sanitizeGenome, rollOffers, applyMutation, describe };
})(typeof window !== 'undefined' ? window : globalThis);
