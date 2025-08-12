const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  nome: {
    type: String,
    required: [true, 'Nome do produto é obrigatório'],
    trim: true,
    maxlength: [100, 'Nome deve ter no máximo 100 caracteres']
  },
  sku: {
    type: String,
    required: [true, 'SKU é obrigatório'],
    unique: true,
    trim: true,
    uppercase: true
  },
  descricao: {
    type: String,
    maxlength: [1000, 'Descrição deve ter no máximo 1000 caracteres']
  },
  categoria: {
    type: String,
    enum: ['kimono', 'rashguard', 'camiseta', 'shorts', 'faixa', 'acessorio', 'suplemento', 'equipamento'],
    required: [true, 'Categoria é obrigatória']
  },
  subcategoria: {
    type: String,
    maxlength: [50, 'Subcategoria deve ter no máximo 50 caracteres']
  },
  marca: {
    type: String,
    maxlength: [50, 'Marca deve ter no máximo 50 caracteres']
  },
  preco: {
    type: Number,
    required: [true, 'Preço é obrigatório'],
    min: [0, 'Preço deve ser positivo']
  },
  preco_promocional: {
    type: Number,
    min: [0, 'Preço promocional deve ser positivo'],
    default: null
  },
  promocao: {
    ativa: {
      type: Boolean,
      default: false
    },
    data_inicio: Date,
    data_fim: Date,
    descricao: String
  },
  estoque: {
    controlar: {
      type: Boolean,
      default: true
    },
    quantidade: {
      type: Number,
      default: 0,
      min: [0, 'Quantidade em estoque deve ser positiva']
    },
    minimo: {
      type: Number,
      default: 5,
      min: [0, 'Estoque mínimo deve ser positivo']
    },
    maximo: {
      type: Number,
      default: 100,
      min: [0, 'Estoque máximo deve ser positivo']
    }
  },
  variantes: [{
    nome: {
      type: String,
      required: true
    }, // ex: "Tamanho", "Cor"
    opcoes: [{
      valor: String, // ex: "P", "M", "G", "Azul", "Branco"
      preco_adicional: {
        type: Number,
        default: 0
      },
      estoque: {
        type: Number,
        default: 0
      },
      sku_variante: String
    }]
  }],
  imagens: [{
    url: {
      type: String,
      required: true
    },
    alt: String,
    principal: {
      type: Boolean,
      default: false
    },
    ordem: {
      type: Number,
      default: 0
    }
  }],
  especificacoes: {
    peso: Number, // em gramas
    dimensoes: {
      comprimento: Number, // em cm
      largura: Number,
      altura: Number
    },
    material: String,
    cor: String,
    tamanho: String,
    genero: {
      type: String,
      enum: ['masculino', 'feminino', 'unissex', 'infantil']
    }
  },
  seo: {
    titulo: String,
    descricao: String,
    palavras_chave: [String],
    url_amigavel: {
      type: String,
      unique: true,
      sparse: true
    }
  },
  visivel: {
    type: Boolean,
    default: true
  },
  destaque: {
    type: Boolean,
    default: false
  },
  digital: {
    type: Boolean,
    default: false
  },
  arquivo_digital: {
    url: String,
    nome: String,
    tamanho: Number
  },
  fornecedor: {
    nome: String,
    contato: String,
    preco_custo: Number
  },
  estatisticas: {
    visualizacoes: {
      type: Number,
      default: 0
    },
    vendas: {
      type: Number,
      default: 0
    },
    avaliacao_media: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    total_avaliacoes: {
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
productSchema.index({ sku: 1 });
productSchema.index({ categoria: 1, visivel: 1 });
productSchema.index({ nome: 'text', descricao: 'text' });
productSchema.index({ 'seo.url_amigavel': 1 });
productSchema.index({ destaque: 1, visivel: 1 });
productSchema.index({ 'promocao.ativa': 1, 'promocao.data_fim': 1 });

// Virtual para preço efetivo (com promoção se ativa)
productSchema.virtual('preco_efetivo').get(function() {
  if (this.promocao.ativa && this.preco_promocional) {
    const agora = new Date();
    const inicioOk = !this.promocao.data_inicio || agora >= this.promocao.data_inicio;
    const fimOk = !this.promocao.data_fim || agora <= this.promocao.data_fim;
    
    if (inicioOk && fimOk) {
      return this.preco_promocional;
    }
  }
  
  return this.preco;
});

// Virtual para verificar se está em promoção
productSchema.virtual('em_promocao').get(function() {
  return this.preco_efetivo < this.preco;
});

// Virtual para percentual de desconto
productSchema.virtual('percentual_desconto').get(function() {
  if (!this.em_promocao) return 0;
  return Math.round(((this.preco - this.preco_efetivo) / this.preco) * 100);
});

// Virtual para verificar se está em estoque
productSchema.virtual('em_estoque').get(function() {
  if (!this.estoque.controlar) return true;
  return this.estoque.quantidade > 0;
});

// Virtual para verificar se estoque está baixo
productSchema.virtual('estoque_baixo').get(function() {
  if (!this.estoque.controlar) return false;
  return this.estoque.quantidade <= this.estoque.minimo;
});

// Virtual para imagem principal
productSchema.virtual('imagem_principal').get(function() {
  const principal = this.imagens.find(img => img.principal);
  return principal || this.imagens[0] || null;
});

// Virtual para URL amigável automática
productSchema.virtual('url_auto').get(function() {
  if (this.seo.url_amigavel) return this.seo.url_amigavel;
  
  return this.nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^a-z0-9\s-]/g, '') // Remove caracteres especiais
    .replace(/\s+/g, '-') // Substitui espaços por hífens
    .replace(/-+/g, '-') // Remove hífens duplicados
    .trim('-'); // Remove hífens das extremidades
});

