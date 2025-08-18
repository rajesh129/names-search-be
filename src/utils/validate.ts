import { ZodSchema } from 'zod';
import { RequestHandler } from 'express';
import { HttpError } from './httpError';

export const validateBody = <T>(schema: ZodSchema<T>): RequestHandler =>
  (req, _res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return next(new HttpError(400, 'Invalid payload', parsed.error.flatten()));
    }
    // attach parsed data for downstream
    (req as any).input = parsed.data;
    next();
  };
