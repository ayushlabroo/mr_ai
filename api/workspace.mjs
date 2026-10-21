import { createCloudAPI } from '../gateway/cloud.mjs';
export default { fetch: (request) => createCloudAPI()('workspace', request) };
