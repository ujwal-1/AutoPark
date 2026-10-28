'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Image as ImageIcon, RefreshCw } from 'lucide-react';
import { CameraDetectionState, DiagnosticEvent } from '../lib/types';

interface DetectionPanelProps {
  entryDetection: CameraDetectionState;
  exitDetection: CameraDetectionState;
  diagnostics?: DiagnosticEvent[];
  apiBase?: string;
  loading?: boolean;
  onRefresh?: () => void;
}

const fmtConf = (conf: number | null | undefined) =>
  conf === null || conf === undefined || Number.isNaN(conf) || conf <= 0
    ? '—'
    : `${(conf * 100).toFixed(1)}%`;

const stageLabel = (stage?: string | null) => {
  switch (stage) {
    case 'camera_quality':
      return 'Frame too soft or dark';
    case 'yolo_detection':
      return 'No plate found in frame';
    case 'ocr_read':
      return 'Plate read below threshold';
    case 'booking_lookup':
      return 'Plate not on any booking';
    default:
      return 'Read clear';
  }
};

/* The barrier arm: a striped bar on a post, rotated according to state. */
const BarrierArm: React.FC<{ open: boolean }> = ({ open }) => (
  <div className="relative w-10 h-6 shrink-0" aria-hidden="true">
    <span className="absolute left-0 bottom-0 w-[3px] h-[11px] bg-ink" />
    <span
      className={`absolute left-[3px] bottom-[10px] h-[3.5px] w-[33px] origin-left barrier-stripe border-y border-ink/40 transition-transform duration-300 ${
        open ? '-rotate-[42deg]' : ''
      }`}
    />
  </div>
);

