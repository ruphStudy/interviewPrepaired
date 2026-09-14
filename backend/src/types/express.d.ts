// Global Express.Request augmentation (PR-OPS-3) — adds `requestId`, set by
// middleware/requestId.ts, so both the plain `Request` type and `AuthRequest`
// (which extends it — see middleware/auth.ts) see it without duplicating a
// separate request-shape interface.
declare namespace Express {
  export interface Request {
    requestId?: string;
  }
}
