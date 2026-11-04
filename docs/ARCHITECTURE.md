# Arquitectura Serverless Distribuida — SmartRestaurant
## Vercel Hobby + Supabase (PostgreSQL + Auth) + Upstash QStash

---

## 1. Topología del Sistema Serverless

SmartRestaurant opera como un **sistema distribuido serverless** compuesto por funciones lógicas desacopladas alojadas en la infraestructura global de Vercel, respaldado por una base de datos relacional PostgreSQL con Row Level Security (RLS) en Supabase, y coordinado asíncronamente mediante el broker serverless Upstash QStash con verificación de firmas criptográficas.

```mermaid
graph TD
    subgraph Clients["Clientes & Dispositivos (Cualquier País)"]
        UI_Diner["Comensal Móvil (Menú QR / Pedido en Mesa / Reseñas)"]
        UI_Waiter["Terminal de Mesero (Toma de Comanda / Entregas)"]
        UI_KDS["Monitor de Cocina KDS (Tablets)"]
        UI_Admin["Panel Dashboard & Analítica (Web)"]
    end

    subgraph Vercel["Vercel Hobby Serverless Runtime (Global Edge)"]
        SPA["Frontend SPA (React 19 + TypeScript + Vite)"]
        Gateway["Serverless API Gateway (/api/*)"]
        
        subgraph DomainServices["Servicios Lógicos Independientes"]
            AuthSvc["auth-service (/api/auth)<br/>• Supabase Auth / Bcrypt<br/>• Sesiones JWT & RBAC (5 Roles)"]
            RestSvc["restaurant-service (/api/restaurants)<br/>• Multi-tenant 5 Países<br/>• Mesas, Menús QR & Reseñas"]
            ResSvc["reservation-service (/api/reservations)<br/>• Bloqueo ACID de Intervalos<br/>• Prevención Overbooking"]
            OrdSvc["order-service (/api/orders)<br/>• Tasación Backend Estricta<br/>• Idempotency-Key Protection"]
            KitchSvc["kitchen-service (/api/kitchen)<br/>• KDS Máquina de Estados<br/>• Tiempos de Preparación"]
            NotifSvc["notification-service (/api/notifications)<br/>• Alertas en Vivo<br/>• Suscriptor Webhook"]
            AnalytSvc["analytics-service (/api/analytics)<br/>• Métricas & Ocupación<br/>• Motor Recomendaciones"]
        end

        Receiver["Webhook Receiver (/api/events/qstash-receiver)<br/>• Verificación de Firma Criptográfica<br/>• Control de Duplicados en processed_events"]
    end

    subgraph Messaging["Mensajería Asíncrona Serverless (Upstash QStash)"]
        QStashBroker["Upstash QStash Message Broker<br/>• Retries: 3 con Backoff<br/>• Deduplication ID<br/>• Topic Routing"]
        DLQ["QStash Dead-Letter Handling"]
    end

    subgraph Persistence["Persistencia Relacional Confiable (Supabase)"]
        SupaAuth["Supabase Authentication"]
        SupaDB[(PostgreSQL 15+ Engine)]
        OutboxTable[("outbox_events Table")]
        ProcessedEventsTable[("processed_events Table")]
    end

    Clients -->|HTTPS REST| Gateway
    Gateway --> AuthSvc
    Gateway --> RestSvc
    Gateway --> ResSvc
    Gateway --> OrdSvc
    Gateway --> KitchSvc
    Gateway --> NotifSvc
    Gateway --> AnalytSvc

    AuthSvc --> SupaAuth
    AuthSvc --> SupaDB
    RestSvc --> SupaDB
    
    ResSvc -->|ACID INSERT + Outbox| SupaDB
    OrdSvc -->|ACID INSERT + Outbox| SupaDB
    KitchSvc -->|ACID UPDATE + Outbox| SupaDB

    SupaDB --> OutboxTable
    
    OrdSvc -.->|publishJSON| QStashBroker
    ResSvc -.->|publishJSON| QStashBroker
    KitchSvc -.->|publishJSON| QStashBroker

    QStashBroker -->|Signed HTTP POST Webhook| Receiver
    Receiver -->|Validar Firma + INSERT| ProcessedEventsTable
    Receiver -->|Trigger Action| NotifSvc
    Receiver -->|Trigger Action| KitchSvc
    Receiver -->|Trigger Action| AnalytSvc

    QStashBroker -.->|Failed Retries > 3| DLQ
```

---

## 2. Diagrama de Secuencia: Ciclo de Comanda con Transactional Outbox y QStash

