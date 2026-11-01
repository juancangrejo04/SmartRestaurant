import React, { useState } from 'react';
import { useI18n } from '../i18n/i18nContext';
import { store } from '../domain/store';
import { MenuItem, Table, Branch } from '../types';
import {
  UtensilsCrossed,
  Store,
  LayoutGrid,
  Plus,
  Check,
  X,
  Edit2,
  Trash2,
  Clock,
  QrCode,
  DollarSign,
  AlertCircle,
  Image as ImageIcon,
} from 'lucide-react';

export const MenuManagementView: React.FC = () => {
  const { t, formatCurrency, currentMarket } = useI18n();
  const activeTenant = store.getActiveTenant();
  const activeBranch = store.getActiveBranch();
  const [activeTab, setActiveTab] = useState<'dishes' | 'tables' | 'branches'>('dishes');

  const [dishes, setDishes] = useState<MenuItem[]>(() => store.getMenuItems(undefined, activeTenant.id));
  const [tables, setTables] = useState<Table[]>(() => store.getTables(activeBranch.id));
  const [branches, setBranches] = useState<Branch[]>(() => store.getBranches(activeTenant.id));

  // Dish Modals State
  const [isDishModalOpen, setIsDishModalOpen] = useState(false);
  const [editingDish, setEditingDish] = useState<MenuItem | null>(null);
  const [dishName, setDishName] = useState('');
  const [dishDesc, setDishDesc] = useState('');
  const [dishPrice, setDishPrice] = useState<number>(35000);
  const [dishTime, setDishTime] = useState<number>(15);
  const [dishCategory, setDishCategory] = useState<string>('');
  const [dishImage, setDishImage] = useState<string>('');

  // Table Modals State
  const [isTableModalOpen, setIsTableModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<Table | null>(null);
  const [tableNumber, setTableNumber] = useState<number>(1);
  const [tableCapacity, setTableCapacity] = useState<number>(4);
  const [tableArea, setTableArea] = useState<'TERRACE' | 'MAIN_HALL' | 'VIP_LOUNGE' | 'BAR'>('MAIN_HALL');

  // Branch Modal State
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchName, setBranchName] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchOpen, setBranchOpen] = useState('12:00');
  const [branchClose, setBranchClose] = useState('23:00');
  const [branchMaxCap, setBranchMaxCap] = useState(80);

  const categories = store.getMenuCategories(activeTenant.id);

  const refreshState = () => {
    setDishes(store.getMenuItems(undefined, activeTenant.id));
    setTables(store.getTables(activeBranch.id));
    setBranches(store.getBranches(activeTenant.id));
  };

  // Dish Handlers
  const openCreateDishModal = () => {
    setEditingDish(null);
    setDishName('');
    setDishDesc('');
    setDishPrice(activeBranch.commercialCurrency === 'COP' ? 45000 : activeBranch.commercialCurrency === 'JPY' ? 4500 : 25);
    setDishTime(15);
    setDishCategory(categories[0]?.id || '');
    setDishImage('https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80');
    setIsDishModalOpen(true);
  };

  const openEditDishModal = (dish: MenuItem) => {
    setEditingDish(dish);
    setDishName(dish.name[currentMarket] || dish.name['es-CO']);
    setDishDesc(dish.description[currentMarket] || dish.description['es-CO']);
    setDishPrice(dish.price);
    setDishTime(dish.preparationMinutes);
    setDishCategory(dish.categoryId);
    setDishImage(dish.imageUrl || '');
    setIsDishModalOpen(true);
  };

  const handleSaveDish = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingDish) {
      store.updateMenuItem(editingDish.id, {
        name: { ...editingDish.name, [currentMarket]: dishName, 'es-CO': dishName },
        description: { ...editingDish.description, [currentMarket]: dishDesc, 'es-CO': dishDesc },
        price: Number(dishPrice),
        preparationMinutes: Number(dishTime),
        categoryId: dishCategory,
        imageUrl: dishImage,
      });
    } else {
      store.addMenuItem({
        tenantId: activeTenant.id,
        categoryId: dishCategory,
        name: {
          'es-CO': dishName,
          'es-MX': dishName,
          'en-US': dishName,
          'pt-BR': dishName,
          'ja-JP': dishName,
        },
        description: {
          'es-CO': dishDesc,
          'es-MX': dishDesc,
          'en-US': dishDesc,
          'pt-BR': dishDesc,
          'ja-JP': dishDesc,
        },
        price: Number(dishPrice),
        currency: activeBranch.commercialCurrency,
        isAvailable: true,
        preparationMinutes: Number(dishTime),
        imageUrl: dishImage,
      });
    }
    setIsDishModalOpen(false);
    refreshState();
  };

  const handleDeleteDish = (dishId: string, name: string) => {
    if (confirm(`¿Estás seguro de eliminar el plato "${name}" del menú? Esta acción no se puede deshacer.`)) {
      store.deleteMenuItem(dishId);
      refreshState();
    }
  };

  const toggleAvailability = (itemId: string, current: boolean) => {
    store.updateMenuItemAvailability(itemId, !current);
    refreshState();
  };

  // Table Handlers
  const openCreateTableModal = () => {
    setEditingTable(null);
    const maxNum = tables.reduce((max, t) => Math.max(max, t.number), 0);
    setTableNumber(maxNum + 1);
    setTableCapacity(4);
    setTableArea('MAIN_HALL');
    setIsTableModalOpen(true);
  };

  const openEditTableModal = (table: Table) => {
    setEditingTable(table);
    setTableNumber(table.number);
    setTableCapacity(table.capacity);
    setTableArea(table.locationArea);
    setIsTableModalOpen(true);
  };

  const handleSaveTable = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingTable) {
      store.updateTable(editingTable.id, {
        number: Number(tableNumber),
        capacity: Number(tableCapacity),
        locationArea: tableArea,
      });
    } else {
      store.addTable({
        branchId: activeBranch.id,
        number: Number(tableNumber),
        capacity: Number(tableCapacity),
        locationArea: tableArea,
      });
    }
    setIsTableModalOpen(false);
    refreshState();
  };

  const handleDeleteTable = (tableId: string, num: number) => {
    if (confirm(`¿Eliminar la Mesa #${num}?`)) {
      store.deleteTable(tableId);
      refreshState();
    }
  };

  // Branch Handlers
  const openEditBranchModal = (branch: Branch) => {
    setEditingBranch(branch);
    setBranchName(branch.name);
    setBranchAddress(branch.address);
    setBranchOpen(branch.openingTime);
    setBranchClose(branch.closingTime);
    setBranchMaxCap(branch.maxCapacity);
    setIsBranchModalOpen(true);
  };

  const handleSaveBranch = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingBranch) {
      store.updateBranch(editingBranch.id, {
        name: branchName,
        address: branchAddress,
        openingTime: branchOpen,
        closingTime: branchClose,
        maxCapacity: Number(branchMaxCap),
      });
      setIsBranchModalOpen(false);
      refreshState();
    }
  };

  return (
    <div className="space-y-6">
      {/* Title & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">{t.menuManagement.title}</h1>
          <p className="text-sm text-stone-400 mt-1">
            {activeTenant.name} ({activeBranch.name}) · {t.menuManagement.subtitle}
          </p>
        </div>

        {/* Sub-tabs */}
        <div className="flex items-center space-x-1.5 bg-stone-900 p-1 rounded-2xl border border-stone-800 text-xs">
          <button
            onClick={() => setActiveTab('dishes')}
            className={`px-4 py-2 rounded-xl font-bold transition-all ${
              activeTab === 'dishes'
                ? 'bg-amber-500 text-stone-950 shadow-sm'
                : 'text-stone-400 hover:text-white'
            }`}
          >
            {t.menuManagement.dishesTab} ({dishes.length})
          </button>
          <button
            onClick={() => setActiveTab('tables')}
            className={`px-4 py-2 rounded-xl font-bold transition-all ${
              activeTab === 'tables'
                ? 'bg-amber-500 text-stone-950 shadow-sm'
                : 'text-stone-400 hover:text-white'
            }`}
          >
            {t.menuManagement.tablesTab} ({tables.length})
          </button>
          <button
            onClick={() => setActiveTab('branches')}
            className={`px-4 py-2 rounded-xl font-bold transition-all ${
              activeTab === 'branches'
                ? 'bg-amber-500 text-stone-950 shadow-sm'
                : 'text-stone-400 hover:text-white'
            }`}
          >
            {t.menuManagement.branchesTab} ({branches.length})
          </button>
        </div>
      </div>

      {/* DISHES TAB */}
      {activeTab === 'dishes' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-stone-900 p-4 rounded-2xl border border-stone-800">
            <div>
              <h2 className="text-sm font-bold text-white">{t.menuManagement.dishesTab}</h2>
              <p className="text-xs text-stone-400">
                {t.menuManagement.commercialCurrency}: <strong className="text-amber-400 font-mono">{activeBranch.commercialCurrency}</strong>
              </p>
            </div>
            <button
              onClick={openCreateDishModal}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold shadow-md transition-colors flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>{t.menuManagement.addDish}</span>
            </button>
          </div>

          <div className="bg-stone-900 border border-stone-800 rounded-3xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-stone-300">
                <thead className="bg-stone-950 text-stone-400 text-[11px] uppercase tracking-wider font-semibold border-b border-stone-800">
                  <tr>
                    <th className="px-5 py-3.5">{t.menuManagement.photo}</th>
                    <th className="px-5 py-3.5">{t.menuManagement.dishNameDesc}</th>
                    <th className="px-5 py-3.5">{t.menuManagement.dishPrice}</th>
                    <th className="px-5 py-3.5">{t.menuManagement.prepTime}</th>
                    <th className="px-5 py-3.5">{t.menuManagement.availability}</th>
                    <th className="px-5 py-3.5 text-right">{t.menuManagement.adminActions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-800/80">
                  {dishes.map((dish) => {
                    const name = dish.name[currentMarket] || dish.name['es-CO'];
                    const desc = dish.description[currentMarket] || dish.description['es-CO'];

                    return (
                      <tr key={dish.id} className="hover:bg-stone-800/40 transition-colors">
                        <td className="px-5 py-3.5 w-16">
                          {dish.imageUrl ? (
                            <img
                              src={dish.imageUrl}
                              alt={name}
                              className="w-12 h-12 rounded-xl object-cover border border-stone-800"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-stone-950 flex items-center justify-center text-stone-600">
                              <ImageIcon className="w-5 h-5" />
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="font-bold text-white text-sm">{name}</div>
                          <div className="text-[11px] text-stone-400 line-clamp-1 max-w-sm mt-0.5">
                            {desc}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 font-mono font-bold text-amber-400 text-sm whitespace-nowrap">
                          {formatCurrency(dish.price, dish.currency)}
                        </td>
                        <td className="px-5 py-3.5 text-stone-300 whitespace-nowrap">
                          ~{dish.preparationMinutes} min
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <button
                            onClick={() => toggleAvailability(dish.id, dish.isAvailable)}
                            className={`px-2.5 py-1 rounded-full text-[10px] uppercase font-bold tracking-wider transition-colors ${
                              dish.isAvailable
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            }`}
                          >
                            {dish.isAvailable ? t.menuManagement.available : t.menuManagement.soldOut}
                          </button>
                        </td>
                        <td className="px-5 py-3.5 text-right whitespace-nowrap space-x-1.5">
                          <button
                            onClick={() => openEditDishModal(dish)}
                            className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white transition-colors"
                            title={t.menuManagement.editDish}
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteDish(dish.id, name)}
                            className="p-1.5 rounded-lg bg-stone-800 hover:bg-rose-950/80 text-stone-400 hover:text-rose-300 transition-colors"
                            title={t.menuManagement.deleteDish}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TABLES TAB */}
      {activeTab === 'tables' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-stone-900 p-4 rounded-2xl border border-stone-800">
            <div>
              <h2 className="text-sm font-bold text-white">{activeBranch.name}</h2>
              <p className="text-xs text-stone-400">Total: {tables.length} {t.menuManagement.allTablesOfBranch}</p>
            </div>
            <button
              onClick={openCreateTableModal}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold shadow-md transition-colors flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>{t.menuManagement.addTable}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {tables.map((tbl) => (
              <div
                key={tbl.id}
                className="bg-stone-900 border border-stone-800 rounded-3xl p-5 shadow-sm hover:border-stone-700 transition-colors flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-stone-800">
                    <span className="font-extrabold text-white text-base">{t.menuManagement.tableNumber}{tbl.number}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider ${
                        tbl.status === 'AVAILABLE'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      {tbl.status}
                    </span>
                  </div>

                  <div className="mt-3 space-y-1.5 text-xs text-stone-300">
                    <div className="flex justify-between">
                      <span className="text-stone-400">{t.menuManagement.capacity}:</span>
                      <span className="font-bold text-white">{tbl.capacity} {t.common.people}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-400">{t.menuManagement.area}:</span>
                      <span className="font-medium text-white">{tbl.locationArea}</span>
                    </div>
                    <div className="pt-2 text-[10px] font-mono text-stone-400 truncate">
                      QR: {tbl.qrToken}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-stone-800 flex items-center justify-end space-x-2">
                  <button
                    onClick={() => openEditTableModal(tbl)}
                    className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white transition-colors"
                    title={t.common.edit}
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteTable(tbl.id, tbl.number)}
                    className="p-1.5 rounded-lg bg-stone-800 hover:bg-rose-950/80 text-stone-400 hover:text-rose-300 transition-colors"
                    title={t.common.delete}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* BRANCHES TAB */}
      {activeTab === 'branches' && (
        <div className="space-y-4">
          <div className="bg-stone-900 p-4 rounded-2xl border border-stone-800">
            <h2 className="text-sm font-bold text-white">{t.menuManagement.branchesOfRestaurant} ({branches.length})</h2>
            <p className="text-xs text-stone-400">
              {activeTenant.name} · {t.menuManagement.subtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {branches.map((b) => (
              <div
                key={b.id}
                className="bg-stone-900 border border-stone-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-stone-800">
                    <div>
                      <h3 className="font-bold text-white text-base">{b.name}</h3>
                      <p className="text-xs text-stone-400 mt-0.5">{b.address}, {b.city}, {b.country}</p>
                    </div>
                    {b.id === activeBranch.id && (
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold uppercase">
                        {t.menuManagement.currentBranch}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-stone-950 p-3 rounded-2xl border border-stone-800">
                      <span className="text-[11px] text-stone-400 block">{t.menuManagement.operatingHours}</span>
                      <span className="font-bold text-white text-sm">{b.openingTime} - {b.closingTime}</span>
                    </div>
                    <div className="bg-stone-950 p-3 rounded-2xl border border-stone-800">
                      <span className="text-[11px] text-stone-400 block">{t.menuManagement.maxCapacity}</span>
                      <span className="font-bold text-white text-sm">{b.maxCapacity} {t.common.people}</span>
                    </div>
                    <div className="bg-stone-950 p-3 rounded-2xl border border-stone-800">
                      <span className="text-[11px] text-stone-400 block">{t.menuManagement.commercialCurrency}</span>
                      <span className="font-mono font-bold text-amber-400 text-sm">{b.commercialCurrency}</span>
                    </div>
                    <div className="bg-stone-950 p-3 rounded-2xl border border-stone-800">
                      <span className="text-[11px] text-stone-400 block">{t.menuManagement.timezone}</span>
                      <span className="font-mono text-stone-300 text-xs truncate block">{b.timezone}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-stone-800 flex justify-end">
                  <button
                    onClick={() => openEditBranchModal(b)}
                    className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>{t.menuManagement.editBranchConfig}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DISH CREATE / EDIT MODAL */}
      {isDishModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-stone-900 border border-stone-700 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsDishModalOpen(false)}
              className="absolute top-5 right-5 text-stone-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-white">
              {editingDish ? `${t.common.edit}: ${editingDish.name[currentMarket] || editingDish.name['es-CO']}` : t.menuManagement.addDish}
            </h3>
            <p className="text-xs text-stone-400 mt-1">
              {activeTenant.name} · {t.menuManagement.commercialCurrency}: <strong className="text-amber-400 font-mono">{activeBranch.commercialCurrency}</strong>
            </p>

            <form onSubmit={handleSaveDish} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-stone-300 mb-1">{t.menuManagement.dishNameInput}</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Lomo al Trapo con Papas Criollas"
                  value={dishName}
                  onChange={(e) => setDishName(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-stone-300 mb-1">{t.menuManagement.dishDescInput}</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Ingredientes, preparación y detalles del plato..."
                  value={dishDesc}
                  onChange={(e) => setDishDesc(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                ></textarea>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-stone-300 mb-1">
                    {t.menuManagement.dishPrice} ({activeBranch.commercialCurrency})
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={dishPrice}
                    onChange={(e) => setDishPrice(Number(e.target.value))}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-stone-300 mb-1">
                    {t.menuManagement.prepTimeMinutesInput}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    required
                    value={dishTime}
                    onChange={(e) => setDishTime(Number(e.target.value))}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-stone-300 mb-1">{t.menuManagement.categoryInput}</label>
                <select
                  value={dishCategory}
                  onChange={(e) => setDishCategory(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name[currentMarket] || cat.name['es-CO']}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-stone-300 mb-1">{t.menuManagement.realImageUrlInput}</label>
                <input
                  type="url"
                  placeholder="https://images.unsplash.com/..."
                  value={dishImage}
                  onChange={(e) => setDishImage(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white font-mono text-[11px] focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="pt-3 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsDishModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-stone-800 text-stone-300 hover:bg-stone-700 text-xs font-semibold"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold shadow-md"
                >
                  {t.menuManagement.saveDish}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TABLE CREATE / EDIT MODAL */}
      {isTableModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-stone-900 border border-stone-700 rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setIsTableModalOpen(false)}
              className="absolute top-5 right-5 text-stone-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-white">
              {editingTable ? `${t.common.edit} ${t.menuManagement.tableNumber}${editingTable.number}` : t.menuManagement.addTable}
            </h3>
            <p className="text-xs text-stone-400 mt-1">{t.common.branch}: {activeBranch.name}</p>

            <form onSubmit={handleSaveTable} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-stone-300 mb-1">{t.reservations.tableNumber}</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={tableNumber}
                  onChange={(e) => setTableNumber(Number(e.target.value))}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-stone-300 mb-1">{t.menuManagement.capacity} ({t.common.people})</label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  required
                  value={tableCapacity}
                  onChange={(e) => setTableCapacity(Number(e.target.value))}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-stone-300 mb-1">{t.menuManagement.area}</label>
                <select
                  value={tableArea}
                  onChange={(e) => setTableArea(e.target.value as any)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="MAIN_HALL">{t.menuManagement.mainHall}</option>
                  <option value="TERRACE">{t.menuManagement.terrace}</option>
                  <option value="VIP_LOUNGE">{t.menuManagement.vipLounge}</option>
                  <option value="BAR">{t.menuManagement.bar}</option>
                </select>
              </div>

              <div className="pt-3 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsTableModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-stone-800 text-stone-300 hover:bg-stone-700 text-xs font-semibold"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold shadow-md"
                >
                  {t.menuManagement.saveTable}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BRANCH EDIT MODAL */}
      {isBranchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-stone-900 border border-stone-700 rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setIsBranchModalOpen(false)}
              className="absolute top-5 right-5 text-stone-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-white">{t.menuManagement.editBranchConfig}</h3>
            <p className="text-xs text-stone-400 mt-1">{editingBranch?.name}</p>

            <form onSubmit={handleSaveBranch} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-stone-300 mb-1">{t.common.branch}</label>
                <input
                  type="text"
                  required
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-stone-300 mb-1">{t.reservations.contact}</label>
                <input
                  type="text"
                  required
                  value={branchAddress}
                  onChange={(e) => setBranchAddress(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-stone-300 mb-1">{t.menuManagement.operatingHours} (Start)</label>
                  <input
                    type="time"
                    required
                    value={branchOpen}
                    onChange={(e) => setBranchOpen(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-stone-300 mb-1">{t.menuManagement.operatingHours} (End)</label>
                  <input
                    type="time"
                    required
                    value={branchClose}
                    onChange={(e) => setBranchClose(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-stone-300 mb-1">{t.menuManagement.maxCapacity}</label>
                <input
                  type="number"
                  min="10"
                  max="1000"
                  required
                  value={branchMaxCap}
                  onChange={(e) => setBranchMaxCap(Number(e.target.value))}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="pt-3 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsBranchModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-stone-800 text-stone-300 hover:bg-stone-700 text-xs font-semibold"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold shadow-md"
                >
                  {t.menuManagement.saveBranch}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
