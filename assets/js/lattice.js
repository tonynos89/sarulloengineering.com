/* ==========================================================================
   Animazione dell'hero: "dagli atomi agli algoritmi".
   1. Un reticolo cristallino esagonale (fogli di grafite) ruota nello spazio.
   2. Gli atomi si staccano e formano una rete neurale a strati, con segnali.
   3. I nodi convergono e disegnano il logo (bullone e stella AS), come un
      tratto di penna; poi il logo vero compare nitido al loro posto.
   Canvas 2D con proiezione prospettica scritta a mano, nessuna libreria.
   Si ferma quando non è visibile e rispetta "riduci movimento".
   ========================================================================== */
(function () {
  "use strict";

  var canvas = document.querySelector("[data-lattice]");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var hero = canvas.parentNode;

  // Colori del marchio: navy, argento, ardesia, bianco; ottone solo per le scintille
  var ICE = "214,222,232", BRASS = "226,179,92";
  var SILVER = "195,202,211", SLATE = "86,102,148", WHITE = "242,244,247";

  // Geometria del logo: gli stessi numeri dei file SVG (viewBox del marchio),
  // portati in unità della scena con centro nel centro del bullone.
  var LC = [967, 1058], LU = 1110;
  function star(p) { return [(967 + 0.9 * (p[0] - 967) - LC[0]) / LU, (1013 + 0.9 * (p[1] - 1013) - LC[1]) / LU]; }
  function hexPts(rc) {
    var out = [];
    for (var i = 0; i < 6; i++) out.push([Math.sin(i * Math.PI / 3) * rc / LU, -Math.cos(i * Math.PI / 3) * rc / LU]);
    return out;
  }
  var LOGO = {
    rest: [[783.3, 760.2], [189, 760.2], [1447.8, 1674.8], [1264.2, 1109.6]].map(star),
    legs: [[669.8, 1109.6], [967, 195], [1264.2, 1109.6]].map(star),
    bar: [[783.3, 760.2], [1150.7, 760.2]].map(star),
    s: [[1430.3, 988.9], [1745, 760.2], [1150.7, 760.2], [848.1, 1109.6], [1264.2, 1109.6], [486.2, 1674.8], [669.8, 1109.6]].map(star)
  };
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Tempi delle fasi, in secondi
  var MORPH1 = 2.8, MORPH1_SPREAD = 0.9, MORPH1_DUR = 1.7;
  var MORPH2 = 8.0, MORPH2_SPREAD = 1.8, MORPH2_DUR = 1.3;
  var END = MORPH2 + MORPH2_SPREAD + MORPH2_DUR;

  var W = 0, H = 0, dpr = 1, cx = 0, cy = 0, S = 1, narrow = null;
  var atoms = [], bonds = [], edges = [], loops = [], pulses = [];
  var clock = 0, last = 0, running = false, visible = true, spawn = 0;
  var tiltX = 0, tiltY = 0, aimX = 0, aimY = 0;

  // Generatore pseudo-casuale con seme fisso: la scena è sempre la stessa
  var seed = 11;
  function rand() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ease(v) { v = clamp01(v); return v < .5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; }

  // Sprite luminosi pre-disegnati: disegnarli costa molto meno di un gradiente per frame
  function sprite(rgb) {
    var c = document.createElement("canvas"); c.width = c.height = 64;
    var g = c.getContext("2d").createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(245,252,253,1)");
    g.addColorStop(.12, "rgba(" + rgb + ",.9)");
    g.addColorStop(.35, "rgba(" + rgb + ",.22)");
    g.addColorStop(1, "rgba(" + rgb + ",0)");
    var x = c.getContext("2d"); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return c;
  }
  var GLOW = sprite(ICE), SPARK = sprite(BRASS);

  /* ---------- Costruzione delle tre forme ---------- */
  function build() {
    seed = 11;
    atoms = []; bonds = []; edges = []; loops = []; pulses = [];
    var sheets = narrow ? 2 : 3, perSheet = narrow ? 30 : 50;
    var N = sheets * perSheet;

    // 1. Reticolo: fogli esagonali (tipo grafite) impilati, con sfalsamento AB
    var R = 0.9, a = R * Math.sqrt(Math.PI / (perSheet * 1.299));
    var lat = [];
    for (var s = 0; s < sheets; s++) {
      var pts = [], shift = s % 2 ? a : 0;
      for (var i = -12; i <= 12; i++) for (var j = -12; j <= 12; j++) for (var b = 0; b < 2; b++) {
        var x = Math.sqrt(3) * a * (i + j / 2), y = 1.5 * a * j + (b ? a : 0) + shift - a / 2;
        pts.push({ x: x, y: y, d: x * x + y * y });
      }
      pts.sort(function (p, q) { return p.d - q.d; });
      var z = (s - (sheets - 1) / 2) * 0.5;
      for (var k = 0; k < perSheet; k++) lat.push({ x: pts[k].x, y: pts[k].y, z: z, sheet: s });
    }

    // 2. Rete neurale: strati lungo x, nodi disposti a disco (fillotassi)
    var shape = narrow ? [.16, .3, .32, .22] : [.12, .22, .26, .24, .16];
    var net = [], layers = [], used = 0;
    shape.forEach(function (w, l) {
      var m = l === shape.length - 1 ? N - used : Math.round(N * w), col = [];
      used += m;
      var xL = -1 + 2 * l / (shape.length - 1), r = 0.45 + 0.4 * Math.sin(Math.PI * (l + .5) / shape.length);
      for (var n = 0; n < m; n++) {
        var rr = r * Math.sqrt((n + .5) / m), th = n * 2.39996;
        var node = { x: xL * 1.05, y: rr * Math.cos(th), z: rr * Math.sin(th) * 0.55, layer: l };
        col.push(node); net.push(node);
      }
      layers.push(col);
    });

    // Gli atomi da sinistra a destra vanno negli strati da sinistra a destra
    var order = lat.map(function (p, i) { return i; }).sort(function (i, j) { return lat[i].x - lat[j].x; });
    for (var q = 0; q < N; q++) {
      atoms.push({ lat: lat[order[q]], net: net[q], logo: null, glow: 0, x: 0, y: 0, z: 0, sx: 0, sy: 0, f: 1, m: 0, l: 0 });
      net[q].atom = q;
    }

    // Legami del reticolo: primi vicini nello stesso foglio
    for (var u = 0; u < N; u++) for (var v = u + 1; v < N; v++) {
      var A = atoms[u].lat, B = atoms[v].lat;
      if (A.sheet !== B.sheet) continue;
      var dx = A.x - B.x, dy = A.y - B.y;
      if (dx * dx + dy * dy < a * a * 1.15) bonds.push([u, v]);
    }

    // Connessioni della rete: ogni nodo verso 2-3 nodi dello strato successivo
    for (var L = 0; L < layers.length - 1; L++) {
      layers[L].forEach(function (nA) {
        var next = layers[L + 1].slice().sort(function (p, q2) {
          return (Math.pow(p.y - nA.y, 2) + Math.pow(p.z - nA.z, 2)) - (Math.pow(q2.y - nA.y, 2) + Math.pow(q2.z - nA.z, 2));
        });
        nA.out = [];
        var c = rand() < .55 ? 2 : 1;
        for (var e = 0; e < c; e++) {
          var target = e === 0 ? next[0] : next[1 + Math.floor(rand() * Math.min(5, next.length - 1))];
          var edge = [nA.atom, target.atom];
          edges.push(edge); nA.out.push(edge);
        }
      });
    }
    atoms.forEach(function (at) { at.out = at.net.out || []; });

    // 3. Logo: bullone e tratti della stella, punti distribuiti in proporzione alla lunghezza
    var strokes = [
      { pts: hexPts(1085), closed: true, color: SILVER },
      { pts: LOGO.rest, closed: false, color: SLATE },
      { pts: LOGO.legs, closed: false, color: WHITE },
      { pts: LOGO.bar, closed: false, color: WHITE },
      { pts: LOGO.s, closed: false, color: SILVER }
    ];
    var total = 0, given = 0, k = 0;
    strokes.forEach(function (s) { s.len = polyLen(s.pts, s.closed); total += s.len; });
    strokes.forEach(function (s) { s.n = Math.max(s.pts.length, Math.round(N * s.len / total)); given += s.n; });
    strokes[0].n += N - given;   // l'esagono assorbe gli arrotondamenti
    loops = [];
    strokes.forEach(function (s) {
      var idx = [];
      sample(s.pts, s.n, s.closed).forEach(function (p) {
        atoms[k].logo = { x: p[0], y: p[1], z: 0 }; idx.push(k); k++;
      });
      loops.push({ idx: idx, closed: s.closed, color: s.color });
    });
  }

  function polyLen(pts, closed) {
    var len = 0, m = closed ? pts.length : pts.length - 1;
    for (var i = 0; i < m; i++) { var p = pts[i], q = pts[(i + 1) % pts.length]; len += Math.hypot(q[0] - p[0], q[1] - p[1]); }
    return len;
  }

  // n punti lungo una spezzata (chiusa o aperta): ogni vertice è un punto, così gli angoli restano vivi
  function sample(poly, n, closed) {
    var segs = [], total = 0, out = [], given = 0;
    var m = closed ? poly.length : poly.length - 1, slots = closed ? n : n - 1;
    for (var i = 0; i < m; i++) {
      var p = poly[i], q = poly[(i + 1) % poly.length];
      var len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      segs.push({ a: p, b: q, len: len }); total += len;
    }
    segs.forEach(function (s) { s.exact = slots * s.len / total; s.n = Math.max(1, Math.floor(s.exact)); given += s.n; });
    segs.slice().sort(function (x, y) { return (y.exact - y.n) - (x.exact - x.n); })
      .slice(0, Math.max(0, slots - given)).forEach(function (s) { s.n++; });
    segs.forEach(function (s) {
      for (var k = 0; k < s.n; k++) {
        var t = k / s.n;
        out.push([s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t]);
      }
    });
    if (!closed) out.push(poly[poly.length - 1]);
    while (out.length > n) out.pop();
    while (out.length < n) out.push(out[out.length - 1]);
    return out;
  }

  /* ---------- Geometria ---------- */
  function rotate(p, rx, ry, out) {
    var cy_ = Math.cos(ry), sy = Math.sin(ry), cx_ = Math.cos(rx), sx = Math.sin(rx);
    var x = p.x * cy_ + p.z * sy, z = -p.x * sy + p.z * cy_;
    var y = p.y * cx_ - z * sx; z = p.y * sx + z * cx_;
    out.x = x; out.y = y; out.z = z;
    return out;
  }
  var tA = {}, tB = {}, tC = {};

  function layout() {
    var rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var isNarrow = W < 768;
    if (isNarrow) { cx = W * .5; cy = H * .31; S = Math.min(W * .34, H * .2); }
    else { cx = W * .7; cy = H * .47; S = Math.min(W * .2, H * .33); }
    if (isNarrow !== narrow) { narrow = isNarrow; build(); }
  }

  /* ---------- Un frame ---------- */
  function update(dt) {
    var t = clock, N = atoms.length;
    var latRx = 1.05, latRy = t * 0.35;
    var netRx = 0.22 * Math.sin(t * 0.45), netRy = -0.75 + t * 0.14;
    var breathe = 1 + 0.018 * Math.sin(t * 1.4);
    tiltX += (aimX - tiltX) * Math.min(1, dt * 3);
    tiltY += (aimY - tiltY) * Math.min(1, dt * 3);

    for (var i = 0; i < N; i++) {
      var at = atoms[i];
      at.m = ease((t - MORPH1 - MORPH1_SPREAD * i / N) / MORPH1_DUR);
      at.l = ease((t - MORPH2 - MORPH2_SPREAD * i / N) / MORPH2_DUR);
      rotate(at.lat, latRx, latRy, tA);
      rotate(at.net, netRx, netRy, tB);
      tC.x = at.logo.x * breathe; tC.y = at.logo.y * breathe; tC.z = 0;
      var m = at.m, l = at.l;
      // le traiettorie si incurvano in profondità durante i passaggi
      var arc = Math.sin(Math.PI * m) * 0.35 * (i % 2 ? 1 : -1) + Math.sin(Math.PI * l) * 0.5;
      var x = tA.x + (tB.x - tA.x) * m, y = tA.y + (tB.y - tA.y) * m, z = tA.z + (tB.z - tA.z) * m;
      x += (tC.x - x) * l; y += (tC.y - y) * l; z += (tC.z - z) * l + arc * (1 - l * l);
      at.x = x; at.y = y; at.z = z;
      rotate(at, tiltY * 0.3, tiltX * 0.45, at);
      var f = 3.2 / (3.2 + at.z);
      at.f = f; at.sx = cx + at.x * S * f; at.sy = cy + at.y * S * f;
      at.glow = Math.max(0, at.glow - dt * 1.6);
    }

    // segnali sulla rete, solo quando la rete è formata
    var netOn = t > MORPH1 + MORPH1_SPREAD + MORPH1_DUR * .6 && t < MORPH2;
    spawn -= dt;
    if (netOn && spawn <= 0 && pulses.length < (narrow ? 14 : 28)) {
      var first = Math.floor(rand() * (narrow ? 10 : 18));
      fire(first); atoms[first].glow = 1;
      spawn = 0.18 + rand() * 0.3;
    }
    for (var p = pulses.length - 1; p >= 0; p--) {
      var ps = pulses[p]; ps.t += dt * ps.v;
      if (ps.t >= 1) { var to = atoms[ps.e[1]]; to.glow = 1; if (t < MORPH2 - .4) fire(ps.e[1]); pulses.splice(p, 1); }
    }
  }

  function fire(i) {
    var out = atoms[i].out;
    if (!out.length) return;
    pulses.push({ e: out[Math.floor(rand() * out.length)], t: 0, v: 1.1 + rand() * .7 });
  }

  // Linee raggruppate per opacità: pochi stroke() per frame
  var buckets = [[], [], [], [], [], []];
  function line(a, b, alpha) {
    if (alpha < 0.03) return;
    var q = Math.min(5, Math.floor(alpha * 6));
    buckets[q].push(a.sx, a.sy, b.sx, b.sy);
  }
  function flush(rgb, width, scale) {
    ctx.lineWidth = width;
    for (var q = 0; q < 6; q++) {
      var B = buckets[q];
      if (!B.length) continue;
      ctx.strokeStyle = "rgba(" + rgb + "," + ((q + .5) / 6 * scale).toFixed(3) + ")";
      ctx.beginPath();
      for (var k = 0; k < B.length; k += 4) { ctx.moveTo(B[k], B[k + 1]); ctx.lineTo(B[k + 2], B[k + 3]); }
      ctx.stroke();
      B.length = 0;
    }
  }

  function depth(at) { return clamp01(0.35 + (1 - at.z) * 0.45); }

  /* ---------- Il logo nitido, disegnato con la stessa proiezione degli atomi ---------- */
  var tP = {};
  function P(u, v) {
    var b = 1 + 0.018 * Math.sin(clock * 1.4);
    tP.x = u * b; tP.y = v * b; tP.z = 0;
    rotate(tP, tiltY * 0.3, tiltX * 0.45, tP);
    var f = 3.2 / (3.2 + tP.z);
    return [cx + tP.x * S * f, cy + tP.y * S * f];
  }
  function hexPath(rc, rr) {
    var v = hexPts(rc), t = rr / rc;
    ctx.beginPath();
    for (var i = 0; i < 6; i++) {
      var p0 = v[(i + 5) % 6], p1 = v[i], p2 = v[(i + 1) % 6];
      var a = P(p1[0] + (p0[0] - p1[0]) * t, p1[1] + (p0[1] - p1[1]) * t);
      var c = P(p1[0], p1[1]);
      var b = P(p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t);
      if (i) ctx.lineTo(a[0], a[1]); else ctx.moveTo(a[0], a[1]);
      ctx.quadraticCurveTo(c[0], c[1], b[0], b[1]);
    }
    ctx.closePath();
  }
  function seg(pts, color, width) {
    ctx.beginPath();
    pts.forEach(function (p, i) { var q = P(p[0], p[1]); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  }
  function drawLogo(alpha) {
    var u = S / LU, w = 46 * 0.9 * u, h = 98 * 0.9 * u;
    ctx.save();
    ctx.globalAlpha = alpha;
    // bullone navy con il filo d'argento
    hexPath(1085, 90);
    ctx.fillStyle = "#14213D"; ctx.fill();
    ctx.lineJoin = "round"; ctx.lineWidth = 34 * u; ctx.strokeStyle = "#14213D"; ctx.stroke();
    hexPath(1010, 78);
    ctx.lineWidth = Math.max(1, 16 * u); ctx.strokeStyle = "#C3CAD3"; ctx.stroke();
    // stella: il resto in ardesia, la A bianca, la S d'argento, con gli incroci intrecciati
    ctx.lineJoin = "miter"; ctx.miterLimit = 4; ctx.lineCap = "butt";
    seg(LOGO.rest, "#34426B", w);
    seg(LOGO.legs, "#14213D", h); seg(LOGO.bar, "#14213D", h);
    seg(LOGO.legs, "#FFFFFF", w); seg(LOGO.bar, "#FFFFFF", w);
    seg(LOGO.s, "#14213D", h); seg(LOGO.s, "#C3CAD3", w);
    ctx.restore();
  }

  function draw() {
    var t = clock, fadeIn = clamp01(t / 1.2);
    ctx.clearRect(0, 0, W, H);

    // legami del reticolo
    bonds.forEach(function (bd) {
      var A = atoms[bd[0]], B = atoms[bd[1]];
      line(A, B, (1 - Math.max(A.m, B.m)) * fadeIn * Math.min(depth(A), depth(B)));
    });
    flush(ICE, 1, .55);

    // connessioni della rete
    edges.forEach(function (ed) {
      var A = atoms[ed[0]], B = atoms[ed[1]];
      line(A, B, Math.min(A.m, B.m) * (1 - Math.max(A.l, B.l)) * Math.min(depth(A), depth(B)));
    });
    flush(ICE, 1, .3);

    // tratto del logo: compare dove la penna è già passata, poi lascia il posto al logo nitido
    var crisp = clamp01((t - END + 0.3) / 1.2);
    loops.forEach(function (lp) {
      var I = lp.idx, L = I.length, m = lp.closed ? L : L - 1;
      for (var k = 0; k < m; k++) {
        var A = atoms[I[k]], B = atoms[I[(k + 1) % L]];
        line(A, B, clamp01((Math.min(A.l, B.l) - .88) / .12) * (1 - crisp));
      }
      flush(lp.color, narrow ? 1.6 : 2, 1);
    });
    if (crisp > 0) drawLogo(crisp);

    ctx.globalCompositeOperation = "lighter";

    // atomi / nodi
    var logoDone = t > END;
    atoms.forEach(function (at) {
      var r = (narrow ? 7 : 8) * at.f * (1 + at.glow * .9) * (1 - at.l * .35);
      ctx.globalAlpha = fadeIn * (0.5 + 0.5 * depth(at)) * (1 - 0.9 * crisp);
      ctx.drawImage(GLOW, at.sx - r, at.sy - r, r * 2, r * 2);
    });

    // segnali in viaggio sulla rete
    ctx.globalAlpha = 1;
    pulses.forEach(function (ps) {
      var A = atoms[ps.e[0]], B = atoms[ps.e[1]];
      var x = A.sx + (B.sx - A.sx) * ps.t, y = A.sy + (B.sy - A.sy) * ps.t, r = 7 * A.f;
      ctx.drawImage(SPARK, x - r, y - r, r * 2, r * 2);
    });

    // a logo finito, due scintille percorrono il bullone e la S
    if (logoDone) {
      var k = clamp01((t - END) / 1.5);
      ctx.globalAlpha = k;
      [[0, .06], [4, .1]].forEach(function (cfg, li) {
        var lp = loops[cfg[0]], I = lp.idx, L = I.length, ph = (t - END) * cfg[1] + li * .5, pos;
        if (lp.closed) pos = (ph % 1) * L;
        else { var tri = ph % 2; pos = (tri < 1 ? tri : 2 - tri) * (L - 1) * 0.9999; }
        var i0 = Math.floor(pos), fr = pos - i0;
        var A = atoms[I[i0]], B = atoms[I[lp.closed ? (i0 + 1) % L : Math.min(i0 + 1, L - 1)]];
        var x = A.sx + (B.sx - A.sx) * fr, y = A.sy + (B.sy - A.sy) * fr, r = narrow ? 10 : 12;
        ctx.drawImage(SPARK, x - r, y - r, r * 2, r * 2);
      });
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  function frame(time) {
    if (!running) return;
    var dt = last ? Math.min((time - last) / 1000, 0.05) : 0;
    last = time; clock += dt;
    update(dt); draw();
    requestAnimationFrame(frame);
  }
  function start() {
    if (running || reduceMotion.matches || !visible || document.hidden) return;
    running = true; last = 0;
    requestAnimationFrame(frame);
  }
  function stop() { running = false; }

  // Movimento ridotto: solo il logo, fermo
  function drawStatic() { stop(); clock = END + 3; update(0); draw(); }

  /* ---------- Interazione: mouse su desktop, inclinazione o dito su telefono ---------- */
  hero.addEventListener("pointermove", function (e) {
    if (e.pointerType !== "mouse") return;
    var r = hero.getBoundingClientRect();
    aimX = ((e.clientX - r.left) / r.width - .5) * 2;
    aimY = ((e.clientY - r.top) / r.height - .5) * 2;
  });
  hero.addEventListener("pointerleave", function () { aimX = aimY = 0; });
  hero.addEventListener("touchmove", function (e) {
    var r = hero.getBoundingClientRect(), p = e.touches[0];
    aimX = ((p.clientX - r.left) / r.width - .5) * 2;
    aimY = ((p.clientY - r.top) / r.height - .5) * 2;
  }, { passive: true });
  hero.addEventListener("touchend", function () { aimX = aimY = 0; }, { passive: true });
  // dove non serve un permesso (Android), l'inclinazione del telefono muove la scena
  if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission !== "function") {
    window.addEventListener("deviceorientation", function (e) {
      if (e.gamma == null) return;
      aimX = Math.max(-1, Math.min(1, e.gamma / 30));
      aimY = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
    }, { passive: true });
  }

  /* ---------- Ciclo di vita ---------- */
  function onResize() { layout(); if (!running) { update(0); draw(); } }
  if ("ResizeObserver" in window) new ResizeObserver(onResize).observe(canvas);
  else window.addEventListener("resize", onResize);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      visible ? start() : stop();
    }).observe(canvas);
  }
  document.addEventListener("visibilitychange", function () { document.hidden ? stop() : start(); });
  if (reduceMotion.addEventListener) {
    reduceMotion.addEventListener("change", function () { reduceMotion.matches ? drawStatic() : start(); });
  }

  layout();
  reduceMotion.matches ? drawStatic() : (update(0), draw(), start());
})();
