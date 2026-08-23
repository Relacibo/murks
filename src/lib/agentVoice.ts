import { createEffect, createMemo, createSignal, onCleanup, type Accessor } from 'solid-js'
import type { MicVAD } from '@ricky0123/vad-web'
import { state, sendMessage } from '../state/store'
import { transcribeAudio, createWebSpeechRecognition, isSttModelCached } from './stt'
import { createVoice } from './voice'
import { speak, stopSpeaking } from './tts'
import { showToast } from './toast'

export interface AgentVoice {
  listening: Accessor<boolean>
  suspended: Accessor<boolean>
  speaking: Accessor<boolean>
  transcribing: Accessor<boolean>
  recording: Accessor<boolean>
  ttsSpeaking: Accessor<boolean>
  sttReady: Accessor<boolean>
  lastTranscript: Accessor<{ text: string; at: number } | null>
  toggleMic: () => void
  toggleRecord: () => void
  stop: () => void
  micTitle: () => string
  recordTitle: () => string
}

const NOISE_WORDS = [
  'lacht',
  'lachen',
  'gelächter',
  'klingeln',
  'musik',
  'applaus',
  'geräusch',
  'summen',
]

function isNoiseTranscript(text: string): boolean {
  const t = text.trim().toLowerCase()
  if (!t) return true
  if (/^\*[^*]+\*$/.test(t) || /^\([^)]+\)$/.test(t)) return true
  return NOISE_WORDS.includes(t)
}

