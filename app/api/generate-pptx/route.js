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
    console.log(`Total lyric lines to process: ${lyricLines.length}`)

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

    // Group lyrics into pairs (2 lines per slide) - BUT ONLY WITHIN THE SAME SECTION
    // Do NOT combine lines from different sections
    const lyricPairs = []
    let i = 0
    
    while (i < lyricLines.length) {
      const currentLine = lyricLines[i]
      const currentSection = currentLine?.section || ''
      
      // Find all consecutive lines in the same section
      const sectionLines = []
      let j = i
      while (j < lyricLines.length) {
        const lineSection = lyricLines[j]?.section || ''
        if (lineSection === currentSection) {
          sectionLines.push(lyricLines[j])
          j++
        } else {
          break // Different section, stop grouping
        }
      }
      
      // Pair lines within this section (2 lines per slide)
      for (let k = 0; k < sectionLines.length; k += 2) {
        lyricPairs.push({
          line1: sectionLines[k],
          line2: sectionLines[k + 1] || null, // null if odd number of lines in section
        })
      }
      
      // Move to next section
      i = j
    }
    
    console.log(`Created ${lyricPairs.length} lyric pairs from ${lyricLines.length} lines (grouped by section)`)

    // Track sections to only show section name on first slide of each section
    let previousSection = ''
    const slidesWithSections = lyricPairs.map((pair, index) => {
      const section = pair.line1?.section ? pair.line1.section.replace(/^\[|\]$/g, '') : ''
      const isNewSection = section && section !== previousSection
      previousSection = section
      return {
        pair,
        section: isNewSection ? section : '', // Only show section if it's new
        isNewSection
      }
    })

    // Identify template slides
    const hasTitleSlide = metadata && (metadata.title || metadata.credits)
    const titleSlideKey = hasTitleSlide ? slideKeys[0] : null
    let lyricTemplateKey = null
    
    if (hasTitleSlide) {
      if (slideKeys.length > 1) {
        lyricTemplateKey = slideKeys[1]
      } else {
        return NextResponse.json(
          { error: 'Template file needs at least 2 slides: one for title and one for lyrics.' },
          { status: 400 }
        )
      }
    } else {
      lyricTemplateKey = slideKeys[0]
    }

    if (!lyricTemplateKey) {
      return NextResponse.json(
        { error: 'Template file needs at least one slide for lyrics.' },
        { status: 400 }
      )
    }

    console.log(`Template: hasTitleSlide=${hasTitleSlide}, lyricTemplateKey=${lyricTemplateKey}`)

    // Load the lyrics template slide
    const lyricTemplateXml = await zip.files[lyricTemplateKey].async('string')
    const lyricTemplateParsed = await xml2js.parseStringPromise(lyricTemplateXml)
    
    // Also load the .rels file for the template slide
    const templateRelKey = `ppt/slides/_rels/${lyricTemplateKey.split('/').pop()}.rels`
    let templateRelXml = null
    let templateRelParsed = null
    if (zip.files[templateRelKey]) {
      templateRelXml = await zip.files[templateRelKey].async('string')
      try {
        templateRelParsed = await xml2js.parseStringPromise(templateRelXml)
      } catch (e) {
        console.warn('Failed to parse template .rels file:', e)
      }
    }

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

    // Builder for XML conversion - ensure proper XML structure
    const builder = new xml2js.Builder({
      xmldec: { version: '1.0', encoding: 'UTF-8', standalone: true },
      renderOpts: { pretty: false },
      headless: false
    })

    // Check if the lyrics template slide already exists in the template
    // If it does, update it with the first lyric pair, then create new slides for the rest
    const lyricTemplateSlideNum = lyricTemplateKey.match(/slide(\d+)/)?.[1]
    const lyricTemplateExists = lyricTemplateSlideNum && slideKeys.includes(lyricTemplateKey)
    
    let firstPairIndex = 0
    
    // If the lyrics template slide exists, update it with the first lyric pair
    if (lyricTemplateExists && slidesWithSections.length > 0) {
      const firstSlideData = slidesWithSections[0]
      const firstPair = firstSlideData.pair
      const sectionName = firstSlideData.section // This will be empty if not a new section
      
      // Deep copy the template
      const updatedLyricSlide = JSON.parse(JSON.stringify(lyricTemplateParsed))
      
      // Replace placeholders with first pair
      replaceTextInElement(updatedLyricSlide, firstPair, sectionName)
      
      // Update the existing slide
      const updatedXml = builder.buildObject(updatedLyricSlide)
      zip.file(lyricTemplateKey, updatedXml)
      
      firstPairIndex = 1 // Start creating new slides from the second pair
      console.log(`Updated existing slide ${lyricTemplateKey} with first pair`)
    }

    // Create new slides for remaining lyric pairs - ENSURE ALL PAIRS ARE INCLUDED
    const newSlideKeys = []
    for (let i = firstPairIndex; i < slidesWithSections.length; i++) {
      const slideData = slidesWithSections[i]
      const pair = slideData.pair
      const sectionName = slideData.section // Only set if it's a new section
      
      // Deep copy the template (always use the original parsed template)
      const newSlideParsed = JSON.parse(JSON.stringify(lyricTemplateParsed))
      
      // Replace placeholders
      replaceTextInElement(newSlideParsed, pair, sectionName)
      
      // Create new slide number
      const newSlideIndex = i - firstPairIndex
      const newSlideNum = maxSlideNum + newSlideIndex + 1
      const newSlideKey = `ppt/slides/slide${newSlideNum}.xml`
      newSlideKeys.push(newSlideKey)
      
      // Convert to XML and add to zip
      const newSlideXml = builder.buildObject(newSlideParsed)
      zip.file(newSlideKey, newSlideXml)
      
      // Create the .rels file for the slide (CRITICAL for file integrity)
      const newRelKey = `ppt/slides/_rels/slide${newSlideNum}.xml.rels`
      if (templateRelParsed) {
        // Deep copy the parsed .rels file
        const newRelParsed = JSON.parse(JSON.stringify(templateRelParsed))
        // Convert back to XML
        const newRelXml = builder.buildObject(newRelParsed)
        zip.file(newRelKey, newRelXml)
        console.log(`Created slide ${newSlideNum} with .rels file (parsed and rebuilt)`)
      } else if (templateRelXml) {
        // Fallback: use raw XML if parsing failed
        zip.file(newRelKey, templateRelXml)
        console.log(`Created slide ${newSlideNum} with .rels file (raw copy)`)
      } else {
        // Create a minimal .rels file if template doesn't have one
        const minimalRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`
        zip.file(newRelKey, minimalRels)
        console.warn(`Warning: Created minimal .rels file for slide ${newSlideNum} (template had none)`)
      }
    }

    console.log(`Created ${newSlideKeys.length} new slides (total pairs: ${lyricPairs.length}, firstPairIndex: ${firstPairIndex})`)

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

    // Add new slide IDs (only for newly created slides, not the existing slide2)
    const numNewSlides = slidesWithSections.length - firstPairIndex
    for (let i = 0; i < numNewSlides; i++) {
      const newId = maxId + i + 1
      const newRId = `rId${newId}`
      
      // Verify this slide ID doesn't already exist
      const existingSldId = sldIdLst.find(sldId => sldId.$?.id === String(newId))
      if (existingSldId) {
        console.warn(`Warning: Slide ID ${newId} already exists, skipping`)
        continue
      }
      
      sldIdLst.push({
        '$': {
          id: String(newId),
          'r:id': newRId
        }
      })
      
      console.log(`Added slide ID: ${newId} with rId: ${newRId}`)
    }

    // Update presentation.xml.rels
    const presentationRelsKey = 'ppt/_rels/presentation.xml.rels'
    const presentationRelsXml = await zip.files[presentationRelsKey].async('string')
    const presentationRelsParsed = await xml2js.parseStringPromise(presentationRelsXml)

    // Ensure Relationships structure exists
    if (!presentationRelsParsed.Relationships) {
      presentationRelsParsed.Relationships = { '$': { xmlns: 'http://schemas.openxmlformats.org/package/2006/relationships' } }
    }
    if (!presentationRelsParsed.Relationships.Relationship) {
      presentationRelsParsed.Relationships.Relationship = []
    }

    const relationships = presentationRelsParsed.Relationships.Relationship
    const relationshipsArray = Array.isArray(relationships) ? relationships : [relationships].filter(Boolean)
    
    // Find max relationship ID
    let maxRId = 0
    relationshipsArray.forEach(rel => {
      if (rel && rel.$ && rel.$.Id) {
        const match = rel.$.Id.match(/rId(\d+)/)
        if (match) {
          const id = parseInt(match[1])
          if (id > maxRId) maxRId = id
        }
      }
    })

    // Add new relationships (only for newly created slides)
    // Make sure rId matches the one used in presentation.xml
    for (let i = 0; i < numNewSlides; i++) {
      const newId = maxId + i + 1  // Match the ID used in presentation.xml
      const newRId = `rId${newId}`  // Match the rId used in presentation.xml
      const newSlideIndex = i
      const newSlideNum = maxSlideNum + newSlideIndex + 1
      
      // Verify this relationship doesn't already exist
      const existingRel = relationshipsArray.find(rel => rel.$?.Id === newRId)
      if (existingRel) {
        console.warn(`Warning: Relationship ${newRId} already exists, skipping`)
        continue
      }
      
      relationshipsArray.push({
        '$': {
          Id: newRId,
          Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide',
          Target: `slides/slide${newSlideNum}.xml`
        }
      })
      
      console.log(`Added relationship: ${newRId} -> slides/slide${newSlideNum}.xml`)
    }

    // Update the relationships array
    presentationRelsParsed.Relationships.Relationship = relationshipsArray

    // Update [Content_Types].xml to register new slide files
    const contentTypesKey = '[Content_Types].xml'
    if (zip.files[contentTypesKey]) {
      const contentTypesXml = await zip.files[contentTypesKey].async('string')
      const contentTypesParsed = await xml2js.parseStringPromise(contentTypesXml)
      
      // Ensure Types structure exists
      if (!contentTypesParsed.Types) {
        contentTypesParsed.Types = { '$': { xmlns: 'http://schemas.openxmlformats.org/package/2006/content-types' } }
      }
      if (!contentTypesParsed.Types.Override) {
        contentTypesParsed.Types.Override = []
      }
      
      const overrides = Array.isArray(contentTypesParsed.Types.Override) 
        ? contentTypesParsed.Types.Override 
        : [contentTypesParsed.Types.Override].filter(Boolean)
      
      // Add content type entries for new slides
      for (let i = 0; i < numNewSlides; i++) {
        const newSlideIndex = i
        const newSlideNum = maxSlideNum + newSlideIndex + 1
        overrides.push({
          '$': {
            PartName: `/ppt/slides/slide${newSlideNum}.xml`,
            ContentType: 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml'
          }
        })
      }
      
      contentTypesParsed.Types.Override = overrides
      zip.file(contentTypesKey, builder.buildObject(contentTypesParsed))
    }

    // Save updated presentation files
    zip.file(presentationXmlKey, builder.buildObject(presentationParsed))
    zip.file(presentationRelsKey, builder.buildObject(presentationRelsParsed))

    // Calculate total slides - VERIFY ALL LINES ARE INCLUDED
    const totalSlides = (hasTitleSlide ? 1 : 0) + lyricPairs.length
    console.log(`Total slides: ${totalSlides} (title: ${hasTitleSlide ? 1 : 0}, lyrics: ${lyricPairs.length} pairs from ${lyricLines.length} lines)`)

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
