/* The BlueROV beside "Abstract" swims down the page as you scroll: it picks up the red rod resting on the
   "Data collection" heading, picks up a few fish once it passes the Malta (marine deployment) part, and sets
   the rod down on the "Model Architectures" heading. Positions are a function of scroll, so scrolling up
   plays it backwards. Wide-ish screens only; elsewhere the icon simply stays beside "Abstract". */
(function () {
  'use strict';
  var home = document.getElementById('rov-home');
  var hData = document.querySelector('#p-data h3');
  var hModel = document.querySelector('#p-models h3');
  var hMalta = Array.prototype.filter.call(document.querySelectorAll('#p-data h4'), function (h) { return /Marine/.test(h.textContent); })[0];
  var col = document.getElementById('paper');
  if (!home || !hData || !hModel || !col) return;

  var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var wide = window.matchMedia('(min-width: 900px)');
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var ease = function (t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };

  function mk(tag, cls, html) { var e = document.createElement(tag); e.className = cls; if (html) e.innerHTML = html; e.setAttribute('aria-hidden', 'true'); document.body.appendChild(e); return e; }
  var rov = mk('img', 'rj-rov'); rov.src = 'assets/img/bluerov-240.webp'; rov.alt = '';
  var rod = mk('div', 'rj-rod');
  var FISH = ['🐟', '🐠', '🐡'];
  var fish = FISH.map(function (f, i) { var e = mk('span', 'rj-fish', f); return { el: e, x: 0, y: 0, k: i }; });

  // document coordinates of an element box
  function box(el) { var r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; }
  // where the rod rests: in the empty space just after a heading's text, sitting on its baseline
  function restOn(h) {
    var range = document.createRange(); range.selectNodeContents(h);
    var rs = range.getClientRects(), tr = rs[rs.length - 1];           // last line of the heading
    return { x: tr.right + scrollX + 52, y: tr.top + scrollY + tr.height * 0.8 };
  }
  // move from P to Q without crossing text: sideways to the margin lane, down the lane, sideways in.
  // c runs from c0 to c1; the sideways parts take a fixed bit of scrolling each.
  function route(c, c0, c1, P, Q, lane) {
    var h = Math.min(130, (c1 - c0) * 0.2);
    if (c < c0 + h) return { x: lerp(P.x, lane, ease((c - c0) / h)), y: P.y };
    if (c > c1 - h) return { x: lerp(lane, Q.x, ease((c - (c1 - h)) / h)), y: Q.y };
    return { x: lane, y: lerp(P.y, Q.y, (c - c0 - h) / (c1 - c0 - 2 * h)) };
  }

  var tilt = 0, lastS = scrollY, raf = 0, t0 = performance.now();
  function place(el, x, y, extra) { el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)' + (extra || ''); }

  function frame(now) {
    raf = 0;
    var on = wide.matches;
    document.documentElement.classList.toggle('rj-on', on);
    if (!on) { home.style.visibility = ''; return; }

    var H = innerHeight, t = still ? 0 : (now - t0) / 1000;
    var c = scrollY + H * 0.42;                                   // the reader's eye line, in page coordinates
    var hb = box(home);
    var A = { x: hb.x + hb.w / 2, y: hb.y + hb.h / 2 };            // beside "Abstract"
    var R = restOn(hData), D = restOn(hModel);                    // pick-up and drop-off
    var M = hMalta ? box(hMalta).y : (R.y + D.y) / 2;
    var pc = box(col), vw = document.documentElement.clientWidth;
    var margin = vw - (pc.x - scrollX + pc.w);                     // empty space right of the text column
    if (margin < 76) { document.documentElement.classList.remove('rj-on'); home.style.visibility = ''; return; }
    var lane = pc.x + pc.w + margin / 2;                           // swim lane: middle of the right margin

    var big = clamp(margin - 24, 46, 78), small = hb.w, W, grip;   // ROV width; rod hangs under the ROV
    var x, y, carry = false, dropped = false, q;
    var gB = 0.34 * big, leg1 = R.y - 150, leg2 = D.y - 150;

    if (c <= A.y) { x = A.x; y = A.y; W = small; }
    else if (c <= leg1) {                                         // Abstract -> margin -> above the rod
      W = lerp(small, big, ease((c - A.y) / 200));
      q = route(c, A.y, leg1, A, { x: R.x, y: R.y - gB - 40 }, lane); x = q.x; y = q.y;
    } else if (c <= R.y) {                                        // settle onto the rod
      W = big; x = R.x; y = lerp(R.y - gB - 40, R.y - gB, ease((c - leg1) / 150));
    } else if (c <= leg2) {                                       // carry it down the margin
      W = big; carry = true;
      q = route(c, R.y, leg2, { x: R.x, y: R.y - gB }, { x: D.x, y: D.y - gB - 40 }, lane); x = q.x; y = q.y;
      if (Math.abs(x - lane) < 1) x += still ? 0 : Math.min(10, margin / 2 - big / 2 - 4) * Math.sin(c / 90);
    } else if (c <= D.y) {                                        // lower it after "Model Architectures"
      W = big; carry = true; x = D.x; y = lerp(D.y - gB - 40, D.y - gB, ease((c - leg2) / 150));
    } else {                                                      // let go and hover just above-right of it
      var w2 = ease((c - D.y) / 200);
      W = big; dropped = true; x = lerp(D.x, D.x + 60, w2); y = lerp(D.y - gB, D.y - gB - 46, w2);
    }
    grip = 0.34 * W;
    if (c > A.y) y += still ? 0 : 3 * Math.sin(t * 1.6);          // hovering
    var ds = scrollY - lastS; lastS = scrollY;
    tilt = tilt * 0.85 + clamp(ds * 0.2, -8, 8) * 0.15;

    rov.style.width = W.toFixed(1) + 'px';
    var rh = W * 176 / 240;
    place(rov, x - W / 2, y - rh / 2, ' rotate(' + tilt.toFixed(2) + 'deg)');
    home.style.visibility = 'hidden';                              // the flying copy stands in for it

    // rod: on Data collection -> under the ROV -> on Model Architectures
    var rx, ry, ra;
    if (carry) { rx = x; ry = y + grip; ra = tilt * 0.6 - 3; }
    else if (dropped || c > D.y) { rx = D.x; ry = D.y; ra = -2; }
    else { rx = R.x; ry = R.y; ra = -2; }
    place(rod, rx - 29, ry - 10, ' rotate(' + ra.toFixed(2) + 'deg)');

    // fish join once the ROV is past the Malta section, and drift off after the drop
    var fishOn = c > M && c < D.y + 600;
    var fade = clamp((c - M) / 200, 0, 1) * clamp((D.y + 600 - c) / 250, 0, 1);
    fish.forEach(function (f, i) {
      var spread = Math.max(0, margin / 2 - 16), inLane = Math.abs(x - lane) < spread + 1;
      var tx = (inLane ? lane : x) + clamp((i - 1) * 16 + (still ? 0 : 8 * Math.sin(t * 1.3 + i * 2)), -spread, spread), ty = y - 48 - 30 * i + (still ? 0 : 6 * Math.sin(t * 1.9 + i));
      if (!f.init || !fishOn) { f.x = tx; f.y = ty; f.init = true; }
      var k = still ? 1 : 0.06 + 0.02 * i;                         // each fish lags a little more
      var px = f.x; f.x += (tx - f.x) * k; f.y += (ty - f.y) * k;
      var flip = f.x - px > 0.4 ? ' scaleX(-1)' : '';
      f.el.style.opacity = fade.toFixed(2);
      place(f.el, f.x - 12, f.y - 12, flip);
    });

    if (!raf) raf = requestAnimationFrame(frame);                 // keep the hover/fish alive
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }
  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', kick);
  if (wide.addEventListener) wide.addEventListener('change', function () { home.style.visibility = ''; kick(); });
  kick();
})();
