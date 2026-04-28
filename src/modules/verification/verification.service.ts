import OpenAI from "openai";
import axios from "axios";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

export class AiVerificationService {
  static async analyzeProof(screenshotUrl: string, taskRules: any): Promise<{ score: number; reason: string }> {
    try {
      const imageResponse = await axios.get(screenshotUrl, { responseType: "arraybuffer" });
      const base64Image = Buffer.from(imageResponse.data, "binary").toString("base64");
      const mimeType = imageResponse.headers["content-type"] || "image/jpeg";

      // 2. Construct the dynamic context
      const dynamicRules = typeof taskRules === 'string' ? taskRules : JSON.stringify(taskRules, null, 2);
      
      const prompt = `
        You are an expert QA auditor for a micro-tasking platform.
        Verify if the user completed the task based STRICTLY on these requirements:
        
        REQUIREMENTS:
        ${dynamicRules}

        Analyze the image and return ONLY a valid JSON object.
        {
          "score": <Integer from 0 to 100 representing confidence of completion>,
          "reason": "<One short sentence explaining the score>"
        }
      `;

      // 3. Call OpenAI (gpt-4o-mini is ultra-fast and cheap for vision tasks)
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini", // Change to "gpt-4o" if you need higher reasoning for complex images
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  // OpenAI requires the specific data URI syntax for base64 images
                  url: `data:${mimeType};base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        // 4. Force pure JSON output (Requires the prompt to explicitly ask for JSON, which ours does)
        response_format: { type: "json_object" }, 
      });

      const resultText = response.choices[0].message.content;
      if (!resultText) throw new Error("OpenAI returned an empty response.");

      const parsed = JSON.parse(resultText);

      return {
        score: Number(parsed.score) || 0,
        reason: parsed.reason || "Processed by AI."
      };

    } catch (error: any) {
      console.error("AI Verification Failed:", error.message);
      // EDGE CASE: If OpenAI rate limits or the image fetch fails, default to manual review.
      return { score: 75, reason: "AI verification failed. Flagged for manual review." };
    }
  }
}