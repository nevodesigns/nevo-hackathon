/* board.js: breadboard geometry + static SVG rendering.
   Holes are addressed like a real board: A1..J24 on the terminal strips,
   TP/TN/BP/BN on the four power rails, SRC+/SRC- on the bench supply. */
(function (global) {
  'use strict';
  var CC = (global.CC = global.CC || {});

  /* Canvas proportions are tuned so the board fills the stage rather than
     letterboxing inside it: 758x576 is close to the panel's own aspect. */
  var PITCH = 28;
  var COLS = 18;

  var GEOM = {
    W: 758,
    H: 576,
    pitch: PITCH,
    cols: COLS,
    board: { x: 148, y: 22, w: 588, h: 530 },
    supply: { x: 14, y: 150, w: 112, h: 164 },
    mcu: { x: 14, y: 336, w: 112, h: 130 },
    ravine: { y: 273, h: 28 }
  };
  GEOM.gridX0 = GEOM.board.x + (GEOM.board.w - (COLS - 1) * PITCH) / 2;

  var ROW_Y = {
    TP: 57, TN: 85,
    A: 145, B: 173, C: 201, D: 229, E: 257,
    F: 317, G: 345, H: 373, I: 401, J: 429,
    BP: 489, BN: 517
  };
  var ROW_ORDER = ['TP', 'TN', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'BP', 'BN'];
  var STRIP_ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  var RAIL_ROWS = ['TP', 'TN', 'BP', 'BN'];

  var SUPPLY = {
    plus: { id: 'SRC+', x: 134, y: 246 },
    minus: { id: 'SRC-', x: 134, y: 284 }
  };

  /* Tier 3 logic block. The holes always exist; the module only renders and
     only joins keyboard navigation when a challenge actually uses it. */
  var MCU = {
    in: { id: 'IN', x: 134, y: 400 },
    out: { id: 'OUT', x: 134, y: 438 }
  };
  var logicOn = false;
  function setLogic(on) { logicOn = !!on; }
  function dock() { return logicOn ? ['SRC+', 'SRC-', 'IN', 'OUT'] : ['SRC+', 'SRC-']; }

  /* Rails skip every 6th column, giving the classic groups of five. */
  function railHasCol(col) { return col % 6 !== 0; }

  function colX(col) { return GEOM.gridX0 + (col - 1) * PITCH; }

  var HOLES = {};
  var HOLE_LIST = [];

  (function buildHoles() {
    ROW_ORDER.forEach(function (row) {
      var isRail = RAIL_ROWS.indexOf(row) !== -1;
      for (var c = 1; c <= COLS; c++) {
        if (isRail && !railHasCol(c)) continue;
        var id = row + c;
        var h = {
          id: id,
          row: row,
          col: c,
          x: colX(c),
          y: ROW_Y[row],
          rail: isRail,
          half: (row === 'TP' || row === 'TN' || 'ABCDE'.indexOf(row) !== -1) ? 'top' : 'bottom'
        };
        HOLES[id] = h;
        HOLE_LIST.push(h);
      }
    });
    HOLES[SUPPLY.plus.id] = {
      id: SUPPLY.plus.id, row: 'SRC', col: 0, x: SUPPLY.plus.x, y: SUPPLY.plus.y,
      rail: false, half: 'supply', terminal: '+'
    };
    HOLES[SUPPLY.minus.id] = {
      id: SUPPLY.minus.id, row: 'SRC', col: 0, x: SUPPLY.minus.x, y: SUPPLY.minus.y,
      rail: false, half: 'supply', terminal: '-'
    };
    HOLE_LIST.push(HOLES[SUPPLY.plus.id]);
    HOLE_LIST.push(HOLES[SUPPLY.minus.id]);

    [MCU.in, MCU.out].forEach(function (t) {
      HOLES[t.id] = {
        id: t.id, row: 'MCU', col: 0, x: t.x, y: t.y,
        rail: false, half: 'supply', terminal: t.id
      };
      HOLE_LIST.push(HOLES[t.id]);
    });
  })();

  function pos(id) { return HOLES[id]; }

  function label(id) {
    var h = HOLES[id];
    if (!h) return '??';
    if (h.row === 'SRC') return h.terminal === '+' ? 'SRC+' : 'SRC−';
    if (h.row === 'MCU') return 'LOGIC ' + h.terminal;
    if (h.row === 'TP') return 'RAIL+ ' + h.col + ' (top)';
    if (h.row === 'TN') return 'RAIL− ' + h.col + ' (top)';
    if (h.row === 'BP') return 'RAIL+ ' + h.col + ' (btm)';
    if (h.row === 'BN') return 'RAIL− ' + h.col + ' (btm)';
    return h.row + h.col;
  }

  /* ---- static layer -------------------------------------------------- */

  function esc(n) { return Math.round(n * 100) / 100; }

  function holeMarkup(h) {
    var s = 10.5;
    return '<rect class="hole-pad" x="' + esc(h.x - s / 2) + '" y="' + esc(h.y - s / 2) +
      '" width="' + s + '" height="' + s + '" rx="1.8"/>' +
      '<circle class="hole-bore" cx="' + esc(h.x) + '" cy="' + esc(h.y) + '" r="2"/>';
  }

  function railLine(y, cls) {
    var x1 = colX(1) - 16, x2 = colX(COLS) + 16;
    return '<line class="' + cls + '" x1="' + esc(x1) + '" y1="' + esc(y) +
      '" x2="' + esc(x2) + '" y2="' + esc(y) + '"/>';
  }

  function text(x, y, str, cls, anchor) {
    return '<text class="' + cls + '" x="' + esc(x) + '" y="' + esc(y) +
      '" text-anchor="' + (anchor || 'middle') + '">' + str + '</text>';
  }

  function buildStatic() {
    var b = GEOM.board;
    var out = [];

    out.push('<rect class="slab" x="' + b.x + '" y="' + b.y + '" width="' + b.w +
      '" height="' + b.h + '" rx="8"/>');

    /* center channel */
    out.push('<rect class="ravine" x="' + (b.x + 10) + '" y="' + GEOM.ravine.y +
      '" width="' + (b.w - 20) + '" height="' + GEOM.ravine.h + '" rx="2"/>');
    out.push('<line class="ravine-line" x1="' + (b.x + 10) + '" y1="' + (GEOM.ravine.y + GEOM.ravine.h / 2) +
      '" x2="' + (b.x + b.w - 10) + '" y2="' + (GEOM.ravine.y + GEOM.ravine.h / 2) + '"/>');

    /* rail stripes */
    out.push(railLine(ROW_Y.TP - 16, 'rail-stripe pos'));
    out.push(railLine(ROW_Y.TN + 16, 'rail-stripe neg'));
    out.push(railLine(ROW_Y.BP - 16, 'rail-stripe pos'));
    out.push(railLine(ROW_Y.BN + 16, 'rail-stripe neg'));

    /* rail signs */
    var signX = colX(1) - 30;
    out.push(text(signX, ROW_Y.TP + 4, '+', 'silk sign pos'));
    out.push(text(signX, ROW_Y.TN + 4, '−', 'silk sign neg'));
    out.push(text(signX, ROW_Y.BP + 4, '+', 'silk sign pos'));
    out.push(text(signX, ROW_Y.BN + 4, '−', 'silk sign neg'));

    /* holes */
    HOLE_LIST.forEach(function (h) {
      if (h.row === 'SRC' || h.row === 'MCU') return;
      out.push(holeMarkup(h));
    });

    /* row letters, both edges */
    STRIP_ROWS.forEach(function (row) {
      out.push(text(colX(1) - 22, ROW_Y[row] + 3.5, row, 'silk row'));
      out.push(text(colX(COLS) + 22, ROW_Y[row] + 3.5, row, 'silk row'));
    });

    /* column numbers every fifth column */
    for (var c = 1; c <= COLS; c++) {
      if (c !== 1 && c % 5 !== 0) continue;
      out.push(text(colX(c), ROW_Y.A - 18, String(c), 'silk col'));
      out.push(text(colX(c), ROW_Y.J + 24, String(c), 'silk col'));
    }

    /* bench supply */
    var s = GEOM.supply;
    out.push('<rect class="psu" x="' + s.x + '" y="' + s.y + '" width="' + s.w +
      '" height="' + s.h + '" rx="6"/>');
    out.push(text(s.x + s.w / 2, s.y + 30, 'DC SUPPLY', 'psu-label'));
    out.push('<text class="psu-volts" id="psu-volts" x="' + (s.x + s.w / 2) +
      '" y="' + (s.y + 58) + '" text-anchor="middle">5.00 V</text>');
    out.push('<line class="psu-rule" x1="' + (s.x + 14) + '" y1="' + (s.y + 74) +
      '" x2="' + (s.x + s.w - 14) + '" y2="' + (s.y + 74) + '"/>');

    [SUPPLY.plus, SUPPLY.minus].forEach(function (t, i) {
      var isPos = i === 0;
      out.push('<line class="psu-stub" x1="' + (s.x + s.w - 18) + '" y1="' + t.y +
        '" x2="' + t.x + '" y2="' + t.y + '"/>');
      out.push('<circle class="psu-post ' + (isPos ? 'pos' : 'neg') + '" cx="' + t.x +
        '" cy="' + t.y + '" r="7"/>');
      out.push(text(s.x + 12, t.y + 4, isPos ? 'SRC+' : 'SRC−', 'psu-term', 'start'));
    });

    /* supply status lamp */
    out.push('<circle class="psu-lamp" id="psu-lamp" cx="' + (s.x + s.w - 14) +
      '" cy="' + (s.y + 15) + '" r="4"/>');

    out.push(buildLogicModule());
    return out.join('');
  }

  /* Tier 3 only: the thing that actually reads the digital input. Hidden by
     CSS until a challenge switches it on. */
  function buildLogicModule() {
    var m = GEOM.mcu;
    var out = ['<g id="mcu-module">'];
    out.push('<rect class="mcu" x="' + m.x + '" y="' + m.y + '" width="' + m.w +
      '" height="' + m.h + '" rx="6"/>');
    out.push(text(m.x + m.w / 2, m.y + 26, 'LOGIC', 'psu-label'));
    out.push('<text class="mcu-rule" x="' + (m.x + m.w / 2) + '" y="' + (m.y + 46) +
      '" text-anchor="middle">OUT = IN</text>');
    out.push('<line class="psu-rule" x1="' + (m.x + 14) + '" y1="' + (m.y + 58) +
      '" x2="' + (m.x + m.w - 14) + '" y2="' + (m.y + 58) + '"/>');

    [MCU.in, MCU.out].forEach(function (t) {
      out.push('<line class="psu-stub" x1="' + (m.x + m.w - 18) + '" y1="' + t.y +
        '" x2="' + t.x + '" y2="' + t.y + '"/>');
      out.push('<circle class="mcu-post" id="mcu-post-' + t.id.toLowerCase() +
        '" cx="' + t.x + '" cy="' + t.y + '" r="7"/>');
      out.push(text(m.x + 12, t.y + 4, t.id, 'psu-term', 'start'));
    });

    out.push('<circle class="mcu-lamp" id="mcu-lamp" cx="' + (m.x + m.w - 14) +
      '" cy="' + (m.y + 15) + '" r="4"/>');
    out.push('</g>');
    return out.join('');
  }

  function buildHitLayer() {
    return HOLE_LIST.map(function (h) {
      return '<circle class="hole-hit' + (h.row === 'MCU' ? ' mcu' : '') +
        '" data-hole="' + h.id + '" cx="' + esc(h.x) + '" cy="' + esc(h.y) + '" r="12"' +
        ' role="button" tabindex="-1" aria-label="' + label(h.id) + '"/>';
    }).join('');
  }

  function render(svg) {
    svg.setAttribute('viewBox', '0 0 ' + GEOM.W + ' ' + GEOM.H);
    svg.innerHTML =
      '<g id="layer-static">' + buildStatic() + '</g>' +
      '<g id="layer-components"></g>' +
      '<g id="layer-ghost"></g>' +
      '<g id="layer-hits">' + buildHitLayer() + '</g>';
    return {
      components: svg.querySelector('#layer-components'),
      ghost: svg.querySelector('#layer-ghost'),
      hits: svg.querySelector('#layer-hits')
    };
  }

  /* ---- keyboard navigation across the hole grid ---------------------- */

  function neighbour(id, dx, dy) {
    var h = HOLES[id];
    if (!h) return null;
    if (h.row === 'SRC' || h.row === 'MCU') {
      var list = dock();
      var i = list.indexOf(id);
      if (i === -1) return 'SRC+';
      if (dy !== 0) return list[Math.max(0, Math.min(list.length - 1, i + dy))];
      if (dx > 0) return h.row === 'MCU' ? 'J1' : 'TP1';
      return id;
    }
    if (dx !== 0) {
      var c = h.col;
      for (var i = 0; i < COLS; i++) {
        c += dx;
        if (c < 1) return h.rail ? null : (h.half === 'top' ? 'SRC+' : 'SRC-');
        if (c > COLS) return null;
        if (HOLES[h.row + c]) return h.row + c;
      }
      return null;
    }
    var ri = ROW_ORDER.indexOf(h.row);
    for (var k = ri + dy; k >= 0 && k < ROW_ORDER.length; k += dy) {
      var row = ROW_ORDER[k];
      if (HOLES[row + h.col]) return row + h.col;
    }
    return null;
  }

  CC.board = {
    GEOM: GEOM,
    ROW_Y: ROW_Y,
    ROW_ORDER: ROW_ORDER,
    STRIP_ROWS: STRIP_ROWS,
    RAIL_ROWS: RAIL_ROWS,
    HOLES: HOLES,
    HOLE_LIST: HOLE_LIST,
    SUPPLY: SUPPLY,
    MCU: MCU,
    setLogic: setLogic,
    pos: pos,
    label: label,
    colX: colX,
    render: render,
    neighbour: neighbour
  };
})(window);
