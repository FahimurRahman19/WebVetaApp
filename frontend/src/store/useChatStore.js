import { create } from "zustand";
import { axiosInstance } from "../lib/axios";
import toast from "react-hot-toast";
import { useAuthStore } from "./useAuthStore";

export const useChatStore = create((set, get) => ({
  allContacts: [],
  chats: [],
  messages: [],
  activeTab: "chats",
  selectedUser: null,
  isUsersLoading: false,
  isMessagesLoading: false,
  isSoundEnabled: JSON.parse(localStorage.getItem("isSoundEnabled")) === true,
  typingUsers: [], // Array of user IDs who are typing
  isTyping: false, // Whether current user is typing
  pendingMessages: new Set(), // Track pending message IDs to prevent duplicates

  toggleSound: () => {
    localStorage.setItem("isSoundEnabled", !get().isSoundEnabled);
    set({ isSoundEnabled: !get().isSoundEnabled });
  },

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedUser: (selectedUser) => {
    set({ selectedUser, messages: [], pendingMessages: new Set() }); // Clear messages when switching users
    // Mark messages as read when selecting a user
    if (selectedUser) {
      const { messages } = get();
      const { authUser: currentUser } = useAuthStore.getState();
      const unreadMessages = messages.filter(
        (msg) => {
          const senderId = msg.senderId?._id || msg.senderId;
          return (
            senderId === selectedUser._id &&
            !msg.readBy?.some((r) => {
              const readUserId = r.userId?._id || r.userId;
              return readUserId === currentUser._id;
            })
          );
        }
      );

      // Mark each unread message as read
      unreadMessages.forEach((msg) => {
        axiosInstance.put(`/messages/read/${msg._id}`).catch(console.error);
      });
    }
  },

  getAllContacts: async () => {
    set({ isUsersLoading: true });
    try {
      const res = await axiosInstance.get("/messages/contacts");
      set({ allContacts: res.data });
    } catch (error) {
      toast.error(error.response?.data?.message || "Something went wrong");
    } finally {
      set({ isUsersLoading: false });
    }
  },

  getMyChatPartners: async () => {
    set({ isUsersLoading: true });
    try {
      const res = await axiosInstance.get("/messages/chats");
      set({ chats: res.data });
    } catch (error) {
      toast.error(error.response?.data?.message || "Something went wrong");
    } finally {
      set({ isUsersLoading: false });
    }
  },

  getMessagesByUserId: async (userId) => {
    set({ isMessagesLoading: true });
    try {
      const res = await axiosInstance.get(`/messages/${userId}`);
      set({ messages: res.data, pendingMessages: new Set() }); // Reset pending messages
    } catch (error) {
      toast.error(error.response?.data?.message || "Something went wrong");
    } finally {
      set({ isMessagesLoading: false });
    }
  },

  sendMessage: async (formData) => {
    const { selectedUser, messages, pendingMessages, replyTo } = get();
    const { authUser } = useAuthStore.getState();

    if (!selectedUser) {
      toast.error("Please select a user to chat with");
      return;
    }

    // Add replyTo to FormData if present
    if (replyTo) {
      formData.append("replyTo", replyTo._id);
    }

    const tempId = `temp-${Date.now()}-${Math.random()}`;

    // Create optimistic message preview
    const text = formData.get("text") || "";
    const imageFile = formData.get("image");
    const videoFile = formData.get("video");
    const audioFile = formData.get("audio");

    let imagePreview = null;
    let videoPreview = null;
    let audioPreview = null;

    if (imageFile) {
      imagePreview = URL.createObjectURL(imageFile);
    }
    if (videoFile) {
      videoPreview = URL.createObjectURL(videoFile);
    }
    if (audioFile) {
      audioPreview = URL.createObjectURL(audioFile);
    }

    const optimisticMessage = {
      _id: tempId,
      senderId: { _id: authUser._id, fullName: authUser.fullName, profilePic: authUser.profilePic },
      receiverId: { _id: selectedUser._id, fullName: selectedUser.fullName, profilePic: selectedUser.profilePic },
      text: text,
      image: imagePreview,
      video: videoPreview,
      audio: audioPreview,
      replyTo: replyTo || null,
      reactions: [],
      readBy: [],
      deliveredTo: [],
      createdAt: new Date().toISOString(),
      isOptimistic: true,
    };

    // Clear replyTo after adding to formData
    if (replyTo) {
      get().clearReplyTo();
    }

    // Immediately update the UI with optimistic message
    set({ messages: [...messages, optimisticMessage] });

    try {
      const res = await axiosInstance.post(`/messages/send/${selectedUser._id}`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      const realMessage = res.data;
      
      // Mark this message as pending to prevent socket duplicates
      const newPending = new Set(pendingMessages);
      newPending.add(realMessage._id);
      set({ pendingMessages: newPending });

      // Replace optimistic message with real message
      const currentMessages = get().messages;
      const updatedMessages = currentMessages.map((msg) =>
        msg._id === tempId ? realMessage : msg
      );
      set({ messages: updatedMessages });

      // Clean up object URLs
      if (imagePreview) URL.revokeObjectURL(imagePreview);
      if (videoPreview) URL.revokeObjectURL(videoPreview);
      if (audioPreview) URL.revokeObjectURL(audioPreview);

      // Remove from pending after a delay (socket might still emit)
      setTimeout(() => {
        const { pendingMessages: currentPending } = get();
        const updatedPending = new Set(currentPending);
        updatedPending.delete(realMessage._id);
        set({ pendingMessages: updatedPending });
      }, 2000);
    } catch (error) {
      console.error("Send message error:", error);
      
      // Remove optimistic message on failure
      const currentMessages = get().messages;
      set({ messages: currentMessages.filter((msg) => msg._id !== tempId) });

      // Clean up object URLs
      if (imagePreview) URL.revokeObjectURL(imagePreview);
      if (videoPreview) URL.revokeObjectURL(videoPreview);
      if (audioPreview) URL.revokeObjectURL(audioPreview);

      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        "Failed to send message. Please try again.";
      toast.error(errorMessage);
    }
  },

  handleTyping: (receiverId) => {
    const socket = useAuthStore.getState().socket;
    if (socket && socket.connected && !get().isTyping) {
      set({ isTyping: true });
      socket.emit("typing", { receiverId });
    }
  },

  handleStopTyping: (receiverId) => {
    const socket = useAuthStore.getState().socket;
    if (socket && socket.connected && get().isTyping) {
      set({ isTyping: false });
      socket.emit("stopTyping", { receiverId });
    }
  },

  addReaction: async (messageId, emoji) => {
    try {
      const res = await axiosInstance.post(`/messages/reaction/${messageId}`, { emoji });
      const { messages } = get();
      const updatedMessages = messages.map((msg) =>
        msg._id === messageId ? res.data : msg
      );
      set({ messages: updatedMessages });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to add reaction");
    }
  },

  removeReaction: async (messageId) => {
    try {
      const res = await axiosInstance.delete(`/messages/reaction/${messageId}`);
      const { messages } = get();
      const updatedMessages = messages.map((msg) =>
        msg._id === messageId ? res.data : msg
      );
      set({ messages: updatedMessages });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to remove reaction");
    }
  },

  replyTo: null, // Message to reply to

  setReplyTo: (message) => {
    set({ replyTo: message });
  },

  clearReplyTo: () => {
    set({ replyTo: null });
  },

  editMessage: async (messageId, text) => {
    try {
      const res = await axiosInstance.put(`/messages/edit/${messageId}`, { text });
      const { messages } = get();
      const updatedMessages = messages.map((msg) =>
        msg._id === messageId ? res.data : msg
      );
      set({ messages: updatedMessages });
      return res.data;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to edit message");
      throw error;
    }
  },

  deleteMessage: async (messageId, deleteForEveryone = false) => {
    try {
      const res = await axiosInstance.delete(`/messages/delete/${messageId}`, {
        data: { deleteForEveryone },
      });
      const { messages } = get();
      
      if (deleteForEveryone) {
        // Update message to show deleted state
        const updatedMessages = messages.map((msg) =>
          msg._id === messageId ? res.data : msg
        );
        set({ messages: updatedMessages });
      } else {
        // Remove from messages array
        const updatedMessages = messages.filter((msg) => msg._id !== messageId);
        set({ messages: updatedMessages });
      }
      return res.data;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to delete message");
      throw error;
    }
  },

  subscribeToMessages: () => {
    const { selectedUser, isSoundEnabled } = get();
    if (!selectedUser) {
      console.log("⚠️  Cannot subscribe: No selected user");
      return () => {}; // Return empty cleanup function
    }

    let socket = useAuthStore.getState().socket;
    
    // If socket doesn't exist, try to connect
    if (!socket) {
      console.log("⚠️  Socket not found, attempting to connect...");
      const { connectSocket } = useAuthStore.getState();
      connectSocket();
      socket = useAuthStore.getState().socket;
      
      if (!socket) {
        console.log("❌ Failed to create socket connection");
        return () => {};
      }
    }

    // If socket is not connected, wait for it
    if (!socket.connected) {
      console.log("⚠️  Socket not connected, waiting for connection...");
      const connectHandler = () => {
        console.log("✅ Socket connected, subscribing now");
        get().subscribeToMessages();
      };
      socket.once("connect", connectHandler);
      return () => {
        socket.off("connect", connectHandler);
      };
    }

    const { authUser } = useAuthStore.getState();
    const selectedUserId = selectedUser._id?.toString() || selectedUser._id;
    console.log(`📡 Subscribing to messages for user: ${selectedUserId}`);
    console.log(`🔌 Socket status: connected=${socket.connected}, id=${socket.id}`);

    // New message received (from other users)
    const handleNewMessage = (newMessage) => {
      // Get current state (not closure state)
      const currentState = get();
      const currentSelectedUser = currentState.selectedUser;
      
      if (!currentSelectedUser) {
        console.log("⏭️  No selected user, ignoring message");
        return;
      }

      const currentSelectedUserId = currentSelectedUser._id?.toString() || currentSelectedUser._id;
      const senderId = newMessage.senderId?._id || newMessage.senderId;
      const senderIdStr = senderId?.toString() || senderId;
      
      console.log("📨 New message received via socket:", {
        messageId: newMessage._id,
        senderId: senderIdStr,
        selectedUserId: currentSelectedUserId,
        match: senderIdStr === currentSelectedUserId,
      });
      
      // Check if message is from the currently selected user
      const isMessageSentFromSelectedUser = senderIdStr === currentSelectedUserId;
      
      if (!isMessageSentFromSelectedUser) {
        console.log(`⏭️  Message from different user (${senderIdStr} vs ${currentSelectedUserId}), ignoring`);
        return;
      }

      const currentMessages = currentState.messages;
      const messageId = newMessage._id;
      
      // Check if message already exists (avoid duplicates)
      const messageExists = currentMessages.some((msg) => msg._id === messageId);
      
      // Also check if it's in pending (our own message that we just sent)
      const isPending = currentState.pendingMessages.has(messageId);
      
      if (!messageExists && !isPending) {
        console.log(`✅ Adding new message to UI: ${messageId}`);
        set({ messages: [...currentMessages, newMessage] });

        if (currentState.isSoundEnabled) {
          const notificationSound = new Audio("/sounds/notification.mp3");
          notificationSound.currentTime = 0;
          notificationSound.play().catch((e) => console.log("Audio play failed:", e));
        }
      } else {
        console.log(`⏭️  Message already exists or is pending: ${messageId}`);
      }
    };

    // Remove any existing listeners first to prevent duplicates
    socket.off("newMessage");
    socket.on("newMessage", handleNewMessage);
    console.log("✅ Socket listener attached for newMessage");
    
    // Debug: Log socket connection status
    console.log("🔌 Socket connection status:", {
      connected: socket.connected,
      id: socket.id,
      transport: socket.io?.engine?.transport?.name,
    });

    // Typing indicator
    socket.on("userTyping", ({ userId, userName }) => {
      const selectedUserId = selectedUser._id?.toString() || selectedUser._id;
      const typingUserId = userId?.toString() || userId;
      
      if (typingUserId === selectedUserId) {
        set({ typingUsers: [...get().typingUsers.filter((id) => id !== typingUserId), typingUserId] });
      }
    });

    socket.on("userStoppedTyping", ({ userId }) => {
      set({ typingUsers: get().typingUsers.filter((id) => id !== userId?.toString()) });
    });

    // Read receipt
    socket.on("messageRead", ({ messageId, userId }) => {
      const { messages } = get();
      const updatedMessages = messages.map((msg) => {
        if (msg._id === messageId) {
          const readBy = msg.readBy || [];
          const alreadyRead = readBy.some((r) => {
            const readUserId = r.userId?._id || r.userId;
            return readUserId?.toString() === userId?.toString();
          });
          if (!alreadyRead) {
            return {
              ...msg,
              readBy: [...readBy, { userId }],
            };
          }
        }
        return msg;
      });
      set({ messages: updatedMessages });
    });

    // Delivered receipt
    socket.on("messageDelivered", ({ messageId, userId }) => {
      const { messages } = get();
      const updatedMessages = messages.map((msg) => {
        if (msg._id === messageId) {
          const deliveredTo = msg.deliveredTo || [];
          const alreadyDelivered = deliveredTo.some((d) => {
            const deliveredUserId = d.userId?._id || d.userId;
            return deliveredUserId?.toString() === userId?.toString();
          });
          if (!alreadyDelivered) {
            return {
              ...msg,
              deliveredTo: [...deliveredTo, { userId }],
            };
          }
        }
        return msg;
      });
      set({ messages: updatedMessages });
    });

    // Reaction updates
    socket.on("reactionAdded", (message) => {
      const { messages } = get();
      const updatedMessages = messages.map((msg) =>
        msg._id === message._id ? message : msg
      );
      set({ messages: updatedMessages });
    });

    socket.on("reactionRemoved", (message) => {
      const { messages } = get();
      const updatedMessages = messages.map((msg) =>
        msg._id === message._id ? message : msg
      );
      set({ messages: updatedMessages });
    });

    // Message edited
    socket.on("messageEdited", (editedMessage) => {
      const { messages } = get();
      const updatedMessages = messages.map((msg) =>
        msg._id === editedMessage._id ? editedMessage : msg
      );
      set({ messages: updatedMessages });
    });

    // Message deleted
    socket.on("messageDeleted", (deletedMessage) => {
      const { messages } = get();
      const updatedMessages = messages.map((msg) =>
        msg._id === deletedMessage._id ? deletedMessage : msg
      );
      set({ messages: updatedMessages });
    });

    // Message deleted for me
    socket.on("messageDeletedForMe", (deletedMessage) => {
      const { messages } = get();
      const updatedMessages = messages.filter((msg) => msg._id !== deletedMessage._id);
      set({ messages: updatedMessages });
    });

    // Return cleanup function
    return () => {
      console.log("🧹 Unsubscribing from messages");
      socket.off("newMessage", handleNewMessage);
      socket.off("userTyping");
      socket.off("userStoppedTyping");
      socket.off("messageRead");
      socket.off("messageDelivered");
      socket.off("reactionAdded");
      socket.off("reactionRemoved");
      socket.off("messageEdited");
      socket.off("messageDeleted");
      socket.off("messageDeletedForMe");
    };
  },

  unsubscribeFromMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;

    console.log("🧹 Unsubscribing from all message events");
    socket.off("newMessage");
    socket.off("userTyping");
    socket.off("userStoppedTyping");
    socket.off("messageRead");
    socket.off("messageDelivered");
    socket.off("reactionAdded");
    socket.off("reactionRemoved");
    socket.off("messageEdited");
    socket.off("messageDeleted");
    socket.off("messageDeletedForMe");
  },
}));
