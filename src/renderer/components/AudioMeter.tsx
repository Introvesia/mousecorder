import React, { useEffect, useRef, useState } from 'react';
import './AudioMeter.css';

interface AudioMeterProps {
  stream: MediaStream | null;
}

const AudioMeter: React.FC<AudioMeterProps> = ({ stream }) => {
  const [volume, setVolume] = useState<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    if (!stream) return;

    try {
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyserRef.current = analyser;
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.8;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateVolume = () => {
        animationFrameRef.current = requestAnimationFrame(updateVolume);
        analyser.getByteFrequencyData(dataArray);

        // Calculate volume
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const normalizedVolume = Math.min(average / 128, 1);
        setVolume(normalizedVolume);
      };

      updateVolume();

      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        audioContext.close();
      };
    } catch (err) {
      console.error('AudioMeter Error:', err);
    }
  }, [stream]);

  return (
    <div className="audio-meter">
      <div className="audio-meter-label">
        Microphone Level
      </div>
      <div className="audio-meter-bar-container">
        <div 
          className="audio-meter-bar"
          style={{ width: `${Math.round(volume * 100)}%` }}
        />
        <span className="audio-meter-value">
          {Math.round(volume * 100)}%
        </span>
      </div>
    </div>
  );
};

export default AudioMeter; 