const GateCard: React.FC<{
  label: string;
  endpoint: string;
  detection: CameraDetectionState;
  open: boolean;
  apiBase: string;
  imgTimestamp: number;
  onInspect: (payload: { url: string; title: string; subtitle: string }) => void;
}> = ({ label, endpoint, detection, open, apiBase, imgTimestamp, onInspect }) => {
  const online = detection.camera_online_status === 'ONLINE';
  const unknown = detection.camera_online_status === 'UNKNOWN';
  const secsAgo =
    detection.last_frame_timestamp != null
      ? Math.max(0, Math.round((Date.now() - detection.last_frame_timestamp) / 1000))
      : null;

  const statusText = (() => {
    switch (detection.status) {
      case 'ALLOCATED':
        return {
          head: `Entry authorised · bay ${detection.slot ?? '—'}`,
          body: detection.message || 'Plate matched an open booking. Barrier lifted.',
          tone: 'ok' as const,
        };
      case 'RELEASED':
        return {
          head: `Exit settled · bay ${detection.slot ?? '—'} freed`,
          body: detection.message || 'Session closed and the bay is available again.',
          tone: 'ok' as const,
        };
      case 'UNAUTHORIZED':
        return {
          head: 'Not on the list · barrier stayed down',
          body: detection.message || 'No open booking matches this plate.',
          tone: 'fault' as const,
        };
      case 'NO_SESSION':
        return {
          head: 'No open session for this plate',
          body: detection.message || 'The plate is readable but there is nothing to close.',
          tone: 'fault' as const,
        };
      case 'NO_PLATE':
        return {
          head: 'No plate read',
          body: detection.message || 'Waiting for the next frame.',
          tone: 'muted' as const,
        };
      default:
        return {
          head: 'No vehicle in frame',
          body: detection.message || 'Frames arrive every few seconds.',
          tone: 'muted' as const,
        };
    }
  })();

  const slug = label.toLowerCase();

  return (
    <div className="border border-hair bg-panel2/60">
      <div className="flex items-center gap-3 px-3.5 py-2.5 border-b border-hair">
        <div className="min-w-0 flex items-baseline gap-2">
          <span className="kicker shrink-0">{label}</span>
          <span className="mono text-[10.5px] text-muted truncate">{endpoint}</span>
        </div>
        <div className="ml-auto flex items-center gap-3 shrink-0 whitespace-nowrap">
          <span className="flex items-center gap-1.5 mono text-[10px] uppercase tracking-[0.08em] text-ink2">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                online ? 'bg-ok' : unknown ? 'bg-hair2' : 'bg-fault'
              }`}
            />
            {online ? 'Linked' : unknown ? 'Waiting' : 'Silent'}
            {secsAgo !== null && <span className="text-muted">· {secsAgo}s</span>}
          </span>
          <span className="flex items-center gap-2">
            <BarrierArm open={open} />
            <span className="mono text-[10px] uppercase tracking-[0.06em] text-ink2">
              {open ? 'Up · 90°' : 'Down · 0°'}
            </span>
          </span>
        </div>
      </div>

      {/* Frame placeholder — this build has no live MJPEG; frames are on demand. */}
      <div className="relative h-[92px] border-b border-hair bay-hatch grid place-items-center">
        <div className="text-center">
          <div className="mono text-[10.5px] text-muted">
            {statusText.head}
          </div>
          <div className="text-[10.5px] text-muted/90 mt-0.5 max-w-[280px]">
            {statusText.body}
          </div>
        </div>
        <span className="absolute top-1.5 left-2 mono text-[9px] tracking-[0.05em] text-muted">
          640×480
        </span>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-3 px-3.5 py-3 items-center">
        <div>
          <div className="kicker">Plate</div>
          <div className="mono text-[15px] tracking-[0.04em] mt-1">
            {detection.plate_number || '—'}
          </div>
          <div className="flex items-center gap-2 mt-1.5 text-[10.5px] text-muted">
            <span className="mono">conf {fmtConf(detection.confidence)}</span>
            {detection.is_verified && <span className="pill pill-ok">verified</span>}
            {detection.timestamp && <span className="mono">{detection.timestamp}</span>}
          </div>
        </div>

        <div className="text-right border-l border-hair pl-3">
          <div className="kicker">Bay</div>
          <div className="mono text-[24px] leading-none mt-1">{detection.slot || '—'}</div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 px-3.5 py-2 border-t border-hair">
        <ImageIcon className="w-3 h-3 text-muted" />
        <span className="text-[10.5px] text-muted mr-1">Frame</span>
        {[
          { key: 'raw', file: `${slug}_raw.jpg`, label: 'Raw' },
          { key: 'crop', file: `${slug}_plate_crop.jpg`, label: 'Plate crop' },
          { key: 'ocr', file: `${slug}_processed_ocr.jpg`, label: 'OCR input' },
        ].map((btn) => (
          <button
            key={btn.key}
            onClick={() =>
              onInspect({
                url: `${apiBase}/api/anpr/debug-image/${btn.file}?t=${imgTimestamp}`,
                title: `${label} camera — ${btn.label}`,
                subtitle: 'Latest frame captured on the server for this gate.',
              })
            }
            className="btn btn-quiet text-[10.5px]"
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export const LiveCameraFeed: React.FC<DetectionPanelProps> = ({
  entryDetection,
  exitDetection,
  diagnostics = [],
  apiBase = 'http://localhost:8000',
  loading = false,
  onRefresh,
}) => {
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);
  const [selectedDebugImg, setSelectedDebugImg] = useState<{
    url: string;
    title: string;
    subtitle: string;
  } | null>(null);
  const [imgTimestamp, setImgTimestamp] = useState<number>(Date.now());
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const diagList = Array.isArray(diagnostics) ? diagnostics : [];
  const latestEntryDiag = diagList.filter((d) => d.camera === 'ENTRY').slice(-1)[0];
  const latestExitDiag = diagList.filter((d) => d.camera === 'EXIT').slice(-1)[0];

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setImgTimestamp(Date.now());
    if (onRefresh) await onRefresh();
    setTimeout(() => setIsRefreshing(false), 600);
  };

  const digPanel = (title: string, diag?: DiagnosticEvent) => (
    <div className="border border-hair bg-panel px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="mono text-[10px] uppercase tracking-[0.1em] text-ink2">{title}</span>
        {diag ? (
          <span
            className={`mono text-[9.5px] uppercase tracking-[0.08em] px-1.5 py-0.5 border ${
              diag.failure_stage
                ? 'border-fault text-fault border-dashed'
                : 'border-ok text-ok'
            }`}
          >
            {stageLabel(diag.failure_stage)}
          </span>
        ) : (
          <span className="mono text-[9.5px] text-muted">waiting for a frame</span>
        )}
      </div>

      {diag ? (
        <>
          <div className="grid grid-cols-3 gap-2 mt-2.5 py-2 border-y border-hair">
            <div>
              <div className="kicker">Sharpness</div>
              <div className="mono text-[11px] mt-0.5">
                {diag.quality?.sharpness?.toFixed(1) ?? '—'}
              </div>
            </div>
            <div>
              <div className="kicker">Plate box</div>
              <div className="mono text-[11px] mt-0.5">
                {diag.plate_bbox
                  ? `${diag.plate_bbox[2] - diag.plate_bbox[0]}×${diag.plate_bbox[3] - diag.plate_bbox[1]}`
                  : '—'}
              </div>
            </div>
            <div>
              <div className="kicker">YOLO conf</div>
              <div className="mono text-[11px] mt-0.5">
                {diag.plate_conf ? `${(diag.plate_conf * 100).toFixed(1)}%` : '—'}
              </div>
            </div>
          </div>

          {diag.candidates && diag.candidates.length > 0 && (
            <div className="mt-2">
              <div className="kicker mb-1">Candidates</div>
              <div className="flex flex-wrap gap-1">
                {diag.candidates.slice(0, 4).map((cand, idx) => (
                  <span key={idx} className="mono text-[10px] border border-hair px-1.5 py-0.5">
                    {cand.text} <span className="text-muted">{Math.round(cand.confidence * 100)}%</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 mt-2 text-[10.5px] text-muted">
            <span className="truncate">{diag.reason}</span>
            <span className="mono shrink-0">
              {diag.timing ? `${diag.timing.total_ms} ms` : ''}
            </span>
          </div>
        </>
      ) : (
        <p className="text-[11.5px] text-muted mt-2">
          No frames captured from this camera yet.
        </p>
      )}
    </div>
  );

  return (
    <section className="card">
      <div className="card-head">
        <span className="kicker">Gates</span>
        <span className="sign-title">Camera feeds</span>
        <div className="ml-auto flex items-center gap-1.5">
          {(loading || isRefreshing) && (
            <span className="mono text-[10px] text-muted mr-1">syncing…</span>
          )}
          <button onClick={handleRefresh} disabled={isRefreshing} className="btn btn-quiet">
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="btn text-[11px] flex items-center gap-1"
          >
            Pipeline
            {showDiagnostics ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 p-3">
        <GateCard
          label="Entry"
          endpoint="/api/detection/entry"
          detection={entryDetection}
          open={entryDetection.status === 'ALLOCATED'}
          apiBase={apiBase}
          imgTimestamp={imgTimestamp}
          onInspect={setSelectedDebugImg}
        />
        <GateCard
          label="Exit"
          endpoint="/api/detection/exit"
          detection={exitDetection}
          open={exitDetection.status === 'RELEASED'}
          apiBase={apiBase}
          imgTimestamp={imgTimestamp}
          onInspect={setSelectedDebugImg}
        />
      </div>

      {showDiagnostics && (
        <div className="border-t border-hair p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="kicker">ANPR pipeline · stage attribution</span>
            <span className="mono text-[9.5px] text-muted">
              laplacian · bilateral · adaptive threshold · single-pass YOLO
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {digPanel('Entry camera', latestEntryDiag)}
            {digPanel('Exit camera', latestExitDiag)}
          </div>
        </div>
      )}

      {selectedDebugImg && (
        <div
          className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4"
          onClick={() => setSelectedDebugImg(null)}
        >
          <div
            className="card max-w-xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-head">
              <span className="kicker">Capture</span>
              <span className="sign-title">{selectedDebugImg.title}</span>
              <button className="ml-auto btn btn-quiet" onClick={() => setSelectedDebugImg(null)}>
                Close
              </button>
            </div>
            <div className="p-3">
              <div className="bg-ink min-h-[220px] max-h-[420px] flex items-center justify-center p-2">
                <img
                  src={selectedDebugImg.url}
                  alt="Camera capture"
                  className="max-h-[380px] w-auto object-contain"
                  onError={(e) => {
                    const target = e.target as HTMLElement;
                    target.style.display = 'none';
                    const parent = target.parentElement;
                    if (parent && !parent.querySelector('.img-error-msg')) {
                      const msg = document.createElement('p');
                      msg.className = 'img-error-msg text-[11.5px] text-[#BCB6A7] p-4 text-center';
                      msg.innerText =
                        'No capture on the server yet. Send a frame from the camera first.';
                      parent.appendChild(msg);
                    }
                  }}
                />
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-[11px] text-muted">{selectedDebugImg.subtitle}</span>
                <button
                  onClick={() =>
                    setSelectedDebugImg({
                      ...selectedDebugImg,
                      url: `${selectedDebugImg.url.split('?')[0]}?t=${Date.now()}`,
                    })
                  }
                  className="btn btn-quiet text-[11px] flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Reload
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
