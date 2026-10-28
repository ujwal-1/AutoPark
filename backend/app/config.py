import os
from pydantic_settings import BaseSettings

_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_DEFAULT_DB_PATH = os.path.normpath(os.path.join(_BASE_DIR, "autopark.db")).replace(os.sep, "/")

class Settings(BaseSettings):
    PROJECT_NAME: str = "AutoPark Smart Parking System"
    DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite:///{_DEFAULT_DB_PATH}")
    
    # Parking configuration (6 slots)
    SLOTS: list[str] = ["A1", "A2", "A3", "B1", "B2", "B3"]
    
    # YOLO & Detection configuration
    YOLO_CONFIDENCE_THRESHOLD: float = 0.75
    DETECTION_COOLDOWN_SECONDS: int = 10
    DEMO_VEHICLE_TYPE: str = "Car"
    
    # Hardware/Camera settings
    CAMERA_OFFLINE_TIMEOUT_SECONDS: int = 30
    
    # JWT & Auth
    JWT_SECRET: str = os.getenv("JWT_SECRET", "autopark-super-secure-secret-token-key-2026-production-ready")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours
    
    class Config:
        env_file = ".env"

settings = Settings()

