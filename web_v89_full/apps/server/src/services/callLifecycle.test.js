import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCallChatEvent } from './callLifecycle.js';

test('build one stable chat event for each call session', () => {
  const endedAt = new Date('2026-06-20T10:03:15.000Z');
  const event = buildCallChatEvent({
    _id: '507f1f77bcf86cd799439011',
    conversation: '507f191e810c19729de860ea',
    startedBy: { _id: '507f191e810c19729de860eb', displayName: 'An' },
    mode: 'voice',
    status: 'ended',
    startedAt: new Date('2026-06-20T10:00:00.000Z'),
    answeredAt: new Date('2026-06-20T10:01:00.000Z'),
    endedAt
  });

  assert.equal(event._id, 'call-event-507f1f77bcf86cd799439011');
  assert.equal(event.conversation, '507f191e810c19729de860ea');
  assert.equal(event.metadata.callSessionId, '507f1f77bcf86cd799439011');
  assert.equal(event.metadata.durationSeconds, 135);
  assert.match(event.text, /2 phút 15 giây/);
  assert.equal(new Date(event.createdAt).toISOString(), endedAt.toISOString());
});

test('missed call event remains distinct from later calls', () => {
  const first = buildCallChatEvent({
    _id: '507f1f77bcf86cd799439012',
    conversation: '507f191e810c19729de860ea',
    startedBy: '507f191e810c19729de860eb',
    mode: 'video',
    status: 'missed',
    startedAt: new Date('2026-06-20T11:00:00.000Z'),
    endedAt: new Date('2026-06-20T11:01:00.000Z')
  });
  const second = buildCallChatEvent({
    _id: '507f1f77bcf86cd799439013',
    conversation: '507f191e810c19729de860ea',
    startedBy: '507f191e810c19729de860eb',
    mode: 'video',
    status: 'missed',
    startedAt: new Date('2026-06-20T12:00:00.000Z'),
    endedAt: new Date('2026-06-20T12:01:00.000Z')
  });
  assert.notEqual(first._id, second._id);
  assert.equal(first.text, 'Cuộc gọi video nhỡ');
  assert.equal(second.text, 'Cuộc gọi video nhỡ');
});
