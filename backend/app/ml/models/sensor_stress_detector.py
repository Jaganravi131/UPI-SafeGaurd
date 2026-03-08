"""
Sensor Stress Detector Model
Detects coercion/panic from device sensor data
"""
import numpy as np
from typing import Dict, Tuple, Any, Optional, List
from dataclasses import dataclass


@dataclass
class SensorData:
    """Container for sensor data"""
    # Accelerometer
    accel_x: List[float]
    accel_y: List[float]
    accel_z: List[float]
    
    # Typing patterns
    typing_speed_cps: float
    inter_key_intervals: List[float]
    backspace_count: int
    total_keystrokes: int
    pause_durations: List[float]
    
    # Touch patterns
    touch_pressures: List[float]
    touch_areas: List[float]


class SensorStressDetector:
    """
    Detects physical signs of distress/coercion during transactions
    by analyzing device sensor data.
    """
    
    # Baseline thresholds (calibrated for typical usage)
    TREMOR_THRESHOLD = 0.5  # Accelerometer std threshold
    TYPING_SPEED_MIN = 2.0  # Minimum normal typing speed (cps)
    TYPING_SPEED_MAX = 10.0  # Maximum normal typing speed (cps)
    BACKSPACE_RATIO_THRESHOLD = 0.3  # High correction rate
    PAUSE_THRESHOLD = 5.0  # Long pause duration (seconds)
    PRESSURE_VARIANCE_THRESHOLD = 0.3  # High pressure variance
    
    def __init__(self, model_path: Optional[str] = None):
        """Initialize the sensor stress detector"""
        self.user_baselines: Dict[str, Dict] = {}
        
        if model_path:
            self.load_model(model_path)
    
    def _get_or_create_baseline(self, user_id: str) -> Dict:
        """Get or create user baseline"""
        if user_id not in self.user_baselines:
            self.user_baselines[user_id] = {
                "avg_typing_speed": 5.0,
                "avg_inter_key": 0.15,
                "avg_pressure": 0.5,
                "accel_baseline_std": 0.2,
                "samples_count": 0,
            }
        return self.user_baselines[user_id]
    
    def analyze_sensors(
        self, 
        user_id: str,
        sensor_data: Dict[str, Any]
    ) -> Tuple[float, bool, Dict[str, Any]]:
        """
        Analyze sensor data for signs of stress/coercion.
        
        Args:
            user_id: User identifier
            sensor_data: Dictionary containing sensor readings
            
        Returns:
            Tuple of (stress_probability, coercion_detected, details)
        """
        baseline = self._get_or_create_baseline(user_id)
        
        # Analyze each component
        tremor_score = self._analyze_accelerometer(sensor_data, baseline)
        typing_score = self._analyze_typing(sensor_data, baseline)
        touch_score = self._analyze_touch(sensor_data, baseline)
        
        # Combine scores with weights
        weights = {
            "tremor": 0.35,
            "typing": 0.40,
            "touch": 0.25,
        }
        
        stress_probability = (
            tremor_score * weights["tremor"] +
            typing_score * weights["typing"] +
            touch_score * weights["touch"]
        )
        
        # Coercion detection threshold
        coercion_detected = stress_probability > 0.7
        
        details = {
            "tremor_score": tremor_score,
            "typing_score": typing_score,
            "touch_score": touch_score,
            "component_analysis": {
                "tremor_detected": tremor_score > 0.6,
                "typing_anomaly": typing_score > 0.5,
                "touch_anomaly": touch_score > 0.5,
            },
            "recommendations": self._generate_recommendations(
                tremor_score, typing_score, touch_score
            ),
        }
        
        return stress_probability, coercion_detected, details
    
    def _analyze_accelerometer(
        self, 
        sensor_data: Dict[str, Any],
        baseline: Dict
    ) -> float:
        """Analyze accelerometer for tremors"""
        accel = sensor_data.get("accelerometer", {})
        
        if not accel:
            return 0.3  # Default mild score if no data
        
        # Get standard deviations
        x_std = accel.get("x_std", 0.2)
        y_std = accel.get("y_std", 0.2)
        z_std = accel.get("z_std", 0.2)
        
        # Calculate magnitude std
        magnitude_std = np.sqrt(x_std**2 + y_std**2 + z_std**2)
        
        # Compare to baseline
        baseline_std = baseline["accel_baseline_std"]
        deviation_ratio = magnitude_std / max(baseline_std, 0.1)
        
        # Score based on deviation
        if deviation_ratio > 3:
            return 0.9
        elif deviation_ratio > 2:
            return 0.7
        elif deviation_ratio > 1.5:
            return 0.5
        elif deviation_ratio > 1.2:
            return 0.3
        else:
            return 0.1
    
    def _analyze_typing(
        self, 
        sensor_data: Dict[str, Any],
        baseline: Dict
    ) -> float:
        """Analyze typing patterns for stress indicators"""
        typing = sensor_data.get("typing", {})
        
        if not typing:
            return 0.3
        
        score = 0.1
        
        # Check typing speed
        speed = typing.get("speed_cps", baseline["avg_typing_speed"])
        baseline_speed = baseline["avg_typing_speed"]
        
        speed_deviation = abs(speed - baseline_speed) / max(baseline_speed, 1)
        if speed_deviation > 0.5:
            score += 0.3
        elif speed_deviation > 0.3:
            score += 0.15
        
        # Very slow typing might indicate hesitation/fear
        if speed < self.TYPING_SPEED_MIN:
            score += 0.2
        
        # Check correction rate (backspaces)
        backspace_ratio = typing.get("backspace_ratio", 0.1)
        if backspace_ratio > self.BACKSPACE_RATIO_THRESHOLD:
            score += 0.25
        elif backspace_ratio > 0.2:
            score += 0.1
        
        # Check for unusual pauses
        pause_count = typing.get("pause_count", 0)
        if pause_count > 3:
            score += 0.2
        elif pause_count > 1:
            score += 0.1
        
        # Inter-key interval variance
        inter_key_std = typing.get("inter_key_std", 0.1)
        if inter_key_std > 0.3:
            score += 0.15
        
        return min(score, 1.0)
    
    def _analyze_touch(
        self, 
        sensor_data: Dict[str, Any],
        baseline: Dict
    ) -> float:
        """Analyze touch patterns for stress indicators"""
        touch = sensor_data.get("touch", {})
        
        if not touch:
            return 0.3
        
        score = 0.1
        
        # Check pressure variance (high variance = shaky/uncertain)
        pressure_std = touch.get("pressure_std", 0.1)
        if pressure_std > self.PRESSURE_VARIANCE_THRESHOLD:
            score += 0.4
        elif pressure_std > 0.2:
            score += 0.2
        
        # Check pressure deviation from baseline
        pressure_mean = touch.get("pressure_mean", 0.5)
        baseline_pressure = baseline["avg_pressure"]
        
        pressure_deviation = abs(pressure_mean - baseline_pressure)
        if pressure_deviation > 0.3:
            score += 0.25
        elif pressure_deviation > 0.15:
            score += 0.1
        
        # Touch area variance (scattered touches)
        area_variance = touch.get("touch_area_variance", 0.1)
        if area_variance > 0.4:
            score += 0.2
        
        return min(score, 1.0)
    
    def _generate_recommendations(
        self,
        tremor: float,
        typing: float,
        touch: float
    ) -> List[str]:
        """Generate recommendations based on analysis"""
        recommendations = []
        
        if tremor > 0.6:
            recommendations.append(
                "Device movement patterns suggest possible distress. "
                "Consider taking a moment before proceeding."
            )
        
        if typing > 0.5:
            recommendations.append(
                "Typing patterns indicate possible hesitation or uncertainty. "
                "Ensure you're comfortable with this transaction."
            )
        
        if touch > 0.5:
            recommendations.append(
                "Touch patterns are unusual. "
                "If you're feeling pressured, you can cancel anytime."
            )
        
        if tremor > 0.7 or typing > 0.7 or touch > 0.7:
            recommendations.append(
                "If you're being forced to make this payment, "
                "tap the screen three times for help."
            )
        
        return recommendations
    
    def update_baseline(self, user_id: str, sensor_data: Dict[str, Any]):
        """Update user baseline with new normal data"""
        baseline = self._get_or_create_baseline(user_id)
        n = baseline["samples_count"]
        
        # Update typing baseline
        typing = sensor_data.get("typing", {})
        if typing:
            speed = typing.get("speed_cps", baseline["avg_typing_speed"])
            baseline["avg_typing_speed"] = (
                (baseline["avg_typing_speed"] * n + speed) / (n + 1)
            )
            
            inter_key = typing.get("inter_key_mean", baseline["avg_inter_key"])
            baseline["avg_inter_key"] = (
                (baseline["avg_inter_key"] * n + inter_key) / (n + 1)
            )
        
        # Update touch baseline
        touch = sensor_data.get("touch", {})
        if touch:
            pressure = touch.get("pressure_mean", baseline["avg_pressure"])
            baseline["avg_pressure"] = (
                (baseline["avg_pressure"] * n + pressure) / (n + 1)
            )
        
        # Update accelerometer baseline
        accel = sensor_data.get("accelerometer", {})
        if accel:
            mag_std = np.sqrt(
                accel.get("x_std", 0.2)**2 +
                accel.get("y_std", 0.2)**2 +
                accel.get("z_std", 0.2)**2
            )
            baseline["accel_baseline_std"] = (
                (baseline["accel_baseline_std"] * n + mag_std) / (n + 1)
            )
        
        baseline["samples_count"] = n + 1
    
    def save_model(self, path: str):
        """Save baselines to disk"""
        import joblib
        joblib.dump({"user_baselines": self.user_baselines}, path)
    
    def load_model(self, path: str):
        """Load baselines from disk"""
        import joblib
        import os
        
        if os.path.exists(path):
            data = joblib.load(path)
            self.user_baselines = data["user_baselines"]
