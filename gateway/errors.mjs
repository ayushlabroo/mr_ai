export class GatewayError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
export class ProviderError extends Error {
  constructor(message, definitelyRejected = false, requiresReview = false) {
    super(message);
    this.definitelyRejected = definitelyRejected;
    this.requiresReview = requiresReview;
  }
}
