import bcrypt from "bcryptjs";
import { NextFunction, Request, Response, Router } from "express";
import jwt from 'jsonwebtoken';
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { prisma } from ".";

export const CALLBACK_URL = 'https://websocket-api-production.up.railway.app/auth/google/callback'
export const FRONTEND = 'https://vue-websocket-one.vercel.app'


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
              picture: profile.photos?.[0]?.value ?? "",
              isGoogleUser:true
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

  
interface AuthRequest {
  email: string;
  name: string;
  password?: string;
}

router.post('/auth-email', async (req: Request, res: Response, next: NextFunction) => {
  try {
    let created = false;
    const { email, name, password } = req.body as AuthRequest;

    // Validate input
    if (!email || !name || !password) {
      res.status(400).json({ error: 'Email and name are required' });
      return next();
    }

    // Check if user already exists
    let user = await prisma.user.findUnique({ where: { email,AND:{isGoogleUser:false} } });

    if (user) {
      // Existing user login flow
      if (password && user.password) {
        // If password provided, verify it
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
          res.status(401).json({ error: 'Invalid credentials' });
          return next();
        }
      } 
    } else {
      // New user registration
      created = true;
      let hashedPassword;
      if (password) {
        // Hash password if provided
        hashedPassword = await bcrypt.hash(password, 10);
      }

      user = await prisma.user.create({
        data: {
          googleId:"random",
          email,
          name,
          password: hashedPassword,
        }
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email,
        name: user.name
      }, 
      process.env.JWT_SECRET!, 
      { expiresIn: '24h' }
    );
    
    if(created){
      res.status(201).json({
        token,
        user: {
          id: user.id,
          googleId:"random",
          email: user.email,
          name: user.name,
          picture: user.picture
        }
      });
    }
    else{
      res.status(200).json({
        token,
        user: {
          id: user.id,
          googleId:"random",
          email: user.email,
          name: user.name,
          picture: user.picture
        }
      });
    }
    
    return next();
  } catch (error) {
    console.error(error);
    
    // Handle unique constraint violation (duplicate email)
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      res.status(409).json({ error: 'Email already exists' });
      return next();
    }
    else res.status(500).json({ error: 'Server error' });
    return next();
  }
});

  export default router;