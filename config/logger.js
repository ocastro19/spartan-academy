const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

// Criar diretório de logs se não existir
const logDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Formato personalizado para logs
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// Formato para console (desenvolvimento)
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    
    // Adicionar metadados se existirem
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta, null, 2)}`;
    }
    
    return msg;
  })
);

// Configuração de transports
const transports = [];

// Console transport (sempre ativo em desenvolvimento)
if (process.env.NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
      level: process.env.LOG_LEVEL || 'debug'
    })
  );
}

// File transport para logs gerais
transports.push(
  new DailyRotateFile({
    filename: path.join(logDir, 'application-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d',
    format: logFormat,
    level: process.env.LOG_LEVEL || 'info'
  })
);

// File transport para erros
transports.push(
  new DailyRotateFile({
    filename: path.join(logDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '30d',
    format: logFormat,
    level: 'error'
  })
);

// File transport para auditoria
transports.push(
  new DailyRotateFile({
    filename: path.join(logDir, 'audit-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '90d',
    format: logFormat,
    level: 'info'
  })
);

// Criar logger principal
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: {
    service: 'spartan-api',
    version: process.env.npm_package_version || '1.0.0'
  },
  transports,
  // Não sair em caso de erro
  exitOnError: false
});

// Logger específico para auditoria
const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'spartan-audit',
    type: 'audit'
  },
  transports: [
    new DailyRotateFile({
      filename: path.join(logDir, 'audit-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '90d'
    })
  ]
});

// Logger específico para pagamentos
const paymentLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'spartan-payments',
    type: 'payment'
  },
  transports: [
    new DailyRotateFile({
      filename: path.join(logDir, 'payments-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '365d'
    })
  ]
});

// Funções auxiliares para logging estruturado
const loggers = {
  // Logger principal
  info: (message, meta = {}) => logger.info(message, meta),
  warn: (message, meta = {}) => logger.warn(message, meta),
  error: (message, meta = {}) => logger.error(message, meta),
  debug: (message, meta = {}) => logger.debug(message, meta),
  
  // Auditoria
  audit: (action, details = {}) => {
    auditLogger.info('Audit Log', {
      action,
      ...details,
      timestamp: new Date().toISOString()
    });
  },
  
  // Pagamentos
  payment: (event, details = {}) => {
    paymentLogger.info('Payment Event', {
      event,
      ...details,
      timestamp: new Date().toISOString()
    });
  },
  
  // Login/Logout
  auth: (event, userId, details = {}) => {
    auditLogger.info('Auth Event', {
      event,
      userId,
      ...details,
      timestamp: new Date().toISOString()
    });
  },
  
  // Operações CRUD
  crud: (operation, resource, resourceId, userId, details = {}) => {
    auditLogger.info('CRUD Operation', {
      operation, // CREATE, READ, UPDATE, DELETE
      resource,  // users, students, classes, etc.
      resourceId,
      userId,
      ...details,
      timestamp: new Date().toISOString()
    });
  },
  
  // Check-ins
  checkin: (studentId, classId, status, details = {}) => {
    logger.info('Check-in Event', {
      studentId,
      classId,
      status, // success, failed, late, etc.
      ...details,
      timestamp: new Date().toISOString()
    });
  },
  
  // Webhooks
  webhook: (provider, event, status, details = {}) => {
    logger.info('Webhook Event', {
      provider, // mercadopago, etc.
      event,
      status, // received, processed, failed
      ...details,
      timestamp: new Date().toISOString()
    });
  },
  
  // Jobs/Cron
  job: (jobName, status, details = {}) => {
    logger.info('Job Execution', {
      jobName,
      status, // started, completed, failed
      ...details,
      timestamp: new Date().toISOString()
    });
  },
  
  // Performance
  performance: (operation, duration, details = {}) => {
    logger.info('Performance Log', {
      operation,
      duration, // em ms
      ...details,
      timestamp: new Date().toISOString()
    });
  },
  
  // Segurança
  security: (event, severity, details = {}) => {
    logger.warn('Security Event', {
      event,
      severity, // low, medium, high, critical
      ...details,
      timestamp: new Date().toISOString()
    });
  }
};

// Middleware para logging de requisições HTTP
const httpLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log da requisição
  logger.info('HTTP Request', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
    timestamp: new Date().toISOString()
  });
  
  // Override do res.end para capturar a resposta
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const duration = Date.now() - start;
    
    // Log da resposta
    logger.info('HTTP Response', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      userId: req.user?.id,
      timestamp: new Date().toISOString()
    });
    
    // Log de performance para requisições lentas
    if (duration > 1000) {
      loggers.performance('Slow Request', duration, {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        userId: req.user?.id
      });
    }
    
    originalEnd.call(this, chunk, encoding);
  };
  
  next();
};

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  });
  
  // Dar tempo para o log ser escrito antes de sair
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', {
    reason: reason?.message || reason,
    stack: reason?.stack,
    promise: promise.toString(),
    timestamp: new Date().toISOString()
  });
});

// Exportar loggers e middleware
module.exports = {
  ...loggers,
  httpLogger,
  logger, // Logger winston original
  auditLogger,
  paymentLogger
};