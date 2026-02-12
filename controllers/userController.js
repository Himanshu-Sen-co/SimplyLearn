import openai from "../configs/openai.js";
import prisma from "../lib/prisma.js";
import Stripe from "stripe"

// get user credits

export const getUserCredits = async (req, res) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unautherized" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });

    return res.status(200).json({ credits: user?.credits });
  } catch (error) {
    console.log(error.code || error.message);
    return res.status(500).json({ message: error.message });
  }
};

// controller function for create new project

export const createNewProject = async (req, res) => {
  const userId = req.userId;
  let projectId = null;

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
    const { initial_prompt } = req.body;
    if (!userId) {
      return res.status(401).json({ message: "Unautherized" });
    }

    if (!initial_prompt || initial_prompt.trim() === "") {
        return res.status(400).json({message: "Please enter a valid prompt"})
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });

    // 1. Check & Deduct Credits
    if (!user || user.credits < 5) {
      return res.status(403).json({ message: "Insufficent credits. Need at least 5." });
    }
    console.log("Initial_primpt", initial_prompt);
    
    // 2. Initial Setup in DB
    const project = await prisma.websiteProject.create({
      data: {
        name: 
            initial_prompt.length > 50
            ? initial_prompt.substring(0, 47) + "..."
            : initial_prompt,
        initial_prompt,
        userId,
      },
    });
    projectId = project.id;

    await prisma.user.update({
      where: { id: userId },
      data: { 
        credits: { decrement: 5 },
        totalCreation: { increment: 1 } 
      },
    });

    //  create new conversion

    await prisma.conversation.create({
      data: {
        role: "user",
        content: initial_prompt,
        projectId: project.id,
      },
    });

    res.json({ projectId: project.id });
    console.log("✅ Project initialized & credits deducted. Background tasks started.");

    // --- Background Tasks ---

    // A. Enhance Prompt
    const enhancedContent = await callAIWithFallback([
      { role: "system", content: `You are a prompt enhancement specialist. Take the user's website request and expand it into a detailed, comprehensive prompt that will help create the best possible website.

    Enhance this prompt by:
    1. Adding specific design details (layout, color scheme, typography)
    2. Specifying key sections and features
    3. Describing the user experience and interactions
    4. Including modern web design best practices
    5. Mentioning responsive design requirements
    6. Adding any missing but important elements

Return ONLY the enhanced prompt, nothing else. Make it detailed but concise (2-3 paragraphs max).` },
      { role: "user", content: initial_prompt }
    ]);

    await prisma.conversation.createMany({
      data: [
        { role: "assistant", content: `Enhanced Prompt: ${enhancedContent}`, projectId },
        { role: "assistant", content: "Generating production-ready code...", projectId }
      ]
    });

    // B. Generate Website Code
    const generatedCode = await callAIWithFallback([
      { 
        role: "system", 
        content: `You are an expert web developer. Create a complete, production-ready, single-page website based on this request: "${enhancedContent}"

    CRITICAL REQUIREMENTS:
    - You MUST output valid HTML ONLY. 
    - Use Tailwind CSS for ALL styling
    - Include this EXACT script in the <head>: <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
    - Use Tailwind utility classes extensively for styling, animations, and responsiveness
    - Make it fully functional and interactive with JavaScript in <script> tag before closing </body>
    - Use modern, beautiful design with great UX using Tailwind classes
    - Make it responsive using Tailwind responsive classes (sm:, md:, lg:, xl:)
    - Use Tailwind animations and transitions (animate-*, transition-*)
    - Include all necessary meta tags
    - Use Google Fonts CDN if needed for custom fonts
    - Use placeholder images from https://placehold.co/600x400
    - Use Tailwind gradient classes for beautiful backgrounds
    - Make sure all buttons, cards, and components use Tailwind styling

    CRITICAL HARD RULES:
    1. You MUST put ALL output ONLY into message.content.
    2. You MUST NOT place anything in "reasoning", "analysis", "reasoning_details", or any hidden fields.
    3. You MUST NOT include internal thoughts, explanations, analysis, comments, or markdown.
    4. Do NOT include markdown, explanations, notes, or code fences.

    The HTML should be complete and ready to render as-is with Tailwind CSS.` 
      },
      { role: "user", content: enhancedContent }
    ]);

    // Cleanup code (remove backticks if any)
    const cleanCode = generatedCode.replace(/```[a-z]*\n?/gi, '').replace(/```$/g, '').trim();

    if (!cleanCode) throw new Error("Empty code generated");

    // const EnhancePrompt = projectEnhanceResponse.choices[0].message.content;

    // await prisma.conversation.create({
    //     data: {
    //         role: "assistant",
    //         content: `I've enhance your prompt: "${EnhancePrompt}"`,
    //         projectId: project.id
    //     }
    // })

    // await prisma.conversation.create({
    //     data: {
    //         role:"assistant",
    //         content: "now generating your website...",
    //         projectId: project.id
    //     }
    // })

    // Generate website code 

    // const codeGenerateWebsite = await openai.chat.completions.create({
    //     model: "google/gemma-3-27b-it:free",
    //     // "meta-llama/llama-3.3-70b-instruct:free",
    //     // "qwen/qwen3-coder:free",
    //     messages: [
    //         {
    //             role: "system",
    //             content: `You are an expert web developer. Create a complete, production-ready, single-page website based on this request: "${EnhancePrompt}"

    // CRITICAL REQUIREMENTS:
    // - You MUST output valid HTML ONLY. 
    // - Use Tailwind CSS for ALL styling
    // - Include this EXACT script in the <head>: <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
    // - Use Tailwind utility classes extensively for styling, animations, and responsiveness
    // - Make it fully functional and interactive with JavaScript in <script> tag before closing </body>
    // - Use modern, beautiful design with great UX using Tailwind classes
    // - Make it responsive using Tailwind responsive classes (sm:, md:, lg:, xl:)
    // - Use Tailwind animations and transitions (animate-*, transition-*)
    // - Include all necessary meta tags
    // - Use Google Fonts CDN if needed for custom fonts
    // - Use placeholder images from https://placehold.co/600x400
    // - Use Tailwind gradient classes for beautiful backgrounds
    // - Make sure all buttons, cards, and components use Tailwind styling

    // CRITICAL HARD RULES:
    // 1. You MUST put ALL output ONLY into message.content.
    // 2. You MUST NOT place anything in "reasoning", "analysis", "reasoning_details", or any hidden fields.
    // 3. You MUST NOT include internal thoughts, explanations, analysis, comments, or markdown.
    // 4. Do NOT include markdown, explanations, notes, or code fences.

    // The HTML should be complete and ready to render as-is with Tailwind CSS.`
    //         },
    //         {
    //             role: "user",
    //             content: EnhancePrompt || ""
    //         }
    //     ]
    // })

    // const code = codeGenerateWebsite.choices[0].message.content || '';

    // console.log("current code is ", code);

    

    // create version for the project

    const version = await prisma.version.create({
        data: {
            code: cleanCode,
            description: 'Initial version',
            projectId: project.id
        }
    })

    await prisma.conversation.create({
        data: {
            role: "assistant",
            content: "I've created your website! you can now preview it and request your changes.",
            projectId: project.id
        }
    })

    await prisma.websiteProject.update({where: {id: project.id},
    data: {
        current_code: cleanCode,
        current_version_index: version.id
    }})

    console.log("🏁 Website Generation Complete.");

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




