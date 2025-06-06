import { PrismaClient } from "@prisma/client";
import cors from "cors";
import express from 'express';
import jwt from "jsonwebtoken";
import { createServer } from 'node:http';
import { Server, Socket } from 'socket.io';
import { createRouteHandler } from "uploadthing/express";
import { v4 as uuidv4 } from 'uuid';
import authRoutes, { FRONTEND } from "./Auth";
import { createServerName } from "./dbRelated/createServerName";
import { getUserServers } from "./dbRelated/getUserServers";
import { joinServer } from "./dbRelated/joinServer";
import { leaveServer } from "./dbRelated/leaveServer";
import { saveMessageToDatabase } from "./dbRelated/saveMessageToDatabase";
import { isAuthenticated } from "./isAuthenticated";
import { isSameUser } from "./isSameUser";
import { User } from "./models/models";
import { cacheMessage, deleteMessageFromCache, editMessageFromCache, getRecentMessages, loadOlderMessages } from "./redis/messageCaching";
import { redisClient } from "./redis/redis";
import { uploadRouter } from "./uploadthing";
import { isImageUrl } from "./utils/isImageUrl";



declare module 'socket.io' {
  interface Socket {
    user?: User;
  }
}



console.log('Database URL:', process.env.DATABASE_URL);
const globalForPrisma = global as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

const activeSockets:Record<string,User> = {};
const activeSocketsChannel:Record<string,User[]> = {};
const JWT_SECRET = 'your_jwt_secret_key';

const app = express();

const allowedOrigins = ['https://vue-websocket-one.vercel.app','https://localhost:3000','http://localhost:3000', 'http://localhost:8081','http://localhost:5173'];

