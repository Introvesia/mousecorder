import { Area } from '../../types'

export const cropStream = (stream: MediaStream, area: Area): MediaStream => {
  const canvas = document.createElement('canvas')
  canvas.width = area.width
  canvas.height = area.height

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get canvas context')

  const videoTrack = stream.getVideoTracks()[0]
  const videoElement = document.createElement('video')
  videoElement.srcObject = new MediaStream([videoTrack])
  videoElement.play()

  const drawFrame = () => {
    ctx.drawImage(
      videoElement,
      area.x, area.y, area.width, area.height,
      0, 0, canvas.width, canvas.height
    )
    requestAnimationFrame(drawFrame)
  }
  drawFrame()

  const croppedStream = canvas.captureStream()
  const audioTracks = stream.getAudioTracks()
  audioTracks.forEach(track => croppedStream.addTrack(track))

  return croppedStream
} 