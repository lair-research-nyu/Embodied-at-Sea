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
  // the point on top of a heading's text where the rod rests
  function restOn(h) {
    var b = box(h), range = document.createRange(); range.selectNodeContents(h);
    var tr = range.getBoundingClientRect();
    return { x: tr.left + scrollX + Math.min(110, tr.width * 0.35), y: tr.top + scrollY + 3 };
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
    var pc = box(col), side = pc.x + pc.w - 46;                   // swim lane: the right edge of the text column

    var big = 78, small = hb.w, W, grip;                          // ROV width; rod hangs under the ROV
    var x, y, carry = false, dropped = false;
    var leg1 = R.y - 150, leg2 = D.y - 150;

    if (c <= A.y) { x = A.x; y = A.y; W = small; }
    else if (c <= leg1) {                                         // swim from the Abstract to the rod
      var u = (c - A.y) / (leg1 - A.y);
      W = lerp(small, big, ease(u * 4));
      x = lerp(lerp(A.x, side, ease(u * 2)), R.x, ease(u * 2 - 1));
      y = lerp(A.y, R.y - 70, u);
    } else if (c <= R.y) {                                        // settle onto the rod
      W = big; x = R.x; y = lerp(R.y - 70, R.y - 0.34 * big, ease((c - leg1) / 150));
    } else if (c <= leg2) {                                       // carry it down the page
      var v = (c - R.y) / (leg2 - R.y);
      W = big; carry = true;
      x = lerp(lerp(R.x, side, ease(v * 8)), D.x, ease((v - 0.9) * 10)) + (still ? 0 : 10 * Math.sin(v * 40));
      y = lerp(R.y - 0.34 * big, D.y - 70, v);
    } else if (c <= D.y) {                                        // lower it onto Model Architectures
      W = big; carry = true; x = D.x; y = lerp(D.y - 70, D.y - 0.34 * big, ease((c - leg2) / 150));
    } else {                                                      // let go and hover beside it
      var w2 = ease((c - D.y) / 200);
      W = big; dropped = true; x = lerp(D.x, D.x + 90, w2); y = lerp(D.y - 0.34 * big, D.y - 95, w2);
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
      var tx = x - 62 - 42 * i + (still ? 0 : 10 * Math.sin(t * 1.3 + i * 2)), ty = y + 18 + 22 * Math.sin(i * 2.1) + (still ? 0 : 8 * Math.sin(t * 1.9 + i));
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
