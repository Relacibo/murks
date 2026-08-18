import { state } from '../state/store'

const WASM_MODEL = 'Xenova/whisper-small'

interface AsrPipeline {
  (audio: Float32Array, options: Record<string, unknown>): Promise<{ text: string }>
}

type TransformersModule = typeof import('@huggingface/transformers')

let pipelinePromise: Promise<AsrPipeline> | null = null

async function createPipeline(
  mod: TransformersModule,
  device: 'webgpu' | 'wasm',
): Promise<AsrPipeline> {
  return (await mod.pipeline('automatic-speech-recognition', WASM_MODEL, {
    device,
    dtype: 'q8',
  })) as unknown as AsrPipeline
}

function getPipeline(): Promise<AsrPipeline> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      let mod: TransformersModule
      try {
        mod = await import('@huggingface/transformers')
      } catch (e) {
        if (!sessionStorage.getItem('murks:stt-reload')) {
          sessionStorage.setItem('murks:stt-reload', '1')
          location.reload()
          await new Promise<AsrPipeline>(() => {})
        }
        throw e
      }
      const device = 'gpu' in navigator ? 'webgpu' : 'wasm'
      try {
        const pipe = await createPipeline(mod, device)
        sessionStorage.removeItem('murks:stt-reload')
        return pipe
      } catch (e) {
        if (device === 'webgpu') {
          const pipe = await createPipeline(mod, 'wasm')
          sessionStorage.removeItem('murks:stt-reload')
          return pipe
        }
        throw e
      }
    })()
  }
  return pipelinePromise
}

function resample(audio: Float32Array, fromRate: number, toRate = 16000): Float32Array {
  if (fromRate === toRate) return audio
  const ratio = fromRate / toRate
  const outLen = Math.round(audio.length / ratio)
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio
    const i0 = Math.floor(pos)
    const i1 = Math.min(i0 + 1, audio.length - 1)
    const frac = pos - i0
    out[i] = audio[i0] * (1 - frac) + audio[i1] * frac
  }
  return out
}

async function decodeAudio(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer()
  const ctx = new AudioContext()
  try {
    const buffer = await ctx.decodeAudioData(arrayBuffer)
    return resample(buffer.getChannelData(0), buffer.sampleRate)
  } finally {
    ctx.close()
  }
}

async function transcribeWasm(blob: Blob): Promise<string> {
  const audio = await decodeAudio(blob)
  const pipe = await getPipeline()
  const out = await pipe(audio, {
    language: 'de',
    task: 'transcribe',
    chunk_length_s: 30,
    stride_length_s: 5,
  })
  return out.text.trim()
}

async function transcribeServer(blob: Blob): Promise<string> {
  const endpoint = state.stt.endpoint
  if (!endpoint) throw new Error('Kein STT-Endpoint konfiguriert')
  const fd = new FormData()
  fd.append('file', blob, 'audio.webm')
  const res = await fetch(`${endpoint.replace(/\/+$/, '')}/audio/transcriptions`, {
    method: 'POST',
    headers: state.stt.key ? { Authorization: `Bearer ${state.stt.key}` } : {},
    body: fd,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (typeof data.text !== 'string') throw new Error('Unerwartete Antwort vom STT-Server')
  return data.text.trim()
}

export async function transcribeAudio(blob: Blob): Promise<string> {
  switch (state.stt.mode) {
    case 'server':
      return transcribeServer(blob)
    case 'wasm':
    default:
      return transcribeWasm(blob)
  }
}

const MODEL_CACHE_KEY = 'transformers-cache'

export async function isSttModelCached(): Promise<boolean> {
  try {
    const cache = await caches.open(MODEL_CACHE_KEY)
    const keys = await cache.keys()
    return keys.some((r) => r.url.includes('whisper-small'))
  } catch {
    return false
  }
}

export async function downloadSttModel(): Promise<void> {
  await getPipeline()
}

export async function deleteSttModel(): Promise<void> {
  await caches.delete(MODEL_CACHE_KEY)
}

type SpeechRecognitionEvent = {
  resultIndex: number
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
}

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}

export function createWebSpeechRecognition(
  onResult: (transcript: string, isFinal: boolean) => void,
  onError: (message: string) => void,
  onEnd: () => void,
): SpeechRecognitionLike | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
  if (!Ctor) {
    onError('Browser-Spracherkennung nicht verfügbar')
    return null
  }
  const rec = new Ctor()
  rec.lang = 'de-DE'
  rec.continuous = false
  rec.interimResults = true
  rec.onresult = (e) => {
    let final = ''
    let interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]
      if (r.isFinal) final += r[0].transcript
      else interim += r[0].transcript
    }
    onResult((final + interim).trim(), final.length > 0)
  }
  rec.onerror = (e) => {
    if (e.error === 'aborted' || e.error === 'no-speech') return
    onError(`Spracherkennung: ${e.error}`)
  }
  rec.onend = onEnd
  return rec
}
