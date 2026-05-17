import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../server';

const router = Router();

router.post('/register', async (req, res) => {
  try {
    const { email, password, name, organizationName } = req.body;
    
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: 'Email already exists' });
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create organization and user atomically
    const user = await prisma.user.create({
      data: { 
        email, 
        password: hashedPassword, 
        name,
        role: 'ADMIN',
        organization: {
          create: {
            name: organizationName || `${name}'s Organization`
          }
        }
      },
      include: { organization: true }
    });
    
    const token = jwt.sign(
      { userId: user.id, role: user.role, organizationId: user.organizationId }, 
      process.env.JWT_SECRET || 'secret', 
      { expiresIn: '24h' }
    );

    res.status(201).json({ 
      message: 'User registered successfully', 
      token, 
      user: { id: user.id, name: user.name, role: user.role, organizationId: user.organizationId } 
    });
  } catch (error) {
    console.error("Register Error:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { userId: user.id, role: user.role, organizationId: user.organizationId }, 
      process.env.JWT_SECRET || 'secret', 
      { expiresIn: '24h' }
    );
    res.json({ token, role: user.role, name: user.name, organizationId: user.organizationId });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
