'use client'

// Transcription 100% navigateur via un modèle Whisper embarqué (transformers.js).
// Gratuit, aucune clé : on enregistre tout l'audio puis on le transcrit d'un coup
// (pas de coupure, contrairement à la reconnaissance live du navigateur).
// Le modèle (~150 Mo) est téléchargé une fois puis mis en cache par le navigateur.

const MODEL = 'Xenova/whisper-base' // multilingue, bon compromis qualité/poids pour le français

type ProgressCb = (p: { stage: 'model' | 'transcribe'; pct?: number; label?: string }) => void

let transcriberPromise: Promise<any> | null = null

async function getTranscriber(onProgress?: ProgressCb) {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const { pipeline } = await import('@huggingface/transformers')
      const device = typeof navigator !== 'undefined' && (navigator as any).gpu ? 'webgpu' : 'wasm'
      return pipeline('automatic-speech-recognition', MODEL, {
        device,
        progress_callback: (p: any) => {
          if (p?.status === 'progress' && typeof p.progress === 'number') {
            onProgress?.({ stage: 'model', pct: Math.round(p.progress), label: 'Téléchargement du modèle' })
          }
        },
      } as any)
    })().catch((e) => { transcriberPromise = null; throw e })
  }
  return transcriberPromise
}

/** Décode un Blob audio en Float32 mono 16 kHz (format attendu par Whisper). */
async function decodeTo16k(blob: Blob): Promise<Float32Array> {
  const buf = await blob.arrayBuffer()
  const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext
  const ctx = new AC({ sampleRate: 16000 })
  try {
    const audio = await ctx.decodeAudioData(buf)
    if (audio.numberOfChannels === 1) return audio.getChannelData(0)
    // Moyenne des canaux -> mono
    const a = audio.getChannelData(0)
    const b = audio.getChannelData(1)
    const out = new Float32Array(a.length)
    for (let i = 0; i < a.length; i++) out[i] = (a[i] + b[i]) / 2
    return out
  } finally {
    ctx.close()
  }
}

export async function transcribeAudio(blob: Blob, onProgress?: ProgressCb): Promise<string> {
  const transcriber = await getTranscriber(onProgress)
  onProgress?.({ stage: 'transcribe', label: 'Transcription en cours' })
  const audio = await decodeTo16k(blob)
  const result: any = await transcriber(audio, {
    chunk_length_s: 30,
    stride_length_s: 5,
    language: 'french',
    task: 'transcribe',
  })
  const text = Array.isArray(result) ? result.map((r) => r.text).join(' ') : (result?.text || '')
  return String(text).replace(/\s+/g, ' ').trim()
}

export function whisperSupported(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}
