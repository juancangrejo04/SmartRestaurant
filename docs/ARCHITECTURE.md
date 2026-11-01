# Arquitectura del Sistema Distribuido — SmartRestaurant

**Nombre Académico:** Plataforma Distribuida Multinacional para la Gestión Inteligente de Reservas y Pedidos en Restaurantes.

---

## 1. Diagrama de Componentes (Mermaid)

El siguiente diagrama detalla la arquitectura de microservicios, la puerta de enlace (API Gateway), el broker de mensajería asíncrona RabbitMQ y el motor de persistencia multi-tenant PostgreSQL:

```mermaid
graph TD
    subgraph Frontend["Frontend SPA (React + TypeScript + Vite)"]
        UI_Customer["Portal Cliente (Móvil QR / Reservas)"]
        UI_KDS["Monitor KDS Cocina (Tablets)"]
        UI_Admin["Panel Dashboard & Analítica (Web)"]
        UI_Inspector["Auditor de Sistemas Distribuidos"]
    end

    subgraph Gateway["API Gateway / Reverse Proxy (:3000)"]
        Router["Enrutador REST & Autenticación"]
        CorrelationMW["Inyector de Correlation-ID (Trazabilidad)"]
        RateLimiter["Control de Concurrencia y Rate Limiting"]
    end

    subgraph Services["Servicios de Dominio (Microservicios Independientes)"]
        AuthSvc["auth-service (:4001)<br/>• JWT & RBAC<br/>• Aislamiento Tenant"]
        RestSvc["restaurant-service (:4002)<br/>• Sedes & Horarios<br/>• Mesas & Menú Multinacional"]
        ResSvc["reservation-service (:4003)<br/>• Motor de Disponibilidad<br/>• Bloqueo ACID de Intervalos"]
        OrdSvc["order-service (:4004)<br/>• Pedidos QR de Mesa<br/>• Tasación Servidor & Idempotencia"]
        KitchSvc["kitchen-service (:4005)<br/>• Máquina de Estados KDS<br/>• Cronómetros de Cocina"]
        NotifSvc["notification-service (:4006)<br/>• Notificaciones In-App<br/>• Suscriptor de Eventos"]
        AnalytSvc["analytics-service (:4007)<br/>• KPIs Operativos<br/>• Motor de Recomendaciones"]
    end

    subgraph MessageBroker["Bus de Eventos Asíncronos (RabbitMQ AMQP 0-9-1)"]
        Exchange["Topic Exchange: smartrestaurant.events"]
        Q_Kitchen["Queue: kitchen.orders.queue"]
        Q_Notif["Queue: notifications.dispatch.queue"]
        Q_Analytics["Queue: analytics.stream.queue"]
        DLQ["Dead-Letter Queue (DLQ)"]
    end

    subgraph Persistence["Persistencia Multi-Tenant (PostgreSQL 16)"]
        DB[(smartrestaurant_db)]
        OutboxTable[("outbox_events Table")]
    end

    Frontend -->|REST HTTP/JSON| Gateway
    Gateway --> AuthSvc
    Gateway --> RestSvc
    Gateway --> ResSvc
    Gateway --> OrdSvc
    Gateway --> KitchSvc
    Gateway --> NotifSvc
    Gateway --> AnalytSvc

    ResSvc -->|INSERT + Outbox| OutboxTable
    OrdSvc -->|INSERT + Outbox| OutboxTable
    KitchSvc -->|UPDATE + Outbox| OutboxTable

    OutboxTable -.->|Outbox Worker Poller| Exchange
    Exchange --> Q_Kitchen
    Exchange --> Q_Notif
    Exchange --> Q_Analytics
    Exchange -.->|Failed Retries > 5| DLQ

    Q_Kitchen --> KitchSvc
    Q_Notif --> NotifSvc
    Q_Analytics --> AnalytSvc

    AuthSvc --> DB
    RestSvc --> DB
    ResSvc --> DB
    OrdSvc --> DB
    KitchSvc --> DB
    AnalytSvc --> DB
```

---

## 2. Diagrama de Despliegue en Infraestructura (Docker Compose)

```mermaid
graph LR
    subgraph Host["Servidor / Docker Host"]
        subgraph Net["Red Interna Bridge: sr-network"]
            C_PG["Contenedor: smartrestaurant-postgres<br/>PostgreSQL 16 Alpine<br/>Puerto: 5432"]
            C_RMQ["Contenedor: smartrestaurant-rabbitmq<br/>RabbitMQ 3.13 Management<br/>Puertos: 5672, 15672"]
            C_APP["Contenedor: smartrestaurant-gateway-app<br/>Node.js 22 LTS + React Vite SPA<br/>Puerto: 3000"]
        end

        Vol_PG[("Volumen Persistente: postgres_data")]
        Vol_RMQ[("Volumen Persistente: rabbitmq_data")]
    end

    C_PG --- Vol_PG
    C_RMQ --- Vol_RMQ
    C_APP -->|TCP :5432| C_PG
    C_APP -->|AMQP :5672| C_RMQ

    Usuario["Navegador Web / Dispositivo Móvil"] -->|HTTP :3000| C_APP
```

---

## 3. Matriz de Responsabilidades de los Microservicios

| Microservicio | Puerto | Entidades Propietarias | Eventos Publicados | Eventos Consumidos |
|---|---|---|---|---|
| **auth-service** | 4001 | Usuarios, Roles, Permisos, Tokens JWT | `UserRegistered` | - |
| **restaurant-service** | 4002 | Restaurantes (Tenants), Sucursales, Mesas, Menús, Platos | `MenuPriceUpdated`, `BranchConfigured` | - |
| **reservation-service** | 4003 | Reservas, Disponibilidad de Mesas | `ReservationCreated`, `ReservationCancelled` | - |
| **order-service** | 4004 | Pedidos (Orders), Ítems de Pedido, Idempotencia | `OrderCreated`, `OrderConfirmed` | `OrderStatusChanged` |
| **kitchen-service** | 4005 | Comandas KDS, Fila de Preparación, Tiempos | `OrderAcceptedByKitchen`, `OrderStatusChanged`, `OrderReady`, `OrderDelivered` | `OrderCreated` |
| **notification-service**| 4006 | Notificaciones In-App, Despacho Email/SMS | - | `ReservationCreated`, `OrderCreated`, `OrderReady` |
| **analytics-service** | 4007 | Agregaciones, Informes de Ocupación, Recomendaciones | `RecommendationGenerated` | `*` (Todos los eventos de negocio) |
