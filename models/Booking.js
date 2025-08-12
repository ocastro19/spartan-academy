const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
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
  status: {
    type: String,
    enum: ['confirmado', 'espera', 'cancelado', 'presente', 'falta', 'no_show'],
    default: 'confirmado'
  },
  tipo_agendamento: {
    type: String,
    enum: ['normal', 'walkin_preta', 'reposicao', 'cortesia'],
    default: 'normal'
  },
  data_agendamento: {
    type: Date,
    default: Date.now
  },
  data_cancelamento: {
    type: Date,
    default: null
  },
  motivo_cancelamento: {
    type: String,
    maxlength: [200, 'Motivo deve ter no máximo 200 caracteres']
  },
  checkin_realizado: {
    type: Boolean,
    default: false
  },
  data_checkin: {
    type: Date,
    default: null
  },
  posicao_lista_espera: {
    type: Number,
    default: null
  },
  notificacoes: {
    lembrete_enviado: {
      type: Boolean,
      default: false
    },
    confirmacao_enviada: {
      type: Boolean,
      default: false
    },
    cancelamento_enviado: {
      type: Boolean,
      default: false
    }
  },
  observacoes: {
    type: String,
    maxlength: [300, 'Observações devem ter no máximo 300 caracteres']
  },
  metadata: {
    ip_agendamento: String,
    user_agent: String,
    origem: {
      type: String,
      enum: ['app', 'web', 'admin', 'api'],
      default: 'web'
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Índices
bookingSchema.index({ aula_id: 1, aluno_id: 1 }, { unique: true });
bookingSchema.index({ aluno_id: 1, status: 1 });
bookingSchema.index({ aula_id: 1, status: 1 });
bookingSchema.index({ data_agendamento: 1 });
bookingSchema.index({ posicao_lista_espera: 1 });
bookingSchema.index({ checkin_realizado: 1 });

// Virtual para verificar se pode fazer check-in
bookingSchema.virtual('pode_checkin').get(function() {
  return this.status === 'confirmado' && !this.checkin_realizado;
});

// Virtual para verificar se está na lista de espera
bookingSchema.virtual('na_lista_espera').get(function() {
  return this.status === 'espera';
});

// Virtual para tempo até a aula (requer populate da aula)
bookingSchema.virtual('tempo_ate_aula').get(function() {
  if (!this.aula_id || !this.aula_id.hora_inicio) return null;
  
  const agora = new Date();
  const diferenca = this.aula_id.hora_inicio - agora;
  
  if (diferenca <= 0) return null;
  
  const horas = Math.floor(diferenca / (1000 * 60 * 60));
  const minutos = Math.floor((diferenca % (1000 * 60 * 60)) / (1000 * 60));
  
  return { horas, minutos, total_minutos: Math.floor(diferenca / (1000 * 60)) };
});

// Método para realizar check-in
bookingSchema.methods.realizarCheckin = async function() {
  if (this.checkin_realizado) {
    throw new Error('Check-in já foi realizado');
  }
  
  if (this.status !== 'confirmado') {
    throw new Error('Apenas agendamentos confirmados podem fazer check-in');
  }
  
  // Verificar se está dentro da janela de check-in
  const aula = await mongoose.model('Lesson').findById(this.aula_id).populate('turma_id');
  if (!aula) {
    throw new Error('Aula não encontrada');
  }
  
  if (!aula.checkinLiberado(aula.turma_id)) {
    throw new Error('Check-in não está liberado para esta aula');
  }
  
  this.checkin_realizado = true;
  this.data_checkin = new Date();
  
  // Criar registro de presença
  const Attendance = mongoose.model('Attendance');
  await Attendance.create({
    aula_id: this.aula_id,
    aluno_id: this.aluno_id,
    modo: this.tipo_agendamento === 'walkin_preta' ? 'walkin_preta' : 'agendamento',
    checkin_hora: this.data_checkin,
    status: 'presente'
  });
  
  return this.save();
};

// Método para cancelar agendamento
bookingSchema.methods.cancelar = async function(motivo = '', liberarVaga = true) {
  if (this.status === 'cancelado') {
    throw new Error('Agendamento já está cancelado');
  }
  
  const statusAnterior = this.status;
  this.status = 'cancelado';
  this.data_cancelamento = new Date();
  this.motivo_cancelamento = motivo;
  
  await this.save();
  
  // Se estava confirmado e deve liberar vaga, promover da lista de espera
  if (statusAnterior === 'confirmado' && liberarVaga) {
    await this.promoverListaEspera();
  }
  
  return this;
};

// Método para promover da lista de espera
bookingSchema.methods.promoverListaEspera = async function() {
  // Buscar próximo da lista de espera
  const proximoEspera = await this.constructor.findOne({
    aula_id: this.aula_id,
    status: 'espera'
  }).sort({ posicao_lista_espera: 1 }).populate('aluno_id');
  
  if (proximoEspera) {
    proximoEspera.status = 'confirmado';
    proximoEspera.posicao_lista_espera = null;
    await proximoEspera.save();
    
    // Reordenar lista de espera
    await this.reordenarListaEspera();
    
    // Enviar notificação (implementar depois)
    // await this.enviarNotificacaoPromocao(proximoEspera);
    
    return proximoEspera;
  }
  
  return null;
};

// Método para reordenar lista de espera
bookingSchema.methods.reordenarListaEspera = async function() {
  const listaEspera = await this.constructor.find({
    aula_id: this.aula_id,
    status: 'espera'
  }).sort({ data_agendamento: 1 });
  
  for (let i = 0; i < listaEspera.length; i++) {
    listaEspera[i].posicao_lista_espera = i + 1;
    await listaEspera[i].save();
  }
};

// Método estático para criar agendamento
bookingSchema.statics.criarAgendamento = async function(aulaId, alunoId, tipoAgendamento = 'normal') {
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
  
  // Verificar se aluno pode participar da turma
  const podeParticipar = aula.turma_id.podeParticipar(aluno);
  if (!podeParticipar.pode) {
    throw new Error(podeParticipar.motivo);
  }
  
  // Verificar se já tem agendamento para esta aula
  const agendamentoExistente = await this.findOne({
    aula_id: aulaId,
    aluno_id: alunoId,
    status: { $in: ['confirmado', 'espera', 'presente'] }
  });
  
  if (agendamentoExistente) {
    throw new Error('Aluno já tem agendamento para esta aula');
  }
  
  // Verificar capacidade
  const totalConfirmados = await this.countDocuments({
    aula_id: aulaId,
    status: 'confirmado'
  });
  
  let status = 'confirmado';
  let posicaoListaEspera = null;
  
  // Se não é faixa preta e a aula está lotada, vai para lista de espera
  if (!aluno.is_preta && totalConfirmados >= aula.capacidade_efetiva) {
    if (!aula.turma_id.configuracoes.permite_lista_espera) {
      throw new Error('Aula lotada e lista de espera não permitida');
    }
    
    status = 'espera';
    const ultimaPosicao = await this.findOne({
      aula_id: aulaId,
      status: 'espera'
    }).sort({ posicao_lista_espera: -1 });
    
    posicaoListaEspera = ultimaPosicao ? ultimaPosicao.posicao_lista_espera + 1 : 1;
  }
  
  // Criar agendamento
  const agendamento = new this({
    aula_id: aulaId,
    aluno_id: alunoId,
    status: status,
    tipo_agendamento: tipoAgendamento,
    posicao_lista_espera: posicaoListaEspera
  });
  
  await agendamento.save();
  
  // Atualizar estatísticas da aula
  await aula.atualizarEstatisticas();
  
  return agendamento;
};

// Método estático para processar no-shows
bookingSchema.statics.processarNoShows = async function(aulaId) {
  const agora = new Date();
  
  // Buscar aula
  const Lesson = mongoose.model('Lesson');
  const aula = await Lesson.findById(aulaId);
  
  if (!aula || aula.status !== 'finalizada') {
    throw new Error('Aula deve estar finalizada para processar no-shows');
  }
  
  // Marcar como no-show quem não fez check-in
  const noShows = await this.updateMany({
    aula_id: aulaId,
    status: 'confirmado',
    checkin_realizado: false
  }, {
    status: 'no_show'
  });
  
  // Criar registros de falta
  const agendamentosSemCheckin = await this.find({
    aula_id: aulaId,
    status: 'no_show'
  });
  
  const Attendance = mongoose.model('Attendance');
  for (const agendamento of agendamentosSemCheckin) {
    await Attendance.create({
      aula_id: aulaId,
      aluno_id: agendamento.aluno_id,
      modo: 'agendamento',
      status: 'falta',
      observacao: 'No-show - não fez check-in'
    });
  }
  
  return noShows.modifiedCount;
};

// Middleware para validações
bookingSchema.pre('save', function(next) {
  // Se está sendo cancelado, limpar posição da lista de espera
  if (this.status === 'cancelado') {
    this.posicao_lista_espera = null;
  }
  
  next();
});

// Middleware pós-save para atualizar estatísticas
bookingSchema.post('save', async function() {
  if (this.aula_id) {
    const Lesson = mongoose.model('Lesson');
    const aula = await Lesson.findById(this.aula_id);
    if (aula) {
      await aula.atualizarEstatisticas();
    }
  }
});

module.exports = mongoose.model('Booking', bookingSchema);