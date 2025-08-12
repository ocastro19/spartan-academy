const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body } = require('express-validator');
const User = require('../models/User');
const Student = require('../models/Student');
const { handleValidationErrors } = require('../middleware/validation');
const { auth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Função para gerar token JWT
const generateToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// @route   POST /api/auth/register
// @desc    Registrar novo usuário
// @access  Public (mas pode ser restrito apenas para admins)
router.post('/register', [
  body('nome')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Nome deve ter entre 2 e 100 caracteres'),
  
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email inválido'),
  
  body('senha')
    .isLength({ min: 6 })
    .withMessage('Senha deve ter pelo menos 6 caracteres')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Senha deve conter pelo menos uma letra minúscula, uma maiúscula e um número'),
  
  body('perfil')
    .isIn(['admin', 'instrutor', 'aluno'])
    .withMessage('Perfil deve ser admin, instrutor ou aluno'),
  
  body('telefone')
    .optional()
    .matches(/^\(?\d{2}\)?[\s-]?\d{4,5}[\s-]?\d{4}$/)
    .withMessage('Telefone inválido'),
  
  handleValidationErrors
], async (req, res) => {
  try {
    const { nome, email, senha, perfil, telefone } = req.body;
    
    // Verificar se o usuário já existe
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Usuário já existe com este email'
      });
    }
    
    // Criar novo usuário
    const user = new User({
      nome,
      email,
      senha,
      perfil,
      telefone
    });
    
    await user.save();
    
    // Gerar token
    const token = generateToken(user._id);
    
    // Atualizar último login
    await user.atualizarUltimoLogin();
    
    res.status(201).json({
      success: true,
      message: 'Usuário criado com sucesso',
      data: {
        token,
        user: {
          id: user._id,
          nome: user.nome,
          email: user.email,
          perfil: user.perfil,
          telefone: user.telefone,
          ativo: user.ativo
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login do usuário
// @access  Public
router.post('/login', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email inválido'),
  
  body('senha')
    .notEmpty()
    .withMessage('Senha é obrigatória'),
  
  handleValidationErrors
], async (req, res) => {
  try {
    const { email, senha } = req.body;
    
    // Buscar usuário
    const user = await User.findOne({ email }).select('+senha');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Credenciais inválidas'
      });
    }
    
    // Verificar se o usuário está ativo
    if (!user.ativo) {
      return res.status(401).json({
        success: false,
        message: 'Usuário inativo. Entre em contato com o administrador.'
      });
    }
    
    // Verificar senha
    const isMatch = await user.compararSenha(senha);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Credenciais inválidas'
      });
    }
    
    // Gerar token
    const token = generateToken(user._id);
    
    // Atualizar último login
    await user.atualizarUltimoLogin();
    
    res.json({
      success: true,
      message: 'Login realizado com sucesso',
      data: {
        token,
        user: {
          id: user._id,
          nome: user.nome,
          email: user.email,
          perfil: user.perfil,
          telefone: user.telefone,
          ativo: user.ativo,
          ultimo_login: user.ultimo_login,
          configuracoes: user.configuracoes
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/auth/login-student
// @desc    Login do aluno (usando email do aluno)
// @access  Public
router.post('/login-student', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email inválido'),
  
  body('senha')
    .notEmpty()
    .withMessage('Senha é obrigatória'),
  
  handleValidationErrors
], async (req, res) => {
  try {
    const { email, senha } = req.body;
    
    // Buscar aluno pelo email
    const student = await Student.findOne({ email });
    if (!student) {
      return res.status(401).json({
        success: false,
        message: 'Credenciais inválidas'
      });
    }
    
    // Verificar se o aluno está ativo
    if (student.status !== 'ativo') {
      return res.status(401).json({
        success: false,
        message: 'Aluno inativo. Entre em contato com a academia.'
      });
    }
    
    // Buscar usuário correspondente
    const user = await User.findOne({ email }).select('+senha');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Acesso não configurado. Entre em contato com a academia.'
      });
    }
    
    // Verificar senha
    const isMatch = await user.compararSenha(senha);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Credenciais inválidas'
      });
    }
    
    // Gerar token
    const token = generateToken(user._id);
    
    // Atualizar último login
    await user.atualizarUltimoLogin();
    
    res.json({
      success: true,
      message: 'Login realizado com sucesso',
      data: {
        token,
        user: {
          id: user._id,
          nome: user.nome,
          email: user.email,
          perfil: user.perfil,
          telefone: user.telefone,
          ativo: user.ativo,
          ultimo_login: user.ultimo_login
        },
        student: {
          id: student._id,
          nome: student.nome,
          grupo: student.grupo,
          faixa_atual: student.faixa_atual,
          status: student.status
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/auth/me
// @desc    Obter dados do usuário logado
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    const user = req.user;
    
    // Se for aluno, buscar dados do aluno também
    let studentData = null;
    if (user.perfil === 'aluno') {
      studentData = await Student.findOne({ email: user.email });
    }
    
    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          nome: user.nome,
          email: user.email,
          perfil: user.perfil,
          telefone: user.telefone,
          ativo: user.ativo,
          ultimo_login: user.ultimo_login,
          configuracoes: user.configuracoes,
          avatar: user.avatar
        },
        student: studentData ? {
          id: studentData._id,
          nome: studentData.nome,
          grupo: studentData.grupo,
          faixa_atual: studentData.faixa_atual,
          status: studentData.status,
          idade: studentData.idade,
          faixa_completa: studentData.faixa_completa
        } : null
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/auth/change-password
// @desc    Alterar senha do usuário
// @access  Private
router.post('/change-password', auth, [
  body('senhaAtual')
    .notEmpty()
    .withMessage('Senha atual é obrigatória'),
  
  body('novaSenha')
    .isLength({ min: 6 })
    .withMessage('Nova senha deve ter pelo menos 6 caracteres')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Nova senha deve conter pelo menos uma letra minúscula, uma maiúscula e um número'),
  
  handleValidationErrors
], async (req, res) => {
  try {
    const { senhaAtual, novaSenha } = req.body;
    const user = await User.findById(req.user._id).select('+senha');
    
    // Verificar senha atual
    const isMatch = await user.compararSenha(senhaAtual);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Senha atual incorreta'
      });
    }
    
    // Verificar se a nova senha é diferente da atual
    const isSamePassword = await user.compararSenha(novaSenha);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: 'A nova senha deve ser diferente da senha atual'
      });
    }
    
    // Atualizar senha
    user.senha = novaSenha;
    await user.save();
    
    res.json({
      success: true,
      message: 'Senha alterada com sucesso'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Solicitar recuperação de senha
// @access  Public
router.post('/forgot-password', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email inválido'),
  
  handleValidationErrors
], async (req, res) => {
  try {
    const { email } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      // Por segurança, sempre retorna sucesso mesmo se o usuário não existir
      return res.json({
        success: true,
        message: 'Se o email existir em nossa base, você receberá instruções para recuperação'
      });
    }
    
    // Gerar token de recuperação
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    
    // Salvar token no usuário (expires em 1 hora)
    user.resetPasswordToken = resetTokenHash;
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hora
    await user.save({ validateBeforeSave: false });
    
    // Aqui você enviaria o email com o link de recuperação
    // const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    
    // Por enquanto, apenas log (em produção, implementar envio de email)
    console.log(`Token de recuperação para ${email}: ${resetToken}`);
    
    res.json({
      success: true,
      message: 'Se o email existir em nossa base, você receberá instruções para recuperação',
      // Em desenvolvimento, retornar o token
      ...(process.env.NODE_ENV === 'development' && { resetToken })
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/auth/reset-password/:token
// @desc    Resetar senha com token
// @access  Public
router.post('/reset-password/:token', [
  body('novaSenha')
    .isLength({ min: 6 })
    .withMessage('Nova senha deve ter pelo menos 6 caracteres')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Nova senha deve conter pelo menos uma letra minúscula, uma maiúscula e um número'),
  
  handleValidationErrors
], async (req, res) => {
  try {
    const { token } = req.params;
    const { novaSenha } = req.body;
    
    // Hash do token recebido
    const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');
    
    // Buscar usuário com token válido e não expirado
    const user = await User.findOne({
      resetPasswordToken: resetTokenHash,
      resetPasswordExpires: { $gt: Date.now() }
    });
    
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Token inválido ou expirado'
      });
    }
    
    // Atualizar senha
    user.senha = novaSenha;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    
    res.json({
      success: true,
      message: 'Senha alterada com sucesso'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout do usuário (invalidar token)
// @access  Private
router.post('/logout', auth, async (req, res) => {
  try {
    // Em uma implementação mais robusta, você poderia:
    // 1. Manter uma blacklist de tokens
    // 2. Usar refresh tokens
    // 3. Armazenar tokens no Redis com TTL
    
    res.json({
      success: true,
      message: 'Logout realizado com sucesso'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/auth/refresh
// @desc    Renovar token JWT
// @access  Private
router.post('/refresh', auth, async (req, res) => {
  try {
    const user = req.user;
    
    // Gerar novo token
    const token = generateToken(user._id);
    
    res.json({
      success: true,
      message: 'Token renovado com sucesso',
      data: {
        token
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/auth/verify-token
// @desc    Verificar se o token é válido
// @access  Public
router.get('/verify-token', optionalAuth, (req, res) => {
  res.json({
    success: true,
    valid: !!req.user,
    user: req.user ? {
      id: req.user._id,
      nome: req.user.nome,
      email: req.user.email,
      perfil: req.user.perfil
    } : null
  });
});

module.exports = router;