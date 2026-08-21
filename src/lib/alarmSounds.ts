/**
 * Alarm-Töne:
 * - playAlarmBell: Klirren eines mechanischen Doppelglocken-Weckers (Web
 *   Audio, synthetisch — keine Assets), ~2.5 s, läuft auch bei gemutetem TTS
 *   (kritischer Alarm).
 * - playAlarmBing: informativer „Ding" für unkritische Abläufe — als Asset
 *   public/sounds/ding.mp3 („Film special effects ding", Pixabay,
 *   https://pixabay.com/sound-effects/film-special-effects-ding-101492/;
 *   Pixabay Content License: frei nutzbar, keine Namensnennung nötig).
 *   Fallback, falls die Datei fehlt: synthetischer Zweiton-Bing.
 *   Wird bei gemutetem TTS NICHT abgespielt (Prüfung im Aufrufer).
 */

let audioCtx: AudioContext | null = null

function ctx(): AudioContext | null {
  try {
    if (!audioCtx) audioCtx = new AudioContext()
    if (audioCtx.state === 'suspended') void audioCtx.resume()
    return audioCtx
  } catch {
    return null
  }
}

export function playAlarmBell(): void {
  const c = ctx()
  if (!c) return
  const now = c.currentTime
  const dur = 2.5

  const master = c.createGain()
  master.gain.setValueAtTime(0.0001, now)
  master.gain.exponentialRampToValueAtTime(0.4, now + 0.012)
  master.gain.exponentialRampToValueAtTime(0.0001, now + dur)
  master.connect(c.destination)

  // Klöppel-Tremolo (~12 Hz) auf den Gesamtklang
  const trem = c.createGain()
  trem.gain.value = 0.7
  trem.connect(master)
  const lfo = c.createOscillator()
  lfo.frequency.value = 12
  const lfoGain = c.createGain()
  lfoGain.gain.value = 0.3
  lfo.connect(lfoGain)
  lfoGain.connect(trem.gain)
  lfo.start(now)
  lfo.stop(now + dur)

  // Inharmonische Glocken-Partiale, paarweise leicht verstimmt → Schwebung
  const partials = [
    { f: 2000, g: 1 },
    { f: 2006, g: 0.9 },
    { f: 2840, g: 0.5 },
    { f: 2847, g: 0.45 },
    { f: 4260, g: 0.25 },
    { f: 5600, g: 0.12 },
  ]
  for (const p of partials) {
    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.value = p.f
    const g = c.createGain()
    g.gain.value = p.g
    o.connect(g)
    g.connect(trem)
    o.start(now)
    o.stop(now + dur)
  }
}

function playSyntheticBing(): void {
  const c = ctx()
  if (!c) return
  const now = c.currentTime
  const dur = 0.35

  const master = c.createGain()
  master.gain.setValueAtTime(0.0001, now)
  master.gain.exponentialRampToValueAtTime(0.25, now + 0.008)
  master.gain.exponentialRampToValueAtTime(0.0001, now + dur)
  master.connect(c.destination)

  // A5 + E6 — freundliches „Bing"
  for (const [f, g] of [
    [880, 1],
    [1318.5, 0.5],
  ] as const) {
    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.value = f
    const og = c.createGain()
    og.gain.value = g
    o.connect(og)
    og.connect(master)
    o.start(now)
    o.stop(now + dur)
  }
}

let dingAudio: HTMLAudioElement | null = null
let dingFailed = false

/** Unkritischer Alarm: Pixabay-„Ding" als Asset, sonst synthetischer Fallback */
export function playAlarmBing(): void {
  if (!dingFailed) {
    if (!dingAudio) {
      dingAudio = new Audio('/sounds/ding.mp3')
      dingAudio.addEventListener(
        'error',
        () => {
          dingFailed = true
          playSyntheticBing()
        },
        { once: true },
      )
    }
    dingAudio.currentTime = 0
    dingAudio.play().catch(() => {
      dingFailed = true
      playSyntheticBing()
    })
    return
  }
  playSyntheticBing()
}
