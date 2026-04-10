import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export class AiVerificationService {
  static async analyzeProof(screenshotUrl: string, taskRules: any): Promise<{ score: number; reason: string }> {
    try {
      // 1. Fetch the image from Supabase Storage and convert to Base64
      const imageResponse = await axios.get(screenshotUrl, { responseType: "arraybuffer" });
      const base64Image = Buffer.from(imageResponse.data, "binary").toString("base64");
      const mimeType = imageResponse.headers["content-type"] || "image/jpeg";

      // 2. Construct the dynamic context (The "Mad Libs" prompt)
      const dynamicRules = typeof taskRules === 'string' ? taskRules : JSON.stringify(taskRules, null, 2);
      
      const prompt = `
        You are an expert QA auditor for a micro-tasking platform.
        Verify if the user completed the task based STRICTLY on these requirements:
        
        REQUIREMENTS:
        ${dynamicRules}

        Analyze the image and return ONLY a valid JSON object. Do not use markdown blocks like \`\`\`json.
        {
          "score": <Integer from 0 to 100 representing confidence of completion>,
          "reason": "<One short sentence explaining the score>"
        }
      `;

      // 3. Call Gemini 1.5 Flash (Optimized for fast multimodal tasks)
      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.0-flash",
        generationConfig: { responseMimeType: "application/json" } // Forces pure JSON output
      });

      const result = await model.generateContent([
        { inlineData: { data: base64Image, mimeType } },
        prompt
      ]);

      const resultText = result.response.text();
      const parsed = JSON.parse(resultText);

      return {
        score: Number(parsed.score) || 0,
        reason: parsed.reason || "Processed by AI."
      };

    } catch (error: any) {
      console.error("AI Verification Failed:", error.message);
      // EDGE CASE: If Gemini fails, rate limits, or the image URL is dead, DO NOT reject the user.
      // Push it to manual review with a score of 75.
      return { score: 75, reason: "AI verification failed. Flagged for manual review." };
    }
  }
}