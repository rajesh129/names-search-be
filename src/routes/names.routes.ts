import { Router } from 'express';
import { searchNamesHandlers, updateName, deleteName, getNameDetails, bulkPublishHandlers } from '../controllers/names.controller';
import { requireAuth, requireRole, verifyCsrf } from '../middleware/auth';

const router = Router();

router.post('/search', ...searchNamesHandlers);
router.post('/update', updateName);
router.post('/delete', deleteName);
router.post('/details', getNameDetails);
router.post('/bulk', requireAuth, requireRole('admin'), verifyCsrf, ...bulkPublishHandlers);

export default router;
