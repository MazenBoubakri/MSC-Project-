import mongoose from 'mongoose';

// A chat room: creator-owned, open membership. The members array is the
// live "list of users present in the room" — updated on join/leave.
const roomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 50,
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: 200,
    },
    avatarColor: {
      type: String,
      default: '#2B5CFF',
      match: /^#[0-9a-fA-F]{6}$/,
    },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },
    lastMessageAt: { type: Date, default: null },
    lastMessagePreview: { type: String, default: '' },
    lastMessageType: { type: String, enum: ['text', 'image', 'voice'], default: 'text' },
    lastMessageSenderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

roomSchema.index({ lastMessageAt: -1 });
roomSchema.index({ members: 1 });

export const Room = mongoose.model('Room', roomSchema);
