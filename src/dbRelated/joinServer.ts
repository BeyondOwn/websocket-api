import { prisma } from "..";
import { User } from "../models/models";

export async function joinServer(user:User,inviteCode:string){


    const serverWithInviteCode = await prisma.server.findUnique({
        where:{
            inviteCode:inviteCode
        },
        include:{
            members:true,
        }
    }); 

    if(serverWithInviteCode)
    {
        if(!serverWithInviteCode.members.some((member)=>member.userId == Number(user.id)))
        {
            const joinServer = await prisma.serverMember.create({
                data:{
                    user:{
                        connect:{id:Number(user.id)}
                    },
                    server:{
                        connect:{id:serverWithInviteCode.id}
                    }
                },
                include:{
                    server:true,
                }
            })
            return joinServer;
        }
        else{
            return Error("User is already a member!")
        }
        
    }
    else{
        return Error("Invite Code invalid!")
    }
    
}