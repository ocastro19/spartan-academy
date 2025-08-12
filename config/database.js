const mongoose = require('mongoose');
const logger = require('./logger');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Configurações de conexão
const connectionOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 10, // Maintain up to 10 socket connections
  serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
  socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
  family: 4, // Use IPv4, skip trying IPv6
  retryWrites: true,
  w: 'majority'
};

// Função para conectar ao MongoDB
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/spartan';
    
    logger.info('Tentando conectar ao MongoDB...', {
      uri: mongoURI.replace(/\/\/.*@/, '//***:***@') // Ocultar credenciais no log
    });
    
    const conn = await mongoose.connect(mongoURI, connectionOptions);
    
    logger.info('MongoDB conectado com sucesso', {
      host: conn.connection.host,
      port: conn.connection.port,
      database: conn.connection.name
    });
    
    return conn;
    
  } catch (error) {
    logger.error('Erro ao conectar ao MongoDB:', {
      error: error.message,
      stack: error.stack
    });
    
    // Em desenvolvimento, tentar usar MongoDB Memory Server como fallback
    if (process.env.NODE_ENV !== 'production') {
      logger.info('Tentando usar MongoDB Memory Server como fallback...');
      
      try {
        const mongod = await MongoMemoryServer.create();
        const memoryUri = mongod.getUri();
        
        const conn = await mongoose.connect(memoryUri, connectionOptions);
        
        logger.info('MongoDB Memory Server conectado com sucesso', {
          uri: memoryUri,
          database: conn.connection.name
        });
        
        return conn;
      } catch (memoryError) {
        logger.error('Erro ao conectar ao MongoDB Memory Server:', {
          error: memoryError.message,
          stack: memoryError.stack
        });
        throw memoryError;
      }
    }
    
    // Em produção, sair do processo se não conseguir conectar
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
    
    throw error;
  }
};

// Função para desconectar do MongoDB
const disconnectDB = async () => {
  try {
    await mongoose.connection.close();
    logger.info('Desconectado do MongoDB');
  } catch (error) {
    logger.error('Erro ao desconectar do MongoDB:', {
      error: error.message
    });
  }
};

// Event listeners para conexão
mongoose.connection.on('connected', () => {
  logger.info('Mongoose conectado ao MongoDB');
});

mongoose.connection.on('error', (err) => {
  logger.error('Erro de conexão do Mongoose:', {
    error: err.message
  });
});

mongoose.connection.on('disconnected', () => {
  logger.warn('Mongoose desconectado do MongoDB');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Recebido SIGINT, fechando conexão com MongoDB...');
  await disconnectDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Recebido SIGTERM, fechando conexão com MongoDB...');
  await disconnectDB();
  process.exit(0);
});

// Função para verificar status da conexão
const getConnectionStatus = () => {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  
  return {
    state: states[mongoose.connection.readyState],
    host: mongoose.connection.host,
    port: mongoose.connection.port,
    name: mongoose.connection.name
  };
};

