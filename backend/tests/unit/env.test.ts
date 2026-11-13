import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getEnv, resetEnvCache } from '../../src/config/env.js';

describe('Environment Variable Parsing & Zod Validation', () => {
  const baseValid = {
    USERS_TABLE: 'MarqueUsers',
    EVENTS_TABLE: 'MarqueEvents',
    EVENT_STAFF_TABLE: 'MarqueEventStaff',
    RSVPS_TABLE: 'MarqueRSVPs',
    WAITLIST_TABLE: 'MarqueWaitlist',
    TICKETS_TABLE: 'MarqueTickets',
    S3_BUCKET: 'actual-s3-bucket-name',
    JWT_SECRET: 'super-secret-key-that-is-at-least-32-chars-long',
  };

  test('successfully parses when BOOTSTRAP_SECRET is omitted', () => {
    resetEnvCache();
    const config = getEnv(baseValid);
    assert.equal(config.USERS_TABLE, 'MarqueUsers');
    assert.equal(config.BOOTSTRAP_SECRET, undefined);
    assert.equal(config.AWS_REGION, 'us-east-1');
  });

  test('normalizes empty string BOOTSTRAP_SECRET ("") to undefined and succeeds', () => {
    resetEnvCache();
    const config = getEnv({
      ...baseValid,
      BOOTSTRAP_SECRET: '',
    });
    assert.equal(config.USERS_TABLE, 'MarqueUsers');
    assert.equal(config.BOOTSTRAP_SECRET, undefined);
  });

  test('normalizes whitespace-only BOOTSTRAP_SECRET ("   ") to undefined and succeeds', () => {
    resetEnvCache();
    const config = getEnv({
      ...baseValid,
      BOOTSTRAP_SECRET: '   ',
    });
    assert.equal(config.USERS_TABLE, 'MarqueUsers');
    assert.equal(config.BOOTSTRAP_SECRET, undefined);
  });

  test('successfully parses when valid BOOTSTRAP_SECRET is provided', () => {
    resetEnvCache();
    const config = getEnv({
      ...baseValid,
      BOOTSTRAP_SECRET: 'valid-secret-16-chars',
    });
    assert.equal(config.BOOTSTRAP_SECRET, 'valid-secret-16-chars');
  });

  test('throws Zod validation error when required table is missing', () => {
    resetEnvCache();
    const invalid = {
      USERS_TABLE: 'MarqueUsers',
    };
    assert.throws(() => getEnv(invalid as any));
  });

  test('rejects non-empty BOOTSTRAP_SECRET shorter than 16 characters', () => {
    resetEnvCache();
    const shortBootstrap = {
      ...baseValid,
      BOOTSTRAP_SECRET: 'too-short',
    };
    assert.throws(() => getEnv(shortBootstrap));
  });

  test('rejects JWT_SECRET shorter than 32 characters', () => {
    resetEnvCache();
    const shortSecret = {
      ...baseValid,
      JWT_SECRET: 'short-key',
    };
    assert.throws(() => getEnv(shortSecret));
  });
});
