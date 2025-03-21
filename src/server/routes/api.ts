/**
 * API route definitions
 */
import express from 'express';
import * as apiController from '../controllers/api';

const router = express.Router();

/**
 * @route   POST /api/start
 * @desc    Start a new agent session
 */
router.post('/start', apiController.startSession);

/**
 * @route   POST /api/query
 * @desc    Submit a query to the agent
 */
router.post('/query', apiController.submitQuery);

/**
 * @route   POST /api/abort
 * @desc    Abort current operation
 */
router.post('/abort', apiController.abortOperation);

/**
 * @route   GET /api/history
 * @desc    Get conversation history
 */
router.get('/history', apiController.getHistory);

/**
 * @route   GET /api/status
 * @desc    Get current agent status
 */
router.get('/status', apiController.getStatus);

export default router;