# 11 — Report Blueprint

> Use this as the skeleton of the final report. Each section names the dossier file that
> contains the content, so you can copy, tighten and paste instead of writing from zero.

---

## 1. Front matter

| Item | Notes |
|---|---|
| Title page | Project title, team, guide, department, year |
| Declaration | Signed by each member |
| Certificate | Signed by guide / HOD |
| Acknowledgement | Keep to one page; name the guide and lab staff |
| Abstract | 250–300 words — use `01-project-overview.md` §2 |
| Table of contents | Auto-generate |
| List of figures / tables | Auto-generate; captions listed in §6 below |
| List of abbreviations | From `15-glossary-and-references.md` |

---

## 2. Chapter plan (target 70–90 pages)

### Chapter 1 — Introduction (8–10 pages)

| Section | Content | Source |
|---|---|---|
| 1.1 Background | Parking search, congestion, gate operations | `01` §3–4 |
| 1.2 Problem statement | Cost of per-bay sensing; no live availability | `01` §3 |
| 1.3 Motivation | Driver, operator, owner perspectives | `01` §4 |
| 1.4 Aim and objectives | O1–O8 table | `01` §5–6 |
| 1.5 Scope and limitations | In/out table | `01` §7, `10` §1 |
| 1.6 Organisation of the report | One paragraph | — |

**Must include:** Figure 1.1 (system concept), Table 1.1 (objectives).

### Chapter 2 — Literature Survey (8–10 pages)

| Section | Content | Source |
|---|---|---|
| 2.1 Smart parking architectures | sensor-based vs camera-based vs hybrid | `02` §6, `09` §4 |
| 2.2 ANPR techniques | detection + OCR pipelines, YOLO family | `04` §2–7 |
| 2.3 OCR for unconstrained text | EasyOCR vs Tesseract | `03` §2 (R2) |
| 2.4 Access control and actuation | barriers, servos, IoT gates | `07` |
| 2.5 Real-time dashboards | WebSocket vs polling | `03` §2 (R4) |
| 2.6 Research gap | constant-cost sensing with auditable access | `01` §9 |

**Do not** write a catalogue of 30 papers. Six to eight genuinely used sources, each
with a sentence on what you took from it, is stronger. Use the references in `15`.

### Chapter 3 — System Requirements and Analysis (6–8 pages)

| Section | Content | Source |
|---|---|---|
| 3.1 Functional requirements | FR table (book, admit, refuse, exit, bill, monitor) | `01` §6, `05` §3 |
| 3.2 Non-functional requirements | correctness, latency, availability, security, usability | `09` §2 |
| 3.3 Stakeholders / personas | driver, operator, owner, examiner | `01` §10 |
| 3.4 Feasibility | technical, economic, operational | `03`, `07` §1 |
| 3.5 Constraints | LAN, hardware, OCR, power | `03` §4, `07` §10 |

**Must include:** Table 3.1 (FRs with IDs), Table 3.2 (NFRs with acceptance criteria).

### Chapter 4 — System Design (10–12 pages)

| Section | Content | Source |
|---|---|---|
| 4.1 Architecture overview | edge / application / presentation / data | `02` §1–3 |
| 4.2 Data flow | entry, exit, booking sequences | `02` §4 |
| 4.3 State machines | bay, booking, session | `02` §5 |
| 4.4 Database design | ER diagram + table specs | `05` §2 |
| 4.5 API design | endpoint table + sample JSON | `05` §3 |
| 4.6 ANPR design | pipeline diagram, thresholds | `04` §2–11 |
| 4.7 Hardware design | wiring, pin map, power | `07` §2–4 |
| 4.8 Design decisions | trade-off table | `02` §9 |

**Figures:** 4.1 architecture, 4.2 entry sequence, 4.3 exit sequence, 4.4 ER,
4.5 bay state machine, 4.6 ANPR pipeline, 4.7 wiring.

### Chapter 5 — Implementation (12–15 pages)

| Section | Content | Source |
|---|---|---|
| 5.1 Development environment | stack, versions, tooling | `03` §1, §4 |
| 5.2 Backend implementation | modules, allocation, release, billing | `05` §4–6 |
| 5.3 ANPR implementation | variants, scoring, burst voting, matching | `04` §3–10 |
| 5.4 Frontend implementation | routes, design system, realtime | `06` |
| 5.5 Firmware implementation | capture loop, servo contract | `07` §5–6 |
| 5.6 Database implementation | seeding, migrations, reset | `05` §10 |
| 5.7 Integration challenges | OCR on ESP32 images, ambiguity, bay binding | `04`, `08` §6 |

**Code excerpts to include (short, annotated):**

1. Servo hold function (5 lines).
2. Confidence gate (3 lines).
3. Ambiguity check (6 lines).
4. Bay-binding preference (5 lines).
5. Billing formula (2 lines).

Do not paste whole files into the body; put full listings in an appendix.

### Chapter 6 — Testing and Results (8–10 pages)

| Section | Content | Source |
|---|---|---|
| 6.1 Test strategy | levels and environment | `08` §1–2 |
| 6.2 Functional tests | T1–T8 with actual results | `08` §3 |
| 6.3 UI tests | U1–U8 | `08` §4 |
| 6.4 Hardware tests | H1–H7 | `08` §5 |
| 6.5 Defects found and fixed | D-01…D-11 | `08` §6 |
| 6.6 Recognition results | your measured tables | `09` §2 |
| 6.7 Discussion | scaling argument, trade-offs | `09` §3–4 |

**This chapter is where marks are won.** A table of real pass/fail results plus a defect
log reads far better than screenshots with no narrative.

### Chapter 7 — Conclusion and Future Work (4–5 pages)

