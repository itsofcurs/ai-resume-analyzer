import { redisClient } from '../server';
import { logger } from '../lib/telemetry';

const DEFAULT_TTL = 300; // 5 minutes

export const getCache = async (key: string): Promise<any | null> => {
  try {
    const data = await redisClient.get(key);
    if (data) {
      return JSON.parse(data as string);
    }
    return null;
  } catch (error) {
    logger.error(`Cache get error for key ${key}: ${error}`);
    return null; // Fail open
  }
};

export const setCache = async (key: string, value: any, ttlSeconds: number = DEFAULT_TTL) => {
  try {
    await redisClient.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch (error) {
    logger.error(`Cache set error for key ${key}: ${error}`);
  }
};

export const invalidateCache = async (keyPattern: string) => {
  try {
    const keys = await redisClient.keys(keyPattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
      logger.info(`Invalidated cache for pattern: ${keyPattern}`);
    }
  } catch (error) {
    logger.error(`Cache invalidation error for pattern ${keyPattern}: ${error}`);
  }
};

// Cache Key Generators
export const CacheKeys = {
  analytics: (orgId: string) => `org:${orgId}:analytics`,
  forecasts: (orgId: string) => `org:${orgId}:forecasts`,
  governance: (orgId: string) => `org:${orgId}:governance`,
  cost: (orgId: string) => `org:${orgId}:cost`,
};
