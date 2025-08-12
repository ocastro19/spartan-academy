const { body, param, query, validationResult } = require('express-validator');
const mongoose = require('mongoose');

// Middleware para processar erros de validação
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Dados inválidos',
      errors: errors.array().map(error => ({
        field: error.path || error.param,
        message: error.msg,
        value: error.value
      }))
    });
  }
  
  next();
};

// Validações para usuários
const validateUser = {
  create: [
    body('nome')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Nome deve ter entre 2 e 100 caracteres'),
    
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Email inválido'),
    
    body('telefone')
      .optional()
      .matches(/^\(?\d{2}\)?[\s-]?\d{4,5}[\s-]?\d{4}$/)
      .withMessage('Telefone inválido'),
    
    body('perfil')
      .isIn(['admin', 'instrutor', 'aluno'])
      .withMessage('Perfil deve ser admin, instrutor ou aluno'),
    
    body('senha')
      .isLength({ min: 6 })
      .withMessage('Senha deve ter pelo menos 6 caracteres')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Senha deve conter pelo menos uma letra minúscula, uma maiúscula e um número'),
    
    handleValidationErrors
  ],
  
  update: [
    body('nome')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Nome deve ter entre 2 e 100 caracteres'),
    
    body('email')
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage('Email inválido'),
    
    body('telefone')
      .optional()
      .matches(/^\(?\d{2}\)?[\s-]?\d{4,5}[\s-]?\d{4}$/)
      .withMessage('Telefone inválido'),
    
    body('perfil')
      .optional()
      .isIn(['admin', 'instrutor', 'aluno'])
      .withMessage('Perfil deve ser admin, instrutor ou aluno'),
    
    handleValidationErrors
  ],
  
  changePassword: [
    body('senhaAtual')
      .notEmpty()
      .withMessage('Senha atual é obrigatória'),
    
    body('novaSenha')
      .isLength({ min: 6 })
      .withMessage('Nova senha deve ter pelo menos 6 caracteres')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Nova senha deve conter pelo menos uma letra minúscula, uma maiúscula e um número'),
    
    handleValidationErrors
  ]
};

// Validações para alunos
const validateStudent = {
  create: [
    body('nome')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Nome deve ter entre 2 e 100 caracteres'),
    
    body('data_nascimento')
      .isISO8601()
      .withMessage('Data de nascimento inválida')
      .custom(value => {
        const birthDate = new Date(value);
        const today = new Date();
        const age = today.getFullYear() - birthDate.getFullYear();
        
        if (age > 100 || birthDate > today) {
          throw new Error('Data de nascimento inválida');
        }
        
        return true;
      }),
    
    body('grupo')
      .isIn(['adulto', 'kids'])
      .withMessage('Grupo deve ser adulto ou kids'),
    
    body('email')
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage('Email inválido'),
    
    body('telefone')
      .optional()
      .matches(/^\(?\d{2}\)?[\s-]?\d{4,5}[\s-]?\d{4}$/)
      .withMessage('Telefone inválido'),
    
    body('dia_vencimento')
      .isInt({ min: 1, max: 31 })
      .withMessage('Dia de vencimento deve estar entre 1 e 31'),
    
    body('valor_mensalidade')
      .isFloat({ min: 0 })
      .withMessage('Valor da mensalidade deve ser positivo'),
    
    body('endereco.cep')
      .optional()
      .matches(/^\d{5}-?\d{3}$/)
      .withMessage('CEP inválido'),
    
    handleValidationErrors
  ],
  
  update: [
    body('nome')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Nome deve ter entre 2 e 100 caracteres'),
    
    body('grupo')
      .optional()
      .isIn(['adulto', 'kids'])
      .withMessage('Grupo deve ser adulto ou kids'),
    
    body('email')
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage('Email inválido'),
    
    body('telefone')
      .optional()
      .matches(/^\(?\d{2}\)?[\s-]?\d{4,5}[\s-]?\d{4}$/)
      .withMessage('Telefone inválido'),
    
    body('dia_vencimento')
      .optional()
      .isInt({ min: 1, max: 31 })
      .withMessage('Dia de vencimento deve estar entre 1 e 31'),
    
    body('valor_mensalidade')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Valor da mensalidade deve ser positivo'),
    
    handleValidationErrors
  ]
};

