import { RequestHandler } from 'express';
import { SearchRequestSchema } from '../types/dtos';
import { verifyRecaptcha } from '../middleware/recaptcha';
import { validateBody } from '../utils/validate';
import { searchNames } from '../services/names.service';

/** POST /api/names/search */
export const searchNamesHandlers: RequestHandler[] = [
  verifyRecaptcha,
  validateBody(SearchRequestSchema),
  async (req, res, next) => {
    try {
      const input = (req as any).input; // parsed DTO
      const result = await searchNames(input);
      res.json(result);
    } catch (e) { next(e); }
  }
];

/** Stubs for future expansion (update/delete/details) */
export const updateName: RequestHandler = async (_req, res) => {
  // TODO: implement service + repo
  res.status(501).json({ error: 'Not implemented' });
};

export const deleteName: RequestHandler = async (_req, res) => {
  res.status(501).json({ error: 'Not implemented' });
};

export const getNameDetails: RequestHandler = async (_req, res) => {
  res.status(501).json({ error: 'Not implemented' });
};
