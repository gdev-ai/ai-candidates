let context: AudioContext | null = null;

/**
 * A short two-note chime, rising for success and falling for a failure.
 * Synthesized with Web Audio, so there's no sound file to load. Browsers
 * only allow audio after the person has interacted with the page; when
 * they haven't yet (e.g. a fresh reload), this stays silent.
 */
export function playChime(kind: "success" | "error" = "success"): void {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    context ??= new Ctor();
    const ctx = context;
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});

    const notes = kind === "success" ? [659.25, 880] : [523.25, 392];
    notes.forEach((frequency, index) => {
      const start = ctx.currentTime + index * 0.16;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.5);
    });
  } catch {
    // Sound is a nicety; never let it break the page.
  }
}
