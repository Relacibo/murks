import { state, pushAgentMessage } from '../state/store'
import { isModelCached, deleteModelFromCache } from './modelCache'
import type { DownloadProgress } from './modelProgress'

const TTS_MODEL = 'Xenova/mms-tts-deu'
const ORT_WASM_PATH = `${import.meta.env.BASE_URL}ort/`

interface TtsPipeline {
  (text: string): Promise<{ audio: Float32Array; sampling_rate: number }>
}

type TransformersModule = typeof import('@huggingface/transformers')

let pipelinePromise: Promise<TtsPipeline> | null = null
let progressCb: ((p: DownloadProgress) => void) | null = null

function getPipeline(): Promise<TtsPipeline> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      let mod: TransformersModule
      try {
        mod = await import('@huggingface/transformers')
      } catch (e) {
        if (!sessionStorage.getItem('murks:stt-reload')) {
          sessionStorage.setItem('murks:stt-reload', '1')
          location.reload()
          await new Promise<TtsPipeline>(() => {})
        }
        throw e
      }
      const onnxBackend = mod.env.backends?.onnx
      if (onnxBackend?.wasm) onnxBackend.wasm.wasmPaths = ORT_WASM_PATH
      const device = 'gpu' in navigator ? 'webgpu' : 'wasm'
      return (await mod.pipeline('text-to-speech', TTS_MODEL, {
        device,
        dtype: 'q8',
        progress_callback: (p) => progressCb?.(p as DownloadProgress),
      })) as unknown as TtsPipeline
    })()
  }
  return pipelinePromise
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
  const pipe = await getPipeline()
  const { audio, sampling_rate } = await pipe(text)
  if (token !== myToken) return
  await playBuffer(audio, sampling_rate, myToken)
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
  return isModelCached(TTS_MODEL)
}

export async function downloadTtsModel(
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  progressCb = onProgress ?? null
  try {
    await getPipeline()
  } finally {
    progressCb = null
  }
}

export async function deleteTtsModel(): Promise<void> {
  await deleteModelFromCache(TTS_MODEL)
  pipelinePromise = null
}
