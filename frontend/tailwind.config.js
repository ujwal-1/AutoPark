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
        districtBg: '#09090B',
        districtBgElevated: '#121215',
        districtCard: '#141416',
        districtCardHover: '#1A1A1E',
        districtCardBorder: 'rgba(255, 255, 255, 0.1)',
        districtPink: '#FFFFFF',
        districtPurple: '#E4E4E7',
        districtViolet: '#A1A1AA',
        districtBorder: '#27272A',
        districtInput: '#18181B',
        districtMuted: '#A1A1AA',
        districtWhite: '#FFFFFF',
        districtSubtext: '#71717A',
      },
      boxShadow: {
        districtGlow: '0 4px 20px rgba(0, 0, 0, 0.6)',
        districtCard: '0 4px 24px -2px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.08)',
        districtPill: '0 2px 10px rgba(0, 0, 0, 0.4)',
      },
      backgroundImage: {
        'district-gradient': 'linear-gradient(180deg, #FFFFFF 0%, #E4E4E7 100%)',
      },
    },
  },
  plugins: [],
}
