// Тихая фоновая музыка мемориала: собственный синтез на Web Audio, без записей и сэмплов.
// Медленные аккорды из синусов через фильтр и редкие «колокольчики» пентатоники с эхом.

/** Частота ноты по номеру MIDI. */
export function midiToHz(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

/** Аккорды по кругу: Am9 — Fmaj7 — Cmaj7/E — G6. Номера MIDI. */
export const CHORDS: number[][] = [
  [45, 52, 59, 60, 64],
  [41, 48, 57, 60, 64],
  [40, 48, 55, 59, 64],
  [43, 50, 55, 59, 64],
];

/** Ноты колокольчиков: ля-минорная пентатоника во второй-третьей октаве над аккордами. */
export const BELL_NOTES = [69, 72, 74, 76, 79, 81];

export const CHORD_SECONDS = 9;

export interface AmbientPlayer {
  stop(): void;
}

export function startAmbient(volume = 0.18): AmbientPlayer {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(volume, ctx.currentTime + 4);
  master.connect(ctx.destination);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  filter.Q.value = 0.4;
  filter.connect(master);

  // Эхо для колокольчиков.
  const delay = ctx.createDelay(2);
  delay.delayTime.value = 0.62;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.38;
  const wet = ctx.createGain();
  wet.gain.value = 0.5;
  delay.connect(feedback).connect(delay);
  delay.connect(wet).connect(master);

  let chordIndex = 0;
  let stopped = false;

  const playChord = (when: number) => {
    const notes = CHORDS[chordIndex % CHORDS.length];
    chordIndex += 1;
    const length = CHORD_SECONDS + 3;
    notes.forEach((note, i) => {
      for (const detune of [-5, 5]) {
        const osc = ctx.createOscillator();
        osc.type = i === 0 ? 'sine' : 'triangle';
        osc.frequency.value = midiToHz(note);
        osc.detune.value = detune;
        const gain = ctx.createGain();
        const peak = (i === 0 ? 0.16 : 0.07) / 2;
        gain.gain.setValueAtTime(0, when);
        gain.gain.linearRampToValueAtTime(peak, when + 3);
        gain.gain.setValueAtTime(peak, when + length - 4);
        gain.gain.linearRampToValueAtTime(0, when + length);
        osc.connect(gain).connect(filter);
        osc.start(when);
        osc.stop(when + length + 0.1);
      }
    });
  };

  const playBell = (when: number) => {
    const note = BELL_NOTES[Math.floor(Math.random() * BELL_NOTES.length)];
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = midiToHz(note);
    const overtone = ctx.createOscillator();
    overtone.type = 'sine';
    overtone.frequency.value = midiToHz(note) * 2.76;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(0.05, when + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 4);
    const overGain = ctx.createGain();
    overGain.gain.value = 0.25;
    osc.connect(gain);
    overtone.connect(overGain).connect(gain);
    gain.connect(master);
    gain.connect(delay);
    for (const o of [osc, overtone]) {
      o.start(when);
      o.stop(when + 4.2);
    }
  };

  // Планировщик: каждые полсекунды досоздаёт события на ближайшие секунды.
  let nextChord = ctx.currentTime + 0.1;
  let nextBell = ctx.currentTime + 3;
  const tick = () => {
    if (stopped) return;
    const horizon = ctx.currentTime + 2;
    while (nextChord < horizon) {
      playChord(nextChord);
      nextChord += CHORD_SECONDS;
    }
    while (nextBell < horizon) {
      playBell(nextBell);
      nextBell += 2.5 + Math.random() * 4;
    }
  };
  tick();
  const timer = window.setInterval(tick, 500);

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      window.clearInterval(timer);
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0, now + 1.2);
      window.setTimeout(() => {
        ctx.close().catch(() => undefined);
      }, 1400);
    },
  };
}
