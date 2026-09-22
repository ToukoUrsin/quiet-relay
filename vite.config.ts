import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  build: { target: "es2022" },
  server: {
    headers: {
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://127.0.0.1:* ws://localhost:* http://127.0.0.1:7337; object-src 'none'; base-uri 'self'",
    },
  },
});
