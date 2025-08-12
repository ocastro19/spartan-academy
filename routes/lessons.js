const express = require('express');
const Lesson = require('../models/Lesson');
const Class = require('../models/Class');
const Booking = require('../models/Booking');
const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const User = require('../models/User');
const { auth, adminOnly, adminOrInstructor, ownerOrAdmin } = require('../middleware/auth');
const { validateLesson, validateParams, validateQuery } = require('../middleware/validation');

const router = express.Router();

// @route   GET /api/lessons
// @desc    Listar aulas
// @access  Private (Admin/Instructor)
router.get('/', [auth, adminOrInstructor, ...validateQuery.pagination], async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      turma_id,
      instrutor,
      status,
      data_inicio,
      data_fim,
      grupo
    } = req.query;
    
    const query = {};
    
    // Filtros
    if (turma_id) query.turma_id = turma_id;
    if (instrutor) {
      query.$or = [
        { instrutor: instrutor },
        { instrutor_substituto: instrutor }
      ];
    }
    if (status) query.status = status;
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
      sort: { data: -1, hora_inicio: -1 },
      populate: [
        {
          path: 'turma_id',
          select: 'nome grupo nivel capacidade'
        },
        {
          path: 'instrutor',
          select: 'nome email'
        },
        {
          path: 'instrutor_substituto',
          select: 'nome email'
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

// @route   GET /api/lessons/today
// @desc    Aulas de hoje
// @access  Private
router.get('/today', auth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const query = {
      data: {
        $gte: today,
        $lt: tomorrow
      }
    };
    
    // Se for aluno, filtrar apenas suas turmas
    if (req.user.perfil === 'aluno') {
      const student = await Student.findOne({ user_id: req.user._id });
      if (student) {
        // Buscar agendamentos do aluno para hoje
        const bookings = await Booking.find({
          aluno_id: student._id,
          data: {
            $gte: today,
            $lt: tomorrow
          },
          status: { $in: ['confirmado', 'presente'] }
        }).select('aula_id');
        
        const lessonIds = bookings.map(booking => booking.aula_id);
        query._id = { $in: lessonIds };
      }
    }
    
    const lessons = await Lesson.find(query)
      .populate('turma_id', 'nome grupo nivel')
      .populate('instrutor', 'nome')
      .populate('instrutor_substituto', 'nome')
      .sort({ hora_inicio: 1 });
    
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

// @route   GET /api/lessons/week
// @desc    Aulas da semana
// @access  Private
router.get('/week', auth, async (req, res) => {
  try {
    const { data } = req.query;
    
    // Calcular início e fim da semana
    const baseDate = data ? new Date(data) : new Date();
    const startOfWeek = new Date(baseDate);
    const dayOfWeek = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Segunda-feira
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    
    const query = {
      data: {
        $gte: startOfWeek,
        $lte: endOfWeek
      }
    };
    
    // Se for aluno, filtrar apenas suas turmas
    if (req.user.perfil === 'aluno') {
      const student = await Student.findOne({ user_id: req.user._id });
      if (student) {
        const bookings = await Booking.find({
          aluno_id: student._id,
          data: {
            $gte: startOfWeek,
            $lte: endOfWeek
          },
          status: { $in: ['confirmado', 'presente'] }
        }).select('aula_id');
        
        const lessonIds = bookings.map(booking => booking.aula_id);
        query._id = { $in: lessonIds };
      }
    }
    
    const lessons = await Lesson.find(query)
      .populate('turma_id', 'nome grupo nivel')
      .populate('instrutor', 'nome')
      .populate('instrutor_substituto', 'nome')
      .sort({ data: 1, hora_inicio: 1 });
    
    // Organizar por dia da semana
    const weekSchedule = {
      segunda: [],
      terca: [],
      quarta: [],
      quinta: [],
      sexta: [],
      sabado: [],
      domingo: []
    };
    
    const dayNames = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    
    lessons.forEach(lesson => {
      const dayName = dayNames[lesson.data.getDay()];
      if (weekSchedule[dayName]) {
        weekSchedule[dayName].push(lesson);
      }
    });
    
    res.json({
      success: true,
      data: {
        periodo: {
          inicio: startOfWeek,
          fim: endOfWeek
        },
        aulas: weekSchedule
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

// @route   GET /api/lessons/stats
// @desc    Estatísticas de aulas
// @access  Private (Admin/Instructor)
router.get('/stats', [auth, adminOrInstructor], async (req, res) => {
  try {
    const { periodo = 30 } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(periodo));
    
    const stats = await Lesson.aggregate([
      {
        $match: {
          data: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          agendadas: {
            $sum: {
              $cond: [{ $eq: ['$status', 'agendada'] }, 1, 0]
            }
          },
          em_andamento: {
            $sum: {
              $cond: [{ $eq: ['$status', 'em_andamento'] }, 1, 0]
            }
          },
          finalizadas: {
            $sum: {
              $cond: [{ $eq: ['$status', 'finalizada'] }, 1, 0]
            }
          },
          canceladas: {
            $sum: {
              $cond: [{ $eq: ['$status', 'cancelada'] }, 1, 0]
            }
          },
          total_agendamentos: { $sum: '$estatisticas.total_agendados' },
          total_presencas: { $sum: '$estatisticas.presentes' },
          total_faltas: { $sum: '$estatisticas.faltas' },
          media_ocupacao: { $avg: '$taxa_presenca' }
        }
      }
    ]);
    
    // Estatísticas por instrutor
    const instructorStats = await Lesson.aggregate([
      {
        $match: {
          data: { $gte: startDate },
          status: { $in: ['finalizada', 'em_andamento'] }
        }
      },
      {
        $group: {
          _id: {
            $ifNull: ['$instrutor_substituto', '$instrutor']
          },
          total_aulas: { $sum: 1 },
          total_presencas: { $sum: '$estatisticas.presentes' },
          media_presencas: { $avg: '$estatisticas.presentes' }
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
          total_aulas: 1,
          total_presencas: 1,
          media_presencas: { $round: ['$media_presencas', 1] }
        }
      },
      {
        $sort: { total_aulas: -1 }
      }
    ]);
    
    const result = stats[0] || {
      total: 0,
      agendadas: 0,
      em_andamento: 0,
      finalizadas: 0,
      canceladas: 0,
      total_agendamentos: 0,
      total_presencas: 0,
      total_faltas: 0,
      media_ocupacao: 0
    };
    
    // Calcular taxa de presença
    result.taxa_presenca = result.total_agendamentos > 0 ? 
      (result.total_presencas / result.total_agendamentos) * 100 : 0;
    
    res.json({
      success: true,
      data: {
        ...result,
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

// @route   GET /api/lessons/:id
// @desc    Obter aula por ID
// @access  Private
router.get('/:id', [auth, ...validateParams.mongoId], async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id)
      .populate('turma_id', 'nome grupo nivel capacidade')
      .populate('instrutor', 'nome email telefone')
      .populate('instrutor_substituto', 'nome email telefone');
    
    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: 'Aula não encontrada'
      });
    }
    
    // Verificar permissão
    if (req.user.perfil === 'aluno') {
      const student = await Student.findOne({ user_id: req.user._id });
      if (student) {
        const booking = await Booking.findOne({
          aluno_id: student._id,
          aula_id: lesson._id
        });
        
        if (!booking) {
          return res.status(403).json({
            success: false,
            message: 'Acesso negado'
          });
        }
      }
    }
    
    res.json({
      success: true,
      data: lesson
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/lessons
// @desc    Criar nova aula
// @access  Private (Admin only)
router.post('/', [auth, adminOnly, ...validateLesson.create], async (req, res) => {
  try {
    // Verificar se a turma existe
    const turma = await Class.findById(req.body.turma_id);
    if (!turma) {
      return res.status(400).json({
        success: false,
        message: 'Turma não encontrada'
      });
    }
    
    // Verificar se o instrutor substituto existe (se fornecido)
    if (req.body.instrutor_substituto) {
      const instructor = await User.findById(req.body.instrutor_substituto);
      if (!instructor || instructor.perfil !== 'instrutor') {
        return res.status(400).json({
          success: false,
          message: 'Instrutor substituto inválido'
        });
      }
    }
    
    // Verificar conflitos de horário
    const conflictingLessons = await Lesson.find({
      data: req.body.data,
      $or: [
        {
          hora_inicio: { $lt: req.body.hora_fim },
          hora_fim: { $gt: req.body.hora_inicio }
        }
      ],
      $or: [
        { instrutor: req.body.instrutor_substituto || turma.instrutor },
        { instrutor_substituto: req.body.instrutor_substituto || turma.instrutor }
      ],
      status: { $ne: 'cancelada' }
    });
    
    if (conflictingLessons.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Conflito de horário detectado para o instrutor'
      });
    }
    
    const lessonData = {
      ...req.body,
      instrutor: turma.instrutor,
      grupo: turma.grupo,
      nivel: turma.nivel,
      capacidade: turma.capacidade
    };
    
    const lesson = new Lesson(lessonData);
    await lesson.save();
    
    await lesson.populate([
      { path: 'turma_id', select: 'nome grupo nivel capacidade' },
      { path: 'instrutor', select: 'nome email' },
      { path: 'instrutor_substituto', select: 'nome email' }
    ]);
    
    res.status(201).json({
      success: true,
      message: 'Aula criada com sucesso',
      data: lesson
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   PUT /api/lessons/:id
// @desc    Atualizar aula
// @access  Private (Admin/Instructor)
router.put('/:id', [auth, adminOrInstructor, ...validateParams.mongoId, ...validateLesson.update], async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: 'Aula não encontrada'
      });
    }
    
    // Verificar se pode editar (não pode editar aulas finalizadas)
    if (lesson.status === 'finalizada') {
      return res.status(400).json({
        success: false,
        message: 'Não é possível editar aula finalizada'
      });
    }
    
    // Se alterando instrutor substituto, verificar se existe
    if (req.body.instrutor_substituto) {
      const instructor = await User.findById(req.body.instrutor_substituto);
      if (!instructor || instructor.perfil !== 'instrutor') {
        return res.status(400).json({
          success: false,
          message: 'Instrutor substituto inválido'
        });
      }
    }
    
    const updatedLesson = await Lesson.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate([
      { path: 'turma_id', select: 'nome grupo nivel capacidade' },
      { path: 'instrutor', select: 'nome email' },
      { path: 'instrutor_substituto', select: 'nome email' }
    ]);
    
    res.json({
      success: true,
      message: 'Aula atualizada com sucesso',
      data: updatedLesson
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   PUT /api/lessons/:id/start
// @desc    Iniciar aula
// @access  Private (Admin/Instructor)
router.put('/:id/start', [auth, adminOrInstructor, ...validateParams.mongoId], async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: 'Aula não encontrada'
      });
    }
    
    if (lesson.status !== 'agendada') {
      return res.status(400).json({
        success: false,
        message: 'Apenas aulas agendadas podem ser iniciadas'
      });
    }
    
    lesson.status = 'em_andamento';
    lesson.hora_inicio_real = new Date();
    await lesson.save();
    
    res.json({
      success: true,
      message: 'Aula iniciada com sucesso',
      data: {
        id: lesson._id,
        status: lesson.status,
        hora_inicio_real: lesson.hora_inicio_real
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

// @route   PUT /api/lessons/:id/finish
// @desc    Finalizar aula
// @access  Private (Admin/Instructor)
router.put('/:id/finish', [auth, adminOrInstructor, ...validateParams.mongoId], async (req, res) => {
  try {
    const { observacoes, conteudo_ministrado } = req.body;
    
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: 'Aula não encontrada'
      });
    }
    
    if (lesson.status !== 'em_andamento') {
      return res.status(400).json({
        success: false,
        message: 'Apenas aulas em andamento podem ser finalizadas'
      });
    }
    
    lesson.status = 'finalizada';
    lesson.hora_fim_real = new Date();
    if (observacoes) lesson.observacoes = observacoes;
    if (conteudo_ministrado) lesson.conteudo_ministrado = conteudo_ministrado;
    
    await lesson.save();
    
    res.json({
      success: true,
      message: 'Aula finalizada com sucesso',
      data: {
        id: lesson._id,
        status: lesson.status,
        hora_fim_real: lesson.hora_fim_real
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

// @route   PUT /api/lessons/:id/cancel
// @desc    Cancelar aula
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
    
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: 'Aula não encontrada'
      });
    }
    
    if (lesson.status === 'finalizada') {
      return res.status(400).json({
        success: false,
        message: 'Não é possível cancelar aula finalizada'
      });
    }
    
    lesson.status = 'cancelada';
    lesson.motivo_cancelamento = motivo;
    lesson.cancelada_em = new Date();
    lesson.cancelada_por = req.user._id;
    
    await lesson.save();
    
    // Cancelar todos os agendamentos
    await Booking.updateMany(
      { aula_id: lesson._id },
      { 
        status: 'cancelado',
        motivo_cancelamento: 'Aula cancelada'
      }
    );
    
    res.json({
      success: true,
      message: 'Aula cancelada com sucesso',
      data: {
        id: lesson._id,
        status: lesson.status,
        motivo_cancelamento: lesson.motivo_cancelamento
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

// @route   GET /api/lessons/:id/bookings
// @desc    Listar agendamentos da aula
// @access  Private (Admin/Instructor)
router.get('/:id/bookings', [auth, adminOrInstructor, ...validateParams.mongoId], async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: 'Aula não encontrada'
      });
    }
    
    const bookings = await Booking.find({ aula_id: req.params.id })
      .populate('aluno_id', 'nome grupo faixa_atual email telefone')
      .sort({ status: 1, createdAt: 1 });
    
    res.json({
      success: true,
      data: {
        aula: {
          id: lesson._id,
          data: lesson.data,
          hora_inicio: lesson.hora_inicio,
          hora_fim: lesson.hora_fim,
          status: lesson.status,
          capacidade: lesson.capacidade
        },
        agendamentos: bookings,
        estatisticas: {
          total: bookings.length,
          confirmados: bookings.filter(b => b.status === 'confirmado').length,
          presentes: bookings.filter(b => b.status === 'presente').length,
          ausentes: bookings.filter(b => b.status === 'ausente').length,
          cancelados: bookings.filter(b => b.status === 'cancelado').length
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

// @route   GET /api/lessons/:id/attendance
// @desc    Lista de presença da aula
// @access  Private (Admin/Instructor)
router.get('/:id/attendance', [auth, adminOrInstructor, ...validateParams.mongoId], async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: 'Aula não encontrada'
      });
    }
    
    const attendance = await Attendance.find({ aula_id: req.params.id })
      .populate('aluno_id', 'nome grupo faixa_atual email telefone')
      .sort({ 'aluno_id.nome': 1 });
    
    res.json({
      success: true,
      data: {
        aula: {
          id: lesson._id,
          data: lesson.data,
          hora_inicio: lesson.hora_inicio,
          hora_fim: lesson.hora_fim,
          status: lesson.status
        },
        presencas: attendance
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

// @route   DELETE /api/lessons/:id
// @desc    Deletar aula
// @access  Private (Admin only)
router.delete('/:id', [auth, adminOnly, ...validateParams.mongoId], async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: 'Aula não encontrada'
      });
    }
    
    // Não permitir deletar aulas finalizadas ou em andamento
    if (['finalizada', 'em_andamento'].includes(lesson.status)) {
      return res.status(400).json({
        success: false,
        message: 'Não é possível deletar aula finalizada ou em andamento'
      });
    }
    
    // Verificar se há agendamentos
    const bookingsCount = await Booking.countDocuments({ aula_id: req.params.id });
    if (bookingsCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Não é possível deletar aula com agendamentos. Considere cancelá-la.'
      });
    }
    
    await Lesson.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'Aula deletada com sucesso'
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