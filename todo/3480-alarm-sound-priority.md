# 3480 · Alarm-Sound-Priorität: Wecker/TTS > Bing (Warteschlange)

**Prio: MITTEL**

## Problem
`playAlarmBell`/`playAlarmBing` (alarmSounds.ts) und TTS (tts.ts) laufen
unabhängig — laufen zwei Karten gleichzeitig ab oder spricht TTS gerade,
überlappen sich Töne und Stimme. Der kritische Wecker und das Vorlesen
sollen immer Vorrang haben, das informative Bing nie dazwischenfunken.

## Konzept
- **Prioritätsordnung: Wecker > TTS > Bing.**
- Wecker (prio): spielt SOFORT — läuft gerade TTS, wird sie abgebrochen
  (stopSpeaking) und der Text danach neu vorgelesen (Wecker ist kurz, der
  übliche Fluss „Wecker → Vorlesen" bleibt erhalten).
- Bing (non-prio): wird verworfen (oder in einer Ein-Platz-Queue gehalten),
  solange Wecker oder TTS läuft — danach maximal ein verspätetes Bing.
- **Queue denkbar:** kleine Koordinationsstelle (z.B. in alarmSounds.ts) mit
  geteiltem Zustand „spricht/spielt gerade" (tts.ts hat aktuell kein
  speaking-Signal — müsste eins exportieren); Ereignisse koaleszieren
  (letzter gewinnt) statt anzustauen.
- Zwei gleichzeitige prio-Alarme: EIN Wecker, TTS liest den ersten neuen
  Karten-Text (bestehende prioActiveIds-Logik).

## Tasks
- [ ] tts.ts: speaking/isSpeaking-Signal exportieren (oder Callback an
      alarmSounds)
- [ ] alarmSounds: Koordinator mit Priorität; Wecker stoppt TTS, Bing wartet/
      verwirft bei Belegung
- [ ] Cook.tsx: Alarm-Trigger über den Koordinator (statt direkt play*)
- [ ] Test: gleichzeitige Abläufe (zwei Karten) + TTS-Überlappung

## Abhängigkeit
→ 3440 (Alarm-Feedback/Töne), tts.ts (speak/stopSpeaking)
