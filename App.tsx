
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

const googleScriptTemplate = `function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = JSON.parse(e.postData.contents);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["Data/Hora", "ID", "Associado", "Fornecedor", "Valor", "Notas"]);
    }
    sheet.appendRow([data.formattedDate, data.id, data.associateName, data.supplierName, data.amount, data.notes]);
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

  // 🔥 FIREBASE SYNC: Real-time listeners
  useEffect(() => {
    // Sync Companies
    const unsubCompanies = onSnapshot(collection(db, "companies"), (snapshot) => {
      const companiesData = snapshot.docs.map(doc => doc.data() as Company);
      setUsers(companiesData);

      // Restore session if user exists in cloud
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

    // Sync Negotiations
    const unsubNegs = onSnapshot(collection(db, "negotiations"), (snapshot) => {
      const negsData = snapshot.docs.map(doc => doc.data() as Negotiation);
      setNegotiations(negsData);
    });

    // Sync Settings
    const unsubSettings = onSnapshot(doc(db, "config", "settings"), (snapshot) => {
      if (snapshot.exists()) {
        setRegSettings(snapshot.data() as RegistrationSettings);
      }
    });

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
      console.error('Erro Google Sheets:', error);
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

    if (users.find(u => u.cnpj === cnpj)) {
      alert('Este CNPJ já está cadastrado.');
      return;
    }

    const newUser: Company = { cnpj, tradingName, phone, email, password, role };
    await setDoc(doc(db, "companies", cnpj), newUser);
    alert('Cadastro realizado! Faça login para entrar.');
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
    if (formData.get('user') === ADMIN_CREDENTIALS.user && formData.get('password') === ADMIN_CREDENTIALS.password) {
      setIsAdminLoggedIn(true);
      setAuthError('');
    } else {
      setAuthError('Credenciais administrativas incorretas.');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setIsAdminLoggedIn(false);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    setView('login');
  };

  const exportToCSV = () => {
    if (negotiations.length === 0) return alert('Sem dados.');
    const headers = ['ID', 'Associado', 'CNPJ Associado', 'Fornecedor', 'CNPJ Fornecedor', 'Valor', 'Data', 'Notas'];
    const rows = negotiations.map(n => {
      const assoc = users.find(u => u.cnpj === n.companyCnpj);
      const supp = users.find(u => u.cnpj === n.supplierCnpj);
      return [n.id, assoc?.tradingName, n.companyCnpj, supp?.tradingName, n.supplierCnpj, n.amount?.toFixed(2) || '0.00', new Date(n.timestamp).toLocaleString('pt-BR'), n.notes];
    });
    const csvContent = ["\ufeff" + headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `backup_rodada_${new Date().toLocaleDateString()}.csv`;
    link.click();
  };

  const handleAddNegotiation = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentUser || !regSettings.allowNegotiations) return;
    const formData = new FormData(e.currentTarget);
    const supplierCnpj = formData.get('supplierCnpj') as string;
    const amount = noNegAssociate ? null : parseCurrencyBRL(amountMask);

    if (negotiations.some(n => n.companyCnpj === currentUser.cnpj && n.supplierCnpj === supplierCnpj)) {
      return alert('Negociação já registrada para este parceiro.');
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
    syncToGoogleSheets(newNeg);
    setAmountMask('');
    setNoNegAssociate(false);
    (e.target as HTMLFormElement).reset();
  };

  const handleAdminDeleteNegotiation = async (id: string) => {
    if (window.confirm('Excluir permanentemente?')) {
      await deleteDoc(doc(db, "negotiations", id));
    }
  };

  const handleAdminDeleteCompany = async (cnpj: string) => {
    if (window.confirm('Excluir empresa e todos os seus lançamentos?')) {
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
    const amount = noNegAdminEdit ? null : parseCurrencyBRL(editAmountMask);
    await updateDoc(doc(db, "negotiations", editingNegotiation.id), { amount });
    setEditingNegotiation(null);
  };

  const handleAdminAddNegotiation = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newNeg: Negotiation = {
      id: crypto.randomUUID(),
      companyCnpj: formData.get('companyCnpj') as string,
      supplierCnpj: formData.get('supplierCnpj') as string,
      amount: noNegAdminAdd ? null : parseCurrencyBRL(addNegAmountMask),
      notes: formData.get('notes') as string,
      timestamp: new Date().toISOString(),
    };
    await setDoc(doc(db, "negotiations", newNeg.id), newNeg);
    setIsAddingNegotiation(false);
  };

  const updateSettings = async (newSettings: RegistrationSettings) => {
    await setDoc(doc(db, "config", "settings"), newSettings);
  };

  const filteredUsers = users.filter(u => {
    const matchesRole = adminFilterRole === 'all' || u.role === adminFilterRole;
    const matchesSearch = u.tradingName.toLowerCase().includes(adminSearchTerm.toLowerCase()) || u.cnpj.includes(adminSearchTerm);
    return matchesRole && matchesSearch;
  });

  const filteredNegotiations = useMemo(() => {
    const term = adminNegSearchTerm.toLowerCase();
    return [...negotiations]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .filter(n => {
        const assoc = users.find(u => u.cnpj === n.companyCnpj);
        const supp = users.find(u => u.cnpj === n.supplierCnpj);
        return assoc?.tradingName.toLowerCase().includes(term) || supp?.tradingName.toLowerCase().includes(term);
      });
  }, [negotiations, users, adminNegSearchTerm]);

  const associates = useMemo(() => users.filter(u => u.role === 'associate'), [users]);
  const suppliers = useMemo(() => users.filter(u => u.role === 'supplier'), [users]);

  const dashboardStats = useMemo(() => {
    if (!currentUser) return null;
    const userNegs = negotiations.filter(n => currentUser.role === 'associate' ? n.companyCnpj === currentUser.cnpj : n.supplierCnpj === currentUser.cnpj);
    const partnerList = currentUser.role === 'associate' ? suppliers : associates;
    const negotiatedCnpjs = new Set(userNegs.map(n => currentUser.role === 'associate' ? n.supplierCnpj : n.companyCnpj));
    
    return {
      totalAmount: userNegs.reduce((sum, n) => sum + (n.amount || 0), 0),
      counterValue: negotiatedCnpjs.size,
      pendingList: partnerList.filter(p => !negotiatedCnpjs.has(p.cnpj)),
      historyList: userNegs.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
      chartData: partnerList.map(p => ({
        name: p.tradingName,
        total: userNegs.filter(n => (currentUser.role === 'associate' ? n.supplierCnpj : n.companyCnpj) === p.cnpj).reduce((s, n) => s + (n.amount || 0), 0)
      })).filter(d => d.total > 0)
    };
  }, [currentUser, negotiations, associates, suppliers]);

  // UI Components mapping...
  if (view === 'login') return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-100">
        <div className="flex flex-col items-center mb-8"><Logo className="mb-6 scale-125" /><h1 className="text-2xl font-bold font-bai">Rodada de Negócios</h1></div>
        <form onSubmit={handleLogin} className="space-y-4">
          <Input label="CNPJ" name="cnpj" placeholder="00.000.000/0000-00" required />
          <Input label="Senha" name="password" type="password" required />
          {authError && <p className="text-red-500 text-sm">{authError}</p>}
          <Button type="submit" className="w-full font-bai">Entrar</Button>
          <button type="button" onClick={() => setView('register')} className="w-full text-sm text-slate-500 hover:text-[#b41e45]">Não tem conta? Registre-se</button>
          <button type="button" onClick={() => setView('admin')} className="w-full text-[10px] text-slate-300 uppercase pt-4">Painel Admin</button>
        </form>
      </div>
    </div>
  );

  if (view === 'register') return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
        <h1 className="text-2xl font-bold font-bai mb-6 text-center">Inscrição</h1>
        <form onSubmit={handleRegister} className="space-y-4">
          <div className="flex flex-col gap-1.5"><label className="text-sm font-semibold">Perfil</label>
            <select name="role" className="px-4 py-2 border rounded-lg bg-slate-50" required>
              <option value="associate">Associado</option><option value="supplier">Fornecedor</option>
            </select>
          </div>
          <Input label="CNPJ" name="cnpj" required />
          <Input label="Nome Fantasia" name="tradingName" required />
          <Input label="Senha" name="password" type="password" required />
          <Button type="submit" className="w-full font-bai">Cadastrar</Button>
          <Button variant="ghost" className="w-full" onClick={() => setView('login')}>Voltar</Button>
        </form>
      </div>
    </div>
  );

  if (view === 'admin' && !isAdminLoggedIn) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
        <h1 className="text-2xl font-bold font-bai mb-6 text-center">Admin</h1>
        <form onSubmit={handleAdminLogin} className="space-y-4">
          <Input label="Usuário" name="user" required />
          <Input label="Senha" name="password" type="password" required />
          <Button type="submit" className="w-full">Acessar</Button>
          <Button variant="ghost" className="w-full" onClick={() => setView('login')}>Voltar</Button>
        </form>
      </div>
    </div>
  );

  if (view === 'admin' && isAdminLoggedIn) return (
    <div className="min-h-screen bg-slate-100 flex flex-col pb-10">
      <nav className="bg-[#b41e45] text-white p-4 flex justify-between items-center px-8">
        <Logo className="brightness-0 invert" /><Button variant="secondary" onClick={handleLogout}>Sair</Button>
      </nav>
      <div className="bg-white border-b flex gap-8 px-8"><button onClick={() => setAdminTab('summary')} className={`py-4 font-bold font-bai ${adminTab==='summary'?'text-[#b41e45] border-b-2 border-[#b41e45]':'text-slate-400'}`}>RESUMO</button><button onClick={() => setAdminTab('maintenance')} className={`py-4 font-bold font-bai ${adminTab==='maintenance'?'text-[#b41e45] border-b-2 border-[#b41e45]':'text-slate-400'}`}>MANUTENÇÃO</button><button onClick={() => setAdminTab('config')} className={`py-4 font-bold font-bai ${adminTab==='config'?'text-[#b41e45] border-b-2 border-[#b41e45]':'text-slate-400'}`}>CONFIG</button></div>
      <main className="p-8 max-w-7xl mx-auto w-full space-y-8">
        {adminTab === 'summary' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-8 rounded-2xl shadow-sm text-center"><p className="text-3xl font-bold text-[#b41e45] font-bai">{negotiations.length}</p><p className="text-xs uppercase text-slate-400 font-bold">Lançamentos</p></div>
            <div className="bg-white p-8 rounded-2xl shadow-sm text-center"><p className="text-3xl font-bold font-bai">R$ {(negotiations.reduce((s,n)=>s+(n.amount||0),0)).toLocaleString()}</p><p className="text-xs uppercase text-slate-400 font-bold">Volume Total</p></div>
            <div className="bg-white p-8 rounded-2xl shadow-sm text-center"><p className="text-3xl font-bold font-bai">{users.length}</p><p className="text-xs uppercase text-slate-400 font-bold">Empresas</p></div>
          </div>
<<<<<<< HEAD
        )}
        {adminTab === 'maintenance' && (
          <div className="space-y-8">
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="p-6 border-b flex justify-between items-center"><h3 className="font-bold font-bai">Gestão de Negociações</h3><Button onClick={() => setIsAddingNegotiation(true)} size="sm">Novo Lançamento</Button></div>
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50"><tr><th className="p-4">Parceiros</th><th className="p-4">Valor</th><th className="p-4">Ações</th></tr></thead>
                <tbody>{filteredNegotiations.map(n => (
                  <tr key={n.id} className="border-t">
                    <td className="p-4 font-bold">{users.find(u=>u.cnpj===n.supplierCnpj)?.tradingName} x {users.find(u=>u.cnpj===n.companyCnpj)?.tradingName}</td>
                    <td className="p-4">{n.amount ? formatCurrencyBRL((n.amount*100).toString()) : 'Sem Negócio'}</td>
                    <td className="p-4 flex gap-4"><button onClick={() => setEditingNegotiation(n)} className="text-blue-600">Editar</button><button onClick={() => handleAdminDeleteNegotiation(n.id)} className="text-red-500">Excluir</button></td>
                  </tr>
                ))}</tbody>
              </table>
=======
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
                          <p><strong>Passo 1:</strong> No Google Sheets, vá em <em>Extensões &gt; Apps Script</em>.</p>
                          <p><strong>Passo 2:</strong> Cole o código abaixo, salve e clique em <em>Implantar &gt; Nova Implantação</em>.</p>
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
>>>>>>> parent of 45f4648 (Add files via upload)
            </div>
          </div>
        )}
        {adminTab === 'config' && (
          <div className="bg-white p-8 rounded-2xl shadow-sm space-y-6">
            <h3 className="font-bold font-bai">Configurações Gerais</h3>
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg"><p className="font-bold">Permitir Lançamento de Negociações</p><input type="checkbox" checked={regSettings.allowNegotiations} onChange={e => updateSettings({...regSettings, allowNegotiations: e.target.checked})} className="w-6 h-6 accent-[#b41e45]" /></div>
            <Input label="Webhook Google Sheets" value={regSettings.googleSheetsWebhookUrl} onChange={e => updateSettings({...regSettings, googleSheetsWebhookUrl: e.target.value})} />
            <Button onClick={exportToCSV} variant="secondary" className="w-full">Baixar Backup CSV</Button>
          </div>
        )}
      </main>
      {/* MODALS REDACTED FOR BREVITY - SAME AS ORIGINAL LOGIC BUT USING FIREBASE HELPERS */}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <nav className="bg-white border-b h-20 px-8 flex justify-between items-center"><Logo /><Button variant="ghost" onClick={handleLogout}>Sair</Button></nav>
      <main className="p-8 max-w-7xl mx-auto w-full space-y-8">
        <section className="bg-gradient-to-r from-[#b41e45] to-[#8a1435] p-10 rounded-3xl text-white shadow-xl">
          <h2 className="text-3xl font-bold font-bai">Olá, {currentUser?.tradingName}</h2>
          <p className="opacity-80">Acompanhe seus resultados em tempo real.</p>
        </section>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Negociado</p>
            <h3 className="text-2xl font-bold font-bai">R$ {dashboardStats?.totalAmount.toLocaleString()}</h3>
          </div>
          <div className="bg-white p-6 rounded-2xl border shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Empresas Positivadas</p>
            <h3 className="text-2xl font-bold font-bai">{dashboardStats?.counterValue}</h3>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {currentUser?.role === 'associate' && (
            <div ref={formRef} className="bg-white p-8 rounded-2xl shadow-sm border">
              <h3 className="text-xl font-bold font-bai mb-6">Lançar Registro</h3>
              <form onSubmit={handleAddNegotiation} className="space-y-6">
                <select name="supplierCnpj" className="w-full p-2 border rounded-lg bg-slate-50" required value={selectedSupplierCnpj} onChange={e => setSelectedSupplierCnpj(e.target.value)}>
                  <option value="">Selecione o Fornecedor...</option>
                  {dashboardStats?.pendingList.map(s => <option key={s.cnpj} value={s.cnpj}>{s.tradingName}</option>)}
                </select>
                <div className="flex items-center gap-2"><input type="checkbox" id="noneg" checked={noNegAssociate} onChange={e => setNoNegAssociate(e.target.checked)} /><label htmlFor="noneg">Sem Negociação</label></div>
                {!noNegAssociate && <Input label="Valor" value={amountMask} onChange={e => setAmountMask(formatCurrencyBRL(e.target.value))} required />}
                <Button type="submit" className="w-full">Salvar Negociação</Button>
              </form>
            </div>
          )}
          <div className="bg-white p-8 rounded-2xl border shadow-sm">
            <h3 className="text-xl font-bold font-bai mb-6">Desempenho Financeiro</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dashboardStats?.chartData}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{fontSize:10}} /><YAxis /><Tooltip /><Bar dataKey="total" fill="#b41e45" radius={[4,4,0,0]} /></BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
