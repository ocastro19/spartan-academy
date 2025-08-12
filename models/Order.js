const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  numero_pedido: {
    type: String,
    unique: true,
    required: true
  },
  cliente: {
    aluno_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true
    },
    nome: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true
    },
    telefone: String,
    documento: String
  },
  itens: [{
    produto_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    nome: {
      type: String,
      required: true
    },
    sku: {
      type: String,
      required: true
    },
    quantidade: {
      type: Number,
      required: true,
      min: 1
    },
    preco_unitario: {
      type: Number,
      required: true,
      min: 0
    },
    preco_total: {
      type: Number,
      required: true,
      min: 0
    },
    variantes: [{
      nome: String,
      valor: String
    }],
    observacoes: String
  }],
  valores: {
    subtotal: {
      type: Number,
      required: true,
      min: 0
    },
    desconto: {
      valor: {
        type: Number,
        default: 0,
        min: 0
      },
      tipo: {
        type: String,
        enum: ['fixo', 'percentual'],
        default: 'fixo'
      },
      cupom: String,
      motivo: String
    },
    frete: {
      valor: {
        type: Number,
        default: 0,
        min: 0
      },
      tipo: {
        type: String,
        enum: ['gratis', 'fixo', 'calculado'],
        default: 'gratis'
      },
      transportadora: String,
      prazo_entrega: Number, // em dias
      codigo_rastreamento: String
    },
    total: {
      type: Number,
      required: true,
      min: 0
    }
  },
  status: {
    type: String,
    enum: [
      'aguardando_pagamento',
      'pagamento_confirmado',
      'em_preparacao',
      'pronto_retirada',
      'enviado',
      'entregue',
      'cancelado',
      'devolvido'
    ],
    default: 'aguardando_pagamento'
  },
  tipo_entrega: {
    type: String,
    enum: ['retirada', 'entrega'],
    required: true
  },
  endereco_entrega: {
    cep: String,
    logradouro: String,
    numero: String,
    complemento: String,
    bairro: String,
    cidade: String,
    estado: String,
    pais: {
      type: String,
      default: 'Brasil'
    },
    referencia: String
  },
  pagamento: {
    metodo: {
      type: String,
      enum: ['dinheiro', 'cartao', 'pix', 'boleto', 'transferencia', 'mercado_pago', 'mensalidade'],
      required: true
    },
    status: {
      type: String,
      enum: ['pendente', 'aprovado', 'rejeitado', 'cancelado', 'estornado'],
      default: 'pendente'
    },
    valor_pago: {
      type: Number,
      default: 0
    },
    data_pagamento: Date,
    comprovante: {
      arquivo: String,
      verificado: {
        type: Boolean,
        default: false
      }
    },
    mercado_pago: {
      payment_id: String,
      preference_id: String,
      collection_id: String,
      collection_status: String,
      payment_type: String,
      merchant_order_id: String,
      external_reference: String
    },
    parcelamento: {
      parcelas: {
        type: Number,
        default: 1
      },
      valor_parcela: Number
    }
  },
  historico: [{
    status: String,
    data: {
      type: Date,
      default: Date.now
    },
    observacao: String,
    usuario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  observacoes: {
    cliente: String,
    interna: String
  },
  origem: {
    type: String,
    enum: ['loja_online', 'presencial', 'whatsapp', 'telefone'],
    default: 'presencial'
  },
  vendedor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  data_entrega_prevista: Date,
  data_entrega_realizada: Date,
  avaliacao: {
    nota: {
      type: Number,
      min: 1,
      max: 5
    },
    comentario: String,
    data: Date
  },
  cancelamento: {
    motivo: String,
    data: Date,
    usuario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reembolso: {
      solicitado: {
        type: Boolean,
        default: false
      },
      valor: Number,
      data_solicitacao: Date,
      data_processamento: Date,
      status: {
        type: String,
        enum: ['pendente', 'aprovado', 'processado', 'rejeitado']
      }
    }
  },
  metadata: {
    ip_cliente: String,
    user_agent: String,
    utm_source: String,
    utm_medium: String,
    utm_campaign: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Índices
orderSchema.index({ numero_pedido: 1 });
orderSchema.index({ 'cliente.aluno_id': 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ 'pagamento.status': 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ 'pagamento.mercado_pago.payment_id': 1 });
orderSchema.index({ vendedor: 1 });
orderSchema.index({ origem: 1 });

// Virtual para status formatado
orderSchema.virtual('status_formatado').get(function() {
  const statusMap = {
    'aguardando_pagamento': 'Aguardando Pagamento',
    'pagamento_confirmado': 'Pagamento Confirmado',
    'em_preparacao': 'Em Preparação',
    'pronto_retirada': 'Pronto para Retirada',
    'enviado': 'Enviado',
    'entregue': 'Entregue',
    'cancelado': 'Cancelado',
    'devolvido': 'Devolvido'
  };
  
  return statusMap[this.status] || this.status;
});

// Virtual para verificar se pode ser cancelado
orderSchema.virtual('pode_cancelar').get(function() {
  return ['aguardando_pagamento', 'pagamento_confirmado', 'em_preparacao'].includes(this.status);
});

// Virtual para verificar se está pago
orderSchema.virtual('esta_pago').get(function() {
  return this.pagamento.status === 'aprovado';
});

// Virtual para valor do desconto calculado
orderSchema.virtual('valor_desconto_calculado').get(function() {
  if (this.valores.desconto.tipo === 'percentual') {
    return (this.valores.subtotal * this.valores.desconto.valor) / 100;
  }
  return this.valores.desconto.valor;
});

// Virtual para total de itens
orderSchema.virtual('total_itens').get(function() {
  return this.itens.reduce((total, item) => total + item.quantidade, 0);
});

// Virtual para prazo de entrega formatado
orderSchema.virtual('prazo_entrega_formatado').get(function() {
  if (!this.valores.frete.prazo_entrega) return null;
  
  const prazo = this.valores.frete.prazo_entrega;
  return prazo === 1 ? '1 dia útil' : `${prazo} dias úteis`;
});

// Método para gerar número do pedido
orderSchema.statics.gerarNumeroPedido = async function() {
  const ano = new Date().getFullYear();
  const ultimoPedido = await this.findOne(
    { numero_pedido: new RegExp(`^${ano}`) },
    {},
    { sort: { numero_pedido: -1 } }
  );
  
  let proximoNumero = 1;
  if (ultimoPedido) {
    const numeroAtual = parseInt(ultimoPedido.numero_pedido.split('-')[1]);
    proximoNumero = numeroAtual + 1;
  }
  
  return `${ano}-${proximoNumero.toString().padStart(6, '0')}`;
};

// Método para calcular valores
orderSchema.methods.calcularValores = function() {
  // Calcular subtotal
  this.valores.subtotal = this.itens.reduce((total, item) => {
    return total + item.preco_total;
  }, 0);
  
  // Calcular desconto
  let valorDesconto = 0;
  if (this.valores.desconto.valor > 0) {
    if (this.valores.desconto.tipo === 'percentual') {
      valorDesconto = (this.valores.subtotal * this.valores.desconto.valor) / 100;
    } else {
      valorDesconto = this.valores.desconto.valor;
    }
  }
  
  // Calcular total
  this.valores.total = this.valores.subtotal - valorDesconto + this.valores.frete.valor;
  
  return this;
};

// Método para adicionar item
orderSchema.methods.adicionarItem = function(produto, quantidade, variantes = []) {
  const itemExistente = this.itens.find(item => 
    item.produto_id.toString() === produto._id.toString() &&
    JSON.stringify(item.variantes) === JSON.stringify(variantes)
  );
  
  if (itemExistente) {
    itemExistente.quantidade += quantidade;
    itemExistente.preco_total = itemExistente.quantidade * itemExistente.preco_unitario;
  } else {
    this.itens.push({
      produto_id: produto._id,
      nome: produto.nome,
      sku: produto.sku,
      quantidade,
      preco_unitario: produto.preco_efetivo,
      preco_total: quantidade * produto.preco_efetivo,
      variantes
    });
  }
  
  this.calcularValores();
  return this;
};

// Método para remover item
orderSchema.methods.removerItem = function(itemId) {
  this.itens = this.itens.filter(item => item._id.toString() !== itemId.toString());
  this.calcularValores();
  return this;
};

// Método para atualizar status
orderSchema.methods.atualizarStatus = function(novoStatus, observacao = '', usuario = null) {
  const statusAnterior = this.status;
  this.status = novoStatus;
  
  // Adicionar ao histórico
  this.historico.push({
    status: novoStatus,
    observacao: observacao || `Status alterado de ${statusAnterior} para ${novoStatus}`,
    usuario
  });
  
  // Ações específicas por status
  if (novoStatus === 'pagamento_confirmado') {
    this.pagamento.status = 'aprovado';
    this.pagamento.data_pagamento = new Date();
  }
  
  if (novoStatus === 'enviado' && this.valores.frete.prazo_entrega) {
    const dataEntrega = new Date();
    dataEntrega.setDate(dataEntrega.getDate() + this.valores.frete.prazo_entrega);
    this.data_entrega_prevista = dataEntrega;
  }
  
  if (novoStatus === 'entregue') {
    this.data_entrega_realizada = new Date();
  }
  
  return this.save();
};

// Método para cancelar pedido
orderSchema.methods.cancelar = function(motivo, usuario = null, solicitarReembolso = false) {
  if (!this.pode_cancelar) {
    throw new Error('Pedido não pode ser cancelado no status atual');
  }
  
  this.status = 'cancelado';
  this.cancelamento = {
    motivo,
    data: new Date(),
    usuario,
    reembolso: {
      solicitado: solicitarReembolso,
      valor: solicitarReembolso ? this.valores.total : 0,
      data_solicitacao: solicitarReembolso ? new Date() : null,
      status: solicitarReembolso ? 'pendente' : null
    }
  };
  
  // Adicionar ao histórico
  this.historico.push({
    status: 'cancelado',
    observacao: `Pedido cancelado: ${motivo}`,
    usuario
  });
  
  return this.save();
};

// Método para processar pagamento
orderSchema.methods.processarPagamento = function(dadosPagamento) {
  this.pagamento = {
    ...this.pagamento,
    ...dadosPagamento,
    data_pagamento: new Date()
  };
  
  if (dadosPagamento.status === 'aprovado') {
    this.atualizarStatus('pagamento_confirmado', 'Pagamento confirmado automaticamente');
  }
  
  return this.save();
};

// Método estático para criar pedido
orderSchema.statics.criarPedido = async function(dadosPedido) {
  const numeroPedido = await this.gerarNumeroPedido();
  
  const pedido = new this({
    numero_pedido: numeroPedido,
    ...dadosPedido
  });
  
  pedido.calcularValores();
  
  // Adicionar ao histórico
  pedido.historico.push({
    status: 'aguardando_pagamento',
    observacao: 'Pedido criado',
    data: new Date()
  });
  
  return pedido.save();
};

// Método estático para relatório de vendas
orderSchema.statics.relatorioVendas = function(filtros = {}) {
  const {
    data_inicio,
    data_fim,
    status,
    vendedor,
    origem
  } = filtros;
  
  const match = {};
  
  if (data_inicio || data_fim) {
    match.createdAt = {};
    if (data_inicio) match.createdAt.$gte = new Date(data_inicio);
    if (data_fim) match.createdAt.$lte = new Date(data_fim);
  }
  
  if (status) match.status = status;
  if (vendedor) match.vendedor = mongoose.Types.ObjectId(vendedor);
  if (origem) match.origem = origem;
  
  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        total_pedidos: { $sum: 1 },
        valor_total: { $sum: '$valores.total' },
        ticket_medio: { $avg: '$valores.total' },
        total_itens: { $sum: { $sum: '$itens.quantidade' } }
      }
    },
    {
      $project: {
        _id: 0,
        total_pedidos: 1,
        valor_total: { $round: ['$valor_total', 2] },
        ticket_medio: { $round: ['$ticket_medio', 2] },
        total_itens: 1
      }
    }
  ]);
};

