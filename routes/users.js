const express = require('express');
const User = require('../models/User');
const Student = require('../models/Student');
const { auth, adminOnly, ownerOrAdmin } = require('../middleware/auth');
const { validateUser, validateParams, validateQuery } = require('../middleware/validation');
const multer = require('multer');
const path = require('path');

const router = express.Router();

// Configuração do multer para upload de avatar
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/avatars/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido. Use JPEG, PNG ou GIF.'));
    }
  }
});

// @route   GET /api/users
// @desc    Listar usuários
// @access  Private (Admin only)
router.get('/', [auth, adminOnly, ...validateQuery.pagination], async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      perfil,
      ativo,
      search
    } = req.query;
    
    const query = {};
    
    // Filtros
    if (perfil) query.perfil = perfil;
    if (ativo !== undefined) query.ativo = ativo === 'true';
    
    // Busca textual
    if (search) {
      query.$or = [
        { nome: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { telefone: { $regex: search, $options: 'i' } }
      ];
    }
    
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
      select: '-senha'
    };
    
    const users = await User.paginate(query, options);
    
    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/users/instructors
// @desc    Listar instrutores
// @access  Private
router.get('/instructors', auth, async (req, res) => {
  try {
    const instructors = await User.find({
      perfil: 'instrutor',
      ativo: true
    })
    .select('nome email telefone')
    .sort({ nome: 1 });
    
    res.json({
      success: true,
      data: instructors
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/users/stats
// @desc    Estatísticas de usuários
// @access  Private (Admin only)
router.get('/stats', [auth, adminOnly], async (req, res) => {
  try {
    const stats = await User.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          ativos: {
            $sum: {
              $cond: [{ $eq: ['$ativo', true] }, 1, 0]
            }
          },
          inativos: {
            $sum: {
              $cond: [{ $eq: ['$ativo', false] }, 1, 0]
            }
          },
          admins: {
            $sum: {
              $cond: [{ $eq: ['$perfil', 'admin'] }, 1, 0]
            }
          },
          instrutores: {
            $sum: {
              $cond: [{ $eq: ['$perfil', 'instrutor'] }, 1, 0]
            }
          },
          alunos: {
            $sum: {
              $cond: [{ $eq: ['$perfil', 'aluno'] }, 1, 0]
            }
          }
        }
      }
    ]);
    
    // Usuários criados nos últimos 30 dias
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentUsers = await User.countDocuments({
      createdAt: { $gte: thirtyDaysAgo }
    });
    
    // Últimos logins
    const activeUsers = await User.countDocuments({
      ultimo_login: { $gte: thirtyDaysAgo },
      ativo: true
    });
    
    res.json({
      success: true,
      data: {
        ...stats[0],
        usuarios_recentes: recentUsers,
        usuarios_ativos_mes: activeUsers
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

// @route   GET /api/users/:id
// @desc    Obter usuário por ID
// @access  Private (Owner or Admin)
router.get('/:id', [auth, ownerOrAdmin, ...validateParams.mongoId], async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-senha');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }
    
    // Se for aluno, buscar dados do aluno também
    let studentData = null;
    if (user.perfil === 'aluno') {
      studentData = await Student.findOne({ email: user.email });
    }
    
    res.json({
      success: true,
      data: {
        user,
        student: studentData
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

// @route   POST /api/users
// @desc    Criar novo usuário
// @access  Private (Admin only)
router.post('/', [auth, adminOnly, ...validateUser.create], async (req, res) => {
  try {
    const { nome, email, telefone, perfil, senha } = req.body;
    
    // Verificar se o usuário já existe
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Usuário já existe com este email'
      });
    }
    
    // Criar usuário
    const user = new User({
      nome,
      email,
      telefone,
      perfil,
      senha
    });
    
    await user.save();
    
    res.status(201).json({
      success: true,
      message: 'Usuário criado com sucesso',
      data: {
        id: user._id,
        nome: user.nome,
        email: user.email,
        telefone: user.telefone,
        perfil: user.perfil,
        ativo: user.ativo
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

// @route   PUT /api/users/:id
// @desc    Atualizar usuário
// @access  Private (Owner or Admin)
router.put('/:id', [auth, ownerOrAdmin, ...validateParams.mongoId, ...validateUser.update], async (req, res) => {
  try {
    const { nome, email, telefone, perfil, ativo } = req.body;
    
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }
    
    // Verificar se o email já existe (se foi alterado)
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email já está em uso por outro usuário'
        });
      }
    }
    
    // Apenas admin pode alterar perfil e status ativo
    const updateData = { nome, email, telefone };
    if (req.user.perfil === 'admin') {
      if (perfil) updateData.perfil = perfil;
      if (ativo !== undefined) updateData.ativo = ativo;
    }
    
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-senha');
    
    res.json({
      success: true,
      message: 'Usuário atualizado com sucesso',
      data: updatedUser
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   PUT /api/users/:id/avatar
// @desc    Upload de avatar do usuário
// @access  Private (Owner or Admin)
router.put('/:id/avatar', [auth, ownerOrAdmin, ...validateParams.mongoId], upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Nenhum arquivo enviado'
      });
    }
    
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }
    
    // Atualizar avatar
    user.avatar = `/uploads/avatars/${req.file.filename}`;
    await user.save();
    
    res.json({
      success: true,
      message: 'Avatar atualizado com sucesso',
      data: {
        avatar: user.avatar
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

// @route   PUT /api/users/:id/settings
// @desc    Atualizar configurações do usuário
// @access  Private (Owner or Admin)
router.put('/:id/settings', [auth, ownerOrAdmin, ...validateParams.mongoId], async (req, res) => {
  try {
    const { notificacoes, tema, idioma } = req.body;
    
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }
    
    // Atualizar configurações
    if (notificacoes !== undefined) {
      user.configuracoes.notificacoes = {
        ...user.configuracoes.notificacoes,
        ...notificacoes
      };
    }
    
    if (tema) user.configuracoes.tema = tema;
    if (idioma) user.configuracoes.idioma = idioma;
    
    await user.save();
    
    res.json({
      success: true,
      message: 'Configurações atualizadas com sucesso',
      data: {
        configuracoes: user.configuracoes
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

// @route   PUT /api/users/:id/toggle-status
// @desc    Ativar/desativar usuário
// @access  Private (Admin only)
router.put('/:id/toggle-status', [auth, adminOnly, ...validateParams.mongoId], async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }
    
    // Não permitir desativar o próprio usuário
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Você não pode desativar sua própria conta'
      });
    }
    
    user.ativo = !user.ativo;
    await user.save();
    
    res.json({
      success: true,
      message: `Usuário ${user.ativo ? 'ativado' : 'desativado'} com sucesso`,
      data: {
        id: user._id,
        nome: user.nome,
        ativo: user.ativo
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

// @route   DELETE /api/users/:id
// @desc    Deletar usuário
// @access  Private (Admin only)
router.delete('/:id', [auth, adminOnly, ...validateParams.mongoId], async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }
    
    // Não permitir deletar o próprio usuário
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Você não pode deletar sua própria conta'
      });
    }
    
    // Verificar se o usuário tem dependências
    // (turmas como instrutor, etc.)
    
    await User.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'Usuário deletado com sucesso'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/users/:id/activity
// @desc    Obter atividades do usuário
// @access  Private (Owner or Admin)
router.get('/:id/activity', [auth, ownerOrAdmin, ...validateParams.mongoId], async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    // Aqui você implementaria um sistema de logs de atividade
    // Por enquanto, retornamos dados básicos
    
    const user = await User.findById(req.params.id).select('ultimo_login createdAt');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }
    
    res.json({
      success: true,
      data: {
        ultimo_login: user.ultimo_login,
        data_criacao: user.createdAt,
        // Aqui viriam os logs de atividade
        atividades: []
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

module.exports = router;