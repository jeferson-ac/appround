import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Company, AppView, Negotiation, UserRole, RegistrationSettings } from './types';
import { STORAGE_KEYS, ADMIN_CREDENTIALS } from './constants';
import { Input } from './components/Input';
import { Button } from './components/Button';
import { getBusinessInsights } from './services/geminiService';
import { db, collection, onSnapshot, query, doc, setDoc, deleteDoc, updateDoc } from './services/firebase';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList
} from 'recharts';

const Logo = ({ className = "" }: { className?: string }) => (
  <div className={`flex items-baseline gap-1 select-none font-bai ${className}`}>
    <span className="text-[#b41e45] font-bold text-2xl tracking-tighter">ÁREA</span>
    <span className="text-[#b41e45] font-light text-2xl tracking-tight">CENTRAL</span>
  </div>
);

type AdminTab = 'summary' | 'maintenance' | 'config';

const formatCurrencyBRL = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  const amount = Number(digits) / 100;
  return amount.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
};

const parseCurrencyBRL = (formattedValue: string) => {
  if (!formattedValue) return 0;
  return Number(formattedValue.replace(/\D/g, '')) / 100;
};

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('login');
  const [currentUser, setCurrentUser] = useState<Company | null>(null);
  const [users, setUsers] = useState<Company[]>([]);
  const [negotiations, setNegotiations] = useState<Negotiation[]>([]);
  const [authError, setAuthError] = useState('');
  const [insight, setInsight] = useState<string>('');
  const [isWelcomeVisible, setIsWelcomeVisible] = useState(true);
  const [selectedSupplierCnpj, setSelectedSupplierCnpj] = useState<string>('');
  
  const [amountMask, setAmountMask] = useState('');
  const [editAmountMask, setEditAmountMask] = useState('');
  const [addNegAmountMask, setAddNegAmountMask] = useState('');

  const formRef = useRef<HTMLDivElement>(null);

  const [adminTab, setAdminTab] = useState<AdminTab>('summary');
  const [regSettings, setRegSettings] = useState<RegistrationSettings>({
    allowAssociate: true,
    allowSupplier: true,
    allowNegotiations: true,
    googleSheetsWebhookUrl: ''
  });
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [editingNegotiation, setEditingNegotiation] = useState<Negotiation | null>(null);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [isAddingCompany, setIsAddingCompany] = useState(false);
  const [isAddingNegotiation, setIsAddingNegotiation] = useState(false);
  const [adminFilterRole, setAdminFilterRole] = useState<UserRole | 'all'>('all');
  const [adminSearchTerm, setAdminSearchTerm] = useState('');
  const [adminNegSearchTerm, setAdminNegSearchTerm] = useState('');
  const [adminNegFilterRole, setAdminNegFilterRole] = useState<UserRole | 'all'>('all');
  const [selectedCompanySummary, setSelectedCompanySummary] = useState<Company | null>(null);
  const [showWebhookInstructions, setShowWebhookInstructions] = useState(false);

  const currentYear = new Date().getFullYear();

  // 🔥 FIREBASE REAL-TIME SYNC
  useEffect(() => {
    // Sincronizar Usuários/Empresas
    const unsubCompanies = onSnapshot(collection(db, "companies"), (snapshot) => {
      const companiesData = snapshot.docs.map(doc => doc.data() as Company);
      setUsers(companiesData);

      // Tentar restaurar sessão
      const storedUser = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
      if (storedUser && !currentUser) {
        const parsed = JSON.parse(storedUser);
        const cloudUser = companiesData.find(u => u.cnpj === parsed.cnpj);
        if (cloudUser) {
          setCurrentUser(cloudUser);
          setView('dashboard');
        }
      }
    });

    // Sincronizar Negociações
    const unsubNegs = onSnapshot(collection(db, "negotiations"), (snapshot) => {
      const negsData = snapshot.docs.map(doc => doc.data() as Negotiation);
      setNegotiations(negsData);
    });

    // Sincronizar Configurações
    const unsubSettings = onSnapshot(doc(db, "config", "settings"), (snapshot) => {
      if (snapshot.exists()) {
        setRegSettings(snapshot.data() as RegistrationSettings);
      }
    });

    // Estado do Welcome (Local)
    const welcomeHidden = localStorage.getItem(STORAGE_KEYS.WELCOME_HIDDEN);
    if (welcomeHidden === 'true') setIsWelcomeVisible(false);

    return () => {
      unsubCompanies();
      unsubNegs();
      unsubSettings();
    };
  }, [currentUser]);

  const handleDismissWelcome = () => {
    setIsWelcomeVisible(false);
    localStorage.setItem(STORAGE_KEYS.WELCOME_HIDDEN, 'true');
  };

  const syncToGoogleSheets = async (negotiation: Negotiation) => {
    if (!regSettings.googleSheetsWebhookUrl) return;

    try {
      const assoc = users.find(u => u.cnpj === negotiation.companyCnpj);
      const supp = users.find(u => u.cnpj === negotiation.supplierCnpj);
      
      const payload = {
        id: negotiation.id,
        associateName: assoc?.tradingName || 'N/A',
        supplierName: supp?.tradingName || 'N/A',
        amount: negotiation.amount,
        formattedAmount: (negotiation.amount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        timestamp: negotiation.timestamp,
        formattedDate: new Date(negotiation.timestamp).toLocaleString('pt-BR'),
        notes: negotiation.notes || ''
      };

      await fetch(regSettings.googleSheetsWebhookUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      console.error('Erro ao sincronizar com Google Sheets:', error);
    }
  };

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const cnpj = formData.get('cnpj') as string;
    const tradingName = (formData.get('tradingName') as string).toUpperCase();
    const phone = formData.get('phone') as string;
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const role = formData.get('role') as UserRole;

    if (!cnpj || !tradingName || !phone || !email || !password || !role) {
      alert('Todos os campos são obrigatórios.');
      return;
    }

    if (users.find(u => u.cnpj === cnpj)) {
      alert('Este CNPJ já está cadastrado.');
      setView('login');
      return;
    }

    const newUser: Company = { cnpj, tradingName, phone, email, password, role };
    await setDoc(doc(db, "companies", cnpj), newUser);
    alert('Cadastro realizado com sucesso! Use seu CNPJ e senha para entrar.');
    setView('login');
  };

  const handleLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const cnpj = formData.get('cnpj') as string;
    const password = formData.get('password') as string;

    const user = users.find(u => u.cnpj === cnpj && u.password === password);
    if (user) {
      setCurrentUser(user);
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
      setView('dashboard');
      setAuthError('');
    } else {
      setAuthError('CNPJ ou Senha incorretos.');
    }
  };

  const handleAdminLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const user = formData.get('user') as string;
    const password = formData.get('password') as string;

    if (user === ADMIN_CREDENTIALS.user && password === ADMIN_CREDENTIALS.password) {
      setIsAdminLoggedIn(true);
      setAuthError('');
    } else {
      setAuthError('Usuário ou senha administrativa incorretos.');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setIsAdminLoggedIn(false);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    setView('login');
  };

  const exportToCSV = () => {
    if (negotiations.length === 0) {
      alert('Não há negociações para exportar.');
      return;
    }

    const headers = ['ID', 'Associado', 'CNPJ Associado', 'Fornecedor', 'CNPJ Fornecedor', 'Valor', 'Data', 'Notas'];
    const rows = negotiations.map(n => {
      const assoc = users.find(u => u.cnpj === n.companyCnpj);
      const supp = users.find(u => u.cnpj === n.supplierCnpj);
      return [
        n.id,
        assoc?.tradingName || 'N/A',
        n.companyCnpj,
        supp?.tradingName || 'N/A',
        n.supplierCnpj,
        (n.amount || 0).toFixed(2),
        new Date(n.timestamp).toLocaleString('pt-BR'),
        (n.notes || '').replace(/"/g, '""')
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' }); 
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `rodada_negocios_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAddNegotiation = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentUser || currentUser.role !== 'associate') return;

    if (!regSettings.allowNegotiations) {
      alert('O lançamento de novas negociações está bloqueado pela organização.');
      return;
    }

    const formData = new FormData(e.currentTarget);
    const supplierCnpj = formData.get('supplierCnpj') as string;
    const amount = parseCurrencyBRL(amountMask);

    if (!supplierCnpj) {
      alert('Por favor, selecione um fornecedor.');
      return;
    }

    const alreadyExists = negotiations.some(n => n.companyCnpj === currentUser.cnpj && n.supplierCnpj === supplierCnpj);
    if (alreadyExists) {
      alert('Já existe um registro de negociação com este fornecedor hoje.');
      return;
    }

    const newNeg: Negotiation = {
      id: crypto.randomUUID(),
      companyCnpj: currentUser.cnpj,
      supplierCnpj: supplierCnpj,
      amount: amount,
      notes: formData.get('notes') as string,
      timestamp: new Date().toISOString(),
    };

    await setDoc(doc(db, "negotiations", newNeg.id), newNeg);
    setSelectedSupplierCnpj('');
    setAmountMask('');
    (e.target as HTMLFormElement).reset();

    if (regSettings.googleSheetsWebhookUrl) {
      syncToGoogleSheets(newNeg);
    }
  };

  const handleFillNegotiation = (cnpj: string) => {
    setSelectedSupplierCnpj(cnpj);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleAdminDeleteNegotiation = async (id: string) => {
    if (window.confirm('Confirma a exclusão permanente deste registro de negociação?')) {
      await deleteDoc(doc(db, "negotiations", id));
    }
  };

  const handleAdminDeleteCompany = async (cnpj: string) => {
    if (window.confirm('Atenção: A exclusão da empresa removerá também todos os seus lançamentos de negociação. Confirmar?')) {
      await deleteDoc(doc(db, "companies", cnpj));
      const related = negotiations.filter(n => n.companyCnpj === cnpj || n.supplierCnpj === cnpj);
      for (const neg of related) {
        await deleteDoc(doc(db, "negotiations", neg.id));
      }
    }
  };

  const handleAdminUpdateNegotiation = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingNegotiation) return;

    const formData = new FormData(e.currentTarget);
    const amount = parseCurrencyBRL(editAmountMask);
    const notes = formData.get('notes') as string;

    await updateDoc(doc(db, "negotiations", editingNegotiation.id), { amount, notes });
    setEditingNegotiation(null);
  };

  const handleAdminAddNegotiation = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const companyCnpj = formData.get('companyCnpj') as string;
    const supplierCnpj = formData.get('supplierCnpj') as string;
    const amount = parseCurrencyBRL(addNegAmountMask);
    const notes = formData.get('notes') as string;

    if (!companyCnpj || !supplierCnpj) {
      alert('Preencha todos os campos obrigatórios corretamente.');
      return;
    }

    const newNeg: Negotiation = {
      id: crypto.randomUUID(),
      companyCnpj,
      supplierCnpj,
      amount,
      notes,
      timestamp: new Date().toISOString(),
    };

    await setDoc(doc(db, "negotiations", newNeg.id), newNeg);
    setIsAddingNegotiation(false);
    setAddNegAmountMask('');
    
    if (regSettings.googleSheetsWebhookUrl) {
      syncToGoogleSheets(newNeg);
    }
  };

  const handleAdminAddCompany = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const cnpj = formData.get('cnpj') as string;
    const tradingName = (formData.get('tradingName') as string).toUpperCase();
    const phone = formData.get('phone') as string;
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const role = formData.get('role') as UserRole;

    if (!cnpj || !tradingName || !role) {
      alert('Preencha os campos obrigatórios.');
      return;
    }

    if (users.find(u => u.cnpj === cnpj)) {
      alert('CNPJ já cadastrado');
      return;
    }

    const newCompany: Company = { cnpj, tradingName, phone, email, password, role };
    await setDoc(doc(db, "companies", cnpj), newCompany);
    setIsAddingCompany(false);
    alert('Empresa adicionada com sucesso!');
  };

  const handleAdminUpdateCompany = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingCompany) return;

    const formData = new FormData(e.currentTarget);
    const updatedCompany: Company = {
      ...editingCompany,
      tradingName: (formData.get('tradingName') as string).toUpperCase(),
      phone: formData.get('phone') as string,
      email: formData.get('email') as string,
      password: formData.get('password') as string,
      role: formData.get('role') as UserRole,
    };

    await setDoc(doc(db, "companies", editingCompany.cnpj), updatedCompany);
    setEditingCompany(null);
    alert('Dados da empresa atualizados com sucesso!');
  };

  const handleUpdateSettings = async (newSettings: RegistrationSettings) => {
    await setDoc(doc(db, "config", "settings"), newSettings);
  };

  const filteredUsers = users.filter(u => {
    const matchesRole = adminFilterRole === 'all' || u.role === adminFilterRole;
    const matchesSearch = u.tradingName.toLowerCase().includes(adminSearchTerm.toLowerCase()) || 
                          u.cnpj.includes(adminSearchTerm);
    return matchesRole && matchesSearch;
  });

  const filteredNegotiations = useMemo(() => {
    const term = adminNegSearchTerm.toLowerCase();
    return [...negotiations]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .filter(n => {
        const assoc = users.find(u => u.cnpj === n.companyCnpj);
        const supp = users.find(u => u.cnpj === n.supplierCnpj);
        
        const matchesSearch = 
          (assoc?.tradingName.toLowerCase().includes(term) || n.companyCnpj.includes(term)) ||
          (supp?.tradingName.toLowerCase().includes(term) || n.supplierCnpj.includes(term));

        if (adminNegFilterRole === 'all') return matchesSearch;
        
        if (adminNegFilterRole === 'associate') {
          return (assoc?.tradingName.toLowerCase().includes(term) || n.companyCnpj.includes(term));
        } else {
          return (supp?.tradingName.toLowerCase().includes(term) || n.supplierCnpj.includes(term));
        }
      });
  }, [negotiations, users, adminNegSearchTerm, adminNegFilterRole]);

  const getCompanySummaryData = (company: Company) => {
    const isAssoc = company.role === 'associate';
    const compNegs = negotiations.filter(n => isAssoc ? n.companyCnpj === company.cnpj : n.supplierCnpj === company.cnpj);
    const totalValue = compNegs.reduce((sum, n) => sum + (n.amount || 0), 0);
    const uniquePartners = new Set(compNegs.map(n => isAssoc ? n.supplierCnpj : n.companyCnpj)).size;
    const totalPotentialPartners = users.filter(u => isAssoc ? u.role === 'supplier' : u.role === 'associate').length;
    
    return { totalValue, uniquePartners, totalPotentialPartners };
  };

  const associates = useMemo(() => users.filter(u => u.role === 'associate'), [users]);
  const suppliers = useMemo(() => users.filter(u => u.role === 'supplier'), [users]);

  const adminSupplierPositivationList = useMemo(() => {
    const totalAssociates = associates.length;
    return suppliers.map(s => {
      const uniquePartners = new Set(
        negotiations.filter(n => n.supplierCnpj === s.cnpj).map(n => n.companyCnpj)
      ).size;
      const faltantes = Math.max(0, totalAssociates - uniquePartners);
      return {
        name: s.tradingName,
        negociados: uniquePartners,
        faltantes: faltantes,
        totalBase: totalAssociates,
        displayLabel: `${uniquePartners} [Faltam ${faltantes}]`
      };
    }).sort((a, b) => b.negociados - a.negociados);
  }, [suppliers, associates, negotiations]);

  const adminAssociatePositivationList = useMemo(() => {
    const totalSuppliers = suppliers.length;
    return associates.map(a => {
      const uniquePartners = new Set(
        negotiations.filter(n => n.companyCnpj === a.cnpj).map(n => n.supplierCnpj)
      ).size;
      const faltantes = Math.max(0, totalSuppliers - uniquePartners);
      return {
        name: a.tradingName,
        negociados: uniquePartners,
        faltantes: faltantes,
        totalBase: totalSuppliers,
        displayLabel: `${uniquePartners} [Faltam ${faltantes}]`
      };
    }).sort((a, b) => b.negociados - a.negociados);
  }, [associates, suppliers, negotiations]);

  const dashboardStats = useMemo(() => {
    if (!currentUser) return null;

    let userNegotiations: Negotiation[] = [];
    let counterLabel = "";
    let partnerList: Company[] = [];

    if (currentUser.role === 'associate') {
      userNegotiations = negotiations.filter(n => n.companyCnpj === currentUser.cnpj);
      counterLabel = "Fornecedores Negociados";
      partnerList = suppliers;
    } else {
      userNegotiations = negotiations.filter(n => n.supplierCnpj === currentUser.cnpj);
      counterLabel = "Associados Atendidos";
      partnerList = associates;
    }

    const totalAmount = userNegotiations.reduce((acc, n) => acc + (n.amount || 0), 0);
    const negotiatedPartnersCnpjs = new Set(userNegotiations.map(n => currentUser.role === 'associate' ? n.supplierCnpj : n.companyCnpj));
    const counterValue = negotiatedPartnersCnpjs.size;
    const pendingList = partnerList.filter(p => !negotiatedPartnersCnpjs.has(p.cnpj));
    const historyList = [...userNegotiations].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const chartData = partnerList.map(other => {
      const total = userNegotiations
        .filter(n => (currentUser.role === 'associate' ? n.supplierCnpj : n.companyCnpj) === other.cnpj)
        .reduce((sum, n) => sum + (n.amount || 0), 0);
      return { name: other.tradingName, total };
    }).filter(d => d.total > 0);

    return {
      userNegotiations,
      totalAmount,
      counterLabel,
      counterValue,
      pendingList,
      historyList,
      chartData
    };
  }, [currentUser, negotiations, associates, suppliers]);

  useEffect(() => {
    if (view === 'dashboard' && dashboardStats) {
      getBusinessInsights({ totalAmount: dashboardStats.totalAmount, supplierCount: dashboardStats.counterValue }).then(setInsight);
    }
  }, [view, dashboardStats]);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmountMask(formatCurrencyBRL(e.target.value));
  };

  const handleEditAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditAmountMask(formatCurrencyBRL(e.target.value));
  };

  const handleAddNegAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAddNegAmountMask(formatCurrencyBRL(e.target.value));
  };

  useEffect(() => {
    if (editingNegotiation) {
      setEditAmountMask(formatCurrencyBRL(((editingNegotiation.amount || 0) * 100).toString()));
    }
  }, [editingNegotiation]);

  const googleScriptTemplate = `function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  
  sheet.appendRow([
    data.id,
    data.associateName,
    data.supplierName,
    data.amount,
    data.formattedDate,
    data.notes
  ]);
  
  return ContentService.createTextOutput("Success").setMimeType(ContentService.MimeType.TEXT);
}`;

  if (view === 'admin') {
    if (!isAdminLoggedIn) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-100">
            <div className="flex flex-col items-center mb-8 text-center">
              <Logo className="mb-6 scale-125" />
              <h1 className="text-2xl font-bold text-slate-800 font-bai">Acesso Administrativo</h1>
              <p className="text-slate-500">Painel Geral da Rodada</p>
            </div>
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <Input label="Usuário" name="user" required />
              <Input label="Senha" name="password" type="password" required />
              {authError && <p className="text-red-500 text-sm font-medium">{authError}</p>}
              <Button type="submit" className="w-full">Entrar no Painel</Button>
              <Button variant="ghost" onClick={() => { setView('login'); setAuthError(''); }} className="w-full">Voltar ao Login</Button>
            </form>
          </div>
        </div>
      );
    }

    const totalNegotiatedAll = negotiations.reduce((acc, n) => acc + (n.amount || 0), 0);
    const avgNegotiationValue = negotiations.length > 0 ? totalNegotiatedAll / negotiations.length : 0;
    const assocCount = users.filter(u => u.role === 'associate').length;
    const suppCount = users.filter(u => u.role === 'supplier').length;

    return (
      <div className="min-h-screen flex flex-col bg-slate-100 pb-20">
        <nav className="bg-[#b41e45] text-white p-4 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <Logo className="brightness-0 invert" />
            <div className="flex items-center gap-4">
              <span className="font-bai font-bold uppercase text-xs tracking-widest bg-white/20 px-3 py-1 rounded">Admin Master</span>
              <Button variant="secondary" className="text-sm py-1.5 px-4" onClick={handleLogout}>Sair</Button>
            </div>
          </div>
        </nav>

        <div className="bg-white border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 lg:px-8">
            <div className="flex gap-8">
              {(['summary', 'maintenance', 'config'] as AdminTab[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setAdminTab(tab)}
                  className={`py-4 text-sm font-bold uppercase tracking-wider font-bai border-b-2 transition-all ${
                    adminTab === tab ? 'border-[#b41e45] text-[#b41e45]' : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {tab === 'summary' ? 'Resumo' : tab === 'maintenance' ? 'Manutenção' : 'Config'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <main className="max-w-7xl mx-auto w-full p-4 lg:p-8 space-y-8">
          {adminTab === 'summary' && (
            <div className="space-y-8 animate-in fade-in duration-500">
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                <h3 className="text-xl font-bold mb-6 text-slate-700 font-bai">Resumo Geral da Rodada</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="p-6 bg-slate-50 rounded-xl border border-slate-100 text-center">
                    <p className="text-3xl font-bold text-[#b41e45] font-bai">{negotiations.length}</p>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-tighter">Negociações Realizadas</p>
                  </div>
                  <div className="p-6 bg-slate-50 rounded-xl border border-slate-100 text-center">
                    <p className="text-2xl font-bold text-slate-800 font-bai">
                      {avgNegotiationValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-tighter">Ticket Médio</p>
                  </div>
                  <div className="p-6 bg-[#b41e45] rounded-xl text-white text-center shadow-lg">
                    <p className="text-3xl font-bold font-bai">
                      {totalNegotiatedAll.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                    <p className="text-xs text-white/70 font-bold uppercase tracking-wider">Volume Total de Negócios</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                  <div className="mb-6">
                    <h3 className="text-lg font-bold text-slate-700 font-bai uppercase tracking-wide">Positivação de Fornecedores</h3>
                  </div>
                  <div className="h-[450px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={adminSupplierPositivationList} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={150} tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                        <Tooltip />
                        <Bar dataKey="negociados" fill="#b41e45" radius={[0, 4, 4, 0]} barSize={20}>
                          <LabelList dataKey="displayLabel" position="right" style={{ fill: '#b41e45', fontSize: '9px', fontWeight: 'bold' }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                  <div className="mb-6">
                    <h3 className="text-lg font-bold text-slate-700 font-bai uppercase tracking-wide">Positivação de Associados</h3>
                  </div>
                  <div className="h-[450px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={adminAssociatePositivationList} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={150} tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                        <Tooltip />
                        <Bar dataKey="negociados" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20}>
                          <LabelList dataKey="displayLabel" position="right" style={{ fill: '#3b82f6', fontSize: '9px', fontWeight: 'bold' }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}

          {adminTab === 'maintenance' && (
            <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div>
                      <h3 className="text-xl font-bold text-slate-700 font-bai">Auditoria de Negociações</h3>
                    </div>
                    <button onClick={() => setIsAddingNegotiation(true)} className="px-4 py-1.5 rounded-full bg-blue-50 text-blue-600 text-xs font-bold hover:bg-blue-100 transition-colors uppercase font-bai">adicionar</button>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <input 
                      type="text"
                      placeholder="Pesquisar..."
                      value={adminNegSearchTerm}
                      onChange={(e) => setAdminNegSearchTerm(e.target.value)}
                      className="px-4 py-1.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#b41e45] w-full md:w-64 bg-slate-50"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto">
                   <table className="w-full text-left">
                     <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                       <tr>
                         <th className="px-6 py-4 border-b">Fornecedor</th>
                         <th className="px-6 py-4 border-b">Associado</th>
                         <th className="px-6 py-4 border-b">Valor</th>
                         <th className="px-6 py-4 border-b text-right">Ações</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100 text-sm">
                       {filteredNegotiations.map(n => {
                         const assoc = users.find(u => u.cnpj === n.companyCnpj);
                         const supp = users.find(u => u.cnpj === n.supplierCnpj);
                         return (
                           <tr key={n.id} className="hover:bg-slate-50 group">
                             <td className="px-6 py-4 font-bold text-slate-800">{supp?.tradingName}</td>
                             <td className="px-6 py-4 text-slate-600">{assoc?.tradingName}</td>
                             <td className="px-6 py-4 font-bold text-[#b41e45]">{(n.amount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                             <td className="px-6 py-4 text-right space-x-3">
                               <button onClick={() => setEditingNegotiation(n)} className="text-blue-600 font-bold text-[10px] uppercase hover:underline">Editar</button>
                               <button onClick={() => handleAdminDeleteNegotiation(n.id)} className="text-red-500 font-bold text-[10px] uppercase hover:underline">Excluir</button>
                             </td>
                           </tr>
                         );
                       })}
                     </tbody>
                   </table>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div>
                      <h3 className="text-xl font-bold text-slate-700 font-bai">Empresas Cadastradas</h3>
                    </div>
                    <button onClick={() => setIsAddingCompany(true)} className="px-4 py-1.5 rounded-full bg-emerald-50 text-emerald-600 text-xs font-bold hover:bg-emerald-100 transition-colors uppercase font-bai">adicionar</button>
                  </div>
                  <input 
                    type="text"
                    placeholder="Buscar empresa..."
                    value={adminSearchTerm}
                    onChange={(e) => setAdminSearchTerm(e.target.value)}
                    className="px-4 py-1.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#b41e45] w-full md:w-64 bg-slate-50"
                  />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                      <tr>
                        <th className="px-6 py-4">Empresa</th>
                        <th className="px-6 py-4">CNPJ</th>
                        <th className="px-6 py-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {filteredUsers.map(u => (
                        <tr key={u.cnpj} className="hover:bg-slate-50">
                          <td className="px-6 py-4 font-bold text-slate-800">{u.tradingName}</td>
                          <td className="px-6 py-4 text-slate-500 text-xs">{u.cnpj}</td>
                          <td className="px-6 py-4 text-right space-x-3">
                            <button onClick={() => setEditingCompany(u)} className="text-blue-600 text-[10px] font-bold uppercase hover:underline">Editar</button>
                            <button onClick={() => handleAdminDeleteCompany(u.cnpj)} className="text-red-500 text-[10px] font-bold uppercase hover:underline">Excluir</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {adminTab === 'config' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 space-y-6">
                <h3 className="text-xl font-bold text-slate-700 font-bai uppercase tracking-wide">Configurações Gerais</h3>
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                  <p className="font-bold text-slate-800 text-sm">Permitir Lançamento de Negociações</p>
                  <input type="checkbox" checked={regSettings.allowNegotiations} onChange={(e) => handleUpdateSettings({...regSettings, allowNegotiations: e.target.checked})} className="w-6 h-6 accent-[#b41e45]" />
                </div>
                <Input label="Webhook URL Google Sheets" value={regSettings.googleSheetsWebhookUrl || ''} onChange={(e) => handleUpdateSettings({...regSettings, googleSheetsWebhookUrl: e.target.value})} />
                <Button onClick={exportToCSV} variant="secondary" className="w-full">Exportar Backup CSV</Button>
              </div>
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                <h3 className="text-xl font-bold text-slate-700 mb-4 font-bai uppercase tracking-wide">Ajuda Webhook</h3>
                <div className="text-xs text-slate-600 bg-slate-50 p-4 rounded-xl space-y-2">
                  <p>Use este código no seu Google Apps Script:</p>
                  <pre className="text-[9px] bg-slate-900 text-emerald-400 p-3 rounded-lg overflow-x-auto">{googleScriptTemplate}</pre>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* MODAIS ADMIN */}
        {isAddingCompany && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
              <h3 className="text-xl font-bold mb-6 font-bai">Cadastrar Empresa</h3>
              <form onSubmit={handleAdminAddCompany} className="space-y-4">
                <Input label="CNPJ" name="cnpj" required />
                <Input label="Nome Fantasia" name="tradingName" onInput={(e) => (e.currentTarget.value = e.currentTarget.value.toUpperCase())} required />
                <select name="role" className="w-full p-2 border rounded-lg bg-slate-50 font-bai" required>
                  <option value="associate">Associado</option>
                  <option value="supplier">Fornecedor</option>
                </select>
                <Input label="Senha" name="password" type="text" defaultValue="123456" required />
                <div className="flex gap-4 pt-4">
                  <Button type="submit" className="flex-1">Salvar</Button>
                  <Button variant="ghost" onClick={() => setIsAddingCompany(false)} className="flex-1">Cancelar</Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {isAddingNegotiation && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
              <h3 className="text-xl font-bold mb-6 font-bai">Novo Lançamento Manual</h3>
              <form onSubmit={handleAdminAddNegotiation} className="space-y-4">
                <select name="companyCnpj" className="w-full p-2 border rounded-lg bg-slate-50" required>
                  <option value="">Selecione o Associado...</option>
                  {associates.map(a => <option key={a.cnpj} value={a.cnpj}>{a.tradingName}</option>)}
                </select>
                <select name="supplierCnpj" className="w-full p-2 border rounded-lg bg-slate-50" required>
                  <option value="">Selecione o Fornecedor...</option>
                  {suppliers.map(s => <option key={s.cnpj} value={s.cnpj}>{s.tradingName}</option>)}
                </select>
                <Input label="Valor" value={addNegAmountMask} onChange={handleAddNegAmountChange} required />
                <div className="flex gap-4 pt-4">
                  <Button type="submit" className="flex-1">Lançar</Button>
                  <Button variant="ghost" onClick={() => setIsAddingNegotiation(false)} className="flex-1">Voltar</Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {editingNegotiation && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
              <h3 className="text-xl font-bold mb-6 font-bai">Corrigir Valor</h3>
              <form onSubmit={handleAdminUpdateNegotiation} className="space-y-6">
                <Input label="Valor Final" value={editAmountMask} onChange={handleEditAmountChange} required />
                <div className="flex gap-4">
                  <Button type="submit" className="flex-1">Salvar</Button>
                  <Button variant="ghost" onClick={() => setEditingNegotiation(null)} className="flex-1">Cancelar</Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {editingCompany && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
              <h3 className="text-xl font-bold mb-6 font-bai">Editar Empresa</h3>
              <form onSubmit={handleAdminUpdateCompany} className="space-y-4">
                <Input label="Nome Fantasia" name="tradingName" defaultValue={editingCompany.tradingName} required />
                <select name="role" className="w-full p-2 border rounded-lg bg-slate-50 font-bai" defaultValue={editingCompany.role}>
                  <option value="associate">Associado</option>
                  <option value="supplier">Fornecedor</option>
                </select>
                <Input label="Senha" name="password" defaultValue={editingCompany.password} required />
                <div className="flex gap-4 pt-4">
                  <Button type="submit" className="flex-1">Atualizar</Button>
                  <Button variant="ghost" onClick={() => setEditingCompany(null)} className="flex-1">Cancelar</Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // LOGIN VIEW
  if (view === 'login') {
    return (
      <div className="min-h-screen flex flex-col justify-between bg-slate-50">
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-100">
            <div className="flex flex-col items-center mb-8 text-center">
              <Logo className="mb-6 scale-125" />
              <h1 className="text-2xl font-bold text-slate-800 font-bai">Rodada de Negócios</h1>
              <p className="text-slate-500">Faça login para começar</p>
            </div>
            <form onSubmit={handleLogin} className="space-y-4">
              <Input label="CNPJ" name="cnpj" placeholder="00.000.000/0000-00" required />
              <Input label="Senha" name="password" type="password" placeholder="••••••••" required />
              {authError && <p className="text-red-500 text-sm font-medium">{authError}</p>}
              <Button type="submit" className="w-full font-bai">Entrar</Button>
            </form>
            <div className="mt-6 text-center space-y-4">
              <p className="text-slate-600 text-sm">Ainda não está cadastrado? <button onClick={() => setView('register')} className="text-[#b41e45] font-semibold hover:underline">Registre sua empresa.</button></p>
              <div className="pt-4 border-t border-slate-100">
                <button onClick={() => { setView('admin'); setAuthError(''); }} className="text-[10px] text-slate-300 hover:text-slate-500 uppercase tracking-widest font-bai">Acesso Administrativo</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // REGISTER VIEW
  if (view === 'register') {
    return (
      <div className="min-h-screen flex flex-col justify-between bg-slate-50">
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-100">
            <div className="flex justify-center mb-8"><Logo /></div>
            <h1 className="text-2xl font-bold text-slate-800 mb-6 text-center font-bai">Inscrição na Rodada</h1>
            <form onSubmit={handleRegister} className="space-y-4">
              <select name="role" className="w-full p-2 border rounded-lg bg-slate-50 font-bai" required>
                <option value="associate">Associado</option>
                <option value="supplier">Fornecedor</option>
              </select>
              <Input label="CNPJ" name="cnpj" required />
              <Input label="Nome Fantasia" name="tradingName" onInput={(e) => (e.currentTarget.value = e.currentTarget.value.toUpperCase())} required />
              <Input label="E-mail" name="email" type="email" required />
              <Input label="Senha" name="password" type="password" required />
              <Button type="submit" className="w-full font-bai">Confirmar Inscrição</Button>
              <Button variant="ghost" type="button" className="w-full font-bai" onClick={() => setView('login')}>Voltar</Button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (!dashboardStats) return null;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-4">
            <div className="hidden md:block text-right">
              <p className="text-sm font-semibold text-slate-700">{currentUser?.tradingName}</p>
              <p className="text-[10px] text-[#b41e45] font-bold uppercase tracking-widest font-bai">{currentUser?.role === 'associate' ? 'Associado' : 'Fornecedor'}</p>
            </div>
            <Button variant="ghost" onClick={handleLogout} className="text-sm font-bai">Sair</Button>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 lg:p-8 space-y-8 animate-in fade-in duration-700">
        {isWelcomeVisible && (
          <section className="bg-gradient-to-br from-[#b41e45] to-[#8a1435] rounded-2xl p-6 lg:p-10 text-white shadow-lg relative overflow-hidden">
            <button onClick={handleDismissWelcome} className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 z-20">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h2 className="text-3xl font-bold mb-2 font-bai">Olá, {currentUser?.tradingName}</h2>
            <p className="opacity-80 font-bai">Acompanhe seus resultados em tempo real.</p>
            {insight && <p className="mt-6 text-sm italic bg-white/10 p-4 rounded-xl border border-white/20 inline-block">"{insight}"</p>}
          </section>
        )}

        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <p className="text-slate-500 text-[10px] font-bold uppercase mb-1 tracking-widest font-bai">Total Negociado</p>
            <h3 className="text-2xl font-bold text-slate-900 font-bai">{dashboardStats.totalAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</h3>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <p className="text-slate-500 text-[10px] font-bold uppercase mb-1 tracking-widest font-bai">{dashboardStats.counterLabel}</p>
            <h3 className="text-2xl font-bold text-slate-900 font-bai">{dashboardStats.counterValue}</h3>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <p className="text-slate-500 text-[10px] font-bold uppercase mb-1 tracking-widest font-bai">Pendentes</p>
            <h3 className="text-2xl font-bold text-slate-900 font-bai">{dashboardStats.pendingList.length}</h3>
          </div>
        </section>

        <div className={currentUser?.role === 'associate' ? "grid grid-cols-1 lg:grid-cols-2 gap-8" : "w-full"}>
          {currentUser?.role === 'associate' && (
            <div ref={formRef} className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm scroll-mt-24">
              <h3 className="text-xl font-bold text-slate-800 mb-6 font-bai">Lançar Registro</h3>
              {regSettings.allowNegotiations ? (
                <form onSubmit={handleAddNegotiation} className="space-y-6">
                  <select 
                    name="supplierCnpj" 
                    value={selectedSupplierCnpj}
                    onChange={(e) => setSelectedSupplierCnpj(e.target.value)}
                    className="w-full p-2 border rounded-lg bg-slate-50 font-bai outline-none focus:ring-2 focus:ring-[#b41e45]" 
                    required
                  >
                    <option value="">Selecione o Fornecedor...</option>
                    {dashboardStats.pendingList.map(s => <option key={s.cnpj} value={s.cnpj}>{s.tradingName}</option>)}
                  </select>
                  <Input label="Valor Negociado" value={amountMask} onChange={handleAmountChange} placeholder="R$ 0,00" required />
                  <textarea name="notes" placeholder="Observações..." className="w-full p-2 border rounded-lg bg-slate-50 h-24 outline-none focus:ring-2 focus:ring-[#b41e45]" />
                  <Button type="submit" className="w-full font-bai">Salvar Negociação</Button>
                </form>
              ) : (
                <p className="text-center text-slate-400 py-10 italic font-bai">Lançamentos bloqueados.</p>
              )}
            </div>
          )}

          <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm flex flex-col w-full">
            <h3 className="text-xl font-bold text-slate-800 mb-6 font-bai">Desempenho Financeiro</h3>
            <div className="w-full min-h-[350px]">
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={dashboardStats.chartData} margin={{ bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" angle={-25} textAnchor="end" tick={{ fontSize: 10 }} />
                  <YAxis />
                  <Tooltip formatter={(val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
                  <Bar dataKey="total" fill="#b41e45" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-slate-900 text-slate-500 py-16 mt-16 text-center text-sm">
        <Logo className="brightness-0 invert opacity-60 mb-6 mx-auto" />
        <p>© {currentYear} Área Central S.A. | Todos os direitos reservados</p>
      </footer>
    </div>
  );
};

export default App;