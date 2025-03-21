/**
 * API controller tests
 */
import { Request, Response, NextFunction } from 'express';
import * as apiController from '../api';
import { sessionManager } from '../../services/SessionManager';
import { SessionState } from '../../../types';

// Mock session manager
jest.mock('../../services/SessionManager', () => {
  const mockSession = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    createdAt: new Date('2023-01-01T00:00:00.000Z'),
    lastActiveAt: new Date('2023-01-01T01:00:00.000Z'),
    state: { conversationHistory: [] } as SessionState,
    isProcessing: false,
  };
  
  return {
    sessionManager: {
      createSession: jest.fn().mockReturnValue(mockSession),
      getSession: jest.fn().mockReturnValue(mockSession),
      updateSession: jest.fn().mockReturnValue({
        ...mockSession,
        lastActiveAt: new Date('2023-01-01T02:00:00.000Z'),
      }),
      deleteSession: jest.fn(),
      getAllSessions: jest.fn().mockReturnValue([mockSession]),
    },
  };
});

describe('API Controller', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    mockRequest = {
      body: {},
      query: {},
    };
    
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    
    nextFunction = jest.fn();
    
    jest.clearAllMocks();
  });

  describe('startSession', () => {
    it('should create a new session and return the session info', async () => {
      await apiController.startSession(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(sessionManager.createSession).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
        createdAt: '2023-01-01T00:00:00.000Z',
        lastActiveAt: '2023-01-01T01:00:00.000Z',
        isProcessing: false,
      });
    });
  });

  describe('submitQuery', () => {
    it('should process a query and return accepted status', async () => {
      mockRequest.body = {
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
        query: 'test query',
      };

      await apiController.submitQuery(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(sessionManager.getSession).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000');
      expect(sessionManager.updateSession).toHaveBeenCalledWith(
        '123e4567-e89b-12d3-a456-426614174000',
        { isProcessing: true }
      );
      expect(mockResponse.status).toHaveBeenCalledWith(202);
      expect(mockResponse.json).toHaveBeenCalledWith({
        accepted: true,
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
        message: 'Query accepted for processing',
      });
    });
  });

  describe('abortOperation', () => {
    it('should abort the current operation and return success', async () => {
      mockRequest.body = {
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
      };

      await apiController.abortOperation(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(sessionManager.getSession).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000');
      expect(sessionManager.updateSession).toHaveBeenCalledWith(
        '123e4567-e89b-12d3-a456-426614174000',
        { isProcessing: false }
      );
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
        message: 'Operation aborted',
      });
    });
  });

  describe('getHistory', () => {
    it('should return the conversation history', async () => {
      mockRequest.query = {
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
      };

      await apiController.getHistory(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(sessionManager.getSession).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000');
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
        history: [],
      });
    });
  });

  describe('getStatus', () => {
    it('should return the current agent status', async () => {
      mockRequest.query = {
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
      };

      await apiController.getStatus(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(sessionManager.getSession).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000');
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
        isProcessing: false,
        lastActiveAt: '2023-01-01T01:00:00.000Z',
      });
    });
  });
});