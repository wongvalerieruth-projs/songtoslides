import { NextResponse } from 'next/server'
import PptxGenJS from 'pptxgenjs'

export async function POST(request) {
  try {
    const { preview, metadata } = await request.json()

    if (!preview || !Array.isArray(preview)) {
      return NextResponse.json(
        { error: 'Preview data is required' },
        { status: 400 }
      )
    }

    const pptx = new PptxGenJS()

    // Set slide dimensions (16:9 aspect ratio)
    pptx.layout = 'LAYOUT_WIDE'

    // Add title slide if metadata exists
    if (metadata && (metadata.title || metadata.credits)) {
      const titleSlide = pptx.addSlide()
      titleSlide.background = { color: '000000' }
      
      if (metadata.title) {
        titleSlide.addText(metadata.title, {
          x: 0.5,
          y: 2,
          w: 9,
          h: 1,
          fontSize: 48,
          bold: true,
          color: 'FFFFFF',
          align: 'center',
        })
      }
      
      if (metadata.credits) {
        titleSlide.addText(metadata.credits, {
          x: 0.5,
          y: 3.5,
          w: 9,
          h: 0.5,
          fontSize: 24,
          color: 'CCCCCC',
          align: 'center',
        })
      }
    }

    // Process preview data to create lyrics slides
    const lyricLines = preview.filter(item => item.type === 'lyric')
    
    // Track current section to show label on first slide of each section
    let currentSection = ''
    
    // Group lines into pairs (2 lines per slide)
    for (let i = 0; i < lyricLines.length; i += 2) {
      const slide = pptx.addSlide()
      slide.background = { color: '000000' }

      const line1 = lyricLines[i]
      const line2 = lyricLines[i + 1]

      // Add section label if section changed (first slide of new section)
      if (line1 && line1.section && line1.section !== currentSection) {
        currentSection = line1.section
        slide.addText(line1.section, {
          x: 0.5,
          y: 0.5,
          w: 9,
          h: 0.5,
          fontSize: 18,
          color: 'CCCCCC',
        })
      }

      // First line
      if (line1) {
        // Pinyin
        slide.addText(line1.pinyin, {
          x: 1,
          y: 2,
          w: 8,
          h: 0.5,
          fontSize: 16,
          color: 'CCCCCC',
          align: 'center',
        })
        // Chinese text
        slide.addText(line1.simplified, {
          x: 1,
          y: 2.5,
          w: 8,
          h: 0.8,
          fontSize: 32,
          bold: true,
          color: 'FFFFFF',
          align: 'center',
        })
      }

      // Second line (if exists)
      if (line2) {
        // Pinyin
        slide.addText(line2.pinyin, {
          x: 1,
          y: 3.8,
          w: 8,
          h: 0.5,
          fontSize: 16,
          color: 'CCCCCC',
          align: 'center',
        })
        // Chinese text
        slide.addText(line2.simplified, {
          x: 1,
          y: 4.3,
          w: 8,
          h: 0.8,
          fontSize: 32,
          bold: true,
          color: 'FFFFFF',
          align: 'center',
        })
      }
    }

    // Generate buffer
    const buffer = await pptx.write({ outputType: 'nodebuffer' })

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

