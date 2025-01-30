import React, { useEffect } from 'react';
import './RecordingUI.css';

interface RecordingUIProps {
  recordingTime: number;
  onStopRecording: () => void;
  showRecordingPreview: boolean;
  setShowRecordingPreview: (show: boolean) => void;
  recordingPreviewRef: React.RefObject<HTMLVideoElement>;
  autoMove: boolean;
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
  autoMove
}) => {
  useEffect(() => {
    if (autoMove) {
      const handleMouseMove = (e: MouseEvent) => {
        window.electron.ipcRenderer.invoke('MOUSE_POSITION_UPDATE', {
          x: e.screenX,
          y: e.screenY,
          autoMove
        });
      };

      window.addEventListener('mousemove', handleMouseMove);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
      };
    } else {
      window.electron.ipcRenderer.invoke('MOUSE_POSITION_UPDATE', {
        x: 0,
        y: 0,
        autoMove
      });
    }
  }, [autoMove]);

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