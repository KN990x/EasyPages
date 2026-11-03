import { validateProjectNameParam } from '../projectName.js';

const MAX_DELETE_DEPLOYMENT_IDS = 500;

const DEPLOYMENT_ID_REGEX = /^[A-Za-z0-9._-]{1,128}$/;

// "." and ".." pass the character set and survive encodeURIComponent, and axios resolves
// dot segments when it parses the URL: ".." turned DELETE .../deployments/<id> into a
// DELETE of the whole project.
const DOT_SEGMENT_REGEX = /^\.{1,2}$/;

const isValidDeploymentId = (value) => {
  if (typeof value !== 'string') {
    return false;
  }
  const id = value.trim();
  return DEPLOYMENT_ID_REGEX.test(id) && !DOT_SEGMENT_REGEX.test(id);
};

export { validateProjectNameParam };

export const validateDeploymentDeleteRequest = (body) => {
  if (!Array.isArray(body?.deploymentIds) || body.deploymentIds.length === 0) {
    return 'No deployment IDs were provided.';
  }

  if (body.deploymentIds.length > MAX_DELETE_DEPLOYMENT_IDS) {
    return `Too many deployment IDs to delete (maximum ${MAX_DELETE_DEPLOYMENT_IDS}).`;
  }

  if (!body.deploymentIds.every(isValidDeploymentId)) {
    return 'Every deployment ID must be a non-empty string.';
  }

  return null;
};
