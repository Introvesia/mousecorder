import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './App.css';
import AreaSelector from './components/AreaSelector';
import { cropStream } from './utils/streamUtils';
import AudioMeter from './components/AudioMeter';
import RecordingUI from './components/RecordingUI';
import ConversionProgress from './components/ConversionProgress';
import { 
  CustomMediaStream, 
  VideoSettings, 
  IElectronAPI,
  MediaTrackConstraintSet,
  DesktopCaptureMediaTrackConstraints,
  CustomMediaStreamConstraints,
  Area,
  MousePosition
} from '../types/index';

// Declare window interface extension
declare global {
  interface Window {
    electron: IElectronAPI;
  }
}

declare const navigator: Navigator & {
  userAgentData?: {
    platform: string;
  };
};

interface Source {
  id: string;
  name: string;
  displayId?: string;
  thumbnail?: string;
}

const isMacOS = (): boolean => {
  // Try different methods to detect macOS
  return navigator.userAgentData?.platform === 'macOS' || 
         navigator.platform.toLowerCase().includes('mac') ||
         /Mac/.test(navigator.userAgent);
};

const App: React.FC = () => {
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [sources, setSources] = useState<Source[]>([]);
  const [settings, setSettings] = useState<VideoSettings>({
    sourceId: '',
    includeAudio: false,
    format: 'mp4',
    quality: 'high',
    fps: 30,
    areaSelection: null
  });
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout>();
  const [hasBlackHole, setHasBlackHole] = useState(false);
  const previewRef = useRef<HTMLVideoElement>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [micEnabled, setMicEnabled] = useState(false);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);

  // Add these refs for audio context
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  // Add new state for mic devices and selected device
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicDevice, setSelectedMicDevice] = useState<string>('');

  // Add new state for YouTube Shorts mode
  const [isYouTubeShorts, setIsYouTubeShorts] = useState(true);
  const shortsRef = useRef<{ x: number; y: number } | null>(null);

  // Add zoom state
  const [shortsZoom, setShortsZoom] = useState(2.8);

  // Add a ref for cleanup function
  const cleanupRef = useRef<(() => void) | null>(null);

  // Add a ref for recording stream
  const recordingStreamRef = useRef<any>(null);

  // Add new state and ref for recording preview
  const [showRecordingPreview, setShowRecordingPreview] = useState(true);
  const recordingPreviewRef = useRef<HTMLVideoElement>(null);

  // Add new state for auto-move
  const [autoMovePreview, setAutoMovePreview] = useState(false);

  // Add new state
  const [isConverting, setIsConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState(0);

  // Add effect to get available microphone devices
  const getMicrophoneDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioDevices = devices.filter(device => device.kind === 'audioinput');
      console.log('Available microphone devices:', audioDevices);
      setMicDevices(audioDevices);
      
      // Set default device if none selected
      if (audioDevices.length > 0 && !selectedMicDevice) {
        setSelectedMicDevice(audioDevices[0].deviceId);
      }
    } catch (error) {
      console.error('Error getting microphone devices:', error);
    }
  };

  // Add effect to get devices when component mounts and when permissions change
  useEffect(() => {
    getMicrophoneDevices();
    
    // Listen for device changes
    navigator.mediaDevices.addEventListener('devicechange', getMicrophoneDevices);
    
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', getMicrophoneDevices);
    };
  }, []);

  // Add effect to check for BlackHole when component mounts
  React.useEffect(() => {
    const checkBlackHole = async () => {
      if (isMacOS()) {
        const isInstalled = await window.electron.ipcRenderer.invoke('CHECK_AUDIO_DRIVER');
        setHasBlackHole(isInstalled);
      }
    };
    checkBlackHole();
  }, []);

  // Add effect to load sources
  React.useEffect(() => {
    const loadSources = async () => {
      try {
        const { sources } = await window.electron.ipcRenderer.invoke('GET_ALL_SOURCES');
        setSources(sources);
        if (sources.length > 0) {
          setSettings(prev => ({ ...prev, sourceId: sources[0].id }));
        }
      } catch (error) {
        console.error('Error loading sources:', error);
      }
    };
    loadSources();
  }, []);

  // Add this effect to handle preview
  useEffect(() => {
    const startPreview = async () => {
      if (settings.sourceId && previewRef.current) {
        try {
          // Stop previous preview if exists
          if (previewStreamRef.current) {
            previewStreamRef.current.getTracks().forEach(track => track.stop());
          }

          const constraints = {
            audio: false,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: settings.sourceId
              }
            } as any
          };

          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          previewStreamRef.current = stream as CustomMediaStream;
          previewRef.current.srcObject = stream;
        } catch (error) {
          console.error('Error starting preview:', error);
        }
      }
    };

    if (!recording) {
      startPreview();
    }

    // Cleanup
    return () => {
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [settings.sourceId, recording]);

  // Add this function to check microphone permissions
  const checkMicrophonePermission = async () => {
    try {
      const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      console.log('Microphone permission status:', permissionStatus.state);
      return permissionStatus.state === 'granted';
    } catch (error) {
      console.error('Error checking microphone permission:', error);
      return false;
    }
  };

  // Update the microphone effect
  useEffect(() => {
    let cleanup = () => {};

    const setupMicrophone = async () => {
      if (micEnabled && !recording) {
        console.log('Checking microphone permission...');
        
        const hasPermission = await checkMicrophonePermission();
        if (!hasPermission) {
          console.log('Requesting microphone permission...');
        }

        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: selectedMicDevice ? { exact: selectedMicDevice } : undefined,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          });
          
          setMicStream(stream);

          cleanup = () => {
            stream.getTracks().forEach(track => {
              console.log('Stopping track:', track.label, track.readyState);
              track.stop();
            });
            setMicStream(null);
          };
        } catch (error) {
          console.error('Error accessing microphone:', error);
        }
      } else {
        cleanup();
      }
    };

    setupMicrophone();

    return () => {
      cleanup();
    };
  }, [micEnabled, recording, selectedMicDevice]);

  const getVideoConstraints = (quality: string): MediaTrackConstraints => {
    const qualities = {
      high: { width: 1920, height: 1080 },
      medium: { width: 1280, height: 720 },
      low: { width: 854, height: 480 }
    };
    return qualities[quality as keyof typeof qualities];
  };

  const getMimeType = (format: string): string => {
    const mimeTypes = {
      'webm': 'video/webm;codecs=vp9',
      'mp4': 'video/mp4'
    };
    return mimeTypes[format as keyof typeof mimeTypes];
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartAreaSelection = async () => {
    console.log('Starting area selection');
    try {
      console.log('Invoking START_AREA_SELECTION');
      const area = await window.electron.ipcRenderer.invoke('START_AREA_SELECTION');
      console.log('Area received from main process:', area);
      
      // Only update if we got a valid area
      if (area && typeof area === 'object' && 'width' in area && 'height' in area) {
        console.log('Setting area selection:', area);
        
        // Create a new settings object and log it before setting
        const newSettings: VideoSettings = {
          ...settings,
          areaSelection: {
            x: area.x,
            y: area.y,
            width: area.width,
            height: area.height
          }
        };
        
        console.log('About to update settings with:', newSettings);
        setSettings(newSettings);
        
        // Verify the update
        setTimeout(() => {
          console.log('Settings after update:', settings);
        }, 100);
      } else {
        console.log('No valid area received:', area);
      }
    } catch (error) {
      console.error('Error in area selection:', error);
    }
  };

  const startRecording = async () => {
    window.electron.ipcRenderer.invoke('START_RECORDING');
    try {
      const screenStream = await navigator.mediaDevices.getUserMedia({
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: settings.sourceId
          }
        },
        audio: settings.includeAudio ? {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: settings.sourceId
          }
        } : false
      } as CustomMediaStreamConstraints);

      let finalStream: MediaStream = screenStream;

      if (isYouTubeShorts) {
        const shortsWidth = 1080;
        const shortsHeight = 1920;
        
        const stream = await cropStream(finalStream, {
          x: shortsRef.current?.x || 0,
          y: shortsRef.current?.y || 0,
          width: shortsWidth,
          height: shortsHeight,
          isShorts: true,
          zoom: shortsZoom
        });

        recordingStreamRef.current = stream;
        finalStream = stream;
      } else if (settings.areaSelection) {
        finalStream = await cropStream(finalStream, settings.areaSelection);
      }

      // Collect all tracks
      const tracks = [...finalStream.getVideoTracks()];
      
      // Add system audio if present
      if (finalStream.getAudioTracks().length > 0) {
        tracks.push(finalStream.getAudioTracks()[0]);
        console.log('Added system audio track');
      }

      // Add microphone track if enabled
      if (micEnabled && micStream) {
        const micTrack = micStream.getAudioTracks()[0];
        if (micTrack) {
          tracks.push(micTrack.clone()); // Clone the track to avoid conflicts
          console.log('Added microphone track:', {
            label: micTrack.label,
            enabled: micTrack.enabled,
            muted: micTrack.muted
          });
        }
      }

      // Create final stream
      finalStream = new MediaStream(tracks);
      console.log('Final stream tracks:', {
        video: finalStream.getVideoTracks().length,
        audio: finalStream.getAudioTracks().length,
        audioTracks: finalStream.getAudioTracks().map(t => t.label)
      });

      // Get the stored area selection
      const storedArea = await window.electron.ipcRenderer.invoke('GET_SELECTED_AREA');
      console.log('Retrieved stored area:', storedArea);
      
      // If area is selected, crop the stream
      if (storedArea && 
          typeof storedArea === 'object' &&
          storedArea.width > 0 && 
          storedArea.height > 0) {
        console.log('Starting stream crop with stored area:', JSON.stringify(storedArea, null, 2));
        finalStream = await cropStream(finalStream, storedArea);
      }

      // Set up MediaRecorder
      const options: MediaRecorderOptions = {
        mimeType: 'video/webm;codecs=vp8,opus', // Always use VP8 for recording
        videoBitsPerSecond: settings.quality === 'high' ? 5000000 : 2500000,
        audioBitsPerSecond: 128000
      };

      mediaRecorderRef.current = new MediaRecorder(finalStream, options);
      recordedChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        try {
          const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
          const buffer = await blob.arrayBuffer();

          window.electron.ipcRenderer.invoke('STOP_RECORDING');
          
          if (settings.format === 'mp4') {
            setIsConverting(true);
            setConversionProgress(0);
          }

          // Listen for progress updates
          window.electron.ipcRenderer.on('CONVERSION_PROGRESS', (progress: number) => {
            setConversionProgress(progress);
          });

          const filePath = await window.electron.ipcRenderer.invoke('SAVE_VIDEO', {
            buffer,
            format: settings.format,
            quality: settings.quality,
            fps: settings.fps
          });
          
          setIsConverting(false);
          
          // Clean up the cropped stream if it exists
          if ((finalStream as any).cleanup) {
            (finalStream as any).cleanup();
          }

          if (filePath) {
            console.log('Video saved to:', filePath);
          }
        } catch (error) {
          setIsConverting(false);
          console.error('Error saving video:', error);
          alert('Failed to save video. Please try again.');
        }
      };

      mediaRecorderRef.current.start(1000);
      setRecording(true);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (error) {
      console.error('Error starting recording:', error);
      setRecording(false);
      setRecordingTime(0);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      alert(`Failed to start recording: ${errorMessage}`);
    }
  };

  const stopRecording = async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setRecording(false);
      setRecordingTime(0);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      
      // Clean up the stream
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }

      // Return a resolved promise
      return Promise.resolve();
    }
    return Promise.resolve();
  };

  const showAudioWarning = () => {
    if (isMacOS()) {
      if (!hasBlackHole) {
        alert(
          'System audio recording on macOS requires BlackHole:\n\n' +
          '1. Install BlackHole audio driver\n' +
          '2. Set BlackHole as your system audio output\n' +
          '3. Then try recording with system audio enabled'
        );
      } else {
        alert(
          'Please ensure BlackHole is set as your system audio output before recording.'
        );
      }
    }
  };

  // Update mouse tracking effect
  useEffect(() => {
    if (isYouTubeShorts) {
      const handleGlobalMouseMove = (event: CustomEvent<{ x: number; y: number }>) => {
        const position = event.detail;
        const shortsWidth = 1080;
        const shortsHeight = 1920;
        
        // Define edge boundaries (pixels from edge)
        const edgeThreshold = 70;

        // Calculate initial position (mouse at center)
        let x = position.x;
        let y = position.y;

        // Adjust x position
        if (x < edgeThreshold) {
          x = edgeThreshold;
        } else if (x > 1120) {
          x = 1120;
        }

        // Adjust y position
        if (y < edgeThreshold + 45) {
          y = edgeThreshold + 45;
        } else if (y > 340) {
          y = 340;
        }

        // Ensure we never have negative values
        x = Math.max(0, x);
        y = Math.max(0, y);

        // Always update shortsRef with valid coordinates
        shortsRef.current = { x, y };

        // Update stream position if recording
        if (recording && recordingStreamRef.current?.updatePosition) {
          try {
            recordingStreamRef.current.updatePosition(x, y);
          } catch (error) {
            console.error('Error updating position:', error);
          }
        }

        // Only update settings if not recording
        if (!recording) {
          setSettings(prev => ({
            ...prev,
            areaSelection: {
              x,
              y,
              width: shortsWidth,
              height: shortsHeight
            }
          }));
        }
      };
      
      // Start tracking global mouse position
      window.electron.ipcRenderer.invoke('START_MOUSE_TRACKING')
        .then(() => console.log('Mouse tracking started'))
        .catch(err => console.error('Failed to start mouse tracking:', err));
      
      // Add event listener using custom events
      window.addEventListener('mouse-position', handleGlobalMouseMove as EventListener);

      return () => {
        window.electron.ipcRenderer.invoke('STOP_MOUSE_TRACKING')
          .then(() => console.log('Mouse tracking stopped'))
          .catch(err => console.error('Failed to stop mouse tracking:', err));
        window.removeEventListener('mouse-position', handleGlobalMouseMove as EventListener);
      };
    }
  }, [isYouTubeShorts, recording]);

  // Add this effect to handle recording preview
  useEffect(() => {
    if (recording && recordingPreviewRef.current && recordingStreamRef.current) {
      recordingPreviewRef.current.srcObject = recordingStreamRef.current;
    }
  }, [recording]);

  // Add effect to set initial source for YouTube Shorts
  useEffect(() => {
    if (isYouTubeShorts && sources.length > 0) {
      // When YouTube Shorts is enabled by default:
      // Set entire screen as source
      const entireScreen = sources.find(s => s.name === 'Entire Screen');
      if (entireScreen) {
        setSettings(prev => ({
          ...prev,
          sourceId: entireScreen.id,
          areaSelection: null
        }));
      }
    }
  }, [sources, isYouTubeShorts]);

  // Update this effect
  useEffect(() => {
    const unsubscribe = window.electron.ipcRenderer.onMousePosition((position: MousePosition) => {});

    return unsubscribe;
  }, []);

  return (
    <div className={`container ${recording ? 'recording-mode' : ''}`}>
      {!recording && <h1 className="title">MouseCorder</h1>}
      
      <div className="controls-container">
        {recording ? (
          <RecordingUI
            recordingTime={recordingTime}
            onStopRecording={stopRecording}
            showRecordingPreview={showRecordingPreview}
            setShowRecordingPreview={setShowRecordingPreview}
            recordingPreviewRef={recordingPreviewRef}
            autoMove={autoMovePreview}
            isRecording={recording}
          />
        ) : (
          <>
            <div className="settings-group">
              <label className="settings-label">Capture Source</label>
              <select 
                className="select"
                value={settings.sourceId}
                onChange={(e) => setSettings(prev => ({ ...prev, sourceId: e.target.value }))}
                disabled={recording}
              >
                {sources.map(source => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </select>

              {/* Add preview container */}
              <div className="preview-container">
                <video
                  ref={previewRef}
                  autoPlay
                  muted
                  playsInline
                  className="preview-video"
                />
              </div>

              <div className="checkbox-group">
                <div className="audio-controls">
                  <div className="audio-control-item">
                    <input
                      type="checkbox"
                      id="includeSystemAudio"
                      className="checkbox"
                      checked={settings.includeAudio}
                      onChange={(e) => {
                        if (e.target.checked && isMacOS()) {
                          showAudioWarning();
                        }
                        setSettings(prev => ({ 
                          ...prev, 
                          includeAudio: e.target.checked 
                        }));
                      }}
                      disabled={recording}
                    />
                    <label htmlFor="includeSystemAudio" className="checkbox-label">
                      System Audio {isMacOS() && `(${hasBlackHole ? 'BlackHole installed' : 'requires BlackHole'})`}
                    </label>
                  </div>

                  <div className="audio-control-item">
                    <input
                      type="checkbox"
                      id="includeMicrophone"
                      className="checkbox"
                      checked={micEnabled}
                      onChange={(e) => setMicEnabled(e.target.checked)}
                      disabled={recording}
                    />
                    <label htmlFor="includeMicrophone" className="checkbox-label">
                      Microphone
                    </label>
                  </div>

                  {micEnabled && (
                    <div className="mic-device-selector">
                      <select
                        className="select"
                        value={selectedMicDevice}
                        onChange={(e) => setSelectedMicDevice(e.target.value)}
                        disabled={recording}
                      >
                        {micDevices.map((device) => (
                          <option key={device.deviceId} value={device.deviceId}>
                            {device.label || `Microphone ${device.deviceId.slice(0, 5)}...`}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {micEnabled && !recording && micStream && (
                  <div className="audio-meter-wrapper">
                    <AudioMeter stream={micStream} />
                  </div>
                )}

                {settings.includeAudio && isMacOS() && !hasBlackHole && (
                  <div className="audio-warning">
                    <a 
                      href="https://github.com/ExistentialAudio/BlackHole" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="link"
                    >
                      Install BlackHole
                    </a>
                  </div>
                )}
              </div>

              <div className="area-selection-group">
                <button
                  className="button button-secondary"
                  onClick={handleStartAreaSelection}
                  disabled={recording}
                >
                  Select Screen Area
                </button>
                {settings.areaSelection && (
                  <div className="area-info">
                    <div className="area-details">
                      <span>Position: ({settings.areaSelection.x}, {settings.areaSelection.y})</span>
                      <span>Size: {settings.areaSelection.width} × {settings.areaSelection.height}</span>
                    </div>
                    <button
                      className="button button-small"
                      onClick={() => setSettings(prev => ({ ...prev, areaSelection: null }))}
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              <div className="checkbox-group">
                <div className="preview-option">
                  <input
                    type="checkbox"
                    id="autoMovePreview"
                    className="checkbox"
                    checked={autoMovePreview}
                    onChange={(e) => setAutoMovePreview(e.target.checked)}
                  />
                  <label htmlFor="autoMovePreview" className="checkbox-label">
                    Auto-move Preview Window
                  </label>
                  <div className="option-description">
                    Preview window will automatically move to the opposite side when your mouse is near the edge
                  </div>
                </div>
              </div>

              <label className="settings-label">Video Format</label>
              <select 
                className="select"
                value={settings.format}
                onChange={(e) => setSettings(prev => ({ ...prev, format: e.target.value }))}
                disabled={recording}
              >
                <option value="webm">WebM</option>
                <option value="mp4">MP4</option>
              </select>

              <label className="settings-label">Quality</label>
              <select 
                className="select"
                value={settings.quality}
                onChange={(e) => setSettings(prev => ({ ...prev, quality: e.target.value }))}
                disabled={recording}
              >
                <option value="high">High (1080p)</option>
                <option value="medium">Medium (720p)</option>
                <option value="low">Low (480p)</option>
              </select>

              <label className="settings-label">Frame Rate</label>
              <select 
                className="select"
                value={settings.fps}
                onChange={(e) => setSettings(prev => ({ ...prev, fps: Number(e.target.value) }))}
                disabled={recording}
              >
                <option value="30">30 FPS</option>
                <option value="60">60 FPS</option>
              </select>

              <div className="checkbox-group">
                <div className="shorts-control">
                  <input
                    type="checkbox"
                    id="youtubeShorts"
                    className="checkbox"
                    checked={isYouTubeShorts}
                    onChange={(e) => {
                      setIsYouTubeShorts(e.target.checked);
                      if (e.target.checked) {
                        // When enabling Shorts mode:
                        // 1. Set entire screen as source
                        const entireScreen = sources.find(s => s.name === 'Entire Screen');
                        if (entireScreen) {
                          setSettings(prev => ({
                            ...prev,
                            sourceId: entireScreen.id,
                            areaSelection: null // Clear any existing area selection
                          }));
                        }
                      }
                    }}
                    disabled={recording}
                  />
                  <label htmlFor="youtubeShorts" className="checkbox-label">
                    Set as YouTube Shorts
                  </label>
                </div>
              </div>

              {isYouTubeShorts && !recording && (
                <div className="shorts-controls">
                  <div className="shorts-info">
                    Move your mouse to position the recording area. The recording will follow your mouse in YouTube Shorts format (1080×1920).
                  </div>
                  <div className="zoom-control">
                    <label htmlFor="shortsZoom">Zoom:</label>
                    <input
                      type="range"
                      id="shortsZoom"
                      min="1"
                      max="3"
                      step="0.1"
                      value={shortsZoom}
                      onChange={(e) => setShortsZoom(Number(e.target.value))}
                    />
                    <span>{shortsZoom.toFixed(1)}x</span>
                  </div>
                </div>
              )}
            </div>

            <button
              className="button button-record"
              onClick={startRecording}
            >
              Start Recording
            </button>
          </>
        )}
      </div>
      <ConversionProgress 
        isConverting={isConverting} 
        progress={conversionProgress}
      />
    </div>
  );
};

export default App; 