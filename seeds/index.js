const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { connectDB, disconnectDB } = require('../config/database');
const logger = require('../config/logger');

// Importar modelos
const User = require('../models/User');
const Student = require('../models/Student');
const Class = require('../models/Class');
const Product = require('../models/Product');
const Settings = require('../models/Settings');

// Dados de seed
const seedData = {
  users: [
    {
      name: 'Administrador',
      email: 'admin@spartan.com',
      password: 'admin123',
      role: 'admin',
      phone: '11999999999',
      cpf: '12345678901',
      isActive: true
    },
    {
      name: 'Professor João',
      email: 'professor@spartan.com',
      password: 'prof123',
      role: 'instructor',
      phone: '11888888888',
      cpf: '98765432109',
      isActive: true
    },
    {
      name: 'Aluno Teste',
      email: 'aluno@spartan.com',
      password: 'aluno123',
      role: 'student',
      phone: '11777777777',
      cpf: '11122233344',
      isActive: true
    },
    {
      name: 'Maria Silva',
      email: 'maria@email.com',
      password: 'maria123',
      role: 'student',
      phone: '11666666666',
      cpf: '55566677788',
      isActive: true
    },
    {
      name: 'Pedro Santos',
      email: 'pedro@email.com',
      password: 'pedro123',
      role: 'student',
      phone: '11555555555',
      cpf: '99988877766',
      isActive: true
    }
  ],
  
  products: [
    {
      name: 'Kimono Branco Adulto',
      description: 'Kimono tradicional branco para adultos, 100% algodão',
      price: 89.90,
      category: 'kimono',
      stock: 25,
      images: [],
      active: true,
      featured: true
    },
    {
      name: 'Kimono Azul Infantil',
      description: 'Kimono azul para crianças, material resistente',
      price: 69.90,
      category: 'kimono',
      stock: 15,
      images: [],
      active: true,
      featured: false
    },
    {
      name: 'Faixa Branca',
      description: 'Faixa branca oficial para iniciantes',
      price: 19.90,
      category: 'faixa',
      stock: 50,
      images: [],
      active: true,
      featured: false
    },
    {
      name: 'Faixa Azul',
      description: 'Faixa azul para graduação intermediária',
      price: 24.90,
      category: 'faixa',
      stock: 30,
      images: [],
      active: true,
      featured: false
    },
    {
      name: 'Faixa Roxa',
      description: 'Faixa roxa para graduação avançada',
      price: 29.90,
      category: 'faixa',
      stock: 20,
      images: [],
      active: true,
      featured: false
    },
    {
      name: 'Faixa Marrom',
      description: 'Faixa marrom para graduação superior',
      price: 34.90,
      category: 'faixa',
      stock: 15,
      images: [],
      active: true,
      featured: false
    },
    {
      name: 'Faixa Preta',
      description: 'Faixa preta oficial, bordada',
      price: 49.90,
      category: 'faixa',
      stock: 10,
      images: [],
      active: true,
      featured: true
    },
    {
      name: 'Protetor Bucal',
      description: 'Protetor bucal moldável para treinos',
      price: 15.90,
      category: 'equipamento',
      stock: 40,
      images: [],
      active: true,
      featured: false
    },
    {
      name: 'Luvas de MMA',
      description: 'Luvas profissionais para treino de MMA',
      price: 79.90,
      category: 'equipamento',
      stock: 12,
      images: [],
      active: true,
      featured: true
    },
    {
      name: 'Camiseta Spartan',
      description: 'Camiseta oficial da academia Spartan',
      price: 39.90,
      category: 'vestuario',
      stock: 35,
      images: [],
      active: true,
      featured: false
    }
  ]
};

// Função para limpar dados existentes
const clearDatabase = async () => {
  try {
    logger.info('Limpando dados existentes...');
    
    await User.deleteMany({});
    await Student.deleteMany({});
    await Class.deleteMany({});
    await Product.deleteMany({});
    await Settings.deleteMany({});
    
    logger.info('Dados limpos com sucesso');
  } catch (error) {
    logger.error('Erro ao limpar dados:', { error: error.message });
    throw error;
  }
};

