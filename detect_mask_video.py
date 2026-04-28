# import the necessary packages
import tensorflow as tf
preprocess_input = tf.keras.applications.mobilenet_v2.preprocess_input
img_to_array = tf.keras.preprocessing.image.img_to_array
load_model = tf.keras.models.load_model
from imutils.video import VideoStream
import numpy as np
import imutils
import time
import cv2
import os
import winsound  # 🔊 Sound alert

# create violations folder
if not os.path.exists("violations"):
    os.makedirs("violations")

# cooldown timer
last_alert_time = 0

def detect_and_predict_mask(frame, faceNet, maskNet):
	# grab frame dimensions
	(h, w) = frame.shape[:2]

	# construct blob
	blob = cv2.dnn.blobFromImage(frame, 1.0, (224, 224),
		(104.0, 177.0, 123.0))

	# detect faces
	faceNet.setInput(blob)
	detections = faceNet.forward()

	# initialize lists
	faces = []
	locs = []
	preds = []

	# loop detections
	for i in range(0, detections.shape[2]):
		confidence = detections[0, 0, i, 2]

		if confidence > 0.5:
			box = detections[0, 0, i, 3:7] * np.array([w, h, w, h])
			(startX, startY, endX, endY) = box.astype("int")

			(startX, startY) = (max(0, startX), max(0, startY))
			(endX, endY) = (min(w - 1, endX), min(h - 1, endY))

			face = frame[startY:endY, startX:endX]
			face = cv2.cvtColor(face, cv2.COLOR_BGR2RGB)
			face = cv2.resize(face, (224, 224))
			face = img_to_array(face)
			face = preprocess_input(face)

			faces.append(face)
			locs.append((startX, startY, endX, endY))

	# predictions
	if len(faces) > 0:
		faces = np.array(faces, dtype="float32")
		preds = maskNet.predict(faces, batch_size=32, verbose=0)
	return (locs, preds)


# load face detector
prototxtPath = r"face_detector\deploy.prototxt"
weightsPath = r"face_detector\res10_300x300_ssd_iter_140000.caffemodel"
faceNet = cv2.dnn.readNet(prototxtPath, weightsPath)

# load mask model
maskNet = load_model("mask_detector.model")

# start video stream
print("[INFO] starting video stream...")
vs = VideoStream(src=0).start()
time.sleep(2.0)

# loop frames
while True:
	frame = vs.read()
	frame = imutils.resize(frame, width=400)

	(locs, preds) = detect_and_predict_mask(frame, faceNet, maskNet)

	# loop detections (MULTI-FACE supported)
	for (box, pred) in zip(locs, preds):
		(startX, startY, endX, endY) = box
		(mask, withoutMask) = pred

		# label logic
		label = "Mask" if mask > withoutMask else "No Mask"
		color = (0, 255, 0) if label == "Mask" else (0, 0, 255)

		# confidence text
		label_text = "{}: {:.2f}%".format(label, max(mask, withoutMask) * 100)

		# 🚨 ALERT SYSTEM + COOLDOWN + SOUND + SCREENSHOT
		if label == "No Mask":
			current_time = time.time()

			if current_time - last_alert_time > 3:
				print("[ALERT] No Mask Detected!")

				# 🔊 sound
				winsound.Beep(1000, 500)

				# 📸 save image
				filename = f"violations/{int(time.time())}.jpg"
				cv2.imwrite(filename, frame)

				last_alert_time = current_time

		# draw label + box
		cv2.putText(frame, label_text, (startX, startY - 10),
			cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 2)
		cv2.rectangle(frame, (startX, startY), (endX, endY), color, 2)

	# show frame
	cv2.imshow("Frame", frame)
	key = cv2.waitKey(1) & 0xFF

	if key == ord("q"):
		break

# cleanup
cv2.destroyAllWindows()
vs.stop()