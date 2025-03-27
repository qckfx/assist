import path from 'path';
import { StorageService, IFileSystem } from '../storage';
import { AgentExecutionHistory, JudgmentResult } from '../../models/types';

describe('StorageService', () => {
  // Mock file system implementation
  class MockFileSystem implements IFileSystem {
    private files: Map<string, string> = new Map();
    private directories: Set<string> = new Set();
    
    existsSync(filePath: string): boolean {
      // Check if it's a directory first
      if (this.directories.has(filePath)) {
        return true;
      }
      // Check if it's a file
      return this.files.has(filePath);
    }
    
    mkdirSync(dirPath: string, options: { recursive: boolean }): void {
      this.directories.add(dirPath);
      // If recursive, add parent directories too
      if (options.recursive) {
        let currentPath = dirPath;
        while (currentPath !== '/' && currentPath !== '.') {
          this.directories.add(currentPath);
          currentPath = path.dirname(currentPath);
        }
      }
    }
    
    writeFileSync(filePath: string, data: string, options: { encoding: BufferEncoding }): void {
      this.files.set(filePath, data);
    }
    
    readFileSync(filePath: string, options: { encoding: BufferEncoding }): string {
      const data = this.files.get(filePath);
      if (data === undefined) {
        throw new Error(`File not found: ${filePath}`);
      }
      return data;
    }
    
    readdirSync(dirPath: string): string[] {
      if (!this.directories.has(dirPath)) {
        throw new Error(`Directory not found: ${dirPath}`);
      }
      
      const result: string[] = [];
      
      // Get all files in this directory
      for (const filePath of this.files.keys()) {
        if (path.dirname(filePath) === dirPath) {
          result.push(path.basename(filePath));
        }
      }
      
      // Get all subdirectories
      for (const directory of this.directories) {
        if (path.dirname(directory) === dirPath && directory !== dirPath) {
          result.push(path.basename(directory));
        }
      }
      
      return result;
    }
    
    statSync(filePath: string): { mtime: { getTime: () => number } } {
      // Mock method that returns a fixed timestamp for testing
      return {
        mtime: {
          getTime: () => Date.now() - (10 * 24 * 60 * 60 * 1000) // 10 days old
        }
      };
    }
    
    rmSync(filePath: string, options: { recursive: boolean, force: boolean }): void {
      // Remove the target and all its children if recursive
      if (options.recursive) {
        // Remove directories
        for (const dir of [...this.directories]) {
          if (dir === filePath || dir.startsWith(filePath + '/')) {
            this.directories.delete(dir);
          }
        }
        
        // Remove files
        for (const file of [...this.files.keys()]) {
          if (file.startsWith(filePath + '/')) {
            this.files.delete(file);
          }
        }
      }
      
      // Remove the specific file if it exists
      this.files.delete(filePath);
      this.directories.delete(filePath);
    }
  }
  
  // Test data
  const mockExecutionHistory: AgentExecutionHistory = {
    metadata: {
      task: 'Test task'
    },
    toolCalls: [
      {
        tool: 'TestTool',
        args: { test: 'argument' },
        result: 'test result',
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString()
      }
    ]
  };
  
  const mockJudgmentResult: JudgmentResult = {
    scores: {
      correctness: 8,
      completeness: 7,
      efficiency: 9,
      codeQuality: 8,
      explanations: 9,
      toolUsage: 8,
      problemSolving: 9
    },
    explanations: {
      correctness: 'Good solution',
      completeness: 'Mostly complete',
    },
    overall: 'Good job overall'
  };
  
  // Test constants
  const TEST_BASE_DIR = '/test-eval-data';
  const TEST_RUN_ID = '2023-01-01T00-00-00-000Z';
  const TEST_EXECUTION_ID = 'test-execution-id';
  const TEST_JUDGMENT_ID = 'test-judgment-id';
  
  let mockFs: MockFileSystem;
  let storage: StorageService;
  
  beforeEach(() => {
    mockFs = new MockFileSystem();
    storage = new StorageService(mockFs, TEST_BASE_DIR);
    
    // Mock Date.now() for consistent IDs
    jest.spyOn(Date, 'now').mockReturnValue(1672531200000); // 2023-01-01
    jest.spyOn(Math, 'random').mockReturnValue(0.123456789);
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  describe('generateUniqueId', () => {
    it('should generate a string with timestamp and random component', () => {
      const id = storage.generateUniqueId();
      expect(typeof id).toBe('string');
      expect(id).toMatch(/^\d+-[a-z0-9]+$/);
      expect(id).toBe('1672531200000-4fzzzxjy');
    });
  });
  
  describe('formatDateForFilename', () => {
    it('should format a date into a filename-friendly string', () => {
      const date = new Date('2023-01-01T12:30:45.678Z');
      const formatted = storage.formatDateForFilename(date);
      expect(formatted).toBe('2023-01-01T12-30-45-678Z');
    });
  });
  
  describe('getEvaluationStorageDir', () => {
    it('should return the correct directory path', () => {
      const result = storage.getEvaluationStorageDir({ runId: TEST_RUN_ID });
      expect(result).toBe(path.join(TEST_BASE_DIR, TEST_RUN_ID));
    });
    
    it('should include test name in path if provided', () => {
      const result = storage.getEvaluationStorageDir({
        runId: TEST_RUN_ID,
        testName: 'test-case-1'
      });
      expect(result).toBe(path.join(TEST_BASE_DIR, TEST_RUN_ID, 'test-case-1'));
    });
    
    it('should create directory if it does not exist', () => {
      const dirPath = path.join(TEST_BASE_DIR, TEST_RUN_ID);
      expect(mockFs.existsSync(dirPath)).toBe(false);
      
      storage.getEvaluationStorageDir({ runId: TEST_RUN_ID });
      
      expect(mockFs.existsSync(dirPath)).toBe(true);
    });
    
    it('should not create directory if createIfNotExist is false', () => {
      const dirPath = path.join(TEST_BASE_DIR, TEST_RUN_ID);
      expect(mockFs.existsSync(dirPath)).toBe(false);
      
      storage.getEvaluationStorageDir({
        runId: TEST_RUN_ID,
        createIfNotExist: false
      });
      
      expect(mockFs.existsSync(dirPath)).toBe(false);
    });
  });
  
  describe('storeExecutionHistory', () => {
    it('should store execution history to the correct path', () => {
      const executionId = storage.storeExecutionHistory(
        mockExecutionHistory,
        {
          runId: TEST_RUN_ID,
          executionId: TEST_EXECUTION_ID
        }
      );
      
      const filePath = path.join(
        TEST_BASE_DIR,
        TEST_RUN_ID,
        'histories',
        `history-${TEST_EXECUTION_ID}.json`
      );
      
      expect(executionId).toBe(TEST_EXECUTION_ID);
      expect(mockFs.existsSync(filePath)).toBe(true);
    });
    
    it('should generate a unique ID if none provided', () => {
      const executionId = storage.storeExecutionHistory(
        mockExecutionHistory,
        { runId: TEST_RUN_ID }
      );
      
      expect(executionId).toBe('1672531200000-4fzzzxjy');
      
      const filePath = path.join(
        TEST_BASE_DIR,
        TEST_RUN_ID,
        'histories',
        `history-${executionId}.json`
      );
      
      expect(mockFs.existsSync(filePath)).toBe(true);
    });
    
    it('should throw error if operation fails', () => {
      // Create a custom mock filesystem that throws on write
      class ThrowingWriteFS extends MockFileSystem {
        writeFileSync(): void {
          throw new Error('Write error');
        }
      }
      const throwingFs = new ThrowingWriteFS();
      
      const throwingStorage = new StorageService(throwingFs, TEST_BASE_DIR);
      
      expect(() => {
        throwingStorage.storeExecutionHistory(
          mockExecutionHistory,
          { runId: TEST_RUN_ID }
        );
      }).toThrow('Write error');
    });
  });
  
  describe('loadExecutionHistory', () => {
    it('should load execution history from the correct path', () => {
      // Store a history first
      storage.storeExecutionHistory(
        mockExecutionHistory,
        {
          runId: TEST_RUN_ID,
          executionId: TEST_EXECUTION_ID
        }
      );
      
      // Then load it
      const result = storage.loadExecutionHistory(
        TEST_EXECUTION_ID,
        { runId: TEST_RUN_ID }
      );
      
      expect(result).toEqual(mockExecutionHistory);
    });
    
    it('should return null if file does not exist', () => {
      const result = storage.loadExecutionHistory(
        'non-existent-id',
        { runId: TEST_RUN_ID }
      );
      
      expect(result).toBeNull();
    });
    
    it('should return null if read operation fails', () => {
      // Create a custom mock filesystem that throws on read
      class ThrowingReadFS extends MockFileSystem {
        readFileSync(): string {
          throw new Error('Read error');
        }
      }
      const throwingFs = new ThrowingReadFS();
      
      const throwingStorage = new StorageService(throwingFs, TEST_BASE_DIR);
      
      const result = throwingStorage.loadExecutionHistory(
        TEST_EXECUTION_ID,
        { runId: TEST_RUN_ID }
      );
      
      expect(result).toBeNull();
    });
  });
  
  describe('listExecutionHistories', () => {
    beforeEach(() => {
      // Store some histories for testing
      storage.storeExecutionHistory(
        mockExecutionHistory,
        { runId: TEST_RUN_ID, executionId: 'exec-1' }
      );
      
      storage.storeExecutionHistory(
        mockExecutionHistory,
        { runId: TEST_RUN_ID, executionId: 'exec-2' }
      );
    });
    
    it('should list all execution histories in the directory', () => {
      const result = storage.listExecutionHistories({ runId: TEST_RUN_ID });
      
      expect(result).toHaveLength(2);
      expect(result).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'exec-1' }),
        expect.objectContaining({ id: 'exec-2' })
      ]));
    });
    
    it('should return empty array if directory does not exist', () => {
      const result = storage.listExecutionHistories({ 
        runId: 'non-existent-run-id' 
      });
      
      expect(result).toEqual([]);
    });
  });
  
  describe('storeJudgmentResult', () => {
    it('should store judgment result to the correct path', () => {
      const judgmentId = storage.storeJudgmentResult(
        mockJudgmentResult,
        TEST_EXECUTION_ID,
        {
          runId: TEST_RUN_ID,
          judgmentId: TEST_JUDGMENT_ID
        }
      );
      
      const filePath = path.join(
        TEST_BASE_DIR,
        TEST_RUN_ID,
        'judgments',
        `judgment-${TEST_EXECUTION_ID}-${TEST_JUDGMENT_ID}.json`
      );
      
      expect(judgmentId).toBe(TEST_JUDGMENT_ID);
      expect(mockFs.existsSync(filePath)).toBe(true);
    });
    
    it('should generate a unique ID if none provided', () => {
      const judgmentId = storage.storeJudgmentResult(
        mockJudgmentResult,
        TEST_EXECUTION_ID,
        { runId: TEST_RUN_ID }
      );
      
      expect(judgmentId).toBe('1672531200000-4fzzzxjy');
      
      const filePath = path.join(
        TEST_BASE_DIR,
        TEST_RUN_ID,
        'judgments',
        `judgment-${TEST_EXECUTION_ID}-${judgmentId}.json`
      );
      
      expect(mockFs.existsSync(filePath)).toBe(true);
    });
  });
  
  describe('loadJudgmentResult', () => {
    beforeEach(() => {
      // Store a judgment first
      storage.storeJudgmentResult(
        mockJudgmentResult,
        TEST_EXECUTION_ID,
        {
          runId: TEST_RUN_ID,
          judgmentId: TEST_JUDGMENT_ID
        }
      );
    });
    
    it('should load judgment result from the correct path', () => {
      const result = storage.loadJudgmentResult(
        TEST_EXECUTION_ID,
        TEST_JUDGMENT_ID,
        { runId: TEST_RUN_ID }
      );
      
      expect(result).toEqual(mockJudgmentResult);
    });
    
    it('should return null if file does not exist', () => {
      const result = storage.loadJudgmentResult(
        TEST_EXECUTION_ID,
        'non-existent-id',
        { runId: TEST_RUN_ID }
      );
      
      expect(result).toBeNull();
    });
  });
  
  describe('listJudgmentResults', () => {
    beforeEach(() => {
      // Store some judgments for testing
      storage.storeJudgmentResult(
        mockJudgmentResult,
        'exec-1',
        { runId: TEST_RUN_ID, judgmentId: 'judge-1' }
      );
      
      storage.storeJudgmentResult(
        mockJudgmentResult,
        'exec-2',
        { runId: TEST_RUN_ID, judgmentId: 'judge-2' }
      );
    });
    
    it('should list all judgment results in the directory', () => {
      const result = storage.listJudgmentResults({ runId: TEST_RUN_ID });
      
      expect(result).toHaveLength(2);
      expect(result).toEqual([
        {
          judgmentId: '1-judge-1',
          executionId: 'exec',
          path: path.join(TEST_BASE_DIR, TEST_RUN_ID, 'judgments', 'judgment-exec-1-judge-1.json')
        },
        {
          judgmentId: '2-judge-2',
          executionId: 'exec',
          path: path.join(TEST_BASE_DIR, TEST_RUN_ID, 'judgments', 'judgment-exec-2-judge-2.json')
        }
      ]);
    });
    
    it('should filter by executionId if provided', () => {
      const result = storage.listJudgmentResults({
        runId: TEST_RUN_ID,
        executionId: 'exec-1'
      });
      
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        judgmentId: '1-judge-1',
        executionId: 'exec',
        path: path.join(TEST_BASE_DIR, TEST_RUN_ID, 'judgments', 'judgment-exec-1-judge-1.json')
      });
    });
  });
  
  describe('storeComparisonResult', () => {
    it('should store comparison result to the correct path', () => {
      const mockComparisonText = 'Comparison between two executions';
      const comparisonId = 'test-comparison-id';
      
      const result = storage.storeComparisonResult(
        mockComparisonText,
        'exec-1',
        'exec-2',
        {
          runId: TEST_RUN_ID,
          comparisonId
        }
      );
      
      const filePath = path.join(
        TEST_BASE_DIR,
        TEST_RUN_ID,
        'comparisons',
        `comparison-exec-1-exec-2-${comparisonId}.md`
      );
      
      expect(result).toBe(comparisonId);
      expect(mockFs.existsSync(filePath)).toBe(true);
    });
  });
  
  describe('cleanupOldEvaluationData', () => {
    beforeEach(() => {
      // Create some test directories and files
      mockFs.mkdirSync(path.join(TEST_BASE_DIR, 'run-1'), { recursive: true });
      mockFs.mkdirSync(path.join(TEST_BASE_DIR, 'run-2'), { recursive: true });
      mockFs.mkdirSync(path.join(TEST_BASE_DIR, 'run-3'), { recursive: true });
    });
    
    it('should remove directories older than the specified age', () => {
      storage.cleanupOldEvaluationData({
        maxAgeDays: 7,
        preserveRuns: ['run-3']
      });
      
      // run-1 and run-2 should be removed (older than 7 days)
      // run-3 should be preserved
      expect(mockFs.existsSync(path.join(TEST_BASE_DIR, 'run-1'))).toBe(false);
      expect(mockFs.existsSync(path.join(TEST_BASE_DIR, 'run-2'))).toBe(false);
      expect(mockFs.existsSync(path.join(TEST_BASE_DIR, 'run-3'))).toBe(true);
    });
    
    it('should do nothing if base directory does not exist', () => {
      // Create a storage service with a different base directory
      const newStorage = new StorageService(mockFs, '/non-existent-dir');
      
      // Should not throw
      expect(() => {
        newStorage.cleanupOldEvaluationData();
      }).not.toThrow();
    });
  });
});