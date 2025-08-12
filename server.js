const app = require('./app');
const fs = require('fs');
const path = require('path');
const { connectDB, disconnectDB } = require('./config/database');
const logger = require('./config/logger');
const {
  generateMonthlyPayments,
  calculatePenalties,
  sendPaymentReminders,
  initializeJobs
} = require('./jobs/monthlyPaymentJob');

// Criar diretórios necessários se não existirem
const createDirectories = () => {
  const directories = [
    'uploads',
    'uploads/avatars',
    'uploads/products',
    'certificates',
    'logs'
  ];
  
  directories.forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`📁 Diretório criado: ${dir}`);
    }
  });
};

// Criar diretórios necessários
createDirectories();

// Configurar porta
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Função para inicializar o servidor
async function startServer() {
  try {
    // Conectar ao banco de dados
    await connectDB();
    logger.info('✅ Banco de dados conectado com sucesso');

    // Inicializar jobs agendados apenas em produção
    if (NODE_ENV === 'production') {
      initializeJobs();
      logger.info('✅ Jobs agendados inicializados');
    } else {
      logger.info('ℹ️  Jobs agendados desabilitados em desenvolvimento');
    }

    // Iniciar servidor
    const server = app.listen(PORT, () => {
      console.log('🚀 ========================================');
      console.log('🥋 Sistema Spartan - Academia de Artes Marciais');
      console.log('🚀 ========================================');
      console.log(`🌐 Servidor rodando na porta ${PORT}`);
      console.log(`🔗 URL: http://localhost:${PORT}`);
      console.log(`🏥 Health Check: http://localhost:${PORT}/api/health`);
      console.log(`📚 Ambiente: ${NODE_ENV}`);
      if (NODE_ENV === 'development') {
        console.log('📚 Para popular o banco: npm run seed');
        console.log('🧪 Para executar testes: npm test');
      }
      console.log('🚀 ========================================');
      
      logger.info(`🚀 Servidor rodando na porta ${PORT} em modo ${NODE_ENV}`);
    });

    // Configurar timeout do servidor
    server.timeout = 30000; // 30 segundos

    // Graceful shutdown
    const gracefulShutdown = (signal) => {
      console.log(`\n⚠️ Recebido ${signal}. Iniciando shutdown gracioso...`);
      logger.info(`📴 Recebido sinal ${signal}. Iniciando graceful shutdown...`);
      
      server.close(async (err) => {
        if (err) {
          logger.error('❌ Erro ao fechar servidor:', err);
          console.error('❌ Erro durante shutdown:', err);
          process.exit(1);
        }
        
        try {
          // Fechar conexão com banco de dados
          await disconnectDB();
          logger.info('🔌 Conexão com banco de dados fechada');
          console.log('✅ Shutdown gracioso concluído');
          process.exit(0);
        } catch (error) {
          logger.error('❌ Erro durante graceful shutdown:', error);
          console.error('❌ Erro ao desconectar banco:', error);
          process.exit(1);
        }
      });
      
      // Forçar shutdown após 30 segundos
      setTimeout(() => {
        console.error('⏰ Forçando shutdown após timeout...');
        logger.error('⏰ Timeout de graceful shutdown. Forçando saída...');
        process.exit(1);
      }, 30000);
    };

    // Listeners para sinais de sistema
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Tratamento de erros do servidor
    server.on('error', (error) => {
      if (error.syscall !== 'listen') {
        throw error;
      }

      const bind = typeof PORT === 'string' ? 'Pipe ' + PORT : 'Port ' + PORT;

      switch (error.code) {
        case 'EACCES':
          console.error(`❌ ${bind} requer privilégios elevados`);
          logger.error(`❌ ${bind} requer privilégios elevados`);
          process.exit(1);
          break;
        case 'EADDRINUSE':
          console.error(`❌ ${bind} já está em uso`);
          logger.error(`❌ ${bind} já está em uso`);
          process.exit(1);
          break;
        default:
          console.error('❌ Erro no servidor:', error);
          logger.error('❌ Erro no servidor:', error);
          throw error;
      }
    });

    // Tratamento de exceções não capturadas
    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception:', error);
      logger.error('❌ Uncaught Exception:', error);
      gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
      logger.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
      gracefulShutdown('unhandledRejection');
    });

    return server;
    
  } catch (error) {
    console.error('❌ Erro ao inicializar servidor:', error);
    logger.error('❌ Erro ao inicializar servidor:', error);
    process.exit(1);
  }
}

// Inicializar servidor apenas se este arquivo for executado diretamente
if (require.main === module) {
  startServer();
}

// Exportar para testes
module.exports = { startServer, app };