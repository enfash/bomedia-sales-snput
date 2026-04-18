import { GoogleGenerativeAI, Schema, SchemaType } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); // Changed to flash for faster parsing

const salesSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    DATE: { type: SchemaType.STRING, description: "Date of the transaction (YYYY-MM-DD)" },
    "CLIENT NAME": { type: SchemaType.STRING, description: "Name of the client" },
    "JOB DESCRIPTION": { type: SchemaType.STRING, description: "Description of the job" },
    CONTACT: { type: SchemaType.STRING, description: "Contact number or info of the client" },
    Material: { type: SchemaType.STRING, description: "Either 'SAV' or 'Flex'" },
    actualWidth: { type: SchemaType.NUMBER, description: "The actual horizontal size in feet (e.g. 7)" },
    actualHeight: { type: SchemaType.NUMBER, description: "The actual vertical size in feet (e.g. 5)" },
    rollSize: { type: SchemaType.INTEGER, description: "The width of the roll being used (3, 4, 5, 6, 8, or 10). SAV is restricted to 3, 4, 5." },
    QTY: { type: SchemaType.INTEGER, description: "Quantity of items" },
    "INITIAL PAYMENT (₦)": { type: SchemaType.INTEGER, description: "Initial payment amount in Naira" },
    "COST PER SQRFT": { type: SchemaType.INTEGER, description: "Price per square foot. Default 200 for SAV, 180 for Flex unless specified." },
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
