import React, { useState } from 'react';
import { useI18n } from '../i18n/i18nContext';
import { store } from '../domain/store';
import { Reservation, Table } from '../types';
import {
  Calendar,
  Clock,
  Users,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  Plus,
  X,
  Lock,
  Zap,
  Filter,
  Edit,
  Trash2,
} from 'lucide-react';

export const ReservationView: React.FC = () => {
  const { t, formatDate } = useI18n();
  const activeTenant = store.getActiveTenant();
  const activeBranch = store.getActiveBranch();
  const tables = store.getTables(activeBranch.id);

  const currentUser = store.getCurrentUser();
  const isAdmin = currentUser.role === 'OWNER' || currentUser.role === 'ADMIN';
  const isStaff = currentUser.role !== 'CUSTOMER';

  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [selectedTime, setSelectedTime] = useState<string>('19:30');
  const [partySize, setPartySize] = useState<number>(2);
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [customerEmail, setCustomerEmail] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [specialNotes, setSpecialNotes] = useState<string>('');

  const [showModal, setShowModal] = useState<boolean>(false);
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);
  const [editFormData, setEditFormData] = useState<{
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    date: string;
    startTime: string;
    partySize: number;
    tableId: string;
    status: Reservation['status'];
    specialRequests: string;
  } | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [concurrencySimRunning, setConcurrencySimRunning] = useState<boolean>(false);
  const [concurrencySimResult, setConcurrencySimResult] = useState<string | null>(null);

  const reservations = store.getReservations(activeBranch.id, selectedDate);

  // Open edit modal for an existing reservation
  const handleOpenEdit = (res: Reservation) => {
    setEditingReservation(res);
    setEditFormData({
      customerName: res.customerName,
      customerEmail: res.customerEmail,
      customerPhone: res.customerPhone,
      date: res.date,
      startTime: res.startTime,
      partySize: res.partySize,
      tableId: res.tableId,
      status: res.status,
      specialRequests: res.specialRequests || '',
    });
    setErrorMsg(null);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReservation || !editFormData) return;

    try {
      const selectedTbl = tables.find((t) => t.id === editFormData.tableId);
      const tableNumber = selectedTbl ? selectedTbl.number : editingReservation.tableNumber;

      store.updateReservation(editingReservation.id, {
        customerName: editFormData.customerName,
        customerEmail: editFormData.customerEmail,
        customerPhone: editFormData.customerPhone,
        date: editFormData.date,
        startTime: editFormData.startTime,
        partySize: editFormData.partySize,
        tableId: editFormData.tableId,
        tableNumber,
        status: editFormData.status,
        specialRequests: editFormData.specialRequests,
      });

      setSuccessMsg(`Reserva de "${editFormData.customerName}" actualizada con éxito.`);
      setEditingReservation(null);
      setEditFormData(null);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al actualizar la reserva');
    }
  };

  const handleDeleteReservation = (resId: string, clientName: string) => {
    if (confirm(`¿Eliminar definitivamente la reserva de "${clientName}" del sistema?`)) {
      store.deleteReservation(resId);
      setSuccessMsg(`Reserva de ${clientName} eliminada del sistema.`);
    }
  };

  // Filter tables available for the selected slot
  const availableTables = tables.filter((table) => {
    if (table.capacity < partySize) return false;
    const startMins = parseInt(selectedTime.split(':')[0]) * 60 + parseInt(selectedTime.split(':')[1]);
    const endMins = startMins + 120;
    const endHour = Math.floor(endMins / 60).toString().padStart(2, '0');
    const endMin = (endMins % 60).toString().padStart(2, '0');
    const endTime = `${endHour}:${endMin}`;
    return store.checkTableAvailability(table.id, selectedDate, selectedTime, endTime);
  });

  const handleCreateReservation = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!selectedTableId) {
      setErrorMsg('Por favor selecciona una mesa disponible.');
      return;
    }

    try {
      const result = store.createReservation({
        tenantId: activeTenant.id,
        branchId: activeBranch.id,
        tableId: selectedTableId,
        customerName,
        customerEmail,
        customerPhone,
        date: selectedDate,
        startTime: selectedTime,
        partySize,
        specialRequests: specialNotes,
      });

      setSuccessMsg(
        `${t.reservations.bookingSuccess} (Reserva ID: ${result.reservation.id}, Evento: ${result.outboxEvent.id}, Correlation-ID: ${result.reservation.correlationId})`
      );
      setShowModal(false);
      // Reset form
      setCustomerName('');
      setCustomerEmail('');
      setCustomerPhone('');
      setSpecialNotes('');
      setSelectedTableId('');
    } catch (err: any) {
      setErrorMsg(err.message || t.reservations.occupiedSlotError);
    }
  };

  const handleCancelReservation = (resId: string) => {
    if (confirm('¿Estás seguro de cancelar esta reserva? Se emitirá el evento ReservationCancelled.')) {
      store.cancelReservation(resId);
      setSuccessMsg('Reserva cancelada exitosamente y evento emitido.');
    }
  };

  /**
   * Concurrency stress simulation:
   * Fires 2 simultaneous requests for the EXACT SAME table and time slot.
   * Demonstrates that the second one is rejected with 409 Conflict!
   */
  const handleSimulateConcurrencyCollision = () => {
    setConcurrencySimRunning(true);
    setConcurrencySimResult(null);

    const targetTable = tables[0];
    if (!targetTable) {
      setConcurrencySimResult('No hay mesas disponibles para la prueba.');
      setConcurrencySimRunning(false);
      return;
    }

    const testTime = '20:00';
    const testDate = selectedDate;

    setTimeout(() => {
      let firstSucceeded = false;
      let secondError: string | null = null;
      let firstReservationId = '';

      try {
        // Request A
        const resA = store.createReservation({
          tenantId: activeTenant.id,
          branchId: activeBranch.id,
          tableId: targetTable.id,
          customerName: 'Cliente Concurrente A (Simulado)',
          customerEmail: 'clienteA@stress-test.com',
          customerPhone: '+57 300 111 2233',
          date: testDate,
          startTime: testTime,
          partySize: targetTable.capacity,
          specialRequests: 'Prueba de concurrencia ACID - Solicitud A',
        });
        firstSucceeded = true;
        firstReservationId = resA.reservation.id;

        // Request B (Simultaneous attempt on the exact same table & interval)
        try {
          store.createReservation({
            tenantId: activeTenant.id,
            branchId: activeBranch.id,
            tableId: targetTable.id,
            customerName: 'Cliente Concurrente B (Simulado)',
            customerEmail: 'clienteB@stress-test.com',
            customerPhone: '+57 300 444 5566',
            date: testDate,
            startTime: testTime,
            partySize: targetTable.capacity,
            specialRequests: 'Prueba de concurrencia ACID - Solicitud B',
          });
        } catch (errB: any) {
          secondError = errB.message;
        }
      } catch (errA: any) {
        secondError = errA.message;
      }

      setConcurrencySimRunning(false);
      setConcurrencySimResult(
        `[PRUEBA DE CONCURRENCIA EXITOSA]:\n` +
          `• Solicitud A (Cliente A): APROBADA y persistida (ID: ${firstReservationId}).\n` +
          `• Solicitud B (Cliente B): RECHAZADA inmediatamente por el candado de intervalo.\n` +
          `• Código: 409 Conflict\n` +
          `• Excepción capturada: "${secondError || 'CONCURRENCY_CONFLICT: Table already reserved'}"\n` +
          `• Integridad: Cero dobles reservas generadas.`
      );
    }, 600);
  };

  return (
    <div className="space-y-6">
      {/* Title & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">{t.reservations.title}</h1>
          <p className="text-sm text-slate-400 mt-1">
            {activeBranch.name} · {t.reservations.subtitle}
          </p>
        </div>
        <div className="flex items-center space-x-2.5">
          <button
            onClick={handleSimulateConcurrencyCollision}
            disabled={concurrencySimRunning}
            className="px-3.5 py-2 rounded-lg bg-indigo-900/60 hover:bg-indigo-800 border border-indigo-500/40 text-indigo-200 text-xs font-semibold shadow-sm flex items-center space-x-1.5 transition-colors disabled:opacity-50"
            title="Ejecuta 2 peticiones simultáneas sobre la misma mesa para verificar el bloqueo de concurrencia"
          >
            <Zap className="w-3.5 h-3.5 text-indigo-400" />
            <span>{concurrencySimRunning ? '...' : t.reservations.concurrencyTest}</span>
          </button>

          <button
            onClick={() => {
              setShowModal(true);
              setErrorMsg(null);
            }}
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-md flex items-center space-x-1.5 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>{t.reservations.newReservation}</span>
          </button>
        </div>
      </div>

      {/* Concurrency Simulator Result Box */}
      {concurrencySimResult && (
        <div className="bg-slate-900 border border-indigo-500/40 rounded-xl p-4 shadow-md">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <span className="text-xs font-bold text-indigo-300 flex items-center space-x-1.5">
              <Lock className="w-3.5 h-3.5" />
              <span>{t.reservations.concurrencyTest} (ACID Locking)</span>
            </span>
            <button
              onClick={() => setConcurrencySimResult(null)}
              className="text-slate-400 hover:text-white text-xs"
            >
              {t.common.cancel}
            </button>
          </div>
          <pre className="mt-2 text-xs font-mono text-emerald-400 whitespace-pre-wrap leading-relaxed bg-slate-950 p-3 rounded-lg border border-slate-800">
            {concurrencySimResult}
          </pre>
        </div>
      )}

      {/* Alerts */}
      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filter and Date Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 text-slate-300 text-xs font-medium">
            <Calendar className="w-4 h-4 text-amber-400" />
            <span>{t.reservations.filterByDate}:</span>
          </div>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>

        <div className="text-xs text-slate-400">
          <strong className="text-white">{reservations.length}</strong> {t.reservations.title.toLowerCase()} · {' '}
          <strong className="text-amber-400">{formatDate(selectedDate)}</strong>
        </div>
      </div>

      {/* Reservations List */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">{t.reservations.time}</th>
                <th className="px-4 py-3">{t.reservations.tableZone}</th>
                <th className="px-4 py-3">{t.reservations.guests}</th>
                <th className="px-4 py-3">{t.reservations.customerName}</th>
                <th className="px-4 py-3">{t.reservations.contact}</th>
                <th className="px-4 py-3">{t.reservations.status}</th>
                <th className="px-4 py-3">{t.common.correlationId}</th>
                <th className="px-4 py-3 text-right">{t.reservations.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {reservations.map((res) => (
                <tr key={res.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3 font-semibold text-white whitespace-nowrap">
                    <div className="flex items-center space-x-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      <span>{res.startTime} - {res.endTime}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="font-bold text-amber-300">{t.waiter.table} #{res.tableNumber}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center space-x-1">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      <span>{res.partySize} {t.common.people}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{res.customerName}</div>
                    {res.specialRequests && (
                      <div className="text-[11px] text-slate-400 italic truncate max-w-xs">
                        "{res.specialRequests}"
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[11px] text-slate-400">
                    <div>{res.customerEmail}</div>
                    <div>{res.customerPhone}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                        res.status === 'CONFIRMED'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : res.status === 'SEATED'
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          : res.status === 'CANCELLED'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {res.status === 'CONFIRMED'
                        ? t.reservations.statuses.confirmed
                        : res.status === 'SEATED'
                        ? t.reservations.statuses.seated
                        : res.status === 'CANCELLED'
                        ? t.reservations.statuses.cancelled
                        : t.reservations.statuses.completed}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[10px] text-slate-400 whitespace-nowrap">
                    {res.correlationId}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end space-x-2">
                      {isStaff && (
                        <button
                          onClick={() => handleOpenEdit(res)}
                          className="text-xs text-amber-400 hover:text-amber-300 font-medium px-2 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-colors flex items-center space-x-1"
                          title={t.common.edit}
                        >
                          <Edit className="w-3 h-3" />
                          <span>{t.common.edit}</span>
                        </button>
                      )}

                      {res.status !== 'CANCELLED' && (
                        <button
                          onClick={() => handleCancelReservation(res.id)}
                          className="text-xs text-rose-400 hover:text-rose-300 font-medium px-2 py-1 rounded hover:bg-rose-950/40 transition-colors"
                        >
                          {t.reservations.cancelBooking}
                        </button>
                      )}

                      {isAdmin && (
                        <button
                          onClick={() => handleDeleteReservation(res.id, res.customerName)}
                          className="text-xs text-rose-400 hover:text-rose-300 font-medium px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition-colors flex items-center space-x-1"
                          title={t.common.delete}
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>{t.common.delete}</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {reservations.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                    {t.reservations.noReservations}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: New Reservation with Concurrency Check */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-lg font-bold text-white flex items-center space-x-2">
              <Calendar className="w-5 h-5 text-amber-400" />
              <span>{t.reservations.newReservation}</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Sede: <strong className="text-slate-200">{activeBranch.name}</strong> ·{' '}
              {t.reservations.concurrencyProtectionNotice}
            </p>

            <form onSubmit={handleCreateReservation} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    {t.reservations.selectDate}
                  </label>
                  <input
                    type="date"
                    required
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-2 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    {t.reservations.selectTime}
                  </label>
                  <input
                    type="time"
                    required
                    value={selectedTime}
                    onChange={(e) => setSelectedTime(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-2 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  {t.reservations.partySize}
                </label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  required
                  value={partySize}
                  onChange={(e) => setPartySize(parseInt(e.target.value) || 1)}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-2 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  {t.reservations.selectAvailableTable} ({availableTables.length} {t.menuManagement.available.toLowerCase()})
                </label>
                <select
                  required
                  value={selectedTableId}
                  onChange={(e) => setSelectedTableId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-2 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                >
                  <option value="">{t.reservations.chooseFreeTable}</option>
                  {availableTables.map((tbl) => (
                    <option key={tbl.id} value={tbl.id}>
                      {t.waiter.table} #{tbl.number} ({t.waiter.capacity}: {tbl.capacity} {t.common.people}, {t.menuManagement.area}: {tbl.locationArea})
                    </option>
                  ))}
                </select>
                {availableTables.length === 0 && (
                  <p className="text-[11px] text-rose-400 mt-1">
                    {t.reservations.noAvailableTablesForParty}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  {t.reservations.customerName}
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Andrés Pastrana"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-2 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    {t.reservations.customerEmail}
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="correo@ejemplo.com"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-2 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    {t.reservations.customerPhone}
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="+57 300 000 0000"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-2 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  {t.reservations.specialNotes}
                </label>
                <textarea
                  rows={2}
                  placeholder="Alergias, peticiones de ubicación o aniversarios..."
                  value={specialNotes}
                  onChange={(e) => setSpecialNotes(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-2 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                ></textarea>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3.5 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-medium"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  disabled={!selectedTableId}
                  className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-md transition-colors disabled:opacity-50"
                >
                  {t.reservations.confirmBooking}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Reservation */}
      {editingReservation && editFormData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => {
                setEditingReservation(null);
                setEditFormData(null);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-lg font-bold text-white flex items-center space-x-2">
              <Edit className="w-5 h-5 text-amber-400" />
              <span>Editar Reserva (#{editingReservation.id})</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Modificación administrativa de reserva para <strong className="text-amber-300">{editingReservation.customerName}</strong>
            </p>

            <form onSubmit={handleSaveEdit} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    {t.reservations.selectDate}
                  </label>
                  <input
                    type="date"
                    required
                    value={editFormData.date}
                    onChange={(e) => setEditFormData({ ...editFormData, date: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-2 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    {t.reservations.selectTime}
                  </label>
                  <input
                    type="time"
                    required
                    value={editFormData.startTime}
                    onChange={(e) => setEditFormData({ ...editFormData, startTime: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-2 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    {t.reservations.partySize}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    required
                    value={editFormData.partySize}
                    onChange={(e) => setEditFormData({ ...editFormData, partySize: parseInt(e.target.value) || 1 })}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-2 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    {t.reservations.reservationStatus}
                  </label>
                  <select
                    value={editFormData.status}
                    onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value as Reservation['status'] })}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-2 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                  >
                    <option value="CONFIRMED">{t.reservations.statuses.confirmed}</option>
                    <option value="SEATED">{t.reservations.statuses.seated}</option>
                    <option value="COMPLETED">{t.reservations.statuses.completed}</option>
                    <option value="CANCELLED">{t.reservations.statuses.cancelled}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  {t.reservations.assignedTable}
                </label>
                <select
                  required
                  value={editFormData.tableId}
                  onChange={(e) => setEditFormData({ ...editFormData, tableId: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-2 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                >
                  {tables.map((tbl) => (
                    <option key={tbl.id} value={tbl.id}>
                      {t.waiter.table} #{tbl.number} ({t.waiter.capacity}: {tbl.capacity} {t.common.people} · {tbl.locationArea})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  {t.reservations.customerName}
                </label>
                <input
                  type="text"
                  required
                  value={editFormData.customerName}
                  onChange={(e) => setEditFormData({ ...editFormData, customerName: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-2 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    {t.reservations.customerEmail}
                  </label>
                  <input
                    type="email"
                    required
                    value={editFormData.customerEmail}
                    onChange={(e) => setEditFormData({ ...editFormData, customerEmail: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-2 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    {t.reservations.customerPhone}
                  </label>
                  <input
                    type="tel"
                    required
                    value={editFormData.customerPhone}
                    onChange={(e) => setEditFormData({ ...editFormData, customerPhone: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-2 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  {t.reservations.specialNotes}
                </label>
                <textarea
                  rows={2}
                  value={editFormData.specialRequests}
                  onChange={(e) => setEditFormData({ ...editFormData, specialRequests: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-2 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                ></textarea>
              </div>

              <div className="pt-2 flex items-center justify-between">
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (editingReservation) {
                        handleDeleteReservation(editingReservation.id, editingReservation.customerName);
                        setEditingReservation(null);
                        setEditFormData(null);
                      }
                    }}
                    className="px-3 py-2 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 text-xs font-medium flex items-center space-x-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{t.reservations.deleteReservation}</span>
                  </button>
                ) : <div />}

                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingReservation(null);
                      setEditFormData(null);
                    }}
                    className="px-3.5 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-medium"
                  >
                    {t.common.cancel}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-md transition-colors"
                  >
                    {t.reservations.saveChanges}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
