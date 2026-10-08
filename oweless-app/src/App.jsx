import { useState, useEffect, useRef } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from 'recharts';
import {
  Bell,
  Settings2,
  AlertCircle,
  Calendar,
  CreditCard,
  Receipt,
  MoreHorizontal,
  TrendingDown,
  Trash2,
  Flame,
  Zap,
  Target,
  Wallet,
  Plus,
  Home
} from 'lucide-react';

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

let appId = 'default-app-id';
let firebaseConfig = null;
let initialAuthToken = null;

try {
  if (typeof __app_id !== 'undefined') appId = __app_id;
  if (typeof __firebase_config !== 'undefined') firebaseConfig = JSON.parse(__firebase_config);
  if (typeof __initial_auth_token !== 'undefined') initialAuthToken = __initial_auth_token;
} catch (e) {
  console.error("Error parsing env vars", e);
}

let app, auth, db;
if (firebaseConfig) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (e) {
    console.error("Firebase init error", e);
  }
}

const initialLoans = [
  { id: 1, name: 'Car Loan', total: 800000, paid: 250000, monthlyPayment: 15000, dueDate: 15, color: '#3b82f6', type: 'loan', totalTerms: 60, paymentsMade: 16 },
  { id: 2, name: 'Credit Card', total: 50000, paid: 15000, monthlyPayment: 5000, dueDate: 28, color: '#ef4444', type: 'credit', totalTerms: 0, paymentsMade: 0 },
  { id: 3, name: 'Student Loan', total: 120000, paid: 60000, monthlyPayment: 4000, dueDate: 5, color: '#10b981', type: 'loan', totalTerms: 30, paymentsMade: 15 },
];

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [salary, setSalary] = useState({ amount: 50000, frequency: 'monthly' });
  const [loans, setLoans] = useState(initialLoans);
  const [isAdding, setIsAdding] = useState(false);
  const [loanToDelete, setLoanToDelete] = useState(null);
  
  // Form state for new loan
  const [newLoan, setNewLoan] = useState({ name: '', total: '', monthlyPayment: '', dueDate: 1, type: 'loan', customType: '', totalTerms: '', paymentsMade: '' });
  const [salaryForm, setSalaryForm] = useState({ amount: salary.amount, frequency: salary.frequency });
  
  // Cloud Sync State
  const [userId, setUserId] = useState(null);
  const [isSyncing, setIsSyncing] = useState(Boolean(auth));

  // Import Refs and State
  const fileInputRef = useRef(null);
  const [importMessage, setImportMessage] = useState('');

  // Splash Screen State
  const [showSplash, setShowSplash] = useState(true);
  const [isSplashExiting, setIsSplashExiting] = useState(false);

  // Splash Screen Timer Effect
  useEffect(() => {
    const exitTimer = setTimeout(() => setIsSplashExiting(true), 2000); // Start fade out at 2 seconds
    const removeTimer = setTimeout(() => setShowSplash(false), 2500);   // Remove completely at 2.5 seconds
    return () => {
      clearTimeout(exitTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  // Firebase Auth Setup
  useEffect(() => {
    if (!auth) {
      return;
    }
    
    const authenticate = async () => {
      try {
        if (initialAuthToken) {
          await signInWithCustomToken(auth, initialAuthToken);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error", err);
      }
    };
    authenticate();

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserId(user.uid);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // Firebase Real-time Data Sync
  useEffect(() => {
    if (!userId || !db) return;

    const userDocRef = doc(db, 'artifacts', appId, 'users', userId, 'data', 'trackerState');
    const unsubscribeSnapshot = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.loans) setLoans(data.loans);
        if (data.salary) {
          setSalary(data.salary);
          setSalaryForm({ amount: data.salary.amount, frequency: data.salary.frequency });
        }
      }
      setIsSyncing(false);
    }, (err) => {
      console.error("Snapshot error", err);
      setIsSyncing(false);
    });

    return () => unsubscribeSnapshot();
  }, [userId]);

  // Helper to save data directly to Cloud
  const saveToCloud = async (newLoans, newSalary) => {
    if (!userId || !db) return;
    const userDocRef = doc(db, 'artifacts', appId, 'users', userId, 'data', 'trackerState');
    try {
      await setDoc(userDocRef, { loans: newLoans, salary: newSalary, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (e) {
      console.error("Save error", e);
    }
  };

  const calculateMonthlySalary = () => {
    switch (salary.frequency) {
      case 'weekly': return salary.amount * (52 / 12);
      case 'bi-weekly': return salary.amount * (26 / 12);
      case 'semi-monthly': return salary.amount * 2;
      case 'monthly':
      default: return salary.amount;
    }
  };

  const monthlySalary = calculateMonthlySalary();
  const totalMonthlyPayments = loans.reduce((sum, loan) => sum + Number(loan.monthlyPayment), 0);
  const totalDebt = loans.reduce((sum, loan) => sum + Number(loan.total), 0);
  const totalPaid = loans.reduce((sum, loan) => sum + (Number(loan.paid) || 0), 0);
  const remainingBudget = monthlySalary - totalMonthlyPayments;

  // Smart Alerts Logic
  const currentDay = new Date().getDate();
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  
  const upcomingLoans = loans.filter(l => {
    const diff = l.dueDate - currentDay;
    // Handle month wrap-around for due dates early next month
    const adjustedDiff = diff < 0 ? (Number(l.dueDate) + daysInMonth) - currentDay : diff;
    return adjustedDiff >= 0 && adjustedDiff <= 3;
  });

  const dtiRatio = totalMonthlyPayments / monthlySalary;
  const isDtiHigh = dtiRatio > 0.6; // High risk if debt is > 60% of income

  // Google Sheets CSV Export Generator
  const handleExportCSV = () => {
    const headers = ['Name', 'Type', 'Total Amount', 'Paid Amount', 'Monthly Payment', 'Due Date', 'Total Terms', 'Payments Made'];
    const rows = loans.map(l => [
      `"${l.name}"`, 
      l.customType || l.type, 
      l.total || 0, 
      l.paid || 0, 
      l.monthlyPayment || 0, 
      l.dueDate, 
      l.totalTerms || 0, 
      l.paymentsMade || 0
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'My_Loan_Tracker_Data.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const csv = event.target.result;
      const lines = csv.split('\n');
      const newLoans = [];
      
      // Robust custom CSV line parser to handle quotes
      const parseCSVLine = (line) => {
          const result = [];
          let current = '';
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
              const char = line[i];
              if (char === '"') {
                  inQuotes = !inQuotes;
              } else if (char === ',' && !inQuotes) {
                  result.push(current.trim());
                  current = '';
              } else {
                  current += char;
              }
          }
          result.push(current.trim());
          return result;
      };

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue; // Skip empty lines
        const values = parseCSVLine(lines[i]);
        
        if (values.length >= 8) {
          let name = values[0];
          let typeStr = values[1] ? values[1].toLowerCase() : 'other';
          let total = Number(values[2]) || 0;
          let paid = Number(values[3]) || 0;
          let monthlyPayment = Number(values[4]) || 0;
          let dueDate = Number(values[5]) || 1;
          let totalTerms = Number(values[6]) || 0;
          let paymentsMade = Number(values[7]) || 0;

          // Match custom types back to basic types if possible
          let baseType = ['loan', 'credit', 'bill'].includes(typeStr) ? typeStr : 'other';
          let customType = baseType === 'other' && typeStr !== 'other' ? values[1] : '';

          newLoans.push({
            id: Date.now() + i, // Generate new unique ID
            name,
            type: baseType,
            customType,
            total,
            paid,
            monthlyPayment,
            dueDate,
            totalTerms,
            paymentsMade,
            color: COLORS[(loans.length + i) % COLORS.length]
          });
        }
      }
      
      if (newLoans.length > 0) {
        // Append imported loans to existing ones
        const updatedLoans = [...loans, ...newLoans];
        setLoans(updatedLoans);
        saveToCloud(updatedLoans, salary); // Instantly back up to cloud
        
        // Show success message briefly
        setImportMessage(`Successfully imported ${newLoans.length} entries!`);
        setTimeout(() => setImportMessage(''), 3500);
      }
    };
    reader.readAsText(file);
    e.target.value = null; // Reset input so same file can be uploaded again if needed
  };

  const handleAddLoan = (e) => {
    e.preventDefault();
    if (!newLoan.name || !newLoan.monthlyPayment) return;
    
    let calculatedTotal = Number(newLoan.total);
    let calculatedPaid = 0;

    // Auto-calculate total and paid based on terms if provided
    if (!calculatedTotal && Number(newLoan.totalTerms) > 0) {
      calculatedTotal = Number(newLoan.monthlyPayment) * Number(newLoan.totalTerms);
    }
    if (Number(newLoan.paymentsMade) > 0) {
      calculatedPaid = Number(newLoan.monthlyPayment) * Number(newLoan.paymentsMade);
    }

    const newLoansList = [...loans, {
      ...newLoan,
      id: Date.now(),
      total: calculatedTotal || 0,
      paid: calculatedPaid || 0,
      totalTerms: Number(newLoan.totalTerms) || 0,
      paymentsMade: Number(newLoan.paymentsMade) || 0,
      color: COLORS[loans.length % COLORS.length]
    }];

    setLoans(newLoansList);
    saveToCloud(newLoansList, salary); // Save to cloud immediately
    setIsAdding(false);
    setNewLoan({ name: '', total: '', monthlyPayment: '', dueDate: 1, type: 'loan', customType: '', totalTerms: '', paymentsMade: '' });
  };

  const handleUpdateSalary = (e) => {
    e.preventDefault();
    const newSalary = { amount: Number(salaryForm.amount), frequency: salaryForm.frequency };
    setSalary(newSalary);
    saveToCloud(loans, newSalary); // Save to cloud immediately
    setActiveTab('home');
  };

  const confirmDelete = () => {
    const newLoansList = loans.filter(l => l.id !== loanToDelete);
    setLoans(newLoansList);
    saveToCloud(newLoansList, salary); // Save to cloud immediately
    setLoanToDelete(null);
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);
  };

  const renderHome = () => (
    <div className="space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-300">
      
      {/* Smart Alerts */}
      {(upcomingLoans.length > 0 || isDtiHigh) && (
        <div className="space-y-2 mb-2">
          {isDtiHigh && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-3 flex items-start space-x-3 shadow-sm">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-red-800">High Debt-to-Income Ratio</h4>
                <p className="text-xs text-red-600 mt-0.5">Your monthly payments consume {(dtiRatio * 100).toFixed(0)}% of your income. Check the Strategy tab to optimize.</p>
              </div>
            </div>
          )}
          {upcomingLoans.map(loan => (
            <div key={`alert-${loan.id}`} className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-start space-x-3 shadow-sm">
              <Bell className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-amber-800">Payment Due Soon</h4>
                <p className="text-xs text-amber-600 mt-0.5">{loan.name} ({formatCurrency(loan.monthlyPayment)}) is due on the {loan.dueDate}{[1, 21, 31].includes(Number(loan.dueDate)) ? 'st' : [2, 22].includes(Number(loan.dueDate)) ? 'nd' : [3, 23].includes(Number(loan.dueDate)) ? 'rd' : 'th'}.</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Header Overview */}
      <div className="bg-gradient-to-br from-indigo-600 to-blue-700 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
        
        {/* Sync Indicator */}
        {isSyncing && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center bg-white/20 px-3 py-1 rounded-full backdrop-blur-md">
            <div className="w-2 h-2 rounded-full bg-green-400 mr-2 animate-pulse"></div>
            <span className="text-xs font-medium text-white/90">Syncing...</span>
          </div>
        )}

        <div className="flex justify-between items-start mb-6">
          <div>
            <p className="text-indigo-100 text-sm font-medium opacity-80 mb-1">Total Monthly Payments</p>
            <h1 className="text-3xl font-bold">{formatCurrency(totalMonthlyPayments)}</h1>
          </div>
          <button onClick={() => setActiveTab('settings')} className="bg-white/20 p-2 rounded-xl backdrop-blur-sm hover:bg-white/30 transition-colors">
            <Settings2 className="w-6 h-6 text-white" />
          </button>
        </div>
        
        <div className="grid grid-cols-2 gap-4 mt-6 border-t border-white/20 pt-4">
          <div>
            <p className="text-indigo-100 text-xs opacity-80 mb-1">Monthly Income</p>
            <p className="text-lg font-semibold">{formatCurrency(monthlySalary)}</p>
          </div>
          <div>
            <p className="text-indigo-100 text-xs opacity-80 mb-1">Left to Spend</p>
            <p className="text-lg font-semibold text-green-300">{formatCurrency(remainingBudget)}</p>
          </div>
        </div>
      </div>

      {/* Chart Section */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
        <h2 className="text-lg font-bold text-slate-800 mb-4">Payment Breakdown</h2>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={loans}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="monthlyPayment"
              >
                {loans.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <RechartsTooltip 
                formatter={(value) => formatCurrency(value)}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        
        <div className="grid grid-cols-2 gap-3 mt-4">
          {loans.map((loan) => (
            <div key={loan.id} className="flex items-center space-x-2 text-sm">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: loan.color }} />
              <span className="text-slate-600 truncate">{loan.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Upcoming Section */}
      <div>
        <div className="flex justify-between items-center mb-4 px-1">
          <h2 className="text-lg font-bold text-slate-800">Upcoming This Month</h2>
          <button onClick={() => setActiveTab('loans')} className="text-indigo-600 text-sm font-medium">See all</button>
        </div>
        <div className="space-y-3">
          {loans.sort((a, b) => a.dueDate - b.dueDate).slice(0, 3).map(loan => (
             <div key={loan.id} className="bg-white rounded-2xl p-4 flex items-center shadow-sm border border-slate-100 transition active:scale-95">
              <div 
                className="w-12 h-12 rounded-full flex items-center justify-center mr-4 bg-opacity-10"
                style={{ backgroundColor: `${loan.color}20`, color: loan.color }}
              >
                <Calendar className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-800">{loan.name}</h3>
                <p className="text-xs text-slate-500">Due on {loan.dueDate}{[1, 21, 31].includes(loan.dueDate) ? 'st' : [2, 22].includes(loan.dueDate) ? 'nd' : [3, 23].includes(loan.dueDate) ? 'rd' : 'th'}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-slate-800">{formatCurrency(loan.monthlyPayment)}</p>
              </div>
             </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderLoans = () => (
    <div className="space-y-4 pb-24 animate-in fade-in slide-in-from-right-4 duration-300">
       <div className="flex justify-between items-end mb-6 pt-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Your Debts</h1>
          <p className="text-slate-500 text-sm mt-1">Total outstanding: {formatCurrency(totalDebt)}</p>
        </div>
      </div>

      {loans.map(loan => (
        <div key={loan.id} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col">
          <div className="flex justify-between items-start mb-4">
             <div className="flex items-center space-x-3">
              <div 
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: `${loan.color}20`, color: loan.color }}
                >
                  {loan.type === 'credit' ? <CreditCard className="w-5 h-5" /> : 
                   loan.type === 'bill' ? <Receipt className="w-5 h-5" /> :
                   loan.type === 'other' ? <MoreHorizontal className="w-5 h-5" /> : 
                   <TrendingDown className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">{loan.name}</h3>
                  <span className="text-xs font-medium px-2 py-1 bg-slate-100 text-slate-600 rounded-md mt-1 inline-block capitalize">
                    {loan.type === 'other' && loan.customType ? loan.customType : loan.type}
                  </span>
                </div>
             </div>
             <div className="flex flex-col items-end">
                <button 
                  onClick={() => setLoanToDelete(loan.id)}
                  className="p-1.5 mb-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  aria-label="Delete entry"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <p className="text-xs text-slate-500 mb-1">Monthly</p>
                <p className="font-bold text-indigo-600">{formatCurrency(loan.monthlyPayment)}</p>
             </div>
          </div>
          
          <div className="bg-slate-50 rounded-xl p-3 flex justify-between items-center text-sm">
             <div>
               <p className="text-slate-500 text-xs">Total Remaining</p>
               <p className="font-semibold text-slate-700">{formatCurrency(Math.max(0, Number(loan.total) - (Number(loan.paid) || 0)))}</p>
             </div>
             <div className="h-8 w-px bg-slate-200 mx-2"></div>
             <div className="text-right">
               <p className="text-slate-500 text-xs">Due Date</p>
               <p className="font-semibold text-slate-700 flex items-center justify-end">
                 <Calendar className="w-3 h-3 mr-1 text-slate-400" />
                 Day {loan.dueDate}
               </p>
             </div>
          </div>

          {/* Gamification Progress Bar */}
          {(Number(loan.total) > 0 || Number(loan.totalTerms) > 0) && (
            <div className="mt-4 pt-4 border-t border-slate-50">
              <div className="flex justify-between text-xs text-slate-500 mb-2">
                 <span className="flex items-center">
                   <Flame className="w-3 h-3 mr-1 text-orange-400"/> 
                   {Number(loan.totalTerms) > 0 ? `Payment ${loan.paymentsMade || 0} of ${loan.totalTerms}` : 'Paid off'}
                 </span>
                 <span className="font-semibold text-slate-700">
                    {Number(loan.totalTerms) > 0 
                      ? Math.min(100, Math.round(((loan.paymentsMade || 0) / loan.totalTerms) * 100))
                      : Math.min(100, Math.round(((loan.paid || 0) / loan.total) * 100))}%
                 </span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                 <div 
                    className="h-full rounded-full transition-all duration-1000" 
                    style={{ 
                      width: `${Number(loan.totalTerms) > 0 
                        ? Math.min(100, ((loan.paymentsMade || 0) / loan.totalTerms) * 100) 
                        : Math.min(100, ((loan.paid || 0) / loan.total) * 100)}%`, 
                      backgroundColor: loan.color 
                    }}>
                 </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const renderStrategy = () => {
    const remainingDebt = totalDebt - totalPaid;
    const baselineMonths = loans.length > 0 ? Math.max(...loans.map(l => (Number(l.total) || 0) / (Number(l.monthlyPayment) || 1))) : 0;
    const acceleratedMonths = remainingBudget > 0 ? remainingDebt / (totalMonthlyPayments + remainingBudget) : baselineMonths;
    const monthsSaved = Math.max(0, Math.round(baselineMonths - acceleratedMonths));
    const canAccelerate = remainingBudget > 0 && monthsSaved > 0;

    return (
      <div className="space-y-6 pb-24 animate-in fade-in slide-in-from-right-4 duration-300">
        <div className="pt-2 mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Payoff Strategy</h1>
          <p className="text-slate-500 text-sm mt-1">Debt Snowball Projection</p>
        </div>

        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl p-6 text-white shadow-xl">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-lg font-bold">Fast-Track Potential</h2>
          </div>
          
          {canAccelerate ? (
            <>
              <p className="text-emerald-50 text-sm mb-2">By applying your extra <span className="font-bold text-white">{formatCurrency(remainingBudget)}</span> every month towards your debts, you could be debt-free:</p>
              <div className="text-4xl font-extrabold mb-1">{monthsSaved} Months</div>
              <p className="text-emerald-100 text-sm font-medium">Faster than your current plan!</p>
            </>
          ) : (
            <p className="text-emerald-50 text-sm">To use the Fast-Track strategy, you need a positive "Left to Spend" budget. Consider adjusting your income or monthly payments to find extra cash!</p>
          )}
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center">
            <Target className="w-5 h-5 mr-2 text-indigo-500" />
            Suggested Focus
          </h3>
          
          {loans.length > 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">The <strong>Debt Snowball</strong> method suggests paying off your smallest balances first to build momentum.</p>
              
              {loans.filter(l => (Number(l.total) || 0) > 0).sort((a, b) => ((Number(a.total) || 0) - (Number(a.paid) || 0)) - ((Number(b.total) || 0) - (Number(b.paid) || 0))).map((loan, index) => (
                <div key={`strategy-${loan.id}`} className="flex items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold mr-3 shrink-0">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-800 text-sm">{loan.name}</p>
                    <p className="text-xs text-slate-500">Remaining: {formatCurrency((Number(loan.total) || 0) - (Number(loan.paid) || 0))}</p>
                  </div>
                  {index === 0 && <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-md uppercase tracking-wider">Target</span>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No active debts to analyze.</p>
          )}
        </div>
      </div>
    );
  };

  const renderSettings = () => (
    <div className="space-y-6 pb-20 animate-in fade-in slide-in-from-left-4 duration-300">
      <h1 className="text-2xl font-bold text-slate-900 pt-2">Settings</h1>
      
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
            <Wallet className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-slate-800">Income Configuration</h2>
        </div>

        <form onSubmit={handleUpdateSalary} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Base Income Amount</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">₱</span>
              <input 
                type="number" 
                value={salaryForm.amount}
                onChange={e => setSalaryForm({...salaryForm, amount: e.target.value})}
                className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">How often are you paid?</label>
            <select 
              value={salaryForm.frequency}
              onChange={e => setSalaryForm({...salaryForm, frequency: e.target.value})}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all appearance-none"
            >
              <option value="weekly">Weekly</option>
              <option value="bi-weekly">Bi-weekly (Every 2 weeks)</option>
              <option value="semi-monthly">Semi-monthly (Twice a month)</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          <button 
            type="submit"
            className="w-full bg-indigo-600 text-white font-semibold py-3.5 rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
          >
            Save Changes
          </button>
        </form>
      </div>

       <div className="bg-red-50 rounded-2xl p-4 flex items-start space-x-3 border border-red-100">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-800">
            Based on your setup, your calculated monthly income is <span className="font-bold">{formatCurrency(monthlySalary)}</span>. Ensure this is accurate for correct budget tracking.
          </p>
       </div>

       {/* Google Sheets Export Section */}
       <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
        <div className="flex items-center space-x-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
             <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
             </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-800">Spreadsheet Sync</h2>
        </div>
        <p className="text-sm text-slate-500 mb-6">
          Your data is automatically synced to your cloud account. You can also download a copy below to open in Google Sheets or Excel, or import an existing CSV file to merge with your current tracker.
        </p>

        {importMessage && (
          <div className="mb-4 p-3 bg-green-50 text-green-700 text-sm font-medium rounded-xl text-center animate-in fade-in zoom-in-95 duration-200">
            {importMessage}
          </div>
        )}

        <div className="space-y-3">
          <button 
            onClick={handleExportCSV}
            className="w-full border-2 border-slate-200 text-slate-700 font-semibold py-3.5 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-colors flex items-center justify-center shadow-sm"
          >
            Export Data to CSV
          </button>

          <input 
            type="file" 
            accept=".csv" 
            ref={fileInputRef} 
            onChange={handleImportCSV} 
            className="hidden" 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="w-full bg-emerald-50 text-emerald-700 border-2 border-emerald-100 font-semibold py-3.5 rounded-xl hover:bg-emerald-100 transition-colors flex items-center justify-center shadow-sm"
          >
            Import Data from CSV
          </button>
        </div>
       </div>
    </div>
  );

  const renderAddModal = () => {
    if (!isAdding) return null;
    return (
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
        <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 pb-10 sm:pb-6 shadow-2xl animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-4 duration-300 max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-slate-800">Add New Payment</h2>
            <button 
              onClick={() => setIsAdding(false)}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleAddLoan} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Name / Identifier</label>
              <input 
                type="text" 
                placeholder="e.g., Chase Credit Card"
                value={newLoan.name}
                onChange={e => setNewLoan({...newLoan, name: e.target.value})}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Monthly Payment</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₱</span>
                  <input 
                    type="number" 
                    placeholder="0.00"
                    value={newLoan.monthlyPayment}
                    onChange={e => setNewLoan({...newLoan, monthlyPayment: e.target.value})}
                    className="w-full pl-7 pr-3 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Total Amount (Optional)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₱</span>
                  <input 
                    type="number" 
                    placeholder="0.00"
                    value={newLoan.total}
                    onChange={e => setNewLoan({...newLoan, total: e.target.value})}
                    className="w-full pl-7 pr-3 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Due Date (Day)</label>
                <input 
                  type="number" 
                  min="1" max="31"
                  value={newLoan.dueDate}
                  onChange={e => setNewLoan({...newLoan, dueDate: e.target.value})}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                <select 
                  value={newLoan.type}
                  onChange={e => setNewLoan({...newLoan, type: e.target.value})}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none appearance-none"
                >
                  <option value="loan">Loan</option>
                  <option value="credit">Credit Card</option>
                  <option value="bill">Utility/Bill</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            {/* Term Progress Section */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Terms / Months (Optional)</label>
                <input 
                  type="number" 
                  placeholder="e.g., 24"
                  value={newLoan.totalTerms}
                  onChange={e => setNewLoan({...newLoan, totalTerms: e.target.value})}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Payments Made</label>
                <input 
                  type="number" 
                  placeholder="e.g., 5"
                  value={newLoan.paymentsMade}
                  onChange={e => setNewLoan({...newLoan, paymentsMade: e.target.value})}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            {newLoan.type === 'other' && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                <label className="block text-sm font-medium text-slate-700 mb-1">Specify Payment Type</label>
                <input 
                  type="text" 
                  placeholder="e.g., Insurance, Gym Membership"
                  value={newLoan.customType}
                  onChange={e => setNewLoan({...newLoan, customType: e.target.value})}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  required
                />
              </div>
            )}

            <button 
              type="submit"
              className="w-full bg-indigo-600 text-white font-semibold py-3.5 rounded-xl hover:bg-indigo-700 transition-colors mt-6 shadow-lg shadow-indigo-200"
            >
              Add to Tracker
            </button>
          </form>
        </div>
      </div>
    );
  };

  const renderDeleteConfirmModal = () => {
    if (!loanToDelete) return null;
    return (
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
        <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600 mb-4 mx-auto">
            <Trash2 className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2 text-center">Delete Entry?</h3>
          <p className="text-slate-500 text-sm mb-6 text-center">
            Are you sure you want to remove this payment? This action cannot be undone and will update your available budget.
          </p>
          <div className="flex space-x-3">
            <button 
              onClick={() => setLoanToDelete(null)}
              className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={confirmDelete}
              className="flex-1 px-4 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-indigo-100 selection:text-indigo-900 flex justify-center">
      {/* Mobile Container wrapper to simulate phone on desktop */}
      <div className="w-full max-w-md bg-slate-50 min-h-screen relative shadow-2xl sm:border-x sm:border-slate-200 overflow-hidden flex flex-col">
        
        {/* Splash Screen Overlay */}
        {showSplash && (
          <div className={`absolute inset-0 z-[60] flex items-center justify-center bg-gradient-to-br from-indigo-600 to-blue-800 transition-opacity duration-500 ${isSplashExiting ? 'opacity-0' : 'opacity-100'}`}>
             <div className="flex flex-col items-center animate-in zoom-in-75 fade-in duration-700">
                <div className="w-24 h-24 bg-white rounded-[28px] shadow-2xl flex items-center justify-center mb-6 relative overflow-hidden">
                  <div className="absolute inset-0 bg-indigo-50/50"></div>
                  <TrendingDown className="w-12 h-12 text-indigo-600 stroke-[2.5] relative z-10" />
                </div>
                <h1 className="text-5xl font-extrabold text-white tracking-tight mb-2">OweLess</h1>
                <p className="text-indigo-200 font-medium text-sm tracking-widest uppercase">Track less. Live more.</p>
             </div>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto px-5 pt-8 pb-24 scroll-smooth">
          {activeTab === 'home' && renderHome()}
          {activeTab === 'loans' && renderLoans()}
          {activeTab === 'strategy' && renderStrategy()}
          {activeTab === 'settings' && renderSettings()}
        </div>

        {/* Floating Add Button */}
        <button 
          onClick={() => setIsAdding(true)}
          className="absolute bottom-24 right-5 w-14 h-14 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg shadow-indigo-300 hover:bg-indigo-700 transition-transform active:scale-95 z-40"
        >
          <Plus className="w-6 h-6" />
        </button>

        {/* Bottom Navigation Bar */}
        <div className="absolute bottom-0 w-full bg-white/80 backdrop-blur-md border-t border-slate-200 px-6 py-4 pb-safe flex justify-between items-center z-40">
          <button 
            onClick={() => setActiveTab('home')}
            className={`flex flex-col items-center space-y-1 transition-colors ${activeTab === 'home' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Home className="w-6 h-6" />
            <span className="text-[10px] font-medium">Home</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('loans')}
            className={`flex flex-col items-center space-y-1 transition-colors ${activeTab === 'loans' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <CreditCard className="w-6 h-6" />
            <span className="text-[10px] font-medium">Debts</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('strategy')}
            className={`flex flex-col items-center space-y-1 transition-colors ${activeTab === 'strategy' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Zap className="w-6 h-6" />
            <span className="text-[10px] font-medium">Strategy</span>
          </button>
        </div>

        {/* Add Modal Overlay */}
        {renderAddModal()}
        
        {/* Delete Confirmation Modal */}
        {renderDeleteConfirmModal()}
      </div>
    </div>
  );
}