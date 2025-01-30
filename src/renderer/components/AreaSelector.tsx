import React, { useState, useRef, useEffect } from 'react';
import './AreaSelector.css';

interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AreaSelectorProps {
  onSelect: (area: Area) => void;
  onCancel: () => void;
}

const AreaSelector: React.FC<AreaSelectorProps> = ({ onSelect, onCancel }) => {
  const [selecting, setSelecting] = useState(false);
  const [start, setStart] = useState({ x: 0, y: 0 });
  const [area, setArea] = useState<Area>({ x: 0, y: 0, width: 0, height: 0 });
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (overlayRef.current) {
      const rect = overlayRef.current.getBoundingClientRect();
      setStart({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
      setSelecting(true);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (selecting && overlayRef.current) {
      const rect = overlayRef.current.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;

      setArea({
        x: Math.min(start.x, currentX),
        y: Math.min(start.y, currentY),
        width: Math.abs(currentX - start.x),
        height: Math.abs(currentY - start.y)
      });
    }
  };

  const handleMouseUp = () => {
    setSelecting(false);
    if (area.width > 10 && area.height > 10) {
      onSelect(area);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  useEffect(() => {
    // Prevent body scrolling when selector is active
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);

  return (
    <div 
      ref={overlayRef}
      className="area-selector-overlay"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{ position: 'fixed', zIndex: 10000 }}  // Ensure it's above everything
    >
      <div className="area-selector-instructions">
        Click and drag to select an area. Press ESC to cancel.
      </div>
      {(selecting || area.width > 0) && (
        <div 
          className="area-selector-box"
          style={{
            left: area.x,
            top: area.y,
            width: area.width,
            height: area.height,
            pointerEvents: 'none'  // Prevent box from interfering with mouse events
          }}
        >
          <div className="area-selector-dimensions">
            {Math.round(area.width)} x {Math.round(area.height)}
          </div>
        </div>
      )}
    </div>
  );
};

export default AreaSelector; 