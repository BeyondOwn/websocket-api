import { prisma } from ".."

interface User {
    id: number
    googleId: string
    name: string
    email: string
    picture: string
  }

  
  interface Message {
    content: string;
    createdAt: Date;
    userId: number;
    channelId: number;
    user:User;
  }
export const saveMessageToDatabase = async(messageObj:Message)=>{
    console.log(messageObj);
    try{
        const message = await prisma.message.create({
            data:{
                content:messageObj.content,
                channel:{
                    connect:{id:messageObj.channelId}
                },
                user:{
                    connect:{id:messageObj.user.id}
                },
            } as any
        })

        return message;
    }
    catch(error:any){
        console.log(error.message)
    }
   
}