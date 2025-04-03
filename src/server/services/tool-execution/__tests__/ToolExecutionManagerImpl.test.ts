import { 
  ToolExecutionStatus, 
  ToolExecutionEvent 
} from '../../../../types/tool-execution';
import { 
  ToolExecutionManagerImpl 
} from '../ToolExecutionManagerImpl';

describe('ToolExecutionManagerImpl', () => {
  let manager: ToolExecutionManagerImpl;

  beforeEach(() => {
    manager = new ToolExecutionManagerImpl();
  });

  afterEach(() => {
    manager.clear();
  });

  describe('createExecution', () => {
    it('should create a new tool execution', () => {
      const sessionId = 'session-123';
      const toolId = 'test-tool';
      const toolName = 'Test Tool';
      const args = { param1: 'value1' };

      const execution = manager.createExecution(sessionId, toolId, toolName, args);

      expect(execution).toMatchObject({
        sessionId,
        toolId,
        toolName,
        args,
        status: ToolExecutionStatus.PENDING
      });
      expect(execution.id).toBeDefined();
      expect(execution.startTime).toBeDefined();
    });

    it('should emit a CREATED event', () => {
      const listener = jest.fn();
      manager.on(ToolExecutionEvent.CREATED, listener);

      const execution = manager.createExecution('session-123', 'test-tool', 'Test Tool', {});
      
      expect(listener).toHaveBeenCalledWith(execution);
    });
  });

  describe('updateExecution', () => {
    it('should update an existing execution', () => {
      const execution = manager.createExecution('session-123', 'test-tool', 'Test Tool', {});
      const updates = { 
        status: ToolExecutionStatus.RUNNING,
        summary: 'Running test tool'
      };

      const updatedExecution = manager.updateExecution(execution.id, updates);

      expect(updatedExecution).toMatchObject({
        ...execution,
        ...updates
      });
    });

    it('should throw an error if execution does not exist', () => {
      expect(() => {
        manager.updateExecution('non-existent', { status: ToolExecutionStatus.RUNNING });
      }).toThrow('Tool execution not found');
    });

    it('should emit an UPDATED event', () => {
      const listener = jest.fn();
      manager.on(ToolExecutionEvent.UPDATED, listener);

      const execution = manager.createExecution('session-123', 'test-tool', 'Test Tool', {});
      const updatedExecution = manager.updateExecution(execution.id, { 
        status: ToolExecutionStatus.RUNNING 
      });
      
      expect(listener).toHaveBeenCalledWith(updatedExecution);
    });
  });

  describe('completeExecution', () => {
    it('should mark execution as completed with result', () => {
      const execution = manager.createExecution('session-123', 'test-tool', 'Test Tool', {});
      const result = { success: true, data: 'test result' };

      const completedExecution = manager.completeExecution(execution.id, result, 100);

      expect(completedExecution).toMatchObject({
        status: ToolExecutionStatus.COMPLETED,
        result,
        executionTime: 100
      });
      expect(completedExecution.endTime).toBeDefined();
    });

    it('should emit a COMPLETED event', () => {
      const listener = jest.fn();
      manager.on(ToolExecutionEvent.COMPLETED, listener);

      const execution = manager.createExecution('session-123', 'test-tool', 'Test Tool', {});
      const completedExecution = manager.completeExecution(execution.id, {}, 100);
      
      expect(listener).toHaveBeenCalledWith(completedExecution);
    });
  });

  describe('failExecution', () => {
    it('should mark execution as failed with error', () => {
      const execution = manager.createExecution('session-123', 'test-tool', 'Test Tool', {});
      const error = new Error('Test error');

      const failedExecution = manager.failExecution(execution.id, error);

      expect(failedExecution).toMatchObject({
        status: ToolExecutionStatus.ERROR,
        error: {
          message: 'Test error'
        }
      });
      expect(failedExecution.endTime).toBeDefined();
      expect(failedExecution.executionTime).toBeDefined();
    });

    it('should emit an ERROR event', () => {
      const listener = jest.fn();
      manager.on(ToolExecutionEvent.ERROR, listener);

      const execution = manager.createExecution('session-123', 'test-tool', 'Test Tool', {});
      const failedExecution = manager.failExecution(execution.id, new Error('Test error'));
      
      expect(listener).toHaveBeenCalledWith(failedExecution);
    });
  });

  describe('abortExecution', () => {
    it('should mark execution as aborted', () => {
      const execution = manager.createExecution('session-123', 'test-tool', 'Test Tool', {});

      const abortedExecution = manager.abortExecution(execution.id);

      expect(abortedExecution).toMatchObject({
        status: ToolExecutionStatus.ABORTED
      });
      expect(abortedExecution.endTime).toBeDefined();
      expect(abortedExecution.executionTime).toBeDefined();
    });

    it('should emit an ABORTED event', () => {
      const listener = jest.fn();
      manager.on(ToolExecutionEvent.ABORTED, listener);

      const execution = manager.createExecution('session-123', 'test-tool', 'Test Tool', {});
      const abortedExecution = manager.abortExecution(execution.id);
      
      expect(listener).toHaveBeenCalledWith(abortedExecution);
    });
  });

  describe('requestPermission', () => {
    it('should create a permission request for execution', () => {
      const execution = manager.createExecution('session-123', 'test-tool', 'Test Tool', {});
      const args = { param1: 'value1' };

      const permission = manager.requestPermission(execution.id, args);

      expect(permission).toMatchObject({
        toolId: execution.toolId,
        toolName: execution.toolName,
        args,
        executionId: execution.id
      });
      expect(permission.id).toBeDefined();
      expect(permission.requestTime).toBeDefined();

      // Check that execution status was updated
      const updatedExecution = manager.getExecution(execution.id);
      expect(updatedExecution?.status).toBe(ToolExecutionStatus.AWAITING_PERMISSION);
    });

    it('should emit a PERMISSION_REQUESTED event', () => {
      const listener = jest.fn();
      manager.on(ToolExecutionEvent.PERMISSION_REQUESTED, listener);

      const execution = manager.createExecution('session-123', 'test-tool', 'Test Tool', {});
      const permission = manager.requestPermission(execution.id, {});
      
      expect(listener).toHaveBeenCalledWith({
        execution: expect.objectContaining({ id: execution.id }),
        permission
      });
    });
  });

  describe('resolvePermission', () => {
    it('should resolve permission request with grant = true', () => {
      const execution = manager.createExecution('session-123', 'test-tool', 'Test Tool', {});
      const permission = manager.requestPermission(execution.id, {});

      const resolvedPermission = manager.resolvePermission(permission.id, true);

      expect(resolvedPermission).toMatchObject({
        ...permission,
        granted: true
      });
      expect(resolvedPermission.resolvedTime).toBeDefined();

      // Check that execution status was updated to running
      const updatedExecution = manager.getExecution(execution.id);
      expect(updatedExecution?.status).toBe(ToolExecutionStatus.RUNNING);
    });

    it('should resolve permission request with grant = false', () => {
      const execution = manager.createExecution('session-123', 'test-tool', 'Test Tool', {});
      const permission = manager.requestPermission(execution.id, {});

      const resolvedPermission = manager.resolvePermission(permission.id, false);

      expect(resolvedPermission).toMatchObject({
        ...permission,
        granted: false
      });

      // Check that execution status was updated to error
      const updatedExecution = manager.getExecution(execution.id);
      expect(updatedExecution?.status).toBe(ToolExecutionStatus.ERROR);
      expect(updatedExecution?.error?.message).toBe('Permission denied');
    });

    it('should emit a PERMISSION_RESOLVED event', () => {
      const listener = jest.fn();
      manager.on(ToolExecutionEvent.PERMISSION_RESOLVED, listener);

      const execution = manager.createExecution('session-123', 'test-tool', 'Test Tool', {});
      const permission = manager.requestPermission(execution.id, {});
      const resolvedPermission = manager.resolvePermission(permission.id, true);
      
      expect(listener).toHaveBeenCalledWith({
        execution: expect.objectContaining({ id: execution.id }),
        permission: resolvedPermission
      });
    });
  });

  describe('getExecutionsForSession', () => {
    it('should return all executions for a session', () => {
      const sessionId = 'session-123';
      const execution1 = manager.createExecution(sessionId, 'tool-1', 'Tool 1', {});
      const execution2 = manager.createExecution(sessionId, 'tool-2', 'Tool 2', {});
      const execution3 = manager.createExecution('other-session', 'tool-3', 'Tool 3', {});

      const executions = manager.getExecutionsForSession(sessionId);

      expect(executions).toHaveLength(2);
      expect(executions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: execution1.id }),
          expect.objectContaining({ id: execution2.id })
        ])
      );
      expect(executions).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: execution3.id })
        ])
      );
    });
  });

  describe('getPermissionRequestsForSession', () => {
    it('should return all permission requests for a session', () => {
      const sessionId = 'session-123';
      const execution1 = manager.createExecution(sessionId, 'tool-1', 'Tool 1', {});
      const execution2 = manager.createExecution(sessionId, 'tool-2', 'Tool 2', {});
      const execution3 = manager.createExecution('other-session', 'tool-3', 'Tool 3', {});

      const permission1 = manager.requestPermission(execution1.id, {});
      const permission2 = manager.requestPermission(execution2.id, {});
      const permission3 = manager.requestPermission(execution3.id, {});

      const permissions = manager.getPermissionRequestsForSession(sessionId);

      expect(permissions).toHaveLength(2);
      expect(permissions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: permission1.id }),
          expect.objectContaining({ id: permission2.id })
        ])
      );
      expect(permissions).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: permission3.id })
        ])
      );
    });
  });
});