// Função para health check do banco
const healthCheck = async () => {
  try {
    const adminDb = mongoose.connection.db.admin();
    const result = await adminDb.ping();
    
    return {
      status: 'healthy',
      connection: getConnectionStatus(),
      ping: result,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    return {
      status: 'unhealthy',
      connection: getConnectionStatus(),
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
};

// Função para obter estatísticas do banco
const getStats = async () => {
  try {
    if (mongoose.connection.readyState !== 1) {
      throw new Error('Database not connected');
    }
    
    const db = mongoose.connection.db;
    const stats = await db.stats();
    
    return {
      database: db.databaseName,
      collections: stats.collections,
      objects: stats.objects,
      avgObjSize: stats.avgObjSize,
      dataSize: stats.dataSize,
      storageSize: stats.storageSize,
      indexes: stats.indexes,
      indexSize: stats.indexSize,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    logger.error('Erro ao obter estatísticas do banco:', {
      error: error.message
    });
    throw error;
  }
};

// Função para criar índices necessários
const createIndexes = async () => {
  try {
    logger.info('Criando índices do banco de dados...');
    
    // Índices para usuários
    await mongoose.connection.db.collection('users').createIndex(
      { email: 1 }, 
      { unique: true, background: true }
    );
    
    await mongoose.connection.db.collection('users').createIndex(
      { cpf: 1 }, 
      { unique: true, sparse: true, background: true }
    );
    
    // Índices para alunos
    await mongoose.connection.db.collection('students').createIndex(
      { user: 1 }, 
      { unique: true, background: true }
    );
    
    await mongoose.connection.db.collection('students').createIndex(
      { status: 1, belt: 1 }, 
      { background: true }
    );
    
    // Índices para turmas
    await mongoose.connection.db.collection('classes').createIndex(
      { date: 1, startTime: 1 }, 
      { background: true }
    );
    
    await mongoose.connection.db.collection('classes').createIndex(
      { instructor: 1, date: 1 }, 
      { background: true }
    );
    
    // Índices para presenças
    await mongoose.connection.db.collection('attendances').createIndex(
      { student: 1, class: 1 }, 
      { unique: true, background: true }
    );
    
    await mongoose.connection.db.collection('attendances').createIndex(
      { student: 1, checkedInAt: -1 }, 
      { background: true }
    );
    
    // Índices para mensalidades
    await mongoose.connection.db.collection('payments').createIndex(
      { student: 1, competency: 1 }, 
      { unique: true, background: true }
    );
    
    await mongoose.connection.db.collection('payments').createIndex(
      { dueDate: 1, status: 1 }, 
      { background: true }
    );
    
    await mongoose.connection.db.collection('payments').createIndex(
      { mercadoPagoId: 1 }, 
      { sparse: true, background: true }
    );
    
    // Índices para produtos
    await mongoose.connection.db.collection('products').createIndex(
      { name: 'text', description: 'text' }, 
      { background: true }
    );
    
    await mongoose.connection.db.collection('products').createIndex(
      { category: 1, active: 1 }, 
      { background: true }
    );
    
    // Índices para graduações
    await mongoose.connection.db.collection('graduations').createIndex(
      { student: 1, date: -1 }, 
      { background: true }
    );
    
    logger.info('Índices criados com sucesso');
    
  } catch (error) {
    logger.error('Erro ao criar índices:', {
      error: error.message,
      stack: error.stack
    });
    // Não falhar a aplicação por causa dos índices
  }
};

// Função para limpar dados de teste (apenas em desenvolvimento)
const clearTestData = async () => {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('Limpeza de dados só é permitida em desenvolvimento');
  }
  
  try {
    logger.warn('Limpando dados de teste...');
    
    const collections = await mongoose.connection.db.listCollections().toArray();
    
    for (const collection of collections) {
      await mongoose.connection.db.collection(collection.name).deleteMany({});
    }
    
    logger.info('Dados de teste limpos com sucesso');
    
  } catch (error) {
    logger.error('Erro ao limpar dados de teste:', {
      error: error.message
    });
    throw error;
  }
};

// Função para backup básico (estrutura)
const createBackup = async () => {
  try {
    logger.info('Iniciando backup da estrutura do banco...');
    
    const collections = await mongoose.connection.db.listCollections().toArray();
    const backup = {
      timestamp: new Date().toISOString(),
      database: mongoose.connection.name,
      collections: []
    };
    
    for (const collectionInfo of collections) {
      const collection = mongoose.connection.db.collection(collectionInfo.name);
      const count = await collection.countDocuments();
      const indexes = await collection.indexes();
      
      backup.collections.push({
        name: collectionInfo.name,
        count,
        indexes: indexes.map(idx => ({
          name: idx.name,
          key: idx.key,
          unique: idx.unique || false
        }))
      });
    }
    
    logger.info('Backup da estrutura concluído', {
      collections: backup.collections.length,
      totalDocuments: backup.collections.reduce((sum, col) => sum + col.count, 0)
    });
    
    return backup;
    
  } catch (error) {
    logger.error('Erro ao criar backup:', {
      error: error.message
    });
    throw error;
  }
};

module.exports = {
  connectDB,
  disconnectDB,
  getConnectionStatus,
  healthCheck,
  getStats,
  createIndexes,
  clearTestData,
  createBackup,
  mongoose
};