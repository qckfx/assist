import { createModelClient } from '../core/ModelClient';
import { createContextWindow } from '../types/contextWindow';
import { ModelClientConfig } from '../types/model';

// Minimal fake Anthropic message for our test
// @ts-ignore
const fakeMessage = {
  id: 'msg1',
  role: 'assistant',
  content: [],
};

describe('AbortSignal propagation', () => {
  it('abort signal rejects generateResponse with AbortError', async () => {
    const delayedProvider = () => new Promise<any>((resolve) => {
      setTimeout(() => resolve(fakeMessage), 300);
    });

    const config: ModelClientConfig = {
      // casting to any because we don’t implement full provider type in test
      modelProvider: delayedProvider as any,
    } as ModelClientConfig;

    const client = createModelClient(config);

    const controller = new AbortController();

    const sessionState = {
      id: 'session-1',
      contextWindow: createContextWindow(),
    } as any;

    const promise = client.generateResponse('hi', [], sessionState, { signal: controller.signal });

    setTimeout(() => controller.abort(), 50);

    await expect(promise).rejects.toThrow('AbortError');
  });
});