// Validações para turmas
const validateClass = {
  create: [
    body('nome')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Nome deve ter entre 2 e 100 caracteres'),
    
    body('grupo')
      .isIn(['adulto', 'kids', 'ambos'])
      .withMessage('Grupo deve ser adulto, kids ou ambos'),
    
    body('dias_semana')
      .isArray({ min: 1 })
      .withMessage('Deve ter pelo menos um dia da semana')
      .custom(value => {
        const diasValidos = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];
        const todosValidos = value.every(dia => diasValidos.includes(dia));
        
        if (!todosValidos) {
          throw new Error('Dias da semana inválidos');
        }
        
        return true;
      }),
    
    body('hora_inicio')
      .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .withMessage('Hora de início inválida (formato HH:MM)'),
    
    body('hora_fim')
      .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .withMessage('Hora de fim inválida (formato HH:MM)')
      .custom((value, { req }) => {
        const inicio = req.body.hora_inicio;
        if (inicio && value <= inicio) {
          throw new Error('Hora de fim deve ser posterior à hora de início');
        }
        return true;
      }),
    
    body('capacidade')
      .isInt({ min: 1, max: 100 })
      .withMessage('Capacidade deve estar entre 1 e 100'),
    
    body('instrutor')
      .isMongoId()
      .withMessage('ID do instrutor inválido'),
    
    handleValidationErrors
  ],
  
  update: [
    body('nome')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Nome deve ter entre 2 e 100 caracteres'),
    
    body('grupo')
      .optional()
      .isIn(['adulto', 'kids', 'ambos'])
      .withMessage('Grupo deve ser adulto, kids ou ambos'),
    
    body('capacidade')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Capacidade deve estar entre 1 e 100'),
    
    handleValidationErrors
  ]
};

// Validações para agendamentos
const validateBooking = {
  create: [
    body('aula_id')
      .isMongoId()
      .withMessage('ID da aula inválido'),
    
    body('aluno_id')
      .isMongoId()
      .withMessage('ID do aluno inválido'),
    
    handleValidationErrors
  ]
};

// Validações para produtos
const validateProduct = {
  create: [
    body('nome')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Nome deve ter entre 2 e 100 caracteres'),
    
    body('sku')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('SKU deve ter entre 2 e 50 caracteres'),
    
    body('categoria')
      .isIn(['kimono', 'rashguard', 'camiseta', 'shorts', 'faixa', 'acessorio', 'suplemento', 'equipamento'])
      .withMessage('Categoria inválida'),
    
    body('preco')
      .isFloat({ min: 0 })
      .withMessage('Preço deve ser positivo'),
    
    body('preco_promocional')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Preço promocional deve ser positivo')
      .custom((value, { req }) => {
        if (value && req.body.preco && value >= req.body.preco) {
          throw new Error('Preço promocional deve ser menor que o preço normal');
        }
        return true;
      }),
    
    body('estoque.quantidade')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Quantidade em estoque deve ser positiva'),
    
    handleValidationErrors
  ],
  
  update: [
    body('nome')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Nome deve ter entre 2 e 100 caracteres'),
    
    body('sku')
      .optional()
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('SKU deve ter entre 2 e 50 caracteres'),
    
    body('categoria')
      .optional()
      .isIn(['kimono', 'rashguard', 'camiseta', 'shorts', 'faixa', 'acessorio', 'suplemento', 'equipamento'])
      .withMessage('Categoria inválida'),
    
    body('preco')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Preço deve ser positivo'),
    
    body('preco_promocional')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Preço promocional deve ser positivo'),
    
    body('estoque.quantidade')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Quantidade em estoque deve ser positiva'),
    
    handleValidationErrors
  ]
};

