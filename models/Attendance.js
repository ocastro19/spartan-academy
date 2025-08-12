const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  aula_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lesson',
    required: [true, 'Aula é obrigatória']
  },
  aluno_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: [true, 'Aluno é obrigatório']
  },
  modo: {
    type: String,
    enum: ['agendamento', 'walkin_preta'],
    required: [true, 'Modo é obrigatório']
  },
  checkin_hora: {
    type: Date,
    default: null
  },
  checkout_hora: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    enum: ['presente', 'falta', 'atraso', 'saida_antecipada'],
    required: [true, 'Status é obrigatório']
  },
  observacao: {
    type: String,
    maxlength: [300, 'Observação deve ter no máximo 300 caracteres']
  },
  avaliacao_aula: {
    nota: {
      type: Number,
      min: 1,
      max: 5
    },
    comentario: {
      type: String,
      maxlength: [200, 'Comentário deve ter no máximo 200 caracteres']
    }
  },
  tempo_permanencia: {
    type: Number, // em minutos
    default: null
  },
  registrado_por: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  metadata: {
    ip_checkin: String,
    dispositivo: String,
    localizacao: {
      latitude: Number,
      longitude: Number
    },
    metodo_registro: {
      type: String,
      enum: ['qr_code', 'manual', 'automatico', 'nfc'],
      default: 'manual'
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Índices
attendanceSchema.index({ aula_id: 1, aluno_id: 1 }, { unique: true });
attendanceSchema.index({ aluno_id: 1, createdAt: -1 });
attendanceSchema.index({ aula_id: 1, status: 1 });
attendanceSchema.index({ status: 1, createdAt: -1 });
attendanceSchema.index({ checkin_hora: 1 });

// Virtual para verificar se chegou atrasado
attendanceSchema.virtual('chegou_atrasado').get(function() {
  if (!this.checkin_hora || !this.aula_id || !this.aula_id.hora_inicio) return false;
  return this.checkin_hora > this.aula_id.hora_inicio;
});

// Virtual para minutos de atraso
attendanceSchema.virtual('minutos_atraso').get(function() {
  if (!this.chegou_atrasado) return 0;
  return Math.round((this.checkin_hora - this.aula_id.hora_inicio) / (1000 * 60));
});

// Virtual para verificar se saiu antes do fim
attendanceSchema.virtual('saiu_antecipado').get(function() {
  if (!this.checkout_hora || !this.aula_id || !this.aula_id.hora_fim) return false;
  return this.checkout_hora < this.aula_id.hora_fim;
});

// Virtual para duração da permanência formatada
attendanceSchema.virtual('permanencia_formatada').get(function() {
  if (!this.tempo_permanencia) return null;
  
  const horas = Math.floor(this.tempo_permanencia / 60);
  const minutos = this.tempo_permanencia % 60;
  
  if (horas > 0) {
    return `${horas}h ${minutos}min`;
  }
  return `${minutos}min`;
});

// Método para realizar check-in
attendanceSchema.methods.realizarCheckin = function(observacao = '') {
  if (this.checkin_hora) {
    throw new Error('Check-in já foi realizado');
  }
  
  this.checkin_hora = new Date();
  this.status = 'presente';
  
  if (observacao) {
    this.observacao = observacao;
  }
  
  return this.save();
};

// Método para realizar check-out
attendanceSchema.methods.realizarCheckout = function(observacao = '') {
  if (!this.checkin_hora) {
    throw new Error('Check-in deve ser realizado antes do check-out');
  }
  
  if (this.checkout_hora) {
    throw new Error('Check-out já foi realizado');
  }
  
  this.checkout_hora = new Date();
  
  // Calcular tempo de permanência
  this.tempo_permanencia = Math.round((this.checkout_hora - this.checkin_hora) / (1000 * 60));
  
  // Verificar se saiu antecipadamente
  if (this.saiu_antecipado) {
    this.status = 'saida_antecipada';
  }
  
  if (observacao) {
    this.observacao = this.observacao ? `${this.observacao}; ${observacao}` : observacao;
  }
  
  return this.save();
};

// Método para avaliar aula
attendanceSchema.methods.avaliarAula = function(nota, comentario = '') {
  if (nota < 1 || nota > 5) {
    throw new Error('Nota deve estar entre 1 e 5');
  }
  
  this.avaliacao_aula = {
    nota: nota,
    comentario: comentario
  };
  
  return this.save();
};

// Método estático para registrar presença
attendanceSchema.statics.registrarPresenca = async function(aulaId, alunoId, modo = 'agendamento', dadosExtras = {}) {
  const Lesson = mongoose.model('Lesson');
  const Student = mongoose.model('Student');
  
  // Verificar se aula existe
  const aula = await Lesson.findById(aulaId).populate('turma_id');
  if (!aula) {
    throw new Error('Aula não encontrada');
  }
  
  // Verificar se aluno existe
  const aluno = await Student.findById(alunoId);
  if (!aluno) {
    throw new Error('Aluno não encontrado');
  }
  
  // Verificar se já tem presença registrada
  const presencaExistente = await this.findOne({
    aula_id: aulaId,
    aluno_id: alunoId
  });
  
  if (presencaExistente) {
    throw new Error('Presença já registrada para este aluno nesta aula');
  }
  
  // Criar registro de presença
  const presenca = new this({
    aula_id: aulaId,
    aluno_id: alunoId,
    modo: modo,
    checkin_hora: new Date(),
    status: 'presente',
    registrado_por: dadosExtras.registrado_por,
    observacao: dadosExtras.observacao,
    metadata: {
      ip_checkin: dadosExtras.ip,
      dispositivo: dadosExtras.dispositivo,
      localizacao: dadosExtras.localizacao,
      metodo_registro: dadosExtras.metodo_registro || 'manual'
    }
  });
  
  await presenca.save();
  
  // Atualizar estatísticas do aluno
  await aluno.updateOne({
    $inc: { 'estatisticas.total_presencas': 1 },
    $set: { 'estatisticas.ultima_presenca': new Date() }
  });
  
  // Recalcular assiduidade
  await aluno.calcularAssiduidade();
  await aluno.save();
  
  return presenca;
};

// Método estático para registrar falta
attendanceSchema.statics.registrarFalta = async function(aulaId, alunoId, motivo = '') {
  const Student = mongoose.model('Student');
  
  // Verificar se já tem registro
  const registroExistente = await this.findOne({
    aula_id: aulaId,
    aluno_id: alunoId
  });
  
  if (registroExistente) {
    throw new Error('Já existe registro para este aluno nesta aula');
  }
  
  // Criar registro de falta
  const falta = new this({
    aula_id: aulaId,
    aluno_id: alunoId,
    modo: 'agendamento',
    status: 'falta',
    observacao: motivo
  });
  
  await falta.save();
  
  // Atualizar estatísticas do aluno
  const aluno = await Student.findById(alunoId);
  if (aluno) {
    aluno.estatisticas.total_faltas += 1;
    await aluno.calcularAssiduidade();
    await aluno.save();
  }
  
  return falta;
};

// Método estático para obter relatório de assiduidade
attendanceSchema.statics.relatorioAssiduidade = async function(filtros = {}) {
  const {
    aluno_id,
    data_inicio,
    data_fim,
    turma_id,
    status
  } = filtros;
  
  const matchStage = {};
  
  if (aluno_id) matchStage.aluno_id = mongoose.Types.ObjectId(aluno_id);
  if (status) matchStage.status = status;
  
  const pipeline = [
    {
      $lookup: {
        from: 'lessons',
        localField: 'aula_id',
        foreignField: '_id',
        as: 'aula'
      }
    },
    { $unwind: '$aula' },
    {
      $lookup: {
        from: 'students',
        localField: 'aluno_id',
        foreignField: '_id',
        as: 'aluno'
      }
    },
    { $unwind: '$aluno' }
  ];
  
  // Filtros de data
  if (data_inicio || data_fim) {
    const dateFilter = {};
    if (data_inicio) dateFilter.$gte = new Date(data_inicio);
    if (data_fim) dateFilter.$lte = new Date(data_fim);
    matchStage['aula.data'] = dateFilter;
  }
  
  // Filtro de turma
  if (turma_id) {
    matchStage['aula.turma_id'] = mongoose.Types.ObjectId(turma_id);
  }
  
  pipeline.push({ $match: matchStage });
  
  // Agrupar por aluno
  pipeline.push({
    $group: {
      _id: '$aluno_id',
      aluno: { $first: '$aluno' },
      total_aulas: { $sum: 1 },
      presencas: {
        $sum: {
          $cond: [{ $eq: ['$status', 'presente'] }, 1, 0]
        }
      },
      faltas: {
        $sum: {
          $cond: [{ $eq: ['$status', 'falta'] }, 1, 0]
        }
      },
      atrasos: {
        $sum: {
          $cond: [{ $eq: ['$status', 'atraso'] }, 1, 0]
        }
      }
    }
  });
  
  // Calcular percentuais
  pipeline.push({
    $addFields: {
      percentual_presenca: {
        $round: [
          {
            $multiply: [
              { $divide: ['$presencas', '$total_aulas'] },
              100
            ]
          },
          2
        ]
      },
      percentual_faltas: {
        $round: [
          {
            $multiply: [
              { $divide: ['$faltas', '$total_aulas'] },
              100
            ]
          },
          2
        ]
      }
    }
  });
  
  // Ordenar por percentual de presença
  pipeline.push({ $sort: { percentual_presenca: -1 } });
  
  return this.aggregate(pipeline);
};

// Método estático para obter histórico de um aluno
attendanceSchema.statics.historicoAluno = async function(alunoId, limite = 50) {
  return this.find({ aluno_id: alunoId })
    .populate({
      path: 'aula_id',
      populate: {
        path: 'turma_id',
        select: 'nome grupo tipo_aula'
      }
    })
    .sort({ createdAt: -1 })
    .limit(limite);
};

// Middleware para atualizar status baseado em horários
attendanceSchema.pre('save', function(next) {
  // Se tem check-in e chegou atrasado, marcar como atraso
  if (this.checkin_hora && this.chegou_atrasado && this.status === 'presente') {
    this.status = 'atraso';
  }
  
  next();
});

// Middleware pós-save para atualizar estatísticas
attendanceSchema.post('save', async function() {
  // Atualizar estatísticas da aula
  if (this.aula_id) {
    const Lesson = mongoose.model('Lesson');
    const aula = await Lesson.findById(this.aula_id);
    if (aula) {
      await aula.atualizarEstatisticas();
    }
  }
  
  // Atualizar estatísticas do aluno
  if (this.aluno_id) {
    const Student = mongoose.model('Student');
    const aluno = await Student.findById(this.aluno_id);
    if (aluno) {
      await aluno.calcularAssiduidade();
      await aluno.save();
    }
  }
});

module.exports = mongoose.model('Attendance', attendanceSchema);