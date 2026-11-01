/* A tiny BlueROV in the right margin carries a red rod down the page as you read.
   Everything is a pure function of scroll position, so scrolling back up undoes it. */
(function () {
  'use strict';
  var paper = document.getElementById('paper'), lane = document.querySelector('.rov-lane');
  if (!paper || !lane) return;
  var rov = lane.querySelector('.rov'), rod = lane.querySelector('.rod');
  var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var ease = function (t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  var seg = function (p, a, b) { return ease((p - a) / (b - a)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var tilt = 0, lastY = 0, running = false;

  function frame(now) {
    running = false;
    if (getComputedStyle(lane).display === 'none') return;
    var H = innerHeight, W = lane.clientWidth, cx = W / 2;
    var r = paper.getBoundingClientRect();
    var p = clamp((H * 0.5 - r.top) / r.height, 0, 1);
    lane.classList.toggle('on', r.top < H * 0.55 && r.bottom > H * 0.45);
    var t = still ? 0 : now / 1000;
    var startY = H * 0.24, dropY = H * 0.8, grip = 30;

    // ROV path
    var x, y;
    if (p < 0.06) { var a = seg(p, 0, 0.06); x = lerp(cx + 70, cx, a); y = lerp(-90, startY - grip - 14, a); }
    else if (p < 0.1) { x = cx; y = lerp(startY - grip - 14, startY - grip, seg(p, 0.06, 0.1)); }
    else if (p < 0.88) { var c = seg(p, 0.1, 0.88); x = cx + 16 * Math.sin((p - 0.1) * 38); y = lerp(startY - grip, dropY - grip, c); }
    else if (p < 0.92) { x = cx; y = dropY - grip; }
    else { var e = seg(p, 0.92, 1); x = lerp(cx, cx + 50, e); y = lerp(dropY - grip, dropY - 170, e); }
    y += still ? 0 : 3 * Math.sin(t * 1.6);                      // hovering
    var dy = window.scrollY - lastY; lastY = window.scrollY;
    tilt = tilt * 0.85 + clamp(dy * 0.25, -9, 9) * 0.15;        // leans into the motion
    rov.style.transform = 'translate(' + (x - rov.offsetWidth / 2) + 'px,' + (y - rov.offsetHeight / 2) + 'px) rotate(' + tilt.toFixed(2) + 'deg)';

    // rod: resting -> gripped -> released
    var rx, ry, ra;
    if (p < 0.1) { rx = cx; ry = startY + (still ? 0 : 2.5 * Math.sin(t * 2.1)); ra = -8 + (still ? 0 : 3 * Math.sin(t * 1.3)); }
    else if (p < 0.88) { rx = x; ry = y + grip; ra = tilt * 0.6 - 4; }
    else { var d = seg(p, 0.88, 0.92); rx = lerp(cx, cx, d); ry = lerp(dropY, dropY + 6, d); ra = lerp(-4, 6, d); }
    rod.style.transform = 'translate(' + (rx - rod.offsetWidth / 2) + 'px,' + (ry - rod.offsetHeight / 2) + 'px) rotate(' + ra.toFixed(2) + 'deg)';
    lane.style.setProperty('--startY', startY + 'px'); lane.style.setProperty('--dropY', dropY + 'px');
    lane.classList.toggle('carrying', p >= 0.1 && p < 0.88);

    if (lane.classList.contains('on')) loop();
  }
  function loop() { if (!running) { running = true; requestAnimationFrame(frame); } }
  addEventListener('scroll', loop, { passive: true });
  addEventListener('resize', loop);
  loop();
})();
