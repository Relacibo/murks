/**
 * Alarm-Töne:
 * - playAlarmBell: mechanischer Wecker für kritische Alarme (prio) — Asset
 *   public/sounds/microsammy-clock-alarm-8761.mp3 (Pixabay ID 8761,
 *   Autor microsammy). Läuft auch bei gemutetem TTS.
 * - playAlarmBing: informativer „Ding" für unkritische Abläufe — Asset
 *   public/sounds/freesound_community-ding-101492.mp3 („Film special effects
 *   ding", https://pixabay.com/sound-effects/film-special-effects-ding-101492/).
 *   Wird bei gemutetem TTS NICHT abgespielt (Prüfung im Aufrufer).
 * Pixabay Content License: frei nutzbar, keine Namensnennung nötig.
 * Fehlt eine Datei oder schlägt das Abspielen fehl: synthetischer Fallback
 * (Web Audio, keine Assets).
 */

let audioCtx: AudioContext | null = null
const synthMasters = new Set<GainNode>()
const SOUNDS_BASE = `${import.meta.env.BASE_URL}sounds/`

function ctx(): AudioContext | null {
  try {
    if (!audioCtx) audioCtx = new AudioContext()
    if (audioCtx.state === 'suspended') void audioCtx.resume()
    return audioCtx
  } catch {
    return null
  }
}

/** Asset abspielen; bei Fehler einmalig auf den synthetischen Fallback wechseln */
const assetPlayers = new Map<string, { audio: HTMLAudioElement; failed: boolean }>()

function playAsset(src: string, fallback: () => void): void {
  let p = assetPlayers.get(src)
  if (!p) {
    p = { audio: new Audio(src), failed: false }
    p.audio.addEventListener(
      'error',
      () => {
        p!.failed = true
        fallback()
      },
      { once: true },
    )
    assetPlayers.set(src, p)
  }
  if (p.failed) {
    fallback()
    return
  }
  p.audio.currentTime = 0
  p.audio.play().catch(() => {
    p!.failed = true
    fallback()
  })
}

export function playAlarmBell(): void {
  playAsset(SOUNDS_BASE + 'microsammy-clock-alarm-8761.mp3', playSyntheticBell)
}

export function playAlarmBing(): void {
  playAsset(SOUNDS_BASE + 'freesound_community-ding-101492.mp3', playSyntheticBing)
}

/** Alle Alarm-Töne SOFORT stoppen (Nutzer klickt den Schritt weg) */
export function stopAlarmSounds(): void {
  for (const p of assetPlayers.values()) {
    p.audio.pause()
    p.audio.currentTime = 0
  }
  for (const m of synthMasters) m.disconnect()
  synthMasters.clear()
}

function playSyntheticBell(): void {
  const c = ctx()
  if (!c) return
  const now = c.currentTime
  const dur = 2.5

  const master = c.createGain()
  master.gain.setValueAtTime(0.0001, now)
  master.gain.exponentialRampToValueAtTime(0.4, now + 0.012)
  master.gain.exponentialRampToValueAtTime(0.0001, now + dur)
  master.connect(c.destination)
  synthMasters.add(master)
  setTimeout(() => synthMasters.delete(master), dur * 1000 + 200)

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
  synthMasters.add(master)
  setTimeout(() => synthMasters.delete(master), dur * 1000 + 200)

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
