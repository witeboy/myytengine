/**
 * Phase 3: Visual Snap Guide Line
 * Renders a vertical guide line when magnetic snapping is active.
 */
import React from 'react';

export default function SnapGuide({ snapLinePx, trackAreaHeight }) {
  if (snapLinePx === null || snapLinePx === undefined) return null;
  
  return (
    <div
      className="absolute top-0 pointer-events-none z-30"
      style={{
        left: snapLinePx + 40, // offset by LABEL_WIDTH
        height: trackAreaHeight || 168,
      }}
    >
      <div className="w-px h-full bg-cyan-400 opacity-80" />
      <div className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-cyan-400 rounded-full" />
      <div className="absolute -bottom-1 -left-1 w-2.5 h-2.5 bg-cyan-400 rounded-full" />
    </div>
  );
}