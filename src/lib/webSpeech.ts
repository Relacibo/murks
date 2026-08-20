/** Verfügbarkeit der Browser-Sprachfunktionen (Web Speech API) — läuft ohne
 *  Key über die Server des Browser-Herstellers (Chrome: Google). */

export function webSttAvailable(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition)
}

export function webTtsAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}
