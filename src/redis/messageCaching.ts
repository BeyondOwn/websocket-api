// messageCache.ts
import { JsonValue } from '@prisma/client/runtime/library';
import { prisma } from '..';
import { redisClient } from './redis';

interface User {
  id: number
  googleId: string
  name: string
  email: string
  picture: string
}

interface Message {
  id:string,
  content: string;
  links?: JsonValue[]
  createdAt: Date;
  userId: number;
  channelId: number;
  user?: User;
  edited:Boolean;
  editedAt:Date|null;
}

// Load messages older than the oldest cached message
export async function loadOlderMessages(channelId: number, oldestTimestamp: Date, limit: number = 20): Promise<Message[]> {
  // First check if we need to go to DB (if we've reached the bottom of Redis cache)
  const key = getChannelMessagesKey(channelId);
  const oldestCachedMessage = await redisClient.zrange(key, 0, 0);
  
  // If we still have cached messages older than our current view
  if (oldestCachedMessage.length > 0) {
    const oldestCached = JSON.parse(oldestCachedMessage[0]) as Message;
    if (new Date(oldestCached.createdAt) < oldestTimestamp) {
      // We can still get more from Redis
      const olderMessages = await redisClient.zrevrangebyscore(
        key,
        oldestTimestamp.getTime() - 1,
        '-inf',
        'LIMIT', 0, limit
      );
      return olderMessages.map(msg => JSON.parse(msg) as Message).reverse();
    }
  }
  
  // Otherwise, fetch from database
  return await fetchMessagesFromDB(channelId, oldestTimestamp, limit);
}

async function fetchMessagesFromDB(channelId: number, olderThan: Date, limit: number): Promise<Message[]> {
  // Implement your database query here
  // Example with Prisma:
  console.log("FetchFromDb");

  const messages = await prisma.message.findMany({
    where: {
      channelId: channelId,
      createdAt: { lt: olderThan }
    },
    include: {
      user: true
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: limit
  });
  
  return messages.reverse(); // Return in ascending order
}


// Key format: 'channel:{channelId}:messages'
const getChannelMessagesKey = (channelId: number | string): string => `channel:${channelId}:messages`;

// Cache a message in Redis
async function cacheMessage(channelId: number | string, message: Message): Promise<void> {
  const key = getChannelMessagesKey(channelId);
  
  // Add to sorted set with timestamp as score
  await redisClient.zadd(key, message.createdAt.getTime(), JSON.stringify(message));
  
  // Keep only the most recent 100 messages
  await redisClient.zremrangebyrank(key, 0, -101);
  
  // Set expiration (24 hours)
  await redisClient.expire(key, 86400);
}


async function editMessageFromCache(channelId: number | string, messageId: number | string, newContent: string): Promise<boolean> {
  const key = getChannelMessagesKey(channelId);
  
  // Get all messages from this channel
  const messages = await redisClient.zrange(key, 0, -1);
  console.log("Redis messages: ", messages);
  
  // Find the message with the matching ID
  for (const messageStr of messages) {
    try {
      const message = JSON.parse(messageStr);
      
      if (message.id == messageId) {
        // Get the score of the current message (likely a timestamp)
        const score = await redisClient.zscore(key, messageStr);
        
        if (score === null) {
          console.error("Message found but couldn't get its score");
          return false;
        }
        
        // Create the updated message with new content
        const updatedMessage = {
          ...message,
          content: newContent,
          edited: true,
          editedAt: Date.now()
        };
        
        // Convert to string for storage
        const updatedMessageStr = JSON.stringify(updatedMessage);
        
        // Remove the old message
        await redisClient.zrem(key, messageStr);
        
        // Add the updated message with the same score to maintain order
        await redisClient.zadd(key, parseFloat(score), updatedMessageStr );
        
        return true;
      }
    } catch (error) {
      console.error("Error parsing message:", error);
      continue;
    }
  }
  
  return false;
}

// Function to delete a specific message from Redis cache
async function deleteMessageFromCache(channelId: number | string, messageId: number | string): Promise<boolean> {
  const key = getChannelMessagesKey(channelId);
  
  // Get all messages from this channel
  const messages = await redisClient.zrange(key, 0, -1);
  console.log("Redis messages: ",messages)
  
  // Find the message with the matching ID
  for (const messageStr of messages) {
    const message = JSON.parse(messageStr);
    
    if (message.id == messageId) {
      // console.log("Found one: ",message);
      // Remove this specific message from the sorted set
      const removed = await redisClient.zrem(key, messageStr);
      return removed > 0;
    }
  }
  
  return false;
}

// Get recent messages from Redis
async function getRecentMessages(channelId: number | string, limit: number = 50): Promise<Message[]> {
  const key = getChannelMessagesKey(channelId);
  
  // Get most recent messages (highest scores)
  const messages = await redisClient.zrevrange(key, 0, limit - 1);
  
  // Parse JSON strings back to objects
  //Added .reverse for ascending order
  return messages.map(msg => JSON.parse(msg) as Message).reverse();
}

// Check if we have cached messages
async function hasCachedMessages(channelId: number | string): Promise<boolean> {
  const key = getChannelMessagesKey(channelId);
  const result = await redisClient.exists(key);
  return result === 1;
}

export {
  cacheMessage, deleteMessageFromCache, editMessageFromCache, getRecentMessages,
  hasCachedMessages,
  type Message
};

