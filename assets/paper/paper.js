/* Interactive paper summary: scroll reveals, lazy images, charts built from the paper's Tables I and II. */
(function () {
  'use strict';
  var root = document.getElementById('paper');
  if (!root) return;
  var $ = function (s, el) { return (el || root).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || root).querySelectorAll(s)); };
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasIO = 'IntersectionObserver' in window;
  function fmt(v, d) { return v.toFixed(d == null ? 1 : d); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  /* ---------- data (from the paper) ---------- */
  // # , observation space, obs dim, grab succ, grab part, grab %, grab % w/ part, moor %, ring %, overall %, overall % w/ part, latency, sd
  var T1 = [
    [1, 'none (images only)', 0, 8, 12, 26.7, 66.7, 60.0, 53.3, 46.7, 60.0, 101.7, 1.5],
    [2, 'attitude (control dataset)', 3, 4, 8, 13.3, 40.0, 60.0, 93.3, 55.6, 64.4, 101.0, 0.6],
    [3, 'attitude', 3, 10, 19, 33.3, 96.7, 86.7, 96.7, 72.2, 93.3, 95.2, 5.0],
    [4, 'attitude + Δ tokens (1.2 s)', 3, 8, 14, 26.7, 73.3, 63.3, 46.7, 45.6, 61.1, 102.4, 1.2],
    [5, 'attitude + Δ tokens (2.0 s)', 3, 6, 8, 20.0, 46.7, 50.0, 93.3, 54.4, 63.3, 100.0, 0.5],
    [6, 'attitude + Δ tokens (4.0 s)', 3, 11, 16, 36.7, 90.0, 60.0, 66.7, 54.4, 72.2, 102.8, 1.9],
    [7, 'attitude + Δ tokens (6.0 s)', 3, 5, 18, 16.7, 76.7, 40.0, 43.3, 33.3, 53.3, 128.7, 2.8],
    [8, 'attitude + raw Δ', 6, 9, 15, 30.0, 80.0, 36.7, 76.7, 47.8, 64.4, 115.4, 11.6],
    [9, 'attitude + IMU', 13, 10, 12, 33.3, 73.3, 73.3, 66.7, 57.8, 71.1, 111.9, 9.9],
    [10, 'attitude + IMU + Δ tokens', 13, 12, 9, 40.0, 70.0, 40.0, 73.3, 51.1, 61.1, 116.4, 12.0],
    [11, 'attitude + IMU + raw Δ', 16, 9, 13, 30.0, 73.3, 30.0, 76.7, 45.6, 60.0, 113.5, 11.5],
    [12, 'attitude + IMU + thruster PWM', 19, 11, 9, 36.7, 66.7, 46.7, 66.7, 50.0, 60.0, 98.7, 1.6],
    [13, 'attitude + IMU + PWM + Δ tokens', 19, 9, 16, 30.0, 83.3, 50.0, 93.3, 57.8, 75.6, 102.6, 0.7],
    [14, 'attitude + IMU + PWM + raw Δ', 22, 10, 15, 33.3, 83.3, 50.0, 73.3, 52.2, 68.9, 113.9, 11.8]
  ].map(function (r) {
    return { n: r[0], obs: r[1], dim: r[2], succ: r[3], part: r[4], grab: r[5], grabp: r[6], moor: r[7], ring: r[8], all: r[9], allp: r[10], lat: r[11], sd: r[12] };
  });
  var BASE = T1[0];
  var METRICS = {
    allp: { label: 'Overall success incl. partial (%)', max: 100, unit: '%' },
    all: { label: 'Overall success (%)', max: 100, unit: '%' },
    grabp: { label: 'Grab the rod incl. partial (%)', max: 100, unit: '%' },
    grab: { label: 'Grab the rod, successes only — no partials (%)', max: 100, unit: '%' },
    moor: { label: 'Moor on Post (%)', max: 100, unit: '%' },
    ring: { label: 'Remove Ring (%)', max: 100, unit: '%' },
    lat: { label: 'Latency per 20-step action chunk (ms)', max: 145, unit: ' ms', low: true }
  };
  // task, location, policy, n, SR, CI low, CI high, shaded
  var T2 = [
    ['Grab (red rod)', 'Shipwreck', 'ACT', 150, 33.3, 26.3, 41.2],
    ['Grab (red rod)', 'Marina', 'ACT', 14, 42.9, 21.4, 67.4],
    ['Grab (red rod)', 'Marina', 'SmolVLA', 28, 0.0, 0.0, 12.1],
    ['Grab (green rod)', 'Pool', 'ACT', 22, 63.6, 43.0, 80.3, 1],
    ['Moor (ladder)', 'Marina', 'ACT', 206, 56.3, 49.5, 62.9],
    ['Moor (ladder)', 'Marina', 'SmolVLA', 48, 12.5, 5.9, 24.7],
    ['Moor (rope)', 'Shipwreck', 'ACT', 21, 66.7, 45.4, 82.8, 1, 1],
    ['Moor (post)', 'Shipwreck', 'ACT', 19, 36.8, 19.1, 59.0]
  ];
  var VS = [['All tasks, pooled', 47.9, 7.9], ['Grab', 37.6, 0.0], ['Moor', 55.7, 12.5]];
  var NIGHT = [['Moor on ladder', 63.9, 97, 49.5, 109], ['Grab red rod', 42.4, 66, 26.2, 84]];

  /* ---------- tooltip ---------- */
  var tip = $('.pp-tip');
  function showTip(text, x, y) {
    tip.innerHTML = text; tip.hidden = false;
    var w = tip.offsetWidth, h = tip.offsetHeight;
    var left = Math.min(Math.max(8, x + 14), innerWidth - w - 8);
    var top = y - h - 12; if (top < 8) top = y + 18;
    tip.style.left = left + 'px'; tip.style.top = top + 'px';
  }
  function hideTip() { tip.hidden = true; }
  root.addEventListener('pointermove', function (e) {
    var t = e.target.closest && e.target.closest('[data-tip]');
    if (t && root.contains(t)) showTip(t.getAttribute('data-tip'), e.clientX, e.clientY); else hideTip();
  });
  root.addEventListener('pointerleave', hideTip);
  root.addEventListener('focusin', function (e) {
    var t = e.target.closest('[data-tip]'); if (!t) return;
    var r = t.getBoundingClientRect(); showTip(t.getAttribute('data-tip'), r.left, r.top);
  });
  root.addEventListener('focusout', hideTip);
  addEventListener('scroll', hideTip, { passive: true });
  $$('.pp-eq .t').forEach(function (t) { t.tabIndex = 0; });

  /* ---------- lazy images ---------- */
  function load(img) {
    if (!img.getAttribute('data-src')) return;
    img.classList.add('loading');
    img.addEventListener('load', function () { img.classList.remove('loading'); img.classList.add('loaded'); }, { once: true });
    img.src = img.getAttribute('data-src'); img.removeAttribute('data-src');
  }
  var lazy = $$('img[data-src]');
  if (hasIO) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { load(e.target); io.unobserve(e.target); } });
    }, { rootMargin: '400px 0px' });
    lazy.forEach(function (i) { io.observe(i); });
  } else lazy.forEach(load);

  /* ---------- reveal on scroll + count-up + chart entrances ---------- */
  var onReveal = [];
  function reveal(e) {
    e.classList.add('in');
    onReveal.forEach(function (f) { f(e); });
  }
  var rv = $$('.rv');
  if (hasIO && !reduce) {
    var ro = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { reveal(e.target); ro.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    rv.forEach(function (e, i) {
      var sib = e.parentElement ? Array.prototype.indexOf.call(e.parentElement.children, e) : 0;
      if (e.matches('.pp-contrib li, .task')) e.style.transitionDelay = (sib % 6) * 70 + 'ms';
      ro.observe(e);
    });
  } else rv.forEach(reveal);

  function countUp(b) {
    var end = parseFloat(b.getAttribute('data-count')), dec = +(b.getAttribute('data-dec') || 0), suf = b.getAttribute('data-suffix') || '';
    var show = function (v) { b.textContent = (dec ? v.toFixed(dec) : Math.round(v).toLocaleString('en-US')) + suf; };
    if (reduce) return show(end);
    var t0 = null, dur = 1300;
    function step(t) { if (!t0) t0 = t; var p = Math.min(1, (t - t0) / dur); show(end * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); }
    show(0); requestAnimationFrame(step);
  }
  onReveal.push(function (e) { if (e.classList.contains('pp-stats')) $$('[data-count]', e).forEach(countUp); });

  /* ---------- chapter nav: highlight + progress ---------- */
  var links = $$('.pp-chapters a'), chapters = links.map(function (a) { return document.querySelector(a.getAttribute('href')); });
  var prog = $('.pp-progress'), ticking = false;
  function navUpdate() {
    ticking = false;
    var y = 120, cur = -1;
    chapters.forEach(function (c, i) { if (c && c.getBoundingClientRect().top < y) cur = i; });
    links.forEach(function (a, i) { a.classList.toggle('on', i === cur); });
    if (cur >= 0) { var a = links[cur], nav = a.parentElement; if (a.offsetLeft < nav.scrollLeft || a.offsetLeft + a.offsetWidth > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = a.offsetLeft - 16; }
    var r = root.getBoundingClientRect(), total = r.height - innerHeight;
    prog.style.setProperty('--pp', Math.min(1, Math.max(0, -r.top / (total > 0 ? total : 1))).toFixed(3));
  }
  addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(navUpdate); } }, { passive: true });
  navUpdate();

  /* ---------- task flip cards ---------- */
  var fine = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
  $$('.task').forEach(function (c) {
    c.setAttribute('aria-pressed', 'false');
    var set = function (on) { c.classList.toggle('flip', on); c.setAttribute('aria-pressed', on ? 'true' : 'false'); };
    c.addEventListener('click', function () { set(!c.classList.contains('flip')); c._was = c.classList.contains('flip'); });
    if (fine) {
      c.addEventListener('mouseenter', function () { c._was = c.classList.contains('flip'); set(!c._was); });
      c.addEventListener('mouseleave', function () { set(c._was); });
    }
  });
  $$('.pp-flipall').forEach(function (btn) {
    var grid = btn.parentElement.nextElementSibling;
    btn.addEventListener('click', function () {
      var on = btn.getAttribute('aria-pressed') !== 'true';
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.textContent = on ? 'Show initial states' : 'Show goal states';
      $$('.task', grid).forEach(function (c, i) {
        setTimeout(function () { c.classList.toggle('flip', on); c._was = on; c.setAttribute('aria-pressed', on ? 'true' : 'false'); }, reduce ? 0 : i * 70);
      });
    });
  });

  /* ---------- Fig. 3 rebuilt: "In total, [donut] were collected." — slices draw in, arrows label each task ---------- */
  (function () {
    var fig = $('#fig3'); if (!fig) return;
    var svg = $('svg.donut', fig), defs = $('defs', svg), g = $('.segs', svg), calls = $('.calls', svg), ns = 'http://www.w3.org/2000/svg';
    var K = { green: ['Grab green rod', '#3E9B4F', '#1E5A2A'], red: ['Grab red rod', '#C8322F', '#6E1412'], white: ['Grab white rod', '#F4F4F2', '#8A9BA3'],
              moor: ['Moor on post', '#7FB8D6', '#1D5F82'], ring: ['Unhook ring', '#F3D36B', '#8A6D0B'] };
    var D = [['green', 101, 161], ['red', 101, 153], ['white', 102, 151], ['moor', 125, 301], ['ring', 100, 321]];
    var TOT = 1616, GAP = 5, CX = 385, CY = 180, R = 100, SW = 48, segs = [], at = 0, tasks = [];
    function mk(tag, attrs, parent) { var e = document.createElementNS(ns, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); (parent || g).appendChild(e); return e; }
    D.forEach(function (d) {
      var k = d[0], c = K[k], start = at;
      var pat = mk('pattern', { id: 'h-' + k, patternUnits: 'userSpaceOnUse', width: 6, height: 6, patternTransform: 'rotate(45 ' + CX + ' ' + CY + ')' }, defs);
      mk('rect', { width: 6, height: 6, fill: c[1] }, pat); mk('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: c[2], 'stroke-width': 1.6 }, pat);
      [['calm', d[1], c[1]], ['turbulent', d[2], 'url(#h-' + k + ')']].forEach(function (p) {
        var len = p[1], s0 = at; at += len;
        var circ = mk('circle', { cx: CX, cy: CY, r: R, pathLength: TOT, class: 'seg', stroke: p[2], 'stroke-width': SW, 'stroke-dasharray': '0 ' + TOT, 'stroke-dashoffset': -s0 });
        circ.setAttribute('data-k', k);
        circ.setAttribute('data-tip', '<b>' + c[0] + ' · ' + p[0] + '</b><br>' + len + ' episodes');
        var edges = [];
        if (k === 'white') [R - SW / 2, R + SW / 2].forEach(function (rr) {
          edges.push(mk('circle', { cx: CX, cy: CY, r: rr, pathLength: TOT, fill: 'none', stroke: '#9AA5AB', 'stroke-width': .8, 'stroke-dasharray': '0 ' + TOT, 'stroke-dashoffset': -s0, style: 'pointer-events:none' }));
        });
        segs.push({ el: circ, edges: edges, len: len, k: k });
      });
      tasks.push({ k: k, mid: (start + at) / 2 / TOT * 2 * Math.PI, calm: d[1], turb: d[2], last: segs.length - 1 });
    });

    // callouts: an arrow from a label to the middle of each task's slices
    var ro = R + SW / 2 + 6, LX = 188;                                   // arrow tip radius; label column offset from centre
    tasks.forEach(function (t) { t.side = Math.sin(t.mid) >= 0 ? 1 : -1; t.ly = CY - (R + 70) * Math.cos(t.mid); });
    [1, -1].forEach(function (side) {                                     // spread labels on each side so they never overlap
      var L = tasks.filter(function (t) { return t.side === side; }).sort(function (a, b) { return a.ly - b.ly; });
      for (var i = 1; i < L.length; i++) if (L[i].ly - L[i - 1].ly < 52) L[i].ly = L[i - 1].ly + 52;
      var over = L.length ? L[L.length - 1].ly - 352 : 0; if (over > 0) L.forEach(function (t) { t.ly -= over; });
      for (i = 0; i < L.length; i++) if (L[i].ly < 28) L[i].ly = 28;
    });
    tasks.forEach(function (t) {
      var tx = CX + ro * Math.sin(t.mid), ty = CY - ro * Math.cos(t.mid);
      var ex = CX + t.side * (R + SW / 2 + 40), lx = CX + t.side * LX;
      var grp = mk('g', { class: 'call', 'data-k': t.k }, calls);
      mk('path', { d: 'M' + (lx - t.side * 6) + ',' + t.ly + ' L' + ex + ',' + t.ly + ' L' + tx.toFixed(1) + ',' + ty.toFixed(1), 'marker-end': 'url(#f3-arrow)', class: 'lead', pathLength: 1 }, grp);
      var tx1 = mk('text', { x: lx, y: t.ly - 3, 'text-anchor': t.side > 0 ? 'start' : 'end', class: 'cl-h' }, grp); tx1.textContent = K[t.k][0];
      var tx2 = mk('text', { x: lx, y: t.ly + 15, 'text-anchor': t.side > 0 ? 'start' : 'end', class: 'cl-n' }, grp); tx2.textContent = t.calm + ' calm · ' + t.turb + ' turbulent';
      t.g = grp;
    });

    // phones: the labels are replaced by a list, so zoom the drawing to the ring itself
    var narrow = window.matchMedia('(max-width: 700px)');
    function fitView() { svg.setAttribute('viewBox', narrow.matches ? (CX - 140) + ' ' + (CY - 140) + ' 280 280' : '0 0 770 380'); }
    fitView(); if (narrow.addEventListener) narrow.addEventListener('change', fitView);
    var ctr = $('.ctr-n', svg);
    // fills clockwise in step with scrolling (and un-fills going back up)
    function paint() {
      var r = fig.getBoundingClientRect(), H = innerHeight;
      var q = reduce ? 1 : Math.max(0, Math.min(1, (H * 0.92 - r.top) / (H * 0.42)));
      var fill = q * TOT, at = 0;
      segs.forEach(function (sg) {
        var vis = Math.max(0, Math.min(sg.len, fill - at)), shown = Math.max(0, vis - GAP);
        var dash = shown + ' ' + (TOT - shown);
        sg.el.setAttribute('stroke-dasharray', dash);
        sg.edges.forEach(function (e) { e.setAttribute('stroke-dasharray', dash); });
        at += sg.len;
      });
      tasks.forEach(function (t) {
        var end = 0; for (var i = 0; i <= t.last; i++) end += segs[i].len;
        t.g.classList.toggle('on', fill >= end - 1);
      });
      ctr.textContent = Math.round(fill);
    }
    var ticking = false;
    addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(function () { ticking = false; paint(); }); } }, { passive: true });
    addEventListener('resize', paint);
    paint();
    function hl(k) {
      segs.forEach(function (s) { s.el.classList.toggle('dim', !!k && s.k !== k); s.el.classList.toggle('hi', s.k === k); });
      tasks.forEach(function (t) { t.g.classList.toggle('dim', !!k && t.k !== k); });
    }
    segs.forEach(function (s) { s.el.addEventListener('mouseenter', function () { hl(s.k); }); s.el.addEventListener('mouseleave', function () { hl(null); }); });
    tasks.forEach(function (t) { t.g.addEventListener('mouseenter', function () { hl(t.k); }); t.g.addEventListener('mouseleave', function () { hl(null); }); });
  })();

  /* ---------- Fig. 1 rebuilt: assembles, then its photos play as video ---------- */
  (function () {
    var f1 = $('.f1'); if (!f1) return;
    var vids = $$('video', f1), started = false, visible = false;
    function playAll() { vids.forEach(function (v) { if (v._ready) { var r = v.play(); if (r && r.catch) r.catch(function () {}); } }); }
    function pauseAll() { vids.forEach(function (v) { v.pause(); }); }
    function arm(v, delay) {
      v.src = v.getAttribute('data-src'); v.removeAttribute('data-src');
      var off = v.getAttribute('data-off');
      v.addEventListener('loadedmetadata', function () { if (off) v.currentTime = (+off) * v.duration / 4; }, { once: true });
      setTimeout(function () { v._ready = true; if (visible) { var r = v.play(); if (r && r.catch) r.catch(function () {}); } }, reduce ? 0 : delay);
    }
    function start() {
      if (started) return; started = true; f1.classList.add('in');
      vids.forEach(function (v) {
        // same timing as the figure build: tiles with the pre-training box, the trajectory from its first frame when its panel appears, then the POV strip
        var d = v.classList.contains('traj') ? 2300 : v.hasAttribute('data-off') ? 2800 : 450;
        arm(v, d);
      });
    }
    if (hasIO) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          visible = e.isIntersecting;
          if (visible && e.intersectionRatio >= 0.2) start();
          if (started) { if (visible) playAll(); else pauseAll(); }
        });
      }, { threshold: [0, 0.2] }).observe(f1);
    } else { visible = true; start(); }
  })();

  /* ---------- Emerging behaviors: videos with live step chips; dive synced to a depth trace ---------- */
  (function () {
    var DIVE = {"t":[0.0,0.06,0.12,0.18,0.24,0.3,0.36,0.42,0.48,0.54,0.6,0.66,0.72,0.78,0.84,0.9,0.96,1.02,1.08,1.14,1.2,1.26,1.32,1.38,1.44,1.5,1.56,1.62,1.68,1.74,1.8,1.86,1.92,1.98,2.04,2.1,2.16,2.22,2.28,2.34,2.4,2.46,2.52,2.58,2.64,2.7,2.76,2.82,2.88,2.94,3.0,3.06,3.12,3.18,3.24,3.3,3.36,3.42,3.48,3.54,3.6,3.66,3.72,3.78,3.84,3.9,3.96,4.02,4.08,4.14,4.2,4.26,4.32,4.38,4.44,4.5,4.56,4.62,4.68,4.74,4.8,4.86,4.92,4.98,5.04,5.1,5.16,5.22,5.28,5.34,5.4,5.46,5.52,5.58,5.64,5.7,5.76,5.82,5.88,5.94,6.0,6.06,6.12,6.18,6.24,6.3,6.36,6.42,6.48,6.54,6.6,6.66,6.72,6.78,6.84,6.9,6.96,7.02,7.08,7.14,7.2,7.26,7.32,7.38,7.44,7.5,7.56,7.62,7.68,7.74,7.78],"d":[4.709,4.709,4.73,4.73,4.73,4.73,4.73,4.73,4.73,4.73,4.737,4.737,4.737,4.737,4.737,4.746,4.746,4.746,4.746,4.746,4.753,4.753,4.753,4.753,4.753,4.748,4.748,4.748,4.748,4.748,4.741,4.741,4.741,4.741,4.741,4.741,4.729,4.729,4.729,4.729,4.729,4.729,4.737,4.737,4.737,4.737,4.737,4.774,4.774,4.774,4.774,4.774,4.774,4.849,4.849,4.849,4.849,4.849,4.849,4.927,4.927,4.927,4.927,4.927,4.977,4.977,4.977,4.977,4.977,4.977,5.018,5.018,5.018,5.018,5.018,5.075,5.075,5.075,5.075,5.075,5.075,5.152,5.152,5.152,5.152,5.152,5.152,5.152,5.248,5.248,5.248,5.248,5.248,5.354,5.354,5.354,5.354,5.354,5.455,5.455,5.455,5.455,5.455,5.455,5.506,5.506,5.506,5.506,5.506,5.552,5.552,5.552,5.552,5.552,5.57,5.57,5.57,5.57,5.57,5.57,5.57,5.569,5.569,5.569,5.569,5.569,5.544,5.544,5.544,5.544,5.544],"marks":[0.4,3.1,6.0,7.6],"mdepth":[4.73,4.77,5.45,5.54]};
    $$('.beh').forEach(function (box) {
      var vids = $$('video', box), armed = false, visible = false;
      function play(v) { var r = v.play(); if (r && r.catch) r.catch(function () {}); }
      function arm() {
        if (armed) return; armed = true;
        vids.forEach(function (v) { v.src = v.getAttribute('data-src'); v.removeAttribute('data-src'); if (visible) play(v); });
      }
      if (hasIO) new IntersectionObserver(function (es) {
        es.forEach(function (e) { visible = e.isIntersecting; if (visible) { arm(); vids.forEach(play); } else vids.forEach(function (v) { v.pause(); }); });
      }, { threshold: 0.25 }).observe(box);
      else { visible = true; arm(); }
      // each video drives its own clock + chips
      vids.forEach(function (v) {
        var wrap = v.closest('.beh-one') || box;
        var chips = $$('.beh-chips button', wrap), clock = $('.clock', v.parentElement);
        chips.forEach(function (c) { c.addEventListener('click', function () { v.currentTime = +c.getAttribute('data-t'); play(v); }); });
        function tick() {
          var t = v.currentTime || 0, on = -1;
          chips.forEach(function (c, i) { if (t >= +c.getAttribute('data-t') - 0.05) on = i; });
          chips.forEach(function (c, i) { c.classList.toggle('on', i === on); c.classList.toggle('past', i < on); });
          if (clock) clock.textContent = t.toFixed(1) + ' s';
          if (v === vids[0] && box.id === 'beh-dive') drawHead(t);
          if (!v.paused) requestAnimationFrame(tick);
        }
        v.addEventListener('play', function () { requestAnimationFrame(tick); });
        v.addEventListener('seeked', tick);
      });
    });

    // depth chart (deeper is lower), playhead follows the video
    var svg = $('#beh-dive svg.depth'); if (!svg) return;
    var X0 = 58, X1 = 505, Y0 = 18, Y1 = 238, T = DIVE.t[DIVE.t.length - 1], ZMIN = 4.5, ZMAX = 5.7;
    var x = function (t) { return X0 + (X1 - X0) * t / T; }, y = function (z) { return Y0 + (Y1 - Y0) * (z - ZMIN) / (ZMAX - ZMIN); };
    var pts = DIVE.t.map(function (t, i) { return x(t).toFixed(1) + ',' + y(DIVE.d[i]).toFixed(1); }).join(' ');
    var h = '';
    [4.6, 5.0, 5.4].forEach(function (z) { h += '<line class="grid" x1="' + X0 + '" x2="' + X1 + '" y1="' + y(z) + '" y2="' + y(z) + '"/><text class="ax" x="' + (X0 - 8) + '" y="' + (y(z) + 4) + '" text-anchor="end">' + z.toFixed(1) + ' m</text>'; });
    [0, 2, 4, 6].forEach(function (t) { h += '<text class="ax" x="' + x(t) + '" y="' + (Y1 + 26) + '" text-anchor="middle">' + t + ' s</text>'; });
    h += '<polyline class="ghost" points="' + pts + '"/><polyline class="live" points="' + pts + '"/>';
    DIVE.marks.forEach(function (t, i) {
      var z = DIVE.mdepth[i];
      h += '<circle class="mk" cx="' + x(t) + '" cy="' + y(z) + '" r="5"/><text class="mkl" x="' + x(t) + '" y="' + (y(z) - 11) + '" text-anchor="middle">' + z.toFixed(2) + ' m</text>';
    });
    h += '<line class="head" x1="0" x2="0" y1="' + Y0 + '" y2="' + Y1 + '"/><circle class="dot" r="7"/>';
    svg.innerHTML = h;
    var live = $('polyline.live', svg), head = $('line.head', svg), dot = $('circle.dot', svg);
    var len = 0; try { len = live.getTotalLength(); } catch (e) {}
    function depthAt(t) {
      var i = 0; while (i < DIVE.t.length - 1 && DIVE.t[i + 1] < t) i++;
      var a = DIVE.t[i], b = DIVE.t[Math.min(i + 1, DIVE.t.length - 1)], f = b > a ? (t - a) / (b - a) : 0;
      return DIVE.d[i] + (DIVE.d[Math.min(i + 1, DIVE.d.length - 1)] - DIVE.d[i]) * Math.max(0, Math.min(1, f));
    }
    function drawHead(t) {
      t = Math.min(T, Math.max(0, t));
      var X = x(t), Y = y(depthAt(t));
      head.setAttribute('x1', X); head.setAttribute('x2', X);
      dot.setAttribute('cx', X); dot.setAttribute('cy', Y);
      dot.setAttribute('data-tip', t.toFixed(1) + ' s · ' + depthAt(t).toFixed(2) + ' m deep');
      if (len) { live.style.strokeDasharray = len; live.style.strokeDashoffset = len * (1 - t / T); }
    }
    drawHead(0);
  })();

  /* ---------- Fig. 5 rebuilt: nine panels that draw left-to-right when scrolled into view ---------- */
  (function () {
    var box = $('.f5'); if (!box) return;
    var F = {"x":[0.0,2.0,4.0,6.1,8.1,10.1,12.1,14.1,16.2,18.2,20.2,22.2,24.2,26.3,28.3,30.3,32.3,34.3,36.4,38.4,40.4,42.4,44.4,46.5,48.5,50.5,52.5,54.5,56.6,58.6,60.6,62.6,64.6,66.7,68.7,70.7,72.7,74.7,76.8,78.8,80.8,82.8,84.8,86.9,88.9,90.9,92.9,94.9,97.0,99.0,100.0],"n":{"calm":529,"turb":1087},"panels":[{"c":"roll","label":"roll","unit":"\u00b0","ratio":1.94,"p":6.085261615714405e-144,"calm":{"mu":[-0.119,-0.102,-0.098,-0.072,-0.075,-0.07,-0.044,-0.027,-0.01,-0.036,-0.087,-0.091,-0.08,-0.064,-0.043,-0.03,-0.005,0.018,0.041,0.053,0.03,0.058,0.051,0.089,0.1,0.142,0.183,0.252,0.283,0.309,0.354,0.32,0.277,0.235,0.162,0.103,0.036,-0.058,-0.121,-0.146,-0.136,-0.151,-0.19,-0.144,-0.144,-0.188,-0.261,-0.298,-0.209,-0.082,-0.062],"sd":[0.592,0.548,0.532,0.514,0.537,0.529,0.569,0.631,0.704,0.772,0.781,0.823,0.849,0.817,0.827,0.814,0.79,0.815,0.775,0.745,0.763,0.77,0.786,0.764,0.773,0.806,0.847,0.906,0.968,1.002,0.989,0.971,0.947,0.938,0.982,1.006,1.045,1.051,1.086,1.12,1.096,1.081,1.055,0.961,0.941,0.945,1.048,1.249,1.341,1.408,1.403]},"turb":{"mu":[-0.073,-0.091,-0.065,-0.1,-0.046,0.011,0.031,0.042,-0.012,-0.017,-0.047,-0.005,0.033,0.082,-0.012,-0.009,-0.037,-0.003,0.015,0.034,0.142,0.203,0.199,0.142,0.199,0.204,0.254,0.305,0.401,0.368,0.34,0.258,0.223,0.173,0.059,0.087,0.031,0.024,-0.05,-0.021,-0.171,-0.217,-0.296,-0.321,-0.362,-0.288,-0.272,-0.33,-0.448,-0.592,-0.658],"sd":[1.77,1.652,1.571,1.615,1.606,1.716,1.716,1.702,1.826,1.681,1.778,1.753,1.704,1.697,1.66,1.668,1.701,1.688,1.797,1.782,1.993,1.964,1.798,1.703,1.605,1.642,1.655,1.714,1.707,1.714,1.737,1.714,1.637,1.707,1.841,1.879,1.956,2.0,2.019,2.009,2.197,2.05,2.051,1.954,1.917,1.894,1.875,1.962,2.019,2.262,2.343]}},{"c":"pitch","label":"pitch","unit":"\u00b0","ratio":1.39,"p":7.0317873742423585e-34,"calm":{"mu":[0.998,0.957,0.968,0.995,1.034,1.098,1.165,1.27,1.321,1.38,1.385,1.333,1.223,1.07,0.949,0.797,0.652,0.502,0.311,0.136,-0.041,-0.193,-0.382,-0.567,-0.765,-0.932,-1.124,-1.27,-1.394,-1.469,-1.545,-1.577,-1.581,-1.529,-1.485,-1.387,-1.287,-1.197,-1.053,-0.899,-0.686,-0.505,-0.297,-0.074,0.184,0.432,0.66,0.842,0.928,1.016,1.013],"sd":[1.097,1.065,1.059,1.05,1.037,1.141,1.208,1.311,1.454,1.528,1.474,1.481,1.494,1.491,1.458,1.395,1.335,1.322,1.35,1.427,1.446,1.475,1.526,1.535,1.574,1.61,1.657,1.645,1.727,1.77,1.78,1.794,1.792,1.836,1.814,1.8,1.778,1.737,1.719,1.727,1.71,1.716,1.658,1.602,1.555,1.507,1.525,1.513,1.552,1.555,1.527]},"turb":{"mu":[1.125,1.034,1.006,1.076,1.151,1.194,1.312,1.431,1.485,1.506,1.445,1.31,1.208,0.992,0.887,0.725,0.599,0.437,0.279,0.098,0.003,-0.072,-0.205,-0.318,-0.396,-0.531,-0.666,-0.797,-0.839,-0.907,-0.965,-1.014,-1.074,-1.033,-1.053,-1.053,-0.942,-0.867,-0.746,-0.667,-0.585,-0.605,-0.725,-0.794,-0.869,-0.849,-0.7,-0.48,-0.212,0.106,0.235],"sd":[1.764,1.771,1.715,1.736,1.728,1.709,1.767,1.873,2.02,1.985,1.978,2.012,2.01,2.016,2.026,2.018,2.089,2.096,2.168,2.086,1.966,1.887,1.841,1.903,1.907,2.025,1.977,1.987,1.976,2.052,1.999,2.02,2.085,2.115,2.215,2.147,2.174,2.15,2.264,2.364,2.33,2.31,2.35,2.371,2.403,2.509,2.577,2.56,2.541,2.47,2.483]}},{"c":"yaw","label":"yaw","unit":"\u00b0","ratio":1.07,"p":0.0552730096847326,"calm":{"mu":[2.806,2.824,2.872,2.899,2.92,2.919,2.988,2.98,3.029,3.23,3.568,3.197,3.51,3.318,3.395,3.537,3.58,3.696,3.74,3.76,3.114,3.015,3.027,2.934,2.713,1.828,1.331,0.767,0.12,-0.626,-0.789,-1.559,-2.5,-4.151,-5.362,-6.407,-4.867,-3.839,-4.119,-4.041,-3.576,-5.755,-6.094,-4.964,-5.262,-5.475,-4.57,-3.696,-2.989,-2.239,-2.634],"sd":[31.695,31.643,31.659,31.637,31.475,30.98,30.181,29.101,28.009,26.749,25.688,23.17,22.351,19.429,19.744,19.307,18.944,18.845,18.68,18.526,17.362,17.445,17.568,17.612,17.762,17.345,17.423,17.554,17.754,18.154,21.704,22.274,23.193,21.289,22.826,24.311,32.013,37.031,38.965,40.376,42.19,38.558,38.235,39.927,36.397,32.824,31.664,31.365,31.038,31.142,30.044]},"turb":{"mu":[2.949,2.988,3.03,3.006,2.997,2.965,2.946,2.901,3.18,3.376,3.547,4.031,4.118,4.059,4.137,4.14,4.468,4.452,4.376,4.332,4.379,4.397,4.263,4.092,3.897,3.672,3.512,3.102,2.623,2.088,1.514,0.936,0.323,-0.49,-1.193,-2.241,-3.336,-4.943,-6.034,-7.22,-8.536,-8.841,-8.925,-8.988,-9.085,-8.969,-7.976,-7.729,-7.272,-7.009,-6.681],"sd":[28.949,29.068,29.0,28.96,28.783,28.337,27.415,26.244,25.006,23.605,22.273,20.05,18.936,17.992,17.306,16.843,15.341,14.795,14.47,14.047,13.667,13.386,13.415,13.537,13.549,13.381,13.464,13.599,14.038,14.54,14.791,15.371,16.059,16.741,17.35,20.549,21.406,22.151,23.604,24.341,25.311,26.065,27.232,28.716,28.986,29.001,29.685,26.85,25.507,25.557,25.532]}},{"c":"rollspeed","label":"roll rate","unit":"\u00b0 s\u207b\u00b9","ratio":2.33,"p":6.465604441297429e-164,"calm":{"mu":[0.195,0.212,0.222,0.307,0.33,0.291,0.368,0.349,0.247,0.242,0.183,0.295,0.415,0.285,0.372,0.409,0.467,0.454,0.282,0.165,0.231,0.105,0.276,0.109,0.124,0.176,0.245,-0.037,-0.165,-0.529,-0.689,-1.0,-1.193,-1.487,-1.501,-1.448,-1.27,-1.233,-1.047,-0.465,-0.259,-0.253,0.194,0.623,0.507,0.408,0.347,0.964,1.308,1.007,0.432],"sd":[2.498,2.4,2.249,2.201,2.046,2.032,2.154,2.456,2.715,2.661,2.629,2.632,2.754,2.922,2.977,2.846,2.891,2.806,3.007,3.051,3.118,3.284,3.035,3.009,3.05,2.996,2.865,3.247,3.485,3.977,4.125,4.431,4.802,4.87,4.698,4.708,4.62,4.8,4.839,4.827,5.045,5.224,5.203,4.747,4.115,4.321,4.909,4.403,3.801,3.433,3.287]},"turb":{"mu":[0.25,0.21,-0.045,0.478,0.728,0.729,0.354,0.233,0.046,0.338,0.386,0.564,0.497,0.071,0.006,0.166,0.285,0.416,0.742,0.764,0.85,0.678,0.115,0.268,0.154,0.284,0.672,0.556,0.292,-0.113,-0.661,-0.934,-0.781,-0.938,-1.003,-0.704,-0.771,-0.863,-0.754,-0.915,-0.882,-0.81,-0.57,-0.306,0.652,0.486,0.391,0.091,-0.452,-0.791,-0.406],"sd":[7.189,7.147,7.12,7.3,7.595,7.809,7.434,7.496,7.512,7.355,7.081,7.352,7.092,6.905,6.831,6.925,6.686,6.852,6.966,7.32,7.511,6.888,7.088,7.423,7.21,6.917,6.985,6.956,6.964,7.42,6.988,7.369,7.753,7.691,7.696,8.152,8.029,8.053,8.075,8.07,8.406,8.399,8.044,8.511,8.686,7.953,7.921,8.684,8.611,8.426,8.289]}},{"c":"pitchspeed","label":"pitch rate","unit":"\u00b0 s\u207b\u00b9","ratio":1.95,"p":6.454586510998312e-177,"calm":{"mu":[-0.024,-0.047,0.139,0.427,0.409,0.628,0.921,0.902,0.843,0.507,0.084,-0.479,-0.831,-1.229,-1.279,-1.281,-1.361,-1.385,-1.633,-1.563,-1.564,-1.683,-1.566,-1.586,-1.701,-1.618,-1.527,-1.271,-1.189,-0.888,-0.872,-0.55,-0.045,0.13,0.398,0.768,0.747,0.966,1.361,1.585,1.917,1.712,1.954,2.214,2.233,1.968,1.973,1.418,0.875,0.346,0.198],"sd":[2.698,2.598,2.342,2.099,2.332,2.494,2.788,3.1,3.382,3.341,3.387,3.393,3.221,3.11,3.062,2.986,2.896,2.874,2.87,2.941,3.075,3.272,3.289,3.459,3.393,3.622,3.831,4.034,3.835,3.621,3.728,4.104,4.062,4.01,4.311,4.16,4.113,4.471,4.332,4.23,4.595,4.387,4.595,4.572,4.169,4.064,4.11,3.631,3.171,2.686,2.788]},"turb":{"mu":[-0.375,-0.098,0.235,0.533,0.798,0.89,1.185,1.177,0.668,0.333,-0.543,-0.888,-0.726,-0.868,-1.055,-0.914,-0.703,-1.269,-1.256,-1.264,-0.97,-1.192,-0.926,-0.753,-1.16,-1.084,-0.86,-0.906,-0.633,-0.673,-0.477,-0.162,-0.457,-0.059,0.036,0.579,0.966,0.891,1.207,0.849,0.029,-0.218,-0.054,-0.131,0.286,1.06,1.96,2.131,2.465,2.323,1.953],"sd":[6.993,6.609,6.467,6.591,6.758,7.003,6.92,6.849,6.924,6.862,6.706,6.761,6.928,6.899,6.795,6.997,6.725,6.818,6.524,6.703,6.742,6.732,6.717,6.821,7.024,6.849,6.732,6.852,7.117,6.989,6.945,7.082,7.193,7.418,7.083,7.339,7.554,7.798,7.698,7.596,7.953,8.241,8.015,7.668,7.73,7.525,7.253,6.796,6.537,6.344,6.567]}},{"c":"yawspeed","label":"yaw rate","unit":"\u00b0 s\u207b\u00b9","ratio":1.36,"p":9.262925768852092e-23,"calm":{"mu":[1.172,1.2,1.252,1.176,1.164,1.033,1.362,2.075,2.382,3.194,3.598,3.87,3.74,3.223,2.804,2.488,1.799,1.533,1.681,1.244,1.041,0.562,0.022,-0.523,-0.96,-1.867,-2.925,-4.676,-5.168,-5.82,-6.526,-7.05,-7.752,-8.478,-9.134,-9.011,-8.375,-6.7,-5.776,-3.56,-2.305,0.533,2.795,5.357,7.998,9.207,8.728,7.684,6.427,4.896,4.118],"sd":[8.872,8.251,7.883,7.663,8.415,9.963,12.743,15.201,17.261,19.169,19.262,17.985,16.386,15.25,13.947,12.643,11.827,11.756,11.908,12.7,13.14,13.212,12.315,12.125,11.832,12.681,14.083,14.859,15.523,17.026,19.027,21.212,21.974,22.941,23.289,23.106,21.895,20.471,19.627,20.491,21.451,22.977,22.944,23.885,24.432,25.696,25.258,22.748,19.954,16.729,14.619]},"turb":{"mu":[2.253,2.138,1.8,1.728,1.442,1.349,1.461,1.964,2.899,3.12,3.379,2.807,2.503,2.121,2.115,2.256,2.001,1.823,1.618,1.735,1.334,1.152,0.648,0.239,0.141,-0.433,-0.858,-1.582,-2.295,-2.544,-3.113,-3.145,-3.749,-4.752,-5.44,-6.456,-6.642,-7.241,-7.788,-7.91,-6.288,-4.56,-2.557,-0.287,1.703,4.295,5.811,6.957,7.156,6.223,5.568],"sd":[14.532,12.974,12.928,12.834,14.216,16.248,17.895,20.089,21.335,22.74,23.272,22.307,20.896,19.271,18.179,17.266,16.984,16.484,16.496,15.398,15.007,15.408,15.056,14.441,14.392,14.761,15.154,15.36,16.449,16.504,17.792,18.071,18.107,18.867,19.562,20.066,21.006,21.884,21.322,21.161,20.477,20.72,19.887,19.517,19.282,19.372,20.011,20.713,20.256,18.839,17.772]}},{"c":"acc_x","label":"lin. acc. x","unit":"m s\u207b\u00b2","ratio":1.28,"p":7.188191061790309e-26,"calm":{"mu":[0.192,0.182,0.19,0.201,0.233,0.278,0.337,0.369,0.376,0.371,0.368,0.35,0.33,0.295,0.26,0.233,0.198,0.162,0.113,0.071,0.031,-0.012,-0.035,-0.093,-0.135,-0.174,-0.219,-0.261,-0.279,-0.307,-0.331,-0.341,-0.355,-0.355,-0.348,-0.332,-0.33,-0.322,-0.309,-0.28,-0.255,-0.203,-0.163,-0.11,-0.063,0.02,0.085,0.131,0.159,0.177,0.179],"sd":[0.22,0.209,0.212,0.219,0.269,0.312,0.345,0.357,0.374,0.368,0.348,0.342,0.341,0.333,0.322,0.306,0.293,0.291,0.31,0.317,0.329,0.325,0.331,0.346,0.347,0.345,0.368,0.386,0.383,0.402,0.4,0.399,0.4,0.412,0.412,0.405,0.404,0.418,0.414,0.417,0.433,0.399,0.382,0.355,0.332,0.326,0.323,0.321,0.326,0.343,0.346]},"turb":{"mu":[0.213,0.193,0.207,0.25,0.296,0.343,0.385,0.408,0.402,0.369,0.351,0.318,0.289,0.247,0.216,0.176,0.151,0.107,0.074,0.042,0.008,-0.007,-0.034,-0.056,-0.072,-0.109,-0.126,-0.166,-0.188,-0.202,-0.226,-0.216,-0.228,-0.244,-0.25,-0.236,-0.217,-0.202,-0.204,-0.208,-0.203,-0.212,-0.238,-0.258,-0.262,-0.259,-0.213,-0.13,-0.043,0.045,0.085],"sd":[0.334,0.303,0.312,0.335,0.354,0.379,0.414,0.413,0.431,0.435,0.415,0.423,0.419,0.444,0.423,0.43,0.434,0.436,0.438,0.442,0.433,0.404,0.397,0.414,0.422,0.431,0.435,0.452,0.457,0.462,0.441,0.444,0.461,0.487,0.498,0.492,0.495,0.503,0.511,0.535,0.537,0.522,0.513,0.494,0.504,0.52,0.518,0.494,0.458,0.463,0.487]}},{"c":"acc_y","label":"lin. acc. y","unit":"m s\u207b\u00b2","ratio":1.95,"p":4.645430398843295e-126,"calm":{"mu":[0.029,0.03,0.029,0.025,0.019,0.016,0.004,0.007,0.011,0.018,0.025,0.022,0.02,0.019,0.015,0.018,0.008,0.007,0.01,0.003,0.002,0.002,-0.007,-0.006,-0.011,-0.032,-0.048,-0.045,-0.066,-0.074,-0.071,-0.069,-0.064,-0.059,-0.043,-0.005,0.003,0.023,0.029,0.028,0.028,0.033,0.048,0.034,0.013,0.006,0.009,0.011,0.009,-0.008,-0.01],"sd":[0.11,0.102,0.097,0.1,0.116,0.126,0.146,0.17,0.182,0.184,0.173,0.177,0.175,0.166,0.169,0.178,0.177,0.183,0.187,0.195,0.188,0.172,0.172,0.183,0.196,0.215,0.212,0.239,0.227,0.224,0.222,0.229,0.233,0.238,0.24,0.257,0.282,0.291,0.269,0.273,0.283,0.269,0.268,0.261,0.24,0.23,0.25,0.274,0.284,0.276,0.275]},"turb":{"mu":[0.01,0.005,-0.003,0.007,-0.002,-0.01,-0.026,-0.017,-0.001,0.013,0.011,0.008,-0.009,-0.011,0.008,0.013,0.011,0.012,0.01,0.0,-0.019,-0.024,-0.032,-0.025,-0.03,-0.04,-0.053,-0.071,-0.081,-0.08,-0.064,-0.059,-0.055,-0.046,-0.034,-0.015,-0.004,-0.004,0.008,0.028,0.06,0.067,0.093,0.09,0.081,0.063,0.049,0.041,0.053,0.076,0.087],"sd":[0.312,0.293,0.278,0.302,0.314,0.356,0.36,0.363,0.383,0.361,0.359,0.336,0.335,0.349,0.337,0.339,0.34,0.336,0.358,0.369,0.427,0.396,0.384,0.351,0.347,0.338,0.351,0.356,0.371,0.372,0.387,0.372,0.359,0.378,0.396,0.396,0.434,0.451,0.442,0.46,0.552,0.471,0.47,0.448,0.424,0.414,0.393,0.385,0.396,0.419,0.434]}},{"c":"acc_z","label":"lin. acc. z","unit":"m s\u207b\u00b2","ratio":2.68,"p":9.279053540071991e-211,"calm":{"mu":[-0.024,-0.021,-0.022,-0.019,-0.018,-0.017,-0.017,-0.015,-0.022,-0.025,-0.027,-0.028,-0.032,-0.03,-0.025,-0.019,-0.014,-0.009,-0.01,-0.008,-0.004,-0.003,0.002,0.009,0.011,0.012,0.015,0.019,0.021,0.023,0.023,0.031,0.033,0.027,0.02,0.022,0.017,0.025,0.025,0.024,0.025,0.02,0.014,0.007,0.009,0.003,0.004,-0.009,-0.013,-0.016,-0.016],"sd":[0.048,0.043,0.043,0.046,0.051,0.056,0.062,0.065,0.066,0.066,0.065,0.062,0.053,0.05,0.051,0.046,0.048,0.051,0.047,0.054,0.053,0.049,0.054,0.062,0.068,0.065,0.062,0.065,0.071,0.071,0.072,0.079,0.08,0.069,0.07,0.072,0.078,0.089,0.081,0.085,0.101,0.092,0.097,0.079,0.083,0.084,0.097,0.095,0.088,0.079,0.072]},"turb":{"mu":[-0.027,-0.021,-0.023,-0.021,-0.026,-0.02,-0.013,-0.025,-0.023,-0.023,-0.026,-0.03,-0.027,-0.022,-0.019,-0.017,-0.017,-0.017,-0.006,-0.007,0.0,-0.007,-0.001,0.002,-0.002,0.011,0.01,0.001,0.005,0.011,0.001,0.018,0.016,0.014,0.009,0.017,0.01,0.019,0.02,0.022,0.027,0.009,0.014,0.015,0.034,0.039,0.032,0.026,0.014,0.012,-0.007],"sd":[0.173,0.168,0.165,0.172,0.174,0.179,0.177,0.177,0.186,0.173,0.17,0.176,0.167,0.177,0.173,0.166,0.168,0.166,0.176,0.185,0.205,0.189,0.188,0.186,0.177,0.174,0.169,0.175,0.185,0.187,0.182,0.179,0.182,0.182,0.187,0.19,0.197,0.199,0.206,0.225,0.221,0.217,0.208,0.21,0.217,0.205,0.201,0.202,0.194,0.204,0.206]}}]};
    var ns = 'http://www.w3.org/2000/svg', X0 = 34, X1 = 192, Y0 = 14, Y1 = 110;
    var xs = function (v) { return X0 + (X1 - X0) * v / 100; };
    var COL = { calm: '#E9C46A', turb: '#1D5F82' };
    function nice(v) { var p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p; }
    function fmt(v) { var a = Math.abs(v); return a >= 10 ? v.toFixed(0) : a >= 1 ? v.toFixed(1) : v.toFixed(2); }
    F.panels.forEach(function (P, i) {
      var lim = 0;
      ['calm', 'turb'].forEach(function (k) { P[k].mu.forEach(function (m, j) { lim = Math.max(lim, Math.abs(m - P[k].sd[j]), Math.abs(m + P[k].sd[j])); }); });
      lim *= 1.08; var tick = nice(lim * 0.6); if (tick > lim * 0.8) tick = tick / 2;
      var ys = function (v) { return (Y0 + Y1) / 2 - (Y1 - Y0) / 2 * v / lim; };
      function band(k) {
        var up = F.x.map(function (x, j) { return xs(x).toFixed(1) + ',' + ys(P[k].mu[j] + P[k].sd[j]).toFixed(1); });
        var dn = F.x.map(function (x, j) { return xs(x).toFixed(1) + ',' + ys(P[k].mu[j] - P[k].sd[j]).toFixed(1); }).reverse();
        return 'M' + up.join('L') + 'L' + dn.join('L') + 'Z';
      }
      function line(k) { return 'M' + F.x.map(function (x, j) { return xs(x).toFixed(1) + ',' + ys(P[k].mu[j]).toFixed(1); }).join('L'); }
      var cell = el('div', 'f5-cell');
      cell.style.setProperty('--d', (i * 0.12) + 's');
      cell.innerHTML = '<p class="f5-t">' + P.label + ' <span>(' + P.unit + ')</span><b>×' + P.ratio.toFixed(1) + '</b></p>' +
        '<svg viewBox="0 0 200 128"><defs><clipPath id="f5c' + i + '"><rect class="wipe" x="' + X0 + '" y="0" width="' + (X1 - X0 + 2) + '" height="128"/></clipPath></defs>' +
        '<line class="ax" x1="' + X0 + '" x2="' + X1 + '" y1="' + ys(0) + '" y2="' + ys(0) + '"/>' +
        [tick, -tick].map(function (t) { return '<line class="gr" x1="' + X0 + '" x2="' + X1 + '" y1="' + ys(t) + '" y2="' + ys(t) + '"/><text class="tk" x="' + (X0 - 4) + '" y="' + (ys(t) + 3) + '" text-anchor="end">' + fmt(t) + '</text>'; }).join('') +
        '<text class="tk" x="' + (X0 - 4) + '" y="' + (ys(0) + 3) + '" text-anchor="end">0</text>' +
        '<text class="tk" x="' + X0 + '" y="126" text-anchor="middle">0</text><text class="tk" x="' + X1 + '" y="126" text-anchor="middle">100%</text>' +
        '<g clip-path="url(#f5c' + i + ')"><path class="bd turb" d="' + band('turb') + '"/><path class="bd calm" d="' + band('calm') + '"/>' +
        '<path class="mn turb" d="' + line('turb') + '"/><path class="mn calm" d="' + line('calm') + '"/></g>' +
        '<line class="guide" y1="' + Y0 + '" y2="' + Y1 + '" x1="-9" x2="-9"/></svg>';
      box.appendChild(cell);
      var svg = cell.querySelector('svg'), guide = cell.querySelector('.guide');
      svg.addEventListener('pointermove', function (e) {
        var r = svg.getBoundingClientRect(), vx = (e.clientX - r.left) / r.width * 200;
        var pct = Math.max(0, Math.min(100, (vx - X0) / (X1 - X0) * 100)), j = Math.round(pct / 100 * (F.x.length - 1));
        guide.setAttribute('x1', xs(F.x[j])); guide.setAttribute('x2', xs(F.x[j]));
        showTip('<b>' + P.label + '</b> at ' + Math.round(F.x[j]) + '% of the episode<br>Calm: ' + fmt(P.calm.mu[j]) + ' ± ' + fmt(P.calm.sd[j]) + ' ' + P.unit +
          '<br>Turbulent: ' + fmt(P.turb.mu[j]) + ' ± ' + fmt(P.turb.sd[j]) + ' ' + P.unit +
          '<br>Typical turbulent episode moves ×' + P.ratio.toFixed(2), e.clientX, e.clientY);
      });
      svg.addEventListener('pointerleave', function () { guide.setAttribute('x1', -9); guide.setAttribute('x2', -9); hideTip(); });
    });
    var fig = $('#fig5');
    onReveal.push(function (e) { if (e === fig) box.classList.add('in'); });
    if (!hasIO || reduce) box.classList.add('in');
  })();

  /* ---------- Fig. 6 rebuilt: assembles when scrolled into view ---------- */
  (function () {
    var arch = $('.arch'); if (!arch) return;
    if (hasIO && !reduce) {
      var ao = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { arch.classList.add('in'); ao.disconnect(); } });
      }, { threshold: 0.25 });
      ao.observe(arch);
    } else arch.classList.add('in');
  })();

  /* ---------- observation-space builder: blocks on/off -> matching Table I model ---------- */
  // blocks: 1 attitude, 2 IMU, 3 thruster PWM, 4 raw Δ, 5 Δ tokens. Only combinations that were trained are reachable:
  // IMU needs attitude, PWM needs IMU, Δ needs attitude, and raw Δ / Δ tokens are one or the other.
  var ob = { 1: true, 2: false, 3: false, 4: false, 5: false }, win = '4.0', lastB = 1;
  var obBtns = $$('.obs-levels button[data-b]'), winBox = $('.obs-win'), winBtns = $$('.obs-win button');
  var DIMS = { 1: 3, 2: 10, 3: 6, 4: 3 };
  function pickModel() {
    if (!ob[1]) return 1;
    if (!ob[2]) return ob[4] ? 8 : ob[5] ? { '1.2': 4, '2.0': 5, '4.0': 6, '6.0': 7 }[win] : 3;
    if (!ob[3]) return ob[4] ? 11 : ob[5] ? 10 : 9;
    return ob[4] ? 14 : ob[5] ? 13 : 12;
  }
  function toggle(bn) {
    var on = !ob[bn];
    ob[bn] = on;
    if (on) {
      if (bn >= 2) ob[1] = true;
      if (bn === 3) ob[2] = true;
      if (bn === 4) ob[5] = false;
      if (bn === 5) ob[4] = false;
    } else {
      if (bn === 1) { ob[2] = ob[3] = ob[4] = ob[5] = false; }
      if (bn === 2) ob[3] = false;
    }
    lastB = on ? bn : 0;
    renderObs();
  }
  function renderObs() {
    obBtns.forEach(function (b) { b.setAttribute('aria-pressed', ob[+b.getAttribute('data-b')] ? 'true' : 'false'); });
    $$('.obs-chips span').forEach(function (sp, i) {
      var on = !!ob[+sp.getAttribute('data-l')];
      setTimeout(function () { sp.classList.toggle('on', on); }, reduce ? 0 : (on ? Math.min(i, 40) * 15 : 0));
    });
    var shown = lastB && ob[lastB] ? lastB : ([5, 4, 3, 2, 1].filter(function (k) { return ob[k]; })[0] || 0);
    $$('.obs-desc').forEach(function (pp) { pp.hidden = +pp.getAttribute('data-l') !== shown; });
    $$('.arch .state span').forEach(function (sp) { sp.classList.toggle('on', !!ob[+sp.getAttribute('data-l')]); });
    winBox.hidden = !(ob[5] && !ob[2]);
    winBtns.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-w') === win ? 'true' : 'false'); });
    var n = pickModel(), d = T1.filter(function (r) { return r.n === n; })[0];
    var dim = [1, 2, 3, 4].reduce(function (t, k) { return t + (ob[k] ? DIMS[k] : 0); }, 0);
    $('.obs-model').innerHTML = '<span class="obs-dims">' + dim + ' dims' + (ob[5] ? ' + 39 Δ tokens' : '') + '</span>' +
      'This is <a href="#t1-row-' + n + '" class="obs-go">model #' + n + ' in Table I</a>: <b>' + d.obs + (n === 1 ? ' (baseline)' : '') + '</b>, ' +
      fmt(d.allp) + '% overall success incl. partial, ' + fmt(d.lat) + ' ms latency.' +
      (n === 3 ? ' <span class="obs-note">Model #2 uses the same inputs but was trained on calm-water episodes only.</span>' : '');
    $$('#chart-pool .bar-row').forEach(function (tr) { tr.classList.toggle('pick', tr.id === 't1-row-' + n); });
  }
  obBtns.forEach(function (b) { b.addEventListener('click', function () { toggle(+b.getAttribute('data-b')); }); });
  winBtns.forEach(function (b) { b.addEventListener('click', function () { win = b.getAttribute('data-w'); renderObs(); }); });
  document.addEventListener('click', function (e) {
    var go = e.target.closest && e.target.closest('.obs-go'); if (!go) return;
    e.preventDefault();
    var tr = document.getElementById(go.getAttribute('href').slice(1)); if (!tr) return;
    tr.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    tr.classList.remove('flash'); void tr.offsetWidth; tr.classList.add('flash');
  });
  setTimeout(renderObs, 0);   // after Table I has been built below

  /* ---------- Table I: bar chart ---------- */
  var chart = $('#chart-pool'), barsBox = $('.bars', chart), sortBox = $('.sort input', chart), metric = 'allp';
  var ROW_H = 30, rows = {};
  T1.forEach(function (d) {
    var r = el('div', 'bar-row' + (d.n === 1 ? ' base' : ''));
    r.innerHTML = '<span class="lab"><i>#' + d.n + '</i>' + d.obs + (d.n === 1 ? ' †' : '') + '</span><span class="track"><span class="fill"></span><span class="err"></span><span class="val"></span></span>';
    r.setAttribute('data-tip', '');
    r.id = 't1-row-' + d.n;
    barsBox.appendChild(r); rows[d.n] = r;
  });
  var ref = el('div', 'refline'); barsBox.appendChild(ref);
  var note = el('p', 'axisnote'); chart.insertBefore(note, chart.querySelector('.pp-legend'));
  var shown = false;
  function tipFor(d) {
    return '<b>#' + d.n + ' · ' + d.obs + '</b><br>Obs. dims: ' + d.dim +
      '<br>Grab: ' + fmt(d.grab) + '% (' + fmt(d.grabp) + '% incl. partial; ' + d.succ + ' succ., ' + d.part + ' part.)' +
      '<br>Moor on Post: ' + fmt(d.moor) + '% · Remove Ring: ' + fmt(d.ring) + '%' +
      '<br>Overall: ' + fmt(d.all) + '% (' + fmt(d.allp) + '% incl. partial)' +
      '<br>Latency: ' + fmt(d.lat) + ' ± ' + fmt(d.sd) + ' ms';
  }
  function drawBars() {
    var m = METRICS[metric], b = BASE[metric];
    var order = T1.slice();
    if (sortBox.checked) order.sort(function (x, y) { return m.low ? x[metric] - y[metric] : y[metric] - x[metric]; });
    var best = order.slice().sort(function (x, y) { return m.low ? x[metric] - y[metric] : y[metric] - x[metric]; })[0];
    barsBox.style.height = T1.length * ROW_H + 'px';
    order.forEach(function (d, i) {
      var r = rows[d.n], v = d[metric], pct = Math.min(100, v / m.max * 100);
      var beats = m.low ? v < b : v > b;
      r.style.top = i * ROW_H + 'px';
      r.classList.toggle('worse', d.n !== 1 && !beats);
      r.classList.toggle('top', d === best);
      r.setAttribute('data-tip', tipFor(d));
      var fill = $('.fill', r), val = $('.val', r), err = $('.err', r);
      fill.style.width = shown ? pct + '%' : '0';
      val.style.left = shown ? (m.low ? Math.min(100, (v + d.sd) / m.max * 100) : pct) + '%' : '0';
      val.textContent = fmt(v) + m.unit + (m.low ? '' : '') + (d.n !== 1 && beats ? '  ▲' : '');
      if (m.low && shown) { err.style.display = ''; err.style.left = (v - d.sd) / m.max * 100 + '%'; err.style.width = 2 * d.sd / m.max * 100 + '%'; }
      else err.style.display = 'none';
    });
    var t = $('.track', rows[1]);
    ref.style.left = (t.offsetLeft + t.offsetWidth * (shown ? b / m.max : 0)) + 'px';
    note.textContent = m.label + ' · dashed line = baseline (' + fmt(b) + m.unit.trim() + ') · ▲ = better than baseline';
  }
  $$('.seg button', chart).forEach(function (btn) {
    btn.addEventListener('click', function () {
      metric = btn.getAttribute('data-m');
      $$('.seg button', chart).forEach(function (o) { o.setAttribute('aria-checked', o === btn ? 'true' : 'false'); });
      drawBars();
    });
  });
  sortBox.addEventListener('change', drawBars);
  addEventListener('resize', drawBars);
  onReveal.push(function (e) { if (e === chart) { shown = true; drawBars(); } });
  drawBars();
  if (!hasIO || reduce) { shown = true; drawBars(); }


  /* ---------- Fig. 7: models ranked by time to completion (log x), rows fade in ---------- */
  (function () {
    var box = $('#fig7 .f7'); if (!box) return;
    // paper #, median, CI low, CI high, every successful rollout (s)
    var F7 = [[12,6.92,5.5,7.38,[4.02,4.42,4.46,4.52,4.58,4.66,4.82,4.96,5.0,5.12,5.26,5.36,5.4,5.4,5.46,5.48,5.5,5.72,5.86,5.86,6.24,6.54,6.92,6.96,7.24,7.26,7.34,7.38,7.38,7.4,7.42,7.44,7.72,7.96,8.4,8.62,8.8,13.12,13.88,15.74,23.8,33.6,34.38,43.06,46.5]],[13,7.19,7.0,9.06,[5.06,5.18,5.44,5.62,5.74,6.08,6.1,6.18,6.18,6.2,6.22,6.26,6.38,6.52,6.78,6.8,6.82,6.96,6.96,7.0,7.04,7.08,7.1,7.1,7.12,7.16,7.22,7.28,7.36,7.46,7.76,8.12,8.6,9.18,9.52,9.78,10.02,10.66,11.2,11.6,12.08,13.06,16.26,16.62,16.78,16.92,17.92,18.78,19.1,38.48,38.86,39.32]],[3,7.3,6.76,8.02,[3.78,3.84,3.9,3.94,4.1,4.28,4.4,4.46,4.82,5.06,5.3,5.38,5.58,5.58,5.6,5.74,5.94,6.08,6.08,6.4,6.5,6.58,6.7,6.7,6.76,6.78,6.88,6.92,6.96,7.02,7.14,7.14,7.3,7.42,7.44,7.46,7.68,7.74,8.0,8.0,8.02,8.04,8.1,8.38,8.42,8.42,8.46,10.9,11.98,12.0,12.06,12.74,13.72,16.98,19.2,19.56,21.5,23.76,24.52,28.88,30.3,35.92,37.5,45.92,46.38]],[14,7.98,7.3,8.98,[4.66,4.88,5.18,5.38,5.38,5.64,5.82,6.44,6.62,6.84,6.92,6.94,7.04,7.04,7.16,7.26,7.3,7.36,7.46,7.54,7.58,7.82,7.86,7.98,8.18,8.24,8.38,8.4,8.7,8.98,9.56,9.74,10.42,12.56,13.02,14.36,14.7,16.0,16.42,16.48,16.84,21.74,24.28,24.48,25.06,29.14,56.7]],[2,9.6,7.8,14.4,[4.06,4.54,4.64,4.92,5.16,5.2,5.24,6.64,6.66,6.8,7.12,7.14,7.2,7.22,7.26,7.38,7.42,7.5,7.8,7.88,8.42,8.64,8.76,8.86,8.88,10.32,11.22,11.4,11.66,12.78,13.64,14.4,14.48,14.76,14.86,14.96,17.84,18.02,18.18,18.9,19.72,20.54,21.46,22.28,23.2,24.18,27.5,37.9,77.7,133.44]],[9,9.85,8.91,11.52,[4.5,4.56,4.9,5.28,5.36,5.44,5.62,6.22,6.52,6.94,7.0,7.24,7.46,7.92,8.02,8.2,8.56,8.68,8.76,9.06,9.08,9.24,9.3,9.72,9.72,9.74,9.96,10.28,10.76,10.88,11.22,11.42,11.46,11.58,11.7,11.96,12.62,12.68,12.68,13.18,13.96,14.08,14.12,14.24,14.36,15.06,18.6,25.92,31.26,33.72,34.26,39.3]],[5,10.34,7.62,15.8,[4.6,5.42,5.68,6.1,6.26,6.26,6.48,6.56,6.66,7.02,7.02,7.04,7.06,7.14,7.3,7.38,7.56,7.62,8.14,8.16,8.24,9.04,9.54,9.82,10.34,10.64,10.84,11.86,11.96,13.12,14.9,15.8,15.96,16.14,17.06,17.12,17.74,19.86,20.04,21.16,22.56,23.36,23.6,24.38,29.78,29.84,36.8,42.66,79.58]],[10,10.39,7.68,15.14,[4.88,5.24,5.24,5.56,5.8,6.02,6.04,6.12,6.16,6.36,6.64,6.72,6.86,7.5,7.52,7.52,7.68,7.76,8.22,8.84,9.06,9.12,9.98,10.8,11.08,11.36,12.12,12.6,14.28,15.84,16.0,17.46,19.08,19.68,20.26,21.26,21.34,22.34,23.08,24.88,25.72,28.6,29.34,36.66,43.54,115.06]],[8,12.28,10.62,20.3,[3.86,4.54,6.76,6.84,7.22,7.32,7.32,7.56,7.76,7.98,8.5,8.72,9.62,10.08,10.1,10.62,10.78,11.16,11.38,11.8,12.28,12.28,13.92,15.06,15.12,19.38,19.46,20.3,20.56,21.5,22.38,24.76,25.74,28.52,28.76,31.0,31.46,39.48,45.68,47.52,56.52,71.84,74.24]],[6,12.66,9.06,15.22,[4.52,4.86,5.08,5.72,6.32,6.4,6.76,6.9,7.14,7.16,7.2,7.34,7.46,7.66,7.86,8.24,8.74,9.06,10.02,10.28,10.96,11.46,11.54,12.16,12.66,12.98,13.02,14.42,15.1,15.2,15.2,15.22,15.26,15.96,16.08,16.18,16.22,16.34,16.92,17.0,17.28,17.36,17.72,19.28,19.4,19.88,19.92,30.24,46.32]],[4,13.2,10.54,14.38,[4.26,4.64,5.2,5.3,5.9,6.0,6.1,6.1,6.34,6.62,6.7,7.52,7.7,10.32,10.54,11.2,11.36,11.38,12.02,12.06,13.2,13.3,13.46,13.86,13.88,13.98,14.38,14.56,14.62,15.2,15.44,16.48,16.68,16.9,17.46,18.58,19.0,22.16,25.94,36.44,57.2]],[7,13.23,10.37,17.38,[4.88,5.42,6.06,6.66,7.68,8.06,8.72,8.94,9.46,9.58,11.16,11.56,11.76,12.82,12.96,13.5,13.86,14.84,15.62,16.06,18.7,19.02,19.02,19.32,19.6,21.28,22.04,23.04,35.16,55.02]],[11,13.92,7.78,18.48,[5.26,5.7,6.26,6.3,6.32,6.54,6.78,7.04,7.12,7.16,7.42,7.5,7.56,7.74,7.78,7.92,8.62,8.96,9.8,13.5,13.92,14.96,15.0,16.96,17.3,18.24,18.48,19.74,20.02,22.26,22.68,25.54,27.38,31.54,32.9,33.84,34.76,42.04,42.16,81.12,177.58]],[1,16.05,13.68,20.0,[5.32,5.68,5.86,6.22,6.32,6.86,7.76,7.9,8.38,10.2,10.4,12.2,12.92,13.48,13.68,13.96,14.14,15.46,15.54,15.9,15.96,16.14,17.36,17.72,17.8,19.02,19.28,20.72,22.24,22.44,24.06,27.24,27.64,31.68,32.4,36.5,39.78,49.88,52.12,58.04,60.3,112.24]]];
    var L0 = Math.log(3.5), L1 = Math.log(200), X = function (v) { return (Math.log(v) - L0) / (L1 - L0) * 100; };
    var TICKS = [5, 10, 20, 50, 100, 200], name = {};
    T1.forEach(function (d) { name[d.n] = d.obs; });
    var grid = TICKS.map(function (t) { return '<i class="g" style="left:' + X(t).toFixed(2) + '%"></i>'; }).join('');
    F7.forEach(function (r, i) {
      var base = r[0] === 1, seed = r[0] * 9301;
      var rnd = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      var dots = r[4].map(function (v, k) {
        return '<i class="d" style="left:' + X(v).toFixed(2) + '%;top:' + (22 + rnd() * 56).toFixed(1) + '%;transition-delay:' + (i * 70 + 300 + k * 6) + 'ms"></i>';
      }).join('');
      var row = el('div', 'f7-row' + (base ? ' base' : '') + (i === 0 ? ' top' : ''));
      row.style.setProperty('--i', i);
      row.setAttribute('data-tip', '<b>#' + r[0] + ' · ' + name[r[0]] + '</b><br>Median ' + fmt(r[1]) + ' s (95% CI ' + fmt(r[2]) + '–' + fmt(r[3]) + ' s)<br>' + r[4].length + ' successful rollouts');
      row.innerHTML = '<span class="lab">' + name[r[0]] + (base ? '<sup>†</sup>' : '') + '</span><span class="med">' + (Math.round(r[1] * 10 + 1e-6) / 10).toFixed(1) + ' s</span>' +
        '<span class="plot">' + grid + dots + '<i class="ci" style="left:' + X(r[2]).toFixed(2) + '%;width:' + (X(r[3]) - X(r[2])).toFixed(2) + '%"></i><i class="dia" style="left:' + X(r[1]).toFixed(2) + '%"></i></span>';
      box.appendChild(row);
    });
    var ax = el('div', 'f7-axis', '<span></span><span></span><span class="plot">' + TICKS.map(function (t) { return '<b style="left:' + X(t).toFixed(2) + '%">' + t + '</b>'; }).join('') + '<em>time to completion (s)</em></span>');
    box.appendChild(ax);
  })();

  /* ---------- Fig. 8: colour confusion per model, cells fill in ---------- */
  (function () {
    var box = $('#fig8 .f8'); if (!box) return;
    // per model #1..#14: rows asked green/red/white, columns grabbed green/red/white/none
    var CM = [[1,4,1,4,3,4,1,2,2,1,3,4],[0,2,1,7,1,3,1,5,0,3,1,6],[2,8,0,0,1,5,3,1,4,3,3,0],[2,2,2,4,1,4,4,1,2,3,2,3],[2,1,1,6,0,2,3,5,2,1,2,5],[1,3,4,2,2,5,2,1,4,1,5,0],[0,5,1,4,2,2,4,2,3,3,3,1],[4,3,1,2,3,3,3,1,1,4,2,3],[6,1,1,2,4,1,2,3,2,2,3,3],[2,2,3,3,0,6,1,3,2,1,4,3],[4,2,1,3,2,3,0,5,5,3,2,0],[4,1,2,3,0,4,2,4,3,1,3,3],[2,4,2,2,3,3,1,3,6,0,4,0],[4,3,2,1,3,2,1,4,2,4,4,0]];
    var VIR = [[68,1,84],[72,40,120],[62,74,137],[49,104,142],[38,130,142],[31,158,137],[53,183,121],[109,205,89],[180,222,44],[253,231,37]];
    function vir(v) {
      var t = Math.max(0, Math.min(1, v / 8)) * (VIR.length - 1), a = Math.floor(t), b = Math.min(VIR.length - 1, a + 1), f = t - a;
      return 'rgb(' + [0, 1, 2].map(function (k) { return Math.round(VIR[a][k] + (VIR[b][k] - VIR[a][k]) * f); }).join(',') + ')';
    }
    var ROW = ['G', 'R', 'W'], COL = ['G', 'R', 'W', 'none'], FULL = { G: 'green', R: 'red', W: 'white', none: 'none' };
    T1.forEach(function (d, m) {
      var card = el('div', 'f8-card'); card.style.setProperty('--m', m);
      var h = '<p class="f8-t">' + d.obs + (d.n === 1 ? '<sup>†</sup>' : '') + '</p><div class="f8-m"><span></span>' + COL.map(function (c) { return '<span class="ch">' + c + '</span>'; }).join('');
      ROW.forEach(function (rn, ri) {
        h += '<span class="rh">' + rn + '</span>';
        COL.forEach(function (cn, ci) {
          var v = CM[m][ri * 4 + ci];
          h += '<span class="c' + (ri === ci ? ' diag' : '') + '" style="background:' + vir(v) + ';--k:' + (ri * 4 + ci) + '" data-tip="<b>' + d.obs.replace(/"/g, '&quot;') + '</b><br>asked ' + FULL[rn] + ', grabbed ' + FULL[cn] + ': ' + v + ' of 10"></span>';
        });
      });
      card.innerHTML = h + '</div>';
      box.appendChild(card);
    });
    var bar = $('#fig8 .f8-bar');
    if (bar) bar.style.background = 'linear-gradient(90deg,' + [0, 1, 2, 3, 4, 5, 6, 7, 8].map(function (v) { return vir(v); }).join(',') + ')';
  })();

  /* ---------- Table II as a bar chart (pooled across sites, then by task and location) ---------- */
  (function () {
    var box = $('#chart-t2 .t2'); if (!box) return;
    function pool(rows) { var n = 0, k = 0; rows.forEach(function (r) { n += r[3]; k += Math.round(r[4] * r[3] / 100); }); return [null, 100 * k / n, null, null]; }
    function pick(f) { return T2.filter(f); }
    var isAct = function (r) { return r[2] === 'ACT'; }, isGrab = function (r) { return /^Grab/.test(r[0]); };
    var groups = [
      ['Pooled across sites', [
        ['All tasks', pool(pick(isAct)), pool(pick(function (r) { return !isAct(r); }))],
        ['Grab', pool(pick(function (r) { return isAct(r) && isGrab(r); })), pool(pick(function (r) { return !isAct(r) && isGrab(r); }))],
        ['Moor', pool(pick(function (r) { return isAct(r) && !isGrab(r); })), pool(pick(function (r) { return !isAct(r) && !isGrab(r); }))]
      ]],
      ['By task and location', []]
    ];
    T2.forEach(function (r) {
      var key = r[0] + ' · ' + r[1], g = groups[1][1].filter(function (x) { return x[0] === key; })[0];
      if (!g) { g = [key, null, null]; groups[1][1].push(g); }
      g[isAct(r) ? 1 : 2] = [r[3], r[4], r[5], r[6]];
    });
    var i = 0;
    groups.forEach(function (G) {
      box.appendChild(el('p', 't2-sec', G[0]));
      G[1].forEach(function (g) {
        var grp = el('div', 'grp'); grp.appendChild(el('b', '', g[0]));
        [['ACT', 'act', g[1]], ['SmolVLA', 'smol', g[2]]].forEach(function (p) {
          if (!p[2]) return;
          var v = p[2], row = el('div', 'row'), ci = v[2] != null;   // pooled rows: rate only, as in the paper
          row.innerHTML = '<span>' + p[0] + '</span><div class="track">' + (ci ? '<i class="w" style="left:' + v[2].toFixed(1) + '%;width:' + (v[3] - v[2]).toFixed(1) + '%"></i>' : '') +
            '<div class="fill ' + p[1] + '" data-w="' + v[1] + '" style="transition-delay:' + (i * 60) + 'ms"></div><div class="num" data-at="' + (ci ? Math.max(v[1], v[3]) : v[1]).toFixed(1) + '" style="transition-delay:' + (i * 60) + 'ms">' + fmt(v[1]) + '%' + (ci ? ' <small>n = ' + v[0] + '</small>' : '') + '</div></div>';
          row.querySelector('.track').setAttribute('data-tip', '<b>' + p[0] + ' · ' + g[0] + '</b><br>' + fmt(v[1]) + '% success' + (ci ? ' (n = ' + v[0] + ')<br>95% CI: ' + fmt(v[2]) + '–' + fmt(v[3]) + '%' : ''));
          grp.appendChild(row); i++;
        });
        box.appendChild(grp);
      });
    });
    function go() { $$('#chart-t2 .fill').forEach(function (f) { f.style.width = f.getAttribute('data-w') + '%'; var n = f.nextElementSibling; n.style.left = n.getAttribute('data-at') + '%'; }); $('#chart-t2').classList.add('go'); }
    onReveal.push(function (e) { if (e.id === 'chart-t2') go(); });
    if (!hasIO || reduce) go();
  })();

  /* ---------- day vs night bars ---------- */
  (function () {
    var box = $('#chart-night .dn'); if (!box) return;
    NIGHT.forEach(function (d, gi) {
      var grp = el('div', 'grp'); grp.appendChild(el('b', '', d[0]));
      [['Day', 'day', d[1], d[2]], ['Night', 'night', d[3], d[4]]].forEach(function (p, k) {
        var row = el('div', 'row');
        row.innerHTML = '<span>' + p[0] + '</span><div class="track"><div class="fill ' + p[1] + '" data-w="' + p[2] + '" style="transition-delay:' + ((gi * 2 + k) * 90) + 'ms"></div><div class="num" style="transition-delay:' + ((gi * 2 + k) * 90) + 'ms">' + fmt(p[2]) + '% <small>n = ' + p[3] + '</small></div></div>';
        row.querySelector('.track').setAttribute('data-tip', '<b>' + d[0] + ' · ' + p[0] + '</b><br>' + fmt(p[2]) + '% success (n = ' + p[3] + ')');
        grp.appendChild(row);
      });
      box.appendChild(grp);
    });
    function go() { $$('#chart-night .fill').forEach(function (f) { var w = f.getAttribute('data-w') + '%'; f.style.width = w; f.nextElementSibling.style.left = w; }); }
    onReveal.push(function (e) { if (e.id === 'chart-night') go(); });
    if (!hasIO || reduce) go();
  })();

  /* ---------- citations: hover shows the reference, click jumps to it ---------- */
  var refs = $('#refs');
  $$('a.cite').forEach(function (a) {
    var li = document.getElementById(a.getAttribute('href').slice(1));
    if (li) a.setAttribute('data-tip', a.textContent + ' ' + li.innerHTML);
    a.addEventListener('click', function (e) {
      if (!li) return;
      e.preventDefault(); hideTip();
      refs.open = true;
      li.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
      li.classList.add('flash'); setTimeout(function () { li.classList.remove('flash'); }, 1800);
    });
  });

  /* ---------- copy BibTeX ---------- */
  var copyBtn = $('.pp-bib .copy');
  if (copyBtn) copyBtn.addEventListener('click', function () {
    var txt = $('.pp-bib code').textContent;
    var done = function () { copyBtn.textContent = 'Copied ✓'; setTimeout(function () { copyBtn.textContent = 'Copy BibTeX'; }, 1600); };
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, function () {});
    else { var r = document.createRange(); r.selectNodeContents($('.pp-bib code')); var sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); document.execCommand('copy'); done(); }
  });

  /* ---------- figure lightbox ---------- */
  var lb = $('.pp-lightbox'), lbImg = $('img', lb), lbCap = $('p', lb);
  function closeLb() { lb.hidden = true; document.body.style.overflow = ''; }
  $$('img.zoomable').forEach(function (img) {
    img.tabIndex = 0;
    var open = function () {
      lbImg.src = img.currentSrc || img.src || img.getAttribute('data-src'); lbImg.alt = img.alt;
      var cap = img.parentElement.querySelector('figcaption'); lbCap.innerHTML = cap ? cap.innerHTML : '';
      lb.hidden = false; document.body.style.overflow = 'hidden'; $('button', lb).focus();
    };
    img.addEventListener('click', open);
    img.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
  lb.addEventListener('click', closeLb);
  addEventListener('keydown', function (e) { if (e.key === 'Escape' && !lb.hidden) closeLb(); });
})();

/* Fig. 6: lay the diagram out at the width it used to have (up to 1400px, the full window),
   then scale the whole thing down to fit the text column, so the arrangement stays the same. */
(function () {
  var fig = document.getElementById('fig6'), arch = fig && fig.querySelector('.arch');
  if (!arch) return;
  function fit() {
    arch.style.zoom = ''; arch.style.width = '';
    var col = fig.clientWidth, base = Math.min(1400, window.innerWidth - 32);
    if (window.innerWidth <= 760 || base <= col) return;   // phones keep their stacked layout
    arch.style.width = base + 'px';
    arch.style.zoom = (col / base).toFixed(4);
  }
  fit();
  addEventListener('resize', fit);
})();
