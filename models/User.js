const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  nome: {
    type: String,
    required: [true, 'Nome é obrigatório'],
    trim: true,
    maxlength: [100, 'Nome deve ter no máximo 100 caracteres']
  },
  email: {
    type: String,
    required: [true, 'Email é obrigatório'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email inválido']
  },
  telefone: {
    type: String,
    required: [true, 'Telefone é obrigatório'],
    trim: true,
    match: [/^\+?[1-9]\d{1,14}$/, 'Telefone inválido']
  },
  perfil: {
    type: String,
    enum: ['admin', 'instrutor', 'aluno'],
    required: [true, 'Perfil é obrigatório'],
    default: 'aluno'
  },
  senha: {
    type: String,
    required: [true, 'Senha é obrigatória'],
    minlength: [6, 'Senha deve ter no mínimo 6 caracteres'],
    select: false
  },
  ativo: {
    type: Boolean,
    default: true
  },
  avatar: {
    type: String,
    default: null
  },
  ultimoLogin: {
    type: Date,
    default: null
  },
  configuracoes: {
    notificacoes: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      whatsapp: { type: Boolean, default: false }
    },
    tema: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'light'
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Índices
userSchema.index({ email: 1 });
userSchema.index({ perfil: 1 });
userSchema.index({ ativo: 1 });

// Middleware para hash da senha antes de salvar
userSchema.pre('save', async function(next) {
  if (!this.isModified('senha')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.senha = await bcrypt.hash(this.senha, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Método para comparar senhas
userSchema.methods.compararSenha = async function(senhaCandidata) {
  return await bcrypt.compare(senhaCandidata, this.senha);
};

// Método para atualizar último login
userSchema.methods.atualizarUltimoLogin = function() {
  this.ultimoLogin = new Date();
  return this.save({ validateBeforeSave: false });
};

// Virtual para nome completo formatado
userSchema.virtual('nomeFormatado').get(function() {
  return this.nome.split(' ').map(palavra => 
    palavra.charAt(0).toUpperCase() + palavra.slice(1).toLowerCase()
  ).join(' ');
});

// Remover senha do output JSON
userSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.senha;
  return userObject;
};

module.exports = mongoose.model('User', userSchema);