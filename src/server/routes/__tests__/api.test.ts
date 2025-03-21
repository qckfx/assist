/**
 * API routes tests
 */
import request from 'supertest';
import express from 'express';
import apiRoutes from '../api';

describe('API Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api', apiRoutes);
  });

  describe('POST /api/start', () => {
    it('should respond with 501 Not Implemented', async () => {
      const response = await request(app).post('/api/start');
      expect(response.status).toBe(501);
      expect(response.body).toHaveProperty('error', 'Not implemented');
    });
  });

  describe('POST /api/query', () => {
    it('should respond with 501 Not Implemented', async () => {
      const response = await request(app).post('/api/query');
      expect(response.status).toBe(501);
      expect(response.body).toHaveProperty('error', 'Not implemented');
    });
  });

  describe('POST /api/abort', () => {
    it('should respond with 501 Not Implemented', async () => {
      const response = await request(app).post('/api/abort');
      expect(response.status).toBe(501);
      expect(response.body).toHaveProperty('error', 'Not implemented');
    });
  });

  describe('GET /api/history', () => {
    it('should respond with 501 Not Implemented', async () => {
      const response = await request(app).get('/api/history');
      expect(response.status).toBe(501);
      expect(response.body).toHaveProperty('error', 'Not implemented');
    });
  });

  describe('GET /api/status', () => {
    it('should respond with 501 Not Implemented', async () => {
      const response = await request(app).get('/api/status');
      expect(response.status).toBe(501);
      expect(response.body).toHaveProperty('error', 'Not implemented');
    });
  });
});