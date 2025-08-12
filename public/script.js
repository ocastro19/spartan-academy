// Global Variables
let currentUser = null;
let currentSection = 'home';
let studentsData = [];
let classesData = [];
let paymentsData = [];
let productsData = [];
const API_BASE = 'http://localhost:5000/api';

// Initialize App
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    // Hide loading screen after 3 seconds
    setTimeout(() => {
        const loadingScreen = document.getElementById('loading-screen');
        loadingScreen.style.opacity = '0';
        setTimeout(() => {
            loadingScreen.style.display = 'none';
        }, 500);
    }, 3000);

    // Initialize navigation
    initializeNavigation();
    
    // Load initial data
    loadDashboardData();
    
    // Initialize event listeners
    initializeEventListeners();
    
    // Check for existing session
    checkExistingSession();
}

// Navigation Functions
function initializeNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    const navToggle = document.getElementById('nav-toggle');
    const navMenu = document.getElementById('nav-menu');
    
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = link.getAttribute('href').substring(1);
            showSection(section);
            
            // Update active nav link
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            // Close mobile menu
            navMenu.classList.remove('active');
        });
    });
    
    // Mobile menu toggle
    navToggle.addEventListener('click', () => {
        navMenu.classList.toggle('active');
    });
}

function showSection(sectionName) {
    // Hide all sections
    const sections = document.querySelectorAll('.section');
    sections.forEach(section => {
        section.classList.remove('active');
    });
    
    // Show target section
    const targetSection = document.getElementById(sectionName);
    if (targetSection) {
        targetSection.classList.add('active');
        currentSection = sectionName;
        
        // Load section-specific data
        loadSectionData(sectionName);
    }
}

function loadSectionData(section) {
    switch(section) {
        case 'dashboard':
            loadDashboardData();
            break;
        case 'students':
            loadStudents();
            break;
        case 'classes':
            loadClasses();
            break;
        case 'payments':
            loadPayments();
            break;
        case 'shop':
            loadProducts();
            break;
    }
}

// API Functions
async function apiCall(endpoint, method = 'GET', data = null) {
    try {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
            }
        };
        
        if (currentUser && currentUser.token) {
            options.headers.Authorization = `Bearer ${currentUser.token}`;
        }
        
        if (data) {
            options.body = JSON.stringify(data);
        }
        
        const response = await fetch(`${API_BASE}${endpoint}`, options);
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.message || 'API Error');
        }
        
        return result;
    } catch (error) {
        console.error('API Call Error:', error);
        showToast(error.message, 'error');
        throw error;
    }
}

