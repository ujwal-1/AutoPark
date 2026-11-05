// =====================================================
// AUTOPARK — CAMERA DIAGNOSTIC SKETCH
// Flash this FIRST to diagnose the DMA malloc failure.
// Board: "ESP32 Dev Module" | PSRAM: "Disabled" | Flash Mode: "DIO"
// =====================================================
#include "esp_camera.h"

// AI-Thinker ESP32-CAM pins (same for OV2640/OV3660)
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

bool cameraReady = false;

void setup() {
  Serial.begin(115200);
  delay(2000);  // Give serial monitor time to connect

  Serial.println();
  Serial.println("##############################################");
  Serial.println("#    AUTOPARK CAMERA DIAGNOSTIC v1.0         #");
  Serial.println("##############################################");
  Serial.println();

  // ── STEP 1: Print full memory diagnostics ──
  Serial.println("=== MEMORY DIAGNOSTICS (BEFORE CAMERA INIT) ===");
  Serial.printf("  Total heap:           %u bytes\n", ESP.getHeapSize());
  Serial.printf("  Free heap:            %u bytes\n", ESP.getFreeHeap());
  Serial.printf("  Min free heap ever:   %u bytes\n", ESP.getMinFreeHeap());
  Serial.printf("  Max alloc heap:       %u bytes\n", ESP.getMaxAllocHeap());
  Serial.printf("  Total PSRAM:          %u bytes\n", ESP.getPsramSize());
  Serial.printf("  Free PSRAM:           %u bytes\n", ESP.getFreePsram());
  Serial.printf("  psramFound():         %s\n", psramFound() ? "YES" : "NO");

  uint32_t dmaFree = heap_caps_get_free_size(MALLOC_CAP_DMA);
  uint32_t dmaLargest = heap_caps_get_largest_free_block(MALLOC_CAP_DMA);
  Serial.printf("  Free DMA-capable:     %u bytes\n", dmaFree);
  Serial.printf("  Largest DMA block:    %u bytes\n", dmaLargest);

  uint32_t internalFree = heap_caps_get_free_size(MALLOC_CAP_INTERNAL);
  uint32_t internalLargest = heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL);
  Serial.printf("  Free internal:        %u bytes\n", internalFree);
  Serial.printf("  Largest internal blk: %u bytes\n", internalLargest);
  Serial.println("================================================");
  Serial.println();

  // ── STEP 2: Test a DMA malloc manually ──
  Serial.println("=== MANUAL DMA MALLOC TEST ===");
  void *testBuf = heap_caps_malloc(16384, MALLOC_CAP_DMA);  // 16KB test
  if (testBuf) {
    Serial.println("  16KB DMA malloc:      SUCCESS");
    heap_caps_free(testBuf);
  } else {
    Serial.println("  16KB DMA malloc:      FAILED! <--- THIS IS THE PROBLEM");
  }

  testBuf = heap_caps_malloc(4096, MALLOC_CAP_DMA);  // 4KB test
  if (testBuf) {
    Serial.println("  4KB DMA malloc:       SUCCESS");
    heap_caps_free(testBuf);
  } else {
    Serial.println("  4KB DMA malloc:       FAILED!");
  }

  testBuf = heap_caps_malloc(1024, MALLOC_CAP_DMA);  // 1KB test
  if (testBuf) {
    Serial.println("  1KB DMA malloc:       SUCCESS");
    heap_caps_free(testBuf);
  } else {
    Serial.println("  1KB DMA malloc:       FAILED!");
  }
  Serial.println("===============================");
  Serial.println();

  // ── STEP 3: Camera init with ZERO-INITIALIZED config ──
  Serial.println("=== CAMERA INIT (QQVGA 160x120, DRAM, 1 buf) ===");

  // CRITICAL: zero-init the struct to clear any garbage in fields
  // we don't explicitly set (newer ESP-IDF adds fields we might miss)
  camera_config_t config;
  memset(&config, 0, sizeof(camera_config_t));

  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;
  config.pin_d0       = Y2_GPIO_NUM;
  config.pin_d1       = Y3_GPIO_NUM;
  config.pin_d2       = Y4_GPIO_NUM;
  config.pin_d3       = Y5_GPIO_NUM;
  config.pin_d4       = Y6_GPIO_NUM;
  config.pin_d5       = Y7_GPIO_NUM;
  config.pin_d6       = Y8_GPIO_NUM;
  config.pin_d7       = Y9_GPIO_NUM;
  config.pin_xclk     = XCLK_GPIO_NUM;
  config.pin_pclk     = PCLK_GPIO_NUM;
  config.pin_vsync    = VSYNC_GPIO_NUM;
  config.pin_href     = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn     = PWDN_GPIO_NUM;
  config.pin_reset    = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;  // 20MHz (standard)
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size   = FRAMESIZE_QQVGA;  // 160x120 - absolute minimum
  config.jpeg_quality = 12;
  config.fb_count     = 1;
  config.fb_location  = CAMERA_FB_IN_DRAM;
  config.grab_mode    = CAMERA_GRAB_WHEN_EMPTY;

  esp_err_t err = esp_camera_init(&config);

  Serial.println();
  Serial.println("=== POST-INIT MEMORY ===");
  Serial.printf("  Free heap:            %u bytes\n", ESP.getFreeHeap());
  Serial.printf("  Free DMA:             %u bytes\n", heap_caps_get_free_size(MALLOC_CAP_DMA));
  Serial.println("========================");
  Serial.println();

  if (err != ESP_OK) {
    Serial.printf("*** CAMERA INIT FAILED: 0x%x ***\n", err);
    Serial.println();
    Serial.println("DIAGNOSIS:");
    if (dmaFree < 32768) {
      Serial.println("  -> Very low DMA memory. Your board may have broken PSRAM");
      Serial.println("     that corrupts the heap. Try Board='ESP32 Dev Module'");
      Serial.println("     with PSRAM='Disabled' in Arduino IDE Tools menu.");
    }
    if (ESP.getPsramSize() == 0 && psramFound()) {
      Serial.println("  -> psramFound()=YES but getPsramSize()=0. PSRAM chip is");
      Serial.println("     detected but not accessible. Faulty PSRAM or wrong");
      Serial.println("     flash mode. Select PSRAM='Disabled' in Tools.");
    }
    Serial.println("  -> Also try: File > Examples > ESP32 > Camera > CameraWebServer");
    Serial.println("     If that also fails, reinstall ESP32 board package.");
    return;
  }

  Serial.println("*** CAMERA INIT SUCCESS! ***");
  cameraReady = true;

  // Try first capture
  camera_fb_t *fb = esp_camera_fb_get();
  if (fb) {
    Serial.printf("*** FIRST CAPTURE SUCCESS: %u bytes (%dx%d) ***\n",
                  (unsigned int)fb->len, fb->width, fb->height);
    esp_camera_fb_return(fb);
  } else {
    Serial.println("*** FIRST CAPTURE FAILED (camera init ok but capture fails) ***");
  }
}

void loop() {
  if (!cameraReady) {
    delay(10000);
    Serial.println("[DIAGNOSTIC] Camera not initialized. Rebooting in 10s...");
    ESP.restart();
    return;
  }

  delay(3000);
  camera_fb_t *fb = esp_camera_fb_get();
  if (fb) {
    Serial.printf("[OK] Frame: %u bytes (%dx%d) | Free heap: %u\n",
                  (unsigned int)fb->len, fb->width, fb->height, ESP.getFreeHeap());
    esp_camera_fb_return(fb);
  } else {
    Serial.println("[FAIL] Frame capture failed");
  }
}

