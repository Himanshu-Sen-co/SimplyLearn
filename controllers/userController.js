import openai from "../configs/openai";
import prisma from "../lib/prisma";

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
  try {
    const { initial_prompt } = req.body;
    if (!userId) {
      return res.status(401).json({ message: "Unautherized" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (user && user?.credits < 5) {
      return res
        .status(403)
        .json({ message: "Add credits to create more projects" });
    }
    // create new project
    const project = await prisma.websiteProject.create({
      data: {
        name:
          initial_prompt.length > 50
            ? initial_prompt.subString(0, 47) + "..."
            : initial_prompt,
        initial_prompt,
        userId,
      },
    });

    // update user's total creation

    await prisma.user.update({
      where: { id: userId },
      data: { totalCreation: { increment: 1 } },
    });

    //  create new conversion

    await prisma.conversation.create({
      data: {
        role: "user",
        content: initial_prompt,
        projectId: project.id,
      },
    });

    // reduse credits from users

    await prisma.user.update({
      where: { id: userId },
      data: { credits: { decrement: 5 } },
    });

    res.json({ credits: user?.credits });

    // Enhance user prompt

    const projectEnhanceResponse = await openai.chat.completions.create({
      model: "z-ai/glm-4.5-air:free",
      messages: [
        {
          role: "system",
          content: `You are a prompt enhancement specialist. Take the user's website request and expand it into a detailed, comprehensive prompt that will help create the best possible website.

                Enhance this prompt by:
                1. Adding specific design details (layout, color scheme, typography)
                2. Specifying key sections and features
                3. Describing the user experience and interactions
                4. Including modern web design best practices
                5. Mentioning responsive design requirements
                6. Adding any missing but important elements

            Return ONLY the enhanced prompt, nothing else. Make it detailed but concise (2-3 paragraphs max).`,
        },
        {
            role: "user",
            content: initial_prompt
        }
      ],
    });

    const EnhancePrompt = projectEnhanceResponse.choices[0].message.content;

    await prisma.conversation.create({
        data: {
            role: "assistant",
            content: `I've enhance your prompt: "${EnhancePrompt}"`,
            projectId: project.id
        }
    })

    await prisma.conversation.create({
        data: {
            role:"assistant",
            content: "now generating your website...",
            projectId: project.id
        }
    })

    // Generate website code 

    const codeGenerateWebsite = await openai.chat.completions.create({
        model: "z-ai/glm-4.5-air:free",
        messages: [
            {
                role: "system",
                content: `You are an expert web developer. Create a complete, production-ready, single-page website based on this request: "${EnhancePrompt}"

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
            {
                role: "user",
                content: EnhancePrompt || ""
            }
        ]
    })

    const code = codeGenerateWebsite.choices[0].message.content || '';

    // create version for the project

    const version = await prisma.version.create({
        data: {
            code: code.replace(/```[a-z]*\n?/gi, '').replace(/```$/g, '').trim(),
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
        current_code: code.replace(/```[a-z]*\n?/gi, '').replace(/```$/g, '').trim(),
        current_version_index: version.id
    }})


  } catch (error) {
    await prisma.user.update({
        where: {id: userId},
        data: {
            credits: {increment: 5}
        }
    })
    console.log(error);
    return res.status(500).json({ message: error.message });
  }
};
