const express = require('express');
const Graduation = require('../models/Graduation');
const Student = require('../models/Student');
const { auth, adminOnly, adminOrInstructor } = require('../middleware/auth');
const { validateGraduation, validateParams, validateQuery } = require('../middleware/validation');

const router = express.Router();

// @route   GET /api/graduations
// @desc    Listar graduações
// @access  Private (Admin/Instructor)
router.get('/', [auth, adminOrInstructor, ...validateQuery.pagination], async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      aluno_id,
      faixa,
      grau,
      responsavel,
      validada,
      data_inicio,
      data_fim,
      grupo
    } = req.query;
    
    const query = {};
    
    // Filtros
    if (aluno_id) query.aluno_id = aluno_id;
    if (faixa) query.faixa = faixa;
    if (grau) query.grau = parseInt(grau);
    if (responsavel) query.responsavel = responsavel;
    if (validada !== undefined) query.validada = validada === 'true';
    if (grupo) query.grupo = grupo;
    
    // Filtro de data
    if (data_inicio || data_fim) {
      query.data = {};
      if (data_inicio) query.data.$gte = new Date(data_inicio);
      if (data_fim) query.data.$lte = new Date(data_fim);
    }
    
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { data: -1 },
      populate: [
        {
          path: 'aluno_id',
          select: 'nome grupo faixa_atual email telefone'
        },
        {
          path: 'responsavel',
          select: 'nome email'
        }
      ]
    };
    
    const graduations = await Graduation.paginate(query, options);
    
    res.json({
      success: true,
      data: graduations
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/graduations/my
// @desc    Minhas graduações (aluno)
// @access  Private (Student)
router.get('/my', [auth, ...validateQuery.pagination], async (req, res) => {
  try {
    if (req.user.perfil !== 'aluno') {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado'
      });
    }
    
    const student = await Student.findOne({ user_id: req.user._id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Dados do aluno não encontrados'
      });
    }
    
    const {
      page = 1,
      limit = 20
    } = req.query;
    
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { data: -1 },
      populate: [
        {
          path: 'responsavel',
          select: 'nome email'
        }
      ]
    };
    
    const graduations = await Graduation.paginate(
      { aluno_id: student._id },
      options
    );
    
    res.json({
      success: true,
      data: graduations
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/graduations/eligibility
// @desc    Relatório de elegibilidade para graduação
// @access  Private (Admin/Instructor)
router.get('/eligibility', [auth, adminOrInstructor], async (req, res) => {
  try {
    const { grupo, faixa_atual } = req.query;
    
    const query = {
      status: 'ativo'
    };
    
    if (grupo) query.grupo = grupo;
    if (faixa_atual) query.faixa_atual = faixa_atual;
    
    const students = await Student.find(query)
      .select('nome grupo faixa_atual grau_atual data_ultima_graduacao estatisticas')
      .sort({ nome: 1 });
    
    const eligibilityReport = [];
    
    for (const student of students) {
      try {
        const eligibility = await Graduation.relatorioElegibilidade(student._id);
        
        eligibilityReport.push({
          aluno: {
            id: student._id,
            nome: student.nome,
            grupo: student.grupo,
            faixa_atual: student.faixa_atual,
            grau_atual: student.grau_atual,
            data_ultima_graduacao: student.data_ultima_graduacao
          },
          elegibilidade: eligibility
        });
      } catch (error) {
        eligibilityReport.push({
          aluno: {
            id: student._id,
            nome: student.nome,
            grupo: student.grupo,
            faixa_atual: student.faixa_atual,
            grau_atual: student.grau_atual
          },
          elegibilidade: {
            elegivel: false,
            motivos: ['Erro ao verificar elegibilidade']
          }
        });
      }
    }
    
    // Separar elegíveis e não elegíveis
    const eligible = eligibilityReport.filter(r => r.elegibilidade.elegivel);
    const notEligible = eligibilityReport.filter(r => !r.elegibilidade.elegivel);
    
    res.json({
      success: true,
      data: {
        resumo: {
          total_alunos: eligibilityReport.length,
          elegiveis: eligible.length,
          nao_elegiveis: notEligible.length
        },
        elegiveis: eligible,
        nao_elegiveis: notEligible
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

// @route   GET /api/graduations/stats
// @desc    Estatísticas de graduações
// @access  Private (Admin/Instructor)
router.get('/stats', [auth, adminOrInstructor], async (req, res) => {
  try {
    const { periodo = 365, grupo } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(periodo));
    
    const matchQuery = {
      data: { $gte: startDate }
    };
    
    if (grupo) matchQuery.grupo = grupo;
    
    const stats = await Graduation.estatisticasGraduacoes(matchQuery);
    
    // Graduações por mês
    const monthlyStats = await Graduation.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: {
            ano: { $year: '$data' },
            mes: { $month: '$data' }
          },
          total: { $sum: 1 },
          validadas: {
            $sum: { $cond: [{ $eq: ['$validada', true] }, 1, 0] }
          }
        }
      },
      {
        $sort: { '_id.ano': 1, '_id.mes': 1 }
      }
    ]);
    
    // Graduações por faixa
    const beltStats = await Graduation.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$faixa',
          total: { $sum: 1 },
          validadas: {
            $sum: { $cond: [{ $eq: ['$validada', true] }, 1, 0] }
          }
        }
      },
      {
        $sort: { total: -1 }
      }
    ]);
    
    // Top instrutores responsáveis
    const instructorStats = await Graduation.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$responsavel',
          total_graduacoes: { $sum: 1 },
          validadas: {
            $sum: { $cond: [{ $eq: ['$validada', true] }, 1, 0] }
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'instrutor_info'
        }
      },
      {
        $unwind: '$instrutor_info'
      },
      {
        $project: {
          nome: '$instrutor_info.nome',
          total_graduacoes: 1,
          validadas: 1,
          taxa_validacao: {
            $cond: [
              { $gt: ['$total_graduacoes', 0] },
              { $multiply: [{ $divide: ['$validadas', '$total_graduacoes'] }, 100] },
              0
            ]
          }
        }
      },
      {
        $sort: { total_graduacoes: -1 }
      }
    ]);
    
    res.json({
      success: true,
      data: {
        periodo: {
          inicio: startDate,
          fim: new Date(),
          dias: parseInt(periodo)
        },
        geral: stats,
        por_mes: monthlyStats,
        por_faixa: beltStats,
        por_instrutor: instructorStats
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

// @route   GET /api/graduations/:id
// @desc    Obter graduação por ID
// @access  Private
router.get('/:id', [auth, ...validateParams.mongoId], async (req, res) => {
  try {
    const graduation = await Graduation.findById(req.params.id)
      .populate('aluno_id', 'nome grupo faixa_atual email telefone')
      .populate('responsavel', 'nome email telefone');
    
    if (!graduation) {
      return res.status(404).json({
        success: false,
        message: 'Graduação não encontrada'
      });
    }
    
    // Verificar permissão
    if (req.user.perfil === 'aluno') {
      const student = await Student.findOne({ user_id: req.user._id });
      if (!student || !graduation.aluno_id._id.equals(student._id)) {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado'
        });
      }
    }
    
    res.json({
      success: true,
      data: graduation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/graduations
// @desc    Criar graduação
// @access  Private (Admin/Instructor)
router.post('/', [auth, adminOrInstructor, ...validateGraduation.create], async (req, res) => {
  try {
    // Verificar se o aluno existe
    const student = await Student.findById(req.body.aluno_id);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Aluno não encontrado'
      });
    }
    
    if (student.status !== 'ativo') {
      return res.status(400).json({
        success: false,
        message: 'Aluno não está ativo'
      });
    }
    
    // Verificar elegibilidade
    const eligibility = await Graduation.relatorioElegibilidade(student._id);
    if (!eligibility.elegivel && req.body.forcar_graduacao !== true) {
      return res.status(400).json({
        success: false,
        message: 'Aluno não é elegível para graduação',
        motivos: eligibility.motivos,
        detalhes: eligibility
      });
    }
    
    // Calcular próxima faixa se não fornecida
    let { faixa, grau } = req.body;
    if (!faixa || !grau) {
      const proximaFaixa = Graduation.calcularProximaFaixa(
        student.faixa_atual,
        student.grau_atual,
        student.grupo
      );
      
      if (!proximaFaixa) {
        return res.status(400).json({
          success: false,
          message: 'Não foi possível calcular a próxima faixa'
        });
      }
      
      faixa = faixa || proximaFaixa.faixa;
      grau = grau || proximaFaixa.grau;
    }
    
    const graduationData = {
      ...req.body,
      faixa,
      grau,
      grupo: student.grupo,
      responsavel: req.user._id,
      data: req.body.data || new Date()
    };
    
    const graduation = await Graduation.criarGraduacao(graduationData);
    
    await graduation.populate([
      { path: 'aluno_id', select: 'nome grupo faixa_atual' },
      { path: 'responsavel', select: 'nome email' }
    ]);
    
    res.status(201).json({
      success: true,
      message: 'Graduação criada com sucesso',
      data: graduation
    });
  } catch (error) {
    if (error.message.includes('progressão de faixa inválida') || 
        error.message.includes('já possui graduação')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   PUT /api/graduations/:id
// @desc    Atualizar graduação
// @access  Private (Admin/Instructor)
router.put('/:id', [auth, adminOrInstructor, ...validateParams.mongoId, ...validateGraduation.update], async (req, res) => {
  try {
    const graduation = await Graduation.findById(req.params.id);
    if (!graduation) {
      return res.status(404).json({
        success: false,
        message: 'Graduação não encontrada'
      });
    }
    
    // Não permitir alterar graduações validadas
    if (graduation.validada && req.user.perfil !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Apenas administradores podem alterar graduações validadas'
      });
    }
    
    const updatedGraduation = await Graduation.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate([
      { path: 'aluno_id', select: 'nome grupo faixa_atual' },
      { path: 'responsavel', select: 'nome email' }
    ]);
    
    res.json({
      success: true,
      message: 'Graduação atualizada com sucesso',
      data: updatedGraduation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   PUT /api/graduations/:id/validate
// @desc    Validar graduação
// @access  Private (Admin only)
router.put('/:id/validate', [auth, adminOnly, ...validateParams.mongoId], async (req, res) => {
  try {
    const graduation = await Graduation.findById(req.params.id);
    if (!graduation) {
      return res.status(404).json({
        success: false,
        message: 'Graduação não encontrada'
      });
    }
    
    if (graduation.validada) {
      return res.status(400).json({
        success: false,
        message: 'Graduação já está validada'
      });
    }
    
    graduation.validada = true;
    graduation.validada_em = new Date();
    graduation.validada_por = req.user._id;
    
    await graduation.save();
    
    res.json({
      success: true,
      message: 'Graduação validada com sucesso',
      data: {
        id: graduation._id,
        validada: graduation.validada,
        validada_em: graduation.validada_em
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

// @route   PUT /api/graduations/:id/invalidate
// @desc    Invalidar graduação
// @access  Private (Admin only)
router.put('/:id/invalidate', [auth, adminOnly, ...validateParams.mongoId], async (req, res) => {
  try {
    const { motivo } = req.body;
    
    if (!motivo) {
      return res.status(400).json({
        success: false,
        message: 'Motivo da invalidação é obrigatório'
      });
    }
    
    const graduation = await Graduation.findById(req.params.id);
    if (!graduation) {
      return res.status(404).json({
        success: false,
        message: 'Graduação não encontrada'
      });
    }
    
    if (!graduation.validada) {
      return res.status(400).json({
        success: false,
        message: 'Graduação não está validada'
      });
    }
    
    graduation.validada = false;
    graduation.invalidada_em = new Date();
    graduation.invalidada_por = req.user._id;
    graduation.motivo_invalidacao = motivo;
    
    await graduation.save();
    
    res.json({
      success: true,
      message: 'Graduação invalidada com sucesso',
      data: {
        id: graduation._id,
        validada: graduation.validada,
        invalidada_em: graduation.invalidada_em,
        motivo_invalidacao: graduation.motivo_invalidacao
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

// @route   POST /api/graduations/:id/generate-certificate
// @desc    Gerar certificado
// @access  Private (Admin/Instructor)
router.post('/:id/generate-certificate', [auth, adminOrInstructor, ...validateParams.mongoId], async (req, res) => {
  try {
    const graduation = await Graduation.findById(req.params.id)
      .populate('aluno_id', 'nome grupo')
      .populate('responsavel', 'nome');
    
    if (!graduation) {
      return res.status(404).json({
        success: false,
        message: 'Graduação não encontrada'
      });
    }
    
    if (!graduation.validada) {
      return res.status(400).json({
        success: false,
        message: 'Apenas graduações validadas podem gerar certificado'
      });
    }
    
    if (graduation.certificado.gerado) {
      return res.status(400).json({
        success: false,
        message: 'Certificado já foi gerado',
        certificado: graduation.certificado
      });
    }
    
    const certificate = await graduation.gerarCertificado();
    
    res.json({
      success: true,
      message: 'Certificado gerado com sucesso',
      data: {
        id: graduation._id,
        certificado: certificate
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

// @route   GET /api/graduations/:id/certificate
// @desc    Baixar certificado
// @access  Private
router.get('/:id/certificate', [auth, ...validateParams.mongoId], async (req, res) => {
  try {
    const graduation = await Graduation.findById(req.params.id)
      .populate('aluno_id', 'nome');
    
    if (!graduation) {
      return res.status(404).json({
        success: false,
        message: 'Graduação não encontrada'
      });
    }
    
    // Verificar permissão
    if (req.user.perfil === 'aluno') {
      const student = await Student.findOne({ user_id: req.user._id });
      if (!student || !graduation.aluno_id._id.equals(student._id)) {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado'
        });
      }
    }
    
    if (!graduation.certificado.gerado) {
      return res.status(404).json({
        success: false,
        message: 'Certificado não foi gerado'
      });
    }
    
    // Aqui você implementaria a lógica para servir o arquivo do certificado
    // Por exemplo, se estiver armazenado no sistema de arquivos ou cloud storage
    
    res.json({
      success: true,
      data: {
        certificado: graduation.certificado,
        download_url: `/certificates/${graduation.certificado.arquivo}`
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

// @route   DELETE /api/graduations/:id
// @desc    Deletar graduação
// @access  Private (Admin only)
router.delete('/:id', [auth, adminOnly, ...validateParams.mongoId], async (req, res) => {
  try {
    const graduation = await Graduation.findById(req.params.id);
    if (!graduation) {
      return res.status(404).json({
        success: false,
        message: 'Graduação não encontrada'
      });
    }
    
    // Não permitir deletar graduações validadas
    if (graduation.validada) {
      return res.status(400).json({
        success: false,
        message: 'Não é possível deletar graduação validada. Considere invalidá-la primeiro.'
      });
    }
    
    await Graduation.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'Graduação deletada com sucesso'
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