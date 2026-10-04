import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5588,
    strictPort: true,
    // the case's schema lives in `../cases`, and the two packages in `../packages`: the repository root covers both
    fs: { allow: ['..'] },
  },
});
