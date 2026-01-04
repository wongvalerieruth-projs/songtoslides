import { NextResponse } from 'next/server'
import JSZip from 'jszip'
import xml2js from 'xml2js'

export async function POST(request) {
  try {
    const body = await request.json()
    const { preview, metadata, templateBase64 } = body

    console.log('Received request - preview length:', preview?.length, 'templateBase64 exists:', !!templateBase64, 'templateBase64 type:', typeof templateBase64, 'templateBase64 length:', templateBase64?.length)
    console.log('Request body keys:', Object.keys(body))

    if (!preview || !Array.isArray(preview)) {
      return NextResponse.json(
        { error: 'Preview data is required' },
        { status: 400 }
      )
    }

    const lyricLines = preview.filter(item => item.type === 'lyric')

    if (!templateBase64) {
      console.error('Template base64 is missing or falsy:', templateBase64)
      return NextResponse.json(
        { error: 'Template file is required. Please upload a template first. (templateBase64 is missing)' },
        { status: 400 }
      )
    }

    if (typeof templateBase64 !== 'string') {
      console.error('Template base64 is not a string:', typeof templateBase64)
      return NextResponse.json(
        { error: 'Template file is invalid. Please upload a valid .pptx file.' },
        { status: 400 }
      )
    }

    if (templateBase64.length === 0) {
      console.error('Template base64 is empty string')
      return NextResponse.json(
        { error: 'Template file is empty. Please upload a valid .pptx file.' },
        { status: 400 }
      )
    }

    // Decode base64 template
    const templateBuffer = Buffer.from(templateBase64, 'base64')
    const zip = await JSZip.loadAsync(templateBuffer)

    // Get slide files (ppt/slides/slide*.xml)
    const slideFiles = []
    const slideKeys = Object.keys(zip.files).filter(key => 
      key.startsWith('ppt/slides/slide') && key.endsWith('.xml')
    ).sort((a, b) => {
      // Sort by slide number
      const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0')
      const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0')
      return numA - numB
    })

    // Parse slides and find text placeholders
    const slidesToUpdate = []
    for (const slideKey of slideKeys) {
      const slideXml = await zip.files[slideKey].async('string')
      const parsed = await xml2js.parseStringPromise(slideXml)
      slidesToUpdate.push({ key: slideKey, xml: parsed })
    }

    // Group lyrics into pairs (2 lines per slide)
    const lyricPairs = []
    for (let i = 0; i < lyricLines.length; i += 2) {
      lyricPairs.push({
        line1: lyricLines[i],
        line2: lyricLines[i + 1] || null,
      })
    }

    // Replace text in slides
    // We'll replace placeholders like {pinyin1}, {chinese1}, {pinyin2}, {chinese2}, {section}
    let slideIndex = 0
    for (const slide of slidesToUpdate) {
      if (slideIndex >= lyricPairs.length) break

      const pair = lyricPairs[slideIndex]
      
      // Function to recursively find and replace text in XML
      const replaceTextInElement = (element) => {
        if (typeof element === 'object' && element !== null) {
          if (Array.isArray(element)) {
            element.forEach(item => replaceTextInElement(item))
          } else {
            // Check for text elements (a:t in PowerPoint XML)
            if (element['a:t']) {
              if (Array.isArray(element['a:t'])) {
                element['a:t'].forEach(textEl => {
                  if (typeof textEl === 'string') {
                    // Replace placeholders
                    let newText = textEl
                      .replace(/{pinyin1}/g, pair.line1?.pinyin || '')
                      .replace(/{chinese1}/g, pair.line1?.simplified || '')
                      .replace(/{pinyin2}/g, pair.line2?.pinyin || '')
                      .replace(/{chinese2}/g, pair.line2?.simplified || '')
                      .replace(/{section}/g, pair.line1?.section || '')
                    
                    // If no placeholders found, try common patterns
                    if (newText === textEl && textEl.trim()) {
                      // Check if this looks like a placeholder (contains common placeholder text)
                      if (textEl.includes('Pinyin') || textEl.includes('Chinese') || textEl.includes('Text')) {
                        // Try to intelligently replace based on position or content
                        // For now, we'll replace the first placeholder-like text we find
                        if (textEl.toLowerCase().includes('pinyin') || textEl.toLowerCase().includes('拼音')) {
                          newText = pair.line1?.pinyin || pair.line2?.pinyin || ''
                        } else if (textEl.toLowerCase().includes('chinese') || textEl.toLowerCase().includes('中文')) {
                          newText = pair.line1?.simplified || pair.line2?.simplified || ''
                        }
                      }
                    }
                    
                    // Update the text
                    const textIndex = element['a:t'].indexOf(textEl)
                    if (textIndex !== -1 && newText !== textEl) {
                      element['a:t'][textIndex] = newText
                    }
                  } else if (typeof textEl === 'object' && textEl._) {
                    // Handle text with attributes
                    let newText = textEl._
                      .replace(/{pinyin1}/g, pair.line1?.pinyin || '')
                      .replace(/{chinese1}/g, pair.line1?.simplified || '')
                      .replace(/{pinyin2}/g, pair.line2?.pinyin || '')
                      .replace(/{chinese2}/g, pair.line2?.simplified || '')
                      .replace(/{section}/g, pair.line1?.section || '')
                    
                    if (newText !== textEl._) {
                      textEl._ = newText
                    }
                  }
                })
              } else if (typeof element['a:t'] === 'string') {
                element['a:t'] = element['a:t']
                  .replace(/{pinyin1}/g, pair.line1?.pinyin || '')
                  .replace(/{chinese1}/g, pair.line1?.simplified || '')
                  .replace(/{pinyin2}/g, pair.line2?.pinyin || '')
                  .replace(/{chinese2}/g, pair.line2?.simplified || '')
                  .replace(/{section}/g, pair.line1?.section || '')
              } else if (typeof element['a:t'] === 'object' && element['a:t']._) {
                element['a:t']._ = element['a:t']._
                  .replace(/{pinyin1}/g, pair.line1?.pinyin || '')
                  .replace(/{chinese1}/g, pair.line1?.simplified || '')
                  .replace(/{pinyin2}/g, pair.line2?.pinyin || '')
                  .replace(/{chinese2}/g, pair.line2?.simplified || '')
                  .replace(/{section}/g, pair.line1?.section || '')
              }
            }
            
            // Recursively process all properties
            Object.keys(element).forEach(key => {
              if (key !== 'a:t') {
                replaceTextInElement(element[key])
              }
            })
          }
        }
      }

      replaceTextInElement(slide.xml)

      // Convert back to XML string
      const builder = new xml2js.Builder({
        xmldec: { version: '1.0', encoding: 'UTF-8', standalone: true },
        renderOpts: { pretty: false }
      })
      const updatedXml = builder.buildObject(slide.xml)
      
      // Update the zip file
      zip.file(slide.key, updatedXml)
      
      slideIndex++
    }

    // Handle title slide if metadata exists
    if (metadata && (metadata.title || metadata.credits)) {
      // Try to find and update title slide (usually slide1.xml or first slide)
      if (slidesToUpdate.length > 0) {
        const titleSlide = slidesToUpdate[0]
        const replaceTitleText = (element) => {
          if (typeof element === 'object' && element !== null) {
            if (Array.isArray(element)) {
              element.forEach(item => replaceTitleText(item))
            } else {
              if (element['a:t']) {
                if (Array.isArray(element['a:t'])) {
                  element['a:t'].forEach((textEl, idx) => {
                    if (typeof textEl === 'string') {
                      if (textEl.includes('{title}') || textEl.includes('Title') || idx === 0) {
                        element['a:t'][idx] = metadata.title || textEl.replace(/{title}/g, '')
                      }
                      if (textEl.includes('{credits}') || textEl.includes('Credits') || idx === 1) {
                        element['a:t'][idx] = metadata.credits || textEl.replace(/{credits}/g, '')
                      }
                    } else if (typeof textEl === 'object' && textEl._) {
                      if (textEl._.includes('{title}') || textEl._.includes('Title')) {
                        textEl._ = metadata.title || textEl._.replace(/{title}/g, '')
                      }
                      if (textEl._.includes('{credits}') || textEl._.includes('Credits')) {
                        textEl._ = metadata.credits || textEl._.replace(/{credits}/g, '')
                      }
                    }
                  })
                }
              }
              Object.keys(element).forEach(key => {
                if (key !== 'a:t') {
                  replaceTitleText(element[key])
                }
              })
            }
          }
        }
        replaceTitleText(titleSlide.xml)
        const builder = new xml2js.Builder({
          xmldec: { version: '1.0', encoding: 'UTF-8', standalone: true },
          renderOpts: { pretty: false }
        })
        const updatedTitleXml = builder.buildObject(titleSlide.xml)
        zip.file(titleSlide.key, updatedTitleXml)
      }
    }

    // Generate the PPTX buffer
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })

    // Return as binary response
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': 'attachment; filename="lyrics-slides.pptx"',
      },
    })
  } catch (error) {
    console.error('Error generating PPTX:', error)
    return NextResponse.json(
      { error: 'Failed to generate PPTX', details: error.message },
      { status: 500 }
    )
  }
}