// Validações para pedidos
const validateOrder = {
  create: [
    body('cliente.aluno_id')
      .isMongoId()
      .withMessage('ID do aluno inválido'),
    
    body('itens')
      .isArray({ min: 1 })
      .withMessage('Pedido deve ter pelo menos um item'),
    
    body('itens.*.produto_id')
      .isMongoId()
      .withMessage('ID do produto inválido'),
    
    body('itens.*.quantidade')
      .isInt({ min: 1 })
      .withMessage('Quantidade deve ser positiva'),
    
    body('tipo_entrega')
      .isIn(['retirada', 'entrega'])
      .withMessage('Tipo de entrega deve ser retirada ou entrega'),
    
    body('pagamento.metodo')
      .isIn(['dinheiro', 'cartao', 'pix', 'boleto', 'transferencia', 'mercado_pago', 'mensalidade'])
      .withMessage('Método de pagamento inválido'),
    
    handleValidationErrors
  ]
};

// Validações para mensalidades
const validateMonthly = {
  create: [
    body('aluno_id')
      .isMongoId()
      .withMessage('ID do aluno inválido'),
    
    body('competencia')
      .matches(/^\d{4}-\d{2}$/)
      .withMessage('Competência deve estar no formato YYYY-MM'),
    
    body('valor')
      .isFloat({ min: 0 })
      .withMessage('Valor deve ser positivo'),
    
    body('vencimento')
      .isISO8601()
      .withMessage('Data de vencimento inválida'),
    
    handleValidationErrors
  ],
  
  payment: [
    body('valor_pago')
      .isFloat({ min: 0 })
      .withMessage('Valor pago deve ser positivo'),
    
    body('forma_pagamento')
      .isIn(['dinheiro', 'cartao', 'pix', 'boleto', 'transferencia'])
      .withMessage('Forma de pagamento inválida'),
    
    handleValidationErrors
  ]
};

// Validações para graduações
const validateGraduation = {
  create: [
    body('aluno_id')
      .isMongoId()
      .withMessage('ID do aluno inválido'),
    
    body('faixa')
      .isIn(['branca', 'cinza', 'amarela', 'laranja', 'verde', 'azul', 'roxa', 'marrom', 'preta'])
      .withMessage('Faixa inválida'),
    
    body('grau')
      .isInt({ min: 0, max: 10 })
      .withMessage('Grau deve estar entre 0 e 10'),
    
    body('data')
      .isISO8601()
      .withMessage('Data inválida'),
    
    body('responsavel')
      .isMongoId()
      .withMessage('ID do responsável inválido'),
    
    handleValidationErrors
  ],
  
  update: [
    body('faixa')
      .optional()
      .isIn(['branca', 'cinza', 'amarela', 'laranja', 'verde', 'azul', 'roxa', 'marrom', 'preta'])
      .withMessage('Faixa inválida'),
    
    body('grau')
      .optional()
      .isInt({ min: 0, max: 10 })
      .withMessage('Grau deve estar entre 0 e 10'),
    
    body('data')
      .optional()
      .isISO8601()
      .withMessage('Data inválida'),
    
    body('responsavel')
      .optional()
      .isMongoId()
      .withMessage('ID do responsável inválido'),
    
    handleValidationErrors
  ]
};

// Validações para parâmetros de URL
const validateParams = {
  mongoId: [
    param('id')
      .isMongoId()
      .withMessage('ID inválido'),
    
    handleValidationErrors
  ]
};

// Validações para query parameters
const validateQuery = {
  pagination: [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Página deve ser um número positivo'),
    
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limite deve estar entre 1 e 100'),
    
    handleValidationErrors
  ],
  
  dateRange: [
    query('data_inicio')
      .optional()
      .isISO8601()
      .withMessage('Data de início inválida'),
    
    query('data_fim')
      .optional()
      .isISO8601()
      .withMessage('Data de fim inválida')
      .custom((value, { req }) => {
        if (value && req.query.data_inicio && new Date(value) < new Date(req.query.data_inicio)) {
          throw new Error('Data de fim deve ser posterior à data de início');
        }
        return true;
      }),
    
    handleValidationErrors
  ]
};

