import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

export async function POST(request) {
  let body
  let isBatch
  let texts
  
  try {
    body = await request.json()
    
    // Support both single line and batch processing
    isBatch = Array.isArray(body.texts) && body.texts.length > 0
    texts = isBatch ? body.texts : (body.text ? [body.text] : [])
    
    if (texts.length === 0) {
      return NextResponse.json(
        { error: 'Text is required', simplified: '', pinyin: '' },
        { status: 200 }
      )
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      const fallback = isBatch 
        ? texts.map(t => ({ simplified: t, pinyin: '' }))
        : { simplified: texts[0] || '', pinyin: '' }
      return NextResponse.json(
        { error: 'GEMINI_API_KEY is not configured', ...(isBatch ? { results: fallback } : fallback) },
        { status: 200 }
      )
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" })

    // Build prompt for batch or single
    let prompt
    if (isBatch && texts.length > 1) {
      // Batch processing: send all lines and request array response
      const linesList = texts.map((text, idx) => `${idx + 1}. ${text}`).join('\n')
      prompt = `Process these ${texts.length} Chinese text lines:
1. Convert Traditional Chinese to Simplified Chinese
2. Generate Hanyu Pinyin with tone marks
3. Apply special formatting rules:
   - The character 祢 must become "Nǐ" (capital N, lowercase ǐ with tone mark) - THIS IS THE ONLY EXCEPTION
   - ALL other pinyin must be completely lowercase with tone marks
   - Example: 我来到 should become "wǒ lái dào" (all lowercase)
   - Example: 你好 should become "nǐ hǎo" (all lowercase)
4. Return ONLY a JSON array with this format: [{"simplified": "...", "pinyin": "..."}, {"simplified": "...", "pinyin": "..."}, ...]
5. The array must have exactly ${texts.length} items, one for each input line in order
6. No explanations, no markdown, just the JSON array

Lines:
${linesList}`
    } else {
      // Single line processing (backward compatibility)
      const text = texts[0]
      prompt = `Process this Chinese text:
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
    }

    let result
    let response
    let resultText
    
    // Retry logic for API calls
    const maxRetries = 3
    let lastError = null
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        result = await model.generateContent(prompt)
        response = await result.response
        resultText = response.text().trim()
        lastError = null
        break
      } catch (apiError) {
        lastError = apiError
        const errorMessage = apiError.message || String(apiError) || JSON.stringify(apiError)
        console.error(`Gemini API error (attempt ${attempt}/${maxRetries}):`, errorMessage)
        
        const isRateLimit = errorMessage.includes('429') || 
                           errorMessage.includes('rate limit') || 
                           errorMessage.includes('quota') || 
                           errorMessage.includes('RESOURCE_EXHAUSTED') ||
                           errorMessage.includes('ResourceExhausted')
        
        if (isRateLimit) {
          if (attempt < maxRetries) {
            const waitTime = 7000 + (attempt * 1000)
            console.log(`Rate limited, waiting ${waitTime}ms before retry...`)
            await new Promise(resolve => setTimeout(resolve, waitTime))
            continue
          } else {
            console.error('Rate limit hit on final attempt')
            const fallback = isBatch 
              ? texts.map(t => ({ simplified: t, pinyin: '' }))
              : { simplified: texts[0] || '', pinyin: '' }
            return NextResponse.json({
              error: 'Rate limit exceeded. Please wait and try again.',
              ...(isBatch ? { results: fallback } : fallback)
            })
          }
        }
        
        if (attempt === maxRetries) break
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
      }
    }
    
    if (lastError) {
      console.error('Gemini API failed after retries:', lastError)
      const fallback = isBatch 
        ? texts.map(t => ({ simplified: t, pinyin: '' }))
        : { simplified: texts[0] || '', pinyin: '' }
      return NextResponse.json({
        error: 'API request failed after retries',
        ...(isBatch ? { results: fallback } : fallback)
      })
    }
    
    if (!resultText) {
      console.error('resultText is undefined or empty')
      const fallback = isBatch 
        ? texts.map(t => ({ simplified: t, pinyin: '' }))
        : { simplified: texts[0] || '', pinyin: '' }
      return NextResponse.json({
        error: 'Empty response from API',
        ...(isBatch ? { results: fallback } : fallback)
      })
    }
    
    // Strip markdown code fences
    resultText = resultText.replace(/```json|```/g, '').trim()
    
    // Parse JSON response
    let parsed
    try {
      parsed = JSON.parse(resultText)
    } catch (parseError) {
      const jsonMatch = resultText.match(/\[[\s\S]*\]|\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0])
        } catch (e) {
          console.error('Failed to parse extracted JSON:', e)
          const fallback = isBatch 
            ? texts.map(t => ({ simplified: t, pinyin: '' }))
            : { simplified: texts[0] || '', pinyin: '' }
          return NextResponse.json({
            error: 'Failed to parse API response',
            ...(isBatch ? { results: fallback } : fallback)
          })
        }
      } else {
        console.error('No JSON found in response:', resultText.substring(0, 200))
        const fallback = isBatch 
          ? texts.map(t => ({ simplified: t, pinyin: '' }))
          : { simplified: texts[0] || '', pinyin: '' }
        return NextResponse.json({
          error: 'No valid JSON in API response',
          ...(isBatch ? { results: fallback } : fallback)
        })
      }
    }
    
    // Handle batch vs single response
    if (isBatch) {
      // Expect array response
      if (!Array.isArray(parsed)) {
        console.error('Expected array response for batch, got:', typeof parsed)
        return NextResponse.json({
          error: 'Invalid response format: expected array',
          results: texts.map(t => ({ simplified: t, pinyin: '' }))
        })
      }
      
      // Ensure we have results for all inputs
      const results = []
      for (let i = 0; i < texts.length; i++) {
        if (parsed[i] && typeof parsed[i] === 'object') {
          results.push({
            simplified: parsed[i].simplified || texts[i],
            pinyin: parsed[i].pinyin || ''
          })
        } else {
          // Missing or invalid result for this line
          results.push({
            simplified: texts[i],
            pinyin: ''
          })
        }
      }
      
      return NextResponse.json({ results })
    } else {
      // Single line response
      if (!parsed.simplified && !parsed.pinyin) {
        return NextResponse.json({
          error: 'Empty response from API',
          simplified: texts[0] || '',
          pinyin: ''
        })
      }
      
      return NextResponse.json({
        simplified: parsed.simplified || texts[0],
        pinyin: parsed.pinyin || ''
      })
    }
  } catch (error) {
    console.error('Unexpected error processing lyrics:', error)
    // Use stored variables if available, otherwise create fallback
    if (!texts || texts.length === 0) {
      texts = ['']
      isBatch = false
    }
    const fallback = isBatch 
      ? texts.map(t => ({ simplified: t || '', pinyin: '' }))
      : { simplified: texts[0] || '', pinyin: '' }
    return NextResponse.json({
      error: 'Failed to process lyrics: ' + (error.message || 'Unknown error'),
      ...(isBatch ? { results: fallback } : fallback)
    })
  }
}
