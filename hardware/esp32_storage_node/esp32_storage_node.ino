// FoodSync storage node — ESP32 + DHT22 (temperature/humidity) + MQ-135 (NH3/CO2 proxy).
// Posts readings to FoodSync every 60 s. Register the device in FoodSync (IoT cold chain → Register
// device) and paste the device ID and one-time API key below.
#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>

const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASS = "YOUR_PASSWORD";
const char* INGEST_URL = "http://192.168.1.10:5000/api/iot/ingest";  // FoodSync server on your LAN
const char* DEVICE_ID = "ENV-K1-4";
const char* DEVICE_KEY = "paste-the-key-shown-once";

#define DHT_PIN 4
#define MQ135_PIN 34
DHT dht(DHT_PIN, DHT22);

// MQ-135 calibration: R0 measured in clean air; curve constants from the datasheet (NH3).
const float RL_KOHM = 10.0, R0_KOHM = 76.6, NH3_A = 102.2, NH3_B = -2.473;

float nh3Ppm() {
  float v = analogRead(MQ135_PIN) * (3.3 / 4095.0);
  if (v < 0.01) return 0;
  float rs = RL_KOHM * (3.3 - v) / v;
  return NH3_A * pow(rs / R0_KOHM, NH3_B);
}

void setup() {
  Serial.begin(115200);
  dht.begin();
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(500);
}

void loop() {
  float t = dht.readTemperature(), h = dht.readHumidity();
  if (!isnan(t) && WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(INGEST_URL);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("x-device-id", DEVICE_ID);
    http.addHeader("x-device-key", DEVICE_KEY);
    String body = String("{\"metrics\":{\"temp_c\":") + t + ",\"humidity\":" + h + ",\"nh3_ppm\":" + nh3Ppm() + "}}";
    int code = http.POST(body);
    Serial.printf("POST %d  t=%.1f h=%.0f\n", code, t, h);
    http.end();
  }
  delay(60000);
}
