import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { handleBackendGatewayRequest } from './src/server/aiGatewayBackend'

function aiGatewayDevPlugin(): Plugin {
  return {
    name: 'ai-gateway-dev-server',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0];
        if (req.method === 'POST' && (url === '/api/ai/chat' || url === '/v1/ai/chat')) {
          let body = '';
          req.on('data', (chunk: Buffer | string) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const payload = body ? JSON.parse(body) : {};
              const result = await handleBackendGatewayRequest(payload, {
                clientIp: req.socket.remoteAddress,
                headers: req.headers as any
              });
              res.statusCode = result.statusCode;
              for (const [k, v] of Object.entries(result.headers)) {
                res.setHeader(k, v);
              }
              res.end(JSON.stringify(result.body));
            } catch (err: any) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'AI_INVALID_REQUEST', message: err.message || 'Malformed request body' }));
            }
          });
          return;
        }
        next();
      });
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), aiGatewayDevPlugin()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
  },
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router-dom'],
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-router-dom',
      'zustand',
      'lucide-react',
      'motion/react',
      'dexie',
    ],
  },
})
