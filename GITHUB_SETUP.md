# 🚀 Guia Completo: Como Vincular o Projeto Spartan Academy ao GitHub

## 📋 Pré-requisitos

### 1. Instalar Git
- Baixe o Git em: https://git-scm.com/download/windows
- Execute o instalador e siga as instruções
- Reinicie o terminal após a instalação

### 2. Configurar Git (primeira vez)
```bash
git config --global user.name "Seu Nome"
git config --global user.email "seu.email@exemplo.com"
```

## 🔧 Passos para Vincular ao GitHub

### Passo 1: Inicializar Git no Projeto
```bash
cd c:\Users\eliel\Desktop\spartan
git init
```

### Passo 2: Adicionar Arquivos ao Git
```bash
git add .
git commit -m "Initial commit: Spartan Academy - Sistema completo com interface premium"
```

### Passo 3: Criar Repositório no GitHub
1. Acesse [github.com](https://github.com)
2. Faça login na sua conta
3. Clique em **"New repository"** (botão verde)
4. Configure o repositório:
   - **Repository name:** `spartan-academy`
   - **Description:** `Sistema de gestão para academia de artes marciais com interface premium`
   - **Visibility:** Public ou Private (sua escolha)
   - **NÃO** marque "Add a README file" (já temos um)
   - **NÃO** marque "Add .gitignore" (já criamos um)
5. Clique em **"Create repository"**

### Passo 4: Conectar ao Repositório Remoto
```bash
git remote add origin https://github.com/SEU_USUARIO/spartan-academy.git
git branch -M main
git push -u origin main
```

## 🎯 Para Usar no Lovable

### Opção A: Frontend Separado (Recomendado)
1. **Manter o backend atual** (Node.js + Express)
2. **Criar novo projeto React** no Lovable
3. **Conectar via API** usando fetch/axios

### Estrutura Recomendada:
```
spartan-academy/
├── backend/              # Projeto atual
│   ├── app.js
│   ├── models/
│   ├── routes/
│   ├── public/           # Interface atual (referência)
│   └── package.json
└── frontend/             # Novo projeto React (Lovable)
    ├── src/
    ├── components/
    ├── pages/
    └── package.json
```

### Configuração para Lovable:

#### 1. Configurar CORS no Backend
No arquivo `app.js`, certifique-se que o CORS está configurado:
```javascript
const cors = require('cors');
app.use(cors({
  origin: ['http://localhost:3000', 'https://seu-app.lovable.app'],
  credentials: true
}));
```

#### 2. Endpoints Principais para o Frontend:
- **Dashboard:** `GET /api/dashboard/stats`
- **Alunos:** `GET /api/students`, `POST /api/students`
- **Aulas:** `GET /api/classes`, `POST /api/classes`
- **Pagamentos:** `GET /api/payments`
- **Produtos:** `GET /api/products`
- **Autenticação:** `POST /api/auth/login`, `POST /api/auth/register`

#### 3. Variáveis de Ambiente para Frontend:
```env
REACT_APP_API_URL=http://localhost:5000/api
# ou para produção:
REACT_APP_API_URL=https://sua-api.herokuapp.com/api
```

## 📝 Comandos Úteis do Git

### Comandos Básicos:
```bash
# Ver status dos arquivos
git status

# Adicionar arquivos modificados
git add .

# Fazer commit
git commit -m "Descrição das mudanças"

# Enviar para GitHub
git push

# Baixar mudanças do GitHub
git pull
```

### Trabalhando com Branches:
```bash
# Criar nova branch
git checkout -b feature/nova-funcionalidade

# Trocar de branch
git checkout main

# Listar branches
git branch

# Fazer merge
git checkout main
git merge feature/nova-funcionalidade
```

## 🚀 Deploy e Produção

### Opções de Deploy:
1. **Heroku** (gratuito com limitações)
2. **Railway** (fácil deploy)
3. **Render** (alternativa ao Heroku)
4. **DigitalOcean** (mais controle)
5. **AWS/Azure** (enterprise)

### Variáveis de Ambiente para Produção:
```env
NODE_ENV=production
PORT=5000
MONGODB_URI=sua_uri_mongodb_atlas
JWT_SECRET=seu_jwt_secret_seguro
MERCADOPAGO_ACCESS_TOKEN=seu_token_mp
```

## 🔗 Links Importantes

- **Repositório GitHub:** `https://github.com/SEU_USUARIO/spartan-academy`
- **API Local:** `http://localhost:5000/api`
- **Interface Local:** `http://localhost:5000`
- **Health Check:** `http://localhost:5000/api/health`

## 💡 Dicas Importantes

1. **Nunca commite** arquivos `.env` (já está no .gitignore)
2. **Sempre teste** localmente antes de fazer push
3. **Use branches** para novas funcionalidades
4. **Documente** mudanças importantes no README
5. **Mantenha** o .gitignore atualizado

## 🆘 Solução de Problemas

### Git não reconhecido:
- Instale o Git: https://git-scm.com/download/windows
- Reinicie o terminal
- Verifique: `git --version`

### Erro de autenticação GitHub:
- Use Personal Access Token em vez de senha
- Configure SSH keys para mais segurança

### Problemas com Node.js:
- Instale Node.js: https://nodejs.org
- Use `npm install` para instalar dependências
- Verifique versão: `node --version`

---

**✅ Projeto pronto para GitHub e integração com Lovable!**

Siga este guia passo a passo e você terá seu projeto versionado e pronto para desenvolvimento colaborativo! 🎯