import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io, getUserSocketMap } from "../lib/socket.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import { Readable } from "stream";
import { ENV } from "../lib/env.js";

// Helper function to upload file buffer to Cloudinary
const uploadToCloudinary = async (file, resourceType = "auto") => {
  return new Promise((resolve, reject) => {
    if (!file || !file.buffer) {
      return reject(new Error("Invalid file: no buffer found"));
    }

    // Check if Cloudinary is configured
    if (!ENV.CLOUDINARY_CLOUD_NAME || !ENV.CLOUDINARY_API_KEY || !ENV.CLOUDINARY_API_SECRET) {
      return reject(new Error("Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in your .env file"));
    }

    const uploadOptions = {
      resource_type: resourceType,
      folder: "chat-app",
      use_filename: true,
      unique_filename: true,
    };

    // Add format-specific options
    if (resourceType === "image") {
      // Don't set format - let Cloudinary auto-detect
      uploadOptions.quality = "auto";
    } else if (resourceType === "video") {
      // For videos, let Cloudinary handle the format
      uploadOptions.resource_type = "video";
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          console.error("Cloudinary upload error:", error);
          // Provide more helpful error messages
          if (error.message && error.message.includes("Invalid cloud_name")) {
            reject(new Error("Invalid Cloudinary cloud name. Please check your CLOUDINARY_CLOUD_NAME in .env file"));
          } else if (error.message && error.message.includes("Invalid API Key")) {
            reject(new Error("Invalid Cloudinary API key. Please check your CLOUDINARY_API_KEY in .env file"));
          } else {
            reject(new Error(`Cloudinary upload failed: ${error.message || "Unknown error"}`));
          }
        } else {
          resolve(result);
        }
      }
    );

    // Handle stream errors
    uploadStream.on("error", (error) => {
      console.error("Upload stream error:", error);
      reject(error);
    });

    Readable.from(file.buffer).pipe(uploadStream);
  });
};

