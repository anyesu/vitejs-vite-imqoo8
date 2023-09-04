import { defineConfig } from 'vite';
import { sassPlugin } from 'esbuild-sass-plugin';
import axios from 'axios';

function requestSimulation() {
  return {
    name: 'request-simulation',
    configureServer(server) {
      const { listen } = server;
      server.listen = async (...args) => {
        await listen.apply(server, args);
        // request as fast as server is ready without manually open browser
        const url = server.resolvedUrls.local[0] + 'not_root';
        axios.get(url, { headers: { Accept: 'text/html' } }).catch((e) => {
          console.error(e);
        });
      };
    },
  };
}

function autoImport() {
  return {
    name: 'auto-import',
    transform(code, id) {
      if (id.includes('/main')) {
        // trigger addMissingDep
        return `import ElButton from 'element-ui/lib/button'\n${code}`;
      }
    },
  };
}

function slowTransformIndexHtml() {
  return {
    name: 'slow-transform-index-html',
    transformIndexHtml: {
      order: 'pre',
      async handler(html) {
        // manually make it slower
        await new Promise((resolve) => {
          // wait time longer than callCrawlEndIfIdleAfterMs
          setTimeout(() => resolve(), 100);
        });
        return html;
      },
    },
  };
}

function slowOptimize() {
  return {
    name: 'slow-optimize',
    config() {
      return {
        // pre-build scss file to make the optimize step slower
        // ref: https://github.com/vitejs/vite/issues/7719#issuecomment-1098683109
        optimizeDeps: {
          extensions: ['.scss', '.sass'],
          include: ['element-ui/packages/theme-chalk/src/index.scss'],
          esbuildOptions: {
            plugins: [
              sassPlugin({
                type: 'style',
                logger: { warn() {} },
              }),
            ],
          },
        },
      };
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    requestSimulation(),
    autoImport(),
    // the following two slow methods may cause problems, try run `npm run dev:expected`
    process.env.NO_SLOW || slowOptimize(),
    process.env.NO_SLOW || slowTransformIndexHtml(),
  ],
});
