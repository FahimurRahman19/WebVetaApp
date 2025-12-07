import multer from "multer";
import path from "path";

// Configure multer to store files in memory (for Cloudinary upload)
const storage = multer.memoryStorage();

// File filter function to accept only images, videos, and audio
const fileFilter = (req, file, cb) => {
  // Allowed file types
  const allowedImageTypes = /jpeg|jpg|png|gif|webp/;
  const allowedVideoTypes = /mp4|webm|ogg|mov|quicktime/;
  const allowedAudioTypes = /mp3|wav|ogg|m4a|aac|webm/; // webm for MediaRecorder audio

  const extname = allowedImageTypes.test(path.extname(file.originalname).toLowerCase()) ||
                  allowedVideoTypes.test(path.extname(file.originalname).toLowerCase()) ||
                  allowedAudioTypes.test(path.extname(file.originalname).toLowerCase());

  const mimetype = file.mimetype.startsWith("image/") ||
                  file.mimetype.startsWith("video/") ||
                  file.mimetype.startsWith("audio/") ||
                  file.mimetype === "audio/webm"; // MediaRecorder creates audio/webm

  if (mimetype || extname) {
    return cb(null, true);
  } else {
    cb(new Error(`Invalid file type: ${file.mimetype}. Only images, videos, and audio files are allowed.`));
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: fileFilter,
});

// Create the fields upload middleware
const uploadFields = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "video", maxCount: 1 },
  { name: "audio", maxCount: 1 },
]);

// Middleware for message media uploads (image, video, audio) with error handling
export const uploadMessageMedia = (req, res, next) => {
  uploadFields(req, res, (err) => {
    if (err) {
      console.error("Multer error:", err);
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ message: "File size too large. Maximum size is 50MB." });
        }
        return res.status(400).json({ message: "File upload error: " + err.message });
      }
      return res.status(400).json({ message: err.message || "File upload failed" });
    }
    next();
  });
};

// Middleware for profile picture upload (single image)
export const uploadProfilePic = upload.single("profilePic");

