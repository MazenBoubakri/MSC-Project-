import mongoose from 'mongoose';

const reactionSchema = new mongoose.Schema(
  {
    emoji: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { _id: false, timestamps: true }
);

// Frozen snapshot of the message this one replies to. Captured once at send
// time and never updated afterwards: later edits or deletions of the original
// do NOT change replies (a deleted original snapshots with an empty body so
// the UI can render "Message deleted").
const replyToSchema = new mongoose.Schema(
  {
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    senderName: { type: String, required: true },
    body: { type: String, default: '' },
    mediaType: { type: String, enum: ['text', 'image', 'voice'], default: 'text' },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    // A message targets exactly one of: a direct conversation or a chat room.
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      default: null,
      index: true,
    },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      default: null,
      index: true,
    },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['text', 'image', 'voice'], default: 'text' },
    body: { type: String, default: '', maxlength: 4000 },
    mediaUrl: { type: String, default: null },
    duration: { type: Number, default: null },
    reactions: { type: [reactionSchema], default: [] },
    readBy: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },
    editedAt: { type: Date, default: null },
    deleted: { type: Boolean, default: false },
    replyTo: { type: replyToSchema, default: null },
  },
  { timestamps: true }
);

messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ roomId: 1, createdAt: -1 });

export const Message = mongoose.model('Message', messageSchema);
