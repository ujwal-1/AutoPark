#include <ESP8266HTTPClient.h>
#include <ESP8266WebServer.h>
#include <ESP8266WiFi.h>
#include <Servo.h>
#include <WiFiClient.h>

// =====================================================
// AUTOPARK DUAL BOOM BARRIER CONTROLLER (NodeMCU ESP8266)
// =====================================================

// 1. WI-FI CREDENTIALS
const char *WIFI_SSID = "ANAND N";
const char *WIFI_PASSWORD = "8971878807";

// 2. BACKEND SERVER CONFIGURATION (Laptop IP)
const char *SERVER_HOST = "192.168.0.104";
const uint16_t SERVER_PORT = 8000;

// 3. HARDWARE PINS (NodeMCU)
// Entry Servo on Pin D1 (GPIO 5)
// Exit Servo on Pin D2 (GPIO 4)
#define ENTRY_SERVO_PIN 5 // D1
#define EXIT_SERVO_PIN 4  // D2

Servo entryServo;
Servo exitServo;

ESP8266WebServer server(80);

// Non-blocking timer variables for automatic barrier lowering
unsigned long entryOpenUntil = 0;
bool isEntryOpen = false;

unsigned long exitOpenUntil = 0;
bool isExitOpen = false;

// Register this controller with FastAPI backend
void registerWithBackend() {
  if (WiFi.status() != WL_CONNECTED)
    return;

  WiFiClient client;
  HTTPClient http;
  String url = String("http://") + SERVER_HOST + ":" + SERVER_PORT +
               "/api/barrier/register";

  Serial.printf("[HTTP] Registering with backend: %s\n", url.c_str());
  if (http.begin(client, url)) {
    http.addHeader("Content-Type", "application/json");
    String payload = String("{\"ip\":\"") + WiFi.localIP().toString() +
                     "\",\"device\":\"esp8266_barriers\"}";
    int httpCode = http.POST(payload);
    if (httpCode > 0) {
      Serial.printf("[HTTP] Registered successfully! Response: %d\n", httpCode);
    } else {
      Serial.printf("[HTTP] Registration failed, code: %d\n", httpCode);
    }
    http.end();
  }
}

// Actuation functions (attaches only during movement, then detaches to eliminate buzzing/jitter)
void openEntryBarrier() {
  Serial.println("[BARRIER] 🚗 LIFTING ENTRY BARRIER (90°)...");
  entryServo.attach(ENTRY_SERVO_PIN);
  entryServo.write(90);
  delay(500); // Allow servo to reach 90°
  entryServo.detach(); // Stop PWM signal — eliminates hum/buzzing and motor jitter
  isEntryOpen = true;
  entryOpenUntil = millis() + 5000; // Hold for 5 seconds
}

void closeEntryBarrier() {
  Serial.println("[BARRIER] 🛑 LOWERING ENTRY BARRIER (0°)...");
  entryServo.attach(ENTRY_SERVO_PIN);
  entryServo.write(0);
  delay(500); // Allow servo to reach 0°
  entryServo.detach(); // Stop PWM signal — prevents gear stress & buzzing
  isEntryOpen = false;
}

void openExitBarrier() {
  Serial.println("[BARRIER] 🚗 LIFTING EXIT BARRIER (90°)...");
  exitServo.attach(EXIT_SERVO_PIN);
  exitServo.write(90);
  delay(500);
  exitServo.detach();
  isExitOpen = true;
  exitOpenUntil = millis() + 5000; // Hold for 5 seconds
}

void closeExitBarrier() {
  Serial.println("[BARRIER] 🛑 LOWERING EXIT BARRIER (0°)...");
  exitServo.attach(EXIT_SERVO_PIN);
  exitServo.write(0);
  delay(500);
  exitServo.detach();
  isExitOpen = false;
}

// HTTP Route Handlers
void handleRoot() {
  server.send(200, "text/plain",
              "AutoPark Dual Boom Barrier Controller (ESP8266) Online");
}

void handleEntryBarrier() {
  openEntryBarrier();
  server.send(200, "application/json",
              "{\"status\":\"ok\",\"action\":\"OPEN\",\"gate\":\"ENTRY\"}");
}

void handleExitBarrier() {
  openExitBarrier();
  server.send(200, "application/json",
              "{\"status\":\"ok\",\"action\":\"OPEN\",\"gate\":\"EXIT\"}");
}

void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println();
  Serial.println("==================================================");
  Serial.println("   AUTOPARK DUAL BOOM BARRIER CONTROLLER (ESP8266)");
  Serial.println("==================================================");

  // Attach and calibrate servos to closed position (0°), then detach to prevent buzzing
  entryServo.attach(ENTRY_SERVO_PIN);
  entryServo.write(0);
  delay(500);
  entryServo.detach();
  Serial.println("[SERVO] Entry Servo initialized on D1 (0° Closed, quiet)");

  exitServo.attach(EXIT_SERVO_PIN);
  exitServo.write(0);
  delay(500);
  exitServo.detach();
  Serial.println("[SERVO] Exit Servo initialized on D2 (0° Closed, quiet)");

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
    Serial.print("[WIFI] ESP8266 IP Address: ");
    Serial.println(WiFi.localIP());

    // Register with FastAPI laptop backend
    registerWithBackend();
  } else {
    Serial.println("[WIFI ERROR] Connection failed. Check SSID and password.");
  }

  // Define HTTP endpoints
  server.on("/", handleRoot);
  server.on("/barrier/entry", handleEntryBarrier);
  server.on("/barrier/exit", handleExitBarrier);
  server.begin();
  Serial.println("[HTTP SERVER] Listening for barrier commands on port 80.");
}

void loop() {
  server.handleClient();

  // Check if Entry Barrier 5s hold time has expired
  if (isEntryOpen && millis() >= entryOpenUntil) {
    closeEntryBarrier();
  }

  // Check if Exit Barrier 5s hold time has expired
  if (isExitOpen && millis() >= exitOpenUntil) {
    closeExitBarrier();
  }

  // Periodically check Wi-Fi health
  static unsigned long lastWifiCheck = 0;
  if (millis() - lastWifiCheck > 10000) {
    lastWifiCheck = millis();
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("[WIFI] Reconnecting...");
      WiFi.reconnect();
    }
  }

  delay(10);
}
