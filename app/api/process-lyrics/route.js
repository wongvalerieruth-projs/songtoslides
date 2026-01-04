import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

export async function POST(request) {
  try {
    const { text } = await request.json()

    if (!text || !text.trim()) {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      )
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY is not configured' },
        { status: 500 }
      )
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" })

    const prompt = `Process this Chinese text:
1. Convert Traditional Chinese to Simplified Chinese
2. Generate Hanyu Pinyin with tone marks
3. Apply special formatting rules:
   - The character 祢 must become "Nǐ" (capital N, lowercase ǐ with tone mark) - THIS IS THE ONLY EXCEPTION
   - ALL other pinyin must be completely lowercase with tone marks
   - Example: 我来到 should become "wǒ lái dào" (all lowercase)
   - Example: 你好 should become "nǐ hǎo" (all lowercase)
4. Return ONLY a JSON object with this format: {"simplified": "...", "pinyin": "..."}
5. No explanations, no markdown, just the JSON object

Text: ${text}`

    const result = await model.generateContent(prompt)
    const response = await result.response
    let resultText = response.text().trim()
    
    // Strip markdown code fences if present
    resultText = resultText.replace(/```json|```/g, '').trim()
    
    const parsed = JSON.parse(resultText)
    return NextResponse.json(parsed)
  } catch (error) {
    console.error('Error processing lyrics:', error)
    return NextResponse.json(
      { error: 'Failed to process lyrics', simplified: text, pinyin: text },
      { status: 500 }
    )
  }
}

