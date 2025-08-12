const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const logger = require('./logger');

// Configuração do cliente Mercado Pago
let client;

const initializeMercadoPago = () => {
  try {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    
    if (!accessToken) {
      throw new Error('MERCADOPAGO_ACCESS_TOKEN não configurado');
    }
    
    client = new MercadoPagoConfig({
      accessToken,
      options: {
        timeout: 5000,
        idempotencyKey: 'spartan-api'
      }
    });
    
    logger.info('Mercado Pago inicializado com sucesso', {
      environment: process.env.NODE_ENV,
      sandbox: accessToken.includes('TEST')
    });
    
    return client;
    
  } catch (error) {
    logger.error('Erro ao inicializar Mercado Pago:', {
      error: error.message
    });
    throw error;
  }
};

// Função para criar preferência de pagamento
const createPaymentPreference = async (paymentData) => {
  try {
    if (!client) {
      initializeMercadoPago();
    }
    
    const preference = new Preference(client);
    
    const preferenceData = {
      items: [{
        id: paymentData.id,
        title: paymentData.title,
        description: paymentData.description,
        quantity: 1,
        unit_price: paymentData.amount,
        currency_id: 'BRL'
      }],
      payer: {
        name: paymentData.payer.name,
        surname: paymentData.payer.surname,
        email: paymentData.payer.email,
        phone: paymentData.payer.phone ? {
          area_code: paymentData.payer.phone.area_code,
          number: paymentData.payer.phone.number
        } : undefined,
        identification: paymentData.payer.document ? {
          type: paymentData.payer.document.type,
          number: paymentData.payer.document.number
        } : undefined,
        address: paymentData.payer.address ? {
          street_name: paymentData.payer.address.street_name,
          street_number: paymentData.payer.address.street_number,
          zip_code: paymentData.payer.address.zip_code
        } : undefined
      },
      back_urls: {
        success: `${process.env.FRONTEND_URL}/payment/success`,
        failure: `${process.env.FRONTEND_URL}/payment/failure`,
        pending: `${process.env.FRONTEND_URL}/payment/pending`
      },
      auto_return: 'approved',
      external_reference: paymentData.external_reference,
      notification_url: `${process.env.API_URL}/api/webhooks/mercadopago`,
      statement_descriptor: process.env.ACADEMY_NAME || 'SPARTAN ACADEMY',
      expires: true,
      expiration_date_from: new Date().toISOString(),
      expiration_date_to: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 horas
      payment_methods: {
        excluded_payment_methods: [],
        excluded_payment_types: [],
        installments: paymentData.installments || 12
      },
      shipments: {
        mode: 'not_specified'
      }
    };
    
    const result = await preference.create({ body: preferenceData });
    
    logger.payment('Preferência criada', {
      preferenceId: result.id,
      externalReference: paymentData.external_reference,
      amount: paymentData.amount,
      payerEmail: paymentData.payer.email
    });
    
    return {
      id: result.id,
      init_point: result.init_point,
      sandbox_init_point: result.sandbox_init_point,
      external_reference: paymentData.external_reference,
      expires_at: preferenceData.expiration_date_to
    };
    
  } catch (error) {
    logger.error('Erro ao criar preferência de pagamento:', {
      error: error.message,
      stack: error.stack,
      paymentData: {
        id: paymentData.id,
        amount: paymentData.amount,
        external_reference: paymentData.external_reference
      }
    });
    throw error;
  }
};

// Função para buscar informações de um pagamento
const getPayment = async (paymentId) => {
  try {
    if (!client) {
      initializeMercadoPago();
    }
    
    const payment = new Payment(client);
    const result = await payment.get({ id: paymentId });
    
    logger.payment('Pagamento consultado', {
      paymentId,
      status: result.status,
      externalReference: result.external_reference
    });
    
    return result;
    
  } catch (error) {
    logger.error('Erro ao buscar pagamento:', {
      error: error.message,
      paymentId
    });
    throw error;
  }
};

// Função para processar webhook do Mercado Pago
const processWebhook = async (webhookData) => {
  try {
    const { type, data } = webhookData;
    
    logger.webhook('mercadopago', type, 'received', {
      dataId: data?.id,
      type
    });
    
    if (type === 'payment') {
      const paymentId = data.id;
      const paymentInfo = await getPayment(paymentId);
      
      return {
        type: 'payment',
        payment: {
          id: paymentInfo.id,
          status: paymentInfo.status,
          status_detail: paymentInfo.status_detail,
          external_reference: paymentInfo.external_reference,
          transaction_amount: paymentInfo.transaction_amount,
          net_received_amount: paymentInfo.transaction_details?.net_received_amount,
          date_created: paymentInfo.date_created,
          date_approved: paymentInfo.date_approved,
          payer: {
            email: paymentInfo.payer?.email,
            identification: paymentInfo.payer?.identification
          },
          payment_method: {
            id: paymentInfo.payment_method_id,
            type: paymentInfo.payment_type_id
          }
        }
      };
    }
    
    return { type, processed: false };
    
  } catch (error) {
    logger.error('Erro ao processar webhook:', {
      error: error.message,
      webhookData
    });
    throw error;
  }
};