// Dashboard Functions
async function loadDashboardData() {
    try {
        // Load basic stats
        const [studentsRes, classesRes, paymentsRes, graduationsRes] = await Promise.all([
            apiCall('/students').catch(() => ({ data: [] })),
            apiCall('/classes').catch(() => ({ data: [] })),
            apiCall('/payments').catch(() => ({ data: [] })),
            apiCall('/graduations').catch(() => ({ data: [] }))
        ]);
        
        // Update hero stats
        updateElement('total-students', studentsRes.data?.length || 0);
        updateElement('total-classes', classesRes.data?.length || 0);
        updateElement('total-graduations', graduationsRes.data?.length || 0);
        
        // Update dashboard stats
        updateElement('dash-students', studentsRes.data?.length || 0);
        updateElement('dash-classes', classesRes.data?.length || 0);
        updateElement('dash-graduations', graduationsRes.data?.length || 0);
        
        // Calculate revenue
        const totalRevenue = paymentsRes.data?.reduce((sum, payment) => {
            return payment.status === 'paid' ? sum + payment.amount : sum;
        }, 0) || 0;
        updateElement('dash-revenue', `R$ ${totalRevenue.toLocaleString('pt-BR')}`);
        
        // Load recent classes
        loadRecentClasses(classesRes.data || []);
        
        // Load pending payments
        loadPendingPayments(paymentsRes.data || []);
        
    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

function loadRecentClasses(classes) {
    const container = document.getElementById('recent-classes');
    if (!container) return;
    
    if (classes.length === 0) {
        container.innerHTML = '<div class="no-data">Nenhuma aula encontrada</div>';
        return;
    }
    
    const recentClasses = classes.slice(0, 5);
    container.innerHTML = recentClasses.map(classItem => `
        <div class="recent-item">
            <div class="recent-info">
                <div class="recent-title">${classItem.name || 'Aula'}</div>
                <div class="recent-date">${formatDate(classItem.date)}</div>
            </div>
            <div class="recent-status ${classItem.status || 'scheduled'}">
                ${getStatusText(classItem.status || 'scheduled')}
            </div>
        </div>
    `).join('');
}

function loadPendingPayments(payments) {
    const container = document.getElementById('pending-payments');
    if (!container) return;
    
    const pendingPayments = payments.filter(p => p.status === 'pending').slice(0, 5);
    
    if (pendingPayments.length === 0) {
        container.innerHTML = '<div class="no-data">Nenhum pagamento pendente</div>';
        return;
    }
    
    container.innerHTML = pendingPayments.map(payment => `
        <div class="pending-item">
            <div class="pending-info">
                <div class="pending-student">${payment.studentName || 'Aluno'}</div>
                <div class="pending-amount">R$ ${payment.amount?.toLocaleString('pt-BR') || '0'}</div>
            </div>
            <div class="pending-date">${formatDate(payment.dueDate)}</div>
        </div>
    `).join('');
}

// Students Functions
async function loadStudents() {
    try {
        const response = await apiCall('/students');
        studentsData = response.data || [];
        renderStudents(studentsData);
    } catch (error) {
        const container = document.getElementById('students-grid');
        container.innerHTML = '<div class="error-message">Erro ao carregar alunos. Verifique se o servidor está rodando.</div>';
    }
}

function renderStudents(students) {
    const container = document.getElementById('students-grid');
    if (!container) return;
    
    if (students.length === 0) {
        container.innerHTML = '<div class="no-data">Nenhum aluno cadastrado</div>';
        return;
    }
    
    container.innerHTML = students.map(student => `
        <div class="student-card">
            <div class="student-avatar">
                <i class="fas fa-user"></i>
            </div>
            <div class="student-info">
                <h3>${student.name || 'Nome não informado'}</h3>
                <p class="student-email">${student.email || 'Email não informado'}</p>
                <p class="student-phone">${student.phone || 'Telefone não informado'}</p>
                <div class="student-meta">
                    <span class="student-modality">${student.modality || 'Modalidade não informada'}</span>
                    <span class="student-graduation">${getGraduationText(student.graduation)}</span>
                </div>
                <div class="student-status ${student.status || 'active'}">
                    ${getStatusText(student.status || 'active')}
                </div>
            </div>
            <div class="student-actions">
                <button class="btn-action" onclick="editStudent('${student._id}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-action danger" onclick="deleteStudent('${student._id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

// Classes Functions
async function loadClasses() {
    try {
        const response = await apiCall('/classes');
        classesData = response.data || [];
        renderCalendar();
        renderClassesList(classesData);
    } catch (error) {
        const container = document.getElementById('classes-list');
        container.innerHTML = '<div class="error-message">Erro ao carregar aulas. Verifique se o servidor está rodando.</div>';
    }
}

function renderCalendar() {
    const calendarGrid = document.getElementById('calendar-grid');
    const calendarMonth = document.getElementById('calendar-month');
    
    if (!calendarGrid || !calendarMonth) return;
    
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    
    // Update month display
    const monthNames = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    calendarMonth.textContent = `${monthNames[month]} ${year}`;
    
    // Generate calendar days
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    let calendarHTML = '';
    
    // Add day headers
    const dayHeaders = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    dayHeaders.forEach(day => {
        calendarHTML += `<div class="calendar-header-day">${day}</div>`;
    });
    
    // Add empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
        calendarHTML += '<div class="calendar-day empty"></div>';
    }
    
    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
        const hasClass = classesData.some(classItem => {
            const classDate = new Date(classItem.date);
            return classDate.getDate() === day && 
                   classDate.getMonth() === month && 
                   classDate.getFullYear() === year;
        });
        
        calendarHTML += `
            <div class="calendar-day ${hasClass ? 'has-class' : ''}" onclick="selectCalendarDay(${day})">
                ${day}
            </div>
        `;
    }
    
    calendarGrid.innerHTML = calendarHTML;
}

function renderClassesList(classes) {
    const container = document.getElementById('classes-list');
    if (!container) return;
    
    if (classes.length === 0) {
        container.innerHTML = '<div class="no-data">Nenhuma aula agendada</div>';
        return;
    }
    
    container.innerHTML = `
        <div class="classes-header">
            <h3>Próximas Aulas</h3>
        </div>
        <div class="classes-items">
            ${classes.map(classItem => `
                <div class="class-item">
                    <div class="class-info">
                        <h4>${classItem.name || 'Aula'}</h4>
                        <p class="class-instructor">${classItem.instructor || 'Instrutor não informado'}</p>
                        <p class="class-time">${formatDateTime(classItem.date)}</p>
                    </div>
                    <div class="class-meta">
                        <span class="class-capacity">${classItem.enrolled || 0}/${classItem.capacity || 0} alunos</span>
                        <span class="class-status ${classItem.status || 'scheduled'}">
                            ${getStatusText(classItem.status || 'scheduled')}
                        </span>
                    </div>
                    <div class="class-actions">
                        <button class="btn-action" onclick="editClass('${classItem._id}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-action danger" onclick="deleteClass('${classItem._id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// Payments Functions
async function loadPayments() {
    try {
        const response = await apiCall('/payments');
        paymentsData = response.data || [];
        renderPaymentsSummary(paymentsData);
        renderPaymentsTable(paymentsData);
    } catch (error) {
        const container = document.getElementById('payments-table');
        container.innerHTML = '<div class="error-message">Erro ao carregar pagamentos. Verifique se o servidor está rodando.</div>';
    }
}

function renderPaymentsSummary(payments) {
    const received = payments.filter(p => p.status === 'paid').reduce((sum, p) => sum + (p.amount || 0), 0);
    const pending = payments.filter(p => p.status === 'pending').reduce((sum, p) => sum + (p.amount || 0), 0);
    const overdue = payments.filter(p => p.status === 'overdue').reduce((sum, p) => sum + (p.amount || 0), 0);
    
    updateElement('payments-received', `R$ ${received.toLocaleString('pt-BR')}`);
    updateElement('payments-pending', `R$ ${pending.toLocaleString('pt-BR')}`);
    updateElement('payments-overdue', `R$ ${overdue.toLocaleString('pt-BR')}`);
}

function renderPaymentsTable(payments) {
    const container = document.getElementById('payments-table');
    if (!container) return;
    
    if (payments.length === 0) {
        container.innerHTML = '<div class="no-data">Nenhum pagamento registrado</div>';
        return;
    }
    
    container.innerHTML = `
        <div class="table-container">
            <table class="payments-table-element">
                <thead>
                    <tr>
                        <th>Aluno</th>
                        <th>Valor</th>
                        <th>Vencimento</th>
                        <th>Status</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${payments.map(payment => `
                        <tr>
                            <td>${payment.studentName || 'Aluno não informado'}</td>
                            <td>R$ ${(payment.amount || 0).toLocaleString('pt-BR')}</td>
                            <td>${formatDate(payment.dueDate)}</td>
                            <td>
                                <span class="payment-status ${payment.status || 'pending'}">
                                    ${getStatusText(payment.status || 'pending')}
                                </span>
                            </td>
                            <td>
                                <div class="table-actions">
                                    <button class="btn-action" onclick="editPayment('${payment._id}')">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="btn-action danger" onclick="deletePayment('${payment._id}')">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// Products Functions
async function loadProducts() {
    try {
        const response = await apiCall('/products');
        productsData = response.data || [];
        renderProducts(productsData);
    } catch (error) {
        const container = document.getElementById('products-grid');
        container.innerHTML = '<div class="error-message">Erro ao carregar produtos. Verifique se o servidor está rodando.</div>';
    }
}

function renderProducts(products) {
    const container = document.getElementById('products-grid');
    if (!container) return;
    
    if (products.length === 0) {
        container.innerHTML = '<div class="no-data">Nenhum produto cadastrado</div>';
        return;
    }
    
    container.innerHTML = products.map(product => `
        <div class="product-card">
            <div class="product-image">
                <i class="fas fa-box"></i>
            </div>
            <div class="product-info">
                <h3>${product.name || 'Produto'}</h3>
                <p class="product-description">${product.description || 'Descrição não informada'}</p>
                <div class="product-price">R$ ${(product.price || 0).toLocaleString('pt-BR')}</div>
                <div class="product-stock">Estoque: ${product.stock || 0}</div>
                <div class="product-category">${product.category || 'Categoria não informada'}</div>
            </div>
            <div class="product-actions">
                <button class="btn-action" onclick="editProduct('${product._id}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-action danger" onclick="deleteProduct('${product._id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

// Modal Functions
function showModal(modalId) {
    const overlay = document.getElementById('modal-overlay');
    const modal = document.getElementById(modalId);
    
    if (overlay && modal) {
        // Hide all modals first
        const allModals = overlay.querySelectorAll('.modal');
        allModals.forEach(m => m.style.display = 'none');
        
        // Show target modal
        modal.style.display = 'block';
        overlay.classList.add('active');
    }
}

function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) {
        overlay.classList.remove('active');
        
        // Reset all forms
        const forms = overlay.querySelectorAll('form');
        forms.forEach(form => form.reset());
    }
}

function showLoginModal() {
    showModal('login-modal');
}

function showRegisterModal() {
    showModal('register-modal');
}

function showAddStudentModal() {
    showModal('add-student-modal');
}

function showAddClassModal() {
    // Create and show add class modal (would need to be implemented)
    showToast('Funcionalidade em desenvolvimento', 'info');
}

function showAddPaymentModal() {
    // Create and show add payment modal (would need to be implemented)
    showToast('Funcionalidade em desenvolvimento', 'info');
}

function showAddProductModal() {
    // Create and show add product modal (would need to be implemented)
    showToast('Funcionalidade em desenvolvimento', 'info');
}

// Event Listeners
function initializeEventListeners() {
    // Search functionality
    const studentSearch = document.getElementById('student-search');
    if (studentSearch) {
        studentSearch.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const filteredStudents = studentsData.filter(student => 
                (student.name || '').toLowerCase().includes(searchTerm) ||
                (student.email || '').toLowerCase().includes(searchTerm)
            );
            renderStudents(filteredStudents);
        });
    }
    
    // Filter functionality
    const studentFilter = document.getElementById('student-filter');
    if (studentFilter) {
        studentFilter.addEventListener('change', (e) => {
            const filterValue = e.target.value;
            let filteredStudents = studentsData;
            
            if (filterValue !== 'all') {
                filteredStudents = studentsData.filter(student => student.status === filterValue);
            }
            
            renderStudents(filteredStudents);
        });
    }
    
    // Category buttons
    const categoryBtns = document.querySelectorAll('.category-btn');
    categoryBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Update active button
            categoryBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Filter products
            const category = btn.dataset.category;
            let filteredProducts = productsData;
            
            if (category !== 'all') {
                filteredProducts = productsData.filter(product => product.category === category);
            }
            
            renderProducts(filteredProducts);
        });
    });
    
    // Form submissions
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }
    
    const addStudentForm = document.getElementById('add-student-form');
    if (addStudentForm) {
        addStudentForm.addEventListener('submit', handleAddStudent);
    }
    
    // Close modal on overlay click
    const modalOverlay = document.getElementById('modal-overlay');
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                closeModal();
            }
        });
    }
}

