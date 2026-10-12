# CircuitCoach demo, voiceover transcript

Written for roughly 140 words per minute, a relaxed technical pace. Every number
quoted is real and verifiable in the repository.

**The timecodes below are for the original 6:20 screen recording, not for the
published cut.** The published video runs 7:00 and opens with a 46 second piece
to camera, then plays the same recording 1.5 percent faster. To find a line in
the published video:

    published = (original + 46.3) / 1.015

So the Tier 2 opening at **1:46** here lands at about **2:47** there. The
ordering and the wording are unchanged.

---

## 1. The problem, 0:00 to 0:32

**0:00** `title card`
A real breadboard, a component kit and a bench multimeter cost real money.
Plenty of the students who need that bench the most never get one.

**0:11** `empty board appears, cursor probes holes`
Existing simulators mostly check your wiring against an answer key. They tell
you that you are wrong. They do not tell you what an instrument would have
shown you.

**0:22** `probe readout updating per hole`
This is the board. Ten column strips, four independent rails, a centre channel,
and a bench supply on the left. The copper is wired like real copper, so five
holes in a column are one node.

---

## 2. Tier 1, wiring and polarity, 0:32 to 1:45

**0:32** `building the loop`
I pick a jumper and click two holes. Supply to the rail, rail to the board, then
a resistor.

**0:41** `LED being seated`
Watch the LED. Its body sits off centre so the anode reads as the long leg, and
there is a plus tick beside it. That is the cue you use on a real part. I am
seating this one backwards on purpose.

**0:52** `power on, reversed polarity fault`
Power on. The LED stays dark, and here is the part that matters.

**0:58** `instrument panel and log`
The log does not say try flipping the LED. It reports minus five volts across
the LED, zero current, junction blocking, and it names the fault as reversed
polarity. That is a measurement, not advice. Seventeen faults are named this
precisely.

**1:24** `LED flipped, powered, now lit`
Click the LED to flip it. Power on, and it lights. Current, forward voltage,
resistance and power, all solved from the netlist.

---

## 3. Tier 2, sizing the resistor, 1:45 to 2:55

**1:46** `tier 2 loads, spec panel`
Tier two keeps the circuit and moves the difficulty into the resistor value. The
panel states the supply, a forward voltage of one point eight volts, a twenty
milliamp rating, and the target band.

**2:03** `100 ohm fitted, overcurrent at 2:06`
I do not type a number. I pick from real E12 stock, the values you would
actually have in a drawer. One hundred ohms gives thirty two milliamps against a
twenty milliamp rating. The LED lights, but it renders white hot and the verdict
reads outside safe operating area.

**2:20** `470 ohm swapped in, dim at 2:21`
Four seventy the other way. Now it is under driven. The LED still lights, but
visibly dim, at thirty four percent of rated drive.

**2:33** `220 ohm, verdict at 2:34`
Two twenty lands inside the band. Both failure directions fall out of Ohm's law,
not a lookup table, and the band was stated up front so this is a target rather
than a guess.

---

## 4. Tier 3, digital input and pull resistors, 2:55 to 4:05

**2:56** `tier 3 loads, logic block visible`
Tier three adds a logic block with an input pin and an output pin. Its sketch is
printed on the module and never changes. Output follows input.

**3:09** `wiring the button and pull-down, LED lights at 3:22`
The condition is that the LED is on while the button is held. So the button goes
to the positive rail and a ten kilohm pull down resistor to the negative rail.
Hold the button, and it lights.

**3:37** `floating input fault appears at 3:40`
Now the part most tutorials skip. This board has the button and no pull resistor
at all. Released, the pin reaches neither rail. The solver measures resistance
from the pin to each rail in both button states, reports open to both, and calls
the level undefined. A floating input is its own fault, with its own reading.

**3:55** `inverted condition variant`
And because the sketch never changes, the opposite condition needs the opposite
wiring. The answer from the first build is wrong here, so it has to be reasoned
through.

---

## 5. The AI tutor, 4:05 to 5:20

**4:05** `tier 1 B loads, first wrong attempt at 4:14, hints counter stays at zero`
Now the tutor. The decision logic is deterministic and runs in the browser. The
model is used only to word the hint. First wrong attempt gets visual feedback
and nothing else. No hint. That is deliberate.

**4:24** `second attempt, request pending on screen`
Same mistake again, and it escalates to a Socratic question. This is a live call
through a Flask backend to the Gemini API. The key never reaches the browser.

**4:31** `hint on screen, held to 4:55`
Read what came back. It points at the concept without handing over the fix, and
it cites the actual reading from this board. It is answering this mistake, not a
generic one.

**4:56** `third attempt, direct hint`
Third attempt names the component. A fourth would state the fix and explain why.
Make a different mistake instead and the ladder resets, so you are never handed
the answer to a problem you only just met.

**5:11** `session trace panel`
Everything the tutor reads is one trace. Tier, challenge, attempts, fault
history, hints given and time on task.

---

## 6. Built and verified, 5:20 to 6:20

**5:20** `cycling the three tiers`
A few things worth weighing.

**5:33** `closing card`
Seventeen named faults, not one generic wrong, from a real netlist solver. Union
find over the holes and an exhaustive path search, not string matching against
an expected answer.

**5:44**
One hundred and ninety eight tests pass. Eighty six on the solver, and one
hundred and twelve driving the real interface in a headless browser.

**5:54**
It runs from a file with no install and no hardware cost, and the whole circuit
can be built from the keyboard.

**6:02**
The backend is hardened. The key is server side only, static serving is
restricted to the front end, and the hint endpoint validates every field before
anything reaches the model.

**6:12**
The same engine extends across an eleven phase embedded curriculum that is
already outlined. Source and the full test suite are open for review.

---

## Notes for the voiceover

- Numbers are spelled out so they read cleanly aloud. Say "minus five volts",
  not "negative five point zero zero volts".
- Two silences are deliberate and the video holds on both. The first is at
  **0:52**, right after power on. The second is **4:24 to 4:31**, while the hint
  is genuinely being generated. Let those sit.
- If you run long, section 6 compresses safely. Sections 2 through 5 are locked
  to on-screen actions.
- The two hints in the video are real Gemini output captured during the take, so
  the wording will differ from any earlier draft. Do not read the hint text
  aloud, let the viewer read it while you talk around it.
