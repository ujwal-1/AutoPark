# AutoPark — District by Zomato Design Overhaul

AutoPark has been redesigned to **exactly match the visual aesthetics, box geometry, color gradients, and lighting language of the District by Zomato app**.

---

## 🎨 Design System & Visual Token Mapping

| District Visual Element | District by Zomato Design Token | AutoPark Implementation |
| :--- | :--- | :--- |
| **Canvas Background** | Pitch dark midnight-violet (`#0B0813`) | `bg-districtBg` with fixed position background |
| **Ambient Aura Lighting** | Radial purple & magenta overhead glow | `radial-gradient(ellipse at 50% -80px, rgba(159,37,255,0.22), rgba(255,46,121,0.12))` |
| **Card & Frame Boxes** | Deep glass squircle containers (`#151120`, `#181423`) | `.district-card` with top rim highlight `border-t border-white/[0.15]` |
| **Signature Gradient** | Vibrant Pink to Electric Violet | `linear-gradient(135deg, #FF2E79 0%, #9F25FF 100%)` |
| **Category Squircles** | 58×58px rounded boxes with glowing glyphs | 6 dual-tone squircles for Pre-Book, Pass, Boom, Dual Feeds, Receipts, HIL |
| **Navigation Bar** | Floating frosted glass pill container | Floating navigation bar with active pink-purple gradient pill |
| **Search Input** | Elongated pill input with neon glow | `.district-search-bar` with search icon & custom placeholder |
| **Section Dividers** | Sleek horizontal lines with uppercase labels | `— IN THE MOOD FOR —` & `— IN THE LIMELIGHT —` |
| **Typography** | Modern geometric sans-serif | `Plus Jakarta Sans` with high-contrast headings & muted violet subtitles |

---

## 📸 Verified District Pages & Components

### 1. Home Page (`/`)
- **Pill Search Bar**: Custom search pill with glowing border on focus.
- **"IN THE MOOD FOR" 6-Squircle Action Grid**:
  1. 🚗 **Pre-Book** (Reserve Bay)
  2. 🎟️ **Active Pass** (Gate QR)
  3. 🛡️ **Boom Barrier** (0° / 90° SG90)
  4. 📷 **Dual Feeds** (ESP32-CAM)
  5. 🧾 **Receipts** (Digital Bills)
  6. ⚙️ **Command HIL** (Simulator)
- **"IN THE LIMELIGHT" Bay Showcase**: Filter pills (`All Bays`, `Zone A`, `Zone B`) and Bay overview.
- **Hardware Gateway Card**: "Zero Attendants. Zero Slot-Sensor Wiring Overhead."

### 2. Pre-Booking Portal (`/book`)
- **Dual-Column District Card**: Glass surface with delicate rim border.
- **Squircle Vehicle Category Selector**: `Car / Sedan`, `SUV / 4x4`, `Electric EV`.
- **License Plate Input**: Monospaced font with Indian `IND` license plate badge.
- **Duration Slider**: Gradient fill track with circular thumb.
- **Instant Gate Clearance Summary**: Rate breakdown and primary CTA button with District gradient.

### 3. Driver Active Smart Pass (`/pass`)
- **Digital Hologram Pass**: High-contrast white QR credential with unique identifier.
- **Live Status Indicator**: Emerald pulsing badge ("Hardware Clearance Active • Servo Boom Ready").
- **Designated Bay Spotlight**: Vibrant gradient typography (`BAY A1`).
- **Gate Clearance Protocol Notice**: ESP32-CAM automatic license plate scan verification.

### 4. Operator Console (`/operator`)
- **4 District Stat Squircles**: Total Slots, Available, Booked, and Occupied.
- **2D Twin with Overhead Driving Aisle Glow**: Central driving lane with status beacons.
- **Dual ESP32-CAM Optical Streams**: Entry (Servo 90° / 0°) and Exit gates with FPS metrics.
- **Interactive HIL Simulation Suite**: Simulate vehicle arrival, ANPR recognition, barrier lift, and checkout.

### 5. History & Itemized Receipts (`/history`)
- **Itemized History Cards**: Squircle vehicle icons, duration counters, and GST-compliant total fees.
- **Filter Search Bar**: Search past sessions by license plate number.
