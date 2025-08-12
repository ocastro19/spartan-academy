const mongoose = require('mongoose');

const graduationSchema = new mongoose.Schema({
  aluno_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: [true, 'Aluno é obrigatório']
  },
  faixa: {
    type: String,
    enum: ['branca', 'cinza', 'amarela', 'laranja', 'verde', 'azul', 'roxa', 'marrom', 'preta'],
    required: [true, 'Faixa é obrigatória']
  },
  grau: {
    type: Number,
    min: 0,
    max: 10,
    default: 0
  },
  data: {
    type: Date,
    required: [true, 'Data da graduação é obrigatória'],
    default: Date.now
  },
  responsavel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Responsável pela graduação é obrigatório']
  },
  nota: {
    type: String,
    maxlength: [500, 'Nota deve ter no máximo 500 caracteres']
  },
  tipo_graduacao: {
    type: String,
    enum: ['promocao', 'grau', 'reconhecimento', 'transferencia'],
    default: 'promocao'
  },
  criterios_atendidos: {
    tempo_faixa_anterior: {
      dias: Number,
      atendido: Boolean
    },
    presencas_minimas: {
      total: Number,
      atendido: Boolean
    },
    assiduidade: {
      percentual: Number,
      atendido: Boolean
    },
    avaliacao_tecnica: {
      nota: Number,
      atendido: Boolean
    },
    comportamento: {
      nota: Number,
      atendido: Boolean
    }
  },
  cerimonia: {
    realizada: {
      type: Boolean,
      default: false
    },
    data_cerimonia: Date,
    local: String,
    presentes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    fotos: [String],
    video: String
  },
  certificado: {
    gerado: {
      type: Boolean,
      default: false
    },
    numero: String,
    arquivo: String,
    data_geracao: Date
  },
  observacoes: {
    type: String,
    maxlength: [1000, 'Observações devem ter no máximo 1000 caracteres']
  },
  validada: {
    type: Boolean,
    default: true
  },
  data_validacao: {
    type: Date,
    default: Date.now
  },
  validada_por: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Índices
graduationSchema.index({ aluno_id: 1, data: -1 });
graduationSchema.index({ faixa: 1, data: -1 });
graduationSchema.index({ responsavel: 1, data: -1 });
graduationSchema.index({ validada: 1 });
graduationSchema.index({ 'cerimonia.data_cerimonia': 1 });

// Virtual para nome completo da faixa
graduationSchema.virtual('faixa_completa').get(function() {
  if (this.grau > 0) {
    return `${this.faixa} ${this.grau}° grau`;
  }
  return this.faixa;
});

// Virtual para verificar se todos os critérios foram atendidos
graduationSchema.virtual('criterios_completos').get(function() {
  if (!this.criterios_atendidos) return false;
  
  const criterios = Object.values(this.criterios_atendidos);
  return criterios.every(criterio => criterio.atendido === true);
});

// Virtual para tempo desde a graduação
graduationSchema.virtual('tempo_desde_graduacao').get(function() {
  const agora = new Date();
  const diferenca = agora - this.data;
  const dias = Math.floor(diferenca / (1000 * 60 * 60 * 24));
  
  if (dias < 30) {
    return `${dias} dias`;
  } else if (dias < 365) {
    const meses = Math.floor(dias / 30);
    return `${meses} meses`;
  } else {
    const anos = Math.floor(dias / 365);
    const mesesRestantes = Math.floor((dias % 365) / 30);
    return mesesRestantes > 0 ? `${anos} anos e ${mesesRestantes} meses` : `${anos} anos`;
  }
});

// Método para gerar número do certificado
graduationSchema.methods.gerarNumeroCertificado = function() {
  const ano = this.data.getFullYear();
  const mes = String(this.data.getMonth() + 1).padStart(2, '0');
  const sequencial = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  
  this.certificado.numero = `SJJ-${ano}${mes}-${sequencial}`;
  return this.certificado.numero;
};

