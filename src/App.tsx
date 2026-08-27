import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'
import coreURL from '@ffmpeg/core?url'
import wasmURL from '@ffmpeg/core/wasm?url'
import { getStoredVideos, removeStoredVideo, renameStoredVideo, saveStoredVideo } from './videoStore'
import editIcon from './assets/icon_B_0421.svg'
import deleteIcon from './assets/icon_R_0740.svg'
import './App.css'

type VideoEntry = { id: string; label: string; src: string; kind: 'gif' | 'video' }

const videos: VideoEntry[] = []

type SessionState = 'idle' | 'waiting' | 'playing' | 'finished'
type GamepadSnapshot = { connected: boolean; name: string; pressed: string[]; axes: string[] }
const directionNames = ['NW', 'N', 'NE', 'W', 'CENTER', 'E', 'SW', 'S', 'SE']
const directionLabels: Record<string, string> = {
  NW: '7', N: '8', NE: '9', W: '4', CENTER: '5', E: '6', SW: '1', S: '2', SE: '3',
}
const actionButtons = [
  { label: 'P', color: 'blue', button: 'X', aliases: ['X'] },
  { label: 'P', color: 'yellow', button: 'Y', aliases: ['Y'] },
  { label: 'P', color: 'red', button: 'R', aliases: ['RB'] },
  { label: 'K', color: 'blue', button: 'A', aliases: ['A'] },
  { label: 'K', color: 'yellow', button: 'B', aliases: ['B'] },
  { label: 'K', color: 'red', button: 'ZR', aliases: ['RT'] },
]

