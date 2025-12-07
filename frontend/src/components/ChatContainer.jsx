import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import ChatHeader from "./ChatHeader";
import NoChatHistoryPlaceholder from "./NoChatHistoryPlaceholder";
import MessageInput from "./MessageInput";
import MessagesLoadingSkeleton from "./MessagesLoadingSkeleton";
import MessageMenu from "./MessageMenu";
import { axiosInstance } from "../lib/axios";
import { SmileIcon, CheckIcon, CheckCheckIcon } from "lucide-react";

// Common emoji reactions
const EMOJI_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

function ChatContainer() {
  const {
    selectedUser,
    getMessagesByUserId,
    messages,
    isMessagesLoading,
    subscribeToMessages,
    unsubscribeFromMessages,
    typingUsers,
    addReaction,
    removeReaction,
  } = useChatStore();
  const { authUser } = useAuthStore();
  const messageEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const [showReactions, setShowReactions] = useState(null); // messageId

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messageEndRef.current) {
      messageEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, typingUsers]);

  // Load messages when user is selected
  useEffect(() => {
    if (selectedUser?._id) {
      getMessagesByUserId(selectedUser._id);
    }
  }, [selectedUser?._id, getMessagesByUserId]);

  // Subscribe to socket messages when user is selected
  useEffect(() => {
    if (!selectedUser?._id) return;

    console.log("🔄 Setting up message subscription for user:", selectedUser._id);
    const cleanup = subscribeToMessages();

    return () => {
      console.log("🧹 Cleaning up message subscription");
      if (cleanup && typeof cleanup === 'function') {
        cleanup();
      }
      unsubscribeFromMessages();
    };
  }, [selectedUser?._id]);

  // Mark messages as read when viewing
  useEffect(() => {
    if (selectedUser && messages.length > 0) {
      const unreadMessages = messages.filter((msg) => {
        const senderId = msg.senderId?._id || msg.senderId;
        const isFromOtherUser = senderId !== authUser._id && senderId !== authUser._id?.toString();
        const isUnread = !msg.readBy?.some((r) => {
          const readUserId = r.userId?._id || r.userId;
          return readUserId === authUser._id || readUserId === authUser._id?.toString();
        });
        return isFromOtherUser && isUnread;
      });

      unreadMessages.forEach((msg) => {
        const messageId = msg._id;
        axiosInstance.put(`/messages/read/${messageId}`).catch(console.error);
      });
    }
  }, [selectedUser, messages, authUser._id]);

  const handleReactionClick = (messageId, emoji) => {
    const message = messages.find((m) => m._id === messageId);
    const hasReaction = message?.reactions?.some(
      (r) => (r.userId._id || r.userId) === authUser._id && r.emoji === emoji
    );

    if (hasReaction) {
      removeReaction(messageId);
    } else {
      addReaction(messageId, emoji);
    }
    setShowReactions(null);
  };

  const getMessageReactions = (message) => {
    if (!message.reactions || message.reactions.length === 0) return null;

    const reactionGroups = {};
    message.reactions.forEach((reaction) => {
      const emoji = reaction.emoji;
      if (!reactionGroups[emoji]) {
        reactionGroups[emoji] = [];
      }
      reactionGroups[emoji].push(reaction);
    });

    return Object.entries(reactionGroups);
  };

  const isMessageRead = (message) => {
    if (!message.readBy) return false;
    return message.readBy.some((r) => (r.userId._id || r.userId) === authUser._id);
  };

  const isMessageDelivered = (message) => {
    if (!message.deliveredTo) return false;
    return message.deliveredTo.some((d) => (d.userId._id || d.userId) === message.receiverId._id || message.receiverId);
  };

  if (!selectedUser) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-slate-400">Select a user to start chatting</p>
      </div>
    );
  }

  return (
    <>
      <ChatHeader />
      <div className="flex-1 px-6 overflow-y-auto py-8" ref={messagesContainerRef}>
        {messages.length > 0 && !isMessagesLoading ? (
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map((msg) => {
              const isSentByMe = (msg.senderId._id || msg.senderId) === authUser._id;
              const reactions = getMessageReactions(msg);

              return (
                <div
                  key={msg._id}
                  className={`chat ${isSentByMe ? "chat-end" : "chat-start"}`}
                >
                  <div
                    className={`chat-bubble relative group ${
                      isSentByMe
                        ? "bg-cyan-600 text-white"
                        : "bg-slate-800 text-slate-200"
                    } ${msg.deletedForEveryone ? "opacity-50" : ""}`}
                  >
                    {/* Deleted Message Indicator */}
                    {msg.deletedForEveryone ? (
                      <div className="text-sm italic opacity-75">
                        This message was deleted
                      </div>
                    ) : (
                      <>
                        {/* Reply Preview */}
                        {msg.replyTo && (
                          <div
                            className={`mb-2 p-2 rounded border-l-4 ${
                              isSentByMe
                                ? "bg-cyan-700/50 border-cyan-400"
                                : "bg-slate-700/50 border-slate-500"
                            }`}
                          >
                            <p className="text-xs opacity-75 mb-1">
                              {msg.replyTo.senderId?._id === authUser._id
                                ? "You"
                                : msg.replyTo.senderId?.fullName || "User"}
                            </p>
                            {msg.replyTo.text && (
                              <p className="text-sm truncate">{msg.replyTo.text}</p>
                            )}
                            {msg.replyTo.image && (
                              <p className="text-xs italic">📷 Photo</p>
                            )}
                            {msg.replyTo.video && (
                              <p className="text-xs italic">🎥 Video</p>
                            )}
                            {msg.replyTo.audio && (
                              <p className="text-xs italic">🎤 Audio</p>
                            )}
                          </div>
                        )}

                        {/* Image Message */}
                        {msg.image && (
                          <img
                            src={msg.image}
                            alt="Shared"
                            className="rounded-lg max-w-xs h-auto object-cover mb-2"
                            onError={(e) => {
                              e.target.src = "/avatar.png";
                            }}
                          />
                        )}

                        {/* Video Message */}
                        {msg.video && (
                          <video
                            src={msg.video}
                            controls
                            className="rounded-lg max-w-xs h-auto mb-2"
                          />
                        )}

                        {/* Audio Message */}
                        {msg.audio && (
                          <div className="flex items-center gap-2 mb-2">
                            <audio controls className="max-w-xs">
                              <source src={msg.audio} type="audio/webm" />
                              <source src={msg.audio} type="audio/mpeg" />
                              Your browser does not support audio playback.
                            </audio>
                          </div>
                        )}

                        {/* Text Message */}
                        {msg.text && <p className="mt-2">{msg.text}</p>}
                      </>
                    )}

                    {/* Message Footer with Time and Status */}
                    <div className="flex items-center justify-between mt-2 gap-2">
                      <div className="flex items-center gap-1">
                        <p className="text-xs opacity-75">
                          {new Date(msg.createdAt).toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                        {msg.edited && (
                          <span className="text-xs opacity-50 italic">(edited)</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Read/Delivered Receipts (only for sent messages) */}
                        {isSentByMe && (
                          <div className="flex items-center">
                            {isMessageRead(msg) ? (
                              <CheckCheckIcon className="w-4 h-4 text-blue-400" />
                            ) : isMessageDelivered(msg) ? (
                              <CheckCheckIcon className="w-4 h-4 opacity-50" />
                            ) : (
                              <CheckIcon className="w-4 h-4 opacity-50" />
                            )}
                          </div>
                        )}

                        {/* Message Menu */}
                        {!msg.deletedForEveryone && (
                          <MessageMenu message={msg} isSentByMe={isSentByMe} />
                        )}
                      </div>
                    </div>

                    {/* Reactions */}
                    {reactions && reactions.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {reactions.map(([emoji, users]) => (
                          <button
                            key={emoji}
                            onClick={() => handleReactionClick(msg._id, emoji)}
                            className="bg-slate-700/50 hover:bg-slate-600/50 rounded-full px-2 py-1 text-xs flex items-center gap-1"
                          >
                            <span>{emoji}</span>
                            <span className="text-slate-300">{users.length}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Reaction Button */}
                    <button
                      onClick={() => setShowReactions(showReactions === msg._id ? null : msg._id)}
                      className="absolute -bottom-8 left-0 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-700 hover:bg-slate-600 rounded-full p-1.5"
                      title="Add reaction"
                    >
                      <SmileIcon className="w-4 h-4" />
                    </button>

                    {/* Reaction Picker */}
                    {showReactions === msg._id && (
                      <div className="absolute -bottom-16 left-0 bg-slate-800 border border-slate-700 rounded-lg p-2 flex gap-2 z-10">
                        {EMOJI_REACTIONS.map((emoji) => {
                          const hasReaction = msg.reactions?.some(
                            (r) =>
                              (r.userId._id || r.userId) === authUser._id &&
                              r.emoji === emoji
                          );
                          return (
                            <button
                              key={emoji}
                              onClick={() => handleReactionClick(msg._id, emoji)}
                              className={`text-2xl hover:scale-125 transition-transform ${
                                hasReaction ? "ring-2 ring-cyan-500 rounded-full" : ""
                              }`}
                            >
                              {emoji}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Typing Indicator */}
            {typingUsers.length > 0 && (
              <div className="chat chat-start">
                <div className="chat-bubble bg-slate-800 text-slate-200">
                  <div className="flex items-center gap-1">
                    <span className="text-sm italic">
                      {selectedUser.fullName} is typing
                    </span>
                    <div className="flex gap-1">
                      <span className="animate-bounce">.</span>
                      <span className="animate-bounce" style={{ animationDelay: "0.2s" }}>
                        .
                      </span>
                      <span className="animate-bounce" style={{ animationDelay: "0.4s" }}>
                        .
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Scroll target */}
            <div ref={messageEndRef} />
          </div>
        ) : isMessagesLoading ? (
          <MessagesLoadingSkeleton />
        ) : (
          <NoChatHistoryPlaceholder name={selectedUser.fullName} />
        )}
      </div>

      <MessageInput />
    </>
  );
}

export default ChatContainer;
