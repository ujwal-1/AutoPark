"""
AutoPark - YOLOv11 Model Fine-Tuning & Dataset Preparation Script
------------------------------------------------------------------
This script automates the creation of a YOLOv11 dataset and trains a custom
YOLOv11 Nano model (`yolo11n.pt`) on ~8 photos of the green remote-controlled car.

Requirements:
    pip install ultralytics opencv-python pillow

Usage:
    python backend/app/train_yolov11.py --dataset_dir ./green_car_dataset --epochs 30
"""

import os
import sys
import shutil
import argparse
import logging
import cv2
import numpy as np

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("AutoPark.YOLOv11Train")

def create_yolov11_dataset_structure(base_dir: str):
    """
    Creates standard YOLO directory structure:
    base_dir/
      ├── data.yaml
      ├── images/
      │   ├── train/
      │   └── val/
      └── labels/
          ├── train/
          └── val/
    """
    dirs = [
        os.path.join(base_dir, "images", "train"),
        os.path.join(base_dir, "images", "val"),
        os.path.join(base_dir, "labels", "train"),
        os.path.join(base_dir, "labels", "val"),
    ]
    for d in dirs:
        os.makedirs(d, exist_ok=True)

    yaml_content = f"""path: {os.path.abspath(base_dir)}
train: images/train
val: images/val

names:
  0: green_rc_car
"""
    yaml_path = os.path.join(base_dir, "data.yaml")
    with open(yaml_path, "w") as f:
        f.write(yaml_content)

    logger.info(f"YOLOv11 dataset structure initialized at {base_dir}")
    return yaml_path

def auto_annotate_green_car(image_path: str, label_path: str):
    """
    Auto-annotates green RC car photos by detecting HSV green boundaries
    and writing normalized YOLO bounding boxes (class_id x_center y_center width height).
    """
    img = cv2.imread(image_path)
    if img is None:
        logger.warning(f"Could not read image: {image_path}")
        return False

    h, w, _ = img.shape
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

    # Green RC Car HSV color bounds
    lower_green = np.array([35, 50, 50])
    upper_green = np.array([85, 255, 255])
    mask = cv2.inRange(hsv, lower_green, upper_green)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        # Fallback to center box if no distinct green region found
        box_w, box_h = 0.4, 0.4
        x_center, y_center = 0.5, 0.5
    else:
        best_cnt = max(contours, key=cv2.contourArea)
        bx, by, bw, bh = cv2.boundingRect(best_cnt)
        x_center = (bx + bw / 2.0) / w
        y_center = (by + bh / 2.0) / h
        box_w = bw / w
        box_h = bh / h

    # YOLO label format: <class_id> <x_center> <y_center> <width> <height>
    with open(label_path, "w") as f:
        f.write(f"0 {x_center:.6f} {y_center:.6f} {box_w:.6f} {box_h:.6f}\n")

    logger.info(f"Auto-annotated: {os.path.basename(image_path)} -> bbox [{x_center:.2f}, {y_center:.2f}, {box_w:.2f}, {box_h:.2f}]")
    return True

