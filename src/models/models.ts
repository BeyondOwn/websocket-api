export interface User {
    id: number
    googleId: string
    name: string
    email: string
    picture: string
  }
  
  export interface Message {
    id: number;
    content: string;
    createdAt: Date;
    edited: boolean;
    editedAt?:Date;
    userId: number;
    channelId: number;
    user?: User;
  }

  export type UrlData = {
    link: string;
    isImage: boolean;
  };

