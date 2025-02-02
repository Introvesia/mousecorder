import React, { useEffect, useRef } from 'react';
import './AudioMeter.css';

interface AudioMeterProps {
  stream: MediaStream;
}

const AudioMeter: React.FC<AudioMeterProps> = ({ stream }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const analyserRef = useRef<AnalyserNode>();

  useEffect(() => {
    if (!canvasRef.current) return;

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyserRef.current = analyser;

    source.connect(analyser);
    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      if (!analyserRef.current) return;
      animationFrameRef.current = requestAnimationFrame(draw);

      analyserRef.current.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / bufferLength;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = `hsl(${120 - (average / 2)}, 100%, 50%)`;
      ctx.fillRect(0, 0, (average / 255) * canvas.width, canvas.height);
    };

    draw();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      audioContext.close();
    };
  }, [stream]);

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={20}
      className="audio-meter"
    />
  );
};

export default AudioMeter; 