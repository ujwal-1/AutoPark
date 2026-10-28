/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Facility palette — concrete, paper, ink, one paint colour.
        concrete: '#ECE9E0',
        panel: '#F9F7F0',
        panel2: '#F2EFE6',
        ink: '#33312A',
        ink2: '#5A574D',
        muted: '#706B5B',
        hair: '#D8D1C2',
        hair2: '#C2BAA8',
        paint: '#EAC98A',
        paintDeep: '#C89F55',
        fault: '#A55643',
        ok: '#47735C',

        // Legacy aliases kept so untouched markup still resolves to the palette.
        districtBg: '#ECE9E0',
        districtBgElevated: '#F9F7F0',
        districtCard: '#F9F7F0',
        districtCardHover: '#F2EFE6',
        districtCardBorder: 'rgba(51, 49, 42, 0.14)',
        districtPink: '#33312A',
        districtPurple: '#5A574D',
        districtViolet: '#706B5B',
        districtBorder: '#D8D1C2',
        districtInput: '#FFFFFF',
        districtMuted: '#706B5B',
        districtWhite: '#33312A',
        districtSubtext: '#706B5B',
      },
      fontFamily: {
        sans: ['Public Sans', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        sign: ['Archivo', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        districtGlow: 'none',
        districtCard: '0 1px 0 #D8D1C2',
        districtPill: 'none',
      },
      backgroundImage: {
        'district-gradient': 'none',
      },
    },
  },
  plugins: [],
}
