import mongoose from 'mongoose';

const seenBySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    seenAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const storySchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    mediaUrl: { type: String, required: true },
    mediaType: { type: String, enum: ['image'], default: 'image' },
    caption: { type: String, default: '', maxlength: 500 },
    seenBy: { type: [seenBySchema], default: [] },
  },
  { timestamps: true }
);

// Auto-delete stories 24h after creation (MongoDB TTL monitor).
storySchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });
storySchema.index({ owner: 1, createdAt: -1 });

export const Story = mongoose.model('Story', storySchema);
