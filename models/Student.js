const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  usuario_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  nome: {
    type: String,
    required: [true, 'Nome é obrigatório'],
    trim: true,
    maxlength: [100, 'Nome deve ter no máximo 100 caracteres']
  },
  data_nascimento: {
    type: Date,
    required: [true, 'Data de nascimento é obrigatória']
  },
  grupo: {
    type: String,
    enum: ['adulto', 'kids'],
    required: [true, 'Grupo é obrigatório']
  },
  faixa_atual: {
    type: String,
    enum: ['branca', 'cinza', 'amarela', 'laranja', 'verde', 'azul', 'roxa', 'marrom', 'preta'],
    required: [true, 'Faixa atual é obrigatória'],
    default: 'branca'
  },
  graus: {
    type: Number,
    min: 0,
    max: 10,
    default: 0
  },
  is_preta: {
    type: Boolean,
    default: false
  },
  dia_vencimento: {
    type: Number,
    min: 1,
    max: 31,
    required: [true, 'Dia de vencimento é obrigatório'],
    default: 10
  },
  valor_mensalidade: {
    type: Number,
    required: [true, 'Valor da mensalidade é obrigatório'],
    min: [0, 'Valor deve ser positivo']
  },
  observacoes: {
    type: String,
    maxlength: [500, 'Observações devem ter no máximo 500 caracteres']
  },
  responsavel_financeiro: {
    nome: String,
    cpf: String,
    telefone: String,
    email: String,
    parentesco: {
      type: String,
      enum: ['pai', 'mae', 'responsavel', 'proprio']
    }
  },
  status: {
    type: String,
    enum: ['ativo', 'inativo', 'suspenso', 'trancado'],
    default: 'ativo'
  },
  endereco: {
    cep: String,
    logradouro: String,
    numero: String,
    complemento: String,
    bairro: String,
    cidade: String,
    estado: String
  },
  contato: {
    telefone: String,
    email: String,
    whatsapp: String
  },
  dados_medicos: {
    tipo_sanguineo: {
      type: String,
      enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
    },
    alergias: [String],
    medicamentos: [String],
    restricoes: String,
    contato_emergencia: {
      nome: String,
      telefone: String,
      parentesco: String
    }
  },
  configuracoes: {
    bloqueio_checkin: {
      type: Boolean,
      default: false
    },
    motivo_bloqueio: String,
    data_bloqueio: Date,
    isento_agendamento: {
      type: Boolean,
      default: false
    }
  },
  estatisticas: {
    total_presencas: {
      type: Number,
      default: 0
    },
    total_faltas: {
      type: Number,
      default: 0
    },
    percentual_assiduidade: {
      type: Number,
      default: 0
    },
    ultima_presenca: Date,
    dias_na_faixa_atual: {
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
studentSchema.index({ nome: 1 });
studentSchema.index({ grupo: 1 });
studentSchema.index({ faixa_atual: 1 });
studentSchema.index({ status: 1 });
studentSchema.index({ dia_vencimento: 1 });
studentSchema.index({ 'configuracoes.bloqueio_checkin': 1 });
studentSchema.index({ usuario_id: 1 });

// Virtual para idade
studentSchema.virtual('idade').get(function() {
  if (!this.data_nascimento) return null;
  const hoje = new Date();
  const nascimento = new Date(this.data_nascimento);
  let idade = hoje.getFullYear() - nascimento.getFullYear();
  const mesAtual = hoje.getMonth();
  const mesNascimento = nascimento.getMonth();
  
  if (mesAtual < mesNascimento || (mesAtual === mesNascimento && hoje.getDate() < nascimento.getDate())) {
    idade--;
  }
  
  return idade;
});

// Virtual para nome da faixa com graus
studentSchema.virtual('faixa_completa').get(function() {
  const faixa = this.faixa_atual;
  const graus = this.graus;
  
  if (graus > 0) {
    return `${faixa} ${graus}° grau`;
  }
  return faixa;
});

// Virtual para verificar se é menor de idade
studentSchema.virtual('menor_idade').get(function() {
  return this.idade < 18;
});

// Middleware para atualizar is_preta baseado na faixa
studentSchema.pre('save', function(next) {
  this.is_preta = this.faixa_atual === 'preta';
  
  // Se é faixa preta, isenta de agendamento
  if (this.is_preta) {
    this.configuracoes.isento_agendamento = true;
  }
  
  next();
});

// Método para calcular assiduidade
studentSchema.methods.calcularAssiduidade = function() {
  const totalAulas = this.estatisticas.total_presencas + this.estatisticas.total_faltas;
  if (totalAulas === 0) return 0;
  
  const percentual = (this.estatisticas.total_presencas / totalAulas) * 100;
  this.estatisticas.percentual_assiduidade = Math.round(percentual * 100) / 100;
  
  return this.estatisticas.percentual_assiduidade;
};

// Método para verificar elegibilidade para graduação
studentSchema.methods.verificarElegibilidadeGraduacao = function(requisitos = {}) {
  const {
    presencas_minimas = 50,
    dias_minimos_faixa = 180,
    assiduidade_minima = 70
  } = requisitos;
  
  const diasNaFaixa = this.estatisticas.dias_na_faixa_atual || 0;
  const totalPresencas = this.estatisticas.total_presencas || 0;
  const assiduidade = this.estatisticas.percentual_assiduidade || 0;
  
  return {
    elegivel: diasNaFaixa >= dias_minimos_faixa && 
              totalPresencas >= presencas_minimas && 
              assiduidade >= assiduidade_minima,
    criterios: {
      dias_na_faixa: { atual: diasNaFaixa, minimo: dias_minimos_faixa, ok: diasNaFaixa >= dias_minimos_faixa },
      presencas: { atual: totalPresencas, minimo: presencas_minimas, ok: totalPresencas >= presencas_minimas },
      assiduidade: { atual: assiduidade, minimo: assiduidade_minima, ok: assiduidade >= assiduidade_minima }
    }
  };
};

// Método para bloquear/desbloquear check-in
studentSchema.methods.alterarBloqueioCheckin = function(bloquear, motivo = '') {
  this.configuracoes.bloqueio_checkin = bloquear;
  this.configuracoes.motivo_bloqueio = bloquear ? motivo : null;
  this.configuracoes.data_bloqueio = bloquear ? new Date() : null;
  
  return this.save();
};

module.exports = mongoose.model('Student', studentSchema);