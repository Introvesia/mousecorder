interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
  isShorts?: boolean;
  zoom?: number;
}

interface EnhancedMediaStream extends MediaStream {
  cleanup: () => void;
  updatePosition: (x: number, y: number) => void;
}

export const cropStream = async (stream: MediaStream, area: CropArea): Promise<MediaStream> => {
  const videoTrack = stream.getVideoTracks()[0];
  const { width: sourceWidth, height: sourceHeight } = videoTrack.getSettings();

  const canvas = document.createElement('canvas');
  if (area.isShorts) {
    canvas.width = 1080;
    canvas.height = 1920;
  } else {
    canvas.width = area.width;
    canvas.height = area.height;
  }
  const ctx = canvas.getContext('2d', { 
    alpha: false,
    desynchronized: true
  })!;

  const video = document.createElement('video');
  video.srcObject = stream;
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;

  // Force hardware acceleration
  video.style.transform = 'translateZ(0)';
  canvas.style.transform = 'translateZ(0)';

  await video.play();

  const screenToVideoScale = video.videoWidth / window.screen.width;
  
  // Initialize scale variables with explicit types
  let scaledX: number = 0;
  let scaledY: number = 0;
  let scaledWidth: number = 0;
  let scaledHeight: number = 0;

  // Create a function to update coordinates
  const updateCoordinates = (newX: number, newY: number) => {
    const zoom = area.zoom || 1;
    // Calculate scaled dimensions once
    const scaledShortWidth = Math.round(1080 * screenToVideoScale / zoom);
    const scaledShortHeight = Math.round(1920 * screenToVideoScale / zoom);
    
    // Calculate the offset to center the recording area on the mouse
    const offsetX = Math.round((scaledShortWidth / zoom) / 2);
    const offsetY = Math.round((scaledShortHeight / zoom) / 2);
    
    // Update coordinates with zoom, proper scaling, and centering offset
    scaledX = Math.round(newX * screenToVideoScale) - offsetX;
    scaledY = Math.round(newY * screenToVideoScale) - offsetY;
    scaledWidth = scaledShortWidth;
    scaledHeight = scaledShortHeight;
  };

  // Initial setup with the same calculations
  if (area.isShorts) {
    const zoom = area.zoom || 1;
    scaledWidth = Math.round(1080 * screenToVideoScale / zoom);
    scaledHeight = Math.round(1920 * screenToVideoScale / zoom);
    const offsetX = Math.round((scaledWidth / zoom) / 2);
    const offsetY = Math.round((scaledHeight / zoom) / 2);
    scaledX = Math.round(area.x * screenToVideoScale) - offsetX;
    scaledY = Math.round(area.y * screenToVideoScale) - offsetY;
  } else {
    scaledX = Math.round(area.x * screenToVideoScale);
    scaledY = Math.round(area.y * screenToVideoScale);
    scaledWidth = Math.round(area.width * screenToVideoScale);
    scaledHeight = Math.round(area.height * screenToVideoScale);
  }

  // Create a MediaStream from the canvas
  const fps = 60;
  const canvasStream = canvas.captureStream(fps);
  let isActive = true;
  let lastFrameTime = performance.now();

  // Create a function to draw frames
  const drawFrame = () => {
    if (!isActive) return;
    
    const now = performance.now();
    const elapsed = now - lastFrameTime;
    
    if (elapsed >= (1000 / fps)) {
      if (video.readyState >= video.HAVE_CURRENT_DATA) {
        try {
          ctx.drawImage(
            video,
            scaledX, scaledY, scaledWidth, scaledHeight,
            0, 0, canvas.width, canvas.height
          );
          lastFrameTime = now;
        } catch (error) {
          console.error('Error drawing frame:', error);
        }
      }
    }
  };

  // Use a shorter interval for more responsive background recording
  const intervalId = setInterval(drawFrame, 1000 / 120); // Higher frequency for smoother capture

  // Add a backup requestAnimationFrame loop for when window is focused
  const animationFrame = () => {
    if (isActive) {
      drawFrame();
      requestAnimationFrame(animationFrame);
    }
  };
  requestAnimationFrame(animationFrame);

  // Add idle callback for background optimization
  if ('requestIdleCallback' in window) {
    const idleCallback = () => {
      if (isActive) {
        drawFrame();
        requestIdleCallback(idleCallback);
      }
    };
    requestIdleCallback(idleCallback);
  }

  // Add audio tracks
  stream.getAudioTracks().forEach(track => {
    canvasStream.addTrack(track.clone());
  });

  // Cleanup function
  const cleanup = () => {
    isActive = false;
    clearInterval(intervalId);
    video.srcObject = null;
    stream.getTracks().forEach(track => track.stop());
  };

  (canvasStream as any).cleanup = cleanup;

  // Add the update function to the stream object
  (canvasStream as any).updatePosition = (...args: [number, number]) => {
    updateCoordinates(...args);
  };

  return canvasStream as EnhancedMediaStream;
}; 