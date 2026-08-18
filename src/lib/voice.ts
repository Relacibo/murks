import { MicVAD } from '@ricky0123/vad-web'

const VAD_ASSET_PATH = `${import.meta.env.BASE_URL}vad/`

export interface VoiceHandlers {
  onSpeechStart: () => void
  onSpeechEnd: (audio: Float32Array) => void | Promise<void>
  onMisfire?: () => void
  onError: (message: string) => void
}

export async function createVoice(handlers: VoiceHandlers): Promise<MicVAD> {
  return MicVAD.new({
    model: 'legacy',
    startOnLoad: false,
    baseAssetPath: VAD_ASSET_PATH,
    onnxWASMBasePath: VAD_ASSET_PATH,
    onSpeechStart: handlers.onSpeechStart,
    onSpeechEnd: handlers.onSpeechEnd,
    onVADMisfire: handlers.onMisfire,
    ortConfig(ort) {
      ort.env.logLevel = 'error'
      ort.env.wasm.proxy = false
    },
  }).catch((e: unknown) => {
    handlers.onError(e instanceof Error ? e.message : String(e))
    throw e
  })
}
