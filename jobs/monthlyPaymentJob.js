const cron = require('node-cron');
const moment = require('moment-timezone');
const Student = require('../models/Student');
const Payment = require('../models/Payment');
const logger = require('../config/logger');

// Configurar timezone
moment.tz.setDefault(process.env.TIMEZONE || 'America/Sao_Paulo');

/**
 * Job para gerar mensalidades automaticamente
 * Executa todo dia 1º às 00:00
 */
const generateMonthlyPayments = async () => {
  try {
    logger.info('Iniciando geração de mensalidades mensais...');
    
    const currentDate = moment();
    const competencia = currentDate.format('YYYY-MM');
    const dueDate = currentDate.clone().add(10, 'days').toDate(); // Vencimento em 10 dias
    
    // Buscar todos os alunos ativos
    const activeStudents = await Student.find({
      status: 'active',
      isBlocked: false
    }).populate('user', 'name email');
    
    let generatedCount = 0;
    let skippedCount = 0;
    
    for (const student of activeStudents) {
      try {
        // Verificar se já existe mensalidade para esta competência
        const existingPayment = await Payment.findOne({
          student: student._id,
          competencia: competencia
        });
        
        if (existingPayment) {
          skippedCount++;
          continue;
        }
        
        // Criar nova mensalidade
        const payment = new Payment({
          student: student._id,
          competencia: competencia,
          amount: student.monthlyFee || 150.00, // Valor padrão se não definido
          dueDate: dueDate,
          status: 'pending',
          description: `Mensalidade ${currentDate.format('MMMM/YYYY')}`,
          createdBy: null, // Gerado automaticamente
          generatedAutomatically: true
        });
        
        await payment.save();
        generatedCount++;
        
        logger.info(`Mensalidade gerada para ${student.user.name} - ${competencia}`);
        
      } catch (error) {
        logger.error(`Erro ao gerar mensalidade para aluno ${student._id}:`, error);
      }
    }
    
    logger.info(`Geração de mensalidades concluída: ${generatedCount} geradas, ${skippedCount} já existiam`);
    
  } catch (error) {
    logger.error('Erro na geração automática de mensalidades:', error);
  }
};

/**
 * Job para calcular multas e juros em mensalidades vencidas
 * Executa diariamente às 01:00
 */
const calculateLateFees = async () => {
  try {
    logger.info('Iniciando cálculo de multas e juros...');
    
    const today = moment().startOf('day');
    
    // Buscar mensalidades vencidas e não pagas
    const overduePayments = await Payment.find({
      status: 'pending',
      dueDate: { $lt: today.toDate() }
    }).populate('student', 'user');
    
    let updatedCount = 0;
    
    for (const payment of overduePayments) {
      try {
        const daysOverdue = today.diff(moment(payment.dueDate), 'days');
        
        if (daysOverdue <= 0) continue;
        
        // Configurações padrão de multa e juros
        const lateFeeType = process.env.DEFAULT_LATE_FEE_TYPE || 'percentage';
        const lateFeeValue = parseFloat(process.env.DEFAULT_LATE_FEE_VALUE || '10');
        const dailyInterest = parseFloat(process.env.DEFAULT_DAILY_INTEREST || '0.033');
        
        let lateFee = 0;
        let interest = 0;
        
        // Calcular multa (apenas no primeiro dia de atraso)
        if (daysOverdue >= 1 && !payment.lateFeeApplied) {
          if (lateFeeType === 'percentage') {
            lateFee = payment.amount * (lateFeeValue / 100);
          } else {
            lateFee = lateFeeValue;
          }
        }
        
        // Calcular juros diários
        interest = payment.amount * (dailyInterest / 100) * daysOverdue;
        
        // Atualizar pagamento
        const updatedPayment = await Payment.findByIdAndUpdate(
          payment._id,
          {
            $set: {
              lateFee: lateFee,
              interest: interest,
              totalAmount: payment.amount + lateFee + interest,
              lateFeeApplied: lateFee > 0,
              daysOverdue: daysOverdue,
              lastCalculated: new Date()
            }
          },
          { new: true }
        );
        
        updatedCount++;
        
        // Verificar se deve bloquear o aluno
        const blockDays = parseInt(process.env.DEFAULT_BLOCK_DAYS || '7');
        if (daysOverdue >= blockDays) {
          await Student.findByIdAndUpdate(
            payment.student._id,
            { 
              isBlocked: true,
              blockReason: `Mensalidade em atraso há ${daysOverdue} dias`,
              blockedAt: new Date()
            }
          );
          
          logger.warn(`Aluno ${payment.student._id} bloqueado por atraso de ${daysOverdue} dias`);
        }
        
        logger.info(`Multa/juros calculados para pagamento ${payment._id}: R$ ${(lateFee + interest).toFixed(2)}`);
        
      } catch (error) {
        logger.error(`Erro ao calcular multa/juros para pagamento ${payment._id}:`, error);
      }
    }
    
    logger.info(`Cálculo de multas/juros concluído: ${updatedCount} pagamentos atualizados`);
    
  } catch (error) {
    logger.error('Erro no cálculo de multas e juros:', error);
  }
};

