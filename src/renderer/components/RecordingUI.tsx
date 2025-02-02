import React, { useEffect } from 'react';
import './RecordingUI.css';
import { MousePosition } from '../../types';

interface RecordingUIProps {
  recordingTime: number;
  onStopRecording: () => Promise<void>;
  showRecordingPreview: boolean;
  setShowRecordingPreview: (show: boolean) => void;
  recordingPreviewRef: React.RefObject<HTMLVideoElement>;
  autoMove: boolean;
  isRecording: boolean;
}

const RecordingUI: React.FC<RecordingUIProps> = ({
  recordingTime,
  onStopRecording,
  showRecordingPreview,
  setShowRecordingPreview,
  recordingPreviewRef,
  autoMove,
  isRecording
}) => {
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (isRecording) {
      let unsubscribeFunction: (() => void) | undefined;

      unsubscribeFunction = window.electron.ipcRenderer.on('MOUSE_POSITION_UPDATE', (position: MousePosition) => {
        if (recordingPreviewRef.current && autoMove) {
          const video = recordingPreviewRef.current;
          const screenWidth = window.innerWidth;
          
          if (position.x > screenWidth - 350) {
            video.style.right = 'auto';
            video.style.left = '10px';
          } else {
            video.style.left = 'auto';
            video.style.right = '10px';
          }
        }
      });

      window.electron.ipcRenderer.invoke('START_MOUSE_TRACKING')
        .catch(console.error);

      return () => {
        window.electron.ipcRenderer.invoke('STOP_MOUSE_TRACKING')
          .catch(console.error);
        if (unsubscribeFunction) {
          unsubscribeFunction();
        }
      };
    }
  }, [isRecording, autoMove]);

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

          <div className="timer">
            {formatTime(recordingTime)}
          </div>
        </div>
        
        {showRecordingPreview && (
          <div className="recording-preview-container">
            <video
              ref={recordingPreviewRef}
              autoPlay
              playsInline
              muted
              className="recording-preview-video"
            />
            <button 
              className="preview-toggle"
              onClick={() => setShowRecordingPreview(false)}
            >
              Hide Preview
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecordingUI; 