// Método para gerar certificado
graduationSchema.methods.gerarCertificado = async function() {
  if (this.certificado.gerado) {
    throw new Error('Certificado já foi gerado');
  }
  
  if (!this.validada) {
    throw new Error('Graduação deve estar validada para gerar certificado');
  }
  
  // Gerar número se não existe
  if (!this.certificado.numero) {
    this.gerarNumeroCertificado();
  }
  
  // Aqui seria implementada a geração do PDF do certificado
  // Por enquanto, apenas marcamos como gerado
  this.certificado.gerado = true;
  this.certificado.data_geracao = new Date();
  
  return this.save();
};

// Método estático para criar graduação
graduationSchema.statics.criarGraduacao = async function(dadosGraduacao) {
  const {
    aluno_id,
    faixa,
    grau = 0,
    responsavel,
    nota = '',
    tipo_graduacao = 'promocao',
    criterios_atendidos = {},
    observacoes = ''
  } = dadosGraduacao;
  
  const Student = mongoose.model('Student');
  
  // Verificar se aluno existe
  const aluno = await Student.findById(aluno_id);
  if (!aluno) {
    throw new Error('Aluno não encontrado');
  }
  
  // Verificar se a nova faixa é uma progressão válida
  const ordemFaixas = ['branca', 'cinza', 'amarela', 'laranja', 'verde', 'azul', 'roxa', 'marrom', 'preta'];
  const faixaAtualIndex = ordemFaixas.indexOf(aluno.faixa_atual);
  const novaFaixaIndex = ordemFaixas.indexOf(faixa);
  
  // Permitir graduação para mesma faixa (aumento de grau) ou faixa superior
  if (novaFaixaIndex < faixaAtualIndex) {
    throw new Error('Não é possível regredir para uma faixa inferior');
  }
  
  // Se é a mesma faixa, deve ser aumento de grau
  if (novaFaixaIndex === faixaAtualIndex && grau <= aluno.graus) {
    throw new Error('Novo grau deve ser superior ao atual');
  }
  
  // Criar graduação
  const graduacao = new this({
    aluno_id,
    faixa,
    grau,
    responsavel,
    nota,
    tipo_graduacao,
    criterios_atendidos,
    observacoes,
    validada_por: responsavel
  });
  
  await graduacao.save();
  
  // Atualizar faixa do aluno
  aluno.faixa_atual = faixa;
  aluno.graus = grau;
  aluno.is_preta = faixa === 'preta';
  
  // Resetar dias na faixa atual
  aluno.estatisticas.dias_na_faixa_atual = 0;
  
  await aluno.save();
  
  return graduacao;
};

// Método estático para obter histórico de graduações
graduationSchema.statics.historicoGraduacoes = async function(filtros = {}) {
  const {
    aluno_id,
    faixa,
    responsavel,
    data_inicio,
    data_fim,
    validada
  } = filtros;
  
  const query = {};
  
  if (aluno_id) query.aluno_id = aluno_id;
  if (faixa) query.faixa = faixa;
  if (responsavel) query.responsavel = responsavel;
  if (validada !== undefined) query.validada = validada;
  
  if (data_inicio || data_fim) {
    query.data = {};
    if (data_inicio) query.data.$gte = new Date(data_inicio);
    if (data_fim) query.data.$lte = new Date(data_fim);
  }
  
  return this.find(query)
    .populate('aluno_id', 'nome grupo faixa_atual')
    .populate('responsavel', 'nome perfil')
    .populate('validada_por', 'nome')
    .sort({ data: -1 });
};

// Método estático para relatório de elegibilidade
graduationSchema.statics.relatorioElegibilidade = async function(requisitos = {}) {
  const {
    presencas_minimas = 50,
    dias_minimos_faixa = 180,
    assiduidade_minima = 70
  } = requisitos;
  
  const Student = mongoose.model('Student');
  
  const alunos = await Student.find({ status: 'ativo' });
  const elegibilidade = [];
  
  for (const aluno of alunos) {
    const elegivel = aluno.verificarElegibilidadeGraduacao({
      presencas_minimas,
      dias_minimos_faixa,
      assiduidade_minima
    });
    
    // Buscar última graduação
    const ultimaGraduacao = await this.findOne({
      aluno_id: aluno._id
    }).sort({ data: -1 });
    
    elegibilidade.push({
      aluno: aluno,
      elegivel: elegivel.elegivel,
      criterios: elegivel.criterios,
      ultima_graduacao: ultimaGraduacao,
      proxima_faixa: this.calcularProximaFaixa(aluno.faixa_atual, aluno.graus)
    });
  }
  
  return elegibilidade.sort((a, b) => {
    if (a.elegivel && !b.elegivel) return -1;
    if (!a.elegivel && b.elegivel) return 1;
    return b.criterios.assiduidade.atual - a.criterios.assiduidade.atual;
  });
};

