const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const User = require('../models/User');
const { connectDB, disconnectDB } = require('../config/database');

// Configurar ambiente de teste
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key';
process.env.MONGODB_URI = 'mongodb://localhost:27017/spartan-test';

describe('Auth Routes', () => {
  let server;
  
  beforeAll(async () => {
    // Conectar ao banco de teste
    await connectDB();
    
    // Limpar dados de teste
    await User.deleteMany({});
  });
  
  afterAll(async () => {
    // Limpar e desconectar
    await User.deleteMany({});
    await disconnectDB();
  });
  
  beforeEach(async () => {
    // Limpar usuários antes de cada teste
    await User.deleteMany({});
  });
  
  describe('POST /api/auth/register', () => {
    it('deve registrar um novo usuário com dados válidos', async () => {
      const userData = {
        name: 'Teste User',
        email: 'teste@example.com',
        password: 'senha123',
        phone: '11999999999',
        cpf: '12345678901',
        role: 'student'
      };
      
      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(userData.email);
      expect(response.body.data.user.name).toBe(userData.name);
      expect(response.body.data.token).toBeDefined();
      
      // Verificar se o usuário foi criado no banco
      const user = await User.findOne({ email: userData.email });
      expect(user).toBeTruthy();
      expect(user.password).not.toBe(userData.password); // Senha deve estar hasheada
    });
    
    it('deve retornar erro para email duplicado', async () => {
      const userData = {
        name: 'Teste User',
        email: 'teste@example.com',
        password: 'senha123',
        phone: '11999999999',
        cpf: '12345678901',
        role: 'student'
      };
      
      // Criar primeiro usuário
      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);
      
      // Tentar criar segundo usuário com mesmo email
      const response = await request(app)
        .post('/api/auth/register')
        .send({ ...userData, cpf: '98765432109' })
        .expect(400);
      
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('email');
    });
    
    it('deve retornar erro para CPF duplicado', async () => {
      const userData = {
        name: 'Teste User',
        email: 'teste@example.com',
        password: 'senha123',
        phone: '11999999999',
        cpf: '12345678901',
        role: 'student'
      };
      
      // Criar primeiro usuário
      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);
      
      // Tentar criar segundo usuário com mesmo CPF
      const response = await request(app)
        .post('/api/auth/register')
        .send({ ...userData, email: 'outro@example.com' })
        .expect(400);
      
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('cpf');
    });
    
    it('deve retornar erro para dados inválidos', async () => {
      const invalidData = {
        name: '', // Nome vazio
        email: 'email-invalido', // Email inválido
        password: '123', // Senha muito curta
        phone: '123', // Telefone inválido
        cpf: '123', // CPF inválido
        role: 'invalid-role' // Role inválido
      };
      
      const response = await request(app)
        .post('/api/auth/register')
        .send(invalidData)
        .expect(400);
      
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
      expect(Array.isArray(response.body.errors)).toBe(true);
    });
  });
  
  describe('POST /api/auth/login', () => {
    let testUser;
    
    beforeEach(async () => {
      // Criar usuário de teste
      const userData = {
        name: 'Teste User',
        email: 'teste@example.com',
        password: 'senha123',
        phone: '11999999999',
        cpf: '12345678901',
        role: 'student'
      };
      
      const response = await request(app)
        .post('/api/auth/register')
        .send(userData);
      
      testUser = response.body.data.user;
    });
    
    it('deve fazer login com credenciais válidas', async () => {
      const loginData = {
        email: 'teste@example.com',
        password: 'senha123'
      };
      
      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(loginData.email);
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
    });
    
    it('deve retornar erro para email inexistente', async () => {
      const loginData = {
        email: 'inexistente@example.com',
        password: 'senha123'
      };
      
      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401);
      
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Credenciais inválidas');
    });
    
    it('deve retornar erro para senha incorreta', async () => {
      const loginData = {
        email: 'teste@example.com',
        password: 'senha-errada'
      };
      
      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401);
      
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Credenciais inválidas');
    });
    
    it('deve retornar erro para usuário inativo', async () => {
      // Desativar usuário
      await User.findOneAndUpdate(
        { email: 'teste@example.com' },
        { isActive: false }
      );
      
      const loginData = {
        email: 'teste@example.com',
        password: 'senha123'
      };
      
      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401);
      
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('inativo');
    });
  });
  
  describe('GET /api/auth/me', () => {
    let testUser;
    let authToken;
    
    beforeEach(async () => {
      // Criar e fazer login do usuário de teste
      const userData = {
        name: 'Teste User',
        email: 'teste@example.com',
        password: 'senha123',
        phone: '11999999999',
        cpf: '12345678901',
        role: 'student'
      };
      
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(userData);
      
      testUser = registerResponse.body.data.user;
      authToken = registerResponse.body.data.token;
    });
    
    it('deve retornar dados do usuário autenticado', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(testUser.id);
      expect(response.body.data.email).toBe(testUser.email);
      expect(response.body.data.name).toBe(testUser.name);
      expect(response.body.data.password).toBeUndefined(); // Senha não deve ser retornada
    });
    
    it('deve retornar erro sem token de autenticação', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401);
      
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Token');
    });
    
    it('deve retornar erro com token inválido', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer token-invalido')
        .expect(401);
      
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Token inválido');
    });
  });
  
  describe('POST /api/auth/refresh', () => {
    let testUser;
    let refreshToken;
    
    beforeEach(async () => {
      // Criar e fazer login do usuário de teste
      const userData = {
        name: 'Teste User',
        email: 'teste@example.com',
        password: 'senha123',
        phone: '11999999999',
        cpf: '12345678901',
        role: 'student'
      };
      
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(userData);
      
      testUser = registerResponse.body.data.user;
      refreshToken = registerResponse.body.data.refreshToken;
    });
    
    it('deve renovar token com refresh token válido', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
      expect(response.body.data.user.id).toBe(testUser.id);
    });
    
    it('deve retornar erro com refresh token inválido', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'token-invalido' })
        .expect(401);
      
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Refresh token inválido');
    });
    
    it('deve retornar erro sem refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({})
        .expect(400);
      
      expect(response.body.success).toBe(false);
    });
  });
  
  describe('POST /api/auth/logout', () => {
    let testUser;
    let authToken;
    let refreshToken;
    
    beforeEach(async () => {
      // Criar e fazer login do usuário de teste
      const userData = {
        name: 'Teste User',
        email: 'teste@example.com',
        password: 'senha123',
        phone: '11999999999',
        cpf: '12345678901',
        role: 'student'
      };
      
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(userData);
      
      testUser = registerResponse.body.data.user;
      authToken = registerResponse.body.data.token;
      refreshToken = registerResponse.body.data.refreshToken;
    });
    
    it('deve fazer logout com sucesso', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ refreshToken })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Logout realizado');
    });
    
    it('deve retornar erro sem token de autenticação', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .send({ refreshToken })
        .expect(401);
      
      expect(response.body.success).toBe(false);
    });
  });
});