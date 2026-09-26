class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

module.exports = {
  AppError,
  badRequest: (msg, details) => new AppError(400, msg, details),
  unauthorized: (msg = 'Authentication required') => new AppError(401, msg),
  forbidden: (msg = 'You do not have permission for this action') => new AppError(403, msg),
  notFound: (what = 'Resource') => new AppError(404, `${what} not found`),
  conflict: (msg) => new AppError(409, msg),
};