// Validação customizada para verificar se o documento existe
const validateExists = (model, field = '_id') => {
  return async (req, res, next) => {
    try {
      const value = req.params.id || req.body[field];
      
      if (!value) {
        return next();
      }
      
      const Model = mongoose.model(model);
      const document = await Model.findById(value);
      
      if (!document) {
        return res.status(404).json({
          success: false,
          message: `${model} não encontrado`
        });
      }
      
      req[model.toLowerCase()] = document;
      next();
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  };
};

// Validações para presença
const validateAttendance = {
  create: [
    body('aula_id')
      .isMongoId()
      .withMessage('ID da aula inválido'),
    
    body('aluno_id')
      .isMongoId()
      .withMessage('ID do aluno inválido'),
    
    body('presente')
      .isBoolean()
      .withMessage('Presente deve ser verdadeiro ou falso'),
    
    body('observacoes')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Observações devem ter no máximo 500 caracteres'),
    
    handleValidationErrors
  ],
  
  update: [
    body('presente')
      .optional()
      .isBoolean()
      .withMessage('Presente deve ser verdadeiro ou falso'),
    
    body('observacoes')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Observações devem ter no máximo 500 caracteres'),
    
    handleValidationErrors
  ]
};

// Validações para pagamentos
const validatePayment = {
  create: [
    body('mensalidade_id')
      .isMongoId()
      .withMessage('ID da mensalidade inválido'),
    
    body('metodo')
      .isIn(['dinheiro', 'cartao_credito', 'cartao_debito', 'pix', 'boleto', 'transferencia', 'mercado_pago', 'desconto', 'cortesia'])
      .withMessage('Método de pagamento inválido'),
    
    body('valor_pago')
      .isFloat({ min: 0 })
      .withMessage('Valor pago deve ser positivo'),
    
    body('valor_original')
      .isFloat({ min: 0 })
      .withMessage('Valor original deve ser positivo'),
    
    body('observacoes')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Observações devem ter no máximo 500 caracteres'),
    
    handleValidationErrors
  ],
  
  update: [
    body('metodo')
      .optional()
      .isIn(['dinheiro', 'cartao_credito', 'cartao_debito', 'pix', 'boleto', 'transferencia', 'mercado_pago', 'desconto', 'cortesia'])
      .withMessage('Método de pagamento inválido'),
    
    body('valor_pago')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Valor pago deve ser positivo'),
    
    body('observacoes')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Observações devem ter no máximo 500 caracteres'),
    
    handleValidationErrors
  ],
  
  payment: [
    body('valor_pago')
      .isFloat({ min: 0 })
      .withMessage('Valor pago deve ser positivo'),
    
    body('metodo')
      .isIn(['dinheiro', 'cartao_credito', 'cartao_debito', 'pix', 'boleto', 'transferencia', 'mercado_pago'])
      .withMessage('Método de pagamento inválido'),
    
    body('observacoes')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Observações devem ter no máximo 500 caracteres'),
    
    handleValidationErrors
  ]
};

// Validação para upload de arquivos
const validateFileUpload = (allowedTypes = [], maxSize = 5 * 1024 * 1024) => {
  return (req, res, next) => {
    if (!req.file && !req.files) {
      return next();
    }
    
    const files = req.files || [req.file];
    
    for (const file of files) {
      // Verificar tipo de arquivo
      if (allowedTypes.length > 0 && !allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({
          success: false,
          message: `Tipo de arquivo não permitido. Tipos aceitos: ${allowedTypes.join(', ')}`
        });
      }
      
      // Verificar tamanho
      if (file.size > maxSize) {
        return res.status(400).json({
          success: false,
          message: `Arquivo muito grande. Tamanho máximo: ${maxSize / (1024 * 1024)}MB`
        });
      }
    }
    
    next();
  };
};

module.exports = {
  handleValidationErrors,
  validateUser,
  validateStudent,
  validateClass,
  validateBooking,
  validateAttendance,
  validatePayment,
  validateProduct,
  validateOrder,
  validateMonthly,
  validateGraduation,
  validateParams,
  validateQuery,
  validateExists,
  validateFileUpload
};