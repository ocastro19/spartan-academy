const mongoose = require('mongoose');

const classSchema = new mongoose.Schema({
  nome: {
    type: String,
    required: [true, 'Nome da turma é obrigatório'],
    trim: true,
    maxlength: [100, 'Nome deve ter no máximo 100 caracteres']
  },
  grupo: {
    type: String,
    enum: ['adulto', 'kids', 'ambos'],
    required: [true, 'Grupo é obrigatório']
  },
  dias_semana: [{
    type: String,
    enum: ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'],
    required: true
  }],
  hora_inicio: {
    type: String,
    required: [true, 'Hora de início é obrigatória'],
    match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato de hora inválido (HH:MM)']
  },
  hora_fim: {
    type: String,
    required: [true, 'Hora de fim é obrigatória'],
    match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato de hora inválido (HH:MM)']
  },
  capacidade: {
    type: Number,
    required: [true, 'Capacidade é obrigatória'],
    min: [1, 'Capacidade deve ser pelo menos 1'],
    max: [100, 'Capacidade não pode exceder 100']
  },
  exige_agendamento: {
    type: Boolean,
    default: true
  },
  janela_checkin_minutos: {
    type: Number,
    default: 60,
    min: [5, 'Janela mínima de 5 minutos'],
    max: [480, 'Janela máxima de 8 horas']
  },
  instrutor_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Instrutor é obrigatório']
  },
  descricao: {
    type: String,
    maxlength: [500, 'Descrição deve ter no máximo 500 caracteres']
  },
  nivel: {
    type: String,
    enum: ['iniciante', 'intermediario', 'avancado', 'todos'],
    default: 'todos'
  },
  faixas_permitidas: [{
    type: String,
    enum: ['branca', 'cinza', 'amarela', 'laranja', 'verde', 'azul', 'roxa', 'marrom', 'preta']
  }],
  tipo_aula: {
    type: String,
    enum: ['gi', 'nogi', 'mista', 'competicao', 'tecnica', 'sparring'],
    default: 'mista'
  },
  ativa: {
    type: Boolean,
    default: true
  },
  configuracoes: {
    permite_lista_espera: {
      type: Boolean,
      default: true
    },
    notificar_instrutor: {
      type: Boolean,
      default: true
    },
    checkin_automatico_preta: {
      type: Boolean,
      default: true
    },
    multa_no_show: {
      ativa: { type: Boolean, default: false },
      valor: { type: Number, default: 0 }
    }
  },
  estatisticas: {
    total_aulas_realizadas: {
      type: Number,
      default: 0
    },
    media_presencas: {
      type: Number,
      default: 0
    },
    taxa_ocupacao: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Índices
classSchema.index({ grupo: 1 });
classSchema.index({ dias_semana: 1 });
classSchema.index({ hora_inicio: 1 });
classSchema.index({ instrutor_id: 1 });
classSchema.index({ ativa: 1 });
classSchema.index({ tipo_aula: 1 });

// Virtual para duração da aula em minutos
classSchema.virtual('duracao_minutos').get(function() {
  const [horaInicio, minutoInicio] = this.hora_inicio.split(':').map(Number);
  const [horaFim, minutoFim] = this.hora_fim.split(':').map(Number);
  
  const inicioMinutos = horaInicio * 60 + minutoInicio;
  const fimMinutos = horaFim * 60 + minutoFim;
  
  return fimMinutos - inicioMinutos;
});

// Virtual para próxima aula
classSchema.virtual('proxima_aula').get(function() {
  const hoje = new Date();
  const diasSemanaNum = {
    'domingo': 0, 'segunda': 1, 'terca': 2, 'quarta': 3,
    'quinta': 4, 'sexta': 5, 'sabado': 6
  };
  
  const diasAula = this.dias_semana.map(dia => diasSemanaNum[dia]).sort();
  const hojeDia = hoje.getDay();
  
  let proximoDia = diasAula.find(dia => dia > hojeDia);
  if (!proximoDia) {
    proximoDia = diasAula[0]; // Próxima semana
  }
  
  const diasAte = proximoDia > hojeDia ? proximoDia - hojeDia : 7 - hojeDia + proximoDia;
  const proximaData = new Date(hoje);
  proximaData.setDate(hoje.getDate() + diasAte);
  
  const [hora, minuto] = this.hora_inicio.split(':').map(Number);
  proximaData.setHours(hora, minuto, 0, 0);
  
  return proximaData;
});

// Método para verificar se um aluno pode participar da turma
classSchema.methods.podeParticipar = function(aluno) {
  // Verificar grupo
  if (this.grupo !== 'ambos' && this.grupo !== aluno.grupo) {
    return { pode: false, motivo: 'Grupo não compatível' };
  }
  
  // Verificar faixas permitidas
  if (this.faixas_permitidas.length > 0 && !this.faixas_permitidas.includes(aluno.faixa_atual)) {
    return { pode: false, motivo: 'Faixa não permitida para esta turma' };
  }
  
  // Verificar se a turma está ativa
  if (!this.ativa) {
    return { pode: false, motivo: 'Turma inativa' };
  }
  
  // Verificar se o aluno está bloqueado
  if (aluno.configuracoes.bloqueio_checkin) {
    return { pode: false, motivo: aluno.configuracoes.motivo_bloqueio || 'Aluno bloqueado' };
  }
  
  return { pode: true, motivo: null };
};

// Método para calcular horário limite de check-in
classSchema.methods.calcularLimiteCheckin = function(dataAula) {
  const [hora, minuto] = this.hora_inicio.split(':').map(Number);
  const inicioAula = new Date(dataAula);
  inicioAula.setHours(hora, minuto, 0, 0);
  
  const limiteCheckin = new Date(inicioAula);
  limiteCheckin.setMinutes(limiteCheckin.getMinutes() - this.janela_checkin_minutos);
  
  return limiteCheckin;
};

// Método para gerar aulas da semana
classSchema.methods.gerarAulasSemana = function(dataInicio, dataFim) {
  const aulas = [];
  const diasSemanaNum = {
    'domingo': 0, 'segunda': 1, 'terca': 2, 'quarta': 3,
    'quinta': 4, 'sexta': 5, 'sabado': 6
  };
  
  const diasAula = this.dias_semana.map(dia => diasSemanaNum[dia]);
  const dataAtual = new Date(dataInicio);
  
  while (dataAtual <= dataFim) {
    if (diasAula.includes(dataAtual.getDay())) {
      const [horaInicio, minutoInicio] = this.hora_inicio.split(':').map(Number);
      const [horaFim, minutoFim] = this.hora_fim.split(':').map(Number);
      
      const dataAula = new Date(dataAtual);
      const inicioAula = new Date(dataAula);
      inicioAula.setHours(horaInicio, minutoInicio, 0, 0);
      
      const fimAula = new Date(dataAula);
      fimAula.setHours(horaFim, minutoFim, 0, 0);
      
      aulas.push({
        turma_id: this._id,
        data: dataAula,
        hora_inicio: inicioAula,
        hora_fim: fimAula,
        capacidade: this.capacidade,
        status: 'agendada'
      });
    }
    
    dataAtual.setDate(dataAtual.getDate() + 1);
  }
  
  return aulas;
};

// Validação customizada para horários
classSchema.pre('save', function(next) {
  const [horaInicio, minutoInicio] = this.hora_inicio.split(':').map(Number);
  const [horaFim, minutoFim] = this.hora_fim.split(':').map(Number);
  
  const inicioMinutos = horaInicio * 60 + minutoInicio;
  const fimMinutos = horaFim * 60 + minutoFim;
  
  if (fimMinutos <= inicioMinutos) {
    return next(new Error('Hora de fim deve ser posterior à hora de início'));
  }
  
  // Se não tem faixas específicas, permite todas
  if (!this.faixas_permitidas || this.faixas_permitidas.length === 0) {
    this.faixas_permitidas = ['branca', 'cinza', 'amarela', 'laranja', 'verde', 'azul', 'roxa', 'marrom', 'preta'];
  }
  
  next();
});

module.exports = mongoose.model('Class', classSchema);