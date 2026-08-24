import { state, setTts } from '../state/store'
import type { DownloadProgress } from './modelProgress'
import { showToast } from './toast'

const TTS_VOICE = 'de_DE-thorsten-high'
const PIPER_CACHE_KEY = 'murks-piper'
const PIPER_BASE_PATH = `${import.meta.env.BASE_URL}piper/`
const PIPER_VOICE_BASE_URL = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/'

/* Externer Modus (WebMCP): der externe Agent spricht selbst — internes TTS
   (Vorlesen, Vorgenerierung) komplett aus. Alarmtöne bleiben unberührt. */
let externalMode = false
export function setTtsExternalMode(on: boolean): void {
  externalMode = on
}

interface PiperBundle {
  engine: import('piper-tts-web').PiperWebEngine
  provider: import('piper-tts-web').RemoteVoiceProvider
}

let progressCb: ((p: DownloadProgress) => void) | null = null
class CacheVoiceProvider {
  async fetch(url: string): Promise<unknown> {
    const cache = await caches.open(PIPER_CACHE_KEY)
    const cached = await cache.match(url)
    if (cached) {
      return url.endsWith('.json') ? cached.json() : URL.createObjectURL(await cached.blob())
    }
    const fileName = url.split('/').pop() ?? ''
    progressCb?.({ status: 'download', file: fileName })
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Could not fetch: ${url}`)
    const total = Number(res.headers.get('content-length') ?? 0)
    const reader = res.body?.getReader()
    if (!reader) {
      await cache.put(url, res.clone())
      return url.endsWith('.json') ? res.json() : URL.createObjectURL(await res.blob())
    }
    const chunks: BlobPart[] = []
    let loaded = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        chunks.push(Uint8Array.from(value))
        loaded += value.length
        if (total > 0) {
          progressCb?.({
            status: 'progress',
            file: fileName,
            loaded,
            total,
            progress: (loaded / total) * 100,
          })
        }
      }
    }
    const body = new Blob(chunks, { type: res.headers.get('content-type') ?? '' })
    const full = new Response(body, { status: res.status, headers: res.headers })
    await cache.put(url, full.clone())
    return url.endsWith('.json') ? full.json() : URL.createObjectURL(await full.blob())
  }
}

let piperPromise: Promise<PiperBundle> | null = null

function getPiper(): Promise<PiperBundle> {
  if (!piperPromise) {
    piperPromise = (async () => {
      const {
        PiperWebWorkerEngine,
        OnnxWebWorkerRuntime,
        OnnxWebGPUWorkerRuntime,
        PhonemizeWebRuntime,
        RemoteVoiceProvider,
      } = await import('piper-tts-web')
      const provider = new RemoteVoiceProvider({
        provider: new CacheVoiceProvider(),
        baseUrl: PIPER_VOICE_BASE_URL,
      })
      // WebGPU wenn verfügbar, sonst WASM-Fallback
      const hasWebGPU = 'gpu' in navigator
      const onnxRuntime = hasWebGPU
        ? new OnnxWebGPUWorkerRuntime({ basePath: `${PIPER_BASE_PATH}onnx/` })
        : new OnnxWebWorkerRuntime({ basePath: `${PIPER_BASE_PATH}onnx/` })
      const engine = new PiperWebWorkerEngine({
        onnxRuntime,
        phonemizeRuntime: new PhonemizeWebRuntime({ basePath: PIPER_BASE_PATH }),
        expressionRuntime: { destroy() {} },
        voiceProvider: provider,
      })
      return { engine, provider }
    })()
  }
  return piperPromise
}

let audioCtx: AudioContext | null = null

function getAudioCtx(): AudioContext {
  audioCtx ??= new AudioContext()
  return audioCtx
}

/* ── Satz-Split ──────────────────────────────────────────────────── */
/** Teilt Text an Satzgrenzen. Kürzt nicht mitten in Zahlen/Abk. */
export function splitSentences(text: string): string[] {
  // Split nach . ! ? — aber nicht nach z.B./Nr./Dr./1. etc.
  const parts = text.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ\d])/)
  return parts.map((s) => s.trim()).filter(Boolean)
}

/* ── Decoded-Audio-Cache für Vorgenerierung ──────────────────────── */
interface DecodedAudio { samples: Float32Array; rate: number }
const pregenCache = new Map<string, Promise<DecodedAudio>>()

async function generateFirstSentence(text: string): Promise<DecodedAudio> {
  if (!(await isTtsModelCached())) return { samples: new Float32Array(0), rate: 22050 }
  const sentence = splitSentences(text)[0] ?? text
  return generateSegment(sentence)
}

async function generateSegment(text: string): Promise<DecodedAudio> {
  const { engine } = await getPiper()
  const { file } = await engine.generate(text, TTS_VOICE, 0)
  const arrayBuffer = await file.arrayBuffer()
  const ctx = getAudioCtx()
  const buffer = await ctx.decodeAudioData(arrayBuffer)
  return { samples: buffer.getChannelData(0), rate: buffer.sampleRate }
}

/** Vorgeneriert den ersten Satz einer Karte (kein Token-Check — wird als Cache gespeichert). */
export function pregenCard(id: string, text: string): void {
  if (externalMode || pregenCache.has(id) || state.tts.muted || state.tts.mode !== 'wasm') return
  pregenCache.set(id, generateFirstSentence(text))
}

/** Löscht einen Eintrag aus dem Pre-gen-Cache (z.B. wenn eine Karte entfernt wird). */
export function clearPregen(id: string): void {
  pregenCache.delete(id)
}



let currentSource: AudioBufferSourceNode | null = null
let token = 0

export function stopSpeaking() {
  token++
  try {
    currentSource?.stop()
  } catch {
    // schon gestoppt
  }
  currentSource = null
  if (state.tts.mode === 'webspeech') speechSynthesis.cancel()
}

function playBuffer(audio: Float32Array, rate: number, myToken: number): Promise<void> {
  return new Promise((resolve) => {
    if (token !== myToken) {
      resolve()
      return
    }
    const ctx = getAudioCtx()
    void ctx.resume()
    const buffer = ctx.createBuffer(1, audio.length, rate)
    buffer.copyToChannel(Float32Array.from(audio), 0)
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.connect(ctx.destination)
    src.onended = () => {
      if (currentSource === src) currentSource = null
      resolve()
    }
    currentSource = src
    src.start()
  })
}

async function speakWasm(text: string, myToken: number) {
  if (!(await isTtsModelCached())) {
    throw new Error('TTS-Modell nicht heruntergeladen. In der Config unter „Sprache“ laden.')
  }
  const sentences = splitSentences(text)
  if (sentences.length === 0) return

  // Lookahead-1-Pipeline: ersten Satz aus Pre-gen-Cache oder frisch generieren
  const firstCacheKey = `__speak__${myToken}`
  let nextAudio: Promise<DecodedAudio>

  // Schaue ob der erste Satz vorher für eine bekannte Karte vorgeneriert wurde
  // (Aufrufer kann den Cache-Key mitgeben — hier nutzen wir den Text als Key)
  const cachedFirst = pregenCache.get(text)
  if (cachedFirst) {
    nextAudio = cachedFirst
    pregenCache.delete(text)
  } else {
    nextAudio = generateSegment(sentences[0])
  }

  for (let i = 0; i < sentences.length; i++) {
    const audio = await nextAudio
    if (token !== myToken) return

    // Nächsten Satz parallel zum Abspielen generieren
    if (i + 1 < sentences.length) {
      nextAudio = generateSegment(sentences[i + 1])
    }

    await playBuffer(audio.samples, audio.rate, myToken)
    if (token !== myToken) return
  }
  pregenCache.delete(firstCacheKey)
}

async function speakServer(text: string, myToken: number) {
  const endpoint = state.tts.endpoint
  if (!endpoint) throw new Error('Kein TTS-Endpoint konfiguriert')
  const base = endpoint.replace(/\/+$/, '')
  const res = await fetch(`${base}/audio/speech`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(state.tts.key ? { Authorization: `Bearer ${state.tts.key}` } : {}),
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text,
      voice: state.tts.voice || 'alloy',
      response_format: 'wav',
    }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  const arrayBuffer = await blob.arrayBuffer()
  const ctx = getAudioCtx()
  const buffer = await ctx.decodeAudioData(arrayBuffer)
  if (token !== myToken) return
  await playBuffer(buffer.getChannelData(0), buffer.sampleRate, myToken)
}

function speakWebSpeech(text: string) {
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'de-DE'
  const voices = speechSynthesis.getVoices()
  const german = voices.find((v) => v.lang.toLowerCase().startsWith('de'))
  if (german) utterance.voice = german
  speechSynthesis.speak(utterance)
}

export async function speak(text: string) {
  stopSpeaking()
  // Externer Modus: externer Agent spricht — kein internes TTS
  if (externalMode) return
  // Mute betrifft nur die Sprachausgabe — Alarmtöne (Timer) bleiben unberührt
  if (state.tts.muted) return
  const myToken = ++token
  const clean = text.trim()
  if (!clean) return
  try {
    switch (state.tts.mode) {
      case 'server':
        await speakServer(clean, myToken)
        break
      case 'webspeech':
        speakWebSpeech(clean)
        break
      case 'wasm':
      default:
        await speakWasm(clean, myToken)
    }
  } catch (e) {
    showToast(`TTS: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/** Sprachausgabe stumm- bzw. wieder einschalten (nur TTS, nicht Alarmtöne) */
export function toggleMuted(): boolean {
  const muted = !state.tts.muted
  setTts({ muted })
  if (muted) stopSpeaking()
  return muted
}

export async function isTtsModelCached(): Promise<boolean> {
  try {
    const cache = await caches.open(PIPER_CACHE_KEY)
    const keys = await cache.keys()
    return keys.some((r) => r.url.includes(TTS_VOICE))
  } catch {
    return false
  }
}

export async function downloadTtsModel(
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  progressCb = onProgress ?? null
  try {
    const { provider } = await getPiper()
    await provider.fetch(TTS_VOICE)
  } finally {
    progressCb = null
  }
}

export async function deleteTtsModel(): Promise<void> {
  await caches.delete(PIPER_CACHE_KEY)
  piperPromise = null
}
