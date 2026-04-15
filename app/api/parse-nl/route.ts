import { NextResponse } from 'next/server';
import { parseNaturalLanguageToSales } from '@/lib/gemini';

export async function POST(request: Request) {
  try {
    const { text } = await request.json();
    if (!text) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const structuredData = await parseNaturalLanguageToSales(text);
    
    // Once we have structuredData, we can do some validations or auto-calculations here too.
    return NextResponse.json({ data: structuredData });
  } catch (error: any) {
    console.error("Parse NL Error:", error);
    return NextResponse.json({ error: "Failed to parse text. Please try again or rephrase." }, { status: 500 });
  }
}
