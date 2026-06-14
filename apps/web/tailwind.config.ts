import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        lime:    '#ccff00',
        'lime-dark': '#abd600',
        black:   '#000000',
        surface: '#f9f9f9',
        'surface-low': '#f3f3f4',
        'on-surface': '#1a1c1c',
        'on-surface-muted': '#444933',
        outline: '#747a60',
      },
      fontFamily: {
        headline: ['Montserrat', 'sans-serif'],
        body:     ['Hanken Grotesk', 'sans-serif'],
      },
      boxShadow: {
        'hard':    '4px 4px 0px 0px #000000',
        'hard-lg': '8px 8px 0px 0px #000000',
        'hard-sm': '2px 2px 0px 0px #000000',
      },
      borderWidth: {
        '3': '3px',
      },
      fontSize: {
        'display': ['48px', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '900' }],
      },
    },
  },
  plugins: [],
}

export default config
