// Socket integration test: two clients register with passwords, connect
// sockets, chat, react, read, type, friend-request, edit, delete, block,
// search, reply. Run: node tests/socket.test.mjs
import { io as createClient } from 'socket.io-client';

const BASE = 'http://localhost:5000';
const PW = 'test-pass-123';

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function connect(token) {
  const socket = connectRaw(token);
  await new Promise((resolve, reject) => {
    socket.on('connect', resolve);
    socket.on('connect_error', reject);
  });
  return socket;
}

function connectRaw(token) {
  return createClient(BASE, {
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
  });
}

let passed = 0;
let failed = 0;
const log = [];
function check(name, ok, extra = '') {
  if (ok) {
    passed++;
    log.push(`  PASS ${name}${extra ? ` (${extra})` : ''}`);
  } else {
    failed++;
    log.push(`  FAIL ${name}${extra ? ` (${extra})` : ''}`);
  }
  console.log(log[log.length - 1]);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function once(socket, event, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeout);
    socket.once(event, (data) => {
      clearTimeout(t);
      resolve(data);
    });
  });
}

const s = new Date().getTime();
const userA = { username: `alice_${s}`, fullName: 'Alice Mansour' };
const userB = { username: `bob_${s}`, fullName: 'Bob Nasser' };

const ra = await api('/auth/register', { method: 'POST', body: { ...userA, password: PW } });
const rb = await api('/auth/register', { method: 'POST', body: { ...userB, password: PW } });
check('register A', ra.status === 201);
check('register B', rb.status === 201);

const aId = ra.json.user.id;
const bId = rb.json.user.id;

// ---- password auth ----
const wrongLogin = await api('/auth/login', { method: 'POST', body: { username: userA.username, password: 'wrong-pass' } });
check('wrong password rejected', wrongLogin.status === 401);
const goodLogin = await api('/auth/login', { method: 'POST', body: { username: userA.username, password: PW } });
check('correct password logs in', goodLogin.status === 200 && !!goodLogin.json.token);
const shortPw = await api('/auth/register', {
  method: 'POST',
  body: { username: `short_${s}`, fullName: 'Short Pw', password: 'short' },
});
check('short password rejected', shortPw.status === 400);

// ---- profile: bio + status ----
const patchMe = await api('/auth/me', { method: 'PATCH', token: ra.json.token, body: { bio: 'hello world', status: 'busy' } });
check('bio/status saved', patchMe.json.user.bio === 'hello world' && patchMe.json.user.status === 'busy');
const profA = await api('/users/' + aId, { token: rb.json.token });
check('bio/status in profile view', profA.json.user.bio === 'hello world' && profA.json.user.status === 'busy');

const sa = await connect(ra.json.token);
check('socket A connects', sa.connected);

// Make them friends via REST first, then connect B so presence events flow.
await api('/friends/requests', { method: 'POST', token: ra.json.token, body: { userId: bId } });
const inc = await api('/friends', { token: rb.json.token });
const reqId = inc.json.incoming[0]?.id;
check('friend request visible', !!reqId);
const friendEvent = once(sa, 'friend:request:accepted');
await api(`/friends/requests/${reqId}/accept`, { method: 'POST', token: rb.json.token });
await friendEvent;
check('A got friend:request:accepted', true);

const sb = await connect(rb.json.token);
check('socket B connects', sb.connected);
const presenceEvent = await once(sa, 'presence:update');
check('A sees B online via presence', presenceEvent?.online === true, `online=${presenceEvent?.online}`);

// conversation
const conv = await api('/conversations', { method: 'POST', token: ra.json.token, body: { userId: bId } });
const convoId = conv.json.conversation.id;
check('conversation created', !!convoId);

sa.emit('conversation:join', { conversationId: convoId });
sb.emit('conversation:join', { conversationId: convoId });
await wait(200);

// message with ack + delivery
const received = once(sb, 'message:new');
const ackPromise = new Promise((resolve) =>
  sa.emit('message:send', { conversationId: convoId, type: 'text', body: 'hello bob!', tempId: 't1' }, (r) => {
    resolve(r);
  })
);
const ack = await ackPromise;
check('send acked', ack?.ok === true);
const delivered = await received;
check('B received message', delivered.message.body === 'hello bob!');
check('tempId echoed', delivered.message.tempId === 't1');

// typing
const typingEvt = once(sb, 'typing');
sa.emit('typing:start', { conversationId: convoId });
const typing = await typingEvt;
check('typing event received', typing.isTyping === true && typing.userId === aId);

