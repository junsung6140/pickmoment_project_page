/* ═══════════════════════════════════════════════════════
   PickMoment project page — interactions
   - Pick-a-Moment demo (tau slider / interval selector)
   - Blur-to-video comparison player
   - Deblurring before/after slider
   - Missing-asset placeholders, BibTeX copy, scroll fade-in

   Real results come from window.PM_DATA (static/data.js).
   Until they exist, a synthetic toy scene renders the interval-mean
   operator B(s,t) = 1/(t-s) ∫_s^t S(u) du directly in the browser.
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var DATA = window.PM_DATA || { demo: { scenes: [] }, videos: [], deblur: [] };

  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function placeholder(title, detail, icon) {
    var p = el('div', 'pm-placeholder');
    p.innerHTML = '<i class="' + (icon || 'far fa-image') + '"></i><div>' + title + '</div>' +
      (detail ? '<code>' + detail + '</code>' : '');
    return p;
  }

  /* ─────────────────────────────────────────────
     Synthetic toy scene (placeholder + concept illustration)
     Static background stays sharp; only moving objects blur,
     exactly as in a real exposure.
     ───────────────────────────────────────────── */
  var Toy = (function () {
    var W = 480, H = 270;
    var bg = document.createElement('canvas');
    bg.width = W; bg.height = H;
    (function drawBackground(c) {
      var g = c.getContext('2d');
      var sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#1E293B');
      sky.addColorStop(0.7, '#334155');
      sky.addColorStop(1, '#475569');
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      // buildings with windows (high-frequency static texture)
      var xs = [20, 110, 175, 255, 330, 395];
      var hs = [120, 165, 100, 140, 180, 125];
      for (var b = 0; b < xs.length; b++) {
        var bw = 58, bh = hs[b], bx = xs[b], by = 215 - bh;
        g.fillStyle = b % 2 ? '#0F172A' : '#1F2A44';
        g.fillRect(bx, by, bw, bh);
        for (var wy = by + 8; wy < 208; wy += 14) {
          for (var wx = bx + 6; wx < bx + bw - 8; wx += 12) {
            g.fillStyle = ((wx * 7 + wy * 3 + b) % 5 === 0) ? '#FDE68A' : '#334155';
            g.fillRect(wx, wy, 6, 8);
          }
        }
      }
      // checkered road
      for (var x = 0; x < W; x += 12) {
        for (var y = 215; y < H; y += 12) {
          g.fillStyle = ((x + y) / 12) % 2 === 0 ? '#CBD5E1' : '#94A3B8';
          g.fillRect(x, y, 12, 12);
        }
      }
    })(bg);

    // Asymmetric motion (ease-in) so the forward direction is visible.
    function drawFrame(g, u) {
      g.drawImage(bg, 0, 0);
      // 1) ball on a short arc, accelerating to the right, spinning
      //    (moderate displacement so the blur reads as a streak, not a ghost)
      var p = Math.pow(u, 1.6);
      var bx = 150 + 150 * p;
      var by = 180 - 45 * Math.sin(Math.PI * p);
      var grad = g.createRadialGradient(bx - 6, by - 6, 3, bx, by, 20);
      grad.addColorStop(0, '#FDBA74');
      grad.addColorStop(1, '#EA580C');
      g.fillStyle = grad;
      g.beginPath(); g.arc(bx, by, 19, 0, 2 * Math.PI); g.fill();
      var a = 5 * Math.PI * u;
      g.fillStyle = '#FFFFFF';
      g.beginPath(); g.arc(bx + 11 * Math.cos(a), by + 11 * Math.sin(a), 4.5, 0, 2 * Math.PI); g.fill();
      // 2) windmill rotating clockwise
      var cx = 390, cy = 70, th = 0.5 * Math.PI * u;
      g.save(); g.translate(cx, cy); g.rotate(th);
      g.fillStyle = '#22D3EE';
      for (var k = 0; k < 3; k++) { g.rotate(2 * Math.PI / 3); g.fillRect(-4, 0, 8, 44); }
      g.restore();
      g.fillStyle = '#E2E8F0'; g.beginPath(); g.arc(cx, cy, 5, 0, 2 * Math.PI); g.fill();
      // 3) square falling down on the left
      g.fillStyle = '#A78BFA';
      g.fillRect(70, 60 + 70 * u, 22, 22);
    }

    var work = document.createElement('canvas');
    work.width = W; work.height = H;
    var wctx = work.getContext('2d', { willReadFrequently: true });
    var cache = {}, cacheKeys = [];

    // Returns ImageData of the interval mean B(s, t); s == t gives the sharp frame S(s).
    function mean(s, t) {
      var key = s.toFixed(4) + '_' + t.toFixed(4);
      if (cache[key]) return cache[key];
      var out;
      if (t - s < 1e-6) {
        drawFrame(wctx, s);
        out = wctx.getImageData(0, 0, W, H);
      } else {
        var n = clamp(Math.ceil((t - s) * 64), 2, 64);
        var acc = new Float32Array(W * H * 4);
        for (var i = 0; i < n; i++) {
          drawFrame(wctx, s + (t - s) * (i + 0.5) / n);
          var d = wctx.getImageData(0, 0, W, H).data;
          for (var j = 0; j < d.length; j++) acc[j] += d[j];
        }
        out = wctx.createImageData(W, H);
        for (var q = 0; q < acc.length; q++) out.data[q] = acc[q] / n;
      }
      cache[key] = out; cacheKeys.push(key);
      if (cacheKeys.length > 160) delete cache[cacheKeys.shift()];
      return out;
    }
    function paint(canvas, s, t) {
      canvas.width = W; canvas.height = H;
      canvas.getContext('2d').putImageData(mean(s, t), 0, 0);
    }
    function dataURL(s, t) {
      var c = document.createElement('canvas');
      paint(c, s, t);
      return c.toDataURL('image/jpeg', 0.9);
    }
    return { W: W, H: H, paint: paint, dataURL: dataURL };
  })();

  /* ─────────────────────────────────────────────
     Pick-a-Moment demo
     ───────────────────────────────────────────── */
  function initDemo() {
    var root = document.getElementById('pm-demo');
    if (!root) return;
    var cfg = DATA.demo || {};
    var tauSteps = cfg.tauSteps || 32;
    var intSteps = cfg.intervalSteps || 8;

    var scenes = (cfg.scenes || []).map(function (s) { return Object.assign({ toy: false }, s); });
    if (!scenes.length || cfg.includeToy !== false) {
      scenes.push({ id: 'toy', label: 'Toy scene', toy: true });
    }

    var state = { scene: 0, mode: 'moment', tau: 0.5, s: 0.25, t: 0.75, playing: false };

    // DOM refs (markup lives in index.html)
    var thumbRow = root.querySelector('.thumb-row');
    var tabs = root.querySelectorAll('.pm-tab');
    var badge = root.querySelector('.pm-badge');
    var inImg = root.querySelector('.pm-in-img');
    var inCan = root.querySelector('.pm-in-canvas');
    var outImg = root.querySelector('.pm-out-img');
    var outCan = root.querySelector('.pm-out-canvas');
    var outLabel = root.querySelector('.pm-out-label');
    var outQuery = root.querySelector('.pm-query');
    var track = root.querySelector('.pm-timeline');
    var readout = root.querySelector('.pm-readout');
    var playBtn = root.querySelector('[data-action="play"]');
    var note = root.querySelector('.pm-demo-note');

    // Timeline children
    var range = el('div', 'pm-range');
    var h1 = el('div', 'pm-handle'); h1.tabIndex = 0; h1.setAttribute('role', 'slider');
    var h2 = el('div', 'pm-handle'); h2.tabIndex = 0; h2.setAttribute('role', 'slider');
    track.appendChild(range); track.appendChild(h1); track.appendChild(h2);

    function cur() { return scenes[state.scene]; }
    function minGap() { return cur().toy ? 1 / 64 : 1 / intSteps; }
    function snap(v, steps) { return Math.round(v * steps) / steps; }
    function snapScene(v, kind) {
      if (cur().toy) return snap(v, 128);
      return snap(v, kind === 'tau' ? tauSteps : intSteps);
    }

    function drawTicks() {
      track.querySelectorAll('.pm-tick').forEach(function (t) { t.remove(); });
      var steps = state.mode === 'moment' ? Math.min(tauSteps, 16) : intSteps;
      if (cur().toy && state.mode === 'moment') steps = 8;
      for (var i = 0; i <= steps; i++) {
        var tk = el('div', 'pm-tick');
        tk.style.left = (100 * i / steps) + '%';
        track.appendChild(tk);
      }
    }

    // Preload real-scene frames so scrubbing is instant.
    var preloaded = {};
    function preload(src) {
      if (preloaded[src]) return;
      var im = new Image(); im.src = src; preloaded[src] = im;
    }
    function tauSrc(sc, k) { return sc.dir + '/tau_' + pad2(k) + '.jpg'; }
    function intSrc(sc, i, j) { return sc.dir + '/int_' + pad2(i) + '_' + pad2(j) + '.jpg'; }
    function preloadScene(sc) {
      if (sc.toy) return;
      for (var k = 0; k <= tauSteps; k++) preload(tauSrc(sc, k));
      for (var i = 0; i < intSteps; i++)
        for (var j = i + 1; j <= intSteps; j++) preload(intSrc(sc, i, j));
    }

    function setImg(img, src) {
      if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    }

    var rafPending = false;
    function requestRender() {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(function () { rafPending = false; render(); });
    }

    function render() {
      var sc = cur();
      var moment = state.mode === 'moment';

      // timeline
      if (moment) {
        range.style.display = 'none'; h2.style.display = 'none';
        h1.style.left = (100 * state.tau) + '%';
        h1.setAttribute('aria-label', 'tau'); h1.setAttribute('aria-valuenow', state.tau.toFixed(3));
      } else {
        range.style.display = ''; h2.style.display = '';
        h1.style.left = (100 * state.s) + '%';
        h2.style.left = (100 * state.t) + '%';
        range.style.left = (100 * state.s) + '%';
        range.style.width = (100 * (state.t - state.s)) + '%';
        h1.setAttribute('aria-label', 's'); h1.setAttribute('aria-valuenow', state.s.toFixed(3));
        h2.setAttribute('aria-label', 't'); h2.setAttribute('aria-valuenow', state.t.toFixed(3));
      }

      // readout
      if (moment) {
        readout.innerHTML = 'Query <b>S(τ) = B(τ, τ)</b>, &nbsp;τ = ' + state.tau.toFixed(3);
        outLabel.textContent = 'Sharp frame S(τ)';
        outQuery.textContent = 'τ = ' + state.tau.toFixed(2);
      } else {
        readout.innerHTML = 'Query <b>B(s, t)</b>, &nbsp;s = ' + state.s.toFixed(3) + ', t = ' + state.t.toFixed(3);
        outLabel.textContent = 'Interval mean B(s, t)';
        outQuery.textContent = '[' + state.s.toFixed(2) + ', ' + state.t.toFixed(2) + ']';
      }

      // output image
      if (sc.toy) {
        outImg.style.display = 'none'; outCan.style.display = '';
        if (moment) Toy.paint(outCan, state.tau, state.tau);
        else Toy.paint(outCan, state.s, state.t);
      } else {
        outCan.style.display = 'none'; outImg.style.display = '';
        if (moment) {
          setImg(outImg, tauSrc(sc, Math.round(state.tau * tauSteps)));
        } else {
          var i = Math.round(state.s * intSteps), j = Math.round(state.t * intSteps);
          setImg(outImg, intSrc(sc, i, j));
        }
      }
    }

    function selectScene(idx) {
      state.scene = idx;
      stopPlay();
      var sc = cur();
      thumbRow.querySelectorAll('.thumb').forEach(function (t, k) {
        t.classList.toggle('active', k === idx);
      });
      if (sc.toy) {
        inImg.style.display = 'none'; inCan.style.display = '';
        Toy.paint(inCan, 0, 1);
        badge.textContent = 'Synthetic illustration — not model output';
        badge.classList.remove('is-real');
        note.innerHTML = 'This toy scene computes <b>B(s, t)</b> by averaging rendered frames over [s, t] in your browser. ' +
          'It illustrates the query interface only. Model results on real blur appear in the other thumbnails once released.';
      } else {
        inCan.style.display = 'none'; inImg.style.display = '';
        setImg(inImg, sc.input);
        badge.textContent = 'PickMoment output';
        badge.classList.add('is-real');
        note.innerHTML = 'Every output is one forward pass of the same model on the same blurry input; only the queried time or interval changes. ' +
          'Frames are precomputed on a grid (τ step 1/' + tauSteps + ', interval step 1/' + intSteps + ').';
        preloadScene(sc);
      }
      state.tau = snapScene(state.tau, 'tau');
      state.s = snapScene(state.s, 'int');
      state.t = Math.max(snapScene(state.t, 'int'), state.s + minGap());
      drawTicks();
      requestRender();
    }

    function setMode(mode) {
      state.mode = mode;
      tabs.forEach(function (tb) { tb.classList.toggle('active', tb.getAttribute('data-mode') === mode); });
      if (mode === 'interval') stopPlay();
      drawTicks();
      requestRender();
    }

    // ── pointer interaction on the timeline ──
    var dragging = null; // 'tau' | 's' | 't'
    function valueAt(ev) {
      var r = track.getBoundingClientRect();
      return clamp((ev.clientX - r.left) / r.width, 0, 1);
    }
    function applyValue(which, v) {
      if (which === 'tau') {
        state.tau = snapScene(v, 'tau');
      } else if (which === 's') {
        state.s = clamp(snapScene(v, 'int'), 0, state.t - minGap());
      } else {
        state.t = clamp(snapScene(v, 'int'), state.s + minGap(), 1);
      }
      requestRender();
    }
    track.addEventListener('pointerdown', function (ev) {
      stopPlay();
      var v = valueAt(ev);
      if (state.mode === 'moment') dragging = 'tau';
      else if (ev.target === h1) dragging = 's';
      else if (ev.target === h2) dragging = 't';
      else dragging = Math.abs(v - state.s) <= Math.abs(v - state.t) ? 's' : 't';
      track.setPointerCapture(ev.pointerId);
      applyValue(dragging, v);
      ev.preventDefault();
    });
    track.addEventListener('pointermove', function (ev) {
      if (dragging) applyValue(dragging, valueAt(ev));
    });
    function endDrag() { dragging = null; }
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);

    function keyHandler(which) {
      return function (ev) {
        var name = state.mode === 'moment' ? 'tau' : which;
        var step = cur().toy ? 1 / 64 : (name === 'tau' ? 1 / tauSteps : 1 / intSteps);
        var v = name === 'tau' ? state.tau : state[name];
        if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') { applyValue(name, v + step); ev.preventDefault(); }
        if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') { applyValue(name, v - step); ev.preventDefault(); }
      };
    }
    h1.addEventListener('keydown', keyHandler('s'));
    h2.addEventListener('keydown', keyHandler('t'));

    // ── sweep playback (moment mode) ──
    // sweepV is the continuous playhead; state.tau is its grid-snapped value.
    var dir = 1, last = 0, rafId = null, sweepV = 0;
    function tick(ts) {
      if (!state.playing) return;
      var dt = last ? (ts - last) / 1000 : 0; last = ts;
      sweepV += dir * dt * 0.3;
      if (sweepV >= 1) { sweepV = 1; dir = -1; }
      if (sweepV <= 0) { sweepV = 0; dir = 1; }
      state.tau = snapScene(sweepV, 'tau');
      render();
      rafId = requestAnimationFrame(tick);
    }
    function startPlay() {
      if (state.mode !== 'moment') setMode('moment');
      sweepV = state.tau;
      if (sweepV >= 1) dir = -1;
      if (sweepV <= 0) dir = 1;
      state.playing = true; last = 0;
      playBtn.innerHTML = '<i class="fas fa-pause"></i> Pause';
      rafId = requestAnimationFrame(tick);
    }
    function stopPlay() {
      if (!state.playing) return;
      state.playing = false;
      if (rafId) cancelAnimationFrame(rafId);
      state.tau = snapScene(state.tau, 'tau');
      playBtn.innerHTML = '<i class="fas fa-play"></i> Sweep τ';
    }
    playBtn.addEventListener('click', function () { state.playing ? stopPlay() : startPlay(); });

    // ── presets ──
    root.querySelectorAll('[data-preset]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        stopPlay();
        var p = btn.getAttribute('data-preset');
        if (p === 'deblur') { setMode('moment'); state.tau = 0.5; }
        if (p === 'full') { setMode('interval'); state.s = 0; state.t = 1; }
        if (p === 'first') { setMode('interval'); state.s = 0; state.t = 0.5; }
        if (p === 'second') { setMode('interval'); state.s = 0.5; state.t = 1; }
        requestRender();
      });
    });

    tabs.forEach(function (tb) {
      tb.addEventListener('click', function () { setMode(tb.getAttribute('data-mode')); });
    });

    // ── thumbnails ──
    scenes.forEach(function (sc, idx) {
      var th = el('img', 'thumb');
      th.alt = sc.label;
      th.title = sc.label;
      th.src = sc.toy ? Toy.dataURL(0, 1) : sc.input;
      th.addEventListener('click', function () { selectScene(idx); });
      thumbRow.appendChild(th);
    });

    // hide broken real-scene images gracefully
    outImg.addEventListener('error', function () {
      outLabel.textContent = 'Missing frame: ' + outImg.getAttribute('src');
    });

    selectScene(0);
    setMode('moment');
  }

  /* ─────────────────────────────────────────────
     Blur-to-video comparison player
     ───────────────────────────────────────────── */
  function initVideos() {
    var root = document.getElementById('pm-videos');
    if (!root) return;
    var clips = DATA.videos || [];
    if (!clips.length) {
      root.appendChild(placeholder(
        'Side-by-side blur-to-video results (Blurry input · Blur2Vid · Ours · GT) coming soon',
        'static/videos/*.mp4', 'fas fa-film'));
      return;
    }
    var chips = el('div', 'pm-tabs');
    chips.style.marginBottom = '12px';
    var wrap = el('div', 'pm-video-wrap');
    var video = el('video');
    video.muted = true; video.loop = true; video.playsInline = true; video.autoplay = true;
    video.setAttribute('playsinline', '');
    wrap.appendChild(video);
    var cols = el('div', 'pm-video-cols');
    var ctr = el('div', 'pm-controls');
    var pp = el('button', 'pm-btn', '<i class="fas fa-pause"></i> Pause');
    var speeds = [0.25, 0.5, 1];
    ctr.appendChild(pp);
    speeds.forEach(function (sp) {
      var b = el('button', 'pm-btn', sp + '×');
      b.addEventListener('click', function () {
        video.playbackRate = sp;
        ctr.querySelectorAll('[data-speed]').forEach(function (x) { x.classList.remove('is-primary'); });
        b.classList.add('is-primary');
      });
      b.setAttribute('data-speed', sp);
      if (sp === 0.5) b.classList.add('is-primary');
      ctr.appendChild(b);
    });
    pp.addEventListener('click', function () {
      if (video.paused) { video.play(); pp.innerHTML = '<i class="fas fa-pause"></i> Pause'; }
      else { video.pause(); pp.innerHTML = '<i class="fas fa-play"></i> Play'; }
    });

    function select(idx) {
      var c = clips[idx];
      chips.querySelectorAll('.pm-tab').forEach(function (b, k) { b.classList.toggle('active', k === idx); });
      video.src = c.src;
      if (c.poster) video.poster = c.poster;
      video.playbackRate = 0.5;
      var names = c.columns || ['Blurry input', 'Blur2Vid', 'Ours', 'GT'];
      cols.style.gridTemplateColumns = 'repeat(' + names.length + ', 1fr)';
      cols.innerHTML = '';
      names.forEach(function (n, k) {
        var d = el('div', k === (c.oursIndex === undefined ? 2 : c.oursIndex) ? 'is-ours' : '', n);
        cols.appendChild(d);
      });
      var p = video.play(); if (p && p.catch) p.catch(function () {});
    }
    video.addEventListener('error', function () {
      wrap.innerHTML = '';
      wrap.appendChild(placeholder('Video not found', video.getAttribute('src'), 'fas fa-film'));
    });

    clips.forEach(function (c, idx) {
      var b = el('button', 'pm-tab', c.label || c.id);
      b.addEventListener('click', function () { select(idx); });
      chips.appendChild(b);
    });
    root.appendChild(chips);
    root.appendChild(wrap);
    root.appendChild(cols);
    root.appendChild(ctr);
    select(0);
  }

  /* ─────────────────────────────────────────────
     Deblurring before/after slider
     ───────────────────────────────────────────── */
  function initDeblur() {
    var root = document.getElementById('pm-deblur');
    if (!root) return;
    var pairs = (DATA.deblur || []).slice();
    var synthetic = !pairs.length;
    if (synthetic) {
      pairs.push({ id: 'toy', label: 'Toy scene', blur: Toy.dataURL(0, 1), ours: Toy.dataURL(0.5, 0.5) });
    }
    var state = { idx: 0, left: 'blur' };

    var top = el('div', 'pm-demo-header');
    var chips = el('div', 'pm-tabs');
    var cmp = el('div', 'pm-tabs');
    var bBlur = el('button', 'pm-tab active', 'vs. Blurry input');
    var bFide = el('button', 'pm-tab', 'vs. FideDiff');
    cmp.appendChild(bBlur); cmp.appendChild(bFide);
    top.appendChild(chips); top.appendChild(cmp);
    if (synthetic) {
      var bd = el('span', 'pm-badge', 'Synthetic illustration — not model output');
      top.appendChild(bd);
    }

    var slider = el('div', 'ba-slider');
    var after = el('img', 'ba-after');
    var before = el('img', 'ba-before');
    var handle = el('div', 'ba-handle',
      '<div class="ba-handle-line"></div><div class="ba-handle-circle"><span>‹›</span></div><div class="ba-handle-line"></div>');
    slider.appendChild(after); slider.appendChild(before); slider.appendChild(handle);

    function setPos(pct) {
      pct = clamp(pct, 0, 100);
      before.style.clipPath = 'inset(0 ' + (100 - pct) + '% 0 0)';
      handle.style.left = pct + '%';
    }
    function update() {
      var p = pairs[state.idx];
      var hasFide = !!p.fidediff;
      bFide.disabled = !hasFide;
      bFide.style.opacity = hasFide ? '' : '0.4';
      if (!hasFide && state.left === 'fidediff') state.left = 'blur';
      bBlur.classList.toggle('active', state.left === 'blur');
      bFide.classList.toggle('active', state.left === 'fidediff');
      before.src = state.left === 'blur' ? p.blur : p.fidediff;
      after.src = p.ours;
      slider.setAttribute('data-label-left', state.left === 'blur' ? 'Blurry input' : 'FideDiff');
      slider.setAttribute('data-label-right', synthetic ? 'Sharp S(½)' : 'Ours');
      chips.querySelectorAll('.pm-tab').forEach(function (b, k) { b.classList.toggle('active', k === state.idx); });
    }
    bBlur.addEventListener('click', function () { state.left = 'blur'; update(); });
    bFide.addEventListener('click', function () { state.left = 'fidediff'; update(); });
    pairs.forEach(function (p, idx) {
      var b = el('button', 'pm-tab', p.label || p.id);
      b.addEventListener('click', function () { state.idx = idx; update(); });
      chips.appendChild(b);
    });

    var active = false;
    function posFrom(ev) {
      var r = slider.getBoundingClientRect();
      setPos(100 * (ev.clientX - r.left) / r.width);
    }
    slider.addEventListener('pointerdown', function (ev) {
      active = true; slider.setPointerCapture(ev.pointerId); posFrom(ev); ev.preventDefault();
    });
    slider.addEventListener('pointermove', function (ev) { if (active) posFrom(ev); });
    slider.addEventListener('pointerup', function () { active = false; });
    slider.addEventListener('pointercancel', function () { active = false; });
    after.addEventListener('error', function () {
      slider.innerHTML = '';
      slider.appendChild(placeholder('Image not found', after.getAttribute('src')));
    });

    root.appendChild(top);
    root.appendChild(slider);
    setPos(50);
    update();
  }

  /* ─────────────────────────────────────────────
     Static figures: show a placeholder when the file is missing
     ───────────────────────────────────────────── */
  function initAssetFallbacks() {
    document.querySelectorAll('img[data-pm-asset]').forEach(function (img) {
      function swap() {
        var ph = placeholder(img.alt || 'Figure coming soon', img.getAttribute('src'));
        img.replaceWith(ph);
      }
      if (img.complete && img.naturalWidth === 0) swap();
      else img.addEventListener('error', swap);
    });
  }

  /* ─────────────────────────────────────────────
     Misc
     ───────────────────────────────────────────── */
  window.copyBibtex = function () {
    var text = document.getElementById('bibtex').innerText;
    navigator.clipboard.writeText(text).then(function () {
      var btn = document.querySelector('.copy-btn');
      btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
      setTimeout(function () { btn.innerHTML = '<i class="fas fa-copy"></i> Copy BibTeX'; }, 2000);
    });
  };

  function initFadeIn() {
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('.fade-in').forEach(function (e) { e.classList.add('visible'); });
      return;
    }
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) en.target.classList.add('visible'); });
    }, { threshold: 0.1 });
    document.querySelectorAll('.fade-in').forEach(function (e) { obs.observe(e); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initAssetFallbacks();
    initDemo();
    initVideos();
    initDeblur();
    initFadeIn();
  });
})();
