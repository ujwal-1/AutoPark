import os
import subprocess

html_content = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 2000px;
    height: 980px;
    background: #ffffff;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 32px 40px;
    color: #1e293b;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: relative;
    width: 100%;
  }

  /* Node cards */
  .card {
    background: #ffffff;
    border: 2.5px solid #cbd5e1;
    border-radius: 16px;
    padding: 18px 24px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.05);
    position: relative;
    z-index: 2;
  }

  .card-hw {
    border-color: #0284c7;
    background: #f0f9ff;
    width: 320px;
    height: 170px;
  }
  .card-ai {
    border-color: #059669;
    background: #ecfdf5;
    width: 380px;
    height: 170px;
  }
  .card-logic {
    border-color: #4f46e5;
    background: #eef2ff;
    width: 380px;
    height: 170px;
  }
  .card-actuator {
    border-color: #d97706;
    background: #fffbeb;
    width: 320px;
    height: 170px;
  }
  .card-backend {
    border-color: #334155;
    background: #f8fafc;
    width: 620px;
    height: 180px;
  }
  .card-frontend {
    border-color: #7c3aed;
    background: #faf5ff;
    width: 620px;
    height: 180px;
  }

  .badge {
    align-self: flex-start;
    font-size: 13px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    padding: 4px 10px;
    border-radius: 6px;
    margin-bottom: 8px;
  }
  .badge-hw { background: #bae6fd; color: #0369a1; }
  .badge-ai { background: #a7f3d0; color: #065f46; }
  .badge-logic { background: #c7d2fe; color: #3730a3; }
  .badge-actuator { background: #fde68a; color: #92400e; }
  .badge-backend { background: #e2e8f0; color: #1e293b; }
  .badge-frontend { background: #ddd6fe; color: #5b21b6; }

  .title {
    font-size: 22px;
    font-weight: 800;
    margin-bottom: 6px;
    color: #0f172a;
    line-height: 1.2;
  }
  .desc {
    font-size: 15px;
    color: #475569;
    line-height: 1.35;
    font-weight: 500;
  }

  /* Connecting Arrows */
  .arrow {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
    z-index: 1;
    flex: 1;
    padding: 0 12px;
  }
  .arrow-line {
    width: 100%;
    height: 3px;
    background: #94a3b8;
    position: relative;
  }
  .arrow-line::after {
    content: '';
    position: absolute;
    right: -2px;
    top: -5px;
    width: 0;
    height: 0;
    border-top: 6px solid transparent;
    border-bottom: 6px solid transparent;
    border-left: 10px solid #94a3b8;
  }
  .arrow-text {
    font-size: 13px;
    font-weight: 700;
    color: #64748b;
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    text-align: center;
    white-space: nowrap;
  }

  .middle-connectors {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 60px;
    flex: 1;
  }

  .flow-label {
    position: absolute;
    top: -24px;
    left: 40px;
    font-size: 15px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 1.2px;
    color: #64748b;
  }
</style>
</head>
<body>

  <!-- 1. ENTRY PIPELINE -->
  <div class="row" style="margin-top: 10px;">
    <div class="flow-label">1. Entry Detection & Access Flow</div>

    <div class="card card-hw">
      <div class="badge badge-hw">Edge Sensing</div>
      <div class="title">Entry ESP32-CAM</div>
      <div class="desc">OV2640 Sensor · 640×480 VGA<br>Captures frame every 5 seconds</div>
    </div>

    <div class="arrow">
      <div class="arrow-text">HTTP POST (JPEG)</div>
      <div class="arrow-line"></div>
    </div>

    <div class="card card-ai">
      <div class="badge badge-ai">Computer Vision</div>
      <div class="title">YOLOv11 + EasyOCR</div>
      <div class="desc">Quality gate → Plate crop bbox<br>4 variants + 3-frame burst vote</div>
    </div>

    <div class="arrow">
      <div class="arrow-text">Plate Candidate</div>
      <div class="arrow-line"></div>
    </div>

    <div class="card card-logic">
      <div class="badge badge-logic">Decision Engine</div>
      <div class="title">Entry Allocation Logic</div>
      <div class="desc">Guarantees pre-booked bay<br>Allocates walk-in to first free slot</div>
    </div>

    <div class="arrow">
      <div class="arrow-text">open_barrier: true</div>
      <div class="arrow-line"></div>
    </div>

    <div class="card card-actuator">
      <div class="badge badge-actuator">Physical Barrier</div>
      <div class="title">SG90 Entry Barrier</div>
      <div class="desc">GPIO 12 · 90° open for 5 s<br>0° fail-closed on refusal</div>
    </div>
  </div>

  <!-- 2. CENTRAL INTEGRATION TIER -->
  <div class="row" style="justify-content: center; gap: 80px; margin: 10px 0;">
    <div class="card card-backend">
      <div class="badge badge-backend">Core Backend & Database</div>
      <div class="title">FastAPI Engine + SQLite (5 Tables)</div>
      <div class="desc">Single source of truth · Atomic slot allocation (`threading.Lock`) · Session audit trail & tariff calculation</div>
    </div>

    <div class="arrow" style="max-width: 140px;">
      <div class="arrow-text">WebSocket Push</div>
      <div class="arrow-line"></div>
      <div style="font-size: 12px; color: #94a3b8; font-weight: 600; margin-top: 4px;">&lt; 2s Latency</div>
    </div>

    <div class="card card-frontend">
      <div class="badge badge-frontend">Presentation Tier</div>
      <div class="title">Next.js 14 Real-Time Web App</div>
      <div class="desc">Live bay occupancy deck · Driver digital pass · Itemized billing receipts · Security operator command console</div>
    </div>
  </div>

  <!-- 3. EXIT PIPELINE -->
  <div class="row">
    <div class="flow-label">2. Exit Verification & Billing Flow</div>

    <div class="card card-hw">
      <div class="badge badge-hw">Edge Sensing</div>
      <div class="title">Exit ESP32-CAM</div>
      <div class="desc">OV2640 Sensor · 640×480 VGA<br>Captures frame at exit lane</div>
    </div>

    <div class="arrow">
      <div class="arrow-text">HTTP POST (JPEG)</div>
      <div class="arrow-line"></div>
    </div>

    <div class="card card-ai">
      <div class="badge badge-ai">Computer Vision</div>
      <div class="title">YOLOv11 + EasyOCR</div>
      <div class="desc">Plate detection & character read<br>Fuzzy match to active session</div>
    </div>

    <div class="arrow">
      <div class="arrow-text">Session Match</div>
      <div class="arrow-line"></div>
    </div>

    <div class="card card-logic">
      <div class="badge badge-logic">Billing & Release</div>
      <div class="title">Session Release & Tariff</div>
      <div class="desc">Frees bay to AVAILABLE pool<br>Calculates fee (₹30 + ₹20/hr extra)</div>
    </div>

    <div class="arrow">
      <div class="arrow-text">open_barrier: true</div>
      <div class="arrow-line"></div>
    </div>

    <div class="card card-actuator">
      <div class="badge badge-actuator">Physical Barrier</div>
      <div class="title">SG90 Exit Barrier</div>
      <div class="desc">GPIO 12 · 90° open for 5 s<br>Closes session & issues receipt</div>
    </div>
  </div>

</body>
</html>
"""

html_path = "/tmp/poster_methodology.html"
png_path = "docs/report/figures/poster_methodology_workflow.png"

with open(html_path, "w", encoding="utf-8") as f:
    f.write(html_content)

chrome_bin = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
cmd = [
    chrome_bin,
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--user-data-dir=/tmp/chrome_user_data",
    "--hide-scrollbars",
    "--window-size=2000,980",
    f"--screenshot={png_path}",
    html_path
]

print("Rendering high-res diagram with Chrome...")
subprocess.run(cmd, check=True)
print(f"✅ Generated {png_path} successfully!")
