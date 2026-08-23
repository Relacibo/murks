# TTS: Parallele Generierung mit Worker-Pool

## Problem

`PiperWebEngine.generate()` ist intern serialisiert: wenn eine Instanz bereits generiert, wartet ein zweiter Aufruf in einer Polling-Schleife (`setTimeout(..., 100)`). Eine einzelne Engine kann nie parallel arbeiten.

Die aktuelle Pipeline in `speakWasm()` ist bereits ein **1-ahead-Lookahead**: Satz i+1 wird generiert während Satz i abgespielt wird. Das ist das Maximum mit einer Engine-Instanz.

## Lösung: Pool aus 2 PiperWebWorkerEngine-Instanzen

Jede `PiperWebWorkerEngine`-Instanz startet eigene Worker-Threads:
- `OnnxWebWorker.js` / `OnnxWebGPUWorker.js` – ONNX-Inferenz
- `PhonemizeWebWorker.js` – Phonemisierung

Zwei Instanzen → 2 parallele Generierungen möglich → **2-ahead-Lookahead**.

### Ablauf mit Pool

```
Satz:      0        1        2        3
Engine A:  gen[0]            gen[2]
Engine B:           gen[1]            gen[3]
Play:               play[0]  play[1]  play[2]
```

Sätze 0+1 werden gleichzeitig gestartet, danach immer Round-Robin.

### Implementierung

```ts
// In tts.ts: statt eines einzelnen piperPromise
let piperPool: Promise<PiperBundle>[] | null = null
const POOL_SIZE = 2

function getPiperPool(): Promise<PiperBundle>[] {
  if (!piperPool) {
    piperPool = Array.from({ length: POOL_SIZE }, () => createPiperInstance())
  }
  return piperPool
}

// In speakWasm: alle Sätze sofort parallel anstoßen, sequenziell abspielen
async function speakWasm(text: string, myToken: number) {
  const sentences = splitSentences(text)
  if (sentences.length === 0) return
  const pool = await Promise.all(getPiperPool())

  // Alle Generierungen parallel starten (aber Pool-Größe begrenzt echte Parallelität)
  const audioPromises = sentences.map((s, i) =>
    generateWithEngine(pool[i % POOL_SIZE], s)
  )

  for (let i = 0; i < sentences.length; i++) {
    const audio = await audioPromises[i]
    if (token !== myToken) return
    await playBuffer(audio.samples, audio.rate, myToken)
    if (token !== myToken) return
  }
}
```

## Tradeoffs

| | Aktuell (1 Engine) | Pool (2 Engines) |
|---|---|---|
| Latenz 1. Satz | ~Generierungszeit | gleich |
| Latenz ab Satz 2 | max(gen, play) | max(gen/2, play) |
| RAM (WASM) | 1× Modell im Worker-Heap | ~2× |
| RAM (WebGPU) | 1× GPU-Kontext | geteilt, kaum Overhead |
| Threads | 2 Worker | 4 Worker |

Bei WebGPU lohnt es sich besonders, da der GPU-Speicher geteilt wird und nur CPU-seitig mehr Overhead entsteht.

## Hinweise

- `deleteTtsModel()` / `piperPromise = null` muss auf den Pool angepasst werden
- Pre-gen-Cache (`pregenCard`) müsste den Pool ebenfalls kennen
- Sinnvoll erst wenn POOL_SIZE > 1 und Sätze kürzer sind als Generierungszeit
