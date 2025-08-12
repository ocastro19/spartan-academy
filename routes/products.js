const express = require('express');
const multer = require('multer');
const path = require('path');
const Product = require('../models/Product');
const { auth, adminOnly, adminOrInstructor } = require('../middleware/auth');
const { validateProduct, validateParams, validateQuery } = require('../middleware/validation');

const router = express.Router();

// Configuração do multer para upload de imagens
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/products/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'product-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Apenas imagens são permitidas (JPEG, PNG, GIF, WebP)'));
    }
  }
});

// @route   GET /api/products
// @desc    Listar produtos
// @access  Public
router.get('/', [...validateQuery.pagination], async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      categoria,
      ativo,
      disponivel,
      preco_min,
      preco_max,
      busca,
      ordenar = 'nome'
    } = req.query;
    
    const query = {};
    
    // Filtros
    if (categoria) query.categoria = categoria;
    if (ativo !== undefined) query.ativo = ativo === 'true';
    if (disponivel !== undefined) query.disponivel = disponivel === 'true';
    
    // Filtro de preço
    if (preco_min || preco_max) {
      query.preco = {};
      if (preco_min) query.preco.$gte = parseFloat(preco_min);
      if (preco_max) query.preco.$lte = parseFloat(preco_max);
    }
    
    // Busca textual
    if (busca) {
      query.$or = [
        { nome: { $regex: busca, $options: 'i' } },
        { descricao: { $regex: busca, $options: 'i' } },
        { codigo: { $regex: busca, $options: 'i' } }
      ];
    }
    
    // Ordenação
    let sortOption = {};
    switch (ordenar) {
      case 'preco_asc':
        sortOption = { preco: 1 };
        break;
      case 'preco_desc':
        sortOption = { preco: -1 };
        break;
      case 'categoria':
        sortOption = { categoria: 1, nome: 1 };
        break;
      case 'criado_em':
        sortOption = { criado_em: -1 };
        break;
      default:
        sortOption = { nome: 1 };
    }
    
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: sortOption
    };
    
    const products = await Product.paginate(query, options);
    
    res.json({
      success: true,
      data: products
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/products/categories
// @desc    Listar categorias de produtos
// @access  Public
router.get('/categories', async (req, res) => {
  try {
    const categories = await Product.distinct('categoria', { ativo: true });
    
    res.json({
      success: true,
      data: categories.sort()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/products/stats
// @desc    Estatísticas de produtos
// @access  Private (Admin/Instructor)
router.get('/stats', [auth, adminOrInstructor], async (req, res) => {
  try {
    const stats = await Product.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          ativos: {
            $sum: { $cond: [{ $eq: ['$ativo', true] }, 1, 0] }
          },
          disponiveis: {
            $sum: { $cond: [{ $eq: ['$disponivel', true] }, 1, 0] }
          },
          sem_estoque: {
            $sum: { $cond: [{ $lte: ['$estoque', 0] }, 1, 0] }
          },
          estoque_baixo: {
            $sum: { $cond: [{ $and: [{ $gt: ['$estoque', 0] }, { $lte: ['$estoque', '$estoque_minimo'] }] }, 1, 0] }
          },
          valor_total_estoque: {
            $sum: { $multiply: ['$preco', '$estoque'] }
          }
        }
      }
    ]);
    
    // Estatísticas por categoria
    const categoryStats = await Product.aggregate([
      {
        $group: {
          _id: '$categoria',
          total: { $sum: 1 },
          ativos: {
            $sum: { $cond: [{ $eq: ['$ativo', true] }, 1, 0] }
          },
          valor_medio: { $avg: '$preco' },
          estoque_total: { $sum: '$estoque' }
        }
      },
      {
        $sort: { total: -1 }
      }
    ]);
    
    // Produtos mais vendidos (se houver campo de vendas)
    const topProducts = await Product.find({ ativo: true })
      .sort({ vendas: -1 })
      .limit(10)
      .select('nome categoria preco estoque vendas');
    
    // Produtos com estoque baixo
    const lowStockProducts = await Product.find({
      ativo: true,
      $expr: { $lte: ['$estoque', '$estoque_minimo'] }
    })
      .select('nome categoria preco estoque estoque_minimo')
      .sort({ estoque: 1 })
      .limit(20);
    
    res.json({
      success: true,
      data: {
        geral: stats[0] || {
          total: 0,
          ativos: 0,
          disponiveis: 0,
          sem_estoque: 0,
          estoque_baixo: 0,
          valor_total_estoque: 0
        },
        por_categoria: categoryStats,
        mais_vendidos: topProducts,
        estoque_baixo: lowStockProducts
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/products/:id
// @desc    Obter produto por ID
// @access  Public
router.get('/:id', [...validateParams.mongoId], async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Produto não encontrado'
      });
    }
    
    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/products
// @desc    Criar produto
// @access  Private (Admin only)
router.post('/', [auth, adminOnly, ...validateProduct.create], async (req, res) => {
  try {
    // Verificar se já existe produto com o mesmo código
    if (req.body.codigo) {
      const existingProduct = await Product.findOne({ codigo: req.body.codigo });
      if (existingProduct) {
        return res.status(400).json({
          success: false,
          message: 'Já existe um produto com este código'
        });
      }
    }
    
    const product = new Product({
      ...req.body,
      criado_por: req.user._id
    });
    
    await product.save();
    
    res.status(201).json({
      success: true,
      message: 'Produto criado com sucesso',
      data: product
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Código do produto já existe'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   PUT /api/products/:id
// @desc    Atualizar produto
// @access  Private (Admin only)
router.put('/:id', [auth, adminOnly, ...validateParams.mongoId, ...validateProduct.update], async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Produto não encontrado'
      });
    }
    
    // Verificar se o código não está sendo usado por outro produto
    if (req.body.codigo && req.body.codigo !== product.codigo) {
      const existingProduct = await Product.findOne({ 
        codigo: req.body.codigo,
        _id: { $ne: req.params.id }
      });
      if (existingProduct) {
        return res.status(400).json({
          success: false,
          message: 'Já existe um produto com este código'
        });
      }
    }
    
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        atualizado_em: new Date(),
        atualizado_por: req.user._id
      },
      { new: true, runValidators: true }
    );
    
    res.json({
      success: true,
      message: 'Produto atualizado com sucesso',
      data: updatedProduct
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Código do produto já existe'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   PUT /api/products/:id/stock
// @desc    Atualizar estoque do produto
// @access  Private (Admin only)
router.put('/:id/stock', [auth, adminOnly, ...validateParams.mongoId], async (req, res) => {
  try {
    const { quantidade, operacao = 'set', motivo } = req.body;
    
    if (!quantidade || quantidade < 0) {
      return res.status(400).json({
        success: false,
        message: 'Quantidade deve ser um número positivo'
      });
    }
    
    if (!['set', 'add', 'subtract'].includes(operacao)) {
      return res.status(400).json({
        success: false,
        message: 'Operação deve ser: set, add ou subtract'
      });
    }
    
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Produto não encontrado'
      });
    }
    
    const estoqueAnterior = product.estoque;
    let novoEstoque;
    
    switch (operacao) {
      case 'set':
        novoEstoque = quantidade;
        break;
      case 'add':
        novoEstoque = estoqueAnterior + quantidade;
        break;
      case 'subtract':
        novoEstoque = Math.max(0, estoqueAnterior - quantidade);
        break;
    }
    
    product.estoque = novoEstoque;
    product.atualizado_em = new Date();
    product.atualizado_por = req.user._id;
    
    // Registrar movimentação de estoque
    product.historico_estoque.push({
      data: new Date(),
      operacao,
      quantidade,
      estoque_anterior: estoqueAnterior,
      estoque_atual: novoEstoque,
      motivo: motivo || `${operacao} realizada por ${req.user.nome}`,
      usuario: req.user._id
    });
    
    await product.save();
    
    res.json({
      success: true,
      message: 'Estoque atualizado com sucesso',
      data: {
        id: product._id,
        nome: product.nome,
        estoque_anterior: estoqueAnterior,
        estoque_atual: novoEstoque,
        operacao,
        quantidade
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/products/:id/images
// @desc    Upload de imagem do produto
// @access  Private (Admin only)
router.post('/:id/images', [auth, adminOnly, ...validateParams.mongoId], upload.array('images', 5), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Produto não encontrado'
      });
    }
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Nenhuma imagem foi enviada'
      });
    }
    
    const newImages = req.files.map(file => ({
      url: `/uploads/products/${file.filename}`,
      nome_original: file.originalname,
      tamanho: file.size,
      adicionada_em: new Date()
    }));
    
    product.imagens.push(...newImages);
    product.atualizado_em = new Date();
    product.atualizado_por = req.user._id;
    
    await product.save();
    
    res.json({
      success: true,
      message: `${newImages.length} imagem(ns) adicionada(s) com sucesso`,
      data: {
        id: product._id,
        imagens_adicionadas: newImages,
        total_imagens: product.imagens.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   DELETE /api/products/:id/images/:imageId
// @desc    Remover imagem do produto
// @access  Private (Admin only)
router.delete('/:id/images/:imageId', [auth, adminOnly, ...validateParams.mongoId], async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Produto não encontrado'
      });
    }
    
    const imageIndex = product.imagens.findIndex(
      img => img._id.toString() === req.params.imageId
    );
    
    if (imageIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Imagem não encontrada'
      });
    }
    
    product.imagens.splice(imageIndex, 1);
    product.atualizado_em = new Date();
    product.atualizado_por = req.user._id;
    
    await product.save();
    
    res.json({
      success: true,
      message: 'Imagem removida com sucesso',
      data: {
        id: product._id,
        total_imagens: product.imagens.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   PUT /api/products/:id/toggle-status
// @desc    Ativar/desativar produto
// @access  Private (Admin only)
router.put('/:id/toggle-status', [auth, adminOnly, ...validateParams.mongoId], async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Produto não encontrado'
      });
    }
    
    product.ativo = !product.ativo;
    product.atualizado_em = new Date();
    product.atualizado_por = req.user._id;
    
    await product.save();
    
    res.json({
      success: true,
      message: `Produto ${product.ativo ? 'ativado' : 'desativado'} com sucesso`,
      data: {
        id: product._id,
        nome: product.nome,
        ativo: product.ativo
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   PUT /api/products/:id/toggle-availability
// @desc    Marcar produto como disponível/indisponível
// @access  Private (Admin only)
router.put('/:id/toggle-availability', [auth, adminOnly, ...validateParams.mongoId], async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Produto não encontrado'
      });
    }
    
    product.disponivel = !product.disponivel;
    product.atualizado_em = new Date();
    product.atualizado_por = req.user._id;
    
    await product.save();
    
    res.json({
      success: true,
      message: `Produto marcado como ${product.disponivel ? 'disponível' : 'indisponível'}`,
      data: {
        id: product._id,
        nome: product.nome,
        disponivel: product.disponivel
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/products/:id/stock-history
// @desc    Histórico de movimentação de estoque
// @access  Private (Admin only)
router.get('/:id/stock-history', [auth, adminOnly, ...validateParams.mongoId, ...validateQuery.pagination], async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('historico_estoque.usuario', 'nome email')
      .select('nome codigo historico_estoque');
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Produto não encontrado'
      });
    }
    
    const { page = 1, limit = 20 } = req.query;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    
    const history = product.historico_estoque
      .sort((a, b) => new Date(b.data) - new Date(a.data))
      .slice(startIndex, endIndex);
    
    const total = product.historico_estoque.length;
    const totalPages = Math.ceil(total / limit);
    
    res.json({
      success: true,
      data: {
        produto: {
          id: product._id,
          nome: product.nome,
          codigo: product.codigo
        },
        historico: history,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   DELETE /api/products/:id
// @desc    Deletar produto
// @access  Private (Admin only)
router.delete('/:id', [auth, adminOnly, ...validateParams.mongoId], async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Produto não encontrado'
      });
    }
    
    // Verificar se o produto tem pedidos associados
    // Esta verificação seria implementada quando o modelo Order for criado
    
    await Product.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'Produto deletado com sucesso'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;