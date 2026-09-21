// Express 4 does not catch a rejected promise thrown from an `async`
// route handler — it becomes an unhandled rejection and, on modern
// Node, crashes the whole process (taking down every connected user's
// session, not just the one bad request). Wrap every async handler with
// this so failures become a normal 500 response instead.
export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
