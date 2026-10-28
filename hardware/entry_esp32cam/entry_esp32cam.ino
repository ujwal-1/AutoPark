#include "esp_camera.h"
#include <WiFi.h>
#include <WiFiClient.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>

// =====================================================
// AUTOPARK ENTRY ESP32-CAM FIRMWARE (SERVO BOOM BARRIER)
// =====================================================

// =====================================================
// 1. WI-FI CREDENTIALS
// Update these to match your local Wi-Fi / Hotspot!
// =====================================================
const char* WIFI_SSID     = "Esp32test";
const char* WIFI_PASSWORD = "12345687";

// =====================================================
// 2. BACKEND SERVER CONFIGURATION
// Laptop running FastAPI on port 8000
// =====================================================
const char* SERVER_HOST   = "192.168.1.3";
const uint16_t SERVER_PORT = 8000;
const char* SERVER_PATH   = "/api/detection/entry";

// Frame capture interval (milliseconds)
const unsigned long CAPTURE_INTERVAL_MS = 5000;

// =====================================================
// 3. HARDWARE OUTPUT PINS (SERVO BOOM BARRIER & BUZZER)
// Connect Servo signal (Orange/Yellow wire) to GPIO 12
// Connect Buzzer (+) to GPIO 13 (or -1 if unused)
// =====================================================
#define SERVO_PIN 12
#define BUZZER_PIN 13

Servo entryBarrierServo;

// =====================================================
// BOOM BARRIER & BUZZER TRIGGER FUNCTIONS
// =====================================================
void beepBuzzer(int count = 2, int durationMs = 120) {
  if (BUZZER_PIN < 0) return;
  for (int i = 0; i < count; i++) {
    digitalWrite(BUZZER_PIN, HIGH);
    delay(durationMs);
    digitalWrite(BUZZER_PIN, LOW);
    delay(100);
  }
}

void openEntryBoomBarrier() {
  Serial.println("[BOOM BARRIER] 🚗 LIFTING ENTRY BARRIER (90°)...");
  entryBarrierServo.write(90); // Lift barrier arm
  beepBuzzer(1, 100);
  delay(5000); // Hold open for 5 seconds for car to drive through
  Serial.println("[BOOM BARRIER] 🛑 LOWERING ENTRY BARRIER (0°)...");
  entryBarrierServo.write(0);  // Lower barrier arm
}

// =====================================================
// CAMERA SETUP
// =====================================================
void setupCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;

  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;

  config.pin_xclk     = XCLK_GPIO_NUM;
  config.pin_pclk     = PCLK_GPIO_NUM;
  config.pin_vsync    = VSYNC_GPIO_NUM;
  config.pin_href     = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn     = PWDN_GPIO_NUM;
  config.pin_reset    = RESET_GPIO_NUM;

  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  if (psramFound()) {
    Serial.println("[CAMERA] PSRAM detected! Setting VGA (640x480) for clear license plate recognition.");
    config.frame_size   = FRAMESIZE_VGA;  // 640 x 480
    config.jpeg_quality = 10;            // Higher quality JPEG
    config.fb_count     = 2;
    config.grab_mode    = CAMERA_GRAB_LATEST;
    config.fb_location  = CAMERA_FB_IN_PSRAM;
  } else {
    Serial.println("[CAMERA] PSRAM NOT detected! Setting QVGA (320x240).");
    config.frame_size   = FRAMESIZE_QVGA; // 320 x 240
    config.jpeg_quality = 12;
    config.fb_count     = 1;
    config.grab_mode    = CAMERA_GRAB_WHEN_EMPTY;
    config.fb_location  = CAMERA_FB_IN_DRAM;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("[CAMERA ERROR] Init failed with error 0x%x\n", err);
    return;
  }

  // Adjust camera sensor orientation (adjust if camera is mounted upside down)
  sensor_t *sensor = esp_camera_sensor_get();
  if (sensor != NULL) {
    sensor->set_vflip(sensor, 1);
    sensor->set_hmirror(sensor, 0);
  }

  Serial.println("[CAMERA] Initialized successfully.");
}

