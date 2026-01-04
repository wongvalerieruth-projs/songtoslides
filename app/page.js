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
      message: `处理中 Processing... (速率限制: 10请求/分钟 Rate limit: 10 requests/minute - 每行约7秒 ~7s per line)` 
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

      // Client-side rate limiter: Track requests in a sliding window (10 requests per 60 seconds)
      const processed = []
      const MAX_REQUESTS_PER_MINUTE = 10
      const WINDOW_MS = 60000 // 60 seconds
      const requestTimestamps = [] // Track when requests were made
      
      console.log(`Starting to process ${totalLines} lines with rate limiting (max ${MAX_REQUESTS_PER_MINUTE} requests/minute)`)
      
      // Helper function to wait until we can make a request
      const waitForRateLimit = async (lineNumber) => {
        const now = Date.now()
        
        // Remove timestamps older than 1 minute
        const recentRequests = requestTimestamps.filter(timestamp => now - timestamp < WINDOW_MS)
        
        console.log(`Line ${lineNumber}: Recent requests in last minute: ${recentRequests.length}/${MAX_REQUESTS_PER_MINUTE}`)
        
        // If we've made 10 requests in the last minute, wait
        if (recentRequests.length >= MAX_REQUESTS_PER_MINUTE) {
          const oldestRequest = Math.min(...recentRequests)
          const waitTime = WINDOW_MS - (now - oldestRequest) + 1000 // Add 1s buffer
          
          if (waitTime > 0) {
            const waitSeconds = Math.ceil(waitTime / 1000)
            console.log(`Line ${lineNumber}: Rate limit reached, waiting ${waitSeconds} seconds...`)
            setStatus({ 
              type: 'info', 
              message: `等待速率限制 Waiting for rate limit... (${waitSeconds}秒 seconds)` 
            })
            await new Promise(resolve => setTimeout(resolve, waitTime))
          }
        }
      }
      
      // Ensure we process ALL lines, even if some fail
      for (let i = 0; i < lyricLines.length; i++) {
        const line = lyricLines[i]
        
        // Double-check this is actually a lyric line (not a section marker)
        if (line.type !== 'lyric') {
          console.warn(`Skipping non-lyric line at index ${i}:`, line)
          // Still add it to processed array to maintain index alignment
          processed.push({
            ...line,
            type: 'lyric',
            simplified: line.original,
            pinyin: '',
          })
          continue
        }
        
        // Wait for rate limit before making request
        await waitForRateLimit(i + 1)
        
        // Update status for current line being processed
        const remainingLines = totalLines - i
        const estimatedSeconds = Math.ceil((remainingLines * 6000) / 1000) // Rough estimate: 6s per line
        setStatus({ 
          type: 'info', 
          message: `处理中 Processing line ${i + 1} of ${totalLines}... (~${Math.ceil(estimatedSeconds / 60)}分钟剩余 ~${Math.ceil(estimatedSeconds / 60)}min remaining)` 
        })
        
        const requestStartTime = Date.now()
        console.log(`Line ${i + 1}: Making API request for: "${line.original.substring(0, 50)}..."`)
        
        let requestCompleted = false
        try {
          const response = await fetch('/api/process-lyrics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: line.original }),
          })
          
          // Record request timestamp AFTER the request completes
          requestTimestamps.push(Date.now())
          const requestDuration = Date.now() - requestStartTime
          console.log(`Line ${i + 1}: API response received (${response.status}) in ${requestDuration}ms`)
          requestCompleted = true

          let data
          try {
            const responseText = await response.text()
            console.log(`Line ${i + 1}: Response body:`, responseText.substring(0, 200))
            data = JSON.parse(responseText)
            console.log(`Line ${i + 1}: Parsed data:`, { 
              hasSimplified: !!data.simplified, 
              hasPinyin: !!data.pinyin,
              simplified: data.simplified?.substring(0, 50),
              pinyin: data.pinyin?.substring(0, 50),
              error: data.error
            })
          } catch (jsonError) {
            console.error(`Line ${i + 1}: Failed to parse JSON response:`, jsonError)
            // If we can't parse JSON, use original text
            processed.push({
              ...line,
              type: 'lyric',
              simplified: line.original,
              pinyin: '',
            })
            const currentProgress = Math.round(((i + 1) / totalLines) * 100)
            setProgress(currentProgress)
            // Don't continue - let it fall through to finally block
          }

          // Handle both success and error responses
          if (!response.ok) {
            // API returned error status (including 500), but might have fallback data
            console.warn(`API error for line ${i + 1} (status ${response.status}):`, data?.error || 'Unknown error')
            
            // Even on 500 errors, try to use any data that was returned
            if (data && data.simplified && data.simplified !== line.original) {
              // Use the fallback data if it's different from original
              processed.push({
                ...line,
                type: 'lyric',
                simplified: data.simplified,
                pinyin: data.pinyin || '',
              })
            } else if (data && data.simplified) {
              // API returned original text as simplified (no processing happened)
              processed.push({
                ...line,
                type: 'lyric',
                simplified: line.original,
                pinyin: data.pinyin || '',
              })
            } else {
              // No usable data (500 error with no response body), use original
              console.warn(`Line ${i + 1} failed with status ${response.status}, using original text`)
              processed.push({
                ...line,
                type: 'lyric',
                simplified: line.original,
                pinyin: '',
              })
            }
            
            const currentProgress = Math.round(((i + 1) / totalLines) * 100)
            setProgress(currentProgress)
            // Data is already pushed, continue to next iteration
            continue
          }
          
          // Response is OK (200), validate that we got actual processed data
          if (data.error) {
            console.warn(`API returned error for line ${i + 1}:`, data.error)
            // If API returns error but has fallback data, use it
            if (data.simplified && data.simplified !== line.original) {
              processed.push({
                ...line,
                type: 'lyric',
                simplified: data.simplified,
                pinyin: data.pinyin || '',
              })
            } else {
              // No valid data, mark as failed
              throw new Error(data.error || 'No processed data returned')
            }
          } else {
            // Check if we got meaningful results
            const hasSimplified = data.simplified && data.simplified.trim() && data.simplified !== line.original
            const hasPinyin = data.pinyin && data.pinyin.trim()
            
            if (!hasSimplified && !hasPinyin) {
              console.warn(`Line ${i + 1} returned empty results, using original text`)
              processed.push({
                ...line,
                type: 'lyric',
                simplified: line.original,
                pinyin: '',
              })
            } else {
              processed.push({
                ...line,
                type: 'lyric',
                simplified: data.simplified || line.original,
                pinyin: data.pinyin || '',
              })
              console.log(`Line ${i + 1}: Successfully processed`)
            }
          }

          // Update progress
          const currentProgress = Math.round(((i + 1) / totalLines) * 100)
          setProgress(currentProgress)
        } catch (error) {
          console.error(`Line ${i + 1}: Error processing (${line.original}):`, error)
          // On error, keep original text but mark pinyin as empty
          // Always add to processed array to ensure we don't skip lines
          processed.push({
            ...line,
            type: 'lyric',
            simplified: line.original,
            pinyin: '',
          })
          // Update progress even on error
          const currentProgress = Math.round(((i + 1) / totalLines) * 100)
          setProgress(currentProgress)
        } finally {
          // Ensure request timestamp is recorded even if there was an error
          if (!requestCompleted) {
            requestTimestamps.push(Date.now())
            console.log(`Line ${i + 1}: Request timestamp recorded after error`)
          }
        }
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

      setStatus({ type: 'success', message: '✅ PPTX 文件已生成并下载 PPTX file generated and downloaded!' })
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-block p-6 rounded-2xl bg-white/90 backdrop-blur-md shadow-xl border-2 border-purple-200/50 mb-4">
            <h1 className="text-5xl font-extrabold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-3 tracking-tight">
              歌词幻灯片生成器
            </h1>
            <p className="text-2xl font-semibold text-gray-700 bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
              Lyrics Slide Generator
            </p>
          </div>
        </div>

        {/* Status Message */}
        {status.type && (
          <div className={`mb-6 p-4 rounded-lg backdrop-blur-sm ${
            status.type === 'success' 
              ? 'bg-green-100/80 border border-green-200' 
              : status.type === 'error'
              ? 'bg-red-100/80 border border-red-200'
              : 'bg-blue-100/80 border border-blue-200'
          }`}>
            <div className="flex items-center gap-2">
              {status.type === 'success' && <CheckCircle className="w-5 h-5 text-green-600" />}
              {status.type === 'error' && <AlertCircle className="w-5 h-5 text-red-600" />}
              {status.type === 'info' && <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />}
              <p className={status.type === 'success' ? 'text-green-800' : status.type === 'error' ? 'text-red-800' : 'text-blue-800'}>
                {status.message}
              </p>
            </div>
          </div>
        )}

        {/* Progress Bar (Top) */}
        {isProcessing && (
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700">处理中 Processing...</span>
              <span className="text-sm font-medium text-gray-700">{progress}%</span>
            </div>
            <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Template Upload */}
          <div className="bg-white/80 backdrop-blur-sm rounded-lg shadow-md border border-purple-100 p-6">
            <h2 className="text-xl font-semibold mb-2 text-gray-800">
              上传模板 Upload Template
            </h2>
            <p className="text-sm text-gray-600 mb-4">
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
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                isDragging
                  ? 'border-purple-500 bg-purple-50/50'
                  : uploadedFile
                  ? 'border-green-300 bg-green-50/30'
                  : 'border-purple-200 hover:border-purple-300'
              }`}
            >
              {uploadedFile ? (
                <>
                  <File className="w-12 h-12 mx-auto text-green-500 mb-4" />
                  <p className="text-sm font-medium text-green-700 mb-2">
                    {uploadedFile.name}
                  </p>
                  <p className="text-xs text-green-600">
                    点击重新上传 Click to upload different file
                  </p>
                </>
              ) : (
                <>
                  <Upload className="w-12 h-12 mx-auto text-purple-400 mb-4" />
                  <p className="text-sm text-gray-500 mb-2">
                    拖放 .pptx 文件或点击上传
                  </p>
                  <p className="text-xs text-gray-400">
                    Drag & drop .pptx file or click to upload
                  </p>
                </>
              )}
              <p className="text-xs text-purple-500 mt-4">
                <a 
                  href="https://docs.google.com/presentation/d/1QZNR-MGA6bstis0KJiGB3xNHdF-CG9gOJSPgqAHCPKo/edit?usp=sharing" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="underline hover:text-purple-600"
                  onClick={(e) => e.stopPropagation()}
                >
                  查看示例模板 View Sample Template
                </a>
              </p>
            </div>
            <p className="text-xs text-gray-500 mt-4">
              <strong>模板占位符 Template Placeholders:</strong><br />
              {'{pinyin1}'}, {'{chinese1}'}, {'{pinyin2}'}, {'{chinese2}'}, {'{section}'}<br />
              {'{title}'}, {'{credits}'} (for title slide)
            </p>
            <p className="text-xs text-green-600 mt-2 font-medium">
              ✓ 模板支持已启用 Template support is active
            </p>
          </div>

          {/* Lyrics Input */}
          <div className="bg-white/80 backdrop-blur-sm rounded-lg shadow-md border border-blue-100 p-6">
            <h2 className="text-xl font-semibold mb-2 text-gray-800">
              输入歌词 Enter Lyrics
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              粘贴歌词文本 Paste lyrics text
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
              className="w-full h-64 p-4 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm"
              disabled={isProcessing}
            />
            <button
              onClick={handleProcess}
              disabled={isProcessing || !lyricsText.trim()}
              className="mt-4 w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold py-3 px-6 rounded-lg shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                  <span className="text-sm font-medium text-gray-700">处理中 Processing...</span>
                  <span className="text-sm font-medium text-gray-700">{progress}%</span>
                </div>
                <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Metadata Display */}
        {(metadata.title || metadata.credits) && (
          <div className="mb-6 bg-gradient-to-r from-purple-100/80 to-pink-100/80 backdrop-blur-sm rounded-lg shadow-md border border-purple-200 p-4">
            <h3 className="text-lg font-semibold mb-2 text-gray-800">元数据 Metadata</h3>
            {metadata.title && (
              <p className="text-gray-700 mb-1">
                <span className="font-semibold">标题 Title:</span> {metadata.title}
              </p>
            )}
            {metadata.credits && (
              <p className="text-gray-700">
                <span className="font-semibold">制作人 Credits:</span> {metadata.credits}
              </p>
            )}
          </div>
        )}

        {/* Preview Table */}
        {preview.length > 0 && (
          <div className="bg-white/80 backdrop-blur-sm rounded-lg shadow-lg border border-pink-100 p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">
              预览 Preview
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gradient-to-r from-blue-500 to-purple-500 text-white">
                    <th className="border border-gray-300 px-4 py-3 text-left">Section</th>
                    <th className="border border-gray-300 px-4 py-3 text-left">Original</th>
                    <th className="border border-gray-300 px-4 py-3 text-left">Simplified</th>
                    <th className="border border-gray-300 px-4 py-3 text-left">Pinyin</th>
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
                          className={`hover:bg-purple-50/50 transition-colors ${
                            isUnprocessed ? 'bg-yellow-50/50' : ''
                          }`}
                        >
                          <td className="border border-gray-200 px-4 py-3">
                            {item.section || '-'}
                          </td>
                          <td className="border border-gray-200 px-4 py-3">
                            {item.original}
                          </td>
                          <td className={`border border-gray-200 px-4 py-3 ${isUnprocessed ? 'text-yellow-700' : ''}`}>
                            {item.simplified || '-'}
                            {isUnprocessed && item.simplified === item.original && (
                              <span className="text-xs text-yellow-600 ml-2">(未处理)</span>
                            )}
                          </td>
                          <td className={`border border-gray-200 px-4 py-3 ${isUnprocessed ? 'text-yellow-700' : ''}`}>
                            {item.pinyin || (isUnprocessed ? <span className="text-xs text-yellow-600">(未处理)</span> : '-')}
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
              className="mt-6 w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-3 px-6 rounded-lg shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
        <div className="bg-white/80 backdrop-blur-sm rounded-lg shadow-md border border-blue-100 p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">使用说明 Instructions</h2>
          <ul className="space-y-2 text-sm text-gray-700">
            <li>• 可选：添加标题和制作人信息，使用 "Title:" 和 "Credits:" Optional: Add title/credits with "Title:" and "Credits:"</li>
            <li>• 使用段落标记： [Verse], [Chorus], [Bridge] Use section markers: [Verse], [Chorus], [Bridge]</li>
            <li>• 段落按输入顺序显示 Sections display in order as entered</li>
            <li>• AI 生成拼音遵循 "祢 → Nǐ" 规则 AI generates Pinyin following "祢 → Nǐ" rule</li>
            <li>• 其他所有拼音均为小写带声调 (wǒ lái dào) All other Pinyin lowercase with tone marks (wǒ lái dào)</li>
            <li>• 每张幻灯片显示 2 行，自动处理奇数行数 2 lines per slide, handles odd counts gracefully</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

