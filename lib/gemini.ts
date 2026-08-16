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
    console.warn("Gemini parse error — falling back to local extraction:", error);

    // Degraded fallback for when the AI is unreachable.
    //
    // It returns ONLY what can be read out of the text with confidence, and
    // never invents a value. An earlier version filled the gaps with defaults
    // ("E2E Test Client NLP", a placeholder phone number, 4x5 dimensions, a
    // hardcoded per-sqft price) which silently wrote fabricated figures into
    // the sales ledger whenever a regex missed.
    //
    // Omitting a field is safe: the sales form applies each one conditionally
    // and nothing is written until the cashier reviews and confirms. Pricing
    // is deliberately never guessed — it belongs to the Materials sheet.
    const partial: Record<string, any> = { _partial: true };

    // The wording is exactly what the cashier typed, so it is never a guess.
    partial["JOB DESCRIPTION"] = text;

    // Dimensions: "5x4", "5 by 4", "5.5 x 4"
    const dimMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:x|by)\s*(\d+(?:\.\d+)?)/i);
    if (dimMatch) {
      partial.actualWidth = parseFloat(dimMatch[1]);
      partial.actualHeight = parseFloat(dimMatch[2]);
    }

    // Quantity only when explicitly labelled — a bare number is too ambiguous.
    const qtyMatch = text.match(/(\d+)\s*(?:qty|quantity|pcs|pieces|copies)\b/i);
    if (qtyMatch) {
      partial.QTY = parseInt(qtyMatch[1], 10);
    }

    // Client name: up to three alphabetic words after "for"/"client"/"customer".
    // Bounded on purpose — an open-ended match swallows the rest of the
    // sentence, e.g. "for John 5x4 flex" capturing "John 5x4 flex".
    const clientMatch = text.match(
      /(?:\bfor\b|\bclient\b|\bcustomer\b)\s+([A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){0,2})/i
    );
    if (clientMatch) {
      partial["CLIENT NAME"] = clientMatch[1].trim();
    }

    if (/\bflex\b/i.test(text)) partial.Material = "Flex";
    else if (/\bsav\b/i.test(text)) partial.Material = "SAV";

    return partial;
  }
}
