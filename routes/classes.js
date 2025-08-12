const express = require('express');
const Class = require('../models/Class');
const Lesson = require('../models/Lesson');
const Booking = require('../models/Booking');
const Student = require('../models/Student');
const User = require('../models/User');
const { auth, adminOnly, adminOrInstructor } = require('../middleware/auth');
const { validateClass, validateParams, validateQuery } = require('../middleware/validation');

const router = express.Router();

// @route   GET /api/classes
// @desc    Listar turmas
// @access  Private (Admin/Instructor)
router.get('/', [auth, adminOrInstructor, ...validateQuery.pagination], async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      grupo,
      ativo,
      instrutor,
      dia_semana,
      search
    } = req.query;
    
    const query = {};
    
    // Filtros
    if (grupo) query.grupo = grupo;
    if (ativo !== undefined) query.ativo = ativo === 'true';
    if (instrutor) query.instrutor = instrutor;
    if (dia_semana) query.dias_semana = dia_semana;
    
    // Busca textual
    if (search) {
      query.$or = [
        { nome: { $regex: search, $options: 'i' } },
        { descricao: { $regex: search, $options: 'i' } }
      ];
    }
    
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { nome: 1 },
      populate: [
        {
          path: 'instrutor',
          select: 'nome email telefone'
        }
      ]
    };
    
    const classes = await Class.paginate(query, options);
    
    res.json({
      success: true,
      data: classes
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/classes/schedule
// @desc    Obter grade de horários
// @access  Private
router.get('/schedule', auth, async (req, res) => {
  try {
    const { grupo } = req.query;
    
    const query = { ativo: true };
    if (grupo) query.grupo = { $in: [grupo, 'ambos'] };
    
    const classes = await Class.find(query)
      .populate('instrutor', 'nome')
      .sort({ hora_inicio: 1 });
    
    // Organizar por dia da semana
    const schedule = {
      segunda: [],
      terca: [],
      quarta: [],
      quinta: [],
      sexta: [],
      sabado: [],
      domingo: []
    };
    
    classes.forEach(turma => {
      turma.dias_semana.forEach(dia => {
        if (schedule[dia]) {
          schedule[dia].push({
            id: turma._id,
            nome: turma.nome,
            hora_inicio: turma.hora_inicio,
            hora_fim: turma.hora_fim,
            duracao_minutos: turma.duracao_minutos,
            capacidade: turma.capacidade,
            instrutor: turma.instrutor,
            grupo: turma.grupo,
            nivel: turma.nivel,
            requer_agendamento: turma.requer_agendamento
          });
        }
      });
    });
    
    // Ordenar cada dia por horário
    Object.keys(schedule).forEach(dia => {
      schedule[dia].sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
    });
    
    res.json({
      success: true,
      data: schedule
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/classes/stats
// @desc    Estatísticas de turmas
// @access  Private (Admin/Instructor)
router.get('/stats', [auth, adminOrInstructor], async (req, res) => {
  try {
    const stats = await Class.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          ativas: {
            $sum: {
              $cond: [{ $eq: ['$ativo', true] }, 1, 0]
            }
          },
          inativas: {
            $sum: {
              $cond: [{ $eq: ['$ativo', false] }, 1, 0]
            }
          },
          adulto: {
            $sum: {
              $cond: [{ $eq: ['$grupo', 'adulto'] }, 1, 0]
            }
          },
          kids: {
            $sum: {
              $cond: [{ $eq: ['$grupo', 'kids'] }, 1, 0]
            }
          },
          ambos: {
            $sum: {
              $cond: [{ $eq: ['$grupo', 'ambos'] }, 1, 0]
            }
          },
          capacidade_total: { $sum: '$capacidade' },
          media_capacidade: { $avg: '$capacidade' },
          media_ocupacao: { $avg: '$estatisticas.taxa_ocupacao' }
        }
      }
    ]);
    
    // Estatísticas por instrutor
    const instructorStats = await Class.aggregate([
      {
        $match: { ativo: true }
      },
      {
        $group: {
          _id: '$instrutor',
          total_turmas: { $sum: 1 },
          capacidade_total: { $sum: '$capacidade' }
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
          total_turmas: 1,
          capacidade_total: 1
        }
      },
      {
        $sort: { total_turmas: -1 }
      }
    ]);
    
    res.json({
      success: true,
      data: {
        ...stats[0],
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

// @route   GET /api/classes/:id
// @desc    Obter turma por ID
// @access  Private (Admin/Instructor)
router.get('/:id', [auth, adminOrInstructor, ...validateParams.mongoId], async (req, res) => {
  try {
    const turma = await Class.findById(req.params.id)
      .populate('instrutor', 'nome email telefone');
    
    if (!turma) {
      return res.status(404).json({
        success: false,
        message: 'Turma não encontrada'
      });
    }
    
    res.json({
      success: true,
      data: turma
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/classes
// @desc    Criar nova turma
// @access  Private (Admin only)
router.post('/', [auth, adminOnly, ...validateClass.create], async (req, res) => {
  try {
    // Verificar se o instrutor existe
    const instructor = await User.findById(req.body.instrutor);
    if (!instructor || instructor.perfil !== 'instrutor') {
      return res.status(400).json({
        success: false,
        message: 'Instrutor inválido'
      });
    }
    
    // Verificar conflitos de horário para o instrutor
    const conflictingClasses = await Class.verificarConflitoHorario(
      req.body.dias_semana,
      req.body.hora_inicio,
      req.body.hora_fim,
      req.body.instrutor
    );
    
    if (conflictingClasses.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Conflito de horário detectado',
        conflitos: conflictingClasses
      });
    }
    
    const turma = new Class(req.body);
    await turma.save();
    
    await turma.populate('instrutor', 'nome email telefone');
    
    res.status(201).json({
      success: true,
      message: 'Turma criada com sucesso',
      data: turma
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   PUT /api/classes/:id
// @desc    Atualizar turma
// @access  Private (Admin only)
router.put('/:id', [auth, adminOnly, ...validateParams.mongoId, ...validateClass.update], async (req, res) => {
  try {
    const turma = await Class.findById(req.params.id);
    if (!turma) {
      return res.status(404).json({
        success: false,
        message: 'Turma não encontrada'
      });
    }
    
    // Se alterando instrutor, verificar se existe
    if (req.body.instrutor) {
      const instructor = await User.findById(req.body.instrutor);
      if (!instructor || instructor.perfil !== 'instrutor') {
        return res.status(400).json({
          success: false,
          message: 'Instrutor inválido'
        });
      }
    }
    
    // Verificar conflitos de horário se alterando horários ou dias
    if (req.body.dias_semana || req.body.hora_inicio || req.body.hora_fim || req.body.instrutor) {
      const dias = req.body.dias_semana || turma.dias_semana;
      const horaInicio = req.body.hora_inicio || turma.hora_inicio;
      const horaFim = req.body.hora_fim || turma.hora_fim;
      const instrutor = req.body.instrutor || turma.instrutor;
      
      const conflictingClasses = await Class.verificarConflitoHorario(
        dias,
        horaInicio,
        horaFim,
        instrutor,
        req.params.id // Excluir a própria turma da verificação
      );
      
      if (conflictingClasses.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Conflito de horário detectado',
          conflitos: conflictingClasses
        });
      }
    }
    
    const updatedClass = await Class.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('instrutor', 'nome email telefone');
    
    res.json({
      success: true,
      message: 'Turma atualizada com sucesso',
      data: updatedClass
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   PUT /api/classes/:id/toggle-status
// @desc    Ativar/desativar turma
// @access  Private (Admin only)
router.put('/:id/toggle-status', [auth, adminOnly, ...validateParams.mongoId], async (req, res) => {
  try {
    const turma = await Class.findById(req.params.id);
    if (!turma) {
      return res.status(404).json({
        success: false,
        message: 'Turma não encontrada'
      });
    }
    
    turma.ativo = !turma.ativo;
    await turma.save();
    
    res.json({
      success: true,
      message: `Turma ${turma.ativo ? 'ativada' : 'desativada'} com sucesso`,
      data: {
        id: turma._id,
        nome: turma.nome,
        ativo: turma.ativo
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

// @route   GET /api/classes/:id/lessons
// @desc    Listar aulas da turma
// @access  Private (Admin/Instructor)
router.get('/:id/lessons', [auth, adminOrInstructor, ...validateParams.mongoId, ...validateQuery.pagination], async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      data_inicio,
      data_fim
    } = req.query;
    
    const turma = await Class.findById(req.params.id);
    if (!turma) {
      return res.status(404).json({
        success: false,
        message: 'Turma não encontrada'
      });
    }
    
    const query = { turma_id: req.params.id };
    
    if (status) query.status = status;
    if (data_inicio || data_fim) {
      query.data = {};
      if (data_inicio) query.data.$gte = new Date(data_inicio);
      if (data_fim) query.data.$lte = new Date(data_fim);
    }
    
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { data: -1, hora_inicio: -1 },
      populate: [
        {
          path: 'instrutor_substituto',
          select: 'nome'
        }
      ]
    };
    
    const lessons = await Lesson.paginate(query, options);
    
    res.json({
      success: true,
      data: lessons
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/classes/:id/generate-lessons
// @desc    Gerar aulas para a turma
// @access  Private (Admin only)
router.post('/:id/generate-lessons', [auth, adminOnly, ...validateParams.mongoId], async (req, res) => {
  try {
    const { data_inicio, data_fim } = req.body;
    
    if (!data_inicio || !data_fim) {
      return res.status(400).json({
        success: false,
        message: 'Data de início e fim são obrigatórias'
      });
    }
    
    const turma = await Class.findById(req.params.id);
    if (!turma) {
      return res.status(404).json({
        success: false,
        message: 'Turma não encontrada'
      });
    }
    
    if (!turma.ativo) {
      return res.status(400).json({
        success: false,
        message: 'Não é possível gerar aulas para turma inativa'
      });
    }
    
    const lessons = await turma.gerarAulasSemana(new Date(data_inicio), new Date(data_fim));
    
    res.json({
      success: true,
      message: `${lessons.length} aulas geradas com sucesso`,
      data: {
        total_geradas: lessons.length,
        periodo: {
          inicio: data_inicio,
          fim: data_fim
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

// @route   GET /api/classes/:id/students
// @desc    Listar alunos elegíveis para a turma
// @access  Private (Admin/Instructor)
router.get('/:id/students', [auth, adminOrInstructor, ...validateParams.mongoId], async (req, res) => {
  try {
    const turma = await Class.findById(req.params.id);
    if (!turma) {
      return res.status(404).json({
        success: false,
        message: 'Turma não encontrada'
      });
    }
    
    // Buscar alunos elegíveis
    const query = {
      status: 'ativo',
      'configuracoes.checkin_bloqueado': false
    };
    
    // Filtrar por grupo se não for 'ambos'
    if (turma.grupo !== 'ambos') {
      query.grupo = turma.grupo;
    }
    
    const students = await Student.find(query)
      .select('nome grupo faixa_atual idade email telefone')
      .sort({ nome: 1 });
    
    // Filtrar por elegibilidade (faixa, etc.)
    const eligibleStudents = students.filter(student => {
      return turma.verificarElegibilidadeAluno(student);
    });
    
    res.json({
      success: true,
      data: {
        total: eligibleStudents.length,
        students: eligibleStudents
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

// @route   GET /api/classes/:id/attendance-report
// @desc    Relatório de frequência da turma
// @access  Private (Admin/Instructor)
router.get('/:id/attendance-report', [auth, adminOrInstructor, ...validateParams.mongoId], async (req, res) => {
  try {
    const {
      data_inicio,
      data_fim,
      periodo = 30
    } = req.query;
    
    const turma = await Class.findById(req.params.id);
    if (!turma) {
      return res.status(404).json({
        success: false,
        message: 'Turma não encontrada'
      });
    }
    
    // Definir período se não especificado
    let startDate, endDate;
    if (data_inicio && data_fim) {
      startDate = new Date(data_inicio);
      endDate = new Date(data_fim);
    } else {
      endDate = new Date();
      startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(periodo));
    }
    
    // Buscar aulas do período
    const lessons = await Lesson.find({
      turma_id: req.params.id,
      data: {
        $gte: startDate,
        $lte: endDate
      },
      status: { $in: ['finalizada', 'em_andamento'] }
    }).sort({ data: 1 });
    
    // Calcular estatísticas
    const totalAulas = lessons.length;
    const totalAgendamentos = lessons.reduce((sum, lesson) => sum + lesson.estatisticas.total_agendados, 0);
    const totalPresencas = lessons.reduce((sum, lesson) => sum + lesson.estatisticas.presentes, 0);
    const totalFaltas = lessons.reduce((sum, lesson) => sum + lesson.estatisticas.faltas, 0);
    
    const taxaPresenca = totalAgendamentos > 0 ? (totalPresencas / totalAgendamentos) * 100 : 0;
    const mediaPresencasPorAula = totalAulas > 0 ? totalPresencas / totalAulas : 0;
    const taxaOcupacao = lessons.length > 0 ? 
      lessons.reduce((sum, lesson) => sum + lesson.taxa_presenca, 0) / lessons.length : 0;
    
    res.json({
      success: true,
      data: {
        periodo: {
          inicio: startDate,
          fim: endDate,
          dias: Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24))
        },
        estatisticas: {
          total_aulas: totalAulas,
          total_agendamentos: totalAgendamentos,
          total_presencas: totalPresencas,
          total_faltas: totalFaltas,
          taxa_presenca: Math.round(taxaPresenca * 100) / 100,
          media_presencas_por_aula: Math.round(mediaPresencasPorAula * 100) / 100,
          taxa_ocupacao: Math.round(taxaOcupacao * 100) / 100
        },
        aulas: lessons.map(lesson => ({
          id: lesson._id,
          data: lesson.data,
          status: lesson.status,
          agendados: lesson.estatisticas.total_agendados,
          presentes: lesson.estatisticas.presentes,
          faltas: lesson.estatisticas.faltas,
          taxa_presenca: lesson.taxa_presenca
        }))
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

// @route   DELETE /api/classes/:id
// @desc    Deletar turma
// @access  Private (Admin only)
router.delete('/:id', [auth, adminOnly, ...validateParams.mongoId], async (req, res) => {
  try {
    const turma = await Class.findById(req.params.id);
    if (!turma) {
      return res.status(404).json({
        success: false,
        message: 'Turma não encontrada'
      });
    }
    
    // Verificar se há aulas futuras
    const futureClasses = await Lesson.countDocuments({
      turma_id: req.params.id,
      data: { $gte: new Date() },
      status: { $in: ['agendada', 'em_andamento'] }
    });
    
    if (futureClasses > 0) {
      return res.status(400).json({
        success: false,
        message: 'Não é possível deletar turma com aulas futuras agendadas. Considere desativá-la.'
      });
    }
    
    await Class.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'Turma deletada com sucesso'
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