// read receipts
const readEvt = once(sa, 'message:read');
sb.emit('message:read', { conversationId: convoId, upToMessageId: delivered.message.id });
const read = await readEvt;
check('sender got read receipt', read.readerId === bId);

// reaction
const reactEvt = once(sb, 'message:reaction');
sa.emit('message:react', { conversationId: convoId, messageId: delivered.message.id, emoji: '🔥' }, (r) => {});
const reaction = await reactEvt;
check('reaction delivered', reaction.added === true && reaction.emoji === '🔥');
// toggle off
const reactOff = once(sb, 'message:reaction');
sa.emit('message:react', { conversationId: convoId, messageId: delivered.message.id, emoji: '🔥' }, (r) => {});
const reactionOff = await reactOff;
check('reaction toggled off', reactionOff.added === false);

// notification to user room (B not in convo room when message sent)
sb.emit('conversation:leave', { conversationId: convoId });
await wait(200);
const notif = once(sb, 'notification:message', 8000);
sa.emit('message:send', { conversationId: convoId, type: 'text', body: 'notification check', tempId: 't2' }, (r) => {});
const notifData = await notif;
check('notification:message delivered', notifData.preview === 'notification check');

// unread count reflects for B (message 1 was read via read-receipt, message 2 not)
const convsB = await api('/conversations', { token: rb.json.token });
check('B has 1 unread', convsB.json.conversations[0]?.unread === 1, `unread=${convsB.json.conversations[0]?.unread}`);

// auth rejection
const bad = connectRaw('garbage-token');
const badErr = await new Promise((resolve) => {
  bad.on('connect_error', (e) => resolve(e.message));
  bad.on('connect', () => resolve(null));
});
check('socket rejects bad token', !!badErr);

// non-participant cannot join the conversation room (authz fix)
const rc = await api('/auth/register', { method: 'POST', body: { username: `carol_${s}`, fullName: 'Carol Aziz', password: PW } });
const sc = await connect(rc.json.token);
const leaked = once(sc, 'message:new', 1500).then(() => true, () => false);
sc.emit('conversation:join', { conversationId: convoId });
sa.emit('message:send', { conversationId: convoId, type: 'text', body: 'should not leak', tempId: 't3' }, () => {});
check('non-participant does not receive messages', (await leaked) === false);
sc.disconnect();

// presence: disconnect B -> A sees offline
const gone = once(sa, 'presence:update');
sb.disconnect();
const off = await gone;
check('A sees B offline', off.online === false && !!off.lastSeen);

// ---- block: B blocks A ----
await api(`/users/${aId}/block`, { method: 'POST', token: rb.json.token });

// blocked presence: B reconnects, A must NOT receive presence for B
const hidden = once(sa, 'presence:update', 1200).then(() => true, () => false);
const sb2 = await connect(rb.json.token);
const sawEvent = await hidden;
check('blocked user gets no presence update', sawEvent === false);
sb2.emit('conversation:join', { conversationId: convoId });
await wait(150);

// blocked send
const blockedAck = await new Promise((resolve) =>
  sa.emit('message:send', { conversationId: convoId, type: 'text', body: 'blocked?', tempId: 'tb' }, resolve)
);
check('send blocked by blocklist', blockedAck?.ok === false && blockedAck?.error === 'Message blocked');

// blocked typing (A -> B while B blocked A)
const typingBlocked = once(sb2, 'typing', 1000).then(() => true, () => false);
sa.emit('typing:start', { conversationId: convoId });
check('no typing event to blocker', (await typingBlocked) === false);

// search excludes blocker
const searchBlk = await api(`/users/search?q=${userB.username}`, { token: ra.json.token });
check('blocked-by user hidden from search', searchBlk.json.users.length === 0);

// blocked flag visible to blocker
const bView = await api('/users/' + aId, { token: rb.json.token });
check('blocked flag visible to blocker', bView.json.user.blocked === true);

// unblock -> send works again
await api(`/users/${aId}/block`, { method: 'DELETE', token: rb.json.token });
const okAck = await new Promise((resolve) =>
  sa.emit('message:send', { conversationId: convoId, type: 'text', body: 'unblocked!', tempId: 'tu' }, resolve)
);
check('send works after unblock', okAck?.ok === true);

// ---- edit message (sender only) ----
const editEvt = once(sb2, 'message:edited');
sa.emit('message:edit', { conversationId: convoId, messageId: delivered.message.id, body: 'hello bob! (edited)' }, () => {});
const edit = await editEvt;
check('edit delivered to peer', edit.body === 'hello bob! (edited)' && !!edit.editedAt);
const noEdit = await new Promise((resolve) =>
  sb2.emit('message:edit', { conversationId: convoId, messageId: delivered.message.id, body: 'hijack' }, resolve)
);
check('non-sender cannot edit', noEdit?.ok === false);
const emptyEdit = await new Promise((resolve) =>
  sa.emit('message:edit', { conversationId: convoId, messageId: delivered.message.id, body: '  ' }, resolve)
);
check('empty edit rejected', emptyEdit?.ok === false);

