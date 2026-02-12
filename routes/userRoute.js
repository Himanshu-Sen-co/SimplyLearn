import express from "express"
import { createNewProject, getUserCredits, getUserProject, getUserProjects, purchaseCredits, togglePublish } from "../controllers/userController.js"
import Authenticate from "../middleware/auth.js";

const userRouter = express.Router()

userRouter.get("/getCredits", Authenticate , getUserCredits); // get user credit
userRouter.post("/createProject", Authenticate, createNewProject); // create new project
userRouter.get("/getProject/:projectId", Authenticate, getUserProject) // get user project
userRouter.get("/getProjects", Authenticate, getUserProjects); // get all user projects
userRouter.get("/togglepublish/:projectId", Authenticate, togglePublish); // toggle publish functionality
userRouter.post("/purchasecredits", Authenticate, purchaseCredits);

export default userRouter;