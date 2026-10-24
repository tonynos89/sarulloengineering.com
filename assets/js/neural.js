/* ==========================================================================
   Rete neurale animata per l'hero.
   Strati di nodi collegati; impulsi di "segnale" viaggiano da sinistra a destra
   e accendono i nodi che raggiungono, come dati che attraversano un impianto.
   Nessuna libreria esterna. Si ferma quando non è visibile e rispetta
   l'impostazione "riduci movimento" del sistema.
   ========================================================================== */
(function () {
  "use strict";

  var canvas = document.querySelector("[data-neural]");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");

  var OIL = [194, 207, 58];      // --oil
  var PAPER = [236, 239, 232];   // --paper
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  var width = 0, height = 0, dpr = 1;
  var layers = [];   // array di array di nodi
  var edges = [];    // { a, b }
  var pulses = [];   // { edge, t, speed }
  var running = false, visible = true, last = 0, spawnClock = 0;

  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }

  // Generatore pseudo-casuale con seme fisso: la rete ha sempre la stessa forma.
  var seed = 7;
  function rand() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }

  function build() {
    seed = 7;
    layers = []; edges = []; pulses = [];
    var narrow = width < 768;
    var shape = narrow ? [4, 6, 6, 3] : [5, 8, 9, 7, 3];
    var left = narrow ? width * 0.08 : width * 0.42;
    var right = width * (narrow ? 0.92 : 0.94);
    var top = height * (narrow ? 0.2 : 0.14);
    var bottom = height * (narrow ? 0.52 : 0.86);

    for (var l = 0; l < shape.length; l++) {
      var count = shape[l], col = [];
      var x = left + (right - left) * (l / (shape.length - 1));
      for (var i = 0; i < count; i++) {
        var y = top + (bottom - top) * ((i + 0.5) / count);
        col.push({
          x: x, y: y, bx: x, by: y,
          phase: rand() * Math.PI * 2,
          amp: 3 + rand() * 5,
          glow: 0,
          r: l === 0 || l === shape.length - 1 ? 4 : 3
        });
      }
      layers.push(col);
    }
    // Collegamenti: ogni nodo verso circa metà dei nodi dello strato successivo
    for (var k = 0; k < layers.length - 1; k++) {
      layers[k].forEach(function (a) {
        a.out = [];
        layers[k + 1].forEach(function (b) {
          if (rand() < 0.55) { var e = { a: a, b: b }; edges.push(e); a.out.push(e); }
        });
        if (!a.out.length) { var e2 = { a: a, b: layers[k + 1][0] }; edges.push(e2); a.out.push(e2); }
      });
    }
  }

  function resize() {
    var rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width; height = rect.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
    draw(0);
  }

  function fire(node) {
    if (!node.out || !node.out.length) return;
    // un nodo acceso propaga il segnale verso 1–2 nodi successivi
    var n = rand() < 0.35 ? 2 : 1;
    for (var i = 0; i < n; i++) {
      var e = node.out[Math.floor(rand() * node.out.length)];
      pulses.push({ edge: e, t: 0, speed: 0.55 + rand() * 0.5 });
    }
  }

  function step(dt, time) {
    // leggero movimento dei nodi
    layers.forEach(function (col) {
      col.forEach(function (n) {
        n.x = n.bx + Math.cos(time * 0.0004 + n.phase) * n.amp * 0.6;
        n.y = n.by + Math.sin(time * 0.0005 + n.phase) * n.amp;
        n.glow = Math.max(0, n.glow - dt * 1.4);
      });
    });
    // nuovi segnali in ingresso
    spawnClock -= dt;
    if (spawnClock <= 0 && pulses.length < 40) {
      var input = layers[0][Math.floor(rand() * layers[0].length)];
      input.glow = 1;
      fire(input);
      spawnClock = 0.35 + rand() * 0.5;
    }
    // avanzamento dei segnali
    for (var i = pulses.length - 1; i >= 0; i--) {
      var p = pulses[i];
      p.t += dt * p.speed;
      if (p.t >= 1) {
        p.edge.b.glow = 1;
        fire(p.edge.b);
        pulses.splice(i, 1);
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);

    // collegamenti
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(OIL, 0.13);
    ctx.beginPath();
    edges.forEach(function (e) { ctx.moveTo(e.a.x, e.a.y); ctx.lineTo(e.b.x, e.b.y); });
    ctx.stroke();

    // segnali in viaggio, con una breve scia
    pulses.forEach(function (p) {
      var a = p.edge.a, b = p.edge.b;
      var t0 = Math.max(0, p.t - 0.18);
      var x0 = a.x + (b.x - a.x) * t0, y0 = a.y + (b.y - a.y) * t0;
      var x1 = a.x + (b.x - a.x) * p.t, y1 = a.y + (b.y - a.y) * p.t;
      var g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, rgba(OIL, 0));
      g.addColorStop(1, rgba(OIL, 0.9));
      ctx.strokeStyle = g; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.fillStyle = rgba(PAPER, 0.95);
      ctx.beginPath(); ctx.arc(x1, y1, 1.8, 0, Math.PI * 2); ctx.fill();
    });

    // nodi
    layers.forEach(function (col) {
      col.forEach(function (n) {
        if (n.glow > 0.01) {
          var halo = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 18);
          halo.addColorStop(0, rgba(OIL, 0.45 * n.glow));
          halo.addColorStop(1, rgba(OIL, 0));
          ctx.fillStyle = halo;
          ctx.beginPath(); ctx.arc(n.x, n.y, 18, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = "#182016";
        ctx.strokeStyle = rgba(OIL, 0.45 + 0.55 * n.glow);
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r + n.glow * 1.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      });
    });
  }

  function frame(time) {
    if (!running) return;
    var dt = last ? Math.min((time - last) / 1000, 0.05) : 0;
    last = time;
    step(dt, time);
    draw();
    requestAnimationFrame(frame);
  }

  function start() {
    if (running || reduceMotion.matches || !visible || document.hidden) return;
    running = true; last = 0;
    requestAnimationFrame(frame);
  }
  function stop() { running = false; }

  // Con "riduci movimento" la rete resta ferma, con alcuni nodi accesi.
  function drawStatic() {
    stop();
    layers.forEach(function (col, l) { col.forEach(function (n, i) { n.glow = (i + l) % 3 === 0 ? 0.8 : 0; }); });
    draw();
  }

  if ("ResizeObserver" in window) new ResizeObserver(function () { resize(); if (reduceMotion.matches) drawStatic(); }).observe(canvas);
  else window.addEventListener("resize", resize);

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

  resize();
  reduceMotion.matches ? drawStatic() : start();
})();
