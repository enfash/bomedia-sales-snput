import { GoogleGenerativeAI, Schema, Type } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); // Changed to flash for faster parsing

const salesSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    DATE: { type: Type.STRING, description: "Date of the transaction (YYYY-MM-DD)" },
    "CLIENT NAME": { type: Type.STRING, description: "Name of the client" },
    "JOB DESCRIPTION": { type: Type.STRING, description: "Description of the job" },
    CONTACT: { type: Type.STRING, description: "Contact number or info of the client" },
    Material: { type: Type.STRING, description: "Either 'SAV' or 'Flex'" },
    actualWidth: { type: Type.NUMBER, description: "The actual horizontal size in feet (e.g. 7)" },
    actualHeight: { type: Type.NUMBER, description: "The actual vertical size in feet (e.g. 5)" },
    rollSize: { type: Type.INTEGER, description: "The width of the roll being used (3, 4, 5, 6, 8, or 10). SAV is restricted to 3, 4, 5." },
    QTY: { type: Type.INTEGER, description: "Quantity of items" },
    "INITIAL PAYMENT (₦)": { type: Type.INTEGER, description: "Initial payment amount in Naira" },
    "COST PER SQRFT": { type: Type.INTEGER, description: "Price per square foot. Default 200 for SAV, 180 for Flex unless specified." },
  },
  required: ["CLIENT NAME", "JOB DESCRIPTION", "Material", "actualWidth", "actualHeight", "rollSize", "QTY"]
};

export async function parseNaturalLanguageToSales(text: string) {
  const prompt = `
Extract sales details from the text. 
Rules:
- SAV sizes: 3FT, 4FT, 5FT only.
- Flex sizes: 3FT to 10FT.
- Extract actual width and height of the job, and the roll size used.
- Default costs: SAV=200, Flex=180.
Text: "${text}"
`;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: salesSchema,
      }
    });
    
    return JSON.parse(result.response.text() || "{}");
  } catch (error) {
    console.error("Gemini parse error", error);
    throw new Error("Failed to parse natural language.");
  }
}
