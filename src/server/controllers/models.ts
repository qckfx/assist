/**
 * Models controller for available AI models
 */
import { Request, Response, NextFunction } from 'express';
import { LLMFactory } from '@qckfx/agent';

/**
 * Get all available AI models grouped by provider
 * @route GET /api/models
 */
export async function getAvailableModels(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    console.log('getAvailableModels');
    // Get available models from the LLM Factory
    const allModels = await LLMFactory.getAvailableModels();
    console.log('allModels', allModels);
    
    // Group models by provider
    const modelsByProvider = allModels.reduce((acc, model) => {
      const provider = model.provider;
      if (!acc[provider]) {
        acc[provider] = [];
      }
      acc[provider].push(model.model_name);
      return acc;
    }, {} as Record<string, string[]>);

    res.status(200).json(modelsByProvider);
  } catch (error) {
    next(error);
  }
}