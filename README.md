# 🥋 Spartan Jiu-Jitsu - Sistema de Gerenciamento

Sistema completo de gerenciamento para academias de artes marciais, desenvolvido com Node.js, Express e MongoDB.

## 📋 Funcionalidades

### 👥 Gestão de Usuários e Alunos
- Sistema de autenticação com JWT
- Perfis de usuário (Admin, Instrutor, Aluno)
- Cadastro completo de alunos com dados pessoais
- Upload de fotos de perfil
- Controle de status (ativo/inativo/bloqueado)

### 🏫 Gestão de Turmas e Aulas
- Criação e gerenciamento de turmas
- Agendamento de aulas
- Controle de capacidade e horários
- Sistema de elegibilidade por graduação

### 📅 Sistema de Agendamentos
- Agendamento de aulas pelos alunos
- Controle de vagas disponíveis
- Sistema de check-in com janela de tempo
- Cancelamento com antecedência mínima
- Listagem de aulas disponíveis

### 📊 Controle de Presença
- Registro de presença individual e em lote
- Relatórios de frequência
- Estatísticas de assiduidade
- Histórico completo de presenças

### 🎓 Sistema de Graduações
- Controle de faixas e graus
- Processo de graduação com validação
- Geração de certificados
- Relatórios de elegibilidade
- Histórico de graduações

### 💰 Gestão Financeira
- Controle de mensalidades
- Geração automática de cobranças
- Relatórios financeiros
- Controle de inadimplência
- Integração com Mercado Pago

### 🛒 Loja Virtual
- Cadastro de produtos
- Controle de estoque
- Sistema de pedidos
- Upload de imagens de produtos
- Relatórios de vendas

### 📈 Dashboard e Relatórios
- Estatísticas gerais da academia
- Gráficos de desempenho
- Relatórios personalizados
- Exportação para CSV

## 🚀 Tecnologias Utilizadas

- **Backend**: Node.js, Express.js
- **Banco de Dados**: MongoDB com Mongoose
- **Autenticação**: JWT (JSON Web Tokens)
- **Upload de Arquivos**: Multer + Sharp
- **Validação**: Express Validator
- **Segurança**: Helmet, CORS, Rate Limiting
- **Logs**: Winston
- **Documentos**: PDF-lib
- **Email**: Nodemailer
- **Pagamentos**: Mercado Pago

## 📦 Instalação

### Pré-requisitos
- Node.js (versão 16 ou superior)
- MongoDB (local ou Atlas)
- npm ou yarn

### Passos para instalação

1. **Clone o repositório**
```bash
git clone https://github.com/spartan-team/spartan-jiujitsu-api.git
cd spartan-jiujitsu-api
```

2. **Instale as dependências**
```bash
npm install
```

3. **Configure as variáveis de ambiente**
```bash
cp .env.example .env
```
Edite o arquivo `.env` com suas configurações.

4. **Inicie o MongoDB**
Certifique-se de que o MongoDB está rodando localmente ou configure a string de conexão para o MongoDB Atlas.

5. **Execute o servidor**
```bash
# Desenvolvimento
npm run dev

# Produção
npm start
```

## 🔧 Configuração

### Variáveis de Ambiente Principais

```env
# Servidor
PORT=5000
NODE_ENV=development

# Banco de Dados
MONGODB_URI=mongodb://localhost:27017/spartan-jiujitsu

# JWT
JWT_SECRET=seu_jwt_secret_super_seguro_aqui
JWT_EXPIRE=7d

# Mercado Pago (opcional)
MP_ACCESS_TOKEN=seu_access_token
MP_PUBLIC_KEY=sua_public_key
```

## 📚 API Endpoints

### Autenticação
- `POST /api/auth/register` - Registro de usuário
- `POST /api/auth/login` - Login
- `POST /api/auth/refresh` - Renovar token
- `POST /api/auth/logout` - Logout

### Usuários
- `GET /api/users` - Listar usuários
- `GET /api/users/:id` - Obter usuário
- `PUT /api/users/:id` - Atualizar usuário
- `DELETE /api/users/:id` - Deletar usuário

### Alunos
- `GET /api/students` - Listar alunos
- `POST /api/students` - Criar aluno
- `GET /api/students/:id` - Obter aluno
- `PUT /api/students/:id` - Atualizar aluno
- `DELETE /api/students/:id` - Deletar aluno

