/* circuit.js: netlist extraction, path search, and deterministic fault
   classification. No AI here and none needed: every Tier 1 verdict is a
   pure function of the board state. */
(function (global) {
  'use strict';
  var CC = (global.CC = global.CC || {});
  var board = CC.board;

  var LED = { vf: 2.0, imax: 0.020, rdyn: 2.5, label: 'red', tint: 'warm' };

  /* Tier 2 varies forward voltage per challenge; anything unstated falls back
     to the Tier 1 device, so existing challenges keep their behaviour. */
  function deviceOf(challenge) {
    var d = (challenge && challenge.led) || {};
    return {
      vf: d.vf != null ? d.vf : LED.vf,
      imax: d.imax != null ? d.imax : LED.imax,
      rdyn: d.rdyn != null ? d.rdyn : LED.rdyn,
      label: d.label || LED.label,
      tint: d.tint || LED.tint
    };
  }

  var ERR = {
    NO_LED: 'no_led',
    NO_RESISTOR: 'no_resistor',
    UNDER_DRIVEN: 'under_driven',
    SUPPLY_OPEN: 'supply_open',
    SHORT: 'short_circuit',
    LED_SHORTED: 'led_shorted',
    RES_SHORTED: 'resistor_shorted',
    OPEN: 'open_circuit',
    REVERSED: 'reversed_polarity',
    NO_LIMIT: 'no_current_limit',
    BYPASSED: 'led_bypassed',
    NOT_IN_PATH: 'led_not_in_path',
    NO_STRADDLE: 'led_not_straddling',
    NO_BUTTON: 'no_button',
    INPUT_FLOATING: 'input_floating',
    INPUT_STUCK: 'input_stuck',
    LOGIC_INVERTED: 'logic_inverted'
  };

  var LEVEL = { HIGH: 'HIGH', LOW: 'LOW', FLOAT: 'FLOAT' };

  /* ---- union-find over holes ----------------------------------------- */

  function UF() { this.p = Object.create(null); }
  UF.prototype.find = function (x) {
    if (!(x in this.p)) { this.p[x] = x; return x; }
    while (this.p[x] !== x) { this.p[x] = this.p[this.p[x]]; x = this.p[x]; }
    return x;
  };
  UF.prototype.union = function (a, b) {
    a = this.find(a); b = this.find(b);
    if (a !== b) this.p[a] = b;
  };

  /* Fixed copper inside the board: five holes per terminal-strip column,
     one continuous strip per rail, top and bottom rails independent. */
  function baseNets() {
    var uf = new UF();
    var cols = board.GEOM.cols;
    for (var c = 1; c <= cols; c++) {
      ['B', 'C', 'D', 'E'].forEach(function (r) { uf.union('A' + c, r + c); });
      ['G', 'H', 'I', 'J'].forEach(function (r) { uf.union('F' + c, r + c); });
    }
    board.RAIL_ROWS.forEach(function (rail) {
      var anchor = null;
      for (var c = 1; c <= cols; c++) {
        var id = rail + c;
        if (!board.HOLES[id]) continue;
        if (anchor === null) anchor = id; else uf.union(anchor, id);
      }
    });
    uf.find('SRC+');
    uf.find('SRC-');
    return uf;
  }

  /* A button is a switch, not an element: closed it is bare copper, open it is
     nothing at all. Folding it into the nets keeps every downstream check
     working without special cases: shorts, path search, logic levels. */
  function buildNets(components, pressed) {
    var uf = baseNets();
    components.forEach(function (c) {
      if (c.type === 'wire') uf.union(c.a, c.b);
      else if (c.type === 'button' && pressed) uf.union(c.a, c.b);
    });
    return uf;
  }

  /* Stable short names (N1, N2, ...) for anything the learner actually
     tied together, so the probe readout is legible. */
  function nodeNames(components, uf) {
    var names = {};
    var seq = 0;
    names[uf.find('SRC+')] = 'SRC+';
    names[uf.find('SRC-')] = 'SRC−';
    components.forEach(function (c) {
      [c.a, c.b].forEach(function (h) {
        var root = uf.find(h);
        if (!(root in names)) names[root] = 'N' + (++seq);
      });
    });
    return names;
  }

  /* ---- graph over nets ------------------------------------------------ */

  function elementsOf(components) {
    return components.filter(function (c) {
      return c.type === 'led' || c.type === 'resistor';
    });
  }

  function buildGraph(elements, uf) {
    var adj = Object.create(null);
    elements.forEach(function (el) {
      var na = uf.find(el.a), nb = uf.find(el.b);
      if (na === nb) return; /* shorted out by the strip, carries no path */
      (adj[na] = adj[na] || []).push({ to: nb, el: el, forward: true });
      (adj[nb] = adj[nb] || []).push({ to: na, el: el, forward: false });
    });
    return adj;
  }

  /* Every simple path SRC+ -> SRC- through the two-terminal elements. The
     graph is tiny (a handful of parts), so exhaustive search is fine. */
  function findPaths(adj, start, goal, cap) {
    var out = [];
    var seen = Object.create(null);
    (function walk(node, trail) {
      if (out.length >= cap) return;
      if (node === goal) { out.push(trail.slice()); return; }
      seen[node] = true;
      (adj[node] || []).forEach(function (edge) {
        if (seen[edge.to]) return;
        trail.push(edge);
        walk(edge.to, trail);
        trail.pop();
      });
      seen[node] = false;
    })(start, []);
    return out;
  }

  function pathHas(path, type) {
    return path.some(function (e) { return e.el.type === type; });
  }
  function pathResistance(path) {
    return path.reduce(function (sum, e) {
      return e.el.type === 'resistor' ? sum + (e.el.ohms || 0) : sum;
    }, 0);
  }
  function ledEdges(path) {
    return path.filter(function (e) { return e.el.type === 'led'; });
  }

  /* ---- analysis ------------------------------------------------------- */

  function fmtA(amps) {
    var ma = amps * 1000;
    if (ma >= 1000) return (ma / 1000).toFixed(2) + ' A';
    return ma.toFixed(2) + ' mA';
  }

  function pct(ratio) { return (ratio * 100).toFixed(0) + '%'; }

  function fmtOhms(r) {
    if (r === Infinity) return 'open';
    if (r >= 1000) return (r / 1000) + ' kΩ';
    return r + ' Ω';
  }

  function fmtW(watts) {
    var mw = watts * 1000;
    if (mw >= 1000) return (mw / 1000).toFixed(2) + ' W';
    return mw.toFixed(1) + ' mW';
  }

  function result(code, opts) {
    var r = {
      ok: false,
      code: code,
      headline: '',
      lines: [],
      focus: [],
      metrics: null
    };
    Object.keys(opts || {}).forEach(function (k) { r[k] = opts[k]; });
    return r;
  }

  /* The Tier 1/2 solver, with its source and sink made parameters. Tier 3
     reuses it verbatim for the output branch, driving it from LOGIC OUT
     instead of the bench supply. */
  function analyzePassive(components, challenge, opts) {
    opts = opts || {};
    var source = opts.source || 'SRC+';
    var sink = opts.sink || 'SRC-';
    var srcLabel = opts.sourceLabel || 'SRC+';
    var sinkLabel = opts.sinkLabel || 'SRC−';
    var rules = (challenge && challenge.rules) || {};
    var vcc = (challenge && challenge.supply) || 5.0;
    var dev = deviceOf(challenge);
    var rated = (dev.imax * 1000).toFixed(0) + ' mA';

    var leds = components.filter(function (c) { return c.type === 'led'; });
    var resistors = components.filter(function (c) { return c.type === 'resistor'; });
    var wires = components.filter(function (c) { return c.type === 'wire'; });

    var idle = {
      vcc: vcc, current: 0, vled: 0, vres: 0,
      ohms: resistors.length ? resistors[0].ohms : 0,
      power: 0, brightness: 0, drive: 0
    };

    if (!leds.length) {
      return result(ERR.NO_LED, {
        headline: 'NO EMITTER ON BUS',
        lines: ['LED not seated on the board.'],
        metrics: idle
      });
    }
    var touchesPlus = components.some(function (c) { return c.a === source || c.b === source; });
    var touchesMinus = components.some(function (c) { return c.a === sink || c.b === sink; });
    if (!touchesPlus || !touchesMinus) {
      return result(ERR.SUPPLY_OPEN, {
        headline: 'SUPPLY FLOATING',
        lines: [
          (!touchesPlus && !touchesMinus)
            ? srcLabel + ' and ' + sinkLabel + ' are both unterminated.'
            : (!touchesPlus ? srcLabel + ' is unterminated.' : sinkLabel + ' is unterminated.'),
          'I = 0.00 mA · bus de-energised.'
        ],
        metrics: idle
      });
    }

    var uf = buildNets(components, opts.pressed);
    var names = nodeNames(components, uf);
    var nPlus = uf.find(source), nMinus = uf.find(sink);

    if (nPlus === nMinus) {
      return result(ERR.SHORT, {
        headline: 'BUS FAULT: HARD SHORT',
        lines: [
          srcLabel + ' and ' + sinkLabel + ' share one node with no series impedance.',
          'Supply current limit tripped. Rail collapsed to 0.00 V.'
        ],
        focus: wires.map(function (w) { return w.id; }),
        metrics: { vcc: 0, current: 0, vled: 0, vres: 0, ohms: 0, power: 0, brightness: 0, drive: 0 }
      });
    }

    var shortedLed = leds.filter(function (l) { return uf.find(l.a) === uf.find(l.b); });
    if (shortedLed.length) {
      return result(ERR.LED_SHORTED, {
        headline: 'EMITTER BYPASSED',
        lines: [
          'Both LED legs land on node ' + (names[uf.find(shortedLed[0].a)] || '?') + '.',
          'The strip carries the current around the device. V_LED = 0.00 V.'
        ],
        focus: shortedLed.map(function (l) { return l.id; }),
        metrics: idle
      });
    }

    var shortedRes = resistors.filter(function (r) { return uf.find(r.a) === uf.find(r.b); });
    if (shortedRes.length && resistors.length === shortedRes.length) {
      return result(ERR.RES_SHORTED, {
        headline: 'SERIES ELEMENT BYPASSED',
        lines: [
          'Both resistor legs land on node ' + (names[uf.find(shortedRes[0].a)] || '?') + '.',
          'No limiting impedance is in circuit.'
        ],
        focus: shortedRes.map(function (r) { return r.id; }),
        metrics: idle
      });
    }

    var adj = buildGraph(elementsOf(components), uf);
    var paths = findPaths(adj, nPlus, nMinus, 64);

    /* A missing resistor is only worth reporting as such while the loop is
       still open. Close the loop without one and the instrument reports what
       actually happens instead: the LED cooks. */
    if (!paths.length) {
      if (rules.requireResistor !== false && !resistors.length) {
        return result(ERR.NO_RESISTOR, {
          headline: 'NO SERIES ELEMENT',
          lines: ['Resistor not seated on the board.', 'Loop open · I = 0.00 mA.'],
          metrics: idle
        });
      }
      return result(ERR.OPEN, {
        headline: 'CONTINUITY: OPEN',
        lines: [
          'No conducting path from ' + srcLabel + ' back to ' + sinkLabel + '.',
          'I = 0.00 mA · V_LED = 0.00 V.'
        ],
        metrics: idle
      });
    }

    var forward = [], reverse = [], bypass = [];
    paths.forEach(function (p) {
      var le = ledEdges(p);
      if (!le.length) bypass.push(p);
      else if (le.every(function (e) { return e.forward; })) forward.push(p);
      else reverse.push(p);
    });

    if (bypass.length) {
      var bp = bypass[0];
      return result(ERR.BYPASSED, {
        headline: 'PARALLEL PATH DETECTED',
        lines: [
          'Current reaches SRC− through ' +
            (bp.length ? bp.map(function (e) { return e.el.type; }).join(' → ') : 'bare copper') +
            ' without crossing the LED.',
          'The emitter sits across 0.00 V.'
        ],
        focus: bp.map(function (e) { return e.el.id; }),
        metrics: idle
      });
    }

    if (!forward.length) {
      if (reverse.length) {
        return result(ERR.REVERSED, {
          headline: 'LED REVERSE-BIASED',
          lines: [
            'The only closed loop enters the LED at the cathode.',
            'V_LED = −' + vcc.toFixed(2) + ' V · I = 0.00 mA · junction blocking.'
          ],
          focus: ledEdges(reverse[0]).map(function (e) { return e.el.id; }),
          metrics: {
            vcc: vcc, current: 0, vled: -vcc, vres: 0,
            ohms: pathResistance(reverse[0]), power: 0, brightness: 0, drive: 0
          }
        });
      }
      return result(ERR.NOT_IN_PATH, {
        headline: 'EMITTER OUT OF CIRCUIT',
        lines: ['A loop exists, but the LED is not part of it.'],
        metrics: idle
      });
    }

    /* A forward loop exists. Prefer one that is actually current-limited. */
    var chosen = forward.filter(function (p) { return pathHas(p, 'resistor'); })[0] || forward[0];
    var r = pathResistance(chosen);
    var led = ledEdges(chosen)[0].el;

    if (!pathHas(chosen, 'resistor')) {
      var iFault = (vcc - dev.vf) / dev.rdyn;
      return result(ERR.NO_LIMIT, {
        headline: 'OVERCURRENT: EMITTER DESTROYED',
        lines: [
          'LED sits directly across the rail with no series resistance.',
          'I ≈ ' + fmtA(iFault) + ' against a ' + rated + ' rating (' +
            pct(iFault / dev.imax) + ').'
        ],
        focus: [led.id],
        damaged: [led.id],
        metrics: {
          vcc: vcc, current: iFault, vled: dev.vf, vres: 0, ohms: 0,
          power: iFault * dev.vf, brightness: 0, drive: iFault / dev.imax
        }
      });
    }

    var current = Math.max(0, (vcc - dev.vf) / r);
    var drive = current / dev.imax;
    var metrics = {
      vcc: vcc,
      current: current,
      vled: dev.vf,
      vres: current * r,
      ohms: r,
      power: current * dev.vf,
      brightness: Math.min(1, drive),
      drive: drive
    };

    /* Same fault code as an unlimited LED, scaled by how far over rating it
       actually sits: past 2x the junction goes, below that it just runs hot. */
    if (drive > 1.001) {
      var destroyed = drive > 2;
      return result(ERR.NO_LIMIT, {
        headline: destroyed ? 'OVERCURRENT: EMITTER DESTROYED'
          : 'OVERCURRENT: OUTSIDE SAFE OPERATING AREA',
        lines: [
          'R_series = ' + r + ' Ω · V_R = ' + metrics.vres.toFixed(2) + ' V',
          'I = ' + fmtA(current) + ' against a ' + rated + ' rating (' + pct(drive) + ').',
          destroyed ? 'Junction past its thermal limit. Emitter dark.'
            : 'Emitter conducting outside its rated drive.'
        ],
        focus: [led.id],
        damaged: destroyed ? [led.id] : [],
        litLed: destroyed ? null : led.id,
        metrics: metrics
      });
    }

    if (rules.drive && drive < rules.drive.min * 0.999) {
      return result(ERR.UNDER_DRIVEN, {
        headline: 'UNDER-DRIVEN: BELOW TARGET BAND',
        lines: [
          'R_series = ' + r + ' Ω · V_R = ' + metrics.vres.toFixed(2) + ' V',
          'I = ' + fmtA(current) + ' against a ' + rated + ' rating (' + pct(drive) + ').',
          'Target band ' + pct(rules.drive.min) + '–100% of rated. LED: DIM.'
        ],
        focus: [led.id],
        litLed: led.id,
        metrics: metrics
      });
    }

    if (rules.ledStraddlesRavine) {
      var ha = board.HOLES[led.a], hb = board.HOLES[led.b];
      if (!ha || !hb || ha.half === hb.half) {
        return result(ERR.NO_STRADDLE, {
          headline: 'CONSTRAINT NOT MET',
          lines: [
            'Loop is electrically sound, but both LED legs sit in the ' +
              ((ha && ha.half) || 'same') + ' half.',
            'This build calls for the device to straddle the centre channel.'
          ],
          focus: [led.id],
          metrics: metrics
        });
      }
    }

    return {
      ok: true,
      code: 'ok',
      headline: 'CONTINUITY: CLOSED',
      lines: [
        'I = ' + fmtA(current) + ' · V_LED = ' + dev.vf.toFixed(2) +
          ' V · V_R = ' + metrics.vres.toFixed(2) + ' V',
        'LED: EMITTING · ' + (rules.drive ? pct(drive) + ' of rated drive · ' : '') +
          'P = ' + fmtW(metrics.power)
      ],
      focus: [],
      litLed: led.id,
      path: chosen,
      metrics: metrics
    };
  }

  /* ---- tier 3: digital input ------------------------------------------ */

  /* Lowest resistance from one net to another across resistors only. Wires and
     closed buttons already collapsed into nets, so they cost nothing. An LED is
     deliberately not a path here: a diode does not define a logic level. */
  function resistanceTo(uf, resistors, fromNet, toNet) {
    if (fromNet === toNet) return 0;
    var dist = Object.create(null);
    var seen = Object.create(null);
    dist[fromNet] = 0;
    for (;;) {
      var best = null, bestD = Infinity;
      Object.keys(dist).forEach(function (n) {
        if (!seen[n] && dist[n] < bestD) { bestD = dist[n]; best = n; }
      });
      if (best === null) return Infinity;
      if (best === toNet) return bestD;
      seen[best] = true;
      resistors.forEach(function (r) {
        var na = uf.find(r.a), nb = uf.find(r.b);
        if (na === nb) return;
        var other = na === best ? nb : (nb === best ? na : null);
        if (other === null) return;
        var d = bestD + (r.ohms || 0);
        if (dist[other] === undefined || d < dist[other]) dist[other] = d;
      });
    }
  }

  /* What the input pin actually reads. Whichever rail it can reach through the
     least resistance wins; reaching neither is the floating-input fault the
     pull resistor exists to prevent. */
  function inputLevel(components, pressed) {
    var uf = buildNets(components, pressed);
    var resistors = components.filter(function (c) { return c.type === 'resistor'; });
    var nIn = uf.find('IN');
    var rHigh = resistanceTo(uf, resistors, nIn, uf.find('SRC+'));
    var rLow = resistanceTo(uf, resistors, nIn, uf.find('SRC-'));
    var level;
    if (rHigh === Infinity && rLow === Infinity) level = LEVEL.FLOAT;
    else if (rHigh === rLow) level = LEVEL.FLOAT; /* equal pull both ways */
    else level = rHigh < rLow ? LEVEL.HIGH : LEVEL.LOW;
    /* equal pull both ways is contention; equally *absent* is just floating */
    return {
      level: level, rHigh: rHigh, rLow: rLow,
      contention: rHigh === rLow && rHigh !== Infinity
    };
  }

  function railLine(r) {
    return 'R to SRC+ = ' + fmtOhms(r.rHigh) + ' · R to SRC− = ' + fmtOhms(r.rLow) + '.';
  }

  function analyzeLogic(components, challenge, opts) {
    var rules = challenge.rules;
    var vcc = challenge.supply || 5.0;
    var live = !!opts.pressed;
    var onWhenHeld = rules.logic.on === 'pressed';
    var buttons = components.filter(function (c) { return c.type === 'button'; });
    var zero = {
      vcc: vcc, current: 0, vled: 0, vres: 0, ohms: 0,
      power: 0, brightness: 0, drive: 0
    };
    function logicOf(level) {
      return { in: level, out: level === LEVEL.HIGH ? 'HIGH' : 'LOW', pressed: live };
    }

    if (!buttons.length) {
      return result(ERR.NO_BUTTON, {
        headline: 'NO INPUT DEVICE',
        lines: ['Button not seated on the board.', 'IN unterminated · level undefined.'],
        metrics: zero,
        logic: logicOf(LEVEL.FLOAT)
      });
    }

    var states = [{ pressed: false, word: 'released' }, { pressed: true, word: 'held' }];

    for (var i = 0; i < states.length; i++) {
      var uf = buildNets(components, states[i].pressed);
      if (uf.find('SRC+') === uf.find('SRC-')) {
        return result(ERR.SHORT, {
          headline: 'BUS FAULT: HARD SHORT',
          lines: [
            'With the button ' + states[i].word + ', SRC+ and SRC− share one node.',
            'Supply current limit tripped. Rail collapsed to 0.00 V.'
          ],
          focus: components.filter(function (c) {
            return c.type === 'wire' || c.type === 'button';
          }).map(function (c) { return c.id; }),
          metrics: zero,
          logic: logicOf(LEVEL.FLOAT)
        });
      }
    }

    var lvl = {};
    states.forEach(function (s) { lvl[s.word] = inputLevel(components, s.pressed); });

    var floating = states.filter(function (s) { return lvl[s.word].level === LEVEL.FLOAT; });
    if (floating.length) {
      var fw = floating[0].word;
      var f = lvl[fw];
      return result(ERR.INPUT_FLOATING, {
        headline: 'INPUT INDETERMINATE',
        lines: [
          f.contention
            ? 'With the button ' + fw + ', IN sits at equal resistance to both rails.'
            : 'With the button ' + fw + ', IN reaches neither rail.',
          railLine(f),
          floating.length === 2
            ? 'V_IN undefined in both button states.'
            : 'V_IN undefined · level resolves only while ' + (fw === 'held' ? 'released' : 'held') + '.'
        ],
        focus: buttons.map(function (b) { return b.id; }),
        metrics: zero,
        logic: logicOf(LEVEL.FLOAT)
      });
    }

    /* The output branch is an ordinary Tier 1 circuit fed from LOGIC OUT.
       Check it where OUT is actually driven, so its faults surface first. */
    var driven = states.filter(function (s) { return lvl[s.word].level === LEVEL.HIGH; });
    var probe = driven.length ? driven[0] : states[0];
    var branchOpts = {
      source: 'OUT', sink: 'SRC-', sourceLabel: 'LOGIC OUT', sinkLabel: 'SRC−'
    };
    var branch = analyzePassive(components, challenge,
      Object.assign({ pressed: probe.pressed }, branchOpts));

    var liveLevel = lvl[live ? 'held' : 'released'].level;
    var liveDriven = liveLevel === LEVEL.HIGH;
    var liveBranch = liveDriven
      ? analyzePassive(components, challenge, Object.assign({ pressed: live }, branchOpts))
      : null;
    var liveOk = !!(liveBranch && liveBranch.ok);

    if (!branch.ok) {
      branch.logic = logicOf(liveLevel);
      return branch;
    }

    var on = { held: lvl.held.level === LEVEL.HIGH, released: lvl.released.level === LEVEL.HIGH };
    var want = { held: onWhenHeld, released: !onWhenHeld };
    var shown = { metrics: liveOk ? liveBranch.metrics : zero, litLed: liveOk ? liveBranch.litLed : null };

    if (on.held === want.held && on.released === want.released) {
      return {
        ok: true,
        code: 'ok',
        headline: 'LOGIC OK: LED FOLLOWS INPUT',
        lines: [
          'IN = ' + lvl.held.level + ' held · ' + lvl.released.level + ' released.',
          'OUT drives on HIGH · LED lights while ' + (onWhenHeld ? 'held' : 'released') + '.',
          'I = ' + fmtA(branch.metrics.current) + ' · V_LED = ' +
            branch.metrics.vled.toFixed(2) + ' V'
        ],
        focus: [],
        litLed: shown.litLed,
        metrics: shown.metrics,
        logic: logicOf(liveLevel)
      };
    }

    if (on.held === on.released) {
      return result(ERR.INPUT_STUCK, {
        headline: 'INPUT NOT SWITCHING',
        lines: [
          'IN reads ' + lvl.held.level + ' in both button states.',
          railLine(lvl.held),
          'Button state makes no difference at the node.'
        ],
        focus: buttons.map(function (b) { return b.id; }),
        litLed: shown.litLed,
        metrics: shown.metrics,
        logic: logicOf(liveLevel)
      });
    }

    return result(ERR.LOGIC_INVERTED, {
      headline: 'LOGIC INVERTED',
      lines: [
        'IN = ' + lvl.held.level + ' held · ' + lvl.released.level + ' released.',
        'OUT drives on HIGH, so the LED lights while ' + (on.held ? 'held' : 'released') + '.',
        'This build calls for LED on while ' + (onWhenHeld ? 'held' : 'released') + '.'
      ],
      focus: buttons.map(function (b) { return b.id; }),
      litLed: shown.litLed,
      metrics: shown.metrics,
      logic: logicOf(liveLevel)
    });
  }

  function analyze(components, challenge, opts) {
    var rules = (challenge && challenge.rules) || {};
    if (rules.logic) return analyzeLogic(components, challenge, opts || {});
    return analyzePassive(components, challenge, opts || {});
  }

  CC.circuit = {
    LED: LED,
    ERR: ERR,
    LEVEL: LEVEL,
    deviceOf: deviceOf,
    inputLevel: inputLevel,
    buildNets: buildNets,
    nodeNames: nodeNames,
    analyze: analyze,
    fmtA: fmtA,
    fmtW: fmtW,
    fmtOhms: fmtOhms
  };
})(window);