// Define CORS options
const corsOptions = {
  origin: function (origin:any, callback:any) {
    console.log('Request from origin:', origin);
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      console.log('Origin not allowed by CORS:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

app.use(
  "/api/uploadthing",
  createRouteHandler({
    router: uploadRouter,
    config: {
      // callbackUrl:BACKEND,
      token:process.env.UPLOADTHING_TOKEN
    }
  }),
);

const server = createServer(app);
app.use(authRoutes);


const io = new Server(server,{
    cors:{
    origin: `${FRONTEND}`, // Vue dev server address
    methods: ["GET", "POST"],
    credentials: true
    }
});


io.use((socket:Socket, next) => {
  // Get token from handshake auth or query parameter
  const token = socket.handshake.headers.authorization as string;
  const userProfile = socket.handshake.headers.userprofile as string;
  // console.log("userProfile: ",JSON.parse(userProfile));
  // console.log("Token: ",token);
  
  if (!token) {
    return next(new Error('Authentication error: No token provided'));
  }
  
  try {
    // Verify the token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Attach the user data to the socket for use in your event handlers
    socket.user = JSON.parse(userProfile) as User;
    console.log("socket.user ", socket.user);
    activeSockets[socket.id] = socket.user;
    // Authentication successful
    next();
  } catch (error) {
    return next(new Error('Authentication error: Invalid token'));
  }
});


io.on("connection",(socket)=>{

    console.log('new user connected ',socket.id, socket.user?.name);
    // io.emit('activeSockets',{activeSockets:activeSockets});
    // Welcome message to the new client
    socket.emit('welcome', { message: `Welcome! ${socket.user?.name} Your ID is ${socket.id}`,timestamp:new Date(Date.now()),type:'system' });

    
    // Broadcast to all clients except the one connecting
    // socket.broadcast.emit('newUser', { message: `User ${socket.id} has joined` ,timestamp:new Date(Date.now())});
    
    // Handle messages from client
    socket.on('message', (data) => {
        console.log('Message received:', data);
    });

    // When a message is sent to a channel
    socket.on('sendMessage', async (serverId:string, channelId:number, message:string) => {
      console.log("serverID: ",serverId)
      const isMember = await prisma.serverMember.findUnique({
        where:{
          serverId_userId:{
            serverId:Number(serverId),
            userId:socket.user?.id!
          }
        }
      });
      if (isMember)
      {
        console.log("isMember: ",isMember);
      console.log("SEND MESSAGE: ",serverId,channelId,message)
      const roomName = `server:${serverId}:channel:${channelId}`;
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const urls = message.match(urlRegex);
      let formattedUrls;
      if(urls){
        formattedUrls = await Promise.all(
          urls.map(async (link) => ({
            link,
            isImage: await isImageUrl(link), // Ensure the async function is resolved
          }))
        );
      }
      
      
      
      const messageObj = {
        id: uuidv4(),
        userId: Number(socket.user?.id),
        user: socket.user as User,
        content: message,
        links: formattedUrls || [],
        channelId:channelId,
        serverId:Number(serverId),
        createdAt:new Date(Date.now()),
        edited:false,
        editedAt:null
      };
      console.log("MESSAGEOBJ: ",messageObj);

      // Broadcast to room
      io.to(`default-${channelId}`).emit('newMessage', messageObj);
      
      // Save to PostgreSQL && Cache in Redis
      Promise.all([await saveMessageToDatabase(messageObj),await cacheMessage(channelId, messageObj)]).catch(error=>{
        console.log(error);
      })
      }
      else{
        socket.emit('error',{message:'You are not a member of this server!'})
      }
      

    });

    socket.on('loadOlderMessages',async(channelId:number,oldestTimestamp:Date)=>{
    try{
      const loadOlderMsg = await loadOlderMessages(channelId,oldestTimestamp,20);
      socket.emit('gotOlderMessages',loadOlderMsg);
      }
    catch(error)
    {console.log(error)}
    });

    // When a user joins a channel
    socket.on('joinChannel', async (serverId, channelId) => {
      console.log(serverId,channelId);
      // Leave previous channels if needed
      const currentRooms = Array.from(socket.rooms);
      currentRooms.forEach((room)=>{
        socket.leave(room);
        io.to(room).emit('userLeft', { message: `User ${socket.user?.name} has swaped channel` ,timestamp:new Date(Date.now()),type:'system'});
      })
      // Join the new channel room
      const roomName = `default-${channelId}`;
      socket.to(roomName).emit('newUser', { message: `User ${socket.user?.name} has joined` ,timestamp:new Date(Date.now()),type:'system'});
      socket.join(roomName);
      

      console.log("Rooms from joinChannel: ",socket.rooms.keys());

      const clients = io.sockets.adapter.rooms.get(roomName);
      for (const clientId of clients! ) {

        //this is the socket of each client in the room.
        const clientSocket = io.sockets.sockets.get(clientId);

        if (!activeSocketsChannel[channelId]) {
        activeSocketsChannel[channelId] = [];
        }

        Object.keys(activeSocketsChannel).forEach((channelId)=>{
          activeSocketsChannel[channelId] = activeSocketsChannel[channelId].filter((user)=> user.id !== clientSocket?.user?.id)
        })

        const duplicate = activeSocketsChannel[channelId].some((sock)=>{
        return sock.id == clientSocket?.user?.id
        })

        if(!duplicate && clientSocket?.user)
        {
          activeSocketsChannel[channelId].push(clientSocket.user);
          io.emit('activeSocketsChannel', {activeSocketsChannel});
          // console.log("from socketChann: ", activeSocketsChannel)
        }
        else{
          io.emit('activeSocketsChannel', {activeSocketsChannel});
        }
        
        
        // console.log("client socket: ",clientSocket?.user);
   
   }
      //io.emit('activeSocketsChannel', currentSockets);
      // Get recent messages from Redis
      const recentMessages = await getRecentMessages(channelId,50);
      if(recentMessages.length<1)
      {
        const loadOlderMsg = await loadOlderMessages(channelId,new Date(),50);
        socket.emit('gotOlderMessages',loadOlderMsg);
      }
      socket.emit('recentMessages', recentMessages);
    });

    

     // Handle client disconnection
    socket.on('disconnect', () => {
        // console.log('Client disconnected:', socket.id);
        delete activeSockets[socket.id]
        const currentRooms = Array.from(socket.rooms);
        currentRooms.forEach((room)=>{
          io.to(room).emit('userLeft', { message: `User ${socket.user?.name} has disconnected` ,timestamp:new Date(Date.now()),type:'system'});
          socket.leave(room);
        })
        
        Object.keys(activeSocketsChannel).forEach((channelId)=>{
          activeSocketsChannel[channelId] = activeSocketsChannel[channelId].filter((user)=> user.id != Number(socket.user?.id))
        })
        // console.log("Active sockets: ",activeSocketsChannel);
        io.emit('activeSockets',{activeSockets});
        io.emit('activeSocketsChannel',{activeSocketsChannel});
});

socket.on('edit-message',async(data:{userId:number,messageId:string,channelId:number,newContent:string})=>{
  console.log("From edit-message: ",data)
  const userId = data.userId;
  const messageId = data.messageId;
  const channelId = data.channelId;
  const newContent= data.newContent;

  try{
    const message = await prisma.message.findUnique({
      where: {
        id: messageId,
        channelId:channelId,
      },
    });

    if (message?.id == messageId && message.userId == userId && userId == socket.user?.id)
    {
      const messsageUpdated = await prisma.message.update({
       data:{
        content:newContent, 
        edited:true,
        editedAt:new Date(Date.now())
       },
       where:{
        id:messageId,
        channelId:channelId
       }
      })
      await editMessageFromCache(channelId,messageId,newContent)
      io.to(`default-${channelId}`).emit('editedMessage', message.id,newContent);
    }
    else{
      socket.emit('error',{message:'Not your message to edit'})
    }
  }
  catch(error){
    console.log(error)
    socket.emit('error',{message:error})
  }
})

socket.on('delete-message',async(data:{userId:number,messageId:string,channelId:number})=>{
  console.log("Delete-message: ",data.userId,data.messageId,data.userId,data.channelId)
  const userId = data.userId;
  const messageId = data.messageId;
  const channelId = data.channelId;
  try{
     // First check if the message exists with the given ID and userId
     const message = await prisma.message.findUnique({
      where: {
        id: messageId,
        channelId:channelId,
      },
      include:{
        server:true
      }
    });
    console.log(message);
    if (message?.id == messageId && message.userId == userId && userId == socket.user?.id)
    {
      const deleteMessage = await prisma.message.delete({
        where:{
          userId:userId,
          id:messageId,
          channelId:channelId
        }
      });
      // console.log(channelId)
      io.to(`default-${channelId}`).emit('deletedMessage', message.id);
      await deleteMessageFromCache(channelId,messageId)
    }
    
    else if (message?.server.ownerId == userId, message?.id == messageId && userId == socket.user?.id)
      {
        const deleteMessage = await prisma.message.delete({
          where:{
            id:messageId,
            channelId:channelId
          }
        });
        // console.log(channelId)
        io.to(`default-${channelId}`).emit('deletedMessage', message!.id);
        await deleteMessageFromCache(channelId,messageId)
      }
      else{
        socket.emit('error',{message:"Not your message to delete"});
      }
    
  } catch (error){
    console.log(error);
    socket.emit('error',{message:error});
  }
  
})
});



server.listen(3000, () => {
  console.log('server running at http://localhost:3000');
});

app.get('/active-sockets', isAuthenticated , (req,res)=>{
  res.status(200).json(activeSockets);
})

app.get('/', isAuthenticated ,(req, res) => {
    res.send('Socket.IO server is running');
  });


app.post('/join-server',isAuthenticated,async(req,res)=>{
  const {user,inviteCode} = req.body;
  try{
    const joinServerResponse = await joinServer(user,inviteCode);
    console.log("joinservResp: ",joinServerResponse);
    if (joinServerResponse instanceof Error)
    {
      res.status(400).send({message:joinServerResponse.message});
    }
    else{
      res.status(200).json(joinServerResponse);
    }
    
  }catch(error){
    console.log(error);
    res.status(500).json(error)
  }
})

app.post('/leave-server',isAuthenticated, isSameUser,async(req,res)=>{
  // console.log("Req body: ",req.body)
  const {user,serverId} = req.body;
  try{
    const leaveServerResponse = await leaveServer(user,serverId);
    console.log("LeaveserverResponse: ",leaveServerResponse);
    if (leaveServerResponse instanceof Error)
    {
      res.status(400).send({message:leaveServerResponse.message});
    }
    else{
      res.status(200).json(leaveServerResponse);
    }
    
  }catch(error){
    console.log(error);
    res.status(500).json(error)
  }
})

app.post('/get-user-servers',isAuthenticated,async(req,res)=>{
    const {user} = req.body;

    try{
      const userServers = await getUserServers(user);
      console.log("userServers: ",userServers)
      res.status(200).json(userServers);
    }catch(error){
      console.log(error)
      res.status(500).json(error);
    }

})

app.post('/load-older-messages',isAuthenticated, async(req,res)=>{
  const {channelId,oldestTimestamp} = req.body;
  try{
    const loadOlderMsg = await loadOlderMessages(channelId,oldestTimestamp,20);
    res.status(200).json(loadOlderMsg);
  }
  catch(error)
  {console.log(error)}
})

app.post('/change-profile-picture', isAuthenticated, isSameUser, async(req,res)=>{
  const {picture,user}:{picture:string,user:User} = req.body;
  console.log(req.body);
  try {
      const changeProfilePicture = await prisma.user.update({data:{
        picture:picture
      },
    where:{
      id:user.id
    },
    })
    if (changeProfilePicture){
      // Find all channel message caches
      const channelKeys = await redisClient.keys('channel:*:messages');
  
      // Expire all channel message caches (set TTL to 1 second)
      for (const key of channelKeys) {
        await redisClient.expire(key, 1); // This will effectively delete them after 1 second
      }
      res.status(200).json(changeProfilePicture);
    }
    else{
      res.status(401).json(changeProfilePicture);
    }
    }
  catch(error)
  { 
    console.log(error)
    res.status(500).json(error);
  }
  
})

app.post('/create-server',isAuthenticated ,async(req,res)=>{
  console.log(req.body);
  const {name,ownerId} = req.body;
  
  try{
    const server = await createServerName(name,ownerId);
    if (server instanceof Error)
    {
      res.status(400).send({message:server.message})
    }
    else{
      res.status(200).json(server);
    }
    
  }
  catch(error)
  {
    console.log(error)
    res.status(500).json(error);
  }
})