import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
  {
    participants: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      validate: [(v) => v.length === 2, 'Conversation needs exactly 2 participants'],
    },
    lastMessageAt: { type: Date, default: null },
    lastMessagePreview: { type: String, default: '' },
    lastMessageType: { type: String, enum: ['text', 'image', 'voice'], default: 'text' },
    lastReadAt: {
      type: Map,
      of: Date,
      default: {},
    },
  },
  { timestamps: true }
);

conversationSchema.index({ participants: 1 });
conversationSchema.index({ lastMessageAt: -1 });

export const Conversation = mongoose.model('Conversation', conversationSchema);
