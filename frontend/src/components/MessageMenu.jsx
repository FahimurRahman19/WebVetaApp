import { useState, useRef, useEffect } from "react";
import {
  MoreVerticalIcon,
  EditIcon,
  TrashIcon,
  ReplyIcon,
  CopyIcon,
  InfoIcon,
  XIcon,
} from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import toast from "react-hot-toast";

function MessageMenu({ message, isSentByMe }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.text || "");
  const [showInfo, setShowInfo] = useState(false);
  const menuRef = useRef(null);
  const { editMessage, deleteMessage, setReplyTo } = useChatStore();
  const { authUser } = useAuthStore();

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleEdit = async () => {
    if (!editText.trim()) {
      toast.error("Message cannot be empty");
      return;
    }

    try {
      await editMessage(message._id, editText.trim());
      setIsEditing(false);
      setIsOpen(false);
      toast.success("Message edited");
    } catch (error) {
      toast.error("Failed to edit message");
    }
  };

  const handleDelete = async (deleteForEveryone = false) => {
    if (!deleteForEveryone && !isSentByMe) {
      toast.error("You can only delete your own messages");
      return;
    }

    const confirmMessage = deleteForEveryone
      ? "Delete this message for everyone?"
      : "Delete this message for you?";

    if (window.confirm(confirmMessage)) {
      try {
        await deleteMessage(message._id, deleteForEveryone);
        setIsOpen(false);
        toast.success("Message deleted");
      } catch (error) {
        toast.error("Failed to delete message");
      }
    }
  };

  const handleReply = () => {
    setReplyTo(message);
    setIsOpen(false);
    toast.success("Replying to message");
  };

  const handleCopy = () => {
    const textToCopy = message.text || "";
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      toast.success("Message copied to clipboard");
    } else {
      toast.error("No text to copy");
    }
    setIsOpen(false);
  };

  const isDeletedForMe = message.deletedForMe?.some(
    (d) => (d.userId?._id || d.userId) === authUser._id || (d.userId?._id || d.userId) === authUser._id?.toString()
  );
  const isDeleted = message.deletedForEveryone || isDeletedForMe;

  if (isDeleted && message.deletedForEveryone) {
    return (
      <div className="text-xs opacity-50 italic">
        This message was deleted
      </div>
    );
  }

  return (
    <>
      <div className="relative" ref={menuRef}>
        {/* Three dots menu button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-slate-700/50 rounded"
          title="Message options"
        >
          <MoreVerticalIcon className="w-4 h-4" />
        </button>

        {/* Menu dropdown */}
        {isOpen && (
          <div className="absolute right-0 top-6 bg-slate-800 border border-slate-700 rounded-lg shadow-lg z-50 min-w-[180px]">
            <div className="py-1">
              {/* Reply */}
              <button
                onClick={handleReply}
                className="w-full px-4 py-2 text-left text-sm text-slate-200 hover:bg-slate-700 flex items-center gap-2"
              >
                <ReplyIcon className="w-4 h-4" />
                Reply
              </button>

              {/* Copy */}
              {message.text && (
                <button
                  onClick={handleCopy}
                  className="w-full px-4 py-2 text-left text-sm text-slate-200 hover:bg-slate-700 flex items-center gap-2"
                >
                  <CopyIcon className="w-4 h-4" />
                  Copy
                </button>
              )}

              {/* Edit - Only for sender */}
              {isSentByMe && !message.deletedForEveryone && message.text && (
                <button
                  onClick={() => {
                    setIsEditing(true);
                    setIsOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-slate-200 hover:bg-slate-700 flex items-center gap-2"
                >
                  <EditIcon className="w-4 h-4" />
                  Edit
                </button>
              )}

              {/* Delete for me */}
              <button
                onClick={() => handleDelete(false)}
                className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-slate-700 flex items-center gap-2"
              >
                <TrashIcon className="w-4 h-4" />
                Delete for me
              </button>

              {/* Delete for everyone - Only for sender */}
              {isSentByMe && !message.deletedForEveryone && (
                <button
                  onClick={() => handleDelete(true)}
                  className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-slate-700 flex items-center gap-2"
                >
                  <TrashIcon className="w-4 h-4" />
                  Delete for everyone
                </button>
              )}

              {/* Message info */}
              <button
                onClick={() => {
                  setShowInfo(true);
                  setIsOpen(false);
                }}
                className="w-full px-4 py-2 text-left text-sm text-slate-200 hover:bg-slate-700 flex items-center gap-2"
              >
                <InfoIcon className="w-4 h-4" />
                Info
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit modal */}
      {isEditing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-200">Edit Message</h3>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditText(message.text || "");
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg p-3 text-slate-200 resize-none"
              rows={4}
              autoFocus
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleEdit}
                className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg py-2 px-4"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditText(message.text || "");
                }}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg py-2 px-4"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Message info modal */}
      {showInfo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-200">Message Info</h3>
              <button
                onClick={() => setShowInfo(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-slate-400">Sent</p>
                <p className="text-slate-200">
                  {new Date(message.createdAt).toLocaleString()}
                </p>
              </div>
              {message.edited && (
                <div>
                  <p className="text-slate-400">Edited</p>
                  <p className="text-slate-200">
                    {new Date(message.editedAt).toLocaleString()}
                  </p>
                </div>
              )}
              <div>
                <p className="text-slate-400">Delivered</p>
                <p className="text-slate-200">
                  {message.deliveredTo?.length > 0
                    ? message.deliveredTo
                        .map((d) => new Date(d.deliveredAt).toLocaleString())
                        .join(", ")
                    : "Not delivered"}
                </p>
              </div>
              <div>
                <p className="text-slate-400">Read</p>
                <p className="text-slate-200">
                  {message.readBy?.length > 0
                    ? message.readBy
                        .map((r) => new Date(r.readAt).toLocaleString())
                        .join(", ")
                    : "Not read"}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowInfo(false)}
              className="w-full mt-4 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg py-2 px-4"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default MessageMenu;


//commit

