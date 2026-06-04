import { describe, it, expect, jest } from '@jest/globals';
import request from 'supertest';
import { app } from '../src/server';

// Mock Redis client to prevent real connection attempts during tests
jest.mock('redis', () => ({
  createClient: jest.fn().mockReturnValue({
    on: jest.fn(),
    connect: jest.fn().mockReturnValue(Promise.resolve()),
    get: jest.fn(),
    set: jest.fn(),
    setEx: jest.fn(),
  }),
}));

describe('Health API', () => {
  it('should return 200 on /', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.message).toBe('AI Hiring Intelligence Backend is LIVE');
  });
});
