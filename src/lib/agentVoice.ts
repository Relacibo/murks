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
  sttReady: Accessor<boolean>
  lastTranscript: Accessor<{ text: string; at: number } | null>
  toggleMic: () => void
  stop: () => void
  micTitle: () => string
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
  const [sttReady, setSttReady] = createSignal(false)
  const [lastTranscript, setLastTranscript] = createSignal<{ text: string; at: number } | null>(null)
  /* Agent spricht gerade (TTS) — solange wird nicht zugehört (Echo-Schutz) */
  const [ttsSpeaking, setTtsSpeaking] = createSignal(false)

  let vad: MicVAD | null = null
  let recognition: ReturnType<typeof createWebSpeechRecognition> = null
  let lastSpoken: { text: string } | undefined = state.agent.messages[state.agent.messages.length - 1]
  let sttCheckToken = 0
  /* Gesprächsmodus gewünscht: Nutzer hat das Mic eingeschaltet — es bleibt
     (auch über Agent-Antworten hinweg) an, bis er es manuell ausmacht */
  const [wanted, setWanted] = createSignal(false)

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

  createEffect(() => {
    const messages = state.agent.messages
    const last = messages[messages.length - 1]
    if (last && last.role === 'agent' && !last.silent && last !== lastSpoken) {
      lastSpoken = last
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

  function toggleMic() {
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

    if (!vad) {
      try {
        vad = await createVoice({
          onSpeechStart: () => {
            stopSpeaking()
            setSpeaking(true)
          },
          onMisfire: () => setSpeaking(false),
          onSpeechEnd: async (audio) => {
            setSpeaking(false)
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
      } catch (e) {
        pushError(e instanceof Error ? e.message : String(e))
        return
      }
    }
    try {
      await vad.start()
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

  function onVisibilityChange() {
    if (document.hidden) {
      void stopVoice()
      stopSpeaking()
    }
  }
  document.addEventListener('visibilitychange', onVisibilityChange)

  onCleanup(() => {
    recognition?.stop()
    vad?.destroy()
    stopSpeaking()
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  function micTitle() {
    if (transcribing()) return 'Transkribiere …'
    if (speaking()) return 'Sprache erkannt'
    if (suspended())
      return ttsSpeaking()
        ? 'Pausiert — KI spricht. Tippen zum Ausschalten'
        : 'Pausiert — KI antwortet. Tippen zum Ausschalten'
    if (listening()) return 'Höre zu — tippen zum Stoppen'
    if (state.stt.mode === 'server' && !state.stt.endpoint) return 'Kein STT-Endpoint konfiguriert'
    if (state.stt.mode === 'wasm' && !sttReady()) return 'STT-Modell nicht geladen'
    return `Hören starten (${state.stt.mode === 'wasm' ? 'lokal' : state.stt.mode})`
  }

  return {
    listening,
    suspended,
    speaking,
    transcribing,
    sttReady,
    lastTranscript,
    toggleMic,
    stop: stopVoice,
    micTitle,
  }
}