export function createAgentVoice(opts?: {
  onUtterance?: (text: string) => void
  configOpen?: Accessor<boolean>
}): AgentVoice {
  const [listening, setListening] = createSignal(false)
  const [speaking, setSpeaking] = createSignal(false)
  const [transcribing, setTranscribing] = createSignal(false)
  const [recording, setRecording] = createSignal(false)
  const [sttReady, setSttReady] = createSignal(false)
  const [lastTranscript, setLastTranscript] = createSignal<{ text: string; at: number } | null>(null)
  /* Agent spricht gerade (TTS) — solange wird nicht zugehört (Echo-Schutz) */
  const [ttsSpeaking, setTtsSpeaking] = createSignal(false)

  let vad: MicVAD | null = null
  let recognition: ReturnType<typeof createWebSpeechRecognition> = null
  let recordRecognition: ReturnType<typeof createWebSpeechRecognition> = null
  /* Record-Modus (WebSpeech): finale Teile über mehrere Äußerungen sammeln —
     gesendet wird erst beim Stopp-Tap */
  let recordText = ''
  let lastSpoken: { text: string } | undefined = state.agent.messages[state.agent.messages.length - 1]
  let sttCheckToken = 0
  /* Gesprächsmodus gewünscht: Nutzer hat das Mic eingeschaltet — es bleibt
     (auch über Agent-Antworten hinweg) an, bis er es manuell ausmacht */
  const [wanted, setWanted] = createSignal(false)
  /* Record-Modus (Push-to-Record): einmalige Aufnahme, danach sofort senden.
     recordActive trennt die VAD-Callbacks vom Gesprächsmodus; recordFrames
     sammelt Audio ab Sprachbeginn, damit ein manueller Stopp mitten in der
     Äußerung trotzdem transkribieren kann. */
  let recordActive = false
  let recordSpeech = false
  let recordFrames: Float32Array[] = []

  /* Suspendiert: Nutzer will zuhören (wanted), aber die KI spricht/denkt
     gerade — das Mic pausiert von selbst und setzt danach wieder ein.
     Davon abzugrenzen: echtes Nutzer-Aus (wanted = false). Nur relevant,
     wenn das Mic dabei nicht tatsächlich weiterhört (WebSpeech-Modus —
     der VAD-Modus hört währenddessen für Barge-in weiter). */
  const suspended = createMemo(
    () => wanted() && !listening() && (state.agent.busy || ttsSpeaking()),
  )

  createEffect(() => {
    const mode = state.stt.mode
    state.stt.model
    opts?.configOpen?.()
    const token = ++sttCheckToken
    void (async () => {
      let ready = true
      if (mode === 'server') ready = Boolean(state.stt.endpoint)
      else if (mode === 'wasm') ready = await isSttModelCached()
      if (token === sttCheckToken) setSttReady(ready)
    })()
  })

  /* Auto-TTS nur im Gesprächsmodus: im manuellen Modus spricht die KI
     nicht von selbst — der Nutzer spielt die Antwort manuell ab. */
  createEffect(() => {
    const messages = state.agent.messages
    const last = messages[messages.length - 1]
    if (last && last.role === 'agent' && !last.silent && last !== lastSpoken) {
      lastSpoken = last
      if (!wanted()) return
      setTtsSpeaking(true)
      void speak(last.text).finally(() => setTtsSpeaking(false))
    }
  })

  /* Gesprächsmodus (WebSpeech): weiterhören, sobald der Agent fertig ist —
     egal ob die Antwort gesprochen wurde (ttsSpeaking) oder nur der Request
     (busy) beendet ist. wanted = Nutzer hat das Mic selbst eingeschaltet. */
  createEffect(() => {
    state.agent.busy
    ttsSpeaking()
    state.stt.mode
    if (
      wanted() &&
      state.stt.mode === 'webspeech' &&
      !state.agent.busy &&
      !ttsSpeaking() &&
      !listening()
    ) {
      recognition?.start()
      setListening(true)
    }
  })

  function pushError(message: string) {
    showToast(`STT: ${message}`)
  }

  function finishUtterance(text: string) {
    if (isNoiseTranscript(text)) return
    setLastTranscript({ text, at: Date.now() })
    if (opts?.onUtterance) opts.onUtterance(text)
    else sendMessage(text)
  }

  async function transcribeAndSend(audio: Float32Array) {
    setTranscribing(true)
    try {
      const text = await transcribeAudio(audio)
      finishUtterance(text)
    } catch (e) {
      pushError(e instanceof Error ? e.message : String(e))
    } finally {
      setTranscribing(false)
    }
  }

  /* ── Gesprächsmodus ─────────────────────────────────────────────── */

  async function ensureVad(): Promise<MicVAD | null> {
    if (vad) return vad
    try {
      vad = await createVoice({
        onSpeechStart: () => {
          stopSpeaking()
          setSpeaking(true)
          if (recordActive) {
            /* Record-Modus: Frames über mehrere Äußerungen akkumulieren —
               nur der Stop-Tap beendet die Aufnahme */
            recordSpeech = true
          }
        },
        onFrameProcessed: (_p, frame) => {
          if (recordActive && recordSpeech) recordFrames.push(frame.slice())
        },
        onMisfire: () => setSpeaking(false),
        onSpeechEnd: async (audio) => {
          setSpeaking(false)
          if (recordActive) {
            /* Record-Modus: Stille beendet NICHTS — weiter aufnehmen,
               bis der Nutzer den Stopp-Tap drückt (stopRecord) */
            recordSpeech = false
            return
          }
          setTranscribing(true)
          try {
            const text = await transcribeAudio(audio)
            finishUtterance(text)
          } catch (e) {
            pushError(e instanceof Error ? e.message : String(e))
          } finally {
            setTranscribing(false)
            if (listening()) await vad?.start()
          }
        },
        onError: pushError,
      })
      return vad
    } catch (e) {
      pushError(e instanceof Error ? e.message : String(e))
      return null
    }
  }

  function toggleMic() {
    /* Record-Aufnahme abbrechen, wenn stattdessen das Gespräch startet */
    if (recording()) abortRecord()
    /* wanted ist die Nutzer-Absicht: auch im suspendierten Zustand
       (wanted = true, listening = false) schaltet ein Tipp das Mic
       hart aus statt es wieder zu starten */
    if (wanted()) {
      void stopVoice()
      return
    }
    void startVoice()
  }

  async function startVoice() {
    setWanted(true)
    if (state.stt.mode === 'webspeech') {
      recognition = createWebSpeechRecognition(
        (transcript, isFinal) => {
          if (isFinal) finishUtterance(transcript)
        },
        pushError,
        () => {
          // Äußerung zu Ende: Gesprächsmodus — solange der Agent nicht
          // antwortet, direkt weiterhören; sonst übernimmt der Restart-Effekt
          setListening(false)
          if (wanted() && !state.agent.busy && !ttsSpeaking()) {
            recognition?.start()
            setListening(true)
          }
        },
      )
      if (recognition) {
        recognition.start()
        setListening(true)
      }
      return
    }

    const v = await ensureVad()
    if (!v) return
    try {
      await v.start()
      setListening(true)
    } catch (e) {
      pushError(e instanceof Error ? e.message : String(e))
    }
  }

  async function stopVoice() {
    setWanted(false)
    setListening(false)
    setSpeaking(false)
    recognition?.stop()
    recognition = null
    await vad?.pause()
  }

  /* ── Record-Modus (Push-to-Record) ──────────────────────────────── */

  function toggleRecord() {
    if (recording()) {
      void stopRecord()
      return
    }
    void startRecord()
  }

  async function startRecord() {
    /* Gespräch läuft? Erst beenden — das Mic kann nur einen Modus */
    if (listening()) await stopVoice()

    setRecording(true)
    if (state.stt.mode === 'webspeech') {
      recordText = ''
      recordRecognition = createWebSpeechRecognition(
        (text, isFinal) => {
          if (isFinal && text) recordText += (recordText ? ' ' : '') + text
        },
        pushError,
        () => {
          /* Ende (Stopp-Tap oder Auto-Ende wie no-speech): gesammelten
             Text senden — Stille allein beendet die Aufnahme nicht */
          const text = recordText.trim()
          recordText = ''
          recordRecognition = null
          setRecording(false)
          if (text) finishUtterance(text)
        },
        { continuous: true },
      )
      recordRecognition?.start()
      return
    }

    const v = await ensureVad()
    if (!v) {
      setRecording(false)
      return
    }
    recordActive = true
    recordFrames = []
    recordSpeech = false
    try {
      await v.start()
    } catch (e) {
      recordActive = false
      setRecording(false)
      pushError(e instanceof Error ? e.message : String(e))
    }
  }

  async function stopRecord() {
    if (state.stt.mode === 'webspeech') {
      /* stop() spült die finalen Ergebnisse (onResult sammelt sie),
         onend sendet den gesammelten Text */
      setRecording(false)
      recordRecognition?.stop()
      return
    }
    /* VAD: mitten in der Äußerung — aus den gesammelten Frames transkribieren */
    const frames = recordFrames
    recordActive = false
    recordSpeech = false
    recordFrames = []
    setRecording(false)
    await vad?.pause()
    if (frames.length > 0) {
      const total = frames.reduce((n, f) => n + f.length, 0)
      const audio = new Float32Array(total)
      let off = 0
      for (const f of frames) {
        audio.set(f, off)
        off += f.length
      }
      await transcribeAndSend(audio)
    }
  }

  /** Record-Aufnahme verwerfen (ohne zu senden) */
  function abortRecord() {
    recordActive = false
    recordSpeech = false
    recordFrames = []
    recordText = ''
    setRecording(false)
    recordRecognition?.stop()
    recordRecognition = null
    void vad?.pause()
  }

  function onVisibilityChange() {
    if (document.hidden) {
      void stopVoice()
      abortRecord()
      stopSpeaking()
    }
  }
  document.addEventListener('visibilitychange', onVisibilityChange)

  onCleanup(() => {
    recognition?.stop()
    recordRecognition?.stop()
    vad?.destroy()
    stopSpeaking()
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  function micTitle() {
    if (transcribing()) return 'Transkribiere …'
    if (speaking()) return 'Sprache erkannt'
    if (suspended())
      return ttsSpeaking()
        ? 'Pausiert — KI spricht. Tippen zum Beenden'
        : 'Pausiert — KI antwortet. Tippen zum Beenden'
    if (listening()) return 'Gesprächsmodus: hört zu — tippen zum Beenden'
    if (state.stt.mode === 'server' && !state.stt.endpoint) return 'Kein STT-Endpoint konfiguriert'
    if (state.stt.mode === 'wasm' && !sttReady()) return 'STT-Modell nicht geladen'
    return 'Gesprächsmodus starten'
  }

  function recordTitle() {
    if (recording()) return 'Aufnahme stoppen'
    if (transcribing()) return 'Transkribiere …'
    if (state.stt.mode === 'server' && !state.stt.endpoint) return 'Kein STT-Endpoint konfiguriert'
    if (state.stt.mode === 'wasm' && !sttReady()) return 'STT-Modell nicht geladen'
    return 'Nachricht aufnehmen'
  }

  return {
    listening,
    suspended,
    speaking,
    transcribing,
    recording,
    ttsSpeaking,
    sttReady,
    lastTranscript,
    toggleMic,
    toggleRecord,
    stop: stopVoice,
    micTitle,
    recordTitle,
  }
}