| Section | Content | Source |
|---|---|---|
| 7.1 Summary | what was built, what was proven | `01`, `09` §1 |
| 7.2 Objectives achieved | O1–O8 with evidence | `08` §8 |
| 7.3 Limitations | honest list | `10` §1 |
| 7.4 Future work | walk-in policy, multi-lot, security, payments | `10` §2 |
| 7.5 Closing statement | the constant-cost insight | `10` §4 |

### Back matter

- References (IEEE style) — `15` §3
- Appendix A: API reference — `05` §3
- Appendix B: wiring diagram and BOM — `07` §1–4
- Appendix C: firmware listing
- Appendix D: sample detection evidence / diagnostics
- Appendix E: test transcript (`verify_system.sh` output)

---

## 3. Page budget summary

| Chapter | Pages | Share |
|---|---|---|
| Front matter | 8 | 10 % |
| 1 Introduction | 9 | 11 % |
| 2 Literature | 9 | 11 % |
| 3 Requirements | 7 | 8 % |
| 4 Design | 11 | 13 % |
| 5 Implementation | 14 | 17 % |
| 6 Testing & Results | 9 | 11 % |
| 7 Conclusion | 5 | 6 % |
| References + appendices | 10 | 12 % |
| **Total** | **~82** | |

Universities differ; adjust to the mandated page count, but keep the **ratio** —
implementation and testing should together be at least a third of the report.

---

## 4. Writing rules that raise marks

1. **One idea per paragraph.** No paragraph longer than ~6 lines.
2. **Every figure must be referenced in the text** ("Figure 4.2 shows …") and must have a
   caption that states what it proves.
3. **Every claim needs a source or a test.** "Fast" is not a result; "p95 = X ms on
   <hardware>" is.
4. **Past tense for what you did; present tense for what the system does.**
5. **Define an acronym at first use**, then use it consistently.
6. **Do not use "we" and "I" interchangeably.** Pick "we" and stay with it.
7. **Avoid marketing adjectives** — "seamless", "cutting-edge", "revolutionary". Replace
   with a measurable property.
8. **Number every equation and table.**
9. **Keep code excerpts ≤ 15 lines** and explain them in the sentence above.
10. **Never present a placeholder as a measurement.** A blank table with a note is
    honest; a fabricated number is misconduct.

---

## 5. Abstract variants

### 150-word version (for the department template)

> AutoPark is a camera-based smart parking system that replaces per-bay occupancy sensors
> with two ESP32-CAM nodes at the entry and exit gates. A YOLOv11 detector locates the
> licence plate, EasyOCR reads it using four preprocessing variants and multi-frame
> voting, and a confidence-weighted matcher compares the reading against pending
> bookings. A vehicle is admitted only when exactly one booking matches; unknown or
> ambiguous plates are refused and the SG90 boom barrier stays closed. On admission the
> pre-booked bay is bound to the session and all clients update over WebSocket. Exit
> matches the plate to the active session, releases the bay and computes an itemised
> bill. Because occupancy is derived from gate events, sensing hardware cost is constant
> with lot size. The six-bay prototype includes a real-time dashboard, operator console,
> and a hardware-in-the-loop simulator.

### 300-word version

Use `01-project-overview.md` §2 verbatim; it is already written to this length.

---

## 6. Figure and table list (copy into the lists of figures/tables)

### Figures

| No. | Caption |
|---|---|
| 1.1 | Concept: two gate cameras replace per-bay sensors |
| 2.1 | Generic ANPR pipeline (detection → OCR → matching) |
| 3.1 | Use-case diagram: driver, operator, camera |
| 4.1 | System architecture (edge / backend / frontend / data) |
| 4.2 | Booking sequence |
| 4.3 | Authorised entry sequence |
| 4.4 | Exit and billing sequence |
| 4.5 | Entity–relationship diagram |
| 4.6 | Parking bay state machine |
| 4.7 | ANPR pipeline with thresholds |
| 4.8 | Entry and exit wiring diagram |
| 5.1 | Preprocessing variants of a plate crop |
| 5.2 | Candidate scoring and burst voting |
| 5.3 | Live Deck screenshot |
| 5.4 | Pre-Book with bay selection |
| 5.5 | Active Pass showing assigned bay |
| 5.6 | Receipt modal |
| 5.7 | Operator console with diagnostics |
| 6.1 | Test setup photograph |
| 6.2 | Barrier open / closed states |

### Tables

| No. | Caption |
|---|---|
| 1.1 | Objectives and evidence |
| 2.1 | Comparison of parking sensing approaches |
| 3.1 | Functional requirements |
| 3.2 | Non-functional requirements |
| 4.1 | Technology stack and justification |
| 4.2 | Match score bands |
| 4.3 | Refusal conditions and system response |
| 4.4 | API endpoints |
| 4.5 | Pin allocation |
| 5.1 | Billing examples |
| 6.1 | Functional test results |
| 6.2 | UI test results |
| 6.3 | Hardware test results |
| 6.4 | Defect log |
| 6.5 | Recognition accuracy by condition (measured) |
| 6.6 | Latency distribution (measured) |

---

## 7. Formatting checklist

- [ ] Same font and size throughout (usually 12 pt, 1.5 spacing).
- [ ] Page numbers; roman for front matter, arabic for body.
- [ ] Captions below figures, above tables; sourced where borrowed.
- [ ] All screenshots at consistent width and dark-theme consistent.
- [ ] Code in monospace, ≤ 15 lines in the body.
- [ ] Abbreviations expanded at first use.
- [ ] No orphan headings at the bottom of a page.
- [ ] References cited in the text, not just listed.
- [ ] PDF/A export if the department requires it.
