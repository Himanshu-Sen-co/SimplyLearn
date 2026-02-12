import "dotenv/config"

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "./prisma.js"

const trustedOrigins  = process.env.TRUSTED_ORIGIN 
    ? [process.env.TRUSTED_ORIGIN] 
    : ["http://localhost:5173"];

export const auth = betterAuth({
    database: prismaAdapter(prisma, {
        provider: "postgresql", 
    }),

    emailAndPassword: { 
    enabled: true, 
    }, 
    emailVerification: {
        enabled: true
    },
    user: {
        changeEmail: {enabled: true},
        deleteUser: {enabled: true},
    },

    trustedOrigins,
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    advanced: {
        cookies: {
            session_token: {
                name: "auth-session",
                attributes: {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === "production",
                    sameSite: process.env.NODE_ENV === "production" ? "none" : "Lax",
                    path: "/"
                }
            }
        }
    }
});