// Função para validar webhook (verificar se veio do Mercado Pago)
const validateWebhook = (req) => {
  try {
    const signature = req.headers['x-signature'];
    const requestId = req.headers['x-request-id'];
    
    if (!signature || !requestId) {
      return false;
    }
    
    // TODO: Implementar validação de assinatura se necessário
    // Por enquanto, apenas verificar se os headers estão presentes
    
    return true;
    
  } catch (error) {
    logger.security('Webhook validation failed', 'medium', {
      error: error.message,
      headers: req.headers
    });
    return false;
  }
};

// Função para criar link de pagamento rápido
const createQuickPaymentLink = async (amount, description, externalReference, payerEmail) => {
  try {
    const paymentData = {
      id: externalReference,
      title: description,
      description: description,
      amount: parseFloat(amount),
      external_reference: externalReference,
      payer: {
        name: 'Cliente',
        surname: 'Spartan',
        email: payerEmail
      }
    };
    
    const preference = await createPaymentPreference(paymentData);
    
    return {
      payment_url: preference.init_point,
      preference_id: preference.id,
      external_reference: externalReference,
      expires_at: preference.expires_at
    };
    
  } catch (error) {
    logger.error('Erro ao criar link de pagamento rápido:', {
      error: error.message,
      amount,
      externalReference
    });
    throw error;
  }
};

// Função para obter status de um pagamento por external_reference
const getPaymentByExternalReference = async (externalReference) => {
  try {
    if (!client) {
      initializeMercadoPago();
    }
    
    const payment = new Payment(client);
    
    // Buscar pagamentos por external_reference
    const searchResult = await payment.search({
      options: {
        external_reference: externalReference,
        sort: 'date_created',
        criteria: 'desc',
        range: 'date_created',
        begin_date: 'NOW-30DAYS',
        end_date: 'NOW'
      }
    });
    
    if (searchResult.results && searchResult.results.length > 0) {
      // Retornar o pagamento mais recente
      const latestPayment = searchResult.results[0];
      
      logger.payment('Pagamento encontrado por external_reference', {
        externalReference,
        paymentId: latestPayment.id,
        status: latestPayment.status
      });
      
      return latestPayment;
    }
    
    return null;
    
  } catch (error) {
    logger.error('Erro ao buscar pagamento por external_reference:', {
      error: error.message,
      externalReference
    });
    throw error;
  }
};

// Função para cancelar uma preferência
const cancelPreference = async (preferenceId) => {
  try {
    if (!client) {
      initializeMercadoPago();
    }
    
    const preference = new Preference(client);
    
    // Atualizar preferência para expirada
    const result = await preference.update({
      id: preferenceId,
      body: {
        expires: true,
        expiration_date_to: new Date().toISOString()
      }
    });
    
    logger.payment('Preferência cancelada', {
      preferenceId,
      status: 'cancelled'
    });
    
    return result;
    
  } catch (error) {
    logger.error('Erro ao cancelar preferência:', {
      error: error.message,
      preferenceId
    });
    throw error;
  }
};

// Função para obter estatísticas de pagamentos
const getPaymentStats = async (dateFrom, dateTo) => {
  try {
    if (!client) {
      initializeMercadoPago();
    }
    
    const payment = new Payment(client);
    
    const searchResult = await payment.search({
      options: {
        sort: 'date_created',
        criteria: 'desc',
        range: 'date_created',
        begin_date: dateFrom,
        end_date: dateTo
      }
    });
    
    const payments = searchResult.results || [];
    
    const stats = {
      total: payments.length,
      approved: payments.filter(p => p.status === 'approved').length,
      pending: payments.filter(p => p.status === 'pending').length,
      rejected: payments.filter(p => p.status === 'rejected').length,
      cancelled: payments.filter(p => p.status === 'cancelled').length,
      totalAmount: payments
        .filter(p => p.status === 'approved')
        .reduce((sum, p) => sum + (p.transaction_amount || 0), 0),
      averageAmount: 0
    };
    
    if (stats.approved > 0) {
      stats.averageAmount = stats.totalAmount / stats.approved;
    }
    
    return stats;
    
  } catch (error) {
    logger.error('Erro ao obter estatísticas de pagamentos:', {
      error: error.message,
      dateFrom,
      dateTo
    });
    throw error;
  }
};

// Função para testar conectividade com Mercado Pago
const testConnection = async () => {
  try {
    if (!client) {
      initializeMercadoPago();
    }
    
    // Fazer uma busca simples para testar a conexão
    const payment = new Payment(client);
    await payment.search({
      options: {
        limit: 1
      }
    });
    
    return {
      status: 'connected',
      timestamp: new Date().toISOString(),
      environment: process.env.MERCADOPAGO_ACCESS_TOKEN?.includes('TEST') ? 'sandbox' : 'production'
    };
    
  } catch (error) {
    return {
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
};

module.exports = {
  initializeMercadoPago,
  createPaymentPreference,
  getPayment,
  processWebhook,
  validateWebhook,
  createQuickPaymentLink,
  getPaymentByExternalReference,
  cancelPreference,
  getPaymentStats,
  testConnection
};