// Método estático para calcular próxima faixa
graduationSchema.statics.calcularProximaFaixa = function(faixaAtual, grauAtual) {
  const ordemFaixas = ['branca', 'cinza', 'amarela', 'laranja', 'verde', 'azul', 'roxa', 'marrom', 'preta'];
  const grausMaximos = {
    'branca': 4, 'cinza': 4, 'amarela': 4, 'laranja': 4,
    'verde': 4, 'azul': 4, 'roxa': 4, 'marrom': 4, 'preta': 10
  };
  
  const faixaIndex = ordemFaixas.indexOf(faixaAtual);
  const maxGraus = grausMaximos[faixaAtual] || 0;
  
  // Se ainda pode aumentar grau na faixa atual
  if (grauAtual < maxGraus) {
    return {
      faixa: faixaAtual,
      grau: grauAtual + 1,
      tipo: 'grau'
    };
  }
  
  // Se pode promover para próxima faixa
  if (faixaIndex < ordemFaixas.length - 1) {
    return {
      faixa: ordemFaixas[faixaIndex + 1],
      grau: 0,
      tipo: 'promocao'
    };
  }
  
  // Já está na faixa máxima com grau máximo
  return null;
};

// Método estático para estatísticas de graduações
graduationSchema.statics.estatisticasGraduacoes = async function(periodo = 'ano') {
  const agora = new Date();
  let dataInicio;
  
  switch (periodo) {
    case 'mes':
      dataInicio = new Date(agora.getFullYear(), agora.getMonth(), 1);
      break;
    case 'trimestre':
      dataInicio = new Date(agora.getFullYear(), agora.getMonth() - 3, 1);
      break;
    case 'semestre':
      dataInicio = new Date(agora.getFullYear(), agora.getMonth() - 6, 1);
      break;
    default: // ano
      dataInicio = new Date(agora.getFullYear(), 0, 1);
  }
  
  const pipeline = [
    {
      $match: {
        data: { $gte: dataInicio },
        validada: true
      }
    },
    {
      $group: {
        _id: {
          faixa: '$faixa',
          mes: { $month: '$data' }
        },
        total: { $sum: 1 },
        graduacoes: { $push: '$$ROOT' }
      }
    },
    {
      $group: {
        _id: '$_id.faixa',
        total_faixa: { $sum: '$total' },
        por_mes: {
          $push: {
            mes: '$_id.mes',
            total: '$total'
          }
        }
      }
    },
    {
      $sort: { total_faixa: -1 }
    }
  ];
  
  return this.aggregate(pipeline);
};

// Middleware para validações
graduationSchema.pre('save', function(next) {
  // Gerar número do certificado se não existe
  if (!this.certificado.numero && this.validada) {
    this.gerarNumeroCertificado();
  }
  
  next();
});

// Middleware pós-save para atualizar estatísticas do aluno
graduationSchema.post('save', async function() {
  if (this.aluno_id) {
    const Student = mongoose.model('Student');
    const aluno = await Student.findById(this.aluno_id);
    
    if (aluno) {
      // Calcular dias na faixa atual
      const ultimaGraduacao = await this.constructor.findOne({
        aluno_id: this.aluno_id
      }).sort({ data: -1 });
      
      if (ultimaGraduacao) {
        const diasNaFaixa = Math.floor((new Date() - ultimaGraduacao.data) / (1000 * 60 * 60 * 24));
        aluno.estatisticas.dias_na_faixa_atual = diasNaFaixa;
        await aluno.save();
      }
    }
  }
});

module.exports = mongoose.model('Graduation', graduationSchema);