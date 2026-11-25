/* Noggin broadcast engine. Draws three kinds of shot on a canvas:
   field  - Long Shot: night stadium, wooden slingshot, camera rises and pulls back as the total grows
   hero   - home page: the same stadium on a slow crane with practice shots
   studio - Daily Trivia: a lit studio set with the category's object on a turntable
   window.Cast(canvas) returns a controller. No dependencies. */
(function () {
  'use strict';
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FOG = [18, 26, 30];
  const TAU = Math.PI * 2;
  const seeded = (s) => () => (s = (s * 16807) % 2147483647) / 2147483647;
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const rgba = (h, a) => { const c = hex(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));
  const out3 = (t) => 1 - (1 - t) ** 3;

  /* ---------- shared stadium data ---------- */
  const R0 = seeded(7);
  const CROWD = [];
  const CCOL = ['#7a3a32', '#c9c2b0', '#3b5a85', '#8a7a4a', '#5a5a5a', '#a65a3a', '#2f4a3a', '#d6cfbd'];
  for (let i = 0; i < 2600; i++) { const side = i % 2 ? 1 : -1, u = R0(), z = -60 + R0() * 820; CROWD.push([side * (35 + 27 * u), 0.6 + 22 * u, z, CCOL[Math.floor(R0() * CCOL.length)]]); }
  const SKY = []; for (let i = 0; i < 46; i++) { const x = -520 + i * 23 + R0() * 10, h = 18 + R0() * 70 * (i % 9 === 4 ? 2.2 : 1), w = 12 + R0() * 16; SKY.push([x, h, w]); }
  const TOWERS = []; for (const z of [-40, 110, 260, 410, 560, 710]) for (const s of [-1, 1]) TOWERS.push([s * 50, z]);
  const STARS = []; for (let i = 0; i < 60; i++) STARS.push([R0(), R0(), 0.12 + R0() * 0.35]);
  let NOISE = null;
  function noise() {
    if (NOISE) return NOISE;
    NOISE = document.createElement('canvas'); NOISE.width = NOISE.height = 128;
    const g = NOISE.getContext('2d'), d = g.createImageData(128, 128);
    for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    g.putImageData(d, 0, 0); return NOISE;
  }

  /* ---------- 3D helpers for round objects ---------- */
  function rot3(p, ph, tilt) {
    let [x, y, z] = p; const c = Math.cos(ph), s = Math.sin(ph);
    [x, z] = [x * c + z * s, -x * s + z * c];
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    [y, z] = [y * ct - z * st, y * st + z * ct];
    return [x, y, z];
  }
  function curve3(g, r, pts, ph, tilt, col, w) {
    g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); let pen = false;
    for (const p of pts) { const q = rot3(p, ph, tilt); if (q[2] > 0.02) { if (!pen) { g.moveTo(q[0] * r, q[1] * r); pen = true; } else g.lineTo(q[0] * r, q[1] * r); } else pen = false; }
    g.stroke();
  }
  function sphere(g, r, c0, c1, c2) {
    const gr = g.createRadialGradient(-r * 0.38, -r * 0.42, r * 0.04, 0, 0, r * 1.02);
    gr.addColorStop(0, c0); gr.addColorStop(0.55, c1); gr.addColorStop(1, c2);
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  }
  function shade(g, r, a = 0.45) { // terminator shading on the lower right
    const gr = g.createRadialGradient(-r * 0.5, -r * 0.55, r * 0.2, 0, 0, r * 1.05);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.7, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${a})`);
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  }
  function spec(g, x, y, rx, ry, a) { const gr = g.createRadialGradient(x, y, 0, x, y, rx); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.save(); g.translate(x, y); g.scale(1, ry / rx); g.translate(-x, -y); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rx, 0, TAU); g.fill(); g.restore(); }
  // baseball seam: x = a cos t + b cos 3t, y = a sin t - b sin 3t, z = 2 sqrt(ab) sin 2t lies on the unit sphere
  const SEAM = (() => { const a = 0.62, b = 0.38, c = 2 * Math.sqrt(a * b), o = []; for (let i = 0; i <= 160; i++) { const t = (i / 160) * TAU; o.push([a * Math.cos(t) + b * Math.cos(3 * t), c * Math.sin(2 * t), a * Math.sin(t) - b * Math.sin(3 * t)]); } return o; })();
  const circ3 = (axis, off) => { const o = [], k = Math.sqrt(Math.max(0, 1 - off * off)); for (let i = 0; i <= 96; i++) { const t = (i / 96) * TAU, u = Math.cos(t) * k, v = Math.sin(t) * k; o.push(axis === 'x' ? [off, u, v] : axis === 'y' ? [u, off, v] : [u, v, off]); } return o; };
  const BB = [circ3('x', 0), circ3('y', 0), circ3('x', 0.72), circ3('x', -0.72)];
  const LAND = [
    [[-168, 66], [-150, 71], [-120, 70], [-95, 73], [-80, 64], [-62, 58], [-55, 50], [-66, 44], [-75, 38], [-80, 32], [-81, 25], [-90, 29], [-97, 27], [-97, 21], [-88, 15], [-83, 9], [-78, 8], [-92, 15], [-105, 20], [-112, 30], [-118, 33], [-124, 40], [-124, 48], [-135, 57], [-152, 59], [-165, 62]],
    [[-80, 9], [-72, 12], [-62, 10], [-50, 0], [-35, -6], [-40, -22], [-48, -28], [-58, -38], [-65, -46], [-68, -55], [-74, -50], [-72, -35], [-71, -20], [-76, -14], [-81, -5], [-80, 2]],
    [[-17, 21], [-10, 30], [0, 36], [10, 37], [20, 32], [32, 31], [35, 27], [43, 12], [51, 12], [41, -2], [40, -15], [35, -25], [28, -33], [19, -35], [15, -28], [12, -17], [13, -5], [9, 4], [-5, 5], [-15, 11]],
    [[-9, 37], [-9, 43], [-2, 47], [-4, 48], [2, 51], [8, 54], [8, 57], [5, 62], [15, 69], [28, 71], [40, 67], [60, 70], [80, 73], [100, 77], [120, 73], [140, 72], [160, 70], [178, 66], [170, 60], [160, 55], [142, 50], [135, 43], [128, 36], [122, 31], [120, 23], [109, 21], [103, 10], [100, 3], [98, 10], [92, 22], [80, 15], [77, 8], [72, 20], [66, 25], [57, 25], [52, 28], [48, 30], [58, 22], [52, 16], [44, 12], [38, 20], [34, 28], [35, 36], [28, 37], [26, 40], [22, 37], [20, 40], [13, 45], [18, 40], [12, 38], [9, 44], [3, 43], [-1, 37]],
    [[114, -22], [122, -18], [130, -12], [137, -12], [142, -11], [146, -19], [153, -26], [151, -34], [145, -39], [138, -35], [131, -31], [124, -34], [115, -34], [113, -26]],
    [[-55, 60], [-45, 60], [-20, 70], [-20, 80], [-40, 83], [-60, 80], [-70, 77], [-58, 70]],
    [[-6, 50], [2, 51], [0, 54], [-3, 58], [-6, 57], [-5, 54]],
  ].map((poly) => poly.map(([lo, la]) => { const a = (lo * Math.PI) / 180, b = (la * Math.PI) / 180; return [Math.cos(b) * Math.sin(a), -Math.sin(b), Math.cos(b) * Math.cos(a)]; }));

  /* ---------- objects (drawn centred at 0,0 with radius r; ph = spin phase) ---------- */
  const OBJ = {
    football(g, r, ph) {
      g.save(); g.rotate(-0.38 + Math.sin(ph * 0.7) * 0.06);
      const L = r * 1.5, H = r * 0.92;
      const shape = () => { g.beginPath(); g.moveTo(-L, 0); g.bezierCurveTo(-L * 0.62, -H * 1.34, L * 0.62, -H * 1.34, L, 0); g.bezierCurveTo(L * 0.62, H * 1.34, -L * 0.62, H * 1.34, -L, 0); };
      shape(); const gr = g.createRadialGradient(-L * 0.28, -H * 0.5, r * 0.08, 0, 0, L * 1.05);
      gr.addColorStop(0, '#b4703f'); gr.addColorStop(0.45, '#7e4220'); gr.addColorStop(1, '#341707'); g.fillStyle = gr; g.fill();
      g.save(); shape(); g.clip();
      if (r > 18) { const rr = seeded(11); g.fillStyle = 'rgba(0,0,0,.16)'; for (let i = 0; i < r * 9; i++) { const x = (rr() * 2 - 1) * L, y = (rr() * 2 - 1) * H; g.fillRect(x, y, r * 0.025, r * 0.025); } }
      const hy = (x) => H * 0.98 * Math.sqrt(Math.max(0, 1 - (x / L) ** 2));
      g.strokeStyle = 'rgba(236,228,208,.88)'; g.lineWidth = r * 0.085;
      for (const s of [-1, 1]) { const x = s * L * 0.64; g.beginPath(); g.moveTo(x, -hy(x)); g.quadraticCurveTo(x + s * r * 0.08, 0, x, hy(x)); g.stroke(); const x2 = s * L * 0.53; g.lineWidth = r * 0.05; g.beginPath(); g.moveTo(x2, -hy(x2)); g.quadraticCurveTo(x2 + s * r * 0.07, 0, x2, hy(x2)); g.stroke(); g.lineWidth = r * 0.085; }
      g.strokeStyle = 'rgba(30,14,4,.55)'; g.lineWidth = r * 0.03; g.beginPath(); g.moveTo(-L * 0.42, -H * 0.4); g.quadraticCurveTo(0, -H * 0.56, L * 0.42, -H * 0.4); g.stroke();
      g.strokeStyle = '#ece4d2'; g.lineWidth = r * 0.07; g.beginPath(); g.moveTo(-L * 0.34, -H * 0.44); g.quadraticCurveTo(0, -H * 0.58, L * 0.34, -H * 0.44); g.stroke();
      g.lineWidth = r * 0.055; for (let i = -3; i <= 3; i++) { const x = i * L * 0.085, y = -H * 0.51 + Math.abs(i) * H * 0.012; g.beginPath(); g.moveTo(x, y - r * 0.12); g.lineTo(x, y + r * 0.12); g.stroke(); }
      g.restore();
      spec(g, -L * 0.3, -H * 0.52, L * 0.32, H * 0.16, 0.22);
      g.restore();
    },
    baseball(g, r, ph) {
      sphere(g, r, '#fdfaf2', '#e2dacb', '#8d857a');
      g.save(); g.beginPath(); g.arc(0, 0, r, 0, TAU); g.clip();
      curve3(g, r * 0.985, SEAM, ph, 0.35, '#a8392b', Math.max(0.7, r * 0.05));
      if (r > 14) { g.strokeStyle = '#b8473a'; g.lineWidth = Math.max(0.5, r * 0.025); g.beginPath();
        for (let i = 0; i < SEAM.length - 1; i += 2) { const a = rot3(SEAM[i], ph, 0.35), b = rot3(SEAM[i + 1], ph, 0.35); if (a[2] < 0.05) continue; const dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy) || 1, nx = -dy / m, ny = dx / m, k = r * 0.07 * a[2]; g.moveTo((a[0] + nx * 0.06) * r - nx * k, (a[1] + ny * 0.06) * r - ny * k); g.lineTo((a[0] - nx * 0.06) * r + nx * k, (a[1] - ny * 0.06) * r + ny * k); }
        g.stroke(); }
      g.restore(); shade(g, r, 0.35); spec(g, -r * 0.35, -r * 0.4, r * 0.4, r * 0.3, 0.5);
    },
    basketball(g, r, ph) {
      sphere(g, r, '#e98b4a', '#c35d22', '#5b2408');
      g.save(); g.beginPath(); g.arc(0, 0, r, 0, TAU); g.clip();
      if (r > 18) { const rr = seeded(5); g.fillStyle = 'rgba(60,20,0,.22)'; for (let i = 0; i < r * 14; i++) { const a = rr() * TAU, d = Math.sqrt(rr()) * r; g.fillRect(Math.cos(a) * d, Math.sin(a) * d, r * 0.022, r * 0.022); } }
      for (const c of BB) curve3(g, r, c, ph, 0.42, '#1b0d05', Math.max(0.7, r * 0.04));
      g.restore(); shade(g, r, 0.4); spec(g, -r * 0.35, -r * 0.42, r * 0.36, r * 0.26, 0.3);
    },
    puck(g, r) {
      const h = r * 0.5, ry = r * 0.42;
      g.fillStyle = '#060606'; g.beginPath(); g.ellipse(0, h / 2, r, ry, 0, 0, TAU); g.fill();
      const side = g.createLinearGradient(-r, 0, r, 0); side.addColorStop(0, '#0c0c0c'); side.addColorStop(0.35, '#2e2e2e'); side.addColorStop(0.6, '#161616'); side.addColorStop(1, '#050505');
      g.fillStyle = side; g.fillRect(-r, -h / 2, r * 2, h);
      if (r > 14) { g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = Math.max(0.5, r * 0.02); for (let i = -12; i <= 12; i++) { const x = (i / 12.5) * r; g.beginPath(); g.moveTo(x, -h * 0.3); g.lineTo(x, h * 0.3); g.stroke(); } }
      const top = g.createRadialGradient(-r * 0.3, -h / 2 - ry * 0.4, r * 0.05, 0, -h / 2, r); top.addColorStop(0, '#3a3a3a'); top.addColorStop(1, '#111');
      g.fillStyle = top; g.beginPath(); g.ellipse(0, -h / 2, r, ry, 0, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(201,169,74,.55)'; g.lineWidth = Math.max(0.6, r * 0.04); g.beginPath(); g.ellipse(0, -h / 2, r * 0.55, ry * 0.55, 0, 0, TAU); g.stroke();
    },
    golf(g, r) {
      sphere(g, r, '#ffffff', '#e7e7e1', '#8f8f88');
      if (r > 5) { g.fillStyle = 'rgba(0,0,0,.09)'; for (let ring = 1; ring < 6; ring++) { const n = ring * 7, d = (ring / 6) * r * 0.95; for (let i = 0; i < n; i++) { const a = (i / n) * TAU + ring; g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, r * (0.09 - ring * 0.008), 0, TAU); g.fill(); } } }
      shade(g, r, 0.3); spec(g, -r * 0.35, -r * 0.4, r * 0.35, r * 0.28, 0.6);
    },
    can(g, r) {
      const w = r * 0.62, h = r * 1.05;
      const body = g.createLinearGradient(-w, 0, w, 0); body.addColorStop(0, '#5b6067'); body.addColorStop(0.32, '#eef0f3'); body.addColorStop(0.5, '#aeb3ba'); body.addColorStop(1, '#4b4f55');
      g.fillStyle = body; g.beginPath(); g.roundRect(-w, -h, w * 2, h * 2, r * 0.12); g.fill();
      const lab = g.createLinearGradient(-w, 0, w, 0); lab.addColorStop(0, '#4a1214'); lab.addColorStop(0.32, '#9e2a2e'); lab.addColorStop(1, '#3a0d10');
      g.fillStyle = lab; g.fillRect(-w, -h * 0.55, w * 2, h * 1.15);
      g.fillStyle = 'rgba(236,228,208,.9)'; g.fillRect(-w, -h * 0.08, w * 2, h * 0.12);
      if (r > 14) { g.fillStyle = '#c9a94a'; g.font = `600 ${r * 0.32}px Oswald, sans-serif`; g.textAlign = 'center'; g.fillText('LAGER', 0, h * 0.4); }
      g.fillStyle = '#c9ced5'; g.beginPath(); g.ellipse(0, -h, w * 0.98, r * 0.14, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(-w * 0.45, -h * 0.9, w * 0.18, h * 1.8);
    },
    apple(g, r) {
      g.save(); g.beginPath(); g.moveTo(0, -r * 0.7); g.bezierCurveTo(r * 0.6, -r * 1.15, r * 1.25, -r * 0.4, r * 0.95, r * 0.35); g.bezierCurveTo(r * 0.75, r * 1.0, r * 0.25, r * 1.05, 0, r * 0.85); g.bezierCurveTo(-r * 0.25, r * 1.05, -r * 0.75, r * 1.0, -r * 0.95, r * 0.35); g.bezierCurveTo(-r * 1.25, -r * 0.4, -r * 0.6, -r * 1.15, 0, -r * 0.7);
      const gr = g.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.05, 0, 0, r * 1.15); gr.addColorStop(0, '#d5503f'); gr.addColorStop(0.55, '#8f1d1a'); gr.addColorStop(1, '#3d0708'); g.fillStyle = gr; g.fill(); g.restore();
      g.strokeStyle = '#3b2716'; g.lineWidth = r * 0.09; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, -r * 0.66); g.quadraticCurveTo(r * 0.04, -r * 0.95, r * 0.16, -r * 1.12); g.stroke();
      g.fillStyle = '#4d6b33'; g.beginPath(); g.ellipse(r * 0.38, -r * 0.98, r * 0.28, r * 0.12, -0.5, 0, TAU); g.fill();
      spec(g, -r * 0.42, -r * 0.28, r * 0.3, r * 0.2, 0.32);
    },
    globe(g, r, ph) {
      const oc = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, 0, 0, r); oc.addColorStop(0, '#3d79a8'); oc.addColorStop(0.6, '#1d4a73'); oc.addColorStop(1, '#0a1f35');
      g.fillStyle = oc; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
      g.save(); g.beginPath(); g.arc(0, 0, r * 0.995, 0, TAU); g.clip();
      for (const poly of LAND) {
        g.beginPath(); let any = false;
        poly.forEach((p, i) => { const q = rot3(p, ph, 0.3); let x = q[0], y = q[1]; if (q[2] < 0) { const m = Math.hypot(x, y) || 1; x /= m; y /= m; } else any = true; i ? g.lineTo(x * r, y * r) : g.moveTo(x * r, y * r); });
        if (!any) continue; g.closePath(); const lg = g.createLinearGradient(0, -r, 0, r); lg.addColorStop(0, '#8a8f5c'); lg.addColorStop(0.5, '#6b7a43'); lg.addColorStop(1, '#8b7a4e'); g.fillStyle = lg; g.fill();
      }
      if (r > 20) { g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 0.8; for (let k = -2; k <= 2; k++) curve3(g, r, circ3('y', k * 0.32), ph, 0.3, 'rgba(255,255,255,.07)', 0.8); for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI, o = []; for (let i = 0; i <= 60; i++) { const t = (i / 60) * TAU; o.push([Math.cos(t) * Math.cos(a), Math.sin(t), Math.cos(t) * Math.sin(a)]); } curve3(g, r, o, ph, 0.3, 'rgba(255,255,255,.07)', 0.8); } }
      g.restore(); shade(g, r, 0.55);
      const at = g.createRadialGradient(0, 0, r * 0.92, 0, 0, r * 1.12); at.addColorStop(0, 'rgba(140,190,230,.25)'); at.addColorStop(1, 'rgba(140,190,230,0)'); g.fillStyle = at; g.beginPath(); g.arc(0, 0, r * 1.12, 0, TAU); g.fill();
      spec(g, -r * 0.38, -r * 0.42, r * 0.3, r * 0.22, 0.25);
    },
    coin(g, r, ph) {
      const sx = Math.cos(ph), thick = r * 0.14, a = Math.abs(sx);
      g.save();
      if (a < 0.98) { const ex = Math.sign(sx || 1) * thick * Math.sqrt(1 - a * a); g.fillStyle = '#6e5420'; g.beginPath(); g.ellipse(ex, 0, r * a, r, 0, 0, TAU); g.fill(); g.fillRect(Math.min(0, ex), -r, Math.abs(ex), r * 2); }
      g.scale(Math.max(0.02, a), 1);
      const f = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, 0, 0, r); f.addColorStop(0, '#f6dc94'); f.addColorStop(0.55, '#c49a45'); f.addColorStop(1, '#6e5420');
      g.fillStyle = f; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(70,50,15,.55)'; g.lineWidth = r * 0.05; g.beginPath(); g.arc(0, 0, r * 0.86, 0, TAU); g.stroke();
      if (r > 16) { g.fillStyle = 'rgba(70,50,15,.45)'; for (let i = 0; i < 40; i++) { const t = (i / 40) * TAU; g.beginPath(); g.arc(Math.cos(t) * r * 0.93, Math.sin(t) * r * 0.93, r * 0.02, 0, TAU); g.fill(); }
        g.strokeStyle = 'rgba(70,50,15,.5)'; g.lineWidth = r * 0.04; for (const s of [-1, 1]) { g.beginPath(); g.arc(0, r * 0.05, r * 0.62, Math.PI / 2 + s * 0.35, Math.PI / 2 + s * 1.9, s < 0); g.stroke(); for (let i = 0; i < 7; i++) { const t = Math.PI / 2 + s * (0.5 + i * 0.2); g.beginPath(); g.ellipse(Math.cos(t) * r * 0.62, r * 0.05 + Math.sin(t) * r * 0.62, r * 0.09, r * 0.035, t + Math.PI / 2 + s * 0.6, 0, TAU); g.fillStyle = 'rgba(70,50,15,.38)'; g.fill(); } }
        g.fillStyle = 'rgba(60,42,12,.7)'; g.font = `600 ${r * 0.36}px Oswald, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('1776', 0, r * 0.02); g.font = `500 ${r * 0.13}px Oswald, sans-serif`; g.fillText('LIBERTY', 0, -r * 0.34); g.fillText('★  ★  ★', 0, r * 0.34); }
      spec(g, -r * 0.35, -r * 0.4, r * 0.45, r * 0.3, 0.35);
      g.restore();
    },
    vinyl(g, r, ph, ac = '#c9a94a') {
      g.save(); g.scale(1, 0.62);
      g.fillStyle = 'rgba(0,0,0,.6)'; g.beginPath(); g.arc(0, r * 0.08, r, 0, TAU); g.fill();
      const d = g.createRadialGradient(0, 0, r * 0.2, 0, 0, r); d.addColorStop(0, '#1a1a1a'); d.addColorStop(1, '#070707'); g.fillStyle = d; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
      if (r > 14) { for (let i = 0; i < 26; i++) { g.strokeStyle = `rgba(255,255,255,${i % 3 ? 0.03 : 0.06})`; g.lineWidth = 0.8; g.beginPath(); g.arc(0, 0, r * (0.4 + i * 0.022), 0, TAU); g.stroke(); } }
      if (g.createConicGradient) { const s = g.createConicGradient(-0.6, 0, 0); s.addColorStop(0, 'rgba(255,255,255,0)'); s.addColorStop(0.06, 'rgba(255,255,255,.16)'); s.addColorStop(0.12, 'rgba(255,255,255,0)'); s.addColorStop(0.5, 'rgba(255,255,255,0)'); s.addColorStop(0.56, 'rgba(255,255,255,.12)'); s.addColorStop(0.62, 'rgba(255,255,255,0)'); s.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = s; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.arc(0, 0, r * 0.37, 0, TAU, true); g.fill(); }
      g.rotate(ph * 2);
      const l = g.createRadialGradient(0, 0, 0, 0, 0, r * 0.36); l.addColorStop(0, ac); l.addColorStop(1, rgba(ac, 0.75)); g.fillStyle = l; g.beginPath(); g.arc(0, 0, r * 0.36, 0, TAU); g.fill();
      if (r > 20) { g.fillStyle = 'rgba(20,16,8,.75)'; g.font = `600 ${r * 0.08}px Oswald, sans-serif`; g.textAlign = 'center'; g.fillText('NOGGIN RECORDS', 0, -r * 0.17); g.fillText('SIDE A · 33⅓', 0, r * 0.22); }
      g.fillStyle = '#0b0b0b'; g.beginPath(); g.arc(0, 0, r * 0.035, 0, TAU); g.fill();
      g.restore();
    },
    reel(g, r, ph) {
      g.save(); g.rotate(ph);
      g.fillStyle = '#1b1b1d'; g.beginPath(); g.arc(0, 0, r * 0.82, 0, TAU); g.fill();
      if (r > 14) { g.strokeStyle = 'rgba(255,255,255,.05)'; for (let i = 0; i < 10; i++) { g.beginPath(); g.arc(0, 0, r * (0.32 + i * 0.05), 0, TAU); g.stroke(); } }
      const m = g.createLinearGradient(-r, -r, r, r); m.addColorStop(0, '#d9dde2'); m.addColorStop(0.45, '#8b9096'); m.addColorStop(1, '#3d4146');
      g.fillStyle = m; g.beginPath(); g.arc(0, 0, r, 0, TAU);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; g.moveTo(Math.cos(a) * r * 0.55 + r * 0.22, Math.sin(a) * r * 0.55); g.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.22, 0, TAU, true); }
      g.moveTo(r * 0.1, 0); g.arc(0, 0, r * 0.1, 0, TAU, true); g.fill('evenodd');
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = r * 0.03; g.beginPath(); g.arc(0, 0, r * 0.97, 0, TAU); g.stroke();
      g.restore(); spec(g, -r * 0.4, -r * 0.45, r * 0.5, r * 0.3, 0.25);
    },
    tv(g, r, ph) {
      const w = r * 1.55, h = r * 1.1;
      g.strokeStyle = '#8d8a84'; g.lineWidth = r * 0.025; g.beginPath(); g.moveTo(-r * 0.1, -h); g.lineTo(-r * 0.75, -h - r * 0.85); g.moveTo(r * 0.1, -h); g.lineTo(r * 0.6, -h - r * 0.95); g.stroke();
      g.fillStyle = '#2a2724'; g.beginPath(); g.ellipse(0, -h, r * 0.2, r * 0.08, 0, 0, TAU); g.fill();
      const cab = g.createLinearGradient(0, -h, 0, h); cab.addColorStop(0, '#6b4528'); cab.addColorStop(1, '#2e1c0f'); g.fillStyle = cab; g.beginPath(); g.roundRect(-w, -h, w * 2, h * 2, r * 0.14); g.fill();
      if (r > 20) { g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1; for (let i = 0; i < 14; i++) { g.beginPath(); g.moveTo(-w, -h + (i + 0.5) * (h * 2 / 14)); g.bezierCurveTo(-w * 0.3, -h + (i + 0.2) * (h * 2 / 14), w * 0.3, -h + (i + 0.9) * (h * 2 / 14), w, -h + (i + 0.4) * (h * 2 / 14)); g.stroke(); } }
      const sw = w * 1.32, sh = h * 1.5, sx = -w + r * 0.16, sy = -sh / 2;
      g.fillStyle = '#0c0c0c'; g.beginPath(); g.roundRect(sx - r * 0.05, sy - r * 0.05, sw + r * 0.1, sh + r * 0.1, r * 0.22); g.fill();
      g.save(); g.beginPath(); g.roundRect(sx, sy, sw, sh, r * 0.2); g.clip();
      const bars = ['#bdbdb5', '#bdb45a', '#5fb0b0', '#5fa860', '#a8559f', '#a8463e', '#3f4fa0'];
      bars.forEach((c, i) => { g.fillStyle = c; g.fillRect(sx + (i * sw) / 7, sy, sw / 7 + 1, sh * 0.72); });
      g.fillStyle = '#1c1c22'; g.fillRect(sx, sy + sh * 0.72, sw, sh * 0.28);
      g.fillStyle = 'rgba(0,0,0,.22)'; for (let y = sy; y < sy + sh; y += 2) g.fillRect(sx, y, sw, 1);
      const roll = (ph * 30) % sh; g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(sx, sy + roll, sw, sh * 0.12);
      const vg = g.createRadialGradient(sx + sw / 2, 0, sh * 0.2, sx + sw / 2, 0, sw * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.65)'); g.fillStyle = vg; g.fillRect(sx, sy, sw, sh);
      g.restore();
      for (let i = 0; i < 2; i++) { const kx = w - r * 0.3, ky = -h * 0.45 + i * h * 0.6; const k = g.createRadialGradient(kx - r * 0.04, ky - r * 0.04, 0, kx, ky, r * 0.13); k.addColorStop(0, '#d8d2c4'); k.addColorStop(1, '#5c574e'); g.fillStyle = k; g.beginPath(); g.arc(kx, ky, r * 0.12, 0, TAU); g.fill(); }
      g.fillStyle = 'rgba(0,0,0,.35)'; for (let i = 0; i < 5; i++) g.fillRect(w - r * 0.42, h * 0.35 + i * r * 0.07, r * 0.24, r * 0.025);
      g.fillStyle = '#1e140b'; g.fillRect(-w * 0.85, h, r * 0.12, r * 0.18); g.fillRect(w * 0.85 - r * 0.12, h, r * 0.12, r * 0.18);
    },
    pint(g, r, ph) {
      const tw = r * 0.72, bw = r * 0.55, h = r * 1.25, top = -h, bot = h;
      const glass = () => { g.beginPath(); g.moveTo(-tw, top); g.lineTo(tw, top); g.lineTo(bw, bot); g.quadraticCurveTo(0, bot + r * 0.08, -bw, bot); g.closePath(); };
      g.save(); glass(); g.clip();
      const beer = g.createLinearGradient(-tw, 0, tw, 0); beer.addColorStop(0, '#7a3d0c'); beer.addColorStop(0.35, '#d98d2b'); beer.addColorStop(0.55, '#b86a18'); beer.addColorStop(1, '#5b2a06');
      const fl = top + r * 0.42; g.fillStyle = beer; g.fillRect(-tw, fl, tw * 2, h * 2);
      const rr = seeded(3); g.fillStyle = 'rgba(255,240,200,.55)'; for (let i = 0; i < 40; i++) { const x = (rr() * 2 - 1) * bw * 0.9, sp = 0.3 + rr(), y = bot - (((ph * 40 * sp + rr() * h * 2) % (h * 2 - r * 0.5))); if (y > fl + r * 0.15) { g.beginPath(); g.arc(x, y, Math.max(0.5, r * 0.012 * (1 + rr())), 0, TAU); g.fill(); } }
      const foam = g.createLinearGradient(0, top - r * 0.1, 0, fl + r * 0.08); foam.addColorStop(0, '#fffaf0'); foam.addColorStop(1, '#e8d8b8'); g.fillStyle = foam; g.fillRect(-tw, top - r * 0.2, tw * 2, fl - top + r * 0.28);
      g.restore();
      g.fillStyle = '#fffaf0'; g.beginPath(); g.ellipse(0, top, tw, r * 0.1, 0, 0, TAU); g.fill();
      for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(-tw * 0.7 + i * tw * 0.35, top - r * 0.04, r * 0.12, Math.PI, 0); g.fill(); }
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = Math.max(1, r * 0.03); glass(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.moveTo(-tw * 0.72, top + r * 0.3); g.lineTo(-tw * 0.55, top + r * 0.3); g.lineTo(-bw * 0.45, bot - r * 0.2); g.lineTo(-bw * 0.62, bot - r * 0.2); g.fill();
      if (r > 20) { const rd = seeded(9); g.fillStyle = 'rgba(255,255,255,.16)'; for (let i = 0; i < 60; i++) { const y = top + r * 0.5 + rd() * (h * 2 - r * 0.7), k = (y - top) / (2 * h), xe = tw + (bw - tw) * k; g.beginPath(); g.arc((rd() * 2 - 1) * xe * 0.95, y, r * 0.012 + rd() * r * 0.015, 0, TAU); g.fill(); } }
    },
    atom(g, r, ph, ac = '#7fbf9a') {
      const orb = [0, 1.05, 2.1];
      const ring = (k, front) => { g.save(); g.rotate(orb[k]); g.strokeStyle = rgba(ac, front ? 0.55 : 0.22); g.lineWidth = Math.max(0.8, r * 0.02); g.beginPath(); g.ellipse(0, 0, r, r * 0.34, 0, front ? 0 : Math.PI, front ? Math.PI : TAU); g.stroke();
        const t = ph * (1.4 + k * 0.3) + k * 2; if ((Math.sin(t) > 0) === front) { const x = Math.cos(t) * r, y = Math.sin(t) * r * 0.34, gl = g.createRadialGradient(x, y, 0, x, y, r * 0.12); gl.addColorStop(0, '#ffffff'); gl.addColorStop(0.3, ac); gl.addColorStop(1, rgba(ac, 0)); g.fillStyle = gl; g.beginPath(); g.arc(x, y, r * 0.12, 0, TAU); g.fill(); }
        g.restore(); };
      for (let k = 0; k < 3; k++) ring(k, false);
      const nuc = [[0, 0, '#b9483a'], [0.11, -0.06, '#8d8d92'], [-0.1, -0.05, '#b9483a'], [0.04, 0.11, '#8d8d92'], [-0.06, 0.1, '#b9483a'], [0.12, 0.07, '#b9483a'], [-0.13, 0.04, '#8d8d92'], [0, -0.13, '#8d8d92']];
      for (const [x, y, c] of nuc) { g.save(); g.translate(x * r, y * r); sphere(g, r * 0.1, '#ffffff', c, '#1a1a1a'); g.restore(); }
      for (let k = 0; k < 3; k++) ring(k, true);
    },
    trophy(g, r) {
      const gold = (x0, x1) => { const l = g.createLinearGradient(x0, 0, x1, 0); l.addColorStop(0, '#6e5420'); l.addColorStop(0.3, '#f6dc94'); l.addColorStop(0.55, '#c49a45'); l.addColorStop(1, '#5a4418'); return l; };
      g.strokeStyle = gold(-r, r); g.lineWidth = r * 0.1; g.beginPath(); g.arc(-r * 0.62, -r * 0.5, r * 0.3, Math.PI * 0.5, Math.PI * 1.5); g.stroke(); g.beginPath(); g.arc(r * 0.62, -r * 0.5, r * 0.3, -Math.PI * 0.5, Math.PI * 0.5); g.stroke();
      g.fillStyle = gold(-r * 0.7, r * 0.7); g.beginPath(); g.moveTo(-r * 0.7, -r * 0.95); g.lineTo(r * 0.7, -r * 0.95); g.bezierCurveTo(r * 0.7, -r * 0.1, r * 0.3, r * 0.15, r * 0.1, r * 0.25); g.lineTo(-r * 0.1, r * 0.25); g.bezierCurveTo(-r * 0.3, r * 0.15, -r * 0.7, -r * 0.1, -r * 0.7, -r * 0.95); g.fill();
      g.fillStyle = '#4a3812'; g.beginPath(); g.ellipse(0, -r * 0.95, r * 0.7, r * 0.1, 0, 0, TAU); g.fill();
      g.fillStyle = gold(-r * 0.12, r * 0.12); g.fillRect(-r * 0.1, r * 0.22, r * 0.2, r * 0.4);
      g.fillStyle = gold(-r * 0.35, r * 0.35); g.beginPath(); g.ellipse(0, r * 0.64, r * 0.32, r * 0.08, 0, 0, TAU); g.fill();
      const base = g.createLinearGradient(-r * 0.5, 0, r * 0.5, 0); base.addColorStop(0, '#0a0a0a'); base.addColorStop(0.4, '#2c2c2c'); base.addColorStop(1, '#080808'); g.fillStyle = base; g.fillRect(-r * 0.5, r * 0.68, r, r * 0.38);
      g.fillStyle = '#c9a94a'; g.fillRect(-r * 0.3, r * 0.8, r * 0.6, r * 0.12);
      g.fillStyle = 'rgba(255,255,255,.28)'; g.beginPath(); g.ellipse(-r * 0.35, -r * 0.55, r * 0.08, r * 0.28, 0.15, 0, TAU); g.fill();
    },
  };
  const STUDIO = {
    football: { o: 'football', w: 'FOOTBALL', ac: '#c9a94a', spin: 0.6 },
    baseball: { o: 'baseball', w: 'BASEBALL', ac: '#b5533c', spin: 0.9 },
    basketball: { o: 'basketball', w: 'BASKETBALL', ac: '#d2783a', spin: 0.8 },
    hockey: { o: 'puck', w: 'HOCKEY', ac: '#7fa7c9', spin: 0 },
    geography: { o: 'globe', w: 'GEOGRAPHY', ac: '#5f9e8f', spin: 0.35 },
    movies: { o: 'reel', w: 'MOVIES', ac: '#c9a94a', spin: 0.5 },
    tv: { o: 'tv', w: 'TELEVISION', ac: '#8a9bc9', spin: 1 },
    food: { o: 'pint', w: 'FOOD & DRINK', ac: '#c98a4a', spin: 1 },
    history: { o: 'coin', w: 'HISTORY', ac: '#b89a6a', spin: 1.1 },
    science: { o: 'atom', w: 'SCIENCE', ac: '#7fbf9a', spin: 1 },
    music: { o: 'vinyl', w: 'MUSIC', ac: '#b07ab8', spin: 1.2 },
    home: { o: 'trophy', w: 'FINAL', ac: '#c9a94a', spin: 0 },
  };
  const SHOT_OBJ = { football: 'football', baseball: 'baseball', basketball: 'basketball', hockey: 'puck', geography: 'globe', food: 'can', history: 'coin', science: 'apple', music: 'vinyl', movies: 'reel', tv: 'reel', golf: 'golf' };

  /* ---------- controller ---------- */
  window.Cast = function (canvas) {
    const ctx = canvas.getContext('2d');
    let W = 360, H = 240, F = 330, DPR = Math.min(2, window.devicePixelRatio || 1), alive = true, last = performance.now(), drawn = 0;
    const api = { mode: 'studio', onTotal: null };
    function size() { const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return; if (w === W && h === H && canvas.width === Math.round(w * DPR)) return; W = w; H = h; canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); F = Math.max(W, H * 1.2) * 0.92; }
    if (window.ResizeObserver) new ResizeObserver(size).observe(canvas);

    /* ===== field ===== */
    const cam = { x: 0, y: 2.2, z: -6, th: 0.12 };
    const fd = { score: 0, shown: 0, origin: 0, flags: [], dust: [], flashes: [], trail: [], ball: null, pouch: { y: 1.75, z: -0.35 }, q: Promise.resolve(), hero: false, crane: 0, rnd: seeded(19), heroT: 0, nextShot: 0 };
    const restBall = (type) => ({ x: 0, y: 1.75, z: fd.origin - 0.35, type: type || 'football', rot: 0, inPouch: true, flying: false, vis: true });
    fd.ball = restBall();
    const toCam = (p) => { const dx = p[0] - cam.x, dy = p[1] - cam.y, dz = p[2] - cam.z, s = Math.sin(cam.th), c = Math.cos(cam.th); return [dx, dy * c + dz * s, -dy * s + dz * c]; };
    const pj = (q) => [W / 2 + (F * q[0]) / q[2], H / 2 - (F * q[1]) / q[2], F / q[2]];
    const P = (p) => { const q = toCam(p); return q[2] > 0.3 ? pj(q) : null; };
    function clip(c) { const o = [], n = 0.3; for (let i = 0; i < c.length; i++) { const A = c[i], B = c[(i + 1) % c.length], a = A[2] >= n, b = B[2] >= n; if (a) o.push(A); if (a !== b) { const t = (n - A[2]) / (B[2] - A[2]); o.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, n]); } } return o; }
    function fogc(h, d, a = 1) { const c = hex(h), f = Math.min(0.82, Math.max(0, (d - 20) / 520)); return `rgba(${c.map((v, i) => Math.round(v + (FOG[i] - v) * f)).join(',')},${a})`; }
    function poly(pts, col, a = 1) { const c = clip(pts.map(toCam)); if (c.length < 3) return; const d = c.reduce((s, p) => s + p[2], 0) / c.length; ctx.beginPath(); c.forEach((p, i) => { const q = pj(p); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.fillStyle = fogc(col, d, a); ctx.fill(); }
    function line3(a, b, w, col) { const A = P(a), B = P(b); if (!A || !B) return; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineWidth = Math.max(0.6, (w * (A[2] + B[2])) / 2); ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.stroke(); }
    function drawSky() {
      const hz = H / 2 - F * Math.tan(cam.th), g = ctx.createLinearGradient(0, hz - H, 0, hz + 4);
      g.addColorStop(0, '#05080d'); g.addColorStop(0.75, '#101a24'); g.addColorStop(1, '#2a2a2c'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      for (const [x, y, a] of STARS) { const py = y * (hz - 30); if (py > 0) { ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fillRect(x * W, py, 1, 1); } }
      for (const [x, h, w] of SKY) { const a = P([x, 0, 1700]), b = P([x + w, h, 1700]); if (!a || !b) continue; ctx.fillStyle = '#0d1419'; ctx.fillRect(a[0], b[1], b[0] - a[0], a[1] - b[1]); const cw = b[0] - a[0]; if (cw > 3) { ctx.fillStyle = 'rgba(230,196,120,.35)'; const st = Math.max(2, cw / 4); for (let r = b[1] + 2; r < a[1] - 2; r += st) for (let c = a[0] + 1; c < b[0] - 1; c += st) if (((r * 7 + c * 13) | 0) % 5 < 2) ctx.fillRect(c, r, 1, 1); } }
    }
    function drawStands() {
      for (const s of [-1, 1]) for (let z = -60; z < 760; z += 40) { poly([[s * 34, 0, z], [s * 34, 0, z + 40], [s * 62, 24, z + 40], [s * 62, 24, z]], s < 0 ? '#1b2220' : '#171d1b'); poly([[s * 62, 24, z], [s * 62, 24, z + 40], [s * 62, 30, z + 40], [s * 62, 30, z]], '#0f1413'); poly([[s * 34, 0, z], [s * 34, 0, z + 40], [s * 34, 1.2, z + 40], [s * 34, 1.2, z]], '#2a2f2c'); }
      poly([[-62, 0, 740], [62, 0, 740], [62, 26, 770], [-62, 26, 770]], '#161c1a');
      for (const [x, y, z, c] of CROWD) { const q = toCam([x, y, z]); if (q[2] < 1) continue; const p = pj(q), s = Math.max(0.7, Math.min(4, p[2] * 0.35)); ctx.fillStyle = fogc(c, q[2], 0.9); ctx.fillRect(p[0] - s / 2, p[1] - s, s, s); }
      for (const s of [-1, 1]) for (let z = -60; z < 760; z += 6) { const p = P([s * 62, 30.5, z]); if (p) { ctx.fillStyle = 'rgba(255,236,190,.55)'; ctx.fillRect(p[0], p[1], 1.2, 1.2); } }
      // end-zone video board
      const a = P([-24, 16, 772]), b = P([24, 34, 772]); if (a && b && b[0] - a[0] > 8) { ctx.fillStyle = '#0a0d0c'; ctx.fillRect(a[0] - 2, b[1] - 2, b[0] - a[0] + 4, a[1] - b[1] + 4); ctx.fillStyle = '#121a17'; ctx.fillRect(a[0], b[1], b[0] - a[0], a[1] - b[1]); const fs = (a[1] - b[1]) * 0.42; if (fs > 5) { ctx.font = `600 ${fs}px Oswald, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(201,169,74,.85)'; ctx.fillText(fd.hero ? 'NOGGIN' : String(Math.round(fd.shown)), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); ctx.textBaseline = 'alphabetic'; } }
    }
    function drawTowers() {
      for (const [x, z] of TOWERS) { const b = P([x, 0, z]), t = P([x, 44, z]); if (!b || !t) continue; ctx.strokeStyle = fogc('#3a4044', F / b[2]); ctx.lineWidth = Math.max(1, 0.6 * t[2]); ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(t[0], t[1]); ctx.stroke();
        const r = Math.max(6, 20 * t[2]), g = ctx.createRadialGradient(t[0], t[1], 0, t[0], t[1], r); g.addColorStop(0, 'rgba(255,244,214,.55)'); g.addColorStop(1, 'rgba(255,244,214,0)'); ctx.fillStyle = g; ctx.fillRect(t[0] - r, t[1] - r, 2 * r, 2 * r);
        const hw = Math.max(2, 3 * t[2]), hh = Math.max(1, 1.6 * t[2]); ctx.fillStyle = 'rgba(255,248,228,.95)'; ctx.fillRect(t[0] - hw, t[1] - hh, hw * 2, hh * 2); }
    }
    function drawField() {
      const z0 = Math.max(-80, Math.floor((cam.z - 20) / 5) * 5), z1 = 760;
      for (const s of [-1, 1]) poly([[s * 26.7, 0, -120], [s * 26.7, 0, 780], [s * 34, 0, 780], [s * 34, 0, -120]], '#1e3323');
      for (let z = z0; z < z1; z += 5) { if (z >= 700) { poly([[-26.7, 0, z], [26.7, 0, z], [26.7, 0, z + 5], [-26.7, 0, z + 5]], '#35283d'); continue; } poly([[-26.7, 0, z], [26.7, 0, z], [26.7, 0, z + 5], [-26.7, 0, z + 5]], (z / 5) % 2 ? '#2b4a30' : '#2f5134'); }
      for (const s of [-1, 1]) poly([[s * 26.6, 0, -120], [s * 26.6, 0, 720], [s * 26.9, 0, 720], [s * 26.9, 0, -120]], '#d9d4c6', 0.8);
      for (let z = Math.max(0, z0); z <= 700; z += 5) { const w = z % 100 === 0 ? 0.45 : z % 10 === 0 ? 0.22 : 0.12; poly([[-26.7, 0, z - w / 2], [26.7, 0, z - w / 2], [26.7, 0, z + w / 2], [-26.7, 0, z + w / 2]], '#e8e3d6', z % 10 ? 0.4 : 0.75); }
      for (let z = Math.max(0, Math.floor(cam.z)); z < Math.min(700, cam.z + 140); z++) for (const s of [-1, 1]) poly([[s * 3.1 - 0.05, 0, z - 0.3], [s * 3.1 + 0.05, 0, z - 0.3], [s * 3.1 + 0.05, 0, z + 0.3], [s * 3.1 - 0.05, 0, z + 0.3]], '#e8e3d6', 0.6);
      for (let z = 10; z <= 700; z += 10) for (const s of [-1, 1]) { const q = toCam([s * 19, 0, z]); if (q[2] < 2 || q[2] > 420) continue; const p = pj(q), q2 = toCam([s * 19, 0, z + 1.5]), p2 = q2[2] > 0.3 ? pj(q2) : p, sc = p[2] * 2.1, sq = Math.max(0.15, Math.abs(p[1] - p2[1]) / Math.max(1, sc * 0.7)); if (sc < 4) continue; ctx.save(); ctx.translate(p[0], p[1]); ctx.scale(1, sq); ctx.font = `600 ${sc}px Oswald, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = fogc('#e8e3d6', q[2], 0.55); ctx.fillText(String(z), 0, 0); ctx.restore(); }
      const mid = toCam([0, 0, 350]); if (mid[2] > 2) { const p = pj(mid), sc = p[2] * 4; if (sc > 6) { ctx.save(); ctx.translate(p[0], p[1]); ctx.scale(1, 0.3); ctx.font = `600 ${sc}px Oswald, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = fogc('#e8e3d6', mid[2], 0.18); ctx.fillText('NOGGIN', 0, 0); ctx.restore(); } }
      const p7 = toCam([0, 0, 705]); if (p7[2] > 2) { const p = pj(p7), sc = p[2] * 5; if (sc > 5) { ctx.save(); ctx.translate(p[0], p[1]); ctx.scale(1, 0.35); ctx.font = `600 ${sc}px Oswald, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = fogc('#c9a94a', p7[2], 0.55); ctx.fillText('700', 0, 0); ctx.restore(); } }
      const gp = '#b89a48'; line3([0, 0, 712], [0, 3.4, 712], 0.35, gp); line3([-3.1, 3.4, 712], [3.1, 3.4, 712], 0.3, gp); line3([-3.1, 3.4, 712], [-3.1, 11, 712], 0.25, gp); line3([3.1, 3.4, 712], [3.1, 11, 712], 0.25, gp);
    }
    function drawFlags() {
      for (const f of fd.flags) { line3([f.x, 0, f.z], [f.x, 2.6, f.z], 0.07, '#d9d4c6'); const a = P([f.x, 2.6, f.z]), b = P([f.x + 1.4, 2.2, f.z]), c = P([f.x, 1.8, f.z]); if (a && b && c) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.fillStyle = fogc(f.c, F / a[2], 0.95); ctx.fill(); if (a[2] > 12) { ctx.font = `600 ${Math.min(16, a[2] * 0.45)}px Oswald, sans-serif`; ctx.fillStyle = '#f2ede2'; ctx.textAlign = 'center'; ctx.fillText(f.n, a[0], a[1] - 4); } } }
    }
    function drawSling() {
      const o = fd.origin, pc = fd.pouch, W2 = (a, b) => { line3(a, b, 0.2, '#4a321e'); line3([a[0] - 0.04, a[1], a[2] - 0.02], [b[0] - 0.04, b[1], b[2] - 0.02], 0.09, '#8d6640'); };
      line3([-0.8, 0.05, o], [0.8, 0.05, o], 0.18, '#3d2a19'); line3([0, 0.05, o - 0.6], [0, 0.05, o + 0.6], 0.18, '#3d2a19');
      const tl = [-0.62, 2.15, o], tr = [0.62, 2.15, o], pp = [0, pc.y, o + pc.z]; line3(tl, pp, 0.05, '#2a1d14');
      W2([0, 0, o], [0, 1.25, o]); W2([0, 1.25, o], [-0.62, 2.15, o]); W2([0, 1.25, o], [0.62, 2.15, o]);
      for (let i = 0; i < 4; i++) line3([-0.1, 0.55 + i * 0.12, o - 0.11], [0.1, 0.6 + i * 0.12, o - 0.11], 0.04, '#1d140d');
      if (fd.ball.vis && fd.ball.inPouch) drawBall();
      const P2 = P(pp); if (P2) { ctx.fillStyle = '#3a2616'; ctx.beginPath(); ctx.ellipse(P2[0], P2[1] + P2[2] * 0.15, P2[2] * 0.36, P2[2] * 0.2, 0, 0, TAU); ctx.fill(); }
      line3(tr, pp, 0.05, '#3a281b');
    }
    function drawBall() {
      const b = fd.ball, q = toCam([b.x, b.y, b.z]); if (q[2] < 0.5) return; const p = pj(q), r = Math.max(1.6, 0.55 * p[2]);
      const sh = P([b.x, 0, b.z]); if (sh && !b.inPouch) { ctx.fillStyle = `rgba(0,0,0,${Math.max(0.08, 0.35 - b.y * 0.01)})`; ctx.beginPath(); ctx.ellipse(sh[0], sh[1], r * 1.2, r * 0.35, 0, 0, TAU); ctx.fill(); }
      for (let i = 0; i < fd.trail.length - 1; i++) { const a = P(fd.trail[i]), c = P(fd.trail[i + 1]); if (a && c) { ctx.strokeStyle = `rgba(242,237,226,${0.03 + i * 0.012})`; ctx.lineWidth = Math.max(0.5, r * 0.35); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.stroke(); } }
      ctx.save(); ctx.translate(p[0], p[1]); if (b.type !== 'vinyl' && b.type !== 'puck' && b.type !== 'can') ctx.rotate(b.rot * 0.3); (OBJ[b.type] || OBJ.football)(ctx, r, b.rot); ctx.restore();
    }
    function drawFx(dt) {
      for (const d of fd.dust) { d.t += dt; d.x += d.vx * dt; d.z += d.vz * dt; d.y = Math.max(0, d.y + d.vy * dt); d.vy -= 9 * dt; const p = P([d.x, d.y, d.z]); if (p && d.t < 1.2) { const r = Math.max(0.5, d.s * p[2]); ctx.fillStyle = `rgba(${d.c},${(1 - d.t / 1.2) * 0.55})`; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, TAU); ctx.fill(); } }
      fd.dust = fd.dust.filter((d) => d.t < 1.2);
      for (const f of fd.flashes) { f.t--; if (f.t > 0) { const p = P(f.p); if (p) { ctx.fillStyle = `rgba(255,255,255,${f.t / 6})`; ctx.fillRect(p[0] - 1, p[1] - 1, 2.2, 2.2); } } }
      fd.flashes = fd.flashes.filter((f) => f.t > 0);
    }
    function camTarget() {
      const b = fd.ball, s = fd.hero ? 150 : fd.shown, k = fd.crane;
      const h = 2.2 + s * 0.1 + k * 60, back = 6 + s * 0.34 + k * 40, ahead = 10 + s * 0.24, fz = b.flying ? b.z : fd.origin, ay = b.flying ? b.y * 0.55 : 0;
      return { z: fz - back, y: h + (b.flying ? b.y * 0.25 : 0), th: Math.atan2(h - ay, back + ahead * 0.6 + k * 80) };
    }
    function drawFieldScene(dt) {
      const t = camTarget(), a = 1 - Math.pow(fd.ball.flying ? 0.88 : 0.93, dt * 60);
      cam.z += (t.z - cam.z) * a; cam.y += (t.y - cam.y) * a; cam.th += (t.th - cam.th) * a;
      drawSky(); drawStands(); drawTowers(); drawField(); drawFlags(); drawSling(); if (fd.ball.vis && !fd.ball.inPouch) drawBall(); drawFx(dt);
    }
    const tw = (d, fn) => new Promise((r) => { if (RM || d <= 0) { fn(1); return r(); } const t0 = performance.now(); (function s(n) { const t = Math.min(1, (n - t0) / d); fn(t); t < 1 && alive ? requestAnimationFrame(s) : r(); })(t0); });
    const setShown = (v) => { fd.shown = v; api.onTotal && api.onTotal(Math.round(v)); };
    async function launch(v, c, n, type, onLand) {
      if (Math.abs(fd.origin - fd.score) > 0.1) { const o0 = fd.origin, to = fd.score; await tw(700, (t) => { fd.origin = o0 + (to - o0) * ease(t); fd.ball.z = fd.origin - 0.35; }); }
      fd.ball = restBall(type); fd.pouch = { y: 1.75, z: -0.35 }; fd.trail = [];
      await tw(380, (t) => { fd.pouch = { y: 1.75 - 0.25 * t, z: -0.35 - 1.1 * t }; fd.ball.y = fd.pouch.y; fd.ball.z = fd.origin + fd.pouch.z; });
      const b = fd.ball; b.inPouch = false; b.flying = true; tw(300, (t) => { const s = Math.sin(t * Math.PI * 4) * (1 - t); fd.pouch = { y: 1.75 + s * 0.12, z: -0.35 + s * 0.3 }; });
      const z0 = b.z, z1 = fd.origin + v, x1 = (fd.rnd() - 0.5) * 3, h = v ? 4 + v * 0.38 : 1.2, dur = v ? 1100 + v * 14 : 700, spin = v ? 6 + v * 0.08 : 2, base = fd.score;
      await tw(dur, (t) => { b.z = z0 + (z1 - z0) * t; b.x = x1 * t; b.y = 1.75 + (0.55 - 1.75) * t + h * 4 * t * (1 - t); b.rot = t * spin; if (!fd.hero && base + v * t > fd.shown) setShown(base + v * t); fd.trail.push([b.x, b.y, b.z]); if (fd.trail.length > 14) fd.trail.shift(); });
      b.flying = false; fd.trail = []; fd.score += v; if (!fd.hero) setShown(fd.score);
      for (let i = 0; i < 14; i++) fd.dust.push({ x: b.x, y: 0.1, z: b.z, vx: (fd.rnd() - 0.5) * 4, vy: 2 + fd.rnd() * 3, vz: (fd.rnd() - 0.2) * 4, s: 0.12 + fd.rnd() * 0.15, t: 0, c: i % 3 ? '150,128,96' : '60,90,58' });
      fd.flags.push({ x: b.x, z: z1, c, n });
      const fl = v >= 100 ? 120 : v >= 85 ? 60 : v >= 60 ? 25 : 0; for (let i = 0; i < fl; i++) { const s = fd.rnd() < 0.5 ? -1 : 1, u = fd.rnd(); fd.flashes.push({ p: [s * (35 + 27 * u), 1 + 22 * u, b.z - 40 + fd.rnd() * 120], t: 2 + Math.floor(fd.rnd() * 6) }); }
      onLand && onLand();
      await tw(260, (t) => { b.z = z1 + 1.2 * t; b.y = 0.55 + Math.sin(t * Math.PI) * 0.8; });
    }
    api.field = {
      reset() { fd.hero = false; fd.score = 0; fd.origin = 0; fd.flags = []; fd.dust = []; fd.trail = []; fd.crane = 0; fd.ball = restBall(); fd.pouch = { y: 1.75, z: -0.35 }; fd.q = Promise.resolve(); setShown(0); api.mode = 'field'; },
      prime(type) { if (!fd.ball.flying && fd.ball.inPouch) fd.ball.type = type || fd.ball.type; },
      // queue a launch; resolves after the object lands
      shoot(v, color, n, type, onLand) { const p = fd.q.then(() => launch(v, color, n, type, onLand)); fd.q = p.catch(() => {}); return p; },
      // place a finished round instantly (results screen)
      place(pts, colors, types) { this.reset(); let s = 0; pts.forEach((v, i) => { fd.flags.push({ x: ((i * 7919) % 30) / 10 - 1.5, z: s + v, c: colors[i] || '#5a5a5a', n: i + 1 }); s += v; }); fd.score = s; fd.origin = s; fd.ball = restBall(types && types[types.length - 1]); fd.ball.vis = false; setShown(s); this.finale(true); },
      finale(now) { const o0 = fd.origin, to = fd.score * 0.45; if (now) { fd.origin = to; fd.crane = 0.15; fd.ball.vis = false; return Promise.resolve(); } return fd.q.then(() => tw(1400, (t) => { fd.origin = o0 + (to - o0) * t; fd.crane = 0.15 * t; fd.ball.vis = t < 0.2; })); },
      get total() { return fd.score; },
    };
    api.hero = function () { api.field.reset(); fd.hero = true; api.mode = 'field'; fd.nextShot = performance.now() + 1200; cam.z = -60; cam.y = 18; cam.th = 0.3; };
    function heroTick(now) {
      if (!fd.hero || RM || fd.ball.flying || now < fd.nextShot) return;
      fd.nextShot = Infinity;
      if (fd.score > 560) { fd.score = 0; fd.flags = []; }
      const TC = ['#9aa3b3', '#7aa3d6', '#6fbf8a', '#d9a05b', '#c98ac0'], pick = Math.floor(fd.rnd() * 5), v = [10, 30, 60, 85, 100][pick];
      const types = ['football', 'baseball', 'basketball', 'puck', 'globe', 'can', 'coin', 'vinyl', 'golf', 'apple'];
      api.field.shoot(v, TC[pick], fd.flags.length + 1, types[Math.floor(fd.rnd() * types.length)]).then(() => { fd.nextShot = performance.now() + 2200 + fd.rnd() * 1800; });
    }

    /* ===== studio ===== */
    const st = { cat: 'home', prev: null, t0: 0, ph: 0, fx: null, dust: [] };
    for (let i = 0; i < 40; i++) st.dust.push([Math.random(), Math.random(), Math.random() * 0.6 + 0.2, Math.random() * TAU]);
    api.studio = function (cat) { const c = STUDIO[cat] ? cat : 'home'; if (api.mode !== 'studio') { api.mode = 'studio'; st.cat = c; st.prev = null; return; } if (c === st.cat) return; st.prev = st.cat; st.cat = c; st.t0 = performance.now(); };
    api.react = function (ok) { st.fx = { ok, t0: performance.now() }; };
    function studioScene(cat, now) {
      const c = STUDIO[cat], ac = c.ac, t = now / 1000;
      const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#07090a'); bg.addColorStop(0.62, '#0e1214'); bg.addColorStop(1, '#050606'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      // LED wall
      const cell = Math.max(10, Math.round(W / 34)), gy = H * 0.66, ac3 = hex(ac);
      for (let y = 0; y < gy; y += cell) for (let x = 0; x < W; x += cell) { const n = Math.sin(x * 0.07 + t * 0.9) * Math.cos(y * 0.09 - t * 0.6), d = Math.hypot(x - W / 2, y - gy * 0.55) / W, a = Math.max(0, 0.05 + n * 0.035 - d * 0.06); ctx.fillStyle = `rgba(${ac3[0]},${ac3[1]},${ac3[2]},${a})`; ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2); }
      // big word
      ctx.save(); const fs = Math.min(H * 0.42, (W * 1.5) / Math.max(4, c.w.length)); ctx.font = `600 ${fs}px Oswald, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; const wx = W / 2 + Math.sin(t * 0.15) * W * 0.03;
      ctx.fillStyle = 'rgba(255,255,255,.035)'; ctx.fillText(c.w, wx, gy * 0.48); ctx.strokeStyle = rgba(ac, 0.16); ctx.lineWidth = 1; ctx.strokeText(c.w, wx, gy * 0.48); ctx.restore();
      // floor
      const fl = ctx.createLinearGradient(0, gy, 0, H); fl.addColorStop(0, '#17191a'); fl.addColorStop(1, '#060707'); ctx.fillStyle = fl; ctx.fillRect(0, gy, W, H - gy);
      ctx.strokeStyle = rgba(ac, 0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, gy + 0.5); ctx.lineTo(W, gy + 0.5); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.04)'; for (let i = -10; i <= 10; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + i * W * 0.04, gy); ctx.lineTo(W / 2 + i * W * 0.22, H); ctx.stroke(); }
      // spotlight cone
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; const cx = W / 2, cg = ctx.createLinearGradient(0, 0, 0, gy + H * 0.1); cg.addColorStop(0, 'rgba(255,244,220,.0)'); cg.addColorStop(0.2, 'rgba(255,244,220,.07)'); cg.addColorStop(1, 'rgba(255,244,220,.02)');
      ctx.fillStyle = cg; ctx.beginPath(); ctx.moveTo(cx - W * 0.03, 0); ctx.lineTo(cx + W * 0.03, 0); ctx.lineTo(cx + W * 0.2, gy + H * 0.08); ctx.lineTo(cx - W * 0.2, gy + H * 0.08); ctx.fill();
      for (const d of st.dust) { const y = ((d[1] + t * 0.02 * d[2]) % 1) * gy, spread = 0.03 + (y / gy) * 0.17, x = cx + Math.sin(d[3] + t * 0.3) * W * spread * (d[0] * 2 - 1); ctx.fillStyle = `rgba(255,240,210,${0.12 * d[2]})`; ctx.fillRect(x, y, 1.3, 1.3); }
      const pool = ctx.createRadialGradient(cx, gy + H * 0.06, 0, cx, gy + H * 0.06, W * 0.24); pool.addColorStop(0, 'rgba(255,240,215,.16)'); pool.addColorStop(1, 'rgba(255,240,215,0)'); ctx.save(); ctx.translate(cx, gy + H * 0.06); ctx.scale(1, 0.22); ctx.translate(-cx, -(gy + H * 0.06)); ctx.fillStyle = pool; ctx.beginPath(); ctx.arc(cx, gy + H * 0.06, W * 0.24, 0, TAU); ctx.fill(); ctx.restore();
      ctx.restore();
      // pedestal
      const pr = Math.min(W * 0.15, H * 0.26), py = gy + H * 0.06; ctx.fillStyle = '#0b0c0d'; ctx.beginPath(); ctx.ellipse(cx, py + pr * 0.12, pr * 1.05, pr * 0.2, 0, 0, TAU); ctx.fill(); const pg = ctx.createLinearGradient(cx - pr, 0, cx + pr, 0); pg.addColorStop(0, '#101213'); pg.addColorStop(0.4, '#2a2d2f'); pg.addColorStop(1, '#0b0c0d'); ctx.fillStyle = pg; ctx.fillRect(cx - pr * 1.05, py - pr * 0.02, pr * 2.1, pr * 0.14); ctx.fillStyle = '#1d2022'; ctx.beginPath(); ctx.ellipse(cx, py - pr * 0.02, pr * 1.05, pr * 0.2, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = rgba(ac, 0.45); ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(cx, py - pr * 0.02, pr * 1.0, pr * 0.18, 0, 0, TAU); ctx.stroke();
      // object
      const fx = st.fx, fa = fx ? Math.max(0, 1 - (now - fx.t0) / 600) : 0, shake = fx && !fx.ok ? Math.sin((now - fx.t0) / 25) * 6 * fa : 0, hop = fx && fx.ok ? Math.sin(Math.min(1, (now - fx.t0) / 450) * Math.PI) * pr * 0.25 : 0;
      const r = Math.min(W * 0.13, H * 0.2), oy = py - r * ({ tv: 1.34, pint: 1.32, trophy: 1.1, vinyl: 0.74, puck: 0.78, coin: 1.08, reel: 1.06, football: 1.2 }[c.o] || 1.1) + Math.sin(t * 1.3) * r * 0.04 - hop;
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.ellipse(cx, py - pr * 0.02, r * 0.85, r * 0.13, 0, 0, TAU); ctx.fill();
      ctx.save(); ctx.translate(cx + shake, oy); OBJ[c.o](ctx, r, t * c.spin + (fx && fx.ok ? (1 - fa) * 3 : 0), ac); ctx.restore();
      // rim light
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; const rim = ctx.createRadialGradient(cx, oy - r * 1.2, 0, cx, oy - r * 1.2, r * 1.8); rim.addColorStop(0, 'rgba(255,240,215,.08)'); rim.addColorStop(1, 'rgba(255,240,215,0)'); ctx.fillStyle = rim; ctx.fillRect(cx - r * 2, oy - r * 3, r * 4, r * 4); ctx.restore();
      if (fx && fa > 0) { if (fx.ok) { ctx.fillStyle = `rgba(255,248,230,${fa * 0.22})`; ctx.fillRect(0, 0, W, H); const rr = seeded(Math.floor(fx.t0)); for (let i = 0; i < 26; i++) { const x = rr() * W, y = rr() * gy; if (rr() < fa) { ctx.fillStyle = `rgba(255,255,255,${0.5 + rr() * 0.5})`; ctx.fillRect(x, y, 2, 2); } } } else { ctx.fillStyle = `rgba(140,30,30,${fa * 0.25})`; ctx.fillRect(0, 0, W, H); } }
    }
    function drawStudio(now) {
      const d = st.prev ? Math.min(1, (now - st.t0) / 700) : 1;
      if (d >= 1 || RM) { st.prev = null; studioScene(st.cat, now); return; }
      const x = out3(d) * (W + 40) - 20;
      studioScene(st.prev, now);
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, Math.max(0, x), H); ctx.clip(); studioScene(st.cat, now); ctx.restore();
      ctx.fillStyle = '#c9a94a'; ctx.fillRect(x - 3, 0, 6, H); const gl = ctx.createLinearGradient(x - 40, 0, x, 0); gl.addColorStop(0, 'rgba(201,169,74,0)'); gl.addColorStop(1, 'rgba(201,169,74,.35)'); ctx.fillStyle = gl; ctx.fillRect(x - 40, 0, 40, H);
    }

    /* ===== frame ===== */
    function post() {
      const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)'); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.06; ctx.drawImage(noise(), -Math.random() * 128, -Math.random() * 128, W + 256, H + 256); ctx.globalAlpha = 1;
    }
    function frame(now) {
      if (!alive) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!canvas.isConnected) { alive = false; return; }
      if (canvas.offsetParent === null || document.hidden) { setTimeout(() => requestAnimationFrame(frame), 400); return; }
      if (api.fps && now - drawn < 1000 / api.fps) { requestAnimationFrame(frame); return; }
      drawn = now; size();
      if (api.mode === 'field') { heroTick(now); drawFieldScene(api.fps ? Math.min(0.05, 1 / api.fps) : dt); } else drawStudio(now);
      post();
      requestAnimationFrame(frame);
    }
    api.destroy = () => { alive = false; };
    api.shotType = (scene, override) => (override && OBJ[override] ? override : SHOT_OBJ[scene] || 'football');
    size(); requestAnimationFrame(frame);
    return api;
  };
  window.Cast.OBJ = OBJ;
  window.Cast.STUDIO = STUDIO;
})();
