import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateDeploymentDeleteRequest } from '../../../../src/api/server/routes/deployments/validation.js';

test('deployment deletion accepts ordinary Cloudflare deployment ids', () => {
  assert.equal(
    validateDeploymentDeleteRequest({
      deploymentIds: ['3f1c9a2e-8b7d-4e6f-9a0b-1c2d3e4f5a6b', '  abc.1_x-y  '],
    }),
    null,
  );
});

test('deployment deletion rejects dot segments that would resolve to the project URL', () => {
  for (const id of ['.', '..', ' .. ', '\t.\n']) {
    assert.notEqual(
      validateDeploymentDeleteRequest({ deploymentIds: ['abc', id] }),
      null,
      `expected ${JSON.stringify(id)} to be rejected`,
    );
  }
});

test('deployment deletion still accepts ids that merely contain dots', () => {
  assert.equal(validateDeploymentDeleteRequest({ deploymentIds: ['...', 'a..b', '.a'] }), null);
});
