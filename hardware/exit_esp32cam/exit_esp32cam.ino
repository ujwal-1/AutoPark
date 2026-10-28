#include "esp_camera.h"
#include <WiFi.h>
#include <WiFiClient.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>

// =====================================================
// AUTOPARK EXIT ESP32-CAM FIRMWARE (SERVO BOOM BARRIER)
// =====================================================

// =====================================================
// 1. WI-FI CREDENTIALS
// Fill these in for your own network before flashing. Never commit real credentials.
// =====================================================
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// =====================================================
// 2. BACKEND SERVER CONFIGURATION
// Laptop running FastAPI on port 8000
// =====================================================
const char* SERVER_HOST   = "192.168.1.3";
const uint16_t SERVER_PORT = 8000;
const char* SERVER_PATH   = "/api/detection/exit";

// Frame capture interval (milliseconds)
const unsigned long CAPTURE_INTERVAL_MS = 5000;

// =====================================================
// 3. EXIT SERVO BOOM BARRIER PIN
// Connect Servo signal (Orange/Yellow wire) to GPIO 12
// =====================================================
#define SERVO_PIN 12

Servo exitBarrierServo;

void openExitBoomBarrier() {
  Serial.println("[BOOM BARRIER] 🚗 LIFTING EXIT BARRIER (90°)...");
  exitBarrierServo.write(90); // Lift barrier arm
  delay(5000); // Hold open for 5 seconds for car to exit safely
  Serial.println("[BOOM BARRIER] 🛑 LOWERING EXIT BARRIER (0°)...");
  exitBarrierServo.write(0);  // Lower barrier arm
}

// =====================================================
// 4. AI-THINKER ESP32-CAM PINOUT
// =====================================================
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27

#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5

#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

unsigned long lastCaptureTime = 0;

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
    config.jpeg_quality = 10;            // High quality JPEG
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

  // Adjust camera sensor orientation
  sensor_t *sensor = esp_camera_sensor_get();
  if (sensor != NULL) {
    sensor->set_vflip(sensor, 1);
    sensor->set_hmirror(sensor, 0);
  }

  Serial.println("[CAMERA] Exit camera initialized successfully.");
}

// =====================================================
// CAPTURE & STREAM IMAGE TO FASTAPI BACKEND
// =====================================================
bool captureAndSendExitFrame() {
  Serial.println();
  Serial.println("---------------------------------------------");
  Serial.println("[EXIT CAMERA] Capturing image...");

  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("[EXIT CAMERA ERROR] Frame capture failed!");
    return false;
  }

  Serial.printf("[EXIT CAMERA] Image captured: %u bytes (%dx%d)\n", (unsigned int)fb->len, fb->width, fb->height);

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
  const char* boundary = "AutoParkBoundaryExit99";
  const char* ending   = "\r\n--AutoParkBoundaryExit99--\r\n";

  char partHeader[256];
  int partHeaderLen = snprintf(
    partHeader, sizeof(partHeader),
    "--%s\r\n"
    "Content-Disposition: form-data; name=\"file\"; filename=\"exit.jpg\"\r\n"
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
    const char* message      = doc["message"] | "";

    Serial.println();
    Serial.println("=========================================");
    Serial.println("           AUTOPARK EXIT RESULT          ");
    Serial.println("=========================================");
    Serial.printf("Status:         %s\n", status);
    Serial.printf("Released Slot:  %s\n", slot);
    Serial.printf("Plate Number:   %s\n", plate);
    Serial.printf("Confidence:     %.1f%%\n", confidence * 100.0);
    bool open_barrier        = doc["open_barrier"] | false;

    // Trigger physical Boom Barrier Servo upon confirmed slot release
    if (open_barrier || strcmp(status, "released") == 0) {
      Serial.printf("[BOOM BARRIER] EXIT CONFIRMED FOR SLOT %s — LIFTING GATE\n", slot);
      openExitBoomBarrier();
    } else {
      Serial.println("[BOOM BARRIER] EXIT GATE LOCKED (0°)");
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
  Serial.println("   AUTOPARK EXIT GATE ESP32-CAM (SERVO BARRIER)");
  Serial.println("==================================================");

  // Initialize Servo Motor for Exit Boom Barrier (0 deg = Closed/Down)
  if (SERVO_PIN >= 0) {
    exitBarrierServo.attach(SERVO_PIN);
    exitBarrierServo.write(0);
    Serial.println("[SERVO] Exit Boom Barrier calibrated to 0° (Closed)");
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
    Serial.print("[WIFI] ESP32-CAM Exit IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("[WIFI ERROR] Connection failed! Check SSID and password.");
  }

  // Initialize camera module
  setupCamera();

  Serial.println("[SYSTEM] Exit camera ready. Capturing every 5 seconds.");
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
    captureAndSendExitFrame();
    lastCaptureTime = millis(); // Reset 5s timer AFTER capture & transmission finishes
  }

  delay(20);
}
