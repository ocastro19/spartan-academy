const express = require('express');
const Payment = require('../models/Payment');
const Student = require('../models/Student');
const { auth, adminOnly, adminOrInstructor, ownerOrAdmin } = require('../middleware/auth');
const { validatePayment, validateParams, validateQuery } = require('../middleware/validation');

const router = express.Router();

// @route   GET /api/payments
// @desc    Listar mensalidades
// @access  Private (Admin/Instructor)
router.get('/', [auth, adminOrInstructor, ...validateQuery.pagination], async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      aluno_id,
      status,
      mes,
      ano,
      vencimento_inicio,
      vencimento_fim,
      valor_min,
      valor_max,
      busca
    } = req.query;
    
    const query = {};
    
    // Filtros
    if (aluno_id) query.aluno_id = aluno_id;
    if (status) query.status = status;
    if (mes) query.mes = parseInt(mes);
    if (ano) query.ano = parseInt(ano);
    
    // Filtro de vencimento
    if (vencimento_inicio || vencimento_fim) {
      query.data_vencimento = {};
      if (vencimento_inicio) query.data_vencimento.$gte = new Date(vencimento_inicio);
      if (vencimento_fim) query.data_vencimento.$lte = new Date(vencimento_fim);
    }
    
    // Filtro de valor
    if (valor_min || valor_max) {
      query.valor = {};
      if (valor_min) query.valor.$gte = parseFloat(valor_min);
      if (valor_max) query.valor.$lte = parseFloat(valor_max);
    }
    
    // Busca textual
    if (busca) {
      const students = await Student.find({
        $or: [
          { nome: { $regex: busca, $options: 'i' } },
          { email: { $regex: busca, $options: 'i' } }
        ]
      }).select('_id');
      
      const studentIds = students.map(s => s._id);
      
      query.$or = [
        { aluno_id: { $in: studentIds } },
        { observacoes: { $regex: busca, $options: 'i' } }
      ];
    }
    
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { data_vencimento: -1 },
      populate: [
        {
          path: 'aluno_id',
          select: 'nome email telefone grupo status'
        }
      ]
    };
    
    const payments = await Payment.paginate(query, options);
    
    res.json({
      success: true,
      data: payments
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/payments/my
// @desc    Minhas mensalidades (aluno)
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
      limit = 20,
      status,
      ano
    } = req.query;
    
    const query = { aluno_id: student._id };
    if (status) query.status = status;
    if (ano) query.ano = parseInt(ano);
    
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { data_vencimento: -1 }
    };
    
    const payments = await Payment.paginate(query, options);
    
    // Calcular estatísticas do aluno
    const stats = await Payment.aggregate([
      { $match: { aluno_id: student._id } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          pagas: {
            $sum: { $cond: [{ $eq: ['$status', 'pago'] }, 1, 0] }
          },
          pendentes: {
            $sum: { $cond: [{ $eq: ['$status', 'pendente'] }, 1, 0] }
          },
          vencidas: {
            $sum: { $cond: [{ $eq: ['$status', 'vencido'] }, 1, 0] }
          },
          valor_total_pago: {
            $sum: { $cond: [{ $eq: ['$status', 'pago'] }, '$valor_pago', 0] }
          },
          valor_pendente: {
            $sum: { $cond: [{ $ne: ['$status', 'pago'] }, '$valor', 0] }
          }
        }
      }
    ]);
    
    res.json({
      success: true,
      data: {
        ...payments,
        estatisticas: stats[0] || {
          total: 0,
          pagas: 0,
          pendentes: 0,
          vencidas: 0,
          valor_total_pago: 0,
          valor_pendente: 0
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

// @route   GET /api/payments/overdue
// @desc    Mensalidades vencidas
// @access  Private (Admin/Instructor)
router.get('/overdue', [auth, adminOrInstructor, ...validateQuery.pagination], async (req, res) => {
  try {
    const { page = 1, limit = 20, dias_vencimento } = req.query;
    
    const hoje = new Date();
    let dataLimite = hoje;
    
    if (dias_vencimento) {
      dataLimite = new Date();
      dataLimite.setDate(dataLimite.getDate() - parseInt(dias_vencimento));
    }
    
    const query = {
      status: { $in: ['pendente', 'vencido'] },
      data_vencimento: { $lt: hoje }
    };
    
    if (dias_vencimento) {
      query.data_vencimento.$gte = dataLimite;
    }
    
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { data_vencimento: 1 },
      populate: [
        {
          path: 'aluno_id',
          select: 'nome email telefone grupo status'
        }
      ]
    };
    
    const overduePayments = await Payment.paginate(query, options);
    
    // Calcular estatísticas de inadimplência
    const overdueStats = await Payment.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          total_vencidas: { $sum: 1 },
          valor_total_vencido: { $sum: '$valor' },
          alunos_inadimplentes: { $addToSet: '$aluno_id' }
        }
      }
    ]);
    
    res.json({
      success: true,
      data: {
        ...overduePayments,
        estatisticas: {
          total_vencidas: overdueStats[0]?.total_vencidas || 0,
          valor_total_vencido: overdueStats[0]?.valor_total_vencido || 0,
          alunos_inadimplentes: overdueStats[0]?.alunos_inadimplentes?.length || 0
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

// @route   GET /api/payments/stats
// @desc    Estatísticas de mensalidades
// @access  Private (Admin/Instructor)
router.get('/stats', [auth, adminOrInstructor], async (req, res) => {
  try {
    const { periodo = 12, ano } = req.query;
    
    let matchQuery = {};
    
    if (ano) {
      matchQuery.ano = parseInt(ano);
    } else {
      const currentDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - parseInt(periodo));
      
      matchQuery.data_vencimento = {
        $gte: startDate,
        $lte: currentDate
      };
    }
    
    // Estatísticas gerais
    const generalStats = await Payment.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          total_mensalidades: { $sum: 1 },
          valor_total: { $sum: '$valor' },
          valor_recebido: {
            $sum: { $cond: [{ $eq: ['$status', 'pago'] }, '$valor_pago', 0] }
          },
          pagas: {
            $sum: { $cond: [{ $eq: ['$status', 'pago'] }, 1, 0] }
          },
          pendentes: {
            $sum: { $cond: [{ $eq: ['$status', 'pendente'] }, 1, 0] }
          },
          vencidas: {
            $sum: { $cond: [{ $eq: ['$status', 'vencido'] }, 1, 0] }
          },
          canceladas: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelado'] }, 1, 0] }
          }
        }
      }
    ]);
    
    // Receita por mês
    const monthlyRevenue = await Payment.aggregate([
      { $match: { ...matchQuery, status: 'pago' } },
      {
        $group: {
          _id: {
            ano: '$ano',
            mes: '$mes'
          },
          total_recebido: { $sum: '$valor_pago' },
          quantidade: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.ano': 1, '_id.mes': 1 }
      }
    ]);
    
    // Taxa de inadimplência por mês
    const defaultRateByMonth = await Payment.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: {
            ano: '$ano',
            mes: '$mes'
          },
          total: { $sum: 1 },
          vencidas: {
            $sum: { $cond: [{ $eq: ['$status', 'vencido'] }, 1, 0] }
          }
        }
      },
      {
        $project: {
          _id: 1,
          total: 1,
          vencidas: 1,
          taxa_inadimplencia: {
            $cond: [
              { $gt: ['$total', 0] },
              { $multiply: [{ $divide: ['$vencidas', '$total'] }, 100] },
              0
            ]
          }
        }
      },
      {
        $sort: { '_id.ano': 1, '_id.mes': 1 }
      }
    ]);
    
    // Alunos com mais mensalidades em atraso
    const defaultingStudents = await Payment.aggregate([
      {
        $match: {
          status: 'vencido',
          data_vencimento: { $lt: new Date() }
        }
      },
      {
        $group: {
          _id: '$aluno_id',
          mensalidades_vencidas: { $sum: 1 },
          valor_total_vencido: { $sum: '$valor' },
          mais_antiga: { $min: '$data_vencimento' }
        }
      },
      {
        $lookup: {
          from: 'students',
          localField: '_id',
          foreignField: '_id',
          as: 'aluno_info'
        }
      },
      {
        $unwind: '$aluno_info'
      },
      {
        $project: {
          nome: '$aluno_info.nome',
          email: '$aluno_info.email',
          grupo: '$aluno_info.grupo',
          mensalidades_vencidas: 1,
          valor_total_vencido: 1,
          mais_antiga: 1,
          dias_em_atraso: {
            $divide: [
              { $subtract: [new Date(), '$mais_antiga'] },
              1000 * 60 * 60 * 24
            ]
          }
        }
      },
      {
        $sort: { mensalidades_vencidas: -1, valor_total_vencido: -1 }
      },
      { $limit: 20 }
    ]);
    
    // Formas de pagamento mais utilizadas
    const paymentMethods = await Payment.aggregate([
      { $match: { ...matchQuery, status: 'pago' } },
      {
        $group: {
          _id: '$forma_pagamento',
          quantidade: { $sum: 1 },
          valor_total: { $sum: '$valor_pago' }
        }
      },
      {
        $sort: { quantidade: -1 }
      }
    ]);
    
    const stats = generalStats[0] || {
      total_mensalidades: 0,
      valor_total: 0,
      valor_recebido: 0,
      pagas: 0,
      pendentes: 0,
      vencidas: 0,
      canceladas: 0
    };
    
    // Calcular taxas
    stats.taxa_pagamento = stats.total_mensalidades > 0 
      ? (stats.pagas / stats.total_mensalidades) * 100 
      : 0;
    stats.taxa_inadimplencia = stats.total_mensalidades > 0 
      ? (stats.vencidas / stats.total_mensalidades) * 100 
      : 0;
    stats.ticket_medio = stats.pagas > 0 
      ? stats.valor_recebido / stats.pagas 
      : 0;
    
    res.json({
      success: true,
      data: {
        periodo: ano ? { ano: parseInt(ano) } : { meses: parseInt(periodo) },
        geral: stats,
        receita_mensal: monthlyRevenue,
        inadimplencia_mensal: defaultRateByMonth,
        alunos_inadimplentes: defaultingStudents,
        formas_pagamento: paymentMethods
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

// @route   GET /api/payments/:id
// @desc    Obter mensalidade por ID
// @access  Private
router.get('/:id', [auth, ...validateParams.mongoId], async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('aluno_id', 'nome email telefone grupo status');
    
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Mensalidade não encontrada'
      });
    }
    
    // Verificar permissão
    if (req.user.perfil === 'aluno') {
      const student = await Student.findOne({ user_id: req.user._id });
      if (!student || !payment.aluno_id._id.equals(student._id)) {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado'
        });
      }
    }
    
    res.json({
      success: true,
      data: payment
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/payments
// @desc    Criar mensalidade
// @access  Private (Admin only)
router.post('/', [auth, adminOnly, ...validatePayment.create], async (req, res) => {
  try {
    // Verificar se o aluno existe
    const student = await Student.findById(req.body.aluno_id);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Aluno não encontrado'
      });
    }
    
    // Verificar se já existe mensalidade para o mesmo mês/ano
    const existingPayment = await Payment.findOne({
      aluno_id: req.body.aluno_id,
      mes: req.body.mes,
      ano: req.body.ano
    });
    
    if (existingPayment) {
      return res.status(400).json({
        success: false,
        message: 'Já existe mensalidade para este aluno no mês/ano informado'
      });
    }
    
    const payment = new Payment({
      ...req.body,
      criado_por: req.user._id
    });
    
    await payment.save();
    
    await payment.populate('aluno_id', 'nome email telefone grupo');
    
    res.status(201).json({
      success: true,
      message: 'Mensalidade criada com sucesso',
      data: payment
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/payments/generate-batch
// @desc    Gerar mensalidades em lote
// @access  Private (Admin only)
router.post('/generate-batch', [auth, adminOnly], async (req, res) => {
  try {
    const { mes, ano, valor, data_vencimento, grupo, incluir_inativos = false } = req.body;
    
    if (!mes || !ano || !valor || !data_vencimento) {
      return res.status(400).json({
        success: false,
        message: 'Mês, ano, valor e data de vencimento são obrigatórios'
      });
    }
    
    // Buscar alunos
    const query = incluir_inativos ? {} : { status: 'ativo' };
    if (grupo) query.grupo = grupo;
    
    const students = await Student.find(query).select('_id nome grupo');
    
    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Nenhum aluno encontrado com os critérios informados'
      });
    }
    
    // Verificar mensalidades já existentes
    const existingPayments = await Payment.find({
      aluno_id: { $in: students.map(s => s._id) },
      mes: parseInt(mes),
      ano: parseInt(ano)
    }).select('aluno_id');
    
    const existingStudentIds = existingPayments.map(p => p.aluno_id.toString());
    const studentsToCreate = students.filter(s => !existingStudentIds.includes(s._id.toString()));
    
    if (studentsToCreate.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Todos os alunos já possuem mensalidade para este período'
      });
    }
    
    // Criar mensalidades
    const paymentsToCreate = studentsToCreate.map(student => ({
      aluno_id: student._id,
      mes: parseInt(mes),
      ano: parseInt(ano),
      valor: parseFloat(valor),
      data_vencimento: new Date(data_vencimento),
      status: 'pendente',
      criado_por: req.user._id
    }));
    
    const createdPayments = await Payment.insertMany(paymentsToCreate);
    
    res.status(201).json({
      success: true,
      message: `${createdPayments.length} mensalidades criadas com sucesso`,
      data: {
        total_criadas: createdPayments.length,
        total_alunos: students.length,
        ja_existiam: existingPayments.length,
        periodo: `${mes}/${ano}`,
        valor: parseFloat(valor)
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

// @route   PUT /api/payments/:id
// @desc    Atualizar mensalidade
// @access  Private (Admin only)
router.put('/:id', [auth, adminOnly, ...validateParams.mongoId, ...validatePayment.update], async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Mensalidade não encontrada'
      });
    }
    
    // Não permitir alterar mensalidades pagas
    if (payment.status === 'pago' && req.body.status !== 'pago') {
      return res.status(400).json({
        success: false,
        message: 'Não é possível alterar mensalidade já paga'
      });
    }
    
    const updatedPayment = await Payment.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        atualizado_em: new Date(),
        atualizado_por: req.user._id
      },
      { new: true, runValidators: true }
    ).populate('aluno_id', 'nome email telefone grupo');
    
    res.json({
      success: true,
      message: 'Mensalidade atualizada com sucesso',
      data: updatedPayment
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   PUT /api/payments/:id/pay
// @desc    Registrar pagamento
// @access  Private (Admin/Instructor)
router.put('/:id/pay', [auth, adminOrInstructor, ...validateParams.mongoId, ...validatePayment.payment], async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Mensalidade não encontrada'
      });
    }
    
    if (payment.status === 'pago') {
      return res.status(400).json({
        success: false,
        message: 'Mensalidade já está paga'
      });
    }
    
    if (payment.status === 'cancelado') {
      return res.status(400).json({
        success: false,
        message: 'Não é possível pagar mensalidade cancelada'
      });
    }
    
    const {
      valor_pago,
      forma_pagamento,
      data_pagamento,
      observacoes_pagamento,
      desconto = 0,
      juros = 0
    } = req.body;
    
    payment.status = 'pago';
    payment.valor_pago = valor_pago || payment.valor;
    payment.forma_pagamento = forma_pagamento;
    payment.data_pagamento = data_pagamento ? new Date(data_pagamento) : new Date();
    payment.observacoes_pagamento = observacoes_pagamento;
    payment.desconto = desconto;
    payment.juros = juros;
    payment.recebido_por = req.user._id;
    payment.atualizado_em = new Date();
    payment.atualizado_por = req.user._id;
    
    await payment.save();
    
    await payment.populate([
      { path: 'aluno_id', select: 'nome email telefone grupo' },
      { path: 'recebido_por', select: 'nome email' }
    ]);
    
    res.json({
      success: true,
      message: 'Pagamento registrado com sucesso',
      data: payment
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   PUT /api/payments/:id/cancel
// @desc    Cancelar mensalidade
// @access  Private (Admin only)
router.put('/:id/cancel', [auth, adminOnly, ...validateParams.mongoId], async (req, res) => {
  try {
    const { motivo } = req.body;
    
    if (!motivo) {
      return res.status(400).json({
        success: false,
        message: 'Motivo do cancelamento é obrigatório'
      });
    }
    
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Mensalidade não encontrada'
      });
    }
    
    if (payment.status === 'pago') {
      return res.status(400).json({
        success: false,
        message: 'Não é possível cancelar mensalidade já paga'
      });
    }
    
    if (payment.status === 'cancelado') {
      return res.status(400).json({
        success: false,
        message: 'Mensalidade já está cancelada'
      });
    }
    
    payment.status = 'cancelado';
    payment.data_cancelamento = new Date();
    payment.motivo_cancelamento = motivo;
    payment.cancelado_por = req.user._id;
    payment.atualizado_em = new Date();
    payment.atualizado_por = req.user._id;
    
    await payment.save();
    
    res.json({
      success: true,
      message: 'Mensalidade cancelada com sucesso',
      data: {
        id: payment._id,
        status: payment.status,
        data_cancelamento: payment.data_cancelamento,
        motivo_cancelamento: payment.motivo_cancelamento
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

// @route   DELETE /api/payments/:id
// @desc    Deletar mensalidade
// @access  Private (Admin only)
router.delete('/:id', [auth, adminOnly, ...validateParams.mongoId], async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Mensalidade não encontrada'
      });
    }
    
    // Não permitir deletar mensalidades pagas
    if (payment.status === 'pago') {
      return res.status(400).json({
        success: false,
        message: 'Não é possível deletar mensalidade já paga'
      });
    }
    
    await Payment.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'Mensalidade deletada com sucesso'
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