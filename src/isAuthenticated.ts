import { NextFunction, Request, Response } from "express";
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'your_jwt_secret_key'; // In production, use environment variable

// Define a custom interface to extend Request
export interface AuthenticatedRequest extends Request {
    user?: jwt.JwtPayload | string;
}

export const isAuthenticated = (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): void => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        res.status(401).json({ message: 'No token provided' });
        return;
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        console.log("User from isAuth: ",req.user);
        next();
    } catch (error) {
        res.status(401).json({ message: 'Invalid token' });
        return;
    }
};