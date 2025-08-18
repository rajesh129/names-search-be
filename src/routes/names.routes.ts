import { Router } from 'express';
import { searchNamesHandlers, updateName, deleteName, getNameDetails } from '../controllers/names.controller';

const router = Router();

router.post('/search', ...searchNamesHandlers);
router.post('/update', updateName);
router.post('/delete', deleteName);
router.post('/details', getNameDetails);

export default router;