// Controller function to a single user project


export const getUserProject = async (req, res) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unautherized" });
    }

    const {projectId} = req.params;

    const project = await prisma.websiteProject.findUnique({
      where: {id: projectId, userId},
      include:{
        conversation: {orderBy: {timestamp: 'asc'}},
        versions: {orderBy: {timestamp: "asc"}}
      }
    })

    return res.status(200).json({project});
  } catch (error) {
    console.log(error.code || error.message);
    return res.status(500).json({ message: error.message });
  }
};

// Controller function to get all users projects

export const getUserProjects = async (req, res) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unautherized" });
    }

    const projects = await prisma.websiteProject.findMany({
      where: {userId},
      orderBy: {updatedAt: "desc"}
    })

    return res.status(200).json({projects});
  } catch (error) {
    console.log(error.code || error.message);
    return res.status(500).json({ message: error.message });
  }
};


// Controller function to toggle Project publish

export const togglePublish = async (req, res) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unautherized" });
    }

    const {projectId} = req.params;

    const project = await prisma.websiteProject.findUnique({
      where: {id: projectId, userId}
    })
    if (!project) {
      return res.status(404).json({message: "Project not found"})
    }

    await prisma.websiteProject.update({
      where: {id: projectId},
      data: {
        isPublished: !project.isPublished
      }
    })

    return res.status(200).json({message: project.isPublished ? "Project Unpublished" : "Project published successfully"});
  } catch (error) {
    console.log(error.code || error.message);
    return res.status(500).json({ message: error.message });
  }
};

//  Controller function to purchase credit

export const purchaseCredits = async (req, res) => {
  try {
    const plans = {
      basic: {credits: 100, amount: 5},
      pro: {credits: 400, amount: 19},
      enterprise: {credits: 1000, amount: 49},
    }
    const userId = req.userId;
    const origin = req.headers.origin
    const {planId} = req.body;
    const plan = plans[planId]
    if (!plan) {
      return res.status(404).json({message:"Plan not found!"})
    }
    const transaction = await prisma.transaction.create({
      data: {
        userId,
        planId,
        amount: plan.amount,
        credits: plan.credits
      }
    })

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    const session = await stripe.checkout.sessions.create({
                    success_url: `${origin}/loading`,
                    cancel_url: `${origin}`,
                    line_items: [
                      {
                        price_data: {
                          currency: "usd",
                          product_data: {name: `AiSiteBuilder - ${plan.credits} credits`},
                          unit_amount: Math.floor(transaction.amount)*100
                        },
                        quantity:1
                      },
                    ],
                    mode: 'payment',
                    metadata: {
                      transactionId: transaction.id,
                      appId: "ai-site-builder"
                    },
                    expires_at: Math.floor(Date.now() / 1000)+30*60 //expires in 30 minutes
                  });


      return res.status(200).json({payment_link: session.url})

  } catch (error) {
    console.log(error?.code || error?.message);
    return res.status(500).json({message: error?.message})
  }
};