// ---- delete for everyone (sender only) ----
const delEvt = once(sb2, 'message:deleted');
sa.emit('message:delete', { conversationId: convoId, messageId: delivered.message.id }, () => {});
const del = await delEvt;
check('delete delivered to peer', del.messageId === delivered.message.id);
const noDel = await new Promise((resolve) =>
  sb2.emit('message:delete', { conversationId: convoId, messageId: delivered.message.id }, resolve)
);
check('non-sender cannot delete', noDel?.ok === false);
const restMsgs = await api(`/conversations/${convoId}/messages?limit=10`, { token: ra.json.token });
const delMsg = restMsgs.json.messages.find((m) => m.id === delivered.message.id);
check('deleted message tombstoned', delMsg?.deleted === true && delMsg?.body === null);

// ---- in-conversation search ----
const searchRes = await api(`/conversations/${convoId}/messages/search?q=${encodeURIComponent('notification check')}`, {
  token: ra.json.token,
});
check('in-chat search finds text', searchRes.json.messages.some((m) => m.body === 'notification check'));
const searchDel = await api(`/conversations/${convoId}/messages/search?q=${encodeURIComponent('hello bob')}`, {
  token: ra.json.token,
});
check('search excludes deleted messages', searchDel.json.messages.length === 0);

// ---- username editing ----
const conflict = await api('/auth/me', { method: 'PATCH', token: rb.json.token, body: { username: userA.username } });
check('username conflict rejected', conflict.status === 409);
const renamed = await api('/auth/me', { method: 'PATCH', token: rb.json.token, body: { username: userB.username + '_x' } });
check('username updated', renamed.json.user.username === userB.username + '_x');

// ---- chat rooms: create / join / realtime / leave / owner transfer / delete ----
const roomRes = await api('/rooms', { method: 'POST', token: ra.json.token, body: { name: 'Study Room', description: 'Test room' } });
const roomId = roomRes.json.room?.id;
check('room created', roomRes.status === 201 && roomRes.json.room.member === true);
const badRoom = await api('/rooms', { method: 'POST', token: ra.json.token, body: { name: '' } });
check('empty room name rejected', badRoom.status === 400);

const roomsA = await api('/rooms', { token: ra.json.token });
check('creator sees room in list', roomsA.json.rooms.some((r) => r.id === roomId));
const roomsB = await api('/rooms', { token: rb.json.token });
check('non-member sees room as joinable', roomsB.json.rooms.some((r) => r.id === roomId && r.member === false));

sa.emit('room:join', { roomId });
const joinedEvt = once(sa, 'room:member:joined');
const joinRes = await api(`/rooms/${roomId}/join`, { method: 'POST', token: rb.json.token });
check('B joined room', joinRes.status === 200 && joinRes.json.room.member === true);
const joined = await joinedEvt;
check('A got room:member:joined', joined.memberCount === 2 && joined.member.id === bId);
sb2.emit('room:join', { roomId });
await wait(200);

const roomMsg = once(sb2, 'message:new');
const roomAck = await new Promise((resolve) =>
  sa.emit('message:send', { roomId, type: 'text', body: 'room hello', tempId: 'r1' }, resolve)
);
check('room send acked', roomAck?.ok === true);
const roomDelivered = await roomMsg;
check('room message delivered', roomDelivered.message.body === 'room hello' && roomDelivered.message.roomId === roomId);
check('room context in payload', roomDelivered.room?.id === roomId && roomDelivered.conversation === undefined);

const roomListAfter = await api('/rooms', { token: rb.json.token });
const roomRow = roomListAfter.json.rooms.find((r) => r.id === roomId);
check('room list tracks last sender', roomRow?.lastMessageSenderId === aId);

const roomTyping = once(sb2, 'typing');
sa.emit('typing:start', { roomId });
const rt = await roomTyping;
check('room typing received', rt.roomId === roomId && rt.isTyping === true);

const roomReact = once(sb2, 'message:reaction');
sa.emit('message:react', { roomId, messageId: roomDelivered.message.id, emoji: '👍' }, () => {});
const rr = await roomReact;
check('room reaction delivered', rr.roomId === roomId && rr.added === true);

