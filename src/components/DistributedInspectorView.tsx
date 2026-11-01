import React, { useState, useEffect } from 'react';
import { useI18n } from '../i18n/i18nContext';
import { store } from '../domain/store';
import { eventBus } from '../domain/events';
import { OutboxEvent, MicroserviceHealth } from '../types';
import {
  Network,
  Cpu,
  Layers,
  ArrowRightLeft,
  Database,
  ShieldCheck,
  Zap,
  Activity,
  GitBranch,
  Terminal,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  Sparkles,
  ExternalLink,
} from 'lucide-react';

const MICROSERVICES: MicroserviceHealth[] = [
  { name: 'auth-service', port: 4001, status: 'UP', latencyMs: 12, version: 'v1.4.0', description: 'Tokens JWT, RBAC (5 roles), validación de identidad y tenant.' },
  { name: 'restaurant-service', port: 4002, status: 'UP', latencyMs: 14, version: 'v2.1.0', description: 'Restaurantes, sucursales, horarios, mesas, menú y moneda comercial.' },
  { name: 'reservation-service', port: 4003, status: 'UP', latencyMs: 18, version: 'v2.0.1', description: 'Disponibilidad de mesas con bloqueo de intervalos y prevención de solapes.' },
  { name: 'order-service', port: 4004, status: 'UP', latencyMs: 15, version: 'v1.9.0', description: 'Toma de pedidos QR, tasación estricta en servidor, idempotencia.' },
  { name: 'kitchen-service', port: 4005, status: 'UP', latencyMs: 11, version: 'v2.2.0', description: 'Cola KDS, máquina de estados finita de cocina y cronómetros.' },
  { name: 'notification-service', port: 4006, status: 'UP', latencyMs: 8, version: 'v1.3.0', description: 'Consumo de eventos de negocio y despacho de notificaciones in-app/push.' },
  { name: 'analytics-service', port: 4007, status: 'UP', latencyMs: 24, version: 'v2.0.0', description: 'Agregación de KPIs, ocupación y motor de recomendaciones operativas.' },
];

