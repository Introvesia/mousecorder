import React from 'react';
import './ConversionProgress.css';

interface ConversionProgressProps {
  isConverting: boolean;
  progress: number;
}

const ConversionProgress: React.FC<ConversionProgressProps> = ({ isConverting, progress }) => {
  if (!isConverting) return null;

  return (
    <div className="conversion-overlay">
      <div className="conversion-modal">
        <h3>Converting to MP4...</h3>
        <div className="progress-bar-container">
          <div 
            className="progress-bar" 
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
        <div className="progress-text">
          {progress.toFixed(1)}%
        </div>
      </div>
    </div>
  );
};

export default ConversionProgress; 