/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        barlow: ['Barlow', 'Arial', 'Helvetica', 'sans-serif'],
      },
      colors: {
        xavier: {
          yellow: '#F5C800',
          'yellow-active': '#C4A000',
          blue: '#4A90B8',
          steel: '#2E6A8E',
          cyan: '#1eaedb',
          link: '#0068bd',
        },
        charcoal: '#1f1f1f',
        'body-gray': '#6b6b6b',
      },
    },
  },
  plugins: [],
}
