const express = require('express');
const { MercadoPagoConfig, Payment: MPPayment } = require('mercadopago');
const Payment = require('../models/Payment');
const Student = require('../models/Student');
const logger = require('../config/logger');
const moment = require('moment-timezone');

const router = express.Router();

// Configurar Mercado Pago
const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});
const mpPayment = new MPPayment(client);

/**
 * Webhook do Mercado Pago
 * Processa notificações de pagamento
 */
router.post('/mercadopago', async (req, res) => {
  try {
    const { type, data } = req.body;
    
    logger.info('Webhook Mercado Pago recebido:', { type, data });
    
    // Verificar se é uma notificação de pagamento
    if (type === 'payment') {
      const paymentId = data.id;
      
      // Buscar informações do pagamento no Mercado Pago
      const mpPaymentData = await mpPayment.get({ id: paymentId });
      
      if (!mpPaymentData) {
        logger.error('Pagamento não encontrado no Mercado Pago:', paymentId);
        return res.status(404).json({ error: 'Payment not found' });
      }
      
      const paymentData = mpPaymentData;
      logger.info('Dados do pagamento MP:', paymentData);
      
      // Extrair ID da mensalidade do external_reference
      const externalReference = paymentData.external_reference;
      if (!externalReference) {
        logger.error('External reference não encontrado no pagamento MP');
        return res.status(400).json({ error: 'External reference missing' });
      }
      
      // Buscar mensalidade no banco
      const payment = await Payment.findById(externalReference)
        .populate({
          path: 'student',
          populate: {
            path: 'user',
            select: 'name email'
          }
        });
      
      if (!payment) {
        logger.error('Mensalidade não encontrada:', externalReference);
        return res.status(404).json({ error: 'Payment not found in database' });
      }
      
      // Processar status do pagamento
      switch (paymentData.status) {
        case 'approved':
          await processApprovedPayment(payment, paymentData);
          break;
          
        case 'rejected':
          await processRejectedPayment(payment, paymentData);
          break;
          
        case 'cancelled':
          await processCancelledPayment(payment, paymentData);
          break;
          
        case 'refunded':
          await processRefundedPayment(payment, paymentData);
          break;
          
        case 'pending':
          await processPendingPayment(payment, paymentData);
          break;
          
        default:
          logger.warn('Status de pagamento não reconhecido:', paymentData.status);
      }
    }
    
    res.status(200).json({ success: true });
    
  } catch (error) {
    logger.error('Erro no webhook Mercado Pago:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Processar pagamento aprovado
 */
const processApprovedPayment = async (payment, mpPaymentData) => {
  try {
    logger.info(`Processando pagamento aprovado: ${payment._id}`);
    
    // Atualizar status da mensalidade
    const updatedPayment = await Payment.findByIdAndUpdate(
      payment._id,
      {
        status: 'paid',
        paidAt: new Date(mpPaymentData.date_approved),
        paidAmount: mpPaymentData.transaction_amount,
        paymentMethod: mpPaymentData.payment_method_id,
        mpPaymentId: mpPaymentData.id,
        mpStatus: mpPaymentData.status,
        mpStatusDetail: mpPaymentData.status_detail,
        transactionData: {
          installments: mpPaymentData.installments,
          payerEmail: mpPaymentData.payer?.email,
          payerName: mpPaymentData.payer?.first_name + ' ' + mpPaymentData.payer?.last_name,
          cardLastFourDigits: mpPaymentData.card?.last_four_digits,
          authorizationCode: mpPaymentData.authorization_code
        }
      },
      { new: true }
    );
    
    // Desbloquear aluno se estava bloqueado por atraso
    if (payment.student.isBlocked && payment.student.blockReason?.includes('atraso')) {
      await Student.findByIdAndUpdate(
        payment.student._id,
        {
          isBlocked: false,
          blockReason: null,
          blockedAt: null,
          unblockedAt: new Date()
        }
      );
      
      logger.info(`Aluno ${payment.student._id} desbloqueado após pagamento`);
    }
    
    logger.info(`Pagamento ${payment._id} confirmado com sucesso`);
    
    // TODO: Enviar confirmação por email/SMS
    // await sendPaymentConfirmation(updatedPayment);
    
  } catch (error) {
    logger.error('Erro ao processar pagamento aprovado:', error);
  }
};

/**
 * Processar pagamento rejeitado
 */
const processRejectedPayment = async (payment, mpPaymentData) => {
  try {
    logger.info(`Processando pagamento rejeitado: ${payment._id}`);
    
    await Payment.findByIdAndUpdate(
      payment._id,
      {
        mpPaymentId: mpPaymentData.id,
        mpStatus: mpPaymentData.status,
        mpStatusDetail: mpPaymentData.status_detail,
        rejectedAt: new Date(),
        rejectionReason: mpPaymentData.status_detail
      }
    );
    
    logger.info(`Pagamento ${payment._id} rejeitado: ${mpPaymentData.status_detail}`);
    
    // TODO: Notificar aluno sobre rejeição
    // await sendPaymentRejectionNotification(payment, mpPaymentData.status_detail);
    
  } catch (error) {
    logger.error('Erro ao processar pagamento rejeitado:', error);
  }
};

/**
 * Processar pagamento cancelado
 */
const processCancelledPayment = async (payment, mpPaymentData) => {
  try {
    logger.info(`Processando pagamento cancelado: ${payment._id}`);
    
    await Payment.findByIdAndUpdate(
      payment._id,
      {
        mpPaymentId: mpPaymentData.id,
        mpStatus: mpPaymentData.status,
        mpStatusDetail: mpPaymentData.status_detail,
        cancelledAt: new Date()
      }
    );
    
    logger.info(`Pagamento ${payment._id} cancelado`);
    
  } catch (error) {
    logger.error('Erro ao processar pagamento cancelado:', error);
  }
};

/**
 * Processar estorno
 */
const processRefundedPayment = async (payment, mpPaymentData) => {
  try {
    logger.info(`Processando estorno: ${payment._id}`);
    
    await Payment.findByIdAndUpdate(
      payment._id,
      {
        status: 'refunded',
        mpPaymentId: mpPaymentData.id,
        mpStatus: mpPaymentData.status,
        mpStatusDetail: mpPaymentData.status_detail,
        refundedAt: new Date(),
        refundedAmount: mpPaymentData.refunded_amount || mpPaymentData.transaction_amount
      }
    );
    
    logger.info(`Pagamento ${payment._id} estornado`);
    
    // TODO: Notificar sobre estorno
    // await sendRefundNotification(payment);
    
  } catch (error) {
    logger.error('Erro ao processar estorno:', error);
  }
};

/**
 * Processar pagamento pendente
 */
const processPendingPayment = async (payment, mpPaymentData) => {
  try {
    logger.info(`Processando pagamento pendente: ${payment._id}`);
    
    await Payment.findByIdAndUpdate(
      payment._id,
      {
        mpPaymentId: mpPaymentData.id,
        mpStatus: mpPaymentData.status,
        mpStatusDetail: mpPaymentData.status_detail,
        pendingReason: mpPaymentData.status_detail
      }
    );
    
    logger.info(`Pagamento ${payment._id} pendente: ${mpPaymentData.status_detail}`);
    
  } catch (error) {
    logger.error('Erro ao processar pagamento pendente:', error);
  }
};

/**
 * Webhook genérico para outros eventos
 */
router.post('/generic', async (req, res) => {
  try {
    logger.info('Webhook genérico recebido:', req.body);
    
    // Processar outros tipos de webhook conforme necessário
    
    res.status(200).json({ success: true });
    
  } catch (error) {
    logger.error('Erro no webhook genérico:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Endpoint para testar webhook (desenvolvimento)
 */
router.post('/test', async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Not available in production' });
    }
    
    logger.info('Webhook de teste:', req.body);
    
    res.status(200).json({ 
      success: true, 
      message: 'Test webhook received',
      data: req.body 
    });
    
  } catch (error) {
    logger.error('Erro no webhook de teste:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Middleware para validar webhook do Mercado Pago
 * TODO: Implementar validação de assinatura se necessário
 */
const validateMPWebhook = (req, res, next) => {
  // Aqui você pode implementar validação de assinatura
  // const signature = req.headers['x-signature'];
  // const requestId = req.headers['x-request-id'];
  
  next();
};

module.exports = router;