// Método para atualizar estoque
productSchema.methods.atualizarEstoque = function(quantidade, operacao = 'subtrair') {
  if (!this.estoque.controlar) {
    return this;
  }
  
  if (operacao === 'subtrair') {
    if (this.estoque.quantidade < quantidade) {
      throw new Error('Estoque insuficiente');
    }
    this.estoque.quantidade -= quantidade;
  } else if (operacao === 'adicionar') {
    this.estoque.quantidade += quantidade;
  } else if (operacao === 'definir') {
    this.estoque.quantidade = quantidade;
  }
  
  return this.save();
};

// Método para adicionar avaliação
productSchema.methods.adicionarAvaliacao = function(nota) {
  if (nota < 1 || nota > 5) {
    throw new Error('Nota deve estar entre 1 e 5');
  }
  
  const totalAvaliacoes = this.estatisticas.total_avaliacoes;
  const mediaAtual = this.estatisticas.avaliacao_media;
  
  // Calcular nova média
  const novaMedia = ((mediaAtual * totalAvaliacoes) + nota) / (totalAvaliacoes + 1);
  
  this.estatisticas.avaliacao_media = Math.round(novaMedia * 100) / 100;
  this.estatisticas.total_avaliacoes += 1;
  
  return this.save();
};

// Método para incrementar visualizações
productSchema.methods.incrementarVisualizacoes = function() {
  this.estatisticas.visualizacoes += 1;
  return this.save({ validateBeforeSave: false });
};

// Método para registrar venda
productSchema.methods.registrarVenda = function(quantidade = 1) {
  this.estatisticas.vendas += quantidade;
  
  // Atualizar estoque se controlado
  if (this.estoque.controlar) {
    this.atualizarEstoque(quantidade, 'subtrair');
  }
  
  return this.save();
};

