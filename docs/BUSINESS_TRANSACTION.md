# Transacción Principal del Negocio — SmartRestaurant

## Definición Canónica de la Transacción

> **«Conectar a un cliente que necesita una experiencia gastronómica con un restaurante que dispone de capacidad para atenderlo, coordinando su reserva, pedido y servicio en tiempo real».**

---

## 1. Naturaleza Distribuida (Core Distributed Workflow)

En una arquitectura de microservicios, esta transacción **NO es una única transacción ACID monolítica** de base de datos que abarque todos los servicios. Un bloqueo global de dos fases (2PC / Two-Phase Commit) generaría alta latencia y acoplamiento severo entre servicios.

En su lugar, SmartRestaurant implementa una **transacción distribuida por orquestación basada en eventos y consistencia eventual (Eventual Consistency)**, compuesta por transacciones locales atómicas en cada servicio y eventos asíncronos transportados a través de RabbitMQ mediante el patrón **Transactional Outbox**.

---

## 2. Etapas Detalladas de la Transacción

```mermaid
sequenceDiagram
  autonumber
  actor Cliente as Cliente / Comensal
  participant Gateway as API Gateway
  participant ResSvc as reservation-service
  participant TableSvc as restaurant-service
  participant OrderSvc as order-service
  participant RMQ as RabbitMQ Bus
  participant KitchenSvc as kitchen-service
  participant NotifSvc as notification-service

  %% Paso 1: Disponibilidad
  Note over Cliente, ResSvc: PASO 1: Consulta de Disponibilidad
  Cliente->>Gateway: GET /api/reservations/availability (Sede, Fecha, Hora, Personas)
  Gateway->>ResSvc: Consulta franja y mesas libres
  ResSvc-->>Cliente: Mesas disponibles retornadas

  %% Paso 2 y 3: Reserva y Asignación
  Note over Cliente, ResSvc: PASO 2 y 3: Creación de Reserva y Asignación de Mesa
  Cliente->>Gateway: POST /api/reservations (Mesa seleccionada, Datos del cliente)
  critical Transacción Local con Bloqueo de Concurrencia
    ResSvc->>ResSvc: Bloqueo de Intervalo temporal: [StartTime, EndTime]
    ResSvc->>ResSvc: INSERT INTO reservations (status: CONFIRMED)
    ResSvc->>ResSvc: INSERT INTO outbox_events (ReservationCreated)
  end
  ResSvc-->>Cliente: 201 Created (ID Reserva, Correlation-ID)
  ResSvc->>RMQ: Publica evento: ReservationCreated
  RMQ->>NotifSvc: Consumo de evento -> Alerta interna de confirmación

  %% Paso 4 y 5: Escaneo QR y Pedido
  Note over Cliente, OrderSvc: PASO 4 y 5: Escaneo de QR en Mesa Física y Pedido a Cocina
  Cliente->>Gateway: POST /api/orders (QR Token, Ítems, Idempotency-Key)
  Note over OrderSvc: 1. Valida Idempotency-Key<br/>2. Valida Token de Mesa<br/>3. Recalcula precios en servidor (No confía en cliente)
  critical Transacción Local de Comanda
    OrderSvc->>OrderSvc: INSERT INTO orders (status: RECEIVED)
    OrderSvc->>OrderSvc: INSERT INTO outbox_events (OrderCreated)
  end
  OrderSvc-->>Cliente: 201 Created (Número de Orden, Total, Tiempo estimado)
  OrderSvc->>RMQ: Publica evento: OrderCreated
  RMQ->>KitchenSvc: Consumo de OrderCreated -> Inserción en Fila KDS

  %% Paso 6 y 7: Actualización de Estados y Notificación
  Note over KitchenSvc, Cliente: PASO 6 y 7: Preparación en Cocina y Notificación en Tiempo Real
  KitchenSvc->>KitchenSvc: Chef pulsa "Iniciar Preparación" (PATCH /api/kitchen/:id/status)
  KitchenSvc->>RMQ: Publica evento: OrderAcceptedByKitchen
  RMQ->>Cliente: SSE: Estado cambia a "En preparación"

  KitchenSvc->>KitchenSvc: Chef pulsa "Marcar Listo" (PATCH /api/kitchen/:id/status)
  KitchenSvc->>RMQ: Publica evento: OrderReady
  RMQ->>Cliente: SSE: Estado cambia a "Listo para servir"
  RMQ->>NotifSvc: Notificación al mesero de salón

  KitchenSvc->>KitchenSvc: Mesero confirma "Entregado" (PATCH /api/kitchen/:id/status)
  KitchenSvc->>RMQ: Publica evento: OrderDelivered
  RMQ->>Cliente: SSE: Comanda finalizada exitosamente
```

---

## 3. Garantías de Consistencia y Tolerancia a Fallos

1. **Garantía Inmediata (Strong Consistency):**
   - El bloqueo de mesas para una misma franja horaria es inmediatamente consistente dentro del `reservation-service` gracias a la validación atómica en PostgreSQL.
   - El cálculo de totales de platos e impuestos se verifica inmediatamente en el `order-service` antes de persistir la comanda.
2. **Garantía Eventual (Eventual Consistency):**
   - La llegada de la comanda a la pantalla del cocinero (KDS) y la actualización de métricas en el `analytics-service` se propagan de manera asíncrona a través de RabbitMQ. Si el broker experimenta una micro-desconexión, los mensajes no se pierden gracias a la tabla local `outbox_events` y son reintentados automáticamente.
3. **Idempotencia:**
   - La cabecera `Idempotency-Key` en los pedidos y la deduplicación por `event_id` en los consumidores aseguran que ningún cobro ni comanda se dupliquen por reintentos de red.
