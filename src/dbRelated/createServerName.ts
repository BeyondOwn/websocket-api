import { PrismaClient } from "@prisma/client";

export async function generateInviteCodeFromServerId(serverId:string) {
    // Convert serverId to base36 for shorter representation
    
    // Add some randomness to make it less predictable
    const randomPart = Math.random().toString(36).substring(2, 6);
    
    // Combine them to create the invite code
    const inviteCode = `${serverId}-${randomPart}`;
    
    console.log(inviteCode);
    return inviteCode;
  }

export const createServerName = async (name:string,ownerId:number,
    description?:string,
    isPublic:boolean = false) =>{
    
    if(name.length <2) return Error("Server name length should be longer than 2 characters")

    const prisma = new PrismaClient();
    const inviteCodeGenerated = await generateInviteCodeFromServerId(name);

    try{
        const server = await prisma.server.create({
            data:{
                name:name,
                description:description,
                isPublic:isPublic,
                inviteCode:inviteCodeGenerated,
                ownerId:ownerId,
                members:{
                    create:{
                        userId:ownerId,
                        role:"admin",
                    } 
                }
            },
            include:{
                members:true
            }
        })
        const defaultChannel = await prisma.channel.create({
            data:{
                name:`default-${server.id}`,
                serverId:server.id
            }
        })
        return {server:server,channel:defaultChannel}
    }
    catch(error:any)
    {
        console.log(error)
        return Error(error)
    }
}