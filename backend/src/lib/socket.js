import { Server } from "socket.io";
import http from "http";
import express from "express";
import { ENV } from "./env.js";
import { socketAuthMiddleware } from "../middleware/socket.auth.middleware.js";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ENV.CLIENT_URL || "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"], // Support both transports
});

// apply authentication middleware to all socket connections
io.use(socketAuthMiddleware);

// this is for storing online users - use string IDs for consistency
const userSocketMap = {}; // {userId: socketId}
const typingUsers = {}; // {userId: {typingTo: receiverId, timestamp: Date}}

// we will use this function to check if the user is online or not
export function getReceiverSocketId(userId) {
  // Convert to string to ensure consistent lookup
  const userIdStr = userId?.toString();
  return userSocketMap[userIdStr];
}

// Export userSocketMap for debugging
export function getOnlineUsers() {
  return Object.keys(userSocketMap);
}

export function getUserSocketMap() {
  return { ...userSocketMap };
}

// Clean up typing indicators periodically (global interval, runs once)
let typingCleanupInterval = null;
if (!typingCleanupInterval) {
  typingCleanupInterval = setInterval(() => {
    const now = new Date();
    for (const [uid, typingData] of Object.entries(typingUsers)) {
      if (now - typingData.timestamp > 3000) {
        // 3 seconds timeout
        delete typingUsers[uid];
        const receiverSocketId = getReceiverSocketId(typingData.typingTo);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit("userStoppedTyping", {
            userId: uid,
          });
        }
      }
    }
  }, 1000);
}

io.on("connection", (socket) => {
  const userId = socket.userId; // Already a string from middleware
  const userName = socket.user?.fullName || "Unknown";

  console.log(`✅ Socket connected: ${userName} (${userId}) - Socket ID: ${socket.id}`);

  // Store user socket mapping (always use string)
  userSocketMap[userId] = socket.id;

  // Emit online users to all clients
  io.emit("getOnlineUsers", Object.keys(userSocketMap));
  console.log(`📊 Online users: ${Object.keys(userSocketMap).length}`);

  // Handle typing indicator
  socket.on("typing", ({ receiverId }) => {
    const receiverIdStr = receiverId?.toString();
    typingUsers[userId] = { typingTo: receiverIdStr, timestamp: new Date() };
    
    const receiverSocketId = getReceiverSocketId(receiverIdStr);
    if (receiverSocketId) {
      console.log(`⌨️  Typing: ${userName} -> ${receiverIdStr}`);
      io.to(receiverSocketId).emit("userTyping", {
        userId: userId,
        userName: userName,
      });
    }
  });

  // Handle stop typing
  socket.on("stopTyping", ({ receiverId }) => {
    const receiverIdStr = receiverId?.toString();
    delete typingUsers[userId];
    
    const receiverSocketId = getReceiverSocketId(receiverIdStr);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("userStoppedTyping", {
        userId: userId,
      });
    }
  });

  // Handle disconnect
  socket.on("disconnect", (reason) => {
    console.log(`❌ Socket disconnected: ${userName} (${userId}) - Reason: ${reason}`);
    delete userSocketMap[userId];
    delete typingUsers[userId];
    io.emit("getOnlineUsers", Object.keys(userSocketMap));
    console.log(`📊 Online users: ${Object.keys(userSocketMap).length}`);
  });

  // Handle connection errors
  socket.on("error", (error) => {
    console.error(`❌ Socket error for ${userName} (${userId}):`, error);
  });

  // Test event to verify socket is working
  socket.on("test", (data) => {
    console.log(`🧪 Test event received from ${userName}:`, data);
    socket.emit("testResponse", { message: "Test successful", userId });
  });
});

export { io, app, server };
