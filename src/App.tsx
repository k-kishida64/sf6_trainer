import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'
import coreURL from '@ffmpeg/core?url'
import wasmURL from '@ffmpeg/core/wasm?url'
import './App.css'

type VideoEntry = { id: string; label: string; src: string; kind: 'gif' | 'video' }

const videos: VideoEntry[] = []

type SessionState = 'idle' | 'waiting' | 'playing' | 'finished'

function App() {
  const [intervalSeconds, setIntervalSeconds] = useState(2)
  const [playSeconds, setPlaySeconds] = useState(5)
  const [sessionState, setSessionState] = useState<SessionState>('idle')
  const [selectedVideo, setSelectedVideo] = useState<VideoEntry | null>(null)
  const [uploadedVideos, setUploadedVideos] = useState<VideoEntry[]>([])
  const [waitSeconds, setWaitSeconds] = useState<number | null>(null)
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null)
  const [videoError, setVideoError] = useState(false)
  const [isConverting, setIsConverting] = useState(false)
  const [conversionMessage, setConversionMessage] = useState('')
  const [roundNumber, setRoundNumber] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const timerRef = useRef<number | null>(null)
  const countdownRef = useRef<number | null>(null)
  const lastVideoIdRef = useRef<string | null>(null)
  const uploadedVideosRef = useRef(uploadedVideos)
  uploadedVideosRef.current = uploadedVideos

  const availableVideos = [...videos, ...uploadedVideos]

  const handleVideoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) return

    const directGifs: VideoEntry[] = files
      .filter((file) => file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif'))
      .map((file) => ({
        id: `${file.name}-${file.lastModified}`,
        label: file.name.replace(/\.[^/.]+$/, ''),
        src: URL.createObjectURL(file),
        kind: 'gif',
      }))
    const sourceFiles = files.filter((file) => !directGifs.some((video) => video.id === `${file.name}-${file.lastModified}`))

    if (sourceFiles.length === 0) {
      setUploadedVideos((current) => [...current, ...directGifs])
      setConversionMessage(`${directGifs.length}本のGIFを追加しました`)
      return
    }

    setIsConverting(true)
    setConversionMessage('GIFに変換中...')
    try {
      const ffmpeg = new FFmpeg()
      await ffmpeg.load({
        coreURL,
        wasmURL,
      })

      const newVideos: VideoEntry[] = []
      for (const file of sourceFiles) {
        const label = file.name.replace(/\.[^/.]+$/, '')
        const inputName = `input-${file.lastModified}.${file.name.split('.').pop() ?? 'mp4'}`
        const outputName = `output-${file.lastModified}.gif`
        await ffmpeg.writeFile(inputName, await fetchFile(file))
        await ffmpeg.exec(['-i', inputName, '-vf', 'fps=12,scale=480:-1:flags=lanczos', '-t', '15', '-loop', '0', outputName])
        const output = await ffmpeg.readFile(outputName)
        const gifBytes = typeof output === 'string' ? new TextEncoder().encode(output) : output
        const gifBlob = new Blob([gifBytes as unknown as BlobPart], { type: 'image/gif' })
        newVideos.push({
          id: `${file.name}-${file.lastModified}`,
          label,
          src: URL.createObjectURL(gifBlob),
          kind: 'gif',
        })
        await ffmpeg.deleteFile(inputName)
        await ffmpeg.deleteFile(outputName)
      }
      setUploadedVideos((current) => [...current, ...directGifs, ...newVideos])
      setConversionMessage(`${directGifs.length + newVideos.length}本のGIFを追加しました`)
    } catch (error) {
      console.error(error)
      const detail = error instanceof Error ? error.message : String(error)
      setConversionMessage(`変換失敗: ${detail.slice(0, 100)}`)
    } finally {
      setIsConverting(false)
    }
  }

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      if (countdownRef.current !== null) window.clearInterval(countdownRef.current)
      uploadedVideosRef.current.forEach((video) => URL.revokeObjectURL(video.src))
    }
  }, [])

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (countdownRef.current !== null) {
      window.clearInterval(countdownRef.current)
      countdownRef.current = null
    }
  }

  function startSession() {
    clearTimer()
    videoRef.current?.pause()
    const interval = Math.max(0, Number(intervalSeconds) || 0)
    const playDuration = Math.max(0.1, Number(playSeconds) || 0.1)
    const candidates = availableVideos.filter((video) => video.id !== lastVideoIdRef.current)
    const pool = candidates.length > 0 ? candidates : availableVideos
    const selected = pool[Math.floor(Math.random() * pool.length)]
    if (!selected) {
      setVideoError(true)
      return
    }
    setIntervalSeconds(interval)
    setPlaySeconds(playDuration)
    setSelectedVideo(selected)
    lastVideoIdRef.current = selected.id
    setVideoError(false)
    setWaitSeconds(interval)
    setRemainingSeconds(interval)
    setSessionState('waiting')
    const startedAt = Date.now()
    countdownRef.current = window.setInterval(() => {
      setRemainingSeconds(Math.max(0, interval - (Date.now() - startedAt) / 1000))
    }, 50)

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      if (countdownRef.current !== null) window.clearInterval(countdownRef.current)
      countdownRef.current = null
      setRemainingSeconds(0)
      setSessionState('playing')
      setRoundNumber((current) => current + 1)
      timerRef.current = window.setTimeout(startSession, playDuration * 1000)
    }, interval * 1000)
  }

  useEffect(() => {
    if (sessionState !== 'playing' || !selectedVideo || !videoRef.current) return

    const video = videoRef.current
    video.load()
    video.play().catch(() => setVideoError(true))
  }, [selectedVideo, sessionState])

  const stopSession = () => {
    clearTimer()
    videoRef.current?.pause()
    setSessionState('idle')
    setRemainingSeconds(null)
  }

  const resetSession = () => {
    stopSession()
    lastVideoIdRef.current = null
    setSelectedVideo(null)
    setWaitSeconds(null)
    if (videoRef.current) {
      videoRef.current.currentTime = 0
      videoRef.current.removeAttribute('src')
      videoRef.current.load()
    }
  }

  const statusLabel = {
    idle: 'Ready to train',
    waiting: 'Get ready',
    playing: 'Play now',
    finished: 'Round complete',
  }[sessionState]

  const displayTime = remainingSeconds === null
    ? '--'
    : remainingSeconds < 0.05
      ? '0.0'
      : remainingSeconds.toFixed(1)

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">SF</div>
        <div>
          <p className="eyebrow">Reaction lab / 01</p>
          <h1>SF6 Trainer</h1>
        </div>
        <span className="offline-badge"><span /> Local mode</span>
      </header>

      <section className="stage" aria-live="polite">
        <div className={`stage-glow state-${sessionState}`} />
        {selectedVideo && sessionState !== 'waiting' ? selectedVideo.kind === 'gif' ? (
          <img key={`${selectedVideo.id}-${roundNumber}`} className="training-video" src={selectedVideo.src} alt={selectedVideo.label} onError={() => setVideoError(true)} />
        ) : (
          <video ref={videoRef} className="training-video" src={selectedVideo.src} playsInline muted preload="auto" controls={sessionState === 'playing' || sessionState === 'finished'} onError={() => setVideoError(true)} onEnded={() => setSessionState('finished')} />
        ) : <div className="empty-stage"><span className="crosshair">+</span><p>Choose a drill to begin</p></div>}
        <div className="stage-meta"><span>{selectedVideo?.label ?? 'No drill selected'}</span><span className={`status status-${sessionState}`}><i />{statusLabel}</span></div>
        {sessionState === 'waiting' && <div className="countdown"><strong>{displayTime}</strong><span>seconds</span></div>}
        {videoError && <p className="video-error">動画を読み込めません。ファイル形式とパスを確認してください。</p>}
      </section>

      <section className="control-panel">
        <div className="panel-heading"><div><p className="eyebrow">Session setup</p><h2>Drill timing</h2></div><span className="range-label">{waitSeconds === null ? '2.0 / 5.0 s' : `${waitSeconds.toFixed(1)} s interval`}</span></div>
        <div className="range-controls">
          <label><span>Interval</span><div className="number-input"><input type="number" min="0" max="60" step="0.5" value={intervalSeconds} onChange={(event) => setIntervalSeconds(Number(event.target.value))} /><b>s</b></div></label>
          <div className="range-connector" />
          <label><span>Play</span><div className="number-input"><input type="number" min="0.1" max="60" step="0.5" value={playSeconds} onChange={(event) => setPlaySeconds(Number(event.target.value))} /><b>s</b></div></label>
        </div>
        <div className="actions"><button className="primary-action" type="button" onClick={startSession}><span>▶</span> Start drill</button><button className="secondary-action" type="button" onClick={stopSession} disabled={sessionState === 'idle'}>Stop</button><button className="reset-action" type="button" onClick={resetSession} aria-label="Reset session">↻</button></div>
        <label className={`upload-control ${isConverting ? 'is-converting' : ''}`}><span>＋</span> {isConverting ? 'Converting...' : 'Add MOV / MP4 / GIF'}<input type="file" accept="video/quicktime,video/mp4,image/gif,.mov,.mp4,.gif" multiple onChange={handleVideoUpload} disabled={isConverting} /></label>
        <p className="helper-text">{conversionMessage || 'MOV and MP4 files are converted to GIF locally on this device.'}</p>
      </section>

      <footer><span>DRILL LIBRARY <b>{availableVideos.length.toString().padStart(2, '0')}</b></span><span>LOCAL / NO ACCOUNT</span></footer>
    </main>
  )
}

export default App
