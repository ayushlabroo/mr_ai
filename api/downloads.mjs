import { downloadsResponse } from '../gateway/downloads.mjs';

export default { fetch: (request) => downloadsResponse(request) };
