# Conceptos Demostrables de Sistemas Distribuidos — SmartRestaurant

Este documento fundamenta los conceptos técnicos y patrones distribuidos implementados en **SmartRestaurant**, vinculando cada concepto con archivos, endpoints, eventos y pruebas automatizadas reales del proyecto.

---

## 1. Microservicios y Separación por Dominios Funcionales (DDD)
- **Definición:** División de un sistema complejo en unidades de despliegue y desarrollo autónomas que modelan un subdominio de negocio específico (Bounded Context).
- **Implementación en el proyecto:**
  - Código modular en la carpeta `/services/`:
    - `auth-service`: Seguridad e identidad.
    - `restaurant-service`: Catálogo de restaurantes, mesas y sedes.
    - `reservation-service`: Gestión de cupos y disponibilidad.
    - `order-service`: Captura de comandas por QR y cálculo de totales.
    - `kitchen-service`: Visualización y avance de comandas KDS.
    - `notification-service`: Despacho de alertas.
    - `analytics-service`: Métricas y motor de recomendaciones.
  - La comunicación no viola la encapsulación: ningún servicio escribe directamente en tablas de otro servicio.

---

## 2. Comunicación Síncrona vs. Asíncrona
- **Comunicación Síncrona (REST sobre HTTP):**
  - Utilizada para operaciones que requieren respuesta inmediata: consulta de catálogo de menú, consulta de disponibilidad de mesas y autenticación.
  - Endpoints implementados: `GET /api/restaurants/:id/menu`, `GET /api/reservations/availability`, `POST /api/auth/login`.
- **Comunicación Asíncrona (Upstash QStash Serverless Message Broker):**
  - Utilizada cuando una acción produce efectos secundarios en múltiples subsistemas sin bloquear al cliente.
  - Eventos emitidos: `ReservationCreated`, `OrderCreated`, `OrderAcceptedByKitchen`, `OrderReady`, `OrderDelivered`.
  - Archivos: `/services/common/qstash.ts`, `/services/common/outbox.ts`, `/services/common/types.ts`.

---

## 3. Control de Concurrencia y Bloqueo de Intervalos (ACID)
- **Problema Distribuido:** Dos clientes en teléfonos diferentes intentan reservar la misma mesa física en el mismo restaurante durante un horario solapado.
- **Solución Implementada:**
  - En `services/reservation-service/index.ts` y `src/domain/store.ts` (`checkTableAvailability`):
    - Se evalúa la condición de solape estricto:
      $$(Start_A < End_B) \land (End_A > Start_B)$$
    - Si existe intersección temporal con una reserva existente (distinta de CANCELLED), la transacción falla inmediatamente devolviendo un código **409 Conflict**.
    - La prueba automatizada `tests/distributed_tests.ts` demuestra el rechazo inmediato de la segunda solicitud concurrente.

---

## 4. Idempotencia en Creación de Pedidos
- **Problema Distribuido:** Debido a fluctuaciones en la red móvil, un cliente puede reenviar una solicitud `POST /api/orders` creyendo que falló, causando pedidos duplicados o cobros dobles.
- **Solución Implementada:**
  - Cada solicitud del cliente envía una cabecera única `Idempotency-Key` generada en el frontend.
  - En `order-service`:
    - Se consulta si la clave de idempotencia ya fue registrada.
    - Si existe, se retorna el pedido original con código **200 OK** y la marca `isDuplicateReplay: true`, sin insertar un nuevo registro en la base de datos ni emitir nuevos eventos a cocina.
  - Archivo: `/services/order-service/index.ts`.
  - Verificado en: `tests/distributed_tests.ts` (Caso de prueba 2).

---

## 5. Patrón Transactional Outbox y Consistencia Eventual
- **Problema Distribuido (Dual-Write Problem):** Si un servicio actualiza la base de datos y luego intenta publicar en el broker de mensajes, pero la red falla en ese instante, la base de datos queda actualizada pero los demás servicios nunca se enteran.
- **Solución Implementada:**
- En la misma transacción local de Supabase PostgreSQL, se inserta la entidad (`orders`) y se inserta el evento en la tabla `outbox_events` con estado `PENDING`.
- Un despachador asíncrono lee los eventos pendientes, los publica en Upstash QStash y actualiza el estado a `PUBLISHED`.
- Si el broker de QStash experimenta un fallo temporal, el evento permanece seguro en la tabla `outbox_events` y se reintenta con backoff exponencial.
- Archivo: `/services/common/outbox.ts` y tabla `outbox_events` en `/supabase/migrations/20261102000000_smartrestaurant_schema.sql`.

---

## 6. Aislamiento Multi-Tenant Estricto
- **Definición:** Múltiples restaurantes operan en la misma infraestructura compartida sin riesgo de fuga o contaminación cruzada de datos.
- **Implementación:**
- Cada restaurante tiene un identificador único `tenant_id` (ej. `rest-col-01`, `rest-jpn-05`).
- Todas las entidades (`restaurant_tables`, `menu_items`, `reservations`, `orders`) tienen clave foránea obligatoria a `tenant_id`.
- Cada consulta en el backend incluye `WHERE tenant_id = :tenant_id`, validado mediante el token del usuario y políticas Row-Level Security (RLS) en Supabase.
- Verificado en: `tests/serverless_distributed_tests.ts` (Caso de prueba 4).

---

## 7. Trazabilidad Distribuida con Correlation IDs
- **Definición:** Identificador único que viaja a través de todos los saltos de red (HTTP headers y QStash webhook headers) para correlacionar los registros de una misma operación de negocio.
- **Implementación:**
- Cabecera: `X-Correlation-Id` generada en el API Gateway o recibida del cliente.
- Viaja en el envelope de cada evento: `envelope.correlationId`.
- Permite a los desarrolladores rastrear en la pestaña "Auditor de Sistemas Distribuidos" todo el ciclo de vida de una comanda o reserva desde que se escaneó el QR hasta que la cocina entregó el plato.
