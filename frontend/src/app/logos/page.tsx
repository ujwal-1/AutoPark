import React from 'react';
import Link from 'next/link';
import Image from 'next/image';

export default function LogosPage() {
  return (
    <div className="min-h-screen bg-concrete text-ink p-6 sm:p-12">
      <div className="max-w-6xl mx-auto space-y-12">
        <div className="flex items-center justify-between border-b border-hair pb-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-ink">Logo Concept Showcase</h1>
            <p className="text-sm text-ink2 mt-1">
              Select your preferred logo direction for <span className="text-ink font-bold">district park</span>.
            </p>
          </div>
          <Link
            href="/"
            className="px-4 py-2 rounded-sm text-xs font-bold bg-panel border border-hair text-ink2 hover:text-ink hover:border-ink transition-all"
          >
            ← Back to Deck
          </Link>
        </div>

        {/* Sheet 1 */}
        <div className="bg-panel border border-hair rounded-sm p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-mono uppercase tracking-widest text-muted">Collection 01</span>
              <h2 className="text-xl font-bold text-ink mt-1">Identity & Systems (4 Concepts)</h2>
            </div>
            <span className="px-3 py-1 rounded-sm text-xs font-mono bg-ink/[0.04] border border-hair text-ink2">
              Concepts 1 — 4
            </span>
          </div>

          <div className="relative rounded-sm overflow-hidden border border-hair bg-ink">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logos/sheet1.jpg"
              alt="Logo Concepts Sheet 1"
              className="w-full h-auto object-contain"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
            <div className="p-4 rounded-sm bg-ink/[0.02] border border-hair">
              <span className="text-xs font-mono text-muted">Top-Left</span>
              <h3 className="font-bold text-ink text-sm mt-1">1. DP Interlock</h3>
              <p className="text-xs text-ink2 mt-1">
                Continuous loop monogram joining lowercase 'd' and 'p'. Smooth mobility flow.
              </p>
            </div>
            <div className="p-4 rounded-sm bg-ink/[0.02] border border-hair">
              <span className="text-xs font-mono text-muted">Top-Right</span>
              <h3 className="font-bold text-ink text-sm mt-1">2. Precision Bay [ P ]</h3>
              <p className="text-xs text-ink2 mt-1">
                ANPR camera optical focus brackets framing a parking space with gate accent.
              </p>
            </div>
            <div className="p-4 rounded-sm bg-ink/[0.02] border border-hair">
              <span className="text-xs font-mono text-muted">Bottom-Left</span>
              <h3 className="font-bold text-ink text-sm mt-1">3. District Hex Block</h3>
              <p className="text-xs text-ink2 mt-1">
                Architectural 3D precinct polygon with negative-space modernist 'P'.
              </p>
            </div>
            <div className="p-4 rounded-sm bg-ink/[0.02] border border-hair">
              <span className="text-xs font-mono text-muted">Bottom-Right</span>
              <h3 className="font-bold text-ink text-sm mt-1">4. Matrix Bay Grid</h3>
              <p className="text-xs text-ink2 mt-1">
                Minimalist 2x2 parking stalls with real-time occupancy levels.
              </p>
            </div>
          </div>
        </div>

        {/* Sheet 2 */}
        <div className="bg-panel border border-hair rounded-sm p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-mono uppercase tracking-widest text-muted">Collection 02</span>
              <h2 className="text-xl font-bold text-ink mt-1">Automotive & Access Dynamics (4 Concepts)</h2>
            </div>
            <span className="px-3 py-1 rounded-sm text-xs font-mono bg-ink/[0.04] border border-hair text-ink2">
              Concepts 5 — 8
            </span>
          </div>

          <div className="relative rounded-sm overflow-hidden border border-hair bg-ink">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logos/sheet2.jpg"
              alt="Logo Concepts Sheet 2"
              className="w-full h-auto object-contain"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
            <div className="p-4 rounded-sm bg-ink/[0.02] border border-hair">
              <span className="text-xs font-mono text-muted">Top-Left</span>
              <h3 className="font-bold text-ink text-sm mt-1">5. The Stencil P</h3>
              <p className="text-xs text-ink2 mt-1">
                Architectural underground garage floor stencil with car silhouette.
              </p>
            </div>
            <div className="p-4 rounded-sm bg-ink/[0.02] border border-hair">
              <span className="text-xs font-mono text-muted">Top-Right</span>
              <h3 className="font-bold text-ink text-sm mt-1">6. Dual Barrier Boom</h3>
              <p className="text-xs text-ink2 mt-1">
                Two 45° angled parallel boom lines enclosing the parking 'P'.
              </p>
            </div>
            <div className="p-4 rounded-sm bg-ink/[0.02] border border-hair">
              <span className="text-xs font-mono text-muted">Bottom-Left</span>
              <h3 className="font-bold text-ink text-sm mt-1">7. Directional Chevron</h3>
              <p className="text-xs text-ink2 mt-1">
                Precision guidance chevrons merging into a streamlined parking bay.
              </p>
            </div>
            <div className="p-4 rounded-sm bg-ink/[0.02] border border-hair">
              <span className="text-xs font-mono text-muted">Bottom-Right</span>
              <h3 className="font-bold text-ink text-sm mt-1">8. Monolith 'd'</h3>
              <p className="text-xs text-ink2 mt-1">
                Heavy geometric lowercase 'd' with an integrated parking stall.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
