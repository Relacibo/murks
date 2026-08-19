import { state, pushAgentMessage } from '../state/store'
import type { DownloadProgress } from './modelProgress'

const TTS_VOICE = 'de_DE-thorsten-high'
const PIPER_CACHE_KEY = 'murks-piper'
const PIPER_BASE_PATH = `${import.meta.env.BASE_URL}piper/`
const PIPER_VOICE_BASE_URL = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/'

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
    if (reader && total > 0) {
      const chunks: BlobPart[] = []
      let loaded = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          chunks.push(Uint8Array.from(value))
          loaded += value.length
          progressCb?.({
            status: 'progress',
            file: fileName,
            loaded,
            total,
            progress: (loaded / total) * 100,
          })
        }
      }
      const body = new Blob(chunks, { type: res.headers.get('content-type') ?? '' })
      const full = new Response(body, { status: res.status, headers: res.headers })
      await cache.put(url, full.clone())
      return url.endsWith('.json') ? full.json() : URL.createObjectURL(await full.blob())
    }
    await cache.put(url, res.clone())
    return url.endsWith('.json') ? res.json() : URL.createObjectURL(await res.blob())
  }
}

let piperPromise: Promise<PiperBundle> | null = null

function getPiper(): Promise<PiperBundle> {
  if (!piperPromise) {
    piperPromise = (async () => {
      const { PiperWebEngine, OnnxWebRuntime, PhonemizeWebRuntime, RemoteVoiceProvider } =
        await import('piper-tts-web')
      const provider = new RemoteVoiceProvider({
        provider: new CacheVoiceProvider(),
        baseUrl: PIPER_VOICE_BASE_URL,
      })
      const engine = new PiperWebEngine({
        onnxRuntime: new OnnxWebRuntime({ basePath: `${PIPER_BASE_PATH}onnx/` }),
        phonemizeRuntime: new PhonemizeWebRuntime({ basePath: PIPER_BASE_PATH }),
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
  const { engine } = await getPiper()
  const { file } = await engine.generate(text, TTS_VOICE, 0)
  if (token !== myToken) return
  const arrayBuffer = await file.arrayBuffer()
  const ctx = getAudioCtx()
  const buffer = await ctx.decodeAudioData(arrayBuffer)
  if (token !== myToken) return
  await playBuffer(buffer.getChannelData(0), buffer.sampleRate, myToken)
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
    pushAgentMessage(
      'agent',
      `TTS-Fehler: ${e instanceof Error ? e.message : String(e)}`,
      true,
    )
  }
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
