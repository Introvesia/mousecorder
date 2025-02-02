import React, { useEffect } from 'react';
import './RecordingUI.css';
import { MousePosition } from '../../../electron/types';

interface RecordingUIProps {
  recordingTime: number;
  onStopRecording: () => Promise<void>;
  showRecordingPreview: boolean;
  setShowRecordingPreview: (show: boolean) => void;
  recordingPreviewRef: React.RefObject<HTMLVideoElement>;
  autoMove: boolean;
  isRecording: boolean;
  recordedChunks?: Blob[];
}

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const RecordingUI: React.FC<RecordingUIProps> = ({
  recordingTime,
  onStopRecording,
  showRecordingPreview,
  setShowRecordingPreview,
  recordingPreviewRef,
  autoMove,
  isRecording,
  recordedChunks = []
}) => {
  useEffect(() => {
    if (isRecording) {
      // First set up the listener for mouse position updates
      const unsubscribe = window.electron.ipcRenderer.on('MOUSE_POSITION_UPDATE', (position: MousePosition) => {
        console.log('Mouse position:', position)
      })

      // Then start mouse tracking
      window.electron.ipcRenderer.invoke('START_MOUSE_TRACKING')
        .then(() => {
          console.log('Mouse tracking started')
        })
        .catch((error) => {
          console.error('Failed to start mouse tracking:', error)
        })

      // Cleanup function
      return () => {
        window.electron.ipcRenderer.invoke('STOP_MOUSE_TRACKING')
          .catch(console.error)
        if (typeof unsubscribe === 'function') {
          unsubscribe()
        }
      }
    }
    return () => {}; // Add return for when !isRecording
  }, [isRecording])

  const saveVideo = async () => {
    try {
      if (!recordedChunks || recordedChunks.length === 0) {
        throw new Error('No video data available');
      }

      console.log('Chunks available:', recordedChunks.length);
      
      const blob = new Blob(recordedChunks, {
        type: 'video/webm;codecs=vp9'
      });

      console.log('Blob created:', blob.size, 'bytes');

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `mousecorder-recording-${timestamp}`;
      
      console.log('Saving to:', filename);

      // Convert Blob to ArrayBuffer before sending
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      const result = await window.electron.ipcRenderer.invoke('SAVE_VIDEO', {
        blob: Array.from(uint8Array), // Convert to regular array for IPC
        filePath: filename
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to save video');
      }

      console.log('Video saved successfully at:', result.path);
    } catch (error) {
      console.error('Error saving video:', error);
    }
  };

  return (
    <div className="recording-ui">
      <div className="recording-controls">
        <div className="recording-header">
          <button
            className="button-stop"
            onClick={onStopRecording}
          >
            Stop Recording
          </button>
          
          {!isRecording && recordedChunks.length > 0 && (
            <button 
              className="button-save"
              onClick={saveVideo}
            >
              Save Recording
            </button>
          )}

          <button 
            className="preview-toggle-button"
            onClick={() => setShowRecordingPreview(!showRecordingPreview)}
          >
            {showRecordingPreview ? 'Hide Preview' : 'Show Preview'}
          </button>

          <div className="timer">
            {formatTime(recordingTime)}
          </div>
        </div>
        
        {showRecordingPreview && (
          <div className="recording-preview-container">
            <video
              ref={recordingPreviewRef}
              autoPlay
              muted
              playsInline
              className="recording-preview-video"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default RecordingUI; 