/**
 * Job para enviar lembretes de vencimento
 * Executa diariamente às 09:00
 */
const sendPaymentReminders = async () => {
  try {
    logger.info('Iniciando envio de lembretes de pagamento...');
    
    const today = moment().startOf('day');
    const reminderDays = [3, 1, 0, -1, -3, -7]; // Dias antes/depois do vencimento
    
    for (const days of reminderDays) {
      const targetDate = today.clone().add(days, 'days');
      
      const payments = await Payment.find({
        status: 'pending',
        dueDate: {
          $gte: targetDate.toDate(),
          $lt: targetDate.clone().add(1, 'day').toDate()
        }
      }).populate({
        path: 'student',
        populate: {
          path: 'user',
          select: 'name email phone'
        }
      });
      
      for (const payment of payments) {
        try {
          // Aqui você pode implementar o envio de email/SMS/WhatsApp
          // Por enquanto, apenas log
          const daysText = days > 0 ? `em ${days} dias` : 
                          days === 0 ? 'hoje' : 
                          `há ${Math.abs(days)} dias`;
          
          logger.info(`Lembrete: Mensalidade de ${payment.student.user.name} vence ${daysText}`);
          
          // TODO: Implementar envio real de notificações
          // await sendEmailReminder(payment);
          // await sendSMSReminder(payment);
          // await sendWhatsAppReminder(payment);
          
        } catch (error) {
          logger.error(`Erro ao enviar lembrete para pagamento ${payment._id}:`, error);
        }
      }
    }
    
    logger.info('Envio de lembretes concluído');
    
  } catch (error) {
    logger.error('Erro no envio de lembretes:', error);
  }
};

/**
 * Inicializar jobs
 */
const initializeJobs = () => {
  // Gerar mensalidades todo dia 1º às 00:00
  cron.schedule('0 0 1 * *', generateMonthlyPayments, {
    timezone: process.env.TIMEZONE || 'America/Sao_Paulo'
  });
  
  // Calcular multas/juros diariamente às 01:00
  cron.schedule('0 1 * * *', calculateLateFees, {
    timezone: process.env.TIMEZONE || 'America/Sao_Paulo'
  });
  
  // Enviar lembretes diariamente às 09:00
  cron.schedule('0 9 * * *', sendPaymentReminders, {
    timezone: process.env.TIMEZONE || 'America/Sao_Paulo'
  });
  
  logger.info('Jobs de pagamento inicializados');
};

// Funções para execução manual (útil para testes)
const runGeneratePayments = async () => {
  logger.info('Executando geração manual de mensalidades...');
  await generateMonthlyPayments();
};

const runCalculateLateFees = async () => {
  logger.info('Executando cálculo manual de multas/juros...');
  await calculateLateFees();
};

const runSendReminders = async () => {
  logger.info('Executando envio manual de lembretes...');
  await sendPaymentReminders();
};

module.exports = {
  initializeJobs,
  runGeneratePayments,
  runCalculateLateFees,
  runSendReminders
};