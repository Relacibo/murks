import { state } from '../state/store'

const WASM_MODEL = 'Xenova/whisper-small'
const ORT_WASM_PATH = `${import.meta.env.BASE_URL}ort/`

interface AsrPipeline {
  (audio: Float32Array, options: Record<string, unknown>): Promise<{ text: string }>
}

type TransformersModule = typeof import('@huggingface/transformers')

let pipelinePromise: Promise<AsrPipeline> | null = null

async function createPipeline(
  mod: TransformersModule,
  device: 'webgpu' | 'wasm',
): Promise<AsrPipeline> {
  const onnxBackend = mod.env.backends?.onnx
  if (onnxBackend?.wasm) onnxBackend.wasm.wasmPaths = ORT_WASM_PATH
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

async function transcribeWasm(audio: Float32Array): Promise<string> {
  const pipe = await getPipeline()
  const out = await pipe(audio, {
    language: 'de',
    task: 'transcribe',
    chunk_length_s: 30,
    stride_length_s: 5,
  })
  return out.text.trim()
}

function float32ToWavBlob(audio: Float32Array): Blob {
  const buffer = new ArrayBuffer(44 + audio.length * 2)
  const view = new DataView(buffer)
  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + audio.length * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 16000, true)
  view.setUint32(28, 32000, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, audio.length * 2, true)
  let offset = 44
  for (let i = 0; i < audio.length; i++, offset += 2) {
    view.setInt16(offset, Math.max(-1, Math.min(1, audio[i])) * 0x7fff, true)
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

async function transcribeServer(audio: Float32Array): Promise<string> {
  const endpoint = state.stt.endpoint
  if (!endpoint) throw new Error('Kein STT-Endpoint konfiguriert')
  const fd = new FormData()
  fd.append('file', float32ToWavBlob(audio), 'audio.wav')
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

export async function transcribeAudio(audio: Float32Array): Promise<string> {
  switch (state.stt.mode) {
    case 'server':
      return transcribeServer(audio)
    case 'wasm':
    default:
      return transcribeWasm(audio)
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
