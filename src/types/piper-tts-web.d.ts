declare module 'piper-tts-web' {
  export class PiperWebEngine {
    constructor(options?: {
      onnxRuntime?: unknown
      phonemizeRuntime?: unknown
      expressionRuntime?: unknown
      voiceProvider?: unknown
    })
    generate(
      text: string,
      voice: string,
      speaker?: number,
    ): Promise<{ file: Blob; duration: number; phonemeData: unknown }>
    destroy(): void
  }
  export class PiperWebWorkerEngine extends PiperWebEngine {
    constructor(options?: {
      onnxRuntime?: unknown
      phonemizeRuntime?: unknown
      expressionRuntime?: unknown
      voiceProvider?: unknown
    })
  }
  export class OnnxWebRuntime {
    constructor(options?: { basePath?: string; numThreads?: number })
  }
  export class OnnxWebWorkerRuntime {
    constructor(options?: { basePath?: string; numThreads?: number })
  }
  export class PhonemizeWebRuntime {
    constructor(options?: { provider?: unknown; basePath?: string })
  }
  export class RemoteVoiceProvider {
    constructor(options?: { provider?: unknown; baseUrl?: string; separator?: string })
    fetch(voice: string): Promise<[unknown, unknown]>
  }
}