export const getAllContacts = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    // Get all users except logged-in user
    const allUsers = await User.find({ _id: { $ne: loggedInUserId } }).select("-password");
    
    // Filter out chatbot (case-insensitive match on fullName)
    const filteredUsers = allUsers.filter(
      (user) => !user.fullName.toLowerCase().includes("chatbot") && !user.fullName.toLowerCase().includes("chat bot")
    );

    res.status(200).json(filteredUsers);
  } catch (error) {
    console.log("Error in getAllContacts:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getMessagesByUserId = async (req, res) => {
  try {
    const myId = req.user._id;
    const { id: userToChatId } = req.params;

    // Get all messages first, then filter deleted ones
    const allMessages = await Message.find({
      $or: [
        { senderId: myId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: myId },
      ],
    })
      .sort({ createdAt: 1 })
      .populate("senderId", "fullName profilePic")
      .populate("receiverId", "fullName profilePic")
      .populate("replyTo", "text senderId image video audio")
      .populate("reactions.userId", "fullName profilePic")
      .populate("readBy.userId", "fullName profilePic")
      .populate("deliveredTo.userId", "fullName profilePic");

    // Filter out messages deleted for this user
    const messages = allMessages.filter((msg) => {
      const isDeletedForMe = msg.deletedForMe?.some(
        (d) => d.userId?.toString() === myId.toString() || d.userId === myId.toString()
      );
      return !isDeletedForMe;
    });

    // Mark messages as delivered when user views them
    const unreadMessages = messages.filter(
      (msg) =>
        (msg.receiverId._id || msg.receiverId).toString() === myId.toString() &&
        !msg.deliveredTo.some((d) => (d.userId._id || d.userId).toString() === myId.toString())
    );

    if (unreadMessages.length > 0) {
      for (const msg of unreadMessages) {
        msg.deliveredTo.push({ userId: myId });
        await msg.save();

        // Emit delivered event to sender
        const senderId = (msg.senderId._id || msg.senderId).toString();
        const senderSocketId = getReceiverSocketId(senderId);
        if (senderSocketId) {
          io.to(senderSocketId).emit("messageDelivered", {
            messageId: msg._id,
            userId: myId,
          });
        }
      }
    }

    res.status(200).json(messages);
  } catch (error) {
    console.log("Error in getMessages controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { text, replyTo } = req.body; // text and replyTo come from FormData
    const { id: receiverId } = req.params;
    const senderId = req.user._id;
    const files = req.files;

    // Validate that at least one content type is provided
    if (!text?.trim() && !files?.image && !files?.video && !files?.audio) {
      return res.status(400).json({ message: "Text, image, video, or audio is required." });
    }

    if (senderId.equals(receiverId)) {
      return res.status(400).json({ message: "Cannot send messages to yourself." });
    }

    const receiverExists = await User.exists({ _id: receiverId });
    if (!receiverExists) {
      return res.status(404).json({ message: "Receiver not found." });
    }

    let imageUrl, videoUrl, audioUrl;

    // Upload image if present
    if (files?.image && files.image[0]) {
      try {
        console.log("Uploading image:", files.image[0].originalname, "Size:", files.image[0].size);
        const uploadResponse = await uploadToCloudinary(files.image[0], "image");
        imageUrl = uploadResponse.secure_url;
        console.log("Image uploaded successfully:", imageUrl);
      } catch (error) {
        console.error("Error uploading image:", error);
        return res.status(500).json({ 
          message: "Failed to upload image: " + (error.message || "Unknown error") 
        });
      }
    }

    // Upload video if present
    if (files?.video && files.video[0]) {
      try {
        console.log("Uploading video:", files.video[0].originalname, "Size:", files.video[0].size);
        const uploadResponse = await uploadToCloudinary(files.video[0], "video");
        videoUrl = uploadResponse.secure_url;
        console.log("Video uploaded successfully:", videoUrl);
      } catch (error) {
        console.error("Error uploading video:", error);
        return res.status(500).json({ 
          message: "Failed to upload video: " + (error.message || "Unknown error") 
        });
      }
    }

    // Upload audio if present
    if (files?.audio && files.audio[0]) {
      try {
        console.log("Uploading audio:", files.audio[0].originalname, "Size:", files.audio[0].size);
        // Cloudinary uses "video" resource type for audio files
        const uploadResponse = await uploadToCloudinary(files.audio[0], "video");
        audioUrl = uploadResponse.secure_url;
        console.log("Audio uploaded successfully:", audioUrl);
      } catch (error) {
        console.error("Error uploading audio:", error);
        return res.status(500).json({ 
          message: "Failed to upload audio: " + (error.message || "Unknown error") 
        });
      }
    }

    const newMessage = new Message({
      senderId,
      receiverId,
      text: text?.trim() || "",
      image: imageUrl,
      video: videoUrl,
      audio: audioUrl,
      replyTo: replyTo || null,
      deliveredTo: [{ userId: senderId }], // Mark as delivered to sender immediately
    });

    await newMessage.save();

    // Populate sender, receiver, replyTo, and reactions for socket emission
    await newMessage.populate("senderId", "fullName profilePic");
    await newMessage.populate("receiverId", "fullName profilePic");
    if (newMessage.replyTo) {
      await newMessage.populate({
        path: "replyTo",
        select: "text senderId image video audio",
        populate: { path: "senderId", select: "fullName profilePic" }
      });
    }
    await newMessage.populate("reactions.userId", "fullName profilePic");

    // Convert to plain object for socket emission
    const messageToEmit = newMessage.toObject();
    
    // Ensure senderId and receiverId are in the format frontend expects
    // Frontend expects: senderId._id or senderId (string)
    if (messageToEmit.senderId && typeof messageToEmit.senderId === 'object') {
      // Already populated, keep as is
    } else {
      messageToEmit.senderId = { _id: messageToEmit.senderId };
    }
    
    if (messageToEmit.receiverId && typeof messageToEmit.receiverId === 'object') {
      // Already populated, keep as is
    } else {
      messageToEmit.receiverId = { _id: messageToEmit.receiverId };
    }

    // Emit to receiver only (not to sender to prevent duplicates)
    const receiverIdStr = receiverId.toString();
    const receiverSocketId = getReceiverSocketId(receiverIdStr);
    
    const socketMap = getUserSocketMap();
    console.log(`🔍 Looking up receiver: ${receiverIdStr}`);
    console.log(`📋 Current online users:`, Object.keys(socketMap));
    console.log(`📋 Socket map:`, socketMap);
    
    if (receiverSocketId) {
      console.log(`📤 Emitting message to receiver: ${receiverIdStr} (Socket: ${receiverSocketId})`);
      console.log(`📦 Message data:`, {
        _id: messageToEmit._id,
        senderId: messageToEmit.senderId?._id || messageToEmit.senderId,
        receiverId: messageToEmit.receiverId?._id || messageToEmit.receiverId,
        text: messageToEmit.text,
        hasImage: !!messageToEmit.image,
        hasVideo: !!messageToEmit.video,
        hasAudio: !!messageToEmit.audio,
      });
      
      // Emit to the specific socket
      io.to(receiverSocketId).emit("newMessage", messageToEmit);
      
      // Also emit to all sockets as a fallback (for debugging)
      // Remove this in production if not needed
      console.log(`✅ Message emitted successfully to socket: ${receiverSocketId}`);
    } else {
      console.log(`⚠️  Receiver ${receiverIdStr} is not online - message saved but not delivered in real-time`);
      console.log(`📋 Available user IDs in socket map:`, Object.keys(socketMap));
      console.log(`💡 Tip: Make sure the receiver is logged in and socket is connected`);
    }

    // Don't emit to sender - they already have the message from the API response
    // This prevents duplicate messages

    res.status(201).json(newMessage);
  } catch (error) {
    console.log("Error in sendMessage controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const markMessageAsRead = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    // Check if already read
    const alreadyRead = message.readBy.some((r) => r.userId.toString() === userId.toString());
    if (!alreadyRead) {
      message.readBy.push({ userId });
      await message.save();

      // Emit read receipt to sender
      const senderSocketId = getReceiverSocketId(message.senderId.toString());
      if (senderSocketId) {
        io.to(senderSocketId).emit("messageRead", {
          messageId: message._id,
          userId: userId,
        });
      }
    }

    res.status(200).json({ message: "Message marked as read" });
  } catch (error) {
    console.log("Error in markMessageAsRead: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const addReaction = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user._id;

    if (!emoji) {
      return res.status(400).json({ message: "Emoji is required" });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    // Remove existing reaction from this user
    message.reactions = message.reactions.filter(
      (r) => r.userId.toString() !== userId.toString()
    );

    // Add new reaction
    message.reactions.push({ userId, emoji });
    await message.save();

    await message.populate("reactions.userId", "fullName profilePic");

    // Emit reaction update to both users
    const receiverSocketId = getReceiverSocketId(message.receiverId.toString());
    const senderSocketId = getReceiverSocketId(message.senderId.toString());

    if (receiverSocketId) {
      io.to(receiverSocketId).emit("reactionAdded", message);
    }
    if (senderSocketId) {
      io.to(senderSocketId).emit("reactionAdded", message);
    }

    res.status(200).json(message);
  } catch (error) {
    console.log("Error in addReaction: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const removeReaction = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    message.reactions = message.reactions.filter(
      (r) => r.userId.toString() !== userId.toString()
    );
    await message.save();

    await message.populate("reactions.userId", "fullName profilePic");

    // Emit reaction update to both users
    const receiverSocketId = getReceiverSocketId(message.receiverId.toString());
    const senderSocketId = getReceiverSocketId(message.senderId.toString());

    if (receiverSocketId) {
      io.to(receiverSocketId).emit("reactionRemoved", message);
    }
    if (senderSocketId) {
      io.to(senderSocketId).emit("reactionRemoved", message);
    }

    res.status(200).json(message);
  } catch (error) {
    console.log("Error in removeReaction: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { text } = req.body;
    const userId = req.user._id;

    if (!text || !text.trim()) {
      return res.status(400).json({ message: "Message text is required" });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    // Only sender can edit their message
    if (message.senderId.toString() !== userId.toString()) {
      return res.status(403).json({ message: "You can only edit your own messages" });
    }
//commit
    // Can't edit if deleted for everyone
    if (message.deletedForEveryone) {
      return res.status(400).json({ message: "Cannot edit a deleted message" });
    }

    // Update message
    message.text = text.trim();
    message.edited = true;
    message.editedAt = new Date();
    await message.save();

    // Populate for socket emission
    await message.populate("senderId", "fullName profilePic");
    await message.populate("receiverId", "fullName profilePic");
    await message.populate("replyTo", "text senderId");
    await message.populate("reactions.userId", "fullName profilePic");

    const messageToEmit = message.toObject();

    // Emit to both sender and receiver
    const receiverSocketId = getReceiverSocketId(message.receiverId.toString());
    const senderSocketId = getReceiverSocketId(message.senderId.toString());

    if (receiverSocketId) {
      io.to(receiverSocketId).emit("messageEdited", messageToEmit);
    }
    if (senderSocketId) {
      io.to(senderSocketId).emit("messageEdited", messageToEmit);
    }

    res.status(200).json(message);
  } catch (error) {
    console.log("Error in editMessage: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { deleteForEveryone } = req.body; // true or false
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    const isSender = message.senderId.toString() === userId.toString();

    if (deleteForEveryone) {
      // Only sender can delete for everyone
      if (!isSender) {
        return res.status(403).json({ message: "Only the sender can delete for everyone" });
      }

      message.deletedForEveryone = true;
      message.text = "";
      message.image = "";
      message.video = "";
      message.audio = "";
      await message.save();

      // Populate for socket emission
      await message.populate("senderId", "fullName profilePic");
      await message.populate("receiverId", "fullName profilePic");

      const messageToEmit = message.toObject();

      // Emit to both users
      const receiverSocketId = getReceiverSocketId(message.receiverId.toString());
      const senderSocketId = getReceiverSocketId(message.senderId.toString());

      if (receiverSocketId) {
        io.to(receiverSocketId).emit("messageDeleted", messageToEmit);
      }
      if (senderSocketId) {
        io.to(senderSocketId).emit("messageDeleted", messageToEmit);
      }
    } else {
      // Delete for me - add user to deletedForMe array
      const alreadyDeleted = message.deletedForMe.some(
        (d) => d.userId.toString() === userId.toString()
      );

      if (!alreadyDeleted) {
        message.deletedForMe.push({ userId });
        await message.save();
      }

      // Populate for socket emission
      await message.populate("senderId", "fullName profilePic");
      await message.populate("receiverId", "fullName profilePic");

      const messageToEmit = message.toObject();

      // Emit only to the user who deleted it
      const userSocketId = getReceiverSocketId(userId.toString());
      if (userSocketId) {
        io.to(userSocketId).emit("messageDeletedForMe", messageToEmit);
      }
    }

    res.status(200).json(message);
  } catch (error) {
    console.log("Error in deleteMessage: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getChatPartners = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;

    // find all the messages where the logged-in user is either sender or receiver
    const messages = await Message.find({
      $or: [{ senderId: loggedInUserId }, { receiverId: loggedInUserId }],
    });

    const chatPartnerIds = [
      ...new Set(
        messages.map((msg) =>
          msg.senderId.toString() === loggedInUserId.toString()
            ? msg.receiverId.toString()
            : msg.senderId.toString()
        )
      ),
    ];

    const allChatPartners = await User.find({ _id: { $in: chatPartnerIds } }).select("-password");
    
    // Filter out chatbot from chat list (case-insensitive match on fullName)
    const chatPartners = allChatPartners.filter(
      (user) => !user.fullName.toLowerCase().includes("chatbot") && !user.fullName.toLowerCase().includes("chat bot")
    );

    res.status(200).json(chatPartners);
  } catch (error) {
    console.error("Error in getChatPartners: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
