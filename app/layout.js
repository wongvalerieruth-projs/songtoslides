import './globals.css'

export const metadata = {
  title: 'Song to Slides',
  description: 'Generate Chinese worship lyrics slides with Pinyin',
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}

