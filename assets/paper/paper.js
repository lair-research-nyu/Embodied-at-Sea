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
    moor: { label: 'Moor on Post (%)', max: 100, unit: '%' },
    ring: { label: 'Remove Ring (%)', max: 100, unit: '%' },
    lat: { label: 'Latency per 20-step action chunk (ms) — lower is better', max: 145, unit: ' ms', low: true }
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

  /* ---------- Fig. 3 rebuilt: donut draws itself ---------- */
  (function () {
    var fig = $('#fig3'); if (!fig) return;
    var svg = $('svg.donut', fig), defs = $('defs', svg), g = $('.segs', svg), ns = 'http://www.w3.org/2000/svg';
    var K = { green: ['Green rod', '#3E9B4F', '#1E5A2A'], red: ['Red rod', '#C8322F', '#6E1412'], white: ['White rod', '#F4F4F2', '#8A9BA3'],
              moor: ['Moor on post', '#7FB8D6', '#1D5F82'], ring: ['Unhook ring', '#F3D36B', '#8A6D0B'] };
    var D = [['green', 101, 161], ['red', 101, 153], ['white', 102, 151], ['moor', 125, 301], ['ring', 100, 321]];
    var TOT = 1616, GAP = 5, R = 90, segs = [], at = 0;
    function mk(tag, attrs, parent) { var e = document.createElementNS(ns, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); (parent || g).appendChild(e); return e; }
    D.forEach(function (d) {
      var k = d[0], c = K[k];
      var pat = mk('pattern', { id: 'h-' + k, patternUnits: 'userSpaceOnUse', width: 6, height: 6, patternTransform: 'rotate(45 120 120)' }, defs);
      mk('rect', { width: 6, height: 6, fill: c[1] }, pat); mk('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: c[2], 'stroke-width': 1.6 }, pat);
      [['control', d[1], c[1]], ['turbulent', d[2], 'url(#h-' + k + ')']].forEach(function (p) {
        var len = p[1], start = at; at += len;
        var circ = mk('circle', { cx: 120, cy: 120, r: R, pathLength: TOT, class: 'seg', stroke: p[2], 'stroke-dasharray': '0 ' + TOT, 'stroke-dashoffset': -start });
        circ.setAttribute('data-k', k);
        circ.setAttribute('data-tip', '<b>' + c[0] + ' · ' + p[0] + '</b><br>' + len + ' episodes');
        var edges = [];
        if (k === 'white') [R - 23, R + 23].forEach(function (rr) {
          edges.push(mk('circle', { cx: 120, cy: 120, r: rr, pathLength: TOT, fill: 'none', stroke: '#9AA5AB', 'stroke-width': .8, 'stroke-dasharray': '0 ' + TOT, 'stroke-dashoffset': -start, style: 'transition: stroke-dasharray .7s cubic-bezier(.3,.6,.2,1); pointer-events:none' }));
        });
        segs.push({ el: circ, edges: edges, len: len, k: k });
      });
    });
    var ctr = $('.ctr-n', svg), lgs = $$('.donut-legend .lg', fig);
    function draw() {
      var t = reduce ? 0 : 180, sum = 0;
      segs.forEach(function (s, i) {
        setTimeout(function () {
          var dash = (s.len - GAP) + ' ' + (TOT - s.len + GAP);
          s.el.setAttribute('stroke-dasharray', dash); s.el.style.strokeDasharray = dash;
          s.edges.forEach(function (e) { e.setAttribute('stroke-dasharray', dash); e.style.strokeDasharray = dash; });
          sum += s.len; ctr.textContent = sum;
          var lg = fig.querySelector('.lg[data-k="' + s.k + '"]'); if (lg) lg.classList.add('on');
        }, i * t);
      });
      setTimeout(function () { lgs.forEach(function (l) { l.classList.add('on'); }); ctr.textContent = TOT; }, segs.length * t);
    }
    onReveal.push(function (e) { if (e === fig) draw(); });
    if (!hasIO || reduce) draw();
    function hl(k) { segs.forEach(function (s) { s.el.classList.toggle('dim', !!k && s.k !== k); s.el.classList.toggle('hi', s.k === k); }); }
    $$('.lg[data-k]', fig).forEach(function (l) {
      l.addEventListener('mouseenter', function () { hl(l.getAttribute('data-k')); });
      l.addEventListener('mouseleave', function () { hl(null); });
    });
    segs.forEach(function (s) {
      s.el.addEventListener('mouseenter', function () { hl(s.k); });
      s.el.addEventListener('mouseleave', function () { hl(null); });
    });
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

  /* ---------- observation-space builder ---------- */
  var lv = $$('.obs-levels button');
  function setLevel(l) {
    lv.forEach(function (b) { b.setAttribute('aria-checked', +b.getAttribute('data-level') === l ? 'true' : 'false'); });
    $$('.obs-chips span').forEach(function (s, i) {
      var on = +s.getAttribute('data-l') <= l;
      setTimeout(function () { s.classList.toggle('on', on); }, reduce ? 0 : (on ? i * 25 : 0));
    });
    $$('.obs-desc').forEach(function (p) { p.hidden = +p.getAttribute('data-l') !== l; });
    $$('.arch .state span').forEach(function (s) { s.classList.toggle('on', +s.getAttribute('data-l') <= l); });
  }
  lv.forEach(function (b) { b.addEventListener('click', function () { setLevel(+b.getAttribute('data-level')); }); });
  setLevel(1);

  /* ---------- Table I: bar chart ---------- */
  var chart = $('#chart-pool'), barsBox = $('.bars', chart), sortBox = $('.sort input', chart), metric = 'allp';
  var ROW_H = 30, rows = {};
  T1.forEach(function (d) {
    var r = el('div', 'bar-row' + (d.n === 1 ? ' base' : ''));
    r.innerHTML = '<span class="lab"><i>#' + d.n + '</i>' + d.obs + (d.n === 1 ? ' †' : '') + '</span><span class="track"><span class="fill"></span><span class="err"></span><span class="val"></span></span>';
    r.setAttribute('data-tip', '');
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

  /* ---------- Table I: full table ---------- */
  (function () {
    var t = $('#table-1');
    var head = '<thead><tr><th class="sticky"></th><th></th><th></th><th colspan="4">Grab the rod</th><th>Moor on Post</th><th>Remove Ring</th><th colspan="2">Overall</th><th>Latency</th></tr>' +
      '<tr><th class="sticky">#</th><th class="l">Observation Space</th><th>Obs.<br>Dim.</th><th>succ.</th><th>part.</th><th>%</th><th>%<br>w/ part.</th><th>%</th><th>%</th><th>%</th><th>%<br>w/ part.</th><th>(ms)</th></tr></thead>';
    var body = T1.map(function (d) {
      var boldAll = d.n !== 1 && d.allp > BASE.allp, boldLat = d.n !== 1 && d.lat < BASE.lat;
      return '<tr' + (d.n === 3 ? ' class="shade"' : '') + '><td class="sticky">#' + d.n + '</td><td class="l">' + d.obs + (d.n === 1 ? '<sup>†</sup>' : '') + '</td><td>' + d.dim + '</td><td>' + d.succ + '</td><td>' + d.part +
        '</td><td>' + fmt(d.grab) + '</td><td>' + fmt(d.grabp) + '</td><td>' + fmt(d.moor) + '</td><td>' + fmt(d.ring) + '</td><td>' + fmt(d.all) +
        '</td><td>' + (boldAll ? '<b>' + fmt(d.allp) + '</b>' : fmt(d.allp)) + '</td><td>' + (boldLat ? '<b>' + fmt(d.lat) + ' ± ' + fmt(d.sd) + '</b>' : fmt(d.lat) + ' ± ' + fmt(d.sd)) + '</td></tr>';
    }).join('');
    t.insertAdjacentHTML('beforeend', head + '<tbody>' + body + '</tbody>');
  })();

  /* ---------- ACT vs SmolVLA ---------- */
  (function () {
    var box = $('#chart-vs .vs');
    VS.forEach(function (g) {
      var grp = el('div', 'grp'); grp.appendChild(el('b', '', g[0]));
      [['ACT', 'act', g[1]], ['SmolVLA', 'smol', g[2]]].forEach(function (p) {
        var row = el('div', 'row', '<span>' + p[0] + '</span><div class="track"><div class="fill ' + p[1] + '" data-w="' + p[2] + '"></div><div class="num">' + fmt(p[2]) + '%</div></div>');
        row.querySelector('.track').setAttribute('data-tip', '<b>' + p[0] + '</b> · ' + g[0] + ': ' + fmt(p[2]) + '% success');
        grp.appendChild(row);
      });
      box.appendChild(grp);
    });
    function go() { $$('#chart-vs .fill').forEach(function (f) { var w = f.getAttribute('data-w') + '%'; f.style.width = w; f.nextElementSibling.style.left = w; }); }
    onReveal.push(function (e) { if (e.id === 'chart-vs') go(); });
    if (!hasIO || reduce) go();
  })();

  /* ---------- Table II with SR bars + 95% CI ---------- */
  (function () {
    var t = $('#table-2');
    var rowsHtml = T2.map(function (r) {
      var c = r[2] === 'ACT' ? 'act' : 'smol', col = r[2] === 'ACT' ? 'var(--act)' : 'var(--smol)';
      var tipTxt = '<b>' + r[0] + ' · ' + r[1] + '</b><br>' + r[2] + ': ' + fmt(r[4]) + '% success (n = ' + r[3] + ')<br>95% CI: ' + fmt(r[5]) + '–' + fmt(r[6]) + '%';
      return '<tr' + (r[7] ? ' class="shade"' : '') + '><td class="l">' + r[0] + '</td><td class="l">' + r[1] + '</td><td class="l"><span class="pol" style="--c:' + col + '">' + r[2] + '</span></td><td>' + r[3] +
        '</td><td>' + (r[8] ? '<b>' + fmt(r[4]) + '</b>' : fmt(r[4])) + '</td><td>[' + fmt(r[5]) + ', ' + fmt(r[6]) + ']</td>' +
        '<td class="l"><span class="ci" data-tip="' + tipTxt.replace(/"/g, '&quot;') + '"><span class="fill ' + c + '" data-w="' + r[4] + '"></span><span class="w" style="left:' + r[5] + '%;width:' + (r[6] - r[5]) + '%"></span></span></td></tr>';
    }).join('');
    t.insertAdjacentHTML('beforeend', '<thead><tr><th class="l">Task</th><th class="l">Location</th><th class="l">Policy</th><th><i>n</i></th><th>SR (%)</th><th>95% CI</th><th class="l">SR and 95% CI (0–100%)</th></tr></thead><tbody>' + rowsHtml + '</tbody>');
    function go() { $$('#table-2 .ci .fill').forEach(function (f) { f.style.width = f.getAttribute('data-w') + '%'; }); }
    onReveal.push(function (e) { if (e.contains && e.contains(t)) go(); });
    if (!hasIO || reduce) go();
  })();

  /* ---------- day -> night slope chart ---------- */
  (function () {
    var svg = $('#chart-night svg'), ns = 'http://www.w3.org/2000/svg';
    var y = function (v) { return 220 - v / 80 * 190; }, X0 = 120, X1 = 250;
    var s = '<line class="ax" x1="' + X0 + '" y1="24" x2="' + X0 + '" y2="224"/><line class="ax" x1="' + X1 + '" y1="24" x2="' + X1 + '" y2="224"/>' +
      '<text x="' + X0 + '" y="248" text-anchor="middle" class="muted">Day</text><text x="' + X1 + '" y="248" text-anchor="middle" class="muted">Night</text>';
    NIGHT.forEach(function (d) {
      var tipA = '<b>' + d[0] + '</b><br>Day: ' + fmt(d[1]) + '% (n = ' + d[2] + ')<br>Night: ' + fmt(d[3]) + '% (n = ' + d[4] + ')';
      s += '<g data-tip="' + tipA.replace(/"/g, '&quot;') + '"><path d="M' + X0 + ' ' + y(d[1]) + ' L' + X1 + ' ' + y(d[3]) + '"/>' +
        '<circle cx="' + X0 + '" cy="' + y(d[1]) + '" r="6"/><circle cx="' + X1 + '" cy="' + y(d[3]) + '" r="6"/>' +
        '<text x="' + (X0 - 12) + '" y="' + (y(d[1]) + 4) + '" text-anchor="end">' + fmt(d[1]) + '%</text>' +
        '<text x="' + (X1 + 12) + '" y="' + (y(d[3]) + 4) + '">' + fmt(d[3]) + '%</text>' +
        '<text x="' + (X0 - 12) + '" y="' + (y(d[1]) - 12) + '" text-anchor="end" class="muted">' + d[0] + '</text></g>';
    });
    svg.innerHTML = s;
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
