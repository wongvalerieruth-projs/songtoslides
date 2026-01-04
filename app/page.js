'use client'

import { useState } from 'react'
import { CheckCircle, AlertCircle, Upload, Loader2 } from 'lucide-react'

export default function Home() {
  const [lyricsText, setLyricsText] = useState('')
  const [preview, setPreview] = useState([])
  const [metadata, setMetadata] = useState({ title: '', credits: '' })
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState({ type: null, message: '' })
  const [isGenerating, setIsGenerating] = useState(false)

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

      // Check for section markers
      if (line.match(/^\[(.+)\]/)) {
        const match = line.match(/^\[(.+)\]/)
        currentSection = `[${match[1]}]`
        parsed.push({
          type: 'section',
          section: currentSection,
          original: line,
        })
        continue
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
    setStatus({ type: 'info', message: '处理中 Processing...' })

    try {
      const { parsed, metadata: extractedMetadata } = parseLyrics(lyricsText)
      setMetadata(extractedMetadata)

      // Filter only lyric lines for processing
      const lyricLines = parsed.filter(item => item.type === 'lyric')
      const totalLines = lyricLines.length

      if (totalLines === 0) {
        setStatus({ type: 'error', message: '未找到歌词行 No lyric lines found' })
        setIsProcessing(false)
        return
      }

      // Process each line
      const processed = []
      for (let i = 0; i < lyricLines.length; i++) {
        const line = lyricLines[i]
        
        try {
          const response = await fetch('/api/process-lyrics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: line.original }),
          })

          if (!response.ok) {
            throw new Error('Failed to process line')
          }

          const data = await response.json()
          processed.push({
            ...line,
            simplified: data.simplified || line.original,
            pinyin: data.pinyin || '',
          })

          // Update progress
          const currentProgress = Math.round(((i + 1) / totalLines) * 100)
          setProgress(currentProgress)
        } catch (error) {
          console.error(`Error processing line ${i + 1}:`, error)
          processed.push({
            ...line,
            simplified: line.original,
            pinyin: '',
          })
        }
      }

      // Combine sections and processed lyrics
      const finalPreview = []
      let processedIndex = 0
      for (const item of parsed) {
        if (item.type === 'section') {
          finalPreview.push(item)
        } else {
          finalPreview.push(processed[processedIndex])
          processedIndex++
        }
      }

      setPreview(finalPreview)
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

    setIsGenerating(true)
    setStatus({ type: 'info', message: '生成中 Generating PPTX...' })

    try {
      const response = await fetch('/api/generate-pptx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preview, metadata }),
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
            歌词幻灯片生成器
          </h1>
          <p className="text-xl text-gray-600">Lyrics Slide Generator</p>
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
            <div className="border-2 border-dashed border-purple-200 rounded-lg p-8 text-center hover:border-purple-300 transition-colors">
              <Upload className="w-12 h-12 mx-auto text-purple-400 mb-4" />
              <p className="text-sm text-gray-500 mb-2">
                拖放 .pptx 文件或点击上传
              </p>
              <p className="text-xs text-gray-400">
                Drag & drop .pptx file or click to upload
              </p>
              <p className="text-xs text-purple-500 mt-4">
                <a 
                  href="https://docs.google.com/presentation/d/1QZNR-MGA6bstis0KJiGB3xNHdF-CG9gOJSPgqAHCPKo/edit?usp=sharing" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="underline hover:text-purple-600"
                >
                  查看示例模板 View Sample Template
                </a>
              </p>
            </div>
            <p className="text-xs text-gray-400 mt-4 italic">
              Note: Currently generates slides from scratch, template support is placeholder
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
                  {preview.map((item, index) => (
                    <tr
                      key={index}
                      className={`hover:bg-purple-50/50 transition-colors ${
                        item.type === 'section' ? 'bg-gray-100/50 font-semibold' : ''
                      }`}
                    >
                      <td className="border border-gray-200 px-4 py-3">
                        {item.section || '-'}
                      </td>
                      <td className="border border-gray-200 px-4 py-3">
                        {item.original}
                      </td>
                      <td className="border border-gray-200 px-4 py-3">
                        {item.simplified || '-'}
                      </td>
                      <td className="border border-gray-200 px-4 py-3">
                        {item.pinyin || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Generate PPTX Button */}
            <button
              onClick={handleGeneratePPTX}
              disabled={isGenerating || preview.length === 0}
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

