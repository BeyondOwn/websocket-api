import Redis from "ioredis";

// Create Redis client
export const redisClient = new Redis(process.env.REDIS_DB!!);
  
  redisClient.on('error', (err) => {
    console.error('Redis error:', err);
  });
  
  redisClient.on('connect', () => {
    console.log('Connected to Redis');
  });
  
