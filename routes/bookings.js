const express = require('express');
const Booking = require('../models/Booking');
const Lesson = require('../models/Lesson');
const Class = require('../models/Class');
const Student = require('../models/Student');
const { auth, adminOnly, adminOrInstructor, ownerOrAdmin } = require('../middleware/auth');
const { validateBooking, validateParams, validateQuery } = require('../middleware/validation');

const router = express.Router();

// @route   GET /api/bookings
// @desc    Listar agendamentos
// @access  Private (Admin/Instructor)
router.get('/', [auth, adminOrInstructor, ...validateQuery.pagination], async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      aluno_id,
      aula_id,
      turma_id,
      status,
      data_inicio,
      data_fim,
      grupo
    } = req.query;
    
    const query = {};
    
    // Filtros
    if (aluno_id) query.aluno_id = aluno_id;
    if (aula_id) query.aula_id = aula_id;
    if (turma_id) query.turma_id = turma_id;
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
          path: 'aluno_id',
          select: 'nome grupo faixa_atual email telefone'
        },
        {
          path: 'aula_id',
          select: 'data hora_inicio hora_fim status',
          populate: {
            path: 'turma_id',
            select: 'nome grupo nivel'
          }
        }
      ]
    };
    
    const bookings = await Booking.paginate(query, options);
    
    res.json({
      success: true,
      data: bookings
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/bookings/my
// @desc    Meus agendamentos (aluno)
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
      data_inicio,
      data_fim,
      futuras_apenas = false
    } = req.query;
    
    const query = { aluno_id: student._id };
    
    if (status) query.status = status;
    
    // Filtro de data
    if (data_inicio || data_fim) {
      query.data = {};
      if (data_inicio) query.data.$gte = new Date(data_inicio);
      if (data_fim) query.data.$lte = new Date(data_fim);
    }
    
    // Apenas aulas futuras
    if (futuras_apenas === 'true') {
      query.data = { $gte: new Date() };
    }
    
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { data: -1, hora_inicio: -1 },
      populate: [
        {
          path: 'aula_id',
          select: 'data hora_inicio hora_fim status conteudo_ministrado',
          populate: {
            path: 'turma_id',
            select: 'nome grupo nivel'
          }
        }
      ]
    };
    
    const bookings = await Booking.paginate(query, options);
    
    res.json({
      success: true,
      data: bookings
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/bookings/available-lessons
// @desc    Aulas disponíveis para agendamento
// @access  Private (Student)
router.get('/available-lessons', auth, async (req, res) => {
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
    
    // Verificar se o aluno pode fazer agendamentos
    if (student.configuracoes.checkin_bloqueado) {
      return res.status(403).json({
        success: false,
        message: 'Check-in bloqueado. Verifique suas mensalidades.'
      });
    }
    
    const { data_inicio, data_fim, dias = 7 } = req.query;
    
    // Definir período
    let startDate, endDate;
    if (data_inicio && data_fim) {
      startDate = new Date(data_inicio);
      endDate = new Date(data_fim);
    } else {
      startDate = new Date();
      endDate = new Date();
      endDate.setDate(endDate.getDate() + parseInt(dias));
    }
    
    // Buscar aulas disponíveis
    const query = {
      data: {
        $gte: startDate,
        $lte: endDate
      },
      status: 'agendada',
      requer_agendamento: true
    };
    
    // Filtrar por grupo do aluno
    if (student.grupo !== 'ambos') {
      query.$or = [
        { grupo: student.grupo },
        { grupo: 'ambos' }
      ];
    }
    
    const lessons = await Lesson.find(query)
      .populate('turma_id', 'nome grupo nivel capacidade faixas_permitidas')
      .sort({ data: 1, hora_inicio: 1 });
    
    // Filtrar aulas elegíveis e calcular vagas disponíveis
    const availableLessons = [];
    
    for (const lesson of lessons) {
      // Verificar elegibilidade do aluno
      if (!lesson.turma_id.verificarElegibilidadeAluno(student)) {
        continue;
      }
      
      // Verificar se já tem agendamento
      const existingBooking = await Booking.findOne({
        aluno_id: student._id,
        aula_id: lesson._id,
        status: { $in: ['confirmado', 'presente'] }
      });
      
      if (existingBooking) {
        continue;
      }
      
      // Calcular vagas disponíveis
      const totalBookings = await Booking.countDocuments({
        aula_id: lesson._id,
        status: { $in: ['confirmado', 'presente'] }
      });
      
      const vagasDisponiveis = lesson.capacidade - totalBookings;
      
      if (vagasDisponiveis > 0) {
        availableLessons.push({
          ...lesson.toObject(),
          vagas_disponiveis: vagasDisponiveis,
          pode_agendar: true
        });
      }
    }
    
    res.json({
      success: true,
      data: {
        periodo: {
          inicio: startDate,
          fim: endDate
        },
        aulas: availableLessons
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

// @route   GET /api/bookings/stats
// @desc    Estatísticas de agendamentos
// @access  Private (Admin/Instructor)
router.get('/stats', [auth, adminOrInstructor], async (req, res) => {
  try {
    const { periodo = 30 } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(periodo));
    
    const stats = await Booking.aggregate([
      {
        $match: {
          data: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          confirmados: {
            $sum: {
              $cond: [{ $eq: ['$status', 'confirmado'] }, 1, 0]
            }
          },
          presentes: {
            $sum: {
              $cond: [{ $eq: ['$status', 'presente'] }, 1, 0]
            }
          },
          ausentes: {
            $sum: {
              $cond: [{ $eq: ['$status', 'ausente'] }, 1, 0]
            }
          },
          cancelados: {
            $sum: {
              $cond: [{ $eq: ['$status', 'cancelado'] }, 1, 0]
            }
          }
        }
      }
    ]);
    
    // Estatísticas por turma
    const classStats = await Booking.aggregate([
      {
        $match: {
          data: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$turma_id',
          total_agendamentos: { $sum: 1 },
          presentes: {
            $sum: {
              $cond: [{ $eq: ['$status', 'presente'] }, 1, 0]
            }
          }
        }
      },
      {
        $lookup: {
          from: 'classes',
          localField: '_id',
          foreignField: '_id',
          as: 'turma_info'
        }
      },
      {
        $unwind: '$turma_info'
      },
      {
        $project: {
          nome: '$turma_info.nome',
          grupo: '$turma_info.grupo',
          total_agendamentos: 1,
          presentes: 1,
          taxa_presenca: {
            $cond: [
              { $gt: ['$total_agendamentos', 0] },
              { $multiply: [{ $divide: ['$presentes', '$total_agendamentos'] }, 100] },
              0
            ]
          }
        }
      },
      {
        $sort: { total_agendamentos: -1 }
      }
    ]);
    
    const result = stats[0] || {
      total: 0,
      confirmados: 0,
      presentes: 0,
      ausentes: 0,
      cancelados: 0
    };
    
    // Calcular taxa de presença geral
    result.taxa_presenca = result.total > 0 ? 
      (result.presentes / result.total) * 100 : 0;
    
    res.json({
      success: true,
      data: {
        ...result,
        por_turma: classStats
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

// @route   GET /api/bookings/:id
// @desc    Obter agendamento por ID
// @access  Private
router.get('/:id', [auth, ...validateParams.mongoId], async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('aluno_id', 'nome grupo faixa_atual email telefone')
      .populate({
        path: 'aula_id',
        select: 'data hora_inicio hora_fim status conteudo_ministrado',
        populate: {
          path: 'turma_id',
          select: 'nome grupo nivel'
        }
      });
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Agendamento não encontrado'
      });
    }
    
    // Verificar permissão
    if (req.user.perfil === 'aluno') {
      const student = await Student.findOne({ user_id: req.user._id });
      if (!student || !booking.aluno_id._id.equals(student._id)) {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado'
        });
      }
    }
    
    res.json({
      success: true,
      data: booking
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/bookings
// @desc    Criar agendamento
// @access  Private (Student/Admin)
router.post('/', [auth, ...validateBooking.create], async (req, res) => {
  try {
    let studentId;
    
    // Se for admin, pode agendar para qualquer aluno
    if (req.user.perfil === 'admin' && req.body.aluno_id) {
      studentId = req.body.aluno_id;
    } else if (req.user.perfil === 'aluno') {
      // Se for aluno, só pode agendar para si mesmo
      const student = await Student.findOne({ user_id: req.user._id });
      if (!student) {
        return res.status(404).json({
          success: false,
          message: 'Dados do aluno não encontrados'
        });
      }
      studentId = student._id;
    } else {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado'
      });
    }
    
    // Verificar se o aluno existe e está ativo
    const student = await Student.findById(studentId);
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
    
    if (student.configuracoes.checkin_bloqueado) {
      return res.status(400).json({
        success: false,
        message: 'Check-in bloqueado. Verifique suas mensalidades.'
      });
    }
    
    // Verificar se a aula existe
    const lesson = await Lesson.findById(req.body.aula_id)
      .populate('turma_id');
    
    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: 'Aula não encontrada'
      });
    }
    
    if (lesson.status !== 'agendada') {
      return res.status(400).json({
        success: false,
        message: 'Aula não está disponível para agendamento'
      });
    }
    
    // Verificar se a aula é no futuro
    const now = new Date();
    const lessonDateTime = new Date(lesson.data);
    const [hours, minutes] = lesson.hora_inicio.split(':');
    lessonDateTime.setHours(parseInt(hours), parseInt(minutes));
    
    if (lessonDateTime <= now) {
      return res.status(400).json({
        success: false,
        message: 'Não é possível agendar aulas no passado'
      });
    }
    
    // Verificar elegibilidade do aluno
    if (!lesson.turma_id.verificarElegibilidadeAluno(student)) {
      return res.status(400).json({
        success: false,
        message: 'Aluno não é elegível para esta turma'
      });
    }
    
    // Verificar se já tem agendamento
    const existingBooking = await Booking.findOne({
      aluno_id: studentId,
      aula_id: req.body.aula_id,
      status: { $in: ['confirmado', 'presente'] }
    });
    
    if (existingBooking) {
      return res.status(400).json({
        success: false,
        message: 'Aluno já possui agendamento para esta aula'
      });
    }
    
    // Verificar capacidade
    const totalBookings = await Booking.countDocuments({
      aula_id: req.body.aula_id,
      status: { $in: ['confirmado', 'presente'] }
    });
    
    if (totalBookings >= lesson.capacidade) {
      return res.status(400).json({
        success: false,
        message: 'Aula lotada'
      });
    }
    
    // Criar agendamento
    const bookingData = {
      aluno_id: studentId,
      aula_id: req.body.aula_id,
      turma_id: lesson.turma_id._id,
      data: lesson.data,
      hora_inicio: lesson.hora_inicio,
      hora_fim: lesson.hora_fim,
      grupo: lesson.grupo,
      status: 'confirmado',
      agendado_por: req.user._id,
      observacoes: req.body.observacoes
    };
    
    const booking = new Booking(bookingData);
    await booking.save();
    
    await booking.populate([
      { path: 'aluno_id', select: 'nome grupo faixa_atual' },
      {
        path: 'aula_id',
        select: 'data hora_inicio hora_fim',
        populate: {
          path: 'turma_id',
          select: 'nome grupo nivel'
        }
      }
    ]);
    
    res.status(201).json({
      success: true,
      message: 'Agendamento criado com sucesso',
      data: booking
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   PUT /api/bookings/:id/cancel
// @desc    Cancelar agendamento
// @access  Private (Student/Admin)
router.put('/:id/cancel', [auth, ...validateParams.mongoId], async (req, res) => {
  try {
    const { motivo } = req.body;
    
    const booking = await Booking.findById(req.params.id)
      .populate('aula_id', 'data hora_inicio status');
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Agendamento não encontrado'
      });
    }
    
    // Verificar permissão
    if (req.user.perfil === 'aluno') {
      const student = await Student.findOne({ user_id: req.user._id });
      if (!student || !booking.aluno_id.equals(student._id)) {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado'
        });
      }
    }
    
    if (booking.status === 'cancelado') {
      return res.status(400).json({
        success: false,
        message: 'Agendamento já está cancelado'
      });
    }
    
    if (booking.status === 'presente') {
      return res.status(400).json({
        success: false,
        message: 'Não é possível cancelar agendamento com presença confirmada'
      });
    }
    
    // Verificar se pode cancelar (ex: até 2 horas antes)
    const now = new Date();
    const lessonDateTime = new Date(booking.aula_id.data);
    const [hours, minutes] = booking.aula_id.hora_inicio.split(':');
    lessonDateTime.setHours(parseInt(hours), parseInt(minutes));
    
    const hoursUntilLesson = (lessonDateTime - now) / (1000 * 60 * 60);
    
    if (hoursUntilLesson < 2 && req.user.perfil !== 'admin') {
      return res.status(400).json({
        success: false,
        message: 'Cancelamento deve ser feito com pelo menos 2 horas de antecedência'
      });
    }
    
    booking.status = 'cancelado';
    booking.motivo_cancelamento = motivo || 'Cancelado pelo usuário';
    booking.cancelado_em = new Date();
    booking.cancelado_por = req.user._id;
    
    await booking.save();
    
    res.json({
      success: true,
      message: 'Agendamento cancelado com sucesso',
      data: {
        id: booking._id,
        status: booking.status,
        motivo_cancelamento: booking.motivo_cancelamento
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

// @route   PUT /api/bookings/:id/checkin
// @desc    Fazer check-in
// @access  Private (Student/Admin/Instructor)
router.put('/:id/checkin', [auth, ...validateParams.mongoId], async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('aula_id', 'data hora_inicio hora_fim status');
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Agendamento não encontrado'
      });
    }
    
    // Verificar permissão
    if (req.user.perfil === 'aluno') {
      const student = await Student.findOne({ user_id: req.user._id });
      if (!student || !booking.aluno_id.equals(student._id)) {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado'
        });
      }
    }
    
    if (booking.status !== 'confirmado') {
      return res.status(400).json({
        success: false,
        message: 'Apenas agendamentos confirmados podem fazer check-in'
      });
    }
    
    // Verificar se a aula está em andamento ou se é o horário correto
    const now = new Date();
    const lessonDate = new Date(booking.aula_id.data);
    const [startHours, startMinutes] = booking.aula_id.hora_inicio.split(':');
    const [endHours, endMinutes] = booking.aula_id.hora_fim.split(':');
    
    const lessonStart = new Date(lessonDate);
    lessonStart.setHours(parseInt(startHours), parseInt(startMinutes));
    
    const lessonEnd = new Date(lessonDate);
    lessonEnd.setHours(parseInt(endHours), parseInt(endMinutes));
    
    // Permitir check-in 15 minutos antes até 30 minutos após o início
    const checkinStart = new Date(lessonStart);
    checkinStart.setMinutes(checkinStart.getMinutes() - 15);
    
    const checkinEnd = new Date(lessonStart);
    checkinEnd.setMinutes(checkinEnd.getMinutes() + 30);
    
    if (now < checkinStart || now > checkinEnd) {
      return res.status(400).json({
        success: false,
        message: 'Check-in só é permitido entre 15 minutos antes e 30 minutos após o início da aula'
      });
    }
    
    booking.status = 'presente';
    booking.checkin_em = now;
    
    await booking.save();
    
    res.json({
      success: true,
      message: 'Check-in realizado com sucesso',
      data: {
        id: booking._id,
        status: booking.status,
        checkin_em: booking.checkin_em
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

// @route   PUT /api/bookings/:id/mark-absent
// @desc    Marcar como ausente
// @access  Private (Admin/Instructor)
router.put('/:id/mark-absent', [auth, adminOrInstructor, ...validateParams.mongoId], async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Agendamento não encontrado'
      });
    }
    
    if (booking.status !== 'confirmado') {
      return res.status(400).json({
        success: false,
        message: 'Apenas agendamentos confirmados podem ser marcados como ausente'
      });
    }
    
    booking.status = 'ausente';
    booking.marcado_ausente_em = new Date();
    booking.marcado_ausente_por = req.user._id;
    
    await booking.save();
    
    res.json({
      success: true,
      message: 'Agendamento marcado como ausente',
      data: {
        id: booking._id,
        status: booking.status,
        marcado_ausente_em: booking.marcado_ausente_em
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

// @route   DELETE /api/bookings/:id
// @desc    Deletar agendamento
// @access  Private (Admin only)
router.delete('/:id', [auth, adminOnly, ...validateParams.mongoId], async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Agendamento não encontrado'
      });
    }
    
    // Não permitir deletar agendamentos com presença confirmada
    if (booking.status === 'presente') {
      return res.status(400).json({
        success: false,
        message: 'Não é possível deletar agendamento com presença confirmada'
      });
    }
    
    await Booking.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'Agendamento deletado com sucesso'
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