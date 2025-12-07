import express from "express";
import {
  getAllContacts,
  getChatPartners,
  getMessagesByUserId,
  sendMessage,
  markMessageAsRead,
  addReaction,
  removeReaction,
  editMessage,
  deleteMessage,
} from "../controllers/message.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { arcjetProtection } from "../middleware/arcjet.middleware.js";
import { uploadMessageMedia } from "../middleware/upload.middleware.js";

const router = express.Router();

// the middlewares execute in order - so requests get rate-limited first, then authenticated.
// this is actually more efficient since unauthenticated requests get blocked by rate limiting before hitting the auth middleware.
router.use(arcjetProtection, protectRoute);

router.get("/contacts", getAllContacts);
router.get("/chats", getChatPartners);
router.get("/:id", getMessagesByUserId);
router.post("/send/:id", uploadMessageMedia, sendMessage);
router.put("/read/:messageId", markMessageAsRead);
router.post("/reaction/:messageId", addReaction);
router.delete("/reaction/:messageId", removeReaction);
router.put("/edit/:messageId", editMessage);
router.delete("/delete/:messageId", deleteMessage);

export default router;
