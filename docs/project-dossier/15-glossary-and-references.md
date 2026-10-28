# 15 — Glossary, Abbreviations and References

---

## 1. Abbreviations

| Abbreviation | Expansion |
|---|---|
| ANPR / ALPR | Automatic Number Plate Recognition / Automatic Licence Plate Recognition |
| API | Application Programming Interface |
| CORS | Cross-Origin Resource Sharing |
| CRUD | Create, Read, Update, Delete |
| CV | Computer Vision |
| DB | Database |
| ER | Entity–Relationship |
| GPIO | General-Purpose Input/Output |
| HIL | Hardware-in-the-Loop |
| HS256 | HMAC with SHA-256 (JWT signing algorithm) |
| HTTP | Hypertext Transfer Protocol |
| IoT | Internet of Things |
| JPEG | Joint Photographic Experts Group (image format) |
| JSON | JavaScript Object Notation |
| JWT | JSON Web Token |
| LAN | Local Area Network |
| MVP | Minimum Viable Product |
| OCR | Optical Character Recognition |
| ORM | Object–Relational Mapping |
| PDR | Plate Detection Rate |
| PSRAM | Pseudo-Static Random Access Memory |
| PWM | Pulse-Width Modulation |
| REST | Representational State Transfer |
| RF | Random Forest (not used here) |
| SQL | Structured Query Language |
| TLS | Transport Layer Security |
| UI / UX | User Interface / User Experience |
| UTC | Coordinated Universal Time |
| VGA / QVGA | 640×480 / 320×240 resolution |
| WS | WebSocket |
| YOLO | You Only Look Once (object detection family) |

---

## 2. Glossary of project terms

| Term | Meaning in AutoPark |
|---|---|
| **Allocation** | Binding a vehicle to a concrete bay and creating an ACTIVE session |
| **Ambiguity** | Two candidate matches whose scores differ by less than 0.10; the system refuses |
| **Boom barrier** | The physical arm driven by the SG90 servo |
| **Booking / pre-registration** | A `PENDING_ARRIVAL` record that holds a bay before the car arrives |
| **Burst** | Up to three frames within five seconds, voted together |
| **Canonicalisation** | Mapping visually confusable OCR characters (O→0, I→1, …) before comparison |
| **Cooldown** | A 10-second per-plate window that suppresses duplicate frames |
| **Detection event** | An audit row recording camera, plate, confidence and outcome |
| **Fail-closed** | The barrier stays down unless the backend explicitly says open |
| **Levenshtein distance** | Minimum number of single-character edits between two strings |
| **Occupancy** | A bay having an ACTIVE session; derived, not sensed |
| **Pre-check-in** | The booking action performed before arrival |
| **Session** | The interval between an authorised entry and the matching exit |
| **Slot / bay** | One parking space (A1–A3, B1–B3) |
| **Zone A / Zone B** | Two groups of three bays, used for filtering in the UI |

---

## 3. References (IEEE style)

The sources below are numbered, and the number is used wherever a source is cited in the text.

[1] T. Lin, H. Rivano, and F. Le Mouël, "A survey of smart parking solutions," *IEEE
Transactions on Intelligent Transportation Systems*, vol. 18, no. 12, pp. 3229–3253,
2017, doi: 10.1109/TITS.2017.2685143.

[2] D. Shoup, "Cruising for parking," *Transport Policy*, vol. 13, no. 6, pp. 479–486,
2006, doi: 10.1016/j.tranpol.2006.05.005.

[3] S. Du, M. Ibrahim, M. Shehata, and W. Badawy, "Automatic license plate recognition
(ALPR): A state-of-the-art review," *IEEE Transactions on Circuits and Systems for Video
Technology*, vol. 23, no. 2, pp. 311–325, 2013, doi: 10.1109/TCSVT.2012.2203741.

[4] J. Redmon, S. Divvala, R. Girshick, and A. Farhadi, "You only look once: Unified,
real-time object detection," in *Proc. IEEE Conf. Computer Vision and Pattern Recognition
(CVPR)*, 2016, pp. 779–788, doi: 10.1109/CVPR.2016.91.

[5] Ultralytics, "YOLO11 documentation," 2024. [Online]. Available:
https://docs.ultralytics.com/models/yolo11/

[6] Jaided AI, "EasyOCR: Ready-to-use OCR with 80+ languages," GitHub repository.
[Online]. Available: https://github.com/JaidedAI/EasyOCR

[7] G. Bradski, "The OpenCV library," *Dr. Dobb's Journal of Software Tools*, 2000.

[8] V. I. Levenshtein, "Binary codes capable of correcting deletions, insertions and
reversals," *Soviet Physics Doklady*, vol. 10, no. 8, pp. 707–710, 1966.

[9] Espressif Systems, *ESP32 Series Datasheet*, 2023. [Online]. Available:
https://www.espressif.com/sites/default/files/documentation/esp32_datasheet_en.pdf

[10] TowerPro, *SG90 Micro Servo Motor Datasheet*. [Online]. Available:
http://www.towerpro.com.tw/product/sg90-7/

