import { getSessionStatePersistence, resetSessionStatePersistence } from '../sessionPersistenceProvider';

// Mock SessionStatePersistence and its factory function
jest.mock('../SessionStatePersistence', () => {
  return {
    SessionStatePersistence: jest.fn().mockImplementation(() => ({})),
    createSessionStatePersistence: jest.fn().mockImplementation(() => ({}))
  };
});

describe('sessionPersistenceProvider', () => {
  beforeEach(() => {
    // Reset the instance before each test to ensure isolation
    resetSessionStatePersistence();
    jest.clearAllMocks();
  });
  
  it('should return a SessionStatePersistence instance', () => {
    // Import inside the test to access the mock
    const { createSessionStatePersistence } = jest.requireMock('../SessionStatePersistence');
    
    const persistence = getSessionStatePersistence();
    
    expect(createSessionStatePersistence).toHaveBeenCalled();
    expect(persistence).toBeDefined();
  });
  
  it('should return the same instance on subsequent calls', () => {
    const persistence1 = getSessionStatePersistence();
    const persistence2 = getSessionStatePersistence();
    
    expect(persistence1).toBe(persistence2);
    
    // Should have only created one instance
    const { createSessionStatePersistence } = jest.requireMock('../SessionStatePersistence');
    expect(createSessionStatePersistence).toHaveBeenCalledTimes(1);
  });
  
  it('should create a new instance after reset', () => {
    const persistence1 = getSessionStatePersistence();
    resetSessionStatePersistence();
    const persistence2 = getSessionStatePersistence();
    
    expect(persistence1).not.toBe(persistence2);
    
    // Should have created two instances
    const { createSessionStatePersistence } = jest.requireMock('../SessionStatePersistence');
    expect(createSessionStatePersistence).toHaveBeenCalledTimes(2);
  });
  
  it('should use environment variable for data directory if set', () => {
    const originalEnv = process.env.QCKFX_DATA_DIR;
    try {
      process.env.QCKFX_DATA_DIR = '/custom/data/dir';
      
      getSessionStatePersistence();
      
      const { createSessionStatePersistence } = jest.requireMock('../SessionStatePersistence');
      expect(createSessionStatePersistence).toHaveBeenCalledWith('/custom/data/dir/sessions');
    } finally {
      // Restore original environment
      process.env.QCKFX_DATA_DIR = originalEnv;
    }
  });
});