// =====================================================
// CAPTURE & STREAM IMAGE TO FASTAPI BACKEND
// =====================================================
bool captureAndSendFrame() {
  Serial.println();
  Serial.println("---------------------------------------------");
  Serial.println("[ENTRY CAMERA] Capturing image...");

  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("[ENTRY CAMERA ERROR] Frame capture failed!");
    return false;
  }

  Serial.printf("[ENTRY CAMERA] Image captured: %u bytes (%dx%d)\n", (unsigned int)fb->len, fb->width, fb->height);

  // Check Wi-Fi connection
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WIFI] Disconnected! Reconnecting...");
    WiFi.reconnect();
    esp_camera_fb_return(fb);
    return false;
  }

  WiFiClient client;
  client.setTimeout(15000); // 15 seconds bounded connection timeout

  Serial.printf("[HTTP] Connecting to http://%s:%u%s ...\n", SERVER_HOST, SERVER_PORT, SERVER_PATH);
  if (!client.connect(SERVER_HOST, SERVER_PORT)) {
    Serial.println("[HTTP ERROR] Backend connection failed! Verify laptop IP and port 8000.");
    esp_camera_fb_return(fb);
    return false;
  }

  // Multipart form data boundaries
  const char* boundary = "AutoParkBoundaryEntry99";
  const char* ending   = "\r\n--AutoParkBoundaryEntry99--\r\n";

  char partHeader[256];
  int partHeaderLen = snprintf(
    partHeader, sizeof(partHeader),
    "--%s\r\n"
    "Content-Disposition: form-data; name=\"file\"; filename=\"entry.jpg\"\r\n"
    "Content-Type: image/jpeg\r\n\r\n",
    boundary
  );

  size_t endingLen = strlen(ending);
  size_t contentLength = (size_t)partHeaderLen + fb->len + endingLen;

  // Send HTTP POST headers
  client.printf("POST %s HTTP/1.1\r\n", SERVER_PATH);
  client.printf("Host: %s:%u\r\n", SERVER_HOST, SERVER_PORT);
  client.printf("Content-Type: multipart/form-data; boundary=%s\r\n", boundary);
  client.printf("Content-Length: %u\r\n", (unsigned int)contentLength);
  client.println("Connection: close");
  client.println();

  // Stream multipart body directly from frame buffer (0 heap allocation!)
  client.write((const uint8_t*)partHeader, partHeaderLen);
  client.write(fb->buf, fb->len);
  client.write((const uint8_t*)ending, endingLen);

  // Free camera frame buffer immediately
  esp_camera_fb_return(fb);

  Serial.println("[HTTP] Frame streamed to backend. Waiting for ANPR evaluation...");

  // Read HTTP Response Status Line
  unsigned long startWait = millis();
  while (!client.available() && client.connected() && (millis() - startWait < 15000)) {
    delay(20);
  }

  if (!client.available()) {
    Serial.println("[HTTP ERROR] No response from backend within timeout!");
    client.stop();
    return false;
  }

  String statusLine = client.readStringUntil('\n');
  statusLine.trim();
  Serial.print("[HTTP STATUS] ");
  Serial.println(statusLine);

  // Skip HTTP headers to get JSON response body
  while (client.connected() || client.available()) {
    String headerLine = client.readStringUntil('\n');
    headerLine.trim();
    if (headerLine.length() == 0) break; // Blank line marks end of headers
  }

  // Read JSON response body (bounded, no heap lockup)
  String responseBody = "";
  unsigned long bodyStart = millis();
  while ((client.connected() || client.available()) && (millis() - bodyStart < 4000)) {
    while (client.available()) {
      char c = client.read();
      responseBody += c;
    }
    delay(5);
  }
  client.stop();

  Serial.println("[BACKEND RESPONSE JSON]");
  Serial.println(responseBody);

  // Parse JSON response (supports ArduinoJson v6 and v7)
