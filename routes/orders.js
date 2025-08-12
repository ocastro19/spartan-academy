const express = require('express');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Student = require('../models/Student');
const { auth, adminOnly, adminOrInstructor, ownerOrAdmin } = require('../middleware/auth');
const { validateOrder, validateParams, validateQuery } = require('../middleware/validation');

const router = express.Router();

// @route   GET /api/orders
// @desc    Listar pedidos
// @access  Private (Admin/Instructor)
router.get('/', [auth, adminOrInstructor, ...validateQuery.pagination], async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      cliente_id,
      status,
      data_inicio,
      data_fim,
      valor_min,
      valor_max,
      busca
    } = req.query;
    
    const query = {};
    
    // Filtros
    if (cliente_id) query.cliente_id = cliente_id;
    if (status) query.status = status;
    
    // Filtro de data
    if (data_inicio || data_fim) {
      query.data_pedido = {};
      if (data_inicio) query.data_pedido.$gte = new Date(data_inicio);
      if (data_fim) query.data_pedido.$lte = new Date(data_fim);
    }
    
    // Filtro de valor
    if (valor_min || valor_max) {
      query.valor_total = {};
      if (valor_min) query.valor_total.$gte = parseFloat(valor_min);
      if (valor_max) query.valor_total.$lte = parseFloat(valor_max);
    }
    
    // Busca textual
    if (busca) {
      query.$or = [
        { numero_pedido: { $regex: busca, $options: 'i' } },
        { 'observacoes': { $regex: busca, $options: 'i' } }
      ];
    }
    
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { data_pedido: -1 },
      populate: [
        {
          path: 'cliente_id',
          select: 'nome email telefone'
        },
        {
          path: 'itens.produto_id',
          select: 'nome codigo preco categoria'
        }
      ]
    };
    
    const orders = await Order.paginate(query, options);
    
    res.json({
      success: true,
      data: orders
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/orders/my
// @desc    Meus pedidos (aluno)
// @access  Private (Student)
router.get('/my', [auth, ...validateQuery.pagination], async (req, res) => {
  try {
    if (req.user.perfil !== 'aluno') {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado'
      });
    }
    
    const student = await Student.findOne({ user_id: req.user._id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Dados do aluno não encontrados'
      });
    }
    
    const {
      page = 1,
      limit = 20,
      status
    } = req.query;
    
    const query = { cliente_id: student._id };
    if (status) query.status = status;
    
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { data_pedido: -1 },
      populate: [
        {
          path: 'itens.produto_id',
          select: 'nome codigo preco categoria imagens'
        }
      ]
    };
    
    const orders = await Order.paginate(query, options);
    
    res.json({
      success: true,
      data: orders
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/orders/stats
// @desc    Estatísticas de pedidos
// @access  Private (Admin/Instructor)
router.get('/stats', [auth, adminOrInstructor], async (req, res) => {
  try {
    const { periodo = 30 } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(periodo));
    
    const matchQuery = {
      data_pedido: { $gte: startDate }
    };
    
    // Estatísticas gerais
    const generalStats = await Order.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          total_pedidos: { $sum: 1 },
          valor_total: { $sum: '$valor_total' },
          ticket_medio: { $avg: '$valor_total' },
          pendentes: {
            $sum: { $cond: [{ $eq: ['$status', 'pendente'] }, 1, 0] }
          },
          confirmados: {
            $sum: { $cond: [{ $eq: ['$status', 'confirmado'] }, 1, 0] }
          },
          entregues: {
            $sum: { $cond: [{ $eq: ['$status', 'entregue'] }, 1, 0] }
          },
          cancelados: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelado'] }, 1, 0] }
          }
        }
      }
    ]);
    
    // Pedidos por dia
    const dailyStats = await Order.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: {
            ano: { $year: '$data_pedido' },
            mes: { $month: '$data_pedido' },
            dia: { $dayOfMonth: '$data_pedido' }
          },
          total_pedidos: { $sum: 1 },
          valor_total: { $sum: '$valor_total' }
        }
      },
      {
        $sort: { '_id.ano': 1, '_id.mes': 1, '_id.dia': 1 }
      }
    ]);
    
    // Produtos mais vendidos
    const topProducts = await Order.aggregate([
      { $match: matchQuery },
      { $unwind: '$itens' },
      {
        $group: {
          _id: '$itens.produto_id',
          quantidade_vendida: { $sum: '$itens.quantidade' },
          valor_total: { $sum: { $multiply: ['$itens.quantidade', '$itens.preco_unitario'] } },
          pedidos: { $addToSet: '$_id' }
        }
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'produto_info'
        }
      },
      {
        $unwind: '$produto_info'
      },
      {
        $project: {
          nome: '$produto_info.nome',
          categoria: '$produto_info.categoria',
          quantidade_vendida: 1,
          valor_total: 1,
          total_pedidos: { $size: '$pedidos' }
        }
      },
      {
        $sort: { quantidade_vendida: -1 }
      },
      { $limit: 10 }
    ]);
    
    // Clientes que mais compraram
    const topCustomers = await Order.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$cliente_id',
          total_pedidos: { $sum: 1 },
          valor_total: { $sum: '$valor_total' },
          ticket_medio: { $avg: '$valor_total' }
        }
      },
      {
        $lookup: {
          from: 'students',
          localField: '_id',
          foreignField: '_id',
          as: 'cliente_info'
        }
      },
      {
        $unwind: '$cliente_info'
      },
      {
        $project: {
          nome: '$cliente_info.nome',
          email: '$cliente_info.email',
          total_pedidos: 1,
          valor_total: 1,
          ticket_medio: 1
        }
      },
      {
        $sort: { valor_total: -1 }
      },
      { $limit: 10 }
    ]);
    
    res.json({
      success: true,
      data: {
        periodo: {
          inicio: startDate,
          fim: new Date(),
          dias: parseInt(periodo)
        },
        geral: generalStats[0] || {
          total_pedidos: 0,
          valor_total: 0,
          ticket_medio: 0,
          pendentes: 0,
          confirmados: 0,
          entregues: 0,
          cancelados: 0
        },
        por_dia: dailyStats,
        produtos_mais_vendidos: topProducts,
        melhores_clientes: topCustomers
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

// @route   GET /api/orders/:id
// @desc    Obter pedido por ID
// @access  Private
router.get('/:id', [auth, ...validateParams.mongoId], async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('cliente_id', 'nome email telefone grupo')
      .populate('itens.produto_id', 'nome codigo categoria imagens')
      .populate('atualizado_por', 'nome email');
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Pedido não encontrado'
      });
    }
    
    // Verificar permissão
    if (req.user.perfil === 'aluno') {
      const student = await Student.findOne({ user_id: req.user._id });
      if (!student || !order.cliente_id._id.equals(student._id)) {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado'
        });
      }
    }
    
    res.json({
      success: true,
      data: order
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/orders
// @desc    Criar pedido
// @access  Private
router.post('/', [auth, ...validateOrder.create], async (req, res) => {
  try {
    let cliente_id;
    
    // Se for admin, pode criar pedido para qualquer cliente
    if (req.user.perfil === 'admin' && req.body.cliente_id) {
      const student = await Student.findById(req.body.cliente_id);
      if (!student) {
        return res.status(404).json({
          success: false,
          message: 'Cliente não encontrado'
        });
      }
      cliente_id = req.body.cliente_id;
    } else {
      // Para alunos, o pedido é sempre para eles mesmos
      if (req.user.perfil !== 'aluno') {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado'
        });
      }
      
      const student = await Student.findOne({ user_id: req.user._id });
      if (!student) {
        return res.status(404).json({
          success: false,
          message: 'Dados do aluno não encontrados'
        });
      }
      
      if (student.status !== 'ativo') {
        return res.status(400).json({
          success: false,
          message: 'Apenas alunos ativos podem fazer pedidos'
        });
      }
      
      cliente_id = student._id;
    }
    
    // Validar itens do pedido
    const itensValidados = [];
    let valorTotal = 0;
    
    for (const item of req.body.itens) {
      const product = await Product.findById(item.produto_id);
      
      if (!product) {
        return res.status(404).json({
          success: false,
          message: `Produto ${item.produto_id} não encontrado`
        });
      }
      
      if (!product.ativo || !product.disponivel) {
        return res.status(400).json({
          success: false,
          message: `Produto ${product.nome} não está disponível`
        });
      }
      
      if (product.estoque < item.quantidade) {
        return res.status(400).json({
          success: false,
          message: `Estoque insuficiente para o produto ${product.nome}. Disponível: ${product.estoque}`
        });
      }
      
      const itemValidado = {
        produto_id: product._id,
        nome_produto: product.nome,
        quantidade: item.quantidade,
        preco_unitario: product.preco,
        subtotal: product.preco * item.quantidade
      };
      
      itensValidados.push(itemValidado);
      valorTotal += itemValidado.subtotal;
    }
    
    // Gerar número do pedido
    const numeroPedido = await Order.gerarNumeroPedido();
    
    const orderData = {
      numero_pedido: numeroPedido,
      cliente_id,
      itens: itensValidados,
      valor_total: valorTotal,
      status: 'pendente',
      data_pedido: new Date(),
      observacoes: req.body.observacoes,
      endereco_entrega: req.body.endereco_entrega
    };
    
    const order = new Order(orderData);
    await order.save();
    
    // Atualizar estoque dos produtos
    for (const item of itensValidados) {
      await Product.findByIdAndUpdate(
        item.produto_id,
        {
          $inc: { 
            estoque: -item.quantidade,
            vendas: item.quantidade
          },
          $push: {
            historico_estoque: {
              data: new Date(),
              operacao: 'subtract',
              quantidade: item.quantidade,
              motivo: `Venda - Pedido ${numeroPedido}`,
              usuario: req.user._id
            }
          }
        }
      );
    }
    
    await order.populate([
      { path: 'cliente_id', select: 'nome email telefone' },
      { path: 'itens.produto_id', select: 'nome codigo categoria' }
    ]);
    
    res.status(201).json({
      success: true,
      message: 'Pedido criado com sucesso',
      data: order
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   PUT /api/orders/:id/status
// @desc    Atualizar status do pedido
// @access  Private (Admin/Instructor)
router.put('/:id/status', [auth, adminOrInstructor, ...validateParams.mongoId], async (req, res) => {
  try {
    const { status, observacoes } = req.body;
    
    const statusValidos = ['pendente', 'confirmado', 'preparando', 'pronto', 'entregue', 'cancelado'];
    if (!statusValidos.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status inválido',
        status_validos: statusValidos
      });
    }
    
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Pedido não encontrado'
      });
    }
    
    // Não permitir alterar pedidos já entregues ou cancelados
    if (['entregue', 'cancelado'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Não é possível alterar pedido ${order.status}`
      });
    }
    
    const statusAnterior = order.status;
    
    // Se estiver cancelando, devolver produtos ao estoque
    if (status === 'cancelado' && statusAnterior !== 'cancelado') {
      for (const item of order.itens) {
        await Product.findByIdAndUpdate(
          item.produto_id,
          {
            $inc: { 
              estoque: item.quantidade,
              vendas: -item.quantidade
            },
            $push: {
              historico_estoque: {
                data: new Date(),
                operacao: 'add',
                quantidade: item.quantidade,
                motivo: `Cancelamento - Pedido ${order.numero_pedido}`,
                usuario: req.user._id
              }
            }
          }
        );
      }
    }
    
    order.status = status;
    order.atualizado_em = new Date();
    order.atualizado_por = req.user._id;
    
    if (observacoes) {
      order.observacoes = observacoes;
    }
    
    // Registrar data específica do status
    switch (status) {
      case 'confirmado':
        order.data_confirmacao = new Date();
        break;
      case 'entregue':
        order.data_entrega = new Date();
        break;
      case 'cancelado':
        order.data_cancelamento = new Date();
        break;
    }
    
    await order.save();
    
    res.json({
      success: true,
      message: `Status do pedido alterado para ${status}`,
      data: {
        id: order._id,
        numero_pedido: order.numero_pedido,
        status_anterior: statusAnterior,
        status_atual: status,
        atualizado_em: order.atualizado_em
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

// @route   PUT /api/orders/:id
// @desc    Atualizar pedido
// @access  Private (Admin only)
router.put('/:id', [auth, adminOnly, ...validateParams.mongoId, ...validateOrder.update], async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Pedido não encontrado'
      });
    }
    
    // Não permitir alterar pedidos já entregues
    if (order.status === 'entregue') {
      return res.status(400).json({
        success: false,
        message: 'Não é possível alterar pedido já entregue'
      });
    }
    
    const updatedOrder = await Order.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        atualizado_em: new Date(),
        atualizado_por: req.user._id
      },
      { new: true, runValidators: true }
    ).populate([
      { path: 'cliente_id', select: 'nome email telefone' },
      { path: 'itens.produto_id', select: 'nome codigo categoria' }
    ]);
    
    res.json({
      success: true,
      message: 'Pedido atualizado com sucesso',
      data: updatedOrder
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   DELETE /api/orders/:id
// @desc    Deletar pedido
// @access  Private (Admin only)
router.delete('/:id', [auth, adminOnly, ...validateParams.mongoId], async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Pedido não encontrado'
      });
    }
    
    // Não permitir deletar pedidos entregues
    if (order.status === 'entregue') {
      return res.status(400).json({
        success: false,
        message: 'Não é possível deletar pedido já entregue'
      });
    }
    
    // Se o pedido não estava cancelado, devolver produtos ao estoque
    if (order.status !== 'cancelado') {
      for (const item of order.itens) {
        await Product.findByIdAndUpdate(
          item.produto_id,
          {
            $inc: { 
              estoque: item.quantidade,
              vendas: -item.quantidade
            },
            $push: {
              historico_estoque: {
                data: new Date(),
                operacao: 'add',
                quantidade: item.quantidade,
                motivo: `Exclusão - Pedido ${order.numero_pedido}`,
                usuario: req.user._id
              }
            }
          }
        );
      }
    }
    
    await Order.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'Pedido deletado com sucesso'
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