```mermaid
sequenceDiagram
    autonumber
    actor Diner as Comensal (Móvil QR)
    participant OrderSvc as Vercel: /api/orders
    participant Supabase as Supabase PostgreSQL
    participant QStash as Upstash QStash Broker
    participant Receiver as /api/events/qstash-receiver
    participant KDS as Monitor KDS Cocina
    participant Waiter as Terminal de Mesero

    Diner->>OrderSvc: POST /api/orders (QR Token, Items, Idempotency-Key)
    Note over OrderSvc: 1. Valida Idempotency-Key (evita duplicados)<br/>2. Tasa precios e impuestos en servidor<br/>3. Prepara Outbox Event
    
    critical Transactional Outbox en Supabase
        OrderSvc->>Supabase: INSERT INTO orders (Estado: RECEIVED)
        OrderSvc->>Supabase: INSERT INTO outbox_events (OrderCreated, CorrelationId)
    end

    OrderSvc-->>Diner: 201 Created (Order Number, Total, Correlation-ID)

    OrderSvc->>QStash: publishJSON(OrderCreated, DeduplicationId: outbox_id)
    
    QStash->>Receiver: POST Webhook con Cabecera 'upstash-signature'
    Note over Receiver: Valida firma criptográfica con Receiver.verify()<br/>Comprueba unicidad en processed_events
    Receiver->>KDS: Notifica comanda disponible para preparación

    KDS->>KDS: Chef presiona "Iniciar Preparación"
    KDS->>OrderSvc: PATCH /api/kitchen/:id/status (PREPARING)
    OrderSvc->>QStash: publishJSON(KitchenOrderAccepted)

    KDS->>KDS: Chef presiona "Marcar Listo"
    KDS->>OrderSvc: PATCH /api/kitchen/:id/status (READY)
    OrderSvc->>QStash: publishJSON(KitchenOrderCompleted)
    
    QStash->>Receiver: Webhook KitchenOrderCompleted
    Receiver->>Waiter: Notificación: Comanda lista para entregar a mesa
    Waiter->>OrderSvc: PATCH /api/kitchen/:id/status (DELIVERED)
```

---

## 3. Matriz de Servicios Lógicos y Rutas API

| Servicio Lógico | Ruta Base Vercel | Responsabilidades | Eventos Emitidos a QStash |
|---|---|---|---|
| **Auth Service** | `/api/auth` | Registro, login, recuperación de contraseña, JWT, RBAC (5 roles). | - |
| **Restaurant Service** | `/api/restaurants` | Sedes (5 países), mesas, menús QR, disponibilidad y reseñas. | - |
| **Reservation Service** | `/api/reservations` | Bloqueo ACID de intervalos, prevención 409 Conflict. | `ReservationCreated`, `ReservationCancelled` |
| **Order Service** | `/api/orders` | Idempotencia, cálculo seguro de precios y tasas locales. | `OrderCreated`, `OrderUpdated` |
| **Kitchen Service** | `/api/kitchen` | Fila KDS, máquina de estados finita y cronómetro. | `KitchenOrderAccepted`, `KitchenOrderCompleted` |
| **Notification Service** | `/api/notifications` | Despacho de notificaciones in-app y alertas operativas. | `NotificationRequested` |
| **Analytics Service** | `/api/analytics` | KPIs de ocupación, ticket promedio y recomendaciones. | - |
| **QStash Receiver** | `/api/events/qstash-receiver` | Verificación de firma criptográfica y enrutamiento idempotente. | - |

---

## 4. Seguridad, Autenticación y RLS

1. **Supabase Auth & Roles:**
   - Contraseñas almacenadas exclusivamente como hashes Bcrypt (costo 10).
   - Tokens JWT firmados con claims de rol (`role`) y tenant (`tenantId`).
   - Los roles permitidos son: `OWNER`, `ADMIN`, `WAITER`, `KITCHEN` y `CUSTOMER`.
   - Se prohíbe confiar en cabeceras de rol enviadas libremente por el cliente (`x-user-role` no tiene validez sin token Bearer verificado).

2. **Aislamiento Multi-Tenant Estricto:**
   - Ninguna consulta permite cruce entre tenants diferentes (`rest-col-01` jamás accede a datos de `rest-mex-02`).
   - El middleware `requireTenantIsolation` rechaza con `403 Forbidden` cualquier intento de acceso cruzado no autorizado.

3. **Verificación de Firmas de QStash:**
   - La función `/api/events/qstash-receiver` valida que cada petición entrante provenga auténticamente de los servidores de Upstash utilizando `@upstash/qstash` `Receiver.verify({ signature, body })`.
   - Si la firma es inválida o expirada, se rechaza inmediatamente con `401 Unauthorized`.
   - La tabla `processed_events` garantiza que los reintentos automáticos de QStash no dupliquen mutaciones de negocio.

4. **Variables de Entorno y Secretos:**
   - `SUPABASE_SERVICE_ROLE_KEY` se utiliza **únicamente** en funciones serverless backend de Vercel. Nunca se expone al cliente ni a variables `VITE_` o `NEXT_PUBLIC_`.
