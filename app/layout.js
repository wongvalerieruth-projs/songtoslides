import './globals.css'

export const metadata = {
  title: '歌词幻灯片生成器 | Lyrics Slide Generator',
  description: 'Generate Chinese worship lyrics slides with Pinyin',
}

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}

