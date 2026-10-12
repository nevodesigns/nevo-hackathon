/* challenges.js: challenge variants per tier.
   Three variants each, so the adaptive engine has somewhere to go: repeat,
   drop to the guided rebuild, or push the harder one. */
(function (global) {
  'use strict';
  var CC = (global.CC = global.CC || {});

  function led(a, b) { return { type: 'led', a: a, b: b }; }
  function res(a, b, ohms) { return { type: 'resistor', a: a, b: b, ohms: ohms || 220 }; }
  function wire(a, b) { return { type: 'wire', a: a, b: b }; }

  var TIER1 = [
    {
      id: 'T1-A',
      tier: 1,
      name: 'Light it up',
      supply: 5.0,
      brief: 'Build a complete loop from SRC+, through a current-limiting resistor and the LED, ' +
        'and back to SRC−. Current enters an LED at the anode: the long leg.',
      bin: { led: 1, resistor: 1, wire: 8 },
      resistorOhms: 220,
      preplaced: [],
      rules: { requireResistor: true },
      objectives: ['LED seated', 'Resistor seated', 'SRC+ tied to the board', 'SRC− tied to the board']
    },
    {
      id: 'T1-B',
      tier: 1,
      name: 'Backwards on the bench',
      supply: 5.0,
      brief: 'This board is already wired and every joint is sound, but it stays dark. ' +
        'Find the fault and change as little as you can. Click a seated LED to flip it.',
      bin: { led: 1, resistor: 1, wire: 8 },
      resistorOhms: 220,
      preplaced: [
        wire('SRC+', 'TP2'),
        wire('SRC-', 'TN2'),
        wire('TP7', 'E7'),
        res('A7', 'A11', 220),
        led('A15', 'A11'),
        wire('E15', 'TN15')
      ],
      rules: { requireResistor: true },
      objectives: ['LED seated', 'Resistor seated', 'SRC+ tied to the board', 'SRC− tied to the board']
    },
    {
      id: 'T1-C',
      tier: 1,
      name: 'Across the channel',
      supply: 5.0,
      brief: 'SRC+ already feeds column 8. Finish the loop: but seat the LED across the centre ' +
        'channel, one leg in each half, the way a real part is mounted so its legs cannot short.',
      bin: { led: 1, resistor: 1, wire: 6 },
      resistorOhms: 220,
      preplaced: [
        wire('SRC+', 'TP3'),
        wire('SRC-', 'TN3'),
        wire('TP8', 'E8')
      ],
      rules: { requireResistor: true, ledStraddlesRavine: true },
      objectives: ['LED seated', 'Resistor seated', 'LED straddles the centre channel', 'SRC− tied to the board']
    }
  ];

  /* E12 stock values, the same handful you'd actually have in a drawer.
     Each variant is tuned so exactly one of them lands inside the band. */
  var E12 = [100, 150, 220, 330, 470];
  var BAND = { min: 0.65 };

  /* A working 5 V loop, used as the starting point for the diagnostic
     variants: rails fed, resistor at column 7, LED at column 11. */
  function prewiredLoop(ohms) {
    return [
      wire('SRC+', 'TP2'),
      wire('SRC-', 'TN2'),
      wire('TP7', 'E7'),
      res('A7', 'A11', ohms),
      led('A11', 'A15'),
      wire('E15', 'TN15')
    ];
  }

  var TIER2 = [
    {
      id: 'T2-A',
      tier: 2,
      name: 'Size it right',
      supply: 5.0,
      led: { vf: 1.8, label: 'red' },
      brief: 'The rail feeds column 7. This red LED drops 1.80 V and is rated for 20 mA. ' +
        'Work out the series resistance that lands the current inside the target band, ' +
        'fit it, and close the loop.',
      bin: { led: 1, resistor: 1, wire: 4 },
      resistorChoices: E12,
      preplaced: [wire('SRC+', 'TP2'), wire('SRC-', 'TN2'), wire('TP7', 'E7')],
      rules: { requireResistor: true, drive: BAND },
      objectives: ['LED seated', 'Resistor seated']
    },
    {
      id: 'T2-B',
      tier: 2,
      name: 'Nine volts, same part',
      supply: 9.0,
      led: { vf: 2.0, label: 'red' },
      brief: 'This rig came off another bench running at 9 V, still carrying the 220 Ω from ' +
        'a 5 V build. Same LED, same 20 mA rating. Power it up, read the meter, and fit the ' +
        'value that belongs on this rail.',
      bin: { led: 1, resistor: 1, wire: 8 },
      resistorChoices: E12,
      preplaced: prewiredLoop(220),
      rules: { requireResistor: true, drive: BAND },
      objectives: ['LED seated', 'Resistor seated']
    },
    {
      id: 'T2-C',
      tier: 2,
      name: 'Different emitter',
      supply: 5.0,
      led: { vf: 3.4, label: 'white', tint: 'cool' },
      brief: 'Back to the 5 V rail, but this is a white LED: it drops 3.40 V, not 1.80 V. ' +
        'The 220 Ω from the first build is still fitted. Less headroom across the resistor ' +
        'changes the arithmetic.',
      bin: { led: 1, resistor: 1, wire: 8 },
      resistorChoices: E12,
      preplaced: prewiredLoop(220),
      rules: { requireResistor: true, drive: BAND },
      objectives: ['LED seated', 'Resistor seated']
    }
  ];

  /* ---- tier 3 --------------------------------------------------------- */

  function btn(a, b) { return { type: 'button', a: a, b: b }; }

  var PULL = 10000;

  /* Output side, identical in every Tier 3 variant: the logic block's OUT pin
     through a 220 Ω limiter and the LED back to SRC−. Given, so the tier is
     about the input network. */
  function outputBranch() {
    return [
      wire('SRC+', 'TP2'),
      wire('SRC-', 'TN2'),
      wire('OUT', 'F4'),
      res('F4', 'F8', 220),
      led('F8', 'F12'),
      wire('J12', 'TN14')
    ];
  }

  /* Button to the + rail, pull-down to the − rail: IN reads HIGH only while
     the button is held. T3-C ships this same network against the opposite
     condition, where it is exactly wrong. */
  function pullDownInput() {
    return [wire('IN', 'A5'), btn('A5', 'TP5'), res('B5', 'TN5', PULL)];
  }

  var LOGIC_OBJECTIVES = ['Button seated', 'Pull resistor seated', 'IN tied to the logic block'];

  var TIER3 = [
    {
      id: 'T3-A',
      tier: 3,
      name: 'On while held',
      supply: 5.0,
      brief: 'The output side is wired: OUT drives the LED through 220 Ω, and the sketch ' +
        'holds OUT high while IN reads HIGH. Wire the input so the LED is on while the ' +
        'button is held: and so IN sits at a defined level in both states, not just one.',
      bin: { led: 1, resistor: 2, wire: 6, button: 1 },
      resistorOhms: PULL,
      resistorNote: 'pull',
      preplaced: outputBranch(),
      rules: { requireResistor: true, logic: { on: 'pressed' } },
      objectives: LOGIC_OBJECTIVES
    },
    {
      id: 'T3-B',
      tier: 3,
      name: 'Nothing holds the pin',
      supply: 5.0,
      brief: 'Held, this board reads HIGH and the LED comes on, so it looks finished. ' +
        'Released, the meter will not settle. Same condition as before: LED on while ' +
        'held. Find what the pin is missing.',
      bin: { led: 1, resistor: 2, wire: 6, button: 1 },
      resistorOhms: PULL,
      resistorNote: 'pull',
      preplaced: outputBranch().concat([wire('IN', 'A5'), btn('A5', 'TP5')]),
      rules: { requireResistor: true, logic: { on: 'pressed' } },
      objectives: LOGIC_OBJECTIVES
    },
    {
      id: 'T3-C',
      tier: 3,
      name: 'On while released',
      supply: 5.0,
      brief: 'Same board, opposite requirement: the LED must be on while the button is ' +
        'RELEASED and dark while it is held. The sketch is unchanged: OUT follows IN. ' +
        'Fitted here is the input network from the first build.',
      bin: { led: 1, resistor: 2, wire: 6, button: 1 },
      resistorOhms: PULL,
      resistorNote: 'pull',
      preplaced: outputBranch().concat(pullDownInput()),
      rules: { requireResistor: true, logic: { on: 'released' } },
      objectives: LOGIC_OBJECTIVES
    }
  ];

  var TIERS = [
    { tier: 1, name: 'Light it up', variants: TIER1 },
    { tier: 2, name: 'Size it right', variants: TIER2 },
    { tier: 3, name: 'Make it think', variants: TIER3 }
  ];

  CC.challenges = { TIER1: TIER1, TIER2: TIER2, TIER3: TIER3, TIERS: TIERS, E12: E12 };
})(window);
