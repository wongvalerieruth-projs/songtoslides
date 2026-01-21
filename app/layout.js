import './globals.css'
import { Playfair_Display, Lora } from 'next/font/google'

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
})

const lora = Lora({
  subsets: ['latin'],
  variable: '--font-lora',
  display: 'swap',
})

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
    <html lang="zh-CN" className={`${playfair.variable} ${lora.variable}`}>
      <body>{children}</body>
    </html>
  )
}

