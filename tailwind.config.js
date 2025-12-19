/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#4F46E5',    // 인디고
        secondary: '#06B6D4',  // 시안
        accent: '#F59E0B',     // 앰버
      }
    },
  },
  plugins: [],
}
