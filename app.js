const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
require('express-async-errors');

const { httpLogger } = require('./config/logger');
const logger = require('./config/logger');

// Importar rotas
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const studentRoutes = require('./routes/students');
const classRoutes = require('./routes/classes');
const attendanceRoutes = require('./routes/attendance');
const paymentRoutes = require('./routes/payments');
const graduationRoutes = require('./routes/graduations');
const storeRoutes = require('./routes/products');
const dashboardRoutes = require('./routes/dashboard');
const webhookRoutes = require('./routes/webhooks');
const settingsRoutes = require('./routes/settings');

const app = express();

// Trust proxy (importante para rate limiting e logs corretos)
app.set('trust proxy', 1);

// Middleware de segurança
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", 'https://api.mercadopago.com']
    }
  },
  crossOriginEmbedderPolicy: false
}));

// Compressão de resposta
app.use(compression());

// Sanitização de dados
app.use(mongoSanitize());
app.use(xss());
app.use(hpp());

// CORS
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      process.env.FRONTEND_URL,
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000'
    ].filter(Boolean);
    
    // Permitir requisições sem origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      logger.security('CORS blocked request', 'medium', {
        origin,
        allowedOrigins
      });
      callback(new Error('Não permitido pelo CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'Pragma'
  ],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count']
};

app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutos
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // máximo 100 requests por IP
  message: {
    success: false,
    message: 'Muitas requisições deste IP, tente novamente em alguns minutos.',
    retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Pular rate limiting para health checks
    return req.path === '/api/health' || req.path === '/health';
  },
  onLimitReached: (req) => {
    logger.security('Rate limit exceeded', 'medium', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path
    });
  }
});

// Rate limiting mais restritivo para auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // máximo 5 tentativas de login por IP
  message: {
    success: false,
    message: 'Muitas tentativas de login, tente novamente em 15 minutos.'
  },
  skipSuccessfulRequests: true
});

// Rate limiting para webhooks
const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 50, // máximo 50 webhooks por minuto
  message: {
    success: false,
    message: 'Muitos webhooks recebidos'
  }
});

app.use(limiter);

// Middleware para parsing de JSON
app.use('/api/webhooks', express.raw({ type: 'application/json' }));
app.use(express.json({ 
  limit: process.env.JSON_LIMIT || '10mb',
  verify: (req, res, buf) => {
    // Salvar raw body para webhooks
    if (req.originalUrl.includes('/webhooks/')) {
      req.rawBody = buf;
    }
  }
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: process.env.URL_ENCODED_LIMIT || '10mb' 
}));

// Middleware de logging HTTP
app.use(httpLogger);

// Servir arquivos estáticos
app.use('/uploads', express.static('uploads', {
  maxAge: '1d',
  etag: true
}));

// Serve static files from public directory
app.use(express.static('public'));

