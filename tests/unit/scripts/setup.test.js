import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  keysToFill,
  localNameOf,
  majorVersion,
  pnpmVersion,
} from '../../../scripts/setup.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const example = readFileSync(path.join(root, '.env.example'), 'utf8');

test('majorVersion reads node, .nvmrc and packageManager forms', () => {
  assert.equal(majorVersion('v26.13.0'), 26);
  assert.equal(majorVersion('26'), 26);
  assert.equal(majorVersion('pnpm@11.14.0'), 11);
  assert.equal(majorVersion(''), null);
});

test('pnpmVersion reads packageManager and the pnpm user agent', () => {
  assert.equal(pnpmVersion('pnpm@11.14.0'), '11.14.0');
  assert.equal(pnpmVersion('pnpm/11.14.0 npm/? node/v26.13.0 linux x64'), '11.14.0');
  assert.equal(pnpmVersion('npm/11.0.0 node/v26.13.0'), null);
});

test('localNameOf drops only the .example suffix', () => {
  assert.equal(localNameOf('.env.example'), '.env');
  assert.equal(localNameOf('config/app.env.example'), 'config/app.env');
});

test('a fresh copy of .env.example asks for the Cloudflare token and nothing else', () => {
  assert.deepEqual(keysToFill(example, example), [{ key: 'CF_API_TOKEN', reason: 'placeholder' }]);
});

test('a filled-in .env has nothing left to fill, and optional keys stay optional', () => {
  const env = example.replace(/^CF_API_TOKEN=.*$/m, 'CF_API_TOKEN=real-looking-token');
  assert.deepEqual(keysToFill(env, example), []);
});

test('an empty key is reported by name and the result never carries a value', () => {
  const env = 'CF_API_TOKEN=secret-value-123\nCF_ACCOUNT_ID=\nSESSION_COOKIE_SECURE=true # https\n';
  const pending = keysToFill(env, example);
  assert.deepEqual(pending, [{ key: 'CF_ACCOUNT_ID', reason: 'empty' }]);
  assert.ok(!JSON.stringify(pending).includes('secret-value-123'));
});
