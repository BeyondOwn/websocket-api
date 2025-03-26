import { prisma } from "..";
import { User } from "../models/models";

export async function getUserServers(user:User){
    const userServers = await prisma.server.findMany({
        where:{
            OR:[
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