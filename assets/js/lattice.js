/* ==========================================================================
   Animazione dell'hero: "dagli atomi agli algoritmi".
   1. Un reticolo cristallino esagonale (fogli di grafite) ruota nello spazio.
   2. Gli atomi si staccano e formano una rete neurale a strati, con segnali.
   3. I nodi convergono e disegnano il logo, come un tratto di penna.
   Canvas 2D con proiezione prospettica scritta a mano, nessuna libreria.
   Si ferma quando non è visibile e rispetta "riduci movimento".
   ========================================================================== */
(function () {
  "use strict";

  var canvas = document.querySelector("[data-lattice]");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var hero = canvas.parentNode;

  var ICE = "155,231,238", BRASS = "226,179,92";
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

    // 3. Logo: esagono e stella campionati lungo il tratto, nell'ordine della penna
    var hex = [[50, 4], [89.84, 27], [89.84, 73], [50, 96], [10.16, 73], [10.16, 27]];
    var star = [[50, 16], [71.16, 81.12], [15.76, 40.88], [84.24, 40.88], [28.84, 81.12]];
    var nHex = Math.round(N * 276 / 618);
    var hexPts = sample(hex, nHex), starPts = sample(star, N - nHex);
    loops = [[], []];
    hexPts.concat(starPts).forEach(function (p, i) {
      atoms[i].logo = { x: (p[0] - 50) / 47, y: (p[1] - 50) / 47, z: 0 };
      loops[i < nHex ? 0 : 1].push(i);
    });
  }

  // Punti lungo un poligono chiuso: ogni vertice è un punto, così gli angoli restano vivi
  function sample(poly, n) {
    var segs = [], total = 0, out = [], given = 0;
    for (var i = 0; i < poly.length; i++) {
      var p = poly[i], q = poly[(i + 1) % poly.length];
      var len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      segs.push({ a: p, b: q, len: len }); total += len;
    }
    segs.forEach(function (s) { s.exact = n * s.len / total; s.n = Math.max(1, Math.floor(s.exact)); given += s.n; });
    segs.slice().sort(function (x, y) { return (y.exact - y.n) - (x.exact - x.n); })
      .slice(0, Math.max(0, n - given)).forEach(function (s) { s.n++; });
    segs.forEach(function (s) {
      for (var k = 0; k < s.n; k++) {
        var t = k / s.n;
        out.push([s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t]);
      }
    });
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

    // tratto del logo: compare dove la penna è già passata
    loops.forEach(function (loop) {
      for (var k = 0; k < loop.length; k++) {
        var A = atoms[loop[k]], B = atoms[loop[(k + 1) % loop.length]];
        line(A, B, clamp01((Math.min(A.l, B.l) - .88) / .12));
      }
    });
    flush(ICE, narrow ? 1.6 : 2, 1);

    ctx.globalCompositeOperation = "lighter";

    // atomi / nodi
    var logoDone = t > END;
    atoms.forEach(function (at) {
      var r = (narrow ? 7 : 8) * at.f * (1 + at.glow * .9) * (1 - at.l * .35);
      ctx.globalAlpha = fadeIn * (0.5 + 0.5 * depth(at)) * (logoDone ? .75 : 1);
      ctx.drawImage(GLOW, at.sx - r, at.sy - r, r * 2, r * 2);
    });

    // segnali in viaggio sulla rete
    ctx.globalAlpha = 1;
    pulses.forEach(function (ps) {
      var A = atoms[ps.e[0]], B = atoms[ps.e[1]];
      var x = A.sx + (B.sx - A.sx) * ps.t, y = A.sy + (B.sy - A.sy) * ps.t, r = 7 * A.f;
      ctx.drawImage(SPARK, x - r, y - r, r * 2, r * 2);
    });

    // a logo finito, due scintille percorrono il tratto
    if (logoDone) {
      var k = clamp01((t - END) / 1.5);
      ctx.globalAlpha = k;
      loops.forEach(function (loop, li) {
        var pos = ((t - END) * (li ? .09 : .07) + li * .5) % 1 * loop.length;
        var i0 = Math.floor(pos), fr = pos - i0;
        var A = atoms[loop[i0]], B = atoms[loop[(i0 + 1) % loop.length]];
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
