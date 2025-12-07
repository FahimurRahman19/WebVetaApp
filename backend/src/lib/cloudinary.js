import { v2 as cloudinary } from "cloudinary";
import { ENV } from "./env.js";

// Validate Cloudinary credentials
const cloudName = ENV.CLOUDINARY_CLOUD_NAME;
const apiKey = ENV.CLOUDINARY_API_KEY;
const apiSecret = ENV.CLOUDINARY_API_SECRET;

if (!cloudName || !apiKey || !apiSecret) {
  console.warn("⚠️  Cloudinary credentials not configured. Media uploads will fail.");
  console.warn("   Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in your .env file");
} else {
  try {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });
    console.log("✅ Cloudinary configured successfully");
  } catch (error) {
    console.error("❌ Error configuring Cloudinary:", error.message);
  }
}

export default cloudinary;
