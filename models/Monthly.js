const mongoose = require('mongoose');

const monthlySchema = new mongoose.Schema({
  aluno_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: [true, 'Aluno é obrigatório']
  },
  competencia: {
    type: String,
    required: [true, 'Competência é obrigatória'],
    match: [/^\d{4}-\d{2}$/, 'Competência deve estar no formato YYYY-MM']
  },
  valor: {
    type: Number,
    required: [true, 'Valor é obrigatório'],
    min: [0, 'Valor deve ser positivo']
  },
  vencimento: {
    type: Date,
    required: [true, 'Data de vencimento é obrigatória']
  },
  status: {
    type: String,
    enum: ['em_aberto', 'pago', 'atrasado', 'isento', 'cancelado'],
    default: 'em_aberto'
  },
  multa_tipo: {
    type: String,
    enum: ['fixa', 'percentual', 'nenhuma'],
    default: 'nenhuma'
  },
  multa_valor: {
    type: Number,
    default: 0,
    min: [0, 'Valor da multa deve ser positivo']
  },
  juros_tipo: {
    type: String,
    enum: ['fixo', 'percentual', 'nenhum'],
    default: 'nenhum'
  },
  juros_valor: {
    type: Number,
    default: 0,
    min: [0, 'Valor dos juros deve ser positivo']
  },
  bloqueio_checkin: {
    type: Boolean,
    default: false
  },
  desconto: {
    tipo: {
      type: String,
      enum: ['fixo', 'percentual', 'nenhum'],
      default: 'nenhum'
    },
    valor: {
      type: Number,
      default: 0,
      min: [0, 'Valor do desconto deve ser positivo']
    },
    motivo: String
  },
  observacoes: {
    type: String,
    maxlength: [500, 'Observações devem ter no máximo 500 caracteres']
  },
  data_pagamento: {
    type: Date,
    default: null
  },
  valor_pago: {
    type: Number,
    default: 0,
    min: [0, 'Valor pago deve ser positivo']
  },
  forma_pagamento: {
    type: String,
    enum: ['dinheiro', 'cartao_credito', 'cartao_debito', 'pix', 'boleto', 'transferencia', 'mercado_pago'],
    default: null
  },
  comprovante: {
    arquivo: String,
    numero_transacao: String,
    data_upload: Date
  },
  mercado_pago: {
    payment_id: String,
    preference_id: String,
    external_reference: String,
    status: String,
    status_detail: String,
    payment_method_id: String,
    payment_type_id: String,
    transaction_amount: Number,
    net_received_amount: Number,
    fee_details: [{
      type: String,
      amount: Number
    }],
    date_approved: Date,
    date_created: Date,
    last_modified: Date
  },
  historico_status: [{
    status: String,
    data: { type: Date, default: Date.now },
    usuario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    observacao: String
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Índices
monthlySchema.index({ aluno_id: 1, competencia: 1 }, { unique: true });
monthlySchema.index({ status: 1, vencimento: 1 });
monthlySchema.index({ vencimento: 1 });
monthlySchema.index({ competencia: 1 });
monthlySchema.index({ 'mercado_pago.payment_id': 1 });
monthlySchema.index({ 'mercado_pago.external_reference': 1 });

// Virtual para verificar se está em atraso
monthlySchema.virtual('em_atraso').get(function() {
  if (this.status === 'pago' || this.status === 'isento') return false;
  return new Date() > this.vencimento;
});

// Virtual para dias de atraso
monthlySchema.virtual('dias_atraso').get(function() {
  if (!this.em_atraso) return 0;
  const hoje = new Date();
  const diferenca = hoje - this.vencimento;
  return Math.floor(diferenca / (1000 * 60 * 60 * 24));
});

// Virtual para valor da multa calculado
monthlySchema.virtual('multa_calculada').get(function() {
  if (this.multa_tipo === 'nenhuma' || !this.em_atraso) return 0;
  
  if (this.multa_tipo === 'fixa') {
    return this.multa_valor;
  } else if (this.multa_tipo === 'percentual') {
    return (this.valor * this.multa_valor) / 100;
  }
  
  return 0;
});

// Virtual para valor dos juros calculado
monthlySchema.virtual('juros_calculados').get(function() {
  if (this.juros_tipo === 'nenhum' || !this.em_atraso) return 0;
  
  const diasAtraso = this.dias_atraso;
  
  if (this.juros_tipo === 'fixo') {
    return this.juros_valor * diasAtraso;
  } else if (this.juros_tipo === 'percentual') {
    return (this.valor * this.juros_valor * diasAtraso) / 100;
  }
  
  return 0;
});

// Virtual para valor do desconto calculado
monthlySchema.virtual('desconto_calculado').get(function() {
  if (this.desconto.tipo === 'nenhum') return 0;
  
  if (this.desconto.tipo === 'fixo') {
    return this.desconto.valor;
  } else if (this.desconto.tipo === 'percentual') {
    return (this.valor * this.desconto.valor) / 100;
  }
  
  return 0;
});

// Virtual para valor total a pagar
monthlySchema.virtual('valor_total').get(function() {
  const valorBase = this.valor;
  const multa = this.multa_calculada;
  const juros = this.juros_calculados;
  const desconto = this.desconto_calculado;
  
  return Math.max(0, valorBase + multa + juros - desconto);
});

// Virtual para competência formatada
monthlySchema.virtual('competencia_formatada').get(function() {
  const [ano, mes] = this.competencia.split('-');
  const meses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  return `${meses[parseInt(mes) - 1]} ${ano}`;
});

// Método para calcular valor total com multa e juros
monthlySchema.methods.calcularValorTotal = function() {
  return this.valor_total;
};

// Método para aplicar desconto
monthlySchema.methods.aplicarDesconto = function(tipo, valor, motivo = '') {
  this.desconto = {
    tipo: tipo,
    valor: valor,
    motivo: motivo
  };
  
  return this.save();
};

// Método para registrar pagamento
monthlySchema.methods.registrarPagamento = function(dadosPagamento) {
  const {
    valor_pago,
    forma_pagamento,
    data_pagamento = new Date(),
    comprovante = {},
    usuario = null,
    observacao = ''
  } = dadosPagamento;
  
  this.status = 'pago';
  this.valor_pago = valor_pago;
  this.forma_pagamento = forma_pagamento;
  this.data_pagamento = data_pagamento;
  this.comprovante = comprovante;
  
  // Adicionar ao histórico
  this.historico_status.push({
    status: 'pago',
    usuario: usuario,
    observacao: observacao || `Pagamento de R$ ${valor_pago.toFixed(2)} via ${forma_pagamento}`
  });
  
  return this.save();
};

// Método para processar pagamento do Mercado Pago
monthlySchema.methods.processarPagamentoMP = function(dadosMP) {
  const {
    payment_id,
    status,
    status_detail,
    payment_method_id,
    payment_type_id,
    transaction_amount,
    net_received_amount,
    fee_details,
    date_approved,
    date_created,
    last_modified
  } = dadosMP;
  
  // Atualizar dados do Mercado Pago
  this.mercado_pago = {
    ...this.mercado_pago,
    payment_id,
    status,
    status_detail,
    payment_method_id,
    payment_type_id,
    transaction_amount,
    net_received_amount,
    fee_details,
    date_approved: date_approved ? new Date(date_approved) : null,
    date_created: date_created ? new Date(date_created) : null,
    last_modified: last_modified ? new Date(last_modified) : null
  };
  
  // Se pagamento foi aprovado
  if (status === 'approved') {
    this.status = 'pago';
    this.valor_pago = transaction_amount;
    this.forma_pagamento = 'mercado_pago';
    this.data_pagamento = date_approved ? new Date(date_approved) : new Date();
    
    // Adicionar ao histórico
    this.historico_status.push({
      status: 'pago',
      observacao: `Pagamento aprovado via Mercado Pago - ID: ${payment_id}`
    });
  }
  
  return this.save();
};

// Método para gerar link de pagamento Mercado Pago
monthlySchema.methods.gerarLinkPagamento = async function() {
  const mercadopago = require('mercadopago');
  
  // Configurar Mercado Pago (deve ser feito na inicialização da app)
  // mercadopago.configure({ access_token: process.env.MP_ACCESS_TOKEN });
  
  const preference = {
    items: [{
      title: `Mensalidade ${this.competencia_formatada}`,
      description: `Mensalidade referente a ${this.competencia_formatada}`,
      unit_price: this.valor_total,
      quantity: 1,
      currency_id: 'BRL'
    }],
    external_reference: `${this.aluno_id}:${this._id}:${this.competencia}`,
    payment_methods: {
      excluded_payment_methods: [],
      excluded_payment_types: [],
      installments: 12
    },
    back_urls: {
      success: `${process.env.FRONTEND_URL}/pagamento/sucesso`,
      failure: `${process.env.FRONTEND_URL}/pagamento/erro`,
      pending: `${process.env.FRONTEND_URL}/pagamento/pendente`
    },
    auto_return: 'approved',
    notification_url: `${process.env.BACKEND_URL}/api/webhooks/mercado-pago`
  };
  
  try {
    const response = await mercadopago.preferences.create(preference);
    
    // Salvar preference_id
    this.mercado_pago.preference_id = response.body.id;
    this.mercado_pago.external_reference = preference.external_reference;
    await this.save();
    
    return {
      preference_id: response.body.id,
      init_point: response.body.init_point,
      sandbox_init_point: response.body.sandbox_init_point
    };
  } catch (error) {
    throw new Error(`Erro ao gerar link de pagamento: ${error.message}`);
  }
};

// Método estático para criar mensalidades em lote
monthlySchema.statics.criarMensalidadesLote = async function(competencia, filtros = {}) {
  const Student = mongoose.model('Student');
  
  // Buscar alunos ativos
  const query = { status: 'ativo', ...filtros };
  const alunos = await Student.find(query);
  
  const mensalidades = [];
  const [ano, mes] = competencia.split('-').map(Number);
  
  for (const aluno of alunos) {
    // Verificar se já existe mensalidade para esta competência
    const existente = await this.findOne({
      aluno_id: aluno._id,
      competencia: competencia
    });
    
    if (!existente) {
      // Calcular data de vencimento
      const vencimento = new Date(ano, mes - 1, aluno.dia_vencimento);
      
      const mensalidade = new this({
        aluno_id: aluno._id,
        competencia: competencia,
        valor: aluno.valor_mensalidade,
        vencimento: vencimento,
        multa_tipo: process.env.DEFAULT_LATE_FEE_TYPE || 'percentual',
        multa_valor: parseFloat(process.env.DEFAULT_LATE_FEE_VALUE) || 10,
        juros_tipo: 'percentual',
        juros_valor: parseFloat(process.env.DEFAULT_DAILY_INTEREST) || 0.033
      });
      
      mensalidades.push(mensalidade);
    }
  }
  
  if (mensalidades.length > 0) {
    await this.insertMany(mensalidades);
  }
  
  return mensalidades.length;
};

// Método estático para atualizar status de mensalidades em atraso
monthlySchema.statics.atualizarStatusAtraso = async function() {
  const hoje = new Date();
  hoje.setHours(23, 59, 59, 999);
  
  // Marcar como atrasadas
  const atrasadas = await this.updateMany({
    status: 'em_aberto',
    vencimento: { $lt: hoje }
  }, {
    status: 'atrasado'
  });
  
  // Aplicar bloqueios se configurado
  const diasBloqueio = parseInt(process.env.DEFAULT_BLOCK_DAYS) || 7;
  const dataBloqueio = new Date();
  dataBloqueio.setDate(dataBloqueio.getDate() - diasBloqueio);
  
  const mensalidadesBloqueio = await this.find({
    status: 'atrasado',
    vencimento: { $lt: dataBloqueio },
    bloqueio_checkin: false
  }).populate('aluno_id');
  
  const Student = mongoose.model('Student');
  
  for (const mensalidade of mensalidadesBloqueio) {
    mensalidade.bloqueio_checkin = true;
    await mensalidade.save();
    
    // Bloquear aluno
    if (mensalidade.aluno_id) {
      await mensalidade.aluno_id.alterarBloqueioCheckin(
        true,
        `Mensalidade em atraso - ${mensalidade.competencia_formatada}`
      );
    }
  }
  
  return {
    atrasadas: atrasadas.modifiedCount,
    bloqueadas: mensalidadesBloqueio.length
  };
};

// Método estático para relatório financeiro
monthlySchema.statics.relatorioFinanceiro = async function(filtros = {}) {
  const {
    data_inicio,
    data_fim,
    status,
    aluno_id
  } = filtros;
  
  const matchStage = {};
  
  if (data_inicio || data_fim) {
    matchStage.vencimento = {};
    if (data_inicio) matchStage.vencimento.$gte = new Date(data_inicio);
    if (data_fim) matchStage.vencimento.$lte = new Date(data_fim);
  }
  
  if (status) matchStage.status = status;
  if (aluno_id) matchStage.aluno_id = mongoose.Types.ObjectId(aluno_id);
  
  const pipeline = [
    { $match: matchStage },
    {
      $group: {
        _id: '$status',
        total: { $sum: 1 },
        valor_total: { $sum: '$valor' },
        valor_pago: { $sum: '$valor_pago' }
      }
    },
    {
      $group: {
        _id: null,
        por_status: {
          $push: {
            status: '$_id',
            total: '$total',
            valor_total: '$valor_total',
            valor_pago: '$valor_pago'
          }
        },
        total_geral: { $sum: '$total' },
        valor_total_geral: { $sum: '$valor_total' },
        valor_pago_geral: { $sum: '$valor_pago' }
      }
    }
  ];
  
  return this.aggregate(pipeline);
};

// Middleware para atualizar status automaticamente
monthlySchema.pre('save', function(next) {
  // Atualizar status baseado na data
  if (this.status === 'em_aberto' && this.em_atraso) {
    this.status = 'atrasado';
  }
  
  // Adicionar ao histórico se status mudou
  if (this.isModified('status')) {
    this.historico_status.push({
      status: this.status,
      observacao: `Status alterado para ${this.status}`
    });
  }
  
  next();
});

// Middleware pós-save para atualizar bloqueio do aluno
monthlySchema.post('save', async function() {
  if (this.aluno_id) {
    const Student = mongoose.model('Student');
    const aluno = await Student.findById(this.aluno_id);
    
    if (aluno) {
      // Se mensalidade foi paga, remover bloqueio se não há outras pendências
      if (this.status === 'pago' && aluno.configuracoes.bloqueio_checkin) {
        const outrasAtrasadas = await this.constructor.countDocuments({
          aluno_id: this.aluno_id,
          status: 'atrasado',
          _id: { $ne: this._id }
        });
        
        if (outrasAtrasadas === 0) {
          await aluno.alterarBloqueioCheckin(false);
        }
      }
    }
  }
});

module.exports = mongoose.model('Monthly', monthlySchema);