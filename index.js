import express from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.js";
import dotenv from "dotenv"
import cors from "cors"
dotenv.config()

const app = express()

const port = process.env.PORT || 8000;

app.use(cors({
    origin: process.env.TRUSTED_ORIGIN || ['http://localhost:5173'],
    credentials: true
}))

app.all('/api/auth/{*any}', toNodeHandler(auth));

app.get("/", (req, res) => {
    res.send("Server is Live")
})

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}. ${process.env.TRUSTED_ORIGIN}`);
    
})