// Método estático para produtos mais vendidos
orderSchema.statics.produtosMaisVendidos = function(limite = 10, filtros = {}) {
  const match = { status: { $in: ['entregue', 'pronto_retirada'] } };
  
  if (filtros.data_inicio || filtros.data_fim) {
    match.createdAt = {};
    if (filtros.data_inicio) match.createdAt.$gte = new Date(filtros.data_inicio);
    if (filtros.data_fim) match.createdAt.$lte = new Date(filtros.data_fim);
  }
  
  return this.aggregate([
    { $match: match },
    { $unwind: '$itens' },
    {
      $group: {
        _id: '$itens.produto_id',
        nome: { $first: '$itens.nome' },
        sku: { $first: '$itens.sku' },
        quantidade_vendida: { $sum: '$itens.quantidade' },
        receita_total: { $sum: '$itens.preco_total' },
        preco_medio: { $avg: '$itens.preco_unitario' }
      }
    },
    { $sort: { quantidade_vendida: -1 } },
    { $limit: limite },
    {
      $project: {
        produto_id: '$_id',
        nome: 1,
        sku: 1,
        quantidade_vendida: 1,
        receita_total: { $round: ['$receita_total', 2] },
        preco_medio: { $round: ['$preco_medio', 2] }
      }
    }
  ]);
};

// Middleware para validações
orderSchema.pre('save', function(next) {
  // Recalcular valores se itens foram modificados
  if (this.isModified('itens') || this.isModified('valores.desconto') || this.isModified('valores.frete')) {
    this.calcularValores();
  }
  
  // Validar endereço de entrega se necessário
  if (this.tipo_entrega === 'entrega' && !this.endereco_entrega.cep) {
    return next(new Error('Endereço de entrega é obrigatório para entregas'));
  }
  
  next();
});

// Middleware para atualizar estoque após confirmação
orderSchema.post('save', async function() {
  if (this.isModified('status') && this.status === 'pagamento_confirmado') {
    const Product = mongoose.model('Product');
    
    // Atualizar estoque dos produtos
    for (const item of this.itens) {
      try {
        const produto = await Product.findById(item.produto_id);
        if (produto) {
          await produto.atualizarEstoque(item.quantidade, 'subtrair');
          await produto.registrarVenda(item.quantidade);
        }
      } catch (error) {
        console.error(`Erro ao atualizar estoque do produto ${item.produto_id}:`, error);
      }
    }
  }
});

module.exports = mongoose.model('Order', orderSchema);