// Função para criar usuários
const createUsers = async () => {
  try {
    logger.info('Criando usuários...');
    
    const users = [];
    
    for (const userData of seedData.users) {
      const hashedPassword = await bcrypt.hash(userData.password, 12);
      
      const user = new User({
        ...userData,
        password: hashedPassword
      });
      
      await user.save();
      users.push(user);
      
      logger.info(`Usuário criado: ${user.name} (${user.email})`);
    }
    
    return users;
  } catch (error) {
    logger.error('Erro ao criar usuários:', { error: error.message });
    throw error;
  }
};

// Função para criar estudantes
const createStudents = async (users) => {
  try {
    logger.info('Criando estudantes...');
    
    const students = [];
    const studentUsers = users.filter(user => user.role === 'student');
    
    const belts = ['white', 'blue', 'purple', 'brown'];
    const emergencyContacts = [
      { name: 'João Silva', phone: '11999888777', relationship: 'pai' },
      { name: 'Ana Santos', phone: '11888777666', relationship: 'mãe' },
      { name: 'Carlos Oliveira', phone: '11777666555', relationship: 'irmão' }
    ];
    
    for (let i = 0; i < studentUsers.length; i++) {
      const user = studentUsers[i];
      const belt = belts[i % belts.length];
      
      const student = new Student({
        user: user._id,
        belt,
        beltDegree: Math.floor(Math.random() * 4) + 1, // 1-4 graus
        monthlyFee: 150.00,
        status: 'active',
        enrollmentDate: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000), // Último ano
        emergencyContact: emergencyContacts[i % emergencyContacts.length],
        medicalInfo: {
          hasRestrictions: Math.random() > 0.8,
          restrictions: Math.random() > 0.8 ? 'Problema no joelho direito' : '',
          medications: Math.random() > 0.9 ? 'Medicamento para pressão' : '',
          allergies: Math.random() > 0.9 ? 'Alergia a amendoim' : ''
        },
        address: {
          street: `Rua ${['das Flores', 'dos Pássaros', 'da Paz', 'do Sol'][i % 4]}`,
          number: Math.floor(Math.random() * 1000) + 1,
          neighborhood: ['Centro', 'Vila Nova', 'Jardim América', 'Bela Vista'][i % 4],
          city: 'São Paulo',
          state: 'SP',
          zipCode: `0${Math.floor(Math.random() * 9) + 1}${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 900) + 100}`
        }
      });
      
      await student.save();
      students.push(student);
      
      logger.info(`Estudante criado: ${user.name} - Faixa ${belt}`);
    }
    
    return students;
  } catch (error) {
    logger.error('Erro ao criar estudantes:', { error: error.message });
    throw error;
  }
};

// Função para criar aulas
const createClasses = async (users) => {
  try {
    logger.info('Criando aulas...');
    
    const classes = [];
    const instructor = users.find(user => user.role === 'instructor');
    
    if (!instructor) {
      throw new Error('Nenhum instrutor encontrado');
    }
    
    const classTypes = [
      { name: 'Jiu-Jitsu Iniciante', duration: 60, capacity: 15 },
      { name: 'Jiu-Jitsu Intermediário', duration: 90, capacity: 12 },
      { name: 'Jiu-Jitsu Avançado', duration: 90, capacity: 10 },
      { name: 'MMA', duration: 60, capacity: 8 },
      { name: 'Muay Thai', duration: 60, capacity: 15 }
    ];
    
    const times = ['06:00', '07:30', '18:00', '19:30', '21:00'];
    const days = [1, 2, 3, 4, 5]; // Segunda a sexta
    
    // Criar aulas para as próximas 2 semanas
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    
    for (let day = 0; day < 14; day++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + day);
      
      const dayOfWeek = currentDate.getDay();
      
      // Pular fins de semana
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;
      
      // Criar 2-3 aulas por dia
      const numClasses = Math.floor(Math.random() * 2) + 2;
      
      for (let i = 0; i < numClasses; i++) {
        const classType = classTypes[Math.floor(Math.random() * classTypes.length)];
        const time = times[i % times.length];
        
        const [hours, minutes] = time.split(':').map(Number);
        const startTime = new Date(currentDate);
        startTime.setHours(hours, minutes, 0, 0);
        
        const endTime = new Date(startTime);
        endTime.setMinutes(endTime.getMinutes() + classType.duration);
        
        const classObj = new Class({
          name: classType.name,
          instructor: instructor._id,
          date: currentDate,
          startTime,
          endTime,
          capacity: classType.capacity,
          description: `Aula de ${classType.name} com foco em técnicas e condicionamento físico`,
          status: 'scheduled',
          level: classType.name.includes('Iniciante') ? 'beginner' : 
                 classType.name.includes('Intermediário') ? 'intermediate' : 'advanced'
        });
        
        await classObj.save();
        classes.push(classObj);
      }
    }
    
    logger.info(`${classes.length} aulas criadas`);
    return classes;
  } catch (error) {
    logger.error('Erro ao criar aulas:', { error: error.message });
    throw error;
  }
};

