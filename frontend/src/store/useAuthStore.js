import { create } from "zustand";
import { axiosInstance } from "../lib/axios";
import toast from "react-hot-toast";
import { io } from "socket.io-client";

// Get the base URL for socket connection
const getSocketURL = () => {
  if (import.meta.env.MODE === "development") {
    return "http://localhost:3000";
  }
  return window.location.origin;
};

export const useAuthStore = create((set, get) => ({
  authUser: null,
  isCheckingAuth: true,
  isSigningUp: false,
  isLoggingIn: false,
  socket: null,
  onlineUsers: [],

  checkAuth: async () => {
    try {
      const res = await axiosInstance.get("/auth/check");
      set({ authUser: res.data });
      get().connectSocket();
    } catch (error) {
      console.log("Error in authCheck:", error);
      set({ authUser: null });
    } finally {
      set({ isCheckingAuth: false });
    }
  },

  signup: async (data) => {
    set({ isSigningUp: true });
    try {
      const res = await axiosInstance.post("/auth/signup", data);
      set({ authUser: res.data });

      toast.success("Account created successfully!");
      get().connectSocket();
    } catch (error) {
      console.error("Signup error:", error);
      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        "Failed to create account. Please try again.";
      toast.error(errorMessage);
    } finally {
      set({ isSigningUp: false });
    }
  },

  login: async (data) => {
    set({ isLoggingIn: true });
    try {
      console.log("Attempting login to:", axiosInstance.defaults.baseURL);
      const res = await axiosInstance.post("/auth/login", data);
      set({ authUser: res.data });

      toast.success("Logged in successfully");

      get().connectSocket();
    } catch (error) {
      console.error("Login error details:", {
        message: error.message,
        code: error.code,
        response: error.response?.data,
        status: error.response?.status,
        baseURL: axiosInstance.defaults.baseURL,
      });

      let errorMessage = "Failed to login. ";

      if (error.code === "ERR_NETWORK" || !error.response) {
        errorMessage +=
          "Cannot connect to server. Please make sure the backend is running on port 3000.";
      } else if (error.response?.status === 400) {
        errorMessage = error.response.data?.message || "Invalid email or password.";
      } else if (error.response?.status === 500) {
        errorMessage = "Server error. Please try again later.";
      } else {
        errorMessage += error.response?.data?.message || error.message || "Please check your credentials.";
      }

      toast.error(errorMessage);
    } finally {
      set({ isLoggingIn: false });
    }
  },

  logout: async () => {
    try {
      await axiosInstance.post("/auth/logout");
      set({ authUser: null });
      toast.success("Logged out successfully");
      get().disconnectSocket();
    } catch (error) {
      toast.error("Error logging out");
      console.log("Logout error:", error);
    }
  },

  updateProfile: async (formData) => {
    try {
      const res = await axiosInstance.put("/auth/update-profile", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      set({ authUser: res.data });
      toast.success("Profile updated successfully");
    } catch (error) {
      console.log("Error in update profile:", error);
      toast.error(error.response?.data?.message || "Failed to update profile");
    }
  },

  connectSocket: () => {
    const { authUser, socket } = get();
    
    // Don't connect if no user or already connected
    if (!authUser) {
      console.log("⚠️  Cannot connect socket: No authenticated user");
      return;
    }

    if (socket?.connected) {
      console.log("✅ Socket already connected");
      return;
    }

    // Disconnect existing socket if any
    if (socket) {
      socket.disconnect();
      socket.removeAllListeners();
    }

    const socketURL = getSocketURL();
    console.log(`🔌 Connecting socket to: ${socketURL}`);

    const newSocket = io(socketURL, {
      withCredentials: true, // Ensures cookies are sent with the connection
      transports: ["websocket", "polling"], // Support both transports
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    // Connection event handlers
    newSocket.on("connect", () => {
      console.log("✅ Socket connected successfully - ID:", newSocket.id);
      console.log("🔌 Socket transport:", newSocket.io.engine.transport.name);
    });

    newSocket.on("disconnect", (reason) => {
      console.log("❌ Socket disconnected - Reason:", reason);
      if (reason === "io server disconnect") {
        // Server disconnected the socket, reconnect manually
        newSocket.connect();
      }
    });

    newSocket.on("connect_error", (error) => {
      console.error("❌ Socket connection error:", error.message);
    });

    newSocket.on("reconnect", (attemptNumber) => {
      console.log(`🔄 Socket reconnected after ${attemptNumber} attempts`);
    });

    newSocket.on("reconnect_attempt", (attemptNumber) => {
      console.log(`🔄 Socket reconnection attempt ${attemptNumber}`);
    });

    newSocket.on("reconnect_error", (error) => {
      console.error("❌ Socket reconnection error:", error.message);
    });

    newSocket.on("reconnect_failed", () => {
      console.error("❌ Socket reconnection failed");
      toast.error("Connection lost. Please refresh the page.");
    });

    // Listen for online users event
    newSocket.on("getOnlineUsers", (userIds) => {
      console.log("👥 Online users updated:", userIds);
      set({ onlineUsers: userIds });
    });

    set({ socket: newSocket });
  },

  disconnectSocket: () => {
    const { socket } = get();
    if (socket) {
      console.log("🔌 Disconnecting socket");
      socket.removeAllListeners();
      socket.disconnect();
      set({ socket: null });
    }
  },
}));
