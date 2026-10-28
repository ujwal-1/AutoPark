import React from 'react';
import Link from 'next/link';
import Image from 'next/image';

export default function LogosPage() {
  return (
    <div className="min-h-screen bg-[#09090B] text-white p-6 sm:p-12">
      <div className="max-w-6xl mx-auto space-y-12">
        <div className="flex items-center justify-between border-b border-white/10 pb-6">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white">Logo Concept Showcase</h1>
            <p className="text-sm text-zinc-400 mt-1">
              Select your preferred logo direction for <span className="text-white font-bold">district park</span>.
            </p>
          </div>
          <Link
            href="/"
            className="px-4 py-2 rounded-full text-xs font-bold bg-[#141416] border border-white/10 text-zinc-300 hover:text-white hover:border-white/30 transition-all"
          >
            ← Back to Deck
          </Link>
        </div>

        {/* Sheet 1 */}
        <div className="bg-[#141416] border border-white/10 rounded-3xl p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-mono uppercase tracking-widest text-zinc-500">Collection 01</span>
              <h2 className="text-xl font-bold text-white mt-1">Identity & Systems (4 Concepts)</h2>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-mono bg-white/5 border border-white/10 text-zinc-300">
              Concepts 1 — 4
            </span>
          </div>

          <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logos/sheet1.jpg"
              alt="Logo Concepts Sheet 1"
              className="w-full h-auto object-contain"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
              <span className="text-xs font-mono text-zinc-500">Top-Left</span>
              <h3 className="font-bold text-white text-sm mt-1">1. DP Interlock</h3>
              <p className="text-xs text-zinc-400 mt-1">
                Continuous loop monogram joining lowercase 'd' and 'p'. Smooth mobility flow.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
              <span className="text-xs font-mono text-zinc-500">Top-Right</span>
              <h3 className="font-bold text-white text-sm mt-1">2. Precision Bay [ P ]</h3>
              <p className="text-xs text-zinc-400 mt-1">
                ANPR camera optical focus brackets framing a parking space with gate accent.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
              <span className="text-xs font-mono text-zinc-500">Bottom-Left</span>
              <h3 className="font-bold text-white text-sm mt-1">3. District Hex Block</h3>
              <p className="text-xs text-zinc-400 mt-1">
                Architectural 3D precinct polygon with negative-space modernist 'P'.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
              <span className="text-xs font-mono text-zinc-500">Bottom-Right</span>
              <h3 className="font-bold text-white text-sm mt-1">4. Matrix Bay Grid</h3>
              <p className="text-xs text-zinc-400 mt-1">
                Minimalist 2x2 parking stalls with real-time occupancy levels.
              </p>
            </div>
          </div>
        </div>

        {/* Sheet 2 */}
        <div className="bg-[#141416] border border-white/10 rounded-3xl p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-mono uppercase tracking-widest text-zinc-500">Collection 02</span>
              <h2 className="text-xl font-bold text-white mt-1">Automotive & Access Dynamics (4 Concepts)</h2>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-mono bg-white/5 border border-white/10 text-zinc-300">
              Concepts 5 — 8
            </span>
          </div>

          <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logos/sheet2.jpg"
              alt="Logo Concepts Sheet 2"
              className="w-full h-auto object-contain"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
              <span className="text-xs font-mono text-zinc-500">Top-Left</span>
              <h3 className="font-bold text-white text-sm mt-1">5. The Stencil P</h3>
              <p className="text-xs text-zinc-400 mt-1">
                Architectural underground garage floor stencil with car silhouette.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
              <span className="text-xs font-mono text-zinc-500">Top-Right</span>
              <h3 className="font-bold text-white text-sm mt-1">6. Dual Barrier Boom</h3>
              <p className="text-xs text-zinc-400 mt-1">
                Two 45° angled parallel boom lines enclosing the parking 'P'.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
              <span className="text-xs font-mono text-zinc-500">Bottom-Left</span>
              <h3 className="font-bold text-white text-sm mt-1">7. Directional Chevron</h3>
              <p className="text-xs text-zinc-400 mt-1">
                Precision guidance chevrons merging into a streamlined parking bay.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
              <span className="text-xs font-mono text-zinc-500">Bottom-Right</span>
              <h3 className="font-bold text-white text-sm mt-1">8. Monolith 'd'</h3>
              <p className="text-xs text-zinc-400 mt-1">
                Heavy geometric lowercase 'd' with an integrated parking stall.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
