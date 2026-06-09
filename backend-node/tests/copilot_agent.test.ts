import request from 'supertest';
import { app } from '../src/server';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret';

describe('Copilot Agent Route', () => {
  it('should reject requests without auth token', async () => {
    const res = await request(app)
      .post('/api/copilot/agent')
      .send({ message: 'Hello' });
    expect(res.statusCode).toEqual(401);
  });

  it('should require organizationId in token', async () => {
    const token = jwt.sign({ userId: '123' }, JWT_SECRET); // missing orgId
    const res = await request(app)
      .post('/api/copilot/agent')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'Hello' });
    expect(res.statusCode).toEqual(403);
  });

  it('should reject missing message', async () => {
    const token = jwt.sign({ userId: '123', organizationId: 'org123' }, JWT_SECRET);
    const res = await request(app)
      .post('/api/copilot/agent')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.statusCode).toEqual(400);
  });
});