#if ARDUINOJSON_VERSION_MAJOR >= 7
  JsonDocument doc;
#else
  DynamicJsonDocument doc(2048);
#endif
  DeserializationError err = deserializeJson(doc, responseBody);

  if (!err) {
    const char* status       = doc["status"] | "unknown";
    const char* slot         = doc["slot"] | "none";
    const char* plate        = doc["plate_number"] | "none";
    float confidence         = doc["confidence"] | 0.0;
    bool trigger_buzzer      = doc["trigger_buzzer"] | false;
    const char* message      = doc["message"] | "";

    Serial.println();
    Serial.println("=========================================");
    Serial.println("          AUTOPARK ENTRY RESULT          ");
    Serial.println("=========================================");
    Serial.printf("Status:         %s\n", status);
    Serial.printf("Assigned Slot:  %s\n", slot);
    Serial.printf("Plate Number:   %s\n", plate);
    Serial.printf("Confidence:     %.1f%%\n", confidence * 100.0);
    Serial.printf("Message:        %s\n", message);
    Serial.println("=========================================");

    bool open_barrier        = doc["open_barrier"] | false;

    // Trigger physical Boom Barrier Servo upon authorized slot assignment
    if (open_barrier || trigger_buzzer) {
      Serial.printf("[BOOM BARRIER] ACCESS GRANTED FOR SLOT %s — LIFTING GATE\n", slot);
      openEntryBoomBarrier();
    } else {
      Serial.println("[BOOM BARRIER] GATE LOCKED (0°) — ACCESS NOT GRANTED");
    }
  } else {
    Serial.printf("[JSON ERROR] Parse failed (%s). Raw response: %s\n", err.c_str(), responseBody.c_str());
  }

  return true;
}

// =====================================================
// SETUP
// =====================================================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("==================================================");
  Serial.println("   AUTOPARK ENTRY GATE ESP32-CAM (SERVO BARRIER)");
  Serial.println("==================================================");

  // Initialize Servo Motor for Boom Barrier (0 deg = Closed/Down)
  if (SERVO_PIN >= 0) {
    entryBarrierServo.attach(SERVO_PIN);
    entryBarrierServo.write(0);
    Serial.println("[SERVO] Entry Boom Barrier calibrated to 0° (Closed)");
  }

  if (BUZZER_PIN >= 0) {
    pinMode(BUZZER_PIN, OUTPUT);
    digitalWrite(BUZZER_PIN, LOW);
  }

  // Connect to Wi-Fi
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("[WIFI] Connecting to '%s'", WIFI_SSID);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("[WIFI] Connected successfully!");
    Serial.print("[WIFI] ESP32-CAM Entry IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("[WIFI ERROR] Connection failed! Check SSID and password.");
  }

  // Initialize camera module
  setupCamera();

  // Test buzzer chirp on boot
  if (BUZZER_PIN >= 0) {
    beepBuzzer(1, 80);
  }

  Serial.println("[SYSTEM] Entry camera ready. Capturing every 5 seconds.");
  lastCaptureTime = millis();
}

// =====================================================
// MAIN LOOP
// =====================================================
void loop() {
  // Bounded auto-reconnect if Wi-Fi connection drops
  if (WiFi.status() != WL_CONNECTED) {
    static unsigned long lastReconnectAttempt = 0;
    if (millis() - lastReconnectAttempt > 5000) {
      lastReconnectAttempt = millis();
      Serial.println("[WIFI] Connection lost. Reconnecting to Wi-Fi...");
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }
    delay(100);
    return;
  }

  // Continuous capture cycle approximately every 5 seconds
  if (millis() - lastCaptureTime >= CAPTURE_INTERVAL_MS) {
    captureAndSendFrame();
    lastCaptureTime = millis(); // Reset 5s timer AFTER capture & transmission finishes
  }

  delay(20);
}