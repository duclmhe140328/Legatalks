import User from '../models/User.js';

const sameId = (a, b) => String(a?._id || a || '') === String(b?._id || b || '');

export async function hiddenUserIdsFor(viewer) {
  const ownBlocked = (viewer?.blockedUsers || []).map((id) => String(id));
  const blockedBy = await User.find({ blockedUsers: viewer._id }).distinct('_id');
  return [...new Set([...ownBlocked, ...blockedBy.map(String)])];
}

export async function usersAreBlocked(viewer, targetId) {
  if (!viewer || !targetId || sameId(viewer._id, targetId)) return false;
  if ((viewer.blockedUsers || []).some((id) => sameId(id, targetId))) return true;
  return Boolean(await User.exists({ _id: targetId, blockedUsers: viewer._id }));
}

export function isSameUser(a, b) {
  return sameId(a, b);
}
