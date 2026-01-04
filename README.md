# 歌词幻灯片生成器 | Lyrics Slide Generator

A Next.js application for generating Chinese worship lyrics slides with Pinyin using AI-powered text processing.

## Features

- **Lyrics Processing**: Convert Traditional Chinese to Simplified Chinese and generate Hanyu Pinyin
- **AI-Powered**: Uses Google Gemini API for text processing
- **PPTX Generation**: Creates PowerPoint slides with formatted lyrics
- **Metadata Extraction**: Automatically extracts song title and credits
- **Section Support**: Handles section markers like [Verse], [Chorus], [Bridge]

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env.local` file in the root directory:
```env
GEMINI_API_KEY=your_gemini_api_key_here
```

Get your Gemini API key from: https://makersuite.google.com/app/apikey

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. Paste your Chinese lyrics in the input area
2. Optionally add metadata:
   - `Title: Song Title`
   - `Credits: Composer Name`
3. Use section markers: `[Verse]`, `[Chorus]`, `[Bridge]`
4. Click "处理歌词 Process Lyrics" to process
5. Review the preview table
6. Click "生成 PPTX Generate PPTX" to download the PowerPoint file

## Special Pinyin Rules

- The character 祢 must become "Nǐ" (capital N, lowercase ǐ with tone mark) - THIS IS THE ONLY EXCEPTION
- ALL other pinyin must be completely lowercase with tone marks
- Example: 我来到 → "wǒ lái dào" (all lowercase)

## Tech Stack

- Next.js 14+ (App Router)
- React
- Tailwind CSS
- PptxGenJS
- Google Gemini API
- Lucide React