export const DistributedInspectorView: React.FC = () => {
  const { t } = useI18n();
  const [events, setEvents] = useState<OutboxEvent[]>(() => store.getOutboxEvents());
  const [selectedEvent, setSelectedEvent] = useState<OutboxEvent | null>(null);
  const [searchCorrelation, setSearchCorrelation] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'events' | 'outbox' | 'services' | 'diagrams' | 'theory'>('events');

  useEffect(() => {
    const reload = () => {
      setEvents(store.getOutboxEvents());
    };
    const unsubscribe = eventBus.subscribeAll(() => reload());
    return () => unsubscribe();
  }, []);

  const filteredEvents = events.filter((e) => {
    if (!searchCorrelation.trim()) return true;
    return (
      e.correlationId.toLowerCase().includes(searchCorrelation.toLowerCase()) ||
      e.eventType.toLowerCase().includes(searchCorrelation.toLowerCase()) ||
      e.aggregateId.toLowerCase().includes(searchCorrelation.toLowerCase())
    );
  });

  return (
    <div className="space-y-6">
      {/* Title & Concept Header */}
      <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-5 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-indigo-400">
              <Network className="w-5 h-5" />
              <h1 className="text-xl font-bold text-white">{t.architecture.title}</h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {t.architecture.subtitle}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setActiveTab('events')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                activeTab === 'events' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              RabbitMQ Event Stream ({events.length})
            </button>
            <button
              onClick={() => setActiveTab('outbox')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                activeTab === 'outbox' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Transactional Outbox
            </button>
            <button
              onClick={() => setActiveTab('services')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                activeTab === 'services' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Microservicios Health
            </button>
            <button
              onClick={() => setActiveTab('diagrams')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                activeTab === 'diagrams' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Diagramas de Arquitectura
            </button>
            <button
              onClick={() => setActiveTab('theory')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                activeTab === 'theory' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Conceptos Académicos
            </button>
          </div>
        </div>
      </div>

      {/* TAB 1: RABBITMQ LIVE EVENT STREAM */}
      {activeTab === 'events' && (
        <div className="space-y-4">
          {/* Search bar & Correlation ID Tracer */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-900 border border-slate-800 rounded-xl p-3">
            <div className="flex items-center space-x-2 text-xs text-slate-300 w-full max-w-md">
              <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <input
                type="text"
                placeholder="Rastrear por Correlation-ID o tipo (ej: tx-res, OrderCreated...)"
                value={searchCorrelation}
                onChange={(e) => setSearchCorrelation(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white w-full focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex items-center space-x-2 text-xs text-slate-400">
              <span className="font-mono text-emerald-400 font-bold">{filteredEvents.length}</span>{' '}
              <span>eventos capturados</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Events List */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm max-h-[560px] overflow-y-auto">
              <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 text-xs font-bold text-slate-300 flex items-center justify-between">
                <span>Registro de Eventos en Tiempo Real (AMQP Topic Exchange)</span>
                <span className="text-[10px] text-slate-400 font-mono">Exchange: smartrestaurant.events</span>
              </div>
              <div className="divide-y divide-slate-800">
                {filteredEvents.map((evt) => (
                  <div
                    key={evt.id}
                    onClick={() => setSelectedEvent(evt)}
                    className={`p-3.5 text-xs cursor-pointer transition-colors ${
                      selectedEvent?.id === evt.id
                        ? 'bg-indigo-950/40 border-l-4 border-indigo-500'
                        : 'hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white font-mono text-xs flex items-center space-x-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                        <span>{evt.eventType}</span>
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">
                        {new Date(evt.createdAt).toLocaleTimeString()}
                      </span>
                    </div>

                    <div className="mt-1 flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">
                        Agregado: <strong className="text-slate-200">{evt.aggregateType} #{evt.aggregateId}</strong>
                      </span>
                      <span className="font-mono text-indigo-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                        {evt.correlationId}
                      </span>
                    </div>
                  </div>
                ))}

                {filteredEvents.length === 0 && (
                  <div className="p-8 text-center text-xs text-slate-400">
                    No hay eventos registrados que coincidan con la búsqueda.
                  </div>
                )}
              </div>
            </div>

            {/* Event Payload Inspector */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                    <Terminal className="w-4 h-4 text-indigo-400" />
                    <span>Payload Inspector (JSON Schema v1.0)</span>
                  </h3>
                  {selectedEvent && (
                    <span className="font-mono text-[11px] text-emerald-400 font-bold">
                      {selectedEvent.eventType}
                    </span>
                  )}
                </div>

                {selectedEvent ? (
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-400 block font-semibold">Event ID</span>
                        <span className="font-mono text-white text-[11px]">{selectedEvent.id}</span>
                      </div>
                      <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-400 block font-semibold">Correlation ID</span>
                        <span className="font-mono text-indigo-400 text-[11px]">{selectedEvent.correlationId}</span>
                      </div>
                      <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-400 block font-semibold">Tenant ID</span>
                        <span className="font-mono text-amber-400 text-[11px]">{selectedEvent.tenantId}</span>
                      </div>
                      <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-400 block font-semibold">Broker Status</span>
                        <span className="font-mono text-emerald-400 text-[11px] uppercase font-bold">{selectedEvent.status}</span>
                      </div>
                    </div>

                    <div>
                      <span className="text-[11px] text-slate-400 font-semibold block mb-1">
                        Cuerpo del Evento (Payload):
                      </span>
                      <pre className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-emerald-400 font-mono text-xs overflow-x-auto max-h-64 whitespace-pre-wrap">
                        {JSON.stringify(selectedEvent.payload, null, 2)}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="py-24 text-center text-xs text-slate-400">
                    Selecciona un evento de la lista izquierda para inspeccionar su trazabilidad y payload AMQP.
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-800 text-[11px] text-slate-400">
                Garantía: Semántica <strong className="text-white">At-least-once</strong> con consumidores idempotentes.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TRANSACTIONAL OUTBOX PATTERN */}
      {activeTab === 'outbox' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
            <h2 className="text-sm font-bold text-white flex items-center space-x-2">
              <Database className="w-4 h-4 text-amber-400" />
              <span>{t.architecture.outboxTitle}</span>
            </h2>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              {t.architecture.transactionalOutboxDesc}
            </p>
            <div className="mt-3 p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-300">
              <code>
                BEGIN TRANSACTION;{'\n'}
                -- 1. Mutar entidad de negocio (ej. INSERT INTO orders ...){'\n'}
                -- 2. Insertar en tabla outbox (INSERT INTO outbox_events ...){'\n'}
                COMMIT; -- Atomicidad local garantizada. El worker asíncrono lee y despacha a RabbitMQ.
              </code>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Outbox Event ID</th>
                    <th className="px-4 py-3">Tipo de Evento</th>
                    <th className="px-4 py-3">Entidad Agregada</th>
                    <th className="px-4 py-3">Estado de Envío</th>
                    <th className="px-4 py-3">Reintentos</th>
                    <th className="px-4 py-3">Fecha Creación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {events.map((evt) => (
                    <tr key={evt.id} className="hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-mono text-amber-400">{evt.id}</td>
                      <td className="px-4 py-3 font-semibold text-white">{evt.eventType}</td>
                      <td className="px-4 py-3 font-mono text-slate-300">{evt.aggregateType} #{evt.aggregateId}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          {evt.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono">{evt.retryCount}</td>
                      <td className="px-4 py-3 text-slate-400">{new Date(evt.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: MICROSERVICES HEALTH */}
      {activeTab === 'services' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {MICROSERVICES.map((srv) => (
              <div
                key={srv.name}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <span className="font-mono font-bold text-white text-sm">{srv.name}</span>
                  <span className="flex items-center space-x-1 text-emerald-400 text-xs font-bold">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>{srv.status}</span>
                  </span>
                </div>

                <div className="mt-3 space-y-2 text-xs text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Puerto REST:</span>
                    <span className="font-mono text-amber-400">:{srv.port}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Latencia API:</span>
                    <span className="font-mono text-emerald-400">{srv.latencyMs} ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Versión:</span>
                    <span className="font-mono text-slate-300">{srv.version}</span>
                  </div>
                  <p className="pt-2 text-[11px] text-slate-400 border-t border-slate-800 leading-relaxed">
                    {srv.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: ARCHITECTURE DIAGRAMS (MERMAID) */}
      {activeTab === 'diagrams' && (
        <div className="space-y-6">
          {/* Component Diagram */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
            <h2 className="text-sm font-bold text-white flex items-center space-x-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              <span>Diagrama de Componentes de la Plataforma Distribuida</span>
            </h2>
            <p className="text-xs text-slate-300">
              Monorepositorio modular con separación estricta por dominios de negocio, API Gateway unificada y bus de eventos RabbitMQ.
            </p>
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-indigo-300 overflow-x-auto whitespace-pre">
{`graph TD
  Client[React Mobile/Web SPA - 5 Markets] -->|REST / HTTPS| Gateway[API Gateway / Reverse Proxy :3000]
  
  subgraph Microservices Domain
    Gateway --> AuthSrv[auth-service :4001]
    Gateway --> RestSrv[restaurant-service :4002]
    Gateway --> ResSrv[reservation-service :4003]
    Gateway --> OrdSrv[order-service :4004]
    Gateway --> KitchSrv[kitchen-service :4005]
    Gateway --> NotifSrv[notification-service :4006]
    Gateway --> AnalytSrv[analytics-service :4007]
  end

  subgraph Async Event Bus
    ResSrv -->|Transactional Outbox| RMQ[(RabbitMQ Event Broker)]
    OrdSrv -->|Transactional Outbox| RMQ
    KitchSrv -->|Transactional Outbox| RMQ
    RMQ -->|Topic: order.*| KitchSrv
    RMQ -->|Topic: *| NotifSrv
    RMQ -->|Topic: *| AnalytSrv
  end

  subgraph Persistence
    AuthSrv --> PG[(PostgreSQL Multi-tenant DB)]
    RestSrv --> PG
    ResSrv --> PG
    OrdSrv --> PG
    KitchSrv --> PG
    AnalytSrv --> PG
  end`}
            </div>
          </div>

          {/* Sequence Diagram */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
            <h2 className="text-sm font-bold text-white flex items-center space-x-2">
              <ArrowRightLeft className="w-4 h-4 text-amber-400" />
              <span>Diagrama de Secuencia: Transacción Principal de Pedido QR a Cocina</span>
            </h2>
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-amber-300 overflow-x-auto whitespace-pre">
{`sequenceDiagram
  autonumber
  actor Diner as Comensal (Móvil QR)
  participant OrderSvc as order-service
  participant PG as PostgreSQL
  participant Rabbit as RabbitMQ (AMQP)
  participant KitchenSvc as kitchen-service
  participant KDS as Pantalla KDS Cocina

  Diner->>OrderSvc: POST /api/orders (QR Token, Items, Idempotency-Key)
  Note over OrderSvc: 1. Valida Idempotencia<br/>2. Valida QR Token y Mesa<br/>3. Valida y tasa precios en Servidor
  
  critical Transactional Outbox
    OrderSvc->>PG: INSERT INTO orders (status: RECEIVED)
    OrderSvc->>PG: INSERT INTO outbox_events (OrderCreated, CorrelationId)
  end

  OrderSvc-->>Diner: 201 Created (Order Number, Total, Correlation-ID)
  
  OrderSvc->>Rabbit: Publish event: OrderCreated
  Rabbit->>KitchenSvc: Consume OrderCreated
  KitchenSvc->>KDS: WebSockets/SSE: Push nueva comanda a KDS
  
  KDS->>KitchenSvc: PATCH /api/kitchen/:id/status (PREPARING)
  KitchenSvc->>Rabbit: Publish event: OrderAcceptedByKitchen
  Rabbit->>Diner: SSE: Actualiza estatus a "En Preparación"`}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: DEMONSTRABLE DISTRIBUTED CONCEPTS */}
      {activeTab === 'theory' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Concurrencia en Reservas</span>
            </h3>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              Resuelta mediante verificación de intersección de rangos temporales en el backend. Dos reservas para una misma mesa solo pueden coexistir si:
              <br />
              <code className="text-amber-400 font-mono mt-1 block">
                (StartA &gt;= EndB) || (EndA &lt;= StartB)
              </code>
              Cualquier traslape lanza un error HTTP 409 Conflict antes de persistir, evitando overbooking sin depender del frontend.
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Idempotencia de Pedidos</span>
            </h3>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              Cada petición de creación de comanda incluye una cabecera <code className="text-indigo-300 font-mono">Idempotency-Key</code>. Si una solicitud de red se reintenta por micro-desconexión móvil, el Order Service reconoce la clave existente y devuelve el pedido original en lugar de duplicar platos ni facturas.
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <GitBranch className="w-4 h-4 text-indigo-400" />
              <span>Transactional Outbox & Eventual Consistency</span>
            </h3>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              Evita el problema del dual-write distribuido. La entidad de negocio y el evento se guardan atómicamente en la misma transacción SQL local. Un proceso despachador publica el evento en RabbitMQ; si el broker estuviera momentáneamente offline, el evento no se pierde y se reintenta automáticamente.
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <Layers className="w-4 h-4 text-sky-400" />
              <span>Aislamiento Multi-Tenant</span>
            </h3>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              Cada restaurante opera con su propio <code className="text-amber-300 font-mono">tenant_id</code>. Los usuarios autenticados tienen permisos confinados a su tenant y sucursales asignadas. Un restaurante en Bogotá no puede acceder bajo ninguna circunstancia a los menús, mesas ni comandas de México o Tokio.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
