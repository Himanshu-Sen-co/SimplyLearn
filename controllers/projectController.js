

// controller function to rivision project

import openai from "../configs/openai.js";
import prisma from "../lib/prisma.js";

export const makeRevise = async (req, res) => {
  const userId = req.userId;
  const {projectId} = req.params;

  // --- Configuration ---
  const MODELS = [
    'stepfun/step-3.5-flash:free',
    "arcee-ai/trinity-large-preview:free",
    "tngtech/deepseek-r1t2-chimera:free",
    "z-ai/glm-4.5-air:free",
  ];

  // Helper function for AI calls with Retry/Fallback logic
  const callAIWithFallback = async (messages, config = {}) => {
    let lastError = null;
    for (const model of MODELS) {
      try {
        console.log(`🤖 Attempting with Model: ${model}`);
        const response = await openai.chat.completions.create({
          model: model,
          messages: messages,
          ...config
        });
        return response.choices[0].message.content;
      } catch (err) {
        lastError = err;
        if (err.status === 429) {
          console.warn(`⚠️ Rate limit on ${model}. Trying next fallback...`);
          continue; // Next iteration (next model)
        }
        throw err; // Agar error rate limit nahi kuch aur hai (like 401), toh stop
      }
    }
    throw lastError; // Agar saare models fail ho jayein
  };
  try {
    const {message} = req.body;
    
    if (!userId) {
      return res.status(401).json({ message: "Unautherized" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user){
        return res.status(404).json({message:"User not found"})
    }

    if (user.credits < 5) {
        return res.status(403).json({message: "add more credits to make changes"})
    }
    if (!message || message.trim() === "") {
        return res.status(400).json({message: "Please enter a valid prompt"})
    }

    const currentProject = await prisma.websiteProject.findUnique({
        where: {id: projectId, userId},
        include: {versions: true}
    })

    if (!currentProject) {
        return res.status(404).json({message: "Project not found!"})
    }

    await prisma.conversation.create({
        data: {
            role: "user",
            content: message,
            projectId
        }
    })

    await prisma.user.update({
        where: {id: userId},
        data: {credits: {decrement: 5}}
    });


    console.log("✅ Project initialized & credits deducted. Background tasks started.");

    // Enhance user prompt

    // const enhancePromptResponse = await openai.chat.completions.create({
    //     model: "qwen/qwen3-coder:free",
    //     messages: [
    //         {
    //             role: "system",
    //             content: `
    //             You are a prompt enhancement specialist. The user wants to make changes to their website. Enhance their request to be more specific and actionable for a web developer.

    //                 Enhance this by:
    //                 1. Being specific about what elements to change
    //                 2. Mentioning design details (colors, spacing, sizes)
    //                 3. Clarifying the desired outcome
    //                 4. Using clear technical terms

    //             Return ONLY the enhanced request, nothing else. Keep it concise (1-2 sentences).`
    //         },
    //         {
    //             role: "user",
    //             content: `User's request: "${message}"`
    //         }
    //     ]
    // });

    // const enhancedPrompt = enhancePromptResponse.choices[0].message.content;

    const enhancedContent = await callAIWithFallback([
      { role: "system", content: `
                You are a prompt enhancement specialist. The user wants to make changes to their website. Enhance their request to be more specific and actionable for a web developer.

                    Enhance this by:
                    1. Being specific about what elements to change
                    2. Mentioning design details (colors, spacing, sizes)
                    3. Clarifying the desired outcome
                    4. Using clear technical terms

                Return ONLY the enhanced request, nothing else. Keep it concise (1-2 sentences).`
            },
      { role: "user", content: `User's request: "${message}"` }
    ]);

    await prisma.conversation.create({
        data: {
            role: "assistant",
            content: `I've enhanced your prompt to: "${enhancedContent}"`,
            projectId
        }
    })
    
    await prisma.conversation.create({
        data: {
            role: "assistant",
            content: "Now making changes to your website...",
            projectId
        }
    });

    // regenerate code for website

    const generatedCode = await callAIWithFallback([
      { 
        role: "system", 
        content:`
                You are an expert web developer. 

                CRITICAL REQUIREMENTS:
                - Return ONLY the complete updated HTML code with the requested changes.
                - Use Tailwind CSS for ALL styling (NO custom CSS).
                - Use Tailwind utility classes for all styling changes.
                - Include all JavaScript in <script> tags before closing </body>
                - Make sure it's a complete, standalone HTML document with Tailwind CSS
                - Return the HTML Code Only, nothing else

                Apply the requested changes while maintaining the Tailwind CSS styling approach.` 
      },
      { role: "user", content: `
                Here is the current website code: "${currentProject.current_code}" The user wants this change: "${enhancedContent}"` }
    ]);

    // Cleanup code (remove backticks if any)
    const cleanCode = generatedCode.replace(/```[a-z]*\n?/gi, '').replace(/```$/g, '').trim();

    if (!cleanCode) throw new Error("Empty code generated");

    const version = await prisma.version.create({
        data: {
            code: cleanCode,
            description: "changes made",
            projectId
        }
    })

    await prisma.conversation.create({
        data: {
            role: "assistant",
            content: "I've made the changes to your website! You can now preview it",
            projectId
        }
    })


    await prisma.websiteProject.update({
        where:{id: projectId, userId},
        data:{
            current_code: cleanCode,
            current_version_index: version.id
        }
    })

    console.log("🏁 Website Re-enovation Complete.");
    return res.status(200).json({ message: "Changes made successfully"});
  } catch (error) {
    console.error("❌ Final Error:", error.message);

    // Refund Logic
    if (userId) {
      await prisma.user.update({
        where: { id: userId },
        data: { credits: { increment: 5 } }
      });
      console.log("💰 Credits refunded.");
    }

    // Inform DB about failure
    if (projectId) {
      await prisma.conversation.create({
        data: {
          role: "assistant",
          content: `Error: ${error.message}. Please try again later.`,
          projectId: projectId
        }
      });
    }

    // Headers check before sending error response
    if (!res.headersSent) {
      return res.status(500).json({ message: error.message });
    }
  }
};

// controller function to rollback project

export const rollbackProjectVersion = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
        return res.status(401).json({message: "Unauthorized"})
    }

    const {projectId, versionId} = req.params;

    if (!projectId || !versionId) {
        return res.status(404).json({message: "Project and version mismatch"})
    }

    const project = await prisma.websiteProject.findUnique({
        where: {id: projectId, userId},
        include: {versions: true}
    })

    if (!project) {
        return res.status(404).json({message: "Project not found!"})
    }

    const version = project.versions.find((version) => version.id === versionId)

    if (!version) {
        return res.status(404).json({message: "Version not found!"})
    }

    await prisma.websiteProject.update({
        where: {id: projectId, userId},
        data: {
            current_code: version.code,
            current_version_index: version.id
        }
    });

    await prisma.conversation.create({
        data: {
            role: "assistant",
            content: "I've rolled back your website to selected version. You can now preview it.",
            projectId
        }
    });

    res.status(200).json({message: "Version rolled back"})

  } catch (error) {
    console.log(error.code || error.message);
    return res.status(500).json({ message: error.message });
  }
};

