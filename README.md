# SmartRestaurant — Plataforma Distribuida Multinacional para la Gestión Inteligente de Reservas y Pedidos en Restaurantes

[![Node.js](https://img.shields.io/badge/Node.js-22.x-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19_SPA-blue.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue.svg)](https://www.postgresql.org/)
[![RabbitMQ](https://img.shields.io/badge/RabbitMQ-3.13_AMQP-orange.svg)](https://www.rabbitmq.com/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED.svg)](https://www.docker.com/)

---

## 1. Resumen Ejecutivo del Proyecto

**SmartRestaurant** es una plataforma SaaS distribuida multinacional diseñada para coordinar de forma digital e inteligente el ciclo completo de atención gastronómica: desde la reserva y asignación de mesas hasta el registro de pedidos mediante código QR en mesa física, la preparación en tiempo real en la pantalla de cocina (KDS) y la entrega final al comensal.

### Cumplimiento del Requisito Central
- **Sistema Distribuido Real:** Diseñado bajo principios de microservicios, API Gateway, mensajería asíncrona por eventos (RabbitMQ AMQP 0-9-1) y patrón **Transactional Outbox**.
- **Cinco Mercados Internacionales Nativos (Idiomas y Monedas Independientes):**
  1. 🇨🇴 **Colombia:** `es-CO`, Moneda `COP`, Zona `America/Bogota` (UTC-5).
  2. 🇲🇽 **México:** `es-MX`, Moneda `MXN`, Zona `America/Mexico_City` (UTC-6).
  3. 🇺🇸 **Estados Unidos:** `en-US`, Moneda `USD`, Zona `America/New_York` (UTC-5).
  4. 🇧🇷 **Brasil:** `pt-BR`, Moneda `BRL`, Zona `America/Sao_Paulo` (UTC-3).
  5. 🇯🇵 **Japón:** `ja-JP`, Moneda `JPY`, Zona `Asia/Tokyo` (UTC+9) con caracteres kanji/kana auténticos.

---

## 2. Arquitectura de Servicios y Estructura del Monorepositorio

```
smartrestaurant/
├── infrastructure/               # Despliegue con Docker Compose y PostgreSQL
│   ├── docker-compose.yml        # Orquestación de Postgres 16, RabbitMQ 3.13 y Gateway App
│   ├── Dockerfile.app            # Construcción multi-stage de producción
│   └── init-db.sql               # Esquema DDL, restricciones y semillas para 5 países
├── services/                     # Microservicios con lógica de dominio separada
│   ├── auth-service/             # Port 4001: Autenticación, JWT, roles y RBAC
│   ├── restaurant-service/       # Port 4002: Restaurantes, sucursales, mesas y catálogo
│   ├── reservation-service/      # Port 4003: Disponibilidad y bloqueo de intervalos ACID
│   ├── order-service/            # Port 4004: Pedidos QR, cálculo seguro en servidor e idempotencia
│   ├── kitchen-service/          # Port 4005: Máquina de estados finita KDS y tiempos
│   ├── notification-service/     # Port 4006: Despacho y suscriptor de eventos RabbitMQ
│   ├── analytics-service/        # Port 4007: Métricas, KPIs y motor de recomendaciones
│   └── common/                   # Envelopes de eventos, Transactional Outbox y contratos
├── src/                          # Aplicación Frontend React 19 + TypeScript
│   ├── components/               # Dashboard, Reservas, QR Móvil, KDS, Menú, Informes, Inspector
│   ├── domain/                   # Store distribuido, Event Bus reactivo y motor de reglas
│   ├── i18n/                     # Diccionarios completos de traducción (5 locales)
│   └── types/                    # Contratos de TypeScript para todo el sistema
├── docs/                         # Documentación técnica y académica
│   ├── ARCHITECTURE.md           # Diagramas Mermaid (Componentes y Despliegue)
│   ├── DISTRIBUTED_CONCEPTS.md   # Explicación de los 8 conceptos distribuidos demostrables
│   └── BUSINESS_TRANSACTION.md   # Flujo paso a paso de la transacción principal
├── tests/                        # Pruebas automatizadas reproducibles
│   └── distributed_tests.ts      # Suite de pruebas unitarias y de integración distribuida
├── server.ts                     # Entrada Node/Express API Gateway con Vite Middleware
└── package.json                  # Dependencias y scripts de ejecución
```

---

## 3. Instrucciones de Ejecución Local

### Opción A: Despliegue Completo con Docker Compose (Recomendado)
Requiere tener instalados Docker y Docker Compose en tu máquina.

```bash
# 1. Clonar el repositorio y entrar a la carpeta
cd smartrestaurant

# 2. Configurar variables de entorno iniciales
cp .env.example .env

# 3. Iniciar todos los contenedores (PostgreSQL, RabbitMQ y SmartRestaurant)
docker compose -f infrastructure/docker-compose.yml up -d --build

# 4. Verificar el estado de los contenedores
docker compose -f infrastructure/docker-compose.yml ps
```

- **Aplicación Web / API Gateway:** [http://localhost:3000](http://localhost:3000)
- **Panel de RabbitMQ (Management UI):** [http://localhost:15672](http://localhost:15672) (Usuario: `sr_rabbit`, Contraseña: `sr_rabbit_pass_2026`)
- **Base de Datos PostgreSQL:** `localhost:5432`, base: `smartrestaurant_db`, usuario: `sr_admin`

Para detener el entorno:
```bash
docker compose -f infrastructure/docker-compose.yml down
```

### Opción B: Ejecución en Entorno Node.js Local
Si deseas ejecutar la aplicación directamente en Node.js (por ejemplo, dentro del entorno de desarrollo de AI Studio):

```bash
# 1. Instalar dependencias
npm install

# 2. Ejecutar la suite de pruebas automatizadas
npm test

# 3. Iniciar el servidor API Gateway con frontend SPA
npm run dev
```

La aplicación abrirá en `http://localhost:3000`.

---

## 4. Credenciales de Demostración Local (Ambiente de Pruebas)

El selector de roles (RBAC) en la barra superior permite alternar instantáneamente entre los 5 roles del sistema con un solo clic:

| Rol | Usuario de Prueba | Email de Desarrollo | Alcance de Permisos |
|---|---|---|---|
| **Propietario (Owner)** | Carlos Mendoza | `owner@andres.co` | Control absoluto de restaurantes, sedes, menús, colaboradores y analítica. |
| **Administrador (Admin)** | Valeria Gómez | `admin@andres.co` | Supervisión de reservas, mesas autorizadas, catálogo y comandas. |
| **Mesero (Waiter)** | Mateo Restrepo | `waiter@andres.co` | Consulta de mesas asignadas, toma de pedidos y asistencia en salón. |
| **Cocina (Kitchen)** | Chef Andrés Parra | `kitchen@andres.co` | Tablero KDS, tiempos de preparación y avance de estados. |
| **Cliente (Customer)** | Sofía Caballero | `customer@gmail.com` | Menú por código QR, reservas digitales y seguimiento en vivo. |

---

## 5. Pruebas Automatizadas Ejecutadas y Resultados Reales

El comando `npm test` ejecuta `tests/distributed_tests.ts`. A continuación se reporta la ejecución verificada en la terminal:

```
====================================================
🚀 EJECUTANDO SUITE DE PRUEBAS AUTOMATIZADAS SMARTRESTAURANT
====================================================

--- 1. Pruebas de Concurrencia y Bloqueo de Franjas en Reservas ---
✅ [PASS]: Reserva 1 creada exitosamente en 19:00-21:00
✅ [PASS]: Evento ReservationCreated emitido en outbox
✅ [PASS]: Rechazo de reserva simultánea por colisión de intervalo (409 Conflict)
✅ [PASS]: El motor de concurrencia bloqueó exitosamente la doble reserva
✅ [PASS]: Permite reserva no superpuesta en la misma mesa y fecha (21:30)

--- 2. Pruebas de Integridad de Precios e Idempotencia en Pedidos ---
✅ [PASS]: Primer intento de pedido procesado normalmente (Status 201 Created)
✅ [PASS]: Subtotal calculado estrictamente en el servidor (111.000 COP)
✅ [PASS]: Impuesto calculado según moneda y tasa local (8% impoconsumo = 8.880 COP)
✅ [PASS]: Total calculado exactamente (119.880 COP)
✅ [PASS]: Reintento con misma Idempotency-Key detectado como duplicado
✅ [PASS]: Devolvió la orden original sin crear duplicados

--- 3. Pruebas de Máquina de Estados de Cocina ---
✅ [PASS]: Transición válida: RECEIVED -> PREPARING
✅ [PASS]: Evento OrderAcceptedByKitchen emitido
✅ [PASS]: Rechazo de salto inválido en máquina de estados (PREPARING -> DELIVERED)
✅ [PASS]: La máquina de estados protegió la secuencia de cocina
✅ [PASS]: Transición válida: PREPARING -> READY
✅ [PASS]: Transición válida: READY -> DELIVERED

--- 4. Pruebas de Aislamiento Multi-Tenant ---
✅ [PASS]: Catálogo de Colombia aislado al tenant rest-col-01
✅ [PASS]: Catálogo de Japón aislado al tenant rest-jpn-05
✅ [PASS]: Platos de Colombia preservan moneda comercial COP
✅ [PASS]: Platos de Japón preservan moneda comercial JPY

--- 5. Pruebas de Internacionalización y Mercados ---
✅ [PASS]: Mercado es-CO registrado en la configuración multinacional
✅ [PASS]: Mercado es-MX registrado en la configuración multinacional
✅ [PASS]: Mercado en-US registrado en la configuración multinacional
✅ [PASS]: Mercado pt-BR registrado en la configuración multinacional
✅ [PASS]: Mercado ja-JP registrado en la configuración multinacional
✅ [PASS]: Traducción auténtica en japonés para Reservas (予約管理)
✅ [PASS]: Traducción auténtica en japonés para Cocina (厨房)
✅ [PASS]: Confirmación de pedido en japonés

====================================================
🎉 TODAS LAS PRUEBAS AUTOMATIZADAS PASARON CON ÉXITO
====================================================
```

---

## 6. Limitaciones Conocidas y Pasos Siguientes

1. **Entorno de Ejecución en AI Studio Web Preview:**
   - La vista previa interactiva en la nube ejecuta el servidor Node.js/Express de forma fluida junto con el frontend Vite en el puerto 3000.
   - Para ejecutar los contenedores Docker nativos con un broker RabbitMQ y una instancia física PostgreSQL 16 independiente, se utiliza el archivo provisto `infrastructure/docker-compose.yml` en cualquier servidor o máquina local.
2. **Pagos:**
   - De acuerdo a las especificaciones del MVP, no se procesan tarjetas de crédito reales para evitar solicitudes de datos financieros sensibles. Los pedidos se confirman para pago en mesa física.
3. **Próximos Pasos Recomendados:**
   - Habilitar autenticación OAuth 2.0 con proveedores externos (Google Sign-In).
   - Integrar pasarelas de pago locales por país (Wompi para Colombia, Conekta para México, Stripe para EE.UU., Pix para Brasil).
