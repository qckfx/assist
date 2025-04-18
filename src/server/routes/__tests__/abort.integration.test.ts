/**
 * Abort API Integration Tests
 */
import request from 'supertest';
import express from 'express';
import { json } from 'express';
import apiRoutes from '../../routes/api';
import { errorHandler } from '../../middleware/errorHandler';

// Mock E2B to avoid dependency issues
jest.mock('../../../utils/E2BExecutionAdapter');
jest.mock('../../../utils/LocalExecutionAdapter');

// Mock session manager
jest.mock('../../services/SessionManager', () => {
  const mockSession = {
    id: '123e4567-e89b-12d3-a456-426614174001',
    createdAt: new Date('2023-01-01T00:00:00.000Z'),
    lastActiveAt: new Date('2023-01-01T01:00:00.000Z'),
    state: { 
      abortController: new AbortController(),
      contextWindow: { getMessages: () => [], getLength: () => 0, pushUser: jest.fn() }
    },
    isProcessing: false,
  };

  return {
    sessionManager: {
      createSession: jest.fn().mockReturnValue({
        ...mockSession,
        id: '123e4567-e89b-12d3-a456-426614174001',
      }),
      getSession: jest.fn().mockImplementation((id) => {
        if (id === '123e4567-e89b-12d3-a456-426614174000' || id === '123e4567-e89b-12d3-a456-426614174002') {
          return { 
            ...mockSession, 
            id, 
            isProcessing: id === '123e4567-e89b-12d3-a456-426614174000' 
          };
        }
        throw new Error('Session not found');
      }),
      updateSession: jest.fn(),
      deleteSession: jest.fn(),
    },
  };
});

// Mock with proper structure - this needs to be before any imports
// The simplest solution is to mock just what's needed
jest.mock('../../services/AgentService', () => {
  // Create the shared EventEmitter
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const EventEmitter = require('events').EventEmitter;
  const eventEmitter = new EventEmitter();
  
  // Create a mock agent service class that extends EventEmitter
  class MockAgentService extends EventEmitter {
    constructor() {
      super();
      // Copy the eventEmitter methods for our test
      this.on = eventEmitter.on.bind(eventEmitter);
      this.emit = eventEmitter.emit.bind(eventEmitter);
    }
    
    abortOperation(sessionId: string): boolean {
      if (sessionId === '123e4567-e89b-12d3-a456-426614174000') {
        // Emit abort event for this session
        this.emit('processing:aborted', { sessionId });
        return true;
      }
      return false;
    }
    
    startSession(): Record<string, never> {
      return {};
    }
  }
  
  // Create singleton instance
  const instance = new MockAgentService();
  
  return {
    // Export the event constants
    AgentServiceEvent: {
      PROCESSING_ABORTED: 'processing:aborted',
    },
    // Export the factory function
    getAgentService: () => instance
  };
});

describe('Abort API Integration Tests', () => {
  let app: express.Application;
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  beforeAll(() => {
    // Set up the express app
    app = express();
    app.use(json());
    app.use('/api', apiRoutes);
    app.use(errorHandler);
  });

  it('returns 200 with success true when aborting a processing session', async () => {
    const response = await request(app)
      .post('/api/abort')
      .send({ sessionId: '123e4567-e89b-12d3-a456-426614174000' })
      .expect(200);
    
    // Check response structure
    expect(response.body).toMatchObject({
      success: true,
      sessionId: '123e4567-e89b-12d3-a456-426614174000',
      message: expect.stringContaining('aborted')
    });
  });

  it('returns 200 with success false when aborting a non-processing session', async () => {
    const response = await request(app)
      .post('/api/abort')
      .send({ sessionId: '123e4567-e89b-12d3-a456-426614174002' })
      .expect(200);
    
    // Check response structure
    expect(response.body).toMatchObject({
      success: false,
      sessionId: '123e4567-e89b-12d3-a456-426614174002',
      message: expect.stringContaining('No operation to abort')
    });
  });

  it('returns 400 when session ID is not a valid UUID', async () => {
    const response = await request(app)
      .post('/api/abort')
      .send({ sessionId: 'not-a-uuid' })
      .expect(400);
    
    // Check error response
    expect(response.body).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        message: expect.stringContaining('Invalid request body')
      }
    });
  });
});