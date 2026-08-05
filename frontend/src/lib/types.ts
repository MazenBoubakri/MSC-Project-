// Shared types mirroring backend DTOs (backend/src/lib/dto.js, user-dto.js).

export type MessageType = 'text' | 'image' | 'voice'

export interface Reaction {
  emoji: string
  user: string
  createdAt: string
}

/** Frozen snapshot of the message this one replies to (null when not a reply) */
export interface ReplyTo {
  messageId: string
  senderId: string
  senderName: string
  body: string
  mediaType: MessageType
}

export interface Message {
  id: string
  /** set for direct messages, null for chat-room messages */
  conversationId: string | null
  /** set for chat-room messages, null for direct messages */
  roomId: string | null
  senderId: string
  type: MessageType
  body: string | null
  mediaUrl: string | null
  duration: number | null
  reactions: Reaction[]
  readBy: string[]
  createdAt: string
  /** true when the message was deleted for everyone (tombstone) */
  deleted?: boolean
  editedAt?: string | null
  /** present on socket message:new only; client uses it to replace optimistic rows */
  tempId?: string | null
  /** snapshot of the replied-to message, captured at send time */
  replyTo: ReplyTo | null
}

export type UserStatus = 'available' | 'away' | 'busy'

export interface PublicUser {
  id: string
  username: string
  fullName: string
  avatarUrl: string | null
  avatarColor: string
  lastSeen: string | null
  bio: string
  status: UserStatus
}

export interface MeUser extends PublicUser {
  online?: boolean
  createdAt?: string
}

export interface Conversation {
  id: string
  peerId: string
  lastMessageAt: string
  lastMessagePreview: string | null
  lastMessageType: MessageType | null
  lastReadAt: string | null
  createdAt: string
}

export interface ConversationListItem extends Conversation {
  peer: PublicUser & { online: boolean }
  unread: number
}

export interface FriendRequestDTO {
  id: string
  from: PublicUser | null
  to: PublicUser | null
  status: 'pending' | 'accepted' | 'declined'
  createdAt: string
}

export interface FriendsPayload {
  friends: PublicUser[]
  total: number
  onlineCount: number
  incoming: FriendRequestDTO[]
}

export interface UserProfile extends PublicUser {
  friendStatus: 'none' | 'sent' | 'incoming' | 'friends'
  /** true when the viewer has blocked this user */
  blocked?: boolean
}

export interface SearchResult {
  users: PublicUser[]
}

export interface NotifMessage {
  conversationId: string
  sender: { id: string; fullName: string; avatarUrl: string | null }
  type: MessageType
  body: string | null
  preview: string | null
  at: string
}

export interface Room {
  id: string
  name: string
  description: string
  avatarColor: string
  ownerId: string
  /** true when the current user is a member ("present") in the room */
  member: boolean
  memberCount: number
  lastMessageAt: string | null
  lastMessagePreview: string | null
  lastMessageType: MessageType | null
  /** sender of the last message, for "You: " previews */
  lastMessageSenderId: string | null
  createdAt: string
  unread: number
}

export interface RoomDetail extends Room {
  memberIds: string[]
  members: (PublicUser & { online: boolean })[]
}

export interface Story {
  id: string
  ownerId: string
  mediaUrl: string
  mediaType: 'image'
  caption: string
  createdAt: string
  viewed: boolean
  viewCount: number
}

export interface StoryGroup {
  user: PublicUser
  stories: Story[]
}
