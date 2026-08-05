import { User } from '../models/User.js';

// Does user `blockerId` have `targetId` in their block list?
export function userBlocks(user, targetId) {
  const target = String(targetId);
  return (user?.blockedIds ?? []).some((id) => String(id) === target);
}

// Loads both users and returns which direction the block runs, if any:
// 'a-blocked-b' | 'b-blocked-a' | null
export async function blockDirection(aId, bId) {
  const [a, b] = await Promise.all([
    User.findById(aId).select('blockedIds'),
    User.findById(bId).select('blockedIds'),
  ]);
  if (userBlocks(a, bId)) return 'a-blocked-b';
  if (userBlocks(b, aId)) return 'b-blocked-a';
  return null;
}
