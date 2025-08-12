const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  mensalidade_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Monthly',
    required: [true, 'Mensalidade é obrigatória']
  },
  mp_payment_id: {
    type: String,
    unique: true,
    sparse: true
  },
  metodo: {
    type: String,
    enum: [
      'dinheiro', 'cartao_credito', 'cartao_debito', 'pix', 
      'boleto', 'transferencia', 'mercado_pago', 'desconto', 'cortesia'
    ],
    required: [true, 'Método de pagamento é obrigatório']
  },
  valor_pago: {
    type: Number,
    required: [true, 'Valor pago é obrigatório'],
    min: [0, 'Valor deve ser positivo']
  },
  valor_original: {
    type: Number,
    required: [true, 'Valor original é obrigatório'],
    min: [0, 'Valor deve ser positivo']
  },
  taxas: {
    mercado_pago: {
      type: Number,
      default: 0
    },
    gateway: {
      type: Number,
      default: 0
    },
    outras: {
      type: Number,
      default: 0
    }
  },
  valor_liquido: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pendente', 'aprovado', 'rejeitado', 'cancelado', 'estornado'],
    default: 'pendente'
  },
  recebido_em: {
    type: Date,
    default: Date.now
  },
  processado_em: {
    type: Date,
    default: null
  },
  detalhes_pagamento: {
    // Para cartão
    cartao: {
      bandeira: String,
      ultimos_digitos: String,
      parcelas: {
        type: Number,
        default: 1
      }
    },
    // Para PIX
    pix: {
      chave: String,
      banco: String,
      titular: String
    },
    // Para boleto
    boleto: {
      codigo_barras: String,
      linha_digitavel: String,
      banco: String
    },
    // Para transferência
    transferencia: {
      banco: String,
      agencia: String,
      conta: String,
      titular: String,
      comprovante: String
    }
  },
  mercado_pago_data: {
    payment_id: String,
    payment_method_id: String,
    payment_type_id: String,
    status: String,
    status_detail: String,
    transaction_amount: Number,
    net_received_amount: Number,
    total_paid_amount: Number,
    installments: Number,
    fee_details: [{
      type: String,
      amount: Number,
      fee_payer: String
    }],
    card: {
      first_six_digits: String,
      last_four_digits: String,
      cardholder: {
        name: String,
        identification: {
          type: String,
          number: String
        }
      }
    },
    payer: {
      id: String,
      email: String,
      identification: {
        type: String,
        number: String
      },
      phone: {
        area_code: String,
        number: String
      }
    },
    date_created: Date,
    date_approved: Date,
    date_last_updated: Date
  },
  comprovante: {
    arquivo: String,
    tipo: {
      type: String,
      enum: ['imagem', 'pdf', 'link']
    },
    data_upload: Date,
    verificado: {
      type: Boolean,
      default: false
    },
    verificado_por: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    data_verificacao: Date
  },
  observacoes: {
    type: String,
    maxlength: [500, 'Observações devem ter no máximo 500 caracteres']
  },
  processado_por: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  raw_payload: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  tentativas_processamento: {
    type: Number,
    default: 0
  },
  ultimo_erro: {
    mensagem: String,
    data: Date,
    stack: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Índices
paymentSchema.index({ mensalidade_id: 1 });
paymentSchema.index({ mp_payment_id: 1 });
paymentSchema.index({ status: 1, recebido_em: -1 });
paymentSchema.index({ metodo: 1, recebido_em: -1 });
paymentSchema.index({ processado_em: 1 });
paymentSchema.index({ 'comprovante.verificado': 1 });

// Virtual para total de taxas
paymentSchema.virtual('total_taxas').get(function() {
  return (this.taxas.mercado_pago || 0) + 
         (this.taxas.gateway || 0) + 
         (this.taxas.outras || 0);
});

// Virtual para verificar se precisa de verificação manual
paymentSchema.virtual('precisa_verificacao').get(function() {
  return ['dinheiro', 'transferencia', 'boleto'].includes(this.metodo) && 
         this.comprovante.arquivo && 
         !this.comprovante.verificado;
});

// Virtual para método formatado
paymentSchema.virtual('metodo_formatado').get(function() {
  const metodos = {
    'dinheiro': 'Dinheiro',
    'cartao_credito': 'Cartão de Crédito',
    'cartao_debito': 'Cartão de Débito',
    'pix': 'PIX',
    'boleto': 'Boleto',
    'transferencia': 'Transferência',
    'mercado_pago': 'Mercado Pago',
    'desconto': 'Desconto',
    'cortesia': 'Cortesia'
  };
  
  return metodos[this.metodo] || this.metodo;
});

// Método para calcular valor líquido
paymentSchema.methods.calcularValorLiquido = function() {
  this.valor_liquido = this.valor_pago - this.total_taxas;
  return this.valor_liquido;
};

// Método para processar pagamento
paymentSchema.methods.processar = async function(usuario = null) {
  if (this.status === 'aprovado') {
    throw new Error('Pagamento já foi processado');
  }
  
  try {
    // Calcular valor líquido
    this.calcularValorLiquido();
    
    // Atualizar status
    this.status = 'aprovado';
    this.processado_em = new Date();
    this.processado_por = usuario;
    
    await this.save();
    
    // Atualizar mensalidade
    const Monthly = mongoose.model('Monthly');
    const mensalidade = await Monthly.findById(this.mensalidade_id);
    
    if (mensalidade) {
      await mensalidade.registrarPagamento({
        valor_pago: this.valor_pago,
        forma_pagamento: this.metodo,
        data_pagamento: this.recebido_em,
        comprovante: this.comprovante,
        usuario: usuario,
        observacao: this.observacoes
      });
    }
    
    return this;
  } catch (error) {
    this.tentativas_processamento += 1;
    this.ultimo_erro = {
      mensagem: error.message,
      data: new Date(),
      stack: error.stack
    };
    
    await this.save();
    throw error;
  }
};

// Método para rejeitar pagamento
paymentSchema.methods.rejeitar = function(motivo = '', usuario = null) {
  this.status = 'rejeitado';
  this.processado_em = new Date();
  this.processado_por = usuario;
  this.observacoes = this.observacoes ? `${this.observacoes}; Rejeitado: ${motivo}` : `Rejeitado: ${motivo}`;
  
  return this.save();
};

// Método para estornar pagamento
paymentSchema.methods.estornar = function(motivo = '', usuario = null) {
  if (this.status !== 'aprovado') {
    throw new Error('Apenas pagamentos aprovados podem ser estornados');
  }
  
  this.status = 'estornado';
  this.processado_por = usuario;
  this.observacoes = this.observacoes ? `${this.observacoes}; Estornado: ${motivo}` : `Estornado: ${motivo}`;
  
  return this.save();
};

// Método para verificar comprovante
paymentSchema.methods.verificarComprovante = function(verificado, usuario = null, observacao = '') {
  this.comprovante.verificado = verificado;
  this.comprovante.verificado_por = usuario;
  this.comprovante.data_verificacao = new Date();
  
  if (observacao) {
    this.observacoes = this.observacoes ? `${this.observacoes}; ${observacao}` : observacao;
  }
  
  // Se foi verificado positivamente, processar automaticamente
  if (verificado && this.status === 'pendente') {
    return this.processar(usuario);
  }
  
  return this.save();
};

// Método estático para criar pagamento do Mercado Pago
paymentSchema.statics.criarPagamentoMP = async function(paymentData) {
  const {
    payment_id,
    external_reference,
    payment_method_id,
    payment_type_id,
    status,
    status_detail,
    transaction_amount,
    net_received_amount,
    total_paid_amount,
    installments,
    fee_details,
    card,
    payer,
    date_created,
    date_approved,
    date_last_updated
  } = paymentData;
  
  // Extrair mensalidade_id do external_reference
  const [aluno_id, mensalidade_id] = external_reference.split(':');
  
  if (!mensalidade_id) {
    throw new Error('External reference inválido');
  }
  
  // Verificar se pagamento já existe
  const existente = await this.findOne({ mp_payment_id: payment_id });
  if (existente) {
    // Atualizar dados existentes
    existente.mercado_pago_data = {
      payment_id,
      payment_method_id,
      payment_type_id,
      status,
      status_detail,
      transaction_amount,
      net_received_amount,
      total_paid_amount,
      installments,
      fee_details,
      card,
      payer,
      date_created: new Date(date_created),
      date_approved: date_approved ? new Date(date_approved) : null,
      date_last_updated: new Date(date_last_updated)
    };
    
    existente.status = status === 'approved' ? 'aprovado' : 'pendente';
    existente.raw_payload = paymentData;
    
    return existente.save();
  }
  
  // Calcular taxas
  const totalTaxas = fee_details ? fee_details.reduce((sum, fee) => sum + fee.amount, 0) : 0;
  
  // Criar novo pagamento
  const pagamento = new this({
    mensalidade_id: mongoose.Types.ObjectId(mensalidade_id),
    mp_payment_id: payment_id,
    metodo: 'mercado_pago',
    valor_pago: transaction_amount,
    valor_original: transaction_amount,
    taxas: {
      mercado_pago: totalTaxas
    },
    valor_liquido: net_received_amount,
    status: status === 'approved' ? 'aprovado' : 'pendente',
    recebido_em: date_approved ? new Date(date_approved) : new Date(date_created),
    processado_em: status === 'approved' ? new Date() : null,
    mercado_pago_data: {
      payment_id,
      payment_method_id,
      payment_type_id,
      status,
      status_detail,
      transaction_amount,
      net_received_amount,
      total_paid_amount,
      installments,
      fee_details,
      card,
      payer,
      date_created: new Date(date_created),
      date_approved: date_approved ? new Date(date_approved) : null,
      date_last_updated: new Date(date_last_updated)
    },
    raw_payload: paymentData
  });
  
  await pagamento.save();
  
  // Se foi aprovado, processar automaticamente
  if (status === 'approved') {
    await pagamento.processar();
  }
  
  return pagamento;
};

// Método estático para relatório de pagamentos
paymentSchema.statics.relatorioReceitas = async function(filtros = {}) {
  const {
    data_inicio,
    data_fim,
    metodo,
    status = 'aprovado'
  } = filtros;
  
  const matchStage = { status };
  
  if (data_inicio || data_fim) {
    matchStage.recebido_em = {};
    if (data_inicio) matchStage.recebido_em.$gte = new Date(data_inicio);
    if (data_fim) matchStage.recebido_em.$lte = new Date(data_fim);
  }
  
  if (metodo) matchStage.metodo = metodo;
  
  const pipeline = [
    { $match: matchStage },
    {
      $group: {
        _id: {
          metodo: '$metodo',
          ano: { $year: '$recebido_em' },
          mes: { $month: '$recebido_em' }
        },
        total_pagamentos: { $sum: 1 },
        valor_bruto: { $sum: '$valor_pago' },
        valor_liquido: { $sum: '$valor_liquido' },
        total_taxas: { $sum: '$total_taxas' }
      }
    },
    {
      $group: {
        _id: {
          ano: '$_id.ano',
          mes: '$_id.mes'
        },
        por_metodo: {
          $push: {
            metodo: '$_id.metodo',
            total_pagamentos: '$total_pagamentos',
            valor_bruto: '$valor_bruto',
            valor_liquido: '$valor_liquido',
            total_taxas: '$total_taxas'
          }
        },
        total_mes: { $sum: '$total_pagamentos' },
        valor_bruto_mes: { $sum: '$valor_bruto' },
        valor_liquido_mes: { $sum: '$valor_liquido' },
        total_taxas_mes: { $sum: '$total_taxas' }
      }
    },
    {
      $sort: { '_id.ano': -1, '_id.mes': -1 }
    }
  ];
  
  return this.aggregate(pipeline);
};

// Método estático para processar webhook do Mercado Pago
paymentSchema.statics.processarWebhookMP = async function(webhookData) {
  const { type, data, action } = webhookData;
  
  if (type !== 'payment' || !['payment.created', 'payment.updated'].includes(action)) {
    return null;
  }
  
  try {
    // Buscar dados do pagamento na API do MP
    const mercadopago = require('mercadopago');
    const payment = await mercadopago.payment.findById(data.id);
    
    if (!payment.body) {
      throw new Error('Pagamento não encontrado na API do Mercado Pago');
    }
    
    return this.criarPagamentoMP(payment.body);
  } catch (error) {
    console.error('Erro ao processar webhook MP:', error);
    throw error;
  }
};

// Middleware para calcular valor líquido antes de salvar
paymentSchema.pre('save', function(next) {
  if (this.isModified('valor_pago') || this.isModified('taxas')) {
    this.calcularValorLiquido();
  }
  
  next();
});

// Middleware pós-save para atualizar mensalidade
paymentSchema.post('save', async function() {
  if (this.status === 'aprovado' && this.mensalidade_id) {
    const Monthly = mongoose.model('Monthly');
    const mensalidade = await Monthly.findById(this.mensalidade_id);
    
    if (mensalidade && mensalidade.status !== 'pago') {
      await mensalidade.processarPagamentoMP({
        payment_id: this.mp_payment_id,
        status: 'approved',
        payment_method_id: this.mercado_pago_data?.payment_method_id,
        payment_type_id: this.mercado_pago_data?.payment_type_id,
        transaction_amount: this.valor_pago,
        net_received_amount: this.valor_liquido,
        fee_details: this.mercado_pago_data?.fee_details,
        date_approved: this.recebido_em,
        date_created: this.createdAt,
        last_modified: this.updatedAt
      });
    }
  }
});

module.exports = mongoose.model('Payment', paymentSchema);