import { prisma } from "..";
import { User } from "../models/models";

export async function leaveServer(user:User,serverId:string){

const ServerWithOwner = await prisma.server.findUnique({where:{
    id: Number(serverId)
},include:{
    owner:true,
}})

if (ServerWithOwner?.ownerId == user.id)
{
    const DeleteServerOfOwner = await prisma.server.delete({
        where:{
            id:Number(serverId),
            ownerId:user.id
        }
    })
    return DeleteServerOfOwner;
}
else{
    const leaveServer = await prisma.serverMember.delete({
        where:{
            serverId_userId:{
                serverId:Number(serverId),
                userId:user.id
            }
        },
        include:{
            server:true,
        }
    })
    return leaveServer;
}

}
       
    