// non-member cannot send to a room
const sc2 = await connect(rc.json.token);
const outsiderAck = await new Promise((resolve) =>
  sc2.emit('message:send', { roomId, type: 'text', body: 'nope' }, resolve)
);
check('non-member room send rejected', outsiderAck?.ok === false);
sc2.disconnect();

const detail = await api(`/rooms/${roomId}`, { token: ra.json.token });
check('room detail lists members', detail.json.room.memberCount === 2 && detail.json.room.members.some((m) => m.id === bId));

const roomMsgs = await api(`/rooms/${roomId}/messages?limit=10`, { token: ra.json.token });
check('room messages listed', roomMsgs.json.messages.some((m) => m.body === 'room hello'));
const roomSearch = await api(`/rooms/${roomId}/messages/search?q=hello`, { token: ra.json.token });
check('room search works', roomSearch.json.messages.some((m) => m.body === 'room hello'));

const leftEvt = once(sa, 'room:member:left');
const leaveRes = await api(`/rooms/${roomId}/leave`, { method: 'POST', token: rb.json.token });
await leftEvt;
check('B left room', leaveRes.status === 200 && leaveRes.json.room.memberCount === 1);
const afterLeave = await api(`/rooms/${roomId}/messages`, { token: rb.json.token });
check('left member cannot fetch messages', afterLeave.status === 404);

const joinAgain = await api(`/rooms/${roomId}/join`, { method: 'POST', token: rb.json.token });
check('B re-joined', joinAgain.status === 200);
await wait(100);
const ownerLeave = await api(`/rooms/${roomId}/leave`, { method: 'POST', token: ra.json.token });
check('ownership transfers when owner leaves', ownerLeave.json.room.ownerId === bId && ownerLeave.json.room.memberCount === 1);
const delRoom = await api(`/rooms/${roomId}`, { method: 'DELETE', token: rb.json.token });
check('owner can delete room', delRoom.status === 200);
const roomsAfter = await api('/rooms', { token: rb.json.token });
check('deleted room gone from list', !roomsAfter.json.rooms.some((r) => r.id === roomId));

// ---- room identity: avatarColor + owner-editable details ----
const colorRoom = await api('/rooms', {
  method: 'POST',
  token: ra.json.token,
  body: { name: 'Color Room', description: 'colored', avatarColor: '#0EA5E9' },
});
const colorRoomId = colorRoom.json.room?.id;
check('room created with avatarColor', colorRoom.status === 201 && colorRoom.json.room.avatarColor === '#0EA5E9');
const badColorCreate = await api('/rooms', {
  method: 'POST',
  token: ra.json.token,
  body: { name: 'Bad Color', avatarColor: 'blue' },
});
check('invalid avatarColor rejected on create', badColorCreate.status === 400);

const colorList = await api('/rooms', { token: ra.json.token });
check('avatarColor round-trips in room list', colorList.json.rooms.some((r) => r.id === colorRoomId && r.avatarColor === '#0EA5E9'));

const patchRes = await api(`/rooms/${colorRoomId}`, {
  method: 'PATCH',
  token: ra.json.token,
  body: { name: 'Renamed Room', description: 'new desc', avatarColor: '#DB2777' },
});
check(
  'owner can update room details',
  patchRes.status === 200 &&
    patchRes.json.room.name === 'Renamed Room' &&
    patchRes.json.room.description === 'new desc' &&
    patchRes.json.room.avatarColor === '#DB2777'
);

const patchOther = await api(`/rooms/${colorRoomId}`, {
  method: 'PATCH',
  token: rb.json.token,
  body: { name: 'Hijack' },
});
check('non-owner cannot update room', patchOther.status === 404);

const patchBadColor = await api(`/rooms/${colorRoomId}`, {
  method: 'PATCH',
  token: ra.json.token,
  body: { avatarColor: 'not-a-color' },
});
check('invalid avatarColor rejected on patch', patchBadColor.status === 400);

const patchDetail = await api(`/rooms/${colorRoomId}`, { token: ra.json.token });
check(
  'updated room details persist',
  patchDetail.json.room.name === 'Renamed Room' && patchDetail.json.room.avatarColor === '#DB2777'
);

await api(`/rooms/${colorRoomId}`, { method: 'DELETE', token: ra.json.token });

// ---- message replies ----
const replyTargetAck = await new Promise((resolve) =>
  sa.emit('message:send', { conversationId: convoId, type: 'text', body: 'reply target message', tempId: 'rp1' }, resolve)
);
check('reply target send acked', replyTargetAck?.ok === true);
const replyTargetId = replyTargetAck?.message?.id;

