import express from "express"
import Authenticate from "../middleware/auth.js";
import { deleteProject, getProjectById, getPublishedProjects, makeRevise, previewProject, rollbackProjectVersion, saveProject } from "../controllers/projectController.js";

const projectRouter = express.Router();


projectRouter.post("/revise/:projectId", Authenticate, makeRevise); // regenerate your project
projectRouter.put("/save/:projectId", Authenticate, saveProject); // save project while edit it
projectRouter.get("/rollback/:projectId/:versionId", Authenticate, rollbackProjectVersion); // rollback project version
projectRouter.delete("/:projectId", Authenticate, deleteProject); // delete project
// projectRouter.delete("/preview:projectId", Authenticate, previewProject);    
projectRouter.get("/preview/:projectId", Authenticate, previewProject); // for preview the project
projectRouter.get("/published", Authenticate, getPublishedProjects); // for getting all published project
projectRouter.get("/idPublished/:projectId", Authenticate, getProjectById); // view published projects


export default projectRouter;

 