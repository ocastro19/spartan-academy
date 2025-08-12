const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth, adminOnly } = require('../middleware/auth');
const Settings = require('../models/Settings');
const logger = require('../config/logger');

const router = express.Router();

/**
 * Obter todas as configurações
 */
router.get('/', auth, async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    
    // Remover campos sensíveis para usuários não-admin
    if (req.user.role !== 'admin') {
      const publicSettings = {
        checkinWindow: settings.checkinWindow,
        checkinStartBefore: settings.checkinStartBefore,
        checkinEndAfter: settings.checkinEndAfter,
        defaultClassCapacity: settings.defaultClassCapacity,
        blackBeltExemption: settings.blackBeltExemption,
        exemptBelts: settings.exemptBelts,
        academyInfo: settings.academyInfo
      };
      
      return res.json({
        success: true,
        data: publicSettings
      });
    }
    
    res.json({
      success: true,
      data: settings
    });
    
  } catch (error) {
    logger.error('Erro ao obter configurações:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Obter configuração específica
 */
router.get('/:section', auth, async (req, res) => {
  try {
    const { section } = req.params;
    const settings = await Settings.getSettings();
    
    const sectionData = settings[section];
    
    if (sectionData === undefined) {
      return res.status(404).json({
        success: false,
        message: 'Seção de configuração não encontrada'
      });
    }
    
    // Verificar permissões para seções sensíveis
    const restrictedSections = ['securitySettings', 'integrations', 'lateFeeType', 'lateFeeValue'];
    if (restrictedSections.includes(section) && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado a esta seção'
      });
    }
    
    res.json({
      success: true,
      data: { [section]: sectionData }
    });
    
  } catch (error) {
    logger.error('Erro ao obter seção de configuração:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Atualizar configurações (apenas admin)
 */
router.put('/', [
  auth,
  adminOnly,
  // Validações básicas
  body('checkinWindow').optional().isInt({ min: 5, max: 180 })
    .withMessage('Janela de check-in deve ser entre 5 e 180 minutos'),
  body('checkinStartBefore').optional().isInt({ min: 0, max: 60 })
    .withMessage('Check-in antes deve ser entre 0 e 60 minutos'),
  body('checkinEndAfter').optional().isInt({ min: 0, max: 120 })
    .withMessage('Check-in depois deve ser entre 0 e 120 minutos'),
  body('defaultClassCapacity').optional().isInt({ min: 1, max: 100 })
    .withMessage('Capacidade padrão deve ser entre 1 e 100'),
  body('lateFeeValue').optional().isFloat({ min: 0 })
    .withMessage('Valor da multa deve ser maior ou igual a 0'),
  body('dailyInterestRate').optional().isFloat({ min: 0, max: 1 })
    .withMessage('Taxa de juros deve ser entre 0 e 1'),
  body('blockAfterDays').optional().isInt({ min: 1, max: 90 })
    .withMessage('Dias para bloqueio deve ser entre 1 e 90'),
  body('defaultMonthlyFee').optional().isFloat({ min: 0 })
    .withMessage('Mensalidade padrão deve ser maior ou igual a 0'),
  body('dueDayOfMonth').optional().isInt({ min: 1, max: 31 })
    .withMessage('Dia de vencimento deve ser entre 1 e 31'),
  body('generateOnDay').optional().isInt({ min: 1, max: 31 })
    .withMessage('Dia de geração deve ser entre 1 e 31')
], async (req, res) => {
  try {
    // Verificar erros de validação
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Dados inválidos',
        errors: errors.array()
      });
    }
    
    const updates = req.body;
    const settings = await Settings.updateSettings(updates, req.user.id);
    
    logger.info(`Configurações atualizadas por ${req.user.name}`, {
      userId: req.user.id,
      updates: Object.keys(updates)
    });
    
    res.json({
      success: true,
      message: 'Configurações atualizadas com sucesso',
      data: settings
    });
    
  } catch (error) {
    logger.error('Erro ao atualizar configurações:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Atualizar seção específica de configurações
 */
router.put('/:section', [
  auth,
  adminOnly
], async (req, res) => {
  try {
    const { section } = req.params;
    const updates = { [section]: req.body };
    
    const settings = await Settings.updateSettings(updates, req.user.id);
    
    logger.info(`Seção ${section} atualizada por ${req.user.name}`, {
      userId: req.user.id,
      section
    });
    
    res.json({
      success: true,
      message: `Seção ${section} atualizada com sucesso`,
      data: { [section]: settings[section] }
    });
    
  } catch (error) {
    logger.error(`Erro ao atualizar seção ${req.params.section}:`, error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Resetar configurações para padrão
 */
router.post('/reset', [
  auth,
  adminOnly
], async (req, res) => {
  try {
    const { section } = req.body;
    
    if (section) {
      // Resetar seção específica
      const defaultSettings = new Settings();
      const updates = { [section]: defaultSettings[section] };
      
      const settings = await Settings.updateSettings(updates, req.user.id);
      
      logger.info(`Seção ${section} resetada por ${req.user.name}`, {
        userId: req.user.id,
        section
      });
      
      res.json({
        success: true,
        message: `Seção ${section} resetada para padrão`,
        data: { [section]: settings[section] }
      });
    } else {
      // Resetar todas as configurações
      await Settings.deleteMany({});
      const settings = await Settings.getSettings();
      settings.updatedBy = req.user.id;
      await settings.save();
      
      logger.info(`Todas as configurações resetadas por ${req.user.name}`, {
        userId: req.user.id
      });
      
      res.json({
        success: true,
        message: 'Todas as configurações foram resetadas para padrão',
        data: settings
      });
    }
    
  } catch (error) {
    logger.error('Erro ao resetar configurações:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Obter histórico de alterações (se implementado)
 */
router.get('/history', [
  auth,
  adminOnly
], async (req, res) => {
  try {
    // TODO: Implementar histórico de alterações
    // Por enquanto, retornar apenas a última atualização
    const settings = await Settings.findOne()
      .populate('updatedBy', 'name email')
      .select('lastUpdated updatedBy version');
    
    res.json({
      success: true,
      data: {
        lastUpdate: settings ? {
          date: settings.lastUpdated,
          user: settings.updatedBy,
          version: settings.version
        } : null
      }
    });
    
  } catch (error) {
    logger.error('Erro ao obter histórico de configurações:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Validar configurações
 */
router.post('/validate', [
  auth,
  adminOnly
], async (req, res) => {
  try {
    const settings = req.body;
    const errors = [];
    
    // Validações customizadas
    if (settings.checkinStartBefore && settings.checkinEndAfter) {
      const totalWindow = settings.checkinStartBefore + settings.checkinEndAfter;
      if (totalWindow < 15) {
        errors.push('Janela total de check-in deve ser de pelo menos 15 minutos');
      }
    }
    
    if (settings.dueDayOfMonth && settings.generateOnDay) {
      if (settings.generateOnDay >= settings.dueDayOfMonth) {
        errors.push('Dia de geração deve ser anterior ao dia de vencimento');
      }
    }
    
    if (settings.lateFeeValue && settings.lateFeeType === 'percentage' && settings.lateFeeValue > 100) {
      errors.push('Multa percentual não pode ser maior que 100%');
    }
    
    if (settings.overbookingPercentage && settings.overbookingPercentage > 50) {
      errors.push('Percentual de overbooking não pode ser maior que 50%');
    }
    
    res.json({
      success: true,
      valid: errors.length === 0,
      errors: errors
    });
    
  } catch (error) {
    logger.error('Erro ao validar configurações:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;