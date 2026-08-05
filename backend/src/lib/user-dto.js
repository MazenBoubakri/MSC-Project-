import { isOnline } from './presence.js';

export function toUserDTO(user, { online = false } = {}) {
  return {
    id: String(user._id),
    username: user.username,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    avatarColor: user.avatarColor,
    online: online || isOnline(user._id),
    lastSeen: user.lastSeen,
    bio: user.bio ?? '',
    status: user.status ?? 'available',
    createdAt: user.createdAt,
  };
}

export function toPublicUserDTO(user) {
  return {
    id: String(user._id),
    username: user.username,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    avatarColor: user.avatarColor,
    online: isOnline(user._id),
    lastSeen: user.lastSeen,
    bio: user.bio ?? '',
    status: user.status ?? 'available',
  };
}
