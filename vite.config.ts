import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  ssr: {
    // PostHog packages reference browser globals; bundle them for SSR.
    noExternal: ["posthog-js", "@posthog/react"],
  },
});
