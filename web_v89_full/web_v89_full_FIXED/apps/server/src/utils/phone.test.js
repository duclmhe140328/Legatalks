import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone } from './phone.js';

test('normalize Vietnamese local phone number', () => {
  assert.equal(normalizePhone('0901 111 111'), '84901111111');
});

test('keep international digits without plus sign', () => {
  assert.equal(normalizePhone('+84 902 222 222'), '84902222222');
});

test('remove international 00 prefix', () => {
  assert.equal(normalizePhone('0084903333333'), '84903333333');
});
