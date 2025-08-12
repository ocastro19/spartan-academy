const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware de autenticação
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token de acesso não fornecido'
      });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-senha');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Token inválido - usuário não encontrado'
      });
    }
    
    if (!user.ativo) {
      return res.status(401).json({
        success: false,
        message: 'Usuário inativo'
      });
    }
    
    req.user = user;
    next();
  } catch (error) {
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
    
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Middleware para verificar perfis específicos
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não autenticado'
      });
    }
    
    if (!roles.includes(req.user.perfil)) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado - permissões insuficientes'
      });
    }
    
    next();
  };
};

// Middleware para verificar se é admin
const adminOnly = authorize('admin');

// Middleware para verificar se é admin ou instrutor
const adminOrInstructor = authorize('admin', 'instrutor');

// Middleware para verificar se é o próprio usuário ou admin
const ownerOrAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Usuário não autenticado'
    });
  }
  
  const userId = req.params.id || req.params.userId;
  
  if (req.user.perfil === 'admin' || req.user._id.toString() === userId) {
    return next();
  }
  
  return res.status(403).json({
    success: false,
    message: 'Acesso negado - você só pode acessar seus próprios dados'
  });
};

// Middleware opcional de autenticação (não falha se não houver token)
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-senha');
      
      if (user && user.ativo) {
        req.user = user;
      }
    }
    
    next();
  } catch (error) {
    // Em caso de erro, continua sem usuário autenticado
    next();
  }
};

// Middleware para rate limiting por usuário
const userRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const requests = new Map();
  
  return (req, res, next) => {
    if (!req.user) {
      return next();
    }
    
    const userId = req.user._id.toString();
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Limpar requests antigos
    if (requests.has(userId)) {
      const userRequests = requests.get(userId).filter(time => time > windowStart);
      requests.set(userId, userRequests);
    } else {
      requests.set(userId, []);
    }
    
    const userRequests = requests.get(userId);
    
    if (userRequests.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: 'Muitas requisições. Tente novamente em alguns minutos.',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
    
    userRequests.push(now);
    next();
  };
};

// Middleware para verificar se o usuário pode acessar dados de um aluno específico
const canAccessStudent = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não autenticado'
      });
    }
    
    // Admin pode acessar qualquer aluno
    if (req.user.perfil === 'admin') {
      return next();
    }
    
    const studentId = req.params.id || req.params.studentId;
    
    // Se é um aluno, só pode acessar seus próprios dados
    if (req.user.perfil === 'aluno') {
      const Student = require('../models/Student');
      const student = await Student.findById(studentId);
      
      if (!student) {
        return res.status(404).json({
          success: false,
          message: 'Aluno não encontrado'
        });
      }
      
      // Verificar se o usuário logado corresponde ao aluno
      if (student.email !== req.user.email) {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado - você só pode acessar seus próprios dados'
        });
      }
    }
    
    // Instrutores podem acessar dados de alunos (com algumas restrições)
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Middleware para log de atividades
const logActivity = (action) => {
  return (req, res, next) => {
    if (req.user) {
      console.log(`[${new Date().toISOString()}] ${req.user.nome} (${req.user.perfil}) - ${action} - ${req.method} ${req.originalUrl}`);
    }
    next();
  };
};

// Middleware para verificar se a academia está ativa (para funcionalidades críticas)
const checkAcademyStatus = (req, res, next) => {
  // Aqui você poderia implementar uma verificação de status da academia
  // Por exemplo, verificar se a mensalidade da academia está em dia
  // ou se há alguma manutenção programada
  
  // Por enquanto, sempre permite
  next();
};

// Middleware para validar horário de funcionamento
const businessHours = (req, res, next) => {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0 = domingo, 6 = sábado
  
  // Exemplo: funcionamento de segunda a sexta das 6h às 22h, sábado das 8h às 18h
  const isBusinessHour = (
    (day >= 1 && day <= 5 && hour >= 6 && hour < 22) || // Segunda a sexta
    (day === 6 && hour >= 8 && hour < 18) // Sábado
  );
  
  // Admin sempre pode acessar
  if (req.user && req.user.perfil === 'admin') {
    return next();
  }
  
  if (!isBusinessHour) {
    return res.status(403).json({
      success: false,
      message: 'Acesso fora do horário de funcionamento',
      businessHours: {
        'segunda-sexta': '06:00 - 22:00',
        'sabado': '08:00 - 18:00',
        'domingo': 'Fechado'
      }
    });
  }
  
  next();
};

module.exports = {
  auth,
  authorize,
  adminOnly,
  adminOrInstructor,
  ownerOrAdmin,
  optionalAuth,
  userRateLimit,
  canAccessStudent,
  logActivity,
  checkAcademyStatus,
  businessHours
};