// Rotas da API
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/attendances', attendanceRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/graduations', graduationRoutes);
app.use('/api/store', storeRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/webhooks', webhookLimiter, webhookRoutes);
app.use('/api/settings', settingsRoutes);

// Rota para informações da API
app.get('/api', (req, res) => {
  res.json({
    name: 'Spartan Academy API',
    version: process.env.npm_package_version || '1.0.0',
    description: 'API para gerenciamento de academia de artes marciais',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      students: '/api/students',
      classes: '/api/classes',
      attendances: '/api/attendances',
      payments: '/api/payments',
      graduations: '/api/graduations',
      store: '/api/store',
      dashboard: '/api/dashboard',
      webhooks: '/api/webhooks',
      settings: '/api/settings',
      health: '/api/health'
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0'
  });
});

app.get('/api/health', async (req, res) => {
  try {
    const { healthCheck } = require('./config/database');
    const { testConnection } = require('./config/mercadopago');
    
    const dbHealth = await healthCheck();
    const mpHealth = await testConnection();
    
    const health = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      version: process.env.npm_package_version || '1.0.0',
      services: {
        database: dbHealth,
        mercadopago: mpHealth
      }
    };
    
    const isHealthy = dbHealth.status === 'healthy' && mpHealth.status === 'connected';
    
    res.status(isHealthy ? 200 : 503).json(health);
    
  } catch (error) {
    logger.error('Health check failed:', {
      error: error.message
    });
    
    res.status(503).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Rota raiz
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Sistema Spartan - Academia de Artes Marciais</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
                color: white;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .container {
                text-align: center;
                padding: 2rem;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 20px;
                backdrop-filter: blur(10px);
                border: 1px solid rgba(255, 255, 255, 0.2);
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                max-width: 600px;
                width: 90%;
            }
            .logo {
                font-size: 3rem;
                margin-bottom: 1rem;
            }
            h1 {
                font-size: 2.5rem;
                margin-bottom: 1rem;
                color: #fff;
            }
            .subtitle {
                font-size: 1.2rem;
                margin-bottom: 2rem;
                opacity: 0.9;
            }
            .status {
                display: inline-block;
                background: #28a745;
                color: white;
                padding: 0.5rem 1rem;
                border-radius: 25px;
                font-weight: bold;
                margin-bottom: 2rem;
            }
            .endpoints {
                background: rgba(255, 255, 255, 0.1);
                border-radius: 15px;
                padding: 1.5rem;
                margin-bottom: 2rem;
            }
            .endpoints h3 {
                margin-bottom: 1rem;
                color: #ffd700;
            }
            .endpoint {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 0.5rem 0;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            }
            .endpoint:last-child {
                border-bottom: none;
            }
            .endpoint a {
                color: #87ceeb;
                text-decoration: none;
                transition: color 0.3s;
            }
            .endpoint a:hover {
                color: #ffd700;
            }
            .method {
                background: #007bff;
                color: white;
                padding: 0.2rem 0.5rem;
                border-radius: 5px;
                font-size: 0.8rem;
                font-weight: bold;
            }
            .version {
                margin-top: 2rem;
                opacity: 0.7;
                font-size: 0.9rem;
            }
            @media (max-width: 768px) {
                h1 {
                    font-size: 2rem;
                }
                .logo {
                    font-size: 2rem;
                }
                .endpoint {
                    flex-direction: column;
                    align-items: flex-start;
                    gap: 0.5rem;
                }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="logo">🥋</div>
            <h1>Sistema Spartan</h1>
            <p class="subtitle">Academia de Artes Marciais</p>
            <div class="status">✅ Sistema Online</div>
            
            <div class="endpoints">
                <h3>🔗 Endpoints Disponíveis</h3>
                <div class="endpoint">
                    <span><span class="method">GET</span> Health Check</span>
                    <a href="/api/health" target="_blank">/api/health</a>
                </div>
                <div class="endpoint">
                    <span><span class="method">GET</span> API Info</span>
                    <a href="/api" target="_blank">/api</a>
                </div>
                <div class="endpoint">
                    <span><span class="method">POST</span> Autenticação</span>
                    <span>/api/auth/login</span>
                </div>
                <div class="endpoint">
                    <span><span class="method">GET</span> Alunos</span>
                    <span>/api/students</span>
                </div>
                <div class="endpoint">
                    <span><span class="method">GET</span> Aulas</span>
                    <span>/api/classes</span>
                </div>
                <div class="endpoint">
                    <span><span class="method">GET</span> Pagamentos</span>
                    <span>/api/payments</span>
                </div>
                <div class="endpoint">
                    <span><span class="method">GET</span> Dashboard</span>
                    <span>/api/dashboard</span>
                </div>
            </div>
            
            <div class="version">
                <p>Versão 1.0.0 | Ambiente: ${process.env.NODE_ENV || 'development'}</p>
                <p>🗄️ Banco: MongoDB Memory Server</p>
            </div>
        </div>
    </body>
    </html>
  `);
});

// Middleware para rotas não encontradas
app.use('*', (req, res) => {
  logger.warn('Route not found', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  res.status(404).json({
    success: false,
    message: 'Rota não encontrada',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// Middleware global de tratamento de erros
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', {
    error: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id
  });
  
  // Erro de validação do Mongoose
  if (error.name === 'ValidationError') {
    const errors = Object.values(error.errors).map(err => ({
      field: err.path,
      message: err.message
    }));
    
    return res.status(400).json({
      success: false,
      message: 'Dados inválidos',
      errors
    });
  }
  
  // Erro de cast do Mongoose (ID inválido)
  if (error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'ID inválido',
      field: error.path
    });
  }
  
  // Erro de duplicação (chave única)
  if (error.code === 11000) {
    const field = Object.keys(error.keyValue)[0];
    return res.status(400).json({
      success: false,
      message: `${field} já está em uso`,
      field
    });
  }
  
  // Erro de JWT
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Token inválido'
    });
  }
  
  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expirado'
    });
  }
  
  // Erro de CORS
  if (error.message === 'Não permitido pelo CORS') {
    return res.status(403).json({
      success: false,
      message: 'Acesso negado pelo CORS'
    });
  }
  
  // Erro genérico
  const statusCode = error.statusCode || error.status || 500;
  const message = statusCode === 500 ? 'Erro interno do servidor' : error.message;
  
  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && {
      error: error.message,
      stack: error.stack
    }),
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown handlers
process.on('SIGTERM', () => {
  logger.info('SIGTERM recebido, iniciando graceful shutdown...');
  // O server.js vai lidar com o fechamento do servidor
});

process.on('SIGINT', () => {
  logger.info('SIGINT recebido, iniciando graceful shutdown...');
  // O server.js vai lidar com o fechamento do servidor
});

module.exports = app;