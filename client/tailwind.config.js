/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        lipstick: '#D2042D',
        eggplant: '#301934',
        burgundy: '#800020',
        gold: '#FFD700',
      },
      fontFamily: {
        caveat: ['Caveat', 'cursive'],
      },
    },
  },
  plugins: [],
}