const replyDelivered = once(sa, 'message:new');
const replyAck = await new Promise((resolve) =>
  sb2.emit(
    'message:send',
    { conversationId: convoId, type: 'text', body: 'replying to you!', replyToId: replyTargetId, tempId: 'rp2' },
    resolve
  )
);
check('reply send acked', replyAck?.ok === true);
const rp = replyAck?.message?.replyTo;
check('replyTo snapshot attached', !!rp && rp.messageId === replyTargetId);
check('replyTo senderName captured', rp?.senderName === 'Alice Mansour');
check('replyTo body preview captured', rp?.body === 'reply target message');
check('replyTo mediaType captured', rp?.mediaType === 'text');
const replyMsg = await replyDelivered;
check('reply delivered to peer with snapshot', replyMsg.message?.replyTo?.messageId === replyTargetId);

// snapshot is frozen: deleting the original never changes the reply snapshot
const snapDel = await new Promise((resolve) =>
  sa.emit('message:delete', { conversationId: convoId, messageId: replyTargetId }, resolve)
);
check('reply original deletable', snapDel?.ok === true);
const snapFetch = await api(`/conversations/${convoId}/messages?limit=30`, { token: ra.json.token });
const snapReply = snapFetch.json.messages.find((m) => m.body === 'replying to you!');
check(
  'reply snapshot survives original deletion',
  snapReply?.replyTo?.body === 'reply target message' && snapReply?.replyTo?.senderName === 'Alice Mansour'
);

// cross-conversation reply rejected: target lives in the A<->C convo
const carolConvo = await api('/conversations', { method: 'POST', token: ra.json.token, body: { userId: rc.json.user.id } });
const carolConvoId = carolConvo.json.conversation.id;
const carolMsgAck = await new Promise((resolve) =>
  sa.emit('message:send', { conversationId: carolConvoId, type: 'text', body: 'for carol only', tempId: 'rp4' }, resolve)
);
const crossAck = await new Promise((resolve) =>
  sb2.emit(
    'message:send',
    { conversationId: convoId, type: 'text', body: 'wrong convo', replyToId: carolMsgAck?.message?.id, tempId: 'rp5' },
    resolve
  )
);
check('cross-conversation reply rejected', crossAck?.ok === false);

// non-existent replyToId rejected
const ghostAck = await new Promise((resolve) =>
  sb2.emit(
    'message:send',
    { conversationId: convoId, type: 'text', body: 'ghost reply', replyToId: '000000000000000000000000', tempId: 'rp6' },
    resolve
  )
);
check('non-existent replyToId rejected', ghostAck?.ok === false);

// REST reply path (replying to the now-deleted original is allowed: snapshot
// body comes back empty while senderName/mediaType stay)
const restReply = await api(`/conversations/${convoId}/messages`, {
  method: 'POST',
  token: rb.json.token,
  body: { type: 'text', body: 'rest reply', replyToId: replyTargetId },
});
check(
  'REST reply works',
  restReply.status === 201 &&
    restReply.json.message?.replyTo?.messageId === replyTargetId &&
    restReply.json.message?.replyTo?.senderName === 'Alice Mansour' &&
    restReply.json.message?.replyTo?.body === '' &&
    restReply.json.message?.replyTo?.mediaType === 'text'
);

// room reply via socket
const replyRoom = await api('/rooms', { method: 'POST', token: ra.json.token, body: { name: 'Reply Room' } });
const replyRoomId = replyRoom.json.room?.id;
await api(`/rooms/${replyRoomId}/join`, { method: 'POST', token: rb.json.token });
sa.emit('room:join', { roomId: replyRoomId });
sb2.emit('room:join', { roomId: replyRoomId });
await wait(200);
const roomTarget = await new Promise((resolve) =>
  sa.emit('message:send', { roomId: replyRoomId, type: 'text', body: 'room reply target', tempId: 'rr1' }, resolve)
);
check('room reply target acked', roomTarget?.ok === true);
const roomReply = await new Promise((resolve) =>
  sb2.emit(
    'message:send',
    { roomId: replyRoomId, type: 'text', body: 'room reply!', replyToId: roomTarget?.message?.id, tempId: 'rr2' },
    resolve
  )
);
check(
  'room reply via socket works',
  roomReply?.ok === true &&
    roomReply?.message?.replyTo?.messageId === roomTarget?.message?.id &&
    roomReply?.message?.replyTo?.senderName === 'Alice Mansour' &&
    roomReply?.message?.replyTo?.body === 'room reply target'
);
await api(`/rooms/${replyRoomId}`, { method: 'DELETE', token: ra.json.token });

sb2.disconnect();
sa.disconnect();

console.log(log.join('\n'));
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
