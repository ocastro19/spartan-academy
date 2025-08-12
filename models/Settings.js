const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  // Configurações de Check-in
  checkinWindow: {
    type: Number,
    default: 60, // minutos
    min: 5,
    max: 180,
    description: 'Janela mínima de check-in em minutos'
  },
  
  checkinStartBefore: {
    type: Number,
    default: 15, // minutos antes da aula
    min: 0,
    max: 60,
    description: 'Quantos minutos antes da aula o check-in fica disponível'
  },
  
  checkinEndAfter: {
    type: Number,
    default: 30, // minutos após início da aula
    min: 0,
    max: 120,
    description: 'Quantos minutos após o início da aula o check-in ainda é permitido'
  },
  
  // Configurações de Capacidade
  defaultClassCapacity: {
    type: Number,
    default: 30,
    min: 1,
    max: 100,
    description: 'Capacidade padrão por turma'
  },
  
  allowOverbooking: {
    type: Boolean,
    default: false,
    description: 'Permitir agendamentos acima da capacidade'
  },
  
  overbookingPercentage: {
    type: Number,
    default: 10, // 10% acima da capacidade
    min: 0,
    max: 50,
    description: 'Percentual de overbooking permitido'
  },
  
  // Configurações de Graduação
  blackBeltExemption: {
    type: Boolean,
    default: true,
    description: 'Faixas-pretas não precisam agendar aulas'
  },
  
  exemptBelts: {
    type: [String],
    default: ['preta', 'coral', 'vermelha'],
    description: 'Faixas isentas de agendamento'
  },
  
  // Configurações de Multa e Juros
  lateFeeType: {
    type: String,
    enum: ['fixed', 'percentage'],
    default: 'percentage',
    description: 'Tipo de multa: valor fixo ou percentual'
  },
  
  lateFeeValue: {
    type: Number,
    default: 10, // 10% ou R$ 10,00
    min: 0,
    description: 'Valor da multa (% ou R$)'
  },
  
  dailyInterestRate: {
    type: Number,
    default: 0.033, // 0.033% ao dia (1% ao mês)
    min: 0,
    max: 1,
    description: 'Taxa de juros diária (%)'
  },
  
  gracePeriodDays: {
    type: Number,
    default: 3, // 3 dias de carência
    min: 0,
    max: 30,
    description: 'Dias de carência antes de aplicar multa'
  },
  
  // Configurações de Bloqueio
  blockAfterDays: {
    type: Number,
    default: 7, // bloquear após 7 dias de atraso
    min: 1,
    max: 90,
    description: 'Dias de atraso para bloqueio automático'
  },
  
  blockActions: {
    preventBooking: {
      type: Boolean,
      default: true,
      description: 'Impedir novos agendamentos'
    },
    preventCheckin: {
      type: Boolean,
      default: true,
      description: 'Impedir check-in em aulas'
    },
    preventStore: {
      type: Boolean,
      default: false,
      description: 'Impedir compras na loja'
    }
  },
  
  // Configurações de Mensalidade
  defaultMonthlyFee: {
    type: Number,
    default: 150.00,
    min: 0,
    description: 'Valor padrão da mensalidade'
  },
  
  dueDayOfMonth: {
    type: Number,
    default: 10, // vencimento dia 10
    min: 1,
    max: 31,
    description: 'Dia do mês para vencimento das mensalidades'
  },
  
  generateOnDay: {
    type: Number,
    default: 1, // gerar no dia 1º
    min: 1,
    max: 31,
    description: 'Dia do mês para gerar mensalidades'
  },
  
  // Configurações de Notificação
  reminderDays: {
    type: [Number],
    default: [3, 1, 0, -1, -3, -7], // dias antes/depois do vencimento
    description: 'Dias para envio de lembretes (negativos = após vencimento)'
  },
  
  notificationChannels: {
    email: {
      type: Boolean,
      default: true,
      description: 'Enviar notificações por email'
    },
    sms: {
      type: Boolean,
      default: false,
      description: 'Enviar notificações por SMS'
    },
    whatsapp: {
      type: Boolean,
      default: false,
      description: 'Enviar notificações por WhatsApp'
    },
    push: {
      type: Boolean,
      default: true,
      description: 'Enviar notificações push'
    }
  },
  
  // Configurações da Academia
  academyInfo: {
    name: {
      type: String,
      default: 'Spartan Jiu-Jitsu',
      description: 'Nome da academia'
    },
    phone: {
      type: String,
      default: '+55 11 99999-9999',
      description: 'Telefone da academia'
    },
    email: {
      type: String,
      default: 'contato@spartanjiujitsu.com',
      description: 'Email da academia'
    },
    address: {
      type: String,
      default: 'Rua das Artes Marciais, 123',
      description: 'Endereço da academia'
    },
    website: {
      type: String,
      default: 'https://spartanjiujitsu.com',
      description: 'Website da academia'
    },
    logo: {
      type: String,
      description: 'URL do logo da academia'
    }
  },
  
  // Configurações de Relatório
  reportSettings: {
    defaultPeriod: {
      type: String,
      enum: ['week', 'month', 'quarter', 'year'],
      default: 'month',
      description: 'Período padrão para relatórios'
    },
    includeInactive: {
      type: Boolean,
      default: false,
      description: 'Incluir alunos inativos nos relatórios'
    },
    exportFormat: {
      type: String,
      enum: ['csv', 'excel', 'pdf'],
      default: 'csv',
      description: 'Formato padrão de exportação'
    }
  },
  
  // Configurações de Segurança
  securitySettings: {
    sessionTimeout: {
      type: Number,
      default: 24, // horas
      min: 1,
      max: 168,
      description: 'Timeout da sessão em horas'
    },
    maxLoginAttempts: {
      type: Number,
      default: 5,
      min: 3,
      max: 10,
      description: 'Máximo de tentativas de login'
    },
    lockoutDuration: {
      type: Number,
      default: 30, // minutos
      min: 5,
      max: 1440,
      description: 'Duração do bloqueio após tentativas excessivas (minutos)'
    },
    requirePasswordChange: {
      type: Number,
      default: 90, // dias
      min: 0,
      max: 365,
      description: 'Forçar troca de senha a cada X dias (0 = desabilitado)'
    }
  },
  
  // Configurações de Integração
  integrations: {
    mercadoPago: {
      enabled: {
        type: Boolean,
        default: true,
        description: 'Habilitar integração com Mercado Pago'
      },
      sandbox: {
        type: Boolean,
        default: true,
        description: 'Usar ambiente de teste'
      }
    },
    email: {
      enabled: {
        type: Boolean,
        default: true,
        description: 'Habilitar envio de emails'
      },
      provider: {
        type: String,
        enum: ['smtp', 'sendgrid', 'mailgun'],
        default: 'smtp',
        description: 'Provedor de email'
      }
    },
    sms: {
      enabled: {
        type: Boolean,
        default: false,
        description: 'Habilitar envio de SMS'
      },
      provider: {
        type: String,
        enum: ['twilio', 'nexmo'],
        default: 'twilio',
        description: 'Provedor de SMS'
      }
    }
  },
  
  // Metadados
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    description: 'Usuário que fez a última atualização'
  },
  
  version: {
    type: Number,
    default: 1,
    description: 'Versão das configurações'
  }
}, {
  timestamps: true,
  collection: 'settings'
});

// Garantir que só existe um documento de configurações
settingsSchema.index({}, { unique: true });

// Middleware para atualizar lastUpdated
settingsSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

// Método estático para obter configurações
settingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  
  if (!settings) {
    // Criar configurações padrão se não existir
    settings = new this({});
    await settings.save();
  }
  
  return settings;
};

// Método estático para atualizar configurações
settingsSchema.statics.updateSettings = async function(updates, userId) {
  let settings = await this.findOne();
  
  if (!settings) {
    settings = new this(updates);
  } else {
    Object.assign(settings, updates);
    settings.version += 1;
  }
  
  settings.updatedBy = userId;
  await settings.save();
  
  return settings;
};

// Método para obter configuração específica
settingsSchema.methods.getSetting = function(path, defaultValue = null) {
  const keys = path.split('.');
  let value = this;
  
  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      return defaultValue;
    }
  }
  
  return value !== undefined ? value : defaultValue;
};

module.exports = mongoose.model('Settings', settingsSchema);