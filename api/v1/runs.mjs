import { previewEndpoint } from '../../gateway/hosted-preview.mjs';

export default { fetch: (request) => previewEndpoint('runs', request) };
