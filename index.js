import express from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.js";
import dotenv from "dotenv"
import cors from "cors"
import userRouter from "./routes/userRoute.js";
import projectRouter from "./routes/projectRoute.js";
import { stripeWebhook } from "./controllers/StripeWebhooks.js";
dotenv.config()

const app = express()

const port = process.env.PORT || 8000;

app.use(cors({
    origin: process.env.TRUSTED_ORIGIN || ['http://localhost:5173'],
    credentials: true
}))

app.post('/api/stripe', express.raw({type: 'application/json'}), stripeWebhook)

app.all('/api/auth/{*any}', toNodeHandler(auth));

// app.use("/api/auth", (req, res) => toNodeHandler(auth)(req, res));


app.use(express.json({limit: "50mb"}))

app.get("/", (req, res) => {
    res.send("Server is Live")
})

app.use("/api/user", userRouter);
app.use("/api/project", projectRouter);


app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}. ${process.env.TRUSTED_ORIGIN}`);
    
});
