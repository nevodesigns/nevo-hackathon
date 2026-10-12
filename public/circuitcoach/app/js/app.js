/* app.js: the shell: parts bin, placement, power cycle, serial log.
   Session state (attempts, fault history, time on task) is tracked here
   already so the adaptive tutor can read it without a rewrite later. */
(function (global) {
  'use strict';
  var CC = global.CC;
  var board = CC.board;
  var circuit = CC.circuit;

  var WIRE_COLOURS = ['#C08552', '#E8A33D', '#7C8983', '#5E9C86', '#EDEAE2'];
  var TOOL_HINT = {
    led: ['pick the ANODE hole (long leg, current in)', 'pick the CATHODE hole (flat side)'],
    resistor: ['pick the first hole', 'pick the second hole'],
    wire: ['pick the first hole', 'pick the second hole'],
    button: ['pick the first contact', 'pick the second contact']
  };
  var PART_TYPES = ['led', 'resistor', 'button', 'wire'];

  var state = {
    tierIndex: 0,
    variantIndex: 0,
    challenge: null,
    device: null,
    resistorValue: 220,
    components: [],
    seq: 0,
    tool: null,
    pending: null,
    wireColour: 0,
    energised: false,
    buttonPressed: false,
    solved: false,
    result: null,
    damaged: {},
    /* session trace: the tutor's input surface */
    attempts: 0,
    hintsRequested: 0,
    hints: [],
    faults: [],
    startedAt: Date.now(),
    focusHole: 'A1',
    undo: []
  };

  var el = {};
  var layers = null;

  /* ---- helpers -------------------------------------------------------- */

  function $(id) { return document.getElementById(id); }
  function n2(v) { return (v < 10 ? '0' : '') + v; }
  function clock() {
    var s = Math.floor((Date.now() - state.startedAt) / 1000);
    return n2(Math.floor(s / 60)) + ':' + n2(s % 60);
  }
  function attach(hole) {
    return state.components.filter(function (c) { return c.a === hole || c.b === hole; });
  }
  function counts() {
    var out = { led: 0, resistor: 0, wire: 0, button: 0 };
    state.components.forEach(function (c) { out[c.type]++; });
    return out;
  }
  function isLogic() { return !!(state.challenge && state.challenge.rules.logic); }
  function snapshot() {
    state.undo.push(state.components.map(function (c) {
      return { id: c.id, type: c.type, a: c.a, b: c.b, ohms: c.ohms, colour: c.colour };
    }));
    if (state.undo.length > 40) state.undo.shift();
  }

  /* ---- component geometry -------------------------------------------- */

  function wirePath(p1, p2) {
    var dx = p2.x - p1.x, dy = p2.y - p1.y;
    var d = Math.sqrt(dx * dx + dy * dy) || 1;
    var bow = Math.min(26, d * 0.16);
    var mx = (p1.x + p2.x) / 2 + (-dy / d) * bow;
    var my = (p1.y + p2.y) / 2 + (dx / d) * bow;
    return 'M' + p1.x + ',' + p1.y + ' Q' + mx.toFixed(1) + ',' + my.toFixed(1) +
      ' ' + p2.x + ',' + p2.y;
  }

  function midAngle(p1, p2) {
    return {
      x: (p1.x + p2.x) / 2,
      y: (p1.y + p2.y) / 2,
      deg: Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI,
      d: Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2))
    };
  }

  /* Real E12 colour code, so a swapped value visibly changes the part. */
  var BAND_COLOURS = ['#1A1A1A', '#5C4033', '#B8493F', '#C4622D', '#C9A227',
    '#4A7C59', '#3B6EA5', '#7A5A9E', '#8A8A8A', '#E8E4DA'];
  var GOLD = '#C08552';

  function bandsFor(ohms) {
    var s = String(Math.round(ohms || 0));
    if (s.length < 3) return [BAND_COLOURS[1], BAND_COLOURS[0], BAND_COLOURS[0], GOLD];
    return [
      BAND_COLOURS[+s[0]],
      BAND_COLOURS[+s[1]],
      BAND_COLOURS[Math.min(9, s.length - 2)],
      GOLD
    ];
  }

  function renderResistor(c, cls) {
    var p1 = board.pos(c.a), p2 = board.pos(c.b);
    var m = midAngle(p1, p2);
    var len = Math.max(20, Math.min(46, m.d * 0.6));
    var out = '<g class="cmp resistor ' + cls + '" data-cmp="' + c.id + '">';
    out += '<line class="leg" x1="' + p1.x + '" y1="' + p1.y + '" x2="' + p2.x + '" y2="' + p2.y + '"/>';
    out += '<g transform="translate(' + m.x.toFixed(1) + ',' + m.y.toFixed(1) +
      ') rotate(' + m.deg.toFixed(1) + ')">';
    out += '<rect class="res-body" x="' + (-len / 2) + '" y="-7.5" width="' + len +
      '" height="15" rx="6"/>';
    bandsFor(c.ohms).forEach(function (col, i) {
      var x = -len / 2 + 6 + i * ((len - 14) / 3.6);
      out += '<rect class="res-band" x="' + x.toFixed(1) + '" y="-7.5" width="3" height="15" fill="' + col + '"/>';
    });
    out += '</g></g>';
    return out;
  }

  function renderLed(c, cls, lit, drive) {
    var b = Math.max(0, Math.min(1, drive));
    if (lit) {
      cls += ' ' + (state.device.tint === 'cool' ? 'cool' : 'warm');
      if (drive > 1.001) cls += ' hot';
      else if (b < 0.65) cls += ' dim';
    }
    var pa = board.pos(c.a), pk = board.pos(c.b);
    /* body sits off-centre toward the cathode, so the anode leg reads as the
       long leg: the same cue a learner uses on a real LED */
    var bx = pa.x + (pk.x - pa.x) * 0.62;
    var by = pa.y + (pk.y - pa.y) * 0.62;
    var deg = Math.atan2(pa.y - pk.y, pa.x - pk.x) * 180 / Math.PI;

    var out = '<g class="cmp led ' + cls + (lit ? ' lit' : '') + '" data-cmp="' + c.id + '">';
    out += '<line class="leg leg-cathode" x1="' + pk.x + '" y1="' + pk.y + '" x2="' + bx.toFixed(1) +
      '" y2="' + by.toFixed(1) + '"/>';
    out += '<line class="leg leg-anode" x1="' + pa.x + '" y1="' + pa.y + '" x2="' + bx.toFixed(1) +
      '" y2="' + by.toFixed(1) + '"/>';

    /* silkscreen + tick beside the anode leg */
    var lx = bx - pa.x, ly = by - pa.y;
    var ll = Math.sqrt(lx * lx + ly * ly) || 1;
    out += '<text class="led-plus" x="' + (pa.x + lx * 0.34 - ly / ll * 9).toFixed(1) +
      '" y="' + (pa.y + ly * 0.34 + lx / ll * 9).toFixed(1) +
      '" text-anchor="middle" dominant-baseline="central">+</text>';

    out += '<g transform="translate(' + bx.toFixed(1) + ',' + by.toFixed(1) +
      ') rotate(' + deg.toFixed(1) + ')">';
    if (lit) {
      out += '<circle class="led-glow" r="' + (17 + 15 * b).toFixed(1) +
        '" opacity="' + (0.08 + 0.30 * b).toFixed(2) + '"/>';
    }
    out += '<path class="led-dome" d="M -6,-10.39 A 12,12 0 1 1 -6,10.39 Z"/>';
    out += '<line class="led-bar" x1="-14" y1="-8" x2="-14" y2="8"/>';
    if (lit) out += '<circle class="led-core" r="' + (2.8 + 2.6 * b).toFixed(1) + '"/>';
    if (state.damaged[c.id]) {
      out += '<line class="led-crack" x1="-5.5" y1="-5.5" x2="5.5" y2="5.5"/>';
      out += '<line class="led-crack" x1="5.5" y1="-5.5" x2="-5.5" y2="5.5"/>';
    }
    out += '</g></g>';
    return out;
  }

  function renderButton(c, cls) {
    var p1 = board.pos(c.a), p2 = board.pos(c.b);
    var m = midAngle(p1, p2);
    var down = state.buttonPressed;
    var out = '<g class="cmp button ' + cls + (down ? ' pressed' : '') +
      '" data-cmp="' + c.id + '">';
    out += '<line class="leg" x1="' + p1.x + '" y1="' + p1.y + '" x2="' + p2.x +
      '" y2="' + p2.y + '"/>';
    out += '<g transform="translate(' + m.x.toFixed(1) + ',' + m.y.toFixed(1) +
      ') rotate(' + m.deg.toFixed(1) + ')">';
    out += '<rect class="btn-body" x="-13" y="-12" width="26" height="24" rx="3"/>';
    out += '<circle class="btn-cap" r="' + (down ? 5.6 : 7.4) + '"/>';
    if (!down) out += '<circle class="btn-ring" r="9.4"/>';
    out += '</g></g>';
    return out;
  }

  function renderWire(c, cls) {
    var p1 = board.pos(c.a), p2 = board.pos(c.b);
    var colour = WIRE_COLOURS[c.colour % WIRE_COLOURS.length];
    var out = '<g class="cmp wire ' + cls + '" data-cmp="' + c.id + '">';
    out += '<path class="wire-jacket" d="' + wirePath(p1, p2) + '" stroke="' + colour + '"/>';
    out += '<circle class="wire-boot" cx="' + p1.x + '" cy="' + p1.y + '" r="3.6" fill="' + colour + '"/>';
    out += '<circle class="wire-boot" cx="' + p2.x + '" cy="' + p2.y + '" r="3.6" fill="' + colour + '"/>';
    out += '</g>';
    return out;
  }

  function renderComponents() {
    var res = state.result;
    var faulted = {};
    if (state.energised && res && res.focus) res.focus.forEach(function (id) { faulted[id] = true; });
    /* an over-driven LED still emits: it just does so out of spec */
    var litId = state.energised && res ? res.litLed : null;
    var drive = res && res.metrics ? (res.metrics.drive || 0) : 0;

    var order = { wire: 0, resistor: 1, button: 2, led: 3 };
    var sorted = state.components.slice().sort(function (a, b) {
      return order[a.type] - order[b.type];
    });

    layers.components.innerHTML = sorted.map(function (c) {
      var cls = faulted[c.id] ? 'fault' : '';
      if (state.damaged[c.id]) cls += ' damaged';
      if (c.type === 'wire') return renderWire(c, cls);
      if (c.type === 'resistor') return renderResistor(c, cls);
      if (c.type === 'button') return renderButton(c, cls);
      return renderLed(c, cls, c.id === litId, drive);
    }).join('');
  }

  /* ---- ghost preview -------------------------------------------------- */

  function renderGhost(cursor) {
    if (!state.pending) { layers.ghost.innerHTML = ''; return; }
    var p1 = board.pos(state.pending.hole);
    /* the anchor shows the moment a first leg is picked, before any mouse move */
    var out = '<circle class="ghost-anchor" cx="' + p1.x + '" cy="' + p1.y + '" r="7"/>';
    if (cursor) {
      out = '<line class="ghost-line" x1="' + p1.x + '" y1="' + p1.y +
        '" x2="' + cursor.x.toFixed(1) + '" y2="' + cursor.y.toFixed(1) + '"/>' + out;
    }
    layers.ghost.innerHTML = out;
  }

  function svgPoint(evt) {
    var svg = el.svg;
    var rect = svg.getBoundingClientRect();
    var vb = board.GEOM;
    var scale = Math.min(rect.width / vb.W, rect.height / vb.H);
    var ox = (rect.width - vb.W * scale) / 2;
    var oy = (rect.height - vb.H * scale) / 2;
    return {
      x: (evt.clientX - rect.left - ox) / scale,
      y: (evt.clientY - rect.top - oy) / scale
    };
  }

  /* ---- log ------------------------------------------------------------ */

  function log(tag, text, cls) {
    var line = document.createElement('div');
    line.className = 'log-line' + (cls ? ' ' + cls : '');
    line.innerHTML =
      '<span class="log-t">[t+' + clock() + ']</span>' +
      '<span class="log-tag">' + (tag || '').padEnd(4, ' ').replace(/ /g, '&nbsp;') + '</span>' +
      '<span class="log-msg"></span>';
    line.querySelector('.log-msg').textContent = text;
    el.log.appendChild(line);
    el.log.scrollTop = el.log.scrollHeight;
    return line;
  }

  function relog(line, text) {
    if (!line) return;
    line.querySelector('.log-msg').textContent = text;
    el.log.scrollTop = el.log.scrollHeight;
  }

  function logRule() {
    var d = document.createElement('div');
    d.className = 'log-rule';
    el.log.appendChild(d);
  }

  /* ---- adaptive tutor -------------------------------------------------- */

  /* The decision is deterministic here, per spec §4; the backend only words
     the hint. Attempt 1 wrong is visual feedback only, and a brand new fault
     type also gets one silent attempt before the tutor speaks. */
  /* Escalate on how many times THIS fault has repeated, not on total faults.
     Counting every fault meant a learner who made a different mistake first
     skipped the Socratic step and went straight to being told the answer. */
  function hintLevel() {
    var f = state.faults;
    if (f.length < 2) return 0;
    var code = f[f.length - 1].code;
    var streak = 0;
    for (var i = f.length - 1; i >= 0 && f[i].code === code; i--) streak++;
    if (streak < 2) return 0;
    return Math.min(4, streak);
  }

  var tutor = { base: null, model: null, probing: false, seq: 0 };

  function setTutorState(text, online) {
    el.tutorState.textContent = text;
    el.tutorState.parentNode.classList.toggle('online', !!online);
  }

  /* CC_TUTOR_BASE overrides discovery: a string pins the endpoint, null
     disables the tutor outright. Tests use it to stay off the real API. */
  function tutorProbe() {
    var forced = global.CC_TUTOR_BASE;
    if (forced === null) { setTutorState('OFFLINE · DIAGNOSTIC', false); return; }

    var bases = typeof forced === 'string' ? [forced] : [];
    if (!bases.length) {
      /* hosted build: the tutor lives on this origin, so no localhost probe */
      if (location.protocol.indexOf('http') === 0) bases.push('/api');
    }

    (function tryNext(i) {
      if (i >= bases.length) {
        setTutorState('OFFLINE · DIAGNOSTIC', false);
        return;
      }
      fetch(bases[i] + '/health', { method: 'GET' })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
        .then(function (d) {
          tutor.base = bases[i];
          tutor.model = d.model;
          setTutorState('ONLINE · ' + (d.model || 'LLM').toUpperCase(), true);
          log('SYS', 'adaptive tutor ONLINE · ' + d.model, 'sys');
        })
        .catch(function () { tryNext(i + 1); });
    })(0);
  }

  function requestHint(res, level) {
    if (!tutor.base) {
      log('SYS', 'tutor offline · hint level ' + level + ' withheld', 'dim');
      return;
    }
    var ch = state.challenge;

    var token = ++tutor.seq;
    var line = log('HINT', 'requesting level ' + level + ' hint...', 'hint pending');

    fetch(tutor.base + '/hint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tier: ch.tier,
        challenge: ch.id,
        code: res.code,
        attempts: state.attempts,
        level: level,
        readings: res.lines || [],
        previousHints: state.hints
      })
    })
      .then(function (r) {
        return r.json().then(function (d) {
          return r.ok ? d : Promise.reject(d.error || ('HTTP ' + r.status));
        });
      })
      .then(function (d) {
        if (token !== tutor.seq) return; /* superseded by a newer attempt */
        state.hints.push(d.hint);
        state.hintsRequested++;
        setTrace();
        line.classList.remove('pending');
        relog(line, d.hint);
      })
      .catch(function (err) {
        if (token !== tutor.seq) return;
        line.classList.remove('pending');
        line.classList.add('err-sub');
        relog(line, 'tutor unreachable, carry on without a hint');
        if (window.console) console.warn('hint request failed:', err);
      });
  }

  /* ---- readout / trace ------------------------------------------------ */

  function setReadout(m, live) {
    var vals = {
      'ro-vrail': (live ? m.vcc.toFixed(2) : '0.00') + ' V',
      'ro-i': live ? circuit.fmtA(m.current) : '0.00 mA',
      'ro-vled': live ? (m.vled < 0 ? '−' + Math.abs(m.vled).toFixed(2) : m.vled.toFixed(2)) + ' V' : '0.00 V',
      'ro-vr': live ? m.vres.toFixed(2) + ' V' : '0.00 V',
      'ro-r': circuit.fmtOhms(m.ohms || 0),
      'ro-p': live ? circuit.fmtW(m.power) : '0.0 mW'
    };
    Object.keys(vals).forEach(function (k) { $(k).textContent = vals[k]; });
  }

  function setTrace() {
    $('tr-attempts').textContent = n2(state.attempts);
    $('tr-faults').textContent = n2(state.faults.length);
    var last = state.faults[state.faults.length - 1];
    $('tr-last').textContent = last ? last.code : '—';
    $('tr-hints').textContent = n2(state.hintsRequested);
  }

  function tickClock() { $('tr-time').textContent = clock(); }

  /* ---- objectives ----------------------------------------------------- */

  function objectiveState() {
    var c = counts();
    var ch = state.challenge;
    var leds = state.components.filter(function (x) { return x.type === 'led'; });
    var straddles = leds.some(function (l) {
      var ha = board.HOLES[l.a], hb = board.HOLES[l.b];
      return ha && hb && ha.half !== hb.half && ha.half !== 'supply' && hb.half !== 'supply';
    });
    var map = {
      'LED seated': c.led > 0,
      'Resistor seated': c.resistor > 0,
      'SRC+ tied to the board': attach('SRC+').length > 0,
      'SRC− tied to the board': attach('SRC-').length > 0,
      'LED straddles the centre channel': straddles,
      'Button seated': c.button > 0,
      /* the limiter ships at 220; anything in kilohms is the pull the
         learner fitted */
      'Pull resistor seated': state.components.some(function (x) {
        return x.type === 'resistor' && x.ohms >= 1000;
      }),
      'IN tied to the logic block': attach('IN').length > 0
    };
    return ch.objectives.map(function (label) {
      return { label: label, done: !!map[label] };
    });
  }

  function renderObjectives() {
    el.objectives.innerHTML = objectiveState().map(function (o) {
      return '<li class="' + (o.done ? 'done' : '') + '">' +
        '<span class="obj-box" aria-hidden="true">' + (o.done ? '&#10003;' : '') + '</span>' +
        '<span>' + o.label + '</span></li>';
    }).join('');
  }

  /* ---- bin / tools ---------------------------------------------------- */

  function remaining(type) {
    var bin = state.challenge.bin[type];
    if (bin == null) return Infinity;
    return bin - counts()[type];
  }

  function renderBin() {
    PART_TYPES.forEach(function (type) {
      var btn = el.tools[type];
      btn.hidden = state.challenge.bin[type] == null;
      if (btn.hidden) return;
      var left = remaining(type);
      btn.querySelector('.part-count').textContent = left === Infinity ? '∞' : left;
      btn.classList.toggle('empty', left <= 0);
      btn.disabled = left <= 0 && state.tool !== type;
      btn.setAttribute('aria-pressed', String(state.tool === type));
    });
    el.tools.remove.setAttribute('aria-pressed', String(state.tool === 'remove'));
    el.svg.classList.toggle('tool-armed', !!state.tool);
  }

  /* ---- resistor stock ------------------------------------------------- */

  function renderValues() {
    var choices = state.challenge.resistorChoices;
    el.stockBlock.hidden = !choices;
    if (!choices) { el.rvals.innerHTML = ''; return; }
    el.rvals.innerHTML = choices.map(function (v) {
      return '<button class="rval' + (v === state.resistorValue ? ' on' : '') +
        '" type="button" data-ohms="' + v + '" aria-label="' + v + ' ohms" aria-pressed="' +
        (v === state.resistorValue) + '">' + v + '</button>';
    }).join('');
  }

  /* Picking a value with one already seated swaps it in place: the bench
     equivalent of pulling the part and dropping another into the same holes. */
  function selectResistor(ohms) {
    state.resistorValue = ohms;
    var placed = state.components.filter(function (c) { return c.type === 'resistor'; });
    if (placed.length === 1) {
      if (placed[0].ohms !== ohms) {
        snapshot();
        var old = placed[0].ohms;
        placed[0].ohms = ohms;
        deEnergise();
        log('BLD', 'RESISTOR swapped ' + old + ' Ω → ' + ohms + ' Ω at ' +
          board.label(placed[0].a) + ' → ' + board.label(placed[0].b));
        afterEdit();
      }
    } else if (!placed.length && state.tool !== 'resistor') {
      setTool('resistor');
    }
    renderValues();
    renderSubtitles();
    idleStatus();
  }

  function renderSubtitles() {
    var ch = state.challenge;
    $('part-led-sub').textContent = state.device.label + ' · Vf ' + state.device.vf.toFixed(2) + ' V';
    $('part-res-sub').textContent = ch.resistorChoices
      ? (state.resistorValue == null ? 'pick a value from stock' : state.resistorValue + ' Ω · ±5%')
      : circuit.fmtOhms(ch.resistorOhms) + ' · ' + (ch.resistorNote || '±5%');
  }

  function renderSpec() {
    var ch = state.challenge;
    var band = ch.rules && ch.rules.drive;
    var logic = ch.rules && ch.rules.logic;
    $('sp-vcc').textContent = ch.supply.toFixed(2) + ' V';
    $('sp-vf').textContent = state.device.vf.toFixed(2) + ' V';
    $('sp-imax').textContent = (state.device.imax * 1000).toFixed(0) + ' mA';
    $('sp-band-row').hidden = !band;
    $('sp-cond-row').hidden = !logic;
    if (band) $('sp-band').textContent = (band.min * 100).toFixed(0) + '–100%';
    if (logic) {
      $('sp-cond').textContent = 'LED ON while ' +
        (logic.on === 'pressed' ? 'HELD' : 'RELEASED');
    }
  }

  /* ---- digital input --------------------------------------------------- */

  function renderHold() {
    var down = state.buttonPressed;
    el.hold.setAttribute('aria-pressed', String(down));
    el.hold.classList.toggle('on', down);
    el.hold.querySelector('.btn-label').textContent = down ? 'RELEASE BUTTON' : 'PRESS BUTTON';
    $('ro-btn').textContent = down ? 'HELD' : 'RELEASED';
  }

  function toggleHold() {
    if (!isLogic()) return;
    state.buttonPressed = !state.buttonPressed;
    log('BLD', 'button ' + (state.buttonPressed ? 'held' : 'released'));
    renderHold();
    /* the level moves with the button, so re-read rather than invalidate */
    if (state.energised) evaluate(false);
    else { renderComponents(); updateProbe(null); }
  }

  function setLogicReadout(res) {
    var lg = res && res.logic;
    $('ro-in').textContent = lg ? lg.in : '—';
    $('ro-out').textContent = lg ? lg.out : '—';
    $('mcu-lamp').classList.toggle('on', !!(lg && lg.out === 'HIGH'));
  }

  /* ---- tier / variant progress ---------------------------------------- */

  function renderProgress() {
    var tiers = CC.challenges.TIERS;
    el.tierRail.innerHTML = tiers.map(function (t, i) {
      var built = t.variants.length > 0;
      var cls = 'tier' + (i === state.tierIndex ? ' current' : (built ? '' : ' locked'));
      var body = '<span class="tier-n">TIER ' + t.tier + '</span>' +
        '<span class="tier-name">' + t.name + '</span>';
      if (!built) return '<span class="' + cls + '">' + body + '</span>';
      return '<button class="' + cls + '" type="button" data-tier="' + i + '"' +
        (i === state.tierIndex ? ' aria-current="step"' : '') + '>' + body + '</button>';
    }).join('');

    el.dots.innerHTML = CC.challenges.TIERS[state.tierIndex].variants.map(function (v, i) {
      var cls = 'dot' + (i === state.variantIndex ? ' active' : (i < state.variantIndex ? ' cleared' : ''));
      return '<button class="' + cls + '" type="button" data-variant="' + i +
        '" aria-label="Variant ' + (i + 1) + ': ' + v.name + '"></button>';
    }).join('');
  }

  function setStatus(text, cls) {
    el.status.textContent = text;
    el.status.className = 'probe-status' + (cls ? ' ' + cls : '');
  }

  function toolName(tool) {
    if (tool === 'resistor' && state.challenge && state.challenge.resistorChoices) {
      return 'RESISTOR ' + state.resistorValue + ' Ω';
    }
    return tool.toUpperCase();
  }

  function idleStatus() {
    if (state.tool === 'remove') setStatus('REMOVE armed: click a part or one of its holes.');
    else if (state.tool) setStatus(toolName(state.tool) + ': ' + TOOL_HINT[state.tool][0]);
    else setStatus('Pick a part, or hover a hole to probe. Click a seated LED to flip it.');
  }

  function setTool(tool) {
    if (state.tool === tool) tool = null;
    if (tool && tool !== 'remove' && remaining(tool) <= 0) return;
    if (tool === 'resistor' && state.challenge.resistorChoices && state.resistorValue == null) {
      setStatus('RESISTOR: pick a value from stock first.', 'bad');
      return;
    }
    state.tool = tool;
    state.pending = null;
    layers.ghost.innerHTML = '';
    renderBin();
    idleStatus();
  }

  /* ---- placement ------------------------------------------------------ */

  function canSeat(type, holeId) {
    var h = board.HOLES[holeId];
    if (!h) return false;
    if ((h.row === 'SRC' || h.row === 'MCU') && type !== 'wire') return false;
    return true;
  }

  /* Jacket colour follows bench convention: copper for anything on the
     positive side, grey for the return, cycling colours for signal runs. */
  function wireColourFor(a, b) {
    function side(h, rails) {
      var hole = board.HOLES[h];
      return h === 'SRC' + rails.sign || (hole && rails.rows.indexOf(hole.row) !== -1);
    }
    var pos = [a, b].some(function (h) { return side(h, { sign: '+', rows: ['TP', 'BP'] }); });
    var neg = [a, b].some(function (h) { return side(h, { sign: '-', rows: ['TN', 'BN'] }); });
    if (pos && !neg) return 0;
    if (neg && !pos) return 2;
    return [1, 3, 4][state.wireColour++ % 3];
  }

  function place(type, a, b) {
    snapshot();
    var c = { id: 'c' + (++state.seq), type: type, a: a, b: b };
    if (type === 'resistor') c.ohms = state.resistorValue;
    if (type === 'wire') c.colour = wireColourFor(a, b);
    state.components.push(c);
    deEnergise();
    log('BLD', type.toUpperCase() + ' seated ' + board.label(a) + ' → ' + board.label(b));
    afterEdit();
    if (remaining(type) <= 0) setTool(null);
  }

  function removeAt(holeId) {
    var hits = attach(holeId);
    if (!hits.length) return;
    removeComponent(hits[hits.length - 1].id);
  }

  function removeComponent(id) {
    var c = state.components.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    snapshot();
    state.components = state.components.filter(function (x) { return x.id !== id; });
    deEnergise();
    log('BLD', c.type.toUpperCase() + ' removed from ' + board.label(c.a) + ' → ' + board.label(c.b));
    afterEdit();
  }

  function flipLed(id) {
    var c = state.components.filter(function (x) { return x.id === id && x.type === 'led'; })[0];
    if (!c) return;
    snapshot();
    var t = c.a; c.a = c.b; c.b = t;
    deEnergise();
    log('BLD', 'LED reversed: anode now ' + board.label(c.a));
    afterEdit();
  }

  function onHoleClick(holeId) {
    if (state.tool === 'remove') { removeAt(holeId); return; }

    if (!state.tool) {
      var here = attach(holeId);
      var led = here.filter(function (c) { return c.type === 'led'; })[0];
      if (led) { flipLed(led.id); return; }
      if (here.some(function (c) { return c.type === 'button'; })) toggleHold();
      return;
    }

    if (!canSeat(state.tool, holeId)) {
      setStatus('A ' + state.tool + ' leg cannot sit on a terminal post: use a jumper.', 'bad');
      return;
    }

    if (!state.pending) {
      state.pending = { tool: state.tool, hole: holeId };
      renderGhost(null);
      setStatus(toolName(state.tool) + ': ' + TOOL_HINT[state.tool][1] +
        ' · first leg at ' + board.label(holeId));
      return;
    }
    if (state.pending.hole === holeId) {
      state.pending = null;
      layers.ghost.innerHTML = '';
      idleStatus();
      return;
    }
    var first = state.pending.hole;
    state.pending = null;
    layers.ghost.innerHTML = '';
    place(state.tool, first, holeId);
    idleStatus();
  }

  function afterEdit() {
    renderComponents();
    renderBin();
    renderObjectives();
    renderSubtitles();
    updateProbe(null);
  }

  /* ---- probe ---------------------------------------------------------- */

  function updateProbe(holeId) {
    if (!holeId) { el.probe.textContent = '—'; return; }
    var uf = circuit.buildNets(state.components, state.buttonPressed);
    var names = circuit.nodeNames(state.components, uf);
    var root = uf.find(holeId);
    var name = names[root];
    var ties = state.components.filter(function (c) {
      return uf.find(c.a) === root || uf.find(c.b) === root;
    }).length;
    el.probe.textContent = board.label(holeId) + '  ·  node ' + (name || 'floating') +
      '  ·  ties ' + ties;
  }

  /* ---- power cycle ---------------------------------------------------- */

  function deEnergise() {
    if (!state.energised) return;
    state.energised = false;
    state.result = null;
    state.damaged = {};
    el.power.classList.remove('on');
    el.power.querySelector('.btn-label').textContent = 'POWER ON';
    el.svg.classList.remove('energised');
    $('psu-lamp').classList.remove('on');
    setReadout({ vcc: 0, current: 0, vled: 0, vres: 0, ohms: 0, power: 0 }, false);
    setLogicReadout(null);
    el.verdict.className = 'verdict';
    el.verdict.textContent = '';
    renderComponents();
  }

  function shake() {
    el.boardWrap.classList.remove('shake');
    void el.boardWrap.offsetWidth;
    el.boardWrap.classList.add('shake');
  }

  function energise() {
    if (state.energised) { deEnergise(); idleStatus(); return; }

    state.energised = true;
    el.power.classList.add('on');
    el.power.querySelector('.btn-label').textContent = 'POWER OFF';
    el.svg.classList.add('energised');
    $('psu-lamp').classList.add('on');

    evaluate(true);
  }

  /* Re-read the board under power. Toggling the button re-reads without
     counting a fresh attempt: it is one build being probed, not two. */
  function evaluate(isAttempt) {
    var res = circuit.analyze(state.components, state.challenge,
      { pressed: state.buttonPressed });
    state.result = res;
    state.damaged = {};
    (res.damaged || []).forEach(function (id) { state.damaged[id] = true; });

    if (isAttempt && !state.solved) state.attempts++;

    logRule();
    log('SYS', 'rail energised · ' + state.challenge.supply.toFixed(2) + ' V · attempt ' +
      n2(state.attempts) + (isLogic() ? ' · button ' +
        (state.buttonPressed ? 'held' : 'released') : ''), 'sys');

    var uf = circuit.buildNets(state.components, state.buttonPressed);
    var nodes = {};
    state.components.forEach(function (c) { nodes[uf.find(c.a)] = 1; nodes[uf.find(c.b)] = 1; });
    var c = counts();
    log('NET', 'nodes ' + Object.keys(nodes).length + ' · elements ' + (c.led + c.resistor) +
      ' · jumpers ' + c.wire + (isLogic() ? ' · buttons ' + c.button : ''));

    if (res.ok) {
      log('OK', res.headline, 'ok');
      res.lines.forEach(function (l) { log('', l, 'ok-sub'); });
      if (!state.solved) {
        state.solved = true;
        log('SYS', 'challenge ' + state.challenge.id + ' complete', 'sys');
      }
      el.verdict.className = 'verdict good';
      el.verdict.textContent = (isLogic() ? 'LOGIC VERIFIED: ' : 'LED EMITTING: ') +
        state.challenge.id + ' COMPLETE';
      el.next.hidden = false;
      el.next.textContent = nextLabel();
      setStatus('Loop closed. ' + res.lines[0], 'good');
    } else {
      log('ERR', res.headline, 'err');
      res.lines.forEach(function (l) { log('', l, 'err-sub'); });
      if (isAttempt) {
        state.faults.push({
          code: res.code, tier: state.challenge.tier,
          challenge: state.challenge.id, t: Date.now()
        });
      }
      el.verdict.className = 'verdict bad';
      el.verdict.textContent = res.headline;
      setStatus(res.headline + (res.litLed ? ', out of spec.' : ', LED stays dark.'), 'bad');
      if (isAttempt) {
        shake();
        var level = hintLevel();
        if (level) requestHint(res, level);
      }
    }

    setReadout(res.metrics || { vcc: 0, current: 0, vled: 0, vres: 0, ohms: 0, power: 0 }, true);
    setLogicReadout(res);
    setTrace();
    renderComponents();
  }

  /* ---- challenge lifecycle -------------------------------------------- */

  function tierAt(i) { return CC.challenges.TIERS[i]; }

  function loadChallenge(tierIndex, index, opts) {
    var tiers = CC.challenges.TIERS;
    state.tierIndex = Math.max(0, Math.min(tiers.length - 1, tierIndex));
    var list = tiers[state.tierIndex].variants;
    state.variantIndex = Math.max(0, Math.min(list.length - 1, index));
    var ch = list[state.variantIndex];
    state.challenge = ch;
    state.device = circuit.deviceOf(ch);
    state.wireColour = 0;
    state.components = ch.preplaced.map(function (p) {
      /* a typo'd hole would silently open the loop: surface it instead */
      [p.a, p.b].forEach(function (h) {
        if (!board.HOLES[h]) console.error(ch.id + ': unknown hole "' + h + '"');
      });
      var c = { id: 'c' + (++state.seq), type: p.type, a: p.a, b: p.b };
      if (p.ohms) c.ohms = p.ohms;
      if (p.type === 'wire') c.colour = wireColourFor(p.a, p.b);
      return c;
    });
    state.tool = null;
    state.pending = null;
    state.energised = false;
    state.solved = false;
    state.result = null;
    state.damaged = {};
    if (!opts || !opts.keepTrace) {
      state.attempts = 0;
      state.faults = [];
      state.hintsRequested = 0;
      state.hints = [];
    }
    state.startedAt = Date.now();
    state.undo = [];

    /* With a stock strip, start on whatever is already fitted so the strip
       reflects the board, and leave it unset otherwise rather than defaulting
       to a value: a pre-selected choice would be seeding an answer. Without a
       strip the challenge names the part outright; a resistor already on the
       board is scenery (Tier 3's limiter), not the one being placed. */
    var seated = state.components.filter(function (c) { return c.type === 'resistor'; })[0];
    state.resistorValue = ch.resistorChoices
      ? (seated ? seated.ohms : null)
      : (ch.resistorOhms || 220);

    el.chTitle.textContent = ch.name;
    el.chId.textContent = ch.id;
    el.chBrief.textContent = ch.brief;
    el.next.hidden = true;
    el.verdict.className = 'verdict';
    el.verdict.textContent = '';
    $('psu-volts').textContent = ch.supply.toFixed(2) + ' V';
    el.power.classList.remove('on');
    el.power.querySelector('.btn-label').textContent = 'POWER ON';
    el.svg.classList.remove('energised');
    $('psu-lamp').classList.remove('on');

    state.buttonPressed = false;
    board.setLogic(isLogic());
    el.svg.classList.toggle('has-logic', isLogic());
    el.logicBlock.hidden = !isLogic();
    el.logicRow.hidden = !isLogic();
    renderProgress();
    renderSpec();
    renderValues();
    renderHold();

    el.log.innerHTML = '';
    log('SYS', 'CircuitCoach · tier ' + ch.tier + ' · ' + ch.id + ' "' + ch.name + '"', 'sys');
    log('SYS', 'supply ' + ch.supply.toFixed(2) + ' V · LED Vf ' + state.device.vf.toFixed(2) +
      ' V · I_max ' + (state.device.imax * 1000).toFixed(0) + ' mA', 'sys');
    if (isLogic()) {
      log('SYS', 'logic block OUT = IN · condition: LED on while ' +
        (ch.rules.logic.on === 'pressed' ? 'held' : 'released'), 'sys');
    }
    if (ch.rules && ch.rules.drive) {
      log('SYS', 'target band ' + (ch.rules.drive.min * 100).toFixed(0) +
        '–100% of rated drive · stock ' + ch.resistorChoices.join('/') + ' Ω', 'sys');
    }
    log('SYS', 'adaptive tutor OFFLINE: diagnostic instrumentation only', 'dim');

    setReadout({ vcc: 0, current: 0, vled: 0, vres: 0, ohms: 0, power: 0 }, false);
    setTrace();
    afterEdit();
    idleStatus();
  }

  function nextTierIndex() {
    var tiers = CC.challenges.TIERS;
    for (var i = state.tierIndex + 1; i < tiers.length; i++) {
      if (tiers[i].variants.length) return i;
    }
    return -1;
  }

  function nextLabel() {
    if (state.variantIndex + 1 < tierAt(state.tierIndex).variants.length) return 'NEXT CHALLENGE ›';
    var nt = nextTierIndex();
    return nt >= 0 ? 'START TIER ' + tierAt(nt).tier + ' ›' : 'NEXT CHALLENGE ›';
  }

  function nextChallenge() {
    if (state.variantIndex + 1 < tierAt(state.tierIndex).variants.length) {
      loadChallenge(state.tierIndex, state.variantIndex + 1);
      return;
    }
    var nt = nextTierIndex();
    if (nt >= 0) { loadChallenge(nt, 0); return; }
    log('SYS', 'tier ' + tierAt(state.tierIndex).tier + ' cleared: tier 3 not built yet', 'sys');
    el.verdict.className = 'verdict good';
    el.verdict.textContent = 'ALL BUILT TIERS CLEARED';
    el.next.hidden = true;
  }

  function clearBoard() {
    snapshot();
    state.components = [];
    state.wireColour = 0;
    deEnergise();
    log('BLD', 'board cleared');
    afterEdit();
  }

  function undo() {
    if (!state.undo.length) return;
    state.components = state.undo.pop();
    deEnergise();
    log('BLD', 'undo');
    afterEdit();
  }

  /* ---- keyboard ------------------------------------------------------- */

  function setFocusHole(id) {
    if (!board.HOLES[id]) return;
    state.focusHole = id;
    var target = layers.hits.querySelector('[data-hole="' + CSS.escape(id) + '"]');
    layers.hits.querySelectorAll('.hole-hit').forEach(function (c) { c.setAttribute('tabindex', '-1'); });
    if (target) { target.setAttribute('tabindex', '0'); target.focus(); }
    updateProbe(id);
  }

  function onKey(e) {
    var inHole = document.activeElement && document.activeElement.classList &&
      document.activeElement.classList.contains('hole-hit');

    if (e.key === 'Escape') {
      if (state.pending) { state.pending = null; layers.ghost.innerHTML = ''; idleStatus(); }
      else setTool(null);
      return;
    }
    if (inHole) {
      var d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (d) {
        var nxt = board.neighbour(state.focusHole, d[0], d[1]);
        if (nxt) { e.preventDefault(); setFocusHole(nxt); }
        return;
      }
      if (e.key === 'Enter') { e.preventDefault(); onHoleClick(state.focusHole); return; }
    }
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    var k = e.key.toLowerCase();
    if (k === 'l') setTool('led');
    else if (k === 'r') setTool('resistor');
    else if (k === 'w') setTool('wire');
    else if (k === 'b' && isLogic()) setTool('button');
    else if (k === 'h') toggleHold();
    else if (k === 'x') setTool('remove');
    else if (k === 'z' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); undo(); }
    else if (e.key === ' ' && !inHole) { e.preventDefault(); energise(); }
  }

  /* ---- boot ----------------------------------------------------------- */

  function boot() {
    el.svg = $('board');
    el.boardWrap = $('board-wrap');
    el.log = $('log');
    el.probe = $('probe-node');
    el.status = $('probe-status');
    el.verdict = $('verdict');
    el.power = $('btn-power');
    el.next = $('btn-next');
    el.objectives = $('objectives');
    el.chTitle = $('ch-title');
    el.chId = $('ch-id');
    el.chBrief = $('ch-brief');
    el.dots = $('ch-dots');
    el.tierRail = $('tier-rail');
    el.rvals = $('rvals');
    el.tutorState = $('term-state-text');
    el.stockBlock = $('stock-block');
    el.logicBlock = $('logic-block');
    el.logicRow = $('logic-row');
    el.hold = $('btn-hold');
    el.tools = {
      led: $('tool-led'),
      resistor: $('tool-resistor'),
      wire: $('tool-wire'),
      button: $('tool-button'),
      remove: $('tool-remove')
    };

    layers = board.render(el.svg);

    layers.hits.addEventListener('click', function (e) {
      var id = e.target.getAttribute('data-hole');
      if (id) onHoleClick(id);
    });
    layers.hits.addEventListener('mouseover', function (e) {
      var id = e.target.getAttribute('data-hole');
      if (id) { e.target.classList.add('hover'); updateProbe(id); }
    });
    layers.hits.addEventListener('mouseout', function (e) {
      e.target.classList.remove('hover');
      updateProbe(null);
    });
    layers.hits.addEventListener('focusin', function (e) {
      var id = e.target.getAttribute('data-hole');
      if (id) { state.focusHole = id; updateProbe(id); }
    });

    layers.components.addEventListener('click', function (e) {
      var g = e.target.closest('.cmp');
      if (!g) return;
      var id = g.getAttribute('data-cmp');
      if (state.tool === 'remove') removeComponent(id);
      else if (!state.tool) flipLed(id);
    });

    el.svg.addEventListener('mousemove', function (e) {
      if (state.pending) renderGhost(svgPoint(e));
    });
    el.svg.addEventListener('mouseleave', function () {
      if (state.pending) layers.ghost.innerHTML = '';
    });

    PART_TYPES.concat(['remove']).forEach(function (type) {
      el.tools[type].addEventListener('click', function () { setTool(type); });
    });
    $('btn-clear').addEventListener('click', clearBoard);
    $('btn-undo').addEventListener('click', undo);
    el.power.addEventListener('click', energise);
    el.next.addEventListener('click', nextChallenge);
    $('btn-restart').addEventListener('click', function () {
      loadChallenge(state.tierIndex, state.variantIndex);
    });

    el.dots.addEventListener('click', function (e) {
      var i = e.target.getAttribute('data-variant');
      if (i !== null) loadChallenge(state.tierIndex, +i);
    });
    el.tierRail.addEventListener('click', function (e) {
      var t = e.target.closest('[data-tier]');
      if (t) loadChallenge(+t.getAttribute('data-tier'), 0);
    });
    el.hold.addEventListener('click', toggleHold);
    el.rvals.addEventListener('click', function (e) {
      var v = e.target.getAttribute('data-ohms');
      if (v !== null) selectResistor(+v);
    });

    document.addEventListener('keydown', onKey);

    loadChallenge(0, 0);
    tutorProbe();
    setInterval(tickClock, 1000);

    /* one tab stop into the grid, arrows move from there */
    var first = layers.hits.querySelector('[data-hole="A1"]');
    if (first) first.setAttribute('tabindex', '0');
  }

  /* The tutor's read surface: exactly the spec §4 session state. The hint
     engine consumes this rather than reaching into app internals. */
  CC.session = {
    trace: function () {
      return {
        tier: state.challenge ? state.challenge.tier : null,
        challenge: state.challenge ? state.challenge.id : null,
        attempts: state.attempts,
        hintsRequested: state.hintsRequested,
        hints: state.hints.slice(),
        faults: state.faults.slice(),
        secondsOnTask: Math.floor((Date.now() - state.startedAt) / 1000)
      };
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
