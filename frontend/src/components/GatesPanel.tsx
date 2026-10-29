'use client';

import React from 'react';
import { CameraDetectionState } from '../lib/types';

interface GatesPanelProps {
  entryDetection: CameraDetectionState;
  exitDetection: CameraDetectionState;
  entryBarrierOpen: boolean;
  exitBarrierOpen: boolean;
  onInspect: () => void;
}

const frameAge = (detection: CameraDetectionState) => {
  if (detection.last_frame_timestamp == null) return null;
  const secs = Math.max(0, Math.round((Date.now() - detection.last_frame_timestamp) / 1000));
  if (secs < 60) return `${secs} s ago`;
  return `${Math.round(secs / 60)} min ago`;
};

const GateRow: React.FC<{
  name: string;
  detection: CameraDetectionState;
  open: boolean;
  onInspect: () => void;
}> = ({ name, detection, open, onInspect }) => {
  const age = frameAge(detection);
  const plate = detection.plate_number;

  return (
    <div className="grid grid-cols-[1fr_auto] gap-2.5 px-3.5 py-3 border-b border-hair last:border-b-0">
      <div>
        <div className="mono text-[9.5px] uppercase tracking-[0.12em] text-muted">{name}</div>
        <div className="font-sign font-bold text-[14px] tracking-[0.01em] mt-0.5">
          {open ? 'Up · 90°' : 'Down · 0°'}{' '}
          <span className="font-normal font-sans text-[11.5px] text-ink2">
            · {detection.camera_online_status === 'ONLINE' ? 'camera linked' : 'waiting for frames'}
          </span>
        </div>
        <div className="text-[11px] text-muted mt-1">
          {plate ? (
            <>
              Last plate <span className="mono text-ink2">{plate}</span>
              {detection.timestamp ? ` · ${detection.timestamp}` : ''}
            </>
          ) : (
            'No plate read yet'
          )}
          {age ? ` · frame ${age}` : ''}
        </div>
      </div>
      <div className="flex flex-col justify-center">
        <button onClick={onInspect} className="btn">
          Details
        </button>
      </div>
    </div>
  );
};

/** Compact gate control panel — the detail lives in the camera panel below. */
export const GatesPanel: React.FC<GatesPanelProps> = ({
  entryDetection,
  exitDetection,
  entryBarrierOpen,
  exitBarrierOpen,
  onInspect,
}) => {
  const online = [entryDetection, exitDetection].filter(
    (d) => d.camera_online_status === 'ONLINE'
  ).length;

  return (
    <section className="card">
      <div className="card-head">
        <span className="kicker">Gates</span>
        <span className="sign-title">Control</span>
        <span className="ml-auto mono text-[10.5px] text-muted">{online} online</span>
      </div>

      <GateRow
        name="Entry · ESP32-CAM 1"
        detection={entryDetection}
        open={entryBarrierOpen}
        onInspect={onInspect}
      />
      <GateRow
        name="Exit · ESP32-CAM 2"
        detection={exitDetection}
        open={exitBarrierOpen}
        onInspect={onInspect}
      />
    </section>
  );
};
