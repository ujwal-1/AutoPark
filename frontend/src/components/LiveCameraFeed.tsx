'use client';

import React, { useState } from 'react';
import {
  Camera,
  ArrowRightLeft,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  Cpu,
  RefreshCw,
  Clock,
  Wifi,
  WifiOff,
  HelpCircle,
  ShieldCheck,
  ShieldAlert,
  Loader2,
} from 'lucide-react';
import { CameraDetectionState, CameraOnlineStatus, DiagnosticEvent } from '../lib/types';

interface DetectionPanelProps {
  entryDetection: CameraDetectionState;
  exitDetection: CameraDetectionState;
  diagnostics?: DiagnosticEvent[];
  apiBase?: string;
  loading?: boolean;
  onRefresh?: () => void;
}

export const LiveCameraFeed: React.FC<DetectionPanelProps> = ({
  entryDetection,
  exitDetection,
  diagnostics = [],
  apiBase = 'http://localhost:8000',
  loading = false,
  onRefresh,
}) => {
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(true);
  const [selectedDebugImg, setSelectedDebugImg] = useState<{ url: string; title: string; subtitle: string } | null>(null);
  const [imgTimestamp, setImgTimestamp] = useState<number>(Date.now());
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const latestEntryDiag = diagnostics.filter((d) => d.camera === 'ENTRY').slice(-1)[0];
  const latestExitDiag = diagnostics.filter((d) => d.camera === 'EXIT').slice(-1)[0];

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setImgTimestamp(Date.now());
    if (onRefresh) {
      await onRefresh();
    }
    setTimeout(() => setIsRefreshing(false), 600);
  };

  const renderCameraOnlineBadge = (status: CameraOnlineStatus, lastFrameTime?: number | null) => {
    switch (status) {
      case 'ONLINE': {
        const secAgo = lastFrameTime ? Math.max(0, Math.round((Date.now() - lastFrameTime) / 1000)) : null;
        return (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold"
            title="Camera actively transmitting frames within the 5s capture cycle"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
            </span>
            <Wifi className="w-3 h-3 text-emerald-400" />
            <span>ONLINE</span>
            {secAgo !== null && (
              <span className="text-[10px] text-zinc-400 font-normal">({secAgo}s ago)</span>
            )}
          </div>
        );
      }
      case 'OFFLINE':
        return (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-[11px] font-bold"
            title="No frames received from this camera in >25 seconds"
          >
            <WifiOff className="w-3 h-3 text-rose-400" />
            <span>OFFLINE</span>
            <span className="text-[10px] text-zinc-500 font-normal">(&gt;25s idle)</span>
          </div>
        );
      case 'UNKNOWN':
      default:
        return (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400 text-[11px] font-bold"
            title="Camera status pending initial transmission or health check"
          >
            <HelpCircle className="w-3 h-3 text-zinc-400" />
            <span>UNKNOWN</span>
            <span className="text-[10px] text-zinc-500 font-normal">(Awaiting frame)</span>
          </div>
        );
    }
  };

  const getStageBadge = (stage: string | null | undefined, reason: string) => {
    switch (stage) {
      case 'camera_quality':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#18181B] text-zinc-300 border border-white/20">
            ⚠️ CAMERA BLURRY / LOW LIGHT
          </span>
        );
      case 'yolo_detection':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#18181B] text-zinc-300 border border-white/20">
            ⚠️ NO PLATE DETECTED
          </span>
        );
      case 'ocr_read':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#18181B] text-zinc-300 border border-white/20">
            ⚠️ OCR ILLEGIBLE / LOW CONFIDENCE
          </span>
        );
      case 'booking_lookup':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#18181B] text-zinc-300 border border-white/20">
            🚫 NOT PRE-REGISTERED
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            ✅ RECOGNITION CLEAR
          </span>
        );
    }
  };

  const formatConfidence = (conf: number | null | undefined) => {
    if (conf === null || conf === undefined || isNaN(conf) || conf <= 0) {
      return 'N/A';
    }
    return `${(conf * 100).toFixed(1)}%`;
  };

  return (
    <div className="district-card p-6 mb-6 relative text-white">
      {/* Loading overlay for panel */}
      {(loading || isRefreshing) && (
        <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/80 text-white text-xs font-medium shadow-md border border-white/15">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
          <span>Syncing Live Data...</span>
        </div>
      )}

      {/* Panel Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-5 pb-3 border-b border-white/[0.08] gap-3">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Camera className="w-5 h-5 text-white" />
            Dual ESP32-CAM ANPR Monitors &amp; Detection Visualizer
          </h2>
          <p className="text-xs text-zinc-400 font-normal mt-0.5">
            Synchronous OV2640 camera ingestion on port 8000 • Continuous 5s capture cycles • Dedicated YOLOv11 &amp; EasyOCR
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Refresh camera frame snapshots and diagnostics"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#18181B] hover:bg-zinc-800 text-white text-xs font-bold transition-colors disabled:opacity-50 border border-white/10"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-zinc-300 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#18181B] hover:bg-zinc-800 text-white text-xs font-bold transition-colors border border-white/10"
          >
            <Activity className="w-3.5 h-3.5 text-zinc-300" />
            {showDiagnostics ? 'Hide Diagnostics' : 'Show Diagnostics'}
            {showDiagnostics ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Dual Camera Grid: Entry on Left, Exit on Right */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        
        {/* ========================================================= */}
        {/* ENTRY CAMERA CARD */}
        {/* ========================================================= */}
        <div className="bg-[#141416] border border-white/10 rounded-2xl p-5 flex flex-col gap-4">
          {/* Header Bar */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-[#18181B] text-white border border-white/10">
                <Camera className="w-4 h-4" />
              </span>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-white block">
                  ENTRY CAMERA (ESP32 #1)
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">
                  Endpoint: /api/detection/entry
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Online/Offline/Unknown Badge */}
              {renderCameraOnlineBadge(entryDetection.camera_online_status, entryDetection.last_frame_timestamp)}
              
              <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 ${
                entryDetection.status === 'ALLOCATED'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'bg-[#18181B] text-zinc-400 border border-white/10'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${entryDetection.status === 'ALLOCATED' ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
                {entryDetection.status === 'ALLOCATED' ? 'BARRIER OPEN (90°)' : 'BARRIER DOWN (0°)'}
              </span>
            </div>
          </div>

          {/* Status Banner */}
          <div className="rounded-xl overflow-hidden border border-white/10">
            {entryDetection.status === 'ALLOCATED' ? (
              <div className="bg-[#18181B] p-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-white uppercase">
                      ENTRY AUTHORIZED — SLOT {entryDetection.slot || 'ASSIGNED'}
                    </p>
                    <p className="text-[11px] text-zinc-400 font-medium">
                      {entryDetection.message || 'Buzzer sounded • Pre-check-in booking confirmed'}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-bold text-zinc-300 bg-white/10 px-2 py-0.5 rounded shrink-0">
                  {entryDetection.timestamp || 'Active'}
                </span>
              </div>
            ) : entryDetection.status === 'UNAUTHORIZED' ? (
              <div className="bg-[#18181B] p-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-white uppercase">ACCESS DENIED — UNREGISTERED</p>
                    <p className="text-[11px] text-zinc-400 font-medium">
                      {entryDetection.message || 'Vehicle has no pending pre-check-in booking.'}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded shrink-0">
                  Denied
                </span>
              </div>
            ) : entryDetection.status === 'NO_PLATE' ? (
              <div className="bg-[#18181B] p-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-zinc-400 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-white uppercase">NO LICENSE PLATE RECOGNIZED</p>
                    <p className="text-[11px] text-zinc-400 font-medium">
                      No license plate recognized — waiting for another frame.
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-bold text-zinc-400 bg-white/5 px-2 py-0.5 rounded shrink-0">
                  Waiting
                </span>
              </div>
            ) : (
              <div className="bg-[#18181B] p-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Camera className="w-5 h-5 text-zinc-400 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-white uppercase">ENTRY GATE READY</p>
                    <p className="text-[11px] text-zinc-400">
                      {entryDetection.message || 'Monitoring incoming vehicles every 5 seconds.'}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-bold text-zinc-400 bg-white/5 px-2 py-0.5 rounded shrink-0">
                  Standby
                </span>
              </div>
            )}
          </div>

          {/* Core Metrics Card */}
          <div className="bg-[#18181B] border border-white/10 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-xl text-white">
                🚗
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">
                  Latest License Plate
                </span>

                {/* Display plate with clean outline */}
                {entryDetection.plate_number ? (
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="px-2.5 py-0.5 font-mono font-bold text-sm rounded bg-black text-white border border-white/20 tracking-wider">
                      {entryDetection.plate_number}
                    </span>

                    {/* Verification badge */}
                    {entryDetection.is_verified ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        <ShieldCheck className="w-3 h-3 text-emerald-400" />
                        Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#141416] text-zinc-400 border border-white/10">
                        <ShieldAlert className="w-3 h-3 text-zinc-400" />
                        Unverified
                      </span>
                    )}

                    <span className="text-[10px] font-mono text-zinc-500">
                      Conf: {formatConfidence(entryDetection.confidence)}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs font-mono font-bold text-zinc-500 italic block mt-0.5">
                    No plate recognized yet
                  </span>
                )}

                <div className="flex items-center gap-3 text-[10px] text-zinc-400 mt-1.5">
                  <span>Type: <strong className="text-white">{entryDetection.vehicle_type || 'Car'}</strong></span>
                  {entryDetection.timestamp && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-zinc-500" />
                      {entryDetection.timestamp}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="text-right border-l border-white/10 pl-4">
              <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider block">
                Assigned Bay
              </span>
              <span className="text-3xl font-black font-mono text-white block">
                {entryDetection.slot || '—'}
              </span>
            </div>
          </div>

          {/* Visual Frame & Debug Evidence Controls */}
          <div className="bg-[#18181B] border border-white/10 rounded-xl p-3 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold text-zinc-300 flex items-center gap-1">
                <ImageIcon className="w-3.5 h-3.5 text-zinc-400" />
                Latest Entry Frame:
              </span>
              <button
                onClick={() =>
                  setSelectedDebugImg({
                    url: `${apiBase}/api/anpr/debug-image/entry_raw.jpg?t=${imgTimestamp}`,
                    title: 'Entry Camera — Latest Raw Frame',
                    subtitle: 'Direct JPEG upload from Entry ESP32-CAM prior to cropping.',
                  })
                }
                className="px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 text-white font-bold text-[10px] border border-white/10 transition-colors"
              >
                Raw JPEG
              </button>
              <button
                onClick={() =>
                  setSelectedDebugImg({
                    url: `${apiBase}/api/anpr/debug-image/entry_plate_crop.jpg?t=${imgTimestamp}`,
                    title: 'Entry Camera — Detected Plate Crop',
                    subtitle: 'YOLO plate bounding-box localization crop.',
                  })
                }
                className="px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 text-white font-bold text-[10px] border border-white/10 transition-colors"
              >
                Plate Crop
              </button>
              <button
                onClick={() =>
                  setSelectedDebugImg({
                    url: `${apiBase}/api/anpr/debug-image/entry_processed_ocr.jpg?t=${imgTimestamp}`,
                    title: 'Entry Camera — OCR Preprocessed Image',
                    subtitle: 'Adaptive thresholding, bilateral denoising, and contrast enhancement.',
                  })
                }
                className="px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 text-white font-bold text-[10px] border border-white/10 transition-colors"
              >
                OCR Variant
              </button>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* EXIT CAMERA CARD */}
        {/* ========================================================= */}
        <div className="bg-[#141416] border border-white/10 rounded-2xl p-5 flex flex-col gap-4">
          {/* Header Bar */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-[#18181B] text-white border border-white/10">
                <ArrowRightLeft className="w-4 h-4" />
              </span>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-white block">
                  EXIT CAMERA (ESP32 #2)
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">
                  Endpoint: /api/detection/exit
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Online/Offline/Unknown Badge */}
              {renderCameraOnlineBadge(exitDetection.camera_online_status, exitDetection.last_frame_timestamp)}

              <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 ${
                exitDetection.status === 'RELEASED'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'bg-[#18181B] text-zinc-400 border border-white/10'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${exitDetection.status === 'RELEASED' ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
                {exitDetection.status === 'RELEASED' ? 'BARRIER OPEN (90°)' : 'BARRIER DOWN (0°)'}
              </span>
            </div>
          </div>

          {/* Status Banner */}
          <div className="rounded-xl overflow-hidden border border-white/10">
            {exitDetection.status === 'RELEASED' ? (
              <div className="bg-[#18181B] p-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-white uppercase">
                      VEHICLE EXITED — SLOT {exitDetection.slot || 'FREED'} RELEASED
                    </p>
                    <p className="text-[11px] text-zinc-400 font-medium">
                      {exitDetection.message || 'Active parking session completed • Slot marked available'}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-bold text-zinc-300 bg-white/10 px-2 py-0.5 rounded shrink-0">
                  {exitDetection.timestamp || 'Success'}
                </span>
              </div>
            ) : exitDetection.status === 'NO_SESSION' ? (
              <div className="bg-[#18181B] p-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-white uppercase">NO ACTIVE PARKING SESSION</p>
                    <p className="text-[11px] text-zinc-400 font-medium">
                      No active parking session found for this vehicle.
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded shrink-0">
                  Unmatched
                </span>
              </div>
            ) : exitDetection.status === 'NO_PLATE' ? (
              <div className="bg-[#18181B] p-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-zinc-400 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-white uppercase">NO LICENSE PLATE RECOGNIZED</p>
                    <p className="text-[11px] text-zinc-400 font-medium">
                      No license plate recognized — waiting for another frame.
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-bold text-zinc-400 bg-white/5 px-2 py-0.5 rounded shrink-0">
                  Waiting
                </span>
              </div>
            ) : (
              <div className="bg-[#18181B] p-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <ArrowRightLeft className="w-5 h-5 text-zinc-400 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-white uppercase">EXIT GATE READY</p>
                    <p className="text-[11px] text-zinc-400">
                      {exitDetection.message || 'Monitoring exiting vehicles every 5 seconds.'}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-bold text-zinc-400 bg-white/5 px-2 py-0.5 rounded shrink-0">
                  Standby
                </span>
              </div>
            )}
          </div>

          {/* Core Metrics Card */}
          <div className="bg-[#18181B] border border-white/10 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-xl text-white">
                <ArrowRightLeft className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">
                  Latest License Plate
                </span>

                {/* Display plate with clean outline */}
                {exitDetection.plate_number ? (
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="px-2.5 py-0.5 font-mono font-bold text-sm rounded bg-black text-white border border-white/20 tracking-wider">
                      {exitDetection.plate_number}
                    </span>

                    {/* Verification badge */}
                    {exitDetection.is_verified ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        <ShieldCheck className="w-3 h-3 text-emerald-400" />
                        Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#141416] text-zinc-400 border border-white/10">
                        <ShieldAlert className="w-3 h-3 text-zinc-400" />
                        Unverified
                      </span>
                    )}

                    <span className="text-[10px] font-mono text-zinc-500">
                      Conf: {formatConfidence(exitDetection.confidence)}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs font-mono font-bold text-zinc-500 italic block mt-0.5">
                    No plate recognized yet
                  </span>
                )}

                <div className="flex items-center gap-3 text-[10px] text-zinc-400 mt-1.5">
                  <span>Type: <strong className="text-white">{exitDetection.vehicle_type || 'Car'}</strong></span>
                  {exitDetection.timestamp && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-zinc-500" />
                      {exitDetection.timestamp}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="text-right border-l border-white/10 pl-4">
              <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider block">
                Released Bay
              </span>
              <span className="text-3xl font-black font-mono text-white block">
                {exitDetection.slot || '—'}
              </span>
            </div>
          </div>

          {/* Visual Frame & Debug Evidence Controls */}
          <div className="bg-[#18181B] border border-white/10 rounded-xl p-3 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold text-zinc-300 flex items-center gap-1">
                <ImageIcon className="w-3.5 h-3.5 text-zinc-400" />
                Latest Exit Frame:
              </span>
              <button
                onClick={() =>
                  setSelectedDebugImg({
                    url: `${apiBase}/api/anpr/debug-image/exit_raw.jpg?t=${imgTimestamp}`,
                    title: 'Exit Camera — Latest Raw Frame',
                    subtitle: 'Direct JPEG upload from Exit ESP32-CAM prior to cropping.',
                  })
                }
                className="px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 text-white font-bold text-[10px] border border-white/10 transition-colors"
              >
                Raw JPEG
              </button>
              <button
                onClick={() =>
                  setSelectedDebugImg({
                    url: `${apiBase}/api/anpr/debug-image/exit_plate_crop.jpg?t=${imgTimestamp}`,
                    title: 'Exit Camera — Detected Plate Crop',
                    subtitle: 'YOLO plate bounding-box localization crop.',
                  })
                }
                className="px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 text-white font-bold text-[10px] border border-white/10 transition-colors"
              >
                Plate Crop
              </button>
              <button
                onClick={() =>
                  setSelectedDebugImg({
                    url: `${apiBase}/api/anpr/debug-image/exit_processed_ocr.jpg?t=${imgTimestamp}`,
                    title: 'Exit Camera — OCR Preprocessed Image',
                    subtitle: 'Adaptive thresholding, bilateral denoising, and contrast enhancement.',
                  })
                }
                className="px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 text-white font-bold text-[10px] border border-white/10 transition-colors"
              >
                OCR Variant
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* ========================================================= */}
      {/* DIAGNOSTIC STAGE ATTRIBUTION BREAKDOWN */}
      {/* ========================================================= */}
      {showDiagnostics && (
        <div className="p-4 rounded-xl bg-[#141416] border border-white/10 space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-zinc-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Real-Time ANPR Pipeline Diagnostics &amp; Stage Attribution
              </h3>
            </div>
            <span className="text-[10px] font-mono text-zinc-500">
              Laplacian Blur Metric • Bilateral Filter • Adaptive Threshold • Single-Pass YOLO
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Entry Diagnostic Card */}
            <div className="p-3.5 rounded-xl bg-[#18181B] border border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Entry Camera Diagnostics
                </span>
                {latestEntryDiag
                  ? getStageBadge(latestEntryDiag.failure_stage, latestEntryDiag.reason)
                  : <span className="text-[10px] text-zinc-500">Waiting for frame...</span>}
              </div>

              {latestEntryDiag ? (
                <>
                  <div className="grid grid-cols-3 gap-2 py-1.5 border-y border-white/5 text-[11px]">
                    <div>
                      <span className="text-zinc-500 block text-[9px] uppercase font-bold">Sharpness</span>
                      <span className={`font-mono font-bold ${latestEntryDiag.quality?.is_blurry ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {latestEntryDiag.quality?.sharpness?.toFixed(1) ?? 'N/A'} {latestEntryDiag.quality?.is_blurry ? '(Blurry)' : '(Clear)'}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[9px] uppercase font-bold">Plate BBox</span>
                      <span className="font-mono font-bold text-zinc-300">
                        {latestEntryDiag.plate_bbox ? `${latestEntryDiag.plate_bbox[2] - latestEntryDiag.plate_bbox[0]}x${latestEntryDiag.plate_bbox[3] - latestEntryDiag.plate_bbox[1]}px` : 'None'}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[9px] uppercase font-bold">YOLO Conf</span>
                      <span className="font-mono font-bold text-zinc-300">
                        {latestEntryDiag.plate_conf ? `${(latestEntryDiag.plate_conf * 100).toFixed(1)}%` : '0%'}
                      </span>
                    </div>
                  </div>

                  {latestEntryDiag.candidates && latestEntryDiag.candidates.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-zinc-500 text-[9px] uppercase font-bold block">Top OCR Candidates</span>
                      <div className="flex flex-wrap gap-1.5">
                        {latestEntryDiag.candidates.slice(0, 4).map((cand, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-black text-white border border-white/10"
                          >
                            {cand.text} ({(cand.confidence * 100).toFixed(0)}%)
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1 text-[10px]">
                    <span className="text-zinc-400 italic truncate max-w-[280px]">
                      {latestEntryDiag.reason}
                    </span>
                    <span className="text-zinc-500 font-mono text-[9px]">
                      {latestEntryDiag.timing ? `${latestEntryDiag.timing.total_ms}ms total` : ''}
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-zinc-500 italic text-[11px]">No frames captured from Entry ESP32-CAM yet.</p>
              )}
            </div>

            {/* Exit Diagnostic Card */}
            <div className="p-3.5 rounded-xl bg-[#18181B] border border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" /> Exit Camera Diagnostics
                </span>
                {latestExitDiag
                  ? getStageBadge(latestExitDiag.failure_stage, latestExitDiag.reason)
                  : <span className="text-[10px] text-zinc-500">Waiting for frame...</span>}
              </div>

              {latestExitDiag ? (
                <>
                  <div className="grid grid-cols-3 gap-2 py-1.5 border-y border-white/5 text-[11px]">
                    <div>
                      <span className="text-zinc-500 block text-[9px] uppercase font-bold">Sharpness</span>
                      <span className={`font-mono font-bold ${latestExitDiag.quality?.is_blurry ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {latestExitDiag.quality?.sharpness?.toFixed(1) ?? 'N/A'} {latestExitDiag.quality?.is_blurry ? '(Blurry)' : '(Clear)'}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[9px] uppercase font-bold">Plate BBox</span>
                      <span className="font-mono font-bold text-zinc-300">
                        {latestExitDiag.plate_bbox ? `${latestExitDiag.plate_bbox[2] - latestExitDiag.plate_bbox[0]}x${latestExitDiag.plate_bbox[3] - latestExitDiag.plate_bbox[1]}px` : 'None'}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[9px] uppercase font-bold">YOLO Conf</span>
                      <span className="font-mono font-bold text-zinc-300">
                        {latestExitDiag.plate_conf ? `${(latestExitDiag.plate_conf * 100).toFixed(1)}%` : '0%'}
                      </span>
                    </div>
                  </div>

                  {latestExitDiag.candidates && latestExitDiag.candidates.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-zinc-500 text-[9px] uppercase font-bold block">Top OCR Candidates</span>
                      <div className="flex flex-wrap gap-1.5">
                        {latestExitDiag.candidates.slice(0, 4).map((cand, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-black text-white border border-white/10"
                          >
                            {cand.text} ({(cand.confidence * 100).toFixed(0)}%)
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1 text-[10px]">
                    <span className="text-zinc-400 italic truncate max-w-[280px]">
                      {latestExitDiag.reason}
                    </span>
                    <span className="text-zinc-500 font-mono text-[9px]">
                      {latestExitDiag.timing ? `${latestExitDiag.timing.total_ms}ms total` : ''}
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-zinc-500 italic text-[11px]">No frames captured from Exit ESP32-CAM yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* DEBUG IMAGE INSPECTION MODAL */}
      {/* ========================================================= */}
      {selectedDebugImg && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 backdrop-blur-md"
          onClick={() => setSelectedDebugImg(null)}
        >
          <div
            className="bg-[#121214] border border-white/20 rounded-2xl p-5 max-w-xl w-full shadow-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <h4 className="font-bold text-white text-sm flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-white" />
                  {selectedDebugImg.title}
                </h4>
                <p className="text-[11px] text-zinc-400 mt-0.5">{selectedDebugImg.subtitle}</p>
              </div>
              <button
                onClick={() => setSelectedDebugImg(null)}
                className="text-xs font-bold px-3 py-1 rounded-full bg-white text-black hover:bg-zinc-200 transition-colors"
              >
                Close
              </button>
            </div>
            
            <div className="bg-black rounded-xl overflow-hidden flex items-center justify-center min-h-[220px] max-h-[420px] p-2 border border-white/10">
              <img
                src={selectedDebugImg.url}
                alt="ANPR Debug Capture"
                className="max-h-[380px] w-auto object-contain rounded"
                onError={(e) => {
                  const target = e.target as HTMLElement;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent && !parent.querySelector('.img-error-msg')) {
                    const msg = document.createElement('p');
                    msg.className = 'img-error-msg text-xs text-zinc-500 italic p-4 text-center';
                    msg.innerText = 'No image capture available yet on server. Submit or capture a frame from the ESP32-CAM first.';
                    parent.appendChild(msg);
                  }
                }}
              />
            </div>
            
            <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1">
              <span>Source: FastAPI Debug Evidence Store</span>
              <button
                onClick={() => setSelectedDebugImg({ ...selectedDebugImg, url: `${selectedDebugImg.url.split('?')[0]}?t=${Date.now()}` })}
                className="text-white hover:underline font-bold flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> Reload Image
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
