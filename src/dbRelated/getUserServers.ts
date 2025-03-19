import { PrismaClient } from "@prisma/client";
import { User } from "../models/models";

export async function getUserServers(user:User){
    const prisma = new PrismaClient();
    const userServers = await prisma.server.findMany({
        where:{
            OR:[
                {ownerId: Number(user.id)},
                {members:{some:{userId:Number(user.id)}}}
            ],
        },
        include:{
            members:true,
            channels:true,
        }
    })

    return userServers;
}