// Função para criar produtos
const createProducts = async () => {
  try {
    logger.info('Criando produtos...');
    
    const products = [];
    
    for (const productData of seedData.products) {
      const product = new Product(productData);
      await product.save();
      products.push(product);
      
      logger.info(`Produto criado: ${product.name}`);
    }
    
    return products;
  } catch (error) {
    logger.error('Erro ao criar produtos:', { error: error.message });
    throw error;
  }
};

// Função para criar configurações padrão
const createSettings = async () => {
  try {
    logger.info('Criando configurações padrão...');
    
    const settings = await Settings.getSettings();
    
    // Atualizar algumas configurações específicas
    settings.academyInfo = {
      name: 'Spartan Academy',
      phone: '(11) 99999-9999',
      email: 'contato@spartan.com',
      address: {
        street: 'Rua dos Guerreiros, 123',
        neighborhood: 'Centro',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01234-567'
      },
      cnpj: '12.345.678/0001-90',
      website: 'https://spartan.com'
    };
    
    settings.defaultMonthlyFee = 150.00;
    settings.lateFeeValue = 10.00;
    settings.dailyInterestRate = 0.033; // 1% ao mês = 0.033% ao dia
    
    await settings.save();
    
    logger.info('Configurações criadas com sucesso');
    return settings;
  } catch (error) {
    logger.error('Erro ao criar configurações:', { error: error.message });
    throw error;
  }
};

// Função principal de seed
const runSeeds = async (options = {}) => {
  try {
    logger.info('Iniciando processo de seed...');
    
    // Conectar ao banco
    await connectDB();
    
    // Limpar dados se solicitado
    if (options.clear !== false) {
      await clearDatabase();
    }
    
    // Criar dados
    const users = await createUsers();
    const students = await createStudents(users);
    const classes = await createClasses(users);
    const products = await createProducts();
    const settings = await createSettings();
    
    logger.info('Seed concluído com sucesso!', {
      users: users.length,
      students: students.length,
      classes: classes.length,
      products: products.length
    });
    
    // Mostrar informações de login
    console.log('\n=== INFORMAÇÕES DE LOGIN ===');
    console.log('Admin: admin@spartan.com / admin123');
    console.log('Professor: professor@spartan.com / prof123');
    console.log('Aluno: aluno@spartan.com / aluno123');
    console.log('=============================\n');
    
  } catch (error) {
    logger.error('Erro durante o seed:', { error: error.message });
    throw error;
  } finally {
    await disconnectDB();
  }
};

// Executar se chamado diretamente
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    clear: !args.includes('--no-clear')
  };
  
  runSeeds(options)
    .then(() => {
      console.log('✅ Seed executado com sucesso!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erro no seed:', error.message);
      process.exit(1);
    });
}

module.exports = {
  runSeeds,
  clearDatabase,
  createUsers,
  createStudents,
  createClasses,
  createProducts,
  createSettings
};