### Turmas
- `GET /api/classes` - Listar turmas
- `POST /api/classes` - Criar turma
- `GET /api/classes/:id` - Obter turma
- `PUT /api/classes/:id` - Atualizar turma
- `DELETE /api/classes/:id` - Deletar turma

### Aulas
- `GET /api/lessons` - Listar aulas
- `POST /api/lessons` - Criar aula
- `GET /api/lessons/:id` - Obter aula
- `PUT /api/lessons/:id` - Atualizar aula
- `DELETE /api/lessons/:id` - Deletar aula

### Agendamentos
- `GET /api/bookings` - Listar agendamentos
- `POST /api/bookings` - Criar agendamento
- `GET /api/bookings/my` - Meus agendamentos
- `POST /api/bookings/:id/checkin` - Fazer check-in
- `DELETE /api/bookings/:id` - Cancelar agendamento

### Presenças
- `GET /api/attendance` - Listar presenças
- `POST /api/attendance` - Registrar presença
- `GET /api/attendance/my` - Minhas presenças
- `GET /api/attendance/stats` - Estatísticas

### Graduações
- `GET /api/graduations` - Listar graduações
- `POST /api/graduations` - Criar graduação
- `GET /api/graduations/my` - Minhas graduações
- `POST /api/graduations/:id/validate` - Validar graduação

### Produtos
- `GET /api/products` - Listar produtos
- `POST /api/products` - Criar produto
- `GET /api/products/:id` - Obter produto
- `PUT /api/products/:id` - Atualizar produto
- `DELETE /api/products/:id` - Deletar produto

### Pedidos
- `GET /api/orders` - Listar pedidos
- `POST /api/orders` - Criar pedido
- `GET /api/orders/my` - Meus pedidos
- `PUT /api/orders/:id/status` - Atualizar status

### Pagamentos
- `GET /api/payments` - Listar mensalidades
- `POST /api/payments` - Criar mensalidade
- `GET /api/payments/my` - Minhas mensalidades
- `POST /api/payments/:id/pay` - Registrar pagamento

## 🔐 Autenticação e Autorização

O sistema utiliza JWT para autenticação e possui três níveis de acesso:

- **Admin**: Acesso total ao sistema
- **Instrutor**: Pode gerenciar alunos, aulas e presenças
- **Aluno**: Acesso limitado aos próprios dados

## 📁 Estrutura do Projeto

```
spartan-jiujitsu/
├── config/
│   ├── database.js
│   └── logger.js
├── controllers/
│   ├── authController.js
│   ├── userController.js
│   ├── studentController.js
│   └── ...
├── middleware/
│   ├── auth.js
│   ├── validation.js
│   └── upload.js
├── models/
│   ├── User.js
│   ├── Student.js
│   ├── Class.js
│   └── ...
├── routes/
│   ├── auth.js
│   ├── users.js
│   ├── students.js
│   └── ...
├── utils/
│   ├── helpers.js
│   ├── constants.js
│   └── validators.js
├── uploads/
├── logs/
├── app.js
├── server.js
└── package.json
```

## 🧪 Testes

```bash
# Executar todos os testes
npm test

# Executar testes em modo watch
npm run test:watch

# Gerar relatório de cobertura
npm run test:coverage
```

## 📝 Scripts Disponíveis

- `npm start` - Inicia o servidor em produção
- `npm run dev` - Inicia o servidor em desenvolvimento
- `npm test` - Executa os testes
- `npm run lint` - Executa o linter
- `npm run seed` - Popula o banco com dados de exemplo
- `npm run backup` - Cria backup do banco de dados

## 🚀 Deploy

### Heroku

1. Crie um app no Heroku
2. Configure as variáveis de ambiente
3. Conecte com MongoDB Atlas
4. Faça o deploy

### Docker

```bash
# Build da imagem
docker build -t spartan-jiujitsu .

# Executar container
docker run -p 5000:5000 spartan-jiujitsu
```

## 🤝 Contribuição

1. Faça um fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## 📞 Suporte

Para suporte, envie um email para contato@spartanjiujitsu.com ou abra uma issue no GitHub.

## 🎯 Roadmap

- [ ] App mobile React Native
- [ ] Sistema de notificações push
- [ ] Integração com outros gateways de pagamento
- [ ] Sistema de gamificação
- [ ] API para integração com outros sistemas
- [ ] Dashboard avançado com BI

---

**Desenvolvido com ❤️ pela equipe Spartan**