// Método estático para buscar produtos
productSchema.statics.buscarProdutos = function(filtros = {}) {
  const {
    categoria,
    marca,
    preco_min,
    preco_max,
    em_estoque,
    promocao,
    busca,
    ordenar = 'nome',
    limite = 20,
    pagina = 1
  } = filtros;
  
  const query = { visivel: true };
  
  if (categoria) query.categoria = categoria;
  if (marca) query.marca = marca;
  if (em_estoque) query['estoque.quantidade'] = { $gt: 0 };
  if (promocao) query['promocao.ativa'] = true;
  
  // Filtro de preço (complexo devido ao preço promocional)
  if (preco_min || preco_max) {
    const precoFilter = {};
    if (preco_min) precoFilter.$gte = preco_min;
    if (preco_max) precoFilter.$lte = preco_max;
    
    query.$or = [
      { preco: precoFilter },
      { preco_promocional: precoFilter }
    ];
  }
  
  let queryBuilder = this.find(query);
  
  // Busca textual
  if (busca) {
    queryBuilder = queryBuilder.find({ $text: { $search: busca } });
  }
  
  // Ordenação
  const ordenacoes = {
    'nome': { nome: 1 },
    'preco_asc': { preco: 1 },
    'preco_desc': { preco: -1 },
    'vendas': { 'estatisticas.vendas': -1 },
    'avaliacao': { 'estatisticas.avaliacao_media': -1 },
    'recente': { createdAt: -1 }
  };
  
  queryBuilder = queryBuilder.sort(ordenacoes[ordenar] || ordenacoes.nome);
  
  // Paginação
  const skip = (pagina - 1) * limite;
  queryBuilder = queryBuilder.skip(skip).limit(limite);
  
  return queryBuilder;
};

// Método estático para produtos em destaque
productSchema.statics.produtosDestaque = function(limite = 8) {
  return this.find({
    visivel: true,
    destaque: true
  })
  .sort({ 'estatisticas.vendas': -1 })
  .limit(limite);
};

// Método estático para produtos relacionados
productSchema.statics.produtosRelacionados = function(produtoId, limite = 4) {
  return this.findById(produtoId)
    .then(produto => {
      if (!produto) return [];
      
      return this.find({
        _id: { $ne: produtoId },
        categoria: produto.categoria,
        visivel: true
      })
      .sort({ 'estatisticas.vendas': -1 })
      .limit(limite);
    });
};

// Método estático para relatório de estoque
productSchema.statics.relatorioEstoque = function() {
  return this.aggregate([
    {
      $match: {
        'estoque.controlar': true,
        visivel: true
      }
    },
    {
      $addFields: {
        status_estoque: {
          $cond: {
            if: { $eq: ['$estoque.quantidade', 0] },
            then: 'sem_estoque',
            else: {
              $cond: {
                if: { $lte: ['$estoque.quantidade', '$estoque.minimo'] },
                then: 'estoque_baixo',
                else: 'normal'
              }
            }
          }
        }
      }
    },
    {
      $group: {
        _id: '$status_estoque',
        produtos: { $push: '$$ROOT' },
        total: { $sum: 1 },
        valor_total: { $sum: { $multiply: ['$preco', '$estoque.quantidade'] } }
      }
    }
  ]);
};

// Middleware para validações
productSchema.pre('save', function(next) {
  // Gerar URL amigável se não existe
  if (!this.seo.url_amigavel) {
    this.seo.url_amigavel = this.url_auto;
  }
  
  // Validar promoção
  if (this.promocao.ativa && this.preco_promocional >= this.preco) {
    return next(new Error('Preço promocional deve ser menor que o preço normal'));
  }
  
  // Garantir que apenas uma imagem seja principal
  const imagensPrincipais = this.imagens.filter(img => img.principal);
  if (imagensPrincipais.length > 1) {
    this.imagens.forEach((img, index) => {
      img.principal = index === 0;
    });
  } else if (imagensPrincipais.length === 0 && this.imagens.length > 0) {
    this.imagens[0].principal = true;
  }
  
  next();
});

// Middleware para atualizar estatísticas
productSchema.post('save', function() {
  // Aqui poderia implementar cache ou outras atualizações
});

module.exports = mongoose.model('Product', productSchema);