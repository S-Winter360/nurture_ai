/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#0F766E', // NurtureAI primary green
        'primary-container': '#CCFBF1', // NurtureAI primary container
        secondary: '#0369A1',
        'secondary-container': '#E0F2FE',
        surface: '#FAFAFA',
      }
    },
  },
  plugins: [],
}
