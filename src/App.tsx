/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, createContext, useContext } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  deleteDoc, 
  Timestamp, 
  orderBy,
  limit,
  getDocFromServer,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { 
  signInWithEmailAndPassword,
  onAuthStateChanged, 
  signOut, 
  User 
} from 'firebase/auth';
import { db, auth } from './firebase';
import { 
  Plus, 
  Trash2, 
  TrendingDown, 
  AlertTriangle, 
  LogOut, 
  Package, 
  History, 
  ChevronRight,
  PlusCircle,
  MinusCircle,
  BarChart3,
  Calendar,
  CheckCircle2,
  Home,
  Sparkles,
  ChevronLeft,
  Clock,
  ShoppingCart,
  Store,
  Tag,
  Filter,
  Edit,
  ListChecks,
  Settings,
  Check,
  X,
  Edit2,
  TrendingUp,
  Wallet,
  Activity,
  PieChart as PieChartIcon
} from 'lucide-react';
import { format, differenceInDays, addDays, isAfter, subDays } from 'date-fns';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { 
  DndContext, 
  closestCenter, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors, 
  DragEndEvent,
  DragStartEvent,
  TouchSensor,
  MouseSensor,
  useDroppable,
  defaultDropAnimationSideEffects,
  DropAnimation
} from '@dnd-kit/core';
import { 
  arrayMove, 
  SortableContext, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// --- Constants ---
const STORES = ['Netto', 'Rema', 'Kvickly', 'Lidl', 'Andre'] as const;
const CATEGORIES = [
  'Sundhed & Pleje',
  'Frugt & Grønt',
  'Brød',
  'Køl',
  'Mejeri',
  'Kolonial',
  'Husholdning',
  'Slik'
] as const;

const STORE_ORDERS: Record<string, string[]> = {
  'Netto': ['Frugt & Grønt', 'Brød', 'Kolonial', 'Køl', 'Mejeri', 'Husholdning', 'Slik'],
  'Rema': ['Frugt & Grønt', 'Brød', 'Køl', 'Mejeri', 'Kolonial', 'Husholdning', 'Slik'],
  'Kvickly': ['Sundhed & Pleje', 'Frugt & Grønt', 'Køl', 'Mejeri', 'Brød', 'Kolonial', 'Husholdning', 'Slik'],
  'Lidl': ['Frugt & Grønt', 'Brød', 'Køl', 'Mejeri', 'Kolonial', 'Husholdning', 'Slik']
};

// --- Utilities ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface ShoppingStat {
  id: string;
  itemName: string;
  store: string;
  category: string;
  price: number;
  timestamp: Timestamp;
  ownerId: string;
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Types ---
interface Product {
  id: string;
  name: string;
  currentQuantity: number;
  unit: string;
  category: string;
  ownerId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface InventoryCheck {
  id: string;
  productId: string;
  quantity: number;
  timestamp: Timestamp;
  ownerId: string;
}

interface Forecast {
  daysRemaining: number | null;
  estimatedEmptyDate: Date | null;
  avgDailyConsumption: number;
  dynamicThreshold: number;
}

interface Room {
  id: string;
  name: string;
  ownerId: string;
  createdAt: Timestamp;
}

interface CleaningTask {
  id: string;
  roomId: string;
  description: string;
  intervalDays: number;
  lastCompletedAt: Timestamp;
  ownerId: string;
  createdAt: Timestamp;
}

interface ShoppingListItem {
  id: string;
  name: string;
  store: string;
  category: string;
  price: number;
  isOffer: boolean;
  isCompleted: boolean;
  ownerId: string;
  createdAt: Timestamp;
}

interface MasterShoppingItem {
  id: string;
  name: string;
  store: string;
  category: string;
  ownerId: string;
  createdAt: Timestamp;
}

// --- Context ---
const AuthContext = createContext<{
  user: User | null;
  loading: boolean;
} | null>(null);

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

// --- Components ---

function GlobalErrorDisplay({ error }: { error: any }) {
  let errorMessage = "Der opstod en uventet fejl.";
  try {
    const parsed = JSON.parse(error.message);
    if (parsed.error.includes('insufficient permissions')) {
      errorMessage = "Du har ikke tilladelse til at udføre denne handling. Tjek venligst dine rettigheder.";
    }
  } catch (e) {
    // Not a JSON error
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
        <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Hovsa!</h2>
        <p className="text-gray-600 mb-6">{errorMessage}</p>
        <button 
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-gray-900 text-white rounded-full font-medium hover:bg-gray-800 transition-colors"
        >
          Prøv igen
        </button>
      </div>
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      console.error('Login failed', err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Forkert e-mail eller adgangskode.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Ugyldig e-mail adresse.');
      } else {
        setError('Der opstod en fejl under login. Prøv igen senere.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5] p-4">
      <div className="max-w-md w-full p-8 bg-white rounded-[40px] shadow-sm text-center">
        <div className="w-20 h-20 bg-gray-900 rounded-[24px] flex items-center justify-center mx-auto mb-8 shadow-xl">
          <Package className="text-white w-10 h-10" />
        </div>
        <h1 className="text-4xl font-light text-gray-900 mb-2">Hjemmets Lager</h1>
        <p className="text-gray-500 mb-10">Log ind for at styre jeres fælles indkøb og lager.</p>
        
        <form onSubmit={handleLogin} className="space-y-4 text-left">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2 ml-4">E-mail</label>
            <input 
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="din@mail.dk"
              required
              className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-gray-900 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2 ml-4">Adgangskode</label>
            <input 
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-gray-900 transition-all"
            />
          </div>
          
          {error && (
            <div className="p-4 bg-red-50 text-red-600 text-sm rounded-2xl animate-in fade-in slide-in-from-top-2">
              {error}
            </div>
          )}

          <button 
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-gray-900 text-white rounded-2xl font-bold hover:bg-gray-800 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed mt-4"
          >
            {loading ? 'Logger ind...' : 'Log ind'}
          </button>
        </form>
      </div>
    </div>
  );
}

interface ProductCardProps {
  key?: React.Key;
  product: Product;
  inventoryChecks: InventoryCheck[];
  onUpdateQuantity: (id: string, newQuantity: number) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
}

function ProductCard({ 
  product, 
  inventoryChecks, 
  onUpdateQuantity, 
  onDelete 
}: ProductCardProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [newQuantity, setNewQuantity] = useState(product.currentQuantity);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const forecast = useMemo((): Forecast => {
    const checks = inventoryChecks
      .filter(c => c.productId === product.id)
      .sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());

    if (checks.length < 2) {
      return { daysRemaining: null, estimatedEmptyDate: null, avgDailyConsumption: 0, dynamicThreshold: 0 };
    }

    const rates: number[] = [];
    for (let i = 1; i < checks.length; i++) {
      const prev = checks[i - 1];
      const curr = checks[i];
      const days = Math.max(0.1, differenceInDays(curr.timestamp.toDate(), prev.timestamp.toDate()));
      
      if (curr.quantity < prev.quantity) {
        const consumed = prev.quantity - curr.quantity;
        rates.push(consumed / days);
      }
    }

    const avgDaily = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
    const dynamicThreshold = Math.ceil(avgDaily * 7);

    if (avgDaily <= 0) {
      return { daysRemaining: null, estimatedEmptyDate: null, avgDailyConsumption: 0, dynamicThreshold };
    }

    const daysRemaining = Math.floor(product.currentQuantity / avgDaily);
    const estimatedEmptyDate = addDays(new Date(), daysRemaining);

    return { daysRemaining, estimatedEmptyDate, avgDailyConsumption: avgDaily, dynamicThreshold };
  }, [product, inventoryChecks]);

  const isLow = product.currentQuantity <= forecast.dynamicThreshold && forecast.avgDailyConsumption > 0;

  return (
    <div className={cn(
      "bg-white rounded-[24px] p-6 shadow-sm border transition-all duration-300",
      isLow ? "border-red-200 bg-red-50/30" : "border-gray-100 hover:shadow-md"
    )}>
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-medium text-gray-900">{product.name}</h3>
            {isLow && <AlertTriangle size={16} className="text-red-500" />}
          </div>
          <p className="text-sm text-gray-500">{product.currentQuantity} {product.unit} tilbage</p>
        </div>
        <div className="flex items-center gap-1">
          {isConfirmingDelete ? (
            <div className="flex items-center gap-1 animate-in fade-in slide-in-from-right-2">
              <button 
                onClick={() => onDelete(product.id)}
                className="px-3 py-1 bg-red-500 text-white text-xs rounded-full hover:bg-red-600 transition-colors"
              >
                Slet
              </button>
              <button 
                onClick={() => setIsConfirmingDelete(false)}
                className="px-3 py-1 bg-gray-100 text-gray-600 text-xs rounded-full hover:bg-gray-200 transition-colors"
              >
                Fortryd
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setIsConfirmingDelete(true)}
              className="p-2 text-gray-400 hover:text-red-500 transition-colors"
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {/* Progress Bar */}
        <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
          <div 
            className={cn(
              "h-full transition-all duration-500",
              isLow ? "bg-red-500" : "bg-gray-900"
            )}
            style={{ width: `${Math.min(100, (product.currentQuantity / (forecast.dynamicThreshold * 2 || 10)) * 100)}%` }}
          />
        </div>

        {/* Forecast Info */}
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="flex items-center gap-2">
            <TrendingDown size={16} className="text-gray-400" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Forventet tør</p>
              <p className="text-sm font-medium text-gray-700">
                {forecast.estimatedEmptyDate ? format(forecast.estimatedEmptyDate, 'd. MMM') : 'Venter på data'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className={cn(isLow ? "text-red-400" : "text-gray-400")} />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Advarsel ved</p>
              <p className="text-sm font-medium text-gray-700">
                {forecast.dynamicThreshold > 0 ? `${forecast.dynamicThreshold} ${product.unit}` : '-'}
              </p>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2 pt-2">
          {!isUpdating ? (
            <button 
              onClick={() => {
                setIsUpdating(true);
                setNewQuantity(product.currentQuantity);
              }}
              className="flex-1 py-2 bg-gray-50 text-gray-900 rounded-xl text-sm font-medium hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
            >
              <PlusCircle size={16} />
              Opdater beholdning
            </button>
          ) : (
            <div className="flex-1 flex items-center gap-2 animate-in fade-in zoom-in duration-200">
              <input 
                type="number" 
                value={newQuantity}
                onChange={(e) => setNewQuantity(Number(e.target.value))}
                className="w-24 px-3 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-1 focus:ring-gray-900"
                min="0"
                step="0.1"
                autoFocus
              />
              <button 
                onClick={() => {
                  onUpdateQuantity(product.id, newQuantity);
                  setIsUpdating(false);
                }}
                className="flex-1 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors"
              >
                Gem
              </button>
              <button 
                onClick={() => setIsUpdating(false)}
                className="px-3 py-2 text-gray-500 text-sm"
              >
                X
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [inventoryChecks, setInventoryChecks] = useState<InventoryCheck[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [showOnlyLow, setShowOnlyLow] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', quantity: 0, unit: 'stk', category: 'Andet' });

  const categories = ['Badeværelse', 'Køkken', 'Rengøring', 'Personlig pleje', 'Andet'];

  useEffect(() => {
    if (!user) return;
    
    const pQuery = query(collection(db, 'products'), where('ownerId', '==', user.uid), orderBy('updatedAt', 'desc'));
    const unsubscribeProducts = onSnapshot(pQuery, (snapshot) => {
      setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'products'));

    const cQuery = query(collection(db, 'inventoryChecks'), where('ownerId', '==', user.uid), orderBy('timestamp', 'desc'), limit(1000));
    const unsubscribeChecks = onSnapshot(cQuery, (snapshot) => {
      setInventoryChecks(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as InventoryCheck)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'inventoryChecks'));

    return () => {
      unsubscribeProducts();
      unsubscribeChecks();
    };
  }, [user]);

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const now = Timestamp.now();
      const productRef = await addDoc(collection(db, 'products'), {
        name: newProduct.name,
        currentQuantity: Number(newProduct.quantity),
        unit: newProduct.unit,
        category: newProduct.category,
        ownerId: user.uid,
        createdAt: now,
        updatedAt: now
      });

      // Initial inventory check
      await addDoc(collection(db, 'inventoryChecks'), {
        productId: productRef.id,
        quantity: Number(newProduct.quantity),
        timestamp: now,
        ownerId: user.uid
      });

      setNewProduct({ name: '', quantity: 0, unit: 'stk', category: 'Andet' });
      setIsAdding(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'products');
    }
  };

  const handleUpdateProduct = async (id: string, data: Partial<Product>) => {
    try {
      await updateDoc(doc(db, 'products', id), {
        ...data,
        updatedAt: Timestamp.now()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `products/${id}`);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    try {
      // 1. Delete the product
      await deleteDoc(doc(db, 'products', id));
      
      // 2. Delete associated inventory checks
      const q = query(collection(db, 'inventoryChecks'), where('productId', '==', id));
      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map(d => deleteDoc(d.ref));
      await Promise.all(deletePromises);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `products/${id}`);
    }
  };

  const handleUpdateQuantity = async (productId: string, newQuantity: number) => {
    if (!user) return;
    try {
      const now = Timestamp.now();
      
      // 1. Record the check
      await addDoc(collection(db, 'inventoryChecks'), {
        productId,
        quantity: newQuantity,
        timestamp: now,
        ownerId: user.uid
      });

      // 2. Update the product
      await updateDoc(doc(db, 'products', productId), {
        currentQuantity: newQuantity,
        updatedAt: now
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `products/${productId}`);
    }
  };

  const totalStats = useMemo(() => {
    // Calculate low stock count based on dynamic threshold (7 days consumption)
    const lowStockItems = products.filter(p => {
      const checks = inventoryChecks
        .filter(c => c.productId === p.id)
        .sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());

      if (checks.length < 2) return false;

      let totalConsumption = 0;
      let totalDays = 0;
      for (let i = 0; i < checks.length - 1; i++) {
        const current = checks[i];
        const previous = checks[i + 1];
        const consumption = previous.quantity - current.quantity;
        if (consumption > 0) {
          const days = Math.max(0.1, differenceInDays(current.timestamp.toDate(), previous.timestamp.toDate()));
          totalConsumption += consumption;
          totalDays += days;
        }
      }

      const avgDaily = totalDays > 0 ? totalConsumption / totalDays : 0;
      const threshold = avgDaily * 7;
      return p.currentQuantity <= threshold && avgDaily > 0;
    });

    return { 
      lowStockCount: lowStockItems.length,
      lowStockIds: lowStockItems.map(p => p.id)
    };
  }, [products, inventoryChecks]);

  const filteredProducts = useMemo(() => {
    if (showOnlyLow) {
      return products.filter(p => totalStats.lowStockIds.includes(p.id));
    }
    return products;
  }, [products, showOnlyLow, totalStats.lowStockIds]);

  const groupedProducts = useMemo((): { [key: string]: Product[] } => {
    const groups: { [key: string]: Product[] } = {};
    filteredProducts.forEach(p => {
      const category = p.category || 'Andet';
      if (!groups[category]) groups[category] = [];
      groups[category].push(p);
    });
    return groups;
  }, [filteredProducts]);

  return (
    <div className="min-h-screen bg-[#f5f5f5] pb-20">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center">
              <Package className="text-white w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Lager</h1>
              <p className="text-xs text-gray-500">{products.length} produkter i alt</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pt-6 sm:pt-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <button 
            onClick={() => setShowOnlyLow(!showOnlyLow)}
            className={`bg-white p-6 rounded-[24px] shadow-sm border transition-all text-left ${showOnlyLow ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-100'}`}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className={`p-2 rounded-lg ${showOnlyLow ? 'bg-red-500 text-white' : 'bg-red-50 text-red-500'}`}>
                <AlertTriangle size={18} />
              </div>
              <p className="text-sm font-medium text-gray-500">Lav beholdning</p>
            </div>
            <p className="text-3xl font-light text-gray-900">{totalStats.lowStockCount}</p>
          </button>
          <div className="bg-white p-6 rounded-[24px] shadow-sm border border-gray-100">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-50 text-blue-500 rounded-lg">
                <History size={18} />
              </div>
              <p className="text-sm font-medium text-gray-500">Tjek (30d)</p>
            </div>
            <p className="text-3xl font-light text-gray-900">
              {inventoryChecks.filter(c => isAfter(c.timestamp.toDate(), subDays(new Date(), 30))).length}
            </p>
          </div>
          <div className="bg-white p-6 rounded-[24px] shadow-sm border border-gray-100">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-50 text-emerald-500 rounded-lg">
                <BarChart3 size={18} />
              </div>
              <p className="text-sm font-medium text-gray-500">Aktive produkter</p>
            </div>
            <p className="text-3xl font-light text-gray-900">{products.length}</p>
          </div>
        </div>

        {/* Product Grid Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-light text-gray-900">
              {showOnlyLow ? 'Varer der skal købes' : 'Dine produkter'}
            </h2>
            {showOnlyLow && (
              <button 
                onClick={() => setShowOnlyLow(false)}
                className="text-xs text-gray-500 hover:text-gray-900 underline mt-1"
              >
                Vis alle produkter
              </button>
            )}
          </div>
          <button 
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 px-6 py-2 bg-gray-900 text-white rounded-full font-medium hover:bg-gray-800 transition-all shadow-sm"
          >
            <Plus size={18} />
            Tilføj produkt
          </button>
        </div>

        {/* Product Grid */}
        <div className="space-y-12">
          {Object.keys(groupedProducts).sort().map(category => {
            const items = groupedProducts[category];
            return (
              <div key={category}>
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-px flex-1 bg-gray-200"></div>
                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-widest">{category}</h3>
                  <div className="h-px flex-1 bg-gray-200"></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {items.map(product => (
                    <ProductCard 
                      key={product.id}
                      product={product}
                      inventoryChecks={inventoryChecks}
                      onDelete={handleDeleteProduct}
                      onUpdateQuantity={handleUpdateQuantity}
                    />
                  ))}
                </div>
              </div>
            );
          })}
          {filteredProducts.length === 0 && (
            <div className="py-20 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Package className="text-gray-400 w-8 h-8" />
              </div>
              <p className="text-gray-500">
                {showOnlyLow 
                  ? 'Ingen varer med lav beholdning. Godt gået!' 
                  : 'Ingen produkter endnu. Kom i gang ved at tilføje dit første produkt!'}
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Add Product Modal */}
      {isAdding && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[32px] p-8 shadow-2xl animate-in fade-in zoom-in duration-200">
            <h3 className="text-2xl font-light text-gray-900 mb-6">Nyt produkt</h3>
            <form onSubmit={handleAddProduct} className="space-y-6">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Navn</label>
                <input 
                  required
                  type="text" 
                  value={newProduct.name}
                  onChange={e => setNewProduct({...newProduct, name: e.target.value})}
                  placeholder="f.eks. Mælk"
                  className="w-full px-4 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-gray-900 transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Mængde</label>
                  <input 
                    required
                    type="number" 
                    value={newProduct.quantity}
                    onChange={e => setNewProduct({...newProduct, quantity: Number(e.target.value)})}
                    className="w-full px-4 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-gray-900 transition-all"
                    min="0"
                    step="0.1"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Enhed</label>
                  <input 
                    required
                    type="text" 
                    value={newProduct.unit}
                    onChange={e => setNewProduct({...newProduct, unit: e.target.value})}
                    placeholder="stk, liter, kg"
                    className="w-full px-4 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-gray-900 transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Kategori</label>
                <select 
                  value={newProduct.category}
                  onChange={e => setNewProduct({...newProduct, category: e.target.value})}
                  className="w-full px-4 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-gray-900 transition-all appearance-none"
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="flex-1 py-3 text-gray-500 font-medium hover:text-gray-900 transition-colors"
                >
                  Annuller
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 bg-gray-900 text-white rounded-2xl font-medium hover:bg-gray-800 transition-all"
                >
                  Opret produkt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function CleaningPage() {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [tasks, setTasks] = useState<CleaningTask[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [isAddingRoom, setIsAddingRoom] = useState(false);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newTask, setNewTask] = useState({ description: '', interval: 7 });

  useEffect(() => {
    if (!user) return;

    const rQuery = query(collection(db, 'rooms'), where('ownerId', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsubscribeRooms = onSnapshot(rQuery, (snapshot) => {
      setRooms(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Room)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'rooms'));

    const tQuery = query(collection(db, 'cleaningTasks'), where('ownerId', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsubscribeTasks = onSnapshot(tQuery, (snapshot) => {
      setTasks(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as CleaningTask)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'cleaningTasks'));

    return () => {
      unsubscribeRooms();
      unsubscribeTasks();
    };
  }, [user]);

  const handleAddRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newRoomName.trim()) return;
    try {
      await addDoc(collection(db, 'rooms'), {
        name: newRoomName,
        ownerId: user.uid,
        createdAt: Timestamp.now()
      });
      setNewRoomName('');
      setIsAddingRoom(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'rooms');
    }
  };

  const handleDeleteRoom = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'rooms', id));
      // Delete associated tasks
      const q = query(collection(db, 'cleaningTasks'), where('roomId', '==', id));
      const snapshot = await getDocs(q);
      await Promise.all(snapshot.docs.map(d => deleteDoc(d.ref)));
      if (selectedRoomId === id) setSelectedRoomId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `rooms/${id}`);
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedRoomId || !newTask.description.trim()) return;
    try {
      await addDoc(collection(db, 'cleaningTasks'), {
        roomId: selectedRoomId,
        description: newTask.description,
        intervalDays: newTask.interval,
        lastCompletedAt: Timestamp.now(),
        ownerId: user.uid,
        createdAt: Timestamp.now()
      });
      setNewTask({ description: '', interval: 7 });
      setIsAddingTask(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'cleaningTasks');
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    try {
      await updateDoc(doc(db, 'cleaningTasks', taskId), {
        lastCompletedAt: Timestamp.now()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `cleaningTasks/${taskId}`);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await deleteDoc(doc(db, 'cleaningTasks', taskId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `cleaningTasks/${taskId}`);
    }
  };

  const selectedRoom = rooms.find(r => r.id === selectedRoomId);
  const roomTasks = tasks.filter(t => t.roomId === selectedRoomId);

  if (selectedRoomId && selectedRoom) {
    return (
      <div className="p-4 sm:p-8 max-w-4xl mx-auto pb-24 sm:pb-8">
        <button 
          onClick={() => setSelectedRoomId(null)}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-900 mb-6 sm:mb-8 transition-colors"
        >
          <ChevronLeft size={20} />
          Tilbage til rum
        </button>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-light text-gray-900">{selectedRoom.name}</h2>
            <p className="text-gray-500">{roomTasks.length} opgaver</p>
          </div>
          <button 
            onClick={() => setIsAddingTask(true)}
            className="flex items-center gap-2 px-6 py-2 bg-gray-900 text-white rounded-full font-medium hover:bg-gray-800 transition-all shadow-sm"
          >
            <Plus size={18} />
            Tilføj opgave
          </button>
        </div>

        <div className="space-y-4">
          {roomTasks.map(task => {
            const nextDue = addDays(task.lastCompletedAt.toDate(), task.intervalDays);
            const daysUntil = differenceInDays(nextDue, new Date());
            const isOverdue = daysUntil < 0;

            return (
              <div key={task.id} className="bg-white p-6 rounded-[24px] shadow-sm border border-gray-100 flex items-center justify-between group">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center",
                    isOverdue ? "bg-red-50 text-red-500" : "bg-emerald-50 text-emerald-500"
                  )}>
                    <Clock size={24} />
                  </div>
                  <div>
                    <h4 className="text-lg font-medium text-gray-900">{task.description}</h4>
                    <p className={cn(
                      "text-sm font-medium",
                      isOverdue ? "text-red-500" : "text-gray-500"
                    )}>
                      {isOverdue 
                        ? `${Math.abs(daysUntil)} dage overskredet` 
                        : `Om ${daysUntil} dage`
                      }
                      <span className="text-gray-300 mx-2">|</span>
                      Hver {task.intervalDays}. dag
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => handleCompleteTask(task.id)}
                    className="px-6 py-2 bg-emerald-500 text-white rounded-full font-medium hover:bg-emerald-600 transition-all shadow-sm flex items-center gap-2"
                  >
                    <CheckCircle2 size={18} />
                    Løst
                  </button>
                  <button 
                    onClick={() => handleDeleteTask(task.id)}
                    className="p-2 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            );
          })}
          {roomTasks.length === 0 && (
            <div className="py-20 text-center bg-white rounded-[32px] border border-dashed border-gray-200">
              <Sparkles className="w-12 h-12 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-400">Ingen opgaver i dette rum endnu.</p>
            </div>
          )}
        </div>

        {isAddingTask && (
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-[32px] p-8 shadow-2xl animate-in fade-in zoom-in duration-200">
              <h3 className="text-2xl font-light text-gray-900 mb-6">Ny opgave</h3>
              <form onSubmit={handleAddTask} className="space-y-6">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Beskrivelse</label>
                  <input 
                    required
                    type="text" 
                    value={newTask.description}
                    onChange={e => setNewTask({...newTask, description: e.target.value})}
                    placeholder="f.eks. Tør håndvask af"
                    className="w-full px-4 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-gray-900 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Interval (dage)</label>
                  <select 
                    value={newTask.interval}
                    onChange={e => setNewTask({...newTask, interval: Number(e.target.value)})}
                    className="w-full px-4 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-gray-900 transition-all appearance-none"
                  >
                    <option value={1}>Hver dag</option>
                    <option value={2}>Hver 2. dag</option>
                    <option value={3}>Hver 3. dag</option>
                    <option value={7}>Hver uge</option>
                    <option value={14}>Hver 14. dag</option>
                    <option value={30}>Hver måned</option>
                  </select>
                </div>
                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsAddingTask(false)}
                    className="flex-1 py-3 text-gray-500 font-medium hover:text-gray-900 transition-colors"
                  >
                    Annuller
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-3 bg-gray-900 text-white rounded-2xl font-medium hover:bg-gray-800 transition-all"
                  >
                    Opret opgave
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto pb-24 sm:pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 sm:mb-12 gap-6">
        <div>
          <h2 className="text-2xl sm:text-4xl font-light text-gray-900">Rengøring</h2>
          <p className="text-sm sm:text-base text-gray-500 mt-1 sm:mt-2">Hold styr på hjemmets renlighed rum for rum.</p>
        </div>
        <button 
          onClick={() => setIsAddingRoom(true)}
          className="flex items-center justify-center gap-2 px-6 sm:px-8 py-2.5 sm:py-3 bg-gray-900 text-white rounded-full font-medium hover:bg-gray-800 transition-all shadow-lg"
        >
          <Plus size={18} className="sm:w-5 sm:h-5" />
          Tilføj rum
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
        {rooms.map(room => {
          const roomTasks = tasks.filter(t => t.roomId === room.id);
          const overdueCount = roomTasks.filter(t => {
            const nextDue = addDays(t.lastCompletedAt.toDate(), t.intervalDays);
            return differenceInDays(nextDue, new Date()) < 0;
          }).length;

          return (
            <div 
              key={room.id}
              className="bg-white rounded-[32px] p-8 shadow-sm border border-gray-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer group relative"
              onClick={() => setSelectedRoomId(room.id)}
            >
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteRoom(room.id);
                }}
                className="absolute top-6 right-6 p-2 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={18} />
              </button>
              <div className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-transform group-hover:scale-110",
                overdueCount > 0 ? "bg-red-50 text-red-500" : "bg-gray-50 text-gray-900"
              )}>
                <Home size={28} />
              </div>
              <h3 className="text-2xl font-medium text-gray-900 mb-2">{room.name}</h3>
              <div className="flex items-center gap-4">
                <p className="text-sm text-gray-500">{roomTasks.length} opgaver</p>
                {overdueCount > 0 && (
                  <span className="px-3 py-1 bg-red-100 text-red-600 text-[10px] font-bold uppercase tracking-wider rounded-full">
                    {overdueCount} mangler
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {rooms.length === 0 && (
          <div className="col-span-full py-32 text-center bg-white rounded-[40px] border border-dashed border-gray-200">
            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <Home className="text-gray-300 w-10 h-10" />
            </div>
            <h3 className="text-xl font-medium text-gray-900 mb-2">Ingen rum endnu</h3>
            <p className="text-gray-500">Start med at tilføje dit første rum, f.eks. "Køkken" eller "Stue".</p>
          </div>
        )}
      </div>

      {isAddingRoom && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[32px] p-8 shadow-2xl animate-in fade-in zoom-in duration-200">
            <h3 className="text-2xl font-light text-gray-900 mb-6">Nyt rum</h3>
            <form onSubmit={handleAddRoom} className="space-y-6">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Navn på rum</label>
                <input 
                  required
                  type="text" 
                  value={newRoomName}
                  onChange={e => setNewRoomName(e.target.value)}
                  placeholder="f.eks. Badeværelse"
                  className="w-full px-4 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-gray-900 transition-all"
                  autoFocus
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => setIsAddingRoom(false)}
                  className="flex-1 py-3 text-gray-500 font-medium hover:text-gray-900 transition-colors"
                >
                  Annuller
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 bg-gray-900 text-white rounded-2xl font-medium hover:bg-gray-800 transition-all"
                >
                  Opret rum
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function MasterListModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const [items, setItems] = useState<MasterShoppingItem[]>([]);
  const [mode, setMode] = useState<'checklist' | 'edit'>('checklist');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [newItem, setNewItem] = useState({ name: '', category: CATEGORIES[0] as string });
  const [groupBy, setGroupBy] = useState<'category'>('category');
  const nameInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user || !isOpen) return;
    const q = query(
      collection(db, 'masterShoppingList'),
      where('ownerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MasterShoppingItem)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'masterShoppingList'));
    return unsubscribe;
  }, [user, isOpen]);

  const handleAddMasterItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      await addDoc(collection(db, 'masterShoppingList'), {
        ...newItem,
        store: '', // Explicitly empty
        ownerId: user.uid,
        createdAt: Timestamp.now()
      });
      setNewItem({ name: '', category: CATEGORIES[0] as string });
      nameInputRef.current?.focus();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'masterShoppingList');
    }
  };

  const handleDeleteMasterItem = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'masterShoppingList', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `masterShoppingList/${id}`);
    }
  };

  const handleTransfer = async () => {
    if (!user) return;
    const itemsToTransfer = items.filter(item => selectedIds.has(item.id));
    try {
      const batch = writeBatch(db);
      itemsToTransfer.forEach(item => {
        const newDocRef = doc(collection(db, 'shoppingList'));
        batch.set(newDocRef, {
          name: item.name,
          store: item.store || '',
          category: item.category || '',
          price: 0,
          isOffer: false,
          isCompleted: false,
          ownerId: user.uid,
          createdAt: Timestamp.now()
        });
      });
      await batch.commit();
      setSelectedIds(new Set());
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'shoppingList');
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const groupedData = useMemo(() => {
    const groups: { [key: string]: MasterShoppingItem[] } = {};
    items.forEach(item => {
      const key = item.category || 'Andet';
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, items]) => ({ name, items }));
  }, [items]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-[60] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-5xl rounded-[40px] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in duration-300">
        <div className="p-8 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-2xl font-medium text-gray-900">Total indkøbsliste</h3>
              <p className="text-sm text-gray-500 mt-1">Varer vi altid køber.</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
              <X size={20} className="text-gray-400" />
            </button>
          </div>
          
          <div className="flex flex-wrap items-center gap-4 justify-between">
            <div className="flex bg-white rounded-full p-1 border border-gray-200 shadow-sm">
              <button 
                onClick={() => setMode('checklist')}
                className={cn(
                  "px-6 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all",
                  mode === 'checklist' ? "bg-gray-900 text-white shadow-md" : "text-gray-400 hover:text-gray-600"
                )}
              >
                Tjekliste
              </button>
              <button 
                onClick={() => setMode('edit')}
                className={cn(
                  "px-6 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all",
                  mode === 'edit' ? "bg-gray-900 text-white shadow-md" : "text-gray-400 hover:text-gray-600"
                )}
              >
                Rediger
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-10">
          {mode === 'edit' && (
            <form onSubmit={handleAddMasterItem} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8 p-6 bg-gray-50 rounded-3xl border border-gray-100">
              <input 
                ref={nameInputRef}
                required
                type="text" 
                placeholder="Varens navn"
                value={newItem.name}
                onChange={e => setNewItem({...newItem, name: e.target.value})}
                className="px-4 py-3 bg-white border-none rounded-2xl focus:ring-2 focus:ring-gray-900 transition-all text-sm"
              />
              <div className="flex gap-2">
                <select 
                  value={newItem.category}
                  onChange={e => setNewItem({...newItem, category: e.target.value})}
                  className="flex-1 px-4 py-3 bg-white border-none rounded-2xl focus:ring-2 focus:ring-gray-900 transition-all text-sm appearance-none"
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                  <option value="Andet">Andet</option>
                </select>
                <button type="submit" className="p-3 bg-gray-900 text-white rounded-2xl hover:bg-gray-800 transition-all">
                  <Plus size={20} />
                </button>
              </div>
            </form>
          )}

          {groupedData.map((group) => (
            <div key={group.name} className="space-y-6">
              <div className="flex items-center gap-3">
                <h4 className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">{group.name}</h4>
                <div className="h-px flex-1 bg-gray-100" />
              </div>

              <div className="space-y-8">
                <div className="grid grid-cols-1 gap-2">
                  {group.items?.map(item => (
                    <MasterItemRow 
                      key={item.id} 
                      item={item} 
                      mode={mode} 
                      isSelected={selectedIds.has(item.id)} 
                      onToggle={() => toggleSelect(item.id)} 
                      onDelete={() => handleDeleteMasterItem(item.id)} 
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}

          {items.length === 0 && (
            <div className="py-20 text-center">
              <p className="text-gray-400">Ingen varer på stamlisten endnu.</p>
            </div>
          )}
        </div>

        <div className="p-4 sm:p-8 border-t border-gray-100 bg-gray-50/50 flex gap-3 sm:gap-4">
          <button 
            onClick={onClose}
            className="flex-1 py-3 sm:py-4 text-gray-500 text-sm sm:text-base font-medium hover:text-gray-900 transition-colors"
          >
            Luk
          </button>
          {mode === 'checklist' && selectedIds.size > 0 && (
            <button 
              onClick={handleTransfer}
              className="flex-[2] py-3 sm:py-4 bg-gray-900 text-white rounded-xl sm:rounded-2xl text-sm sm:text-base font-medium hover:bg-gray-800 transition-all shadow-xl flex items-center justify-center gap-2"
            >
              Tilføj {selectedIds.size} {selectedIds.size === 1 ? 'vare' : 'varer'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const MasterItemRow: React.FC<{
  item: MasterShoppingItem;
  mode: 'checklist' | 'edit';
  isSelected: boolean;
  onToggle: () => void;
  onDelete: () => void | Promise<void>;
}> = ({ item, mode, isSelected, onToggle, onDelete }) => {
  return (
    <div 
      onClick={() => mode === 'checklist' && onToggle()}
      className={cn(
        "flex items-center justify-between p-2 sm:p-4 rounded-xl sm:rounded-2xl border transition-all duration-200 cursor-pointer",
        mode === 'checklist' && isSelected ? "bg-gray-900 border-gray-900 text-white shadow-lg scale-[1.01]" : "bg-white border-gray-100 hover:border-gray-200"
      )}
    >
      <div className="flex items-center gap-2 sm:gap-4 flex-1">
        {mode === 'checklist' && (
          <div className={cn(
            "w-3.5 h-3.5 sm:w-5 sm:h-5 rounded-full border-2 flex items-center justify-center transition-all",
            isSelected ? "bg-white border-white text-gray-900" : "border-gray-200"
          )}>
            {isSelected && <Check size={8} strokeWidth={4} className="sm:w-3 sm:h-3" />}
          </div>
        )}
        <div>
          <p className="font-medium text-[11px] sm:text-sm">{item.name}</p>
          <div className="flex gap-1.5 mt-0.5">
            <span className={cn("text-[7px] sm:text-[9px] uppercase tracking-wider font-bold", isSelected ? "text-gray-400" : "text-gray-400")}>{item.category || 'Andet'}</span>
          </div>
        </div>
      </div>
      {mode === 'edit' && (
        <div className="flex items-center gap-2">
          <select 
            value={item.category || 'Andet'}
            onClick={(e) => e.stopPropagation()}
            onChange={async (e) => {
              e.stopPropagation();
              try {
                await updateDoc(doc(db, 'masterShoppingList', item.id), {
                  category: e.target.value
                });
              } catch (err) {
                handleFirestoreError(err, OperationType.UPDATE, `masterShoppingList/${item.id}`);
              }
            }}
            className="text-[10px] sm:text-xs bg-gray-50 border-none rounded-lg px-2 py-1 focus:ring-1 focus:ring-gray-900 appearance-none cursor-pointer"
          >
            {CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
            <option value="Andet">Andet</option>
          </select>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-2 text-gray-300 hover:text-red-500 transition-colors"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}
    </div>
  );
};

const StoreSection: React.FC<{ 
  storeGroup: any; 
  onToggle: any; 
  onEdit: any; 
  onDelete: any;
  setStoreCategoryToggles: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  isShoppingMode?: boolean;
}> = ({ storeGroup, onToggle, onEdit, onDelete, setStoreCategoryToggles, isShoppingMode }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `store-${storeGroup.storeName}`,
    data: {
      type: 'store',
      storeName: storeGroup.storeName
    }
  });

  return (
    <div 
      ref={setNodeRef}
      className={cn(
        "space-y-6 sm:space-y-8 p-4 sm:p-6 rounded-[40px] transition-all duration-300",
        isOver ? "bg-gray-50 ring-2 ring-gray-200 ring-inset scale-[1.01]" : "",
        isShoppingMode && "p-4 sm:p-8 bg-white/50 border border-gray-100 shadow-sm"
      )}
    >
      <div className={cn(
        "flex items-center justify-between pb-4",
        !isShoppingMode && "border-b border-gray-100"
      )}>
        <div className="flex items-center gap-4">
          <div className={cn(
            "w-10 h-10 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shadow-lg transition-all",
            isShoppingMode ? "bg-emerald-500 text-white" : "bg-gray-900 text-white"
          )}>
            <Store size={isShoppingMode ? 28 : 20} />
          </div>
          <div>
            <h3 className={cn(
              "font-medium text-gray-900",
              isShoppingMode ? "text-2xl sm:text-4xl font-bold" : "text-xl sm:text-2xl"
            )}>{storeGroup.storeName}</h3>
            {isShoppingMode && (
              <p className="text-sm sm:text-lg text-gray-500 font-medium">
                {storeGroup.items.length} {storeGroup.items.length === 1 ? 'vare' : 'varer'}
              </p>
            )}
          </div>
        </div>
        {!isShoppingMode && (
          <button 
            onClick={() => setStoreCategoryToggles(prev => ({
              ...prev,
              [storeGroup.storeName]: !prev[storeGroup.storeName]
            }))}
            className={cn(
              "px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all border",
              storeGroup.showCategories ? "bg-gray-100 border-gray-200 text-gray-900" : "bg-white border-gray-100 text-gray-400"
            )}
          >
            {storeGroup.showCategories ? "Viser kategorier" : "Vis kategorier"}
          </button>
        )}
      </div>
      
      <div className="space-y-8 sm:space-y-12 min-h-[50px]">
        {storeGroup.showCategories ? (
          storeGroup.categories.length > 0 ? (
            storeGroup.categories.map((cat: any) => (
              <div key={cat.name} className="space-y-4">
                {!isShoppingMode && (
                  <div className="flex items-center gap-3">
                    <h4 className="text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] text-gray-400">{cat.name}</h4>
                    <div className="h-px flex-1 bg-gray-100" />
                  </div>
                )}
                <SortableContext items={cat.items.map((i: any) => i.id)} strategy={verticalListSortingStrategy}>
                  <div className={cn(
                    "grid grid-cols-1 gap-2 sm:gap-3",
                    isShoppingMode && "gap-4 sm:gap-6"
                  )}>
                    {cat.items.map((item: any) => (
                      <ShoppingItemRow 
                        key={item.id} 
                        item={item} 
                        onToggle={onToggle} 
                        onEdit={onEdit} 
                        onDelete={onDelete} 
                        isShoppingMode={isShoppingMode}
                      />
                    ))}
                  </div>
                </SortableContext>
              </div>
            ))
          ) : (
            <div className="py-8 text-center border-2 border-dashed border-gray-100 rounded-[32px]">
              <p className="text-sm text-gray-400">Træk varer hertil</p>
            </div>
          )
        ) : (
          storeGroup.items.length > 0 ? (
            <SortableContext items={storeGroup.items.map((i: any) => i.id)} strategy={verticalListSortingStrategy}>
              <div className={cn(
                "grid grid-cols-1 gap-2 sm:gap-3",
                isShoppingMode && "gap-4 sm:gap-6"
              )}>
                {storeGroup.items.map((item: any) => (
                  <ShoppingItemRow 
                    key={item.id} 
                    item={item} 
                    onToggle={onToggle} 
                    onEdit={onEdit} 
                    onDelete={onDelete} 
                    isShoppingMode={isShoppingMode}
                  />
                ))}
              </div>
            </SortableContext>
          ) : (
            <div className="py-8 text-center border-2 border-dashed border-gray-100 rounded-[32px]">
              <p className="text-sm text-gray-400">Træk varer hertil</p>
            </div>
          )
        )}
      </div>
    </div>
  );
};

function ShoppingListPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingItem, setEditingItem] = useState<ShoppingListItem | null>(null);
  const [isMasterListOpen, setIsMasterListOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isShoppingMode, setIsShoppingMode] = useState(false);
  const [storeCategoryToggles, setStoreCategoryToggles] = useState<Record<string, boolean>>({
    'Netto': true,
    'Rema': true,
    'Kvickly': true,
    'Lidl': true
  });
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const [newItem, setNewItem] = useState({
    name: '',
    store: STORES[0] as string,
    category: CATEGORIES[1], // Frugt & Grønt
    price: '',
    isOffer: false
  });

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'shoppingList'),
      where('ownerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ShoppingListItem)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'shoppingList'));
    return unsubscribe;
  }, [user]);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      if (editingItem) {
        await updateDoc(doc(db, 'shoppingList', editingItem.id), {
          ...newItem,
          price: newItem.price ? Number(newItem.price) : 0
        });
        setEditingItem(null);
      } else {
        await addDoc(collection(db, 'shoppingList'), {
          ...newItem,
          price: newItem.price ? Number(newItem.price) : 0,
          isCompleted: false,
          ownerId: user.uid,
          createdAt: Timestamp.now()
        });
      }
      setNewItem({ name: '', store: '', category: '', price: '', isOffer: false });
      setIsAdding(false);
    } catch (error) {
      handleFirestoreError(error, editingItem ? OperationType.UPDATE : OperationType.CREATE, 'shoppingList');
    }
  };

  const startEdit = (item: ShoppingListItem) => {
    setEditingItem(item);
    setNewItem({
      name: item.name,
      store: item.store || '',
      category: item.category || '',
      price: item.price?.toString() || '',
      isOffer: item.isOffer || false
    });
    setIsAdding(true);
  };

  const toggleComplete = async (item: ShoppingListItem) => {
    try {
      const newStatus = !item.isCompleted;
      await updateDoc(doc(db, 'shoppingList', item.id), {
        isCompleted: newStatus
      });

      // Record stat if item is now completed
      if (newStatus && user) {
        await addDoc(collection(db, 'shoppingStats'), {
          itemName: item.name,
          store: item.store || 'Andre',
          category: item.category || 'Andet',
          price: item.price || 0,
          timestamp: Timestamp.now(),
          ownerId: user.uid
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `shoppingList/${item.id}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'shoppingList', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `shoppingList/${id}`);
    }
  };

  const deleteItems = async (onlyCompleted: boolean) => {
    try {
      const batch = writeBatch(db);
      const itemsToDelete = onlyCompleted ? items.filter(i => i.isCompleted) : items;
      
      itemsToDelete.forEach(item => {
        batch.delete(doc(db, 'shoppingList', item.id));
      });

      await batch.commit();
      setIsDeleteModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'shoppingList/batch');
    }
  };

  const groupedData = useMemo(() => {
    const MAIN_STORES = ['Netto', 'Rema', 'Kvickly', 'Lidl'];
    const storesData = MAIN_STORES.map(storeName => {
      let storeItems = items.filter(item => item.store === storeName);
      
      // In shopping mode, we might want to filter out completed items or show them differently
      // For now, let's just keep them but the UI will handle the "simplified" look
      
      const showCategories = isShoppingMode ? false : (storeCategoryToggles[storeName] ?? true);
      const order = STORE_ORDERS[storeName] || [];

      if (showCategories) {
        const categoriesMap: Record<string, ShoppingListItem[]> = {};
        storeItems.forEach(item => {
          const cat = item.category || 'Andet';
          if (!categoriesMap[cat]) categoriesMap[cat] = [];
          categoriesMap[cat].push(item);
        });

        const categories = Object.entries(categoriesMap)
          .sort(([a], [b]) => {
            const indexA = order.indexOf(a);
            const indexB = order.indexOf(b);
            if (indexA === -1 && indexB === -1) return a.localeCompare(b);
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
          })
          .map(([name, items]) => ({ name, items }));

        return { storeName, showCategories, categories, items: storeItems };
      } else {
        return { storeName, showCategories, categories: [], items: storeItems };
      }
    });

    // Add "Andre" store for items without a store or in other stores
    const otherItems = items.filter(item => !item.store || !MAIN_STORES.includes(item.store as any));
    if (otherItems.length > 0) {
      storesData.push({
        storeName: 'Andre',
        showCategories: true,
        categories: [{ name: 'Andet', items: otherItems }],
        items: otherItems
      });
    }

    return storesData;
  }, [items, storeCategoryToggles]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeItem = items.find(i => i.id === active.id);
    if (!activeItem) return;

    // Case 1: Dropped over another item
    const overItem = items.find(i => i.id === over.id);
    if (overItem && activeItem.id !== overItem.id) {
      try {
        await updateDoc(doc(db, 'shoppingList', activeItem.id), {
          store: overItem.store,
          category: overItem.category,
          createdAt: Timestamp.now()
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `shoppingList/${activeItem.id}`);
      }
    } 
    // Case 2: Dropped over a store section
    else if (over.data.current?.type === 'store') {
      const targetStore = over.data.current.storeName;
      if (activeItem.store !== targetStore) {
        try {
          await updateDoc(doc(db, 'shoppingList', activeItem.id), {
            store: targetStore,
            createdAt: Timestamp.now()
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `shoppingList/${activeItem.id}`);
        }
      }
    }
  };

  return (
    <div className={cn("p-4 sm:p-8 max-w-5xl mx-auto transition-all duration-500", isShoppingMode && "bg-gray-50 min-h-screen")}>
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 md:mb-12 gap-6">
        <div>
          <h2 className="text-2xl sm:text-4xl font-light text-gray-900">
            {isShoppingMode ? '🛒 Shopping Mode' : 'Indkøbsliste'}
          </h2>
          <p className="text-sm sm:text-base text-gray-500 mt-1 sm:mt-2">
            {isShoppingMode ? 'Fokus på indkøb. Tryk på varer for at færdiggøre.' : 'Planlæg dine indkøb og hold styr på budgettet.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-4">
          <button 
            onClick={() => setIsShoppingMode(!isShoppingMode)}
            className={cn(
              "flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 rounded-full text-sm sm:text-base font-medium transition-all shadow-sm border",
              isShoppingMode 
                ? "bg-emerald-500 border-emerald-400 text-white hover:bg-emerald-600" 
                : "bg-white border-gray-100 text-gray-900 hover:bg-gray-50"
            )}
          >
            <ShoppingCart size={18} className="sm:w-5 sm:h-5" />
            {isShoppingMode ? 'Afslut Shopping' : 'Start Shopping'}
          </button>
          {!isShoppingMode && (
            <>
              <button 
                onClick={() => setIsMasterListOpen(true)}
                className="flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 bg-white border border-gray-100 text-gray-900 rounded-full text-sm sm:text-base font-medium hover:bg-gray-50 transition-all shadow-sm"
              >
                <ListChecks size={18} className="sm:w-5 sm:h-5" />
                <span className="hidden xs:inline">Total liste</span>
                <span className="xs:hidden">Liste</span>
              </button>
              <button 
                onClick={() => setIsDeleteModalOpen(true)}
                className="flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 bg-white border border-red-100 text-red-600 rounded-full text-sm sm:text-base font-medium hover:bg-red-50 transition-all shadow-sm"
              >
                <Trash2 size={18} className="sm:w-5 sm:h-5" />
                Slet
              </button>
              <button 
                onClick={() => {
                  setEditingItem(null);
                  setNewItem({ name: '', store: STORES[0], category: CATEGORIES[1], price: '', isOffer: false });
                  setIsAdding(true);
                }}
                className="flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 bg-gray-900 text-white rounded-full text-sm sm:text-base font-medium hover:bg-gray-800 transition-all shadow-lg"
              >
                <Plus size={18} className="sm:w-5 sm:h-5" />
                Tilføj
              </button>
            </>
          )}
        </div>
      </div>

      <DndContext 
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className={cn("grid grid-cols-1 gap-12 sm:gap-16", isShoppingMode && "gap-8 sm:gap-10")}>
          {groupedData.map((storeGroup) => (
            <StoreSection 
              key={storeGroup.storeName} 
              storeGroup={storeGroup}
              onToggle={toggleComplete}
              onEdit={startEdit}
              onDelete={handleDelete}
              setStoreCategoryToggles={setStoreCategoryToggles}
              isShoppingMode={isShoppingMode}
            />
          ))}
        </div>
      </DndContext>

      {/* Shopping Mode Footer */}
      {isShoppingMode && items.some(i => i.isCompleted) && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 w-full max-w-xs px-4">
          <button 
            onClick={() => deleteItems(true)}
            className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold shadow-2xl hover:bg-emerald-700 transition-all flex items-center justify-center gap-3 animate-in slide-in-from-bottom-4"
          >
            <Check size={20} />
            Færdig med at handle ({items.filter(i => i.isCompleted).length})
          </button>
        </div>
      )}

      {/* Total Footer */}
      {items.length > 0 && (
        <div className="mt-8 sm:mt-12 p-4 sm:p-8 bg-gray-900 rounded-2xl sm:rounded-[32px] text-white flex items-center justify-center shadow-xl">
          <div className="text-center">
            <p className="text-gray-400 text-[10px] sm:text-xs font-bold uppercase tracking-widest mb-1">Varer tilbage</p>
            <p className="text-2xl sm:text-4xl font-light">{items.filter(i => !i.isCompleted).length}</p>
          </div>
        </div>
      )}

      {isAdding && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[32px] p-8 shadow-2xl animate-in fade-in zoom-in duration-200">
            <h3 className="text-2xl font-light text-gray-900 mb-6">{editingItem ? 'Rediger vare' : 'Tilføj vare'}</h3>
            <form onSubmit={handleAddItem} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Varens navn</label>
                <input 
                  required
                  type="text" 
                  value={newItem.name}
                  onChange={e => setNewItem({...newItem, name: e.target.value})}
                  placeholder="f.eks. Mælk"
                  className="w-full px-4 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-gray-900 transition-all"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Butik</label>
                  <select 
                    value={newItem.store}
                    onChange={e => setNewItem({...newItem, store: e.target.value})}
                    className="w-full px-4 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-gray-900 transition-all appearance-none"
                  >
                    {STORES.map(store => (
                      <option key={store} value={store}>{store}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Kategori</label>
                  <select 
                    value={newItem.category}
                    onChange={e => setNewItem({...newItem, category: e.target.value})}
                    className="w-full px-4 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-gray-900 transition-all appearance-none"
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    <option value="Andet">Andet</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Pris (kr.)</label>
                  <input 
                    type="number" 
                    value={newItem.price}
                    onChange={e => setNewItem({...newItem, price: e.target.value})}
                    placeholder="0"
                    className="w-full px-4 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-gray-900 transition-all"
                  />
                </div>
                <div className="flex items-end pb-3">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div 
                      onClick={() => setNewItem({...newItem, isOffer: !newItem.isOffer})}
                      className={cn(
                        "w-10 h-6 rounded-full transition-all relative",
                        newItem.isOffer ? "bg-red-500" : "bg-gray-200"
                      )}
                    >
                      <div className={cn(
                        "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                        newItem.isOffer ? "left-5" : "left-1"
                      )} />
                    </div>
                    <span className="text-sm font-medium text-gray-600">Tilbud?</span>
                  </label>
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => {
                    setIsAdding(false);
                    setEditingItem(null);
                  }}
                  className="flex-1 py-3 text-gray-500 font-medium hover:text-gray-900 transition-colors"
                >
                  Annuller
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 bg-gray-900 text-white rounded-2xl font-medium hover:bg-gray-800 transition-all"
                >
                  {editingItem ? 'Gem ændringer' : 'Tilføj til liste'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <Trash2 className="text-red-500 w-8 h-8" />
            </div>
            <h3 className="text-2xl font-light text-gray-900 text-center mb-2">Slet varer</h3>
            <p className="text-gray-500 text-center mb-8">Vælg hvad du vil slette fra din indkøbsliste.</p>
            
            <div className="space-y-3">
              <button 
                onClick={() => deleteItems(true)}
                className="w-full px-6 py-4 bg-white border border-gray-100 text-gray-900 rounded-2xl font-medium hover:bg-gray-50 transition-all flex items-center justify-between group"
              >
                <span>Slet færdige varer</span>
                <span className="text-xs bg-gray-100 px-2 py-1 rounded-lg text-gray-500 group-hover:bg-gray-200 transition-all">
                  {items.filter(i => i.isCompleted).length} stk
                </span>
              </button>
              <button 
                onClick={() => deleteItems(false)}
                className="w-full px-6 py-4 bg-red-50 text-red-600 rounded-2xl font-medium hover:bg-red-100 transition-all flex items-center justify-between group"
              >
                <span>Slet ALT</span>
                <span className="text-xs bg-red-100 px-2 py-1 rounded-lg text-red-500 group-hover:bg-red-200 transition-all">
                  {items.length} stk
                </span>
              </button>
              <button 
                onClick={() => setIsDeleteModalOpen(false)}
                className="w-full px-6 py-4 text-gray-400 font-medium hover:text-gray-600 transition-all"
              >
                Annuller
              </button>
            </div>
          </div>
        </div>
      )}

      <MasterListModal 
        isOpen={isMasterListOpen} 
        onClose={() => setIsMasterListOpen(false)} 
      />
    </div>
  );
}

const ShoppingItemRow: React.FC<{ 
  item: ShoppingListItem; 
  onToggle: (i: ShoppingListItem) => void | Promise<void>;
  onEdit: (i: ShoppingListItem) => void;
  onDelete: (id: string) => void | Promise<void>;
  isShoppingMode?: boolean;
}> = ({ item, onToggle, onEdit, onDelete, isShoppingMode }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: item.id, disabled: isShoppingMode });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    position: 'relative' as const,
  };

  return (
    <div 
      ref={setNodeRef}
      style={style}
      {...(!isShoppingMode ? attributes : {})}
      {...(!isShoppingMode ? listeners : {})}
      onClick={() => isShoppingMode && onToggle(item)}
      className={cn(
        "group flex items-center justify-between p-2 sm:p-5 bg-white rounded-xl sm:rounded-[24px] border transition-all duration-300",
        !isShoppingMode && "touch-none",
        isShoppingMode && "p-4 sm:p-8 cursor-pointer active:scale-95",
        item.isCompleted ? "opacity-50 border-transparent bg-gray-50" : "border-gray-100 hover:shadow-md hover:border-gray-200",
        isDragging && "shadow-2xl border-gray-900 opacity-50 scale-105"
      )}
    >
      <div className="flex items-center gap-2 sm:gap-4 flex-1">
        <button 
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(item);
          }}
          className={cn(
            "w-5 h-5 sm:w-7 sm:h-7 rounded-full border-2 flex items-center justify-center transition-all",
            isShoppingMode && "w-8 h-8 sm:w-12 sm:h-12 border-4",
            item.isCompleted ? "bg-emerald-500 border-emerald-500 text-white" : "border-gray-200 hover:border-gray-400"
          )}
        >
          {item.isCompleted && <CheckCircle2 size={isShoppingMode ? 20 : 12} className="sm:w-6 sm:h-6" />}
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className={cn(
              "text-xs sm:text-lg font-medium transition-all",
              isShoppingMode && "text-lg sm:text-2xl",
              item.isCompleted ? "line-through text-gray-400" : "text-gray-900"
            )}>
              {item.name}
            </span>
            {item.isOffer && (
              <span className="px-1 py-0.5 bg-red-100 text-red-600 text-[7px] sm:text-[10px] font-bold uppercase tracking-wider rounded-md">
                Tilbud
              </span>
            )}
          </div>
          {!isShoppingMode && (
            <div className="flex items-center gap-2 sm:gap-3 mt-0.5 sm:mt-1">
              <span className="text-[9px] sm:text-xs text-gray-400 flex items-center gap-1">
                <Tag size={9} className="sm:w-3 sm:h-3" /> {item.category || 'Ingen kategori'}
              </span>
            </div>
          )}
        </div>
      </div>
      
      {!isShoppingMode && (
        <div className="flex items-center gap-1 sm:gap-4">
          {item.price > 0 && (
            <span className="text-xs sm:text-lg font-light text-gray-900 mr-1 sm:mr-2 whitespace-nowrap">{item.price} kr.</span>
          )}
          <div className="flex items-center md:opacity-0 md:group-hover:opacity-100 transition-opacity">
            <button 
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onEdit(item);
              }}
              className="p-1.5 sm:p-3 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all"
            >
              <Edit2 size={14} className="sm:w-5 sm:h-5" />
            </button>
            <button 
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(item.id);
              }}
              className="p-1.5 sm:p-3 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
            >
              <Trash2 size={14} className="sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

function StatisticsPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<ShoppingStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'shoppingStats'),
      where('ownerId', '==', user.uid),
      orderBy('timestamp', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setStats(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ShoppingStat)));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'shoppingStats'));
    return unsubscribe;
  }, [user]);

  const storeData = useMemo(() => {
    const counts: Record<string, number> = {};
    stats.forEach(s => {
      counts[s.store] = (counts[s.store] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [stats]);

  const itemData = useMemo(() => {
    const counts: Record<string, number> = {};
    stats.forEach(s => {
      counts[s.itemName] = (counts[s.itemName] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [stats]);

  const spendingData = useMemo(() => {
    const daily: Record<string, number> = {};
    stats.forEach(s => {
      const date = format(s.timestamp.toDate(), 'dd/MM');
      daily[date] = (daily[date] || 0) + (s.price || 0);
    });
    return Object.entries(daily)
      .map(([date, amount]) => ({ date, amount }))
      .reverse();
  }, [stats]);

  const handleDeleteStat = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'shoppingStats', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `shoppingStats/${id}`);
    }
  };

  const COLORS = ['#111827', '#374151', '#4B5563', '#6B7280', '#9CA3AF'];

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto space-y-8 sm:space-y-12">
      <div>
        <h2 className="text-2xl sm:text-4xl font-light text-gray-900">Statistik</h2>
        <p className="text-sm sm:text-base text-gray-500 mt-1 sm:mt-2">Dine indkøbsvaner og forbrug over tid.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
        <div className="bg-white p-6 sm:p-8 rounded-[32px] border border-gray-100 shadow-sm">
          <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center mb-4">
            <ShoppingCart className="text-gray-900 w-6 h-6" />
          </div>
          <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">Total varer købt</p>
          <p className="text-3xl font-light text-gray-900">{stats.length}</p>
        </div>
        <div className="bg-white p-6 sm:p-8 rounded-[32px] border border-gray-100 shadow-sm">
          <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center mb-4">
            <Wallet className="text-gray-900 w-6 h-6" />
          </div>
          <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">Total forbrug</p>
          <p className="text-3xl font-light text-gray-900">{stats.reduce((acc, s) => acc + (s.price || 0), 0)} kr.</p>
        </div>
        <div className="bg-white p-6 sm:p-8 rounded-[32px] border border-gray-100 shadow-sm">
          <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center mb-4">
            <Store className="text-gray-900 w-6 h-6" />
          </div>
          <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">Mest brugte butik</p>
          <p className="text-3xl font-light text-gray-900">
            {storeData.sort((a, b) => b.value - a.value)[0]?.name || '-'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
        {/* Store Distribution */}
        <div className="bg-white p-6 sm:p-10 rounded-[40px] border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-8">
            <PieChartIcon className="text-gray-400 w-5 h-5" />
            <h3 className="text-lg font-medium text-gray-900">Butiksfordeling</h3>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={storeData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {storeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Items */}
        <div className="bg-white p-6 sm:p-10 rounded-[40px] border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-8">
            <TrendingUp className="text-gray-400 w-5 h-5" />
            <h3 className="text-lg font-medium text-gray-900">Mest købte varer</h3>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={itemData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  width={100} 
                  axisLine={false} 
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                />
                <Tooltip 
                  cursor={{ fill: '#f9fafb' }}
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="value" fill="#111827" radius={[0, 8, 8, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Spending Over Time */}
        <div className="bg-white p-6 sm:p-10 rounded-[40px] border border-gray-100 shadow-sm lg:col-span-2">
          <div className="flex items-center gap-3 mb-8">
            <Activity className="text-gray-400 w-5 h-5" />
            <h3 className="text-lg font-medium text-gray-900">Forbrug over tid</h3>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={spendingData}>
                <defs>
                  <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#111827" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#111827" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                  dx={-10}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="amount" 
                  stroke="#111827" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorAmount)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Observations */}
      <div className="bg-white p-6 sm:p-10 rounded-[40px] border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <History className="text-gray-400 w-5 h-5" />
            <h3 className="text-lg font-medium text-gray-900">Seneste observationer</h3>
          </div>
          <span className="text-xs font-bold uppercase tracking-widest text-gray-400">{stats.length} i alt</span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left border-b border-gray-50">
                <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Dato</th>
                <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Vare</th>
                <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Butik</th>
                <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Pris</th>
                <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-right">Handlinger</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {stats.slice(0, 50).map((stat) => (
                <tr key={stat.id} className="group hover:bg-gray-50 transition-colors">
                  <td className="py-4 text-sm text-gray-500">
                    {format(stat.timestamp.toDate(), 'dd/MM HH:mm')}
                  </td>
                  <td className="py-4 text-sm font-medium text-gray-900">
                    {stat.itemName}
                  </td>
                  <td className="py-4 text-sm text-gray-500">
                    <span className="px-2 py-1 bg-gray-100 rounded-lg text-[10px] font-bold uppercase tracking-wider">
                      {stat.store}
                    </span>
                  </td>
                  <td className="py-4 text-sm text-gray-900 font-medium">
                    {stat.price} kr.
                  </td>
                  <td className="py-4 text-right">
                    <button 
                      onClick={() => handleDeleteStat(stat.id)}
                      className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                      title="Slet observation"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {stats.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-400 italic">
                    Ingen data endnu.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AppContent() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<'lager' | 'rengoring' | 'indkob' | 'statistik'>('lager');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5]">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-12 h-12 bg-gray-200 rounded-xl mb-4"></div>
          <div className="h-4 w-24 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!user) return <Login />;

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-[#f5f5f5]">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex w-64 bg-white border-r border-gray-100 flex-col sticky top-0 h-screen">
        <div className="p-6 flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center">
            <Home className="text-white w-5 h-5" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900">Mit Hjem</h1>
        </div>

        <nav className="flex-1 px-4 space-y-2">
          <button 
            onClick={() => setActiveTab('lager')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all",
              activeTab === 'lager' ? "bg-gray-900 text-white shadow-md" : "text-gray-500 hover:bg-gray-50"
            )}
          >
            <Package size={20} />
            <span className="font-medium">Lager</span>
          </button>
          <button 
            onClick={() => setActiveTab('rengoring')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all",
              activeTab === 'rengoring' ? "bg-gray-900 text-white shadow-md" : "text-gray-500 hover:bg-gray-50"
            )}
          >
            <Sparkles size={20} />
            <span className="font-medium">Rengøring</span>
          </button>
          <button 
            onClick={() => setActiveTab('indkob')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all",
              activeTab === 'indkob' ? "bg-gray-900 text-white shadow-md" : "text-gray-500 hover:bg-gray-50"
            )}
          >
            <ShoppingCart size={20} />
            <span className="font-medium">Indkøb</span>
          </button>
          <button 
            onClick={() => setActiveTab('statistik')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all",
              activeTab === 'statistik' ? "bg-gray-900 text-white shadow-md" : "text-gray-500 hover:bg-gray-50"
            )}
          >
            <BarChart3 size={20} />
            <span className="font-medium">Statistik</span>
          </button>
        </nav>

        <div className="p-4 border-t border-gray-50">
          <button 
            onClick={() => signOut(auth)}
            className="w-full flex items-center gap-3 px-4 py-3 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all"
          >
            <LogOut size={20} />
            <span className="font-medium">Log ud</span>
          </button>
        </div>
      </aside>

      {/* Bottom Nav - Mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-6 py-3 flex justify-between items-center z-40">
        <button 
          onClick={() => setActiveTab('lager')}
          className={cn(
            "flex flex-col items-center gap-1",
            activeTab === 'lager' ? "text-gray-900" : "text-gray-400"
          )}
        >
          <Package size={20} />
          <span className="text-[10px] font-bold uppercase tracking-wider">Lager</span>
        </button>
        <button 
          onClick={() => setActiveTab('rengoring')}
          className={cn(
            "flex flex-col items-center gap-1",
            activeTab === 'rengoring' ? "text-gray-900" : "text-gray-400"
          )}
        >
          <Sparkles size={20} />
          <span className="text-[10px] font-bold uppercase tracking-wider">Rent</span>
        </button>
        <button 
          onClick={() => setActiveTab('indkob')}
          className={cn(
            "flex flex-col items-center gap-1",
            activeTab === 'indkob' ? "text-gray-900" : "text-gray-400"
          )}
        >
          <ShoppingCart size={20} />
          <span className="text-[10px] font-bold uppercase tracking-wider">Indkøb</span>
        </button>
        <button 
          onClick={() => setActiveTab('statistik')}
          className={cn(
            "flex flex-col items-center gap-1",
            activeTab === 'statistik' ? "text-gray-900" : "text-gray-400"
          )}
        >
          <BarChart3 size={20} />
          <span className="text-[10px] font-bold uppercase tracking-wider">Stats</span>
        </button>
        <button 
          onClick={() => signOut(auth)}
          className="flex flex-col items-center gap-1 text-gray-400"
        >
          <LogOut size={20} />
          <span className="text-[10px] font-bold uppercase tracking-wider">Ud</span>
        </button>
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        {activeTab === 'lager' && <Dashboard />}
        {activeTab === 'rengoring' && <CleaningPage />}
        {activeTab === 'indkob' && <ShoppingListPage />}
        {activeTab === 'statistik' && <StatisticsPage />}
      </main>
    </div>
  );
}

export default function App() {
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      setError(event.error);
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (error) return <GlobalErrorDisplay error={error} />;

  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