[11] S. Ramírez, *FastAPI Documentation*, 2018. [Online]. Available:
https://fastapi.tiangolo.com

[12] Vercel, *Next.js Documentation*. [Online]. Available: https://nextjs.org/docs

[13] SQLAlchemy, *SQLAlchemy 2.0 Documentation*. [Online]. Available:
https://docs.sqlalchemy.org

[14] M. Jones, J. Bradley, and N. Sakimura, "JSON Web Token (JWT)," RFC 7519, Internet
Engineering Task Force, May 2015, doi: 10.17487/RFC7519.

[15] R. T. Fielding, "Architectural styles and the design of network-based software
architectures," Ph.D. dissertation, University of California, Irvine, 2000.

[16] OWASP Foundation, "Password storage cheat sheet." [Online]. Available:
https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html

[17] J. Deng, W. Dong, R. Socher, L.-J. Li, K. Li, and L. Fei-Fei, "ImageNet: A
large-scale hierarchical image database," in *Proc. IEEE Conf. Computer Vision and
Pattern Recognition (CVPR)*, 2009, pp. 248–255, doi: 10.1109/CVPR.2009.5206848.

[18] A. Paszke et al., "PyTorch: An imperative style, high-performance deep learning
library," in *Advances in Neural Information Processing Systems (NeurIPS)*, vol. 32,
2019.

> **Citation hygiene:** do not cite a paper you have not at least read the abstract of.
> If an examiner asks "what did reference [3] contribute to your design?", you must be able
> to answer in one sentence. Fewer, well-understood references beat a long list.

---

## 4. BibTeX (drop into `references.bib`)

```bibtex
@article{lin2017survey,
  author  = {Lin, Trista and Rivano, Herv{\'e} and Le Mou{\"e}l, Fr{\'e}d{\'e}ric},
  title   = {A Survey of Smart Parking Solutions},
  journal = {IEEE Transactions on Intelligent Transportation Systems},
  volume  = {18}, number = {12}, pages = {3229--3253}, year = {2017},
  doi     = {10.1109/TITS.2017.2685143}
}

@article{shoup2006cruising,
  author  = {Shoup, Donald},
  title   = {Cruising for Parking},
  journal = {Transport Policy},
  volume  = {13}, number = {6}, pages = {479--486}, year = {2006},
  doi     = {10.1016/j.tranpol.2006.05.005}
}

@article{du2013alpr,
  author  = {Du, Shan and Ibrahim, Mahmoud and Shehata, Mohamed and Badawy, Wael},
  title   = {Automatic License Plate Recognition ({ALPR}): A State-of-the-Art Review},
  journal = {IEEE Transactions on Circuits and Systems for Video Technology},
  volume  = {23}, number = {2}, pages = {311--325}, year = {2013},
  doi     = {10.1109/TCSVT.2012.2203741}
}

@inproceedings{redmon2016yolo,
  author    = {Redmon, Joseph and Divvala, Santosh and Girshick, Ross and Farhadi, Ali},
  title     = {You Only Look Once: Unified, Real-Time Object Detection},
  booktitle = {Proc. IEEE Conference on Computer Vision and Pattern Recognition (CVPR)},
  pages     = {779--788}, year = {2016},
  doi       = {10.1109/CVPR.2016.91}
}

@misc{ultralytics2024yolo11,
  author = {{Ultralytics}},
  title  = {{YOLO11} Documentation},
  year   = {2024},
  url    = {https://docs.ultralytics.com/models/yolo11/}
}

@misc{easyocr,
  author = {{Jaided AI}},
  title  = {{EasyOCR}: Ready-to-use {OCR} with 80+ Languages},
  url    = {https://github.com/JaidedAI/EasyOCR}
}

@book{bradski2000opencv,
  author = {Bradski, Gary},
  title  = {The {OpenCV} Library},
  journal= {Dr. Dobb's Journal of Software Tools},
  year   = {2000}
}

@article{levenshtein1966binary,
  author  = {Levenshtein, Vladimir I.},
  title   = {Binary Codes Capable of Correcting Deletions, Insertions and Reversals},
  journal = {Soviet Physics Doklady},
  volume  = {10}, number = {8}, pages = {707--710}, year = {1966}
}

@misc{rfc7519,
  author = {Jones, Michael and Bradley, John and Sakimura, Nat},
  title  = {{JSON} Web Token ({JWT})},
  howpublished = {RFC 7519}, year = {2015},
  doi    = {10.17487/RFC7519}
}
```

---

## 5. Naming conventions used in this dossier

| Thing | Correct name | Avoid |
|---|---|---|
| The system | AutoPark | "Auto Park", "SmartPark", "BookMyShow clone" |
| The actuator | SG90 boom barrier servo | "buzzer", "gate motor" |
| The access rule | pre-booked-only | "walk-in supported" |
| The recognition step | ANPR pipeline | "AI scanning" |
| The occupancy model | derived occupancy | "sensor fusion" |
| The simulator | hardware-in-the-loop (HIL) simulator | "fake mode" |
| The bay identifier | bay / slot (`A1`…`B3`) | "parking id" |

Consistent naming is a small thing that makes a report look professional.