def generate_sample_synthetic_photos(dataset_dir: str, num_photos: int = 8):
    """
    Generates sample green RC car training images if the user hasn't provided photos yet,
    allowing zero-setup training testing.
    """
    logger.info(f"Generating {num_photos} synthetic training photos of green RC car...")
    train_img_dir = os.path.join(dataset_dir, "images", "train")
    val_img_dir = os.path.join(dataset_dir, "images", "val")
    train_lbl_dir = os.path.join(dataset_dir, "labels", "train")
    val_lbl_dir = os.path.join(dataset_dir, "labels", "val")

    np.random.seed(42)

    for i in range(num_photos):
        # Create synthetic 640x480 background frame
        bg = np.random.randint(180, 220, (480, 640, 3), dtype=np.uint8)
        
        # Draw a synthetic green RC car at random position
        cx = np.random.randint(150, 490)
        cy = np.random.randint(150, 330)
        car_w = np.random.randint(80, 140)
        car_h = np.random.randint(60, 100)

        x1 = max(0, cx - car_w // 2)
        y1 = max(0, cy - car_h // 2)
        x2 = min(640, cx + car_w // 2)
        y2 = min(480, cy + car_h // 2)

        # Draw green car body (HSV Green)
        cv2.rectangle(bg, (x1, y1), (x2, y2), (20, 200, 30), -1)
        # Draw wheels (dark grey)
        cv2.circle(bg, (x1, y1), 12, (50, 50, 50), -1)
        cv2.circle(bg, (x2, y1), 12, (50, 50, 50), -1)
        cv2.circle(bg, (x1, y2), 12, (50, 50, 50), -1)
        cv2.circle(bg, (x2, y2), 12, (50, 50, 50), -1)

        is_val = (i >= num_photos - 2) # last 2 images for validation set
        target_img_dir = val_img_dir if is_val else train_img_dir
        target_lbl_dir = val_lbl_dir if is_val else train_lbl_dir

        filename = f"green_rc_car_{i+1:02d}.jpg"
        img_path = os.path.join(target_img_dir, filename)
        lbl_path = os.path.join(target_lbl_dir, filename.replace(".jpg", ".txt"))

        cv2.imwrite(img_path, bg)
        auto_annotate_green_car(img_path, lbl_path)

def train_yolov11_model(data_yaml_path: str, epochs: int = 30, output_weights_dir: str = "backend/models"):
    """
    Trains YOLOv11 Nano (`yolo11n.pt`) on the configured green RC car dataset using Ultralytics.
    """
    try:
        from ultralytics import YOLO
    except ImportError:
        logger.error("Ultralytics library is not installed! Run: pip install ultralytics")
        sys.exit(1)

    logger.info("Loading pretrained YOLOv11 Nano model (`yolo11n.pt`)...")
    model = YOLO("yolo11n.pt") # Automatic download of YOLOv11 pretrained weights

    logger.info(f"Starting YOLOv11 training for {epochs} epochs...")
    results = model.train(
        data=data_yaml_path,
        epochs=epochs,
        imgsz=640,
        batch=4,
        name="green_rc_car_yolo11",
        project="runs/detect",
        verbose=True
    )

    best_weights_path = os.path.join("runs", "detect", "green_rc_car_yolo11", "weights", "best.pt")
    
    os.makedirs(output_weights_dir, exist_ok=True)
    target_weights_path = os.path.join(output_weights_dir, "green_car_yolo11.pt")

    if os.path.exists(best_weights_path):
        shutil.copy(best_weights_path, target_weights_path)
        logger.info(f"✅ YOLOv11 model successfully trained and saved to: {target_weights_path}")
    else:
        # Export model file
        model.export(format="engine") if hasattr(model, "export") else None
        logger.info(f"Training complete. Weights logged in runs/detect/green_rc_car_yolo11")

    return target_weights_path

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AutoPark YOLOv11 Fine-Tuning Script")
    parser.add_argument("--dataset_dir", type=str, default="backend/dataset/green_rc_car", help="Dataset output path")
    parser.add_argument("--epochs", type=int, default=30, help="Number of training epochs")
    parser.add_argument("--user_images_dir", type=str, default="", help="Directory containing user photos of green RC car")
    args = parser.parse_args()

    yaml_path = create_yolov11_dataset_structure(args.dataset_dir)

    if args.user_images_dir and os.path.exists(args.user_images_dir):
        logger.info(f"Importing user images from: {args.user_images_dir}")
        img_files = [f for f in os.listdir(args.user_images_dir) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
        for idx, fname in enumerate(img_files):
            src_path = os.path.join(args.user_images_dir, fname)
            is_val = (idx >= len(img_files) - 2)
            sub_folder = "val" if is_val else "train"
            dst_img = os.path.join(args.dataset_dir, "images", sub_folder, f"green_car_{idx+1:02d}.jpg")
            dst_lbl = os.path.join(args.dataset_dir, "labels", sub_folder, f"green_car_{idx+1:02d}.txt")
            shutil.copy(src_path, dst_img)
            auto_annotate_green_car(dst_img, dst_lbl)
    else:
        generate_sample_synthetic_photos(args.dataset_dir, num_photos=8)

    train_yolov11_model(yaml_path, epochs=args.epochs)
