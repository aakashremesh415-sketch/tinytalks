/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0b0e14',
          900: '#11151f',
          800: '#171c2a',
          700: '#212739',
        },
        coral: {
          400: '#ff8a7a',
          500: '#ff6b5b',
          600: '#f0503f',
        },
        violet: {
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
        },
        mint: {
          400: '#5eead4',
          500: '#2dd4bf',
        },
      },
      fontFamily: {
        display: ['"Sora"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 40px -10px rgba(139, 92, 246, 0.45)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #ff6b5b 0%, #8b5cf6 55%, #2dd4bf 100%)',
      },
    },
  },
  plugins: [],
};
