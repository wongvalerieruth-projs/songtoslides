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

    let result
    let response
    let resultText
    
    // Retry logic for API calls (handles rate limits and transient errors)
    const maxRetries = 3
    let lastError = null
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        result = await model.generateContent(prompt)
        response = await result.response
        resultText = response.text().trim()
        lastError = null
        break // Success, exit retry loop
      } catch (apiError) {
        lastError = apiError
        console.error(`Gemini API error (attempt ${attempt}/${maxRetries}):`, apiError)
        
        // Check if it's a rate limit error
        const errorMessage = apiError.message || String(apiError)
        if (errorMessage.includes('429') || errorMessage.includes('rate limit') || errorMessage.includes('quota') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
          // Rate limited - wait longer before retrying (10 RPM = 6 seconds minimum, use 7s)
          if (attempt < maxRetries) {
            const waitTime = 7000 + (attempt * 1000) // 7s, 8s, 9s
            console.log(`Rate limited (429/RESOURCE_EXHAUSTED), waiting ${waitTime}ms before retry...`)
            await new Promise(resolve => setTimeout(resolve, waitTime))
            continue
          }
        }
        
        // If it's the last attempt or not a rate limit, break
        if (attempt === maxRetries) {
          break
        }
        
        // Wait before retry for other errors
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
      }
    }
    
    if (lastError) {
      console.error('Gemini API failed after retries:', lastError)
      // Return fallback data with 200 status so frontend can use it
      return NextResponse.json({
        error: 'API request failed after retries',
        simplified: text || '',
        pinyin: ''
      })
    }
    
    // Strip markdown code fences if present
    resultText = resultText.replace(/```json|```/g, '').trim()
    
    // Try to extract JSON from response
    let parsed
    try {
      parsed = JSON.parse(resultText)
    } catch (parseError) {
      // Try to find JSON object in the response
      const jsonMatch = resultText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0])
        } catch (e) {
          console.error('Failed to parse extracted JSON:', e)
          // Return fallback with 200 status
          return NextResponse.json({
            error: 'Failed to parse API response',
            simplified: text || '',
            pinyin: ''
          })
        }
      } else {
        console.error('No JSON found in response:', resultText.substring(0, 200))
        // Return fallback with 200 status
        return NextResponse.json({
          error: 'No valid JSON in API response',
          simplified: text || '',
          pinyin: ''
        })
      }
    }
    
    // Validate response has required fields
    if (!parsed.simplified && !parsed.pinyin) {
      // Fallback: return original text if parsing failed
      return NextResponse.json({
        error: 'Empty response from API',
        simplified: text || '',
        pinyin: ''
      })
    }
    
    return NextResponse.json({
      simplified: parsed.simplified || text,
      pinyin: parsed.pinyin || ''
    })
  } catch (error) {
    console.error('Unexpected error processing lyrics:', error)
    console.error('Input text:', text)
    // Return original text as fallback with 200 status so frontend can use it
    return NextResponse.json({
      error: 'Failed to process lyrics: ' + (error.message || 'Unknown error'),
      simplified: text || '',
      pinyin: ''
    })
  }
}

