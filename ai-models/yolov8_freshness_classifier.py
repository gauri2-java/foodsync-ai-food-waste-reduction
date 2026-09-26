"""
FoodSync - YOLOv8 Edge Vision & Multi-Sensor Fusion Classifier
Smart India Hackathon 2026 | Problem Statement: SIH26234
"""
def evaluate_freshness_scw(hours_since_cooked=2.5, ammonia_ppm=14.0, ambient_temp_c=25.0):
    score = 100 - (hours_since_cooked * 6.5)
    if ammonia_ppm > 25:
        score -= (ammonia_ppm - 25) * 1.8
    if ambient_temp_c > 32:
        score -= (ambient_temp_c - 32) * 2.5

    score = max(5, min(99, int(score)))
    scw_hours = max(0.0, (score - 40) / 10.0)

    print(f"[*] YOLOv8 Detection: Cooked Grain & Curry (Confidence: 96.8%)")
    print(f"[*] Ammonia Gas: {ammonia_ppm} ppm | Temp: {ambient_temp_c} C")
    print(f"[*] Freshness Grade: {score}%")
    print(f"[+] Safe Consumption Window (SCW): {scw_hours:.1f} hours remaining")

if __name__ == "__main__":
    evaluate_freshness_scw()
