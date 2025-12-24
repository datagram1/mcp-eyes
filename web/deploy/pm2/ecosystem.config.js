module.exports = {
  apps: [
    {
      name: 'screencontrol-web',
      cwd: '/var/www/html/screencontrol/web',
      script: 'npm',
      args: 'start',
      interpreter: '/usr/bin/node',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      },
      // Logging
      error_file: '/home/richardbrown/.pm2/logs/screencontrol-web-error.log',
      out_file: '/home/richardbrown/.pm2/logs/screencontrol-web-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      // Restart policy
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '500M',
      // Watch (disabled in production)
      watch: false,
      ignore_watch: ['node_modules', '.next', '.git']
    }
  ]
};
