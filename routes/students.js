const express = require('express');
const Student = require('../models/Student');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Monthly = require('../models/Monthly');
const Graduation = require('../models/Graduation');
const { auth, adminOnly, adminOrInstructor, canAccessStudent } = require('../middleware/auth');
const { validateStudent, validateParams, validateQuery } = require('../middleware/validation');

const router = express.Router();

// @route   GET /api/students
// @desc    Listar alunos
// @access  Private (Admin/Instructor)
router.get('/', [auth, adminOrInstructor, ...validateQuery.pagination], async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      grupo,
      status,
      faixa,
      search,
      sort = 'nome'
    } = req.query;
    
    const query = {};
    
    // Filtros
    if (grupo) query.grupo = grupo;
    if (status) query.status = status;
    if (faixa) query['faixa_atual.faixa'] = faixa;
    
    // Busca textual
    if (search) {
      query.$or = [
        { nome: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { telefone: { $regex: search, $options: 'i' } },
        { 'responsavel_financeiro.nome': { $regex: search, $options: 'i' } }
      ];
    }
    
    // Ordenação
    const sortOptions = {
      nome: { nome: 1 },
      idade: { data_nascimento: -1 },
      faixa: { 'faixa_atual.faixa': 1, 'faixa_atual.grau': 1 },
      status: { status: 1 },
      recente: { createdAt: -1 }
    };
    
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: sortOptions[sort] || sortOptions.nome,
      populate: [
        {
          path: 'graduacoes',
          options: { limit: 1, sort: { data: -1 } }
        }
      ]
    };
    
    const students = await Student.paginate(query, options);
    
    res.json({
      success: true,
      data: students
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/students/stats
// @desc    Estatísticas de alunos
// @access  Private (Admin/Instructor)
router.get('/stats', [auth, adminOrInstructor], async (req, res) => {
  try {
    const stats = await Student.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          ativos: {
            $sum: {
              $cond: [{ $eq: ['$status', 'ativo'] }, 1, 0]
            }
          },
          inativos: {
            $sum: {
              $cond: [{ $eq: ['$status', 'inativo'] }, 1, 0]
            }
          },
          suspensos: {
            $sum: {
              $cond: [{ $eq: ['$status', 'suspenso'] }, 1, 0]
            }
          },
          trancados: {
            $sum: {
              $cond: [{ $eq: ['$status', 'trancado'] }, 1, 0]
            }
          },
          adultos: {
            $sum: {
              $cond: [{ $eq: ['$grupo', 'adulto'] }, 1, 0]
            }
          },
          kids: {
            $sum: {
              $cond: [{ $eq: ['$grupo', 'kids'] }, 1, 0]
            }
          }
        }
      }
    ]);
    
    // Estatísticas por faixa
    const faixaStats = await Student.aggregate([
      {
        $match: { status: 'ativo' }
      },
      {
        $group: {
          _id: '$faixa_atual.faixa',
          total: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);
    
    // Alunos novos nos últimos 30 dias
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const newStudents = await Student.countDocuments({
      createdAt: { $gte: thirtyDaysAgo }
    });
    
    res.json({
      success: true,
      data: {
        ...stats[0],
        por_faixa: faixaStats,
        novos_alunos_mes: newStudents
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

// @route   GET /api/students/birthdays
// @desc    Aniversariantes do mês
// @access  Private (Admin/Instructor)
router.get('/birthdays', [auth, adminOrInstructor], async (req, res) => {
  try {
    const { mes } = req.query;
    const targetMonth = mes ? parseInt(mes) : new Date().getMonth() + 1;
    
    const birthdays = await Student.aggregate([
      {
        $match: {
          status: 'ativo'
        }
      },
      {
        $addFields: {
          birth_month: { $month: '$data_nascimento' }
        }
      },
      {
        $match: {
          birth_month: targetMonth
        }
      },
      {
        $addFields: {
          birth_day: { $dayOfMonth: '$data_nascimento' }
        }
      },
      {
        $sort: { birth_day: 1 }
      },
      {
        $project: {
          nome: 1,
          data_nascimento: 1,
          idade: 1,
          grupo: 1,
          telefone: 1,
          email: 1
        }
      }
    ]);
    
    res.json({
      success: true,
      data: birthdays
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/students/:id
// @desc    Obter aluno por ID
// @access  Private (Admin/Instructor/Own)
router.get('/:id', [auth, canAccessStudent, ...validateParams.mongoId], async (req, res) => {
  try {
    const student = await Student.findById(req.params.id)
      .populate('graduacoes', null, null, { sort: { data: -1 } });
    
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Aluno não encontrado'
      });
    }
    
    // Buscar dados do usuário se existir
    const user = await User.findOne({ email: student.email }).select('-senha');
    
    res.json({
      success: true,
      data: {
        student,
        user
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

// @route   POST /api/students
// @desc    Criar novo aluno
// @access  Private (Admin only)
router.post('/', [auth, adminOnly, ...validateStudent.create], async (req, res) => {
  try {
    const studentData = req.body;
    
    // Verificar se já existe aluno com o mesmo email
    if (studentData.email) {
      const existingStudent = await Student.findOne({ email: studentData.email });
      if (existingStudent) {
        return res.status(400).json({
          success: false,
          message: 'Já existe um aluno com este email'
        });
      }
    }
    
    // Criar aluno
    const student = new Student(studentData);
    await student.save();
    
    // Criar mensalidades iniciais se especificado
    if (req.body.criar_mensalidades) {
      const competenciaInicial = req.body.competencia_inicial || new Date().toISOString().slice(0, 7);
      const quantidadeMeses = req.body.quantidade_meses || 12;
      
      await Monthly.criarMensalidadesLote([student._id], competenciaInicial, quantidadeMeses);
    }
    
    res.status(201).json({
      success: true,
      message: 'Aluno criado com sucesso',
      data: student
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   PUT /api/students/:id
// @desc    Atualizar aluno
// @access  Private (Admin only)
router.put('/:id', [auth, adminOnly, ...validateParams.mongoId, ...validateStudent.update], async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Aluno não encontrado'
      });
    }
    
    // Verificar se o email foi alterado e se já existe
    if (req.body.email && req.body.email !== student.email) {
      const existingStudent = await Student.findOne({ email: req.body.email });
      if (existingStudent) {
        return res.status(400).json({
          success: false,
          message: 'Email já está em uso por outro aluno'
        });
      }
    }
    
    const updatedStudent = await Student.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    res.json({
      success: true,
      message: 'Aluno atualizado com sucesso',
      data: updatedStudent
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   PUT /api/students/:id/status
// @desc    Alterar status do aluno
// @access  Private (Admin only)
router.put('/:id/status', [auth, adminOnly, ...validateParams.mongoId], async (req, res) => {
  try {
    const { status, motivo } = req.body;
    
    if (!['ativo', 'inativo', 'suspenso', 'trancado'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status inválido'
      });
    }
    
    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Aluno não encontrado'
      });
    }
    
    const statusAnterior = student.status;
    student.status = status;
    
    // Adicionar observação sobre a mudança de status
    if (motivo) {
      const observacao = `Status alterado de ${statusAnterior} para ${status}: ${motivo}`;
      student.observacoes = student.observacoes ? 
        `${student.observacoes}\n${observacao}` : observacao;
    }
    
    await student.save();
    
    res.json({
      success: true,
      message: 'Status do aluno atualizado com sucesso',
      data: {
        id: student._id,
        nome: student.nome,
        status: student.status
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

// @route   PUT /api/students/:id/checkin-block
// @desc    Bloquear/desbloquear check-in do aluno
// @access  Private (Admin only)
router.put('/:id/checkin-block', [auth, adminOnly, ...validateParams.mongoId], async (req, res) => {
  try {
    const { bloqueado, motivo } = req.body;
    
    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Aluno não encontrado'
      });
    }
    
    await student.alterarBloqueioCheckin(bloqueado, motivo);
    
    res.json({
      success: true,
      message: `Check-in ${bloqueado ? 'bloqueado' : 'desbloqueado'} com sucesso`,
      data: {
        id: student._id,
        nome: student.nome,
        checkin_bloqueado: student.configuracoes.checkin_bloqueado
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

// @route   GET /api/students/:id/attendance
// @desc    Histórico de presenças do aluno
// @access  Private (Admin/Instructor/Own)
router.get('/:id/attendance', [auth, canAccessStudent, ...validateParams.mongoId, ...validateQuery.dateRange], async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      data_inicio,
      data_fim
    } = req.query;
    
    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Aluno não encontrado'
      });
    }
    
    const attendance = await Attendance.historicoAluno(
      req.params.id,
      data_inicio,
      data_fim,
      parseInt(page),
      parseInt(limit)
    );
    
    res.json({
      success: true,
      data: attendance
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/students/:id/attendance/stats
// @desc    Estatísticas de assiduidade do aluno
// @access  Private (Admin/Instructor/Own)
router.get('/:id/attendance/stats', [auth, canAccessStudent, ...validateParams.mongoId], async (req, res) => {
  try {
    const { periodo = 30 } = req.query;
    
    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Aluno não encontrado'
      });
    }
    
    const stats = await Attendance.relatorioAssiduidade(
      req.params.id,
      parseInt(periodo)
    );
    
    const assiduidade = await student.calcularAssiduidade(parseInt(periodo));
    
    res.json({
      success: true,
      data: {
        ...stats,
        percentual_assiduidade: assiduidade
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

// @route   GET /api/students/:id/monthly
// @desc    Mensalidades do aluno
// @access  Private (Admin/Own)
router.get('/:id/monthly', [auth, canAccessStudent, ...validateParams.mongoId], async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      status,
      ano
    } = req.query;
    
    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Aluno não encontrado'
      });
    }
    
    const query = { aluno_id: req.params.id };
    
    if (status) query.status = status;
    if (ano) {
      query.competencia = {
        $regex: `^${ano}`
      };
    }
    
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { competencia: -1 }
    };
    
    const monthly = await Monthly.paginate(query, options);
    
    res.json({
      success: true,
      data: monthly
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/students/:id/graduations
// @desc    Histórico de graduações do aluno
// @access  Private (Admin/Instructor/Own)
router.get('/:id/graduations', [auth, canAccessStudent, ...validateParams.mongoId], async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Aluno não encontrado'
      });
    }
    
    const graduations = await Graduation.historicoGraduacoes(req.params.id);
    
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

// @route   GET /api/students/:id/graduation-eligibility
// @desc    Verificar elegibilidade para graduação
// @access  Private (Admin/Instructor)
router.get('/:id/graduation-eligibility', [auth, adminOrInstructor, ...validateParams.mongoId], async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Aluno não encontrado'
      });
    }
    
    const eligibility = await student.verificarElegibilidadeGraduacao();
    
    res.json({
      success: true,
      data: eligibility
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   DELETE /api/students/:id
// @desc    Deletar aluno
// @access  Private (Admin only)
router.delete('/:id', [auth, adminOnly, ...validateParams.mongoId], async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Aluno não encontrado'
      });
    }
    
    // Verificar se o aluno tem dependências (mensalidades, presenças, etc.)
    const hasMonthly = await Monthly.countDocuments({ aluno_id: req.params.id });
    const hasAttendance = await Attendance.countDocuments({ aluno_id: req.params.id });
    
    if (hasMonthly > 0 || hasAttendance > 0) {
      return res.status(400).json({
        success: false,
        message: 'Não é possível deletar aluno com histórico de mensalidades ou presenças. Considere inativá-lo.'
      });
    }
    
    await Student.findByIdAndDelete(req.params.id);
    
    // Deletar usuário correspondente se existir
    if (student.email) {
      await User.findOneAndDelete({ email: student.email });
    }
    
    res.json({
      success: true,
      message: 'Aluno deletado com sucesso'
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