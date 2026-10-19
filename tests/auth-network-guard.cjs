/* eslint-disable @typescript-eslint/no-require-imports -- Preloaded only by the isolated Next smoke test. */
// No database URLs are supplied to that process. This additionally blocks Node
// outbound TCP except its loopback HTTP test port and verified compiler IPC.
const net = require('node:net');
const original = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let options = args[0];
  if (Array.isArray(options)) options = options[0];
  if (options && typeof options === 'object' && options.path) {
    if (String(options.path).startsWith('\\\\.\\pipe\\')) return original.apply(this, args);
    throw new Error('Isolated auth smoke test blocked non-HTTP connection.');
  }
  const port = Number(typeof options === 'object' ? options.port : options);
  const host = typeof options === 'object' ? options.host : typeof args[1] === 'string' ? args[1] : 'localhost';
  // Next/Turbopack's generated PostCSS createIpc reads process.argv[2] and
  // connects to Rust on 127.0.0.1. Require BOTH the generated callsite within
  // this isolated copy and that exact worker argument; never permit SQL ports.
  const stack = (new Error().stack || '').replaceAll('\\', '/');
  const compilerIpc = host === '127.0.0.1' && Number.isInteger(port) && port > 1024 &&
    ![5432, 5434, 5435].includes(port) && String(port) === process.argv[2] &&
    stack.includes('createIpc') && stack.includes(process.cwd().replaceAll('\\', '/') + '/.next/build/');
  if (compilerIpc) return original.apply(this, args);
  if (port !== Number(process.env.AUTH_SMOKE_PORT) || !['127.0.0.1', 'localhost', '::1'].includes(host || 'localhost')) {
    throw new Error('Isolated auth smoke test blocked outbound connection.');
  }
  return original.apply(this, args);
};
