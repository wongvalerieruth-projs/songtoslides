import { NextResponse } from 'next/server'
import JSZip from 'jszip'
import xml2js from 'xml2js'

export async function POST(request) {
  try {
    const body = await request.json()
    const { preview, metadata, templateBase64 } = body

    console.log('Received request - preview length:', preview?.length, 'templateBase64 exists:', !!templateBase64)

    if (!preview || !Array.isArray(preview)) {
      return NextResponse.json(
        { error: 'Preview data is required' },
        { status: 400 }
      )
    }

    const lyricLines = preview.filter(item => item.type === 'lyric')

    if (!templateBase64) {
      return NextResponse.json(
        { error: 'Template file is required. Please upload a template first.' },
        { status: 400 }
      )
    }

    if (typeof templateBase64 !== 'string' || templateBase64.length === 0) {
      return NextResponse.json(
        { error: 'Template file is invalid. Please upload a valid .pptx file.' },
        { status: 400 }
      )
    }

    // Decode base64 template
    const templateBuffer = Buffer.from(templateBase64, 'base64')
    const zip = await JSZip.loadAsync(templateBuffer)

    // Get slide files (ppt/slides/slide*.xml)
    const slideKeys = Object.keys(zip.files).filter(key => 
      key.startsWith('ppt/slides/slide') && key.endsWith('.xml')
    ).sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0')
      const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0')
      return numA - numB
    })

    if (slideKeys.length === 0) {
      return NextResponse.json(
        { error: 'Template file has no slides. Please use a valid PowerPoint template.' },
        { status: 400 }
      )
    }

    // Group lyrics into pairs (2 lines per slide)
    const lyricPairs = []
    for (let i = 0; i < lyricLines.length; i += 2) {
      lyricPairs.push({
        line1: lyricLines[i],
        line2: lyricLines[i + 1] || null,
      })
    }

    // Identify template slides
    // First slide is title slide (if metadata exists), second slide is lyrics template
    // If no metadata, first slide is lyrics template
    const hasTitleSlide = metadata && (metadata.title || metadata.credits)
    const titleSlideKey = hasTitleSlide ? slideKeys[0] : null
    const lyricTemplateKey = hasTitleSlide ? slideKeys[1] || slideKeys[0] : slideKeys[0]

    if (!lyricTemplateKey) {
      return NextResponse.json(
        { error: 'Template file needs at least one slide for lyrics.' },
        { status: 400 }
      )
    }

    // Load the lyrics template slide
    const lyricTemplateXml = await zip.files[lyricTemplateKey].async('string')
    const lyricTemplateParsed = await xml2js.parseStringPromise(lyricTemplateXml)

    // Function to replace placeholders in XML
    const replaceTextInElement = (element, pair, sectionName) => {
      if (typeof element === 'object' && element !== null) {
        if (Array.isArray(element)) {
          element.forEach(item => replaceTextInElement(item, pair, sectionName))
        } else {
          if (element['a:t']) {
            if (Array.isArray(element['a:t'])) {
              element['a:t'].forEach(textEl => {
                if (typeof textEl === 'string') {
                  const pinyin2 = pair.line2 ? (pair.line2.pinyin || '') : ''
                  const chinese2 = pair.line2 ? (pair.line2.simplified || '') : ''
                  let newText = textEl
                    .replace(/{pinyin1}/g, pair.line1?.pinyin || '')
                    .replace(/{chinese1}/g, pair.line1?.simplified || '')
                    .replace(/{pinyin2}/g, pinyin2)
                    .replace(/{chinese2}/g, chinese2)
                    .replace(/{section}/g, sectionName)
                  
                  const textIndex = element['a:t'].indexOf(textEl)
                  if (textIndex !== -1 && newText !== textEl) {
                    element['a:t'][textIndex] = newText
                  }
                } else if (typeof textEl === 'object' && textEl._) {
                  const pinyin2 = pair.line2 ? (pair.line2.pinyin || '') : ''
                  const chinese2 = pair.line2 ? (pair.line2.simplified || '') : ''
                  let newText = textEl._
                    .replace(/{pinyin1}/g, pair.line1?.pinyin || '')
                    .replace(/{chinese1}/g, pair.line1?.simplified || '')
                    .replace(/{pinyin2}/g, pinyin2)
                    .replace(/{chinese2}/g, chinese2)
                    .replace(/{section}/g, sectionName)
                  
                  if (newText !== textEl._) {
                    textEl._ = newText
                  }
                }
              })
            } else if (typeof element['a:t'] === 'string') {
              const pinyin2 = pair.line2 ? (pair.line2.pinyin || '') : ''
              const chinese2 = pair.line2 ? (pair.line2.simplified || '') : ''
              element['a:t'] = element['a:t']
                .replace(/{pinyin1}/g, pair.line1?.pinyin || '')
                .replace(/{chinese1}/g, pair.line1?.simplified || '')
                .replace(/{pinyin2}/g, pinyin2)
                .replace(/{chinese2}/g, chinese2)
                .replace(/{section}/g, sectionName)
            } else if (typeof element['a:t'] === 'object' && element['a:t']._) {
              const pinyin2 = pair.line2 ? (pair.line2.pinyin || '') : ''
              const chinese2 = pair.line2 ? (pair.line2.simplified || '') : ''
              element['a:t']._ = element['a:t']._
                .replace(/{pinyin1}/g, pair.line1?.pinyin || '')
                .replace(/{chinese1}/g, pair.line1?.simplified || '')
                .replace(/{pinyin2}/g, pinyin2)
                .replace(/{chinese2}/g, chinese2)
                .replace(/{section}/g, sectionName)
            }
          }
          
          Object.keys(element).forEach(key => {
            if (key !== 'a:t') {
              replaceTextInElement(element[key], pair, sectionName)
            }
          })
        }
      }
    }

    // Handle title slide if metadata exists
    if (hasTitleSlide && titleSlideKey) {
      const titleSlideXml = await zip.files[titleSlideKey].async('string')
      const titleSlideParsed = await xml2js.parseStringPromise(titleSlideXml)
      
      const replaceTitleText = (element) => {
        if (typeof element === 'object' && element !== null) {
          if (Array.isArray(element)) {
            element.forEach(item => replaceTitleText(item))
          } else {
            if (element['a:t']) {
              if (Array.isArray(element['a:t'])) {
                element['a:t'].forEach((textEl, idx) => {
                  if (typeof textEl === 'string') {
                    if (textEl.includes('{title}') || textEl.includes('Title')) {
                      element['a:t'][idx] = metadata.title || textEl.replace(/{title}/g, '')
                    }
                    if (textEl.includes('{credits}') || textEl.includes('Credits')) {
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
              } else if (typeof element['a:t'] === 'string') {
                element['a:t'] = element['a:t']
                  .replace(/{title}/g, metadata.title || '')
                  .replace(/{credits}/g, metadata.credits || '')
              } else if (typeof element['a:t'] === 'object' && element['a:t']._) {
                element['a:t']._ = element['a:t']._
                  .replace(/{title}/g, metadata.title || '')
                  .replace(/{credits}/g, metadata.credits || '')
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
      
      replaceTitleText(titleSlideParsed)
      const builder = new xml2js.Builder({
        xmldec: { version: '1.0', encoding: 'UTF-8', standalone: true },
        renderOpts: { pretty: false }
      })
      const updatedTitleXml = builder.buildObject(titleSlideParsed)
      zip.file(titleSlideKey, updatedTitleXml)
    }

    // Find the highest slide number to start new slides
    const maxSlideNum = Math.max(...slideKeys.map(key => {
      const match = key.match(/slide(\d+)/)
      return match ? parseInt(match[1]) : 0
    }))

    // Create new slides for each lyric pair
    const builder = new xml2js.Builder({
      xmldec: { version: '1.0', encoding: 'UTF-8', standalone: true },
      renderOpts: { pretty: false }
    })

    const newSlideKeys = []
    for (let i = 0; i < lyricPairs.length; i++) {
      const pair = lyricPairs[i]
      const sectionName = pair.line1?.section ? pair.line1.section.replace(/^\[|\]$/g, '') : ''
      
      // Deep copy the template
      const newSlideParsed = JSON.parse(JSON.stringify(lyricTemplateParsed))
      
      // Replace placeholders
      replaceTextInElement(newSlideParsed, pair, sectionName)
      
      // Create new slide number
      const newSlideNum = maxSlideNum + i + 1
      const newSlideKey = `ppt/slides/slide${newSlideNum}.xml`
      newSlideKeys.push(newSlideKey)
      
      // Convert to XML and add to zip
      const newSlideXml = builder.buildObject(newSlideParsed)
      zip.file(newSlideKey, newSlideXml)
      
      // Copy the .rels file for the slide
      const templateRelKey = lyricTemplateKey.replace('.xml', '.xml.rels')
      const templateRelKey2 = `ppt/slides/_rels/${lyricTemplateKey.split('/').pop()}.rels`
      const relKeys = [templateRelKey, templateRelKey2]
      
      for (const relKey of relKeys) {
        if (zip.files[relKey]) {
          const relXml = await zip.files[relKey].async('string')
          const newRelKey = `ppt/slides/_rels/slide${newSlideNum}.xml.rels`
          zip.file(newRelKey, relXml)
          break
        }
      }
    }

    // Update presentation.xml to include new slides
    const presentationXmlKey = 'ppt/presentation.xml'
    const presentationXml = await zip.files[presentationXmlKey].async('string')
    const presentationParsed = await xml2js.parseStringPromise(presentationXml)

    // Get existing slide IDs
    const sldIdLst = presentationParsed['p:presentation']['p:sldIdLst']?.[0]?.['p:sldId'] || []
    let maxId = 0
    sldIdLst.forEach(sldId => {
      const id = parseInt(sldId.$?.id || '0')
      if (id > maxId) maxId = id
    })

    // Add new slide IDs
    for (let i = 0; i < lyricPairs.length; i++) {
      const newId = maxId + i + 1
      const newRId = `rId${newId}`
      sldIdLst.push({
        '$': {
          id: String(newId),
          'r:id': newRId
        }
      })
    }

    // Update presentation.xml.rels
    const presentationRelsKey = 'ppt/_rels/presentation.xml.rels'
    const presentationRelsXml = await zip.files[presentationRelsKey].async('string')
    const presentationRelsParsed = await xml2js.parseStringPromise(presentationRelsXml)

    const relationships = presentationRelsParsed.Relationships?.Relationship || []
    let maxRId = 0
    relationships.forEach(rel => {
      const match = rel.$?.Id?.match(/rId(\d+)/)
      if (match) {
        const id = parseInt(match[1])
        if (id > maxRId) maxRId = id
      }
    })

    // Add new relationships
    for (let i = 0; i < lyricPairs.length; i++) {
      const newRId = maxRId + i + 1
      const newSlideNum = maxSlideNum + i + 1
      relationships.push({
        '$': {
          Id: `rId${newRId}`,
          Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide',
          Target: `slides/slide${newSlideNum}.xml`
        }
      })
    }

    // Save updated presentation files
    zip.file(presentationXmlKey, builder.buildObject(presentationParsed))
    zip.file(presentationRelsKey, builder.buildObject(presentationRelsParsed))

    // Calculate total slides
    const totalSlides = (hasTitleSlide ? 1 : 0) + lyricPairs.length

    // Generate the PPTX buffer
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })

    // Return as binary response with slide count in headers
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': 'attachment; filename="lyrics-slides.pptx"',
        'X-Slide-Count': String(totalSlides),
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