// Form Handlers
async function handleLogin(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const loginData = {
        email: formData.get('email'),
        password: formData.get('password')
    };
    
    try {
        const response = await apiCall('/auth/login', 'POST', loginData);
        currentUser = response.data;
        localStorage.setItem('spartan_user', JSON.stringify(currentUser));
        
        showToast('Login realizado com sucesso!', 'success');
        closeModal();
        updateAuthUI();
        
    } catch (error) {
        showToast('Erro no login. Verifique suas credenciais.', 'error');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const registerData = {
        name: formData.get('name'),
        email: formData.get('email'),
        password: formData.get('password'),
        confirmPassword: formData.get('confirmPassword')
    };
    
    if (registerData.password !== registerData.confirmPassword) {
        showToast('As senhas não coincidem', 'error');
        return;
    }
    
    try {
        await apiCall('/auth/register', 'POST', registerData);
        showToast('Cadastro realizado com sucesso! Faça login para continuar.', 'success');
        closeModal();
        showLoginModal();
        
    } catch (error) {
        showToast('Erro no cadastro. Tente novamente.', 'error');
    }
}

async function handleAddStudent(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const studentData = {
        name: formData.get('name'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        birthDate: formData.get('birthDate'),
        address: formData.get('address'),
        modality: formData.get('modality'),
        graduation: formData.get('graduation')
    };
    
    try {
        await apiCall('/students', 'POST', studentData);
        showToast('Aluno adicionado com sucesso!', 'success');
        closeModal();
        loadStudents(); // Reload students list
        
    } catch (error) {
        showToast('Erro ao adicionar aluno. Tente novamente.', 'error');
    }
}

// CRUD Functions
function editStudent(studentId) {
    showToast('Funcionalidade de edição em desenvolvimento', 'info');
}

function deleteStudent(studentId) {
    if (confirm('Tem certeza que deseja excluir este aluno?')) {
        // Implement delete functionality
        showToast('Funcionalidade de exclusão em desenvolvimento', 'info');
    }
}

function editClass(classId) {
    showToast('Funcionalidade de edição em desenvolvimento', 'info');
}

function deleteClass(classId) {
    if (confirm('Tem certeza que deseja excluir esta aula?')) {
        showToast('Funcionalidade de exclusão em desenvolvimento', 'info');
    }
}

function editPayment(paymentId) {
    showToast('Funcionalidade de edição em desenvolvimento', 'info');
}

function deletePayment(paymentId) {
    if (confirm('Tem certeza que deseja excluir este pagamento?')) {
        showToast('Funcionalidade de exclusão em desenvolvimento', 'info');
    }
}

function editProduct(productId) {
    showToast('Funcionalidade de edição em desenvolvimento', 'info');
}

function deleteProduct(productId) {
    if (confirm('Tem certeza que deseja excluir este produto?')) {
        showToast('Funcionalidade de exclusão em desenvolvimento', 'info');
    }
}

// Calendar Functions
function selectCalendarDay(day) {
    showToast(`Dia ${day} selecionado. Funcionalidade em desenvolvimento.`, 'info');
}

function previousMonth() {
    showToast('Navegação de mês em desenvolvimento', 'info');
}

function nextMonth() {
    showToast('Navegação de mês em desenvolvimento', 'info');
}

// Utility Functions
function updateElement(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}

function formatDate(dateString) {
    if (!dateString) return 'Data não informada';
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR');
}

function formatDateTime(dateString) {
    if (!dateString) return 'Data não informada';
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR');
}

function getStatusText(status) {
    const statusMap = {
        'active': 'Ativo',
        'inactive': 'Inativo',
        'scheduled': 'Agendado',
        'completed': 'Concluído',
        'cancelled': 'Cancelado',
        'paid': 'Pago',
        'pending': 'Pendente',
        'overdue': 'Atrasado'
    };
    return statusMap[status] || status;
}

function getGraduationText(graduation) {
    const graduationMap = {
        'white': 'Faixa Branca',
        'yellow': 'Faixa Amarela',
        'orange': 'Faixa Laranja',
        'green': 'Faixa Verde',
        'blue': 'Faixa Azul',
        'brown': 'Faixa Marrom',
        'black': 'Faixa Preta'
    };
    return graduationMap[graduation] || graduation || 'Não informado';
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    // Remove toast after 5 seconds
    setTimeout(() => {
        toast.remove();
    }, 5000);
}

function checkExistingSession() {
    const savedUser = localStorage.getItem('spartan_user');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            updateAuthUI();
        } catch (error) {
            localStorage.removeItem('spartan_user');
        }
    }
}

