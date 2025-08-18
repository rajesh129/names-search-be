import { ErrorRequestHandler } from 'express';
import { HttpError } from '../utils/httpError';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = err instanceof HttpError ? err.status : 500;
  const payload: any = { error: err.message || 'Internal server error' };
  if (err instanceof HttpError && err.details) payload.details = err.details;
  // eslint-disable-next-line no-console
  console.error('ERROR', status, err);
  res.status(status).json(payload);
};