// controller function to delete a project

export const deleteProject = async (req, res) => {
  try {
    const userId = req.userId;
    const {projectId} = req.params;
    if (!userId) {
        return res.status(401).json({message: "Unauthorized"})
    }

    await prisma.websiteProject.delete({
        where: {id: projectId, userId}
    })

    return res.status(200).json({message: "Project deleted successfully!"})

  } catch (error) {
    console.log(error.code || error.message);
    return res.status(500).json({ message: error.message });
  }
};

// controller function for getting project code for preview

export const previewProject = async (req, res) => {
  try {
    const userId = req.userId;
    const {projectId} = req.params;
    if (!userId) {
        return res.status(401).json({message: "Unauthorized"})
    }

    const project = await prisma.websiteProject.findFirst({
        where: {id: projectId, userId},
        include: {versions: true}
    })

    if (!project) {
        return res.status(404).json({message: "project not found!"})
    }

    return res.status(200).json({project})

  } catch (error) {
    console.log(error.code || error.message);
    return res.status(500).json({ message: error.message });
  }
};

// get published projects

export const getPublishedProjects = async (req, res) => {
  try {
    const projects = await prisma.websiteProject.findMany({
        where: {isPublished: true},
        include: {user: true}
    })

    return res.status(200).json({projects})

  } catch (error) {
    console.log(error.code || error.message);
    return res.status(500).json({ message: error.message });
  }
};

// get a single project by id

export const getProjectById = async (req, res) => {
  try {
    const {projectId} = req.params
    const project = await prisma.websiteProject.findFirst({
        where: {id: projectId}
    })

    if (!project || project.isPublished === false || !project?.current_code) {
        return res.status(404).json({message: "Project not found!"})
    }

    return res.status(200).json({code: project.current_code})

  } catch (error) {
    console.log(error.code || error.message);
    return res.status(500).json({ message: error.message });
  }
};

// controller function to save project


export const saveProject = async (req, res) => {
  try {
    const userId = req.userId
    const {projectId} = req.params
    const {code} = req.body
    if (!userId) {
        return res.status(401).json({message: "Unauthorized"})
    }
    if (!code) {
        return res.status(400).json({message: "code is required!"})
    }

    const project = await prisma.websiteProject.findUnique({
        where: {id: projectId, userId}
    })

    if (!project) {
        return res.status(404).json({message: "Project not found!"})
    }

    await prisma.websiteProject.update({
        where: {id: projectId},
        data: {current_code: code, current_version_index: ""}
    })

    return res.status(200).json({message: "Project saved successfully!"})

  } catch (error) {
    console.log(error.code || error.message);
    return res.status(500).json({ message: error.message });
  }
};

