import { RequestHandler } from 'express';
import { Env } from '../config/env';
import { HttpError } from '../utils/httpError';

export const verifyRecaptcha: RequestHandler = async (req, _res, next) => {
  try {
    if (!Env.RECAPTCHA_ENABLED) return next();
    if (!Env.RECAPTCHA_SECRET) throw new HttpError(500, 'reCAPTCHA not configured');

    const token = req.header('x-recaptcha-token') || (req.body?.recaptchaToken as string | undefined);
    if (!token) throw new HttpError(400, 'Missing reCAPTCHA token');

    const params = new URLSearchParams();
    params.append('secret', Env.RECAPTCHA_SECRET);
    params.append('response', token);

    const resp = await fetch('https://www.google.com/recaptcha/api/siteverify', { method: 'POST', body: params });
    const data = await resp.json() as { success: boolean; score?: number; action?: string; 'error-codes'?: string[] };

    if (!data.success) throw new HttpError(403, 'reCAPTCHA verification failed', data['error-codes']);
    if (Env.RECAPTCHA_EXPECT_ACTION && data.action && data.action !== Env.RECAPTCHA_EXPECT_ACTION) {
      throw new HttpError(403, `reCAPTCHA action mismatch (${data.action})`);
    }
    if (typeof data.score === 'number' && data.score < Env.RECAPTCHA_MIN_SCORE) {
      throw new HttpError(403, `Low reCAPTCHA score (${data.score})`);
    }
    next();
  } catch (e) {
    next(e);
  }
};
