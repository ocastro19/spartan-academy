const mongoose = require('mongoose');

const lessonSchema = new mongoose.Schema({
  turma_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: [true, 'Turma é obrigatória']
  },
  data: {
    type: Date,
    required: [true, 'Data da aula é obrigatória']
  },
  hora_inicio: {
    type: Date,
    required: [true, 'Hora de início é obrigatória']
  },
  hora_fim: {
    type: Date,
    required: [true, 'Hora de fim é obrigatória']
  },
  capacidade_override: {
    type: Number,
    min: [1, 'Capacidade deve ser pelo menos 1'],
    default: null
  },
  status: {
    type: String,
    enum: ['agendada', 'em_andamento', 'finalizada', 'cancelada', 'adiada'],
    default: 'agendada'
  },
  instrutor_substituto: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  observacoes: {
    type: String,
    maxlength: [500, 'Observações devem ter no máximo 500 caracteres']
  },
  tema_aula: {
    type: String,
    maxlength: [200, 'Tema deve ter no máximo 200 caracteres']
  },
  tecnicas_ensinadas: [{
    nome: String,
    categoria: {
      type: String,
      enum: ['guarda', 'passagem', 'finalizacao', 'takedown', 'escape', 'transicao', 'defesa']
    },
    nivel: {
      type: String,
      enum: ['basico', 'intermediario', 'avancado']
    }
  }],
  configuracoes: {
    checkin_liberado: {
      type: Boolean,
      default: true
    },
    permite_walkin: {
      type: Boolean,
      default: true
    },
    notificacoes_enviadas: {
      lembrete_24h: { type: Boolean, default: false },
      lembrete_2h: { type: Boolean, default: false },
      inicio_aula: { type: Boolean, default: false }
    }
  },
  estatisticas: {
    total_agendados: {
      type: Number,
      default: 0
    },
    total_presentes: {
      type: Number,
      default: 0
    },
    total_faltas: {
      type: Number,
      default: 0
    },
    lista_espera: {
      type: Number,
      default: 0
    },
    taxa_presenca: {
      type: Number,
      default: 0
    }
  },
  clima: {
    temperatura: Number,
    condicoes: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Índices
lessonSchema.index({ turma_id: 1, data: 1 });
lessonSchema.index({ data: 1, hora_inicio: 1 });
lessonSchema.index({ status: 1 });
lessonSchema.index({ 'configuracoes.checkin_liberado': 1 });

// Virtual para capacidade efetiva
lessonSchema.virtual('capacidade_efetiva').get(function() {
  return this.capacidade_override || (this.turma_id && this.turma_id.capacidade) || 0;
});

// Virtual para vagas disponíveis
lessonSchema.virtual('vagas_disponiveis').get(function() {
  return Math.max(0, this.capacidade_efetiva - this.estatisticas.total_agendados);
});

// Virtual para verificar se está lotada
lessonSchema.virtual('lotada').get(function() {
  return this.estatisticas.total_agendados >= this.capacidade_efetiva;
});

// Virtual para duração em minutos
lessonSchema.virtual('duracao_minutos').get(function() {
  if (!this.hora_inicio || !this.hora_fim) return 0;
  return Math.round((this.hora_fim - this.hora_inicio) / (1000 * 60));
});

// Virtual para verificar se já passou
lessonSchema.virtual('ja_passou').get(function() {
  return new Date() > this.hora_fim;
});

// Virtual para verificar se está em andamento
lessonSchema.virtual('em_andamento').get(function() {
  const agora = new Date();
  return agora >= this.hora_inicio && agora <= this.hora_fim;
});

// Virtual para tempo até o início
lessonSchema.virtual('tempo_ate_inicio').get(function() {
  const agora = new Date();
  const diferenca = this.hora_inicio - agora;
  
  if (diferenca <= 0) return null;
  
  const horas = Math.floor(diferenca / (1000 * 60 * 60));
  const minutos = Math.floor((diferenca % (1000 * 60 * 60)) / (1000 * 60));
  
  return { horas, minutos, total_minutos: Math.floor(diferenca / (1000 * 60)) };
});

// Método para verificar se check-in está liberado
lessonSchema.methods.checkinLiberado = function(turma) {
  if (!this.configuracoes.checkin_liberado) return false;
  if (this.status !== 'agendada') return false;
  
  const agora = new Date();
  const janelaMinutos = turma ? turma.janela_checkin_minutos : 60;
  const limiteCheckin = new Date(this.hora_inicio);
  limiteCheckin.setMinutes(limiteCheckin.getMinutes() - janelaMinutos);
  
  return agora >= limiteCheckin && agora <= this.hora_inicio;
};

// Método para calcular taxa de presença
lessonSchema.methods.calcularTaxaPresenca = function() {
  const total = this.estatisticas.total_agendados;
  if (total === 0) return 0;
  
  const taxa = (this.estatisticas.total_presentes / total) * 100;
  this.estatisticas.taxa_presenca = Math.round(taxa * 100) / 100;
  
  return this.estatisticas.taxa_presenca;
};

// Método para atualizar estatísticas
lessonSchema.methods.atualizarEstatisticas = async function() {
  const Booking = mongoose.model('Booking');
  const Attendance = mongoose.model('Attendance');
  
  // Contar agendamentos
  const totalAgendados = await Booking.countDocuments({
    aula_id: this._id,
    status: { $in: ['confirmado', 'presente'] }
  });
  
  // Contar presenças
  const totalPresentes = await Attendance.countDocuments({
    aula_id: this._id,
    status: 'presente'
  });
  
  // Contar faltas
  const totalFaltas = await Attendance.countDocuments({
    aula_id: this._id,
    status: 'falta'
  });
  
  // Contar lista de espera
  const listaEspera = await Booking.countDocuments({
    aula_id: this._id,
    status: 'espera'
  });
  
  this.estatisticas.total_agendados = totalAgendados;
  this.estatisticas.total_presentes = totalPresentes;
  this.estatisticas.total_faltas = totalFaltas;
  this.estatisticas.lista_espera = listaEspera;
  
  this.calcularTaxaPresenca();
  
  return this.save();
};

// Método para finalizar aula
lessonSchema.methods.finalizar = function(observacoes = '') {
  this.status = 'finalizada';
  if (observacoes) {
    this.observacoes = observacoes;
  }
  
  return this.save();
};

// Método para cancelar aula
lessonSchema.methods.cancelar = function(motivo = '') {
  this.status = 'cancelada';
  this.observacoes = motivo;
  
  return this.save();
};

// Método para verificar conflitos de horário
lessonSchema.statics.verificarConflitos = async function(data, horaInicio, horaFim, instrutorId, aulaId = null) {
  const query = {
    data: data,
    status: { $ne: 'cancelada' },
    $or: [
      {
        hora_inicio: { $lt: horaFim },
        hora_fim: { $gt: horaInicio }
      }
    ]
  };
  
  if (aulaId) {
    query._id = { $ne: aulaId };
  }
  
  // Verificar conflito de instrutor
  const conflitosInstrutor = await this.find({
    ...query,
    $or: [
      { 'turma_id.instrutor_id': instrutorId },
      { instrutor_substituto: instrutorId }
    ]
  }).populate('turma_id');
  
  return {
    temConflito: conflitosInstrutor.length > 0,
    conflitos: conflitosInstrutor
  };
};

// Middleware para validações antes de salvar
lessonSchema.pre('save', function(next) {
  // Validar que hora_fim é posterior a hora_inicio
  if (this.hora_fim <= this.hora_inicio) {
    return next(new Error('Hora de fim deve ser posterior à hora de início'));
  }
  
  // Validar que a data não é no passado (apenas para novas aulas)
  if (this.isNew && this.data < new Date().setHours(0, 0, 0, 0)) {
    return next(new Error('Não é possível criar aulas no passado'));
  }
  
  next();
});

// Middleware para atualizar estatísticas após mudanças
lessonSchema.post('save', function() {
  // Atualizar estatísticas da turma
  if (this.turma_id) {
    this.constructor.aggregate([
      { $match: { turma_id: this.turma_id, status: 'finalizada' } },
      {
        $group: {
          _id: '$turma_id',
          total_aulas: { $sum: 1 },
          media_presencas: { $avg: '$estatisticas.total_presentes' },
          media_agendados: { $avg: '$estatisticas.total_agendados' }
        }
      }
    ]).then(result => {
      if (result.length > 0) {
        const Class = mongoose.model('Class');
        const stats = result[0];
        Class.findByIdAndUpdate(this.turma_id, {
          'estatisticas.total_aulas_realizadas': stats.total_aulas,
          'estatisticas.media_presencas': Math.round(stats.media_presencas * 100) / 100,
          'estatisticas.taxa_ocupacao': Math.round((stats.media_agendados / this.capacidade_efetiva) * 10000) / 100
        }).exec();
      }
    });
  }
});

module.exports = mongoose.model('Lesson', lessonSchema);