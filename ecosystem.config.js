module.exports = {
  apps: [
    {
      name: 'rift-backend',
      script: 'backend/src/server.js',
      cwd: '/home/digitalbath/rift',
      env: {
        NODE_ENV: 'production',
        PATH: `/home/digitalbath/.local/bin:/home/digitalbath/.nvm/versions/node/v20.20.2/bin:/usr/local/bin:/usr/bin:/bin`,
      },
      out_file: '/home/digitalbath/rift/logs/backend.log',
      error_file: '/home/digitalbath/rift/logs/backend-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'rift-frontend',
      script: 'server.js',
      cwd: '/home/digitalbath/rift/frontend',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        BACKEND_URL: 'http://localhost:3001',
      },
      out_file: '/home/digitalbath/rift/logs/frontend.log',
      error_file: '/home/digitalbath/rift/logs/frontend-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
}
