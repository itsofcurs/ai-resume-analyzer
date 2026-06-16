import request from 'supertest';
import app from '../server'; // Ensure server.ts exports the Express app
import { prisma } from '../server';

describe('Auth Security & Rate Limiting', () => {
  beforeAll(async () => {
    // Clean up test data before starting
    await prisma.loginAttempt.deleteMany();
    await prisma.emailOTP.deleteMany();
    await prisma.user.deleteMany({
      where: { email: { contains: 'test' } }
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Rate Limiting', () => {
    it('should block excessive login attempts', async () => {
      const loginPayload = {
        email: 'test_rate_limit@example.com',
        password: 'WrongPassword123!',
      };

      // Send 10 failed login requests
      for (let i = 0; i < 10; i++) {
        await request(app).post('/api/auth/login').send(loginPayload);
      }

      // 11th request should hit rate limiter
      const response = await request(app)
        .post('/api/auth/login')
        .send(loginPayload);

      expect(response.status).toBe(429); // Too Many Requests
    });
  });

  describe('OTP Security', () => {
    it('should lock OTP verification after 5 failed attempts', async () => {
      // 1. Register a test user
      await request(app).post('/api/auth/register').send({
        email: 'test_otp_lock@example.com',
        password: 'ValidPassword123!',
        name: 'Test User',
        organizationName: 'Test Org'
      });

      // 2. Try verifying with wrong OTP 5 times
      for (let i = 0; i < 5; i++) {
        await request(app).post('/api/auth/verify-otp').send({
          email: 'test_otp_lock@example.com',
          otp: '000000'
        });
      }

      // 3. 6th attempt should show locked message
      const response = await request(app).post('/api/auth/verify-otp').send({
        email: 'test_otp_lock@example.com',
        otp: '000000'
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Too many attempts');
    });
  });
});
