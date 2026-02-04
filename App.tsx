
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Company, AppView, Negotiation, UserRole, RegistrationSettings } from './types';
import { STORAGE_KEYS, ADMIN_CREDENTIALS } from './constants';
import { Input } from './components/Input';
import { Button } from './components/Button';
import { getBusinessInsights } from './services/geminiService';
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

/**
 * GUIA PARA HOSPEDAGEM ONLINE:
 * 1. Suba este código para um repositório no GitHub.
 * 2. Conecte o repositório na Vercel (vercel.com).
 * 3. Configure a variável de ambiente API_KEY no painel da Vercel.
 * 4. Para multi-usuário (dados compartilhados), substitua os 'localStorage' 
 *    abaixo por chamadas ao Firebase Firestore ou Supabase.
 */

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

// Fix: defined googleScriptTemplate to resolve "Cannot find name 'googleScriptTemplate'" errors
const googleScriptTemplate = `function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = JSON.parse(e.postData.contents);
    
    // Se a planilha estiver vazia, adiciona cabeçalhos
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["Data/Hora", "ID", "Associado", "Fornecedor", "Valor", "Notas"]);
    }
    
    sheet.appendRow([
      data.formattedDate,
      data.id,
      data.associateName,
      data.supplierName,
      data.amount,
      data.notes
    ]);
    
    return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
  } catch (error) {
    return ContentService.createTextOutput("Error: " + error.message).setMimeType(ContentService.MimeType.TEXT);
  }
}`;

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

  // Estados para controle da opção "Sem Negociação"
  const [noNegAssociate, setNoNegAssociate] = useState(false);
  const [noNegAdminAdd, setNoNegAdminAdd] = useState(false);
  const [noNegAdminEdit, setNoNegAdminEdit] = useState(false);

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

  // Load Data
  useEffect(() => {
    const storedUsers = localStorage.getItem(STORAGE_KEYS.COMPANIES);
    const storedNegotiations = localStorage.getItem(STORAGE_KEYS.NEGOTIATIONS);
    const storedCurrentUser = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    const storedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    const welcomeHidden = localStorage.getItem(STORAGE_KEYS.WELCOME_HIDDEN);

    if (storedUsers) setUsers(JSON.parse(storedUsers));
    if (storedNegotiations) setNegotiations(JSON.parse(storedNegotiations));
    if (storedSettings) setRegSettings(JSON.parse(storedSettings));
    if (welcomeHidden === 'true') setIsWelcomeVisible(false);
    
    if (storedCurrentUser) {
      const parsedUser = JSON.parse(storedCurrentUser);
      const verifiedUser = JSON.parse(storedUsers || '[]').find((u: Company) => u.cnpj === parsedUser.cnpj);
      if (verifiedUser) {
        setCurrentUser(verifiedUser);
        setView('dashboard');
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.COMPANIES, JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.NEGOTIATIONS, JSON.stringify(negotiations));
  }, [negotiations]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(regSettings));
  }, [regSettings]);

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
        formattedAmount: negotiation.amount === null ? 'Sem Negociação' : negotiation.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
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

  const handleRegister = (e: React.FormEvent<HTMLFormElement>) => {
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
    setUsers(prev => [...prev, newUser]);
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
        n.amount === null ? '0.00' : n.amount.toFixed(2),
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
    const amount = noNegAssociate ? null : parseCurrencyBRL(amountMask);

    if (!supplierCnpj) {
      alert('Por favor, selecione um fornecedor.');
      return;
    }

    if (!noNegAssociate && amount !== null && amount <= 0) {
      alert('Informe um valor de negociação válido ou selecione "Sem Negociação".');
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

    setNegotiations(prev => [...prev, newNeg]);
    setSelectedSupplierCnpj('');
    setAmountMask('');
    setNoNegAssociate(false);
    (e.target as HTMLFormElement).reset();

    if (regSettings.googleSheetsWebhookUrl) {
      syncToGoogleSheets(newNeg);
    }
  };

  const handleFillNegotiation = (cnpj: string) => {
    setSelectedSupplierCnpj(cnpj);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // FUNÇÕES DE EXCLUSÃO
  const handleAdminDeleteNegotiation = (id: string) => {
    if (window.confirm('Confirma a exclusão permanente deste registro de negociação?')) {
      setNegotiations(prev => {
        const filtered = prev.filter(n => n.id !== id);
        return [...filtered];
      });
    }
  };

  const handleAdminDeleteCompany = (cnpj: string) => {
    if (window.confirm('Atenção: A exclusão da empresa removerá também todos os seus lançamentos de negociação. Confirmar?')) {
      setUsers(prev => prev.filter(u => u.cnpj !== cnpj));
      setNegotiations(prev => prev.filter(n => n.companyCnpj !== cnpj && n.supplierCnpj !== cnpj));
    }
  };

  const handleAdminUpdateNegotiation = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingNegotiation) return;

    const amount = noNegAdminEdit ? null : parseCurrencyBRL(editAmountMask);
    const formData = new FormData(e.currentTarget);
    const notes = formData.get('notes') as string;

    setNegotiations(prev => prev.map(n => 
      n.id === editingNegotiation.id ? { ...n, amount, notes } : n
    ));
    setEditingNegotiation(null);
    setNoNegAdminEdit(false);
  };

  const handleAdminAddNegotiation = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const companyCnpj = formData.get('companyCnpj') as string;
    const supplierCnpj = formData.get('supplierCnpj') as string;
    const amount = noNegAdminAdd ? null : parseCurrencyBRL(addNegAmountMask);
    const notes = formData.get('notes') as string;

    if (!companyCnpj || !supplierCnpj || (!noNegAdminAdd && (amount === null || amount <= 0))) {
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

    setNegotiations(prev => [...prev, newNeg]);
    setIsAddingNegotiation(false);
    setAddNegAmountMask('');
    setNoNegAdminAdd(false);
    
    if (regSettings.googleSheetsWebhookUrl) {
      syncToGoogleSheets(newNeg);
    }
  };

  const handleAdminAddCompany = (e: React.FormEvent<HTMLFormElement>) => {
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
    setUsers(prev => [...prev, newCompany]);
    setIsAddingCompany(false);
    alert('Empresa adicionada com sucesso!');
  };

  const handleAdminUpdateCompany = (e: React.FormEvent<HTMLFormElement>) => {
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

    setUsers(prev => prev.map(u => u.cnpj === editingCompany.cnpj ? updatedCompany : u));
    setEditingCompany(null);
    alert('Dados da empresa atualizados com sucesso!');
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

  const adminSupplierStats = useMemo(() => {
    return suppliers.map(s => ({
      name: s.tradingName,
      value: negotiations.filter(n => n.supplierCnpj === s.cnpj).reduce((sum, n) => sum + (n.amount || 0), 0)
    })).filter(s => s.value > 0).sort((a, b) => b.value - a.value);
  }, [suppliers, negotiations]);

  const adminAssociateStats = useMemo(() => {
    return associates.map(a => ({
      name: a.tradingName,
      value: negotiations.filter(n => n.companyCnpj === a.cnpj).reduce((sum, n) => sum + (n.amount || 0), 0)
    })).filter(a => a.value > 0).sort((a, b) => b.value - a.value);
  }, [associates, negotiations]);

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
    let pendingList: Company[] = [];
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
    pendingList = partnerList.filter(p => !negotiatedPartnersCnpjs.has(p.cnpj));
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
      if (editingNegotiation.amount === null) {
        setNoNegAdminEdit(true);
        setEditAmountMask('');
      } else {
        setNoNegAdminEdit(false);
        setEditAmountMask(formatCurrencyBRL((editingNegotiation.amount * 100).toString()));
      }
    }
  }, [editingNegotiation]);

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
              {authError && <p className="text-red-500 text-sm">{authError}</p>}
              <Button type="submit" className="w-full">Entrar no Painel</Button>
              <Button variant="ghost" onClick={() => { setView('login'); setAuthError(''); }} className="w-full">Voltar ao Login</Button>
            </form>
          </div>
        </div>
      );
    }

    const totalNegotiatedAll = negotiations.reduce((acc, n) => acc + (n.amount || 0), 0);
    const validNegs = negotiations.filter(n => n.amount !== null);
    const avgNegotiationValue = validNegs.length > 0 ? totalNegotiatedAll / validNegs.length : 0;
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
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-tighter">Ticket Médio (Valores Ativos)</p>
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
                    <p className="text-xs text-slate-400 font-bold">Total de Associados na Base: <span className="text-[#b41e45]">{associates.length}</span></p>
                  </div>
                  <div className="h-[450px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={adminSupplierPositivationList} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={150} tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                        <Tooltip 
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-white p-3 shadow-xl rounded-lg border border-slate-100 text-xs">
                                  <p className="font-bold text-slate-800 mb-1">{data.name}</p>
                                  <p className="text-[#b41e45]">Associados Atendidos: {data.negociados}</p>
                                  <p className="text-slate-400">Faltam: {data.faltantes}</p>
                                  <p className="mt-1 border-t pt-1 font-bold">Base Total: {data.totalBase}</p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
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
                    <p className="text-xs text-slate-400 font-bold">Total de Fornecedores na Base: <span className="text-blue-600">{suppliers.length}</span></p>
                  </div>
                  <div className="h-[450px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={adminAssociatePositivationList} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={150} tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                        <Tooltip 
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-white p-3 shadow-xl rounded-lg border border-slate-100 text-xs">
                                  <p className="font-bold text-slate-800 mb-1">{data.name}</p>
                                  <p className="text-blue-600">Fornecedores Atendidos: {data.negociados}</p>
                                  <p className="text-slate-400">Faltam: {data.faltantes}</p>
                                  <p className="mt-1 border-t pt-1 font-bold">Base Total: {data.totalBase}</p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
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
                      <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">Gestão detalhada de lançamentos</p>
                    </div>
                    <button onClick={() => { setIsAddingNegotiation(true); setNoNegAdminAdd(false); }} className="px-4 py-1.5 rounded-full bg-blue-50 text-blue-600 text-xs font-bold hover:bg-blue-100 transition-colors uppercase font-bai">adicionar</button>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <select 
                      value={adminNegFilterRole}
                      onChange={(e) => setAdminNegFilterRole(e.target.value as UserRole | 'all')}
                      className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#b41e45] bg-slate-50"
                    >
                      <option value="all">Filtrar: Todos</option>
                      <option value="associate">Apenas Associados</option>
                      <option value="supplier">Apenas Fornecedores</option>
                    </select>
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
                         <th className="px-6 py-4 border-b">Data/Hora</th>
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
                             <td className="px-6 py-4 font-bold text-[#b41e45]">
                               {n.amount === null ? <span className="text-slate-400 italic font-normal">Sem Negociação</span> : n.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                             </td>
                             <td className="px-6 py-4 text-slate-400 text-xs">{new Date(n.timestamp).toLocaleString('pt-BR')}</td>
                             <td className="px-6 py-4 text-right space-x-3">
                               <button onClick={() => setEditingNegotiation(n)} className="text-blue-600 font-bold text-[10px] uppercase tracking-wider hover:underline">Editar</button>
                               <button onClick={() => handleAdminDeleteNegotiation(n.id)} className="text-red-500 font-bold text-[10px] uppercase tracking-wider hover:underline">Excluir</button>
                             </td>
                           </tr>
                         );
                       })}
                       {filteredNegotiations.length === 0 && (
                         <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">Nenhum registro encontrado para este filtro.</td></tr>
                       )}
                     </tbody>
                   </table>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div>
                      <h3 className="text-xl font-bold text-slate-700 font-bai">Empresas Participantes</h3>
                      <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">Base de dados cadastrada</p>
                    </div>
                    <button onClick={() => setIsAddingCompany(true)} className="px-4 py-1.5 rounded-full bg-emerald-50 text-emerald-600 text-xs font-bold hover:bg-emerald-100 transition-colors uppercase font-bai">adicionar</button>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <select 
                      value={adminFilterRole}
                      onChange={(e) => setAdminFilterRole(e.target.value as UserRole | 'all')}
                      className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#b41e45] bg-slate-50"
                    >
                      <option value="all">Todos os Perfis</option>
                      <option value="associate">Associados</option>
                      <option value="supplier">Fornecedores</option>
                    </select>
                    <input 
                      type="text"
                      placeholder="Buscar empresa..."
                      value={adminSearchTerm}
                      onChange={(e) => setAdminSearchTerm(e.target.value)}
                      className="px-4 py-1.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#b41e45] w-full md:w-64 bg-slate-50"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                      <tr>
                        <th className="px-6 py-4">Empresa</th>
                        <th className="px-6 py-4">CNPJ</th>
                        <th className="px-6 py-4">Perfil</th>
                        <th className="px-6 py-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {filteredUsers.map(u => (
                        <tr key={u.cnpj} className="hover:bg-slate-50">
                          <td className="px-6 py-4 font-bold text-slate-800">{u.tradingName}</td>
                          <td className="px-6 py-4 text-slate-500 text-xs font-mono">{u.cnpj}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${u.role === 'associate' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
                              {u.role === 'associate' ? 'Associado' : 'Fornecedor'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right space-x-3">
                            <button onClick={() => setEditingCompany(u)} className="text-blue-600 text-[10px] font-bold uppercase tracking-wider hover:underline">Editar</button>
                            <button onClick={() => setSelectedCompanySummary(u)} className="text-[#b41e45] text-[10px] font-bold uppercase tracking-wider hover:underline">Ver Stats</button>
                            <button onClick={() => handleAdminDeleteCompany(u.cnpj)} className="text-red-500 text-[10px] font-bold uppercase tracking-wider hover:underline">Excluir</button>
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in duration-500">
              <div className="space-y-8">
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                  <div className="flex items-start justify-between mb-6">
                    <h3 className="text-xl font-bold text-slate-700 font-bai">Controle de Status</h3>
                    <div className="flex gap-4">
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Associados</p>
                        <p className="text-lg font-bold text-[#b41e45] leading-none">{assocCount}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Fornecedores</p>
                        <p className="text-lg font-bold text-[#b41e45] leading-none">{suppCount}</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-6">
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                      <p className="font-bold text-slate-800 text-sm">Inscrição: Associados</p>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={regSettings.allowAssociate} onChange={(e) => setRegSettings({...regSettings, allowAssociate: e.target.checked})} className="sr-only peer" />
                        <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:bg-[#b41e45] peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                      </label>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                      <p className="font-bold text-slate-800 text-sm">Inscrição: Fornecedores</p>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={regSettings.allowSupplier} onChange={(e) => setRegSettings({...regSettings, allowSupplier: e.target.checked})} className="sr-only peer" />
                        <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:bg-[#b41e45] peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                      </label>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-white border-2 border-slate-100 rounded-xl shadow-sm">
                      <p className="font-bold text-[#b41e45] text-sm">Lançamento de Negociações</p>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={regSettings.allowNegotiations} onChange={(e) => setRegSettings({...regSettings, allowNegotiations: e.target.checked})} className="sr-only peer" />
                        <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:bg-[#b41e45] peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                  <h3 className="text-xl font-bold text-slate-700 mb-6 font-bai uppercase tracking-wide">Exportar Dados Offline</h3>
                  <div className="space-y-4">
                    <p className="text-sm text-slate-500">Baixe o backup completo de todas as negociações em formato CSV para análise no Excel.</p>
                    <Button onClick={exportToCSV} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg py-4">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                      Baixar Planilha CSV
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-8">
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                  <h3 className="text-xl font-bold text-slate-700 mb-2 font-bai uppercase tracking-wide">Integração Google Sheets</h3>
                  <p className="text-sm text-slate-500 mb-6">Os lançamentos de negociações serão espelhados automaticamente em sua planilha via Webhook.</p>
                  
                  <div className="space-y-4">
                    <Input 
                      label="URL do Apps Script (Webhook)" 
                      name="webhookUrl" 
                      value={regSettings.googleSheetsWebhookUrl || ''} 
                      onChange={(e) => setRegSettings({...regSettings, googleSheetsWebhookUrl: e.target.value})}
                      placeholder="https://script.google.com/macros/s/.../exec"
                    />
                    
                    <div className="pt-2">
                      <button 
                        onClick={() => setShowWebhookInstructions(!showWebhookInstructions)}
                        className="text-xs font-bold text-[#b41e45] uppercase tracking-widest hover:underline flex items-center gap-1"
                      >
                        {showWebhookInstructions ? 'Esconder Configuração' : 'Como configurar a planilha?'}
                        <svg className={`w-3 h-3 transition-transform ${showWebhookInstructions ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                      </button>
                    </div>

                    {showWebhookInstructions && (
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="text-xs text-slate-600 space-y-2">
                          <p><strong>Passo 1:</strong> No Google Sheets, vá em Extensões e Apps Script.</p>
                          <p><strong>Passo 2:</strong> Cole o código abaixo, salve e clique em Implantar depois Nova Implantação.</p>
                          <p><strong>Passo 3:</strong> Escolha "App da Web" e configure para que "Qualquer Pessoa" tenha acesso.</p>
                        </div>
                        <div className="relative group">
                          <pre className="text-[10px] bg-slate-900 text-emerald-400 p-3 rounded-lg overflow-x-auto font-mono">
                            {googleScriptTemplate}
                          </pre>
                          <button 
                            onClick={() => {
                              navigator.clipboard.writeText(googleScriptTemplate);
                              alert('Código copiado!');
                            }}
                            className="absolute top-2 right-2 bg-white/10 hover:bg-white/20 text-white p-1.5 rounded-md transition-colors"
                          >
                            Copiar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

        </main>

        {/* MODAIS ADMIN */}
        {isAddingCompany && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
              <h3 className="text-xl font-bold mb-6 font-bai">Cadastrar Empresa</h3>
              <form onSubmit={handleAdminAddCompany} className="space-y-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-slate-700">Tipo de Perfil</label>
                  <select name="role" className="px-4 py-2 border border-slate-200 rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-[#b41e45]" required>
                    <option value="">Selecione...</option>
                    <option value="associate">Associado (Comprador)</option>
                    <option value="supplier">Fornecedor (Vendedor)</option>
                  </select>
                </div>
                <Input label="CNPJ" name="cnpj" placeholder="00.000.000/0000-00" required />
                <Input label="Nome Fantasia" name="tradingName" onInput={(e) => (e.currentTarget.value = e.currentTarget.value.toUpperCase())} required />
                <Input label="Senha Provisória" name="password" type="text" defaultValue="123456" required />
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
            <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
              <h3 className="text-xl font-bold mb-6 font-bai">Novo Lançamento Manual</h3>
              <form onSubmit={handleAdminAddNegotiation} className="space-y-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-slate-700">Associado</label>
                  <select name="companyCnpj" className="px-4 py-2 border border-slate-200 rounded-lg bg-slate-50 outline-none" required>
                    <option value="">Selecione...</option>
                    {associates.map(a => <option key={a.cnpj} value={a.cnpj}>{a.tradingName}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-slate-700">Fornecedor</label>
                  <select name="supplierCnpj" className="px-4 py-2 border border-slate-200 rounded-lg bg-slate-50 outline-none" required>
                    <option value="">Selecione...</option>
                    {suppliers.map(s => <option key={s.cnpj} value={s.cnpj}>{s.tradingName}</option>)}
                  </select>
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      id="noNegAdminAdd" 
                      checked={noNegAdminAdd} 
                      onChange={(e) => {
                        setNoNegAdminAdd(e.target.checked);
                        if (e.target.checked) setAddNegAmountMask('');
                      }} 
                      className="w-4 h-4 accent-[#b41e45]"
                    />
                    <label htmlFor="noNegAdminAdd" className="text-sm font-semibold text-slate-700 cursor-pointer">Conversa realizada, mas Sem Negociação</label>
                  </div>
                  <Input 
                    label="Valor" 
                    name="amount" 
                    value={addNegAmountMask} 
                    onChange={handleAddNegAmountChange} 
                    placeholder="R$ 0,00" 
                    required={!noNegAdminAdd} 
                    disabled={noNegAdminAdd}
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <Button type="submit" className="flex-1">Lançar</Button>
                  <Button variant="ghost" onClick={() => { setIsAddingNegotiation(false); setAddNegAmountMask(''); setNoNegAdminAdd(false); }} className="flex-1">Voltar</Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {selectedCompanySummary && (() => {
          const stats = getCompanySummaryData(selectedCompanySummary);
          return (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl relative overflow-hidden">
                <div className="mb-8">
                  <h3 className="text-2xl font-bold text-slate-800 font-bai">{selectedCompanySummary.tradingName}</h3>
                  <p className="text-slate-500 text-sm font-mono">{selectedCompanySummary.cnpj}</p>
                </div>
                <div className="grid grid-cols-1 gap-4 mb-8">
                  <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-xs text-slate-400 font-bold uppercase mb-1">Empresas Positivadas</p>
                    <p className="text-2xl font-bold text-slate-800 font-bai">{stats.uniquePartners} de {stats.totalPotentialPartners}</p>
                  </div>
                  <div className="p-6 bg-[#b41e45] rounded-2xl text-white">
                    <p className="text-xs text-white/70 font-bold uppercase mb-1">Valor Total Movimentado</p>
                    <p className="text-3xl font-bold font-bai">{stats.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                  </div>
                </div>
                <Button className="w-full" onClick={() => setSelectedCompanySummary(null)}>Fechar</Button>
              </div>
            </div>
          );
        })()}

        {editingNegotiation && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
              <h3 className="text-xl font-bold mb-6 font-bai">Corrigir Valor</h3>
              <form onSubmit={handleAdminUpdateNegotiation} className="space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      id="noNegAdminEdit" 
                      checked={noNegAdminEdit} 
                      onChange={(e) => {
                        setNoNegAdminEdit(e.target.checked);
                        if (e.target.checked) setEditAmountMask('');
                      }} 
                      className="w-4 h-4 accent-[#b41e45]"
                    />
                    <label htmlFor="noNegAdminEdit" className="text-sm font-semibold text-slate-700 cursor-pointer">Sem Negociação</label>
                  </div>
                  <Input 
                    label="Valor Final" 
                    name="amount" 
                    value={editAmountMask} 
                    onChange={handleEditAmountChange} 
                    placeholder="R$ 0,00" 
                    required={!noNegAdminEdit} 
                    disabled={noNegAdminEdit}
                  />
                </div>
                <div className="flex gap-4">
                  <Button type="submit" className="flex-1">Salvar</Button>
                  <Button variant="ghost" onClick={() => { setEditingNegotiation(null); setNoNegAdminEdit(false); }} className="flex-1">Cancelar</Button>
                </div>
              </form>
            </div>
          </div>
        )}

        <footer className="bg-slate-900 text-slate-500 py-12 mt-16 text-center text-sm">
          <Logo className="brightness-0 invert opacity-60 mb-4 mx-auto" />
          <p>© {currentYear} Área Central S.A. | Conectando Redes de Negócios</p>
        </footer>
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
        <footer className="bg-slate-900 text-slate-500 py-12 text-center text-sm">
          <Logo className="brightness-0 invert opacity-60 mb-4 mx-auto" />
          <p>© {currentYear} Área Central S.A. | Conectando Redes de Negócios</p>
        </footer>
      </div>
    );
  }

  // REGISTER VIEW
  if (view === 'register') {
    const isAnythingAllowed = regSettings.allowAssociate || regSettings.allowSupplier;
    return (
      <div className="min-h-screen flex flex-col justify-between bg-slate-50">
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-100">
            <div className="flex justify-center mb-8"><Logo /></div>
            <h1 className="text-2xl font-bold text-slate-800 mb-6 text-center font-bai">Inscrição na Rodada</h1>
            {isAnythingAllowed ? (
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-slate-700">Tipo de Empresa <span className="text-red-500">*</span></label>
                  <select name="role" className="px-4 py-2 border border-slate-200 rounded-lg bg-slate-50 outline-none font-bai" required>
                    <option value="">Selecione...</option>
                    {regSettings.allowAssociate && <option value="associate">Associado (Comprador)</option>}
                    {regSettings.allowSupplier && <option value="supplier">Fornecedor (Vendedor)</option>}
                  </select>
                </div>
                <Input label="CNPJ" name="cnpj" placeholder="Apenas números" required />
                <Input label="Nome Fantasia" name="tradingName" onInput={(e) => (e.currentTarget.value = e.currentTarget.value.toUpperCase())} required />
                <Input label="E-mail de Contato" name="email" type="email" required />
                <Input label="Crie uma Senha" name="password" type="password" required />
                <Button type="submit" className="w-full font-bai">Confirmar Inscrição</Button>
                <Button variant="ghost" type="button" className="w-full font-bai" onClick={() => setView('login')}>Voltar</Button>
              </form>
            ) : (
              <div className="text-center py-12">
                <p className="text-slate-400 italic">As inscrições online estão encerradas no momento.</p>
                <Button variant="ghost" onClick={() => setView('login')} className="mt-4 mx-auto">Voltar</Button>
              </div>
            )}
          </div>
        </div>
        <footer className="bg-slate-900 text-slate-500 py-12 text-center text-sm">
          <Logo className="brightness-0 invert opacity-60 mb-4 mx-auto" />
          <p>© {currentYear} Área Central S.A. | Conectando Redes de Negócios</p>
        </footer>
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
          <section className="bg-gradient-to-br from-[#b41e45] to-[#8a1435] rounded-2xl p-6 lg:p-10 text-white shadow-lg relative overflow-hidden group">
            <button onClick={handleDismissWelcome} className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors z-20">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <div className="relative z-10">
              <h2 className="text-3xl font-bold mb-2 font-bai">Olá, {currentUser?.tradingName}</h2>
              <p className="text-white/80 max-w-2xl font-bai tracking-tight">Este é seu painel de acompanhamento em tempo real da rodada.</p>
              {insight && <p className="mt-6 text-sm italic bg-white/10 p-4 rounded-xl border border-white/20 inline-block">"{insight}"</p>}
            </div>
            <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-white/5 rounded-full blur-3xl"></div>
          </section>
        )}

        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <p className="text-slate-500 text-[10px] font-bold uppercase mb-1 tracking-widest">Volume Acumulado</p>
            <h3 className="text-2xl font-bold text-slate-900 font-bai">{dashboardStats.totalAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</h3>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <p className="text-slate-500 text-[10px] font-bold uppercase mb-1 tracking-widest">{dashboardStats.counterLabel}</p>
            <h3 className="text-2xl font-bold text-slate-900 font-bai">{dashboardStats.counterValue}</h3>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <p className="text-slate-500 text-[10px] font-bold uppercase mb-1 tracking-widest">A Negociar</p>
            <h3 className="text-2xl font-bold text-slate-900 font-bai">{dashboardStats.pendingList.length}</h3>
          </div>
        </section>

        <div className={currentUser?.role === 'associate' ? "grid grid-cols-1 lg:grid-cols-2 gap-8" : "w-full"}>
          {currentUser?.role === 'associate' && (
            <div ref={formRef} className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm scroll-mt-24">
              <h3 className="text-xl font-bold text-slate-800 mb-6 font-bai">Lançar Negociação</h3>
              {regSettings.allowNegotiations ? (
                <form onSubmit={handleAddNegotiation} className="space-y-6">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-semibold text-slate-700">Selecione o Fornecedor <span className="text-red-500">*</span></label>
                    <select 
                      name="supplierCnpj" 
                      value={selectedSupplierCnpj}
                      onChange={(e) => setSelectedSupplierCnpj(e.target.value)}
                      className="px-4 py-2 border border-slate-200 rounded-lg outline-none bg-slate-50 font-bai" 
                      required
                    >
                      <option value="">Selecione na lista...</option>
                      {dashboardStats.pendingList.map(s => <option key={s.cnpj} value={s.cnpj}>{s.tradingName}</option>)}
                      {!dashboardStats.pendingList.find(s => s.cnpj === selectedSupplierCnpj) && selectedSupplierCnpj !== '' && (
                        <option value={selectedSupplierCnpj}>{users.find(u => u.cnpj === selectedSupplierCnpj)?.tradingName}</option>
                      )}
                    </select>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <input 
                        type="checkbox" 
                        id="noNegAssociate" 
                        checked={noNegAssociate} 
                        onChange={(e) => {
                          setNoNegAssociate(e.target.checked);
                          if (e.target.checked) setAmountMask('');
                        }} 
                        className="w-4 h-4 accent-[#b41e45]"
                      />
                      <label htmlFor="noNegAssociate" className="text-sm font-semibold text-slate-700 cursor-pointer">Conversa realizada, mas Sem Negociação</label>
                    </div>
                    <Input 
                      label="Valor Negociado" 
                      name="amount" 
                      value={amountMask}
                      onChange={handleAmountChange}
                      placeholder="R$ 0,00"
                      required={!noNegAssociate}
                      disabled={noNegAssociate}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-semibold text-slate-700">Observações (Opcional)</label>
                    <textarea name="notes" className="px-4 py-2 border border-slate-200 rounded-lg outline-none h-24 bg-slate-50 focus:ring-2 focus:ring-[#b41e45] transition-all" />
                  </div>
                  <Button type="submit" className="w-full font-bai py-4">Salvar Registro</Button>
                </form>
              ) : (
                <div className="text-center py-12 text-slate-400 italic font-bai">Os lançamentos de negociações estão temporariamente bloqueados pela organização.</div>
              )}
            </div>
          )}

          <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm flex flex-col w-full">
            <h3 className="text-xl font-bold text-slate-800 mb-6 font-bai">Desempenho por Empresa</h3>
            <div className="w-full min-h-[350px]">
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={dashboardStats.chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="name" 
                    interval={0} 
                    angle={-20} 
                    textAnchor="end" 
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    height={80}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#94a3b8', fontSize: 12 }} 
                    tickFormatter={(val) => `R$ ${(val/1000).toFixed(0)}k`}
                  />
                  <Tooltip 
                    formatter={(value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
                  />
                  <Bar dataKey="total" fill="#b41e45" radius={[4, 4, 0, 0]}>
                    <LabelList 
                      dataKey="total" 
                      position="top" 
                      formatter={(val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
                      style={{ fontSize: '10px', fill: '#b41e45', fontWeight: 'bold' }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {dashboardStats.chartData.length === 0 && <p className="text-center text-slate-400 mt-20 italic font-bai">Realize a primeira negociação para ver os dados aqui.</p>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-slate-800 px-2 font-bai">Empresas Ainda Não Negociadas</h3>
            <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
              <ul className="divide-y divide-slate-100">
                {dashboardStats.pendingList.map(p => (
                  <li key={p.cnpj} className="p-5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div>
                      <p className="font-bold text-slate-800">{p.tradingName}</p>
                      <p className="text-xs text-slate-400 font-mono">{p.cnpj}</p>
                    </div>
                    {currentUser?.role === 'associate' && (
                      <button onClick={() => handleFillNegotiation(p.cnpj)} className="text-[10px] font-bold bg-[#b41e45]/10 px-4 py-2 rounded-full text-[#b41e45] uppercase tracking-widest hover:bg-[#b41e45] hover:text-white transition-all font-bai">Negociar</button>
                    )}
                  </li>
                ))}
                {dashboardStats.pendingList.length === 0 && <li className="p-10 text-center text-slate-400 italic font-bai">Todas as empresas parceiras foram positivadas! Parabéns.</li>}
              </ul>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-bold text-slate-800 px-2 font-bai">Histórico da Rodada</h3>
            <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
              <ul className="divide-y divide-slate-100">
                {dashboardStats.historyList.map(h => {
                  const partner = users.find(u => u.cnpj === (currentUser?.role === 'associate' ? h.supplierCnpj : h.companyCnpj));
                  return (
                    <li key={h.id} className="p-5 flex flex-col gap-2 hover:bg-slate-50 transition-colors">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-bold text-slate-800">{partner?.tradingName}</p>
                          <p className="text-xs text-slate-400">{new Date(h.timestamp).toLocaleString('pt-BR')}</p>
                        </div>
                        <span className="font-bold text-[#b41e45] font-bai">
                          {h.amount === null ? <span className="text-slate-400 italic font-normal text-xs">Sem Negociação</span> : h.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      </div>
                    </li>
                  );
                })}
                {dashboardStats.historyList.length === 0 && <li className="p-10 text-center text-slate-400 italic font-bai">Nenhum registro encontrado.</li>}
              </ul>
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-slate-900 text-slate-500 py-16 mt-16 text-center text-sm">
        <Logo className="brightness-0 invert opacity-60 mb-6 mx-auto" />
        <p className="font-bai tracking-wide mb-2 uppercase text-[10px]">Rede de Conexões Estratégicas</p>
        <p>© {currentYear} Área Central S.A. | Todos os direitos reservados</p>
      </footer>
    </div>
  );
};

export default App;
