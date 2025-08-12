const express = require('express');
const Attendance = require('../models/Attendance');
const Lesson = require('../models/Lesson');
const Class = require('../models/Class');
const Student = require('../models/Student');
const Booking = require('../models/Booking');
const { auth, adminOnly, adminOrInstructor } = require('../middleware/auth');
const { validateAttendance, validateParams, validateQuery } = require('../middleware/validation');

const router = express.Router();

// @route   GET /api/attendance
// @desc    Listar presenças
// @access  Private (Admin/Instructor)
router.get('/', [auth, adminOrInstructor, ...validateQuery.pagination], async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      aluno_id,
      aula_id,
      turma_id,
      data_inicio,
      data_fim,
      grupo,
      presente
    } = req.query;
    
    const query = {};
    
    // Filtros
    if (aluno_id) query.aluno_id = aluno_id;
    if (aula_id) query.aula_id = aula_id;
    if (turma_id) query.turma_id = turma_id;
    if (grupo) query.grupo = grupo;
    if (presente !== undefined) query.presente = presente === 'true';
    
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
    
    const attendance = await Attendance.paginate(query, options);
    
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

// @route   GET /api/attendance/my
// @desc    Minhas presenças (aluno)
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
      data_inicio,
      data_fim,
      presente,
      periodo = 30
    } = req.query;
    
    const query = { aluno_id: student._id };
    
    if (presente !== undefined) query.presente = presente === 'true';
    
    // Filtro de data
    if (data_inicio || data_fim) {
      query.data = {};
      if (data_inicio) query.data.$gte = new Date(data_inicio);
      if (data_fim) query.data.$lte = new Date(data_fim);
    } else {
      // Padrão: últimos X dias
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(periodo));
      query.data = { $gte: startDate };
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
    
    const attendance = await Attendance.paginate(query, options);
    
    // Calcular estatísticas
    const totalPresencas = await Attendance.countDocuments({
      aluno_id: student._id,
      presente: true,
      data: query.data
    });
    
    const totalFaltas = await Attendance.countDocuments({
      aluno_id: student._id,
      presente: false,
      data: query.data
    });
    
    const totalAulas = totalPresencas + totalFaltas;
    const taxaPresenca = totalAulas > 0 ? (totalPresencas / totalAulas) * 100 : 0;
    
    res.json({
      success: true,
      data: {
        ...attendance,
        estatisticas: {
          total_aulas: totalAulas,
          total_presencas: totalPresencas,
          total_faltas: totalFaltas,
          taxa_presenca: Math.round(taxaPresenca * 100) / 100
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

// @route   GET /api/attendance/stats
// @desc    Estatísticas de presença
// @access  Private (Admin/Instructor)
router.get('/stats', [auth, adminOrInstructor], async (req, res) => {
  try {
    const { periodo = 30, grupo, turma_id } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(periodo));
    
    const matchQuery = {
      data: { $gte: startDate }
    };
    
    if (grupo) matchQuery.grupo = grupo;
    if (turma_id) matchQuery.turma_id = turma_id;
    
    // Estatísticas gerais
    const generalStats = await Attendance.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          total_registros: { $sum: 1 },
          total_presencas: {
            $sum: { $cond: [{ $eq: ['$presente', true] }, 1, 0] }
          },
          total_faltas: {
            $sum: { $cond: [{ $eq: ['$presente', false] }, 1, 0] }
          }
        }
      }
    ]);
    
    // Estatísticas por turma
    const classStats = await Attendance.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$turma_id',
          total_registros: { $sum: 1 },
          total_presencas: {
            $sum: { $cond: [{ $eq: ['$presente', true] }, 1, 0] }
          },
          total_faltas: {
            $sum: { $cond: [{ $eq: ['$presente', false] }, 1, 0] }
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
          nivel: '$turma_info.nivel',
          total_registros: 1,
          total_presencas: 1,
          total_faltas: 1,
          taxa_presenca: {
            $cond: [
              { $gt: ['$total_registros', 0] },
              { $multiply: [{ $divide: ['$total_presencas', '$total_registros'] }, 100] },
              0
            ]
          }
        }
      },
      { $sort: { taxa_presenca: -1 } }
    ]);
    
    // Top alunos com melhor frequência
    const topStudents = await Attendance.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$aluno_id',
          total_registros: { $sum: 1 },
          total_presencas: {
            $sum: { $cond: [{ $eq: ['$presente', true] }, 1, 0] }
          }
        }
      },
      {
        $match: {
          total_registros: { $gte: 5 } // Pelo menos 5 aulas
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
          grupo: '$aluno_info.grupo',
          faixa_atual: '$aluno_info.faixa_atual',
          total_registros: 1,
          total_presencas: 1,
          taxa_presenca: {
            $multiply: [{ $divide: ['$total_presencas', '$total_registros'] }, 100]
          }
        }
      },
      { $sort: { taxa_presenca: -1 } },
      { $limit: 10 }
    ]);
    
    // Alunos com baixa frequência
    const lowAttendanceStudents = await Attendance.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$aluno_id',
          total_registros: { $sum: 1 },
          total_presencas: {
            $sum: { $cond: [{ $eq: ['$presente', true] }, 1, 0] }
          }
        }
      },
      {
        $match: {
          total_registros: { $gte: 5 } // Pelo menos 5 aulas
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
          grupo: '$aluno_info.grupo',
          faixa_atual: '$aluno_info.faixa_atual',
          total_registros: 1,
          total_presencas: 1,
          taxa_presenca: {
            $multiply: [{ $divide: ['$total_presencas', '$total_registros'] }, 100]
          }
        }
      },
      {
        $match: {
          taxa_presenca: { $lt: 70 } // Menos de 70% de presença
        }
      },
      { $sort: { taxa_presenca: 1 } },
      { $limit: 10 }
    ]);
    
    const result = generalStats[0] || {
      total_registros: 0,
      total_presencas: 0,
      total_faltas: 0
    };
    
    result.taxa_presenca_geral = result.total_registros > 0 ? 
      (result.total_presencas / result.total_registros) * 100 : 0;
    
    res.json({
      success: true,
      data: {
        periodo: {
          inicio: startDate,
          fim: new Date(),
          dias: parseInt(periodo)
        },
        geral: result,
        por_turma: classStats,
        melhores_alunos: topStudents,
        baixa_frequencia: lowAttendanceStudents
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

// @route   GET /api/attendance/report
// @desc    Relatório de frequência
// @access  Private (Admin/Instructor)
router.get('/report', [auth, adminOrInstructor], async (req, res) => {
  try {
    const {
      data_inicio,
      data_fim,
      turma_id,
      grupo,
      formato = 'json'
    } = req.query;
    
    if (!data_inicio || !data_fim) {
      return res.status(400).json({
        success: false,
        message: 'Data de início e fim são obrigatórias'
      });
    }
    
    const startDate = new Date(data_inicio);
    const endDate = new Date(data_fim);
    
    const query = {
      data: {
        $gte: startDate,
        $lte: endDate
      }
    };
    
    if (turma_id) query.turma_id = turma_id;
    if (grupo) query.grupo = grupo;
    
    const attendance = await Attendance.find(query)
      .populate('aluno_id', 'nome grupo faixa_atual email telefone')
      .populate({
        path: 'aula_id',
        select: 'data hora_inicio hora_fim',
        populate: {
          path: 'turma_id',
          select: 'nome grupo nivel'
        }
      })
      .sort({ data: 1, 'aluno_id.nome': 1 });
    
    // Agrupar por aluno
    const studentAttendance = {};
    
    attendance.forEach(record => {
      const studentId = record.aluno_id._id.toString();
      
      if (!studentAttendance[studentId]) {
        studentAttendance[studentId] = {
          aluno: {
            id: record.aluno_id._id,
            nome: record.aluno_id.nome,
            grupo: record.aluno_id.grupo,
            faixa_atual: record.aluno_id.faixa_atual,
            email: record.aluno_id.email,
            telefone: record.aluno_id.telefone
          },
          registros: [],
          estatisticas: {
            total_aulas: 0,
            presencas: 0,
            faltas: 0,
            taxa_presenca: 0
          }
        };
      }
      
      studentAttendance[studentId].registros.push({
        data: record.data,
        presente: record.presente,
        aula: {
          id: record.aula_id._id,
          hora_inicio: record.aula_id.hora_inicio,
          hora_fim: record.aula_id.hora_fim,
          turma: record.aula_id.turma_id.nome
        },
        observacoes: record.observacoes
      });
      
      studentAttendance[studentId].estatisticas.total_aulas++;
      if (record.presente) {
        studentAttendance[studentId].estatisticas.presencas++;
      } else {
        studentAttendance[studentId].estatisticas.faltas++;
      }
    });
    
    // Calcular taxa de presença
    Object.values(studentAttendance).forEach(student => {
      const { total_aulas, presencas } = student.estatisticas;
      student.estatisticas.taxa_presenca = total_aulas > 0 ? 
        Math.round((presencas / total_aulas) * 10000) / 100 : 0;
    });
    
    const reportData = {
      periodo: {
        inicio: startDate,
        fim: endDate
      },
      filtros: {
        turma_id,
        grupo
      },
      alunos: Object.values(studentAttendance),
      resumo: {
        total_alunos: Object.keys(studentAttendance).length,
        total_registros: attendance.length,
        total_presencas: attendance.filter(r => r.presente).length,
        total_faltas: attendance.filter(r => !r.presente).length,
        taxa_presenca_geral: attendance.length > 0 ? 
          Math.round((attendance.filter(r => r.presente).length / attendance.length) * 10000) / 100 : 0
      }
    };
    
    if (formato === 'csv') {
      // Gerar CSV
      let csv = 'Nome,Grupo,Faixa,Email,Telefone,Total Aulas,Presenças,Faltas,Taxa Presença\n';
      
      reportData.alunos.forEach(student => {
        csv += `"${student.aluno.nome}","${student.aluno.grupo}","${student.aluno.faixa_atual}","${student.aluno.email}","${student.aluno.telefone}",${student.estatisticas.total_aulas},${student.estatisticas.presencas},${student.estatisticas.faltas},${student.estatisticas.taxa_presenca}%\n`;
      });
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="relatorio-frequencia-${startDate.toISOString().split('T')[0]}-${endDate.toISOString().split('T')[0]}.csv"`);
      return res.send(csv);
    }
    
    res.json({
      success: true,
      data: reportData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/attendance/:id
// @desc    Obter presença por ID
// @access  Private
router.get('/:id', [auth, ...validateParams.mongoId], async (req, res) => {
  try {
    const attendance = await Attendance.findById(req.params.id)
      .populate('aluno_id', 'nome grupo faixa_atual email telefone')
      .populate({
        path: 'aula_id',
        select: 'data hora_inicio hora_fim status',
        populate: {
          path: 'turma_id',
          select: 'nome grupo nivel'
        }
      });
    
    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: 'Registro de presença não encontrado'
      });
    }
    
    // Verificar permissão
    if (req.user.perfil === 'aluno') {
      const student = await Student.findOne({ user_id: req.user._id });
      if (!student || !attendance.aluno_id._id.equals(student._id)) {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado'
        });
      }
    }
    
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

// @route   POST /api/attendance
// @desc    Registrar presença
// @access  Private (Admin/Instructor)
router.post('/', [auth, adminOrInstructor, ...validateAttendance.create], async (req, res) => {
  try {
    const { aula_id, aluno_id, presente, observacoes } = req.body;
    
    // Verificar se a aula existe
    const lesson = await Lesson.findById(aula_id).populate('turma_id');
    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: 'Aula não encontrada'
      });
    }
    
    // Verificar se o aluno existe
    const student = await Student.findById(aluno_id);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Aluno não encontrado'
      });
    }
    
    // Verificar se já existe registro de presença
    const existingAttendance = await Attendance.findOne({
      aula_id,
      aluno_id
    });
    
    if (existingAttendance) {
      return res.status(400).json({
        success: false,
        message: 'Já existe registro de presença para este aluno nesta aula'
      });
    }
    
    const attendanceData = {
      aluno_id,
      aula_id,
      turma_id: lesson.turma_id._id,
      data: lesson.data,
      hora_inicio: lesson.hora_inicio,
      hora_fim: lesson.hora_fim,
      grupo: lesson.grupo,
      presente,
      observacoes,
      registrado_por: req.user._id
    };
    
    const attendance = new Attendance(attendanceData);
    await attendance.save();
    
    await attendance.populate([
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
      message: 'Presença registrada com sucesso',
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

// @route   POST /api/attendance/bulk
// @desc    Registrar presenças em lote
// @access  Private (Admin/Instructor)
router.post('/bulk', [auth, adminOrInstructor], async (req, res) => {
  try {
    const { aula_id, presencas } = req.body;
    
    if (!aula_id || !Array.isArray(presencas) || presencas.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'ID da aula e lista de presenças são obrigatórios'
      });
    }
    
    // Verificar se a aula existe
    const lesson = await Lesson.findById(aula_id).populate('turma_id');
    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: 'Aula não encontrada'
      });
    }
    
    const results = {
      sucesso: [],
      erros: []
    };
    
    for (const presencaData of presencas) {
      try {
        const { aluno_id, presente, observacoes } = presencaData;
        
        // Verificar se o aluno existe
        const student = await Student.findById(aluno_id);
        if (!student) {
          results.erros.push({
            aluno_id,
            erro: 'Aluno não encontrado'
          });
          continue;
        }
        
        // Verificar se já existe registro
        const existingAttendance = await Attendance.findOne({
          aula_id,
          aluno_id
        });
        
        if (existingAttendance) {
          // Atualizar registro existente
          existingAttendance.presente = presente;
          if (observacoes) existingAttendance.observacoes = observacoes;
          existingAttendance.atualizado_por = req.user._id;
          existingAttendance.atualizado_em = new Date();
          
          await existingAttendance.save();
          
          results.sucesso.push({
            aluno_id,
            nome: student.nome,
            acao: 'atualizado'
          });
        } else {
          // Criar novo registro
          const attendanceData = {
            aluno_id,
            aula_id,
            turma_id: lesson.turma_id._id,
            data: lesson.data,
            hora_inicio: lesson.hora_inicio,
            hora_fim: lesson.hora_fim,
            grupo: lesson.grupo,
            presente,
            observacoes,
            registrado_por: req.user._id
          };
          
          const attendance = new Attendance(attendanceData);
          await attendance.save();
          
          results.sucesso.push({
            aluno_id,
            nome: student.nome,
            acao: 'criado'
          });
        }
      } catch (error) {
        results.erros.push({
          aluno_id: presencaData.aluno_id,
          erro: error.message
        });
      }
    }
    
    res.json({
      success: true,
      message: `Processamento concluído: ${results.sucesso.length} sucessos, ${results.erros.length} erros`,
      data: results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   PUT /api/attendance/:id
// @desc    Atualizar presença
// @access  Private (Admin/Instructor)
router.put('/:id', [auth, adminOrInstructor, ...validateParams.mongoId, ...validateAttendance.update], async (req, res) => {
  try {
    const attendance = await Attendance.findById(req.params.id);
    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: 'Registro de presença não encontrado'
      });
    }
    
    const { presente, observacoes } = req.body;
    
    attendance.presente = presente !== undefined ? presente : attendance.presente;
    if (observacoes !== undefined) attendance.observacoes = observacoes;
    attendance.atualizado_por = req.user._id;
    attendance.atualizado_em = new Date();
    
    await attendance.save();
    
    await attendance.populate([
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
    
    res.json({
      success: true,
      message: 'Presença atualizada com sucesso',
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

// @route   DELETE /api/attendance/:id
// @desc    Deletar registro de presença
// @access  Private (Admin only)
router.delete('/:id', [auth, adminOnly, ...validateParams.mongoId], async (req, res) => {
  try {
    const attendance = await Attendance.findById(req.params.id);
    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: 'Registro de presença não encontrado'
      });
    }
    
    await Attendance.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'Registro de presença deletado com sucesso'
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