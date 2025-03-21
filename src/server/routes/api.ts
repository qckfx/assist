/**
 * API route definitions
 */
import { Router } from 'express';
import * as apiController from '../controllers/api';
import { validateBody, validateQuery } from '../middleware/validation';
import {
  startSessionSchema,
  querySchema,
  abortSchema,
  historySchema,
  statusSchema,
} from '../schemas/api';

const router = Router();

/**
 * @route   POST /api/start
 * @desc    Start a new agent session
 */
router.post('/start', validateBody(startSessionSchema), apiController.startSession);

/**
 * @route   POST /api/query
 * @desc    Submit a query to the agent
 */
router.post('/query', validateBody(querySchema), apiController.submitQuery);

/**
 * @route   POST /api/abort
 * @desc    Abort current operation
 */
router.post('/abort', validateBody(abortSchema), apiController.abortOperation);

/**
 * @route   GET /api/history
 * @desc    Get conversation history
 */
router.get('/history', validateQuery(historySchema), apiController.getHistory);

/**
 * @route   GET /api/status
 * @desc    Get current agent status
 */
router.get('/status', validateQuery(statusSchema), apiController.getStatus);

export default router;