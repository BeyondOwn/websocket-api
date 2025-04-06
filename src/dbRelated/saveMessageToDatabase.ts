import { JsonValue } from "@prisma/client/runtime/library"
import { prisma } from ".."

interface User {
    id: number
    googleId: string
    name: string
    email: string
    picture: string
  }

  
  interface Message {
    id:string;
    content: string;
    links?: JsonValue[]
    createdAt: Date;
    userId: number;
    serverId:number,
    channelId: number;
  }
export const saveMessageToDatabase = async(messageObj:Message)=>{
    console.log(messageObj);
    try{
        const message = await prisma.message.create({
            data:{
                id:messageObj.id,
                content:messageObj.content,
                links:messageObj.links || [],
                channel:{
                    connect:{id:messageObj.channelId}
                },
                user:{
                    connect:{id:messageObj.userId}
                },
                server:{
                    connect:{id:messageObj.serverId}
                }
            } as any,
            include:
            {
                user:true
            }
        })
        console.log("From inside: ",message)
        return message;
    }
    catch(error:any){
        console.log(error.message)
    }
   
}