function App() {
  const [intervalSeconds, setIntervalSeconds] = useState(2)
  const [playSeconds, setPlaySeconds] = useState(5)
  const [sessionState, setSessionState] = useState<SessionState>('idle')
  const [selectedVideo, setSelectedVideo] = useState<VideoEntry | null>(null)
  const [uploadedVideos, setUploadedVideos] = useState<VideoEntry[]>([])
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set())
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null)
  const [editingVideoLabel, setEditingVideoLabel] = useState('')
  const [waitSeconds, setWaitSeconds] = useState<number | null>(null)
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null)
  const [videoError, setVideoError] = useState(false)
  const [isConverting, setIsConverting] = useState(false)
  const [conversionMessage, setConversionMessage] = useState('')
  const [roundNumber, setRoundNumber] = useState(0)
  const [gamepad, setGamepad] = useState<GamepadSnapshot>({ connected: false, name: '', pressed: [], axes: [] })
  const videoRef = useRef<HTMLVideoElement>(null)
  const timerRef = useRef<number | null>(null)
  const countdownRef = useRef<number | null>(null)
  const editingInputRef = useRef<HTMLInputElement>(null)
  const lastVideoIdRef = useRef<string | null>(null)
  const uploadedVideosRef = useRef(uploadedVideos)
  uploadedVideosRef.current = uploadedVideos

  const availableVideos = [...videos, ...uploadedVideos.filter((video) => selectedVideoIds.has(video.id))]

  useEffect(() => {
    let cancelled = false
    getStoredVideos()
      .then((storedVideos) => {
        if (cancelled) return
        const loadedVideos: VideoEntry[] = storedVideos.map((video) => ({
          id: video.id,
          label: video.label,
          src: URL.createObjectURL(video.blob),
          kind: 'gif',
        }))
        setUploadedVideos(loadedVideos)
        setSelectedVideoIds(new Set(loadedVideos.map((video) => video.id)))
      })
      .catch((error) => {
        console.error(error)
        setConversionMessage('保存済み動画を読み込めませんでした')
      })
    return () => { cancelled = true }
  }, [])

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
      await Promise.all(files.map((file) => saveStoredVideo({
        id: `${file.name}-${file.lastModified}`,
        label: file.name.replace(/\.[^/.]+$/, ''),
        blob: file,
      })))
      setUploadedVideos((current) => [...current, ...directGifs])
      setSelectedVideoIds((current) => new Set([...current, ...directGifs.map((video) => video.id)]))
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
        await saveStoredVideo({ id: `${file.name}-${file.lastModified}`, label, blob: gifBlob })
        await ffmpeg.deleteFile(inputName)
        await ffmpeg.deleteFile(outputName)
      }
      setUploadedVideos((current) => [...current, ...directGifs, ...newVideos])
      setSelectedVideoIds((current) => new Set([...current, ...directGifs.map((video) => video.id), ...newVideos.map((video) => video.id)]))
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

  useEffect(() => {
    let animationFrame = 0
    const buttonNames = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'LS', 'RS', 'N', 'S', 'W', 'E']
    const readGamepad = () => {
      const connectedGamepad = navigator.getGamepads?.().find((pad): pad is Gamepad => pad !== null)
      if (!connectedGamepad) {
        setGamepad({ connected: false, name: '', pressed: [], axes: [] })
      } else {
        const pressed = connectedGamepad.buttons.reduce<string[]>((names, button, index) => {
          if (button.pressed) names.push(buttonNames[index] ?? `Button ${index + 1}`)
          return names
        }, [])
        const axes = connectedGamepad.axes
          .map((value, index) => Math.abs(value) > 0.15 ? `${index % 2 === 0 ? 'L' : 'R'}${index < 2 ? 'X' : 'Y'} ${value.toFixed(2)}` : '')
          .filter(Boolean)
        const horizontal = connectedGamepad.axes[0] ?? 0
        const vertical = connectedGamepad.axes[1] ?? 0
        if (Math.abs(horizontal) > 0.15 || Math.abs(vertical) > 0.15) {
          const verticalName = vertical < -0.15 ? 'N' : vertical > 0.15 ? 'S' : ''
          const horizontalName = horizontal < -0.15 ? 'W' : horizontal > 0.15 ? 'E' : ''
          const direction = `${verticalName}${horizontalName}`
          if (direction && !pressed.includes(direction)) pressed.push(direction)
        }
        setGamepad({ connected: true, name: connectedGamepad.id, pressed, axes })
      }
      animationFrame = window.requestAnimationFrame(readGamepad)
    }
    const connect = () => readGamepad()
    window.addEventListener('gamepadconnected', connect)
    window.addEventListener('gamepaddisconnected', connect)
    animationFrame = window.requestAnimationFrame(readGamepad)
    return () => {
      window.cancelAnimationFrame(animationFrame)
      window.removeEventListener('gamepadconnected', connect)
      window.removeEventListener('gamepaddisconnected', connect)
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

  const selectVideo = (video: VideoEntry) => {
    stopSession()
    setSelectedVideo(video)
    setVideoError(false)
  }

  const toggleVideoInDrill = (videoId: string) => {
    setSelectedVideoIds((current) => {
      const next = new Set(current)
      if (next.has(videoId)) next.delete(videoId)
      else next.add(videoId)
      return next
    })
  }

  const startEditingVideoLabel = (video: VideoEntry) => {
    setEditingVideoId(video.id)
    setEditingVideoLabel(video.label)
  }

  useEffect(() => {
    if (editingVideoId) editingInputRef.current?.select()
  }, [editingVideoId])

  const saveVideoLabel = async (video: VideoEntry) => {
    const nextLabel = editingVideoLabel.trim()
    setEditingVideoId(null)
    if (!nextLabel || nextLabel === video.label) return
    try {
      await renameStoredVideo(video.id, nextLabel)
      setUploadedVideos((current) => current.map((currentVideo) => currentVideo.id === video.id
        ? { ...currentVideo, label: nextLabel }
        : currentVideo))
      setSelectedVideo((current) => current?.id === video.id ? { ...current, label: nextLabel } : current)
      setConversionMessage('GIFの名前を変更しました')
    } catch (error) {
      console.error(error)
      setConversionMessage('GIFの名前を変更できませんでした')
    }
  }

  const deleteVideo = async (video: VideoEntry) => {
    if (!window.confirm(`「${video.label}」を削除しますか？`)) return
    try {
      await removeStoredVideo(video.id)
      URL.revokeObjectURL(video.src)
      setUploadedVideos((current) => current.filter((currentVideo) => currentVideo.id !== video.id))
      setSelectedVideoIds((current) => {
        const next = new Set(current)
        next.delete(video.id)
        return next
      })
      if (selectedVideo?.id === video.id) {
        stopSession()
        setSelectedVideo(null)
      }
      setConversionMessage('GIFを削除しました')
    } catch (error) {
      console.error(error)
      setConversionMessage('GIFを削除できませんでした')
    }
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
        <button className="brand-link" type="button" onClick={() => window.location.reload()} aria-label="SF6 Trainerを再読み込み">
          <div className="brand-mark" aria-hidden="true">SF</div>
          <div>
            <p className="eyebrow">Reaction lab / 01</p>
            <h1>SF6 Trainer</h1>
          </div>
        </button>
        <span className="offline-badge"><span /> Local mode</span>
      </header>

      <section className="stage" aria-live="polite">
        <div className={`stage-glow state-${sessionState}`} />
        {selectedVideo && sessionState !== 'waiting' ? selectedVideo.kind === 'gif' ? (
          <img key={`${selectedVideo.id}-${roundNumber}`} className="training-video" src={selectedVideo.src} alt={selectedVideo.label} onError={() => setVideoError(true)} />
        ) : (
          <video ref={videoRef} className="training-video" src={selectedVideo.src} playsInline muted preload="auto" controls={sessionState === 'playing' || sessionState === 'finished'} onError={() => setVideoError(true)} onEnded={() => setSessionState('finished')} />
        ) : <div className="empty-stage"><span className="crosshair">+</span><p>Choose a drill to begin</p></div>}
        {gamepad.connected && <div className="controller-overlay" aria-label="Live controller input">
          <div className="direction-pad">
            {directionNames.map((direction) => <span key={direction} className={`direction direction-${direction.toLowerCase()} ${gamepad.pressed.includes(direction) ? 'is-pressed' : ''}`}>{directionLabels[direction]}</span>)}
          </div>
          <div className="action-grid">
            {actionButtons.map((button) => <span key={`${button.label}-${button.color}`} className={`action-button button-${button.color} ${button.aliases.some((alias) => gamepad.pressed.includes(alias)) ? 'is-pressed' : ''}`}><b>{button.label}</b><small>{button.button}</small></span>)}
          </div>
        </div>}
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
        <div className="actions"><button className="primary-action" type="button" onClick={startSession}><span>▶</span> Start drill</button><button className="reset-action" type="button" onClick={resetSession} aria-label="Reset session">↻</button></div>
        <label className={`upload-control ${isConverting ? 'is-converting' : ''}`}><span>＋</span> {isConverting ? 'Converting...' : 'Add MOV / MP4 / GIF'}<input type="file" accept="video/quicktime,video/mp4,image/gif,.mov,.mp4,.gif" multiple onChange={handleVideoUpload} disabled={isConverting} /></label>
        <p className="helper-text">{conversionMessage || 'MOV and MP4 files are converted to GIF locally on this device.'}</p>
      </section>

      <section className="gamepad-panel">
        <div className="panel-heading"><div><p className="eyebrow">Controller input</p><h2>Bluetooth pad</h2></div><span className={`connection-label ${gamepad.connected ? 'connected' : ''}`}><i />{gamepad.connected ? 'Connected' : 'Waiting'}</span></div>
        {gamepad.connected ? <>
          <p className="controller-name">{gamepad.name}</p>
          <div className="input-readout"><span className="readout-label">Pressed</span><strong>{gamepad.pressed.length > 0 ? gamepad.pressed.join('  ') : 'None'}</strong></div>
        </> : <p className="helper-text">コントローラーのボタンを一度押すと接続を検出します。</p>}
      </section>

      {uploadedVideos.length > 0 && <section className="library-panel">
        <div className="panel-heading"><div><p className="eyebrow">Saved locally</p><h2>GIF library</h2></div><span className="range-label">{uploadedVideos.length.toString().padStart(2, '0')} clips</span></div>
        <div className="gif-library">
          {uploadedVideos.map((video) => <div className={`gif-card ${selectedVideo?.id === video.id ? 'is-selected' : ''}`} key={video.id}>
            <button className="gif-select" type="button" onClick={() => selectVideo(video)} aria-label={`${video.label}を選択`}>
              <img src={video.src} alt="" />
            </button>
            {editingVideoId === video.id
              ? <input ref={editingInputRef} className="video-name-input" value={editingVideoLabel} onChange={(event) => setEditingVideoLabel(event.target.value)} onBlur={() => void saveVideoLabel(video)} onKeyDown={(event) => { if (event.key === 'Enter') void saveVideoLabel(video); if (event.key === 'Escape') setEditingVideoId(null) }} aria-label="GIFの名前" />
              : <span className="video-name">{video.label}</span>}
            <div className="gif-actions">
              <button className={`include-video ${selectedVideoIds.has(video.id) ? 'is-included' : ''}`} type="button" onClick={() => toggleVideoInDrill(video.id)} aria-pressed={selectedVideoIds.has(video.id)}>
                {selectedVideoIds.has(video.id) ? 'In drill' : 'Excluded'}
              </button>
              <button className="icon-action edit-video" type="button" onClick={() => startEditingVideoLabel(video)} aria-label={`${video.label}の名前を編集`} title="Edit name"><img src={editIcon} alt="" /></button>
              <button className="icon-action delete-video" type="button" onClick={() => deleteVideo(video)} aria-label={`${video.label}を削除`} title="Delete"><img src={deleteIcon} alt="" /></button>
            </div>
          </div>)}
        </div>
      </section>}

      <footer><span>DRILL LIBRARY <b>{availableVideos.length.toString().padStart(2, '0')}</b></span><span>LOCAL / NO ACCOUNT</span></footer>
    </main>
  )
}

export default App
