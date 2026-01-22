'use client'

import { useState, useRef } from 'react'
import { CheckCircle, AlertCircle, Upload, Loader2, File } from 'lucide-react'

export default function Home() {
  const [lyricsText, setLyricsText] = useState('')
  const [preview, setPreview] = useState([])
  const [metadata, setMetadata] = useState({ title: '', credits: '' })
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState({ type: null, message: '' })
  const [isGenerating, setIsGenerating] = useState(false)
  const [uploadedFile, setUploadedFile] = useState(null)
  const [templateBase64, setTemplateBase64] = useState(null) // Store base64 directly
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef(null)

  // Extract metadata and parse sections
  const parseLyrics = (text) => {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line)
    const parsed = []
    let currentSection = ''
    let extractedMetadata = { title: '', credits: '' }

    for (const line of lines) {
      // Extract title
      if (line.match(/^(Title|Song Title):\s*(.+)/i)) {
        const match = line.match(/^(Title|Song Title):\s*(.+)/i)
        extractedMetadata.title = match[2]
        continue
      }

      // Extract credits
      if (line.match(/^(Credits|Credit):\s*(.+)/i)) {
        const match = line.match(/^(Credits|Credit):\s*(.+)/i)
        extractedMetadata.credits = match[2]
        continue
      }

      // Check for section markers (must be exactly [Something] on its own line, with optional whitespace)
      const trimmedLine = line.trim()
      const sectionMatch = trimmedLine.match(/^\[(.+)\]$/)
      if (sectionMatch) {
        currentSection = `[${sectionMatch[1]}]`
        parsed.push({
          type: 'section',
          section: currentSection,
          original: line,
        })
        console.log(`Found section marker: ${currentSection}`)
        continue // Skip processing this line - it's a section marker, not a lyric
      }

      // Regular lyric line
      if (line) {
        parsed.push({
          type: 'lyric',
          section: currentSection,
          original: line,
          simplified: '',
          pinyin: '',
        })
      }
    }

    return { parsed, metadata: extractedMetadata }
  }

  const handleProcess = async () => {
    if (!lyricsText.trim()) {
      setStatus({ type: 'error', message: '请输入歌词 Please enter lyrics' })
      return
    }

      setIsProcessing(true)
      setProgress(0)
      setStatus({ 
        type: 'info', 
        message: `处理中 Processing... (批量处理 Batch processing: 10行/批次 10 lines per batch)` 
      })

      try {
        const { parsed, metadata: extractedMetadata } = parseLyrics(lyricsText)
        setMetadata(extractedMetadata)

        // Filter only lyric lines for processing (explicitly exclude section markers)
        const lyricLines = parsed.filter(item => {
          const isLyric = item.type === 'lyric'
          if (!isLyric) {
            console.log(`Filtering out non-lyric item:`, item.type, item.original)
          }
          return isLyric
        })
        const totalLines = lyricLines.length
        
        console.log(`Found ${totalLines} lyric lines to process (filtered from ${parsed.length} total items)`)

        if (totalLines === 0) {
          setStatus({ type: 'error', message: '未找到歌词行 No lyric lines found' })
          setIsProcessing(false)
          return
        }

        // Batch processing: 10 lines per batch
        const BATCH_SIZE = 10
        const batches = []
        for (let i = 0; i < lyricLines.length; i += BATCH_SIZE) {
          batches.push(lyricLines.slice(i, i + BATCH_SIZE))
        }
        const totalBatches = batches.length
        
        console.log(`[BATCH MODE] Grouped ${totalLines} lines into ${totalBatches} batches (${BATCH_SIZE} lines per batch)`)
        console.log(`[BATCH MODE] Starting batch processing - this should NOT show "Line X: Making API request"`)

        const processed = []
        
        // Process each batch
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
          const batch = batches[batchIndex]
          const batchStartLine = batchIndex * BATCH_SIZE + 1
          const batchEndLine = Math.min(batchStartLine + batch.length - 1, totalLines)
          
          setStatus({ 
            type: 'info', 
            message: `处理批次 Processing batch ${batchIndex + 1} of ${totalBatches} (lines ${batchStartLine}-${batchEndLine} of ${totalLines})...` 
          })
          
          const batchProgress = Math.round((batchIndex / totalBatches) * 100)
          setProgress(batchProgress)
          
          console.log(`Processing batch ${batchIndex + 1}/${totalBatches}: lines ${batchStartLine}-${batchEndLine}`)
          
          let batchProcessed = false
          let batchResults = []
          
          try {
            // Extract text from batch
            const batchTexts = batch.map(line => line.original)
            
            console.log(`Batch ${batchIndex + 1}: Sending ${batchTexts.length} lines to API`)
            
            const response = await fetch('/api/process-lyrics', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ texts: batchTexts }),
            })
            
            const responseText = await response.text()
            console.log(`Batch ${batchIndex + 1}: Response status: ${response.status}, body preview:`, responseText.substring(0, 200))
            
            let data
            try {
              data = JSON.parse(responseText)
            } catch (parseError) {
              console.error(`Batch ${batchIndex + 1}: Failed to parse JSON:`, parseError, 'Response:', responseText)
              throw new Error(`Invalid JSON response from API`)
            }
            
            if (!response.ok || data.error) {
              console.error(`Batch ${batchIndex + 1}: API error:`, data.error, 'Status:', response.status)
              throw new Error(data.error || `Batch ${batchIndex + 1} failed with status ${response.status}`)
            }
            
            // Validate batch response
            if (!data.results || !Array.isArray(data.results)) {
              console.error(`Batch ${batchIndex + 1}: Invalid response format. Expected results array, got:`, data)
              throw new Error(`Invalid batch response: expected results array, got ${typeof data.results}`)
            }
            
            if (data.results.length !== batch.length) {
              console.warn(`Batch ${batchIndex + 1}: Expected ${batch.length} results, got ${data.results.length}`)
            }
            
            console.log(`Batch ${batchIndex + 1}: Successfully received ${data.results.length} results`)
            
            // Map results back to lines
            batchResults = batch.map((line, idx) => {
              const result = data.results[idx]
              if (result && (result.simplified || result.pinyin)) {
                return {
                  ...line,
                  type: 'lyric',
                  simplified: result.simplified || line.original,
                  pinyin: result.pinyin || '',
                }
              } else {
                // Missing or invalid result
                console.warn(`Batch ${batchIndex + 1}, line ${idx + 1}: Missing result, using original`)
                return {
                  ...line,
                  type: 'lyric',
                  simplified: line.original,
                  pinyin: '',
                }
              }
            })
            
            batchProcessed = true
            processed.push(...batchResults)
            console.log(`Batch ${batchIndex + 1} processed successfully: ${batchResults.length} lines`)
            
          } catch (batchError) {
            console.error(`Batch ${batchIndex + 1} failed:`, batchError)
            console.log(`Falling back to line-by-line processing for batch ${batchIndex + 1}`)
            
            // Fallback: process lines in this batch one by one
            for (let i = 0; i < batch.length; i++) {
              const line = batch[i]
              const lineNumber = batchStartLine + i
              
              try {
                const response = await fetch('/api/process-lyrics', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ text: line.original }),
                })
                
                const responseText = await response.text()
                const data = JSON.parse(responseText)
                
                if (data.error || !data.simplified) {
                  throw new Error(data.error || 'No processed data')
                }
                
                processed.push({
                  ...line,
                  type: 'lyric',
                  simplified: data.simplified || line.original,
                  pinyin: data.pinyin || '',
                })
                
                console.log(`Line ${lineNumber} processed (fallback)`)
              } catch (lineError) {
                console.error(`Line ${lineNumber} failed in fallback:`, lineError)
                processed.push({
                  ...line,
                  type: 'lyric',
                  simplified: line.original,
                  pinyin: '',
                })
              }
              
              // Update progress for fallback processing
              const linesProcessed = processed.length
              const currentProgress = Math.round((linesProcessed / totalLines) * 100)
              setProgress(currentProgress)
            }
          }
          
          // Update progress after batch
          const linesProcessed = processed.length
          const currentProgress = Math.round((linesProcessed / totalLines) * 100)
          setProgress(currentProgress)
        }
      
      console.log(`Processing complete. Processed ${processed.length} lines out of ${totalLines} total`)
      
      // Verify we processed all lines
      if (processed.length !== totalLines) {
        console.error(`MISMATCH: Expected ${totalLines} processed lines, got ${processed.length}`)
        // Fill in any missing lines
        while (processed.length < totalLines) {
          const missingIndex = processed.length
          if (missingIndex < lyricLines.length) {
            processed.push({
              ...lyricLines[missingIndex],
              type: 'lyric',
              simplified: lyricLines[missingIndex].original,
              pinyin: '',
            })
            console.log(`Added missing line at index ${missingIndex}`)
          } else {
            break
          }
        }
      }

      // Combine sections and processed lyrics (but don't include section markers in preview)
      const finalPreview = []
      let processedIndex = 0
      let currentSectionForDisplay = ''
      
      console.log(`Building preview: ${parsed.length} parsed items, ${processed.length} processed lines`)
      
      for (const item of parsed) {
        if (item.type === 'section') {
          // Store section for next lyrics, but don't add to preview
          currentSectionForDisplay = item.section
          console.log(`Skipping section marker: ${item.section}`)
          // Skip adding section markers to preview - DO NOT CONTINUE TO PROCESS
          continue
        } else if (item.type === 'lyric') {
          // Add processed lyric with current section
          const processedLine = processed[processedIndex]
          if (processedLine && processedLine.type === 'lyric') {
            const previewItem = {
              ...processedLine,
              type: 'lyric', // Ensure type is set
              section: currentSectionForDisplay
            }
            finalPreview.push(previewItem)
            console.log(`Added to preview: line ${processedIndex + 1} (section: ${currentSectionForDisplay})`)
          } else {
            console.warn(`No valid processed line found for index ${processedIndex}:`, processedLine)
            // Still increment to maintain alignment
          }
          processedIndex++
        } else {
          console.warn(`Unknown item type in parsed array: ${item.type}`, item)
          // Don't add unknown types to preview
        }
      }

      // Double-check: filter out any section markers that might have slipped through
      const filteredPreview = finalPreview.filter(item => {
        const isLyric = item.type === 'lyric'
        if (!isLyric) {
          console.warn(`Filtering out non-lyric item:`, item)
        }
        return isLyric
      })
      
      console.log(`Final preview: ${filteredPreview.length} items (filtered from ${finalPreview.length})`)
      setPreview(filteredPreview)
      setStatus({ type: 'success', message: '处理完成 Processing complete!' })
    } catch (error) {
      console.error('Error processing lyrics:', error)
      setStatus({ type: 'error', message: '处理失败 Processing failed: ' + error.message })
    } finally {
      setIsProcessing(false)
      setProgress(100)
    }
  }

  const handleGeneratePPTX = async () => {
    if (preview.length === 0) {
      setStatus({ type: 'error', message: '请先处理歌词 Please process lyrics first' })
      return
    }

    if (!uploadedFile || !templateBase64) {
      setStatus({ type: 'error', message: '请先上传模板文件 Please upload a template file first' })
      return
    }

    setIsGenerating(true)
    setStatus({ type: 'info', message: '生成中 Generating PPTX...' })

    try {
      console.log('Using stored template base64, length:', templateBase64.length)

      const requestBody = { preview, metadata, templateBase64: templateBase64 }
      console.log('Request body keys:', Object.keys(requestBody), 'templateBase64 exists:', !!requestBody.templateBase64, 'length:', requestBody.templateBase64?.length)

      const response = await fetch('/api/generate-pptx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate PPTX')
      }

      // Get slide count from response header
      const slideCount = response.headers.get('X-Slide-Count') || '0'
      const lyricLines = preview.filter(item => item.type === 'lyric')
      const lyricPairs = Math.ceil(lyricLines.length / 2)
      const hasTitle = metadata && (metadata.title || metadata.credits)
      const expectedSlides = (hasTitle ? 1 : 0) + lyricPairs

      // Show success message with slide count before download
      setStatus({ 
        type: 'success', 
        message: `✅ 已生成 ${slideCount} 张幻灯片 (${hasTitle ? '1 标题 + ' : ''}${lyricPairs} 歌词) | Generated ${slideCount} slides (${hasTitle ? '1 title + ' : ''}${lyricPairs} lyrics). 正在下载 Downloading...` 
      })

      // Small delay to show the message
      await new Promise(resolve => setTimeout(resolve, 500))

      // Download the file
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'lyrics-slides.pptx'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Error generating PPTX:', error)
      setStatus({ type: 'error', message: '生成失败 Generation failed: ' + error.message })
    } finally {
      setIsGenerating(false)
    }
  }

  const handleFileSelect = async (file) => {
    if (!file) return

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.pptx')) {
      setStatus({ type: 'error', message: '请上传 .pptx 文件 Please upload a .pptx file' })
      return
    }

    setUploadedFile(file)
    
    // Convert to base64 immediately and store it
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          try {
            const result = reader.result
            if (!result || typeof result !== 'string') {
              reject(new Error('FileReader returned invalid result'))
              return
            }
            const base64String = result.split(',')[1]
            if (!base64String || base64String.length === 0) {
              reject(new Error('Failed to extract base64 from file'))
            } else {
              resolve(base64String)
            }
          } catch (err) {
            reject(err)
          }
        }
        reader.onerror = (error) => {
          reject(new Error('Failed to read template file: ' + error))
        }
        reader.readAsDataURL(file)
      })
      
      setTemplateBase64(base64)
      setStatus({ type: 'success', message: `✅ 已上传模板: ${file.name} Template uploaded: ${file.name}` })
    } catch (error) {
      console.error('Error converting template to base64:', error)
      setStatus({ type: 'error', message: '模板文件转换失败 Template file conversion failed' })
      setUploadedFile(null)
    }
  }

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0]
    handleFileSelect(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    handleFileSelect(file)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="min-h-screen liquid-bg py-12 px-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-400/20 rounded-full blur-3xl floating" style={{ animationDelay: '0s' }}></div>
        <div className="absolute top-40 right-20 w-96 h-96 bg-purple-400/20 rounded-full blur-3xl floating" style={{ animationDelay: '2s' }}></div>
        <div className="absolute bottom-20 left-1/3 w-80 h-80 bg-pink-400/20 rounded-full blur-3xl floating" style={{ animationDelay: '4s' }}></div>
        <div className="absolute bottom-40 right-1/4 w-64 h-64 bg-cyan-400/20 rounded-full blur-3xl floating" style={{ animationDelay: '1s' }}></div>
      </div>
      
      <div className="max-w-6xl mx-auto relative z-10">
        {/* Header */}
        <div className="mb-12 text-center">
          <h1 className="text-6xl font-serif font-bold text-gradient mb-4 tracking-tight floating">
            Song to Slides
          </h1>
          <p className="text-lg font-serif-body text-white/90 max-w-2xl mx-auto drop-shadow-lg">
            Generate Chinese worship lyrics slides with Pinyin
          </p>
        </div>

        {/* Status Message */}
        {status.type && (
          <div className={`mb-6 p-4 rounded-xl glass-card ${
            status.type === 'success' 
              ? 'border-green-400/50' 
              : status.type === 'error'
              ? 'border-red-400/50'
              : 'border-blue-400/50'
          }`}>
            <div className="flex items-center gap-2 font-serif-body">
              {status.type === 'success' && <CheckCircle className="w-5 h-5 text-green-300 drop-shadow-lg" />}
              {status.type === 'error' && <AlertCircle className="w-5 h-5 text-red-300 drop-shadow-lg" />}
              {status.type === 'info' && <Loader2 className="w-5 h-5 text-blue-300 animate-spin drop-shadow-lg" />}
              <p className={status.type === 'success' ? 'text-green-100' : status.type === 'error' ? 'text-red-100' : 'text-blue-100'}>
                {status.message}
              </p>
            </div>
          </div>
        )}

        {/* Progress Bar (Top) */}
        {isProcessing && (
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-white/90 drop-shadow-lg">处理中 Processing...</span>
              <span className="text-sm font-medium text-white/90 drop-shadow-lg">{progress}%</span>
            </div>
            <div className="w-full h-3 glass-card rounded-full overflow-hidden">
              <div 
                className="h-full glass-button transition-all duration-300 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Template Upload */}
          <div className="glass-card glass-card-hover rounded-2xl p-6">
            <h2 className="text-xl font-serif font-bold mb-2 text-white drop-shadow-lg">
              上传模板 | Upload Template
            </h2>
            <p className="text-sm text-white/80 mb-4 font-serif-body">
              模板 Template
            </p>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileInputChange}
              accept=".pptx"
              className="hidden"
            />
            <div
              onClick={handleUploadClick}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer glass-card ${
                isDragging
                  ? 'border-blue-400/60 bg-blue-500/20 scale-105'
                  : uploadedFile
                  ? 'border-green-400/60 bg-green-500/20'
                  : 'border-white/30 hover:border-white/50 hover:bg-white/5'
              }`}
            >
              {uploadedFile ? (
                <>
                  <File className="w-12 h-12 mx-auto text-green-300 mb-4 drop-shadow-lg" />
                  <p className="text-sm font-serif font-medium text-green-100 mb-2 drop-shadow-lg">
                    {uploadedFile.name}
                  </p>
                  <p className="text-xs text-green-200/80 font-serif-body">
                    点击重新上传 | Click to upload different file
                  </p>
                </>
              ) : (
                <>
                  <Upload className="w-12 h-12 mx-auto text-white/60 mb-4 drop-shadow-lg" />
                  <p className="text-sm text-white/90 mb-2 font-serif-body drop-shadow-lg">
                    拖放 .pptx 文件或点击上传
                  </p>
                  <p className="text-xs text-white/70 font-serif-body">
                    Drag & drop .pptx file or click to upload
                  </p>
                </>
              )}
              <p className="text-xs text-white/80 mt-4 font-serif-body">
                <a 
                  href="https://docs.google.com/presentation/d/1QZNR-MGA6bstis0KJiGB3xNHdF-CG9gOJSPgqAHCPKo/edit?usp=sharing" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="underline hover:text-white font-semibold transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  查看示例模板 | View Sample Template
                </a>
              </p>
            </div>
            <p className="text-xs text-white/80 mt-4 font-serif-body">
              <strong className="text-white">模板占位符 | Template Placeholders:</strong><br />
              {'{pinyin1}'}, {'{chinese1}'}, {'{pinyin2}'}, {'{chinese2}'}, {'{section}'}<br />
              {'{title}'}, {'{credits}'} (for title slide)
            </p>
            <p className="text-xs text-green-300 mt-2 font-serif-body font-medium drop-shadow-lg">
              ✓ 模板支持已启用 | Template support is active
            </p>
          </div>

          {/* Lyrics Input */}
          <div className="glass-card glass-card-hover rounded-2xl p-6">
            <h2 className="text-xl font-serif font-bold mb-2 text-white drop-shadow-lg">
              输入歌词 | Enter Lyrics
            </h2>
            <p className="text-sm text-white/80 mb-4 font-serif-body">
              粘贴歌词文本 | Paste lyrics text
            </p>
            <textarea
              value={lyricsText}
              onChange={(e) => setLyricsText(e.target.value)}
              placeholder={`Title: 何等恩典
Credits: 词曲：XXX
[Verse]
何等恩典
祢竟然爱我
[Chorus]
我要赞美祢
永远荣耀祢`}
              className="w-full h-64 p-4 glass-input rounded-xl resize-none text-sm font-serif-body text-white placeholder:text-white/50"
              disabled={isProcessing}
            />
            <button
              onClick={handleProcess}
              disabled={isProcessing || !lyricsText.trim()}
              className="mt-4 w-full glass-button text-white font-serif font-semibold py-3 px-6 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>处理歌词 Processing Lyrics...</span>
                </>
              ) : (
                <span>处理歌词 Process Lyrics</span>
              )}
            </button>

            {/* Progress Bar (Below Button) */}
            {isProcessing && (
              <div className="mt-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-white/90 drop-shadow-lg">处理中 Processing...</span>
                  <span className="text-sm font-medium text-white/90 drop-shadow-lg">{progress}%</span>
                </div>
                <div className="w-full h-3 glass-card rounded-full overflow-hidden">
                  <div 
                    className="h-full glass-button transition-all duration-300 rounded-full"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Metadata Display */}
        {(metadata.title || metadata.credits) && (
          <div className="mb-6 glass-card glass-card-hover rounded-2xl p-5">
            <h3 className="text-lg font-serif font-bold mb-3 text-white drop-shadow-lg">元数据 | Metadata</h3>
            {metadata.title && (
              <p className="text-white/90 mb-2 font-serif-body">
                <span className="font-semibold text-white">标题 | Title:</span> {metadata.title}
              </p>
            )}
            {metadata.credits && (
              <p className="text-white/90 font-serif-body">
                <span className="font-semibold text-white">制作人 | Credits:</span> {metadata.credits}
              </p>
            )}
          </div>
        )}

        {/* Preview Table */}
        {preview.length > 0 && (
          <div className="glass-card glass-card-hover rounded-2xl p-6 mb-6">
            <h2 className="text-xl font-serif font-bold mb-4 text-white drop-shadow-lg">
              预览 | Preview
            </h2>
            <div className="overflow-x-auto rounded-xl">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="glass-button">
                    <th className="border border-white/20 px-4 py-3 text-left font-serif font-semibold text-white">Section</th>
                    <th className="border border-white/20 px-4 py-3 text-left font-serif font-semibold text-white">Original</th>
                    <th className="border border-white/20 px-4 py-3 text-left font-serif font-semibold text-white">Simplified</th>
                    <th className="border border-white/20 px-4 py-3 text-left font-serif font-semibold text-white">Pinyin</th>
                  </tr>
                </thead>
                <tbody>
                  {preview
                    .filter(item => item.type === 'lyric') // Only show lyric lines, not section markers
                    .map((item, index) => {
                      const isUnprocessed = !item.pinyin && item.simplified === item.original
                      return (
                        <tr
                          key={index}
                          className={`hover:bg-white/10 transition-colors font-serif-body ${
                            isUnprocessed ? 'bg-yellow-500/20' : ''
                          }`}
                        >
                          <td className="border border-white/10 px-4 py-3 text-white/90">
                            {item.section || '-'}
                          </td>
                          <td className="border border-white/10 px-4 py-3 text-white">
                            {item.original}
                          </td>
                          <td className={`border border-white/10 px-4 py-3 ${isUnprocessed ? 'text-yellow-200' : 'text-white/90'}`}>
                            {item.simplified || '-'}
                            {isUnprocessed && item.simplified === item.original && (
                              <span className="text-xs text-yellow-300 ml-2">(未处理)</span>
                            )}
                          </td>
                          <td className={`border border-white/10 px-4 py-3 ${isUnprocessed ? 'text-yellow-200' : 'text-white/90'}`}>
                            {item.pinyin || (isUnprocessed ? <span className="text-xs text-yellow-300">(未处理)</span> : '-')}
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>

            {/* Generate PPTX Button */}
            <button
              onClick={handleGeneratePPTX}
              disabled={isGenerating || preview.length === 0 || !uploadedFile || !templateBase64}
              className="mt-6 w-full glass-button text-white font-serif font-semibold py-3 px-6 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>生成中 Generating...</span>
                </>
              ) : (
                <span>生成 PPTX Generate PPTX</span>
              )}
            </button>
          </div>
        )}

        {/* Instructions */}
        <div className="glass-card glass-card-hover rounded-2xl p-8">
          <h2 className="text-2xl font-serif font-bold mb-6 text-white drop-shadow-lg">使用说明 | Instructions</h2>
          <ol className="space-y-4 text-sm text-white/90 font-serif-body">
            <li className="flex gap-4">
              <span className="flex-shrink-0 w-8 h-8 rounded-full glass-button text-white flex items-center justify-center font-serif font-bold text-sm">1</span>
              <div>
                <p className="font-semibold text-white mb-1 drop-shadow-lg">下载示例模板 | Download Sample Template</p>
                <p className="text-white/80">点击上方"查看示例模板"链接下载模板文件 | Click "View Sample Template" above to download the template file</p>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="flex-shrink-0 w-8 h-8 rounded-full glass-button text-white flex items-center justify-center font-serif font-bold text-sm">2</span>
              <div>
                <p className="font-semibold text-white mb-1 drop-shadow-lg">替换背景并确保对比度 | Replace Background & Ensure Contrast</p>
                <p className="text-white/80">在 PowerPoint 中打开模板，替换背景图片/颜色，确保文字清晰可读 | Open template in PowerPoint, replace background, ensure text is readable</p>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="flex-shrink-0 w-8 h-8 rounded-full glass-button text-white flex items-center justify-center font-serif font-bold text-sm">3</span>
              <div>
                <p className="font-semibold text-white mb-1 drop-shadow-lg">准备歌词并格式化 | Prepare & Format Lyrics</p>
                <p className="text-white/80">按照占位符格式准备歌词：使用 "Title:" 和 "Credits:" 添加元数据，使用 [Verse], [Chorus] 等标记段落 | Format lyrics with "Title:" and "Credits:" for metadata, use [Verse], [Chorus] for sections</p>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="flex-shrink-0 w-8 h-8 rounded-full glass-button text-white flex items-center justify-center font-serif font-bold text-sm">4</span>
              <div>
                <p className="font-semibold text-white mb-1 drop-shadow-lg">上传模板并粘贴歌词 | Upload Template & Paste Lyrics</p>
                <p className="text-white/80">上传您修改后的模板文件，然后在右侧文本框中粘贴格式化后的歌词 | Upload your modified template file, then paste formatted lyrics in the text area</p>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="flex-shrink-0 w-8 h-8 rounded-full glass-button text-white flex items-center justify-center font-serif font-bold text-sm">5</span>
              <div>
                <p className="font-semibold text-white mb-1 drop-shadow-lg">点击处理歌词 | Click Process Lyrics</p>
                <p className="text-white/80">点击"处理歌词"按钮，等待处理完成后预览结果，然后点击"生成 PPTX"下载幻灯片 | Click "Process Lyrics", review preview, then click "Generate PPTX" to download</p>
              </div>
            </li>
          </ol>
          <div className="mt-6 pt-6 border-t border-white/20">
            <p className="text-xs text-white/80 font-serif-body">
              <strong className="text-white">提示 Tips:</strong> AI 生成拼音遵循 "祢 → Nǐ" 规则，其他拼音均为小写带声调 (wǒ lái dào)。每张幻灯片显示 2 行，自动处理奇数行数。 | AI follows "祢 → Nǐ" rule, all other Pinyin lowercase with tone marks. 2 lines per slide, handles odd counts.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

