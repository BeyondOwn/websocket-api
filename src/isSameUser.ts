import { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import { AuthenticatedRequest } from "./isAuthenticated";



export const isSameUser = (req:AuthenticatedRequest,
    res: Response,
    next: NextFunction):void => {
        const userId = (req.user as jwt.JwtPayload & { id: number }).id;
        console.log("SameUser: ",userId,req.body.user.id)
    if (userId != req.body.user.id) {
        res.status(403).json("Unauthorized!")
        return;
    }
   
    next();
  };