import { PrismaClient } from "@prisma/client";
import { Router } from "express";
import jwt from 'jsonwebtoken';
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";

export const CALLBACK_URL = 'http://localhost:3000/auth/google/callback'
export const FRONTEND = 'http://localhost:5173'

declare namespace Express {
  export interface Request {
    googleProfile?: any;
    user?: {
      user: any;
      token: string;
    } | any; // Allow for different user structures
  }
}

const router = Router();




router.use(passport.initialize());
const prisma = new PrismaClient();


// Passport Google OAuth strategy setup
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    callbackURL: CALLBACK_URL,
  },
    async (accessToken, refreshToken, profile, done) => {
      try {
        console.log(profile);
        if (!profile.emails) return;
        let user = await prisma.user.findUnique({ 
          where:{email:profile.emails[0].value} 
        });

        if (!user) {
          user = await prisma.user.create({
            data: {
              googleId: profile.id,
              name: profile.displayName,
              email: profile.emails[0].value.toString(),
              picture: profile.photos?.[0]?.value ?? ""
            },
          });
        }
        
        // Generate JWT token
        const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET!, {
          expiresIn: '24h'
        });
        
        return done(null, { user, token });
      }
      catch (error){
        console.log(error);
        return done(error as Error, undefined);
      }
    }
));

  router.get('/auth/google', passport.authenticate('google',
     {
       scope: ['profile', 'email'],
       prompt:"select_account"
     }
  ));
  
  router.get('/auth/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: '/' }),
    (req: any, res) => {
      // Send token to frontend
      const token = req.user.token;
      res.redirect(`${FRONTEND}/login?token=${token}&userData=${encodeURIComponent(JSON.stringify(req.user.user,token))}`);
    }
  );

  export default router;