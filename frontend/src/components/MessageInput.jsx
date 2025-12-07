import { useRef, useState, useEffect } from "react";
import useKeyboardSound from "../hooks/useKeyboardSound";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import toast from "react-hot-toast";
import {
  ImageIcon,
  SendIcon,
  XIcon,
  VideoIcon,
  MicIcon,
  SquareIcon,
} from "lucide-react";

function MessageInput() {
  const { playRandomKeyStrokeSound } = useKeyboardSound();
  const [text, setText] = useState("");
  const [imagePreview, setImagePreview] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [videoPreview, setVideoPreview] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioBlob, setAudioBlob] = useState(null);

  const fileInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const mediaRecorderRef = useRef(null);

  const { sendMessage, isSoundEnabled, selectedUser, handleTyping, handleStopTyping, replyTo, clearReplyTo } =
    useChatStore();
  const { socket, authUser } = useAuthStore();

  // Typing indicator logic
  useEffect(() => {
    if (!selectedUser || !socket) return;

    let typingTimeout;
    const handleTextChange = () => {
      if (text.trim()) {
        handleTyping(selectedUser._id);
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
          handleStopTyping(selectedUser._id);
        }, 1000);
      } else {
        handleStopTyping(selectedUser._id);
      }
    };

    const timeoutId = setTimeout(handleTextChange, 500);
    return () => {
      clearTimeout(timeoutId);
      clearTimeout(typingTimeout);
    };
  }, [text, selectedUser, socket, handleTyping, handleStopTyping]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, []);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!text.trim() && !imageFile && !videoFile && !audioBlob) return;
    if (isSoundEnabled) playRandomKeyStrokeSound();

    try {
      // Create FormData
      const formData = new FormData();
      if (text.trim()) {
        formData.append("text", text.trim());
      }

      // Handle image file - use actual file object
      if (imageFile) {
        formData.append("image", imageFile);
      }

      // Handle video file - use actual file object
      if (videoFile) {
        formData.append("video", videoFile);
      }

      // Handle audio file
      if (audioBlob) {
        formData.append("audio", audioBlob, "voice-message.webm");
      }

      await sendMessage(formData);

      // Reset state
      setText("");
      setImagePreview(null);
      setImageFile(null);
      setVideoPreview(null);
      setVideoFile(null);
      setAudioBlob(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (videoInputRef.current) videoInputRef.current.value = "";
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error("Failed to send message. Please try again.");
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    // Check file size (max 10MB for images)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image size should be less than 10MB");
      return;
    }

    // Store the actual file
    setImageFile(file);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleVideoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      toast.error("Please select a video file");
      return;
    }

    // Check file size (max 50MB for videos)
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Video size should be less than 50MB");
      return;
    }

    // Store the actual file
    setVideoFile(file);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => setVideoPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

      const chunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        setAudioBlob(blob);
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error("Error accessing microphone:", error);
      toast.error("Could not access microphone. Please check permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }
    setIsRecording(false);
  };

  const cancelRecording = () => {
    stopRecording();
    setRecordingTime(0);
    setAudioBlob(null);
  };

  const removeImage = () => {
    setImagePreview(null);
    setImageFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeVideo = () => {
    setVideoPreview(null);
    setVideoFile(null);
    if (videoInputRef.current) videoInputRef.current.value = "";
  };

  const removeAudio = () => {
    setAudioBlob(null);
    setRecordingTime(0);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="p-4 border-t border-slate-700/50">
      {/* Reply Preview */}
      {replyTo && (
        <div className="max-w-3xl mx-auto mb-3 p-3 bg-slate-800/50 rounded-lg border-l-4 border-cyan-500 flex items-start justify-between">
          <div className="flex-1">
            <p className="text-xs text-slate-400 mb-1">
              Replying to {replyTo.senderId?._id === authUser._id ? "yourself" : replyTo.senderId?.fullName || "User"}
            </p>
            {replyTo.text && (
              <p className="text-sm text-slate-300 truncate">{replyTo.text}</p>
            )}
            {replyTo.image && (
              <p className="text-xs text-slate-400 italic">📷 Photo</p>
            )}
            {replyTo.video && (
              <p className="text-xs text-slate-400 italic">🎥 Video</p>
            )}
            {replyTo.audio && (
              <p className="text-xs text-slate-400 italic">🎤 Audio</p>
            )}
          </div>
          <button
            onClick={clearReplyTo}
            className="ml-2 text-slate-400 hover:text-slate-200"
            type="button"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Image Preview */}
      {imagePreview && (
        <div className="max-w-3xl mx-auto mb-3 flex items-center">
          <div className="relative">
            <img
              src={imagePreview}
              alt="Preview"
              className="w-32 h-32 object-cover rounded-lg border border-slate-700"
            />
            <button
              onClick={removeImage}
              className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-slate-200 hover:bg-slate-700"
              type="button"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Video Preview */}
      {videoPreview && (
        <div className="max-w-3xl mx-auto mb-3 flex items-center">
          <div className="relative">
            <video
              src={videoPreview}
              className="w-64 h-48 object-cover rounded-lg border border-slate-700"
              controls
            />
            <button
              onClick={removeVideo}
              className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-slate-200 hover:bg-slate-700"
              type="button"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Audio Preview */}
      {audioBlob && !isRecording && (
        <div className="max-w-3xl mx-auto mb-3 flex items-center gap-2">
          <div className="flex items-center gap-2 bg-slate-800/50 rounded-lg px-4 py-2">
            <MicIcon className="w-5 h-5 text-cyan-500" />
            <span className="text-sm text-slate-300">Voice message ({formatTime(recordingTime)})</span>
            <button
              onClick={removeAudio}
              className="ml-2 text-slate-400 hover:text-slate-200"
              type="button"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Recording Indicator */}
      {isRecording && (
        <div className="max-w-3xl mx-auto mb-3 flex items-center gap-2">
          <div className="flex items-center gap-2 bg-red-900/30 rounded-lg px-4 py-2">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
            <span className="text-sm text-red-300">Recording... {formatTime(recordingTime)}</span>
            <button
              onClick={stopRecording}
              className="ml-2 text-red-400 hover:text-red-300"
              type="button"
            >
              <SquareIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSendMessage} className="max-w-3xl mx-auto flex space-x-2">
        <input
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            isSoundEnabled && playRandomKeyStrokeSound();
          }}
          className="flex-1 bg-slate-800/50 border border-slate-700/50 rounded-lg py-2 px-4 text-slate-200 placeholder-slate-500"
          placeholder="Type your message..."
        />

        {/* Image Input */}
        <input
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
          ref={fileInputRef}
          onChange={handleImageChange}
          className="hidden"
        />

        {/* Video Input */}
        <input
          type="file"
          accept="video/mp4,video/webm,video/ogg,video/quicktime"
          ref={videoInputRef}
          onChange={handleVideoChange}
          className="hidden"
        />

        {/* Image Button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={`bg-slate-800/50 text-slate-400 hover:text-slate-200 rounded-lg px-3 py-2 transition-colors ${
            imagePreview ? "text-cyan-500" : ""
          }`}
          title="Send image"
        >
          <ImageIcon className="w-5 h-5" />
        </button>

        {/* Video Button */}
        <button
          type="button"
          onClick={() => videoInputRef.current?.click()}
          className={`bg-slate-800/50 text-slate-400 hover:text-slate-200 rounded-lg px-3 py-2 transition-colors ${
            videoPreview ? "text-cyan-500" : ""
          }`}
          title="Send video"
        >
          <VideoIcon className="w-5 h-5" />
        </button>

        {/* Voice Recording Button */}
        {!isRecording && !audioBlob ? (
          <button
            type="button"
            onClick={startRecording}
            className="bg-slate-800/50 text-slate-400 hover:text-slate-200 rounded-lg px-3 py-2 transition-colors"
            title="Record voice message"
          >
            <MicIcon className="w-5 h-5" />
          </button>
        ) : isRecording ? (
          <button
            type="button"
            onClick={cancelRecording}
            className="bg-red-900/30 text-red-400 hover:text-red-300 rounded-lg px-3 py-2 transition-colors"
            title="Cancel recording"
          >
            <XIcon className="w-5 h-5" />
          </button>
        ) : null}

        {/* Send Button */}
        <button
          type="submit"
          disabled={!text.trim() && !imageFile && !videoFile && !audioBlob}
          className="bg-gradient-to-r from-cyan-500 to-cyan-600 text-white rounded-lg px-4 py-2 font-medium hover:from-cyan-600 hover:to-cyan-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <SendIcon className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
}

export default MessageInput;
