import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 20,
      match: /^[a-z0-9_]+$/,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    avatarUrl: { type: String, default: null },
    avatarColor: {
      type: String,
      default: '#2B5CFF',
      match: /^#[0-9a-fA-F]{6}$/,
    },
    lastSeen: { type: Date, default: null },
    // Password auth (scrypt). Null for accounts created before passwords
    // existed - those cannot sign in.
    passwordHash: { type: String, default: null },
    passwordSalt: { type: String, default: null },
    bio: { type: String, default: '', maxlength: 160 },
    status: { type: String, enum: ['available', 'away', 'busy'], default: 'available' },
    blockedIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },
  },
  { timestamps: true }
);

export const User = mongoose.model('User', userSchema);