function updateAuthUI() {
    const navAuth = document.querySelector('.nav-auth');
    if (!navAuth) return;
    
    if (currentUser) {
        navAuth.innerHTML = `
            <span class="user-name">Olá, ${currentUser.name || 'Usuário'}</span>
            <button class="btn-logout" onclick="logout()">Sair</button>
        `;
    } else {
        navAuth.innerHTML = `
            <button class="btn-login" onclick="showLoginModal()">Login</button>
            <button class="btn-register" onclick="showRegisterModal()">Cadastrar</button>
        `;
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('spartan_user');
    updateAuthUI();
    showToast('Logout realizado com sucesso!', 'success');
    showSection('home');
}

// Add some sample data for demonstration
function addSampleData() {
    // This would typically come from the API
    if (studentsData.length === 0) {
        studentsData = [
            {
                _id: '1',
                name: 'João Silva',
                email: 'joao@email.com',
                phone: '(11) 99999-9999',
                modality: 'Karatê',
                graduation: 'blue',
                status: 'active'
            },
            {
                _id: '2',
                name: 'Maria Santos',
                email: 'maria@email.com',
                phone: '(11) 88888-8888',
                modality: 'Judô',
                graduation: 'green',
                status: 'active'
            }
        ];
    }
}

// Initialize sample data if API is not available
setTimeout(() => {
    if (studentsData.length === 0 && currentSection === 'students') {
        addSampleData();
        renderStudents(studentsData);
    }
}, 2000);