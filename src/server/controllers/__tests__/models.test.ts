import { Request, Response, NextFunction } from 'express';
import { getAvailableModels } from '../models';
import { LLMFactory } from '@qckfx/agent';

// Mock the LLMFactory
jest.mock('@qckfx/agent', () => ({
  LLMFactory: {
    getAvailableModels: jest.fn()
  }
}));

describe('Models Controller', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    mockRequest = {};
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    mockNext = jest.fn();

    // Reset mock implementations
    jest.clearAllMocks();
  });

  it('should return available models grouped by provider', async () => {
    // Mock the LLMFactory.getAvailableModels to return sample models
    const mockModels = [
      { model_name: 'claude-3-sonnet', provider: 'anthropic' },
      { model_name: 'claude-3-opus', provider: 'anthropic' },
      { model_name: 'gpt-4', provider: 'openai' }
    ];
    (LLMFactory.getAvailableModels as jest.Mock).mockReturnValue(mockModels);

    // Expected grouped models
    const expectedGroupedModels = {
      anthropic: ['claude-3-sonnet', 'claude-3-opus'],
      openai: ['gpt-4']
    };

    // Call the controller
    await getAvailableModels(
      mockRequest as Request,
      mockResponse as Response,
      mockNext
    );

    // Verify the response
    expect(mockResponse.status).toHaveBeenCalledWith(200);
    expect(mockResponse.json).toHaveBeenCalledWith(expectedGroupedModels);
  });

  it('should call next with error when an exception occurs', async () => {
    // Mock an error
    const mockError = new Error('Test error');
    (LLMFactory.getAvailableModels as jest.Mock).mockImplementation(() => {
      throw mockError;
    });

    // Call the controller
    await getAvailableModels(
      mockRequest as Request,
      mockResponse as Response,
      mockNext
    );

    // Verify next was called with the error
    expect(mockNext).toHaveBeenCalledWith(mockError);
  });
});