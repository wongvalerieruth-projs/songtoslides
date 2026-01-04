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

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' })

    const prompt = `Process this Chinese text:

Convert Traditional Chinese to Simplified Chinese
Generate Hanyu Pinyin with tone marks
Apply special formatting rules:

The character 祢 must become "Nǐ" (capital N, lowercase ǐ with tone mark) - THIS IS THE ONLY EXCEPTION
ALL other pinyin must be completely lowercase with tone marks
Example: 我来到 should become "wǒ lái dào" (all lowercase)


Return ONLY a JSON object: {"simplified": "...", "pinyin": "..."}
No explanations, just the JSON

Text: ${text}`

    const result = await model.generateContent(prompt)
    const response = await result.response
    let responseText = response.text()

    // Strip markdown code fences if present
    responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

    // Try to extract JSON from the response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return NextResponse.json({
        simplified: parsed.simplified || '',
        pinyin: parsed.pinyin || '',
      })
    }

    // Fallback: try parsing the whole response
    try {
      const parsed = JSON.parse(responseText)
      return NextResponse.json({
        simplified: parsed.simplified || '',
        pinyin: parsed.pinyin || '',
      })
    } catch (e) {
      return NextResponse.json(
        { error: 'Failed to parse AI response', details: responseText },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Error processing lyrics:', error)
    return NextResponse.json(
      { error: 'Failed to process lyrics', details: error.message },
      { status: 500 }
    )
  }
}

